// 试卷 Tab：上传试卷（拍照/相册）+ 历史试卷列表（识别中自动轮询）。
// 对齐小程序 pages/upload。结构：上传卡片 + 表单卡片 + 历史试卷卡片（条目带细分割线）。

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Alert,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Image } from 'expo-image';
import { Feather } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import { useRouter, useFocusEffect } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { createExam, deleteExam, listExams } from '@/api/exam';
import { enableModel, listModels, type ModelProfile } from '@/api/settings';
import type { ExamListItem } from '@/types/exam';
import { GRADE_OPTIONS, examStatusOf, formatDate } from '@/utils/format';
import { getGradeSync } from '@/api/session';
import {
  Btn,
  Card,
  CardTitle,
  ErrBox,
  Field,
  Input,
  Muted,
  OptionPicker,
  Screen,
  Tag,
  TextBtn,
  showToast,
  C,
} from '@/components/ui';

// 未到终态的状态：存在时列表需要轮询同步
const ACTIVE_STATUSES = ['uploaded', 'global_processing', 'local_processing'];
const POLL_INTERVAL = 3000;

export default function ExamScreen() {
  const [exams, setExams] = useState<ExamListItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // 上传表单
  const [imageUri, setImageUri] = useState('');
  const [name, setName] = useState('');
  const [grade, setGrade] = useState(() => {
    // 默认年级：上次手动选择 > 注册时选择的年级 > 一年级
    const saved = getGradeSync();
    return saved && GRADE_OPTIONS.includes(saved) ? saved : GRADE_OPTIONS[0];
  });
  const [includeIllustrations, setIncludeIllustrations] = useState(false);
  const [uploading, setUploading] = useState(false);

  // 识别模型（与 Web 端上传页一致：切换即独占启用）
  const [models, setModels] = useState<ModelProfile[]>([]);
  const enabledModel = models.find((m) => m.enabled);
  const modelName = enabledModel ? enabledModel.name || enabledModel.model : '';

  const loadModels = useCallback(async () => {
    try {
      setModels((await listModels()) || []);
    } catch {
      // 模型列表加载失败不阻塞上传主流程
    }
  }, []);

  const router = useRouter();
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const loadExams = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    setError('');
    try {
      const list = await listExams();
      setExams(list || []);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg);
      if (!silent) showToast(msg || '加载失败');
    } finally {
      setLoading(false);
    }
  }, []);

  // 每次进入 Tab 都刷新，保证新增/识别状态及时显示
  useFocusEffect(
    useCallback(() => {
      loadExams();
      loadModels();
      return () => {
        if (timerRef.current) clearInterval(timerRef.current);
        timerRef.current = null;
      };
    }, [loadExams, loadModels]),
  );

  // 有试卷在识别流程中时轮询，全部到终态后停止
  useEffect(() => {
    const active = exams.some((e) => ACTIVE_STATUSES.includes(e.status));
    if (active && !timerRef.current) {
      timerRef.current = setInterval(() => loadExams(true), POLL_INTERVAL);
    } else if (!active && timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, [exams, loadExams]);

  const chooseImage = () => {
    Alert.alert('选择试卷照片', undefined, [
      { text: '拍照', onPress: () => pick(ImagePicker.MediaTypeOptions.Images, true) },
      { text: '从相册选择', onPress: () => pick(ImagePicker.MediaTypeOptions.Images, false) },
      { text: '取消', style: 'cancel' as const },
    ]);
  };

  const pick = async (
    mediaTypes: ImagePicker.MediaTypeOptions,
    useCamera: boolean,
  ) => {
    const perm = useCamera
      ? await ImagePicker.requestCameraPermissionsAsync()
      : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert('提示', '需要授权访问相机/相册才能选择试卷照片');
      return;
    }
    const result = useCamera
      ? await ImagePicker.launchCameraAsync({ mediaTypes, quality: 0.9 })
      : await ImagePicker.launchImageLibraryAsync({ mediaTypes, quality: 0.9 });
    if (result.canceled || !result.assets?.[0]) return;
    const asset = result.assets[0];
    if (asset.fileSize && asset.fileSize > 10 * 1024 * 1024) {
      Alert.alert('提示', '图片超过 10MB，请压缩后再试');
      return;
    }
    setImageUri(asset.uri);
    if (!name) {
      const fileName = asset.fileName || asset.uri.split('/').pop() || '';
      setName(fileName.replace(/\.(jpe?g|png|webp|heic)$/i, ''));
    }
  };

  const upload = async () => {
    if (!imageUri) {
      showToast('请先选择图片');
      return;
    }
    setUploading(true);
    try {
      const fileName = imageUri.split('/').pop() || `exam_${Date.now()}.jpg`;
      const created = await createExam(
        { uri: imageUri, name: fileName, type: 'image/jpeg' },
        name,
        includeIllustrations,
        grade,
      );
      showToast('上传成功，开始识别');
      setImageUri('');
      setName('');
      router.push({ pathname: '/recognition/[id]', params: { id: String(created.id) } });
    } catch (e) {
      Alert.alert('上传失败', e instanceof Error ? e.message : String(e));
    } finally {
      setUploading(false);
    }
  };

  const delExam = (item: ExamListItem) => {
    Alert.alert('删除试卷', '确定删除该试卷及其识别结果？', [
      { text: '取消', style: 'cancel' },
      {
        text: '删除',
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteExam(item.id);
            showToast('已删除');
            loadExams();
          } catch (e) {
            Alert.alert('删除失败', e instanceof Error ? e.message : String(e));
          }
        },
      },
    ]);
  };

  const openExam = (item: ExamListItem) => {
    router.push({ pathname: '/recognition/[id]', params: { id: String(item.id) } });
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

  return (
    <Screen>
      {/* 页头为主蓝底：状态栏用浅色内容 */}
      <StatusBar style="light" />
      <ScrollView
        contentContainerStyle={{ paddingBottom: 16 }}
        refreshControl={
          <RefreshControl refreshing={loading} onRefresh={() => loadExams()} tintColor={C.primary} colors={[C.primary]} />
        }
      >
        {/* 1. 上传卡片：白卡内虚线上传区 */}
        <Card>
          {!imageUri ? (
            <TouchableOpacity activeOpacity={0.7} style={styles.uploader} onPress={chooseImage}>
              <Feather name="plus" size={44} color={C.primary} />
              <Text style={styles.uploaderText}>点击选择试卷照片</Text>
              <Muted>（JPG/PNG/WebP，≤10MB，一张图=一份试卷）</Muted>
            </TouchableOpacity>
          ) : (
            <View style={styles.preview}>
              <TouchableOpacity activeOpacity={0.8} onPress={chooseImage}>
                <Image source={{ uri: imageUri }} style={styles.previewImg} contentFit="contain" />
              </TouchableOpacity>
              <TextBtn danger onPress={() => setImageUri('')}>
                移除
              </TextBtn>
            </View>
          )}
        </Card>

        {/* 2. 表单卡片 */}
        <Card>
          <Field label="年级">
            <OptionPicker options={GRADE_OPTIONS} value={grade} onChange={setGrade} />
          </Field>

          <Field label="试卷名称">
            <Input value={name} placeholder="例如：数学月考（默认取文件名）" onChangeText={setName} />
          </Field>

          <View style={styles.switchRow}>
            <Muted style={styles.switchText}>包含插图：开=识别题目和插图（更慢更贵）</Muted>
            {/* 外层 Pressable 提供 ≥44px 点击区域，Switch 自身关闭手势 */}
            <TouchableOpacity
              activeOpacity={0.6}
              style={styles.switchBox}
              onPress={() => setIncludeIllustrations((v) => !v)}
            >
              <Switch
                value={includeIllustrations}
                onValueChange={setIncludeIllustrations}
                trackColor={{ true: C.primary }}
                pointerEvents="none"
              />
            </TouchableOpacity>
          </View>

          <View style={styles.submitRow}>
            <Btn loading={uploading} style={styles.submitGrow} onPress={upload}>
              上传并开始识别
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
        </Card>

        {/* 3. 历史试卷卡片：条目 + 细分割线 */}
        <Card>
          <CardTitle>历史试卷</CardTitle>

          {error ? <ErrBox message={error} onRetry={() => loadExams()} /> : null}
          {!error && exams.length === 0 && !loading ? <Muted>暂无试卷</Muted> : null}

          {exams.map((item, idx) => {
            const st = examStatusOf(item.status);
            const last = idx === exams.length - 1;
            return (
              <View key={String(item.id)} style={[styles.examRow, last && styles.examRowLast]}>
                <TouchableOpacity activeOpacity={0.7} style={styles.examMain} onPress={() => openExam(item)}>
                  <Text style={styles.examName} numberOfLines={1}>
                    {item.name}
                  </Text>
                  <Muted>
                    题目数 {item.questionCount} · {formatDate(item.createdAt)}
                  </Muted>
                </TouchableOpacity>
                <View style={styles.examSide}>
                  <Tag color={st.color}>{st.text}</Tag>
                  <View style={styles.examBtns}>
                    <TextBtn onPress={() => openExam(item)}>打开</TextBtn>
                    <TextBtn danger onPress={() => delExam(item)}>
                      删除
                    </TextBtn>
                  </View>
                </View>
              </View>
            );
          })}
        </Card>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  uploader: {
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: '#C9D8FF',
    borderRadius: 8,
    paddingVertical: 34,
    paddingHorizontal: 16,
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#fff',
  },
  uploaderText: {
    fontSize: 16,
    color: C.text,
    fontWeight: '500',
  },
  preview: {
    alignItems: 'center',
  },
  previewImg: {
    width: '100%',
    aspectRatio: 3 / 4,
    borderRadius: 8,
    backgroundColor: '#f0f0f0',
    marginBottom: 6,
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  switchText: {
    flex: 1,
    marginRight: 8,
  },
  // 开关点击区域 ≥44px
  switchBox: {
    minWidth: 44,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  submitRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  submitGrow: {
    flex: 1,
  },
  modelBox: {
    width: 130,
  },
  examRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: C.border,
  },
  examRowLast: {
    borderBottomWidth: 0,
  },
  examMain: {
    flex: 1,
  },
  examName: {
    fontSize: 16,
    fontWeight: '600',
    color: C.text,
    marginBottom: 3,
  },
  examSide: {
    alignItems: 'flex-end',
    gap: 4,
  },
  examBtns: {
    flexDirection: 'row',
  },
});
