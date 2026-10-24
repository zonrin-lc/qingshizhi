/**
 * CJK 正文排版:把 DOM/CSS 的「自动换行 + 段首缩进 + 标点避头尾 + 内联高亮」
 * 在 canvas 上重做一遍。P0 只做横排,竖排题签不在此范围内。
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

/** 不能出现在行首的标点(避头);破折号也算,单个 — 落在行首同样难看 */
const NO_LINE_START = '，。、；：？！）》」』】…·—,.;:?!)]}';
/** 不能出现在行尾的标点(避尾) */
const NO_LINE_END = '（《「『【([{';

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

export function layoutParagraphs(
  ctx: CanvasRenderingContext2D,
  font: string,
  paras: Run[][],
  maxWidth: number,
  fontSize: number,
  lineHeight: number,
): TextLayout {
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

  const indent = measure('青') * 2;
  /** 把一段文字切成不可拆的排版单元:成对的破折号 —— 是一个单元,不能行末半截、行首半截 */
  const unitsOf = (text: string): { ch: string; w: number }[] => {
    const out: { ch: string; w: number }[] = [];
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (ch === '—' && text[i + 1] === '—') {
        out.push({ ch: '——', w: measure('—') * 2 });
        i++;
      } else {
        out.push({ ch, w: measure(ch) });
      }
    }
    return out;
  };
  const lines: Glyph[][] = [];
  const eps = 0.5;

  for (const runs of paras) {
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
        const overflow = x + w > maxWidth + eps;
        if (overflow && line.length) {
          // 避头:下一个字符是收尾标点时,允许挤在行末(标点悬挂)
          if (NO_LINE_START.includes(ch)) {
            // 若行尾是开引号,把开引号一起挪到下一行
          } else {
            // 避尾:行末是开引号时,把它挪到下一行
            let carry: Glyph | null = null;
            if (line.length > 1 && NO_LINE_END.includes(line[line.length - 1].ch)) {
              carry = line.pop() as Glyph;
            }
            flush();
            x = 0;
            if (carry) {
              x = 0;
              line.push({ ch: carry.ch, color: carry.color, x, w: carry.w });
              x += carry.w;
            }
          }
        }
        line.push({ ch, color: run.color, x, w });
        x += w;
        if (x >= maxWidth - eps && !NO_LINE_START.includes(ch)) flush();
      }
    }
    flush();
  }

  return {
    lines,
    lineHeight,
    fontSize,
    height: Math.max(lines.length * lineHeight, lineHeight),
  };
}

/**
 * 把排版结果画到一张离屏画布上(只画一次,之后整屏 blit,避免每帧上千次 fillText)。
 */
export function renderTextCanvas(
  plat: { createOffscreen(w: number, h: number): any },
  layout: TextLayout,
  width: number,
  height: number,
  font: string,
  color: string,
): any {
  const c = plat.createOffscreen(width, height);
  const ctx = c.getContext('2d') as CanvasRenderingContext2D;
  ctx.textBaseline = 'top';
  ctx.font = font;
  const pad = (layout.lineHeight - layout.fontSize) / 2;
  layout.lines.forEach((line, i) => {
    const y = i * layout.lineHeight + pad;
    for (const g of line) {
      if (g.color === color) {
        ctx.fillStyle = color;
        ctx.fillText(g.ch, g.x, y);
      }
    }
    // 高亮片段单独一趟,减少状态切换
    for (const g of line) {
      if (g.color !== color) {
        ctx.fillStyle = g.color;
        ctx.fillText(g.ch, g.x, y);
      }
    }
  });
  return c;
}
