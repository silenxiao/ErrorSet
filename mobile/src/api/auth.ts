// 登录/注册接口。登录态的存取见 ./session。

import { request, jsonInit } from './http';
import { saveSession } from './session';

export interface AuthUser {
  id: number;
  username: string;
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
  saveSession(body.token, body.user.username);
  return body.user;
}

export async function register(
  username: string,
  password: string,
): Promise<AuthUser> {
  const body = await request<TokenResponse>(
    '/api/v1/auth/register',
    jsonInit('POST', { username, password }),
  );
  saveSession(body.token, body.user.username);
  return body.user;
}
