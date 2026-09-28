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
import { analyzeQuestion, addWrongQuestion, getQuestion } from '@/api/question';
import type { Question } from '@/types/question';
import { SUBJECT_OPTIONS } from '@/utils/format';
import { extractAnswerFromAnalysis } from '@/utils/analysis';
import { MdRender } from '@/components/MdRender';
import { Btn, Field, Muted, OptionPicker, Screen, SubHeader, showToast, C } from '@/components/ui';

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
  const [note, setNote] = useState('');
  const [analyzing, setAnalyzing] = useState(false);
  const [saving, setSaving] = useState(false);
  // 正确答案默认以 Markdown 渲染预览，点铅笔切换为编辑
  const [editCorrect, setEditCorrect] = useState(false);

  useEffect(() => {
    getQuestion(qid)
      .then((q) => {
        setQuestion(q);
        if (q.subject && SUBJECT_OPTIONS.includes(q.subject)) setSubjectValue(q.subject);
        else if (subject && SUBJECT_OPTIONS.includes(subject)) setSubjectValue(subject);
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [qid]);

  const aiAnalyze = async () => {
    if (analyzing) return;
    setAnalyzing(true);
    try {
      const res = await analyzeQuestion(qid);
      // 与小程序/web 端一致的解析：科目行、"正确答案："、"AI分析："分段
      const subjectMatch = res.match(/^(?:科目|学科)：\s*(语文|数学|英语|物理|化学|生物|历史|政治|地理)/m);
      const ansMarker = /^(?:正确答案|答案)：?\s*/m.exec(res);
      const anaMarker = /^(?:AI分析|分析|解析|解题过程)：?\s*/m.exec(res);
      const stripSubject = (s: string) => s.replace(/^(?:科目|学科)：.*\r?\n/gm, '').trim();
      let correct = '';
      let analysisText = '';
      if (ansMarker) {
        const end = anaMarker ? anaMarker.index : res.length;
        correct = stripSubject(res.slice(ansMarker.index + ansMarker[0].length, end));
      } else {
        correct = stripSubject(res);
      }
      if (anaMarker) {
        analysisText = stripSubject(res.slice(anaMarker.index + anaMarker[0].length));
      }
      // "正确答案"以 AI 分析推导出的最终结论为准
      const extracted = extractAnswerFromAnalysis(analysisText);
      const patch: { correct: string; analysis: string; subject?: string } = {
        correct: extracted || correct,
        analysis: analysisText,
      };
      if (subjectMatch) {
        const s = subjectMatch[1];
        if (SUBJECT_OPTIONS.includes(s)) patch.subject = s;
      }
      setCorrectAnswer(patch.correct);
      setAnalysis(patch.analysis);
      if (patch.subject) setSubjectValue(patch.subject);
      setEditCorrect(false);
      showToast(extracted && extracted !== correct.trim() ? '已按 AI 分析的结论显示正确答案' : 'AI 分析完成');
    } catch (e) {
      Alert.alert('AI 分析失败', e instanceof Error ? e.message : String(e));
    } finally {
      setAnalyzing(false);
    }
  };

  const save = async () => {
    if (saving) return;
    setSaving(true);
    try {
      await addWrongQuestion({
        questionId: qid,
        answer: '',
        correctAnswer,
        subject: subjectValue,
        analysis,
        wrongReason: '',
        knowledgePoints: [],
        note,
      });
      showToast('已加入错题库');
      setTimeout(() => router.back(), 600);
    } catch (e) {
      Alert.alert('加入失败', e instanceof Error ? e.message : String(e));
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

          {/* 正确答案：默认 Markdown 预览，右上角铅笔切换编辑 */}
          <View style={styles.section}>
            <View style={styles.labelRow}>
              <Text style={styles.label}>正确答案</Text>
              <TouchableOpacity activeOpacity={0.6} onPress={() => setEditCorrect(!editCorrect)}>
                <Text style={styles.editIcon}>✎</Text>
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

          <Btn block loading={analyzing} onPress={aiAnalyze} style={{ marginBottom: 12 }}>
            AI 分析
          </Btn>

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
  editIcon: {
    fontSize: 16,
    color: C.primary,
    paddingHorizontal: 6,
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
