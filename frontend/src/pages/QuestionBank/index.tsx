import { useCallback, useEffect, useState, type ReactNode } from "react";
import {
  DislikeOutlined,
  LikeOutlined,
  VerticalAlignBottomOutlined,
  VerticalAlignTopOutlined,
} from "@ant-design/icons";
import {
  Alert,
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
  illustrationSrc,
  listWrongQuestions,
  recordWrongResult,
  sortWrongQuestion,
  updateWrongQuestion,
} from "../../api/question";
import type { Question, WrongQuestion } from "../../types/question";
import { renderMarkdown, renderQuestionText } from "../../utils/markdown";

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
  /** 列表加载失败信息，null 表示正常 */
  const [loadError, setLoadError] = useState<string | null>(null);
  const [detail, setDetail] = useState<WrongQuestion | null>(null);
  const [page, setPage] = useState(1);
  /** 当前筛选科目，null 表示全部 */
  const [subjectFilter, setSubjectFilter] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      setRows(await listWrongQuestions());
      setLoadError(null);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "加载错题列表失败");
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
  }, [subjectFilter, rows]);

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
      // 详情浮窗开着时同步次数
      setDetail((current) => (current?.id === updated.id ? updated : current));
      message.success(result === "correct" ? "做对次数 +1" : "做错次数 +1");
    } catch (err) {
      message.error(err instanceof Error ? err.message : "记录失败");
    }
  };

  const handleSort = async (row: WrongQuestion, position: "top" | "bottom") => {
    try {
      await sortWrongQuestion(row.id, position);
      message.success(position === "top" ? "已置顶" : "已置底");
      void reload();
    } catch (err) {
      message.error(err instanceof Error ? err.message : "操作失败");
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
        {loadError !== null && (
          <Alert
            type="error"
            showIcon
            message="错题列表加载失败"
            description={loadError}
            style={{ marginBottom: 12 }}
          />
        )}
        {rows.length > 0 && (
          <Space size={8} wrap style={{ marginBottom: 16 }}>
            <button
              type="button"
              className={`filter-chip${subjectFilter === null ? " filter-chip-active" : ""}`}
              onClick={() => handleFilter(null)}
            >
              全部 {rows.length}
            </button>
            {subjects.map((subject) => (
              <button
                key={subject}
                type="button"
                className={`filter-chip${subjectFilter === subject ? " filter-chip-active" : ""}`}
                onClick={() =>
                  handleFilter(subjectFilter === subject ? null : subject)
                }
              >
                {subject} {subjectCounts.get(subject)}
              </button>
            ))}
          </Space>
        )}
        {rows.length === 0 && !loading ? (
          <Empty description="暂无错题" />
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {currentRows.map((row) => (
              <WrongQuestionItem
                key={row.id}
                row={row}
                onDetail={setDetail}
                onDelete={handleDelete}
                onMark={handleMark}
                onSubject={handleSubject}
                onSort={handleSort}
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
        title="错题详情"
        open={detail !== null}
        onCancel={() => setDetail(null)}
        footer={null}
        width="min(1080px, 92vw)"
        style={{ top: 40 }}
      >
        {detail && (
        <DetailBody detail={detail} onMark={handleMark} onDelete={handleDelete} />
      )}
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
  onSort,
}: {
  row: WrongQuestion;
  onDetail: (row: WrongQuestion) => void;
  onDelete: (row: WrongQuestion) => void;
  onMark: (row: WrongQuestion, result: "correct" | "wrong") => void;
  onSubject: (row: WrongQuestion, subject: string) => Promise<void>;
  onSort: (row: WrongQuestion, position: "top" | "bottom") => void;
}) {
  return (
    <div
      className="hover-lift"
      tabIndex={0}
      onClick={() => onDetail(row)}
      onKeyDown={(event) => {
        if (event.target === event.currentTarget && (event.key === "Enter" || event.key === " ")) {
          event.preventDefault();
          onDetail(row);
        }
      }}
      style={{
        cursor: "pointer",
        padding: 16,
        border: "1px solid var(--divider)",
        borderRadius: "var(--radius-card)",
        background: "var(--card)",
        boxShadow: "var(--shadow-card)",
      }}
    >
      <Space size={8} wrap style={{ marginBottom: 4 }} onClick={(event) => event.stopPropagation()}>
        <SubjectTag subject={row.subject} onSave={(v) => onSubject(row, v)} />
      </Space>
      <div style={{ whiteSpace: "pre-wrap" }}>{renderQuestionText(row.questionText)}</div>
      {(row.illustrationImages?.length ?? 0) > 0 || (row.illustrations ?? []).length > 0 ? (
        <div onClick={(event) => event.stopPropagation()} style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 8 }}>
          {/* 优先用入库时裁剪的快照（静态 /files，无需鉴权）；旧记录回退到动态裁剪接口 */}
          {(row.illustrationImages ?? []).map((url) => (
            <Image
              key={url}
              src={url}
              alt="插图"
              style={{ width: "auto", maxWidth: "100%", borderRadius: 8 }}
            />
          ))}
          {(row.illustrationImages?.length ?? 0) === 0 &&
            (row.illustrations ?? []).map((ill) => (
              <Image
                key={ill.id}
                src={illustrationSrc(ill)}
                alt={`插图（${ill.type}）`}
                style={{ width: "auto", maxWidth: "100%", borderRadius: 8 }}
              />
            ))}
        </div>
      ) : null}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 8,
          marginTop: 12,
          flexWrap: "wrap",
        }}
      >
        <Space size={8} wrap onClick={(event) => event.stopPropagation()}>
          <Button size="small" onClick={() => onDetail(row)}>
            详情
          </Button>
          <Button
            size="small"
            icon={<VerticalAlignTopOutlined />}
            title="放到列表最前面"
            onClick={() => onSort(row, "top")}
          >
            置顶
          </Button>
          <Button
            size="small"
            icon={<VerticalAlignBottomOutlined />}
            title="放到列表最后面"
            onClick={() => onSort(row, "bottom")}
          >
            置底
          </Button>
          <Popconfirm title="确定删除该错题？" onConfirm={() => onDelete(row)}>
            <Button size="small" danger>
              删除
            </Button>
          </Popconfirm>
          <Button
            size="small"
            icon={<LikeOutlined />}
            title="做对了，做对次数 +1"
            aria-label="做对了"
            onClick={() => onMark(row, "correct")}
          >
            做对
          </Button>
          <Button
            size="small"
            icon={<DislikeOutlined />}
            title="做错了，做错次数 +1"
            aria-label="做错了"
            onClick={() => onMark(row, "wrong")}
          >
            做错
          </Button>
        </Space>
        <span style={{ color: "var(--text-3)", whiteSpace: "nowrap" }}>
          做对 {row.correctCount ?? 0} 次 · 做错 {row.wrongCount ?? 0} 次
        </span>
      </div>
    </div>
  );
}

/** 详情小节标题：蓝色竖条 + 加粗深色文字，醒目区分各区块 */
function SectionTitle({ children }: { children: ReactNode }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        margin: "16px 0 6px",
        fontWeight: 600,
        fontSize: 14,
        color: "var(--text-1)",
      }}
    >
      <span style={{ width: 4, height: 14, borderRadius: 2, background: "var(--primary)" }} />
      {children}
    </div>
  );
}

function DetailBody({
  detail,
  onMark,
  onDelete,
}: {
  detail: WrongQuestion;
  onMark: (row: WrongQuestion, result: "correct" | "wrong") => void;
  onDelete: (row: WrongQuestion) => void;
}) {
  const [question, setQuestion] = useState<Question | null>(null);
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    // §28：入库快照齐全时原文与插图都已由列表接口带回，无需再拉实时题目，
    // 避免为每条错题详情多发一次注定用不上的请求
    if (detail.questionText) {
      setQuestion(null);
      setLoadError(false);
      return;
    }

    let cancelled = false;
    setQuestion(null);
    setLoadError(false);
    getQuestion(detail.questionId)
      .then((q) => {
        if (!cancelled) setQuestion(q);
      })
      .catch(() => {
        // 原题行随试卷删除时 404：文本/插图改用错题自带快照展示
        if (!cancelled) setLoadError(true);
      });
    return () => {
      cancelled = true;
    };
  }, [detail.questionId, detail.id]);

  // §28：入库时的文本快照优先——试卷/题目删除后原题仍完整可读；
  // 快照为空的旧记录回退到实时题目
  const originalText = detail.questionText || question?.text || "";

  return (
    <div style={{ display: "flex", flexDirection: "column" }}>
      <SectionTitle>题目原文</SectionTitle>
      <div
        className="answer-markdown-preview"
        style={{ background: "var(--bg)", border: "1px solid var(--divider)", borderRadius: 8, padding: "8px 12px" }}
      >
        {originalText ? (
          <div style={{ whiteSpace: "pre-wrap" }}>
            {renderQuestionText(originalText)}
          </div>
        ) : loadError ? (
          <span style={{ color: "var(--text-3)" }}>原题已删除，且该错题未保存原文快照</span>
        ) : (
          <span style={{ color: "var(--text-3)" }}>加载中…</span>
        )}
        {(detail.illustrationImages?.length ?? 0) > 0
          ? detail.illustrationImages.map((url) => (
              <Image
                key={url}
                src={url}
                alt="插图"
                // width:auto 覆盖 antd 默认的 width:100% 拉伸，
                // 保证按原始像素显示；超出浮窗宽度才缩小；点击查看原始大小
                style={{ width: "auto", maxWidth: "100%", borderRadius: 8 }}
              />
            ))
          : question
            ? question.illustrations.map((ill) => (
                <Image
                  key={ill.id}
                  src={illustrationSrc(ill)}
                  alt={`插图（${ill.type}）`}
                  // width:auto 覆盖 antd 默认的 width:100% 拉伸，
                  // 保证按原始像素显示；超出浮窗宽度才缩小；点击查看原始大小
                  style={{ width: "auto", maxWidth: "100%", borderRadius: 8 }}
                />
              ))
            : null}
      </div>
      <SectionTitle>正确答案</SectionTitle>
      <div
        className="answer-markdown-preview"
        style={{ background: "var(--bg)", border: "1px solid var(--divider)", borderRadius: 8, padding: "8px 12px" }}
      >
        {renderMarkdown(detail.correctAnswer || "—")}
      </div>
      <SectionTitle>AI 分析结果</SectionTitle>
      <div
        className="answer-markdown-preview"
        style={{ background: "var(--bg)", border: "1px solid var(--divider)", borderRadius: 8, padding: "8px 12px" }}
      >
        {renderMarkdown(detail.analysis || "—")}
      </div>
      {(detail.knowledgePoints?.length ?? 0) > 0 && (
        <>
          <SectionTitle>知识点</SectionTitle>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {detail.knowledgePoints.map((point) => (
              <Tag key={point} color="blue">
                {point}
              </Tag>
            ))}
          </div>
        </>
      )}
      <SectionTitle>备注</SectionTitle>
      <div style={{ color: detail.note ? "var(--text-1)" : "var(--text-3)", whiteSpace: "pre-wrap" }}>
        {detail.note || "—"}
      </div>
      <SectionTitle>打卡</SectionTitle>
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <Button icon={<LikeOutlined />} onClick={() => onMark(detail, "correct")}>
          做对
        </Button>
        <Button icon={<DislikeOutlined />} onClick={() => onMark(detail, "wrong")}>
          做错
        </Button>
        <Popconfirm title="确定删除该错题？" onConfirm={() => onDelete(detail)}>
          <Button danger>删除</Button>
        </Popconfirm>
        <span style={{ color: "var(--text-3)", marginLeft: "auto" }}>
          做对 {detail.correctCount ?? 0} 次 · 做错 {detail.wrongCount ?? 0} 次
        </span>
      </div>
    </div>
  );
}
