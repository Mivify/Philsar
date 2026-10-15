// Draws a seminar certificate: diagonal bands in the primary color with accent-colored
// outlines in two corners, the title, the recipient's name in script, the seminar, a
// signature block, and the QR code that opens the certificate's verification page.
// With a custom background image the corner bands are left out and the image is used
// instead. Kept out of App.tsx so the layout can be drawn and checked on its own.
import type { jsPDF } from 'jspdf';

export interface CertificateStyle {
  title: string;          // "Certificate of Attendance" prints as CERTIFICATE / ATTENDANCE
  statement: string;      // the line under the name
  closing: string;        // organization line, after the issue date
  primaryColor: string;   // the corner bands
  accentColor: string;    // the outlines over them
  signatoryName: string;
  signatoryTitle: string;
}

export interface CertificateContent {
  recipientName: string;
  seminarTitle: string;
  host: string;
  issuedOn: string;
  code: string;
  qrDataUrl: string;
  style: CertificateStyle;
  backgroundImage?: HTMLImageElement | string | null;
  signatureImage?: HTMLImageElement | string | null;
  scriptFont?: string | null;  // base64 TrueType font for the name; Times Italic without it
}

// The layout is laid out on the 1068 × 741 grid of the reference design and scaled to the page
const GRID_W = 1068;
const GRID_H = 741;
// Direction of the diagonal bands (down and to the left), and the direction across them
const U: [number, number] = [-0.495, 0.869];
const V: [number, number] = [-0.869, -0.495];
const INK: [number, number, number] = [17, 17, 17];

type Pt = [number, number];
type Rgb = [number, number, number];

const hexToRgb = (hex: string, fallback: Rgb): Rgb => {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return fallback;
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};

const along = (p: Pt, dir: Pt, t: number): Pt => [p[0] + dir[0] * t, p[1] + dir[1] * t];

// A rectangle from a corner and two edges, each given as a direction and a length
const band = (corner: Pt, dirA: Pt, lenA: number, dirB: Pt, lenB: number): Pt[] => {
  const a = along(corner, dirA, lenA);
  return [corner, a, along(a, dirB, lenB), along(corner, dirB, lenB)];
};
const neg = (d: Pt): Pt => [-d[0], -d[1]];

export function drawCertificate(doc: jsPDF, c: CertificateContent): void {
  const w = doc.internal.pageSize.getWidth();
  const h = doc.internal.pageSize.getHeight();
  const sx = w / GRID_W;
  const sy = h / GRID_H;
  const cx = w / 2;
  const primary = hexToRgb(c.style.primaryColor, [90, 0, 22]);
  const accent = hexToRgb(c.style.accentColor, [255, 210, 95]);
  // The pale bands are the primary color at 10% on white
  const tint = primary.map(v => Math.round(255 - (255 - v) * 0.1)) as Rgb;

  // Shapes that run past the page edge are cut off by the page itself
  const polygon = (gridPts: Pt[], mode: 'F' | 'S') => {
    const pts = gridPts.map(([x, y]) => [x * sx, y * sy]);
    const deltas = pts.slice(1).map((p, i) => [p[0] - pts[i][0], p[1] - pts[i][1]]);
    doc.lines(deltas, pts[0][0], pts[0][1], [1, 1], mode, true);
  };

  if (c.backgroundImage) {
    doc.addImage(c.backgroundImage, 'JPEG', 0, 0, w, h);
  } else {
    doc.setFillColor(...tint);
    polygon(band([142, 441], V, 66, U, 500), 'F');            // bottom left
    polygon(band([157, 625], V, 66, U, 400), 'F');
    polygon(band([885, 205], neg(V), 72, neg(U), 400), 'F');  // top right
    polygon(band([905, 365], neg(V), 80, neg(U), 500), 'F');

    doc.setFillColor(...primary);
    polygon(band(along([310, 8], U, -300), U, 734, V, 600), 'F');              // top left
    polygon(band(along([1068, 290], U, -300), U, 900, neg(V), 600), 'F');      // bottom right

    doc.setDrawColor(...accent);
    doc.setLineWidth(5.5);
    doc.setLineJoin('miter');
    polygon(band([105, 250], neg(U), 400, V, 400), 'S');            // top left
    polygon(band([110, 318], V, 400, U, 400), 'S');
    polygon(band([890, 512], U, 400, neg(V), 400), 'S');            // bottom right
    polygon(band([975, 515], neg(U), 400, neg(V), 400), 'S');
  }

  // Centered text; letter spacing is added to the width so it stays centered
  const centered = (text: string, y: number, charSpace = 0) => {
    const width = doc.getTextWidth(text) + charSpace * Math.max(text.length - 1, 0);
    doc.text(text, cx - width / 2, y, { charSpace });
  };
  // The largest size up to `max` at which the text fits `maxWidth`
  const fit = (text: string, max: number, maxWidth: number, charSpace = 0) => {
    doc.setFontSize(max);
    const width = doc.getTextWidth(text) + charSpace * Math.max(text.length - 1, 0);
    const size = width > maxWidth ? max * maxWidth / width : max;
    doc.setFontSize(size);
    return size;
  };

  // Title: "Certificate of Attendance" → CERTIFICATE above ATTENDANCE
  const title = (c.style.title || 'Certificate of Attendance').trim();
  const split = /^(.+?)\s+of\s+(.+)$/i.exec(title);
  const mainTitle = (split ? split[1] : title).toUpperCase();
  const subTitle = split ? split[2].toUpperCase() : '';
  doc.setTextColor(...INK);
  doc.setFont('times', 'bold');
  fit(mainTitle, 48, 420, 1);
  centered(mainTitle, subTitle ? 98 : 112, 1);
  if (subTitle) {
    doc.setFont('times', 'italic');
    fit(subTitle, 24, 420, 1);
    centered(subTitle, 130, 1);
  }

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(14);
  centered('This certificate is presented to', 198, 0.8);

  if (c.scriptFont) {
    doc.addFileToVFS('GreatVibes-Regular.ttf', c.scriptFont);
    doc.addFont('GreatVibes-Regular.ttf', 'GreatVibes', 'normal');
    doc.setFont('GreatVibes', 'normal');
    fit(c.recipientName, 64, 420);
  } else {
    doc.setFont('times', 'italic');
    fit(c.recipientName, 44, 420);
  }
  centered(c.recipientName, 285);

  doc.setDrawColor(110, 110, 110);
  doc.setLineWidth(0.8);
  doc.line(211, 320, w - 211, 320);

  doc.setFont('helvetica', 'italic');
  doc.setFontSize(13);
  centered(c.style.statement || 'for successfully attending the virtual seminar', 345);

  // The seminar, then who hosted it and when the certificate was issued
  doc.setTextColor(...primary);
  doc.setFont('helvetica', 'bold');
  const seminar = `“${c.seminarTitle}”`;
  let y = 371;
  if (fit(seminar, 15, 520) < 11) {
    doc.setFontSize(11);
    for (const line of (doc.splitTextToSize(seminar, 520) as string[]).slice(0, 2)) {
      centered(line, y);
      y += 14;
    }
    y -= 14;
  } else {
    centered(seminar, y);
  }
  const details = [c.host && `Hosted by ${c.host}`, `Issued on ${c.issuedOn}`, c.style.closing].filter(Boolean).join('  ·  ');
  doc.setTextColor(90, 90, 90);
  doc.setFont('helvetica', 'normal');
  fit(details, 10, 520);
  centered(details, y + 19);

  // Signature block: the uploaded signature (if any) dips slightly into the line, as a pen would
  const lineY = 492;
  if (c.signatureImage) {
    const { width: iw, height: ih } = doc.getImageProperties(c.signatureImage);
    const scale = Math.min(180 / iw, 76 / ih);
    doc.addImage(c.signatureImage, 'PNG', cx - (iw * scale) / 2, lineY + 4 - ih * scale, iw * scale, ih * scale);
  }
  doc.setDrawColor(110, 110, 110);
  doc.setLineWidth(0.8);
  doc.line(310, lineY, w - 310, lineY);
  doc.setTextColor(...INK);
  doc.setFont('helvetica', 'normal');
  if (c.style.signatoryName) {
    fit(c.style.signatoryName.toUpperCase(), 13, 330, 0.5);
    centered(c.style.signatoryName.toUpperCase(), 515, 0.5);
  }
  if (c.style.signatoryTitle) {
    doc.setFontSize(11);
    centered(c.style.signatoryTitle.toUpperCase(), 557, 0.5);
  }

  // QR code + certificate ID in the empty space at the lower left. Scanning it opens
  // /verify/<code>, which shows the certificate's current status (so this copy reads
  // "Revoked" if it's revoked later). The white backing keeps it readable on a
  // custom background image.
  const qrSize = 62;
  const qrX = 150;
  const qrY = 470;
  doc.setFillColor(255, 255, 255);
  doc.roundedRect(qrX - 6, qrY - 6, qrSize + 12, qrSize + 30, 4, 4, 'F');
  doc.addImage(c.qrDataUrl, 'PNG', qrX, qrY, qrSize, qrSize);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  doc.setTextColor(90, 100, 120);
  doc.text('Scan to verify', qrX + qrSize / 2, qrY + qrSize + 9, { align: 'center' });
  doc.text(c.code, qrX + qrSize / 2, qrY + qrSize + 18, { align: 'center' });
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

// The name font, read once and kept as base64 for jsPDF; null if it can't be loaded
let scriptFontRequest: Promise<string | null> | null = null;
export function loadScriptFont(url: string): Promise<string | null> {
  scriptFontRequest ??= fetch(url)
    .then(res => (res.ok ? res.arrayBuffer() : Promise.reject(new Error(`HTTP ${res.status}`))))
    .then(buf => {
      const bytes = new Uint8Array(buf);
      // A TrueType file starts with 00 01 00 00 (an HTML error page doesn't)
      if (bytes[0] !== 0 || bytes[1] !== 1) throw new Error('not a TrueType font');
      let binary = '';
      for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
      return btoa(binary);
    })
    .catch(error => {
      console.warn('Certificate name font could not be loaded; using Times Italic:', error);
      scriptFontRequest = null;
      return null;
    });
  return scriptFontRequest;
}
