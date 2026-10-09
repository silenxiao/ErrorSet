// 保持原始像素尺寸，仅在可用区域不足时等比缩小。
function fitImage(width, height, maxWidth, maxHeight) {
  const scale = Math.min(1, maxWidth / width, maxHeight / height);
  return { width: width * scale, height: height * scale };
}
module.exports = { fitImage };
