// 我的 Tab：用户信息 + 模型管理入口 + 退出登录。对齐小程序 pages/mine。

import { useCallback, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { clearSession, getUsernameSync } from '@/api/session';
import { Card, Screen, confirm, C } from '@/components/ui';

export default function MineScreen() {
  const [username, setUsername] = useState('');
  const router = useRouter();
  const insets = useSafeAreaInsets();

  useFocusEffect(
    useCallback(() => {
      setUsername(getUsernameSync() || '未登录');
    }, []),
  );

  const logout = () => {
    confirm('退出登录', '确定退出当前账号吗？', () => {
      clearSession();
      router.replace('/login');
    }, '退出');
  };

  return (
    <Screen>
      <View style={[styles.userCard, { paddingTop: insets.top + 20 }]}>
        <View style={styles.avatar}>
          <Text style={styles.avatarChar}>{username[0] || '?'}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.username}>{username}</Text>
          <Text style={styles.sub}>AI 错题本</Text>
        </View>
      </View>

      <Card style={{ marginTop: 10 }}>
        <TouchableOpacity
          activeOpacity={0.6}
          style={styles.menuItem}
          onPress={() => router.push('/models')}
        >
          <Text style={{ fontSize: 20 }}>⚙️</Text>
          <View style={{ flex: 1, marginLeft: 10 }}>
            <Text style={styles.menuTitle}>模型管理</Text>
            <Text style={styles.menuSub}>配置识别使用的 AI 模型</Text>
          </View>
          <Text style={styles.menuArrow}>›</Text>
        </TouchableOpacity>
        <TouchableOpacity
          activeOpacity={0.6}
          style={styles.menuItem}
          onPress={() => router.push('/feedback')}
        >
          <Text style={{ fontSize: 20 }}>📝</Text>
          <View style={{ flex: 1, marginLeft: 10 }}>
            <Text style={styles.menuTitle}>留言板</Text>
            <Text style={styles.menuSub}>有问题或建议向我们留言</Text>
          </View>
          <Text style={styles.menuArrow}>›</Text>
        </TouchableOpacity>
      </Card>

      <Card>
        <TouchableOpacity activeOpacity={0.7} style={styles.logoutBtn} onPress={logout}>
          <Text style={styles.logoutText}>退出登录</Text>
        </TouchableOpacity>
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  userCard: {
    backgroundColor: C.primary,
    flexDirection: 'row',
    alignItems: 'center',
    padding: 20,
    paddingTop: 28,
  },
  avatar: {
    width: 54,
    height: 54,
    borderRadius: 27,
    backgroundColor: 'rgba(255,255,255,0.25)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  avatarChar: {
    color: '#fff',
    fontSize: 24,
    fontWeight: '600',
  },
  username: {
    color: '#fff',
    fontSize: 17,
    fontWeight: '600',
  },
  sub: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: 12,
    marginTop: 2,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
  },
  menuTitle: {
    fontSize: 15,
    color: C.textStrong,
    fontWeight: '500',
  },
  menuSub: {
    fontSize: 12,
    color: C.muted,
    marginTop: 2,
  },
  menuArrow: {
    fontSize: 20,
    color: C.muted,
  },
  logoutBtn: {
    alignItems: 'center',
    paddingVertical: 12,
  },
  logoutText: {
    color: C.danger,
    fontSize: 15,
    fontWeight: '500',
  },
});
