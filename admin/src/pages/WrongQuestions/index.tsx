import { useCallback, useEffect, useState } from "react";
import { Button, Popconfirm, Space, Table, Tag, Typography, message } from "antd";

import { deleteWrongQuestion, listWrongQuestions } from "../../api/admin";
import type { AdminWrongQuestionRow } from "../../api/admin";
import { fileUrl, formatDate } from "../../utils/format";

export default function WrongQuestions() {
  const [rows, setRows] = useState<AdminWrongQuestionRow[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    listWrongQuestions()
      .then(setRows)
      .catch((e) => message.error(e instanceof Error ? e.message : "加载失败"))
      .finally(() => setLoading(false));
  }, []);

  useEffect(load, [load]);

  const handleDelete = async (row: AdminWrongQuestionRow) => {
    try {
      await deleteWrongQuestion(row.id);
      message.success("错题记录已删除");
      load();
    } catch (error) {
      message.error(error instanceof Error ? error.message : "删除失败");
    }
  };

  return (
    <Table<AdminWrongQuestionRow>
      rowKey="id"
      loading={loading}
      dataSource={rows}
      pagination={{ pageSize: 20, showTotal: (total) => `共 ${total} 道错题` }}
      columns={[
        { title: "ID", dataIndex: "id", width: 70 },
        {
          title: "科目",
          dataIndex: "subject",
          width: 90,
          render: (subject: string) =>
            subject ? <Tag color="blue">{subject}</Tag> : <Typography.Text type="secondary">未设置</Typography.Text>,
        },
        {
          title: "题干",
          dataIndex: "questionText",
          ellipsis: true,
          width: 260,
        },
        {
          title: "错因",
          dataIndex: "wrongReason",
          ellipsis: true,
        },
        { title: "所属用户", dataIndex: "username", width: 120 },
        {
          title: "来源试卷",
          dataIndex: "examName",
          ellipsis: true,
          width: 160,
        },
        {
          title: "加入时间",
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
              {row.image && (
                <a href={fileUrl(row.image)} target="_blank" rel="noreferrer">
                  查看快照
                </a>
              )}
              <Popconfirm
                title="删除错题"
                description="删除后不可恢复。"
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
