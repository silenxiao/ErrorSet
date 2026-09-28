// Tab 框架：试卷 / 错题库 / 我的（对齐小程序 tabBar）。

import { Tabs } from 'expo-router';
import { Image, StyleSheet, type ColorValue, type ImageStyle } from 'react-native';
import { C } from '@/components/ui';

function tabIcon(source: ReturnType<typeof require>) {
  return ({ color }: { color: ColorValue }) => (
    <Image source={source} style={[styles.icon, { tintColor: color } as ImageStyle]} />
  );
}

const styles = StyleSheet.create({
  icon: {
    width: 24,
    height: 24,
  },
});

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: C.primary,
        tabBarInactiveTintColor: C.muted,
        sceneStyle: { backgroundColor: C.bg },
      }}
    >
      <Tabs.Screen
        name="exam"
        options={{
          title: '试卷',
          tabBarIcon: tabIcon(require('@/assets/icons/exam.png')),
        }}
      />
      <Tabs.Screen
        name="bank"
        options={{
          title: '错题库',
          tabBarIcon: tabIcon(require('@/assets/icons/bank.png')),
        }}
      />
      <Tabs.Screen
        name="mine"
        options={{
          title: '我的',
          tabBarIcon: tabIcon(require('@/assets/icons/mine.png')),
        }}
      />
    </Tabs>
  );
}
