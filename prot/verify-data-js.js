/* prot/lua-data/*.json ↔ prot/*-data.js 等价性校验(只读,不改文件)。
 *
 * 2026-10-21 新增,替代原来的 p1-verify(JSON↔Lua)作为**构建期门禁**:
 * Lua 引擎版弃用后,Lua 侧的等价性不再是风险;真正要紧的是
 *   prot/lua-data/<scen>.json  →(sync-data-js)→  prot/<scen>-data.js
 * 这一段 —— H5 与引擎吃的是 *-data.js,JSON 改了没重新生成,游戏里就是旧数据。
 * 原来的 sync-data-js.js 只在**生成时**自检一次(改完 JSON 不重生成就悄悄分叉),
 * 这里补一个「随时可跑、只读」的校验。
 *
 * 用法: node verify-data-js.js
 * 退出码:0 = 全部一致;1 = 有分叉(并指出怎么修)
 */
const fs = require('fs');
const path = require('path');
const { P } = require('./paths');

const MAP = {
  lisi: { file: 'game-data.js', global: 'GAME_DATA' },
  jingke: { file: 'jingke-data.js', global: 'JINGKE_DATA' },
  hanxin: { file: 'hanxin-data.js', global: 'HANXIN_DATA' },
  xiangyu: { file: 'xiangyu-data.js', global: 'XIANGYU_DATA' },
  chensheng: { file: 'chensheng-data.js', global: 'CHENSHENG_DATA' },
};

/** 键序无关的规范化(与 sync-data-js.js 同一口径) */
function canon(v) {
  if (Array.isArray(v)) return '[' + v.map(canon).join(',') + ']';
  if (v && typeof v === 'object') {
    return '{' + Object.keys(v).sort().map((k) => JSON.stringify(k) + ':' + canon(v[k])).join(',') + '}';
  }
  return JSON.stringify(v);
}

let fail = 0;
for (const [scen, { file }] of Object.entries(MAP)) {
  const jsonPath = path.join(P.PROT_LUA_DATA, scen + '.json');
  const jsPath = path.join(P.PROT, file);
  if (!fs.existsSync(jsonPath)) {
    console.error(`${scen.padEnd(10)} ✗ 源数据缺失: ${jsonPath}`);
    fail = 1;
    continue;
  }
  if (!fs.existsSync(jsPath)) {
    console.error(`${scen.padEnd(10)} ✗ 生成产物缺失: ${file}(跑 node sync-data-js.js)`);
    fail = 1;
    continue;
  }
  const data = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
  delete require.cache[require.resolve(jsPath)];
  const back = require(jsPath);
  const ok = canon(back) === canon(data);
  console.log(`${scen.padEnd(10)} ${ok ? '✓' : '✗'} ${file} 与 prot/lua-data/${scen}.json ${ok ? '一致' : '分叉(跑 node sync-data-js.js 重新生成)'}`);
  if (!ok) fail = 1;
}

if (fail) {
  console.error('DATA-JS VERIFY: 存在分叉 —— 现役数据与生成产物不一致,已阻断。');
  process.exit(1);
}
console.log('DATA-JS VERIFY: 五本剧本的 JSON 与 JS 产物全部一致');
