// 试卷 Tab：上传试卷（拍照/相册）+ 历史试卷列表（识别中自动轮询）。
// 对齐小程序 pages/upload。

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Alert,
  FlatList,
  RefreshControl,
  StyleSheet,
  Switch,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Image } from 'expo-image';
import { useRouter, useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import { createExam, deleteExam, listExams } from '@/api/exam';
import type { ExamListItem } from '@/types/exam';
import { GRADE_OPTIONS, examStatusOf, formatDate } from '@/utils/format';
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
  const [grade, setGrade] = useState(GRADE_OPTIONS[0]);
  const [includeIllustrations, setIncludeIllustrations] = useState(false);
  const [uploading, setUploading] = useState(false);

  const router = useRouter();
  const insets = useSafeAreaInsets();
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
      return () => {
        if (timerRef.current) clearInterval(timerRef.current);
        timerRef.current = null;
      };
    }, [loadExams]),
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

  return (
    <Screen>
      <FlatList
        data={exams}
        keyExtractor={(item) => String(item.id)}
        contentContainerStyle={{ paddingTop: insets.top + 8, paddingBottom: 16 }}
        refreshControl={
          <RefreshControl refreshing={loading} onRefresh={() => loadExams()} tintColor={C.primary} colors={[C.primary]} />
        }
        ListHeaderComponent={
          <>
            <Card>
              <CardTitle>上传试卷</CardTitle>

              {!imageUri ? (
                <TouchableOpacity activeOpacity={0.7} style={styles.uploader} onPress={chooseImage}>
                  <Text style={styles.plus}>＋</Text>
                  <Muted style={{ textAlign: 'center' }}>
                    点击选择试卷照片{'\n'}（JPG/PNG/WebP，≤10MB，一张图=一份试卷）
                  </Muted>
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

              <Field label="年级">
                <OptionPicker options={GRADE_OPTIONS} value={grade} onChange={setGrade} />
              </Field>

              <Field label="试卷名称">
                <Input value={name} placeholder="例如：数学月考（默认取文件名）" onChangeText={setName} />
              </Field>

              <View style={styles.switchRow}>
                <Switch value={includeIllustrations} onValueChange={setIncludeIllustrations} trackColor={{ true: C.primary }} />
                <Muted style={{ flex: 1, marginLeft: 8 }}>包含插图：开=识别题目和插图（更慢更贵）</Muted>
              </View>

              <Btn block loading={uploading} onPress={upload}>
                上传并开始识别
              </Btn>
            </Card>

            <Card>
              <CardTitle>历史试卷</CardTitle>
              {error ? <ErrBox message={error} onRetry={() => loadExams()} /> : null}
              {!error && exams.length === 0 && !loading ? <Muted>暂无试卷</Muted> : null}
            </Card>
          </>
        }
        renderItem={({ item }) => {
          const st = examStatusOf(item.status);
          return (
            <Card style={styles.examRow}>
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
            </Card>
          );
        }}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  uploader: {
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: '#d0d3d8',
    borderRadius: 10,
    paddingVertical: 34,
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  plus: {
    fontSize: 34,
    color: '#bbb',
    lineHeight: 40,
  },
  preview: {
    alignItems: 'center',
    marginBottom: 12,
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
    marginBottom: 12,
  },
  examRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  examMain: {
    flex: 1,
  },
  examName: {
    fontSize: 15,
    fontWeight: '600',
    color: C.textStrong,
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
