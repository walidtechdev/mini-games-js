const RASTER_TYPES = new Set(["image/png", "image/webp", "image/jpeg"]);

export function isRasterImage(file: File): boolean {
  if (RASTER_TYPES.has(file.type)) return true;
  const name = file.name.toLowerCase();
  return name.endsWith(".png") || name.endsWith(".webp") || name.endsWith(".jpg") || name.endsWith(".jpeg");
}

export function optionsWithCurrent(options: string[], current: string): string[] {
  if (!current || options.includes(current)) return options;
  return [current, ...options];
}
