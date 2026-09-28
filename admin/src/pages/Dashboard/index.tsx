import { useCallback, useEffect, useState } from "react";
import { Alert, Card, Col, Row, Statistic, Table, Typography } from "antd";

import { getStats, listUsers } from "../../api/admin";
import type { AdminStats, AdminUserRow } from "../../api/admin";
import { formatDate } from "../../utils/format";

export default function Dashboard() {
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [recentUsers, setRecentUsers] = useState<AdminUserRow[]>([]);
  const [error, setError] = useState("");

  const load = useCallback(() => {
    Promise.all([getStats(), listUsers()])
      .then(([statsBody, users]) => {
        setStats(statsBody);
        setRecentUsers([...users].reverse().slice(0, 5));
      })
      .catch((e) => setError(e instanceof Error ? e.message : "加载失败"));
  }, []);

  useEffect(load, [load]);

  return (
    <div>
      {error && (
        <Alert type="error" message={error} showIcon style={{ marginBottom: 16 }} />
      )}
      <Typography.Title level={4} style={{ marginTop: 0 }}>
        概览
      </Typography.Title>
      <Row gutter={16}>
        <Col span={6}>
          <Card loading={!stats}>
            <Statistic title="用户总数" value={stats?.userCount ?? 0} />
          </Card>
        </Col>
        <Col span={6}>
          <Card loading={!stats}>
            <Statistic title="试卷总数" value={stats?.examCount ?? 0} />
          </Card>
        </Col>
        <Col span={6}>
          <Card loading={!stats}>
            <Statistic title="题目总数" value={stats?.questionCount ?? 0} />
          </Card>
        </Col>
        <Col span={6}>
          <Card loading={!stats}>
            <Statistic title="错题总数" value={stats?.wrongQuestionCount ?? 0} />
          </Card>
        </Col>
      </Row>

      <Card title="最近注册的用户" style={{ marginTop: 24 }}>
        <Table<AdminUserRow>
          rowKey="id"
          size="small"
          pagination={false}
          dataSource={recentUsers}
          columns={[
            { title: "ID", dataIndex: "id", width: 80 },
            { title: "用户名", dataIndex: "username" },
            { title: "试卷数", dataIndex: "examCount", width: 100 },
            { title: "错题数", dataIndex: "wrongQuestionCount", width: 100 },
            {
              title: "注册时间",
              dataIndex: "createdAt",
              width: 200,
              render: formatDate,
            },
          ]}
        />
      </Card>
    </div>
  );
}
