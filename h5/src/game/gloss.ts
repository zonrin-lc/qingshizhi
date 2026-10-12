/**
 * ⟦词条⟧ 解析:叙事文本里的可点词条标记。
 *
 * 引擎数据里用全角括号包裹,例如「你是楚国⟦上蔡⟧郡的一名小吏」。
 * 对齐 Lua 版 theme.lua 的 richRuns / glossToLink:产出 [{text, gloss}] 片段,
 * 由 UI 决定是否渲染成可点元素。
 *
 * ⚠️ 偏移量按 UTF-8 字节计(Lua 同款约定):「⟦」与「⟧」各 3 字节,
 * 内容从 b+3 开始、在 e-1 结束。JS 的 substring 也是按 UTF-16 code unit,
 * 而这三个符号都是 BMP 内的单个码元,所以字节偏移与下标一一对应。
 */

export interface GlossRun {
  text: string;
  /** 非空表示该片段是词条 */
  gloss: string | null;
}

/** 拆成纯文本片段 */
export function parseRuns(src: string): GlossRun[] {
  const runs: GlossRun[] = [];
  let pos = 0;
  for (;;) {
    const b = src.indexOf('⟦', pos);
    if (b < 0) {
      runs.push({ text: src.slice(pos), gloss: null });
      break;
    }
    if (b > pos) runs.push({ text: src.slice(pos, b), gloss: null });
    const e = src.indexOf('⟧', b + 1);
    if (e < 0) {
      // 未闭合:按普通文本处理,不吞掉后文
      runs.push({ text: src.slice(b), gloss: null });
      break;
    }
    runs.push({ text: src.slice(b + 1, e), gloss: src.slice(b + 1, e) });
    pos = e + 1;
  }
  return runs;
}

/** 取该段文本里出现的全部词条(去重) */
export function termsOf(src: string): string[] {
  const out: string[] = [];
  for (const r of parseRuns(src)) {
    if (r.gloss && !out.includes(r.gloss)) out.push(r.gloss);
  }
  return out;
}

/** 转成纯文本(剥掉标记,用于摘要/aria-label) */
export function stripGloss(src: string): string {
  return parseRuns(src)
    .map((r) => r.text)
    .join('');
}