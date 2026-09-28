// bbox 工具：0～1000 归一化坐标，含越界收紧、合法性校验、拖拽计算。
// 移植自前端 src/utils/bbox.ts（§36 / §35）。

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

function clampBBox(b) {
  return [
    clamp(Math.round(b[0]), 0, 1000),
    clamp(Math.round(b[1]), 0, 1000),
    clamp(Math.round(b[2]), 0, 1000),
    clamp(Math.round(b[3]), 0, 1000),
  ];
}

function isValidBBox(b) {
  const [x1, y1, x2, y2] = clampBBox(b);
  return x1 < x2 && y1 < y2 && x2 - x1 > 1 && y2 - y1 > 1;
}

function normalizeBBox(input) {
  if (!input || input.length !== 4 || input.some((v) => !isFinite(v))) return null;
  const b = clampBBox(input);
  return isValidBBox(b) ? b : null;
}

// mode: move | nw | n | ne | e | se | s | sw | w
function applyDrag(start, dx, dy, mode) {
  if (mode === 'move') {
    const w = start[2] - start[0];
    const h = start[3] - start[1];
    const x1 = clamp(Math.round(start[0] + dx), 0, 1000 - w);
    const y1 = clamp(Math.round(start[1] + dy), 0, 1000 - h);
    return [x1, y1, x1 + w, y1 + h];
  }
  let [x1, y1, x2, y2] = start;
  if (mode.indexOf('w') >= 0) x1 = clamp(Math.round(x1 + dx), 0, x2 - 2);
  if (mode.indexOf('e') >= 0) x2 = clamp(Math.round(x2 + dx), x1 + 2, 1000);
  if (mode.indexOf('n') >= 0) y1 = clamp(Math.round(y1 + dy), 0, y2 - 2);
  if (mode.indexOf('s') >= 0) y2 = clamp(Math.round(y2 + dy), y1 + 2, 1000);
  return [x1, y1, x2, y2];
}

// 将 0～1000 坐标转换为相对容器的百分比 style 字符串
function bboxToStyle(b) {
  const [x1, y1, x2, y2] = b;
  return `left:${x1 / 10}%;top:${y1 / 10}%;width:${(x2 - x1) / 10}%;height:${(y2 - y1) / 10}%;`;
}

module.exports = { clamp, clampBBox, isValidBBox, normalizeBBox, applyDrag, bboxToStyle };
