// 入口：根据登录态重定向（tab 首页或登录页）。

import { useEffect } from 'react';
import { useRouter } from 'expo-router';
import { isLoggedInSync } from '@/api/session';

export default function Index() {
  const router = useRouter();

  useEffect(() => {
    router.replace(isLoggedInSync() ? '/exam' : '/login');
  }, [router]);

  return null;
}
