/** 展示工具：时间格式化与试卷状态映射。 */

export function formatDate(value: string | undefined | null): string {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("zh-CN", { hour12: false });
}

export const EXAM_STATUS: Record<string, { label: string; color: string }> = {
  uploaded: { label: "已上传", color: "default" },
  global_processing: { label: "整页识别中", color: "processing" },
  awaiting_review: { label: "待人工确认", color: "warning" },
  local_processing: { label: "二次识别中", color: "processing" },
  completed: { label: "已完成", color: "success" },
  failed: { label: "失败", color: "error" },
};

export function examStatusLabel(status: string): string {
  return EXAM_STATUS[status]?.label ?? status;
}

export function examStatusColor(status: string): string {
  return EXAM_STATUS[status]?.color ?? "default";
}

/** DB 存储的图片路径（如 data/originals/x.png）转 /files 静态 URL。 */
export function fileUrl(path: string): string {
  if (!path) return "";
  return `/files/${path.replace(/^data\//, "")}`;
}
