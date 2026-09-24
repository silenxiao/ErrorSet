import { EditOutlined } from "@ant-design/icons";
import {
  Button,
  Empty,
  Form,
  Input,
  Modal,
  Select,
  Space,
  Tag,
  message,
} from "antd";
import { useState, type ReactNode } from "react";

import { addWrongQuestion, resetBbox, analyzeQuestion } from "../../api/question";
import type { Question, QuestionStatus } from "../../types/question";
import { renderMathText } from "../../utils/math";
import { renderMarkdown } from "../../utils/markdown";

interface Props {
  questions: Question[];
  selectedId: number | null;
  onSelect: (questionId: number) => void;
  onChanged: () => void;
  canReview: boolean;
}

const STATUS_LABEL: Record<QuestionStatus, { text: string; color: string }> = {
  pending_review: { text: "待确认", color: "gold" },
  confirmed: { text: "已确认", color: "blue" },
  correcting: { text: "二次识别中", color: "processing" },
  completed: { text: "已完成", color: "success" },
  failed: { text: "失败", color: "error" },
};

/** 右侧题目列表（§27.2）：层级树形展示 + 状态 + 加入错题库入口。 */
export default function QuestionList({
  questions,
  selectedId,
  onSelect,
  onChanged,
}: Props) {
  const [wrongTarget, setWrongTarget] = useState<Question | null>(null);

  if (questions.length === 0) {
    return <Empty description="暂无题目" />;
  }

  const byId = new Map(questions.map((q) => [q.id, q]));
  const childrenOf = (parentId: number) =>
    questions.filter((q) => q.parentId === parentId);
  const roots = questions.filter(
    (q) => q.parentId === null || !byId.has(q.parentId),
  );

  const renderQuestion = (q: Question, depth: number, node: ReactNode[], parentSubject?: string) => {
    const subject = q.subject || parentSubject || "";
    node.push(<QuestionItem key={q.id} question={q} depth={depth} subject={subject} {...{
      selectedId,
      onSelect,
      onAddWrong: setWrongTarget,
      onReset: async () => {
        await resetBbox(q.id);
        message.success(`题目 ${q.questionNo} 已恢复 AI bbox`);
        onChanged();
      },
    }} />);
    childrenOf(q.id).forEach((child) => renderQuestion(child, depth + 1, node, subject));
    return node;
  };

  return (
    <>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {roots.reduce<ReactNode[]>((acc, root) => renderQuestion(root, 0, acc), [])}
      </div>

      <WrongQuestionModal
        question={wrongTarget}
        onClose={() => setWrongTarget(null)}
        onSaved={() => {
          setWrongTarget(null);
          message.success("已加入错题库");
        }}
      />
    </>
  );
}

function QuestionItem({
  question,
  depth,
  subject,
  selectedId,
  onSelect,
  onAddWrong,
  onReset,
}: {
  question: Question;
  depth: number;
  /** 展示科目：自身识别结果，小题继承父题 */
  subject: string;
  selectedId: number | null;
  onSelect: (id: number) => void;
  onAddWrong: (q: Question) => void;
  onReset: () => void;
}) {
  const status = STATUS_LABEL[question.status];
  const suspicious =
    question.confidence !== undefined && question.confidence < 0.7;

  return (
    <div
      onClick={() => onSelect(question.id)}
      style={{
        marginLeft: depth * 24,
        padding: "8px 12px",
        border: `1px solid ${selectedId === question.id ? "#faad14" : "#f0f0f0"}`,
        borderRadius: 8,
        cursor: "pointer",
        background: selectedId === question.id ? "#fffbe6" : "#fff",
      }}
    >
      <Space size={8} wrap style={{ marginBottom: 4 }}>
        <strong>第 {question.questionNo} 题</strong>
        <Tag color={status.color}>{status.text}</Tag>
        {question.bboxSource === "manual" && <Tag>已手动调整</Tag>}
        {suspicious && <Tag color="warning">可疑</Tag>}
        {question.illustrations.length > 0 && (
          <Tag color="purple">含插图 ×{question.illustrations.length}</Tag>
        )}
      </Space>
      <div style={{ whiteSpace: "pre-wrap" }}>{renderMathText(question.text)}</div>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 8,
          marginTop: 8,
          flexWrap: "wrap",
        }}
      >
        <Space size={8}>
          <Button
            size="small"
            onClick={(e) => {
              e.stopPropagation();
              onAddWrong(question);
            }}
          >
            加入错题库
          </Button>
          <Button
            size="small"
            onClick={(e) => {
              e.stopPropagation();
              onReset();
            }}
          >
            恢复 AI bbox
          </Button>
        </Space>
        {subject && (
          <Tag color="geekblue" style={{ marginRight: 0 }} title="识别判断的科目">
            {subject}
          </Tag>
        )}
      </div>
    </div>
  );
}

function WrongQuestionModal({
  question,
  onClose,
  onSaved,
}: {
  question: Question | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form] = Form.useForm();
  const analysis = Form.useWatch("analysis", form);
  const correctAnswer = Form.useWatch("correctAnswer", form);
  const [editingAnswer, setEditingAnswer] = useState(false);
  const [saving, setSaving] = useState(false);
  const [aiAnalyzing, setAiAnalyzing] = useState(false);

  const handleAiAnalyze = async (questionId: number) => {
    setAiAnalyzing(true);
    try {
      const result = await analyzeQuestion(questionId);
      const subjectMatch = result.match(/^(?:科目|学科)：\s*(语文|数学|英语|物理|化学|生物|历史|政治|地理)/m);
      const answerMarker = /^(?:正确答案|答案)：?\s*/m.exec(result);
      const analysisMarker = /^(?:AI分析|分析|解析|解题过程)：?\s*/m.exec(result);
      const answerContent = answerMarker
        ? result.slice(
            answerMarker.index + answerMarker[0].length,
            analysisMarker?.index ?? result.length,
          ).replace(/^(?:科目|学科)：.*\r?\n/gm, "").trim()
        : result.replace(/^(?:科目|学科)：.*\r?\n/gm, "").trim();
      const analysisContent = analysisMarker
        ? result.slice(analysisMarker.index + analysisMarker[0].length)
            .replace(/^(?:科目|学科)：.*\r?\n/gm, "").trim()
        : "";
      form.setFieldsValue({
        ...(subjectMatch ? { subject: subjectMatch[1] } : {}),
        correctAnswer: answerContent,
        analysis: analysisContent,
      });
    } catch (err) {
      message.error(err instanceof Error ? err.message : "AI 分析失败");
    } finally {
      setAiAnalyzing(false);
    }
  };

  const handleOk = async () => {
    if (!question) return;
    let values;
    try {
      values = await form.validateFields();
    } catch {
      return; // 表单校验失败，antd 已在字段上提示
    }
    setSaving(true);
    try {
      await addWrongQuestion({
        questionId: question.id,
        answer: "", // 移除我的答案
        correctAnswer: values.correctAnswer ?? "",
        subject: values.subject ?? "",
        analysis: values.analysis ?? "",
        wrongReason: "", // 移除错因
        knowledgePoints: [], // 移除知识点
        note: values.note ?? "",
      });
      onSaved();
    } catch (err) {
      message.error(err instanceof Error ? err.message : "加入错题库失败");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      title={`加入错题库：第 ${question?.questionNo ?? ""} 题`}
      open={question !== null}
      onOk={handleOk}
      onCancel={onClose}
      confirmLoading={saving}
      destroyOnClose
    >
      <Form
        form={form}
        layout="vertical"
        // 默认填充识别阶段判断的科目；无识别结果时回退"语文"
        initialValues={{ subject: question?.subject || "语文" }}
      >
        <Form.Item name="subject" label="科目" rules={[{ required: true, message: "请选择科目" }]}>
          <Select
            options={["语文", "数学", "英语", "物理", "化学", "生物", "历史", "政治", "地理"].map((value) => ({ value, label: value }))}
          />
        </Form.Item>
        <Form.Item label="正确答案">
          {editingAnswer ? (
            <>
              <Input.TextArea
                value={correctAnswer ?? ""}
                autoSize={{ minRows: 3, maxRows: 7 }}
                placeholder="填写正确答案"
                onChange={(event) => form.setFieldsValue({ correctAnswer: event.target.value })}
              />
              <Button size="small" style={{ marginTop: 8 }} onClick={() => setEditingAnswer(false)}>
                完成编辑
              </Button>
            </>
          ) : (
            <div className="answer-markdown-preview" style={{ position: "relative", minHeight: 64, padding: "10px 40px 10px 12px", border: "1px solid #d9d9d9", borderRadius: 6 }}>
              {correctAnswer ? renderMarkdown(correctAnswer) : <span style={{ color: "#bfbfbf" }}>AI 分析后显示正确答案</span>}
              <Button
                type="text"
                size="small"
                aria-label="编辑正确答案"
                title="编辑正确答案"
                icon={<EditOutlined />}
                style={{ position: "absolute", top: 6, right: 6 }}
                onClick={() => setEditingAnswer(true)}
              />
            </div>
          )}
          <Button
            style={{ marginTop: 8 }}
            loading={aiAnalyzing}
            onClick={() => question && handleAiAnalyze(question.id)}
          >
            AI 分析
          </Button>
          <Form.Item name="correctAnswer" hidden><Input /></Form.Item>
        </Form.Item>
        <Form.Item label="AI 分析结果">
          <div className="answer-markdown-preview" style={{ minHeight: 64, padding: "10px 12px", border: "1px solid #d9d9d9", borderRadius: 6 }}>
            {analysis ? renderMarkdown(analysis) : <span style={{ color: "#bfbfbf" }}>点击 AI 分析后显示结果</span>}
          </div>
          <Form.Item name="analysis" hidden><Input /></Form.Item>
        </Form.Item>
        <Form.Item name="note" label="备注">
          <Input.TextArea rows={2} />
        </Form.Item>
      </Form>
    </Modal>
  );
}
