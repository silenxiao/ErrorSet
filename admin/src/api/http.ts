/** fetch 封装：自动注入管理员 token，401 清会话跳登录页（与主前端 http.ts 同模式）。 */

export class ApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

function authHeaders(): Record<string, string> {
  const token = localStorage.getItem("errorset_admin_token");
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const resp = await fetch(path, {
    ...init,
    headers: { ...authHeaders(), ...init?.headers },
  });
  if (!resp.ok) {
    if (resp.status === 401 && !path.startsWith("/api/v1/auth/login")) {
      localStorage.removeItem("errorset_admin_token");
      localStorage.removeItem("errorset_admin_user");
      window.location.assign("/login");
    }
    let detail = `HTTP ${resp.status}`;
    try {
      const body = await resp.json();
      if (Array.isArray(body?.detail)) {
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
