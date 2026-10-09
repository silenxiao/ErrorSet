// 试卷识别详情：状态卡 + 原图框选编辑 + 题目树 + 编辑/重新识别弹窗。
// 对齐小程序 pages/recognition。

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from 'react-native';
import { IllustrationImage } from '@/components/IllustrationImage';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { confirmExam, getExam, reRecognizeExam } from '@/api/exam';
import { enableModel, listModels, type ModelProfile } from '@/api/settings';
import {
  resetBbox,
  updateBbox,
  updateIllustrationBbox,
  updateQuestion,
  illustrationImageUrl,
} from '@/api/question';
import type { BBox, Question } from '@/types/question';
import type { ExamDetail } from '@/types/exam';
import { examStatusOf, formatDate } from '@/utils/format';
import { BboxEditor } from '@/components/BboxEditor';
import { QuestionTree } from '@/components/QuestionTree';
import { MdRender } from '@/components/MdRender';
import {
  Btn,
  Card,
  CenterMuted,
  Field,
  Mask,
  Muted,
  OptionPicker,
  Screen,
  SubHeader,
  Tag,
  TextBtn,
  showToast,
  C,
} from '@/components/ui';

// 未到终态的状态：轮询同步
const POLLING = ['uploaded', 'global_processing', 'local_processing'];
const POLL_INTERVAL = 1500;

export default function RecognitionPage() {
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const { id } = useLocalSearchParams<{ id: string }>();
  const examId = Number(id);
  const router = useRouter();

  const [exam, setExam] = useState<ExamDetail | null>(null);
  const [error, setError] = useState('');
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);

  // 重新识别弹窗
  const [rerecogVisible, setRerecogVisible] = useState(false);
  const [rerecogInclude, setRerecogInclude] = useState(true);
  const [rerecogExtra, setRerecogExtra] = useState('');

  // 识别模型（与 Web 端重新识别弹窗一致：切换即独占启用）
  const [models, setModels] = useState<ModelProfile[]>([]);
  const enabledModel = models.find((m) => m.enabled);
  const modelName = enabledModel ? enabledModel.name || enabledModel.model : '';

  const loadModels = useCallback(async () => {
    try {
      setModels((await listModels()) || []);
    } catch {
      // 模型列表加载失败不阻塞主流程
    }
  }, []);

  // 编辑题目弹窗
  const [editQ, setEditQ] = useState<Question | null>(null);
  // 插图预览与调整弹窗（页面内插图框只读，弹窗内可编辑）
  const [illPreviewVisible, setIllPreviewVisible] = useState(false);
  const [illDragging, setIllDragging] = useState(false);
  const [selectedIllId, setSelectedIllId] = useState<number | null>(null);
  const [editText, setEditText] = useState('');

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const savingRef = useRef(saving);
  useEffect(() => { savingRef.current = saving; }, [saving]);

  const stopPolling = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const refresh = useCallback(async () => {
    if (!examId) return;
    try {
      const ex = await getExam(examId);
      setExam(ex);
      setError('');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      stopPolling();
    }
  }, [examId, stopPolling]);

  useFocusEffect(
    useCallback(() => {
      refresh();
      return () => stopPolling();
    }, [refresh, stopPolling]),
  );

  useEffect(() => {
    const status = exam?.status;
    if (status && POLLING.includes(status) && !timerRef.current) {
      timerRef.current = setInterval(refresh, POLL_INTERVAL);
    } else if (status && !POLLING.includes(status)) {
      stopPolling();
    }
  }, [exam?.status, refresh, stopPolling]);

  const patchQuestion = (qid: number, patch: Partial<Question>) => {
    setExam((ex) =>
      ex ? { ...ex, questions: ex.questions.map((q) => (q.id === qid ? { ...q, ...patch } : q)) } : ex,
    );
  };

  // 插图框拖拽保存（预览弹窗内）
  const onUpdateIllBbox = async (illId: number, bbox: BBox) => {
    setSaving(true);
    try {
      const ill = await updateIllustrationBbox(illId, bbox);
      setExam((ex) =>
        ex
          ? {
              ...ex,
              questions: ex.questions.map((q) => ({
                ...q,
                illustrations: (q.illustrations || []).map((x) =>
                  x.id === illId ? { ...x, bbox: ill.bbox, bboxSource: ill.bboxSource } : x,
                ),
              })),
            }
          : ex,
      );
    } catch (e) {
      Alert.alert('保存失败', e instanceof Error ? e.message : String(e));
      void refresh();
    } finally {
      setSaving(false);
    }
  };

  const onSelect = (qid: number, source: 'list' | 'image') => {
    setSelectedId(qid);
    if (source === 'list') {
      const q = exam?.questions.find((item) => item.id === qid);
      // 二次识别完成后，单击题目打开编辑弹窗
      if (q && q.status === 'completed') {
        setEditQ(q);
        setEditText(q.text || '');
      }
    }
  };

  const onUpdateBbox = async (qid: number, bbox: BBox) => {
    setSaving(true);
    try {
      const q = await updateBbox(qid, bbox);
      patchQuestion(qid, { bbox: q.bbox, bboxSource: q.bboxSource });
      showToast('已保存');
    } catch (e) {
      Alert.alert('保存失败', e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  const onReset = async (qid: number) => {
    try {
      const q = await resetBbox(qid);
      patchQuestion(qid, { bbox: q.bbox, bboxSource: q.bboxSource });
      showToast('插图位置已重置');
    } catch (e) {
      Alert.alert('操作失败', e instanceof Error ? e.message : String(e));
    }
  };

  const saveEdit = async () => {
    if (savingRef.current || !editQ) return;
    const text = editText.trim();
    if (!text) {
      showToast('题目文本不能为空');
      return;
    }
    setSaving(true);
    try {
      const q = await updateQuestion(editQ.id, { text });
      patchQuestion(editQ.id, { text: q.text });
      setEditQ(null);
      showToast('题目已更新');
    } catch (e) {
      Alert.alert('保存失败', e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  const doConfirm = async () => {
    if (savingRef.current) return;
    setSaving(true);
    try {
      await confirmExam(examId);
      showToast('已确认，开始二次识别');
      await refresh();
    } catch (e) {
      Alert.alert('确认失败', e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  const openRerecog = () => {
    if (!exam) return;
    setRerecogInclude(exam.includeIllustrations);
    setRerecogExtra(exam.extraPrompt || '');
    setRerecogVisible(true);
    loadModels();
  };

  const switchModel = async (displayName: string) => {
    const picked = models.find((m) => (m.name || m.model) === displayName);
    if (!picked || picked.enabled) return;
    try {
      await enableModel(picked.id);
      showToast('已切换识别模型');
      loadModels();
    } catch (e) {
      Alert.alert('切换失败', e instanceof Error ? e.message : String(e));
    }
  };

  const doRerecog = async () => {
    setRerecogVisible(false);
    if (savingRef.current) return;
    setSaving(true);
    try {
      await reRecognizeExam(examId, {
        includeIllustrations: rerecogInclude,
        extraPrompt: rerecogExtra,
      });
      showToast('已重新开始识别');
      await refresh();
    } catch (e) {
      Alert.alert('操作失败', e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  const st = exam ? examStatusOf(exam.status) : null;
  const questionCount = exam?.questions?.length ?? 0;
  const illustrations = exam?.questions.flatMap((q) => q.illustrations || []) || [];
  const activeIll = illustrations.find((ill) => ill.id === selectedIllId) || illustrations[0];

  return (
    <Screen>
      <SubHeader title={exam?.name || `试卷 #${examId}`} />

      {error ? (
        <Card>
          <Text style={{ color: C.danger }}>{error}</Text>
          <TextBtn danger onPress={refresh}>
            点击重试
          </TextBtn>
        </Card>
      ) : null}

      {!error && !exam ? <CenterMuted>加载中…</CenterMuted> : null}

      {exam && st ? (
        <ScrollView contentContainerStyle={{ paddingBottom: 20 }}>
          <Card>
            <View style={styles.examHead}>
              <Text style={styles.examTitle} numberOfLines={1}>
                {exam.name || `试卷 #${exam.id}`}
              </Text>
              <Tag color={st.color}>{st.text}</Tag>
            </View>
            <Muted>
              共 {questionCount} 题 · 上传于 {formatDate(exam.createdAt)}
            </Muted>

            <View style={styles.bar}>
              {POLLING.includes(exam.status) ? (
                <Btn kind="ghost" onPress={refresh}>
                  刷新
                </Btn>
              ) : null}
            </View>
          </Card>

          <Card>
            <Pressable accessibilityRole="button" accessibilityLabel="放大原图并调整插图" onPress={() => setIllPreviewVisible(true)}>
            <BboxEditor
              imageUrl={exam.imageUrl}
              questions={exam.questions}
              selectedId={selectedId}
              onlyIllustrations
              editable={false}
              onSelect={(qid) => onSelect(qid, 'image')}
              onUpdateBbox={onUpdateBbox}
            />
            <Muted style={styles.imageHint}>点击原图可放大查看、调整插图位置</Muted>
            </Pressable>
          </Card>

          <Card style={styles.questionsCard}>
            <View style={styles.questionsHeader}>
              <View style={styles.questionsHeading}>
                <Text style={styles.questionsTitle}>题目列表</Text>
                <Text style={styles.questionCount}>{questionCount}</Text>
              </View>
              {exam.status === 'awaiting_review' ? (
                <Btn small loading={saving} onPress={doConfirm}>二次识别</Btn>
              ) : null}
              {exam.status === 'failed' || exam.status === 'completed' ? (
                <Btn small kind="ghost" loading={saving} onPress={openRerecog}>↻ 重新识别</Btn>
              ) : null}
            </View>
            <View style={styles.questionsContent}>
            <QuestionTree
              questions={exam.questions}
              selectedId={selectedId}
              onSelect={onSelect}
              onAddWrong={(q) => {
                router.push({
                  pathname: '/add-wrong/[questionId]',
                  params: { questionId: String(q.id), subject: q.subject || '' },
                });
              }}
              onReset={onReset}
            />
            </View>
          </Card>
        </ScrollView>
      ) : null}

      {/* 居中浮窗：遮罩独立响应点击，窗内滚动和拖拽不会关闭 */}
      <Modal
        visible={illPreviewVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setIllPreviewVisible(false)}
      >
        <View style={styles.illPreviewMask}>
          <Pressable style={StyleSheet.absoluteFill} accessibilityRole="button" accessibilityLabel="关闭原图预览" onPress={() => setIllPreviewVisible(false)} />
        <View style={styles.illPreview}>
          <View style={styles.illPreviewBar}>
            <Text style={styles.illPreviewTitle}>预览与调整插图</Text>
            <TextBtn onPress={() => setIllPreviewVisible(false)}>完成</TextBtn>
          </View>
          <Muted style={styles.illPreviewTip}>点击插图框选中，拖动四角或边缘圆点调整大小；拖动框内调整位置，松手自动保存。</Muted>
          <ScrollView scrollEnabled={!illDragging} contentContainerStyle={{ padding: 12 }}>
            {exam ? (
              <BboxEditor
                imageUrl={exam.imageUrl}
                questions={exam.questions}
                selectedId={selectedId}
                onlyIllustrations
                onSelect={(qid) => onSelect(qid, 'image')}
                onUpdateBbox={onUpdateBbox}
                onUpdateIllBbox={onUpdateIllBbox}
                onInteractionChange={setIllDragging}
                onSelectIllustration={setSelectedIllId}
                selectedIllustrationId={activeIll?.id}
              />
            ) : null}
          </ScrollView>
        </View>
        </View>
      </Modal>

      {/* 编辑题目弹窗 */}
      <Mask visible={!!editQ} onClose={() => setEditQ(null)} dialogStyle={{ width: windowWidth * 0.8, maxWidth: windowWidth * 0.8, height: windowHeight * 0.8 }}>
        <Text style={styles.dialogTitle}>
          {editQ ? `编辑题目：第 ${editQ.questionNo} 题` : '编辑题目'}
        </Text>
        <ScrollView style={styles.editScroll} nestedScrollEnabled keyboardShouldPersistTaps="handled">
          <TextInput
            style={styles.textarea}
            value={editText}
            multiline
            placeholder="题目文本（数学公式用 $...$ 包裹）"
            placeholderTextColor={C.muted}
            onChangeText={setEditText}
          />
          <Muted style={styles.previewLabel}>预览：</Muted>
          <View style={styles.previewBox}>
            <MdRender content={editText} />
          </View>
          {editQ && (editQ.illustrations || []).length > 0 ? (
            <>
              <Muted style={styles.previewLabel}>
                插图（{editQ.illustrations.length} 张，按当前 bbox 裁剪）：
              </Muted>
              {editQ.illustrations.map((ill) => (
                <IllustrationImage
                  key={ill.id}
                  uri={illustrationImageUrl(ill)}
                  maxHeight={Math.max(80, windowHeight * 0.8 - 160)}
                />
              ))}
            </>
          ) : null}
        </ScrollView>
        <View style={styles.dialogBtns}>
          <Btn kind="ghost" small onPress={() => setEditQ(null)}>
            取消
          </Btn>
          <Btn small loading={saving} onPress={saveEdit}>
            保存
          </Btn>
        </View>
      </Mask>

      {/* 重新识别弹窗 */}
      <Mask visible={rerecogVisible} onClose={() => setRerecogVisible(false)}>
        <Text style={styles.dialogTitle}>重新识别</Text>
        <Muted style={{ marginBottom: 12 }}>将清除当前识别结果并重新识别整张试卷。</Muted>
        <View style={styles.switchRow}>
          <Switch value={rerecogInclude} onValueChange={setRerecogInclude} trackColor={{ true: C.primary }} />
          <Muted style={{ marginLeft: 8, flex: 1 }}>包含插图</Muted>
        </View>
        <Field label="补充提示词（可选）">
          <TextInput
            style={[styles.textarea, { minHeight: 60 }]}
            value={rerecogExtra}
            multiline
            maxLength={2000}
            placeholder="例如：这是一年级数学卷，注意区分手写答案与印刷题目"
            placeholderTextColor={C.muted}
            onChangeText={setRerecogExtra}
          />
        </Field>
        <View style={styles.dialogBtns}>
          <Btn kind="ghost" small onPress={() => setRerecogVisible(false)}>
            取消
          </Btn>
          <Btn small onPress={doRerecog}>
            开始识别
          </Btn>
          {models.length > 0 ? (
            <View style={styles.modelBoxSmall}>
              <OptionPicker
                options={models.map((m) => m.name || m.model)}
                value={modelName}
                onChange={(v) => void switchModel(v)}
                placeholder="选择模型"
              />
            </View>
          ) : (
            <Btn kind="ghost" small style={styles.modelBoxSmall} onPress={() => router.push('/models')}>
              选择模型
            </Btn>
          )}
        </View>
      </Mask>
    </Screen>
  );
}

const styles = StyleSheet.create({
  imageHint: { textAlign: 'center', marginTop: 12 },
  questionsCard: { padding: 0, overflow: 'hidden', borderWidth: StyleSheet.hairlineWidth, borderColor: C.border },
  questionsHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, padding: 14, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.border },
  questionsHeading: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  questionsTitle: { fontSize: 18, fontWeight: '600', color: C.textStrong },
  questionCount: { fontSize: 13, color: C.text, backgroundColor: C.bg, borderRadius: 5, paddingHorizontal: 7, paddingVertical: 2 },
  questionsContent: { padding: 14 },
  illPreviewMask: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 16, backgroundColor: 'rgba(0,0,0,0.45)' },
  illPreviewTip: { padding: 12, backgroundColor: C.bg },
  illPreview: {
    width: '100%',
    maxWidth: 960,
    height: '80%',
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: '#fff',
  },
  illPreviewBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: C.border,
    backgroundColor: '#fff',
  },
  illPreviewTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: C.textStrong,
  },
  examHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    marginBottom: 4,
  },
  examTitle: {
    flex: 1,
    fontSize: 16,
    fontWeight: '600',
    color: C.textStrong,
  },
  bar: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 10,
  },
  dialogTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: C.textStrong,
    marginBottom: 12,
    textAlign: 'center',
  },
  editScroll: {
    flex: 1,
  },
  textarea: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: C.border,
    borderRadius: 8,
    padding: 10,
    fontSize: 14,
    color: C.text,
    minHeight: 80,
    textAlignVertical: 'top',
  },
  previewLabel: {
    marginTop: 10,
    marginBottom: 4,
  },
  previewBox: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: C.border,
    borderRadius: 8,
    padding: 8,
    backgroundColor: '#fafbfc',
  },
  editIll: {
    width: '100%',
    aspectRatio: 2,
    marginBottom: 8,
    borderRadius: 8,
    backgroundColor: '#f0f0f0',
  },
  dialogBtns: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    gap: 10,
    marginTop: 12,
  },
  modelBoxSmall: {
    width: 110,
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
});
