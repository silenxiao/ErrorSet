import { useState } from "react";
import { Image } from "antd";
import { EyeOutlined } from "@ant-design/icons";
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
 * preserveAspectRatio="none" 精确铺在图片上方，坐标一一对应。
 * 只画插图调整框：题目框已按需求移除，题目改由右侧列表选中。
 * 鼠标悬停图片时浮现"预览"遮罩（与错题库插图同款交互），
 * 点击图片空白处打开大图；遮罩不拦截鼠标，不影响插图框拖拽。 */
export default function ImageViewer({
  imageUrl,
  questions,
  selectedId,
  onSelect,
  onUpdated,
}: Props) {
  const [previewOpen, setPreviewOpen] = useState(false);
  const [hovered, setHovered] = useState(false);

  if (!imageUrl) {
    return (
      <div style={{ padding: 32, textAlign: "center", color: "var(--text-3)" }}>
        暂无图片
      </div>
    );
  }
  return (
    <div
      style={{ position: "relative", display: "inline-block", width: "100%" }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <img
        src={imageUrl}
        alt="试卷原图"
        style={{ display: "block", width: "100%", height: "auto" }}
      />
      {/* 悬停遮罩：纯视觉层（pointer-events: none），层级在插图框之下 */}
      {hovered && !previewOpen && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 6,
            background: "rgba(0, 0, 0, 0.45)",
            color: "#fff",
            fontSize: 16,
            pointerEvents: "none",
            cursor: "zoom-in",
          }}
        >
          <EyeOutlined />
          <span>预览</span>
        </div>
      )}
      {/* 点击落在空白图片区域（target 是 svg 根）时打开预览；
          插图框/手柄上的点击 target 是子元素，不会误触 */}
      <svg
        viewBox="0 0 1000 1000"
        preserveAspectRatio="none"
        onClick={(e) => {
          if (e.target === e.currentTarget) setPreviewOpen(true);
        }}
        style={{
          position: "absolute",
          inset: 0,
          width: "100%",
          height: "100%",
          cursor: "zoom-in",
        }}
      >
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
      {/* 受控预览：lightbox 里展示不带框的原图，可缩放/旋转 */}
      <Image
        src={imageUrl}
        preview={{
          visible: previewOpen,
          src: imageUrl,
          onVisibleChange: (value) => setPreviewOpen(value),
        }}
        style={{ display: "none" }}
      />
    </div>
  );
}
