import { useCallback, useEffect, useState, type ReactNode } from "react";
import {
  Button,
  Card,
  Empty,
  Image,
  Modal,
  Popconfirm,
  Popover,
  Pagination,
  Select,
  Space,
  Spin,
  Tag,
  message,
} from "antd";

import {
  deleteWrongQuestion,
  getQuestion,
  listWrongQuestions,
  recordWrongResult,
  updateWrongQuestion,
} from "../../api/question";
import type { Question, WrongQuestion } from "../../types/question";
import { renderMathText } from "../../utils/math";
import { renderMarkdown } from "../../utils/markdown";

/** 常用科目，科目只能从中选择 */
const SUBJECT_OPTIONS = [
  "数学",
  "语文",
  "英语",
  "物理",
  "化学",
  "生物",
  "历史",
  "地理",
  "政治",
].map((name) => ({ value: name }));

/** 错题库页面（§27.3）：按试卷的题目卡片展示 + 详情浮窗。 */
export default function QuestionBankPage() {
  const [rows, setRows] = useState<WrongQuestion[]>([]);
  const [loading, setLoading] = useState(false);
  const [detail, setDetail] = useState<WrongQuestion | null>(null);
  const [page, setPage] = useState(1);
  /** 当前筛选科目，null 表示全部 */
  const [subjectFilter, setSubjectFilter] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      setRows(await listWrongQuestions());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const subjectCounts = new Map<string, number>();
  for (const row of rows) {
    const key = row.subject || "未设置";
    subjectCounts.set(key, (subjectCounts.get(key) ?? 0) + 1);
  }
  // 固定科目顺序在前（仅显示有试题的），九科之外的旧科目名排在最后
  const fixedNames = SUBJECT_OPTIONS.map((option) => option.value);
  const subjects = [
    ...fixedNames.filter((name) => subjectCounts.has(name)),
    ...[...subjectCounts.keys()].filter((name) => !fixedNames.includes(name)),
  ];

  // 筛选的科目被删光后自动回到"全部"
  useEffect(() => {
    if (subjectFilter !== null && !subjectCounts.has(subjectFilter)) {
      setSubjectFilter(null);
    }
  });

  const visibleRows =
    subjectFilter === null
      ? rows
      : rows.filter((row) => (row.subject || "未设置") === subjectFilter);

  const handleFilter = (subject: string | null) => {
    setSubjectFilter(subject);
    setPage(1);
  };

  const handleDelete = async (row: WrongQuestion) => {
    try {
      await deleteWrongQuestion(row.id);
      message.success("已删除");
      setDetail((current) => (current?.id === row.id ? null : current));
      void reload();
    } catch (err) {
      message.error(err instanceof Error ? err.message : "删除失败");
    }
  };

  const handleMark = async (row: WrongQuestion, result: "correct" | "wrong") => {
    try {
      const updated = await recordWrongResult(row.id, result);
      setRows((prev) => prev.map((r) => (r.id === updated.id ? updated : r)));
      message.success(result === "correct" ? "做对次数 +1" : "做错次数 +1");
    } catch (err) {
      message.error(err instanceof Error ? err.message : "记录失败");
    }
  };

  const handleSubject = async (row: WrongQuestion, subject: string) => {
    const updated = await updateWrongQuestion(row.id, { subject });
    setRows((prev) => prev.map((r) => (r.id === updated.id ? updated : r)));
    setDetail((current) => (current?.id === updated.id ? updated : current));
    message.success("科目已更新");
  };

  const currentRows = visibleRows.slice((page - 1) * 10, page * 10);

  return (
    <Card>
      <Spin spinning={loading}>
        {rows.length > 0 && (
          <Space size={4} wrap style={{ marginBottom: 12 }}>
            <Tag
              color={subjectFilter === null ? "blue" : "default"}
              style={{ cursor: "pointer" }}
              onClick={() => handleFilter(null)}
            >
              全部 {rows.length}
            </Tag>
            {subjects.map((subject) => (
              <Tag
                key={subject}
                color={subjectFilter === subject ? "blue" : "default"}
                style={{ cursor: "pointer" }}
                onClick={() =>
                  handleFilter(subjectFilter === subject ? null : subject)
                }
              >
                {subject} {subjectCounts.get(subject)}
              </Tag>
            ))}
          </Space>
        )}
        {rows.length === 0 && !loading ? (
          <Empty description="暂无错题" />
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {currentRows.map((row) => (
              <WrongQuestionItem
                key={row.id}
                row={row}
                onDetail={setDetail}
                onDelete={handleDelete}
                onMark={handleMark}
                onSubject={handleSubject}
              />
            ))}
          </div>
        )}
      </Spin>
      {visibleRows.length > 0 && (
        <Pagination
          style={{ marginTop: 16, textAlign: "right" }}
          current={page}
          pageSize={10}
          total={visibleRows.length}
          showTotal={(total) => `共 ${total} 道试题`}
          onChange={setPage}
        />
      )}
      <Modal
        title={`错题详情：第 ${detail?.questionNo ?? ""} 题`}
        open={detail !== null}
        onCancel={() => setDetail(null)}
        footer={null}
        width="85%"
        style={{ top: 40 }}
      >
        {detail && <DetailBody detail={detail} />}
      </Modal>
    </Card>
  );
}

/** 科目标签：点击弹出气泡编辑，支持常用科目联想与自由输入，清空即"未设置" */
function SubjectTag({
  subject,
  onSave,
}: {
  subject: string;
  onSave: (subject: string) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState(subject);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) setValue(subject);
  }, [open, subject]);

  const save = async () => {
    setSaving(true);
    try {
      await onSave(value.trim());
      setOpen(false);
    } catch (err) {
      message.error(err instanceof Error ? err.message : "保存失败");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Popover
      open={open}
      onOpenChange={setOpen}
      trigger="click"
      content={
        <Space.Compact>
          <Select
            options={SUBJECT_OPTIONS}
            value={value || undefined}
            onChange={(v) => setValue(v ?? "")}
            placeholder="选择科目（清除为未设置）"
            allowClear
            style={{ width: 180 }}
          />
          <Button type="primary" size="small" loading={saving} onClick={() => void save()}>
            保存
          </Button>
        </Space.Compact>
      }
    >
      <Tag color="blue" style={{ cursor: "pointer" }} title="点击编辑科目">
        {subject || "未设置"}
      </Tag>
    </Popover>
  );
}

function WrongQuestionItem({
  row,
  onDetail,
  onDelete,
  onMark,
  onSubject,
}: {
  row: WrongQuestion;
  onDetail: (row: WrongQuestion) => void;
  onDelete: (row: WrongQuestion) => void;
  onMark: (row: WrongQuestion, result: "correct" | "wrong") => void;
  onSubject: (row: WrongQuestion, subject: string) => Promise<void>;
}) {
  return (
    <div
      style={{
        padding: "8px 12px",
        border: "1px solid #f0f0f0",
        borderRadius: 8,
        background: "#fff",
      }}
    >
      <Space size={8} wrap style={{ marginBottom: 4 }}>
        <SubjectTag subject={row.subject} onSave={(v) => onSubject(row, v)} />
      </Space>
      <div style={{ whiteSpace: "pre-wrap" }}>{renderMathText(row.questionText)}</div>
      {(row.illustrations ?? []).length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 8 }}>
          {(row.illustrations ?? []).map((ill) => (
            <Image
              key={ill.id}
              src={`/api/v1/illustrations/${ill.id}/image`}
              alt={`插图（${ill.type}）`}
              style={{ width: "auto", maxWidth: "100%", borderRadius: 8 }}
            />
          ))}
        </div>
      )}
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
          <Button size="small" onClick={() => onDetail(row)}>
            详情
          </Button>
          <Popconfirm title="确定删除该错题？" onConfirm={() => onDelete(row)}>
            <Button size="small" danger>
              删除
            </Button>
          </Popconfirm>
          <Button
            size="small"
            title="做对了，做对次数 +1"
            aria-label="做对了"
            onClick={() => onMark(row, "correct")}
          >
            😀
          </Button>
          <Button
            size="small"
            title="做错了，做错次数 +1"
            aria-label="做错了"
            onClick={() => onMark(row, "wrong")}
          >
            😢
          </Button>
        </Space>
        <span style={{ color: "#8c8c8c", whiteSpace: "nowrap" }}>
          做对 {row.correctCount ?? 0} 次 · 做错 {row.wrongCount ?? 0} 次
        </span>
      </div>
    </div>
  );
}

/** 小程序详情页同款小节标题：灰色小字 */
function SectionTitle({ children }: { children: ReactNode }) {
  return (
    <div style={{ color: "#888", fontSize: 13, margin: "16px 0 4px" }}>{children}</div>
  );
}

function DetailBody({ detail }: { detail: WrongQuestion }) {
  const [question, setQuestion] = useState<Question | null>(null);
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setQuestion(null);
    setLoadError(false);
    getQuestion(detail.questionId)
      .then((q) => {
        if (!cancelled) setQuestion(q);
      })
      .catch(() => {
        if (!cancelled) setLoadError(true);
      });
    return () => {
      cancelled = true;
    };
  }, [detail.questionId, detail.id]);

  return (
    <div style={{ display: "flex", flexDirection: "column" }}>
      {loadError ? (
        <Card size="small">原题已被删除，仅剩错题记录信息</Card>
      ) : (
        <Card size="small">
          {question ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <div style={{ whiteSpace: "pre-wrap" }}>
                {renderMathText(question.text)}
              </div>
              {question.illustrations.map((ill) => (
                <Image
                  key={ill.id}
                  src={`/api/v1/illustrations/${ill.id}/image`}
                  alt={`插图（${ill.type}）`}
                  // width:auto 覆盖 antd 默认的 width:100% 拉伸，
                  // 保证按原始像素显示；超出浮窗宽度才缩小；点击查看原始大小
                  style={{ width: "auto", maxWidth: "100%", borderRadius: 8 }}
                />
              ))}
            </div>
          ) : (
            <span>加载中…</span>
          )}
        </Card>
      )}
      <SectionTitle>正确答案</SectionTitle>
      <div
        className="answer-markdown-preview"
        style={{ background: "#fafafa", border: "1px solid #f0f0f0", borderRadius: 6, padding: "8px 12px" }}
      >
        {renderMarkdown(detail.correctAnswer || "—")}
      </div>
      <SectionTitle>AI 分析结果</SectionTitle>
      <div
        className="answer-markdown-preview"
        style={{ background: "#fafafa", border: "1px solid #f0f0f0", borderRadius: 6, padding: "8px 12px" }}
      >
        {renderMarkdown(detail.analysis || "—")}
      </div>
      <SectionTitle>备注</SectionTitle>
      <div style={{ color: detail.note ? "#333" : "#bbb", whiteSpace: "pre-wrap" }}>
        {detail.note || "—"}
      </div>
    </div>
  );
}
