// 状态文案、科目/年级选项、日期格式化。移植自小程序 utils/format.js。

export interface StatusMeta {
  text: string;
  color: string;
}

// 状态色对齐三端统一调色板：成功 #00B42A / 危险 #F53F3F / 警示 #FF7D00 / 进行中 #165DFF
export const EXAM_STATUS: Record<string, StatusMeta> = {
  uploaded: { text: '排队中', color: '#86909C' },
  global_processing: { text: '整页识别中', color: '#165DFF' },
  awaiting_review: { text: '待人工确认', color: '#FF7D00' },
  local_processing: { text: '二次识别中', color: '#165DFF' },
  completed: { text: '已完成', color: '#00B42A' },
  failed: { text: '失败', color: '#F53F3F' },
};

export const Q_STATUS: Record<string, StatusMeta> = {
  pending_review: { text: '待确认', color: '#FF7D00' },
  confirmed: { text: '已确认', color: '#165DFF' },
  correcting: { text: '二次识别中', color: '#165DFF' },
  completed: { text: '已完成', color: '#00B42A' },
  failed: { text: '失败', color: '#F53F3F' },
};

export const SUBJECT_OPTIONS = [
  '数学',
  '语文',
  '英语',
  '物理',
  '化学',
  '生物',
  '历史',
  '地理',
  '政治',
];

export const GRADE_OPTIONS = [
  '一年级',
  '二年级',
  '三年级',
  '四年级',
  '五年级',
  '六年级',
  '初一',
  '初二',
  '初三',
];

export function examStatusOf(status: string): StatusMeta {
  return EXAM_STATUS[status] || { text: status, color: '#86909C' };
}

export function questionStatusOf(status: string): StatusMeta {
  return Q_STATUS[status] || { text: status, color: '#86909C' };
}

export function formatDate(s: string | null | undefined): string {
  if (!s) return '';
  const d = new Date(s);
  if (isNaN(d.getTime())) return s;
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}
