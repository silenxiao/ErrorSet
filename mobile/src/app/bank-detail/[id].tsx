// 错题详情：题目原文 / 正确答案 / AI 分析 / 备注 / 打卡。
// 对齐小程序 pages/bank-detail。

import { useCallback, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Image } from 'expo-image';
import { Feather } from '@expo/vector-icons';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import {
  deleteWrongQuestion,
  getQuestion,
  getWrongQuestion,
  illustrationImageUrl,
  recordWrongResult,
} from '@/api/question';
import type { Question, WrongQuestion } from '@/types/question';
import { MdRender } from '@/components/MdRender';
import {
  Card,
  CenterMuted,
  Muted,
  Screen,
  SubHeader,
  showToast,
  confirm,
  C,
} from '@/components/ui';

export default function BankDetailPage() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const wrongId = Number(id);
  const router = useRouter();

  const [detail, setDetail] = useState<WrongQuestion | null>(null);
  const [question, setQuestion] = useState<Question | null>(null);
  const [loadError, setLoadError] = useState(false);

  useFocusEffect(
    useCallback(() => {
      (async () => {
        try {
          const w = await getWrongQuestion(wrongId);
          setDetail(w);
          setLoadError(false);
          if (w.questionId) {
            getQuestion(w.questionId)
              .then(setQuestion)
              .catch(() => {});
          }
        } catch {
          setLoadError(true);
        }
      })();
    }, [wrongId]),
  );

  const mark = async (result: 'correct' | 'wrong') => {
    if (!detail) return;
    try {
      const up = await recordWrongResult(detail.id, result);
      setDetail((d) => (d ? { ...d, ...up } : d));
      showToast(result === 'correct' ? '做对 +1' : '做错 +1');
    } catch (e) {
      Alert.alert('记录失败', e instanceof Error ? e.message : String(e));
    }
  };

  const del = () => {
    if (!detail) return;
    confirm('删除错题', '确定删除该错题？', async () => {
      try {
        await deleteWrongQuestion(detail.id);
        showToast('已删除');
        // 详情页删除后返回列表（列表会自动刷新）
        router.back();
      } catch (e) {
        Alert.alert('删除失败', e instanceof Error ? e.message : String(e));
      }
    }, '删除');
  };

  return (
    <Screen>
      <SubHeader title={detail ? `第 ${detail.questionNo} 题` : '错题详情'} />

      {loadError ? (
        <Card>
          <CenterMuted>原题已被删除，仅剩错题记录信息</CenterMuted>
        </Card>
      ) : null}

      {detail ? (
        <ScrollView contentContainerStyle={{ paddingBottom: 20 }}>
          <Card>
            <SectionTitle>题目原文</SectionTitle>
            {question ? (
              <View>
                <MdRender content={question.text} />
                {(question.illustrations || []).length > 0 ? (
                  <View style={styles.ills}>
                    {question.illustrations.map((ill) => (
                      <Image
                        key={ill.id}
                        source={{ uri: illustrationImageUrl(ill.id) }}
                        style={styles.illImg}
                        contentFit="contain"
                      />
                    ))}
                  </View>
                ) : null}
              </View>
            ) : (
              <Muted>加载中…</Muted>
            )}

            <SectionTitle>正确答案</SectionTitle>
            <MdRender content={detail.correctAnswer || '—'} />

            <SectionTitle>AI 分析结果</SectionTitle>
            <MdRender content={detail.analysis || '—'} />

            <SectionTitle>备注</SectionTitle>
            <Muted style={{ fontSize: 13 }}>{detail.note || '—'}</Muted>

            <SectionTitle>打卡</SectionTitle>
            <View style={styles.markRow}>
              <TouchableOpacity activeOpacity={0.6} style={styles.markBtn} onPress={() => mark('correct')}>
                <Feather name="thumbs-up" size={14} color={C.green} />
                <Text style={[styles.markText, { color: C.green }]}>做对</Text>
              </TouchableOpacity>
              <TouchableOpacity activeOpacity={0.6} style={styles.markBtn} onPress={() => mark('wrong')}>
                <Feather name="thumbs-down" size={14} color={C.danger} />
                <Text style={[styles.markText, { color: C.danger }]}>做错</Text>
              </TouchableOpacity>
              <TouchableOpacity activeOpacity={0.6} onPress={del}>
                <Text style={styles.delLink}>删 除</Text>
              </TouchableOpacity>
              <View style={{ flex: 1 }} />
              <Muted>
                做对 {detail.correctCount} 次 · 做错 {detail.wrongCount} 次
              </Muted>
            </View>
          </Card>
        </ScrollView>
      ) : null}
    </Screen>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <Text style={styles.section}>{children}</Text>;
}

const styles = StyleSheet.create({
  section: {
    fontSize: 14,
    fontWeight: '600',
    color: C.textStrong,
    marginTop: 14,
    marginBottom: 6,
  },
  ills: {
    gap: 6,
    marginTop: 6,
  },
  illImg: {
    width: '100%',
    aspectRatio: 2,
    borderRadius: 8,
    backgroundColor: '#f0f0f0',
  },
  markRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  markBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  markText: {
    fontSize: 14,
  },
  delLink: {
    color: C.danger,
    fontSize: 14,
  },
});
