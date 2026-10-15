// Draws a seminar certificate: a cream card framed by a band in the primary color, with
// curved swooshes (primary, edged in the accent color) in the top-left and bottom-right
// corners and thin frame lines in the other two. Under the title and the recipient's name
// in script comes a sentence naming the seminar; the bottom row holds the signature, the
// PHILSAR seal, and the QR code that opens the certificate's verification page. With a
// custom background image, the image replaces the frame, swooshes and seal. Kept out of
// App.tsx so the layout can be drawn and checked on its own.
import type { jsPDF } from 'jspdf';

export interface CertificateStyle {
  title: string;          // "Certificate of Attendance" prints as CERTIFICATE / OF ATTENDANCE
  statement: string;      // starts the sentence under the name, before the seminar's title
  closing: string;        // organization line, after the issue date
  primaryColor: string;   // the frame, swooshes and headings
  accentColor: string;    // the band along each swoosh
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
  logoImage?: string | null;   // the seal between the signature and the QR code (see logoForPdf)
  signatureImage?: HTMLImageElement | string | null;
  scriptFont?: string | null;  // base64 TrueType font for the name; Times Italic without it
}

// The card's cream; the seal and the QR code's light squares are set on it
export const CERT_PAPER = '#F7F3EA';

// The layout is drawn on the 793 × 558 grid of the reference design and scaled to the page
const GRID_W = 793;
const GRID_H = 558;

type Pt = [number, number];
type Rgb = [number, number, number];
// A straight segment to a point, or a cubic curve through two control points to a point
type Segment = [Pt] | [Pt, Pt, Pt];

const BODY_INK: Rgb = [51, 51, 51];
const MUTED_INK: Rgb = [100, 100, 100];

const hexToRgb = (hex: string, fallback: Rgb): Rgb => {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return fallback;
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};

const mix = (a: Rgb, b: Rgb, t: number): Rgb => a.map((v, i) => Math.round(v + (b[i] - v) * t)) as Rgb;

export function drawCertificate(doc: jsPDF, c: CertificateContent): void {
  const w = doc.internal.pageSize.getWidth();
  const h = doc.internal.pageSize.getHeight();
  const sx = w / GRID_W;
  const sy = h / GRID_H;
  const cx = w / 2;
  const primary = hexToRgb(c.style.primaryColor, [12, 85, 25]);
  const accent = hexToRgb(c.style.accentColor, [246, 204, 15]);
  const paper = hexToRgb(CERT_PAPER, [247, 243, 234]);
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

  // A thin frame line, solid at the corner (`from`) and fading into the card toward `to`
  const fadingLine = (from: Pt, to: Pt) => {
    const [x1, y1] = at(from);
    const [x2, y2] = at(to);
    const length = Math.hypot(x2 - x1, y2 - y1);
    const back = 0.8 / length;  // starts half a line width early, so the two lines meet squarely
    const steps = 30;
    doc.setLineWidth(1.6);
    for (let i = 0; i < steps; i++) {
      const t0 = i === 0 ? -back : i / steps;
      const t1 = (i + 1) / steps;
      doc.setDrawColor(...mix(primary, paper, Math.max(0, (i / steps - 0.45) / 0.55)));
      doc.line(x1 + (x2 - x1) * t0, y1 + (y2 - y1) * t0, x1 + (x2 - x1) * t1, y1 + (y2 - y1) * t1);
    }
  };

  if (c.backgroundImage) {
    doc.addImage(c.backgroundImage, 'JPEG', 0, 0, w, h);
  } else {
    doc.setFillColor(...primary);
    doc.rect(0, 0, w, h, 'F');
    doc.setFillColor(...paper);
    doc.rect(11 * sx, 9 * sy, 771 * sx, 539 * sy, 'F');
    // Top-left swoosh: the accent color, then the primary corner over it, leaving a
    // crescent of accent along the edge
    shape([0, 0], [[[310, 0]], [[160, 14], [55, 70], [0, 123]]], accent);
    shape([0, 0], [[[290, 0]], [[140, 2], [40, 58], [0, 117]]], primary);
    // Bottom-right swoosh
    shape([793, 558], [[[440, 558]], [[600, 545], [730, 490], [793, 438]]], accent);
    shape([793, 558], [[[470, 558]], [[610, 556], [724, 515], [793, 452]]], primary);
    // Thin frame lines in the other two corners
    fadingLine([767, 24], [558, 24]);
    fadingLine([767, 24], [767, 248]);
    fadingLine([25, 533], [25, 312]);
    fadingLine([25, 533], [250, 533]);
  }

  // Text centered on x (the page's middle by default); letter spacing counts toward the width
  const centered = (text: string, y: number, charSpace = 0, x = cx) => {
    const width = doc.getTextWidth(text) + charSpace * Math.max(text.length - 1, 0);
    doc.text(text, x - width / 2, y, { charSpace });
  };
  // The largest size up to `max` at which the text fits `maxWidth`
  const fit = (text: string, max: number, maxWidth: number, charSpace = 0) => {
    doc.setFontSize(max);
    const width = doc.getTextWidth(text) + charSpace * Math.max(text.length - 1, 0);
    const size = width > maxWidth ? max * maxWidth / width : max;
    doc.setFontSize(size);
    return size;
  };

  // Title: "Certificate of Attendance" → CERTIFICATE above OF ATTENDANCE
  const title = (c.style.title || 'Certificate of Attendance').trim();
  const split = /^(.+?)\s+(of\s+.+)$/i.exec(title);
  const mainTitle = (split ? split[1] : title).toUpperCase();
  const subTitle = split ? split[2].toUpperCase() : '';
  doc.setTextColor(...primary);
  doc.setFont('times', 'normal');
  fit(mainTitle, 60, 520, 7);
  centered(mainTitle, subTitle ? 130 : 145, 7);
  if (subTitle) {
    fit(subTitle, 26, 420, 6);
    centered(subTitle, 170, 6);
  }

  doc.setTextColor(...BODY_INK);
  doc.setFontSize(18);
  centered('This certificate is proudly presented to', 227);

  doc.setTextColor(...primary);
  if (c.scriptFont) {
    doc.addFileToVFS('GreatVibes-Regular.ttf', c.scriptFont);
    doc.addFont('GreatVibes-Regular.ttf', 'GreatVibes', 'normal');
    doc.setFont('GreatVibes', 'normal');
    fit(c.recipientName, 62, 470);
  } else {
    doc.setFont('times', 'italic');
    fit(c.recipientName, 44, 470);
  }
  centered(c.recipientName, 306);
  doc.setDrawColor(95, 95, 95);
  doc.setLineWidth(0.9);
  doc.line(148, 320, w - 148, 320);

  // The sentence naming the seminar: the statement, then the seminar and its host on the
  // next line (shrinking, then wrapping to a third line, for a very long title)
  const statement = (c.style.statement || 'for successfully attending the virtual seminar').trim();
  const seminar = `“${c.seminarTitle}”${c.host ? ` hosted by ${c.host}` : ''}.`;
  doc.setTextColor(...BODY_INK);
  doc.setFont('times', 'normal');
  let size = 17;
  let seminarLines: string[];
  for (;;) {
    doc.setFontSize(size);
    seminarLines = doc.splitTextToSize(seminar, 470) as string[];
    if (seminarLines.length === 1 || size <= 12) break;
    size -= 1;
  }
  const lines = [`${statement.charAt(0).toUpperCase()}${statement.slice(1)}`, ...seminarLines.slice(0, 2)];
  lines.forEach((line, i) => centered(line, 364 + i * size * 1.4));

  // Bottom row: signature on the left, the seal in the middle, the QR code on the right
  const lineY = 468;
  const leftX = 245;
  const rightX = 597;
  doc.setDrawColor(150, 150, 150);
  doc.setLineWidth(1);
  doc.line(leftX - 96, lineY, leftX + 96, lineY);
  doc.line(rightX - 96, lineY, rightX + 96, lineY);

  // The uploaded signature (if any) dips slightly into the line, as a pen would
  if (c.signatureImage) {
    const { width: iw, height: ih } = doc.getImageProperties(c.signatureImage);
    const scale = Math.min(170 / iw, 62 / ih);
    doc.addImage(c.signatureImage, 'PNG', leftX - (iw * scale) / 2, lineY + 4 - ih * scale, iw * scale, ih * scale);
  }
  doc.setTextColor(...primary);
  doc.setFont('times', 'bold');
  if (c.style.signatoryName) {
    fit(c.style.signatoryName, 15, 230);
    centered(c.style.signatoryName, 492, 0, leftX);
  }
  doc.setTextColor(...MUTED_INK);
  doc.setFont('times', 'normal');
  if (c.style.signatoryTitle) {
    doc.setFontSize(12);
    centered(c.style.signatoryTitle, 509, 0, leftX);
  }

  // The seal, centered between the two lines
  const logo = c.backgroundImage ? null : c.logoImage;
  if (logo) {
    const { width: lw, height: lh } = doc.getImageProperties(logo);
    const scale = 100 / Math.max(lw, lh);
    doc.addImage(logo, logo.startsWith('data:image/png') ? 'PNG' : 'JPEG', cx - (lw * scale) / 2, 478 - (lh * scale) / 2, lw * scale, lh * scale);
  }

  // QR code + certificate ID. Scanning it opens /verify/<code>, which shows the
  // certificate's current status (so this copy reads "Revoked" if it's revoked later).
  // On a custom background image it gets a cream backing so it stays readable.
  const qrSize = 56;
  const qrX = rightX - qrSize / 2;
  const qrY = lineY - 4 - qrSize;
  if (c.backgroundImage) {
    doc.setFillColor(...paper);
    doc.roundedRect(qrX - 5, qrY - 5, qrSize + 10, qrSize + 10, 3, 3, 'F');
  }
  doc.addImage(c.qrDataUrl, 'PNG', qrX, qrY, qrSize, qrSize);
  doc.setTextColor(...primary);
  doc.setFont('times', 'bold');
  doc.setFontSize(15);
  centered('Scan to verify', 492, 0, rightX);
  doc.setTextColor(...MUTED_INK);
  doc.setFont('times', 'normal');
  doc.setFontSize(12);
  centered(`Certificate ID: ${c.code}`, 509, 0, rightX);

  // When it was issued, and by whom
  doc.setFont('times', 'italic');
  doc.setFontSize(10.5);
  centered([`Issued on ${c.issuedOn}`, c.style.closing].filter(Boolean).join('  ·  '), 550);
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

// The seal shrunk to 400 pixels and set on the card's cream, as a JPEG: the full-size PNG
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
