// 根布局：启动时恢复登录态；401 时全局跳转登录页；挂载全局 Toast。

import { useEffect, useState } from 'react';
import { Stack, useRouter } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { loadSession, onUnauthorized } from '@/api/session';
import { ToastHost } from '@/components/ui';

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const [ready, setReady] = useState(false);
  const router = useRouter();

  useEffect(() => {
    loadSession().finally(() => setReady(true));
  }, []);

  useEffect(() => {
    if (ready) SplashScreen.hideAsync().catch(() => {});
  }, [ready]);

  useEffect(() => {
    return onUnauthorized(() => {
      router.replace('/login');
    });
  }, [router]);

  if (!ready) return null;

  return (
    <>
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: '#f5f5f5' },
        }}
      >
        <Stack.Screen name="index" />
        <Stack.Screen name="login" />
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="recognition/[id]" />
        <Stack.Screen name="add-wrong/[questionId]" />
        <Stack.Screen name="models" />
        <Stack.Screen name="feedback" />
      </Stack>
      <ToastHost />
    </>
  );
}
