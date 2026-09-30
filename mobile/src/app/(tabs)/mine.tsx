// 我的 Tab：用户信息 + 模型管理入口 + 退出登录。对齐小程序 pages/mine。

import { useCallback, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { StatusBar } from 'expo-status-bar';
import { useFocusEffect, useRouter } from 'expo-router';
import { clearSession, getGradeSync, getUsernameSync } from '@/api/session';
import { getMe, updateGrade, updatePassword } from '@/api/auth';
import { GRADE_OPTIONS } from '@/utils/format';
import {
  Btn,
  Card,
  Field,
  Input,
  Mask,
  OptionPicker,
  Screen,
  confirm,
  showToast,
  C,
} from '@/components/ui';

export default function MineScreen() {
  const [username, setUsername] = useState('');
  const [grade, setGrade] = useState('');
  const [pwdOpen, setPwdOpen] = useState(false);
  const [pwdSaving, setPwdSaving] = useState(false);
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
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

  const openPwd = () => {
    setOldPassword('');
    setNewPassword('');
    setConfirmPassword('');
    setPwdSaving(false);
    setPwdOpen(true);
  };

  const submitPwd = async () => {
    if (pwdSaving) return;
    if (!oldPassword) {
      showToast('请输入原密码');
      return;
    }
    if (newPassword.length < 6) {
      showToast('新密码至少 6 位');
      return;
    }
    if (newPassword !== confirmPassword) {
      showToast('两次输入的新密码不一致');
      return;
    }
    setPwdSaving(true);
    try {
      await updatePassword(oldPassword, newPassword, confirmPassword);
      setPwdOpen(false);
      // 后端旧 token 仍有效，但改密后要求重新登录更符合用户预期
      confirm('密码已修改', '请使用新密码重新登录', () => {
        clearSession();
        router.replace('/login');
      }, '去登录');
    } catch (e) {
      showToast(e instanceof Error ? e.message : '修改失败');
    } finally {
      setPwdSaving(false);
    }
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
        <TouchableOpacity activeOpacity={0.6} style={styles.menuItem} onPress={openPwd}>
          <Feather name="lock" size={20} color={C.primary} />
          <View style={{ flex: 1, marginLeft: 10 }}>
            <Text style={styles.menuTitle}>修改密码</Text>
            <Text style={styles.menuSub}>修改后需用新密码重新登录</Text>
          </View>
          <Feather name="chevron-right" size={18} color={C.text3} />
        </TouchableOpacity>
      </Card>

      {/* 退出登录：独立红色圆角大按钮 */}
      <TouchableOpacity activeOpacity={0.7} style={styles.logoutBtn} onPress={logout}>
        <Text style={styles.logoutText}>退出登录</Text>
      </TouchableOpacity>

      <Mask visible={pwdOpen} onClose={() => !pwdSaving && setPwdOpen(false)}>
        <Text style={styles.pwdTitle}>修改密码</Text>
        <Field label="原密码">
          <Input
            value={oldPassword}
            secureTextEntry
            placeholder="请输入当前密码"
            autoCapitalize="none"
            onChangeText={setOldPassword}
          />
        </Field>
        <Field label="新密码">
          <Input
            value={newPassword}
            secureTextEntry
            placeholder="至少 6 位"
            autoCapitalize="none"
            onChangeText={setNewPassword}
          />
        </Field>
        <Field label="确认新密码">
          <Input
            value={confirmPassword}
            secureTextEntry
            placeholder="再次输入新密码"
            autoCapitalize="none"
            onChangeText={setConfirmPassword}
          />
        </Field>
        <View style={styles.pwdBtns}>
          <Btn kind="ghost" small onPress={() => setPwdOpen(false)}>
            取消
          </Btn>
          <Btn small loading={pwdSaving} onPress={() => void submitPwd()}>
            确认修改
          </Btn>
        </View>
      </Mask>
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
  pwdTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: C.textStrong,
    marginBottom: 12,
    textAlign: 'center',
  },
  pwdBtns: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10,
    marginTop: 4,
  },
});
