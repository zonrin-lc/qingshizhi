// main.js
(function() {
  const DESIGN_W = 1280;
  function getQg() {
    try {
      if (typeof qg !== "undefined") return qg;
    } catch {
    }
    return globalThis.qg;
  }
  function hasQg() {
    return typeof getQg() !== "undefined";
  }
  function fitScale(sw, sh) {
    const scale = Math.min(sw / DESIGN_W, sh / 720);
    return {
      scale,
      ox: Math.round((sw - DESIGN_W * scale) / 2),
      oy: Math.round((sh - 720 * scale) / 2)
    };
  }
  function webPlatform() {
    const canvas = document.createElement("canvas");
    canvas.style.position = "fixed";
    canvas.style.inset = "0";
    canvas.style.width = "100%";
    canvas.style.height = "100%";
    canvas.style.touchAction = "none";
    document.body.append(canvas);
    let screenW = window.innerWidth;
    let screenH = window.innerHeight;
    const dpr = Math.min(window.devicePixelRatio || 1, 3);
    let fit = fitScale(screenW, screenH);
    const applySize = () => {
      screenW = window.innerWidth;
      screenH = window.innerHeight;
      fit = fitScale(screenW, screenH);
      canvas.width = Math.round(screenW * dpr);
      canvas.height = Math.round(screenH * dpr);
    };
    applySize();
    window.addEventListener("resize", applySize);
    const ctx = canvas.getContext("2d");
    const toDesign = (sx, sy) => ({
      x: (sx - fit.ox) / fit.scale,
      y: (sy - fit.oy) / fit.scale
    });
    return {
      kind: "web",
      canvas,
      ctx,
      get screenW() {
        return screenW;
      },
      get screenH() {
        return screenH;
      },
      get dpr() {
        return dpr;
      },
      get scale() {
        return fit.scale;
      },
      get offsetX() {
        return fit.ox;
      },
      get offsetY() {
        return fit.oy;
      },
      toDesign,
      loadImage(path) {
        return new Promise((resolve, reject) => {
          const img = new Image();
          img.onload = () => resolve({
            img,
            w: img.naturalWidth,
            h: img.naturalHeight
          });
          img.onerror = () => reject(/* @__PURE__ */ new Error(`image load failed: ${path}`));
          img.src = path;
        });
      },
      async loadFont(family, path) {
        try {
          const face = new FontFace(family, `url(${path})`);
          await face.load();
          document.fonts.add(face);
          return family;
        } catch {
          return null;
        }
      },
      audio(path, opts) {
        const el = new Audio(path);
        el.loop = !!opts?.loop;
        el.volume = opts?.volume ?? 1;
        el.preload = "auto";
        let failed = "";
        el.addEventListener("error", () => {
          failed = `media error (${el.error?.code ?? "?"})`;
        });
        el.load();
        return {
          play() {
            el.play().catch(() => {
            });
          },
          replay() {
            try {
              el.currentTime = 0;
            } catch {
            }
            el.play().catch(() => {
            });
          },
          stop() {
            el.pause();
          },
          setVolume(v) {
            el.volume = Math.max(0, Math.min(1, v));
          },
          state() {
            if (failed) return "error";
            return el.readyState >= 2 ? "ready" : "loading";
          },
          errorText() {
            return failed;
          },
          duration() {
            return Number.isFinite(el.duration) ? el.duration : 0;
          }
        };
      },
      createOffscreen(w, h) {
        const c = document.createElement("canvas");
        c.width = Math.ceil(w);
        c.height = Math.ceil(h);
        return c;
      },
      getStorage(key) {
        try {
          return localStorage.getItem(key);
        } catch {
          return null;
        }
      },
      setStorage(key, value) {
        try {
          localStorage.setItem(key, value);
          return true;
        } catch {
          return false;
        }
      },
      onPointer(h) {
        canvas.addEventListener("pointerdown", (e) => {
          try {
            canvas.setPointerCapture(e.pointerId);
          } catch {
          }
          const p = toDesign(e.clientX, e.clientY);
          h.down(p.x, p.y, e.pointerId);
        });
        canvas.addEventListener("pointermove", (e) => {
          const p = toDesign(e.clientX, e.clientY);
          h.move(p.x, p.y, e.pointerId);
        });
        const up = (e) => {
          const p = toDesign(e.clientX, e.clientY);
          h.up(p.x, p.y, e.pointerId);
        };
        canvas.addEventListener("pointerup", up);
        canvas.addEventListener("pointercancel", up);
      },
      onShow(cb) {
        document.addEventListener("visibilitychange", () => {
          if (!document.hidden) cb();
        });
      },
      onHide(cb) {
        document.addEventListener("visibilitychange", () => {
          if (document.hidden) cb();
        });
      }
    };
  }
  function qgPlatform() {
    const games = getQg();
    const info = games.getSystemInfoSync();
    const screenW = info.screenWidth ?? info.windowWidth;
    const screenH = info.screenHeight ?? info.windowHeight;
    const dpr = info.pixelRatio ?? 1;
    const host = globalThis;
    const canvas = host.canvas ?? host.GameGlobal?.canvas ?? games.createCanvas();
    canvas.width = Math.round(screenW * dpr);
    canvas.height = Math.round(screenH * dpr);
    const fit = fitScale(screenW, screenH);
    const ctx = canvas.getContext("2d");
    const toDesign = (sx, sy) => ({
      x: (sx - fit.ox) / fit.scale,
      y: (sy - fit.oy) / fit.scale
    });
    return {
      kind: "qg",
      canvas,
      ctx,
      screenW,
      screenH,
      dpr,
      scale: fit.scale,
      offsetX: fit.ox,
      offsetY: fit.oy,
      toDesign,
      loadImage(path) {
        return new Promise((resolve, reject) => {
          const img = games.createImage();
          img.onload = () => resolve({
            img,
            w: img.width,
            h: img.height
          });
          img.onerror = (e) => reject(/* @__PURE__ */ new Error(`image load failed: ${path} ${String(e)}`));
          img.src = path;
        });
      },
      async loadFont(_family, path) {
        try {
          const got = games.loadFont(path);
          return got ? String(got) : null;
        } catch {
          return null;
        }
      },
      audio(path, opts) {
        const a = games.createInnerAudioContext();
        a.src = path;
        a.loop = !!opts?.loop;
        a.volume = opts?.volume ?? 1;
        a.obeyMuteSwitch = false;
        let failed = "";
        a.onError((e) => {
          failed = `${e?.errCode ?? "?"} ${e?.errMsg ?? ""}`;
        });
        return {
          play() {
            try {
              a.play();
            } catch {
            }
          },
          replay() {
            try {
              a.stop();
            } catch {
            }
            try {
              a.play();
            } catch {
            }
          },
          stop() {
            try {
              a.stop();
            } catch {
            }
          },
          setVolume(v) {
            a.volume = Math.max(0, Math.min(1, v));
          },
          state() {
            if (failed) return "error";
            try {
              return a.duration > 0 ? "ready" : "loading";
            } catch {
              return "loading";
            }
          },
          errorText() {
            return failed;
          },
          duration() {
            try {
              return Number.isFinite(a.duration) ? a.duration : 0;
            } catch {
              return 0;
            }
          }
        };
      },
      createOffscreen(w, h) {
        const c = games.createCanvas();
        c.width = Math.ceil(w);
        c.height = Math.ceil(h);
        return c;
      },
      getStorage(key) {
        try {
          const r = games.getStorageSync(key);
          return r == null ? null : String(r);
        } catch {
          try {
            const r = games.getStorageSync({
              key
            });
            if (r && typeof r === "object" && "data" in r) return String(r.data);
            return r == null ? null : String(r);
          } catch {
            return null;
          }
        }
      },
      setStorage(key, value) {
        try {
          games.setStorageSync(key, value);
          return true;
        } catch {
        }
        try {
          games.setStorageSync({
            key,
            data: value
          });
          return true;
        } catch {
          return false;
        }
      },
      onPointer(h) {
        games.onTouchStart((e) => {
          const t = e.touches?.[0] ?? e.changedTouches?.[0];
          if (!t) return;
          const p = toDesign(t.clientX, t.clientY);
          h.down(p.x, p.y, t.identifier ?? 0);
        });
        games.onTouchMove((e) => {
          const t = e.touches?.[0] ?? e.changedTouches?.[0];
          if (!t) return;
          const p = toDesign(t.clientX, t.clientY);
          h.move(p.x, p.y, t.identifier ?? 0);
        });
        const end = (e) => {
          const t = e.changedTouches?.[0] ?? e.touches?.[0];
          if (!t) return;
          const p = toDesign(t.clientX, t.clientY);
          h.up(p.x, p.y, t.identifier ?? 0);
        };
        games.onTouchEnd(end);
        games.onTouchCancel?.(end);
      },
      onShow(cb) {
        games.onShow?.(cb);
      },
      onHide(cb) {
        games.onHide?.(cb);
      }
    };
  }
  function createPlatform() {
    return hasQg() ? qgPlatform() : webPlatform();
  }
  const NO_LINE_START = "\uFF0C\u3002\u3001\uFF1B\uFF1A\uFF1F\uFF01\uFF09\u300B\u300D\u300F\u3011\u2026\xB7\u2014,.;:?!)]}";
  const NO_LINE_END = "\uFF08\u300A\u300C\u300E\u3010([{";
  function parseRuns(raw, baseColor, accentColor) {
    const runs = [];
    let rest = raw;
    while (rest.length) {
      const open = rest.indexOf("\u27E6");
      if (open < 0) {
        runs.push({
          text: rest,
          color: baseColor
        });
        break;
      }
      if (open > 0) runs.push({
        text: rest.slice(0, open),
        color: baseColor
      });
      const close = rest.indexOf("\u27E7", open);
      if (close < 0) {
        runs.push({
          text: rest.slice(open),
          color: baseColor
        });
        break;
      }
      runs.push({
        text: rest.slice(open + 1, close),
        color: accentColor
      });
      rest = rest.slice(close + 1);
    }
    return runs.filter((r) => r.text.length > 0);
  }
  function layoutParagraphs(ctx, font, paras, maxWidth, fontSize, lineHeight) {
    ctx.font = font;
    ctx.textBaseline = "top";
    const cache = /* @__PURE__ */ new Map();
    const measure = (ch) => {
      const hit = cache.get(ch);
      if (hit !== void 0) return hit;
      const w = ctx.measureText(ch).width;
      cache.set(ch, w);
      return w;
    };
    const indent = measure("\u9752") * 2;
    const unitsOf = (text) => {
      const out = [];
      for (let i = 0; i < text.length; i++) {
        const ch = text[i];
        if (ch === "\u2014" && text[i + 1] === "\u2014") {
          out.push({
            ch: "\u2014\u2014",
            w: measure("\u2014") * 2
          });
          i++;
        } else out.push({
          ch,
          w: measure(ch)
        });
      }
      return out;
    };
    const lines = [];
    const eps = 0.5;
    for (const runs of paras) {
      let line = [];
      let x = indent;
      const flush = () => {
        if (line.length) lines.push(line);
        line = [];
        x = 0;
      };
      for (const run of runs) for (const unit of unitsOf(run.text)) {
        const ch = unit.ch;
        const w = unit.w;
        if (x + w > maxWidth + eps && line.length) {
          if (NO_LINE_START.includes(ch)) {
          } else {
            let carry = null;
            if (line.length > 1 && NO_LINE_END.includes(line[line.length - 1].ch)) carry = line.pop();
            flush();
            x = 0;
            if (carry) {
              x = 0;
              line.push({
                ch: carry.ch,
                color: carry.color,
                x,
                w: carry.w
              });
              x += carry.w;
            }
          }
        }
        line.push({
          ch,
          color: run.color,
          x,
          w
        });
        x += w;
        if (x >= maxWidth - eps && !NO_LINE_START.includes(ch)) flush();
      }
      flush();
    }
    return {
      lines,
      lineHeight,
      fontSize,
      height: Math.max(lines.length * lineHeight, lineHeight)
    };
  }
  function renderTextCanvas(plat2, layout, width, height, font, color) {
    const c = plat2.createOffscreen(width, height);
    const ctx = c.getContext("2d");
    ctx.textBaseline = "top";
    ctx.font = font;
    const pad = (layout.lineHeight - layout.fontSize) / 2;
    layout.lines.forEach((line, i) => {
      const y = i * layout.lineHeight + pad;
      for (const g of line) if (g.color === color) {
        ctx.fillStyle = color;
        ctx.fillText(g.ch, g.x, y);
      }
      for (const g of line) if (g.color !== color) {
        ctx.fillStyle = g.color;
        ctx.fillText(g.ch, g.x, y);
      }
    });
    return c;
  }
  const INK = "#241c14";
  const ACCENT = "#8c2b1d";
  const MUTED = "#7c6a55";
  const PAPER = "#efe3c8";
  const OK = "#2f7d4f";
  const BAD = "#a83224";
  const WAIT = "#b18125";
  const FONT_SIZE = 26;
  const LINE_H = 40;
  const TEXT_W = 616;
  const TEXT_H = 330;
  const TEXT_X = 132;
  const TEXT_Y = 172;
  const INTRO = [["\u6218\u56FD\u4E4B\u672B\uFF0C\u4E03\u96C4\u53EA\u5269\u4E00\u53E3\u6C14\u3002\u79E6\u5728\u4E1C\u8FB9\u78E8\u5200\uFF0C\u516D\u56FD\u5728\u897F\u8FB9\u53D1\u6296\u2014\u2014\u8BF8\u4FAF\u7684\u5BAB\u91CC\u591C\u591C\u70B9\u7740\u706F\uFF0C\u5546\u8BAE\u7684\u90FD\u662F\u540C\u4E00\u4EF6\u4E8B\uFF1A\u4E0B\u4E00\u4E2A\uFF0C\u4F1A\u8F6E\u5230\u8C01\u3002"], ["\u4F60\u662F\u27E6\u536B\u27E7\u56FD\u4EBA\uFF0C\u4EBA\u79F0\u5E86\u537F\u3002\u597D\u8BFB\u4E66\uFF0C\u51FB\u5251\uFF0C\u4EE5\u672F\u8BF4\u536B\u5143\u541B\u2014\u2014\u536B\u5143\u541B\u4E0D\u7528\u3002\u536B\u592A\u5C0F\uFF0C\u5BB9\u4E0D\u4E0B\u4F60\u7684\u5251\u3002\u8FD9\u4E00\u5E74\u521D\u6625\uFF0C\u4F60\u8D1F\u5251\u4E1C\u6E38\uFF0C\u8170\u95F4\u4E00\u67C4\u5251\uFF0C\u56CA\u4E2D\u51E0\u5377\u4E66\uFF0C\u8EAB\u540E\u4E00\u4E2A\u7559\u4E0D\u4F4F\u4F60\u7684\u6545\u56FD\u3002\u53F2\u4E66\u4E0A\u8FD8\u6CA1\u6709\u4F60\u7684\u540D\u5B57\u2014\u2014\u5B83\u8981\u7B49\u516D\u5E74\uFF0C\u7B49\u4E00\u628A\u5315\u9996\uFF0C\u7B49\u6613\u6C34\u8FB9\u4E00\u573A\u767D\u8863\u7684\u96EA\u3002"], ["\u27E6\u6986\u6B21\u27E7\u5927\u4FA0\u27E6\u76D6\u8042\u27E7\u7684\u5730\u76D8\u3002\u4F60\u4E0E\u4ED6\u8BBA\u5251\uFF0C\u8BDD\u4E0D\u6295\u673A\uFF0C\u4ED6\u5FFD\u7136\u4F4F\u53E3\uFF0C\u6012\u76EE\u800C\u89C6\u2014\u2014\u6EE1\u5802\u7684\u9152\u7897\u90FD\u505C\u5728\u534A\u7A7A\u3002\u4ED6\u7684\u5251\u5DF2\u5728\u624B\uFF0C\u4F60\u7684\u8FD8\u5728\u9798\u4E2D\u3002\u70DB\u706B\u8DF3\u4E86\u4E00\u4E0B\uFF0C\u6CA1\u6709\u4EBA\u6562\u6276\u2014\u2014\u8FD9\u4E00\u77AC\uFF0C\u5B9A\u5F97\u4E0B\u751F\u6B7B\u3002"]];
  const CARD_DEFS = [{
    title: "\u8FD8\u4EE5\u773C\u8272",
    sub: "\u5F90\u6B65\u800C\u51FA",
    face: "assets/card/card-face-jin.webp"
  }, {
    title: "\u957F\u63D6\u79F0\u8C22",
    sub: "\u8BF7\u6559\u8FC7\u5931",
    face: "assets/card/card-face-shou.webp"
  }, {
    title: "\u9080\u4ED6\u540C\u996E",
    sub: "\u5316\u654C\u4E3A\u53CB",
    face: "assets/card/card-face-bao.webp"
  }];
  const CARD_RECTS = CARD_DEFS.map((_, i) => ({
    x: 60 + i * 260,
    y: 570,
    w: 240,
    h: 112
  }));
  function roundRect(ctx, x, y, w, h, r) {
    const rr = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + rr, y);
    ctx.arcTo(x + w, y, x + w, y + h, rr);
    ctx.arcTo(x + w, y + h, x, y + h, rr);
    ctx.arcTo(x, y + h, x, y, rr);
    ctx.arcTo(x, y, x + w, y, rr);
    ctx.closePath();
  }
  function fitCover(sw, sh, iw, ih) {
    const s = Math.max(sw / iw, sh / ih);
    const w = iw * s;
    const h = ih * s;
    return {
      x: (sw - w) / 2,
      y: (sh - h) / 2,
      w,
      h
    };
  }
  async function loadAll(plat2, errors) {
    const safe = async (path) => {
      try {
        return await plat2.loadImage(path);
      } catch (e) {
        errors.push(path);
        return null;
      }
    };
    const [bg, panel, card, portrait, ...faces] = await Promise.all([safe("assets/bg/game.webp"), safe("assets/panel/scroll-main.webp"), safe("assets/card/card.webp"), safe("assets/portrait/jingke.webp"), ...CARD_DEFS.map((c) => safe(c.face))]);
    return {
      bg,
      panel,
      card,
      faces,
      portrait
    };
  }
  async function boot(plat2) {
    const errors = [];
    console.log("[P0] boot: loadFont start");
    const fontFamily = await plat2.loadFont("QSKai", "assets/fonts/qingshi-kai.ttf");
    console.log(`[P0] boot: loadFont done family=${fontFamily}`);
    const font = `${FONT_SIZE}px ${fontFamily ? `"${fontFamily}", ` : ""}serif`;
    const [assets] = await Promise.all([loadAll(plat2, errors)]);
    console.log(`[P0] boot: images done errors=${errors.join(",")}`);
    const bgm = plat2.audio("assets/audio/idle.webm", {
      loop: true,
      volume: 0.5
    });
    const click = plat2.audio("assets/audio/click.webm", {
      volume: 0.8
    });
    const storageKey = "qingshi.spike.probe";
    const probe = `${Date.now()}`;
    const storageSetOk = plat2.setStorage(storageKey, probe);
    const storageRead = plat2.getStorage(storageKey);
    const storageOk = storageSetOk && storageRead === probe;
    const paras = INTRO.map((p) => parseRuns(p.join(""), INK, ACCENT));
    const layout = layoutParagraphs(plat2.ctx, font, paras, TEXT_W, FONT_SIZE, LINE_H);
    const textCanvas = renderTextCanvas(plat2, layout, Math.ceil(TEXT_W), Math.ceil(layout.height), font, INK);
    const scene = {
      fontFamily,
      font,
      bg: assets.bg,
      panel: assets.panel,
      card: assets.card,
      faces: assets.faces,
      portrait: assets.portrait,
      textCanvas,
      layout,
      bgm,
      click,
      scrollY: 0,
      maxScroll: Math.max(0, layout.height - TEXT_H),
      drag: null,
      selected: -1,
      toast: "",
      toastAt: 0,
      lastTap: null,
      events: [],
      storageOk,
      storageValue: storageOk ? probe : "",
      imageErrors: errors,
      audioStarted: false
    };
    const toast = (msg) => {
      scene.toast = msg;
      scene.toastAt = Date.now();
    };
    const logEvent = (type, x, y) => {
      scene.events.push(`${type}(${Math.round(x)},${Math.round(y)})`);
      if (scene.events.length > 3) scene.events.shift();
    };
    const inRect = (x, y, r) => x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;
    plat2.onPointer({
      down(x, y, id) {
        scene.lastTap = {
          x,
          y
        };
        logEvent("down", x, y);
        if (!scene.audioStarted) {
          scene.audioStarted = true;
          scene.bgm.play();
        }
        if (inRect(x, y, {
          x: TEXT_X,
          y: TEXT_Y,
          w: TEXT_W,
          h: TEXT_H
        })) {
          scene.drag = {
            id,
            startY: y,
            startScroll: scene.scrollY
          };
          return;
        }
        CARD_RECTS.forEach((r, i) => {
          if (inRect(x, y, r)) {
            scene.selected = i;
            scene.click.replay();
            toast(`\u547D\u4E2D\u5361\u7247 ${i + 1}:${CARD_DEFS[i].title}`);
          }
        });
      },
      move(x, y, id) {
        if (!scene.drag || scene.drag.id !== id) return;
        logEvent("move", x, y);
        const next = scene.drag.startScroll - (y - scene.drag.startY);
        scene.scrollY = Math.max(0, Math.min(scene.maxScroll, next));
      },
      up(_x, _y, id) {
        logEvent("up", _x, _y);
        if (scene.drag && scene.drag.id === id) scene.drag = null;
      }
    });
    plat2.onHide(() => {
      scene.bgm.stop();
      toast("\u5DF2\u8FDB\u5165\u540E\u53F0:\u97F3\u9891\u505C\u6B62");
    });
    plat2.onShow(() => {
      if (scene.audioStarted) scene.bgm.play();
    });
    const raf = (cb) => {
      if (typeof requestAnimationFrame !== "undefined") requestAnimationFrame(() => cb());
      else setTimeout(cb, 16);
    };
    const drawFrame = () => {
      const {
        ctx,
        dpr,
        screenW,
        screenH
      } = plat2;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.fillStyle = PAPER;
      ctx.fillRect(0, 0, screenW, screenH);
      if (scene.bg) {
        const r = fitCover(screenW, screenH, scene.bg.w, scene.bg.h);
        ctx.drawImage(scene.bg.img, r.x, r.y, r.w, r.h);
      }
      ctx.setTransform(dpr * plat2.scale, 0, 0, dpr * plat2.scale, dpr * plat2.offsetX, dpr * plat2.offsetY);
      ctx.textBaseline = "top";
      ctx.fillStyle = INK;
      ctx.font = `30px ${scene.fontFamily ? `"${scene.fontFamily}", ` : ""}serif`;
      ctx.fillText("P0 \u6280\u672F\u9A8C\u8BC1 \xB7 \u9752\u53F2\u5FD7 \xD7 \u5C0F\u7C73\u5C0F\u6E38\u620F", 60, 26);
      ctx.fillStyle = MUTED;
      ctx.font = `16px ${scene.fontFamily ? `"${scene.fontFamily}", ` : ""}serif`;
      ctx.fillText("\u62D6\u52A8\u6B63\u6587\u53EF\u6EDA\u52A8 \xB7 \u70B9\u51FB\u5361\u7247\u6709\u53CD\u9988\u4E0E\u97F3\u6548 \xB7 \u53F3\u4E0A\u89D2\u4E3A\u5E73\u53F0\u81EA\u68C0", 60, 68);
      if (scene.events.length) {
        ctx.fillStyle = "#5a4a3a";
        ctx.font = "13px sans-serif";
        ctx.fillText(`\u8F93\u5165\u4E8B\u4EF6:${scene.events.join("  ")}`, 60, 88);
      }
      if (scene.panel) ctx.drawImage(scene.panel.img, 60, 100, 760, 450);
      else {
        ctx.fillStyle = "#fff8e8";
        roundRect(ctx, 60, 100, 760, 450, 12);
        ctx.fill();
      }
      ctx.save();
      ctx.beginPath();
      ctx.rect(TEXT_X, TEXT_Y, TEXT_W, TEXT_H);
      ctx.clip();
      ctx.drawImage(scene.textCanvas, TEXT_X, TEXT_Y - scene.scrollY, TEXT_W, layout.height);
      ctx.restore();
      if (scene.maxScroll > 0) {
        const trackH = TEXT_H;
        const barH = Math.max(28, trackH * (TEXT_H / layout.height));
        const barY = TEXT_Y + (trackH - barH) * (scene.scrollY / scene.maxScroll);
        ctx.fillStyle = "rgba(140,43,29,0.55)";
        roundRect(ctx, 760, barY, 5, barH, 2.5);
        ctx.fill();
      }
      if (scene.portrait) {
        const p = scene.portrait;
        ctx.drawImage(p.img, 900, 410, 200, 300);
      }
      CARD_RECTS.forEach((r, i) => {
        if (scene.card) ctx.drawImage(scene.card.img, r.x, r.y, r.w, r.h);
        else {
          ctx.fillStyle = i === scene.selected ? "#e8cb9a" : "#f8efda";
          roundRect(ctx, r.x, r.y, r.w, r.h, 10);
          ctx.fill();
        }
        if (i === scene.selected) {
          ctx.strokeStyle = ACCENT;
          ctx.lineWidth = 3;
          roundRect(ctx, r.x + 2, r.y + 2, r.w - 4, r.h - 4, 9);
          ctx.stroke();
        }
        const face = scene.faces[i];
        if (face) ctx.drawImage(face.img, r.x + 16, r.y + 22, 68, 68);
        ctx.fillStyle = INK;
        ctx.font = `20px ${scene.fontFamily ? `"${scene.fontFamily}", ` : ""}serif`;
        ctx.fillText(CARD_DEFS[i].title, r.x + 96, r.y + 30);
        ctx.fillStyle = MUTED;
        ctx.font = `16px ${scene.fontFamily ? `"${scene.fontFamily}", ` : ""}serif`;
        ctx.fillText(CARD_DEFS[i].sub, r.x + 96, r.y + 60);
      });
      plat2.ctx.font = scene.font;
      const measured = plat2.ctx.measureText("\u9752").width;
      const audioState = scene.bgm.state();
      const checks = [{
        name: "\u753B\u5E03",
        ok: screenW > 0 && screenH > 0,
        detail: `${plat2.kind} \xB7 ${Math.round(screenW)}\xD7${Math.round(screenH)} @${dpr}x \xB7 \u7F29\u653E${plat2.scale.toFixed(2)}`
      }, {
        name: "webp \u89E3\u7801",
        ok: !!scene.bg && !!scene.portrait && scene.bg.w > 0,
        detail: scene.bg ? `\u80CC\u666F ${scene.bg.w}\xD7${scene.bg.h} \xB7 \u7ACB\u7ED8 ${scene.portrait?.w ?? 0}\xD7${scene.portrait?.h ?? 0}` : `\u5931\u8D25:${scene.imageErrors.join(",") || "\u672A\u77E5"}`
      }, {
        name: "\u5B57\u4F53\u5EA6\u91CF",
        ok: !!scene.fontFamily && measured > 0,
        detail: `${scene.fontFamily ?? "\u672A\u52A0\u8F7D,\u56DE\u9000 serif"} \xB7 \u201C\u9752\u201D${measured.toFixed(1)}px`
      }, {
        name: "opus \u97F3\u9891",
        ok: audioState === "ready" && scene.bgm.duration() > 0,
        detail: audioState === "error" ? scene.bgm.errorText() : `${scene.bgm.duration().toFixed(2)}s \xB7 ${audioState}`
      }, {
        name: "\u5B58\u50A8\u56DE\u73AF",
        ok: scene.storageOk,
        detail: scene.storageOk ? `\u5DF2\u5199\u5165 ${scene.storageValue.slice(-6)}` : `set=${storageSetOk} read=${storageRead ?? "null"}`
      }, {
        name: "\u89E6\u6478\u5750\u6807",
        ok: !!scene.lastTap,
        detail: scene.lastTap ? `(${Math.round(scene.lastTap.x)}, ${Math.round(scene.lastTap.y)}) \u8BBE\u8BA1\u5750\u6807` : "\u5C1A\u672A\u70B9\u51FB"
      }];
      if (typeof console !== "undefined") console.log("[P0]", checks.map((c) => `${c.name}=${c.ok === true ? "OK" : c.ok === false ? "FAIL" : "WAIT"} (${c.detail})`).join(" | "));
      const px = 850;
      const py = 40;
      const pw = 390;
      const ph = 42 + checks.length * 46;
      ctx.fillStyle = "rgba(252,246,232,0.94)";
      roundRect(ctx, px, py, pw, ph, 10);
      ctx.fill();
      ctx.strokeStyle = "rgba(120,95,65,0.5)";
      ctx.lineWidth = 1;
      roundRect(ctx, px, py, pw, ph, 10);
      ctx.stroke();
      ctx.fillStyle = INK;
      ctx.font = `20px ${scene.fontFamily ? `"${scene.fontFamily}", ` : ""}serif`;
      ctx.fillText(`\u5E73\u53F0\u81EA\u68C0 \xB7 ${plat2.kind === "qg" ? "\u5C0F\u7C73\u5FEB\u6E38\u620F" : "\u6D4F\u89C8\u5668"}`, 868, 52);
      checks.forEach((c, i) => {
        const y = 88 + i * 46;
        ctx.fillStyle = c.ok === true ? OK : c.ok === false ? BAD : WAIT;
        ctx.beginPath();
        ctx.arc(874, y + 9, 6, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = INK;
        ctx.font = `17px ${scene.fontFamily ? `"${scene.fontFamily}", ` : ""}serif`;
        ctx.fillText(c.name, 888, y);
        ctx.fillStyle = MUTED;
        ctx.font = `14px ${scene.fontFamily ? `"${scene.fontFamily}", ` : ""}serif`;
        ctx.fillText(c.detail.slice(0, 44), 888, y + 20);
      });
      if (scene.toast && Date.now() - scene.toastAt < 4e3) {
        ctx.font = `18px ${scene.fontFamily ? `"${scene.fontFamily}", ` : ""}serif`;
        const tw = ctx.measureText(scene.toast).width + 36;
        ctx.fillStyle = "rgba(36,28,20,0.82)";
        roundRect(ctx, 640 - tw / 2, 522, tw, 40, 20);
        ctx.fill();
        ctx.fillStyle = "#f6ecd6";
        ctx.textAlign = "center";
        ctx.fillText(scene.toast, 640, 532);
        ctx.textAlign = "left";
      }
    };
    const draw = () => {
      try {
        drawFrame();
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        if (typeof console !== "undefined") console.error("[P0] draw failed", e);
        const {
          ctx,
          dpr,
          screenW,
          screenH
        } = plat2;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.fillStyle = "#2b2118";
        ctx.fillRect(0, 0, screenW, screenH);
        ctx.fillStyle = "#ffb4a0";
        ctx.font = "20px sans-serif";
        ctx.textBaseline = "top";
        ctx.fillText(`\u6E32\u67D3\u5F02\u5E38:${msg}`, 24, 60);
        return;
      }
      raf(draw);
    };
    raf(draw);
  }
  console.log("[P0] main.js start");
  const plat = createPlatform();
  console.log(`[P0] platform ok kind=${plat.kind} screen=${plat.screenW}x${plat.screenH} dpr=${plat.dpr}`);
  boot(plat).then(() => console.log("[P0] boot resolved")).catch((err) => {
    const msg = err instanceof Error ? `${err.message}
${err.stack ?? ""}` : String(err);
    console.error("[P0] boot failed", msg);
    const {
      ctx,
      dpr,
      screenW,
      screenH
    } = plat;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = "#2b2118";
    ctx.fillRect(0, 0, screenW, screenH);
    ctx.fillStyle = "#f0c9a0";
    ctx.font = `${Math.max(14, Math.round(screenW / 46))}px sans-serif`;
    ctx.textBaseline = "top";
    msg.split("\n").slice(0, 8).forEach((line, i) => ctx.fillText(line, 16, 40 + i * 26));
  });
})();
