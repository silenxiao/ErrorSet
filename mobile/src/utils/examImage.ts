export function examImageName(fileName: string | null | undefined, camera: boolean, date = new Date()) {
  if (!camera && fileName?.trim()) return fileName.trim();
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

export function cropPixels(box: number[], width: number, height: number) {
  const originX = Math.round(box[0] * width / 1000);
  const originY = Math.round(box[1] * height / 1000);
  return { originX, originY,
    width: Math.max(1, Math.round(box[2] * width / 1000) - originX),
    height: Math.max(1, Math.round(box[3] * height / 1000) - originY) };
}
