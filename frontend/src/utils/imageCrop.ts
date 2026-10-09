export interface Crop { x: number; y: number; width: number; height: number }

/** 归一化选框转换为原图像素；确保不会越界或产生零尺寸。 */
export function cropPixels(crop: Crop, width: number, height: number) {
  const x = Math.max(0, Math.min(width - 1, Math.round(crop.x * width)));
  const y = Math.max(0, Math.min(height - 1, Math.round(crop.y * height)));
  const right = Math.max(x + 1, Math.min(width, Math.round((crop.x + crop.width) * width)));
  const bottom = Math.max(y + 1, Math.min(height, Math.round((crop.y + crop.height) * height)));
  return { x, y, width: right - x, height: bottom - y };
}
