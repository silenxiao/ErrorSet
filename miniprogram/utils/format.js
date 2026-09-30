// 状态文案、科目/年级选项、日期格式化。
// 状态色对齐三端设计令牌：成功 #00B42A、危险 #F53F3F、警示 #FF7D00、主色 #165DFF、辅助 #86909C。

const EXAM_STATUS = {
  uploaded: { text: '排队中', color: '#86909C' },
  global_processing: { text: '整页识别中', color: '#165DFF' },
  awaiting_review: { text: '待人工确认', color: '#FF7D00' },
  local_processing: { text: '二次识别中', color: '#165DFF' },
  completed: { text: '已完成', color: '#00B42A' },
  failed: { text: '失败', color: '#F53F3F' },
};

const Q_STATUS = {
  pending_review: { text: '待确认', color: '#FF7D00' },
  confirmed: { text: '已确认', color: '#165DFF' },
  correcting: { text: '二次识别中', color: '#165DFF' },
  completed: { text: '已完成', color: '#00B42A' },
  failed: { text: '失败', color: '#F53F3F' },
};

const SUBJECT_OPTIONS = ['数学', '语文', '英语', '物理', '化学', '生物', '历史', '地理', '政治'];
const GRADE_OPTIONS = ['一年级', '二年级', '三年级', '四年级', '五年级', '六年级', '初一', '初二', '初三'];

function formatDate(s) {
  if (!s) return '';
  const d = new Date(s);
  if (isNaN(d.getTime())) return s;
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

module.exports = { EXAM_STATUS, Q_STATUS, SUBJECT_OPTIONS, GRADE_OPTIONS, formatDate };
