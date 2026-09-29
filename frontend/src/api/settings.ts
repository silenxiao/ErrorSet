import { jsonInit, request } from "./http";

/** 模型列表项。API Key 不回传，只告知是否已保存（hasApiKey）。
 *  scope: system=系统模型（后台下发，只读），private=独享模型。 */
export interface ModelProfile {
  id: number;
  name: string;
  provider: string;
  baseUrl: string;
  model: string;
  hasApiKey: boolean;
  enabled: boolean;
  scope: "system" | "private";
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

/** 连通性测试：发一次最小识别请求，检验模型配置是否可用。 */
export function testModel(
  id: number,
): Promise<{ ok: boolean; latencyMs?: number; error?: string }> {
  return request(`/api/v1/settings/models/${id}/test`, { method: "POST" });
}
