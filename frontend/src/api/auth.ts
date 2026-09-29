/** 登录鉴权：token/用户名/年级的本地存储 + 认证接口。 */

import { request, jsonInit } from "./http";

export const TOKEN_KEY = "errorset_token";
export const USERNAME_KEY = "errorset_username";
export const GRADE_KEY = "errorset_grade";

export interface AuthUser {
  id: number;
  username: string;
  grade: string;
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

export function getStoredGrade(): string | null {
  return localStorage.getItem(GRADE_KEY);
}

function persistUser(user: AuthUser): void {
  localStorage.setItem(USERNAME_KEY, user.username);
  localStorage.setItem(GRADE_KEY, user.grade);
}

export function saveSession(user: AuthUser, token: string): void {
  localStorage.setItem(TOKEN_KEY, token);
  persistUser(user);
}

export function clearSession(): void {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USERNAME_KEY);
  localStorage.removeItem(GRADE_KEY);
}

export async function login(username: string, password: string): Promise<AuthUser> {
  const body = await request<TokenResponse>(
    "/api/v1/auth/login",
    jsonInit("POST", { username, password }),
  );
  saveSession(body.user, body.token);
  return body.user;
}

export async function register(
  username: string,
  password: string,
  grade: string,
): Promise<AuthUser> {
  const body = await request<TokenResponse>(
    "/api/v1/auth/register",
    jsonInit("POST", { username, password, grade }),
  );
  saveSession(body.user, body.token);
  return body.user;
}

export async function getMe(): Promise<AuthUser> {
  const user = await request<AuthUser>("/api/v1/auth/me");
  persistUser(user);
  return user;
}

export async function updateGrade(grade: string): Promise<AuthUser> {
  const user = await request<AuthUser>("/api/v1/auth/me", jsonInit("PUT", { grade }));
  persistUser(user);
  return user;
}
