/** 保持原始尺寸；超出页面可用空间时等比缩小，永不放大小图。 */
export function fitImageSize(width: number, height: number, maxWidth: number, maxHeight: number) {
  const scale = Math.min(1, maxWidth / width, maxHeight / height);
  return { width: width * scale, height: height * scale };
}
