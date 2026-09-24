import type { BBox } from "../types/question";

/** §36：0 <= x1 < x2 <= 1000、0 <= y1 < y2 <= 1000，超界收紧，尺寸过小判无效。 */

export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function clampBBox(bbox: BBox): BBox {
  const x1 = clamp(Math.round(bbox[0]), 0, 1000);
  const y1 = clamp(Math.round(bbox[1]), 0, 1000);
  const x2 = clamp(Math.round(bbox[2]), 0, 1000);
  const y2 = clamp(Math.round(bbox[3]), 0, 1000);
  return [x1, y1, x2, y2];
}

export function isValidBBox(bbox: BBox): boolean {
  const [x1, y1, x2, y2] = clampBBox(bbox);
  return x1 < x2 && y1 < y2 && x2 - x1 > 1 && y2 - y1 > 1;
}

/** 归一化任意输入为合法 BBox；无法修复时返回 null。 */
export function normalizeBBox(input: number[] | null | undefined): BBox | null {
  if (!input || input.length !== 4 || input.some((v) => !Number.isFinite(v))) {
    return null;
  }
  const bbox = clampBBox(input as BBox);
  return isValidBBox(bbox) ? bbox : null;
}

export type DragMode = "move" | "nw" | "n" | "ne" | "e" | "se" | "s" | "sw" | "w";

/** §35：根据起始 bbox 与鼠标位移（0～1000 坐标系）计算拖拽后的新 bbox（整数坐标）。 */
export function applyDrag(start: BBox, dx: number, dy: number, mode: DragMode): BBox {
  if (mode === "move") {
    const width = start[2] - start[0];
    const height = start[3] - start[1];
    const x1 = clamp(Math.round(start[0] + dx), 0, 1000 - width);
    const y1 = clamp(Math.round(start[1] + dy), 0, 1000 - height);
    return [x1, y1, x1 + width, y1 + height];
  }
  let [x1, y1, x2, y2] = start;
  if (mode.includes("w")) x1 = clamp(Math.round(x1 + dx), 0, x2 - 2);
  if (mode.includes("e")) x2 = clamp(Math.round(x2 + dx), x1 + 2, 1000);
  if (mode.includes("n")) y1 = clamp(Math.round(y1 + dy), 0, y2 - 2);
  if (mode.includes("s")) y2 = clamp(Math.round(y2 + dy), y1 + 2, 1000);
  return [x1, y1, x2, y2];
}
