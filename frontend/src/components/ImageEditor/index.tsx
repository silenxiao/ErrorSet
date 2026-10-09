import { useEffect, useRef, useState } from "react";
import { Button, Modal, Space, message } from "antd";
import { cropPixels, type Crop } from "../../utils/imageCrop";
import IllustrationBox from "../IllustrationBox";
import type { BBox } from "../../types/question";

const FULL: Crop = { x: 0, y: 0, width: 1, height: 1 };

/** 编辑始终基于原文件，预览缩小，导出使用原始像素。 */
export default function ImageEditor({ file, onCancel, onConfirm }: {
  file: File; onCancel: () => void; onConfirm: (file: File) => void;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const source = useRef<HTMLImageElement | null>(null);
  const [rotation, setRotation] = useState(0);
  const [crop, setCrop] = useState<Crop>(FULL);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    let active = true;
    image.onload = () => {
      if (!active) return;
      if (image.naturalWidth * image.naturalHeight > 40000000) {
        message.error("图片像素过大，请使用小于 4000 万像素的图片");
        return;
      }
      source.current = image;
      setLoaded(true);
    };
    image.onerror = () => active && message.error("无法读取图片，请选择 JPG、PNG 或 WebP 图片");
    image.src = url;
    return () => { active = false; source.current = null; URL.revokeObjectURL(url); };
  }, [file]);

  const renderImage = (target: HTMLCanvasElement, preview: boolean) => {
    const image = source.current!;
    const swapped = rotation % 180 !== 0;
    const width = swapped ? image.naturalHeight : image.naturalWidth;
    const height = swapped ? image.naturalWidth : image.naturalHeight;
    const scale = preview ? Math.min(1, 1400 / Math.max(width, height)) : 1;
    target.width = Math.round(width * scale);
    target.height = Math.round(height * scale);
    const ctx = target.getContext("2d")!;
    ctx.fillStyle = "white";
    ctx.fillRect(0, 0, target.width, target.height);
    ctx.translate(target.width / 2, target.height / 2);
    ctx.rotate(rotation * Math.PI / 180);
    ctx.drawImage(image, -image.naturalWidth * scale / 2, -image.naturalHeight * scale / 2,
      image.naturalWidth * scale, image.naturalHeight * scale);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    return ctx;
  };

  useEffect(() => {
    if (!loaded || !canvas.current) return;
    renderImage(canvas.current, true);
  }, [loaded, rotation]); // eslint-disable-line react-hooks/exhaustive-deps

  const bbox: BBox = [crop.x * 1000, crop.y * 1000,
    (crop.x + crop.width) * 1000, (crop.y + crop.height) * 1000];
  const rotate = (amount: number) => {
    setRotation((value) => (value + amount + 360) % 360);
    setCrop(FULL);
  };
  const confirm = async () => {
    if (!loaded || saving) return;
    setSaving(true);
    try {
      const rotated = document.createElement("canvas");
      renderImage(rotated, false);
      const box = cropPixels(crop, rotated.width, rotated.height);
      const output = document.createElement("canvas");
      output.width = box.width; output.height = box.height;
      output.getContext("2d")!.drawImage(rotated, box.x, box.y, box.width, box.height,
        0, 0, box.width, box.height);
      const blob = await new Promise<Blob>((resolve, reject) => output.toBlob(
        (result) => result ? resolve(result) : reject(new Error("图片导出失败，请缩小范围后重试")), "image/jpeg", 0.95));
      if (blob.size > 10 * 1024 * 1024) throw new Error("编辑后的图片超过 10MB，请缩小裁剪范围");
      onConfirm(new File([blob], file.name.replace(/\.[^.]+$/, "") + ".jpg", { type: "image/jpeg" }));
    } catch (error) {
      message.error(error instanceof Error ? error.message : "图片编辑失败");
    } finally { setSaving(false); }
  };

  return <Modal title="编辑试卷图片" open width={960} onCancel={() => { if (!saving) onCancel(); }}
    maskClosable={false} closable={!saving} keyboard={!saving}
    footer={<Space><Button disabled={saving} onClick={onCancel}>取消</Button>
      <Button type="primary" disabled={!loaded} loading={saving} onClick={() => void confirm()}>确认编辑</Button></Space>}>
    <p>拖动蓝色框体调整位置，拖动八向手柄调整裁剪范围。确认后再上传识别。</p>
    <Space wrap style={{ marginBottom: 12 }}>
      <Button disabled={!loaded || saving} onClick={() => rotate(-90)}>左转 90°</Button>
      <Button disabled={!loaded || saving} onClick={() => rotate(90)}>右转 90°</Button>
      <Button disabled={!loaded || saving} onClick={() => { setRotation(0); setCrop(FULL); }}>恢复原图</Button>
      <Button disabled={!loaded || saving} onClick={() => setCrop(FULL)}>保留全图</Button>
    </Space>
    <div style={{ textAlign: "center", background: "#f1f3f5", minHeight: 120 }}>
      {!loaded && <p>正在读取图片…</p>}
      <div style={{ position: "relative", display: "inline-block", maxWidth: "100%", lineHeight: 0 }}>
        <canvas ref={canvas} aria-label="试卷图片预览" className="exam-image" />
        {loaded && <svg viewBox="0 0 1000 1000" preserveAspectRatio="none" aria-label="调整图片裁剪范围"
          style={{ position: "absolute", inset: 0, width: "100%", height: "100%", touchAction: "none", overflow: "visible" }}>
          <IllustrationBox key={rotation} illustration={{ id: 0, imageUrl: "", bbox, aiBbox: [0, 0, 1000, 1000], bboxSource: "manual", type: "image" }}
            parentSelected editable={!saving} onSelectParent={() => {}} onUpdated={() => {}}
            onBboxChange={([x1, y1, x2, y2]) => setCrop({ x: x1 / 1000, y: y1 / 1000, width: (x2 - x1) / 1000, height: (y2 - y1) / 1000 })} />
        </svg>}
      </div>
    </div>
  </Modal>;
}
