import { useCallback, useEffect, useState } from "react";
import {
  Button,
  Descriptions,
  Divider,
  Image,
  Modal,
  Popconfirm,
  Space,
  Spin,
  Table,
  Tag,
  Typography,
  message,
} from "antd";

import {
  deleteWrongQuestion,
  getWrongQuestionDetail,
  listWrongQuestions,
} from "../../api/admin";
import type {
  AdminWrongQuestionDetail,
  AdminWrongQuestionRow,
} from "../../api/admin";
import { formatDate } from "../../utils/format";

/** 详情里的只读长文本块：保留换行，便于阅读 AI 分析等结构化输出 */
function Block({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        whiteSpace: "pre-wrap",
        wordBreak: "break-word",
        background: "#fafafa",
        border: "1px solid #f0f0f0",
        borderRadius: 8,
        padding: "8px 12px",
        maxHeight: 260,
        overflowY: "auto",
      }}
    >
      {children}
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <div style={{ fontWeight: 600, margin: "12px 0 6px" }}>{children}</div>;
}

export default function WrongQuestions() {
  const [rows, setRows] = useState<AdminWrongQuestionRow[]>([]);
  const [loading, setLoading] = useState(false);
  // 详情弹窗
  const [detailOpen, setDetailOpen] = useState(false);
  const [detail, setDetail] = useState<AdminWrongQuestionDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    listWrongQuestions()
      .then(setRows)
      .catch((e) => message.error(e instanceof Error ? e.message : "加载失败"))
      .finally(() => setLoading(false));
  }, []);

  useEffect(load, [load]);

  const openDetail = async (row: AdminWrongQuestionRow) => {
    setDetailOpen(true);
    setDetail(null);
    setDetailLoading(true);
    try {
      setDetail(await getWrongQuestionDetail(row.id));
    } catch (error) {
      message.error(error instanceof Error ? error.message : "加载详情失败");
      setDetailOpen(false);
    } finally {
      setDetailLoading(false);
    }
  };

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
    <>
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
              subject ? (
                <Tag color="blue">{subject}</Tag>
              ) : (
                <Typography.Text type="secondary">未设置</Typography.Text>
              ),
          },
          {
            title: "题干",
            dataIndex: "questionText",
            ellipsis: true,
            render: (text: string, row) => (
              <Typography.Link onClick={() => openDetail(row)}>
                {text || "（无题干）"}
              </Typography.Link>
            ),
          },
          { title: "所属用户", dataIndex: "username", width: 120 },
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
                <Button size="small" onClick={() => openDetail(row)}>
                  详情
                </Button>
                {row.imageUrl && (
                  <a href={row.imageUrl} target="_blank" rel="noreferrer">
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

      <Modal
        title="错题详情"
        open={detailOpen}
        onCancel={() => setDetailOpen(false)}
        footer={null}
        width={720}
      >
        <Spin spinning={detailLoading}>
          {detail && (
            <div>
              <Descriptions size="small" column={2} bordered>
                <Descriptions.Item label="错题 ID">{detail.id}</Descriptions.Item>
                <Descriptions.Item label="题号">
                  {detail.questionNo || "-"}
                </Descriptions.Item>
                <Descriptions.Item label="科目">
                  {detail.subject || "未设置"}
                </Descriptions.Item>
                <Descriptions.Item label="所属用户">
                  {detail.username}
                </Descriptions.Item>
                <Descriptions.Item label="加入时间" span={2}>
                  {formatDate(detail.createdAt)}
                </Descriptions.Item>
              </Descriptions>

              <SectionTitle>题目原文</SectionTitle>
              <Block>
                {detail.questionText || (
                  <Typography.Text type="secondary">
                    该错题未保存原文快照
                  </Typography.Text>
                )}
              </Block>

              {(detail.illustrationImages?.length ?? 0) > 0 && (
                <>
                  <SectionTitle>插图</SectionTitle>
                  <Space wrap>
                    {detail.illustrationImages.map((url) => (
                      <Image
                        key={url}
                        src={url}
                        alt="插图"
                        style={{ maxHeight: 160, width: "auto" }}
                      />
                    ))}
                  </Space>
                </>
              )}

              <SectionTitle>正确答案</SectionTitle>
              <Block>
                {detail.correctAnswer || (
                  <Typography.Text type="secondary">—</Typography.Text>
                )}
              </Block>

              <SectionTitle>AI 分析结果</SectionTitle>
              <Block>
                {detail.analysis || (
                  <Typography.Text type="secondary">—</Typography.Text>
                )}
              </Block>

              {(detail.knowledgePoints?.length ?? 0) > 0 && (
                <>
                  <SectionTitle>知识点</SectionTitle>
                  <Space wrap>
                    {detail.knowledgePoints.map((point) => (
                      <Tag key={point} color="blue">
                        {point}
                      </Tag>
                    ))}
                  </Space>
                </>
              )}

              {detail.note && (
                <>
                  <SectionTitle>备注</SectionTitle>
                  <Block>{detail.note}</Block>
                </>
              )}

              <Divider style={{ margin: "16px 0 0" }} />
            </div>
          )}
        </Spin>
      </Modal>
    </>
  );
}
