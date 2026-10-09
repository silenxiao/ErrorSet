import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Modal, PanResponder, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { Image } from 'expo-image';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { File } from 'expo-file-system';
import { fitImageSize } from '@/utils/imageSize';
import { applyDrag } from '@/utils/bbox';
import { cropPixels } from '@/utils/examImage';

export type ExamImage = { uri: string; width: number; height: number };
const FULL = [0, 0, 1000, 1000];
const HANDLES = [ ['nw', 0, 0], ['n', 50, 0], ['ne', 100, 0], ['e', 100, 50],
  ['se', 100, 100], ['s', 50, 100], ['sw', 0, 100], ['w', 0, 50] ] as const;

export function ExamImageEditor({ source, onCancel, onConfirm }: {
  source: ExamImage; onCancel: () => void; onConfirm: (result: ExamImage) => void;
}) {
  const window = useWindowDimensions();
  const dialogWidth = Math.min(window.width - 32, 800);
  const [angle, setAngle] = useState(0);
  const [box, setBox] = useState(FULL);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const width = angle % 180 ? source.height : source.width;
  const height = angle % 180 ? source.width : source.height;
  const size = fitImageSize(width, height, dialogWidth - 32, Math.max(80, window.height - 280));
  const current = useRef({ box, size });
  useEffect(() => { current.current = { box, size }; }, [box, size]);
  const makeResponder = useCallback((mode: string) => {
    let start = FULL;
    return PanResponder.create({
      onStartShouldSetPanResponder: () => !busyRef.current,
      onPanResponderGrant: () => { start = current.current.box.slice(); },
      onPanResponderMove: (_e, gesture) => {
        if (busyRef.current) return;
        const next = applyDrag(start, gesture.dx * 1000 / current.current.size.width,
          gesture.dy * 1000 / current.current.size.height, mode);
        current.current.box = next;
        setBox(next);
      },
      onPanResponderTerminationRequest: () => false,
      onPanResponderTerminate: () => { current.current.box = start; setBox(start); },
    });
  }, []);
  const responders = useMemo(() => {
    const result = new Map<string, ReturnType<typeof PanResponder.create>>();
    // 创建 responder 只注册回调；refs 在触摸事件触发时读取，渲染期间不读取。
    // eslint-disable-next-line react-hooks/refs
    ['move', ...HANDLES.map(h => h[0])].forEach(mode => {
      result.set(mode, makeResponder(mode));
    });
    return result;
  }, [makeResponder]);

  const reset = (nextAngle: number) => { setAngle(nextAngle); setBox(FULL); };
  const confirm = async () => {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    try {
      // 始终明确输出 JPEG，文件内容、上传后缀和 MIME 保持一致。
      const context = ImageManipulator.manipulate(source.uri);
      if (angle) context.rotate(angle);
      context.crop(cropPixels(box, width, height));
      const rendered = await context.renderAsync();
      const result = await rendered.saveAsync({ format: SaveFormat.JPEG, compress: 1 });
      if (new File(result.uri).size > 10 * 1024 * 1024) {
        Alert.alert('提示', '编辑后图片超过10MB，请缩小裁剪范围');
        return;
      }
      onConfirm({ uri: result.uri, width: result.width, height: result.height });
    } catch (error) {
      Alert.alert('图片编辑失败', error instanceof Error ? error.message : String(error));
    } finally { busyRef.current = false; setBusy(false); }
  };

  return <Modal transparent visible animationType="fade" onRequestClose={() => { if (!busyRef.current) onCancel(); }}>
    <View style={styles.mask}><View style={[styles.dialog, { width: dialogWidth }]}>
      <Text style={styles.title}>图片编辑</Text>
      <Text style={styles.hint}>拖动蓝色框体移动位置，拖动八向手柄调整裁剪范围</Text>
      <View style={styles.stage}><View style={size}>
        <Image source={{ uri: source.uri }} contentFit="contain" pointerEvents="none" style={{
          position: 'absolute', width: angle % 180 ? size.height : size.width,
          height: angle % 180 ? size.width : size.height,
          left: angle % 180 ? (size.width - size.height) / 2 : 0,
          top: angle % 180 ? (size.height - size.width) / 2 : 0,
          transform: [{ rotate: `${angle}deg` }],
        }} />
        <View {...responders.get('move')!.panHandlers} style={[styles.crop, {
          left: box[0] * size.width / 1000, top: box[1] * size.height / 1000,
          width: (box[2] - box[0]) * size.width / 1000, height: (box[3] - box[1]) * size.height / 1000,
        }]}>
          {HANDLES.map(([mode, x, y]) => <View key={mode} {...responders.get(mode)!.panHandlers}
            style={[styles.handle, { left: `${x}%`, top: `${y}%` }]}><View style={styles.dot} /></View>)}
        </View>
      </View></View>
      <View style={styles.actions}>
        {['取消', '旋转', '恢复原图', '确认'].map((label, index) =>
          <Pressable key={String(label)} accessibilityRole="button" disabled={busy} onPress={() => { if (index === 0) onCancel(); else if (index === 1) reset((angle + 90) % 360); else if (index === 2) reset(0); else void confirm(); }}
            style={({ pressed }) => [styles.button, index === 0 && styles.cancel, index === 3 && styles.confirm, (busy || pressed) && { opacity: 0.6 }]}>
            {busy && index === 3 ? <ActivityIndicator color="#fff" /> : <Text style={[styles.buttonText, index === 0 && { color: '#4e5969' }, index === 3 && { color: '#fff' }]}>{String(label)}</Text>}
          </Pressable>)}
      </View>
    </View></View>
  </Modal>;
}

const styles = StyleSheet.create({
  mask: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,.5)' },
  dialog: { width: '92%', padding: 16, backgroundColor: '#fff', borderRadius: 12 },
  title: { fontSize: 18, fontWeight: '600' },
  hint: { fontSize: 12, color: '#86909c', marginTop: 8, marginBottom: 16 },
  stage: { alignItems: 'center', paddingVertical: 14 },
  crop: { position: 'absolute', borderWidth: 2, borderColor: '#165dff', backgroundColor: 'rgba(22,93,255,.1)' },
  handle: { position: 'absolute', width: 28, height: 28, marginLeft: -14, marginTop: -14, alignItems: 'center', justifyContent: 'center', zIndex: 2 },
  dot: { width: 12, height: 12, borderRadius: 6, backgroundColor: '#fff', borderWidth: 2, borderColor: '#165dff' },
  actions: { flexDirection: 'row', gap: 8, marginTop: 16, paddingTop: 16, borderTopWidth: 1, borderTopColor: '#e5e6eb' },
  button: { flex: 1, height: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 8, backgroundColor: '#f0f5ff', borderWidth: 1, borderColor: '#dce5f5' },
  cancel: { backgroundColor: '#f7f8fa', borderColor: '#e5e6eb' },
  confirm: { backgroundColor: '#165dff', borderColor: '#165dff' },
  buttonText: { fontSize: 13, fontWeight: '500', color: '#165dff' },
});
