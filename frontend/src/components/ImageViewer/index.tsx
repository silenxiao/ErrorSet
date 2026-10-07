import { useState } from "react";
import { Modal, Switch } from "antd";
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
 * 页面上只展示插图 bbox 信息（不可编辑、不响应点击，点击穿透到下层打开预览）；
 * 悬停浮现「预览」遮罩，点击图片打开大图预览弹窗，弹窗内才可拖动/缩放插图框。 */
export default function ImageViewer({
  imageUrl,
  questions,
  selectedId,
  onSelect,
  onUpdated,
}: Props) {
  const [previewOpen, setPreviewOpen] = useState(false);
  const [hovered, setHovered] = useState(false);
  // 预览弹窗内可隐藏插图框，查看干净原图
  const [showBoxes, setShowBoxes] = useState(true);

  if (!imageUrl) {
    return (
      <div style={{ padding: 32, textAlign: "center", color: "var(--text-3)" }}>
        暂无图片
      </div>
    );
  }

  const boxes = (editable: boolean) =>
    questions.flatMap((q) =>
      q.illustrations.map((ill) => (
        <IllustrationBox
          key={`ill-${editable ? "edit" : "view"}-${ill.id}`}
          illustration={ill}
          parentSelected={q.id === selectedId}
          editable={editable}
          onSelectParent={() => onSelect(q.id)}
          onUpdated={onUpdated}
        />
      )),
    );

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
          <span>预览 / 调整插图</span>
        </div>
      )}
      {/* 点击图片任意位置（含插图框，框体不响应点击）打开预览弹窗 */}
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
        {boxes(false)}
      </svg>

      {/* 预览弹窗：大图上直接拖动框体/手柄调整插图位置与大小，松手自动保存 */}
      <Modal
        title="预览与调整插图"
        open={previewOpen}
        onCancel={() => setPreviewOpen(false)}
        footer={null}
        width="90vw"
        centered
        styles={{ body: { textAlign: "center" } }}
        destroyOnClose
      >
        <div
          style={{
            display: "flex",
            justifyContent: "flex-end",
            alignItems: "center",
            gap: 8,
            marginBottom: 8,
          }}
        >
          <span style={{ color: "var(--text-3)", fontSize: 13 }}>显示插图框</span>
          <Switch size="small" checked={showBoxes} onChange={setShowBoxes} />
        </div>
        <div
          style={{ position: "relative", display: "inline-block", maxWidth: "100%" }}
        >
          <img
            src={imageUrl}
            alt="试卷原图"
            style={{
              display: "block",
              maxWidth: "100%",
              maxHeight: "74vh",
              width: "auto",
              height: "auto",
            }}
          />
          {showBoxes && (
            <svg
              viewBox="0 0 1000 1000"
              preserveAspectRatio="none"
              style={{
                position: "absolute",
                inset: 0,
                width: "100%",
                height: "100%",
              }}
            >
              {boxes(true)}
            </svg>
          )}
        </div>
        <div style={{ color: "var(--text-3)", fontSize: 13, marginTop: 8 }}>
          选中题目后拖动框体或八向手柄可调整插图位置与大小，松手自动保存
        </div>
      </Modal>
    </div>
  );
}
