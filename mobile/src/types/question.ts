/** 题目类型（PROJECT_SPEC.md §34）。 */

export type BBox = [number, number, number, number];

export type QuestionStatus =
  | "pending_review"
  | "confirmed"
  | "correcting"
  | "completed"
  | "failed";

export interface Illustration {
  id: number;
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
  illustrations: Illustration[];
}

export interface WrongQuestionCreate {
  questionId: number;
  answer: string;
  correctAnswer: string;
  subject: string;
  analysis: string;
  wrongReason: string;
  knowledgePoints: string[];
  note: string;
}

export interface WrongQuestion {
  id: number;
  questionId: number;
  examId: number;
  answer: string;
  correctAnswer: string;
  correctCount: number;
  wrongCount: number;
  subject: string;
  analysis: string;
  wrongReason: string;
  knowledgePoints: string[];
  image: string;
  note: string;
  createdAt: string;
  /** 来源题目的识别内容（§28：保留文本与插图，而非上传图片） */
  questionNo: string;
  questionText: string;
  illustrations: Illustration[];
}
