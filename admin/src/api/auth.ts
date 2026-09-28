/** 管理端登录会话：与主前端使用不同 localStorage key，互不干扰。 */

import { jsonInit, request } from "./http";

const TOKEN_KEY = "errorset_admin_token";
const USER_KEY = "errorset_admin_user";

export interface AdminAuthUser {
  id: number;
  username: string;
  isAdmin: boolean;
}

interface TokenResponse {
  token: string;
  user: AdminAuthUser;
}

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function getCurrentUser(): AdminAuthUser | null {
  const raw = localStorage.getItem(USER_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as AdminAuthUser;
  } catch {
    return null;
  }
}

export function clearSession(): void {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
}

export async function login(
  username: string,
  password: string,
): Promise<AdminAuthUser> {
  const body = await request<TokenResponse>(
    "/api/v1/auth/login",
    jsonInit("POST", { username, password }),
  );
  localStorage.setItem(TOKEN_KEY, body.token);
  localStorage.setItem(USER_KEY, JSON.stringify(body.user));
  return body.user;
}

/** 当前登录用户（以服务端为准）。 */
export async function me(): Promise<AdminAuthUser> {
  return request<AdminAuthUser>("/api/v1/auth/me");
}
