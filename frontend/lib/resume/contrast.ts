// WCAG contrast of the accent colour: accent text on the white page, or, in the Modern template, white text on a header
// band of the accent. Under 4.5 to 1 small text is hard to read, so the editor warns (it does not forbid).
export const MIN_CONTRAST = 4.5;

function channel(value: number) {
  const c = value / 255;
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

// Relative luminance of "#rrggbb".
export function luminance(hex: string): number {
  const n = parseInt(hex.slice(1), 16);
  return 0.2126 * channel((n >> 16) & 255) + 0.7152 * channel((n >> 8) & 255) + 0.0722 * channel(n & 255);
}

// The ratio between two colours, from 1 (the same) to 21 (black on white).
export function contrastRatio(a: string, b: string): number {
  const [high, low] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (high + 0.05) / (low + 0.05);
}

// The contrast the accent is read at in a template, and whether it is enough.
export function accentContrast(accent: string, template: string) {
  const ratio = contrastRatio(accent, "#ffffff");
  return { ratio, ok: ratio >= MIN_CONTRAST, onBand: template === "modern" };
}
