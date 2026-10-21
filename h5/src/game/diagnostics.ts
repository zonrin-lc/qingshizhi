/**
 * 运行时诊断:把「页面上肉眼看不见的异常」收进一个可取的缓冲区。
 *
 * 为什么需要(2026-10-21 审查结论):
 * 全仓只有元素级 error 监听(配音/音乐),没有 window 级兜底 —— 一次未捕获的
 * 运行时异常会让对局页停在半残状态(按钮点了没反应、卷轴空一半),而玩家
 * 只能干瞪眼,开发者也拿不到任何线索。TapTap 制造有「问题回传」通道,
 * 只要把现场攒住,就能在玩家反馈时一起给出。
 *
 * 这里做三件事:
 * 1. 收:window 'error' 与 'unhandledrejection' 都记一条(有界,防内存涨);
 * 2. 报:在舞台层弹一条轻提示(别打断流程,玩家仍可返回/重开);
 * 3. 取:window.__QS__.diagnostics() 能把最近若干条读出来(控制台或反馈时用)。
 *
 * 注意:这里**不吞**异常 —— 记录完照常交给浏览器默认处理(控制台仍会打印),
 * 免得把真问题藏起来。
 */

export interface DiagEntry {
  /** 记录时刻 */
  t: number;
  kind: 'error' | 'rejection';
  /** 一句话摘要 */
  message: string;
  /** 堆栈(有就带) */
  stack?: string;
}

/** 最多留这么多条(多了对玩家没意义,还会撑大反馈内容) */
const MAX = 20;

const entries: DiagEntry[] = [];

/** 提示的回调(由外壳注入:没装好外壳时不弹提示) */
let notify: ((text: string) => void) | null = null;

function record(kind: DiagEntry['kind'], message: string, stack?: string): void {
  entries.push({ t: Date.now(), kind, message: message.slice(0, 400), stack: stack?.slice(0, 1200) });
  if (entries.length > MAX) entries.splice(0, entries.length - MAX);
  try {
    notify?.(kind === 'error' ? '出了点问题,已记下' : '有个操作没接上,已记下');
  } catch { /* 提示失败不许再抛 */ }
}

/**
 * 装上全局兜底。onNotice 用来弹提示(可后装:外壳起得慢时先不弹)。
 * 返回一个读取函数,拿最近的诊断条目。
 */
export function installDiagnostics(onNotice?: (text: string) => void): () => DiagEntry[] {
  if (onNotice) notify = onNotice;
  if (typeof window === 'undefined') return () => entries.slice();
  window.addEventListener('error', (e) => {
    const err = e.error as Error | undefined;
    record('error', err?.message || e.message || '未知错误', err?.stack);
  });
  window.addEventListener('unhandledrejection', (e) => {
    const r = e.reason as unknown;
    const err = r instanceof Error ? r : undefined;
    record('rejection', err?.message || String(r ?? '未处理的 Promise 拒绝'), err?.stack);
  });
  return () => entries.slice();
}

/** 最近的诊断条目(倒序,新的在前) */
export function diagnostics(): DiagEntry[] {
  return entries.slice().reverse();
}

/** 拼一段可直接贴进反馈的文本 */
export function diagnosticsText(): string {
  const list = entries.slice(-8);
  if (!list.length) return '(无诊断记录)';
  return list.map((e) => {
    const when = new Date(e.t).toISOString().replace('T', ' ').slice(0, 19);
    return `[${when}] ${e.kind}: ${e.message}${e.stack ? `\n${e.stack}` : ''}`;
  }).join('\n---\n');
}
