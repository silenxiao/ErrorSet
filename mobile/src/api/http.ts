// 极简 fetch 封装：非 2xx 抛 ApiError（detail 优先）；自动注入 token，
// 401 清登录态并通知根路由跳转登录页。移植自 frontend/src/api/http.ts。

import { BACKEND_BASE } from './config';
import { getTokenSync, clearSession, notifyUnauthorized } from './session';

export class ApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

// 登录/注册接口的 401/422 是正常业务反馈，不做强制跳转
function isAuthPath(path: string) {
  return (
    path.startsWith('/api/v1/auth/login') ||
    path.startsWith('/api/v1/auth/register')
  );
}

export async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let resp: Response;
  try {
    const token = getTokenSync();
    resp = await fetch(path.startsWith('http') ? path : BACKEND_BASE + path, {
      ...init,
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...init?.headers,
      },
    });
  } catch {
    throw new ApiError(0, '网络错误：无法连接后端，请检查服务地址');
  }
  if (!resp.ok) {
    if (resp.status === 401 && !isAuthPath(path)) {
      clearSession();
      notifyUnauthorized();
    }
    let detail = `HTTP ${resp.status}`;
    try {
      const body = await resp.json();
      if (Array.isArray(body?.detail)) {
        // FastAPI 校验错误：取每个字段的 msg
        detail = body.detail
          .map((item: { msg?: string }) => item?.msg ?? JSON.stringify(item))
          .join('; ');
      } else if (body?.detail) {
        detail = String(body.detail);
      }
    } catch {
      // 非 JSON 错误体，保留默认信息
    }
    throw new ApiError(resp.status, detail);
  }
  if (resp.status === 204) {
    return undefined as T;
  }
  return (await resp.json()) as T;
}

export function jsonInit(method: string, body: unknown): RequestInit {
  return {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  };
}
