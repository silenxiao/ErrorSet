import { useRef, useState } from "react";
import { message } from "antd";

import { updateIllustrationBbox } from "../../api/question";
import type { BBox, Illustration } from "../../types/question";
import { applyDrag, type DragMode } from "../../utils/bbox";

interface Props {
  illustration: Illustration;
  parentSelected: boolean;
  /** true 时可拖动移动/八向手柄缩放（预览弹窗内）；false 只展示 bbox 信息 */
  editable?: boolean;
  onSelectParent: () => void;
  onUpdated: () => void;
}

const HANDLES: { mode: DragMode; fx: number; fy: number; cursor: string }[] = [
  { mode: "nw", fx: 0, fy: 0, cursor: "nwse-resize" },
  { mode: "n", fx: 0.5, fy: 0, cursor: "ns-resize" },
  { mode: "ne", fx: 1, fy: 0, cursor: "nesw-resize" },
  { mode: "e", fx: 1, fy: 0.5, cursor: "ew-resize" },
  { mode: "se", fx: 1, fy: 1, cursor: "nwse-resize" },
  { mode: "s", fx: 0.5, fy: 1, cursor: "ns-resize" },
  { mode: "sw", fx: 0, fy: 1, cursor: "nesw-resize" },
  { mode: "w", fx: 0, fy: 0.5, cursor: "ew-resize" },
];

const HANDLE_SIZE = 12;

function pointInSvg(svg: SVGSVGElement, clientX: number, clientY: number) {
  const rect = svg.getBoundingClientRect();
  return {
    x: ((clientX - rect.left) / rect.width) * 1000,
    y: ((clientY - rect.top) / rect.height) * 1000,
  };
}

/** 插图框：editable 时拖动移动 + 八向手柄缩放，松手即保存（bbox_source = manual）；
 * 否则为纯展示（预览弹窗外只显示 bbox 信息，不可编辑）。 */
export default function IllustrationBox({
  illustration,
  parentSelected,
  editable = false,
  onSelectParent,
  onUpdated,
}: Props) {
  const [preview, setPreview] = useState<BBox | null>(null);
  const drag = useRef<{
    mode: DragMode;
    startX: number;
    startY: number;
    startBBox: BBox;
    svg: SVGSVGElement;
  } | null>(null);

  const bbox = preview ?? illustration.bbox;
  const [x1, y1, x2, y2] = bbox;
  const manual = illustration.bboxSource === "manual";
  // 仅预览弹窗内选中高亮（提示可拖动的是哪题的框）；展示页面恒为灰色不变色
  const active = editable && parentSelected;
  const color = active ? "#165DFF" : "#86909C";

  const startDrag = (mode: DragMode) => (e: React.PointerEvent) => {
    if (!editable || e.button !== 0) return;
    e.stopPropagation();
    onSelectParent();
    const svg = (e.currentTarget as SVGElement).ownerSVGElement;
    if (!svg) return;

    const start = pointInSvg(svg, e.clientX, e.clientY);
    const startBBox: BBox = [...illustration.bbox];
    drag.current = { mode, startX: start.x, startY: start.y, startBBox, svg };
    setPreview(startBBox);

    const onMove = (ev: PointerEvent) => {
      const d = drag.current;
      if (!d) return;
      const p = pointInSvg(d.svg, ev.clientX, ev.clientY);
      setPreview(applyDrag(d.startBBox, p.x - d.startX, p.y - d.startY, d.mode));
    };

    const onUp = async (ev: PointerEvent) => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      const d = drag.current;
      drag.current = null;
      if (!d) return;
      const p = pointInSvg(d.svg, ev.clientX, ev.clientY);
      const next = applyDrag(d.startBBox, p.x - d.startX, p.y - d.startY, d.mode);
      setPreview(null);
      if (next.every((v, i) => v === illustration.bbox[i])) return;
      try {
        await updateIllustrationBbox(illustration.id, next);
        onUpdated();
      } catch (err) {
        message.error(err instanceof Error ? err.message : "保存插图框失败");
        onUpdated();
      }
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  };

  return (
    <g>
      <rect
        x={x1}
        y={y1}
        width={x2 - x1}
        height={y2 - y1}
        fill={active ? "rgba(22, 93, 255, 0.10)" : "transparent"}
        stroke={color}
        strokeDasharray={manual ? undefined : "10 6"}
        strokeWidth={active ? 3 : 1.5}
        vectorEffect="non-scaling-stroke"
        rx={4}
        style={{
          cursor: editable ? "move" : undefined,
          // 展示模式下不响应点击，事件穿透到下层（如点空白处打开预览）
          pointerEvents: editable ? undefined : "none",
        }}
        onPointerDown={startDrag("move")}
      />
      <text
        x={x1 + 4}
        y={Math.max(14, y1 - 4)}
        fill={color}
        fontSize={20}
        style={{ userSelect: "none", pointerEvents: "none" }}
      >
        {illustration.type}
        {manual ? "（已调整）" : ""}
      </text>
      {editable &&
        parentSelected &&
        HANDLES.map((h) => (
          <rect
            key={h.mode}
            x={x1 + (x2 - x1) * h.fx - HANDLE_SIZE / 2}
            y={y1 + (y2 - y1) * h.fy - HANDLE_SIZE / 2}
            width={HANDLE_SIZE}
            height={HANDLE_SIZE}
            fill="#fff"
            stroke={color}
            strokeWidth={2}
            vectorEffect="non-scaling-stroke"
            style={{ cursor: h.cursor }}
            onPointerDown={startDrag(h.mode)}
          />
        ))}
    </g>
  );
}
