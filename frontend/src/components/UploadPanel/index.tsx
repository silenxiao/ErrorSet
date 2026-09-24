import { InboxOutlined } from "@ant-design/icons";
import { Button, Form, Input, Radio, Select, Upload, message } from "antd";
import { useState } from "react";

import { createExam } from "../../api/exam";
import type { ExamCreated } from "../../types/exam";

interface Props {
  onUploaded: (exam: ExamCreated) => void;
}

/** 上传面板（§27.1）：拖拽/点击上传 + 预览 + 命名 + 插图选项。 */
export default function UploadPanel({ onUploaded }: Props) {
  const [file, setFile] = useState<File | null>(null);
  const [name, setName] = useState("");
  const [includeIllustrations, setIncludeIllustrations] = useState(false);
  const gradeOptions = [
    "一年级", "二年级", "三年级", "四年级", "五年级", "六年级",
    "初一", "初二", "初三",
  ];
  const [grade, setGrade] = useState(() => {
    const savedGrade = window.localStorage.getItem("lastExamGrade");
    return savedGrade && gradeOptions.includes(savedGrade) ? savedGrade : "一年级";
  });
  const [uploading, setUploading] = useState(false);
  const [form] = Form.useForm();

  const handleUpload = async () => {
    if (!file) {
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
    <Form form={form} layout="vertical" style={{ maxWidth: 520 }}>
      <Form.Item label="试卷图片（JPG/PNG/WebP，≤10MB，一张图 = 一份试卷）">
        <Upload.Dragger
          accept=".jpg,.jpeg,.png,.webp"
          maxCount={1}
          showUploadList={{ showRemoveIcon: true }}
          beforeUpload={(f) => {
            setFile(f);
            return false;
          }}
          onRemove={() => setFile(null)}
        >
          <p className="ant-upload-drag-icon">
            <InboxOutlined />
          </p>
          <p className="ant-upload-text">点击或拖拽图片到此处上传</p>
        </Upload.Dragger>
      </Form.Item>
      <Form.Item label="年级">
        <Select
          value={grade}
          options={gradeOptions.map((value) => ({ value, label: value }))}
          onChange={(value: string) => {
            setGrade(value);
            window.localStorage.setItem("lastExamGrade", value);
          }}
        />
      </Form.Item>
      <Form.Item label="试卷名称（默认取文件名）">
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="例如：数学月考"
        />
      </Form.Item>
      <Form.Item label="是否包含插图">
        <Radio.Group
          value={includeIllustrations}
          onChange={(e) => setIncludeIllustrations(e.target.value)}
        >
          <Radio value={false}>不包含（只识别题目，更快更省）</Radio>
          <Radio value={true}>包含插图（识别题目和插图）</Radio>
        </Radio.Group>
      </Form.Item>
      <Button
        type="primary"
        loading={uploading}
        disabled={!file}
        onClick={handleUpload}
      >
        上传并开始识别
      </Button>
    </Form>
  );
}
