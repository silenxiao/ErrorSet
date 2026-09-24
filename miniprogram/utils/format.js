// 状态文案、科目/年级选项、日期格式化。

const EXAM_STATUS = {
  uploaded: { text: '已上传', color: '#999999' },
  global_processing: { text: '整页识别中', color: '#1677ff' },
  awaiting_review: { text: '待人工确认', color: '#fa8c16' },
  local_processing: { text: '二次识别中', color: '#1677ff' },
  completed: { text: '已完成', color: '#52c41a' },
  failed: { text: '失败', color: '#ff4d4f' },
};

const Q_STATUS = {
  pending_review: { text: '待确认', color: '#fa8c16' },
  confirmed: { text: '已确认', color: '#1677ff' },
  correcting: { text: '二次识别中', color: '#1677ff' },
  completed: { text: '已完成', color: '#52c41a' },
  failed: { text: '失败', color: '#ff4d4f' },
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
