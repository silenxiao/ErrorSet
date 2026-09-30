/** 管理后台接口（/api/v1/admin）。 */

import { jsonInit, request } from "./http";

export interface AdminStats {
  userCount: number;
  examCount: number;
  questionCount: number;
  wrongQuestionCount: number;
}

export interface AdminUserRow {
  id: number;
  username: string;
  isAdmin: boolean;
  examCount: number;
  wrongQuestionCount: number;
  /** 累计调用系统模型的识别次数 */
  systemModelCalls: number;
  createdAt: string;
}

export interface AdminExamRow {
  id: number;
  name: string;
  status: string;
  username: string;
  questionCount: number;
  /** 原图 /files 静态 URL，空串表示无图 */
  imageUrl: string;
  createdAt: string;
}

export interface AdminWrongQuestionRow {
  id: number;
  username: string;
  subject: string;
  questionText: string;
  /** 题图快照 /files 静态 URL，空串表示无图 */
  imageUrl: string;
  createdAt: string;
}

/** 错题详情（点击题干弹出）。不含用户答案与错因：错题已不记录这两项。 */
export interface AdminWrongQuestionDetail extends AdminWrongQuestionRow {
  questionNo: string;
  correctAnswer: string;
  analysis: string;
  knowledgePoints: string[];
  note: string;
  /** 入库时裁剪的插图快照（/files 静态 URL 列表） */
  illustrationImages: string[];
}

export function getStats(): Promise<AdminStats> {
  return request<AdminStats>("/api/v1/admin/stats");
}

export function listUsers(): Promise<AdminUserRow[]> {
  return request<AdminUserRow[]>("/api/v1/admin/users");
}

export function updateUser(
  id: number,
  payload: { password?: string; isAdmin?: boolean },
): Promise<AdminUserRow> {
  return request<AdminUserRow>(
    `/api/v1/admin/users/${id}`,
    jsonInit("PATCH", payload),
  );
}

export function deleteUser(id: number): Promise<void> {
  return request<void>(`/api/v1/admin/users/${id}`, { method: "DELETE" });
}

export function listExams(): Promise<AdminExamRow[]> {
  return request<AdminExamRow[]>("/api/v1/admin/exams");
}

export function deleteExam(id: number): Promise<void> {
  return request<void>(`/api/v1/admin/exams/${id}`, { method: "DELETE" });
}

export function listWrongQuestions(): Promise<AdminWrongQuestionRow[]> {
  return request<AdminWrongQuestionRow[]>("/api/v1/admin/wrong-questions");
}

export function getWrongQuestionDetail(
  id: number,
): Promise<AdminWrongQuestionDetail> {
  return request<AdminWrongQuestionDetail>(`/api/v1/admin/wrong-questions/${id}`);
}

export function deleteWrongQuestion(id: number): Promise<void> {
  return request<void>(`/api/v1/admin/wrong-questions/${id}`, {
    method: "DELETE",
  });
}

export interface AdminFeedbackRow {
  id: number;
  username: string;
  content: string;
  createdAt: string;
}

export function listFeedbacks(): Promise<AdminFeedbackRow[]> {
  return request<AdminFeedbackRow[]>("/api/v1/admin/feedbacks");
}

export function deleteFeedback(id: number): Promise<void> {
  return request<void>(`/api/v1/admin/feedbacks/${id}`, { method: "DELETE" });
}

export interface AdminModelRow {
  id: number;
  name: string;
  provider: string;
  baseUrl: string;
  model: string;
  hasApiKey: boolean;
  enabled: boolean;
  isSystem: boolean;
  userId: number | null;
  username: string | null;
}

export interface AdminModelPayload {
  scope: "system" | "user";
  userId?: number;
  name: string;
  provider: string;
  baseUrl: string;
  model: string;
  apiKey: string;
  enabled: boolean;
}

export function listSystemModels(): Promise<AdminModelRow[]> {
  return request<AdminModelRow[]>("/api/v1/admin/models/system");
}

export function listUserModels(userId: number): Promise<AdminModelRow[]> {
  return request<AdminModelRow[]>(`/api/v1/admin/models/user/${userId}`);
}

export function createModel(payload: AdminModelPayload): Promise<AdminModelRow> {
  return request<AdminModelRow>("/api/v1/admin/models", jsonInit("POST", payload));
}

export function updateModel(
  id: number,
  payload: Omit<AdminModelPayload, "scope" | "userId" | "enabled"> & {
    enabled?: boolean;
  },
): Promise<AdminModelRow> {
  return request<AdminModelRow>(
    `/api/v1/admin/models/${id}`,
    jsonInit("PUT", payload),
  );
}

export function deleteModel(id: number): Promise<void> {
  return request<void>(`/api/v1/admin/models/${id}`, { method: "DELETE" });
}

export function testModel(
  id: number,
): Promise<{ ok: boolean; latencyMs?: number; error?: string }> {
  return request<{ ok: boolean; latencyMs?: number; error?: string }>(
    `/api/v1/admin/models/${id}/test`,
    { method: "POST" },
  );
}
