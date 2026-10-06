export type RGBA = [number, number, number, number];

export const PALETTE: RGBA[] = [
  [0, 0, 0, 0],
  [14, 10, 15, 255],
  [48, 38, 59, 255],
  [92, 82, 110, 255],
  [168, 168, 184, 255],
  [244, 240, 232, 255],
  [232, 72, 80, 255],
  [248, 136, 72, 255],
  [248, 208, 96, 255],
  [120, 184, 72, 255],
  [48, 112, 72, 255],
  [72, 168, 208, 255],
  [48, 80, 168, 255],
  [136, 88, 200, 255],
  [208, 96, 160, 255],
  [112, 64, 48, 255],
  [176, 112, 72, 255],
  [96, 48, 64, 255],
  [32, 24, 40, 255],
  [64, 96, 128, 255],
  [184, 216, 232, 255],
  [88, 140, 88, 255],
  [200, 176, 112, 255],
  [128, 32, 40, 255],
  [240, 160, 144, 255],
  [72, 56, 88, 255],
  [152, 120, 176, 255],
  [40, 64, 48, 255],
  [216, 216, 96, 255],
  [96, 96, 112, 255],
  [24, 20, 28, 255],
  [255, 255, 255, 255],
];

export function sameColor(a: RGBA, b: RGBA): boolean {
  return a[0] === b[0] && a[1] === b[1] && a[2] === b[2] && a[3] === b[3];
}

export class PixelBuffer {
  width: number;
  height: number;
  data: Uint8ClampedArray;

  constructor(width: number, height: number, data?: Uint8ClampedArray) {
    this.width = width;
    this.height = height;
    this.data = data ?? new Uint8ClampedArray(width * height * 4);
  }

  static create(width: number, height: number, fill?: RGBA): PixelBuffer {
    const buffer = new PixelBuffer(Math.max(1, width), Math.max(1, height));
    if (fill) buffer.clear(fill);
    return buffer;
  }

  clone(): PixelBuffer {
    return new PixelBuffer(this.width, this.height, this.data.slice());
  }

  snapshot(): Uint8ClampedArray {
    return this.data.slice();
  }

  restore(snapshot: Uint8ClampedArray): void {
    this.data.set(snapshot);
  }

  private index(x: number, y: number): number {
    return (y * this.width + x) * 4;
  }

  inBounds(x: number, y: number): boolean {
    return x >= 0 && y >= 0 && x < this.width && y < this.height;
  }

  get(x: number, y: number): RGBA | null {
    if (!this.inBounds(x, y)) return null;
    const i = this.index(x, y);
    return [this.data[i], this.data[i + 1], this.data[i + 2], this.data[i + 3]];
  }

  set(x: number, y: number, color: RGBA): void {
    if (!this.inBounds(x, y)) return;
    const i = this.index(x, y);
    this.data[i] = color[0];
    this.data[i + 1] = color[1];
    this.data[i + 2] = color[2];
    this.data[i + 3] = color[3];
  }

  clear(color: RGBA = [0, 0, 0, 0]): void {
    for (let y = 0; y < this.height; y += 1) {
      for (let x = 0; x < this.width; x += 1) this.set(x, y, color);
    }
  }

  line(x0: number, y0: number, x1: number, y1: number, color: RGBA): void {
    let x = x0;
    let y = y0;
    const dx = Math.abs(x1 - x0);
    const dy = Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1;
    const sy = y0 < y1 ? 1 : -1;
    let err = dx - dy;
    while (true) {
      this.set(x, y, color);
      if (x === x1 && y === y1) break;
      const e2 = 2 * err;
      if (e2 > -dy) {
        err -= dy;
        x += sx;
      }
      if (e2 < dx) {
        err += dx;
        y += sy;
      }
    }
  }

  rect(x: number, y: number, w: number, h: number, color: RGBA, filled: boolean): void {
    const x2 = x + w - 1;
    const y2 = y + h - 1;
    if (filled) {
      for (let yy = y; yy <= y2; yy += 1) {
        for (let xx = x; xx <= x2; xx += 1) this.set(xx, yy, color);
      }
      return;
    }
    this.line(x, y, x2, y, color);
    this.line(x, y2, x2, y2, color);
    this.line(x, y, x, y2, color);
    this.line(x2, y, x2, y2, color);
  }

  fill(x: number, y: number, color: RGBA): void {
    const target = this.get(x, y);
    if (!target || sameColor(target, color)) return;
    const stackX = [x];
    const stackY = [y];
    const seen = new Uint8Array(this.width * this.height);
    seen[y * this.width + x] = 1;
    while (stackX.length) {
      const cx = stackX.pop() as number;
      const cy = stackY.pop() as number;
      this.set(cx, cy, color);
      const neighbors: Array<[number, number]> = [
        [cx + 1, cy],
        [cx - 1, cy],
        [cx, cy + 1],
        [cx, cy - 1],
      ];
      for (const [nx, ny] of neighbors) {
        if (!this.inBounds(nx, ny)) continue;
        const seenIndex = ny * this.width + nx;
        if (seen[seenIndex]) continue;
        const pixel = this.get(nx, ny);
        if (!pixel || !sameColor(pixel, target)) continue;
        seen[seenIndex] = 1;
        stackX.push(nx);
        stackY.push(ny);
      }
    }
  }

  extract(x: number, y: number, w: number, h: number): PixelBuffer {
    const out = PixelBuffer.create(w, h);
    for (let yy = 0; yy < h; yy += 1) {
      for (let xx = 0; xx < w; xx += 1) {
        const pixel = this.get(x + xx, y + yy);
        if (pixel) out.set(xx, yy, pixel);
      }
    }
    return out;
  }

  stamp(source: PixelBuffer, dx: number, dy: number): void {
    for (let y = 0; y < source.height; y += 1) {
      for (let x = 0; x < source.width; x += 1) {
        const pixel = source.get(x, y);
        if (pixel) this.set(dx + x, dy + y, pixel);
      }
    }
  }

  clearRect(x: number, y: number, w: number, h: number): void {
    this.rect(x, y, w, h, [0, 0, 0, 0], true);
  }

  mirrorHorizontal(rect?: { x: number; y: number; w: number; h: number }): void {
    const area = rect ?? { x: 0, y: 0, w: this.width, h: this.height };
    const copy = this.extract(area.x, area.y, area.w, area.h);
    for (let y = 0; y < copy.height; y += 1) {
      for (let x = 0; x < copy.width; x += 1) {
        const pixel = copy.get(copy.width - 1 - x, y);
        if (pixel) this.set(area.x + x, area.y + y, pixel);
      }
    }
  }

  crop(x: number, y: number, w: number, h: number): PixelBuffer {
    return this.extract(x, y, Math.max(1, w), Math.max(1, h));
  }

  replaceColor(from: RGBA, to: RGBA): void {
    for (let y = 0; y < this.height; y += 1) {
      for (let x = 0; x < this.width; x += 1) {
        const pixel = this.get(x, y);
        if (pixel && sameColor(pixel, from)) this.set(x, y, to);
      }
    }
  }

  async toBlob(): Promise<Blob> {
    const canvas = document.createElement("canvas");
    canvas.width = this.width;
    canvas.height = this.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Could not create a canvas.");
    ctx.putImageData(new ImageData(new Uint8ClampedArray(this.data), this.width, this.height), 0, 0);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
    if (!blob) throw new Error("Could not encode the PNG.");
    return blob;
  }

  static async fromFile(file: Blob): Promise<PixelBuffer> {
    const url = URL.createObjectURL(file);
    try {
      return await PixelBuffer.fromUrl(url);
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  static async fromUrl(url: string): Promise<PixelBuffer> {
    const image = new Image();
    image.src = url;
    await image.decode();
    const canvas = document.createElement("canvas");
    canvas.width = image.width;
    canvas.height = image.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Could not read that image.");
    ctx.drawImage(image, 0, 0);
    const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height);
    return new PixelBuffer(canvas.width, canvas.height, new Uint8ClampedArray(pixels.data));
  }
}

export const ZOOM_STEPS = [1, 2, 4, 6, 8, 12, 16, 24, 32];

export function zoomPercent(step: number): number {
  return step * 100;
}
