import { jsonInit, request } from "./http";
import { TOKEN_KEY } from "./auth";
import type {
  AnalysisResult,
  BBox,
  Question,
  WrongQuestion,
  WrongQuestionCreate,
} from "../types/question";

export function getQuestion(questionId: number): Promise<Question> {
  return request(`/api/v1/questions/${questionId}`);
}

/** 动态插图裁剪图 URL：<img> 标签带不上 Authorization 头，用 ?token= 回退。 */
export function illustrationSrc(illustrationId: number): string {
  const token = localStorage.getItem(TOKEN_KEY);
  const query = token ? `?token=${encodeURIComponent(token)}` : "";
  return `/api/v1/illustrations/${illustrationId}/image${query}`;
}

export function updateQuestion(
  questionId: number,
  fields: { text?: string },
): Promise<Question> {
  return request(`/api/v1/questions/${questionId}`, jsonInit("PATCH", fields));
}

export function updateBbox(questionId: number, bbox: BBox): Promise<Question> {
  return request(`/api/v1/questions/${questionId}/bbox`, jsonInit("PATCH", { bbox }));
}

export function resetBbox(questionId: number): Promise<Question> {
  return request(`/api/v1/questions/${questionId}/bbox/reset`, { method: "POST" });
}

export function updateIllustrationBbox(
  illustrationId: number,
  bbox: BBox,
): Promise<unknown> {
  return request(
    `/api/v1/illustrations/${illustrationId}/bbox`,
    jsonInit("PATCH", { bbox }),
  );
}

export function resetIllustrationBbox(illustrationId: number): Promise<unknown> {
  return request(`/api/v1/illustrations/${illustrationId}/bbox/reset`, {
    method: "POST",
  });
}

export function addWrongQuestion(payload: WrongQuestionCreate): Promise<WrongQuestion> {
  return request("/api/v1/wrong-questions", jsonInit("POST", payload));
}

export function listWrongQuestions(): Promise<WrongQuestion[]> {
  return request("/api/v1/wrong-questions");
}

export function getWrongQuestion(id: number): Promise<WrongQuestion> {
  return request(`/api/v1/wrong-questions/${id}`);
}

export function recordWrongResult(
  id: number,
  result: "correct" | "wrong",
): Promise<WrongQuestion> {
  return request(`/api/v1/wrong-questions/${id}/result`, jsonInit("POST", { result }));
}

export function updateWrongQuestion(
  id: number,
  fields: { subject?: string },
): Promise<WrongQuestion> {
  return request(`/api/v1/wrong-questions/${id}`, jsonInit("PATCH", fields));
}

/** AI 分析题目，返回结构化结果（科目/答案/分析/知识点/置信度）。 */
export function analyzeQuestion(questionId: number): Promise<AnalysisResult> {
  return request(`/api/v1/questions/${questionId}/analyze`);
}

export function deleteWrongQuestion(id: number): Promise<void> {
  return request(`/api/v1/wrong-questions/${id}`, { method: "DELETE" });
}

export function sortWrongQuestion(
  id: number,
  position: "top" | "bottom",
): Promise<WrongQuestion> {
  return request(`/api/v1/wrong-questions/${id}/sort`, jsonInit("POST", { position }));
}
