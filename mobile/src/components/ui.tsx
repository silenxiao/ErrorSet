// 共享 UI 基础组件与配色（三端统一设计令牌，对齐小程序 app.wxss 的视觉规范）。

import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
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
import { Feather } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

/** 三端统一设计令牌：主色/语义色/中性色/圆角。保持旧字段名兼容（text2/text3、radius 为新增）。 */
export const C = {
  primary: '#165DFF',
  primaryDark: '#0E42B8',
  primaryLight: '#E8F3FF',
  primaryBg: 'rgba(22, 93, 255, 0.08)',
  bg: '#F7F8FA',
  card: '#FFFFFF',
  text: '#1D2129',
  text2: '#4E5969',
  text3: '#86909C',
  textStrong: '#1D2129',
  muted: '#86909C',
  border: '#E5E6EB',
  danger: '#F53F3F',
  dangerDark: '#CB2634',
  green: '#00B42A',
  orange: '#FF7D00',
  purple: '#722ED1',
  gray: '#86909C',
} as const;

/** 圆角规范：卡片 14 / 控件（按钮、输入框）10。 */
export const radius = { card: 14, control: 10 } as const;

/** 字号规范：页面标题 18 / 正文 16 / 辅助文字 14 / Tab 小字 12。 */
export const font = { title: 18, body: 16, aux: 14, tab: 12 } as const;

/** 卡片阴影（iOS shadow + Android elevation，规范统一值）。 */
export const cardShadow: ViewStyle = {
  shadowColor: '#000',
  shadowOpacity: 0.06,
  shadowRadius: 8,
  shadowOffset: { width: 0, height: 2 },
  elevation: 2,
};

/** 简易 toast：模块级单监听者，根布局挂载 <ToastHost />。 */
let toastListener: ((msg: string) => void) | null = null;

export function showToast(msg: string) {
  toastListener?.(msg);
}

export function ToastHost() {
  const [msg, setMsg] = useState<string | null>(null);
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    toastListener = (m) => setMsg(m);
    return () => {
      toastListener = null;
    };
  }, []);

  useEffect(() => {
    if (!msg) return;
    // 淡入，停留 1.8s 后淡出（动画克制，仅透明度）
    Animated.timing(opacity, { toValue: 1, duration: 150, useNativeDriver: true }).start();
    const timer = setTimeout(() => {
      Animated.timing(opacity, { toValue: 0, duration: 200, useNativeDriver: true }).start(
        ({ finished }) => {
          if (finished) setMsg(null);
        },
      );
    }, 1800);
    return () => {
      clearTimeout(timer);
      opacity.stopAnimation();
    };
  }, [msg, opacity]);

  if (!msg) return null;
  return (
    <Animated.View
      pointerEvents="none"
      style={[StyleSheet.absoluteFill, styles.toastWrap, { opacity }]}
    >
      <View style={styles.toast}>
        <Text style={styles.toastText}>{msg}</Text>
      </View>
    </Animated.View>
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
    <Pressable
      disabled={disabled || loading}
      onPress={onPress}
      style={({ pressed }) => [
        styles.btn,
        kindStyle,
        block && styles.btnBlock,
        small && styles.btnSmall,
        (disabled || loading) && { opacity: 0.55 },
        pressed && !disabled && !loading && { opacity: 0.7 },
        style,
      ]}
    >
      {loading && (
        <ActivityIndicator
          size="small"
          color={kind === 'ghost' ? C.primary : '#fff'}
          style={styles.btnSpinner}
        />
      )}
      <Text style={[styles.btnText, kind === 'ghost' && { color: C.textStrong }]}>
        {children}
      </Text>
    </Pressable>
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

/** 二级页面头部：返回按钮 + 标题（自绘，全局 Stack headerShown=false）。
 * 高度 48px（不含状态栏）、主蓝底白字居中标题、浅色状态栏。 */
export function SubHeader({ title }: { title: string }) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.subHeader, { paddingTop: insets.top, height: insets.top + 48 }]}>
      <StatusBar style="light" />
      <Pressable
        onPress={() => router.back()}
        hitSlop={6}
        style={({ pressed }) => [styles.backBtn, pressed && { opacity: 0.7 }]}
      >
        <Feather name="chevron-left" size={22} color="#fff" />
        <Text style={styles.backText}>返回</Text>
      </Pressable>
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
  return <TextInput placeholderTextColor={C.text3} style={[styles.input, props.style]} {...props} />;
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
        <Feather name="chevron-down" size={16} color={C.text3} />
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
                  {o === value && <Feather name="check" size={16} color={C.primary} />}
                </TouchableOpacity>
              ))}
            </ScrollView>
            <TouchableOpacity activeOpacity={0.6} style={styles.optionCancel} onPress={() => setOpen(false)}>
              <Text style={{ color: C.text3 }}>取消</Text>
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
    borderRadius: radius.card,
    padding: 16,
    marginHorizontal: 12,
    marginBottom: 12,
    ...cardShadow,
  },
  cardTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: C.textStrong,
  },
  muted: {
    color: C.text3,
    fontSize: font.aux,
  },
  btn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: 44,
    paddingHorizontal: 16,
    borderRadius: radius.control,
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
    fontSize: font.body,
    fontWeight: '500',
  },
  btnSpinner: {
    marginRight: 8,
  },
  textBtn: {
    color: C.primary,
    fontSize: font.aux,
    paddingHorizontal: 8,
    paddingVertical: 6,
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
    paddingHorizontal: 8,
  },
  backBtn: {
    minWidth: 64,
    flexDirection: 'row',
    alignItems: 'center',
  },
  backText: {
    color: '#fff',
    fontSize: font.aux,
  },
  subHeaderTitle: {
    flex: 1,
    textAlign: 'center',
    color: '#fff',
    fontSize: font.title,
    fontWeight: '600',
  },
  field: {
    marginBottom: 16,
  },
  label: {
    fontSize: font.aux,
    color: C.text2,
    marginBottom: 8,
  },
  input: {
    backgroundColor: '#fff',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: C.border,
    borderRadius: radius.control,
    paddingHorizontal: 12,
    height: 44,
    fontSize: font.body,
    color: C.text,
  },
  selectBox: {
    backgroundColor: '#fff',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: C.border,
    borderRadius: radius.control,
    paddingHorizontal: 12,
    height: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  selectValue: {
    fontSize: font.body,
    color: C.text,
  },
  selectPlaceholder: {
    fontSize: font.body,
    color: C.text3,
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
    borderRadius: radius.card,
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
    fontSize: font.body,
    color: C.text,
  },
  optionCancel: {
    alignItems: 'center',
    paddingVertical: 12,
    marginTop: 4,
  },
  errBox: {
    backgroundColor: '#FFECE8',
    borderRadius: radius.control,
    padding: 12,
    marginHorizontal: 12,
    marginBottom: 12,
    gap: 4,
  },
  errMsg: {
    color: C.danger,
    fontSize: font.aux,
  },
  errHint: {
    fontSize: font.tab,
  },
  toastWrap: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  toast: {
    backgroundColor: 'rgba(29,33,41,0.9)',
    borderRadius: radius.control,
    paddingHorizontal: 18,
    paddingVertical: 10,
    maxWidth: '80%',
  },
  toastText: {
    color: '#fff',
    fontSize: font.aux,
    textAlign: 'center',
  },
});
