import { useCallback, useEffect, useState } from "react";
import { Button, Popconfirm, Space, Table, Tag, message } from "antd";

import { deleteExam, listExams } from "../../api/admin";
import type { AdminExamRow } from "../../api/admin";
import { examStatusColor, examStatusLabel, fileUrl, formatDate } from "../../utils/format";

export default function Exams() {
  const [rows, setRows] = useState<AdminExamRow[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    listExams()
      .then(setRows)
      .catch((e) => message.error(e instanceof Error ? e.message : "加载失败"))
      .finally(() => setLoading(false));
  }, []);

  useEffect(load, [load]);

  const handleDelete = async (row: AdminExamRow) => {
    try {
      await deleteExam(row.id);
      message.success("试卷及其关联数据已删除");
      load();
    } catch (error) {
      message.error(error instanceof Error ? error.message : "删除失败");
    }
  };

  return (
    <Table<AdminExamRow>
      rowKey="id"
      loading={loading}
      dataSource={rows}
      pagination={{ pageSize: 20, showTotal: (total) => `共 ${total} 份试卷` }}
      columns={[
        { title: "ID", dataIndex: "id", width: 70 },
        { title: "试卷名称", dataIndex: "name", ellipsis: true },
        { title: "所属用户", dataIndex: "username", width: 120 },
        {
          title: "状态",
          dataIndex: "status",
          width: 120,
          render: (status: string) => (
            <Tag color={examStatusColor(status)}>{examStatusLabel(status)}</Tag>
          ),
        },
        { title: "题目数", dataIndex: "questionCount", width: 90 },
        {
          title: "创建时间",
          dataIndex: "createdAt",
          width: 190,
          render: formatDate,
        },
        {
          title: "操作",
          key: "actions",
          width: 170,
          render: (_, row) => (
            <Space>
              {row.originalImage && (
                <a href={fileUrl(row.originalImage)} target="_blank" rel="noreferrer">
                  查看原图
                </a>
              )}
              <Popconfirm
                title="删除试卷"
                description="将同时删除题目、识别记录、错题与图片，不可恢复。"
                okText="删除"
                okButtonProps={{ danger: true }}
                onConfirm={() => handleDelete(row)}
              >
                <Button size="small" danger>
                  删除
                </Button>
              </Popconfirm>
            </Space>
          ),
        },
      ]}
    />
  );
}
