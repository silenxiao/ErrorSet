// 错题详情：题目原文 / 正确答案 / AI 分析 / 备注 / 打卡。
// 对齐小程序 pages/bank-detail。

import { useCallback, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { IllustrationImage } from '@/components/IllustrationImage';
import { illustrationUris as resolveIllustrationUris } from '@/utils/illustrations';
import { Feather } from '@expo/vector-icons';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import {
  deleteWrongQuestion,
  getQuestion,
  getWrongQuestion,
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
  Tag,
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
  /** 原题已随试卷删除（实时题目 404），原文/插图改用错题自带快照 */
  const [questionMissing, setQuestionMissing] = useState(false);

  useFocusEffect(
    useCallback(() => {
      (async () => {
        try {
          const w = await getWrongQuestion(wrongId);
          setDetail(w);
          setLoadError(false);
          // §28：未保存原文快照的旧记录才回退实时题目；
          // 入库快照齐全时无需再拉一次注定用不上的请求
          setQuestionMissing(false);
          if (w.questionId && (!w.questionText || (!(w.illustrationImages || []).length && !(w.illustrations || []).length))) {
            getQuestion(w.questionId)
              .then(setQuestion)
              .catch(() => setQuestionMissing(true));
          } else {
            setQuestion(null);
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

  // §28：原文快照优先——试卷/题目删除后原题仍完整可读；旧记录快照为空才用实时题目
  const originalText = detail?.questionText || question?.text || '';
  // 插图快照优先（入库时裁剪的静态 /files 图，无需鉴权），旧记录回退动态裁剪接口
  const illustrationUris = resolveIllustrationUris({
    illustrationImages: detail?.illustrationImages,
    illustrations: detail?.illustrations?.length ? detail.illustrations : question?.illustrations,
  });
  // 原文与插图都无从取得时才提示（对应小程序 / Web 的同名分支）
  const showMissing = !originalText && questionMissing;

  return (
    <Screen>
      <SubHeader title="错题详情" />

      {loadError ? (
        <Card>
          <CenterMuted>错题不存在或已被删除</CenterMuted>
        </Card>
      ) : null}

      {detail ? (
        <ScrollView contentContainerStyle={{ paddingBottom: 20 }}>
          <Card>
            <SectionTitle>题目原文</SectionTitle>
            {originalText || illustrationUris.length ? (
              <View>
                <MdRender content={originalText} />
                {illustrationUris.length > 0 ? (
                  <View style={styles.ills}>
                    {illustrationUris.map((uri) => (
                      <IllustrationImage
                        key={uri}
                        uri={uri}
                      />
                    ))}
                  </View>
                ) : null}
              </View>
            ) : showMissing ? (
              <Muted>原题已删除，且该错题未保存原文快照</Muted>
            ) : (
              <Muted>加载中…</Muted>
            )}

            <SectionTitle>正确答案</SectionTitle>
            <MdRender content={detail.correctAnswer || '—'} />

            <SectionTitle>AI 分析结果</SectionTitle>
            <MdRender content={detail.analysis || '—'} />

            {(detail.knowledgePoints?.length ?? 0) > 0 ? (
              <>
                <SectionTitle>知识点</SectionTitle>
                <View style={styles.kpList}>
                  {detail.knowledgePoints.map((point) => (
                    <Tag key={point} color={C.primary}>
                      {point}
                    </Tag>
                  ))}
                </View>
              </>
            ) : null}

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
  kpList: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
  },
  illImg: {
    width: '100%',
    // 不写死 aspectRatio：快照按题目 bbox 裁剪，宽高比各不相同，
    // contentFit="contain" 已能保证不裁切、不拉伸
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
