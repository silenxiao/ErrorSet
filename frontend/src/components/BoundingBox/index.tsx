import type { Question } from "../../types/question";

interface Props {
  question: Question;
  selected: boolean;
  onSelect: (questionId: number) => void;
}

const STROKE = {
  normal: "#1677ff",
  selected: "#faad14",
};

/** SVG 题目 bbox（§14）：坐标直接使用 0～1000 归一化值，
 * 由 ImageViewer 的 viewBox 映射。拖动/缩放编辑在 Phase 2 实现。 */
export default function BoundingBox({ question, selected, onSelect }: Props) {
  const [x1, y1, x2, y2] = question.bbox;
  const color = selected ? STROKE.selected : STROKE.normal;

  return (
    <g onClick={() => onSelect(question.id)} style={{ cursor: "pointer" }}>
      <rect
        x={x1}
        y={y1}
        width={x2 - x1}
        height={y2 - y1}
        fill={selected ? "rgba(250, 173, 20, 0.15)" : "transparent"}
        stroke={color}
        strokeWidth={selected ? 4 : 2}
        vectorEffect="non-scaling-stroke"
        rx={4}
      />
      <text
        x={x1 + 4}
        y={Math.max(14, y1 - 4)}
        fill={color}
        fontSize={22}
        style={{ userSelect: "none" }}
      >
        {question.questionNo}
        {question.confidence !== undefined && question.confidence < 0.7 ? " ⚠" : ""}
      </text>
    </g>
  );
}
