// 留言板：提交留言 + 我的留言历史。对齐小程序 pages/feedback 与 Web 端 /feedback。

import { useCallback, useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useFocusEffect } from 'expo-router';
import { createFeedback, listMyFeedback } from '@/api/feedback';
import type { Feedback } from '@/api/feedback';
import { formatDate } from '@/utils/format';
import {
  Btn,
  Card,
  CardTitle,
  CenterMuted,
  ErrBox,
  Field,
  Screen,
  SubHeader,
  showToast,
  C,
} from '@/components/ui';

const MAX_LEN = 1000;

export default function FeedbackPage() {
  const [content, setContent] = useState('');
  const [saving, setSaving] = useState(false);
  const [rows, setRows] = useState<Feedback[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const refresh = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setRows(await listMyFeedback());
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh]),
  );

  const save = async () => {
    if (saving) return;
    const text = content.trim();
    if (!text) {
      showToast('请填写留言内容');
      return;
    }
    setSaving(true);
    try {
      await createFeedback(text);
      showToast('留言已提交，感谢您的反馈');
      setContent('');
      await refresh();
    } catch (e) {
      Alert.alert('提交失败', e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Screen>
      <SubHeader title="留言板" />

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={{ padding: 10, paddingBottom: 30 }} keyboardShouldPersistTaps="handled">
          <Card>
            <Field label={`留言内容（${content.length}/${MAX_LEN}）`}>
              <TextInput
                style={styles.textarea}
                value={content}
                multiline
                maxLength={MAX_LEN}
                placeholder="有问题或建议请留言，我们会认真查看每一条反馈"
                placeholderTextColor={C.muted}
                onChangeText={setContent}
              />
            </Field>
            <Btn block loading={saving} onPress={save}>
              提交留言
            </Btn>
          </Card>

          <Card style={{ marginTop: 10 }}>
            <CardTitle>我的留言</CardTitle>
            {error ? <ErrBox message={error} onRetry={refresh} /> : null}
            {loading ? <CenterMuted>加载中…</CenterMuted> : null}
            {!loading && !error && rows.length === 0 ? (
              <CenterMuted>还没有留言</CenterMuted>
            ) : null}
            {rows.map((row) => (
              <View key={row.id} style={styles.fbItem}>
                <Text style={styles.fbContent}>{row.content}</Text>
                <Text style={styles.fbTime}>{formatDate(row.createdAt)}</Text>
              </View>
            ))}
          </Card>
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  textarea: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: C.border,
    borderRadius: 8,
    padding: 10,
    fontSize: 14,
    color: C.text,
    backgroundColor: '#fff',
    minHeight: 110,
    textAlignVertical: 'top',
    marginBottom: 12,
  },
  fbItem: {
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: C.border,
  },
  fbContent: {
    fontSize: 14,
    color: C.text,
    lineHeight: 20,
  },
  fbTime: {
    fontSize: 12,
    color: C.muted,
    marginTop: 4,
  },
});
