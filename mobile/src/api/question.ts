// 题目与错题接口。移植自 frontend/src/api/question.ts。

import { jsonInit, request } from './http';
import type { BBox, Question, WrongQuestion, WrongQuestionCreate } from '../types/question';
import { BACKEND_BASE } from './config';

export function getQuestion(questionId: number): Promise<Question> {
  return request(`/api/v1/questions/${questionId}`);
}

export function updateQuestion(
  questionId: number,
  fields: { text?: string },
): Promise<Question> {
  return request(`/api/v1/questions/${questionId}`, jsonInit('PATCH', fields));
}

export function updateBbox(questionId: number, bbox: BBox): Promise<Question> {
  return request(`/api/v1/questions/${questionId}/bbox`, jsonInit('PATCH', { bbox }));
}

export function resetBbox(questionId: number): Promise<Question> {
  return request(`/api/v1/questions/${questionId}/bbox/reset`, { method: 'POST' });
}

export function addWrongQuestion(payload: WrongQuestionCreate): Promise<WrongQuestion> {
  return request('/api/v1/wrong-questions', jsonInit('POST', payload));
}

export function listWrongQuestions(): Promise<WrongQuestion[]> {
  return request('/api/v1/wrong-questions');
}

export function getWrongQuestion(id: number): Promise<WrongQuestion> {
  return request(`/api/v1/wrong-questions/${id}`);
}

export function recordWrongResult(
  id: number,
  result: 'correct' | 'wrong',
): Promise<WrongQuestion> {
  return request(`/api/v1/wrong-questions/${id}/result`, jsonInit('POST', { result }));
}

export function updateWrongQuestion(
  id: number,
  fields: { subject?: string },
): Promise<WrongQuestion> {
  return request(`/api/v1/wrong-questions/${id}`, jsonInit('PATCH', fields));
}

export function analyzeQuestion(questionId: number): Promise<string> {
  return request(`/api/v1/questions/${questionId}/analyze`);
}

export function deleteWrongQuestion(id: number): Promise<void> {
  return request(`/api/v1/wrong-questions/${id}`, { method: 'DELETE' });
}

export function sortWrongQuestion(
  id: number,
  position: 'top' | 'bottom',
): Promise<WrongQuestion> {
  return request(`/api/v1/wrong-questions/${id}/sort`, jsonInit('POST', { position }));
}

/** 插图裁剪图地址（按当前 bbox 裁剪）。 */
export function illustrationImageUrl(id: number): string {
  return `${BACKEND_BASE}/api/v1/illustrations/${id}/image`;
}
