// 极简 LaTeX 数学子集解析器：把 $...$ 内的公式源码解析成可递归渲染的节点树。
// 支持：\frac/\dfrac、\sqrt、上标 ^{}、下标 _{}、\left/\right、\text/\mathrm/\mathbf、
// \overline、\begin{cases}、常用数学符号与希腊字母、常用函数名（sin/cos/log...）。
// 输出节点（k 为类型，i 为 wx:key）：
//   t=斜体文本  u=直立文本(数字/括号/函数名)  s=数学符号
//   f=分数{n,d}  sup/sub=上下标{b}  sq=根号{b}  ov=上划线{b}  cases=方程组{rows}
// 排版约定：数字、括号、等号直立；变量字母斜体，接近真实数学排版。

const SYMBOLS = {
  angle: '∠', triangle: '△', circ: '°', degree: '°',
  times: '×', div: '÷', pm: '±', mp: '∓', cdot: '·', ast: '∗',
  le: '≤', leq: '≤', ge: '≥', geq: '≥', ne: '≠', neq: '≠',
  approx: '≈', equiv: '≡', sim: '∼', simeq: '≃', propto: '∝',
  infty: '∞', in: '∈', notin: '∉', subset: '⊂', subseteq: '⊆',
  supset: '⊃', cup: '∪', cap: '∩', emptyset: '∅', varnothing: '∅',
  forall: '∀', exists: '∃', neg: '¬', land: '∧', lor: '∨',
  because: '∵', therefore: '∴', perp: '⊥', parallel: '∥', mid: '∣',
  nabla: '∇', partial: '∂',
  rightarrow: '→', to: '→', leftarrow: '←', gets: '←',
  Rightarrow: '⇒', implies: '⇒', Leftarrow: '⇐',
  leftrightarrow: '↔', Leftrightarrow: '⇔', iff: '⇔',
  mapsto: '↦', uparrow: '↑', downarrow: '↓',
  ldots: '…', dots: '…', cdots: '⋯', vdots: '⋮', ddots: '⋱',
  prime: '′', langle: '⟨', rangle: '⟩', lvert: '|', rvert: '|',
  '{': '{', '}': '}', '%': '%', '&': '&', '#': '#', '$': '$',
  alpha: 'α', beta: 'β', gamma: 'γ', delta: 'δ', Delta: 'Δ',
  epsilon: 'ε', varepsilon: 'ε', zeta: 'ζ', eta: 'η',
  theta: 'θ', Theta: 'Θ', iota: 'ι', kappa: 'κ',
  lambda: 'λ', Lambda: 'Λ', mu: 'μ', nu: 'ν', xi: 'ξ', Xi: 'Ξ',
  pi: 'π', Pi: 'Π', rho: 'ρ', sigma: 'σ', Sigma: 'Σ',
  tau: 'τ', upsilon: 'υ', phi: 'φ', Phi: 'Φ', varphi: 'φ',
  chi: 'χ', psi: 'ψ', Psi: 'Ψ', omega: 'ω', Omega: 'Ω',
};

// 这些函数名按直立排版
const UP_FUNCS = [
  'sin', 'cos', 'tan', 'cot', 'sec', 'csc',
  'arcsin', 'arccos', 'arctan', 'sinh', 'cosh', 'tanh',
  'log', 'ln', 'lg', 'exp', 'max', 'min', 'lim',
  'det', 'dim', 'deg', 'mod', 'gcd', 'lcm',
];

// 直立字符：数字与常用标点/运算符
const UP_RE = /[0-9.,()[\]|=+\-<>/:;!?%'"°]/;

let _id = 0;

// 读取一个 {...} 组，返回 [内容, 结束后下标]；不匹配返回 null
function readGroup(s, i) {
  if (s[i] !== '{') return null;
  let depth = 0;
  for (let j = i; j < s.length; j++) {
    if (s[j] === '{') depth++;
    else if (s[j] === '}') {
      depth--;
      if (depth === 0) return [s.slice(i + 1, j), j + 1];
    }
  }
  return [s.slice(i + 1), s.length]; // 未闭合：取到结尾
}

// s[i] === '\\'，返回 [命令名, 结束后下标]；非字母命令取单字符（\, \; \{ 等）
function readCommandName(s, i) {
  let j = i + 1;
  if (j < s.length && /[a-zA-Z]/.test(s[j])) {
    while (j < s.length && /[a-zA-Z]/.test(s[j])) j++;
    return [s.slice(i + 1, j), j];
  }
  return [s[j] || '', j + 1];
}

// 读取一个“原子”（用于 ^ / _ 的参数），返回 { nodes, next }
function readAtom(s, i) {
  if (i >= s.length) return { nodes: [], next: i };
  const ch = s[i];
  if (ch === '{') {
    const g = readGroup(s, i);
    if (g) return { nodes: parseMath(g[0]), next: g[1] };
  }
  if (ch === '\\') {
    const [name, next] = readCommandName(s, i);
    if (SYMBOLS[name] != null) return { nodes: [{ k: 's', v: SYMBOLS[name] }], next };
    if (name === 'text' || name === 'mathrm') {
      const g = readGroup(s, next);
      if (g) return { nodes: [{ k: 'u', v: g[0] }], next: g[1] };
    }
    if (UP_FUNCS.indexOf(name) !== -1) return { nodes: [{ k: 'u', v: name }], next };
    return { nodes: [{ k: 't', v: name }], next };
  }
  return { nodes: [{ k: UP_RE.test(ch) ? 'u' : 't', v: ch }], next: i + 1 };
}

function parseMath(src) {
  const s = String(src == null ? '' : src);
  const nodes = [];
  let buf = '';      // 文本缓冲
  let bufUp = null;  // 当前缓冲是否直立

  const flushBuf = () => {
    if (buf) {
      nodes.push({ k: bufUp ? 'u' : 't', v: buf, i: _id++ });
      buf = '';
      bufUp = null;
    }
  };
  const push = (n) => { flushBuf(); n.i = _id++; nodes.push(n); };

  let i = 0;
  while (i < s.length) {
    const ch = s[i];

    if (ch === '\\') {
      const [name, next] = readCommandName(s, i);
      i = next;

      if (name === 'frac' || name === 'dfrac' || name === 'tfrac') {
        const g1 = readGroup(s, i);
        if (!g1) { flushBuf(); buf = name; bufUp = false; continue; }
        const g2 = readGroup(s, g1[1]);
        push({ k: 'f', n: parseMath(g1[0]), d: g2 ? parseMath(g2[0]) : [] });
        if (g2) i = g2[1];
        continue;
      }
      if (name === 'sqrt') {
        let j = i;
        if (s[j] === '[') { while (j < s.length && s[j] !== ']') j++; j++; } // 忽略根指数
        const g = readGroup(s, j);
        if (g) { push({ k: 'sq', b: parseMath(g[0]) }); i = g[1]; }
        continue;
      }
      if (name === 'overline' || name === 'bar') {
        const g = readGroup(s, i);
        if (g) { push({ k: 'ov', b: parseMath(g[0]) }); i = g[1]; }
        continue;
      }
      if (name === 'text' || name === 'mathrm' || name === 'operatorname' || name === 'mbox') {
        const g = readGroup(s, i);
        if (g) { push({ k: 'u', v: g[0] }); i = g[1]; }
        continue;
      }
      if (name === 'mathbf' || name === 'bm' || name === 'boldsymbol') {
        const g = readGroup(s, i);
        if (g) { push({ k: 'u', v: g[0], bold: 1 }); i = g[1]; }
        continue;
      }
      if (/^(left|right|big|Big|bigl|bigr|Bigl|Bigr)$/.test(name)) {
        // 取后面的定界符：( [ | . \{ 等；'.' 表示空定界符
        if (s[i] === '\\') {
          const [n2, j2] = readCommandName(s, i);
          i = j2;
          if (n2 !== '.' && n2 !== '') {
            if (SYMBOLS[n2] != null) push({ k: 's', v: SYMBOLS[n2] });
            else { flushBuf(); buf = n2; bufUp = true; }
          }
        } else if (s[i] === '.') {
          i++;
        } else if (i < s.length) {
          push({ k: 'u', v: s[i] });
          i++;
        }
        continue;
      }
      if (name === 'begin') {
        const genv = readGroup(s, i);
        const env = genv ? genv[0] : '';
        if (genv) i = genv[1];
        if (env === 'cases') {
          const endTag = '\\end{cases}';
          const endIdx = s.indexOf(endTag, i);
          const body = endIdx === -1 ? s.slice(i) : s.slice(i, endIdx);
          i = endIdx === -1 ? s.length : endIdx + endTag.length;
          const rows = body
            .split('\\\\')
            .map((r) => r.split('&').map((c) => parseMath(c)))
            .map((cells) => {
              const out = [];
              cells.forEach((c, idx) => {
                if (idx) out.push({ k: 'u', v: '，', i: _id++ });
                Array.prototype.push.apply(out, c);
              });
              return { cells: out, i: _id++ };
            });
          push({ k: 'cases', rows });
        } else {
          flushBuf(); buf = env; bufUp = true;
        }
        continue;
      }
      if (name === 'end') {
        const genv = readGroup(s, i);
        if (genv) i = genv[1];
        continue;
      }
      if (UP_FUNCS.indexOf(name) !== -1) { flushBuf(); buf = name; bufUp = true; continue; }
      if (name === 'quad') { flushBuf(); buf = '  '; bufUp = true; continue; }
      if (name === 'qquad') { flushBuf(); buf = '    '; bufUp = true; continue; }
      if (name === ',' || name === ';' || name === ':' || name === ' ') { flushBuf(); buf = ' '; bufUp = true; continue; }
      if (name === '!' || name === '\\' || name === 'cr') continue; // 负空隙/换行：忽略
      if (SYMBOLS[name] != null) { push({ k: 's', v: SYMBOLS[name] }); continue; }
      // 未知命令：原样输出命令名
      flushBuf(); buf = name; bufUp = false;
      continue;
    }

    if (ch === '^' || ch === '_') {
      const atom = readAtom(s, i + 1);
      push({ k: ch === '^' ? 'sup' : 'sub', b: atom.nodes });
      i = atom.next;
      continue;
    }

    if (ch === '{' || ch === '}') { i++; continue; } // 透明分组

    // 普通字符：按直立/斜体分桶，切换时先落盘，保证顺序
    const isUp = ch === ' ' ? true : UP_RE.test(ch);
    if (buf && bufUp !== isUp) flushBuf();
    buf += ch;
    bufUp = isUp;
    i++;
  }
  flushBuf();
  return nodes;
}

function latexToNodes(src) {
  _id = 0;
  return parseMath(src);
}

// ============ HTML 字符串渲染（供 <rich-text> 使用）============
// rich-text 字符串模式支持内联 style，但只认标准 CSS 单位（px），不认 rpx。
function escHtml(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

const C_ITALIC = "color:#0b53c9;font-style:italic;font-family:Georgia,'Times New Roman',serif;";
const C_UPRIGHT = "color:#0b53c9;font-family:Georgia,'Times New Roman',serif;";
const C_SYM = "color:#0b53c9;font-family:Georgia,serif;font-style:normal;";

function serNodes(nodes) {
  let h = '';
  (nodes || []).forEach((n) => {
    if (n.k === 't') h += '<span style="' + C_ITALIC + '">' + escHtml(n.v) + '</span>';
    else if (n.k === 'u') h += '<span style="' + C_UPRIGHT + (n.bold ? 'font-weight:bold;' : '') + '">' + escHtml(n.v) + '</span>';
    else if (n.k === 's') h += '<span style="' + C_SYM + '">' + escHtml(n.v) + '</span>';
    else if (n.k === 'f') {
      // 分子和分母各自是一整行，不能让每个数学节点都成为 column 的子项。
      // 嵌套分式逐级缩小；nowrap 防止公式内部被段落的断行规则拆开。
      h += '<span style="display:inline-flex;flex-direction:column;align-items:stretch;vertical-align:middle;margin:0 2px;font-size:0.85em;line-height:1.2;white-space:nowrap;">';
      h += '<span style="display:block;text-align:center;padding:1px 3px;white-space:nowrap;">' + serNodes(n.n) + '</span>';
      h += '<span style="display:block;text-align:center;border-top:1px solid #0b53c9;padding:1px 3px;white-space:nowrap;">' + serNodes(n.d) + '</span>';
      h += '</span>';
    } else if (n.k === 'sup') h += '<sup style="font-size:0.7em;">' + serNodes(n.b) + '</sup>';
    else if (n.k === 'sub') h += '<sub style="font-size:0.7em;">' + serNodes(n.b) + '</sub>';
    else if (n.k === 'sq') {
      h += '<span style="' + C_SYM + '">√</span>';
      h += '<span style="border-top:1px solid #0b53c9;padding:0 3px;margin-left:-2px;">' + serNodes(n.b) + '</span>';
    } else if (n.k === 'ov') {
      h += '<span style="border-top:1px solid #0b53c9;padding:0 3px;">' + serNodes(n.b) + '</span>';
    } else if (n.k === 'cases') {
      h += '<span style="' + C_SYM + '">{</span>';
      h += '<span style="display:inline-flex;flex-direction:column;justify-content:center;margin-left:2px;">';
      (n.rows || []).forEach((r) => {
        h += '<span style="display:block;white-space:nowrap;">' + serNodes(r.cells) + '</span>';
      });
      h += '</span>';
    } else {
      h += escHtml(n.v != null ? n.v : '');
    }
  });
  return h;
}

function latexToHtml(latex) {
  try {
    const nodes = parseMath(latex);
    if (!nodes.length) return escHtml(latex);
    return '<span style="display:inline-block;vertical-align:middle;white-space:nowrap;line-height:1.2;">' + serNodes(nodes) + '</span>';
  } catch (e) {
    return escHtml(latex);
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { latexToNodes, parseMath, latexToHtml, SYMBOLS, UP_FUNCS };
}
