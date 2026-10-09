// 后端服务基础地址。
//
// 联调方式：
// 1) iOS 模拟器与本机共享网络，直接用 http://127.0.0.1:8000 即可。
// 2) Android 模拟器访问宿主机要用 http://10.0.2.2:8000。
// 3) 真机调试 / 日常使用时，改为 Mac 的局域网 IP，例如 http://192.168.1.100:8000
//    （Mac 上用 `ipconfig getifaddr en0` 查询），并确认后端已监听 0.0.0.0。
//
// 也可通过环境变量 EXPO_PUBLIC_BACKEND_BASE 覆盖，无需改代码。
const FALLBACK_BASE = 'http://127.0.0.1:8000';

export const BACKEND_BASE: string =
  (process.env.EXPO_PUBLIC_BACKEND_BASE || FALLBACK_BASE).replace(/\/+$/, '');

/** 相对路径（/files/... 等）拼接为完整 URL。 */
export function absUrl(p: string | null | undefined): string | null {
  if (!p) return p as null;
  if (p.startsWith('http')) return p;
  return BACKEND_BASE + p;
}
