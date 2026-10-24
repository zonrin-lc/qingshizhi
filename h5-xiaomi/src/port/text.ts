/**
 * CJK 正文排版:把 DOM/CSS 的「自动换行 + 段首缩进 + 标点避头尾 + 内联高亮」
 * 在 canvas 上重做一遍。
 *
 * 真机已验证(Redmi / qg 运行时):ttf 自绘字体在 canvas 上量宽与绘制一致,
 * 成对破折号必须作为单个排版单元,否则会在行末/行首被拆成两截。
 */

export interface Run {
  text: string;
  color: string;
}

export interface Glyph {
  ch: string;
  color: string;
  x: number;
  w: number;
}

export interface TextLayout {
  lines: Glyph[][];
  lineHeight: number;
  fontSize: number;
  height: number;
}

/** 不能出现在行首的标点(避头) */
const NO_LINE_START = '，。、；：？！）》」』】…·—,.;:?!)]}';
/** 不能出现在行尾的标点(避尾) */
const NO_LINE_END = '（《「『【([{';

/** 把 ⟦…⟧ 标记的片段解析成带颜色的 run 序列 */
export function parseRuns(raw: string, baseColor: string, accentColor: string): Run[] {
  const runs: Run[] = [];
  let rest = raw;
  while (rest.length) {
    const open = rest.indexOf('⟦');
    if (open < 0) {
      runs.push({ text: rest, color: baseColor });
      break;
    }
    if (open > 0) runs.push({ text: rest.slice(0, open), color: baseColor });
    const close = rest.indexOf('⟧', open);
    if (close < 0) {
      runs.push({ text: rest.slice(open), color: baseColor });
      break;
    }
    runs.push({ text: rest.slice(open + 1, close), color: accentColor });
    rest = rest.slice(close + 1);
  }
  return runs.filter((r) => r.text.length > 0);
}

export interface LayoutOpts {
  maxWidth: number;
  fontSize: number;
  lineHeight: number;
  /** 首行缩进字数,默认 2 */
  indentChars?: number;
  /** 段间额外间距(px),默认 0 */
  paraGap?: number;
}

export interface LayoutResult extends TextLayout {
  /** 每段首行在 lines 中的下标,便于做段间距 */
  paraStarts: number[];
}

export function layoutParagraphs(
  ctx: CanvasRenderingContext2D,
  font: string,
  paras: Run[][],
  opts: LayoutOpts,
): LayoutResult {
  ctx.font = font;
  ctx.textBaseline = 'top';
  const cache = new Map<string, number>();
  const measure = (ch: string): number => {
    const hit = cache.get(ch);
    if (hit !== undefined) return hit;
    const w = ctx.measureText(ch).width;
    cache.set(ch, w);
    return w;
  };

  const indent = measure('青') * (opts.indentChars ?? 2);
  const lines: Glyph[][] = [];
  const paraStarts: number[] = [];
  const eps = 0.5;

  /** 成对破折号作为一个不可拆单元 */
  const unitsOf = (text: string): { ch: string; w: number }[] => {
    const out: { ch: string; w: number }[] = [];
    for (let i = 0; i < text.length; i++) {
      const ch = text[i] as string;
      if (ch === '—' && text[i + 1] === '—') {
        out.push({ ch: '——', w: measure('—') * 2 });
        i++;
      } else {
        out.push({ ch, w: measure(ch) });
      }
    }
    return out;
  };

  for (const runs of paras) {
    paraStarts.push(lines.length);
    let line: Glyph[] = [];
    let x = indent;

    const flush = (): void => {
      if (line.length) lines.push(line);
      line = [];
      x = 0;
    };

    for (const run of runs) {
      for (const unit of unitsOf(run.text)) {
        const ch = unit.ch;
        const w = unit.w;
        if (x + w > opts.maxWidth + eps && line.length) {
          if (!NO_LINE_START.includes(ch)) {
            // 避尾:行末是开引号时,把它挪到下一行
            let carry: Glyph | null = null;
            const tail = line[line.length - 1];
            if (line.length > 1 && tail && NO_LINE_END.includes(tail.ch)) {
              carry = line.pop() as Glyph;
            }
            flush();
            if (carry) {
              line.push({ ch: carry.ch, color: carry.color, x: 0, w: carry.w });
              x = carry.w;
            }
          }
        }
        line.push({ ch, color: run.color, x, w });
        x += w;
        if (x >= opts.maxWidth - eps && !NO_LINE_START.includes(ch)) flush();
      }
    }
    flush();
  }

  const gap = opts.paraGap ?? 0;
  const height = Math.max(lines.length * opts.lineHeight + Math.max(0, paraStarts.length - 1) * gap, opts.lineHeight);

  return {
    lines,
    lineHeight: opts.lineHeight,
    fontSize: opts.fontSize,
    height,
    paraStarts,
  };
}

/**
 * 把排版结果烘焙到离屏画布(只画一次,之后整屏 blit,
 * 避免每帧上千次 fillText —— 真机上 fillText 是主要开销)。
 */
export function renderTextCanvas(
  offscreen: { create(w: number, h: number): any },
  layout: LayoutResult,
  font: string,
  baseColor: string,
  paraGap: number,
): any {
  const width = Math.ceil(layout.lines.flat().reduce((m, g) => Math.max(m, g.x + g.w), 0)) + 4;
  const c = offscreen.create(width, Math.ceil(layout.height) + 4);
  const ctx = c.getContext('2d') as CanvasRenderingContext2D;
  ctx.textBaseline = 'top';
  ctx.font = font;
  const pad = (layout.lineHeight - layout.fontSize) / 2;
  // 段间额外间距:第 i 行之前出现的段首数量 × paraGap
  const starts = new Set(layout.paraStarts);
  let extra = 0;
  layout.lines.forEach((line, i) => {
    if (i > 0 && starts.has(i)) extra += paraGap;
    const y = i * layout.lineHeight + extra + pad;
    for (const g of line) {
      if (g.color === baseColor) {
        ctx.fillStyle = baseColor;
        ctx.fillText(g.ch, g.x, y);
      }
    }
    for (const g of line) {
      if (g.color !== baseColor) {
        ctx.fillStyle = g.color;
        ctx.fillText(g.ch, g.x, y);
      }
    }
  });
  return c;
}
