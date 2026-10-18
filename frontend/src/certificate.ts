// Draws a seminar certificate: a white page with curved swooshes in shades of the primary
// and accent colors along the top and bottom edges, the PHILSAR seal and name at the top,
// "awards this" title, the recipient's name, the seminar, the issue date, the signature
// block, and the QR code that opens the certificate's verification page. A custom
// background image replaces the swooshes. Kept out of App.tsx so the layout can be drawn
// and checked on its own.
import type { jsPDF } from 'jspdf';

export interface CertificateStyle {
  title: string;          // e.g. "Certificate of Attendance"
  statement: string;      // the line under the name, before the seminar's title
  closing: string;        // organization line, in the header and after the issue date
  primaryColor: string;   // the dark swooshes, the organization name and the recipient's name
  accentColor: string;    // the gold crescents; mixed with the primary for the pale waves
  signatoryName: string;
  signatoryTitle: string;
}

export interface CertificateContent {
  recipientName: string;
  seminarTitle: string;
  host: string;
  issuedAt: Date;
  code: string;
  qrDataUrl: string;
  style: CertificateStyle;
  backgroundImage?: HTMLImageElement | string | null;
  logoImage?: string | null;   // the PHILSAR seal in the header (see logoForPdf)
  signatureImage?: HTMLImageElement | string | null;
}

// The page color; the seal and the QR code's light squares are set on it
export const CERT_PAPER = '#FFFFFF';

// The layout is drawn on the 1052 × 747 grid of the reference design and scaled to the page
const GRID_W = 1052;
const GRID_H = 747;

type Pt = [number, number];
type Rgb = [number, number, number];
// A straight segment to a point, or a cubic curve through two control points to a point
type Segment = [Pt] | [Pt, Pt, Pt];

const INK: Rgb = [17, 17, 17];
const MUTED_INK: Rgb = [95, 95, 95];
const WHITE: Rgb = [255, 255, 255];

const hexToRgb = (hex: string, fallback: Rgb): Rgb => {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return fallback;
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};

const mix = (a: Rgb, b: Rgb, t: number): Rgb => a.map((v, i) => Math.round(v + (b[i] - v) * t)) as Rgb;

// "15th", "22nd", "1st"
const ordinal = (n: number) => {
  const tens = n % 100;
  const suffix = tens >= 11 && tens <= 13 ? 'th' : ({ 1: 'st', 2: 'nd', 3: 'rd' } as Record<number, string>)[n % 10] || 'th';
  return `${n}${suffix}`;
};

export function drawCertificate(doc: jsPDF, c: CertificateContent): void {
  const w = doc.internal.pageSize.getWidth();
  const h = doc.internal.pageSize.getHeight();
  const sx = w / GRID_W;
  const sy = h / GRID_H;
  const cx = w / 2;
  const primary = hexToRgb(c.style.primaryColor, [12, 85, 25]);
  const accent = hexToRgb(c.style.accentColor, [246, 204, 15]);
  // A pale yellow-green for the wide waves, and a leaf green between the primary and accent
  const pale = mix(mix(primary, accent, 0.6), WHITE, 0.72);
  const leaf = mix(primary, accent, 0.3);
  const at = ([x, y]: Pt): Pt => [x * sx, y * sy];

  // A filled shape from straight and curved segments; parts past the page edge are cut off
  const shape = (start: Pt, segments: Segment[], color: Rgb) => {
    let current = at(start);
    const relative = segments.map(segment => {
      const points = segment.map(at);
      const out = points.flatMap(([x, y]) => [x - current[0], y - current[1]]);
      current = points[points.length - 1];
      return out;
    });
    doc.setFillColor(...color);
    doc.lines(relative, at(start)[0], at(start)[1], [1, 1], 'F', true);
  };

  if (c.backgroundImage) {
    doc.addImage(c.backgroundImage, 'JPEG', 0, 0, w, h);
  } else {
    // Along the top: a wide pale wave, a gold crescent on the right edge, then two greens over it
    shape([0, 0], [[[1052, 0]], [[1052, 160]], [[760, 40], [300, -25], [0, 48]]], pale);
    shape([1052, 70], [[[1040, 120], [960, 215], [1052, 250]]], accent);
    shape([540, 0], [[[760, 30], [960, 70], [1052, 132]], [[1052, 0]]], leaf);
    shape([720, 0], [[[880, 15], [1000, 45], [1052, 90]], [[1052, 0]]], primary);
    // Along the bottom: the same, rising toward the right
    shape([0, 747], [[[0, 690]], [[260, 650], [640, 735], [1052, 680]], [[1052, 747]]], pale);
    shape([1052, 575], [[[1040, 610], [965, 690], [1052, 747]]], accent);
    shape([520, 747], [[[760, 738], [950, 705], [1052, 640]], [[1052, 747]]], leaf);
    shape([720, 747], [[[880, 742], [1000, 718], [1052, 685]], [[1052, 747]]], primary);
  }

  // Text centered on x (the page's middle by default)
  const centered = (text: string, y: number, x = cx) => {
    doc.text(text, x - doc.getTextWidth(text) / 2, y);
  };
  // The largest size up to `max` at which the text fits `maxWidth`
  const fit = (text: string, max: number, maxWidth: number) => {
    doc.setFontSize(max);
    const width = doc.getTextWidth(text);
    doc.setFontSize(width > maxWidth ? max * maxWidth / width : max);
  };

  // Certificate ID in the top-left corner
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(...MUTED_INK);
  doc.text(`Certificate No. ${c.code}`, 20, 40);

  // Header: the seal beside the organization's name, centered as one group
  const nameLines = ['PHILIPPINE SOCIETY OF', 'ANIMAL REPRODUCTION'];
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(15);
  let textWidth = Math.max(...nameLines.map(line => doc.getTextWidth(line)));
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  if (c.style.closing) textWidth = Math.max(textWidth, doc.getTextWidth(c.style.closing));
  const sealSize = 76;
  let sealWidth = 0;
  let sealHeight = 0;
  if (c.logoImage) {
    const { width: lw, height: lh } = doc.getImageProperties(c.logoImage);
    const scale = sealSize / Math.max(lw, lh);
    sealWidth = lw * scale;
    sealHeight = lh * scale;
  }
  const gap = sealWidth ? 12 : 0;
  const left = cx - (sealWidth + gap + textWidth) / 2;
  if (c.logoImage) {
    doc.addImage(c.logoImage, c.logoImage.startsWith('data:image/png') ? 'PNG' : 'JPEG', left, 74 - sealHeight / 2, sealWidth, sealHeight);
  }
  const textX = left + sealWidth + gap;
  doc.setTextColor(...primary);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(15);
  doc.text(nameLines[0], textX, 68);
  doc.text(nameLines[1], textX, 85);
  if (c.style.closing) {
    doc.setTextColor(...MUTED_INK);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.text(c.style.closing, textX, 98);
  }

  doc.setTextColor(...INK);
  doc.setFont('times', 'normal');
  doc.setFontSize(13);
  centered('awards this', 157);

  doc.setFont('times', 'bold');
  fit(c.style.title || 'Certificate of Attendance', 50, 600);
  centered(c.style.title || 'Certificate of Attendance', 214);

  doc.setFont('times', 'normal');
  doc.setFontSize(13);
  centered('to', 246);

  doc.setTextColor(...primary);
  fit(c.recipientName, 40, 560);
  centered(c.recipientName, 302);
  doc.setDrawColor(70, 70, 70);
  doc.setLineWidth(0.8);
  doc.line(100, 320, w - 100, 320);

  // What it's for: the statement, the seminar in bold, and its host
  doc.setTextColor(...INK);
  doc.setFont('times', 'normal');
  doc.setFontSize(13);
  centered(c.style.statement || 'for successfully attending the virtual seminar', 340);
  doc.setFont('times', 'bold');
  const seminar = `“${c.seminarTitle}”`;
  fit(seminar, 13, 600);
  let y = 358;
  if (doc.getFontSize() < 10.5) {
    doc.setFontSize(10.5);
    for (const line of (doc.splitTextToSize(seminar, 600) as string[]).slice(0, 2)) {
      centered(line, y);
      y += 14;
    }
    y -= 14;
  } else {
    centered(seminar, y);
  }
  doc.setFont('times', 'normal');
  doc.setFontSize(13);
  if (c.host) centered(`hosted by ${c.host}.`, y + 18);

  // When, and through what, it was given
  const day = c.issuedAt.getDate();
  const monthYear = c.issuedAt.toLocaleDateString('en-US', { month: 'long', year: 'numeric' }).replace(' ', ', ');
  const given = `Given this ${ordinal(day)} day of ${monthYear}${c.style.closing ? ` through the ${c.style.closing}` : ''}.`;
  (doc.splitTextToSize(given, 560) as string[]).slice(0, 2).forEach((line, i) => centered(line, 412 + i * 17));

  // Signature block: the uploaded signature (if any) stands just above the signatory's name
  if (c.signatureImage) {
    const { width: iw, height: ih } = doc.getImageProperties(c.signatureImage);
    const scale = Math.min(170 / iw, 58 / ih);
    doc.addImage(c.signatureImage, 'PNG', cx - (iw * scale) / 2, 499 - ih * scale, iw * scale, ih * scale);
  }
  doc.setTextColor(...INK);
  doc.setFont('times', 'bold');
  if (c.style.signatoryName) {
    fit(c.style.signatoryName.toUpperCase(), 15, 360);
    centered(c.style.signatoryName.toUpperCase(), 512);
  }
  doc.setFont('times', 'normal');
  if (c.style.signatoryTitle) {
    doc.setFontSize(12);
    centered(c.style.signatoryTitle, 528);
  }

  // QR code at the lower right, on a white card over the swooshes. Scanning it opens
  // /verify/<code>, which shows the certificate's current status (so this copy reads
  // "Revoked" if it's revoked later).
  const qrSize = 64;
  const qrX = 728 - qrSize / 2;
  const qrY = 458;
  doc.setFillColor(...WHITE);
  doc.roundedRect(qrX - 10, qrY - 10, qrSize + 20, qrSize + 32, 6, 6, 'F');
  doc.addImage(c.qrDataUrl, 'PNG', qrX, qrY, qrSize, qrSize);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(...MUTED_INK);
  centered('Scan to verify', qrY + qrSize + 12, 728);
}

// A signature scanned on white paper: near-white pixels become transparent (with a soft
// edge so the ink stays smooth), so only the ink shows on the certificate
export function clearWhiteBackground(rgba: Uint8Array | Uint8ClampedArray): void {
  for (let i = 0; i < rgba.length; i += 4) {
    const lightness = 0.299 * rgba[i] + 0.587 * rgba[i + 1] + 0.114 * rgba[i + 2];
    const keep = Math.min(1, Math.max(0, (245 - lightness) / 85));
    rgba[i + 3] = Math.round(rgba[i + 3] * keep);
  }
}

// The box around the ink (pixels that are still visible), or null if there's none
export function inkBounds(rgba: Uint8Array | Uint8ClampedArray, width: number, height: number) {
  let x0 = width, y0 = height, x1 = -1, y1 = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (rgba[(y * width + x) * 4 + 3] > 40) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
    }
  }
  return x1 < 0 ? null : { x: x0, y: y0, width: x1 - x0 + 1, height: y1 - y0 + 1 };
}

// The uploaded signature as a PNG ready for the certificate: white background removed and
// trimmed to the ink, so a plain scan works as well as a transparent PNG. Needs a browser.
export function prepareSignature(img: HTMLImageElement): string {
  const scale = Math.min(1, 900 / img.naturalWidth);
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(img.naturalWidth * scale);
  canvas.height = Math.round(img.naturalHeight * scale);
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height);
  clearWhiteBackground(pixels.data);
  ctx.putImageData(pixels, 0, 0);
  const ink = inkBounds(pixels.data, canvas.width, canvas.height);
  if (!ink) return canvas.toDataURL('image/png');
  const trimmed = document.createElement('canvas');
  trimmed.width = ink.width;
  trimmed.height = ink.height;
  trimmed.getContext('2d')!.drawImage(canvas, ink.x, ink.y, ink.width, ink.height, 0, 0, ink.width, ink.height);
  return trimmed.toDataURL('image/png');
}

// An image for the certificate, or null if it can't be loaded. Needs a browser.
export function loadImage(url: string): Promise<HTMLImageElement | null> {
  return new Promise(resolve => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = url;
  });
}

// The seal shrunk to 400 pixels and set on the page color, as a JPEG: the full-size PNG
// would add megabytes to every PDF. Needs a browser.
export function logoForPdf(img: HTMLImageElement): string {
  const scale = Math.min(1, 400 / Math.max(img.naturalWidth, img.naturalHeight));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(img.naturalWidth * scale);
  canvas.height = Math.round(img.naturalHeight * scale);
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = CERT_PAPER;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL('image/jpeg', 0.92);
}
