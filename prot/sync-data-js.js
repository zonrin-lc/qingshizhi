/* prot/*-data.js 再生成器：prot/lua-data/<scen>.json → prot/<scen>-data.js
 * 背景：剧本回灌（import-script-md.js）只更新 lua-data/*.json 与 scripts/qingshi/data/*.lua，
 * JS 侧数据文件不会自动跟进，导致 p1-golden（读 *-data.js）与 p2-replay（读 Lua 数据）分叉。
 * 本工具把 json 内容以 JS 字面量嵌入原 UMD 包装（全局变量名与历史文件一致），
 * 生成后用键序无关的 canon 对拍验证 require(new) 与 json 全等。
 * 用法: node sync-data-js.js [scen...]   （不带参数则处理全部五剧本）
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

const scens = process.argv.slice(2).filter(s => MAP[s]);
const targets = scens.length ? scens : Object.keys(MAP);

function canon(v) {
  if (Array.isArray(v)) return '[' + v.map(canon).join(',') + ']';
  if (v && typeof v === 'object') {
    return '{' + Object.keys(v).sort().map(k => JSON.stringify(k) + ':' + canon(v[k])).join(',') + '}';
  }
  return JSON.stringify(v);
}

// 提取旧文件首个块注释作为头部保留（剧本说明）
function headComment(oldText) {
  const m = oldText.match(/^\/\*[\s\S]*?\*\//);
  return m ? m[0] : '';
}

let fail = 0;
for (const scen of targets) {
  const { file, global: gname } = MAP[scen];
  const jsonPath = path.join(P.PROT_LUA_DATA, scen + '.json');
  const jsPath = path.join(P.PROT, file);
  const data = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));

  // 漂亮打印嵌入；转义 U+2028/U+2029（ES2019 前字符串字面量非法字符）
  const body = JSON.stringify(data, null, 2)
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');

  const head = fs.existsSync(jsPath) ? headComment(fs.readFileSync(jsPath, 'utf8')) : '';
  const out = (head ? head + '\n' : '') +
    '/* 本文件由 sync-data-js.js 从 prot/lua-data/' + scen + '.json 再生成，请勿手改。 */\n' +
    '(function (root, factory) {\n' +
    "  if (typeof module !== 'undefined' && module.exports) module.exports = factory();\n" +
    '  else root.' + gname + ' = factory();\n' +
    "})(typeof self !== 'undefined' ? self : this, function () {\n" +
    '  return ' + body + ';\n' +
    '});\n';

  fs.writeFileSync(jsPath, out);

  // 对拍：require 新文件，与 json 做键序无关全等比较
  delete require.cache[require.resolve(jsPath)];
  const back = require(jsPath);
  const ok = canon(back) === canon(data);
  console.log(scen.padEnd(10), '->', file, ok ? 'OK' : 'MISMATCH', '(' + out.length + ' bytes)');
  if (!ok) fail = 1;
}
process.exit(fail);
