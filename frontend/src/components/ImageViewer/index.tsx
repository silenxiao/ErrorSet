import BoundingBox from "../BoundingBox";
import IllustrationBox from "../IllustrationBox";
import type { Question } from "../../types/question";

interface Props {
  imageUrl: string | null;
  questions: Question[];
  selectedId: number | null;
  onSelect: (questionId: number) => void;
  onUpdated: () => void;
}

/** 原始试卷图片 + SVG overlay（§14）。
 * bbox 为 0～1000 归一化坐标，overlay 用 viewBox 0 0 1000 1000 +
 * preserveAspectRatio="none" 精确铺在图片上方，坐标一一对应。 */
export default function ImageViewer({
  imageUrl,
  questions,
  selectedId,
  onSelect,
  onUpdated,
}: Props) {
  if (!imageUrl) {
    return <div style={{ padding: 32, textAlign: "center" }}>暂无图片</div>;
  }
  return (
    <div style={{ position: "relative", display: "inline-block", width: "100%" }}>
      <img
        src={imageUrl}
        alt="试卷原图"
        style={{ display: "block", width: "100%", height: "auto" }}
      />
      <svg
        viewBox="0 0 1000 1000"
        preserveAspectRatio="none"
        style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }}
      >
        {questions.map((q) => (
          <BoundingBox
            key={q.id}
            question={q}
            selected={q.id === selectedId}
            onSelect={onSelect}
          />
        ))}
        {questions.flatMap((q) =>
          q.illustrations.map((ill) => (
            <IllustrationBox
              key={`ill-${ill.id}`}
              illustration={ill}
              parentSelected={q.id === selectedId}
              onSelectParent={() => onSelect(q.id)}
              onUpdated={onUpdated}
            />
          )),
        )}
      </svg>
    </div>
  );
}
