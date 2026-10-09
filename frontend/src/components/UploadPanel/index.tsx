import { InboxOutlined } from "@ant-design/icons";
import { Button, Form, Input, Radio, Select, Space, Upload, message } from "antd";
import { useEffect, useRef, useState } from "react";

import { createExam } from "../../api/exam";
import { getStoredGrade } from "../../api/auth";
import { GRADE_OPTIONS, GRADE_STORAGE_KEY } from "../../utils/grade";
import type { ExamCreated } from "../../types/exam";
import ModelSelector from "../ModelSelector";
import ImageEditor from "../ImageEditor";
import "./index.css";

interface Props {
  onUploaded: (exam: ExamCreated) => void;
}

/** 上传面板（§27.1）：拖拽/点击上传 + 预览 + 命名 + 插图选项 + 识别模型选择。 */
export default function UploadPanel({ onUploaded }: Props) {
  const [file, setFile] = useState<File | null>(null);
  const [editingFile, setEditingFile] = useState<File | null>(null);
  const [preview, setPreview] = useState("");
  const cameraInput = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (!file) { setPreview(""); return; }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);
  const [name, setName] = useState("");
  const [includeIllustrations, setIncludeIllustrations] = useState(false);
  const [grade, setGrade] = useState(() => {
    // 默认年级：上次手动选择 > 注册时选择的年级 > 六年级（规范默认）
    const saved = window.localStorage.getItem(GRADE_STORAGE_KEY);
    if (saved && GRADE_OPTIONS.includes(saved)) return saved;
    const registered = getStoredGrade();
    if (registered && GRADE_OPTIONS.includes(registered)) return registered;
    return GRADE_OPTIONS.includes("六年级") ? "六年级" : GRADE_OPTIONS[0];
  });
  const [uploading, setUploading] = useState(false);
  const [form] = Form.useForm();

  const handleUpload = async () => {
    if (!file || editingFile) {
      message.warning("请先选择图片");
      return;
    }
    setUploading(true);
    try {
      const exam = await createExam(file, name, includeIllustrations, grade);
      message.success("上传成功，已开始识别");
      onUploaded(exam);
    } catch (err) {
      message.error(err instanceof Error ? err.message : "上传失败");
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="upload-panel">
      <div className="upload-panel-file">
        <div className="upload-panel-heading">上传试卷</div>
        <p className="upload-panel-description">选择或拍摄图片，编辑确认后再上传识别</p>
        <Upload.Dragger
          accept=".jpg,.jpeg,.png,.webp"
          maxCount={1}
          showUploadList={false}
          disabled={uploading || !!editingFile}
          beforeUpload={(f) => {
            setEditingFile(f);
            return Upload.LIST_IGNORE;
          }}
        >
          <p className="ant-upload-drag-icon" style={{ marginBottom: 8 }}>
            <InboxOutlined style={{ color: "var(--primary)" }} />
          </p>
          <p className="ant-upload-text">点击或拖拽图片到此处上传</p>
          <p className="ant-upload-hint">试卷图片（JPG/PNG/WebP，≤10MB，一张图 = 一份试卷）</p>
        </Upload.Dragger>
        <input ref={cameraInput} type="file" accept="image/*" capture="environment" hidden
          onChange={(e) => {
            const selected = e.target.files?.[0];
            if (selected) setEditingFile(selected);
            e.target.value = "";
          }} />
        <Space wrap style={{ marginTop: 12 }}>
          <Button disabled={uploading || !!editingFile} onClick={() => cameraInput.current?.click()}>拍照</Button>
          {file && <>
            <Button disabled={uploading} onClick={() => setEditingFile(file)}>重新编辑</Button>
            <Button disabled={uploading} onClick={() => setFile(null)}>移除图片</Button>
          </>}
        </Space>
        {preview && <div style={{ marginTop: 12 }}>
          <img src={preview} alt="编辑后待上传的试卷" className="exam-image" />
          <p className="upload-panel-description" style={{ marginTop: 8 }}>已确认：{file?.name}</p>
        </div>}
      </div>
      <Form form={form} layout="vertical" className="upload-panel-settings">
        <div className="upload-panel-heading">识别设置</div>
        <div className="upload-panel-fields">
          <Form.Item label="年级" style={{ marginBottom: 16 }}>
            <Select
              value={grade}
              options={GRADE_OPTIONS.map((value) => ({ value, label: value }))}
              onChange={(value: string) => {
                setGrade(value);
                window.localStorage.setItem(GRADE_STORAGE_KEY, value);
              }}
            />
          </Form.Item>
          <Form.Item label="试卷名称（默认取文件名）" style={{ marginBottom: 16 }}>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="例如：数学月考"
            />
          </Form.Item>
        </div>
        <Form.Item label="是否包含插图" style={{ marginBottom: 16 }}>
          <Radio.Group
            className="upload-panel-options"
            value={includeIllustrations}
            onChange={(e) => setIncludeIllustrations(e.target.value)}
          >
            <Radio value={false}><span>不包含插图</span><small>只识别题目，更快更省</small></Radio>
            <Radio value={true}><span>包含插图</span><small>同时识别题目和插图</small></Radio>
          </Radio.Group>
        </Form.Item>
        <Space wrap className="upload-panel-actions">
          <Button
            type="primary"
            loading={uploading}
            disabled={!file || !!editingFile}
            onClick={handleUpload}
          >
            上传并开始识别
          </Button>
          <ModelSelector />
        </Space>
      </Form>
      {editingFile && <ImageEditor key={editingFile.name + editingFile.lastModified} file={editingFile}
        onCancel={() => setEditingFile(null)}
        onConfirm={(edited) => { setFile(edited); setEditingFile(null); }} />}
    </div>
  );
}
