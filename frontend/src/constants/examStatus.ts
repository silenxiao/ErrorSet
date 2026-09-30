import type { ExamStatus } from "../types/exam";

/** 试卷状态展示文案与颜色（上传页/识别页共用，避免两处映射不一致） */
export const STATUS_LABEL: Record<ExamStatus, { text: string; color: string }> = {
  uploaded: { text: "排队中", color: "default" },
  global_processing: { text: "整页识别中…", color: "processing" },
  awaiting_review: { text: "待人工确认", color: "warning" },
  local_processing: { text: "二次识别中…", color: "processing" },
  completed: { text: "已完成", color: "success" },
  failed: { text: "失败", color: "error" },
};
