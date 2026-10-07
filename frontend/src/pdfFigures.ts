// Cuts the pictures that "Import from PDF" found out of the PDF itself. Gemini
// marks each picture's page and box; here each page is drawn with pdf.js and the
// box is cut out. A box that lines up with a photo embedded in the PDF snaps to
// that photo's exact edges; anything else (a drawn chart, a scanned page) gets a
// small margin, since Gemini's boxes can sit a little tight around charts. This
// file and pdf.js are only loaded when an import has pictures.

/** A picture Gemini found: its page (1 = first) and box (ymin, xmin, ymax, xmax on a 0–1000 scale) */
export interface PdfFigure {
  page: number;
  box: [number, number, number, number];
}

type Box = [number, number, number, number];

const RENDER_SCALE = 2;          // pages are drawn at twice their PDF size, so cut-outs stay sharp
const MARGIN = 30;               // added around boxes that don't match an embedded photo (0–1000 scale)
const SNAP_MIN_OVERLAP = 0.6;    // how closely a box must match an embedded photo to snap to it

const clamp = (v: number) => Math.min(1000, Math.max(0, v));

// Overlap of two boxes: shared area / combined area
const overlap = (a: Box, b: Box) => {
  const h = Math.max(0, Math.min(a[2], b[2]) - Math.max(a[0], b[0]));
  const w = Math.max(0, Math.min(a[3], b[3]) - Math.max(a[1], b[1]));
  const shared = h * w;
  const combined = (a[2] - a[0]) * (a[3] - a[1]) + (b[2] - b[0]) * (b[3] - b[1]) - shared;
  return combined > 0 ? shared / combined : 0;
};

// pdf.js reports each embedded image as three corners (x, y pairs scaled 0–1);
// the fourth corner follows from them
const photoBoxes = (coords: ArrayLike<number> | null): Box[] => {
  const boxes: Box[] = [];
  for (let i = 0; coords && i + 5 < coords.length; i += 6) {
    const xs = [coords[i], coords[i + 2], coords[i + 4], coords[i + 2] + coords[i + 4] - coords[i]];
    const ys = [coords[i + 1], coords[i + 3], coords[i + 5], coords[i + 3] + coords[i + 5] - coords[i + 1]];
    boxes.push([Math.min(...ys), Math.min(...xs), Math.max(...ys), Math.max(...xs)].map(v => clamp(v * 1000)) as Box);
  }
  return boxes;
};

const cutOut = (page: HTMLCanvasElement, [y1, x1, y2, x2]: Box, type: 'image/jpeg' | 'image/png'): string | null => {
  const sx = Math.floor(x1 / 1000 * page.width), sy = Math.floor(y1 / 1000 * page.height);
  const w = Math.ceil(x2 / 1000 * page.width) - sx, h = Math.ceil(y2 / 1000 * page.height) - sy;
  if (w < 16 || h < 16) return null;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  canvas.getContext('2d')!.drawImage(page, sx, sy, w, h, 0, 0, w, h);
  return canvas.toDataURL(type, 0.9);
};

/** One data URL per figure (JPEG for snapped photos, PNG otherwise), or null where it couldn't be cut out */
export async function cutOutPdfFigures(pdfData: ArrayBuffer, figures: PdfFigure[]): Promise<(string | null)[]> {
  const pdfjs = await import('pdfjs-dist');
  const { default: workerUrl } = await import('pdfjs-dist/build/pdf.worker.min.mjs?url');
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

  const loading = pdfjs.getDocument({ data: new Uint8Array(pdfData) });
  const doc = await loading.promise;
  const pages = new Map<number, { canvas: HTMLCanvasElement; photos: Box[] }>();
  const results: (string | null)[] = [];
  try {
    for (const { page: pageNumber, box } of figures) {
      try {
        if (pageNumber < 1 || pageNumber > doc.numPages || !(box[0] < box[2] && box[1] < box[3])) {
          results.push(null);
          continue;
        }
        let drawn = pages.get(pageNumber);
        if (!drawn) {
          const page = await doc.getPage(pageNumber);
          const viewport = page.getViewport({ scale: RENDER_SCALE });
          const canvas = document.createElement('canvas');
          canvas.width = Math.ceil(viewport.width);
          canvas.height = Math.ceil(viewport.height);
          const ctx = canvas.getContext('2d')!;
          ctx.fillStyle = '#fff'; // PDFs can be transparent; JPEG has no transparency
          ctx.fillRect(0, 0, canvas.width, canvas.height);
          const task = page.render({ canvasContext: ctx, canvas, viewport, recordImages: true });
          await task.promise;
          drawn = { canvas, photos: photoBoxes(task.imageCoordinates ?? (page as unknown as { imageCoordinates?: ArrayLike<number> }).imageCoordinates ?? null) };
          pages.set(pageNumber, drawn);
        }
        const best = drawn.photos.map(p => ({ p, score: overlap(p, box) })).sort((a, b) => b.score - a.score)[0];
        results.push(best && best.score >= SNAP_MIN_OVERLAP
          ? cutOut(drawn.canvas, best.p, 'image/jpeg')
          : cutOut(drawn.canvas, [clamp(box[0] - MARGIN), clamp(box[1] - MARGIN), clamp(box[2] + MARGIN), clamp(box[3] + MARGIN)], 'image/png'));
      } catch (error) {
        console.error('Could not cut out a PDF picture:', error);
        results.push(null);
      }
    }
  } finally {
    await loading.destroy();
  }
  return results;
}
