// 共享 UI 基础组件与配色（对齐小程序 app.wxss 的视觉规范）。

import { useEffect, useState } from 'react';
import {
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export const C = {
  primary: '#1677ff',
  primaryDark: '#0958d9',
  primaryBg: 'rgba(22, 119, 255, 0.1)',
  bg: '#f5f5f5',
  card: '#ffffff',
  text: '#333333',
  textStrong: '#1f2329',
  muted: '#999999',
  border: '#e2e5ea',
  danger: '#ff4d4f',
  dangerDark: '#d9363e',
  green: '#52c41a',
  orange: '#fa8c16',
  purple: '#722ed1',
  gray: '#8c8c8c',
} as const;

/** 简易 toast：模块级单监听者，根布局挂载 <ToastHost />。 */
let toastListener: ((msg: string) => void) | null = null;

export function showToast(msg: string) {
  toastListener?.(msg);
}

export function ToastHost() {
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    toastListener = (m) => setMsg(m);
    return () => {
      toastListener = null;
    };
  }, []);

  useEffect(() => {
    if (!msg) return;
    const t = setTimeout(() => setMsg(null), 1800);
    return () => clearTimeout(t);
  }, [msg]);

  if (!msg) return null;
  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.toastWrap]}>
      <View style={styles.toast}>
        <Text style={styles.toastText}>{msg}</Text>
      </View>
    </View>
  );
}

export function Card({
  children,
  style,
}: {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  return <View style={[styles.card, style]}>{children}</View>;
}

export function CardTitle({ children, extra }: { children: React.ReactNode; extra?: React.ReactNode }) {
  return (
    <View style={styles.cardTitleRow}>
      <Text style={styles.cardTitle}>{children}</Text>
      {extra}
    </View>
  );
}

export function Muted({
  children,
  style,
  numberOfLines,
}: {
  children: React.ReactNode;
  style?: StyleProp<TextStyle>;
  numberOfLines?: number;
}) {
  return (
    <Text style={[styles.muted, style]} numberOfLines={numberOfLines}>
      {children}
    </Text>
  );
}

export function Btn({
  kind = 'primary',
  block,
  loading,
  disabled,
  small,
  onPress,
  style,
  children,
}: {
  kind?: 'primary' | 'ghost' | 'danger';
  block?: boolean;
  loading?: boolean;
  disabled?: boolean;
  small?: boolean;
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
  children: React.ReactNode;
}) {
  const kindStyle =
    kind === 'primary' ? styles.btnPrimary : kind === 'danger' ? styles.btnDanger : styles.btnGhost;
  return (
    <TouchableOpacity
      activeOpacity={0.7}
      disabled={disabled || loading}
      onPress={onPress}
      style={[styles.btn, kindStyle, block && styles.btnBlock, small && styles.btnSmall, (disabled || loading) && { opacity: 0.55 }, style]}
    >
      {loading && <View style={styles.spinner} />}
      <Text style={[styles.btnText, kind === 'ghost' && { color: C.textStrong }]}>
        {children}
      </Text>
    </TouchableOpacity>
  );
}

export function TextBtn({
  danger,
  onPress,
  children,
}: {
  danger?: boolean;
  onPress?: () => void;
  children: React.ReactNode;
}) {
  return (
    <TouchableOpacity activeOpacity={0.6} onPress={onPress}>
      <Text style={[styles.textBtn, danger && { color: C.danger }]}>{children}</Text>
    </TouchableOpacity>
  );
}

export function Tag({ color, children }: { color: string; children: React.ReactNode }) {
  return (
    <View style={[styles.tag, { backgroundColor: `${color}1a` }]}>
      <Text style={[styles.tagText, { color }]}>{children}</Text>
    </View>
  );
}

/** 二级页面头部：返回按钮 + 标题（自绘，全局 Stack headerShown=false）。 */
export function SubHeader({ title }: { title: string }) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.subHeader, { paddingTop: insets.top + 6 }]}>
      <TouchableOpacity activeOpacity={0.6} onPress={() => router.back()} style={styles.backBtn}>
        <Text style={styles.backIcon}>‹</Text>
        <Text style={styles.backText}>返回</Text>
      </TouchableOpacity>
      <Text style={styles.subHeaderTitle} numberOfLines={1}>{title}</Text>
      <View style={styles.backBtn} />
    </View>
  );
}

/** 字段行：label + 控件。 */
export function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      {children}
    </View>
  );
}

/** 输入框（对齐小程序 .input）。 */
export function Input(props: React.ComponentProps<typeof TextInput>) {
  return <TextInput placeholderTextColor={C.muted} style={[styles.input, props.style]} {...props} />;
}

/** 简易选择器：点击弹出选项列表 Modal（RN 已移除内置 Picker）。 */
export function OptionPicker({
  options,
  value,
  onChange,
  placeholder = '请选择',
}: {
  options: string[];
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <TouchableOpacity activeOpacity={0.6} style={styles.selectBox} onPress={() => setOpen(true)}>
        <Text style={value ? styles.selectValue : styles.selectPlaceholder}>{value || placeholder}</Text>
        <Text style={styles.selectArrow}>⌄</Text>
      </TouchableOpacity>
      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.mask} onPress={() => setOpen(false)}>
          <Pressable style={styles.dialog}>
            <Text style={styles.dialogTitle}>请选择</Text>
            <ScrollView style={{ maxHeight: 360 }} nestedScrollEnabled>
              {options.map((o) => (
                <TouchableOpacity
                  key={o}
                  activeOpacity={0.6}
                  style={styles.optionRow}
                  onPress={() => {
                    onChange(o);
                    setOpen(false);
                  }}
                >
                  <Text style={[styles.optionText, o === value && { color: C.primary, fontWeight: '600' }]}>
                    {o}
                  </Text>
                  {o === value && <Text style={{ color: C.primary }}>✓</Text>}
                </TouchableOpacity>
              ))}
            </ScrollView>
            <TouchableOpacity activeOpacity={0.6} style={styles.optionCancel} onPress={() => setOpen(false)}>
              <Text style={{ color: C.muted }}>取消</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

/** 居中弹窗外壳：遮罩 + 卡片容器。 */
export function Mask({
  visible,
  onClose,
  children,
}: {
  visible: boolean;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.mask} onPress={onClose}>
        <Pressable style={styles.dialog} onPress={undefined}>{children}</Pressable>
      </Pressable>
    </Modal>
  );
}

export function ErrBox({ message, hint, onRetry }: { message: string; hint?: string; onRetry?: () => void }) {
  return (
    <View style={styles.errBox}>
      <Text style={styles.errMsg}>加载失败：{message}</Text>
      {hint ? <Muted style={styles.errHint}>{hint}</Muted> : null}
      {onRetry ? (
        <TextBtn danger onPress={onRetry}>
          点击重试
        </TextBtn>
      ) : null}
    </View>
  );
}

export function CenterMuted({ children }: { children: React.ReactNode }) {
  return (
    <Text style={[styles.muted, { paddingVertical: 20, textAlign: 'center' }]}>{children}</Text>
  );
}

/** 确认弹窗（对齐 wx.showModal）。 */
export function confirm(title: string, message: string, onConfirm: () => void, confirmText = '确定') {
  Alert.alert(title, message, [
    { text: '取消', style: 'cancel' },
    { text: confirmText, style: 'destructive', onPress: onConfirm },
  ]);
}

/** 屏幕容器：背景色 + 底部安全区。 */
export function Screen({ children, style }: { children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[{ flex: 1, backgroundColor: C.bg, paddingBottom: insets.bottom }, style]}>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: C.card,
    borderRadius: 8,
    padding: 12,
    marginHorizontal: 10,
    marginVertical: 5,
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
  cardTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: C.textStrong,
  },
  muted: {
    color: C.muted,
    fontSize: 12,
  },
  btn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: 44,
    paddingHorizontal: 16,
    borderRadius: 7,
  },
  btnSmall: {
    height: 36,
    paddingHorizontal: 14,
  },
  btnBlock: {
    alignSelf: 'stretch',
  },
  btnPrimary: {
    backgroundColor: C.primary,
  },
  btnGhost: {
    backgroundColor: '#fff',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: C.border,
  },
  btnDanger: {
    backgroundColor: C.danger,
  },
  btnText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '500',
  },
  spinner: {
    width: 12,
    height: 12,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.5)',
    borderTopColor: '#fff',
    marginRight: 8,
  },
  textBtn: {
    color: C.primary,
    fontSize: 13,
    paddingHorizontal: 6,
    paddingVertical: 4,
  },
  tag: {
    alignSelf: 'flex-start',
    paddingHorizontal: 7,
    paddingVertical: 1,
    borderRadius: 4,
    marginRight: 4,
  },
  tagText: {
    fontSize: 11,
    lineHeight: 18,
  },
  subHeader: {
    backgroundColor: C.primary,
    flexDirection: 'row',
    alignItems: 'center',
    paddingBottom: 8,
    paddingHorizontal: 8,
  },
  backBtn: {
    minWidth: 64,
    flexDirection: 'row',
    alignItems: 'center',
  },
  backIcon: {
    color: '#fff',
    fontSize: 26,
    lineHeight: 30,
    marginRight: 2,
  },
  backText: {
    color: '#fff',
    fontSize: 15,
  },
  subHeaderTitle: {
    flex: 1,
    textAlign: 'center',
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  field: {
    marginBottom: 12,
  },
  label: {
    fontSize: 13,
    color: C.textStrong,
    marginBottom: 6,
  },
  input: {
    backgroundColor: '#fff',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: C.border,
    borderRadius: 7,
    paddingHorizontal: 10,
    height: 40,
    fontSize: 14,
    color: C.text,
  },
  selectBox: {
    backgroundColor: '#fff',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: C.border,
    borderRadius: 7,
    paddingHorizontal: 10,
    height: 40,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  selectValue: {
    fontSize: 14,
    color: C.text,
  },
  selectPlaceholder: {
    fontSize: 14,
    color: C.muted,
  },
  selectArrow: {
    color: C.muted,
    fontSize: 14,
  },
  mask: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  dialog: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: '#fff',
    borderRadius: 10,
    padding: 16,
  },
  dialogTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: C.textStrong,
    marginBottom: 12,
    textAlign: 'center',
  },
  optionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#f0f0f0',
  },
  optionText: {
    fontSize: 15,
    color: C.text,
  },
  optionCancel: {
    alignItems: 'center',
    paddingVertical: 12,
    marginTop: 4,
  },
  errBox: {
    backgroundColor: '#fff2f0',
    borderRadius: 8,
    padding: 12,
    marginHorizontal: 10,
    marginVertical: 5,
    gap: 4,
  },
  errMsg: {
    color: C.danger,
    fontSize: 13,
  },
  errHint: {
    fontSize: 11,
  },
  toastWrap: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  toast: {
    backgroundColor: 'rgba(0,0,0,0.75)',
    borderRadius: 8,
    paddingHorizontal: 18,
    paddingVertical: 10,
    maxWidth: '80%',
  },
  toastText: {
    color: '#fff',
    fontSize: 13,
    textAlign: 'center',
  },
});
