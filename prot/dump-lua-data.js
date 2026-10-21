/* prot/lua-data/<scen>.json 再生成器 —— 2026-10-21 起**停用**。
 *
 * 停用理由(项目决策:Lua 引擎版弃用):
 * 这个工具从 scripts/qingshi/data/<scen>.lua(封存的 Lua 版数据)反向生成
 * prot/lua-data/<scen>.json —— 而后者是**现役数据真源**(H5 与引擎都从它派生)。
 * 也就是说:谁跑一次这个工具,现役数据就会被 Lua 那份陈旧副本静默回滚
 * (实际已经踩过一次:李斯 ACT-7「结交富室」的文案改动就是被它改回「乡绅联姻」的,
 * 而 p1-verify 仍然显示绿 —— 因为两侧一起旧了)。
 *
 * 现在的正确方向是单向的:
 *   prot/lua-data/*.json  →(p1-convert)→ prot/lua/data/*.lua
 *   prot/lua-data/*.json  →(sync-data-js)→ prot/*-data.js(H5 实际吃的那份)
 * 由 sync-data-js.js 负责再生成,并用 prot/verify-data-js.js 做构建期门禁。
 *
 * 需要从旧 Lua 副本里捞数据时,人工把内容拷进 prot/lua-data/<scen>.json 再跑生成链。
 */
console.error('[dump-lua-data] 已停用:Lua 引擎版弃用,prot/lua-data/*.json 是现役真源,不能再从 Lua 反向生成。');
console.error('[dump-lua-data] 需要改数据请直接编辑 prot/lua-data/<scen>.json,然后跑:');
console.error('[dump-lua-data]   node p1-convert.js && node sync-data-js.js && node verify-data-js.js');
process.exit(1);
