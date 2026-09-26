/** 极简 fetch 封装：非 2xx 抛 ApiError（detail 优先）；自动注入 token，401 清登录态跳登录页。 */

export class ApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

function authHeaders(): Record<string, string> {
  const token = localStorage.getItem("errorset_token");
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const resp = await fetch(path, {
    ...init,
    headers: { ...authHeaders(), ...init?.headers },
  });
  if (!resp.ok) {
    // 登录/注册接口的 401/422 是正常业务反馈，不做强制跳转
    if (
      resp.status === 401 &&
      !path.startsWith("/api/v1/auth/login") &&
      !path.startsWith("/api/v1/auth/register")
    ) {
      localStorage.removeItem("errorset_token");
      localStorage.removeItem("errorset_username");
      window.location.assign("/login");
    }
    let detail = `HTTP ${resp.status}`;
    try {
      const body = await resp.json();
      if (Array.isArray(body?.detail)) {
        // FastAPI 校验错误：取每个字段的 msg
        detail = body.detail
          .map((item: { msg?: string }) => item?.msg ?? JSON.stringify(item))
          .join("; ");
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
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  };
}
