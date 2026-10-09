/** 题目类型（PROJECT_SPEC.md §34）。 */

export type BBox = [number, number, number, number];

export type QuestionStatus =
  | "pending_review"
  | "confirmed"
  | "correcting"
  | "completed"
  | "failed";

/** AI 分析的结构化结果（取代旧的自由文本 + 前端正则拆分） */
export interface AnalysisResult {
  subject: string;
  answer: string;
  analysis: string;
  knowledgePoints: string[];
  outOfScope: boolean;
  confidence: "high" | "medium" | "low";
}

export interface Illustration {
  id: number;
  imageUrl: string;
  bbox: BBox;
  aiBbox: BBox;
  bboxSource: "ai" | "manual";
  type: string;
}

export interface Question {
  id: number;
  examId: number;
  parentId: number | null;
  questionNo: string;
  text: string;
  /** 识别阶段判断的科目（旧数据可能为空） */
  subject?: string;
  bbox: BBox;
  aiBbox: BBox;
  bboxSource: "ai" | "manual";
  confidence?: number;
  status: QuestionStatus;
  /** 最近一次 AI 分析（后端随分析持久化；与错题库的 analysis 相互独立） */
  lastAnalysis?: AnalysisResult | null;
  illustrations: Illustration[];
}

export interface WrongQuestionCreate {
  questionId: number;
  answer: string;
  correctAnswer: string;
  subject: string;
  analysis: string;
  knowledgePoints: string[];
  note: string;
  /** 题目已在错题库时须为 true 才覆盖；否则后端返回 409 */
  overwrite?: boolean;
}

export interface WrongQuestion {
  id: number;
  questionId: number;
  answer: string;
  correctAnswer: string;
  correctCount: number;
  wrongCount: number;
  subject: string;
  analysis: string;
  knowledgePoints: string[];
  image: string;
  /** 入库时按当前 bbox 裁剪的插图快照（/files 静态 URL，无需鉴权） */
  illustrationImages: string[];
  note: string;
  createdAt: string;
  /** 来源题目的识别内容（§28：保留文本与插图，而非上传图片） */
  questionNo: string;
  questionText: string;
  illustrations: Illustration[];
}
