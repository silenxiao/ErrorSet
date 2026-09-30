import { MessageOutlined, SendOutlined } from "@ant-design/icons";
import { Button, Card, Empty, Input, message } from "antd";
import { useCallback, useEffect, useState } from "react";

import { createFeedback, listMyFeedback } from "../../api/feedback";
import type { Feedback } from "../../api/feedback";

/** 留言板：提交留言 + 查看自己的留言历史（与「我的」页风格一致）。 */
export default function FeedbackPage() {
  const [content, setContent] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [rows, setRows] = useState<Feedback[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    listMyFeedback()
      .then(setRows)
      .catch((e) => message.error(e instanceof Error ? e.message : "加载失败"))
      .finally(() => setLoading(false));
  }, []);

  useEffect(load, [load]);

  const handleSubmit = async () => {
    if (!content.trim()) {
      message.warning("请填写留言内容");
      return;
    }
    setSubmitting(true);
    try {
      await createFeedback(content.trim());
      message.success("留言已提交，感谢您的反馈");
      setContent("");
      load();
    } catch (error) {
      message.error(error instanceof Error ? error.message : "提交失败");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div style={{ maxWidth: 720, margin: "0 auto" }}>
      <Card title={<><MessageOutlined /> 留言板</>}>
        <Input.TextArea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder="有问题或建议请留言，我们会认真查看每一条反馈"
          rows={5}
          maxLength={1000}
          showCount
        />
        <Button
          type="primary"
          icon={<SendOutlined />}
          loading={submitting}
          onClick={handleSubmit}
          style={{ marginTop: 12 }}
        >
          提交留言
        </Button>
      </Card>

      <Card title="我的留言" style={{ marginTop: 16 }} loading={loading}>
        {rows.length === 0 ? (
          <Empty description="还没有留言" image={Empty.PRESENTED_IMAGE_SIMPLE} />
        ) : (
          <div>
            {rows.map((row) => (
              <div
                key={row.id}
                style={{
                  padding: "12px 0",
                  borderBottom: "1px solid var(--divider)",
                }}
              >
                <div style={{ whiteSpace: "pre-wrap", color: "var(--text-1)" }}>
                  {row.content}
                </div>
                <div style={{ color: "var(--text-3)", fontSize: 12, marginTop: 4 }}>
                  {new Date(row.createdAt).toLocaleString("zh-CN")}
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
