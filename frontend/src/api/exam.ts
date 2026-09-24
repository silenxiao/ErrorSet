import { jsonInit, request } from "./http";
import type { ExamCreated, ExamDetail, ExamListItem } from "../types/exam";

export function createExam(
  file: File,
  name: string,
  includeIllustrations: boolean = true,
  grade: string = "一年级",
): Promise<ExamCreated> {
  const form = new FormData();
  form.append("file", file);
  form.append("name", name);
  form.append("include_illustrations", String(includeIllustrations));
  form.append("grade", grade);
  return request("/api/v1/exams", { method: "POST", body: form });
}

export function listExams(): Promise<ExamListItem[]> {
  return request("/api/v1/exams");
}

export function getExam(examId: number): Promise<ExamDetail> {
  return request(`/api/v1/exams/${examId}`);
}

export function confirmExam(examId: number): Promise<ExamCreated> {
  return request(`/api/v1/exams/${examId}/confirm`, { method: "POST" });
}

export function reRecognizeExam(
  examId: number,
  options?: { includeIllustrations?: boolean; extraPrompt?: string },
): Promise<ExamCreated> {
  const body: { includeIllustrations?: boolean; extraPrompt?: string } = {};
  if (options?.includeIllustrations !== undefined) {
    body.includeIllustrations = options.includeIllustrations;
  }
  if (options?.extraPrompt !== undefined) {
    body.extraPrompt = options.extraPrompt;
  }
  return request(`/api/v1/exams/${examId}/re-recognize`, {
    ...jsonInit("POST", body),
  });
}

export function deleteExam(examId: number): Promise<void> {
  return request(`/api/v1/exams/${examId}`, { method: "DELETE" });
}
