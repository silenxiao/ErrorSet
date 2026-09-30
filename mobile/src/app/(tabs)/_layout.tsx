// Tab 框架：试卷 / 错题库 / 我的。
// 页头：48px 主蓝底白字居中标题；底部 Tab 栏：56px 白底 + 顶部细分割线，Feather 线性图标。

import { Tabs } from 'expo-router';
import { Text, StyleSheet } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { C, font } from '@/components/ui';

const TAB_BAR_HEIGHT = 56;

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        // 页面顶部导航栏：48px、#165DFF 底、白色居中标题
        headerShown: true,
        headerStyle: { height: 48, backgroundColor: C.primary },
        headerTintColor: '#fff',
        headerTitleAlign: 'center',
        headerTitleStyle: { fontSize: font.title, fontWeight: '600' },
        // 底部 Tab 栏：56px、白底、顶部细分割线
        tabBarActiveTintColor: C.primary,
        tabBarInactiveTintColor: C.text3,
        tabBarStyle: {
          height: TAB_BAR_HEIGHT,
          backgroundColor: '#fff',
          borderTopColor: C.border,
          borderTopWidth: StyleSheet.hairlineWidth,
          elevation: 0,
          shadowOpacity: 0,
        },
        sceneStyle: { backgroundColor: C.bg },
      }}
    >
      <Tabs.Screen
        name="exam"
        options={{
          title: '试卷上传',
          tabBarLabel: ({ color, focused }) => (
            <Text style={[styles.tabLabel, { color, fontWeight: focused ? '600' : '400' }]}>试卷</Text>
          ),
          tabBarIcon: ({ color }) => <Feather name="upload" size={22} color={color} />,
        }}
      />
      <Tabs.Screen
        name="bank"
        options={{
          title: '错题库',
          tabBarLabel: ({ color, focused }) => (
            <Text style={[styles.tabLabel, { color, fontWeight: focused ? '600' : '400' }]}>错题库</Text>
          ),
          tabBarIcon: ({ color }) => <Feather name="book-open" size={22} color={color} />,
        }}
      />
      <Tabs.Screen
        name="mine"
        options={{
          title: '我的',
          tabBarLabel: ({ color, focused }) => (
            <Text style={[styles.tabLabel, { color, fontWeight: focused ? '600' : '400' }]}>我的</Text>
          ),
          tabBarIcon: ({ color }) => <Feather name="user" size={22} color={color} />,
        }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  tabLabel: {
    fontSize: font.tab,
  },
});
