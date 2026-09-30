// 我的 Tab：用户信息 + 模型管理入口 + 退出登录。对齐小程序 pages/mine。

import { useCallback, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { StatusBar } from 'expo-status-bar';
import { useFocusEffect, useRouter } from 'expo-router';
import { clearSession, getGradeSync, getUsernameSync } from '@/api/session';
import { getMe, updateGrade } from '@/api/auth';
import { GRADE_OPTIONS } from '@/utils/format';
import { Card, OptionPicker, Screen, confirm, showToast, C } from '@/components/ui';

export default function MineScreen() {
  const [username, setUsername] = useState('');
  const [grade, setGrade] = useState('');
  const router = useRouter();

  useFocusEffect(
    useCallback(() => {
      setUsername(getUsernameSync() || '未登录');
      setGrade(getGradeSync() || '');
      // 以服务端为准刷新本地缓存的年级
      getMe()
        .then((user) => setGrade(user.grade || '一年级'))
        .catch(() => {});
    }, []),
  );

  const changeGrade = async (value: string) => {
    setGrade(value);
    try {
      const user = await updateGrade(value);
      setGrade(user.grade || value);
      showToast('年级已更新，首次上传试卷将默认使用该年级');
    } catch (e) {
      showToast(e instanceof Error ? e.message : '保存失败');
    }
  };

  const logout = () => {
    confirm('退出登录', '确定退出当前账号吗？', () => {
      clearSession();
      router.replace('/login');
    }, '退出');
  };

  return (
    <Screen>
      {/* 页头为主蓝底：状态栏用浅色内容 */}
      <StatusBar style="light" />

      {/* 用户信息卡片：蓝色渐变 + 圆形头像 */}
      <Card style={styles.userCard}>
        <LinearGradient
          colors={[C.primary, C.primaryDark]}
          start={{ x: 0, y: 0.5 }}
          end={{ x: 1, y: 0.5 }}
          style={StyleSheet.absoluteFill}
        />
        <View style={styles.avatar}>
          <Text style={styles.avatarChar}>{username[0] || '?'}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.username}>{username}</Text>
          <Text style={styles.sub}>AI 错题本</Text>
        </View>
      </Card>

      <Card>
        <View style={[styles.menuItem, { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.border }]}>
          <Feather name="book-open" size={20} color={C.primary} />
          <View style={{ flex: 1, marginLeft: 10 }}>
            <Text style={styles.menuTitle}>年级</Text>
            <Text style={styles.menuSub}>首次上传试卷时默认使用该年级</Text>
          </View>
          <View style={styles.gradeBox}>
            <OptionPicker
              options={GRADE_OPTIONS}
              value={grade}
              onChange={(v) => void changeGrade(v)}
              placeholder="选择年级"
            />
          </View>
        </View>
        <TouchableOpacity
          activeOpacity={0.6}
          style={[styles.menuItem, { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.border }]}
          onPress={() => router.push('/models')}
        >
          <Feather name="settings" size={20} color={C.primary} />
          <View style={{ flex: 1, marginLeft: 10 }}>
            <Text style={styles.menuTitle}>模型管理</Text>
            <Text style={styles.menuSub}>配置识别使用的 AI 模型</Text>
          </View>
          <Feather name="chevron-right" size={18} color={C.text3} />
        </TouchableOpacity>
        <TouchableOpacity
          activeOpacity={0.6}
          style={styles.menuItem}
          onPress={() => router.push('/feedback')}
        >
          <Feather name="edit-3" size={20} color={C.primary} />
          <View style={{ flex: 1, marginLeft: 10 }}>
            <Text style={styles.menuTitle}>留言板</Text>
            <Text style={styles.menuSub}>有问题或建议向我们留言</Text>
          </View>
          <Feather name="chevron-right" size={18} color={C.text3} />
        </TouchableOpacity>
      </Card>

      {/* 退出登录：独立红色圆角大按钮 */}
      <TouchableOpacity activeOpacity={0.7} style={styles.logoutBtn} onPress={logout}>
        <Text style={styles.logoutText}>退出登录</Text>
      </TouchableOpacity>
    </Screen>
  );
}

const styles = StyleSheet.create({
  userCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 20,
    marginTop: 12,
    overflow: 'hidden',
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
    fontSize: 18,
    fontWeight: '600',
  },
  sub: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: 14,
    marginTop: 2,
  },
  // 设置单元格：高度 52px，带底部分割线
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 52,
  },
  menuTitle: {
    fontSize: 16,
    color: C.text,
    fontWeight: '500',
  },
  menuSub: {
    fontSize: 12,
    color: C.text3,
    marginTop: 2,
  },
  gradeBox: {
    width: 120,
  },
  logoutBtn: {
    marginTop: 12,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: C.danger,
    borderRadius: 10,
    backgroundColor: '#fff',
    marginHorizontal: 12,
  },
  logoutText: {
    color: C.danger,
    fontSize: 16,
    fontWeight: '500',
  },
});
