import { EditOutlined, PlusOutlined } from "@ant-design/icons";
import {
  Button,
  Empty,
  Form,
  Image,
  Input,
  Modal,
  Select,
  Space,
  Tag,
  message,
} from "antd";
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";

import { addWrongQuestion, resetBbox, analyzeQuestion, illustrationSrc, updateQuestion } from "../../api/question";
import { ApiError } from "../../api/http";
import ModelSelector from "../ModelSelector";
import type { AnalysisResult, Question, QuestionStatus } from "../../types/question";
import { renderMathText } from "../../utils/math";
import { renderMarkdown } from "../../utils/markdown";

interface Props {
  questions: Question[];
  selectedId: number | null;
  onSelect: (questionId: number) => void;
  onChanged: () => void;
}

const STATUS_LABEL: Record<QuestionStatus, { text: string; color: string }> = {
  pending_review: { text: "待确认", color: "warning" },
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
  const [wrongTarget, setWrongTarget] = useState<{
    question: Question;
    /** 含父题继承的科目，用于弹窗默认值 */
    subject: string;
  } | null>(null);
  const [editTarget, setEditTarget] = useState<Question | null>(null);

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
    node.push(<QuestionItem key={q.id} question={q} depth={depth} {...{
      selectedId,
      onSelect,
      onAddWrong: (target: Question, targetSubject: string) =>
        setWrongTarget({ question: target, subject: targetSubject }),
      onEdit: setEditTarget,
      onReset: async () => {
        await resetBbox(q.id);
        message.success(`题目 ${q.questionNo} 的插图位置已重置`);
        onChanged();
      },
    }} />);
    childrenOf(q.id).forEach((child) => renderQuestion(child, depth + 1, node, subject));
    return node;
  };

  return (
    <>
      <div className="recognition-question-list">
        {roots.reduce<ReactNode[]>((acc, root) => renderQuestion(root, 0, acc), [])}
      </div>

      <WrongQuestionModal
        question={wrongTarget?.question ?? null}
        defaultSubject={wrongTarget?.subject ?? ""}
        onClose={() => setWrongTarget(null)}
        onSaved={() => {
          setWrongTarget(null);
          message.success("已加入错题库");
        }}
      />

      <EditQuestionModal
        question={editTarget}
        onClose={() => setEditTarget(null)}
        onSaved={() => {
          setEditTarget(null);
          onChanged();
        }}
      />
    </>
  );
}

function QuestionItem({
  question,
  depth,
  selectedId,
  onSelect,
  onAddWrong,
  onEdit,
  onReset,
}: {
  question: Question;
  depth: number;
  selectedId: number | null;
  onSelect: (id: number) => void;
  onAddWrong: (q: Question, subject: string) => void;
  onEdit: (q: Question) => void;
  onReset: () => void;
}) {
  const status = STATUS_LABEL[question.status];
  const suspicious =
    question.confidence !== undefined && question.confidence < 0.7;

  return (
    <div
      className={`recognition-question${selectedId === question.id ? " is-selected" : ""}`}
      role="group"
      aria-label={`第 ${question.questionNo} 题`}
      tabIndex={0}
      onClick={() => onSelect(question.id)}
      onKeyDown={(event) => {
        if (event.target === event.currentTarget && (event.key === "Enter" || event.key === " ")) {
          event.preventDefault();
          onSelect(question.id);
        }
      }}
      style={{ "--question-depth": Math.min(depth, 3) } as CSSProperties}
    >
      <div className="recognition-question-heading">
        <strong>第 {question.questionNo} 题</strong>
        <Space size={[4, 4]} wrap>
          <Tag color={status.color}>{status.text}</Tag>
          {question.bboxSource === "manual" && <Tag>已手动调整</Tag>}
          {suspicious && <Tag color="warning">可疑</Tag>}
          {question.illustrations.length > 0 && (
            <Tag color="purple">含插图 ×{question.illustrations.length}</Tag>
          )}
        </Space>
      </div>
      <div className="recognition-question-text">{renderMathText(question.text)}</div>
      <div className="recognition-question-actions">
        <Space size={[8, 8]} wrap>
          <Button
            size="small"
            icon={<PlusOutlined />}
            onClick={(e) => {
              e.stopPropagation();
              onAddWrong(question, question.subject ?? "");
            }}
          >
            加入错题库
          </Button>
          {question.illustrations.length > 0 && (
            <Button
              size="small"
              onClick={(e) => {
                e.stopPropagation();
                onReset();
              }}
            >
              重置插图位置
            </Button>
          )}
        </Space>
        {question.status === "completed" ? (
          <Button
            type="text"
            size="small"
            icon={<EditOutlined />}
            onClick={(event) => {
              event.stopPropagation();
              onSelect(question.id);
              onEdit(question);
            }}
          >
            编辑题目
          </Button>
        ) : <span className="recognition-question-hint">二次识别后可编辑</span>}
      </div>
    </div>
  );
}

function WrongQuestionModal({
  question,
  defaultSubject,
  onClose,
  onSaved,
}: {
  question: Question | null;
  /** 识别阶段判断的科目（小题继承父题），作为下拉默认值 */
  defaultSubject: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form] = Form.useForm();
  const analysis = Form.useWatch("analysis", form);
  const correctAnswer = Form.useWatch("correctAnswer", form);
  const [editingAnswer, setEditingAnswer] = useState(false);
  const [saving, setSaving] = useState(false);
  const [aiAnalyzing, setAiAnalyzing] = useState(false);
  /** 最近一次 AI 分析结果，知识点随表单一并入库 */
  const [aiResult, setAiResult] = useState<AnalysisResult | null>(null);
  /** 本会话内每道题最近一次分析结果：分析后未入库就关掉弹窗再打开时，
   * 接口里的 question.lastAnalysis 还是旧的，优先用内存里这份 */
  const analyzedRef = useRef<Map<number, AnalysisResult>>(new Map());

  // 每次换题打开时重置表单：destroyOnClose 只销毁 DOM，
  // form store 里上一次的 AI 分析结果会串到下一题
  const questionId = question?.id;
  useEffect(() => {
    if (questionId === undefined) return;
    form.resetFields();
    form.setFieldsValue({ subject: defaultSubject || "语文" });
    setEditingAnswer(false);
    setAiResult(null);
    // 该题分析过但还没入库时，回显最近一次 AI 分析结果（后端持久化；
    // 本会话刚分析过的以内存为准，接口数据可能还没刷新）
    const last = analyzedRef.current.get(questionId) ?? question?.lastAnalysis ?? null;
    if (last && (last.answer || last.analysis)) {
      const subjects = [
        "语文",
        "数学",
        "英语",
        "物理",
        "化学",
        "生物",
        "历史",
        "政治",
        "地理",
      ];
      setAiResult(last);
      form.setFieldsValue({
        ...(subjects.includes(last.subject) ? { subject: last.subject } : {}),
        correctAnswer: last.answer,
        analysis: last.analysis,
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [questionId, form, defaultSubject]);

  const handleAiAnalyze = async (questionId: number) => {
    setAiAnalyzing(true);
    try {
      const result = await analyzeQuestion(questionId);
      setAiResult(result);
      analyzedRef.current.set(questionId, result);
      const subjects = [
        "语文",
        "数学",
        "英语",
        "物理",
        "化学",
        "生物",
        "历史",
        "政治",
        "地理",
      ];
      form.setFieldsValue({
        // 模型返回的科目不在可选范围内时保留默认值
        ...(subjects.includes(result.subject) ? { subject: result.subject } : {}),
        correctAnswer: result.answer,
        analysis: result.analysis,
      });
    } catch (err) {
      message.error(err instanceof Error ? err.message : "AI 分析失败");
    } finally {
      setAiAnalyzing(false);
    }
  };

  const handleOk = async (overwrite = false) => {
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
        knowledgePoints: aiResult?.knowledgePoints ?? [],
        note: values.note ?? "",
        overwrite,
      });
      onSaved();
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        // 已在错题库：询问是否以本次填写的内容覆盖旧错题
        Modal.confirm({
          title: "该题已加入错题库",
          content: "是否以最新的解答覆盖以前的错题？",
          okText: "覆盖",
          cancelText: "取消",
          onOk: () => handleOk(true),
        });
      } else {
        message.error(err instanceof Error ? err.message : "加入错题库失败");
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      title={`加入错题库：第 ${question?.questionNo ?? ""} 题`}
      open={question !== null}
      onOk={() => void handleOk()}
      onCancel={onClose}
      confirmLoading={saving}
      destroyOnClose
      width="min(880px, 92vw)"
      style={{ top: 40 }}
    >
      <Form
        form={form}
        layout="vertical"
        // 默认填充识别阶段判断的科目；无识别结果时回退"语文"
        initialValues={{ subject: defaultSubject || "语文" }}
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
            <div className="answer-markdown-preview" style={{ position: "relative", minHeight: 64, padding: "10px 40px 10px 12px", border: "1px solid var(--divider)", borderRadius: 8 }}>
              {correctAnswer ? renderMarkdown(correctAnswer) : <span style={{ color: "var(--text-3)" }}>AI 分析后显示正确答案</span>}
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
          <Space style={{ marginTop: 8 }}>
            <Button loading={aiAnalyzing} onClick={() => question && handleAiAnalyze(question.id)}>
              AI 分析
            </Button>
            <ModelSelector />
          </Space>
          <Form.Item name="correctAnswer" hidden><Input /></Form.Item>
        </Form.Item>
        <Form.Item label="AI 分析结果">
          <div className="answer-markdown-preview" style={{ minHeight: 64, padding: "10px 12px", border: "1px solid var(--divider)", borderRadius: 8 }}>
            {analysis ? renderMarkdown(analysis) : <span style={{ color: "var(--text-3)" }}>点击 AI 分析后显示结果</span>}
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

/** 编辑题目浮窗：二次识别完成后点击题目打开，可修改题目文本 */
function EditQuestionModal({
  question,
  onClose,
  onSaved,
}: {
  question: Question | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [text, setText] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (question) {
      setText(question.text);
    }
  }, [question]);

  const save = async () => {
    if (!question) return;
    setSaving(true);
    try {
      await updateQuestion(question.id, { text: text.trim() });
      message.success("题目已更新");
      onSaved();
      onClose();
    } catch (err) {
      message.error(err instanceof Error ? err.message : "保存失败");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      title={`编辑题目：第 ${question?.questionNo ?? ""} 题`}
      open={question !== null}
      onOk={() => void save()}
      onCancel={onClose}
      okText="保存"
      confirmLoading={saving}
      width={640}
      style={{ top: 40 }}
    >
      {/* 弹窗内容固定高度，整体滚动（与小程序编辑弹窗一致）：
          编辑框/预览框高度随内容展开，不做各自内部滚动 */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 12,
          height: "calc(100vh - 240px)",
          overflowY: "auto",
        }}
      >
        <Input.TextArea
          value={text}
          onChange={(event) => setText(event.target.value)}
          autoSize={{ minRows: 3 }}
          // 防止被 flex 压缩回固定行数，保持随内容自动增高（超高由外层整体滚动）
          style={{ resize: "none", flexShrink: 0 }}
          placeholder="题目文本（数学公式用 $...$ 包裹）"
        />
        <div style={{ color: "var(--text-3)", flexShrink: 0 }}>预览：</div>
        <div
          style={{
            whiteSpace: "pre-wrap",
            border: "1px solid var(--divider)",
            borderRadius: 8,
            padding: "8px 12px",
            background: "var(--bg)",
          }}
        >
          {renderMathText(text)}
        </div>
        {(question?.illustrations ?? []).length > 0 && (
          <div style={{ flexShrink: 0 }}>
            <div style={{ color: "var(--text-3)", marginBottom: 4 }}>
              插图（{question?.illustrations.length} 张，按当前 bbox 裁剪）：
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {question?.illustrations.map((ill) => (
                <Image
                  key={ill.id}
                  src={illustrationSrc(ill.id)}
                  alt={`插图（${ill.type}）`}
                  style={{ width: "auto", maxWidth: "100%", borderRadius: 8 }}
                />
              ))}
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}
