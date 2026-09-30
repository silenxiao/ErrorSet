// 登录/注册页。对齐小程序 pages/login。

import { useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { login, register } from '@/api/auth';
import { GRADE_OPTIONS } from '@/utils/format';
import { Btn, Input, OptionPicker, C } from '@/components/ui';

export default function LoginPage() {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPwd, setConfirmPwd] = useState('');
  const [grade, setGrade] = useState(GRADE_OPTIONS[0]);
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const submit = async () => {
    if (loading) return;
    const name = username.trim();
    if (!name || !password) {
      Alert.alert('提示', '请输入用户名和密码');
      return;
    }
    if (mode === 'register') {
      if (password.length < 6) {
        Alert.alert('提示', '密码至少 6 位');
        return;
      }
      if (password !== confirmPwd) {
        Alert.alert('提示', '两次输入的密码不一致');
        return;
      }
    }
    setLoading(true);
    try {
      if (mode === 'login') {
        await login(name, password);
      } else {
        await register(name, password, grade);
      }
      router.replace('/exam');
    } catch (e) {
      Alert.alert(mode === 'login' ? '登录失败' : '注册失败', e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={[styles.page, { paddingTop: insets.top }]}>
      {/* 深蓝实底页面：状态栏用浅色内容 */}
      <StatusBar style="light" />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <View style={styles.card}>
            <View style={styles.titleRow}>
              <Feather name="book" size={22} color={C.primary} />
              <Text style={styles.title}>AI 试卷识别与错题库</Text>
            </View>
            <Text style={styles.subtitle}>
              {mode === 'login' ? '登录后查看你的错题库' : '注册一个新账号'}
            </Text>

            <Input
              placeholder="用户名"
              value={username}
              autoCapitalize="none"
              onChangeText={setUsername}
              style={styles.gap}
            />
            <Input
              placeholder="密码（至少 6 位）"
              value={password}
              secureTextEntry
              onChangeText={setPassword}
              style={styles.gap}
            />
            {mode === 'register' ? (
              <>
                <View style={styles.gap}>
                  <OptionPicker
                    options={GRADE_OPTIONS}
                    value={grade}
                    onChange={setGrade}
                    placeholder="孩子所在年级"
                  />
                </View>
                <Input
                  placeholder="确认密码（再次输入）"
                  value={confirmPwd}
                  secureTextEntry
                  onChangeText={setConfirmPwd}
                  style={styles.gap}
                />
              </>
            ) : null}

            <Btn block loading={loading} onPress={submit} style={styles.gap}>
              {mode === 'login' ? '登录' : '注册'}
            </Btn>

            <TouchableOpacity activeOpacity={0.6} onPress={() => setMode(mode === 'login' ? 'register' : 'login')}>
              <Text style={styles.switchText}>
                {mode === 'login' ? '没有账号？去注册' : '已有账号？去登录'}
              </Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  page: {
    flex: 1,
    backgroundColor: C.primaryDark,
  },
  scroll: {
    flex: 1,
    justifyContent: 'center',
    padding: 24,
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 22,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: C.textStrong,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 13,
    color: C.muted,
    textAlign: 'center',
    marginTop: 6,
    marginBottom: 18,
  },
  gap: {
    marginBottom: 12,
  },
  switchText: {
    color: C.primary,
    fontSize: 14,
    textAlign: 'center',
    paddingVertical: 6,
  },
});
