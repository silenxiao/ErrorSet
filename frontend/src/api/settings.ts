import { jsonInit, request } from "./http";

export interface ProviderSettings {
  provider: string;
  baseUrl: string;
  model: string;
  hasApiKey: boolean;
}

export interface ProviderSettingsUpdate {
  provider: string;
  baseUrl: string;
  model: string;
  apiKey: string;
}

export function getProviderSettings(): Promise<ProviderSettings> {
  return request("/api/v1/settings/provider");
}

export function updateProviderSettings(
  payload: ProviderSettingsUpdate,
): Promise<ProviderSettings> {
  return request("/api/v1/settings/provider", jsonInit("PUT", payload));
}
