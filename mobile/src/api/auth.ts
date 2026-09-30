// 登录/注册接口。登录态的存取见 ./session。

import { request, jsonInit } from './http';
import { saveSession, setGradeLocal } from './session';

export interface AuthUser {
  id: number;
  username: string;
  grade: string;
}

interface TokenResponse {
  token: string;
  user: AuthUser;
}

export async function login(
  username: string,
  password: string,
): Promise<AuthUser> {
  const body = await request<TokenResponse>(
    '/api/v1/auth/login',
    jsonInit('POST', { username, password }),
  );
  saveSession(body.token, body.user.username, body.user.grade);
  return body.user;
}

export async function register(
  username: string,
  password: string,
  grade: string,
): Promise<AuthUser> {
  const body = await request<TokenResponse>(
    '/api/v1/auth/register',
    jsonInit('POST', { username, password, grade }),
  );
  saveSession(body.token, body.user.username, body.user.grade);
  return body.user;
}

export async function getMe(): Promise<AuthUser> {
  const user = await request<AuthUser>('/api/v1/auth/me');
  setGradeLocal(user.grade);
  return user;
}

export async function updateGrade(grade: string): Promise<AuthUser> {
  const user = await request<AuthUser>('/api/v1/auth/me', jsonInit('PUT', { grade }));
  setGradeLocal(user.grade);
  return user;
}

/** 修改密码。成功后后端不会让旧 token 失效，由调用方决定是否退出重登。 */
export async function updatePassword(
  oldPassword: string,
  newPassword: string,
  confirmPassword: string,
): Promise<void> {
  await request<{ ok: boolean }>(
    '/api/v1/auth/me/password',
    jsonInit('PUT', { oldPassword, newPassword, confirmPassword }),
  );
}
