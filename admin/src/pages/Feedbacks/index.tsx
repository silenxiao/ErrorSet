import { useCallback, useEffect, useState } from "react";
import { Button, Popconfirm, Table, message } from "antd";

import { deleteFeedback, listFeedbacks } from "../../api/admin";
import type { AdminFeedbackRow } from "../../api/admin";
import { formatDate } from "../../utils/format";

export default function Feedbacks() {
  const [rows, setRows] = useState<AdminFeedbackRow[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    listFeedbacks()
      .then(setRows)
      .catch((e) => message.error(e instanceof Error ? e.message : "加载失败"))
      .finally(() => setLoading(false));
  }, []);

  useEffect(load, [load]);

  const handleDelete = async (row: AdminFeedbackRow) => {
    try {
      await deleteFeedback(row.id);
      message.success("留言已删除");
      load();
    } catch (error) {
      message.error(error instanceof Error ? error.message : "删除失败");
    }
  };

  return (
    <Table<AdminFeedbackRow>
      rowKey="id"
      loading={loading}
      dataSource={rows}
      pagination={{ pageSize: 20, showTotal: (total) => `共 ${total} 条留言` }}
      columns={[
        { title: "ID", dataIndex: "id", width: 70 },
        { title: "用户", dataIndex: "username", width: 120 },
        {
          title: "留言内容",
          dataIndex: "content",
          ellipsis: true,
        },
        {
          title: "提交时间",
          dataIndex: "createdAt",
          width: 190,
          render: formatDate,
        },
        {
          title: "操作",
          key: "actions",
          width: 90,
          render: (_, row) => (
            <Popconfirm
              title="删除留言"
              description="删除后不可恢复。"
              okText="删除"
              okButtonProps={{ danger: true }}
              onConfirm={() => handleDelete(row)}
            >
              <Button size="small" danger>
                删除
              </Button>
            </Popconfirm>
          ),
        },
      ]}
    />
  );
}
