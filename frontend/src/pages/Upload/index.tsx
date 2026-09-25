import { useCallback, useEffect, useState } from "react";
import { Card, Modal, Popconfirm, Space, Table, Tag, message } from "antd";
import type { ColumnsType } from "antd/es/table";

import { deleteExam, listExams } from "../../api/exam";
import RecognitionPage from "../Recognition";
import UploadPanel from "../../components/UploadPanel";
import type { ExamListItem, ExamStatus } from "../../types/exam";

const STATUS_LABEL: Record<ExamStatus, { text: string; color: string }> = {
  uploaded: { text: "已上传", color: "default" },
  global_processing: { text: "整页识别中", color: "processing" },
  awaiting_review: { text: "待人工确认", color: "gold" },
  local_processing: { text: "二次识别中", color: "processing" },
  completed: { text: "已完成", color: "success" },
  failed: { text: "失败", color: "error" },
};

/** 上传页面（§27.1）：上传面板 + 历史试卷列表。 */
export default function UploadPage() {
  const [exams, setExams] = useState<ExamListItem[]>([]);
  const [loading, setLoading] = useState(false);
  /** "打开"浮窗中展示的试卷 id，null 表示关闭 */
  const [openedExamId, setOpenedExamId] = useState<number | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      setExams(await listExams());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

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
          <a onClick={() => setOpenedExamId(exam.id)}>打开</a>
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
      <Card title="历史试卷">
        <Table
          rowKey="id"
          loading={loading}
          dataSource={exams}
          columns={columns}
          pagination={{ pageSize: 10 }}
        />
      </Card>
      <Modal
        title={
          exams.find((exam) => exam.id === openedExamId)?.name ??
          (openedExamId !== null ? `试卷 #${openedExamId}` : "")
        }
        open={openedExamId !== null}
        onCancel={() => {
          setOpenedExamId(null);
          void reload();
        }}
        footer={null}
        width="85%"
        style={{ top: 40 }}
        destroyOnClose
      >
        {openedExamId !== null && <RecognitionPage examId={openedExamId} />}
      </Modal>
    </div>
  );
}

function PopconfirmDelete({ onConfirm }: { onConfirm: () => void }) {
  return (
    <Popconfirm title="确定删除该试卷？" onConfirm={onConfirm}>
      <a style={{ color: "#ff4d4f" }}>删除</a>
    </Popconfirm>
  );
}
