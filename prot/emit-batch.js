// 批次工具(可并发:keys 文件按批次号隔离):
//   node prot/emit-batch.js <start> <count> <n>   → 写 .tmp/voice/b<n>.keys 并打印 payload
//   node prot/emit-batch.js apply <n> <count>     → 把 vb<n>_* 按 b<n>.keys 重命名
// 其中 <n> 为该批次的唯一编号(用于 vb<n>_i 临时文件名,避免并发冲突)。
const fs = require("fs");
const OUT = ".tmp/voice";
const all = JSON.parse(fs.readFileSync(`${OUT}/all.json`, "utf8"));

if (process.argv[2] === "apply") {
  // 容错:同时匹配 vb<n>_i_... 与 vb<n>0_i_... 等前缀(TTS 按 output_name 命名)
  const n = process.argv[3];
  const count = parseInt(process.argv[4], 10);
  const keys = fs.readFileSync(`${OUT}/b${n}.keys`, "utf8").trim().split("\n");
  const dir = "assets/audio/voice";
  const allFiles = fs.readdirSync(dir);
  const findSrc = (i) => allFiles.find((f) => f.startsWith(`vb${n}_${i}_`) || f.startsWith(`vb${n}0_${i}_`)
    || new RegExp(`^vb${n}\\d*_${i}_`).test(f));
  let ok = 0;
  const miss = [];
  for (let i = 1; i <= count; i++) {
    const fname = findSrc(i);
    if (!fname) { miss.push(i); continue; }
    const src = `${dir}/${fname}`;
    const dst = `${dir}/${keys[i - 1]}.ogg`;
    fs.renameSync(src, dst);
    if (fs.existsSync(src + ".meta")) fs.renameSync(src + ".meta", dst + ".meta");
    ok++;
  }
  console.log(`batch ${n}: renamed ${ok}/${count}` + (miss.length ? ` MISSING idx: ${miss.join(",")}` : ""));
  process.exit(0);
}

const start = parseInt(process.argv[2] || "0", 10);
const count = parseInt(process.argv[3] || "40", 10);
const n = process.argv[4] || "0";
const slice = all.slice(start, start + count);
fs.writeFileSync(`${OUT}/b${n}.keys`, slice.map((it) => it.key).join("\n"));
const payload = slice.map((it) => ({ character_name: "说书人C", text: it.text }));
console.log("COUNT:" + slice.length);
console.log("PAYLOAD:" + JSON.stringify(payload));
