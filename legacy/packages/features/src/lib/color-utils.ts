export function oklchStringToHex(oklch: string) {
  const match = /^oklch\(\s*([^\s]+)\s+([^\s]+)\s+([^\s]+)\s*\)$/.exec(oklch);
  if (!match) {
    throw new Error("Invalid oklch string format");
  }
  const [, l, c, h] = match;
  return oklchToHex({ l: Number(l), c: Number(c), h: Number(h) });
}

export function oklchToHex({ l, c, h }: { l: number; c: number; h: number }) {
  const { r, g, b } = oklchToRGB({ l, c, h });
  return rgbToHex({ r, g, b });
}

export function rgbToHex({ r, g, b }: { r: number; g: number; b: number }) {
  return `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b.toString(16).padStart(2, "0")}`;
}

export function oklchToRGB({ l, c, h }: { l: number; c: number; h: number }) {
  const a = c * Math.cos((h * Math.PI) / 180);
  const b = c * Math.sin((h * Math.PI) / 180);

  const l_ = l + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = l - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = l - 0.0894841775 * a - 1.291485548 * b;

  const l3 = l_ * l_ * l_;
  const m3 = m_ * m_ * m_;
  const s3 = s_ * s_ * s_;

  let r = +4.0767416621 * l3 - 3.3077115913 * m3 + 0.2309699292 * s3;
  let g = -1.2684380046 * l3 + 2.6097574011 * m3 - 0.3413193965 * s3;
  let b_linear = -0.0041960863 * l3 - 0.7034186147 * m3 + 1.707614701 * s3;

  r = r > 0.0031308 ? 1.055 * Math.pow(r, 1 / 2.4) - 0.055 : 12.92 * r;
  g = g > 0.0031308 ? 1.055 * Math.pow(g, 1 / 2.4) - 0.055 : 12.92 * g;
  b_linear =
    b_linear > 0.0031308
      ? 1.055 * Math.pow(b_linear, 1 / 2.4) - 0.055
      : 12.92 * b_linear;

  r = Math.min(Math.max(0, r), 1);
  g = Math.min(Math.max(0, g), 1);
  b_linear = Math.min(Math.max(0, b_linear), 1);

  return {
    r: Math.round(r * 255),
    g: Math.round(g * 255),
    b: Math.round(b_linear * 255),
  };
}
