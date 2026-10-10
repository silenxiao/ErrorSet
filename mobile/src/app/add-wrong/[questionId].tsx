// 加入错题库：科目 + 正确答案（可编辑/预览切换）+ AI 分析 + 备注。
// 对齐小程序 pages/add-wrong；AI 结果解析逻辑保持一致。

import { useEffect, useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { analyzeQuestion, addWrongQuestion, getQuestion, illustrationImageUrl } from '@/api/question';
import { ApiError } from '@/api/http';
import { enableModel, listModels, type ModelProfile } from '@/api/settings';
import type { AnalysisResult, Question } from '@/types/question';
import { SUBJECT_OPTIONS } from '@/utils/format';
import { IllustrationImage } from '@/components/IllustrationImage';
import { MdRender } from '@/components/MdRender';
import { Btn, Field, Muted, OptionPicker, Screen, SubHeader, showToast, C } from '@/components/ui';

/**
 * AI 分析结果归一化。
 *
 * 新接口（GET /api/v1/questions/{id}/analyze）返回结构化 AnalysisResult；
 * 旧接口返回「科目：… 正确答案：… AI分析：…」纯文本。两种都要能读，
 * 否则后端一旦升级就整页报错。
 */
function normalizeAnalysis(res: unknown): {
  correct: string;
  analysis: string;
  knowledgePoints: string[];
  subject?: string;
} {
  if (res && typeof res === 'object') {
    const data = res as Partial<AnalysisResult>;
    return {
      correct: typeof data.answer === 'string' ? data.answer : '',
      analysis: typeof data.analysis === 'string' ? data.analysis : '',
      knowledgePoints: Array.isArray(data.knowledgePoints)
        ? data.knowledgePoints.filter((point): point is string => typeof point === 'string')
        : [],
      subject: typeof data.subject === 'string' ? data.subject : undefined,
    };
  }

  const text = typeof res === 'string' ? res : '';
  if (text.trim().startsWith('{')) {
    try {
      return normalizeAnalysis(JSON.parse(text));
    } catch {
      // 不是 JSON，按旧纯文本格式继续解析
    }
  }

  // 旧格式：科目行、「正确答案：」、「AI分析：」分段；两段先后顺序不稳定，
  // 谁在后谁的起始位置就是前一段的结束位置
  const subjectMatch = text.match(
    /^(?:科目|学科)：\s*(语文|数学|英语|物理|化学|生物|历史|政治|地理)/m,
  );
  const ansMarker = /^(?:正确答案|答案)：?\s*/m.exec(text);
  const anaMarker = /^(?:AI分析|分析|解析|解题过程)：?\s*/m.exec(text);
  const stripSubject = (s: string) => s.replace(/^(?:科目|学科)：.*\r?\n/gm, '').trim();
  let correct = '';
  let analysisText = '';
  if (ansMarker) {
    const end = anaMarker && anaMarker.index > ansMarker.index ? anaMarker.index : text.length;
    correct = stripSubject(text.slice(ansMarker.index + ansMarker[0].length, end));
  } else if (!anaMarker) {
    correct = stripSubject(text);
  }
  if (anaMarker) {
    const end = ansMarker && ansMarker.index > anaMarker.index ? ansMarker.index : text.length;
    analysisText = stripSubject(text.slice(anaMarker.index + anaMarker[0].length, end));
  }
  return {
    correct,
    analysis: analysisText,
    knowledgePoints: [],
    subject: subjectMatch ? subjectMatch[1] : undefined,
  };
}

export default function AddWrongPage() {
  const { questionId, subject } = useLocalSearchParams<{
    questionId: string;
    subject?: string;
  }>();
  const qid = Number(questionId);
  const router = useRouter();

  const [question, setQuestion] = useState<Question | null>(null);
  const [subjectValue, setSubjectValue] = useState(SUBJECT_OPTIONS[0]);
  const [correctAnswer, setCorrectAnswer] = useState('');
  const [analysis, setAnalysis] = useState('');
  /** AI 分析附带的知识点，随错题一起入库 */
  const [knowledgePoints, setKnowledgePoints] = useState<string[]>([]);
  const [note, setNote] = useState('');
  const [analyzing, setAnalyzing] = useState(false);
  const [saving, setSaving] = useState(false);

  // 识别模型（AI 分析与识别共用启用中的模型）
  const [models, setModels] = useState<ModelProfile[]>([]);
  const enabledModel = models.find((m) => m.enabled);
  const modelName = enabledModel ? enabledModel.name || enabledModel.model : '';
  // 正确答案默认以 Markdown 渲染预览，点铅笔切换为编辑
  const [editCorrect, setEditCorrect] = useState(false);

  useEffect(() => {
    getQuestion(qid)
      .then((q) => {
        setQuestion(q);
        if (q.subject && SUBJECT_OPTIONS.includes(q.subject)) setSubjectValue(q.subject);
        else if (subject && SUBJECT_OPTIONS.includes(subject)) setSubjectValue(subject);
        // 该题分析过但还没入库时，回显最近一次 AI 分析结果（后端持久化）
        const last = q.lastAnalysis;
        if (last && (last.answer || last.analysis)) {
          setCorrectAnswer(last.answer);
          setAnalysis(last.analysis);
          setKnowledgePoints(last.knowledgePoints || []);
          if (last.subject && SUBJECT_OPTIONS.includes(last.subject)) {
            setSubjectValue(last.subject);
          }
        }
      })
      .catch(() => {});
    listModels()
      .then(setModels)
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [qid]);

  const switchModel = async (displayName: string) => {
    const picked = models.find((m) => (m.name || m.model) === displayName);
    if (!picked || picked.enabled) return;
    try {
      await enableModel(picked.id);
      showToast('已切换识别模型');
      listModels().then(setModels).catch(() => {});
    } catch (e) {
      Alert.alert('切换失败', e instanceof Error ? e.message : String(e));
    }
  };

  const aiAnalyze = async () => {
    if (analyzing) return;
    setAnalyzing(true);
    try {
      const res = await analyzeQuestion(qid);
      // 与 Web 端一致的解析：结构化字段直接取用，兼容旧版纯文本返回
      const parsed = normalizeAnalysis(res);
      setCorrectAnswer(parsed.correct);
      setAnalysis(parsed.analysis);
      setKnowledgePoints(parsed.knowledgePoints);
      if (parsed.subject && SUBJECT_OPTIONS.includes(parsed.subject)) {
        setSubjectValue(parsed.subject);
      }
      setEditCorrect(false);
      showToast('AI 分析完成');
    } catch (e) {
      Alert.alert('AI 分析失败', e instanceof Error ? e.message : String(e));
    } finally {
      setAnalyzing(false);
    }
  };

  const save = async (overwrite?: boolean) => {
    if (saving) return;
    setSaving(true);
    try {
      await addWrongQuestion({
        questionId: qid,
        answer: '',
        correctAnswer,
        subject: subjectValue,
        analysis,
        knowledgePoints,
        note,
        overwrite: overwrite === true,
      });
      showToast('已加入错题库');
      setTimeout(() => router.back(), 600);
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) {
        // 已在错题库：询问是否以本次填写的内容覆盖旧错题
        Alert.alert('该题已加入错题库', '是否以最新的解答覆盖以前的错题？', [
          { text: '取消', style: 'cancel' },
          { text: '覆盖', onPress: () => void save(true) },
        ]);
      } else {
        Alert.alert('加入失败', e instanceof Error ? e.message : String(e));
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <Screen>
      <SubHeader title={question ? `加入错题库：第 ${question.questionNo} 题` : '加入错题库'} />

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={{ padding: 10, paddingBottom: 30 }} keyboardShouldPersistTaps="handled">
          <Field label="科目">
            <OptionPicker options={SUBJECT_OPTIONS} value={subjectValue} onChange={setSubjectValue} />
          </Field>
          {question && (
            <View style={styles.section}>
              <Text style={styles.label}>题目</Text>
              <View style={styles.previewBox}>
                <MdRender content={question.text} />
                {question.illustrations.map((ill) => (
                  <IllustrationImage key={ill.id} uri={illustrationImageUrl(ill)} />
                ))}
              </View>
            </View>
          )}

          {/* 正确答案：默认 Markdown 预览，右上角铅笔切换编辑 */}
          <View style={styles.section}>
            <View style={styles.labelRow}>
              <Text style={styles.label}>正确答案</Text>
              <TouchableOpacity activeOpacity={0.6} onPress={() => setEditCorrect(!editCorrect)} hitSlop={6}>
                <Feather name="edit-2" size={16} color={C.primary} />
              </TouchableOpacity>
            </View>
            {editCorrect ? (
              <TextInput
                style={[styles.textarea, { minHeight: 70 }]}
                value={correctAnswer}
                multiline
                placeholder="填写正确答案"
                placeholderTextColor={C.muted}
                onChangeText={setCorrectAnswer}
              />
            ) : (
              <TouchableOpacity activeOpacity={0.8} style={styles.previewBox} onPress={() => setEditCorrect(true)}>
                {correctAnswer ? (
                  <MdRender content={correctAnswer} />
                ) : (
                  <Muted>AI 分析后显示正确答案（点击可手动填写）</Muted>
                )}
              </TouchableOpacity>
            )}
          </View>

          <View style={styles.aiRow}>
            <Btn loading={analyzing} onPress={aiAnalyze} style={styles.aiBtnGrow}>
              AI 分析
            </Btn>
            {models.length > 0 ? (
              <View style={styles.modelBox}>
                <OptionPicker
                  options={models.map((m) => m.name || m.model)}
                  value={modelName}
                  onChange={(v) => void switchModel(v)}
                  placeholder="选择模型"
                />
              </View>
            ) : (
              <Btn kind="ghost" style={styles.modelBox} onPress={() => router.push('/models')}>
                选择模型
              </Btn>
            )}
          </View>

          <View style={styles.section}>
            <Text style={styles.label}>AI 分析结果</Text>
            <View style={styles.previewBox}>
              {analysis ? <MdRender content={analysis} /> : <Muted>点击 AI 分析后显示结果</Muted>}
            </View>
          </View>

          <View style={styles.section}>
            <Text style={styles.label}>备注</Text>
            <TextInput
              style={[styles.textarea, { minHeight: 60 }]}
              value={note}
              multiline
              placeholder="可选"
              placeholderTextColor={C.muted}
              onChangeText={setNote}
            />
          </View>

          <View style={styles.footer}>
            <Btn kind="ghost" small onPress={() => router.back()}>
              取 消
            </Btn>
            <Btn small loading={saving} onPress={save}>
              确 定
            </Btn>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  aiRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  aiBtnGrow: {
    flex: 1,
  },
  modelBox: {
    width: 130,
  },
  section: {
    marginBottom: 12,
  },
  labelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  label: {
    fontSize: 13,
    color: C.textStrong,
    marginBottom: 6,
  },
  textarea: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: C.border,
    borderRadius: 8,
    padding: 10,
    fontSize: 14,
    color: C.text,
    backgroundColor: '#fff',
    textAlignVertical: 'top',
  },
  previewBox: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: C.border,
    borderRadius: 8,
    padding: 10,
    backgroundColor: '#fff',
    minHeight: 44,
    justifyContent: 'center',
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10,
    marginTop: 4,
  },
});
