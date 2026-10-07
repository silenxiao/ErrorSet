// 试卷原图 + bbox 叠加编辑器。移植自小程序 components/bbox-editor：
// 点击框选中，拖动框体或八向手柄调整边界，松手回调保存。
// bbox 为 0~1000 归一化坐标（工具见 utils/bbox.js）。
// onlyIllustrations 时隐藏题目框只显示插图框；editable=false 时纯展示
// （点击仅选中，不可拖动），编辑在预览弹窗内进行。

import { useCallback, useRef, useState } from 'react';
import {
  PanResponder,
  StyleSheet,
  Text,
  View,
  type GestureResponderEvent,
  type PanResponderGestureState,
  type ViewStyle,
} from 'react-native';
import { Image } from 'expo-image';
import { Feather } from '@expo/vector-icons';
import type { BBox, Illustration, Question } from '@/types/question';
import { applyDrag, normalizeBBox } from '@/utils/bbox';

// 八向手柄：fx/fy 为相对所选框的百分比位置（0~100）
const HANDLES = [
  { mode: 'nw', fx: 0, fy: 0 },
  { mode: 'n', fx: 50, fy: 0 },
  { mode: 'ne', fx: 100, fy: 0 },
  { mode: 'e', fx: 100, fy: 50 },
  { mode: 'se', fx: 100, fy: 100 },
  { mode: 's', fx: 50, fy: 100 },
  { mode: 'sw', fx: 0, fy: 100 },
  { mode: 'w', fx: 0, fy: 50 },
];

function bboxStyle(b: BBox): ViewStyle {
  const [x1, y1, x2, y2] = b;
  return {
    left: `${x1 / 10}%`,
    top: `${y1 / 10}%`,
    width: `${(x2 - x1) / 10}%`,
    height: `${(y2 - y1) / 10}%`,
  } as ViewStyle;
}

interface Props {
  imageUrl: string;
  questions: Question[];
  selectedId: number | null;
  /** true 时隐藏题目框，只显示插图框 */
  onlyIllustrations?: boolean;
  /** false 时纯展示（不可拖动/缩放）；编辑在预览弹窗内进行 */
  editable?: boolean;
  onSelect: (id: number) => void;
  onUpdateBbox: (id: number, bbox: BBox) => void;
  /** 插图框拖拽结束（editable 时）；id 为插图 id */
  onUpdateIllBbox?: (id: number, bbox: BBox) => void;
}

export function BboxEditor({
  imageUrl,
  questions,
  selectedId,
  onlyIllustrations = false,
  editable = true,
  onSelect,
  onUpdateBbox,
  onUpdateIllBbox,
}: Props) {
  const [aspect, setAspect] = useState<number | null>(null);
  const [previews, setPreviews] = useState<Record<number, BBox>>({});
  // 插图框拖拽预览（key: 插图 id）
  const [illPreviews, setIllPreviews] = useState<Record<number, BBox>>({});

  const questionsRef = useRef(questions);
  questionsRef.current = questions;
  const previewsRef = useRef(previews);
  previewsRef.current = previews;
  const illPreviewsRef = useRef(illPreviews);
  illPreviewsRef.current = illPreviews;
  const cbRef = useRef({ onSelect, onUpdateBbox, onUpdateIllBbox });
  cbRef.current = { onSelect, onUpdateBbox, onUpdateIllBbox };
  const sizeRef = useRef({ w: 0, h: 0 });
  const dragRef = useRef<{ qid: number; mode: string; start: BBox; x0: number; y0: number } | null>(null);
  const illDragRef = useRef<{ iid: number; mode: string; start: BBox; x0: number; y0: number } | null>(null);
  // 触摸期间发生过移动（拖拽/滚动）则不触发点击选择
  const movedRef = useRef(false);

  const makePan = useCallback((qid: number, mode: string, immediate: boolean) => {
    return PanResponder.create({
      onStartShouldSetPanResponder: () => immediate,
      onMoveShouldSetPanResponder: (_e: GestureResponderEvent, g: PanResponderGestureState) =>
        Math.abs(g.dx) > 4 || Math.abs(g.dy) > 4,
      onPanResponderGrant: (_e: GestureResponderEvent, g: PanResponderGestureState) => {
        const q = questionsRef.current.find((x) => x.id === qid);
        if (!q) return;
        const b = (normalizeBBox(q.bbox) || [0, 0, 0, 0]) as BBox;
        dragRef.current = { qid, mode, start: [...b] as BBox, x0: g.moveX, y0: g.moveY };
      },
      onPanResponderMove: (_e: GestureResponderEvent, g: PanResponderGestureState) => {
        const d = dragRef.current;
        const { w, h } = sizeRef.current;
        movedRef.current = true;
        if (!d || !w || !h) return;
        const dx = ((g.moveX - d.x0) / w) * 1000;
        const dy = ((g.moveY - d.y0) / h) * 1000;
        const next = applyDrag(d.start, dx, dy, d.mode) as BBox;
        setPreviews((p) => ({ ...p, [qid]: next }));
      },
      onPanResponderRelease: () => {
        const d = dragRef.current;
        dragRef.current = null;
        if (!d) return;
        const finalB = previewsRef.current[d.qid] || d.start;
        const changed = finalB.some((v, i) => v !== d.start[i]);
        setPreviews((p) => {
          const c = { ...p };
          delete c[d.qid];
          return c;
        });
        if (changed) cbRef.current.onUpdateBbox(d.qid, finalB);
      },
      onPanResponderTerminate: () => {
        dragRef.current = null;
      },
    });
  }, []);

  // 插图框拖拽：与题目框同款，但数据源是 illustrations（key 用插图 id）
  const makeIllPan = useCallback((iid: number, mode: string, immediate: boolean) => {
    return PanResponder.create({
      onStartShouldSetPanResponder: () => immediate,
      onMoveShouldSetPanResponder: (_e: GestureResponderEvent, g: PanResponderGestureState) =>
        Math.abs(g.dx) > 4 || Math.abs(g.dy) > 4,
      onPanResponderGrant: (_e: GestureResponderEvent, g: PanResponderGestureState) => {
        const found = findIll(questionsRef.current, iid);
        if (!found) return;
        illDragRef.current = {
          iid,
          mode,
          start: [...found.bbox] as BBox,
          x0: g.moveX,
          y0: g.moveY,
        };
      },
      onPanResponderMove: (_e: GestureResponderEvent, g: PanResponderGestureState) => {
        const d = illDragRef.current;
        const { w, h } = sizeRef.current;
        movedRef.current = true;
        if (!d || !w || !h) return;
        const dx = ((g.moveX - d.x0) / w) * 1000;
        const dy = ((g.moveY - d.y0) / h) * 1000;
        const next = applyDrag(d.start, dx, dy, d.mode) as BBox;
        setIllPreviews((p) => ({ ...p, [iid]: next }));
      },
      onPanResponderRelease: () => {
        const d = illDragRef.current;
        illDragRef.current = null;
        if (!d) return;
        const finalB = illPreviewsRef.current[d.iid] || d.start;
        const changed = finalB.some((v, i) => v !== d.start[i]);
        setIllPreviews((p) => {
          const c = { ...p };
          delete c[d.iid];
          return c;
        });
        if (changed) cbRef.current.onUpdateIllBbox?.(d.iid, finalB);
      },
      onPanResponderTerminate: () => {
        illDragRef.current = null;
      },
    });
  }, []);

  // 缓存 PanResponder 实例，避免每帧拖拽重建
  const pansRef = useRef(new Map<string, ReturnType<typeof PanResponder.create>>());
  const panFor = (qid: number, mode: string, immediate: boolean) => {
    const key = `${qid}:${mode}:${immediate ? 1 : 0}`;
    let p = pansRef.current.get(key);
    if (!p) {
      p = makePan(qid, mode, immediate);
      pansRef.current.set(key, p);
    }
    return p;
  };
  const illPanFor = (iid: number, mode: string, immediate: boolean) => {
    const key = `ill-${iid}:${mode}:${immediate ? 1 : 0}`;
    let p = pansRef.current.get(key);
    if (!p) {
      p = makeIllPan(iid, mode, immediate);
      pansRef.current.set(key, p);
    }
    return p;
  };

  const containerH = aspect ? 1 / aspect : 4 / 3;

  return (
    <View
      style={styles.editor}
      onLayout={(e) => {
        const { width, height } = e.nativeEvent.layout;
        sizeRef.current = { w: width, h: height };
      }}
    >
      {imageUrl ? (
        <Image
          source={{ uri: imageUrl }}
          style={[styles.paper, { aspectRatio: aspect ?? 3 / 4 }]}
          contentFit="contain"
          onLoad={(e) => {
            const s = (e.source as { width?: number; height?: number } | undefined) || {};
            if (s.width && s.height) setAspect(s.width / s.height);
          }}
        />
      ) : (
        <View style={styles.emptyWrap}>
          <Text style={styles.empty}>暂无图片</Text>
        </View>
      )}

      {!aspect && imageUrl ? (
        <View style={[StyleSheet.absoluteFill, styles.skeleton]}>
          <Text style={styles.skeletonText}>原图加载中…</Text>
        </View>
      ) : null}

      {aspect
        ? questions.map((q) => {
            const selected = q.id === selectedId;
            const suspicious = q.confidence != null && q.confidence < 0.7;
            const b = previews[q.id] || ((normalizeBBox(q.bbox) || [0, 0, 0, 0]) as BBox);
            return (
              <View key={q.id}>
                {!onlyIllustrations ? (
                  <TouchableBox
                    qid={q.id}
                    no={q.questionNo}
                    bbox={b}
                    selected={selected}
                    suspicious={suspicious}
                    movedRef={movedRef}
                    panHandlers={panFor(q.id, 'move', false).panHandlers}
                    onSelect={onSelect}
                  >
                    {editable && selected
                      ? HANDLES.map((h) => (
                          <View
                            key={h.mode}
                            style={[styles.handle, { left: `${h.fx}%`, top: `${h.fy}%` }]}
                            {...panFor(q.id, h.mode, true).panHandlers}
                          />
                        ))
                      : null}
                  </TouchableBox>
                ) : null}

                {(q.illustrations || []).map((il) => {
                  const ib =
                    illPreviews[il.id] || ((normalizeBBox(il.bbox) || [0, 0, 0, 0]) as BBox);
                  return (
                    <IllBox
                      key={`ill-${il.id}`}
                      pid={q.id}
                      ill={il}
                      bbox={ib}
                      selected={selected}
                      editable={editable}
                      movedRef={movedRef}
                      panHandlers={editable ? illPanFor(il.id, 'move', false).panHandlers : undefined}
                      onSelect={onSelect}
                    >
                      {editable && selected
                        ? HANDLES.map((h) => (
                            <View
                              key={h.mode}
                              style={[styles.illHandle, { left: `${h.fx}%`, top: `${h.fy}%` }]}
                              {...illPanFor(il.id, h.mode, true).panHandlers}
                            />
                          ))
                        : null}
                    </IllBox>
                  );
                })}
              </View>
            );
          })
        : null}
    </View>
  );
}

/** 按插图 id 找插图及其 bbox。 */
function findIll(questions: Question[], iid: number): Illustration | null {
  for (const q of questions) {
    const ill = (q.illustrations || []).find((x) => x.id === iid);
    if (ill) return ill;
  }
  return null;
}

/** 单个题目框：点击选中（无移动时）、拖动调整边界。 */
function TouchableBox({
  qid,
  no,
  bbox,
  selected,
  suspicious,
  movedRef,
  panHandlers,
  onSelect,
  children,
}: {
  qid: number;
  no: string;
  bbox: BBox;
  selected: boolean;
  suspicious: boolean;
  movedRef: { current: boolean };
  panHandlers: object;
  onSelect: (id: number) => void;
  children?: React.ReactNode;
}) {
  const startY = useRef(0);
  return (
    <View
      style={[styles.abs, bboxStyle(bbox), styles.bbox, suspicious && !selected && styles.bboxSusp, selected && styles.bboxSel]}
      onTouchStart={(e) => {
        movedRef.current = false;
        startY.current = e.nativeEvent.pageY;
      }}
      onTouchMove={(e) => {
        if (Math.abs(e.nativeEvent.pageY - startY.current) > 6) movedRef.current = true;
      }}
      onTouchEnd={() => {
        if (!movedRef.current) onSelect(qid);
      }}
      {...panHandlers}
    >
      <View style={styles.blabelBox}>
        <Text style={[styles.blabel, suspicious && { color: C_ORANGE }]}>{no}</Text>
        {suspicious ? <Feather name="alert-triangle" size={10} color={C_ORANGE} /> : null}
      </View>
      {children}
    </View>
  );
}

/** 插图框（虚线）：点击选中所属题目；editable 时可拖动移动 + 八向手柄缩放。 */
function IllBox({
  pid,
  ill,
  bbox,
  selected,
  editable,
  movedRef,
  panHandlers,
  onSelect,
  children,
}: {
  pid: number;
  ill: Illustration;
  bbox: BBox;
  selected: boolean;
  editable: boolean;
  movedRef: { current: boolean };
  panHandlers?: object;
  onSelect: (id: number) => void;
  children?: React.ReactNode;
}) {
  const startY = useRef(0);
  return (
    <View
      style={[styles.abs, bboxStyle(bbox), styles.illbox, selected && styles.illboxSel]}
      onTouchStart={(e) => {
        movedRef.current = false;
        startY.current = e.nativeEvent.pageY;
      }}
      onTouchMove={(e) => {
        if (Math.abs(e.nativeEvent.pageY - startY.current) > 6) movedRef.current = true;
      }}
      onTouchEnd={() => {
        if (!movedRef.current) onSelect(pid);
      }}
      {...panHandlers}
    >
      <Text style={styles.illLabel}>{ill.type || '插图'}</Text>
      {children}
    </View>
  );
}

// 低饱和警示橙（"可疑"语义，三端统一）
const C_ORANGE = '#FF7D00';

const styles = StyleSheet.create({
  editor: {
    width: '100%',
  },
  paper: {
    width: '100%',
    backgroundColor: '#f0f0f0',
  },
  skeleton: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f0f0f0',
  },
  skeletonText: {
    color: '#999',
    fontSize: 13,
  },
  abs: {
    position: 'absolute',
  },
  bbox: {
    borderWidth: 1.5,
    borderColor: 'rgba(22,93,255,0.55)',
    borderRadius: 2,
    justifyContent: 'flex-start',
  },
  bboxSel: {
    borderColor: '#165DFF',
    borderWidth: 2,
    backgroundColor: 'rgba(22,93,255,0.06)',
    zIndex: 10,
  },
  bboxSusp: {
    borderColor: 'rgba(255,125,0,0.7)',
  },
  blabelBox: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    backgroundColor: 'rgba(255,255,255,0.85)',
    paddingHorizontal: 3,
    borderRadius: 3,
    overflow: 'hidden',
  },
  blabel: {
    color: '#165DFF',
    fontSize: 10,
  },
  handle: {
    position: 'absolute',
    width: 16,
    height: 16,
    marginLeft: -8,
    marginTop: -8,
    borderRadius: 8,
    backgroundColor: '#fff',
    borderWidth: 2,
    borderColor: '#165DFF',
  },
  // 插图框手柄：紫色描边与插图框一致
  illHandle: {
    position: 'absolute',
    width: 16,
    height: 16,
    marginLeft: -8,
    marginTop: -8,
    borderRadius: 8,
    backgroundColor: '#fff',
    borderWidth: 2,
    borderColor: '#722ed1',
  },
  illbox: {
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: 'rgba(114,46,209,0.7)',
    borderRadius: 2,
    alignItems: 'flex-end',
    zIndex: 5,
  },
  illboxSel: {
    borderColor: '#722ed1',
    backgroundColor: 'rgba(114,46,209,0.06)',
  },
  illLabel: {
    backgroundColor: 'rgba(114,46,209,0.85)',
    color: '#fff',
    fontSize: 9,
    paddingHorizontal: 3,
    borderRadius: 3,
    overflow: 'hidden',
  },
  emptyWrap: {
    paddingVertical: 60,
    alignItems: 'center',
  },
  empty: {
    color: '#999',
  },
});
