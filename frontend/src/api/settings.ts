import { jsonInit, request } from "./http";

/** 模型列表项。API Key 不回传，只告知是否已保存（hasApiKey）。 */
export interface ModelProfile {
  id: number;
  name: string;
  provider: string;
  baseUrl: string;
  model: string;
  hasApiKey: boolean;
  enabled: boolean;
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
  return request("/api/v1/settings/models");
}

export function createModel(payload: ModelProfilePayload): Promise<ModelProfile> {
  return request("/api/v1/settings/models", jsonInit("POST", payload));
}

export function updateModel(
  id: number,
  payload: ModelProfilePayload,
): Promise<ModelProfile> {
  return request(`/api/v1/settings/models/${id}`, jsonInit("PUT", payload));
}

export function enableModel(id: number): Promise<ModelProfile> {
  return request(`/api/v1/settings/models/${id}/enable`, jsonInit("PUT", {}));
}

export function deleteModel(id: number): Promise<{ ok: boolean }> {
  return request(`/api/v1/settings/models/${id}`, { method: "DELETE" });
}
