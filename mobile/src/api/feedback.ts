// 留言板接口。对齐 frontend/src/api/feedback.ts。

import { jsonInit, request } from './http';

export interface Feedback {
  id: number;
  content: string;
  createdAt: string;
}

export function createFeedback(content: string): Promise<Feedback> {
  return request('/api/v1/feedback', jsonInit('POST', { content }));
}

export function listMyFeedback(): Promise<Feedback[]> {
  return request('/api/v1/feedback/mine');
}
