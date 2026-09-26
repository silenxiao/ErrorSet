/** 登录鉴权：token 与用户名的本地存储 + 认证接口。 */

import { request, jsonInit } from "./http";

export const TOKEN_KEY = "errorset_token";
export const USERNAME_KEY = "errorset_username";

export interface AuthUser {
  id: number;
  username: string;
}

interface TokenResponse {
  token: string;
  user: AuthUser;
}

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function getUsername(): string | null {
  return localStorage.getItem(USERNAME_KEY);
}

export function saveSession(token: string, username: string): void {
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(USERNAME_KEY, username);
}

export function clearSession(): void {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USERNAME_KEY);
}

export async function login(username: string, password: string): Promise<AuthUser> {
  const body = await request<TokenResponse>(
    "/api/v1/auth/login",
    jsonInit("POST", { username, password }),
  );
  saveSession(body.token, body.user.username);
  return body.user;
}

export async function register(username: string, password: string): Promise<AuthUser> {
  const body = await request<TokenResponse>(
    "/api/v1/auth/register",
    jsonInit("POST", { username, password }),
  );
  saveSession(body.token, body.user.username);
  return body.user;
}
