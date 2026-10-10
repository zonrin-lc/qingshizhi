/* 全量 Lua 语法检查:wasmoon load() 只编译不执行,逐文件报语法错 */
const fs = require('fs');
const path = require('path');
const { P, loadWasmoon } = require('./paths');
const { LuaFactory } = loadWasmoon();

function walk(dir, out) {
  for (const f of fs.readdirSync(dir)) {
    const p = path.join(dir, f);
    const st = fs.statSync(p);
    if (st.isDirectory()) { if (f !== '.git') walk(p, out); }
    else if (f.endsWith('.lua')) out.push(p);
  }
  return out;
}

(async () => {
  const files = [];
  walk(P.SCRIPTS, files);
  walk(P.PROT_LUA, files);
  files.sort();
  const factory = new LuaFactory();
  const lua = await factory.createEngine();
  let bad = 0;
  for (const f of files) {
    const src = fs.readFileSync(f, 'utf8');
    lua.global.set('src', src);
    const r = String(await lua.doString('local fn,e=load(src,"m"); if fn then return "OK" else return "ERR: "..tostring(e) end'));
    if (r !== 'OK') { bad++; console.log(P.rel(f), '=>', r); }
  }
  console.log(bad === 0 ? 'SYNTAX ALL-OK (' + files.length + ' files)' : 'SYNTAX FAIL: ' + bad + '/' + files.length);
  process.exit(bad === 0 ? 0 : 1);
})().catch(e => { console.log('ERR', e); process.exit(1); });
