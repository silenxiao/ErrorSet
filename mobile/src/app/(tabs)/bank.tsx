// 错题库 Tab：科目筛选 + 错题列表（分页）+ 做对/做错打卡 + 置顶/置底/删除。
// 对齐小程序 pages/bank。

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Alert,
  FlatList,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Image } from 'expo-image';
import { useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  deleteWrongQuestion,
  illustrationImageUrl,
  listWrongQuestions,
  recordWrongResult,
  sortWrongQuestion,
  updateWrongQuestion,
} from '@/api/question';
import type { WrongQuestion } from '@/types/question';
import { SUBJECT_OPTIONS } from '@/utils/format';
import { MdRender } from '@/components/MdRender';
import {
  Card,
  CenterMuted,
  ErrBox,
  Mask,
  Muted,
  OptionPicker,
  Screen,
  TextBtn,
  Tag,
  showToast,
  confirm,
  C,
} from '@/components/ui';

const PAGE_SIZE = 10;

export default function BankScreen() {
  const [allRows, setAllRows] = useState<WrongQuestion[]>([]);
  const [page, setPage] = useState(1);
  const [subjectFilter, setSubjectFilter] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  // 科目编辑弹窗
  const [editId, setEditId] = useState<number | null>(null);
  const [editValue, setEditValue] = useState('');

  const insets = useSafeAreaInsets();
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const list = await listWrongQuestions();
      setAllRows(list || []);
      setPage(1);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  // 每次进入都刷新，保证新增/修改的错题及时显示
  useFocusEffect(
    useCallback(() => {
      reload();
      return () => {
        if (timerRef.current) clearInterval(timerRef.current);
        timerRef.current = null;
      };
    }, [reload]),
  );

  // 科目筛选标签：固定科目顺序在前，其余（含"未设置"）按出现顺序排后
  const subjectTags = (() => {
    const counts: Record<string, number> = {};
    allRows.forEach((w) => {
      const key = w.subject || '未设置';
      counts[key] = (counts[key] || 0) + 1;
    });
    const fixed = SUBJECT_OPTIONS.filter((s) => counts[s]);
    const extra = Object.keys(counts).filter((k) => !fixed.includes(k));
    return [...fixed, ...extra].map((name) => ({ name, count: counts[name] }));
  })();

  const filtered = subjectFilter == null ? allRows : allRows.filter((r) => (r.subject || '未设置') === subjectFilter);
  const visibleRows = filtered.slice(0, page * PAGE_SIZE);
  const hasMore = page * PAGE_SIZE < filtered.length;

  const mark = async (item: WrongQuestion, result: 'correct' | 'wrong') => {
    try {
      const up = await recordWrongResult(item.id, result);
      setAllRows((rows) => rows.map((r) => (r.id === up.id ? { ...r, ...up } : r)));
      showToast(result === 'correct' ? '做对 +1' : '做错 +1');
    } catch (e) {
      Alert.alert('记录失败', e instanceof Error ? e.message : String(e));
    }
  };

  const sort = async (item: WrongQuestion, position: 'top' | 'bottom') => {
    try {
      await sortWrongQuestion(item.id, position);
      showToast(position === 'top' ? '已置顶' : '已置底');
      reload();
    } catch (e) {
      Alert.alert('操作失败', e instanceof Error ? e.message : String(e));
    }
  };

  const del = (item: WrongQuestion) => {
    confirm('删除错题', '确定删除该错题？', async () => {
      try {
        await deleteWrongQuestion(item.id);
        showToast('已删除');
        reload();
      } catch (e) {
        Alert.alert('删除失败', e instanceof Error ? e.message : String(e));
      }
    }, '删除');
  };

  const saveSubject = async () => {
    if (editId == null) return;
    try {
      const up = await updateWrongQuestion(editId, { subject: editValue });
      setAllRows((rows) => rows.map((r) => (r.id === up.id ? { ...r, ...up } : r)));
      setEditId(null);
      showToast('科目已更新');
    } catch (e) {
      Alert.alert('保存失败', e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <Screen>
      <FlatList
        data={visibleRows}
        keyExtractor={(item) => String(item.id)}
        contentContainerStyle={{ paddingTop: insets.top + 8, paddingBottom: 16 }}
        onEndReached={() => {
          if (hasMore && !loading) setPage((p) => p + 1);
        }}
        onEndReachedThreshold={0.2}
        ListHeaderComponent={
          <Card style={{ marginBottom: 2 }}>
            {subjectTags.length > 0 ? (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterRow}>
                <TouchableOpacity onPress={() => setSubjectFilter(null)}>
                  <Text style={[styles.filterTag, subjectFilter === null && styles.filterTagActive]}>
                    全部 {allRows.length}
                  </Text>
                </TouchableOpacity>
                {subjectTags.map((t) => (
                  <TouchableOpacity
                    key={t.name}
                    onPress={() => setSubjectFilter(subjectFilter === t.name ? null : t.name)}
                  >
                    <Text
                      style={[styles.filterTag, subjectFilter === t.name && styles.filterTagActive]}
                    >
                      {t.name} {t.count}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            ) : null}

            {error ? <ErrBox message={error} onRetry={reload} /> : null}
            {!error && loading && allRows.length === 0 ? <CenterMuted>加载中…</CenterMuted> : null}
            {!error && !loading && allRows.length === 0 ? (
              <CenterMuted>暂无错题，去识别结果页把题目加入错题库吧</CenterMuted>
            ) : null}
            {!error && allRows.length > 0 && visibleRows.length === 0 ? (
              <CenterMuted>该科目下暂无错题</CenterMuted>
            ) : null}
          </Card>
        }
        renderItem={({ item }) => (
          <Card>
            <View style={styles.whead}>
              <TouchableOpacity onPress={() => { setEditId(item.id); setEditValue(item.subject || ''); }}>
                <Tag color={item.subject ? C.primary : C.muted}>{item.subject || '未设置'}</Tag>
              </TouchableOpacity>
              <Muted>第 {item.questionNo} 题</Muted>
            </View>

            <View style={styles.wtext}>
              <MdRender content={item.questionText || '—'} />
            </View>

            {(item.illustrations || []).length > 0 ? (
              <View style={styles.ills}>
                {item.illustrations.map((ill) => (
                  <Image
                    key={ill.id}
                    source={{ uri: illustrationImageUrl(ill.id) }}
                    style={styles.illImg}
                    contentFit="contain"
                  />
                ))}
              </View>
            ) : null}

            <View style={styles.wactions}>
              <TextBtn onPress={() => sort(item, 'top')}>置顶</TextBtn>
              <TextBtn onPress={() => sort(item, 'bottom')}>置底</TextBtn>
              <TextBtn danger onPress={() => del(item)}>
                删除
              </TextBtn>
              <TextBtn onPress={() => mark(item, 'correct')}>😀 做对</TextBtn>
              <TextBtn onPress={() => mark(item, 'wrong')}>😢 做错</TextBtn>
              <View style={{ flex: 1 }} />
              <Muted>
                做对 {item.correctCount} · 做错 {item.wrongCount}
              </Muted>
            </View>
          </Card>
        )}
        ListFooterComponent={
          hasMore ? (
            <TouchableOpacity activeOpacity={0.6} style={styles.more} onPress={() => setPage((p) => p + 1)}>
              <Text style={{ color: C.primary }}>{loading ? '加载中…' : '加载更多'}</Text>
            </TouchableOpacity>
          ) : null
        }
      />

      {/* 科目编辑弹窗 */}
      <Mask visible={editId != null} onClose={() => setEditId(null)}>
        <Text style={styles.dialogTitle}>编辑科目</Text>
        <View style={{ marginBottom: 12 }}>
          <OptionPicker options={SUBJECT_OPTIONS} value={editValue} onChange={setEditValue} placeholder="未设置" />
        </View>
        <View style={styles.dialogBtns}>
          <TextBtn onPress={() => setEditId(null)}>取消</TextBtn>
          <BtnSmallSave onPress={saveSubject} />
        </View>
      </Mask>
    </Screen>
  );
}

function BtnSmallSave({ onPress }: { onPress: () => void }) {
  return (
    <TouchableOpacity activeOpacity={0.7} onPress={onPress} style={styles.saveBtn}>
      <Text style={{ color: '#fff', fontSize: 14, fontWeight: '500' }}>保存</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  filterRow: {
    flexDirection: 'row',
    marginBottom: 4,
  },
  filterTag: {
    color: C.text,
    backgroundColor: '#f2f3f5',
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 5,
    fontSize: 13,
    marginRight: 8,
    overflow: 'hidden',
  },
  filterTagActive: {
    color: '#fff',
    backgroundColor: C.primary,
  },
  whead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  wtext: {
    marginBottom: 6,
  },
  ills: {
    gap: 6,
    marginBottom: 6,
  },
  illImg: {
    width: '100%',
    aspectRatio: 2,
    borderRadius: 6,
    backgroundColor: '#f0f0f0',
  },
  wactions: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 2,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#f0f0f0',
    paddingTop: 4,
  },
  more: {
    alignItems: 'center',
    padding: 12,
  },
  dialogTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: C.textStrong,
    marginBottom: 12,
    textAlign: 'center',
  },
  dialogBtns: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    gap: 12,
  },
  saveBtn: {
    backgroundColor: C.primary,
    borderRadius: 7,
    paddingHorizontal: 18,
    paddingVertical: 9,
  },
});
