// 登录态本地存储：SecureStore（安全存储）+ 内存缓存。
// 请求层需要同步取 token，而 SecureStore 是异步 API，
// 故 App 启动时调用 loadSession() 预热内存缓存。

import * as SecureStore from 'expo-secure-store';

export const TOKEN_KEY = 'errorset_token';
export const USERNAME_KEY = 'errorset_username';

let cachedToken: string | null = null;
let cachedUsername: string | null = null;

const unauthorizedListeners = new Set<() => void>();

/** 注册 401 回调（根布局用其跳转登录页），返回取消注册函数。 */
export function onUnauthorized(cb: () => void): () => void {
  unauthorizedListeners.add(cb);
  return () => {
    unauthorizedListeners.delete(cb);
  };
}

export function notifyUnauthorized() {
  unauthorizedListeners.forEach((cb) => cb());
}

/** App 启动时调用：从安全存储恢复登录态到内存。 */
export async function loadSession(): Promise<void> {
  try {
    cachedToken = await SecureStore.getItemAsync(TOKEN_KEY);
    cachedUsername = await SecureStore.getItemAsync(USERNAME_KEY);
  } catch {
    cachedToken = null;
    cachedUsername = null;
  }
}

export function getTokenSync(): string | null {
  return cachedToken;
}

export function getUsernameSync(): string | null {
  return cachedUsername;
}

export function isLoggedInSync(): boolean {
  return !!cachedToken;
}

export function saveSession(token: string, username: string): void {
  cachedToken = token;
  cachedUsername = username;
  void SecureStore.setItemAsync(TOKEN_KEY, token).catch(() => {});
  void SecureStore.setItemAsync(USERNAME_KEY, username).catch(() => {});
}

export function clearSession(): void {
  cachedToken = null;
  cachedUsername = null;
  void SecureStore.deleteItemAsync(TOKEN_KEY).catch(() => {});
  void SecureStore.deleteItemAsync(USERNAME_KEY).catch(() => {});
}
