import { useState } from 'react';
import { Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { Image } from 'expo-image';
import { BACKEND_BASE } from '@/api/config';
import { getTokenSync } from '@/api/session';
import { fitImageSize } from '@/utils/imageSize';
import { IllustrationPreview } from './IllustrationPreview';

/** 裁剪插图：动态接口携带登录凭证，按真实比例展示并保留可见高度。 */
export function IllustrationImage({ uri, maxHeight }: { uri: string; maxHeight?: number }) {
  const window = useWindowDimensions();
  const [availableWidth, setAvailableWidth] = useState(0);
  const [naturalSize, setNaturalSize] = useState<{ uri: string; width: number; height: number } | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [previewVisible, setPreviewVisible] = useState(false);
  const token = getTokenSync();
  const authenticated = uri.startsWith(`${BACKEND_BASE}/api/v1/illustrations/`);
  const imageSource = { uri, ...(authenticated && token ? { headers: { Authorization: `Bearer ${token}` } } : {}) };
  const limitHeight = maxHeight ?? Math.max(80, window.height * 0.8 - 100);
  const size = naturalSize?.uri === uri && availableWidth > 0
    ? fitImageSize(naturalSize.width, naturalSize.height, availableWidth, limitHeight)
    : { width: Math.min(availableWidth || 120, 120), height: Math.min(limitHeight, 120) };
  return (
    <View style={styles.container} onLayout={({ nativeEvent }) => setAvailableWidth(nativeEvent.layout.width)}>
      <Pressable style={{ alignSelf: 'flex-start' }} accessibilityRole="button" accessibilityLabel="放大查看插图" onPress={() => setPreviewVisible(true)}>
      <Image
        key={`${uri}:${attempt}`}
        source={imageSource}
        style={[styles.image, size]}
        contentFit="contain"
        cachePolicy={authenticated ? 'none' : 'disk'}
        onLoad={({ source }) => {
          if (source.width && source.height) setNaturalSize({ uri, width: source.width, height: source.height });
          setFailed(false);
        }}
        onError={() => setFailed(true)}
      />
      </Pressable>
      {previewVisible ? <IllustrationPreview source={imageSource} naturalSize={naturalSize?.uri === uri ? naturalSize : undefined} onClose={() => setPreviewVisible(false)} /> : null}
      {failed ? <Pressable onPress={() => { setFailed(false); setAttempt((value) => value + 1); }}><Text style={styles.error}>插图加载失败，点击重试</Text></Pressable> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { width: '100%', flexShrink: 0, marginBottom: 8 },
  image: { alignSelf: 'flex-start', borderRadius: 8, backgroundColor: '#f7f8fa' },
  error: { color: '#86909c', fontSize: 12, paddingVertical: 8 },
});
