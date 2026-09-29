import { useState, type CSSProperties } from "react";
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

import { confirmExam, reRecognizeExam } from "../../api/exam";
import ImageViewer from "../../components/ImageViewer";
import ModelSelector from "../../components/ModelSelector";
import QuestionList from "../../components/QuestionList";
import { useRecognition } from "../../hooks/useRecognition";
import type { ExamStatus } from "../../types/exam";

const STATUS_LABEL: Record<ExamStatus, { text: string; color: string }> = {
  uploaded: { text: "排队中", color: "default" },
  global_processing: { text: "整页识别中…", color: "processing" },
  awaiting_review: { text: "待人工确认", color: "gold" },
  local_processing: { text: "二次识别中…", color: "processing" },
  completed: { text: "已完成", color: "success" },
  failed: { text: "失败", color: "error" },
};

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

  if (error) {
    return <Alert type="error" message={error} showIcon />;
  }
  if (!exam) {
    return <Spin size="large" style={{ display: "block", margin: "80px auto" }} />;
  }

  const label = STATUS_LABEL[exam.status];
  const canConfirm = exam.status === "awaiting_review";

  const handleConfirm = async () => {
    setActing(true);
    try {
      await confirmExam(exam.id);
      message.success("已确认，开始二次识别");
      void refresh();
    } catch (err) {
      message.error(err instanceof Error ? err.message : "确认失败");
    } finally {
      setActing(false);
    }
  };

  const openRerecognize = () => {
    setRerecogIncludeIllus(exam.includeIllustrations);
    setRerecogExtra(exam.extraPrompt ?? "");
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

  // 父级（如"打开试卷"浮窗）有固定高度时，两栏等高填满、各自内部滚动；
  // 作为路由页面时父级高度自动，退化为原有的整页滚动。
  const cardStyle: CSSProperties = {
    flex: 1,
    minWidth: 0,
    height: "100%",
    display: "flex",
    flexDirection: "column",
  };
  const cardBodyStyle = { flex: 1, minHeight: 0, overflowY: "auto" } as const;

  return (
    <div
      style={{
        display: "flex",
        gap: 16,
        alignItems: "stretch",
        height: "100%",
        minHeight: 0,
      }}
    >
      <Card
        title={exam.name || `试卷 #${exam.id}`}
        extra={<Tag color={label.color}>{label.text}</Tag>}
        style={cardStyle}
        styles={{ header: { flexShrink: 0 }, body: cardBodyStyle }}
      >
        <ImageViewer
          imageUrl={exam.imageUrl}
          questions={exam.questions}
          selectedId={selectedId}
          onSelect={setSelectedId}
          onUpdated={() => void refresh()}
        />
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
        title="题目列表"
        style={cardStyle}
        styles={{ header: { flexShrink: 0 }, body: cardBodyStyle }}
        extra={
          <Space>
            {canConfirm && (
              <Button type="primary" loading={acting} onClick={handleConfirm}>
                二次识别
              </Button>
            )}
            {(exam.status === "failed" || exam.status === "completed") && (
              <Button loading={acting} onClick={openRerecognize}>
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
          canReview={canConfirm}
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
          rows={3}
          maxLength={2000}
          showCount
          placeholder={
            "例如：这是一年级数学卷，注意区分手写答案与印刷题目；\n分数用 \\frac 表示，单位统一保留"
          }
        />
        <p style={{ marginTop: 8, color: "#888", fontSize: 12 }}>
          会拼接到整页识别与二次识别的提示词末尾，清空则移除已保存的补充要求。
        </p>
      </Modal>
    </div>
  );
}
