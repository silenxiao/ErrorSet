// 试卷接口。上传改用 RN FormData（{uri, name, type} 文件描述）。

import { request, jsonInit } from './http';
import type { ExamCreated, ExamDetail, ExamListItem } from '../types/exam';
import { absUrl } from './config';

export interface UploadFilePart {
  uri: string;
  name: string;
  type: string;
}

export function createExam(
  file: UploadFilePart,
  name: string,
  includeIllustrations: boolean = false,
  grade: string = "一年级",
): Promise<ExamCreated> {
  const form = new FormData();
  form.append("file", file as unknown as Blob);
  form.append("name", name);
  form.append("include_illustrations", String(includeIllustrations));
  form.append("grade", grade);
  return request("/api/v1/exams", { method: "POST", body: form });
}

export function listExams(): Promise<ExamListItem[]> {
  return request("/api/v1/exams");
}

export function getExam(examId: number): Promise<ExamDetail> {
  return request<ExamDetail>(`/api/v1/exams/${examId}`).then((ex) => {
    ex.imageUrl = absUrl(ex.imageUrl) || "";
    (ex.questions || []).forEach((q) => {
      if (q.aiBbox == null) q.aiBbox = q.bbox;
    });
    return ex;
  });
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
  return request(`/api/v1/exams/${examId}/re-recognize`, jsonInit("POST", body));
}

export function deleteExam(examId: number): Promise<void> {
  return request(`/api/v1/exams/${examId}`, { method: 'DELETE' });
}
