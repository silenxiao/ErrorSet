/** 试卷类型（PROJECT_SPEC.md §25/§26）。 */

export type ExamStatus =
  | "uploaded"
  | "global_processing"
  | "awaiting_review"
  | "local_queued"
  | "local_processing"
  | "completed"
  | "failed";

export interface ExamCreated {
  id: number;
  status: ExamStatus;
}

export interface ExamListItem {
  id: number;
  name: string;
  status: ExamStatus;
  createdAt: string;
  questionCount: number;
}

export interface ExamDetail {
  id: number;
  name: string;
  status: ExamStatus;
  createdAt: string;
  imageUrl: string;
  includeIllustrations: boolean;
  grade: string;
  /** 重新识别时的用户补充提示词，拼入识别提示词 */
  extraPrompt?: string | null;
  /** 识别失败原因（status=failed 时非空，如模型超时/网络错误） */
  errorMessage?: string;
  questions: import("./question").Question[];
}
