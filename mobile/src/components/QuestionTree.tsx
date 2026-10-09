// 题目树列表：按 parentId 组装层级，展示状态/标签/内容与操作。
// 移植自小程序 components/question-tree。

import { useMemo } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import type { Question } from '@/types/question';
import { questionStatusOf } from '@/utils/format';
import { MdRender } from './MdRender';
import { Feather } from '@expo/vector-icons';
import { Tag, C } from './ui';

interface Props {
  questions: Question[];
  selectedId: number | null;
  onSelect: (id: number, source: 'list' | 'image') => void;
  onAddWrong: (q: Question) => void;
  onReset: (id: number) => void;
}

interface TreeItem {
  q: Question;
  depth: number;
  suspicious: boolean;
  manual: boolean;
  illCount: number;
  canEdit: boolean;
}

export function QuestionTree({ questions, selectedId, onSelect, onAddWrong, onReset }: Props) {
  const items = useMemo<TreeItem[]>(() => {
    const list = questions || [];
    const byId = new Map(list.map((q) => [q.id, q]));
    const childrenOf = (pid: number | null) => list.filter((q) => q.parentId === pid);
    const roots = list.filter((q) => q.parentId == null || !byId.has(q.parentId));

    const out: TreeItem[] = [];
    const walk = (q: Question, depth: number) => {
      out.push({
        q,
        depth,
        suspicious: q.confidence != null && q.confidence < 0.7,
        manual: q.bboxSource === 'manual',
        illCount: (q.illustrations || []).length,
        canEdit: q.status === 'completed',
      });
      childrenOf(q.id).forEach((c) => walk(c, depth + 1));
    };
    roots.forEach((r) => walk(r, 0));
    return out;
  }, [questions]);

  if (items.length === 0) {
    return (
      <Text style={[styles.empty, { color: C.muted }]}>暂无题目</Text>
    );
  }

  return (
    <View>
      {items.map(({ q, depth, suspicious, manual, illCount, canEdit }) => {
        const st = questionStatusOf(q.status);
        return (
          <TouchableOpacity
            key={q.id}
            activeOpacity={0.7}
            style={[styles.qitem, q.id === selectedId && styles.qitemSel, { marginLeft: Math.min(depth, 3) * 14 }]}
            onPress={() => onSelect(q.id, 'list')}
          >
            <View style={styles.heading}>
              <Text style={styles.questionNo}>第 {q.questionNo} 题</Text>
              <View style={styles.qhead}>
              <Tag color={st.color}>{st.text}</Tag>
              {suspicious ? <Tag color={C.orange}>可疑</Tag> : null}
              {manual ? <Tag color={C.gray}>已手动调整</Tag> : null}
              {illCount > 0 ? <Tag color={C.purple}>含插图 ×{illCount}</Tag> : null}
              </View>
            </View>

            <View style={styles.qtext}>
              <MdRender content={q.text} />
            </View>

            <View style={styles.qactions}>
              <View style={styles.qactsL}>
                <TouchableOpacity activeOpacity={0.6} onPress={() => onAddWrong(q)}>
                  <Text style={[styles.actBtn, styles.primaryBtn]}>＋ 加入错题库</Text>
                </TouchableOpacity>
                {illCount > 0 ? (
                  <TouchableOpacity activeOpacity={0.6} onPress={() => onReset(q.id)}>
                    <Text style={styles.actBtn}>重置插图位置</Text>
                  </TouchableOpacity>
                ) : null}
              </View>
              {canEdit ? (
                <TouchableOpacity style={styles.editBtn} onPress={() => onSelect(q.id, 'list')}>
                  <Feather name="edit-3" size={13} color={C.text} />
                  <Text style={{ fontSize: 13, color: C.text }}>编辑题目</Text>
                </TouchableOpacity>
              ) : <Text style={styles.editHint}>二次识别后可编辑</Text>}
            </View>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  qitem: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: C.border,
    borderRadius: 10,
    padding: 14,
    marginBottom: 12,
    backgroundColor: '#fff',
  },
  qitemSel: {
    borderColor: C.primary,
    backgroundColor: 'rgba(22,93,255,0.04)',
  },
  heading: { flexDirection: 'row', justifyContent: 'space-between', gap: 8 },
  questionNo: { fontSize: 14, fontWeight: '600', color: C.textStrong },
  qhead: {
    flex: 1,
    justifyContent: 'flex-end',
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 4,
    marginBottom: 6,
  },
  badge: {
    backgroundColor: C.primary,
    borderRadius: 6,
    paddingHorizontal: 7,
    paddingVertical: 1,
    marginRight: 2,
  },
  badgeText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
  qtext: {
    marginTop: 14,
  },
  qactions: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: C.border,
    marginTop: 18,
    paddingTop: 10,
    gap: 8,
    flexWrap: 'wrap',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  qactsL: {
    flexWrap: 'wrap',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  actBtn: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: C.border,
    borderRadius: 5,
    paddingHorizontal: 8,
    paddingVertical: 6,
    fontSize: 13,
    color: C.text,
  },
  primaryBtn: { color: C.primary, borderColor: C.primary },
  editBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingVertical: 6 },
  editHint: {
    fontSize: 11,
    color: C.muted,
  },
  empty: {
    textAlign: 'center',
    paddingVertical: 16,
    fontSize: 13,
  },
});
