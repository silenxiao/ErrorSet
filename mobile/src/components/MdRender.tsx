// Markdown / LaTeX 渲染：复用小程序的纯 JS 渲染器（utils/markdown.js 输出
// 内联样式 HTML），放进 WebView 展示并通过 postMessage 回报内容高度做自适应。

import { useMemo, useState } from 'react';
import { StyleSheet } from 'react-native';
import { WebView } from 'react-native-webview';
import { mdHtml, esc } from '@/utils/markdown';

// 内容高度变化时回报（初始、load、延迟兜底、ResizeObserver）
const HEIGHT_JS = `(function(){
  function p(){
    var h=document.body?document.body.scrollHeight:0;
    window.ReactNativeWebView.postMessage(JSON.stringify({t:'h',v:h}));
  }
  p();setTimeout(p,80);setTimeout(p,300);window.addEventListener('load',p);
  if(typeof ResizeObserver!=='undefined'){new ResizeObserver(p).observe(document.documentElement);}
  return true;
})();`;

function wrapHtml(html: string): string {
  return `<html><head><meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no"></head>` +
    `<body style="margin:0;padding:0;background:transparent;">${html}</body></html>`;
}

export function MdRender({ content }: { content: string | null | undefined }) {
  const [height, setHeight] = useState(0);

  const html = useMemo(() => {
    const src = String(content ?? '');
    try {
      return mdHtml(src) as string;
    } catch {
      return esc(src) as string;
    }
  }, [content]);

  const onMessage = (e: { nativeEvent: { data: string } }) => {
    try {
      const msg = JSON.parse(e.nativeEvent.data);
      if (msg?.t === 'h' && typeof msg.v === 'number' && msg.v > 0) {
        setHeight(Math.ceil(msg.v));
      }
    } catch {
      // 忽略非 JSON 消息
    }
  };

  return (
    <WebView
      source={{ html: wrapHtml(html) }}
      style={[styles.webview, { height: height > 0 ? height : 22 }]}
      scrollEnabled={false}
      showsHorizontalScrollIndicator={false}
      showsVerticalScrollIndicator={false}
      injectedJavaScript={HEIGHT_JS}
      onMessage={onMessage}
      originWhitelist={['*']}
      pointerEvents="none"
    />
  );
}

const styles = StyleSheet.create({
  webview: {
    backgroundColor: 'transparent',
  },
});
