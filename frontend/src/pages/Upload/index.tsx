import { useCallback, useEffect, useState } from "react";
import { Alert, Button, Card, Grid, List, Modal, Popconfirm, Space, Table, Tag, message } from "antd";
import type { ColumnsType } from "antd/es/table";

import { deleteExam, listExams } from "../../api/exam";
import { STATUS_LABEL } from "../../constants/examStatus";
import RecognitionPage from "../Recognition";
import UploadPanel from "../../components/UploadPanel";
import type { ExamListItem, ExamStatus } from "../../types/exam";

/** 未到终态的状态：存在时列表需要轮询同步 */
const ACTIVE_STATUSES: ExamStatus[] = [
  "uploaded",
  "global_processing",
  "local_queued",
  "local_processing",
];
const POLL_INTERVAL_MS = 3000;

/** 上传页面（§27.1）：上传面板 + 历史试卷列表。 */
export default function UploadPage() {
  const screens = Grid.useBreakpoint();
  const [exams, setExams] = useState<ExamListItem[]>([]);
  const [loading, setLoading] = useState(false);
  /** 列表加载失败信息，null 表示正常 */
  const [loadError, setLoadError] = useState<string | null>(null);
  /** "打开"浮窗中展示的试卷 id，null 表示关闭 */
  const [openedExamId, setOpenedExamId] = useState<number | null>(null);

  const reload = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      setExams(await listExams());
      setLoadError(null);
    } catch (err) {
      // 轮询也会走到这里：不抛出，避免 unhandled rejection，并展示错误提示
      setLoadError(err instanceof Error ? err.message : "加载试卷列表失败");
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  // 有试卷处于识别流程中时轮询同步状态，全部到终态后停止
  useEffect(() => {
    const hasActive = exams.some((exam) =>
      ACTIVE_STATUSES.includes(exam.status),
    );
    if (!hasActive) return;
    const timer = setInterval(() => void reload(true), POLL_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [exams, reload]);

  const handleDelete = async (exam: ExamListItem) => {
    try {
      await deleteExam(exam.id);
      message.success("已删除");
      void reload();
    } catch (err) {
      message.error(err instanceof Error ? err.message : "删除失败");
    }
  };

  const columns: ColumnsType<ExamListItem> = [
    { title: "名称", dataIndex: "name", key: "name" },
    {
      title: "状态",
      dataIndex: "status",
      key: "status",
      render: (status: ExamStatus) => {
        const label = STATUS_LABEL[status];
        return <Tag color={label.color}>{label.text}</Tag>;
      },
    },
    { title: "题目数", dataIndex: "questionCount", key: "questionCount" },
    {
      title: "上传时间",
      dataIndex: "createdAt",
      key: "createdAt",
      render: (value: string) => new Date(value).toLocaleString("zh-CN"),
    },
    {
      title: "操作",
      key: "actions",
      render: (_, exam) => (
        <Space>
          <Button type="link" size="small" style={{ padding: 0 }} onClick={() => setOpenedExamId(exam.id)}>
            打开
          </Button>
          <PopconfirmDelete onConfirm={() => void handleDelete(exam)} />
        </Space>
      ),
    },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      <Card>
        <UploadPanel
          onUploaded={(exam) => setOpenedExamId(exam.id)}
        />
      </Card>
      <Card title="历史试卷" className="exam-history">
        {loadError !== null && (
          <Alert
            type="error"
            showIcon
            message="试卷列表加载失败"
            description={loadError}
            style={{ marginBottom: 16 }}
          />
        )}
        {screens.md ? <Table
          rowKey="id"
          loading={loading}
          dataSource={exams}
          columns={columns}
          pagination={{ pageSize: 10, showTotal: (total) => `共 ${total} 份试卷` }}
          scroll={{ x: 720 }}
        /> : <List
          loading={loading}
          dataSource={exams}
          locale={{ emptyText: "暂无历史试卷" }}
          pagination={{ pageSize: 10, size: "small", showSizeChanger: false, showTotal: (total) => `共 ${total} 份试卷` }}
          renderItem={(exam) => {
            const label = STATUS_LABEL[exam.status];
            return (
              <List.Item key={exam.id} className="exam-history-item">
                <div className="exam-history-main" onClick={() => setOpenedExamId(exam.id)}>
                  <div className="exam-history-name">{exam.name}</div>
                  <div className="exam-history-time">题目数 {exam.questionCount} · {new Date(exam.createdAt).toLocaleString("sv-SE").slice(0, 16)}</div>
                </div>
                <div className="exam-history-side">
                  <Tag color={label.color}>{label.text}</Tag>
                  <Space size={20}>
                  <Button type="link" size="small" style={{ padding: 0 }} onClick={() => setOpenedExamId(exam.id)}>打开</Button>
                  <PopconfirmDelete onConfirm={() => void handleDelete(exam)} />
                  </Space>
                </div>
              </List.Item>
            );
          }}
        />}
      </Card>
      <Modal
        className="exam-detail-modal"
        aria-label="试卷详情"
        open={openedExamId !== null}
        onCancel={() => {
          setOpenedExamId(null);
          void reload();
        }}
        footer={null}
        width="min(1360px, calc(100vw - 24px))"
        destroyOnClose
      >
        {/* 高度与滚动由 .exam-modal-body 控制（窄屏自动改为整体滚动） */}
        <div className="exam-modal-body">
          {openedExamId !== null && <RecognitionPage examId={openedExamId} />}
        </div>
      </Modal>
    </div>
  );
}

function PopconfirmDelete({ onConfirm }: { onConfirm: () => void }) {
  return (
    <Popconfirm title="确定删除该试卷？" onConfirm={onConfirm}>
      <Button type="link" size="small" danger style={{ padding: 0 }}>
        删除
      </Button>
    </Popconfirm>
  );
}
