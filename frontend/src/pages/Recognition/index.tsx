import { useState } from "react";
import { DownOutlined, ReloadOutlined, UpOutlined } from "@ant-design/icons";
import { useParams } from "react-router-dom";
import {
  Alert,
  Button,
  Card,
  Input,
  Modal,
  Radio,
  Space,
  Spin,
  Tag,
  message,
} from "antd";

import { reRecognizeExam } from "../../api/exam";
import { STATUS_LABEL } from "../../constants/examStatus";
import ImageViewer from "../../components/ImageViewer";
import ModelSelector from "../../components/ModelSelector";
import QuestionList from "../../components/QuestionList";
import { useRecognition } from "../../hooks/useRecognition";

/** 识别结果页面（§27.2）：左侧原图 + bbox，右侧题目列表。
 * 路由中使用时 examId 来自 URL；被嵌入浮窗时由 props 传入。 */
export default function RecognitionPage({
  examId: examIdProp,
}: {
  examId?: number;
} = {}) {
  const { examId } = useParams();
  const id = examIdProp ?? (examId ? Number(examId) : undefined);
  const { exam, error, refresh } = useRecognition(id);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [acting, setActing] = useState(false);
  const [rerecogOpen, setRerecogOpen] = useState(false);
  const [rerecogIncludeIllus, setRerecogIncludeIllus] = useState(true);
  const [rerecogExtra, setRerecogExtra] = useState("");
  const [imageCollapsed, setImageCollapsed] = useState(false);

  if (error) {
    return <Alert type="error" message={error} showIcon />;
  }
  if (!exam) {
    return <Spin size="large" style={{ display: "block", margin: "80px auto" }} />;
  }

  const label = STATUS_LABEL[exam.status];

  const openRerecognize = () => {
    setRerecogIncludeIllus(exam.includeIllustrations);
    setRerecogExtra((exam.extraPrompt ?? "").slice(0, 800));
    setRerecogOpen(true);
  };

  const handleRerecognize = async () => {
    setRerecogOpen(false);
    setActing(true);
    try {
      await reRecognizeExam(exam.id, {
        includeIllustrations: rerecogIncludeIllus,
        extraPrompt: rerecogExtra,
      });
      message.success("已重新开始识别");
      void refresh();
    } catch (err) {
      message.error(err instanceof Error ? err.message : "操作失败");
    } finally {
      setActing(false);
    }
  };

  // 布局类 .recognition-split / .recognition-pane 见 index.css（窄屏自动堆叠）
  return (
    <div className="recognition-split">
      <Card
        title={
          <div className="recognition-heading">
            <span className="recognition-exam-name" title={exam.name || `试卷 #${exam.id}`}>
              {exam.name || `试卷 #${exam.id}`}
            </span>
            <Tag color={label.color}>{label.text}</Tag>
          </div>
        }
        extra={
          exam.status !== "failed" &&
          <Button
            type="text"
            size="small"
            className="recognition-image-toggle"
            icon={imageCollapsed ? <DownOutlined /> : <UpOutlined />}
            aria-expanded={!imageCollapsed}
            onClick={() => setImageCollapsed(!imageCollapsed)}
          >
            {imageCollapsed ? "展开原图" : "收起原图"}
          </Button>
        }
        className={`recognition-pane recognition-image-pane${imageCollapsed && exam.status !== "failed" ? " is-collapsed" : ""}`}
      >
        <ImageViewer
          imageUrl={exam.imageUrl}
          questions={exam.questions}
          selectedId={selectedId}
          onSelect={setSelectedId}
          onUpdated={() => void refresh()}
        />
        <p className="recognition-image-hint">点击原图可放大查看、调整插图位置</p>
        {exam.status === "failed" && (
          <Alert
            type="error"
            showIcon
            style={{ marginTop: 12 }}
            message="识别失败"
            description={
              exam.errorMessage ||
              "模型调用失败（可能为超时、网络错误或 API 异常），可点击右上角「重新识别」重试。"
            }
          />
        )}
      </Card>
      <Card
        title={<div className="recognition-heading">题目列表 <span className="recognition-count">{exam.questions.length}</span></div>}
        className="recognition-pane recognition-questions-pane"
        extra={
          <Space>
            {(exam.status === "failed" || exam.status === "completed") && (
              <Button icon={<ReloadOutlined />} loading={acting} onClick={openRerecognize}>
                重新识别
              </Button>
            )}
          </Space>
        }
      >
        <QuestionList
          questions={exam.questions}
          selectedId={selectedId}
          onSelect={setSelectedId}
          onChanged={() => void refresh()}
        />
      </Card>

      <Modal
        title="重新识别"
        open={rerecogOpen}
        onCancel={() => setRerecogOpen(false)}
        // 自定义底部：开始识别后放模型选择，与上传页"上传并开始识别 + 模型"布局一致
        footer={
          <Space>
            <Button onClick={() => setRerecogOpen(false)}>取消</Button>
            <Button danger type="primary" loading={acting} onClick={() => void handleRerecognize()}>
              开始识别
            </Button>
            <ModelSelector />
          </Space>
        }
      >
        <p>将清除当前识别结果并重新识别整张试卷。</p>
        <Radio.Group
          value={rerecogIncludeIllus}
          onChange={(e) => setRerecogIncludeIllus(e.target.value)}
        >
          <Radio value={false}>不包含（只识别题目，更快更省）</Radio>
          <Radio value={true}>包含插图（识别题目和插图）</Radio>
        </Radio.Group>
        <p style={{ marginTop: 12, marginBottom: 4 }}>
          补充提示词（可选，帮助模型更准确地提取内容）：
        </p>
        <Input.TextArea
          value={rerecogExtra}
          onChange={(e) => setRerecogExtra(e.target.value)}
          rows={7}
          maxLength={800}
          showCount
          placeholder={
            "例如：这是一年级数学卷，注意区分手写答案与印刷题目；\n分数用 \\frac 表示，单位统一保留"
          }
        />
        <p style={{ marginTop: 8, color: "#888", fontSize: 12 }}>
          会拼接到整页识别的提示词末尾，清空则移除已保存的补充要求。
        </p>
      </Modal>
    </div>
  );
}
