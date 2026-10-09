import { useMemo, useRef, useState } from 'react';
import { Modal, PanResponder, Pressable, StyleSheet, Text, View, useWindowDimensions, type GestureResponderEvent } from 'react-native';
import { Image } from 'expo-image';
import { fitImageSize } from '@/utils/imageSize';

type Transform = { scale: number; x: number; y: number };
type Point = { x: number; y: number };
type Gesture = { count: number; center: Point; distance: number; start: Transform };

function touchGeometry(event: GestureResponderEvent) {
  const touches = event.nativeEvent.touches;
  if (!touches.length) return null;
  const first = touches[0], second = touches[1];
  return {
    count: second ? 2 : 1,
    center: second ? { x: (first.pageX + second.pageX) / 2, y: (first.pageY + second.pageY) / 2 } : { x: first.pageX, y: first.pageY },
    distance: second ? Math.hypot(first.pageX - second.pageX, first.pageY - second.pageY) : 0,
  };
}

/** 仅预览缩放，不改变插图裁剪范围。每次打开重新居中。 */
export function IllustrationPreview({ source, naturalSize, onClose }: {
  source: { uri: string; headers?: Record<string, string> };
  naturalSize?: { width: number; height: number };
  onClose: () => void;
}) {
  const window = useWindowDimensions();
  const [dimensions, setDimensions] = useState(naturalSize || { width: 240, height: 240 });
  const [transform, setTransform] = useState<Transform>({ scale: 1, x: 0, y: 0 });
  const transformRef = useRef<Transform>({ scale: 1, x: 0, y: 0 });
  const gestureRef = useRef<Gesture | null>(null);
  const size = fitImageSize(dimensions.width, dimensions.height, window.width * 0.9 - 32, window.height * 0.8 - 110);
  // 工厂仅创建触摸回调，ref.current 在手势发生时才访问。
  // eslint-disable-next-line react-hooks/refs
  const pan = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,
    onPanResponderGrant: (event) => {
      const geometry = touchGeometry(event);
      if (geometry) gestureRef.current = { ...geometry, start: { ...transformRef.current } };
    },
    onPanResponderMove: (event) => {
      const geometry = touchGeometry(event);
      if (!geometry) return;
      const previous = gestureRef.current;
      // 增减手指时以当前变换重新起算，防止从双指切换到单指时跳动。
      if (!previous || previous.count !== geometry.count) {
        gestureRef.current = { ...geometry, start: { ...transformRef.current } };
        return;
      }
      const scale = geometry.count === 2 && previous.distance > 0
        ? Math.max(0.5, Math.min(6, previous.start.scale * geometry.distance / previous.distance))
        : previous.start.scale;
      const next = {
        scale,
        x: 0,
        y: 0,
      };
      transformRef.current = next;
      setTransform(next);
    },
    onPanResponderStart: (event) => {
      const geometry = touchGeometry(event);
      if (geometry) gestureRef.current = { ...geometry, start: { ...transformRef.current } };
    },
    onPanResponderEnd: (event) => {
      const geometry = touchGeometry(event);
      gestureRef.current = geometry ? { ...geometry, start: { ...transformRef.current } } : null;
    },
    onPanResponderRelease: () => { gestureRef.current = null; },
    onPanResponderTerminate: () => { gestureRef.current = null; },
    onPanResponderTerminationRequest: () => false,
  }), []);
  const reset = () => {
    const initial = { scale: 1, x: 0, y: 0 };
    transformRef.current = initial;
    setTransform(initial);
  };
  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.mask}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityRole="button" accessibilityLabel="关闭插图预览" />
        <View style={[styles.dialog, { width: window.width * 0.9, height: window.height * 0.8 }]}>
          <View style={styles.header}>
            <Text style={styles.title}>插图预览</Text>
            <Pressable onPress={reset} accessibilityRole="button"><Text style={styles.action}>重置</Text></Pressable>
            <Pressable onPress={onClose} accessibilityRole="button"><Text style={styles.action}>关闭</Text></Pressable>
          </View>
          <View style={styles.stage} collapsable={false} {...pan.panHandlers}>
            <Image
              source={source}
              pointerEvents="none"
              contentFit="contain"
              cachePolicy={source.headers ? 'none' : 'disk'}
              style={[size, { transform: [{ translateX: transform.x }, { translateY: transform.y }, { scale: transform.scale }] }]}
              onLoad={({ source: loaded }) => {
                if (loaded.width && loaded.height) setDimensions({ width: loaded.width, height: loaded.height });
              }}
            />
          </View>
          <Text style={styles.hint}>双指放大或缩小插图</Text>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  mask: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.5)' },
  dialog: { backgroundColor: '#fff', borderRadius: 12, overflow: 'hidden' },
  header: { flexDirection: 'row', alignItems: 'center', padding: 16, gap: 20 },
  title: { flex: 1, fontSize: 16, fontWeight: '600', color: '#1d2129' },
  action: { color: '#165dff', paddingVertical: 4 },
  stage: { flex: 1, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  hint: { padding: 12, textAlign: 'center', color: '#86909c', fontSize: 12 },
});
