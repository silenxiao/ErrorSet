// 题目树列表：按 parentId 组装层级，展示状态/标签/内容与操作。
// 移植自小程序 components/question-tree。

import { useMemo } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import type { Question } from '@/types/question';
import { questionStatusOf } from '@/utils/format';
import { MdRender } from './MdRender';
import { Tag, TextBtn, C } from './ui';

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
            style={[styles.qitem, q.id === selectedId && styles.qitemSel, { marginLeft: depth * 14 }]}
            onPress={() => onSelect(q.id, 'list')}
          >
            <View style={styles.qhead}>
              <View style={styles.badge}>
                <Text style={styles.badgeText}>{q.questionNo}</Text>
              </View>
              <Tag color={st.color}>{st.text}</Tag>
              {suspicious ? <Tag color={C.orange}>可疑</Tag> : null}
              {manual ? <Tag color={C.gray}>已手动调整</Tag> : null}
              {illCount > 0 ? <Tag color={C.purple}>含插图 ×{illCount}</Tag> : null}
            </View>

            <View style={styles.qtext}>
              <MdRender content={q.text} />
            </View>

            <View style={styles.qactions}>
              <View style={styles.qactsL}>
                <TouchableOpacity activeOpacity={0.6} onPress={() => onAddWrong(q)}>
                  <Text style={[styles.actBtn, { color: C.primary }]}>加入错题库</Text>
                </TouchableOpacity>
                {illCount > 0 ? (
                  <TouchableOpacity activeOpacity={0.6} onPress={() => onReset(q.id)}>
                    <Text style={styles.actBtn}>重置插图位置</Text>
                  </TouchableOpacity>
                ) : null}
              </View>
              <Text style={styles.editHint}>{canEdit ? '单击可编辑试题' : '二次识别后可编辑试题'}</Text>
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
    borderColor: '#eee',
    borderRadius: 8,
    padding: 10,
    marginBottom: 8,
    backgroundColor: '#fafbfc',
  },
  qitemSel: {
    borderColor: C.primary,
    backgroundColor: 'rgba(22,119,255,0.04)',
  },
  qhead: {
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
    marginBottom: 6,
  },
  qactions: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  qactsL: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  actBtn: {
    fontSize: 13,
    color: C.text,
  },
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
