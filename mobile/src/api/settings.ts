// 模型管理接口。API Key 不回传，只告知是否已保存（hasApiKey）。
// 移植自 frontend/src/api/settings.ts。

import { jsonInit, request } from './http';

export interface ModelProfile {
  id: number;
  name: string;
  provider: string;
  baseUrl: string;
  model: string;
  hasApiKey: boolean;
  enabled: boolean;
  // system=系统模型（后台下发，只读），private=独享模型
  scope: 'system' | 'private';
}

export interface ModelProfilePayload {
  name: string;
  provider: string;
  baseUrl: string;
  model: string;
  apiKey: string;
  enabled?: boolean;
}

export function listModels(): Promise<ModelProfile[]> {
  return request('/api/v1/settings/models');
}

export function createModel(payload: ModelProfilePayload): Promise<ModelProfile> {
  return request('/api/v1/settings/models', jsonInit('POST', payload));
}

export function updateModel(
  id: number,
  payload: ModelProfilePayload,
): Promise<ModelProfile> {
  return request(`/api/v1/settings/models/${id}`, jsonInit('PUT', payload));
}

export function enableModel(id: number): Promise<ModelProfile> {
  return request(`/api/v1/settings/models/${id}/enable`, jsonInit('PUT', {}));
}

export function deleteModel(id: number): Promise<{ ok: boolean }> {
  return request(`/api/v1/settings/models/${id}`, { method: 'DELETE' });
}
