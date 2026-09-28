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
  createdAt: string;
}

export interface AdminExamRow {
  id: number;
  name: string;
  status: string;
  username: string;
  questionCount: number;
  originalImage: string;
  createdAt: string;
}

export interface AdminWrongQuestionRow {
  id: number;
  username: string;
  examName: string;
  subject: string;
  questionText: string;
  wrongReason: string;
  image: string;
  createdAt: string;
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
