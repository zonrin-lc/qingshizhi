(function() {
	//#region src/platform.ts
	const DESIGN_W = 1280;
	function getQg() {
		try {
			if (typeof qg !== "undefined") return qg;
		} catch {}
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
						el.play().catch(() => {});
					},
					replay() {
						try {
							el.currentTime = 0;
						} catch {}
						el.play().catch(() => {});
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
					} catch {}
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
						} catch {}
					},
					replay() {
						try {
							a.stop();
						} catch {}
						try {
							a.play();
						} catch {}
					},
					stop() {
						try {
							a.stop();
						} catch {}
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
						const r = games.getStorageSync({ key });
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
				} catch {}
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
	//#endregion
	//#region src/text.ts
	/** 不能出现在行首的标点(避头);破折号也算,单个 — 落在行首同样难看 */
	const NO_LINE_START = "，。、；：？！）》」』】…·—,.;:?!)]}";
	/** 不能出现在行尾的标点(避尾) */
	const NO_LINE_END = "（《「『【([{";
	function parseRuns(raw, baseColor, accentColor) {
		const runs = [];
		let rest = raw;
		while (rest.length) {
			const open = rest.indexOf("⟦");
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
			const close = rest.indexOf("⟧", open);
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
		const indent = measure("青") * 2;
		/** 把一段文字切成不可拆的排版单元:成对的破折号 —— 是一个单元,不能行末半截、行首半截 */
		const unitsOf = (text) => {
			const out = [];
			for (let i = 0; i < text.length; i++) {
				const ch = text[i];
				if (ch === "—" && text[i + 1] === "—") {
					out.push({
						ch: "——",
						w: measure("—") * 2
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
		const eps = .5;
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
					if (NO_LINE_START.includes(ch)) {} else {
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
	/**
	* 把排版结果画到一张离屏画布上(只画一次,之后整屏 blit,避免每帧上千次 fillText)。
	*/
	function renderTextCanvas(plat, layout, width, height, font, color) {
		const c = plat.createOffscreen(width, height);
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
	//#endregion
	//#region src/screen.ts
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
	const INTRO = [
		["战国之末，七雄只剩一口气。秦在东边磨刀，六国在西边发抖——诸侯的宫里夜夜点着灯，商议的都是同一件事：下一个，会轮到谁。"],
		["你是⟦卫⟧国人，人称庆卿。好读书，击剑，以术说卫元君——卫元君不用。卫太小，容不下你的剑。这一年初春，你负剑东游，腰间一柄剑，囊中几卷书，身后一个留不住你的故国。史书上还没有你的名字——它要等六年，等一把匕首，等易水边一场白衣的雪。"],
		["⟦榆次⟧大侠⟦盖聂⟧的地盘。你与他论剑，话不投机，他忽然住口，怒目而视——满堂的酒碗都停在半空。他的剑已在手，你的还在鞘中。烛火跳了一下，没有人敢扶——这一瞬，定得下生死。"]
	];
	const CARD_DEFS = [
		{
			title: "还以眼色",
			sub: "徐步而出",
			face: "assets/card/card-face-jin.webp"
		},
		{
			title: "长揖称谢",
			sub: "请教过失",
			face: "assets/card/card-face-shou.webp"
		},
		{
			title: "邀他同饮",
			sub: "化敌为友",
			face: "assets/card/card-face-bao.webp"
		}
	];
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
	async function loadAll(plat, errors) {
		const safe = async (path) => {
			try {
				return await plat.loadImage(path);
			} catch (e) {
				errors.push(path);
				return null;
			}
		};
		const [bg, panel, card, portrait, ...faces] = await Promise.all([
			safe("assets/bg/game.webp"),
			safe("assets/panel/scroll-main.webp"),
			safe("assets/card/card.webp"),
			safe("assets/portrait/jingke.webp"),
			...CARD_DEFS.map((c) => safe(c.face))
		]);
		return {
			bg,
			panel,
			card,
			faces,
			portrait
		};
	}
	async function boot(plat) {
		const errors = [];
		console.log("[P0] boot: loadFont start");
		const fontFamily = await plat.loadFont("QSKai", "assets/fonts/qingshi-kai.ttf");
		console.log(`[P0] boot: loadFont done family=${fontFamily}`);
		const font = `${FONT_SIZE}px ${fontFamily ? `"${fontFamily}", ` : ""}serif`;
		const [assets] = await Promise.all([loadAll(plat, errors)]);
		console.log(`[P0] boot: images done errors=${errors.join(",")}`);
		const bgm = plat.audio("assets/audio/idle.webm", {
			loop: true,
			volume: .5
		});
		const click = plat.audio("assets/audio/click.webm", { volume: .8 });
		const storageKey = "qingshi.spike.probe";
		const probe = `${Date.now()}`;
		const storageSetOk = plat.setStorage(storageKey, probe);
		const storageRead = plat.getStorage(storageKey);
		const storageOk = storageSetOk && storageRead === probe;
		const paras = INTRO.map((p) => parseRuns(p.join(""), INK, ACCENT));
		const layout = layoutParagraphs(plat.ctx, font, paras, TEXT_W, FONT_SIZE, LINE_H);
		const textCanvas = renderTextCanvas(plat, layout, Math.ceil(TEXT_W), Math.ceil(layout.height), font, INK);
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
		plat.onPointer({
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
						toast(`命中卡片 ${i + 1}:${CARD_DEFS[i].title}`);
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
		plat.onHide(() => {
			scene.bgm.stop();
			toast("已进入后台:音频停止");
		});
		plat.onShow(() => {
			if (scene.audioStarted) scene.bgm.play();
		});
		const raf = (cb) => {
			if (typeof requestAnimationFrame !== "undefined") requestAnimationFrame(() => cb());
			else setTimeout(cb, 16);
		};
		const drawFrame = () => {
			const { ctx, dpr, screenW, screenH } = plat;
			ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
			ctx.fillStyle = PAPER;
			ctx.fillRect(0, 0, screenW, screenH);
			if (scene.bg) {
				const r = fitCover(screenW, screenH, scene.bg.w, scene.bg.h);
				ctx.drawImage(scene.bg.img, r.x, r.y, r.w, r.h);
			}
			ctx.setTransform(dpr * plat.scale, 0, 0, dpr * plat.scale, dpr * plat.offsetX, dpr * plat.offsetY);
			ctx.textBaseline = "top";
			ctx.fillStyle = INK;
			ctx.font = `30px ${scene.fontFamily ? `"${scene.fontFamily}", ` : ""}serif`;
			ctx.fillText("P0 技术验证 · 青史志 × 小米小游戏", 60, 26);
			ctx.fillStyle = MUTED;
			ctx.font = `16px ${scene.fontFamily ? `"${scene.fontFamily}", ` : ""}serif`;
			ctx.fillText("拖动正文可滚动 · 点击卡片有反馈与音效 · 右上角为平台自检", 60, 68);
			if (scene.events.length) {
				ctx.fillStyle = "#5a4a3a";
				ctx.font = "13px sans-serif";
				ctx.fillText(`输入事件:${scene.events.join("  ")}`, 60, 88);
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
			plat.ctx.font = scene.font;
			const measured = plat.ctx.measureText("青").width;
			const audioState = scene.bgm.state();
			const checks = [
				{
					name: "画布",
					ok: screenW > 0 && screenH > 0,
					detail: `${plat.kind} · ${Math.round(screenW)}×${Math.round(screenH)} @${dpr}x · 缩放${plat.scale.toFixed(2)}`
				},
				{
					name: "webp 解码",
					ok: !!scene.bg && !!scene.portrait && scene.bg.w > 0,
					detail: scene.bg ? `背景 ${scene.bg.w}×${scene.bg.h} · 立绘 ${scene.portrait?.w ?? 0}×${scene.portrait?.h ?? 0}` : `失败:${scene.imageErrors.join(",") || "未知"}`
				},
				{
					name: "字体度量",
					ok: !!scene.fontFamily && measured > 0,
					detail: `${scene.fontFamily ?? "未加载,回退 serif"} · “青”${measured.toFixed(1)}px`
				},
				{
					name: "opus 音频",
					ok: audioState === "ready" && scene.bgm.duration() > 0,
					detail: audioState === "error" ? scene.bgm.errorText() : `${scene.bgm.duration().toFixed(2)}s · ${audioState}`
				},
				{
					name: "存储回环",
					ok: scene.storageOk,
					detail: scene.storageOk ? `已写入 ${scene.storageValue.slice(-6)}` : `set=${storageSetOk} read=${storageRead ?? "null"}`
				},
				{
					name: "触摸坐标",
					ok: !!scene.lastTap,
					detail: scene.lastTap ? `(${Math.round(scene.lastTap.x)}, ${Math.round(scene.lastTap.y)}) 设计坐标` : "尚未点击"
				}
			];
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
			ctx.fillText(`平台自检 · ${plat.kind === "qg" ? "小米快游戏" : "浏览器"}`, 868, 52);
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
				const { ctx, dpr, screenW, screenH } = plat;
				ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
				ctx.fillStyle = "#2b2118";
				ctx.fillRect(0, 0, screenW, screenH);
				ctx.fillStyle = "#ffb4a0";
				ctx.font = "20px sans-serif";
				ctx.textBaseline = "top";
				ctx.fillText(`渲染异常:${msg}`, 24, 60);
				return;
			}
			raf(draw);
		};
		raf(draw);
	}
	//#endregion
	//#region src/main.ts
	console.log("[P0] main.js start");
	const plat = createPlatform();
	console.log(`[P0] platform ok kind=${plat.kind} screen=${plat.screenW}x${plat.screenH} dpr=${plat.dpr}`);
	boot(plat).then(() => console.log("[P0] boot resolved")).catch((err) => {
		const msg = err instanceof Error ? `${err.message}\n${err.stack ?? ""}` : String(err);
		console.error("[P0] boot failed", msg);
		const { ctx, dpr, screenW, screenH } = plat;
		ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
		ctx.fillStyle = "#2b2118";
		ctx.fillRect(0, 0, screenW, screenH);
		ctx.fillStyle = "#f0c9a0";
		ctx.font = `${Math.max(14, Math.round(screenW / 46))}px sans-serif`;
		ctx.textBaseline = "top";
		msg.split("\n").slice(0, 8).forEach((line, i) => ctx.fillText(line, 16, 40 + i * 26));
	});
	//#endregion
})();
