(function() {
	//#region \0rolldown/runtime.js
	var __create = Object.create;
	var __defProp = Object.defineProperty;
	var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
	var __getOwnPropNames = Object.getOwnPropertyNames;
	var __getProtoOf = Object.getPrototypeOf;
	var __hasOwnProp = Object.prototype.hasOwnProperty;
	var __commonJSMin = (cb, mod) => () => (mod || (cb((mod = { exports: {} }).exports, mod), cb = null), mod.exports);
	var __copyProps = (to, from, except, desc) => {
		if (from && typeof from === "object" || typeof from === "function") for (var keys = __getOwnPropNames(from), i = 0, n = keys.length, key; i < n; i++) {
			key = keys[i];
			if (!__hasOwnProp.call(to, key) && key !== except) __defProp(to, key, {
				get: ((k) => from[k]).bind(null, key),
				enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable
			});
		}
		return to;
	};
	var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(isNodeMode || !mod || !mod.__esModule || !__hasOwnProp.call(mod, "default") ? __defProp(target, "default", {
		value: mod,
		enumerable: true
	}) : target, mod));
	//#endregion
	//#region src/port/theme.ts
	/**
	* 视觉常量:直接对齐 H5 的 CSS 变量(styles/base.css),避免两套色板漂移。
	* 设计稿基准 1280×720,横屏。
	*/
	const DESIGN_W = 1280;
	const COLOR = {
		app: "#f2ead8",
		paper: "#f6efe0",
		paperCard: "#faf5e9",
		paperCardSel: "#fffcf2",
		inkHeavy: "#1a1612",
		inkStrong: "#2a251d",
		ink: "#3e372c",
		inkSoft: "#605646",
		inkDim: "#847864",
		zhu: "#b0432f",
		zhuHi: "#9e3422",
		gold: "#8a6a34",
		goldHi: "#c4a05a",
		qing: "#467069",
		good: "#567444",
		line: "#c6b492",
		lineSoft: "#d6c8ae"
	};
	/** 正文卷轴内的排版参数(与 H5 阅读区等宽) */
	const TEXT = {
		/** 正文起点(设计坐标) */
		x: 132,
		y: 206,
		w: 616,
		h: 292,
		fontSize: 26,
		lineHeight: 41,
		/** 段间额外间距 */
		paraGap: 10
	};
	/** 卷轴面板矩形 */
	const PANEL$1 = {
		x: 60,
		y: 92,
		w: 760,
		h: 456
	};
	//#endregion
	//#region src/port/platform.ts
	/**
	* 真机实测:运行时把 qg 注入成裸全局变量,并不一定挂在 globalThis 上,
	* 只查 globalThis 会误判成 web 分支(表现就是 localStorage 存储失败)。
	*/
	function getQg() {
		try {
			if (typeof qg !== "undefined") return qg;
		} catch {}
		return globalThis.qg;
	}
	function hasQg() {
		return typeof getQg() !== "undefined";
	}
	/** 等比铺满 + 居中留边:设计空间 1280×720 映射到真实屏幕 */
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
		const viewport = () => ({
			w: window.innerWidth || document.documentElement.clientWidth || 1280,
			h: window.innerHeight || document.documentElement.clientHeight || 720
		});
		let { w: screenW, h: screenH } = viewport();
		const dpr = Math.min(window.devicePixelRatio || 1, 3);
		let fit = fitScale(screenW, screenH);
		const applySize = () => {
			const v = viewport();
			screenW = v.w;
			screenH = v.h;
			fit = fitScale(screenW, screenH);
			canvas.width = Math.round(screenW * dpr);
			canvas.height = Math.round(screenH * dpr);
		};
		applySize();
		window.addEventListener("resize", applySize);
		window.visualViewport?.addEventListener("resize", applySize);
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
			dpr,
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
			offscreen: { create(w, h) {
				const c = document.createElement("canvas");
				c.width = Math.ceil(w);
				c.height = Math.ceil(h);
				return c;
			} },
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
				const el = new Audio();
				el.loop = !!opts?.loop;
				el.volume = opts?.volume ?? 1;
				el.preload = "auto";
				el.src = path;
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
					pause() {
						el.pause();
					},
					resume() {
						if (el.src) el.play().catch(() => {});
					},
					setSrc(p) {
						failed = "";
						try {
							el.src = p;
						} catch {
							failed = `bad src: ${p}`;
						}
						el.load();
					},
					setVolume(v) {
						el.volume = Math.max(0, Math.min(1, v));
					},
					setLoop(loop) {
						el.loop = loop;
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
					},
					time() {
						return el.currentTime || 0;
					},
					onEnded(cb) {
						el.addEventListener("ended", cb);
					},
					onError(cb) {
						el.addEventListener("error", () => cb(failed || `media error (${el.error?.code ?? "?"})`));
					},
					destroy() {
						el.pause();
						el.removeAttribute("src");
						el.load();
					}
				};
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
			offscreen: { create(w, h) {
				const c = games.createCanvas();
				c.width = Math.ceil(w);
				c.height = Math.ceil(h);
				return c;
			} },
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
					pause() {
						try {
							a.pause();
						} catch {}
					},
					resume() {
						try {
							a.play();
						} catch {}
					},
					setSrc(p) {
						failed = "";
						try {
							a.stop();
						} catch {}
						try {
							a.src = p;
						} catch {
							failed = `bad src: ${p}`;
						}
					},
					setVolume(v) {
						a.volume = Math.max(0, Math.min(1, v));
					},
					setLoop(loop) {
						try {
							a.loop = loop;
						} catch {}
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
					},
					time() {
						try {
							return a.currentTime || 0;
						} catch {
							return 0;
						}
					},
					onEnded(cb) {
						try {
							a.onEnded(cb);
						} catch {}
					},
					onError(cb) {
						try {
							a.onError((e) => cb(`${e?.errCode ?? "?"} ${e?.errMsg ?? ""}`));
						} catch {}
					},
					destroy() {
						try {
							a.stop();
						} catch {}
						try {
							a.destroy();
						} catch {}
					}
				};
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
	//#region src/port/assets.ts
	var AssetStore = class {
		plat;
		images = /* @__PURE__ */ new Map();
		pending = /* @__PURE__ */ new Map();
		failed = [];
		constructor(plat) {
			this.plat = plat;
		}
		get(path) {
			return this.images.get(path) ?? null;
		}
		load(path) {
			const hit = this.images.get(path);
			if (hit) return Promise.resolve(hit);
			const inflight = this.pending.get(path);
			if (inflight) return inflight;
			const p = this.plat.loadImage(path).then((asset) => {
				this.images.set(path, asset);
				this.pending.delete(path);
				return asset;
			}).catch(() => {
				this.failed.push(path);
				this.pending.delete(path);
				return null;
			});
			this.pending.set(path, p);
			return p;
		}
		/** 并发预载一批图片,每完成一张回调一次进度 */
		async preload(paths, onProgress) {
			let done = 0;
			const total = paths.length;
			const progress = () => {
				done += 1;
				onProgress?.({
					done,
					total,
					failed: this.failed.slice()
				});
			};
			await Promise.all(paths.map((p) => this.load(p).then(() => progress())));
		}
	};
	/** 常用图片路径集中在这里,避免各处散落字符串 */
	const IMG = {
		bgGame: "assets/bg/game.webp",
		panelScroll: "assets/panel/scroll-main.webp",
		card: "assets/card/card.webp",
		cardHi: "assets/card/card-hi.webp",
		badge: "assets/card/card-badge.webp",
		menuBg: "assets/lua/menu-bg-1440.webp",
		title: "assets/lua/title-calligraphy.webp",
		logoIcon: "assets/lua/logo-icon.webp",
		logoYin: "assets/lua/logo-yin.webp",
		bgSelect: "assets/bg/select.webp",
		bgSave: "assets/bg/save.webp",
		bgSettings: "assets/bg/settings.webp",
		/** 选剧本页封面(384 见方,见 prepare-assets 的体积账) */
		cover: (key) => `assets/cover/${key}-384.webp`
	};
	const FONT = {
		family: "QingshiKai",
		path: "assets/fonts/qingshi-kai.ttf"
	};
	//#endregion
	//#region src/game/saves.ts
	const AUTO_KEY = "qingshi.autos.v1";
	const STASH_KEY = "qingshi.stash.v1";
	const BACKUP_KEY = "qingshi.cloudbackup.v1";
	function isSlot(v) {
		if (!v || typeof v !== "object") return false;
		const s = v;
		return typeof s.at === "number" && !!s.payload && typeof s.payload === "object";
	}
	/**
	* 逐桶过滤:非法桶整个丢弃,非法条目逐条丢弃。
	* dropped=true 表示原始数据里有非法形状,调用方据此把原文隔离到 .broken 键。
	*/
	function sanitizeStore(raw) {
		const out = {};
		let dropped = false;
		if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {
			store: out,
			dropped: !!raw
		};
		for (const [k, v] of Object.entries(raw)) {
			if (!Array.isArray(v)) {
				dropped = true;
				continue;
			}
			const list = v.filter(isSlot);
			if (list.length !== v.length) dropped = true;
			if (list.length) out[k] = list;
		}
		return {
			store: out,
			dropped
		};
	}
	var SaveStore = class {
		plat;
		mutListeners = [];
		constructor(plat) {
			this.plat = plat;
		}
		/** 存档变动订阅;返回退订函数。监听者抛错不许砸存档本体。 */
		onMutated(cb) {
			this.mutListeners.push(cb);
			return () => {
				const i = this.mutListeners.indexOf(cb);
				if (i >= 0) this.mutListeners.splice(i, 1);
			};
		}
		listAutoEntries(scenKey) {
			const store = this.read(AUTO_KEY);
			const pick = (k) => (store[k] ?? []).map((s, idx) => ({
				slot: s,
				idx
			}));
			return (scenKey ? pick(scenKey) : Object.keys(store).flatMap(pick)).sort((a, b) => b.slot.at - a.slot.at);
		}
		listAutos(scenKey) {
			return this.listAutoEntries(scenKey).map((e) => e.slot);
		}
		autoCount(scenKey) {
			return (this.read(AUTO_KEY)[scenKey] ?? []).length;
		}
		/** 全部剧本里最新的一条自动档(驱动主菜单「继续旅程」) */
		getLatestAuto() {
			return this.listAutos()[0] ?? null;
		}
		/**
		* 写一条自动档。满 AUTO_MAX 条时:
		* - 未带 overwriteOldest → 不存,返回 full: true 让 UI 去确认
		* - 带了 → 覆盖最早的一条(FIFO)
		* 引擎说不可存(硬核 / 无章首快照 / noSave 剧本)时返回 ok:false。
		*/
		saveAuto(game, scenKey, scenName, opts) {
			const ch = game.chapter();
			const payload = game.exportSave();
			if (!payload) return {
				ok: false,
				reason: "当前对局不可存档(硬核不许回退 / 尚未进入任何一章)",
				full: false
			};
			const store = this.read(AUTO_KEY);
			const list = store[scenKey] ?? [];
			const roundNo = opts?.roundNo ?? 0;
			const record = {
				at: Date.now(),
				scenKey,
				scenName,
				diffKey: game.diffKey,
				chapterIdx: game.chapterIdx,
				chapterTitle: ch?.title ?? `第 ${game.chapterIdx + 1} 章`,
				roundNo,
				backtracksLeft: game.diff.backtrack < 0 ? -1 : Math.max(0, game.diff.backtrack - game.backtracksThisChapter),
				age: game.age,
				payload,
				...opts?.ui?.length ? { ui: opts.ui } : {}
			};
			const last = list[list.length - 1];
			if (last && last.chapterIdx === record.chapterIdx && last.roundNo === record.roundNo && last.diffKey === record.diffKey) {
				list[list.length - 1] = record;
				store[scenKey] = list;
				return this.write(AUTO_KEY, store) ? {
					ok: true,
					reason: "已刷新本轮的自动档",
					full: false
				} : {
					ok: false,
					reason: "写入本地存储失败(可能空间已满)",
					full: false
				};
			}
			if (list.length >= 6) {
				if (!opts?.overwriteOldest) return {
					ok: false,
					reason: `「${scenName}」的存档已满 6 条`,
					full: true
				};
				list.shift();
			}
			list.push(record);
			store[scenKey] = list;
			const where = `${ch?.title ?? `第 ${game.chapterIdx + 1} 章`}${roundNo > 0 ? ` · 第 ${roundNo} 轮` : ""}`;
			return this.write(AUTO_KEY, store) ? {
				ok: true,
				reason: `已存档(${where})`,
				full: false
			} : {
				ok: false,
				reason: "写入本地存储失败(可能空间已满)",
				full: false
			};
		}
		removeAuto(scenKey, idx) {
			const store = this.read(AUTO_KEY);
			const list = store[scenKey];
			if (!list || idx < 0 || idx >= list.length) return;
			list.splice(idx, 1);
			if (list.length === 0) delete store[scenKey];
			this.write(AUTO_KEY, store);
		}
		/** 清空某剧本的自动档(结局落地时调:通关的局不该再复活) */
		clearAutos(scenKey) {
			const store = this.read(AUTO_KEY);
			if (!(scenKey in store)) return;
			delete store[scenKey];
			this.write(AUTO_KEY, store);
		}
		/** 写一份暂存;返回是否真的存下了(不可存的局安静返回 false) */
		stashSave(game, scenKey, scenName, roundNo = 0, ui) {
			const ch = game.chapter();
			const payload = game.exportSave();
			if (!payload) return false;
			const store = this.read(STASH_KEY);
			const list = store[scenKey] ?? [];
			list.push({
				at: Date.now(),
				scenKey,
				scenName,
				diffKey: game.diffKey,
				chapterIdx: game.chapterIdx,
				chapterTitle: ch?.title ?? `第 ${game.chapterIdx + 1} 章`,
				roundNo,
				backtracksLeft: game.diff.backtrack < 0 ? -1 : Math.max(0, game.diff.backtrack - game.backtracksThisChapter),
				age: game.age,
				payload,
				...ui?.length ? { ui } : {}
			});
			while (list.length > 1) list.shift();
			store[scenKey] = list;
			return this.write(STASH_KEY, store);
		}
		listStashEntries(scenKey) {
			const store = this.read(STASH_KEY);
			const pick = (k) => (store[k] ?? []).map((s, idx) => ({
				slot: s,
				idx
			}));
			return (scenKey ? pick(scenKey) : Object.keys(store).flatMap(pick)).sort((a, b) => b.slot.at - a.slot.at);
		}
		listStash(scenKey) {
			return this.listStashEntries(scenKey).map((e) => e.slot);
		}
		removeStash(scenKey, idx) {
			const store = this.read(STASH_KEY);
			const list = store[scenKey];
			if (!list || idx < 0 || idx >= list.length) return;
			list.splice(idx, 1);
			if (list.length === 0) delete store[scenKey];
			this.write(STASH_KEY, store);
		}
		exportBundle() {
			return {
				autos: this.read(AUTO_KEY),
				stash: this.read(STASH_KEY)
			};
		}
		/**
		* 用云 bundle 整包覆写本地。
		* 非法包不按空包处理(那会清空玩家本地档);备份写失败就中止导入。
		*/
		importBundle(b) {
			if (!b || typeof b !== "object") return false;
			const autos = b.autos;
			const stash = b.stash;
			if (!autos || typeof autos !== "object" || Array.isArray(autos)) return false;
			if (!stash || typeof stash !== "object" || Array.isArray(stash)) return false;
			const nextAutos = sanitizeStore(autos).store;
			const nextStash = sanitizeStore(stash).store;
			if (!this.plat.setStorage(BACKUP_KEY, JSON.stringify(this.exportBundle()))) return false;
			const okAutos = this.write(AUTO_KEY, nextAutos);
			const okStash = this.write(STASH_KEY, nextStash);
			return okAutos && okStash;
		}
		/**
		* 解析失败/形状非法时:先把原始串隔离到 .broken 键(数据不丢,可人工找回),
		* 再当空库处理 —— 但不删原键。
		*/
		read(key) {
			const raw = this.plat.getStorage(key);
			if (!raw) return {};
			try {
				const { store, dropped } = sanitizeStore(JSON.parse(raw));
				if (dropped) this.quarantine(key, raw);
				return store;
			} catch {
				this.quarantine(key, raw);
				return {};
			}
		}
		write(key, store) {
			if (!this.plat.setStorage(key, JSON.stringify(store))) return false;
			for (const cb of [...this.mutListeners]) try {
				cb();
			} catch {}
			return true;
		}
		quarantine(key, raw) {
			this.plat.setStorage(`${key}.broken`, raw);
		}
	};
	/** 人类可读的时间 */
	function fmtTime(at) {
		const d = new Date(at);
		const p = (n) => String(n).padStart(2, "0");
		return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
	}
	const DIFF_LABEL = {
		story: "剧情",
		normal: "普通",
		hardcore: "硬核"
	};
	//#endregion
	//#region ../prot/lua-data/lisi.json
	var require_lisi = /* @__PURE__ */ __commonJSMin(((exports, module) => {
		module.exports = {
			"ATTRS": [
				{
					"k": "tupo",
					"n": "体魄",
					"words": [
						[80, "龙精虎猛"],
						[55, "筋骨强健"],
						[25, "尚可劳碌"],
						[0, "形销体弱"]
					]
				},
				{
					"k": "wuli",
					"n": "武力",
					"words": [
						[80, "万夫不当"],
						[55, "骁勇善战"],
						[25, "习得武艺"],
						[0, "手无缚鸡"]
					]
				},
				{
					"k": "caixue",
					"n": "文才",
					"words": [
						[75, "学究天人"],
						[55, "文采斐然"],
						[35, "腹有诗书"],
						[0, "才疏学浅"]
					]
				},
				{
					"k": "moulue",
					"n": "谋略",
					"words": [
						[80, "算无遗策"],
						[55, "深谋远虑"],
						[25, "粗通权变"],
						[0, "不谙机心"]
					]
				},
				{
					"k": "biancai",
					"n": "辩才",
					"words": [
						[80, "舌动九州"],
						[55, "口若悬河"],
						[25, "能言善对"],
						[0, "拙于言辞"]
					]
				},
				{
					"k": "caifu",
					"n": "财富",
					"words": [
						[70, "富埒王侯"],
						[40, "仓廪充实"],
						[15, "尚可维持"],
						[0, "囊中羞涩"]
					]
				},
				{
					"k": "shengwang",
					"n": "名声",
					"words": [
						[80, "天下归心"],
						[50, "名动诸侯"],
						[25, "小有清名"],
						[0, "默默无闻"]
					]
				},
				{
					"k": "quanshi",
					"n": "权势",
					"words": [
						[80, "权倾朝野"],
						[50, "位高权重"],
						[25, "位居朝堂"],
						[0, "人微言轻"]
					]
				},
				{
					"k": "zhengji",
					"n": "政绩",
					"words": [
						[80, "功盖当世"],
						[55, "政绩斐然"],
						[25, "小有建树"],
						[0, "寸功未立"]
					]
				},
				{
					"k": "junxin",
					"n": "君心",
					"words": [
						[70, "圣眷正隆"],
						[45, "简在帝心"],
						[20, "不咸不淡"],
						[0, "君臣相疑"]
					]
				},
				{
					"k": "weiji",
					"n": "危机",
					"words": [
						[90, "命悬一线"],
						[70, "流言中心"],
						[40, "暗流涌动"],
						[0, "岁月静好"]
					],
					"inverse": true
				}
			],
			"ATTR_NAMES": {
				"tupo": "体魄",
				"wuli": "武力",
				"caixue": "文才",
				"moulue": "谋略",
				"biancai": "辩才",
				"caifu": "财富",
				"shengwang": "名声",
				"quanshi": "权势",
				"zhengji": "政绩",
				"junxin": "君心",
				"weiji": "危机"
			},
			"INIT": {
				"tupo": 30,
				"wuli": 20,
				"caixue": 40,
				"moulue": 50,
				"biancai": 45,
				"caifu": 20,
				"shengwang": 10,
				"quanshi": 5,
				"zhengji": 0,
				"junxin": 20,
				"weiji": 10
			},
			"AGE": {
				"init": 25,
				"bands": [
					[40, 0],
					[55, -2],
					[65, -4],
					[76, -6],
					[200, -8]
				],
				"longevity": [[35, 1], [48, 2]]
			},
			"ILLNESS": {
				"cost": 3,
				"heal": 5,
				"onsetTupo": 5,
				"onsetWeiji": 3,
				"drainTupo": 2,
				"drainWeiji": 2,
				"death": {
					"ending": "E8",
					"variant": "baobing"
				}
			},
			"ACTION_RULES": { "diminish": false },
			"DIFFICULTY": {
				"story": {
					"n": "剧情",
					"wj": .6,
					"corr": .5,
					"coef": .8,
					"backtrack": -1,
					"lethal": false,
					"hideAttrs": false,
					"desc": "数值全可见，无限回溯，危机增长放缓，不会致死"
				},
				"normal": {
					"n": "普通",
					"wj": 1,
					"corr": 1,
					"coef": 1,
					"backtrack": 1,
					"lethal": true,
					"hideAttrs": false,
					"desc": "标准体验，每章可回溯一次"
				},
				"hardcore": {
					"n": "硬核",
					"wj": 1.2,
					"corr": 1.3,
					"coef": 1.25,
					"backtrack": 0,
					"lethal": true,
					"hideAttrs": true,
					"desc": "危机×1.2，无回溯，属性仅以状态词显示"
				}
			},
			"SCENARIO": {
				"id": "lisi",
				"name": "李斯 · 仓鼠之局",
				"sub": "如果你来走这一生",
				"era": "约前 280 — 前 208",
				"protag": "李斯",
				"desc": "厕鼠与仓鼠之间，你选择了做仓鼠。七十年后，东市的风会不会不一样？",
				"recommend": "新手向（容错高，推荐首局）"
			},
			"HIDDEN": {
				"init": 30,
				"name": "赵高（暗流）",
				"showFrom": 3,
				"words": [
					[70, "杀机毕露"],
					[50, "图穷匕见"],
					[35, "隐约不安"],
					[0, "敛迹藏锋"]
				]
			},
			"SHIPING_BONUS_FLAGS": [{
				"flag": "hanfeicun",
				"bonus": 10
			}],
			"ALIVE_NOTE": {
				"flag": "hanfeicun",
				"text": "韩非尚存，士林念之——史评 +10"
			},
			"MERIT_MAP": {
				"长史": 5,
				"廷尉": 8,
				"丞相": 20,
				"郡县": 15,
				"书同文": 15
			},
			"DEV_BANDS": [
				{
					"max": 20,
					"name": "循史",
					"color": "#7fa8a0"
				},
				{
					"max": 45,
					"name": "微澜",
					"color": "#c9a959"
				},
				{
					"max": 70,
					"name": "改流",
					"color": "#c97a3a"
				},
				{
					"max": 100,
					"name": "逆天",
					"color": "#b0432f"
				}
			],
			"ENDINGS": {
				"E1": {
					"name": "东市之叹",
					"seal": "循史",
					"cuncun": 20,
					"nitian": false,
					"devMax": 45,
					"ach": ["dongmen"],
					"zhuan": "太史公曰：斯以闾巷历诸侯，入事秦，因时推毂，遂成帝业。书同其文，郡县其地，三代以下，治者不能易也。然知仓鼠之择，而不知税驾之期；能变天下之法，不能变赵高之变。沙丘一言，矫诏杀嫡；督责一书，逢君之恶。卒具五刑，夷三族。临刑顾谓中子：\"复牵黄犬出上蔡东门，岂可得乎！\"——斯之智足以帝秦，斯之愚足以族身，皆鼠见也。",
					"variants": { "wuyan": {
						"name": "无言东市",
						"zhuan": "太史公曰：斯之将刑也，无一语自辩，无一书自白。或问其故，狱吏曰：丞相但笑，问上蔡之兔肥否。——大辩若讷，大悔无言。其智足以倾六国，而不能救一言于东市，岂非天哉。",
						"brief": "临刑不辩不白，只笑问上蔡的兔子肥不肥"
					} },
					"brief": "位极人臣而终受五刑，临刑只想再牵犬出东门"
				},
				"E2": {
					"name": "兰陵归鼠",
					"seal": "苟活",
					"cuncun": 100,
					"nitian": false,
					"zhuan": "太史公曰：斯观其鼠而悟，学于荀卿而成，行至半途而返。或谓之怯，或谓之智。秦并天下之日，斯在兰陵授《诗》；咸阳东市之刑，斯已葬于乡党。天下知有秦相李斯，不知上蔡老儒李翁。翁固自知之矣。",
					"variants": { "jiuli": {
						"name": "上蔡旧吏",
						"zhuan": "太史公曰：上蔡有老吏李翁者，少尝观鼠于厕仓之间，若有悟焉，而终其身不出乡里。秦并天下，翁已老；东市之刑，翁不知也。翁常语子孙曰：厕鼠虽瘠，得见东门之月。闻者以为俚语，君子以为达生。",
						"brief": "终身不出乡里的老吏，自谓厕鼠得见东门月"
					} },
					"brief": "半途弃秦归乡授书，世人不知有此老儒"
				},
				"E3": {
					"name": "东门逐客",
					"seal": "苟活",
					"cuncun": 60,
					"nitian": false,
					"zhuan": "太史公曰：斯西入秦，十年而逐。书未上，关已出。其后或贾于宛，或客于齐，终身不言秦事。秦之用客卿成帝业也，自斯之谏始；而斯不与焉。时来则天地皆同力，运去则英雄不自由——其斯之谓与？",
					"variants": {
						"fugu": {
							"name": "富贾归乡",
							"zhuan": "太史公曰：斯既见逐，挟其余资归蔡，治产积居，十年累万金。或劝之复仕，斯笑曰：吾尝入虎口而全归，富哉，足矣。然每闻秦军东出，辄登楼西望，竟日不语。",
							"brief": "挟资归乡累万金，闻秦军东出辄登楼西望"
						},
						"youshi": {
							"name": "列国游士",
							"zhuan": "太史公曰：斯不用于楚秦之间，乃周游列国，著书卖文，自号楚狂。其书言帝王之术甚备，而世莫能用。秦并天下后，有得其书于逆旅者，始皇读之，喟然曰：使此人早来，吾师事之。——书非不善也，遇非其时也。",
							"brief": "著帝王之书而世莫能用，秦并天下方遇知音"
						},
						"renxia": {
							"name": "任侠去国",
							"zhuan": "太史公曰：斯既见逐，不献一书，不请一见，仗剑出函谷，东游诸侯。所至，与豪杰争锋于市，与辩士折冲于席，名震梁楚。秦并天下之日，斯已在烟波之上。或问：悔乎？斯笑曰：厕鼠仓鼠，各得其所；剑在腰间，天下何处不可为仓？——以辩入秦者，以剑去秦，亦一奇也。",
							"brief": "不献一书仗剑去国，以辩入秦者以剑离秦"
						}
					},
					"brief": "入秦十年未谏先逐，出关后终身不言秦事"
				},
				"E4": {
					"name": "上蔡东门",
					"seal": "稳健",
					"cuncun": 95,
					"nitian": false,
					"devMax": 45,
					"variantAch": { "kuaiji": ["jinchan"] },
					"zhuanAppends": [{
						"if": { "flag": "xiangchou" },
						"text": "昔年临行，翁许其父曰“儿会回来的”。数十载后，翁果归矣——诺虽迟，终未负也。"
					}, {
						"if": { "flag": "zhizhi" },
						"text": "老子曰：知足不辱，知止不殆。斯晚而知之，犹愈于终不知者。"
					}],
					"zhuan": "太史公曰：斯佐秦并海内，定郡县，同文书，功冠群臣。焚书之议既定，乃喟然叹曰：\"物禁大盛。\"遂上印绶，归老上蔡。人皆笑其怯。后三年，赵高乱政，诸功臣良将夷灭殆尽，斯牵犬东门，儿孙满前。知进而不知退者，圣人戒之；斯知之矣，故免于难。",
					"variants": {
						"kuaiji": {
							"name": "会稽老丈",
							"zhuan": "太史公曰：斯之下狱也，尽散其财，购得流徙；行至会稽，道“死”——而会稽山中多一老丈，不识名姓，善书，能为小篆。秦亡之日，老丈闻之，置酒向东而哭，哭毕大笑。邻人莫解其意。或曰：此故丞相也。——金蝉脱壳，鼠得全于仓外。",
							"brief": "狱中散尽家财诈死脱壳，隐于会稽山为善书老丈"
						},
						"gongcheng": {
							"name": "功成名遂",
							"zhuan": "太史公曰：斯相秦二十余年，书同文，行郡县，一法度，功盖当世。二世立，斯历陈其绩，请归相印，帝许之。出关之日，门生故吏送于灞上，斯顾曰：吾功在竹帛，身在画外矣。后赵高族诸大臣，斯已归老上蔡，牵犬东门，竟以寿终。——功成身退，天之道也；斯能行之于仓满之时，贤于东市一叹远矣。",
							"brief": "历陈功绩请归相印，归老上蔡竟以寿终"
						}
					},
					"brief": "佐秦功成即挂印归乡，赵高乱政时牵犬东门"
				},
				"E5": {
					"name": "沙丘孤忠",
					"seal": "稳健",
					"cuncun": 30,
					"nitian": false,
					"devMin": 21,
					"devMax": 70,
					"zhuan": "太史公曰：沙丘之夜，遗诏在握，赵高以五问胁之，以三族怵之。斯曰：\"斯受先帝大恩，当以死报。\"遂秘发真诏，身膏逆竖之刃。扶苏既立，昭其忠，谥曰文宪，图形麒麟。世或讥斯焚书、短斯狭刻，至沙丘一死，天下无复言者。一死而赎百非，信矣夫。",
					"brief": "沙丘夜拒赵高以死报先帝，一死赎尽平生非议"
				},
				"E6": {
					"name": "扶苏新政",
					"seal": "逆天",
					"cuncun": 90,
					"nitian": true,
					"devMin": 46,
					"ach": ["shuyumengtian"],
					"zhuan": "太史公曰：二世之事，史不书矣。斯于沙丘翻覆天宪，奉真诏，迎长公子，诛赵高，幽胡亥。扶苏立，以斯为相，蒙恬将兵，宽徭薄赋，与民休息。焚书之灰未冷，而石室之书复出。斯年八十，薨于相位，子孙世禄。向使斯知沙丘之可翻，何有于督责之书哉！然非其晚节一掷，大秦不二世而亡——斯一人之身，而天下之枢再转焉。",
					"variants": { "kaifu": {
						"name": "开府之阶",
						"zhuan": "太史公曰：沙丘之变，斯发真诏北迎扶苏，而赵高先动，斯死乱中。三日而蒙恬兵至，高伏诛，胡亥幽。扶苏既立，恸哭，以丞相礼葬斯于骊山之阳，诏曰：秦之不亡，自斯一死始。——身虽殁而局已成，开府之阶，以血砌之。",
						"brief": "发真诏先死于乱中，以血砌成扶苏开府之阶"
					} },
					"brief": "沙丘翻转天宪奉扶苏，大秦因一人之择再续"
				},
				"E7": {
					"name": "权倾二世",
					"seal": "逆天",
					"cuncun": 85,
					"nitian": true,
					"devMin": 46,
					"zhuan": "太史公曰：斯既与赵高共矫诏，复以伪诏之隙发其罪，族高而录尚书。二世拱默，政由斯出。然陈胜之火已燎原，斯虽诛高，不能救秦。乃弃咸阳，保函谷，裂土自固，与刘项相持者七年，卒以寿终。以诈始，以诈终；能翻赵高之局，不能翻天下之局。身后之名，千载聚讼。",
					"brief": "翻赵高之局而政由己出，弃咸阳裂土相持七年"
				},
				"E8": {
					"name": "狱中死",
					"seal": "败局",
					"cuncun": 10,
					"nitian": false,
					"zhuan": "太史公曰：斯之智，十倍于人；斯之祸，亦先于人至。或死于书未达，或死于诏未发，或死于匕首之藏袖。鼠入厕中，犹知避人；斯入局中，不见陷阱——悲夫！",
					"variants": {
						"baobing": {
							"name": "暴病沙丘",
							"zhuan": "太史公曰：丞相李斯暴病卒于沙丘行在，讣告与遗诏同发。天下莫知其事。后数年，有老宦醉言于市：丞相非病也。言者旋亦死。——沙丘一夜，埋的不只是一个皇帝，还有一个不肯点头的人。",
							"brief": "沙丘暴病而卒天下莫知，实为不肯点头之人"
						},
						"xiefa": {
							"name": "矫诏事发",
							"zhuan": "太史公曰：斯与赵高谋，事未集而泄。蒙恬复请核实于上郡，使者往还，伪诏之迹败露。高反噬，尽推其罪于斯。斯就缚之日，犹呼：我为大秦计！——为大秦计者，死于大秦之法。",
							"brief": "谋泄遭赵高反噬，就缚之日犹呼为大秦计"
						},
						"cike": {
							"name": "刺客之夜",
							"zhuan": "太史公曰：斯树敌满朝，积怨盈路。某夜，客伪为谒者入其府，袖刃刺之，中要害。凶手遁去，莫知所遣。——权势之仓愈高，窥仓之鼠愈多；斯一生观鼠，终为众鼠所啮。",
							"brief": "树敌满朝积怨盈路，夜遇袖刃刺客殒于府中"
						},
						"zuzhu": {
							"name": "族诛之祸",
							"zhuan": "太史公曰：斯之获罪，非一朝一夕之故。赵高用事，罗织周纳，一朝槛车就徵，三族尽赤。临刑之日，咸阳市人莫敢仰视。——仓鼠虽黠，终死于司仓者之手；居高仓者，其祸亦高焉。",
							"brief": "赵高罗织周纳，一朝槛车三族尽赤"
						}
					},
					"brief": "智十倍于人而祸先至，入局中不见陷阱"
				}
			},
			"CHAPTERS": [
				{
					"id": "c0",
					"title": "序章 ｜ 上蔡之鼠",
					"sub": "教学章 · 约前280—前270",
					"age": 25,
					"summaryNotes": [
						"【教学】上方十一维是你的命数：自身五维——体魄、武力、文才、谋略、辩才，定你能走哪条路；身外六维——财富、名声、权势、政绩、君心、危机，定世道如何回你。危机涨满之日，便是狱吏登门之时。",
						"【教学】偏离度记你与史实的距离，只增不减：≤20 循史，21–45 微澜，46–70 改流，71 以上逆天。",
						"【教学】选项旁带\"史\"字者，是史书所载李斯的本来面目。循之则稳，违之则波澜自生。",
						"【教学】岁月催人——体魄随年齿衰减。体魄高则延寿：寿元可逐点抵去当年的衰老之损，并压低发病之率（寿元与阈值见属性面板下方）。体魄低则易病：小病静养两轮自愈，大病须用「求医问药」。病至膏肓，体魄归零，便是殁时。"
					],
					"intro": [
						"你是楚国⟦上蔡⟧郡的一名小吏。每日伏案誊抄文书，俸禄微薄得堪堪够养家。日子像一砚磨不完的宿墨——浓的时候看不出浓，淡的时候又看不出淡。",
						"其时周室名存实亡，七雄厮杀正酣。秦人的军队年年东出，而楚国的县衙里照旧鸡鸣而起、黾勉治事——仿佛只要把眼前的字誊干净，秦国的兵车就永远不会碾过城外的田埂。",
						"这一年你二十余岁，前程一眼可望到底：磨到须发皆白，也不过是个老刀笔吏。史书上还没有你的名字——但史书会有的，问题只在于以什么方式。"
					],
					"start": "0-1",
					"events": [
						{
							"id": "0-1",
							"title": "厕鼠与仓鼠",
							"segs": ["吏舍后的厕中，老鼠瘦小惊惶，见人影便四散窜入墙缝。午后你入粮仓盘账，仓中之鼠肥硕安闲，踞于粟积之下，见人不避。", "一堵墙隔开两重天地。你立于仓中，久久无言——手里的账簿忽然有些烫手，仿佛那薄薄的竹简上，正一笔一画写着你自己的名字。"],
							"options": [
								{
									"t": "嗟叹一声，照旧回去抄文书",
									"res": "你掸掸衣上的糠灰，照旧回去抄文书。只是那一夜灯下的字迹，总有几笔走得心不在焉——有什么东西，已被仓中那肥硕的鼠影点着了。",
									"eff": {
										"attrs": { "caixue": 3 },
										"dev": 0
									},
									"to": "0-2"
								},
								{
									"t": "驻足细想：人之贤不肖，譬如鼠矣，在所自处耳",
									"hist": true,
									"res": "一句话在你心里成形：人之贤不肖，譬如鼠矣，在所自处耳。仓与厕之间那堵墙，忽然薄如一层纸——跨过去，不过一步的事。",
									"eff": {
										"attrs": {
											"caixue": 5,
											"shengwang": 2
										},
										"dev": 0,
										"flags": ["guanshu"],
										"ach": "cangshu"
									},
									"to": "0-2"
								},
								{
									"t": "伸手去捉仓鼠，晚上加菜",
									"res": "你扑了个空，碰翻了半斗粟。仓吏一纸告上去，罚俸一月；上司骂到一半，看着你满脸粟糠，临了却笑了。你捧着扣剩的俸钱往回走，一路琢磨：连老鼠都不肯上钩的，算什么实在。",
									"eff": {
										"attrs": {
											"caifu": -5,
											"shengwang": -2,
											"weiji": 3
										},
										"dev": 3
									},
									"to": "0-2"
								}
							]
						},
						{
							"id": "0-2",
							"title": "小吏的天花板",
							"segs": ["年底考课，你的文书又是全郡第一。郡守夸了你一句“勤勉”，然后提拔了自己的外甥——那外甥的字，还是你教着写的。", "夜里你盘腿坐在灯下，把这件事从头想了一遍：这条路上再走三十年，你还是个抄书的。你想起仓中那些肥硕的影子——它们不抄书，它们只吃粮。"],
							"options": [{
								"t": "忍了。吏员世袭有序，熬资历就是",
								"res": "你低头继续抄书，把委屈也一并抄进了字里。郡衙的台阶你日日扫，扫得比谁都干净——只是它不通往任何地方。",
								"eff": {
									"attrs": {
										"weiji": -3,
										"caixue": 2
									},
									"dev": 0,
									"flags": ["renyin"]
								},
								"to": "0-3"
							}, {
								"t": "辞去吏职，出门求学",
								"res": "你把印绶交还的那天，同僚像看疯子一样看你。只有你自己知道，仓里的老鼠是什么滋味——你一天都不想再做厕里的那只。",
								"eff": {
									"attrs": {
										"caifu": -8,
										"caixue": 5,
										"shengwang": 3
									},
									"dev": 0
								},
								"to": "0-4"
							}]
						},
						{
							"id": "0-3",
							"title": "故人消息",
							"segs": ["三年后，有商旅自⟦兰陵⟧来，说儒学大师⟦荀卿⟧在那里开门授徒，门徒数百，天下学子负笈往投。", "你想起仓中那个下午。现在动身还来得及——只是积蓄已薄，父母已老。灯下你把箱底的铜钱数了三遍，心里已经有了答案。"],
							"options": [{
								"t": "变卖家资，往兰陵去",
								"res": "你把田契换成盘缠，跪别父母。母亲往你行囊里塞了一包炒米，父亲只说了一个字：“去。”车轮动了，你没敢回头。",
								"eff": {
									"attrs": {
										"caifu": -10,
										"caixue": 4
									},
									"dev": 0
								},
								"to": "NEXT"
							}, {
								"t": "罢了。守着这份俸禄，娶妻生子",
								"req": { "notflag": "guanshu" },
								"res": "很多年后，你给儿子讲厕鼠与仓鼠的故事。儿子问：后来呢？你望着窗外的月亮，很久，说：没有后来。",
								"eff": { "dev": 0 },
								"to": {
									"ending": "E2",
									"variant": "jiuli"
								}
							}]
						},
						{
							"id": "0-4",
							"title": "临行之夜",
							"segs": ["离乡前夜，父亲把家中仅有的一件完好深衣给了你；母亲在灯下补了一夜的袖口，针脚密得像要把什么缝进去。", "“楚国留不住你？”父亲问。你望向西方，没有答话。此去兰陵八百里，自此你便是自己的仓——饿了要自己寻粮，冷了要自己找檐。"],
							"options": [{
								"t": "答：“儿要做仓中鼠。”",
								"res": "父亲听不懂，但他记住了这句话，捋了捋那件深衣的衣襟，说：“去吧。”多年以后，上蔡人都会记住这句话——以你想不到的方式。",
								"eff": {
									"attrs": { "shengwang": 2 },
									"dev": 0
								},
								"to": "NEXT"
							}, {
								"t": "答：“儿会回来的。”",
								"res": "你说谎了，你自己也知道。父亲却当了真，转身去给你装第二包干粮。有些谎话说出口，是为了让留下的人好过些。",
								"eff": {
									"attrs": { "weiji": -2 },
									"dev": 0,
									"flags": ["xiangchou"]
								},
								"to": "NEXT"
							}]
						}
					]
				},
				{
					"id": "c1",
					"title": "第一章 ｜ 兰陵问道",
					"sub": "约前270—前255",
					"age": 29,
					"summaryNotes": ["以上为兰陵数年。本章各抉择对偏离度的贡献，已逐条列于上方——史书的正文与批注，自此分开。", "韩非的文章已传入咸阳。你们都不会想到，兰陵灯下之别，重逢时一人袖中会藏着鸩酒。"],
					"intro": [
						"兰陵，⟦荀卿⟧讲学之地。你负笈而至，成为大师门下一名普通弟子。其时秦已并巴蜀、拔郢都——乱世中的书桌，是最后一种仓。",
						"你白日执经问难，夜里替书坊抄简换粟。数年下来，指甲缝里的墨痕再没有洗净过。",
						"在这里，你将遇到一个人——韩国公子⟦韩非⟧。他口吃，不善言谈，文章却好得让你嫉妒。"
					],
					"start": "1-1",
					"events": [
						{
							"id": "1-1",
							"title": "帝王之术",
							"segs": ["荀卿讲“性恶”，讲“隆礼重法”。先生的声音苍老而稳：人性饥而欲饱，寒而欲暖——善者，伪也，须以礼法绳之。", "你却越听越清楚：你要学的不是礼，是术——驾驭君主、驾驭时代的术。同窗抄的是字，你在心里抄的是另一卷书：谁的天下，谁的仓。"],
							"options": [
								{
									"t": "潜心问学，把《劝学》《王制》读透",
									"res": "三年灯火，你的文章从“通顺”变成了“锋利”。先生批你的作业，先写“善”，想了想又添一句“其志不在儒”。你捧着那五个字看了很久，没有辩解。",
									"eff": {
										"attrs": {
											"caixue": 8,
											"shengwang": 3
										},
										"dev": 0
									},
									"to": "1-2"
								},
								{
									"t": "多与同窗交游，经营人脉",
									"res": "你记下每个同窗的来路与去向：谁与齐田氏有旧，谁与楚屈氏联姻，谁将来能带你进门。乱世之中，名单就是财富。",
									"eff": {
										"attrs": {
											"shengwang": 6,
											"caifu": -3,
											"biancai": 3
										},
										"dev": 0,
										"flags": ["guangjiaoyou"]
									},
									"to": "1-2"
								},
								{
									"t": "常与韩非论辩，争一时高下",
									"res": "你辩不赢他的文章，他辩不赢你的嘴。多年以后你才懂得，兰陵那些争锋的夜晚，是你此生少有地、与人平起平坐的时光。",
									"eff": {
										"attrs": {
											"caixue": 5,
											"shengwang": 2,
											"biancai": 3
										},
										"dev": 0,
										"flags": ["zhihanfei"]
									},
									"to": "1-2"
								}
							]
						},
						{
							"id": "1-2",
							"title": "荀子之问",
							"key": true,
							"segs": ["学成之日，荀卿问你：欲何往？你知道这一问问的不是去处，是归宿。先生对秦国，既叹其政之整，又惜其教之缺。", "列国都在招揽辩士，楚有⟦春申君⟧，齐有稷下。可仓廪最实、弩机最利的，在西方。"],
							"options": [
								{
									"t": "答：“西入秦。”",
									"hist": true,
									"res": "你向老师长揖：“诟莫大于卑贱，而悲莫甚于穷困。”荀子默然良久，挥了挥手。你退出堂来，先生的影子还坐在堂中，像一尊没有答完的雕像。",
									"eff": {
										"attrs": {
											"caixue": 2,
											"shengwang": 2
										},
										"dev": 0
									},
									"to": "1-3"
								},
								{
									"t": "答：“归楚，报效故国。”",
									"res": "你回到楚国。春申君门下食客三千，多你一个不多。你捧着满腹学问站在廊下，忽然明白：学问再大，也要有人肯给你一间仓，才装得下。",
									"eff": {
										"attrs": {
											"shengwang": 3,
											"weiji": 5
										},
										"dev": 8
									},
									"to": "1-4"
								},
								{
									"t": "答：“留兰陵，著述授徒。”",
									"res": "你成了荀门最年轻的讲师。但每到深夜，仓鼠的眼睛就在你眼前晃——学舍的灯太清瘦了，喂不饱它。",
									"eff": {
										"attrs": {
											"caixue": 6,
											"shengwang": 4
										},
										"dev": 8
									},
									"to": "1-5"
								}
							]
						},
						{
							"id": "1-3",
							"title": "西行路",
							"segs": ["你一路向西，过⟦函谷关⟧。关内与关东是两个世界：田里阡陌整齐，行人步履匆匆，连狗都吠得比山东六国的精神。从⟦函谷关⟧进来的士人每日以十数，咸阳的城墙黑压压地横在天底下。", "入关那晚你宿在驿亭，看吏员把每一笔粮账记得分毫不差，连灯油都入了册。你躺下想：这样的国家，眼里没有一个人，却有每一个人。"],
							"options": [{
								"t": "细察秦国民情，默记于心",
								"res": "你记了一路：耕战、首功、⟦什伍⟧，父兄相教，皆曰“有军功乃有粟肉”。这个国家像一架上好油的弩机——而你，要做扣动它的那根手指。",
								"eff": {
									"attrs": { "caixue": 4 },
									"dev": 0,
									"flags": ["zhitin"]
								},
								"to": "NEXT"
							}, {
								"t": "直趋咸阳，拜访贵人门路",
								"res": "咸阳居，大不易。你带来的盘缠以肉眼可见的速度消瘦，贵人的门房比贵人的门更难进。你学会了在门外等，也学会了在等的时候盘算。",
								"eff": {
									"attrs": {
										"caifu": -6,
										"shengwang": 2,
										"biancai": 2
									},
									"dev": 0
								},
								"to": "NEXT"
							}]
						},
						{
							"id": "1-4",
							"title": "楚线·春申门下",
							"segs": ["在⟦春申君⟧门下，你见识了什么叫“多你一个不多”：珠履三千，议到国事则人人顾左右而言他。前238年，春申君被⟦李园⟧刺杀于棘门，门客星散。", "血溅到了你的衣角上。你站在棘门外的雨里，看着故国最有权势的人被抬出来——楚国的仓，漏了。"],
							"options": [{
								"t": "楚国不可为，转道入秦",
								"res": "你渡淮西去。同船的人问你去处，你说：咸阳。船过淮水时你把衣角上那滴血洗了又洗，洗不掉的是那股凉意。",
								"eff": {
									"attrs": {
										"caixue": 3,
										"weiji": 8,
										"quanshi": -5
									},
									"dev": 5
								},
								"to": "NEXT"
							}, {
								"t": "转投他国（赵/齐）",
								"req": { "notflag": "piaobo" },
								"res": "你在列国之间漂泊，邯郸的雪，临淄的海，大梁的酒。你著书卖文，渐渐成了“楚狂李斯”——只是每闻秦军东出的消息，笔下的字总要顿一顿。",
								"eff": {
									"attrs": {
										"shengwang": 8,
										"caifu": -8,
										"caixue": 3,
										"tupo": -2
									},
									"dev": 10,
									"flags": ["piaobo"]
								},
								"to": [{
									"if": { "shengwang": 25 },
									"to": {
										"ending": "E3",
										"variant": "youshi"
									}
								}, { "to": "1-4" }]
							}]
						},
						{
							"id": "1-5",
							"title": "儒林线·兰陵先生",
							"segs": ["你在兰陵著书授徒，门徒渐众。有弟子自秦来，说秦王政亲政了，气象如虎狼，朝堂上下无人敢仰视。", "窗外弟子诵书的声音正齐，齐得像一层薄薄的屋顶。你望着案上那盏灯——它照得见你的书，照不见你的天下。"],
							"options": [{
								"t": "继续著述。乱世之中，笔墨比官印长久",
								"req": { "notflag": "zhitin" },
								"res": "数十年后，你的书在灰烬中被一个老儒背了出来。他记不全你的名字。你一生求的不是这个，可到底，只剩了这个。",
								"eff": {
									"dev": 0,
									"hist": 20
								},
								"to": { "ending": "E2" }
							}, {
								"t": "终究还是意难平——入秦",
								"res": "你烧了讲义，只留下一篇自序。弟子问先生何往。你说：去把学问卖给识货的。火盆里的竹简哔剥作响，像在替你送葬。",
								"eff": {
									"attrs": {
										"caixue": 4,
										"shengwang": 5
									},
									"dev": 3
								},
								"to": "NEXT"
							}]
						}
					]
				},
				{
					"id": "c2",
					"title": "第二章 ｜ 西入强秦",
					"sub": "前247—前238",
					"age": 37,
					"summaryNotes": ["【预警】韩国人郑国，正在关中修一条渠。无人说破：那是韩国疲秦的局。", "事发之日，宗室的刀不会只指向郑国——\"诸侯人来事秦者，大抵为其主游间于秦耳。\"逐客的阴云，已聚在你头顶。"],
					"intro": [
						"你入秦之时，正值庄襄王新丧，十三岁的⟦嬴政⟧即位，相邦⟦吕不韦⟧摄政，广收天下士。",
						"《⟦吕氏春秋⟧》悬金求瑕的门楼下，你递上了名刺。从舍人做起——仓鼠之路的第一级台阶。",
						"名刺投进木匣的声响很轻。台阶之下，跪着三千个和你一样的人。"
					],
					"start": "2-1",
					"events": [
						{
							"id": "2-1",
							"title": "吕氏门下",
							"segs": ["舍人三千，你只是其中之一。吕不韦喜欢让门客著书立说——人人都有一卷书要献，献书的竹简在库房里摞得比人还高。", "你把笔洗得很干净。三千门客，你一个一个看过去，像看一盘还没有落子的棋：谁急着献，谁端着等，谁已经把路走死了。"],
							"options": [
								{
									"t": "埋头著文，以文争宠",
									"res": "你的文章被编入《⟦吕氏春秋⟧》的备选库。吕不韦批了一个字：“可。”三千门客里拿到这个字的不足二十人。这个字不是终点，只是一道缝。",
									"eff": {
										"attrs": {
											"caixue": 5,
											"shengwang": 3
										},
										"dev": 0
									},
									"to": "2-2"
								},
								{
									"t": "主动请办杂务，在实务中露脸",
									"res": "接待、传话、核账——你把每件杂事办得滴水不漏，府中长吏开始记得你的名字。仓廪的钥匙，从来不在著书人手里。",
									"eff": {
										"attrs": {
											"quanshi": 4,
											"shengwang": 2,
											"weiji": 2,
											"moulue": 2
										},
										"dev": 0
									},
									"to": "2-2"
								},
								{
									"t": "广交三晋门客，结一小团体",
									"res": "你们啸聚议论，指点朝政。很快有人在吕不韦耳边提了一句：“楚人李斯，结党。”从此廊下的风，也分方向了。",
									"eff": {
										"attrs": {
											"shengwang": 5,
											"weiji": 8,
											"biancai": 3
										},
										"dev": 0
									},
									"to": "2-2"
								}
							]
						},
						{
							"id": "2-2",
							"title": "初见秦王",
							"segs": ["吕不韦荐你为郎官，你终于得以接近那个少年君王。⟦嬴政⟧比你想象的更安静，听你说话时像深水，连衣角的褶皱都纹丝不变。你只有一次机会开口。", "你知道深水意味着什么：投石下去，要么见鱼，要么没顶。"],
							"options": [
								{
									"t": "献“灭诸侯、成帝业”之策",
									"hist": true,
									"res": "你说：“成大功者，在因瑕衅而遂忍之……此万世之一时也。”深水里，有东西动了。秦王倾身向前，问你叫什么。你报上名字的那一刻，声音平静，手心里全是汗。",
									"eff": {
										"attrs": {
											"junxin": 12,
											"quanshi": 5,
											"moulue": 3
										},
										"dev": 0,
										"merit": "长史",
										"condAttrs": [{
											"if": { "flag": "zhitin" },
											"attrs": { "caixue": 3 },
											"note": "因你早知秦制"
										}]
									},
									"to": "2-3"
								},
								{
									"t": "先谈富国强兵，缓言统一",
									"res": "话说得稳妥，也平庸。⟦嬴政⟧礼貌地听完了，便端茶送客。在咸阳，平庸比犯错更可怕。",
									"eff": {
										"attrs": { "junxin": 5 },
										"dev": 3
									},
									"to": "2-3"
								},
								{
									"t": "直言吕不韦权势过重",
									"req": { "caixue": 55 },
									"res": "你赌对了他的心事，赌输了你的时机。⟦嬴政⟧深深看了你一眼：“退下。”这一眼，你琢磨了三年。",
									"eff": {
										"attrs": {
											"junxin": 8,
											"weiji": 12,
											"biancai": 2
										},
										"dev": 8,
										"flags": ["wangzhiwo"]
									},
									"to": "2-3"
								},
								{
									"t": "献并国之策——为秦王画「六王毕，四海一」",
									"req": { "moulue": 55 },
									"res": "你以天下为棋局进说：先取韩以恐他国，次离赵魏之盟，后举荆楚之地——六王毕，四海一。⟦嬴政⟧抚案，自此以国事相问。",
									"eff": {
										"attrs": {
											"junxin": 10,
											"quanshi": 5,
											"moulue": 3
										},
										"dev": 5,
										"flags": ["mouguo"]
									},
									"to": "2-3"
								}
							]
						},
						{
							"id": "2-3",
							"title": "嫪毐之乱",
							"segs": ["前238年，⟦嫪毐⟧作乱，兵败车裂。次年，吕不韦罢相，又次年，饮鸩死。咸阳的天，一年一个样。", "与吕氏沾边的人人自危。你曾是吕门舍人——那个“可”字，还在你案头的旧稿上。夜里有人来叩门借盘缠出关，你给了钱，没有留他。"],
							"options": [
								{
									"t": "上书自辩，划清界限",
									"res": "你历数自己“未尝受吕氏私恩”，字字切割干净。呈上去的那晚，你梦见兰陵的先生，他没有说话，只是看着你。",
									"eff": {
										"attrs": {
											"weiji": -8,
											"shengwang": -3,
											"junxin": 3,
											"caixue": 3
										},
										"dev": 0
									},
									"to": "2-4"
								},
								{
									"t": "闭门谢客，静观其变",
									"res": "你把门关上，把嘴闭上。风暴从你的屋檐上刮过去了。天亮时你数了数自家的瓦，一片没少。",
									"eff": {
										"attrs": {
											"weiji": -5,
											"quanshi": -3
										},
										"dev": 0
									},
									"to": "2-4"
								},
								{
									"t": "为吕不韦收尸",
									"res": "你夜出咸阳，葬旧主于北邙，棺薄而礼备。有人看见了，也有人替你瞒住了。回城的路上落了雪——仓鼠一生避猫，偶尔也该回一次头，看看来路。",
									"eff": {
										"attrs": {
											"shengwang": 10,
											"weiji": 15,
											"junxin": 5,
											"tupo": 2
										},
										"dev": 10,
										"flags": ["yiming"],
										"hist": 10,
										"ach": "yibo"
									},
									"to": "2-4"
								}
							]
						},
						{
							"id": "2-4",
							"title": "长史任上",
							"segs": ["秦王亲政，你迁⟦长史⟧，执掌对六国的秘密事务：遣辩士、赍金玉、收买名士。肯收的，金玉开路；不肯收的——“利剑刺之”。", "你把六国的朝堂画成一张图：谁贪，谁怯，谁与谁有隙。图成之日，你知道了许多人的死期。"],
							"options": [
								{
									"t": "全力经略，不问手段",
									"hist": true,
									"res": "六国的城墙还没倒，六国的朝堂先烂了。你的金丝和毒酒，比⟦王翦⟧的兵走得更快。图册上，一个又一个名字被朱笔勾去。",
									"eff": {
										"attrs": {
											"quanshi": 8,
											"junxin": 6,
											"weiji": 5,
											"moulue": 3,
											"zhengji": 5
										},
										"dev": 0,
										"hist": -10,
										"condAttrs": [{
											"if": { "flag": "wangzhiwo" },
											"attrs": { "quanshi": 10 },
											"note": "亲政之日，大王想起了那一眼"
										}]
									},
									"to": "NEXT"
								},
								{
									"t": "只做离间，不行刺杀",
									"res": "你把“利剑”一条从方略里划去了。进度慢了，嬴政催过一次，你答：迟剋者，其功完。夜里你睡得着——这在咸阳，是难得的奢侈。",
									"eff": {
										"attrs": {
											"quanshi": 4,
											"junxin": 3,
											"shengwang": 3,
											"moulue": 2
										},
										"dev": 5,
										"hist": 5,
										"condAttrs": [{
											"if": { "flag": "wangzhiwo" },
											"attrs": { "quanshi": 10 },
											"note": "亲政之日，大王想起了那一眼"
										}]
									},
									"to": "NEXT"
								},
								{
									"t": "借机中饱私囊",
									"res": "金玉过你的手，总要留下些声响。你安慰自己：经手者沾些油水，古今皆然。只是账房的算盘声，你从此听不得了。",
									"eff": {
										"attrs": {
											"caifu": 25,
											"weiji": 10,
											"shengwang": -5
										},
										"dev": 3,
										"flags": ["tanmo"],
										"condAttrs": [{
											"if": { "flag": "wangzhiwo" },
											"attrs": { "quanshi": 10 },
											"note": "亲政之日，大王想起了那一眼"
										}]
									},
									"to": "NEXT"
								}
							]
						}
					]
				},
				{
					"id": "c3",
					"title": "第三章 ｜ 谏逐客书",
					"sub": "前237 · 历史节点",
					"age": 47,
					"summaryNotes": ["逐客令废。你不只救了自己，也救了关东入秦的所有士人。", "郑国渠卒成，关中为沃野——疲秦之计，反成强秦之本。秦国这架弩机，从此再不缺粮。"],
					"intro": ["韩国派水工⟦郑国⟧入秦修渠，本意疲秦。事发了——一道渠还没挖完，挖渠人的来历先被挖了出来。咸阳的宗室们等这样一个由头，已经等了很多年。", "宗室大臣群起攻讦：“诸侯人来事秦者，大抵为其主游间于秦耳。请一切逐客。”⟦逐客令⟧下。你的行李已经装上了车——楚人李斯，亦在逐中。"],
					"node": "N1",
					"mutations": [
						{
							"if": { "shengwang": 50 },
							"flag": "jimo",
							"capAttrs": { "caifu": 5 },
							"note": "【节点异变】你声望太盛，被宗室指为客卿领袖——逐客令扩大为“尽逐客卿且籍没其家”，家产封存。"
						},
						{
							"if": { "junxin": 45 },
							"flag": "mibao",
							"note": "【节点异变】逐客令下前一夜，中车府令遣人密告——你多出一整夜的准备时间。"
						},
						{
							"if": { "weiji": 70 },
							"flag": "shouxi",
							"note": "【节点异变】你积怨已深。来的不是逐客令，是廷尉府的枷锁——收系问罪。"
						},
						{
							"if": { "devMin": 46 },
							"flag": "zaoti",
							"note": "【节点异变】历史漂移：逐客令提前爆发，你积累未深，上书门槛全面提高。"
						}
					],
					"start": "3-0",
					"startAlt": [{
						"if": { "notflag": "mibao" },
						"start": "3-1"
					}],
					"events": [
						{
							"id": "3-0",
							"title": "密报之夜",
							"segs": ["深夜，宫中来人，只说了八个字：“明日逐客，君自为之。”来人没有署名，你认得那盏宫灯的样式——⟦中车府令⟧府里的灯。", "你有一整夜的时间。烛火下，空白竹简摊开在案上。更漏一声一声——这一夜值你在秦国二十年的全部。"],
							"options": [{
								"t": "连夜起草谏书",
								"res": "五鼓而书成。你把竹简捆好，等天亮，等宫门开。写最后一笔时，你听见自己长长地吐了一口气——二十年的账，今夜算完。",
								"eff": {
									"attrs": { "caixue": 5 },
									"dev": 0,
									"flags": ["liancao"]
								},
								"to": "3-1"
							}, {
								"t": "连夜转移家产门客，准备跑路",
								"res": "你安排好退路，心里却空了一块。车轴上油的声音在夜里格外清楚——这一走，仓鼠又变回厕鼠了。",
								"eff": {
									"attrs": {
										"caifu": 5,
										"weiji": -5,
										"tupo": -2
									},
									"dev": 0
								},
								"to": "3-1"
							}]
						},
						{
							"id": "3-1",
							"title": "逐客令下",
							"altSegs": {
								"flag": "shouxi",
								"segs": ["天未亮，廷尉府的甲士撞开了你的门。不是逐客——是收系问罪。", "枷锁加身时你才想明白：你的敌人要的从来不是赶你走，是你再也走不成。"]
							},
							"segs": ["清晨，令下咸阳：一切客卿，限日出关。长街上全是与你一样的人——负书、牵马、回望宫城。有人在哭，有人在骂。", "你坐在车里，只在做一件事：算。逐客令下，谁最吃亏，秦王最怕什么，宗室最想要什么。算着算着，你忽然笑了——满街的人都在哭前程，只有你在算棋局。"],
							"options": [
								{
									"t": "认命出关",
									"req": { "notflag": "shouxi" },
									"res": "⟦函谷关⟧的关门在你身后合拢，铰链声像一声叹息。多年后你才知道：这一天秦国逐走的不是客卿，是它自己的天下。",
									"eff": { "dev": 0 },
									"to": [{
										"if": { "caifu": 25 },
										"to": {
											"ending": "E3",
											"variant": "fugu"
										}
									}, { "to": { "ending": "E3" } }]
								},
								{
									"t": "拖延时日，寻找上书门路",
									"res": "你贿赂押送的小吏，把行程拖成了蠕动。每一天都可能是最后一天——最后一天，才值得把每一个字都押上去。",
									"eff": {
										"attrs": {
											"caifu": -8,
											"weiji": 5
										},
										"dev": 0
									},
									"to": "3-2"
								},
								{
									"t": "藏匿咸阳，拒不奉诏",
									"req": { "notflag": "shouxi" },
									"res": "你藏进门客的地下室，白日不敢出声。秦王政的耳目，比你想的多。黑暗里你摸着墙角发霉的土，忽然觉得，自己绕了一大圈，又回到了当初那个墙缝。",
									"eff": {
										"attrs": { "weiji": 15 },
										"dev": 0
									},
									"to": [{
										"if": { "weiji": 80 },
										"to": "3-3"
									}, { "to": "3-2" }]
								}
							]
						},
						{
							"id": "3-2",
							"title": "谏逐客书",
							"key": true,
							"altSegs": {
								"flag": "shouxi",
								"segs": ["诏狱深处，狱卒送来了笔和简——你用最后一件值钱的东西换的。", "你的笔停在“臣闻吏议逐客，窃以为过矣”这一句上。墙外，天在下雨。雨声里你忽然笑了：一生算计，到头来最锋利的东西，还是这管笔。"]
							},
							"segs": ["上书不是写文章，是赌命。写浅了，秦王不看；写深了，是讥刺君上。窗外，押送的吏卒在赌钱——赌你三天内出关。", "你的笔停在“臣闻吏议逐客，窃以为过矣”这一句上。你蘸了蘸墨，没有改。窗外的雨声里，你听见自己二十年来读过的每一卷书在翻页——今夜，它们都要替你赌一次。"],
							"options": [
								{
									"t": "上书——“逐客以资敌国，损民以益仇”",
									"hist": true,
									"req": { "caixue": 50 },
									"reqAdjust": [
										{
											"if": { "flag": "zaoti" },
											"attr": "caixue",
											"delta": 10
										},
										{
											"if": { "flag": "liancao" },
											"attr": "caixue",
											"delta": -10
										},
										{
											"if": { "flag": "guangjiaoyou" },
											"attr": "caixue",
											"delta": 5
										}
									],
									"res": "你写“泰山不让土壤，故能成其大；河海不择细流，故能就其深”。三天后，逐客令废，你官复原职——这封书，后世称为《⟦谏逐客书⟧》。只有你自己知道，那天的雨声有多冷。",
									"eff": {
										"attrs": {
											"junxin": 15,
											"quanshi": 10,
											"shengwang": 8,
											"weiji": -10,
											"caixue": 5
										},
										"dev": 0,
										"merit": "廷尉",
										"ach": "yizi"
									},
									"to": "NEXT"
								},
								{
									"t": "托人转圜，走宗室门路",
									"res": "你的礼物送进了三位宗室的府邸，像石子丢进渭水。第一位原封退回，第二位收了礼不见人，第三位的门房说：主人病了。",
									"eff": {
										"attrs": {
											"caifu": -12,
											"weiji": 5
										},
										"dev": 0
									},
									"to": [
										{
											"if": { "flag": "guangjiaoyou" },
											"to": "3-2"
										},
										{
											"if": { "caifu": 25 },
											"to": {
												"ending": "E3",
												"variant": "fugu"
											}
										},
										{ "to": { "ending": "E3" } }
									]
								},
								{
									"t": "作书直斥秦王“负义忘恩”",
									"res": "书写得酣畅淋漓。你把竹简摔在案上，觉得自己终于做了一回顶天立地的人——廷尉府的人来拿你时，墨迹未干。",
									"eff": {
										"attrs": {
											"shengwang": 10,
											"weiji": 40,
											"caixue": 3
										},
										"dev": 15
									},
									"to": [{
										"if": { "junxin": 50 },
										"to": "3-3"
									}, { "to": { "ending": "E8" } }]
								},
								{
									"t": "仗剑出关——不为秦臣，便为游侠",
									"req": { "wuli": 55 },
									"res": "书，不递了；头，不低了。你解下秦廷的传，仗剑东出⟦函谷关⟧。此后列国江湖，多一个楚地剑客。",
									"eff": {
										"attrs": {
											"shengwang": 5,
											"wuli": 3
										},
										"dev": 15
									},
									"to": {
										"ending": "E3",
										"variant": "renxia"
									}
								}
							]
						},
						{
							"id": "3-3",
							"title": "狱中书",
							"segs": ["诏狱深处，蟊虫咬墙。狱墙很高，高处的窗洞漏进一线天光。你忽然想起上蔡的厕——从这里望出去，才算把它看清了。", "你还有一次提笔的机会。狱卒把笔搁在栏外，像搁一件稀罕物件。这辈子写过考课、谏书、奏章，最不敢写的，原来是这一封。"],
							"options": [{
								"t": "狱中上书，陈情自辩",
								"req": { "caixue": 60 },
								"reqAdjust": [{
									"if": { "flag": "zaoti" },
									"attr": "caixue",
									"delta": 10
								}, {
									"if": { "flag": "liancao" },
									"attr": "caixue",
									"delta": -10
								}],
								"res": "你把十年的功劳、委屈和算计熬成一封书。书达御前，⟦嬴政⟧沉默了很久，说：“复其官。”狱门开的时候你站不起来——不是伤，是那口气，终于敢松了。",
								"eff": {
									"attrs": {
										"weiji": -30,
										"junxin": 5,
										"caixue": 3,
										"quanshi": -8
									},
									"dev": 5,
									"ach": "sili"
								},
								"to": "NEXT"
							}, {
								"t": "认命",
								"res": "渭水边的刑场很冷。你最后想到的，是上蔡的粮仓——粟积如山，鼠在其下，无人惊扰。你这一生，终究是进过仓的。",
								"eff": { "dev": 0 },
								"to": { "ending": "E8" }
							}]
						}
					]
				},
				{
					"id": "c4",
					"title": "第四章 ｜ 定鼎天下",
					"sub": "前233—前213 · 历史节点",
					"age": 63,
					"summaryNotes": ["二十年碾压，六国次第而灭。这一章，你的权势与声望都走到了顶点。", "然物禁大盛。皇帝渐老，扶苏远谪上郡，赵高日侍胡亥左右——沙丘的风，已经起了。"],
					"intro": ["此后二十年，是碾压的二十年。韩、赵、魏、楚、燕、齐，次第而灭。你的官做到⟦廷尉⟧，又做到丞相——天下文书，皆出你手；天下法度，皆由你定。", "你成了粮仓里最大的那只老鼠。只是粮仓之上，还有天。"],
					"node": "N2",
					"enter": {
						"merit": "丞相",
						"note": "前221年，天下一统。你官拜丞相。"
					},
					"start": "4-1",
					"events": [
						{
							"id": "4-1",
							"title": "咸阳之贵",
							"segs": ["议帝号、置郡县、一法度。你的长子⟦李由⟧娶秦公主，诸男悉尚公主——李家与咸阳的皇家，从此织进同一张网。咸阳人说起你，不说“丞相李斯”，说“李家”。", "你在家中置酒，百官争赴。酒气蒸腾里，你忽然喟然长叹——你想起父亲给你的那件深衣，叠在箱底，已经旧了。"],
							"options": [{
								"t": "叹：“物禁大盛。吾未知所税驾也。”",
								"hist": true,
								"res": "你对儿子说出这句话，说完自己打了个寒噤。只有廊下的老仆看了你一眼——他是上蔡带来的，他懂那句乡音里的怕。",
								"eff": {
									"attrs": { "weiji": -3 },
									"dev": 0,
									"flags": ["zhizhi"]
								},
								"to": "4-2"
							}, {
								"t": "不叹。这正是仓鼠之局的大成",
								"res": "你举爵，接受满座谄笑。远处宫城的轮廓在天际线上，像一座更大的粮仓。你对自己说：再往上，就没有更高处了。",
								"eff": {
									"attrs": {
										"quanshi": 5,
										"weiji": 5
									},
									"dev": 3
								},
								"to": "4-2"
							}]
						},
						{
							"id": "4-2",
							"title": "韩非之死",
							"key": true,
							"altSegs": {
								"flag": "zhihanfei",
								"segs": ["⟦韩非⟧使秦。秦王读其书，喜曰：“寡人得见此人与之游，死不恨矣！”兰陵灯下你辩不赢他的文章，他的才华与锋芒，你比秦王知道得更早。", "当夜，你袖中有一份弹劾韩非的奏章草稿，袖外是兰陵的同窗之谊。袖里袖外，只隔一层布。"]
							},
							"segs": ["⟦韩非⟧使秦。秦王读其书，喜曰：“寡人得见此人与之游，死不恨矣！”你比谁都清楚韩非的才，也比谁都清楚：秦王身边，容不下第二个你——这不是猜忌，是算账。", "当夜，你袖中有一份弹劾韩非的奏章草稿，袖外是兰陵的同窗之谊。你摊开奏章，把“韩非”两个字，又描深了一遍。"],
							"options": [
								{
									"t": "弹劾韩非，鸩杀于狱",
									"hist": true,
									"res": "“韩非，韩之诸公子也，终为韩不为秦。”一句话送出，一杯鸩酒跟进。你赢了。你往后的每一个失眠夜，都知道自己赢了什么——云阳狱中那盏灯灭的时候，兰陵的灯，也灭了一盏。",
									"eff": {
										"attrs": {
											"junxin": 8,
											"quanshi": 5,
											"shengwang": -8,
											"weiji": 5,
											"moulue": 3
										},
										"dev": 0,
										"flags": ["wu_hanfei"],
										"hist": -25
									},
									"to": "4-3"
								},
								{
									"t": "举荐韩非，共治秦廷",
									"res": "韩非受命著《初见秦》续篇，与你同署。权柄分薄了，秦的文书锋利一倍。夜里对坐论学，像回到兰陵。",
									"eff": {
										"attrs": {
											"shengwang": 10,
											"caixue": 5,
											"quanshi": -8,
											"junxin": -5
										},
										"dev": 12,
										"flags": ["hanfeicun"],
										"condAttrs": [{
											"if": { "flag": "zhihanfei" },
											"attrs": { "shengwang": 3 },
											"note": "你早知其才华与锋芒，荐贤更服众"
										}]
									},
									"to": "4-3"
								},
								{
									"t": "纵韩非归韩",
									"res": "你放走了他。三年后秦灭韩，韩非死于乱军。你不杀伯仁——伯仁因你而来，因你而死。",
									"eff": {
										"attrs": {
											"shengwang": 3,
											"junxin": -8
										},
										"dev": 8,
										"hist": 5
									},
									"to": "4-3"
								}
							]
						},
						{
							"id": "4-3",
							"title": "郡县之辩",
							"segs": ["丞相王绾等请立诸子为王，廷议，群臣皆以为便。老臣们说古制，说血亲，说周朝八百年的江山——说得头头是道。", "所有人都说完了。⟦嬴政⟧的目光落在你身上。你知道那个目光的分量：它要的不是附和，是一句能压得住百年的话。"],
							"options": [
								{
									"t": "独排众议：“置诸侯不便。”立郡县",
									"hist": true,
									"res": "“周文武所封子弟同姓甚众，然后属疏远，相攻击如仇雠。今海内赖陛下神灵一统，皆为⟦郡县⟧，此安宁之术也。”嬴政说：“善。”散朝时没有人与你同车。",
									"eff": {
										"attrs": {
											"quanshi": 8,
											"junxin": 8,
											"shengwang": 5,
											"weiji": 8,
											"biancai": 3,
											"zhengji": 10
										},
										"dev": 0,
										"merit": "郡县"
									},
									"to": "4-4"
								},
								{
									"t": "附和王绾，封建诸子",
									"res": "你说了从众的话。十年后，诸子争立，关中血溅——史书会记下：此议，丞相李斯亦预焉。",
									"eff": {
										"attrs": {
											"weiji": -8,
											"quanshi": -5,
											"junxin": -8
										},
										"dev": 15,
										"hist": -15
									},
									"to": "4-4"
								},
								{
									"t": "廷辩折儒——舌战淳于越",
									"req": { "biancai": 55 },
									"res": "博士⟦淳于越⟧抗声：“事不师古而能长久者，非所闻也。”你出列折之，句句有出处。淳于越退下时，鞋跟蹭到了殿砖。",
									"eff": {
										"attrs": {
											"junxin": 5,
											"shengwang": 5,
											"weiji": 3,
											"biancai": 3
										},
										"dev": 5
									},
									"to": "4-4"
								}
							]
						},
						{
							"id": "4-4",
							"title": "书同文，车同轨",
							"segs": ["你亲作《⟦仓颉篇⟧》，以秦⟦小篆⟧为天下正字；又奏请统一⟦度量衡⟧、修⟦驰道⟧。六国的文字写了六百年，一个字七种写法——你要让天下的笔，只走一条路。", "有人说这是万世之功。你想的是另一件事：字都同了，就没有“异乡”了。"],
							"options": [{
								"t": "倾力推行，亲定范式",
								"hist": true,
								"res": "你的小篆从咸阳铺到临淄、番禺、蓟城。千百年后，写字的人不知道你的名字，但写的是你定的笔顺。",
								"eff": {
									"attrs": {
										"shengwang": 10,
										"caixue": 5,
										"quanshi": 5,
										"zhengji": 10
									},
									"dev": 0,
									"merit": "书同文",
									"ach": {
										"id": "shutongwen",
										"if": { "shengwang": 60 }
									}
								},
								"to": [{
									"if": { "junxinMax": 30 },
									"to": "4-5-pre"
								}, { "to": "4-5" }]
							}, {
								"t": "委之属吏，自己专注权位",
								"res": "事照样办成了，只是办得粗。齐地的老儒写信骂你“灭裂文字”，你把信烧了。灰烬飘出窗外的时候，你忽然觉得，自己错过了一样什么。",
								"eff": {
									"attrs": {
										"quanshi": 3,
										"shengwang": -5
									},
									"dev": 3
								},
								"to": [{
									"if": { "junxinMax": 30 },
									"to": "4-5-pre"
								}, { "to": "4-5" }]
							}]
						},
						{
							"id": "4-5-pre",
							"title": "御前发难",
							"node2": true,
							"segs": ["咸阳宫置酒。仆射⟦周青臣⟧颂扬⟦郡县⟧，博士⟦淳于越⟧当场反驳。⟦嬴政⟧没有看淳于越，却看向你：“丞相以为，周仆射如何？”这是一道送命题。", "你放下酒樽，把要说的话在舌尖上过了一遍，像过一柄刚磨好的刀。"],
							"options": [{
								"t": "答：“周仆射面谀，然郡县之议，臣以为当坚持。”",
								"res": "你把“面谀”二字咬得很重，又把⟦郡县⟧揽回自己身上。⟦嬴政⟧盯了你半晌，挥袖令廷议继续。这一夜你把所有人都得罪了一半，也把所有人都留住了一半。",
								"eff": {
									"attrs": {
										"junxin": 3,
										"shengwang": -3,
										"weiji": 3,
										"biancai": 2
									},
									"dev": 0
								},
								"to": "4-5"
							}, {
								"t": "答：“仆射所言，亦是一家之见。”",
								"res": "话一出口你就后悔了。⟦嬴政⟧笑了一声，没再问你。散朝时你听见他对左右说：“丞相老了。”你坐在车里，觉得四面漏风。",
								"eff": {
									"attrs": {
										"junxin": -15,
										"shengwang": -5,
										"biancai": -2
									},
									"dev": 0,
									"hist": -5
								},
								"to": "4-5"
							}]
						},
						{
							"id": "4-5",
							"title": "焚书",
							"key": true,
							"enterOnce": "_n2done",
							"enterEffects": [{
								"if": {
									"shengwang": 70,
									"devMin": 46
								},
								"setFlags": ["n2_attack"]
							}],
							"altSegs": {
								"flag": "n2_attack",
								"segs": ["咸阳宫置酒。博士⟦淳于越⟧当庭发难，矛头却直指你——“丞相以吏为师，欲使黔首无书乎！”", "七十博士的目光、宗室的目光、⟦嬴政⟧的目光，最后都聚到你一个人身上。你成了廷辩的被告。"]
							},
							"segs": ["咸阳宫置酒。仆射⟦周青臣⟧颂扬⟦郡县⟧，博士⟦淳于越⟧再次当庭反驳。七十博士的目光、宗室的目光、⟦嬴政⟧的目光，最后都聚到丞相身上——你是这座大殿里，唯一能接住这些目光的人。", "袖中，是你昨夜拟好的奏议：史官非秦记皆烧之；天下敢有藏《诗》《书》、百家语者，悉诣守尉杂烧之。每一个字你都改过三遍——改到最后，你分不清它是一封奏章，还是一封祭文。"],
							"options": [
								{
									"t": "上焚书议",
									"hist": true,
									"res": "你的声音在大殿里很稳：“若欲有学法令，以吏为师。”⟦嬴政⟧说：“可。”咸阳的烟囱里飘出的灰，落了三十天——史称⟦焚书⟧。灰落在你肩上，你没有掸。",
									"eff": {
										"attrs": {
											"junxin": 10,
											"quanshi": 8,
											"shengwang": -15,
											"weiji": 8,
											"caixue": 3
										},
										"dev": 0,
										"flags": ["wu_fenshu"],
										"hist": -20
									},
									"to": "4-6"
								},
								{
									"t": "驳淳于越，但以“官藏代焚”折中",
									"res": "你说：“书可藏于府，不必焚于市。”⟦嬴政⟧沉吟良久，准了折中。你被士人骂“乡愿”，被宗室骂“示弱”——只是这一次，书替你记着。",
									"eff": {
										"attrs": {
											"shengwang": 5,
											"junxin": -5,
											"quanshi": -3,
											"caixue": 2
										},
										"dev": 12,
										"flags": ["zhezhong"],
										"hist": 10,
										"ach": "hushu"
									},
									"to": "4-6"
								},
								{
									"t": "沉默不表态",
									"res": "你低头的样子被所有人看见了。⟦嬴政⟧替你作了主——焚，且坑。散朝后他问身边人：“丞相老矣？”",
									"eff": {
										"attrs": {
											"junxin": -12,
											"quanshi": -5,
											"weiji": 5
										},
										"dev": 5,
										"hist": -10
									},
									"to": "4-6"
								},
								{
									"t": "与韩非连署“诗书官营议”",
									"req": { "flag": "hanfeicun" },
									"res": "你们一文一政，把“焚”字改成了“藏”字。⟦韩非⟧在联名处写下名字时手抖了一下——但兰陵的灯，没有灭。",
									"eff": {
										"attrs": {
											"shengwang": 8,
											"junxin": 3,
											"quanshi": -5,
											"caixue": 3
										},
										"dev": 15,
										"hist": 15,
										"ach": "hushu"
									},
									"to": "4-6"
								}
							]
						},
						{
							"id": "4-6",
							"title": "坑儒余波",
							"segs": ["方士侯生、卢生逃亡，始皇震怒，坑杀犯禁者四百六十余人于咸阳——史称“⟦坑儒⟧”。长子⟦扶苏⟧谏阻，始皇怒，使扶苏北监⟦蒙恬⟧军于⟦上郡⟧。", "你来求见时，⟦嬴政⟧正在看扶苏离京的奏报。扶苏出京那日，百官送到灞上，这位长公子回头望了一眼宫城，什么都没说。"],
							"options": [
								{
									"t": "缄默。父子家事，人臣无预",
									"hist": true,
									"res": "你退出了宫殿。台阶下车夫问：回府？你说：回府。车走了很久，你才发现自己一直攥着拳——指甲掐进掌心，却不知道疼。",
									"eff": {
										"attrs": { "weiji": -3 },
										"dev": 0
									},
									"to": "NEXT"
								},
								{
									"t": "委婉劝谏，为扶苏缓颊",
									"res": "“长公子仁厚，历练边军，他日亦陛下之臂膀。”⟦嬴政⟧没有答，但北去的传车里，多了一道“善遇之”的手谕。",
									"eff": {
										"attrs": {
											"junxin": -3,
											"shengwang": 5,
											"biancai": 2
										},
										"dev": 8,
										"flags": ["fusu"]
									},
									"to": "NEXT"
								},
								{
									"t": "附议重罚，取信于上",
									"res": "你附和了。字字顺着皇帝的心意，字字逆着自己的。当夜⟦赵高⟧遣人送来一匣珠宝。你命人收入库——没有退。那一夜，你睡得格外沉。",
									"eff": {
										"attrs": {
											"junxin": 5,
											"weiji": 5,
											"shengwang": -5
										},
										"dev": 3,
										"flags": ["zhaogao1", "mtdi"],
										"hist": -5,
										"zg": -10,
										"notes": { "shengwang": "上郡记下了这一笔：蒙恬从此看你，如同看赵高一党" }
									},
									"to": "NEXT"
								}
							]
						}
					],
					"endEvents": [{
						"id": "cj-yaojia",
						"if": { "flag": "hanfeicun" },
						"title": "修正 ｜ 姚贾构陷韩非",
						"segs": ["【历史修正】你保下了⟦韩非⟧——刀便转向了韩非。⟦姚贾⟧密奏：韩非通韩，罪证“确凿”。", "满朝的眼睛都看着你，看你这个举荐人，如何收场。案上的烛火结了花——你想起他信里那句没写完的话。"],
						"options": [{
							"t": "挺身力保韩非",
							"res": "你以丞相印绶作保，把案子从廷尉府硬生生压回御前。⟦嬴政⟧暂且搁下此案。⟦韩非⟧给你写了四个字：受之有愧。你看着那四个字，忽然觉得，兰陵的灯，值了。",
							"eff": {
								"attrs": {
									"weiji": 10,
									"junxin": -5,
									"biancai": 2
								},
								"dev": 0,
								"hist": 5
							},
							"to": null
						}, {
							"t": "袖手旁观",
							"res": "你低下头，盯着自己的鞋尖。三日后，⟦韩非⟧“暴卒”于客馆。历史找回了它原来的形状——只是宫里看你，又淡了一分；你看自己，也淡了一分。",
							"eff": {
								"attrs": {
									"weiji": -5,
									"junxin": -5
								},
								"hist": -10,
								"rmflags": ["hanfeicun"]
							},
							"to": null
						}]
					}, {
						"id": "cj-tuiyin",
						"if": {
							"quanshiMax": 30,
							"flag": "zhizhi"
						},
						"title": "急流勇退的机会",
						"segs": ["⟦焚书⟧余灰未冷。你想起自己在满堂车骑前说过的那句话——物禁大盛。那是你这一生，少有的真话。", "此刻抽身，尚有余地；再往前，就是⟦沙丘⟧的方向了。夜里你独自登上府中的高台，忽然很想知道，上蔡东门外的野兔，这些年肥了没有。"],
						"options": [{
							"t": "上表辞官，归老上蔡",
							"req": { "devMax": 45 },
							"res": "表章递上去，皇帝挽留了一次，你坚辞。出⟦函谷关⟧那日无人相送，你掀开车帘回望咸阳——那座仓很大，很好，只是再高的仓，也不是老鼠的家。",
							"eff": { "dev": 5 },
							"to": { "ending": "E4" }
						}, {
							"t": "再留一程。天下初定，走不开",
							"res": "你对自己说：再送陛下一程。就一程。你不知道下一程的终点叫⟦沙丘⟧。仓里的老鼠，是听不见仓外的风的。",
							"eff": {
								"attrs": { "weiji": 3 },
								"dev": 0
							},
							"to": null
						}]
					}]
				},
				{
					"id": "c5",
					"title": "第五章 ｜ 沙丘",
					"sub": "前210 · 历史节点 · 全剧本枢纽",
					"age": 74,
					"summaryNotes": ["胡亥立，是为二世。你仍是丞相——代价昨夜已付，账单才刚开始寄到。", "蒙恬系于阳周未死，关东戍卒的怨气未发。山雨欲来，而你已与赵高同乘一舟。"],
					"intro": [
						"第五次东巡。你从驾。至平原津，皇帝病；至⟦沙丘⟧平台，病亟。遗诏只有一封，写给远在⟦上郡⟧的长子⟦扶苏⟧——玺封已具，却在⟦中车府令⟧⟦赵高⟧手里。",
						"七月丙寅，皇帝崩于沙丘平台。知道这个消息的，只有五个人：⟦胡亥⟧、赵高、你，和两个宦者。",
						"车外，⟦鲍鱼⟧未至，百官如常上食。车里，大秦的下一页摊开着，还没有字。"
					],
					"node": "N3",
					"achOnEnter": "shaqiu",
					"start": "5-1",
					"events": [
						{
							"id": "5-1",
							"title": "赵高来访",
							"enterOnce": "_lesuo",
							"enterEffects": [{
								"if": { "flag": "zhaogao1" },
								"zg": 10
							}],
							"segs": ["当夜，⟦赵高⟧扣响你的车帐：“上崩，赐长子书，与丧会咸阳而葬。书未发。今上崩，无封，太子未定——定太子，在君侯与高之口耳。”他手里转动着那枚小小的符玺。", "他看着你，像看着一只正在权衡粮仓与陷阱的、他很了解的动物。你看着⟦赵高⟧，他也看着你——你知道今夜这杆秤，非分个高下不可。"],
							"options": [
								{
									"t": "怒斥：“安得亡国之言！”",
									"hist": true,
									"res": "⟦赵高⟧不恼，反而笑了，笑纹里没有一点温度。他知道你会拒绝——第一次。他也知道，人这辈子，总要先拒绝一次的。",
									"eff": {
										"attrs": {
											"shengwang": 3,
											"biancai": 2
										},
										"dev": 0
									},
									"to": "5-2"
								},
								{
									"t": "虚与委蛇：“容思之。”",
									"res": "⟦赵高⟧深深看你一眼，退了出去。你赢得了十二个时辰——用你仅剩的信用。帐帘落下，你才发现中衣已经湿透。",
									"eff": {
										"attrs": {
											"weiji": 5,
											"biancai": 2
										},
										"dev": 3,
										"flags": ["yuwei"],
										"zg": 10
									},
									"to": "5-2"
								},
								{
									"t": "当场密令宿卫，欲擒赵高",
									"req": {
										"quanshi": 60,
										"weijiMax": 60
									},
									"res": "你的密令还没出帐，⟦赵高⟧的死士已经“护驾”在帐外。你慢慢坐回席上，亲手把那份手令，凑到了烛火上——纸页蜷曲、发黑、成灰。",
									"eff": {
										"attrs": { "weiji": 25 },
										"dev": 20,
										"zg": 20
									},
									"to": [{
										"if": { "flag": "fusu" },
										"to": "5-4"
									}, { "to": "5-2" }]
								},
								{
									"t": "密遣心腹，北联蒙恬",
									"req": { "devMin": 46 },
									"res": "使者在夜色里北去。三日后心腹回报：蒙恬收下了玉璧，没有回话，也没有声张。棋盘上，多了一枚你的子。",
									"eff": {
										"attrs": {
											"caifu": -5,
											"weiji": 8,
											"moulue": 3
										},
										"dev": 10,
										"flags": ["lianmeng"],
										"notes": { "weiji": "北军一线，已暗系于你手" }
									},
									"to": "5-2"
								}
							]
						},
						{
							"id": "5-2",
							"title": "五问",
							"key": true,
							"altSegs": {
								"flag": "yuwei",
								"segs": ["⟦赵高⟧去而复返。你那句“容思之”，他咂摸了一夜——这一次他不再试探，一个问题一个问题地问，像剥笋，更像下刀：“君侯自料：能，孰与⟦蒙恬⟧？功高，孰与蒙恬？谋远不失，孰与蒙恬？无怨于天下，孰与蒙恬？长子旧而信之，孰与蒙恬？”", "你昨夜赢来的十二个时辰，他只用五句话就收了回去。利息很高。他替你补上第六句：“⟦扶苏⟧即位，必相⟦蒙恬⟧。君侯通狱法，当自知下场——是回上蔡，还是去东市？”"]
							},
							"segs": ["⟦赵高⟧去而复返，一个问题一个问题地问，像剥笋，更像下刀：“君侯自料：能，孰与⟦蒙恬⟧？功高，孰与蒙恬？谋远不失，孰与蒙恬？无怨于天下，孰与蒙恬？长子旧而信之，孰与蒙恬？”", "每一问的答案，都是同一个人的名字。那个名字压在你的舌根底下，越来越重——⟦扶苏⟧即位，必相⟦蒙恬⟧。你忽然明白：赵高问的不是蒙恬，是你自己。"],
							"options": [
								{
									"t": "从之。矫诏立胡亥，赐死扶苏",
									"hist": true,
									"res": "你听见自己说：“……从君计。”⟦扶苏⟧得诏自杀，⟦蒙恬⟧系⟦阳周⟧，⟦胡亥⟧立。⟦赵高⟧收起真诏时笑了笑——那笑容，你做了多年噩梦。",
									"eff": {
										"attrs": {
											"quanshi": 10,
											"junxin": 15,
											"weiji": 20,
											"shengwang": -10
										},
										"dev": 0,
										"flags": ["wu_jiaozhao", "zhaogao2"],
										"hist": -30,
										"zgSet": 80
									},
									"to": "NEXT"
								},
								{
									"t": "拒之。宁死，不与",
									"res": "“斯，上蔡闾巷布衣也，上幸擢为丞相——斯其以死报先帝！”你把印绶放上案头。⟦赵高⟧盯着你良久，拂袖而去。你对着那封真诏坐到天亮。",
									"eff": {
										"attrs": {
											"shengwang": 10,
											"weiji": 20
										},
										"dev": 20,
										"hist": 40
									},
									"to": [
										{
											"if": {
												"anyflag": ["fusu", "liuzheng"],
												"zgMax": 49,
												"devMin": 21
											},
											"to": { "ending": "E5" }
										},
										{
											"if": {
												"anyflag": ["fusu", "liuzheng"],
												"zgMax": 49
											},
											"to": { "ending": "E1" }
										},
										{
											"if": { "zgMax": 49 },
											"to": {
												"ending": "E8",
												"variant": "baobing"
											}
										},
										{ "to": "5-3" }
									]
								},
								{
									"t": "反客为主——发真诏，迎扶苏",
									"req": {
										"flag": "fusu",
										"junxinMaxSeen": 60,
										"notflag": "wu_hanfei"
									},
									"reqAdjust": [{
										"if": { "flag": "yuwei" },
										"attr": "junxinMaxSeen",
										"delta": 5
									}],
									"res": "你盯着⟦赵高⟧说：“中车府令要矫，索性矫到底——发先帝真诏，迎扶苏还京。”帐内死静。你第一次在这宦者眼里，看见一样东西——惧。",
									"eff": {
										"attrs": {
											"weiji": 30,
											"biancai": 3
										},
										"dev": 40
									},
									"to": "5-4"
								},
								{
									"t": "假意从之，阴图后举",
									"req": {
										"caixue": 65,
										"flag": "guanshu"
									},
									"reqAdjust": [{
										"if": { "flag": "yuwei" },
										"attr": "caixue",
										"delta": 5
									}],
									"res": "你应了⟦赵高⟧，应得恭顺。但在伪诏用印前，你做了三处手脚：一处笔误，一处印泥，一名心腹书佐。赵高验了两遍，没有看出来。",
									"eff": {
										"attrs": {
											"quanshi": 5,
											"weiji": 15,
											"moulue": 3
										},
										"dev": 15,
										"flags": ["liuzheng", "wu_jiaozhao"]
									},
									"to": "NEXT"
								}
							]
						},
						{
							"id": "5-3",
							"title": "死线：帐中杀机",
							"segs": ["拒绝的话说出口，⟦赵高⟧不再掩饰。帐外影影绰绰，都是他的人了——火把一圈一圈亮起来，把你的帷帐围在中间，像围着一只终于被逼到仓角的兽。", "他说：“丞相不顾其身，独不为⟦三族⟧计乎？”你眼前闪过的不是律法条文，是⟦李由⟧小时候骑在你肩上的样子。"],
							"options": [{
								"t": "屈服",
								"res": "你弯下腰的时候，听见自己脊梁里有一声轻响。⟦赵高⟧扶你起来，亲自替你掸了掸衣襟上的灰。从这一夜起，你的印绶还在，你的脊梁不在了。",
								"eff": {
									"attrs": {
										"shengwang": -15,
										"weiji": 20,
										"junxin": -10
									},
									"dev": 0,
									"flags": ["wu_jiaozhao", "zhaogao2"],
									"hist": -30
								},
								"to": "NEXT"
							}, {
								"t": "死拒",
								"res": "翌日，丞相李斯“暴病卒”。只有一个老宦收拾遗物时，发现丞相枕下压着一枚上蔡的旧铜符——那是他做小吏时，出入粮仓的凭证。",
								"eff": {
									"dev": 10,
									"hist": 40
								},
								"to": [{
									"if": { "anyflag": ["fusu", "liuzheng"] },
									"to": { "ending": "E5" }
								}, { "to": {
									"ending": "E8",
									"variant": "baobing"
								} }]
							}]
						},
						{
							"id": "5-4",
							"title": "北军南下",
							"segs": ["真诏北去，⟦扶苏⟧得书。⟦蒙恬⟧三十万边军在⟦上郡⟧，沉默得像一道山脉。行在的空气一日紧似一日——⟦赵高⟧加紧了发丧的准备，⟦胡亥⟧开始练习如何当一个皇帝。⟦赵高⟧狗急跳墙，欲立胡亥为变——胜负只在一句：蒙恬信不信你。", "你把一切都押出去了：名节、身家、三族。赌注推到案心之后，人反而静了。你坐在帐中，等着北方的马蹄声，像等一声迟迟不响的雷。"],
							"options": [{
								"t": "等待命运的答复",
								"res": "三日。你在帐中数了三日的更漏。第三日黄昏，北方终于传来马蹄声——你算计过无数次人心，唯有这一次，把命交给别人来算。",
								"eff": { "dev": 0 },
								"to": [
									{
										"if": {
											"flag": "mtdi",
											"weijiMax": 84
										},
										"to": {
											"ending": "E6",
											"variant": "kaifu"
										}
									},
									{
										"if": { "flag": "mtdi" },
										"to": {
											"ending": "E8",
											"variant": "xiefa"
										}
									},
									{
										"if": {
											"flag": "lianmeng",
											"weijiMax": 94
										},
										"to": { "ending": "E6" }
									},
									{
										"if": {
											"flag": "fusu",
											"weijiMax": 84
										},
										"to": { "ending": "E6" }
									},
									{
										"if": { "flag": "fusu" },
										"to": {
											"ending": "E6",
											"variant": "kaifu"
										}
									},
									{ "to": {
										"ending": "E8",
										"variant": "xiefa"
									} }
								]
							}]
						}
					]
				},
				{
					"id": "c6",
					"title": "第六章 ｜ 二世朝堂",
					"sub": "前210—前208",
					"age": 75,
					"summaryNotes": ["史书行到此处，剩下的页数不多了。无论下一页写着什么，都已由你亲手落笔。"],
					"intro": ["二世即位。⟦赵高⟧为郎中令，居中用事。法令诛罚日益刻深，群臣人人自危。⟦阿房宫⟧复作，徭戍无已——楚地，戍卒⟦陈胜⟧已经在⟦大泽乡⟧点起了第一把火。", "咸阳宫里听不见风声。新皇帝⟦胡亥⟧在深宫宴乐，他老师的影子映在殿柱上，比皇帝本人更像皇帝。你是丞相——你名义上是。"],
					"start": "6-1",
					"events": [
						{
							"id": "6-1",
							"title": "督责之书",
							"segs": ["二世问：“所谓有天下者，得肆意极欲。”⟦赵高⟧进谗：“丞相居外，权重于陛下。”一问一答之间，你的罪名已经写好了，只差你的署名。", "你有一篇《行⟦督责⟧之术书》在袖中——以严刑峻法悦上，固宠自保。写，是帮凶；不写，是逆鳞。"],
							"options": [
								{
									"t": "上督责书",
									"hist": true,
									"res": "“贤主必能行⟦督责⟧之术……”二世大悦。刑者相半于道。你经过西市，听见有人念你的文章，念得咬牙切齿。",
									"eff": {
										"attrs": {
											"junxin": 10,
											"quanshi": 5,
											"weiji": 10,
											"shengwang": -10,
											"caixue": 3,
											"zhengji": 5
										},
										"dev": 0,
										"hist": -15
									},
									"to": "6-2"
								},
								{
									"t": "上书请减徭役、罢阿房",
									"res": "书三上，三不报。第四次，⟦赵高⟧替你“转达”了。宫门关上的时候很轻——原来人这一生，要被门合拢很多次。",
									"eff": {
										"attrs": {
											"junxin": -15,
											"shengwang": 10,
											"weiji": 15,
											"caixue": 3
										},
										"dev": 10,
										"hist": 10
									},
									"to": "6-2"
								},
								{
									"t": "称病不朝，自污避祸",
									"req": { "caifu": 30 },
									"res": "你开始酗酒、治产、狎优，把“丞相”两个字泡在酒里。骂名你收下，刀子你躲过——暂时。",
									"eff": {
										"attrs": {
											"weiji": -10,
											"shengwang": -10,
											"caifu": -10,
											"junxin": -5,
											"tupo": -3
										},
										"dev": 8,
										"flags": ["ziwu"]
									},
									"to": "6-2"
								}
							]
						},
						{
							"id": "6-2",
							"title": "三次进谏之局",
							"segs": ["⟦赵高⟧假意劝你进谏，却专挑二世宴乐时通报。二世怒了：“吾方燕私，丞相辄来请事。丞相岂少我哉？且固我哉？”", "⟦赵高⟧在旁轻声补刀：“丞相长男⟦李由⟧为⟦三川⟧守，楚盗⟦陈胜⟧等过三川，城守不肯击——高闻其文书相往来……”"],
							"options": [
								{
									"t": "察觉有诈，拒不入谏",
									"res": "你三次称疾，把那个圈套晾在了宫门口。⟦赵高⟧换了打法——直接构陷。你望着府墙外新换的“更卒”，明白了：门内是丞相府，门外已是他的天罗。",
									"eff": {
										"attrs": {
											"weiji": 10,
											"moulue": 3
										},
										"dev": 5,
										"zg": 10
									},
									"to": "6-3"
								},
								{
									"t": "照常入谏",
									"hist": true,
									"res": "你第三次被挡在宫外时，看见⟦赵高⟧站在廊下，对你笑。你忽然全都明白了——进谏的不是你，是他递出去的刀。太迟了。",
									"eff": {
										"attrs": {
											"weiji": 20,
											"junxin": -15
										},
										"dev": 0
									},
									"to": "6-3"
								},
								{
									"t": "携伪诏破绽，密奏二世",
									"req": { "flag": "liuzheng" },
									"res": "你把两年前的笔误、印泥和人证，一一摆在⟦胡亥⟧面前。皇帝脸色由红转白：“……中车府令安敢！”要么勒死⟦赵高⟧，要么勒死你自己。",
									"eff": {
										"attrs": {
											"weiji": 30,
											"moulue": 3
										},
										"dev": 15
									},
									"to": [{
										"if": {
											"quanshi": 70,
											"junxin": 40,
											"devMin": 46
										},
										"to": { "ending": "E7" }
									}, { "to": "6-3" }]
								},
								{
									"t": "历陈政绩，请归相印",
									"req": { "zhengji": 38 },
									"res": "你把二十年的账一本一本摆出来，然后说：臣老了，请归上蔡。二世准了。走出咸阳那天，你没有回头。",
									"eff": { "dev": 5 },
									"to": {
										"ending": "E4",
										"variant": "gongcheng"
									}
								}
							]
						},
						{
							"id": "6-3",
							"title": "下狱",
							"segs": ["二世二年七月，具斯⟦五刑⟧论，腰斩咸阳市——这道诏书的草稿，⟦赵高⟧已经拟好了。此刻，你在狱中。狱墙比丞相府的院墙更高——原来人这一辈子，墙是越住越高的。", "榜掠千余，你不胜痛，自诬服。你还有一管笔——这是你一生最擅长的武器，最后一次上膛。"],
							"options": [
								{
									"t": "狱中上书，自陈七宗“罪”",
									"hist": true,
									"req": { "caixue": 60 },
									"res": "你写“罪斯当死”：辅先帝兼天下，罪一；广社稷，罪二……七条罪状，条条是功。书成，⟦赵高⟧使吏弃去不奏。你捡起最后一枚竹简，压在枕下——压着它，就像压着二十年的自己。",
									"eff": {
										"attrs": {
											"shengwang": 5,
											"caixue": 3
										},
										"dev": 0
									},
									"to": "6-4"
								},
								{
									"t": "不写了。沉默赴死",
									"res": "笔搁下了。你靠着墙，开始很认真地回忆上蔡东门外的野兔，跑起来是什么样子——耳朵一耸一耸，后腿蹬得泥土四溅。",
									"eff": {
										"attrs": { "shengwang": 3 },
										"dev": 3,
										"hist": 5,
										"flags": ["wuyan"]
									},
									"to": "6-4"
								},
								{
									"t": "散尽家财，买一条流放路",
									"req": {
										"flag": "ziwu",
										"caifu": 15
									},
									"res": "万金散尽，买通狱卒。腰斩改成流放。⟦会稽⟧山里，从此多了一位不问天下的老丈——山里没有仓，山里的老鼠瘦，但活得长。",
									"eff": {
										"dev": 20,
										"setAttrs": {
											"caifu": 0,
											"quanshi": 0
										},
										"attrs": { "shengwang": -20 }
									},
									"to": {
										"ending": "E4",
										"variant": "kuaiji"
									}
								}
							]
						},
						{
							"id": "6-4",
							"title": "东市",
							"segs": ["二世二年七月，咸阳市。具⟦五刑⟧：黥、劓、斩趾、笞杀、枭首——⟦赵高⟧一项没给你省。刑场四周挤满了人。", "你的中子与你同刑。临刑，你回头看他，他也看着你。你说：“吾欲与若复牵黄犬，俱出⟦上蔡⟧东门逐狡兔，岂可得乎！”遂父子相哭，而夷⟦三族⟧。"],
							"options": [{
								"t": "引颈就戮",
								"res": "刀落之前，你最后望了一眼东门的方向。这一生，仓是进过了，鼠也做过了，账算得再精，算不到收场。",
								"eff": { "dev": 0 },
								"to": [
									{
										"if": {
											"flag": "wuyan",
											"devMax": 45
										},
										"to": {
											"ending": "E1",
											"variant": "wuyan"
										}
									},
									{
										"if": { "devMax": 45 },
										"to": { "ending": "E1" }
									},
									{
										"if": { "devMax": 70 },
										"to": { "ending": "E5" }
									},
									{ "to": { "ending": "E7" } }
								]
							}]
						}
					]
				}
			],
			"CORRECTIONS": [
				{
					"minDev": 21,
					"maxDev": 45,
					"chance": .3,
					"title": "修正 ｜ 旧人疏远",
					"segs": [
						"【历史修正】一位兰陵旧识过咸阳而不入，只留一句话：\"李公如今的门，不是我辈该登的。\"",
						"你改道的那一刻起，旧日的同路人就在一个个掉队。名册上划去的名字，比添上的多了。",
						"门客把这句话学给你听时小心翼翼。你挥挥手让他退下——挥手的时候，袖子比往日沉。"
					],
					"eff": {
						"attrs": { "shengwang": -5 },
						"dev": 0
					}
				},
				{
					"minDev": 21,
					"maxDev": 45,
					"chance": .3,
					"title": "修正 ｜ 宫中风议",
					"segs": [
						"【历史修正】宗正府的宴席上，宗室们敬你的酒，杯杯斟得比旁人浅——预兆早已摆在杯盏之间。",
						"你改动的那几处旧例，动的都是他们的恩典。凶手不必拔刀：咸阳酒肆里，关于\"楚人客卿\"的闲话已编到第三版。",
						"第三版闲话里，连你腰间玉佩的来历都有了说法。说法这东西，编到第三版，就成了账。"
					],
					"eff": {
						"attrs": {
							"shengwang": -4,
							"junxin": -2
						},
						"dev": 0
					}
				},
				{
					"minDev": 21,
					"maxDev": 45,
					"chance": .3,
					"title": "修正 ｜ 旧案重提",
					"segs": [
						"【历史修正】御史台忽然翻出一桩你经手的旧案，行文客气，措辞却句句带钩。",
						"上月清点府库的官吏，抄走的单子比你记得的多了一页——预兆早有，只是你没在意。",
						"你把那份行文读了三遍。钩子不在字里，在字与字的缝间——下钩的人，是个老手。"
					],
					"eff": {
						"attrs": {
							"weiji": 4,
							"junxin": -3
						},
						"dev": 0
					}
				},
				{
					"minDev": 46,
					"maxDev": 70,
					"chance": 1,
					"title": "修正 ｜ 旧盟退场",
					"segs": [
						"【历史修正】一位在郡县、焚书诸议上始终与你联署的老臣，称病请归。散朝时，他不再与你同车。",
						"你改流的方向，他不愿跟，也不敢拦。朝堂上少了一个替你说话的人，多了一双旁观的眼睛。",
						"他的车从你车前驶过，车帘纹丝不动。你们共事十五年——帘子放下的那一刻，比任何道别都清楚。"
					],
					"eff": {
						"attrs": {
							"quanshi": -10,
							"weiji": 6
						},
						"dev": 0
					}
				},
				{
					"minDev": 46,
					"maxDev": 70,
					"chance": 1,
					"title": "修正 ｜ 宗室联疏",
					"segs": [
						"【历史修正】几位宗室联名上疏：\"李斯以客卿秉政，号令出于私门，其势不可长。\"",
						"你改动的每一件事，都有人记着账。散朝后，政敌的马车驶向了同一个方向——⟦赵高⟧的府邸。",
						"车轮声消失在巷口。你站在台阶上看了很久：原来他们走到一起，只需要一个共同的名字——你的。"
					],
					"eff": {
						"attrs": {
							"weiji": 12,
							"shengwang": -6
						},
						"dev": 0
					}
				},
				{
					"minDev": 46,
					"maxDev": 70,
					"chance": 1,
					"title": "修正 ｜ 蒙恬生疑",
					"segs": [
						"【历史修正】⟦上郡⟧传来消息：⟦蒙恬⟧遣使者入咸阳，请核对你近日的几道署令。",
						"你改动的安排绕开了边军的旧轨。蒙恬不说话，但他开始看了——被三十万边军的主帅盯着看，本身就是一种罪名。",
						"使者核对得很客气，客气得像在清点遗物。核对完，他向北去了。北边从此多了一双眼睛。"
					],
					"eff": {
						"attrs": {
							"weiji": 10,
							"junxin": -5
						},
						"dev": 0
					}
				},
				{
					"minDev": 71,
					"maxDev": 100,
					"chance": 1,
					"title": "修正 ｜ 天命反噬",
					"segs": [
						"【历史修正】你改得太多，触动的利益已连成一片：宗室的封地、⟦赵高⟧的前程、边军的旧例，桩桩件件都系在你一人身上。",
						"于是军报、谣言、密奏雪片般飞向宫中——没人明说是谁主使，因为人人都是主使。历史在用所有人的手，把你推回原位。",
						"你夜里翻着这些抄件，翻到最后笑了一声。原来史书纠错的办法很简单：让所有人，一起用力。"
					],
					"eff": {
						"attrs": {
							"weiji": 18,
							"junxin": -8
						},
						"dev": 0
					}
				},
				{
					"minDev": 71,
					"maxDev": 100,
					"chance": 1,
					"title": "修正 ｜ 蒙恬回师",
					"segs": [
						"【历史修正】上郡边军拔营南移三十里，前锋已过肤施。旗号未明，朝野皆知：⟦蒙恬⟧在向咸阳要一个说法。",
						"你改写的那一页牵动着北疆兵权。军事施压不必宣战——三十万戍卒只要\"移营\"两个字，你的府邸就夜夜灯火通明。",
						"地图上那三十里，你用指头量了三遍。指头的这一头是咸阳，那一头，是三十万把刀。"
					],
					"eff": {
						"attrs": {
							"weiji": 14,
							"quanshi": -5
						},
						"dev": 0
					}
				},
				{
					"minDev": 71,
					"maxDev": 100,
					"chance": 1,
					"title": "修正 ｜ 御前摊牌",
					"segs": [
						"【历史修正】皇帝忽于偏殿召你独对，屏退左右。御案上摊着你近年的奏议，朱笔批了四个字：\"丞相安敢？\"",
						"⟦赵高⟧的密奏早已先你一步进了宫——这是预兆，也是通牒。帝王给你的最后一次解释机会，从来都不是机会。",
						"你跪在那里，每一句话都在心里过了三遍才出口。出宫时天已黑透——你过关了，这一次。"
					],
					"eff": {
						"attrs": {
							"weiji": 20,
							"junxin": -12
						},
						"zg": 8,
						"dev": 0
					}
				}
			],
			"ACHIEVEMENTS": {
				"cangshu": "仓鼠哲学家",
				"yizi": "一字千钧",
				"shutongwen": "书同文",
				"shaqiu": "沙丘之夜",
				"shuyumengtian": "吾与他，孰与蒙恬",
				"dongmen": "东门黄犬",
				"yibo": "义薄云天",
				"hushu": "护书之人",
				"sili": "死里逃生",
				"jinchan": "金蝉脱壳",
				"nitian": "逆天改命",
				"shiwodai": "时不我待"
			},
			"KEY_NODE_NAMES": {
				"1-2": "兰陵择业",
				"3-2": "逐客令",
				"4-2": "韩非之死",
				"4-5": "焚书",
				"5-2": "沙丘"
			},
			"RANDOM_EVENTS": [
				{
					"id": "R-1",
					"title": "门客自荐",
					"chapters": [1, 6],
					"segs": ["一个衣衫破旧的士人在你门前站了三天，求为门客。问有何本事，他说：“无事不能。”", "第三天傍晚落了雨，他还站着，把自己站成了门前的一根柱子。"],
					"options": [{
						"t": "收为门客",
						"res": "你收下了他——这份求进的心气，像极了当年的自己。",
						"eff": {
							"attrs": {
								"caifu": -6,
								"shengwang": 3
							},
							"dev": 0
						},
						"to": "RETURN"
					}, {
						"t": "让仆从打发走",
						"res": "士人长揖到地，转身走进人流。夜里你忽然想：他今夜歇在哪里？",
						"eff": { "dev": 0 },
						"to": "RETURN"
					}]
				},
				{
					"id": "R-2",
					"title": "夜读",
					"chapters": [0, 6],
					"segs": ["更鼓三声，烛花爆了两次。案上的书还剩最后几枚竹简。", "竹简上的字在烛光里浮沉，像一群蚂蚁，要往你脑子里搬。"],
					"options": [{
						"t": "挑灯读完",
						"res": "天边泛白时你搁下卷。眼里是血丝，心里是亮的——你又多了一寸。",
						"eff": {
							"attrs": {
								"caixue": 4,
								"weiji": 2
							},
							"dev": 0
						},
						"to": "RETURN"
					}, {
						"t": "熄灯睡觉",
						"res": "你吹灭蜡烛。书明天还在，命只有一条。会歇的仓鼠，才吃得到明天的粟。",
						"eff": {
							"attrs": { "weiji": -2 },
							"dev": 0
						},
						"to": "RETURN"
					}]
				},
				{
					"id": "R-3",
					"title": "同乡捎信",
					"chapters": [1, 3],
					"segs": ["有同乡商旅路过，捎来母亲口信：家中都好，勿念。末了补一句——“你爹的咳疾，入夜就重。”", "他说得随意，你听得仔细。故乡的消息，都藏在家常里。"],
					"options": [{
						"t": "托同乡带回钱帛",
						"res": "你把大半积蓄塞进同乡行囊。盘缠又紧了——但有些东西，比盘缠更经不起等。",
						"eff": {
							"attrs": {
								"caifu": -5,
								"shengwang": 2
							},
							"dev": 0
						},
						"to": "RETURN"
					}, {
						"t": "只回一句“知道了”",
						"res": "话出口你自己先沉默了。仓鼠顾不得厕里的旧窝。西边的云，是上蔡的方向。",
						"eff": {
							"attrs": { "weiji": -1 },
							"dev": 0
						},
						"to": "RETURN"
					}]
				},
				{
					"id": "R-4",
					"title": "流言入耳",
					"chapters": [2, 6],
					"segs": ["酒肆里有人编排你的出身，连你母亲的籍贯都编排进去了。门客气得要去理论，被你拦下。", "你听出了别的：这编排的手法太工整了，工整得像公文。"],
					"options": [{
						"t": "花钱疏通，压下流言",
						"res": "几家酒肆的说书人忽然都换了段子。只是买来的安静，租约都很短。",
						"eff": {
							"attrs": {
								"caifu": -8,
								"weiji": -5
							},
							"dev": 0
						},
						"to": "RETURN"
					}, {
						"t": "清者自清，不理会",
						"res": "流言没有腿，却跑得比驿马快。三日后你不是市侩，是奸细了。",
						"eff": {
							"attrs": { "weiji": 4 },
							"dev": 0
						},
						"to": "RETURN"
					}]
				},
				{
					"id": "R-5",
					"title": "术士看相",
					"chapters": [2, 5],
					"segs": ["一个云游术士拦住你的车驾：“君侯之相，贵极人臣——然盛极者，危所伏也。”", "街市喧嚣如常。唯独你车前这一小块地方，安静得奇怪。"],
					"options": [
						{
							"t": "赏钱细问",
							"res": "术士说了些模棱两可的吉凶话，收钱走了。那句话却在你心里住了下来。",
							"eff": {
								"attrs": {
									"caifu": -5,
									"weiji": -3
								},
								"dev": 0
							},
							"to": "RETURN"
						},
						{
							"t": "喝令斥退",
							"res": "“术士之才，售于多疑之人。”你拂袖而去。硬气这东西，一半是做给路人看的。",
							"eff": {
								"attrs": { "shengwang": 1 },
								"dev": 0
							},
							"to": "RETURN"
						},
						{
							"t": "拦住穷究其言",
							"req": { "caixue": 50 },
							"res": "术士被问得无处可躲，说了实话：盛极而衰，不在天，在人。你多给了他一倍的钱。",
							"eff": {
								"attrs": {
									"caixue": 3,
									"weiji": -3
								},
								"dev": 0
							},
							"to": "RETURN"
						}
					]
				},
				{
					"id": "R-6",
					"title": "佃户抗租",
					"chapters": [2, 6],
					"cond": { "caifu": 20 },
					"segs": ["封邑传来消息：年成不好，佃户聚在仓前，抗租不交。为首的是个刺头，已聚了百十号人。", "你看着“围仓”两个字，看了很久。天下的仓，围起来都是一样的。"],
					"options": [{
						"t": "减免三成租子",
						"res": "佃户们山呼“李公仁义”。减去的租子秋后未必收得回，但仓前那些眼睛里的火，灭了。",
						"eff": {
							"attrs": {
								"caifu": -6,
								"shengwang": 3
							},
							"dev": 0
						},
						"to": "RETURN"
					}, {
						"t": "依约强征",
						"res": "租子如数入库。账是平的，人心是亏的——夜里查账，你把那一页翻了过去。",
						"eff": {
							"attrs": {
								"caifu": 6,
								"shengwang": -4,
								"weiji": 3
							},
							"dev": 0
						},
						"to": "RETURN"
					}]
				},
				{
					"id": "R-7",
					"title": "宫中赏赐",
					"chapters": [3, 6],
					"cond": { "junxin": 50 },
					"segs": ["宫中使者至，赐金一笥、帛二十匹。老宦唱名时眼皮都没抬——赏赐是恩典，也是丈量。", "门客们的目光亮得很。金子还没入库，用途已被想出了七八种。"],
					"options": [{
						"t": "谢恩领受",
						"res": "御赐之物入库，你的分量又重了一分。你让人把帛分给府中老弱。",
						"eff": {
							"attrs": {
								"caifu": 8,
								"shengwang": 2
							},
							"dev": 0
						},
						"to": "RETURN"
					}, {
						"t": "固辞，请转赐有功将士",
						"res": "使者回报后，宫里沉默了几日。再见到你时，君王的眼神里多了些东西。",
						"eff": {
							"attrs": {
								"junxin": 3,
								"shengwang": 2
							},
							"dev": 0
						},
						"to": "RETURN"
					}]
				},
				{
					"id": "R-8",
					"title": "韩非来信",
					"chapters": [4, 6],
					"cond": { "flag": "hanfeicun" },
					"segs": ["⟦韩非⟧自客馆致书，洋洋千言，与你论“法、术、势”之辨。他说你的“势”字太滑，“术”字藏得太深——锋芒全在纸上，一个结巴都没有。", "你读了两遍。第一遍想驳，第二遍想笑——敢这样写信给你的，只剩他了。"],
					"options": [{
						"t": "回信论学，针锋相对",
						"res": "你们隔空辩了三个回合。合上竹简你承认：配得上做你对手的，只有他。信末他写：兰陵的梧桐，该落了吧。你搁下笔，没有回。",
						"eff": {
							"attrs": { "caixue": 4 },
							"dev": 0
						},
						"to": "RETURN"
					}, {
						"t": "邀他夜饮，只叙旧不谈学",
						"res": "那晚谁都没提天下。散席时⟦韩非⟧口吃起来：“李、李兄，兰陵的灯……”有些话不必说完，说完就散了。",
						"eff": {
							"attrs": { "weiji": -2 },
							"dev": 0
						},
						"to": "RETURN"
					}]
				},
				{
					"id": "R-9",
					"title": "李由问对",
					"chapters": [4, 6],
					"segs": ["长子⟦李由⟧下值归来，忽然问你：“父亲位极人臣，功盖当世——他日何以自全？”", "廊下的灯被风吹得晃了晃。他眉眼间，是你年轻时的样子。"],
					"options": [{
						"t": "答：“战战兢兢，如临深渊。”",
						"res": "⟦李由⟧若有所思。进取二字你教了他半生；今晚这四个字，是你唯一能补的课。",
						"eff": {
							"attrs": { "weiji": -3 },
							"dev": 0
						},
						"to": "RETURN"
					}, {
						"t": "答：“权势在手，谁能动我？”",
						"res": "⟦李由⟧拜服而去。你知道这话不对，但走到今天，你只能这样回答。",
						"eff": {
							"attrs": {
								"quanshi": 2,
								"weiji": 3
							},
							"dev": 0
						},
						"to": "RETURN"
					}]
				},
				{
					"id": "R-10",
					"title": "路见不平",
					"chapters": [1, 6],
					"segs": ["街市上，几个悍卒在围殴一个卖浆老翁，只因他挡了道。老翁蜷着身子护住头，一声不吭。", "围观的人群很厚，厚得像一堵会呼吸的墙。"],
					"options": [{
						"t": "喝止悍卒，赔钱给老翁",
						"res": "悍卒认得你的车驾，悻悻散去。这事当天传遍半座城——版本里，你下车亲自扶起了老翁。有些名声，是它自己长腿的。",
						"eff": {
							"attrs": {
								"shengwang": 3,
								"caifu": -3
							},
							"dev": 0
						},
						"to": "RETURN"
					}, {
						"t": "命车夫绕道",
						"res": "车轮辘辘，把哭喊声碾在身后。这世道，管不过来的。当晚的饭你少用了一半——是老了。",
						"eff": {
							"attrs": { "weiji": -1 },
							"dev": 0
						},
						"to": "RETURN"
					}]
				},
				{
					"id": "R-11",
					"title": "刺客踪迹",
					"chapters": [4, 6],
					"cond": { "weiji": 50 },
					"segs": ["侍卫来报：府墙外近日总有生面孔逡巡，盘查即散。卖浆的、补锅的、问路的——唯一不换的是眼睛。", "你登上府中最高的阁楼，往下看了一眼。街市如常，如常得过分。"],
					"options": [{
						"t": "加一倍侍卫，深居简出",
						"res": "府邸守得铁桶一般。那些面孔消失了——至少，你看不见了。看不见，不等于不在。",
						"eff": {
							"attrs": {
								"caifu": -8,
								"weiji": -8
							},
							"dev": 0
						},
						"to": "RETURN"
					}, {
						"t": "不以为然",
						"res": "你把奏报搁在一边。枕边压了一把短剑——人到了仓顶上，学的就不是鼠了。",
						"eff": {
							"attrs": { "weiji": 6 },
							"dev": 0
						},
						"to": "RETURN"
					}]
				},
				{
					"id": "R-12",
					"title": "赵高的礼物",
					"chapters": [4, 6],
					"cond": { "anyflag": ["zhaogao1", "zhaogao2"] },
					"segs": ["⟦中车府令⟧遣人送来一车礼物：明珠一斛，美玉双璧。礼单上的字很恭顺，恭顺得像一份供状。", "满府的人都在等你的脸色。你知道，这一车不是礼物，是问路石。"],
					"options": [{
						"t": "收下",
						"res": "礼物入库，入库单是你亲笔签的——你们都清楚这是账本上的一笔，迟早要还的。签完你盯着那个“斯”字，墨色比往日深。",
						"eff": {
							"attrs": {
								"caifu": 8,
								"weiji": 5
							},
							"dev": 0
						},
						"to": "RETURN"
					}, {
						"t": "原封退回",
						"res": "送礼的人脸色变了变，躬身退下。从此⟦赵高⟧看你，敬意没了，算计多了。",
						"eff": {
							"attrs": {
								"weiji": 3,
								"shengwang": 2
							},
							"dev": 0
						},
						"to": "RETURN"
					}]
				}
			],
			"CRISIS_EVENTS": {
				"plots": [
					{
						"id": "C-1",
						"title": "墙外耳目",
						"segs": [
							"连日来，府门前多了几个看摊的生面孔；门客出门，总被“顺路”的人搭讪问话。",
							"仆从擒住一个翻墙的，那人咬舌前只吐出半句：“……中车府。”",
							"⟦赵高⟧盯上你了。动机不必问——你挡在他与诏书之间，这就是全部的罪名。",
							"你把那半句话在灯下写了一遍，又烧掉。有些名字，落到纸上都是烫的。"
						],
						"options": [{
							"t": "重金收买其手下，反布眼线",
							"res": "金子递过去，墙外的眼睛成了你的眼睛。只是这份忠诚，按日计费。从此你案头多了一本小册子：谁见过你的人，谁问过你的话，日日有账。",
							"eff": {
								"attrs": {
									"caifu": -10,
									"weiji": -8
								},
								"dev": 0
							},
							"to": "RETURN"
						}, {
							"t": "不动声色，静观其变",
							"res": "你装作毫无察觉。暗处的网收得更紧了，而你连收网的人是谁都只能猜。出门时你照旧谈笑——只有车夫发现，丞相如今上车前，总会回头看一眼墙头。",
							"eff": {
								"attrs": { "weiji": 6 },
								"dev": 0
							},
							"to": "RETURN"
						}]
					},
					{
						"id": "C-2",
						"title": "宗室弹章",
						"segs": [
							"咸阳宫里，几位宗室联名上表：“李斯以客卿秉政，号令出于私门，其势不可长。”",
							"预兆早有——上月宗正府宴上，他们敬你的酒，杯杯都斟得比旁人浅。",
							"你动了他们的封地与恩典，他们便动你的根基。朝堂之上，账都是这么算的。",
							"弹章的抄本傍晚就送到了你案上——送抄本的人没说姓名，这也是一种表态。"
						],
						"options": [{
							"t": "登门示弱，厚币修好",
							"res": "你带着重礼挨家登门。弹章压下了，腰也弯了——满府门客都看见了。回来的路上没人说话。弯腰这种事，做一次是礼节，做多了，就是姿势了。",
							"eff": {
								"attrs": {
									"caifu": -8,
									"shengwang": -3,
									"weiji": -6
								},
								"dev": 0
							},
							"to": "RETURN"
						}, {
							"t": "置之不理，以政绩自明",
							"res": "你不屑分辩。弹章没有停，反而有了新的名目。清高在咸阳是最贵的奢侈品。新名目说你“恃功而骄”——你笑笑，把弹章压在砚台下，砚台压得越久，字渗得越深。",
							"eff": {
								"attrs": { "weiji": 8 },
								"dev": 0
							},
							"to": "RETURN"
						}]
					},
					{
						"id": "C-3",
						"title": "屋瓦夜响",
						"segs": [
							"三更，屋瓦轻响，院犬狂吠。侍卫追出去，只见一道黑影翻过两重院墙。",
							"次日查验，墙上留着半枚靴印——是军中的制式。你近年整肃吏治，结下的仇家不乏带兵的。",
							"这不是贼。贼不踩点，刺客才踩点。",
							"你蹲下身，用指头比了比那半枚靴印的尺寸。比完了，你拍了拍手，什么都没说。"
						],
						"options": [{
							"t": "增派守卫，深居简出",
							"res": "府邸守得铁桶一般。黑影再没出现——至少，你睡得了整觉了。只是每日晨起，侍卫统领的眼神都欲言又止：铁桶防得住贼，防不住名单。",
							"eff": {
								"attrs": {
									"caifu": -6,
									"weiji": -8
								},
								"dev": 0
							},
							"to": "RETURN"
						}, {
							"t": "放线设伏，务求擒之",
							"res": "半月后伏兵得手，擒住一名死士，未及审讯便服毒自尽。你赢了这一局，也惊出了下一局。死士齿间藏着毒囊——军中死士的形制。你把验尸的笔录，锁进了最里层的匣子。",
							"eff": {
								"attrs": {
									"weiji": 4,
									"shengwang": 3
								},
								"dev": 0
							},
							"to": "RETURN"
						}]
					}
				],
				"death": {
					"id": "C-DEATH",
					"title": "杀机已至",
					"segs": [
						"弹劾你的奏章已经堆满二世的案头，使者带着诏书出了宫门——这一次，不是召见。",
						"府门外甲士换岗的次数变了。亲信连夜来报：廷尉府的狱吏，已经在清点你的族谱。",
						"刀已在颈后。你还有最后一次挣扎的机会。",
						"你把案上的文书一份份理好，理得很慢。理到最后一封，你才发现手在抖。"
					],
					"options": [
						{
							"t": "散尽家财，求得一线",
							"req": { "caifu": 30 },
							"res": "万金散去，诏书的措辞软了几分。死罪可免——这一次。经手收钱的人一个个都对你很恭敬，恭敬得让你明白：他们收的是钱，不是你的情。",
							"eff": {
								"attrs": {
									"caifu": -30,
									"weiji": -25
								},
								"dev": 0
							},
							"to": "RETURN"
						},
						{
							"t": "上书自辩",
							"req": { "caixue": 60 },
							"res": "你援笔疾书，历陈功劳。书达御前，换来了几日死缓，和帝王更深的一层疑心。缓是缓了——狱外的天色一日三变，你数着更漏等，等一个你自己都不信的转机。",
							"eff": {
								"attrs": {
									"weiji": -15,
									"junxin": -5
								},
								"dev": 0
							},
							"to": "RETURN"
						},
						{
							"t": "坐以待毙",
							"res": "你搁下笔，整衣危坐。仓鼠一生所谋，不过一个“位”字——此刻位已成牢。烛火燃到尽头时你忽然很平静：原来终点到了，人是不用跑的。",
							"eff": {
								"attrs": { "weiji": 15 },
								"dev": 0
							},
							"to": "RETURN"
						}
					]
				},
				"qingsuan": {
					"id": "C-QS",
					"title": "旧事清算",
					"segs": [
						"廷议散朝，一位御史忽然出班，旧事重提：当年⟦长史⟧任上，赍往六国的金玉，账目对不上。",
						"预兆早有——上月清点府库的官吏，抄走的单子比你记得的多了一页。",
						"你当年留在指缝里的声响，如今被人一枚一枚数了出来。",
						"满朝的目光落过来，有看热闹的，有等报价的。你把朝笏扶正，慢慢出班。"
					],
					"options": [{
						"t": "破财消灾，逐项补上亏空",
						"res": "你连夜开库，亏空如数补上，又厚币谢过几位宗老。御史的弹章，再没有下文。账平了——只是开库那晚你亲自点的数，点的哪里是金玉，是当年那个伸手的自己。",
						"eff": {
							"attrs": {
								"caifu": -20,
								"weiji": -10
							},
							"dev": 0
						},
						"to": "RETURN"
					}, {
						"t": "硬扛到底，当庭自辩",
						"res": "你当庭逐条驳回去。账是辩赢了，闲话却传开了——满朝都记住了“丞相的金玉”。辩赢那日你神清气爽；三个月后你才回过味来：他们要的本不是账，是这三个字传出去。",
						"eff": {
							"attrs": {
								"weiji": 10,
								"shengwang": -5
							},
							"dev": 0
						},
						"to": "RETURN"
					}]
				}
			},
			"ACTIONS": [
				{
					"chapters": [0, 6],
					"name": "著书立说",
					"res": "数月之功，文成一篇。士林争相传抄，也有人把文章抄送给了你的政敌——笔能养名，也能树敌。",
					"descHidden": "闭门著文，以文养名",
					"desc": "闭门著文，以文养名",
					"eff": {
						"attrs": {
							"weiji": 2,
							"caixue": 3,
							"shengwang": 1
						},
						"dev": 0
					},
					"id": "ACT-1",
					"type": "进取"
				},
				{
					"chapters": [0, 6],
					"req": { "caifu": 8 },
					"name": "宴饮交游",
					"res": "一场大宴，宾主尽欢。散场时多了几个肯替你说话的人——醉后几句真言，比席上十句颂词值钱。",
					"descHidden": "置酒高会，结交朝士（席费不菲）",
					"desc": "置酒高会，结交朝士（财富-8）",
					"eff": {
						"attrs": {
							"caifu": -8,
							"biancai": 1,
							"junxin": 1,
							"shengwang": 3
						},
						"dev": 0
					},
					"id": "ACT-2",
					"type": "兑换"
				},
				{
					"chapters": [0, 6],
					"req": { "minChapter": 2 },
					"name": "入宫请安",
					"res": "你在殿下站了两个时辰，换来三句问话。值。膝盖是麻的，心是亮的。",
					"descHidden": "趋朝问安，固宠于君（需在秦廷）",
					"desc": "趋朝问安，固宠于君（需在秦廷）",
					"eff": {
						"attrs": {
							"biancai": 1,
							"junxin": 3,
							"weiji": 2
						},
						"dev": 0
					},
					"id": "ACT-3",
					"type": "进取"
				},
				{
					"chapters": [0, 6],
					"name": "闭门读书",
					"res": "门一关，是非就进不来了。书页翻动的声音，是乱世里难得的清净。",
					"descHidden": "谢客静修，养望蓄才",
					"desc": "谢客静修，养望蓄才",
					"eff": {
						"attrs": {
							"weiji": -1,
							"caixue": 2,
							"tupo": -1
						},
						"dev": 0
					},
					"id": "ACT-4",
					"type": "守成"
				},
				{
					"chapters": [0, 6],
					"req": { "caifu": 8 },
					"name": "散财养士",
					"res": "千金散尽，门下多了几十双在暗处替你看路的眼睛。散钱时心疼，夜深想通了：买的不是嘴，是命。",
					"descHidden": "厚币招贤，缓急有人（厚币耗财）",
					"desc": "厚币招贤，缓急有人（财富-8）",
					"eff": {
						"attrs": {
							"caifu": -8,
							"weiji": -4,
							"shengwang": 2
						},
						"dev": 0
					},
					"id": "ACT-5",
					"type": "保身"
				},
				{
					"chapters": [0, 6],
					"req": { "minChapter": 2 },
					"name": "称病蛰伏",
					"res": "病假条递上去，朝堂少了一个靶子。探病的人来了几拨——病是装的，防的心是真的。",
					"descHidden": "闭门称病，避人锋芒（需在秦廷）",
					"desc": "闭门称病，避人锋芒（需在秦廷）",
					"eff": {
						"attrs": {
							"junxin": -2,
							"quanshi": -3,
							"weiji": -5,
							"tupo": 1
						},
						"dev": 0
					},
					"id": "ACT-6",
					"type": "保身"
				},
				{
					"chapters": [0, 6],
					"name": "习剑强身",
					"res": "你鸡鸣即起，庭前剑光起落三百回。臂上的力道一日日攒了下来——剑是旧剑，人已不是从前那人。",
					"descHidden": "晨起习剑，筋骨与剑俱进",
					"desc": "晨起习剑，筋骨与剑俱进",
					"eff": {
						"attrs": {
							"caifu": -1,
							"wuli": 3,
							"tupo": 1
						},
						"dev": 0
					},
					"id": "ACT-49",
					"type": "守成"
				},
				{
					"chapters": [0, 6],
					"name": "导引养生",
					"res": "你闭户调息，吐纳之间气血渐顺。养的是精神，顺带也养了一份清静。",
					"descHidden": "调息导引，养精神于未衰",
					"desc": "调息导引，养精神于未衰",
					"eff": {
						"attrs": {
							"weiji": -1,
							"tupo": 2
						},
						"dev": 0
					},
					"id": "ACT-50",
					"type": "守成"
				},
				{
					"chapters": [0, 0],
					"name": "结交富室",
					"res": "你携礼往城东粮贾家登了几回门，陪笑、陪酒，替他记账拟书。仓里的钱粮肯拨给你了，县廷里也有人替你递话——只是自家案头的书简，落了半指灰。",
					"descHidden": "倾身结纳，倚为奥援",
					"desc": "倾身结纳，倚为奥援",
					"eff": {
						"attrs": {
							"caifu": 3,
							"caixue": -2,
							"shengwang": 1
						},
						"dev": 0
					},
					"id": "ACT-7",
					"type": "兑换"
				},
				{
					"chapters": [0, 0],
					"name": "替人写状",
					"res": "你的状纸写得刀刀见骨，官司赢了几场，润笔丰厚。败诉那家在巷口堵过你一回——刀笔吏的笔，快是快，就是容易见血。",
					"descHidden": "刀笔谋生，润笔养家",
					"desc": "刀笔谋生，润笔养家",
					"eff": {
						"attrs": {
							"caifu": 3,
							"caixue": 1,
							"weiji": 2,
							"shengwang": -2
						},
						"dev": 0
					},
					"id": "ACT-8",
					"type": "兑换"
				},
				{
					"chapters": [0, 0],
					"name": "田间观鼠",
					"res": "你又去看了仓廪与茅厕里的老鼠。同是鼠也，所处异耳——有人看鼠是鼠，有人看鼠，是镜。",
					"descHidden": "观鼠于厕仓，思人之所处",
					"desc": "观鼠于厕仓，思人之所处",
					"eff": {
						"attrs": {
							"caixue": 2,
							"weiji": -1
						},
						"dev": 0
					},
					"id": "ACT-9",
					"type": "守成"
				},
				{
					"chapters": [0, 0],
					"req": { "caifu": 4 },
					"name": "结交游侠",
					"res": "市井里几个带剑的汉子认下了你这个朋友。县中泼皮再不敢在你门前喧哗——他们喝酒你付账，他们打架你递话。",
					"descHidden": "折节下士，缓急可恃（酒食耗财）",
					"desc": "折节下士，缓急可恃（财富-4）",
					"eff": {
						"attrs": {
							"caifu": -4,
							"biancai": 2,
							"weiji": -3,
							"shengwang": 1
						},
						"dev": 0
					},
					"id": "ACT-10",
					"type": "保身"
				},
				{
					"chapters": [0, 0],
					"name": "督办粮簿",
					"res": "你核出三笔亏空，郡守记了你的名。同僚说你\"毛颖为刀，专刻同袍\"——核清那晚，粮吏们的酒局没有叫你。",
					"descHidden": "勾稽仓账，以干吏名",
					"desc": "勾稽仓账，以干吏名",
					"eff": {
						"attrs": {
							"zhengji": 1,
							"quanshi": 2,
							"moulue": 1,
							"shengwang": -2
						},
						"dev": 0
					},
					"id": "ACT-11",
					"type": "进取"
				},
				{
					"chapters": [0, 0],
					"req": { "caifu": 3 },
					"name": "货殖郡府",
					"res": "节礼一层层送上去，郡府里开始有人替你递话。小吏的升迁，一半靠笔，一半靠币。",
					"descHidden": "馈遗郡吏，买路向上（节礼破费）",
					"desc": "馈遗郡吏，买路向上（财富-3）",
					"eff": {
						"attrs": {
							"caifu": -3,
							"quanshi": 2
						},
						"dev": 0
					},
					"id": "ACT-12",
					"type": "兑换"
				},
				{
					"chapters": [0, 0],
					"name": "习武于市",
					"res": "你在市肆较艺演武，围观的人越聚越多。乡野的武名，一半是敬，一半是忌。",
					"descHidden": "市上较艺，名起亦招忌",
					"desc": "市上较艺，名起亦招忌",
					"eff": {
						"attrs": {
							"weiji": 1,
							"wuli": 2,
							"shengwang": 1
						},
						"dev": 0
					},
					"id": "ACT-51",
					"type": "守成"
				},
				{
					"chapters": [0, 0],
					"name": "负重劳作",
					"res": "你替人负米搬运，肩头的茧厚了一层，囊中的钱也多了几枚。这具身子骨，是往后几十年的本钱。",
					"descHidden": "负重营生，筋骨换钱粮",
					"desc": "负重营生，筋骨换钱粮",
					"eff": {
						"attrs": {
							"caifu": 1,
							"tupo": 2
						},
						"dev": 0
					},
					"id": "ACT-52",
					"type": "守成"
				},
				{
					"chapters": [1, 1],
					"req": { "caifu": 2 },
					"name": "问难荀卿",
					"res": "你以\"人性本恶，何以为善\"问，⟦荀卿⟧反诘再三。散堂时你只觉脑子里有东西碎了又立起来。先生临了说：问得好，答得还浅。",
					"descHidden": "执经问难，切磋琢磨（束脩微费）",
					"desc": "执经问难，切磋琢磨（财富-2）",
					"eff": {
						"attrs": {
							"caifu": -2,
							"caixue": 3
						},
						"dev": 0
					},
					"id": "ACT-13",
					"type": "兑换"
				},
				{
					"chapters": [1, 1],
					"name": "与韩论学",
					"res": "⟦韩非⟧口吃，便写；你能言，便辩。烛尽三枝，不分胜负——这一夜没有谁赢，只有两个人都没输。",
					"descHidden": "同窗抵足，辩至夜分",
					"desc": "同窗抵足，辩至夜分",
					"eff": {
						"attrs": {
							"biancai": 1,
							"weiji": 1,
							"caixue": 3,
							"shengwang": 1
						},
						"dev": 0
					},
					"id": "ACT-14",
					"type": "守成"
				},
				{
					"chapters": [1, 1],
					"name": "抄简自给",
					"res": "你替书坊抄简，一手小字又快又整。抄到《商君书》那卷时多抄了一份留给自己——坊主不知道，你抄走的不是字，是钥匙。",
					"descHidden": "佣书换粟，半耕半读",
					"desc": "佣书换粟，半耕半读",
					"eff": {
						"attrs": {
							"caifu": 2,
							"caixue": 1
						},
						"dev": 0
					},
					"id": "ACT-15",
					"type": "守成"
				},
				{
					"chapters": [1, 1],
					"req": { "caifu": 2 },
					"name": "结交同窗",
					"res": "兰陵一别，这些同窗将散入列国朝堂。你记下每个人的所长——乱世的名册，就是白天的星图。",
					"descHidden": "倾盖定交，后日之援（薄有破费）",
					"desc": "倾盖定交，后日之援（财富-2）",
					"eff": {
						"attrs": {
							"caifu": -2,
							"biancai": 1,
							"shengwang": 3
						},
						"dev": 0
					},
					"id": "ACT-16",
					"type": "兑换"
				},
				{
					"chapters": [1, 1],
					"name": "观时著论",
					"res": "你著《议兵》《论势》数篇，学舍传阅。喝彩者众，也有人冷哂：纸上之兵，未历行伍——你在文末添了句批注：行伍之人，正读此纸。",
					"descHidden": "纵论天下，以文自见",
					"desc": "纵论天下，以文自见",
					"eff": {
						"attrs": {
							"moulue": 2,
							"weiji": 2,
							"shengwang": 3
						},
						"dev": 0
					},
					"id": "ACT-17",
					"type": "进取"
				},
				{
					"chapters": [1, 1],
					"name": "躬耕自给",
					"res": "你租了两亩菜畦，囊中宽裕了，简册却落了一层灰。夜里抚着那层灰，你分不清种的是菜，还是退路。",
					"descHidden": "力田省用，以俭养学",
					"desc": "力田省用，以俭养学",
					"eff": {
						"attrs": {
							"caifu": 2,
							"caixue": -2,
							"tupo": 1
						},
						"dev": 0
					},
					"id": "ACT-18",
					"type": "兑换"
				},
				{
					"chapters": [1, 1],
					"name": "习射于乡",
					"res": "你在乡间张弓习射，箭垛上的箭孔越收越紧。担柴的乡人驻足看了一会儿，说李家的后生，臂力见长。",
					"descHidden": "乡间习射，弓开筋骨健",
					"desc": "乡间习射，弓开筋骨健",
					"eff": {
						"attrs": {
							"wuli": 2,
							"tupo": 1
						},
						"dev": 0
					},
					"id": "ACT-53",
					"type": "守成"
				},
				{
					"chapters": [1, 1],
					"name": "负笈跋涉",
					"res": "你背着书箱随商队远行，替人记账写书，以脚程换盘缠。路是苦的，简册却一页没有落下。",
					"descHidden": "负笈千里，脚力换盘缠",
					"desc": "负笈千里，脚力换盘缠",
					"eff": {
						"attrs": {
							"caifu": 1,
							"tupo": 2
						},
						"dev": 0
					},
					"id": "ACT-54",
					"type": "守成"
				},
				{
					"chapters": [2, 2],
					"req": { "caifu": 3 },
					"name": "结交郎官",
					"res": "你与几个殿前执戟的郎官换了名刺。大王昨日的喜怒，今晨你就知道了——门路这东西，越早铺越便宜。",
					"descHidden": "纳交禁掖，消息早一步（微耗财帛）",
					"desc": "纳交禁掖，消息早一步（财富-3）",
					"eff": {
						"attrs": {
							"caifu": -3,
							"biancai": 1,
							"junxin": 1,
							"shengwang": 1
						},
						"dev": 0
					},
					"id": "ACT-19",
					"type": "兑换"
				},
				{
					"chapters": [2, 2],
					"req": { "caifu": 3 },
					"name": "打探宫情",
					"res": "宫里哪一处得宠、哪一处失势，你比多数九卿知道得都早。你学会了分辨：哪句是金，哪句只是响。",
					"descHidden": "市言于宦者之门（破费买言）",
					"desc": "市言于宦者之门（财富-3）",
					"eff": {
						"attrs": {
							"caifu": -3,
							"moulue": 1,
							"weiji": -3
						},
						"dev": 0
					},
					"id": "ACT-20",
					"type": "保身"
				},
				{
					"chapters": [2, 2],
					"name": "督办文书",
					"res": "相邦府的积牍被你三日理清。⟦吕不韦⟧点点头，府中老吏的脸色却不大好看——脸色的变化，你也一并记了档。",
					"descHidden": "躬亲簿领，以勤自效",
					"desc": "躬亲簿领，以勤自效",
					"eff": {
						"attrs": {
							"zhengji": 1,
							"quanshi": 3,
							"weiji": 2,
							"moulue": 1
						},
						"dev": 0
					},
					"id": "ACT-21",
					"type": "进取"
				},
				{
					"chapters": [2, 2],
					"req": { "caixue": 45 },
					"name": "修书吕门",
					"res": "你执笔为⟦吕氏春秋⟧润色数篇。书悬市门之日，署名的八百人，执笔的不过数十——你的名字虽不在其上，已在其门。",
					"descHidden": "预修《吕氏春秋》之役（才学不足则难与执笔）",
					"desc": "预修《吕氏春秋》之役（才学≥45 方能执笔）",
					"eff": {
						"attrs": {
							"weiji": 1,
							"caixue": 1,
							"shengwang": 2
						},
						"dev": 0
					},
					"id": "ACT-22",
					"type": "进取"
				},
				{
					"chapters": [2, 2],
					"req": { "caifu": 6 },
					"name": "贿赂寺人",
					"res": "金子递进宫墙的缝隙，话从缝隙里递回来。牵线的是个姓赵的宦者，笑得殷勤，记得也牢。",
					"descHidden": "输金宦者，买宫中耳（输金不菲）",
					"desc": "输金宦者，买宫中耳（财富-6）",
					"eff": {
						"zg": 3,
						"attrs": {
							"caifu": -6,
							"junxin": 2
						},
						"dev": 0
					},
					"id": "ACT-23",
					"type": "兑换"
				},
				{
					"chapters": [2, 2],
					"name": "俭用蓄财",
					"res": "舍人俸薄，你省下半数存起来。同舍笑你啬，你不辩——乱世里，钱是胆；铜钱碰撞的声音，比恭维踏实。",
					"descHidden": "节衣缩食，积粮防饥",
					"desc": "节衣缩食，积粮防饥",
					"eff": {
						"attrs": {
							"caifu": 3,
							"shengwang": -2
						},
						"dev": 0
					},
					"id": "ACT-24",
					"type": "兑换"
				},
				{
					"chapters": [2, 2],
					"name": "随军观阵",
					"res": "你随军登高观阵，看鼓旗如何调度万人。你把阵图记在心里，也把危险一并记下了。",
					"descHidden": "随军观阵，阵前悟兵机",
					"desc": "随军观阵，阵前悟兵机",
					"eff": {
						"attrs": {
							"moulue": 1,
							"wuli": 2,
							"weiji": 1
						},
						"dev": 0
					},
					"id": "ACT-55",
					"type": "守成"
				},
				{
					"chapters": [2, 2],
					"req": { "caifu": 2 },
					"name": "骑射苑囿",
					"res": "你花钱进了苑囿，纵马弯弓，一日驰突数十里。钱帛会散，练下的功夫散不了。",
					"descHidden": "苑囿骑射，金帛换弓马（鞍马之费）",
					"desc": "苑囿骑射，金帛换弓马（财富-2）",
					"eff": {
						"attrs": {
							"caifu": -2,
							"wuli": 2,
							"tupo": 1
						},
						"dev": 0
					},
					"id": "ACT-56",
					"type": "兑换"
				},
				{
					"chapters": [3, 3],
					"name": "串联客卿",
					"res": "被逐的客卿聚在你的传舍，推你为魁。人多势众是壮胆，人多口杂也是祸根——今夜到会四十七人，明日出卖你的，或许就在其中。",
					"descHidden": "连横同逐者，共议去留",
					"desc": "连横同逐者，共议去留",
					"eff": {
						"attrs": {
							"biancai": 2,
							"weiji": 3,
							"shengwang": 3
						},
						"dev": 0
					},
					"id": "ACT-25",
					"type": "进取"
				},
				{
					"chapters": [3, 3],
					"req": { "caifu": 5 },
					"name": "密访宗室",
					"res": "重礼开路，一位宗老收下了你的拜帖。逐客之议汹汹，总算有人在宗族里替你缓颊——门开了，路还长。",
					"descHidden": "夜叩宗老之门（重礼耗财）",
					"desc": "夜叩宗老之门（财富-5）",
					"eff": {
						"attrs": {
							"caifu": -5,
							"weiji": -3,
							"biancai": 1
						},
						"dev": 0
					},
					"id": "ACT-26",
					"type": "保身"
				},
				{
					"chapters": [3, 3],
					"req": { "caifu": 4 },
					"name": "打点押吏",
					"res": "押送的吏卒收了钱，车驾行得慢了，话也客气了。你在函谷关前多争出了十天——驿路上是两站，你案上，是一封书的生死。",
					"descHidden": "贿遣押送吏，途中少辱（贿赂耗财）",
					"desc": "贿遣押送吏，途中少辱（财富-4）",
					"eff": {
						"attrs": {
							"caifu": -4,
							"weiji": -2
						},
						"dev": 0
					},
					"id": "ACT-27",
					"type": "保身"
				},
				{
					"chapters": [3, 3],
					"req": { "caifu": 3 },
					"name": "托人递简",
					"res": "你把一卷书信托给还留在咸阳的旧识。能不能到御前不知道，但火种得先埋下去——筒里装的，是两个人的前程。",
					"descHidden": "遗书故交，求达天听（微耗财帛）",
					"desc": "遗书故交，求达天听（财富-3）",
					"eff": {
						"attrs": {
							"caifu": -3,
							"junxin": 2
						},
						"dev": 0
					},
					"id": "ACT-28",
					"type": "兑换"
				},
				{
					"chapters": [3, 3],
					"name": "闭门草疏",
					"res": "驿舍的灯亮到四更。你把每一个字都磨到无可更换——写文章和做人一样，删到最后，剩的才是骨头。",
					"descHidden": "杜门属稿，字字磨洗",
					"desc": "杜门属稿，字字磨洗",
					"eff": {
						"attrs": {
							"caixue": 3,
							"weiji": -1
						},
						"dev": 0
					},
					"id": "ACT-29",
					"type": "守成"
				},
				{
					"chapters": [3, 3],
					"req": { "caifu": 4 },
					"name": "倾囊结义",
					"res": "同逐者中有盘缠断绝的，你解囊分赠。分出去的是钱，收回来的是心——难中的一揖，最贵也最容易忘。",
					"descHidden": "分金周急，收揽众心（分金耗财）",
					"desc": "分金周急，收揽众心（财富-4）",
					"eff": {
						"attrs": {
							"caifu": -4,
							"shengwang": 3
						},
						"dev": 0
					},
					"id": "ACT-30",
					"type": "兑换"
				},
				{
					"chapters": [3, 3],
					"name": "鬻字易米",
					"res": "你的字在列国值钱了。识货的人照着笔迹找上门来——原来笔墨不只济世，也能济己。",
					"descHidden": "鬻字易米，润笔糊口",
					"desc": "鬻字易米，润笔糊口",
					"eff": {
						"attrs": {
							"caifu": 2,
							"caixue": 1
						},
						"dev": 0
					},
					"id": "ACT-57",
					"type": "守成"
				},
				{
					"chapters": [3, 3],
					"name": "风霜夜行",
					"res": "你戴月披霜，夜行数十里。寒风刮面如刀，筋骨却越走越结实——夜色是最好的掩护，天亮就没人认得你的脚印。",
					"descHidden": "戴月夜行，风霜隐行踪",
					"desc": "戴月夜行，风霜隐行踪",
					"eff": {
						"attrs": {
							"weiji": -1,
							"tupo": 2
						},
						"dev": 0
					},
					"id": "ACT-58",
					"type": "守成"
				},
				{
					"chapters": [4, 4],
					"req": { "caifu": 4 },
					"name": "拉拢廷臣",
					"res": "几位九卿府上收下了你的重礼与热络。朝会时附和你的人多了，盯着你的人也多了——夜里你核对名录：谁可用，谁可防。",
					"descHidden": "结纳朝贵，固己之党（重礼耗财）",
					"desc": "结纳朝贵，固己之党（财富-4）",
					"eff": {
						"attrs": {
							"caifu": -4,
							"quanshi": 2,
							"weiji": 2,
							"biancai": 1
						},
						"dev": 0
					},
					"id": "ACT-31",
					"type": "兑换"
				},
				{
					"chapters": [4, 4],
					"name": "弹章政敌",
					"res": "你的弹章递上去，一名政敌左迁出京。朝堂安静了几日，然后你看你的眼神都冷了——出手要快，痕迹要少。",
					"descHidden": "疏劾异己，先声夺人",
					"desc": "疏劾异己，先声夺人",
					"eff": {
						"attrs": {
							"moulue": 1,
							"shengwang": -3,
							"zhengji": 1,
							"quanshi": 3,
							"weiji": 4
						},
						"dev": 0
					},
					"id": "ACT-32",
					"type": "进取"
				},
				{
					"chapters": [4, 4],
					"name": "巡视封邑",
					"res": "车骑行县，守令郊迎，租赋与孝敬一起入库。郊迎的队列跪了半里地——跪的是丞相，不是李斯。",
					"descHidden": "行县视事，威福自专",
					"desc": "行县视事，威福自专",
					"eff": {
						"attrs": {
							"caifu": 3,
							"wuli": 1,
							"shengwang": 1,
							"zhengji": 1,
							"weiji": 3
						},
						"dev": 0
					},
					"id": "ACT-33",
					"type": "进取"
				},
				{
					"chapters": [4, 4],
					"req": { "caifu": 3 },
					"name": "督办驰道",
					"res": "⟦驰道⟧又向东延了百里，御驾巡幸的路更平了。验收那日你走了十里新道，路面平得能照见人影。",
					"descHidden": "督课工程，以绩固宠（督工耗财）",
					"desc": "督课工程，以绩固宠（财富-3）",
					"eff": {
						"attrs": {
							"caifu": -3,
							"moulue": 1,
							"zhengji": 2,
							"junxin": 2,
							"weiji": 2
						},
						"dev": 0
					},
					"id": "ACT-34",
					"type": "兑换"
				},
				{
					"chapters": [4, 4],
					"req": { "caixue": 55 },
					"name": "修订律令",
					"res": "你逐条校订律文，增损之间，天下人的祸福随之轻重。一条律文，是狱里几百人的寒暑——你落笔很慢。",
					"descHidden": "损益秦律，垂法后世（才学不足则难为主笔）",
					"desc": "损益秦律，垂法后世（才学≥55 方能主笔）",
					"eff": {
						"attrs": {
							"zhengji": 2,
							"quanshi": 1,
							"caixue": 3,
							"weiji": 2
						},
						"dev": 0
					},
					"id": "ACT-35",
					"type": "进取"
				},
				{
					"chapters": [4, 4],
					"req": { "caifu": 3 },
					"name": "安抚楚士",
					"res": "你赦了几名旧楚士人的罪，又荐了其中的才者。南方谤声一时低了许多——获赦的老士人给你写了幅字：\"楚虽三户。\"你收下了，没有挂出来。",
					"descHidden": "怀柔故楚遗民（小有破费）",
					"desc": "怀柔故楚遗民（财富-3）",
					"eff": {
						"attrs": {
							"caifu": -3,
							"biancai": 1,
							"weiji": -1,
							"shengwang": 3
						},
						"dev": 0
					},
					"id": "ACT-36",
					"type": "兑换"
				},
				{
					"chapters": [4, 4],
					"name": "亲临战阵",
					"res": "你亲赴战阵，立马于将旗之下。流矢自耳边掠过，护军请你后撤，你没有动——这一仗的军心，要用你自己的命来稳。",
					"descHidden": "亲临战阵，血勇博威名",
					"desc": "亲临战阵，血勇博威名",
					"eff": {
						"attrs": {
							"weiji": 2,
							"wuli": 2,
							"shengwang": 1
						},
						"dev": 0
					},
					"id": "ACT-59",
					"type": "进取"
				},
				{
					"chapters": [4, 4],
					"name": "封邑驰猎",
					"res": "你在封邑纵马驰猎，獐鹿满载而归，分赐府中上下。猎场上的威风传得很远——远到咸阳的口舌里，又添了一笔。",
					"descHidden": "封邑驰猎，獐鹿入府库",
					"desc": "封邑驰猎，獐鹿入府库",
					"eff": {
						"attrs": {
							"caifu": 1,
							"weiji": 1,
							"tupo": 2
						},
						"dev": 0
					},
					"id": "ACT-60",
					"type": "守成"
				},
				{
					"chapters": [5, 5],
					"name": "联络北军",
					"res": "你的信使向北去了⟦上郡⟧——⟦蒙恬⟧的三十万大军在那里。信使回来的路上，似乎多了一顶尾巴。你吩咐再备一匹马。",
					"descHidden": "遗书上郡，通问旧部",
					"desc": "遗书上郡，通问旧部",
					"eff": {
						"zg": 5,
						"attrs": {
							"quanshi": 2,
							"weiji": 2,
							"moulue": 1
						},
						"dev": 0
					},
					"id": "ACT-37",
					"type": "进取"
				},
				{
					"chapters": [5, 5],
					"name": "密会宗室",
					"res": "行在的深夜，一位随驾的公子密访你的帷帐。⟦赵高⟧的人来问了三次——三次你都答\"叙旧\"；第四次没来，不来比来更说明问题。",
					"descHidden": "屏人夜语，预留退步",
					"desc": "屏人夜语，预留退步",
					"eff": {
						"zg": 3,
						"attrs": {
							"moulue": 1,
							"weiji": -1,
							"shengwang": 2
						},
						"dev": 0
					},
					"id": "ACT-38",
					"type": "进取"
				},
				{
					"chapters": [5, 5],
					"name": "焚稿灭迹",
					"res": "多年的奏稿手札在火盆里蜷成灰。烧掉的还有你的半生心血——以及，将来替你说话的证据。",
					"descHidden": "焚毁草稿，灭去形迹",
					"desc": "焚毁草稿，灭去形迹",
					"eff": {
						"attrs": {
							"caixue": -2,
							"weiji": -3,
							"shengwang": -3
						},
						"dev": 0
					},
					"id": "ACT-39",
					"type": "保身"
				},
				{
					"chapters": [5, 5],
					"req": { "caifu": 6 },
					"name": "收买府吏",
					"res": "⟦中车府令⟧手下的一名符玺吏收了你的金子。⟦赵高⟧的棋盘上，多了一只你的眼睛——三句话，两句是假的，你们都觉得值。",
					"descHidden": "啖以重利，间隙其党（啖以重利）",
					"desc": "啖以重利，间隙其党（财富-6）",
					"eff": {
						"zg": -4,
						"attrs": { "caifu": -6 },
						"dev": 0
					},
					"id": "ACT-40",
					"type": "保身"
				},
				{
					"chapters": [5, 5],
					"name": "装病避驾",
					"res": "你躺在行辕里\"养病\"，外面天翻地覆都与你无关。只是陛下问起居的次数，一日少过一日——病要装得像，首先得有人看。",
					"descHidden": "称疾不朝，暂避其锋",
					"desc": "称疾不朝，暂避其锋",
					"eff": {
						"attrs": {
							"junxin": -3,
							"quanshi": -2,
							"weiji": -3,
							"tupo": 1
						},
						"dev": 0
					},
					"id": "ACT-41",
					"type": "保身"
				},
				{
					"chapters": [5, 5],
					"name": "缮写密奏",
					"res": "你绕开⟦中车府令⟧的渠道，把奏章送进了行宫的寝帐。⟦赵高⟧次日看你的眼神，像看一个死棋——被人当成死棋的人，才有机会走出活步。",
					"descHidden": "别途上达，绕开掖庭",
					"desc": "别途上达，绕开掖庭",
					"eff": {
						"zg": 3,
						"attrs": {
							"junxin": 2,
							"moulue": 1
						},
						"dev": 0
					},
					"id": "ACT-42",
					"type": "进取"
				},
				{
					"chapters": [5, 5],
					"name": "变卖珍玩",
					"res": "随行的玉璧、吴绫、郢爰，一样一样换成了金饼。钱是身外物，命是自己的——留得金饼在，不怕没药吃。",
					"descHidden": "鬻玉藏金，以充行用",
					"desc": "鬻玉藏金，以充行用",
					"eff": {
						"attrs": {
							"caifu": 3,
							"shengwang": -1
						},
						"dev": 0
					},
					"id": "ACT-61",
					"type": "兑换"
				},
				{
					"chapters": [5, 5],
					"name": "强撑视事",
					"res": "你强撑病体升堂视事，批阅如常，不肯让府中看出半分松动。权柄一松手，就不知道落到谁手里了。",
					"descHidden": "扶病视事，权柄不敢松",
					"desc": "扶病视事，权柄不敢松",
					"eff": {
						"attrs": {
							"zhengji": 1,
							"quanshi": 2,
							"junxin": 1,
							"tupo": -2
						},
						"dev": 0
					},
					"id": "ACT-62",
					"type": "兑换"
				},
				{
					"chapters": [6, 6],
					"req": { "caifu": 4 },
					"name": "结交近侍",
					"res": "⟦胡亥⟧身边的几个弄臣收下了你的馈赠。陛下的笑语里，偶尔又能听见你的名字了——弄臣传话很花哨，你听着，把花哨滤掉。",
					"descHidden": "厚结左右，转圜君侧（馈赠耗财）",
					"desc": "厚结左右，转圜君侧（财富-4）",
					"eff": {
						"attrs": {
							"caifu": -4,
							"junxin": 3,
							"biancai": 1
						},
						"dev": 0
					},
					"id": "ACT-43",
					"type": "兑换"
				},
				{
					"chapters": [6, 6],
					"name": "经营密奏",
					"res": "你的奏疏不再经过中书，另有一条小径通往深宫。路走得通几次，取决于⟦赵高⟧几时发觉——你每次都换笔迹。",
					"descHidden": "别辟言路，直抵深宫",
					"desc": "别辟言路，直抵深宫",
					"eff": {
						"zg": 4,
						"attrs": {
							"junxin": 2,
							"moulue": 1
						},
						"dev": 0
					},
					"id": "ACT-44",
					"type": "进取"
				},
				{
					"chapters": [6, 6],
					"name": "转移家产",
					"res": "府中的金帛悄悄分藏到了几处别业。仓鼠存粮，不存一窟——你清点完最后一处窖藏，觉得这半生都在学这件事。",
					"descHidden": "分藏金帛，以备不虞",
					"desc": "分藏金帛，以备不虞",
					"eff": {
						"attrs": {
							"caifu": 2,
							"shengwang": -2
						},
						"dev": 0
					},
					"id": "ACT-45",
					"type": "兑换"
				},
				{
					"chapters": [6, 6],
					"req": { "caifu": 2 },
					"name": "教导李由",
					"res": "你把⟦李由⟧从⟦三川⟧的家书里择字训诫。三川守的名声传到朝中，连陛下都赞了一句\"有父风\"——训诫写了三页，末了添一行小字：戒之在得。",
					"descHidden": "课子以书，申饬官箴（微耗财帛）",
					"desc": "课子以书，申饬官箴（财富-2）",
					"eff": {
						"attrs": {
							"caifu": -2,
							"caixue": 1,
							"junxin": 1,
							"shengwang": 2
						},
						"dev": 0
					},
					"id": "ACT-46",
					"type": "兑换"
				},
				{
					"chapters": [6, 6],
					"name": "销毁书信",
					"res": "几十年的手书尺牍尽付一炬。烧到一半你停了手，抽出一封兰陵的旧信——就留这一封吧，总得有个人记得。",
					"descHidden": "焚尽往来，自断嫌隙",
					"desc": "焚尽往来，自断嫌隙",
					"eff": {
						"attrs": {
							"caixue": -1,
							"weiji": -3,
							"shengwang": -3
						},
						"dev": 0
					},
					"id": "ACT-47",
					"type": "保身"
				},
				{
					"chapters": [6, 6],
					"name": "上疏谏阻",
					"res": "你上书谏止⟦阿房宫⟧之役。疏入不报，士林传诵——传诵你的士人不知道，你在夜里把疏稿又读了一遍，读给十年前那个敢说话的自己听。",
					"descHidden": "逆鳞极谏，以直博名",
					"desc": "逆鳞极谏，以直博名",
					"eff": {
						"zg": 3,
						"attrs": {
							"biancai": 1,
							"junxin": -4,
							"shengwang": 3
						},
						"dev": 0
					},
					"id": "ACT-48",
					"type": "进取"
				},
				{
					"chapters": [6, 6],
					"name": "狱中导引",
					"res": "你在囹圄之中闭目导引，吐纳如常。狱卒远远看着，说这老头怪——养的是身，也是不肯认命的那口气。",
					"descHidden": "囹圄导引，养气待天时",
					"desc": "囹圄导引，养气待天时",
					"eff": {
						"attrs": {
							"weiji": 1,
							"tupo": 2
						},
						"dev": 0
					},
					"id": "ACT-63",
					"type": "守成"
				},
				{
					"chapters": [6, 6],
					"name": "老骥砺剑",
					"res": "你取出多年不用的旧剑，在狱中细细磨砺。锈磨去了，刃口还亮——狱卒听见磨刀声，只当是一个老人不肯服老。",
					"descHidden": "老骥砺剑，暮年不卸甲",
					"desc": "老骥砺剑，暮年不卸甲",
					"eff": {
						"attrs": {
							"wuli": 2,
							"weiji": 1
						},
						"dev": 0
					},
					"id": "ACT-64",
					"type": "守成"
				},
				{
					"chapters": [0, 1],
					"name": "故人贷金",
					"descHidden": "故旧登门，言断炊待援——帮或不帮、帮到几分，由你亲定",
					"choice": {
						"segs": ["故旧登门，鹑衣百结，言断炊三日、小儿病笃，欲贷五金——年少同窗，曾分你半块饼。", "那半块饼是你最早记下的人情。如今他开口要的，是你肯不肯认那笔旧账。"],
						"options": [
							{
								"t": "倾囊相济",
								"eff": {
									"attrs": {
										"caifu": -5,
										"shengwang": 3
									},
									"dev": 0
								},
								"res": "你把积储倒出大半，又添一斗米。故人叩首而去，逢人便说你的名字。"
							},
							{
								"t": "量力贷之",
								"eff": {
									"attrs": {
										"caifu": -2,
										"shengwang": 1
									},
									"dev": 0
								},
								"res": "你数出两金，立券约期，添一句“不必急还”。恰好是“厚道”的分寸。"
							},
							{
								"t": "婉言辞却",
								"eff": {
									"attrs": {
										"weiji": 1,
										"shengwang": -2
									},
									"dev": 0
								},
								"res": "你推说手中亦紧。故人笑笑，走了。夜里你对账到三更：省下的是金，省不下的是人情。"
							}
						]
					},
					"desc": "故旧登门，言断炊待援——帮或不帮、帮到几分，由你亲定",
					"id": "ACT-65",
					"type": "抉择"
				},
				{
					"chapters": [2, 5],
					"name": "门客夜谒",
					"descHidden": "有客深夜怀策求见，如何处之，皆在一念",
					"choice": {
						"segs": ["暮鼓三声，门吏来报：有客自称楚之布衣，怀策求见，名刺上只有“楚人”二字。其人衣敝履穿，目亮得逼人。", "你先看金，再看书——今夜来的不是一个人，是一道考题。"],
						"options": [
							{
								"t": "纳其金，荐其才",
								"eff": {
									"attrs": {
										"caifu": 6,
										"quanshi": 2,
										"weiji": 2
									},
									"dev": 0
								},
								"res": "金入府库，人入朝堂。来客三月之内替你解了两桩难题——只是金的来历，你没问，他也没说。"
							},
							{
								"t": "却其金，试其才",
								"eff": {
									"attrs": {
										"caixue": 2,
										"shengwang": 3
									},
									"dev": 0
								},
								"res": "你推回金囊，与他论了一夜书。天明那人长揖而去，逢人便说：丞相府的门，比别家的干净。"
							},
							{
								"t": "闭门不纳",
								"eff": {
									"attrs": {
										"weiji": -2,
										"shengwang": -2
									},
									"dev": 0
								},
								"res": "你让门吏回了话。巷间却多了句闲话：李相的门，比宫门还难进——门里的东西太贵。"
							}
						]
					},
					"desc": "有客深夜怀策求见，纳金、却金、闭门，皆在一念",
					"id": "ACT-66",
					"type": "抉择"
				},
				{
					"chapters": [0, 0],
					"name": "邻人争田",
					"descHidden": "东西两邻争一条田埂，各执一词——断或不断，都是是非",
					"choice": {
						"segs": ["东西两邻争一条田埂，闹到你门前。东邻是里正的小舅子，西邻是县丞的远亲——小小一道埂，两头都通着天。", "埂不过一脚宽，争的却是谁在乡里说了算。这一句话吐出去，收回来就难了。"],
						"options": [
							{
								"t": "秉公而断",
								"eff": {
									"attrs": {
										"weiji": 1,
										"shengwang": 2
									},
									"dev": 0
								},
								"res": "你步量旧界，依契书断埂归东邻。乡人记下了：上蔡来了个只认契书不认人的。"
							},
							{
								"t": "各退半步，埂归公用",
								"eff": {
									"attrs": {
										"weiji": -1,
										"shengwang": -1
									},
									"dev": 0
								},
								"res": "你劝两家各让半步，埂上植树为界。两家都不尽兴，却也都下了台阶。"
							},
							{
								"t": "推给里正裁断",
								"eff": {
									"attrs": {
										"shengwang": -1,
										"moulue": 1
									},
									"dev": 0
								},
								"res": "你推说不谙乡俗，把案子奉还里正。袖手旁观了一回——也被人看清了一回。"
							}
						]
					},
					"desc": "东西两邻争一条田埂，各执一词——断或不断，都是是非",
					"id": "ACT-67",
					"type": "抉择"
				},
				{
					"chapters": [1, 1],
					"name": "兰陵问学",
					"descHidden": "荀卿夜问：术与礼，何者可以治国——一答之间，已见生平",
					"choice": {
						"segs": ["兰陵学舍，荀卿讲学毕，独留你与韩非。先生问：“术与礼，何者可以治国？”韩非口吃，只笑笑看你。", "窗外雨声渐密，像在催你。这一问，问的是你们各自会走上哪条路。"],
						"options": [
							{
								"t": "对曰：礼",
								"eff": {
									"attrs": {
										"caixue": 2,
										"shengwang": 1
									},
									"dev": 0
								},
								"res": "你答：礼者，天地之序也，序立则民安。先生颔首，却补一句“礼可安邦，未必可以止争”，你记了很多年。"
							},
							{
								"t": "对曰：术",
								"eff": {
									"attrs": {
										"weiji": 1,
										"moulue": 2
									},
									"dev": 0
								},
								"res": "你答：乱世用重典，术先行而礼后至。韩非眼中一亮，先生却长久无语。多年后你才明白那沉默的分量。"
							},
							{
								"t": "对曰：礼法并施",
								"eff": {
									"attrs": {
										"moulue": 1,
										"caixue": 1,
										"tupo": -1
									},
									"dev": 0
								},
								"res": "你答：礼为体，法为用，缺一不可。先生说“锋芒磨去半分”——你心里自有计较。"
							}
						]
					},
					"desc": "荀卿夜问：术与礼，何者可以治国——一答之间，已见生平",
					"id": "ACT-68",
					"type": "抉择"
				},
				{
					"chapters": [1, 1],
					"name": "同门赌书",
					"descHidden": "韩非掷来新著《孤愤》，以一炷香为赌——接不接这一局",
					"choice": {
						"segs": ["韩非掷来新著《孤愤》：“一炷香。驳得倒，我烧稿；驳不倒，你抄十遍。”这一赌，赌的是兰陵谁的文章第一。", "你看着他的眼睛——没有恶意，只有棋逢对手的火。这个人，你要记一辈子。"],
						"options": [
							{
								"t": "欣然受赌",
								"eff": {
									"attrs": {
										"caixue": 2,
										"shengwang": 1
									},
									"dev": 0
								},
								"res": "你焚香展卷，香尽时指出三处破绽。韩非大笑烧稿，又连夜重写。此后没人再把你当寻常弟子。"
							},
							{
								"t": "推辞不受，转而论学",
								"eff": {
									"attrs": {
										"caixue": 1,
										"moulue": 1
									},
									"dev": 0
								},
								"res": "你笑道：“文章憎命达，赌它做甚。”拉他改论“说难”。韩非后来著《说难》，开篇像是从那晚论起的。"
							},
							{
								"t": "借故离去",
								"eff": {
									"attrs": {
										"shengwang": -1,
										"tupo": 1
									},
									"dev": 0
								},
								"res": "你推说要去抄简，抽身走了，身后笑声一片。你握着笔，半天没有落下去。"
							}
						]
					},
					"desc": "韩非掷来新著《孤愤》，以一炷香为赌——接不接这一局",
					"id": "ACT-69",
					"type": "抉择"
				},
				{
					"chapters": [2, 2],
					"name": "吕门站队",
					"descHidden": "文信侯与长信侯同日设宴，两份请柬并排躺在案上",
					"choice": {
						"segs": ["文信侯吕不韦与长信侯嫪毐同日设宴，两份请柬并排躺在案上——满城都在看你先迈进哪一扇门。", "咸阳的水有多深，这两份请柬就是多深。今夜踏进哪扇门，明日咸阳就把你归进哪一边。"],
						"options": [
							{
								"t": "赴吕府之宴",
								"eff": {
									"attrs": {
										"weiji": 2,
										"quanshi": 2
									},
									"dev": 0
								},
								"res": "你登文信侯之门。吕不韦亲执你的手，引你遍见三千门客。另一扇门，从此对你关了一半。"
							},
							{
								"t": "赴嫪府之宴",
								"eff": {
									"attrs": {
										"caifu": 5,
										"weiji": 3,
										"junxin": -2
									},
									"dev": 0
								},
								"res": "你登长信侯之门。嫪毐出手豪阔，席间赠金五十——你把它锁进箱子最深处，钱是热的，手是烫的。"
							},
							{
								"t": "称病两不相赴",
								"eff": {
									"attrs": {
										"quanshi": -1,
										"weiji": -2,
										"shengwang": -1
									},
									"dev": 0
								},
								"res": "你称病三日，闭门谢客。两边都没得罪，两边也都没记住你。请柬并排收进匣底，像两枚未落的子。"
							}
						]
					},
					"desc": "文信侯与长信侯同日设宴，两份请柬并排躺在案上",
					"id": "ACT-70",
					"type": "抉择"
				},
				{
					"chapters": [2, 3],
					"name": "郑国渠议",
					"descHidden": "逐客之议汹汹，联名书寻到你门前——签与不签，皆在你",
					"choice": {
						"segs": ["郑国渠案发，宗室群起而攻，言诸侯来客皆为其主游间，当尽逐之。有人持联名书寻到你门前——前头已落了几十个咸阳熟面孔的名字。", "你是楚人，亦在“客”列。签了，是递投名状；不签，明日榜上或许就有你。"],
						"options": [
							{
								"t": "联名请逐",
								"eff": {
									"attrs": {
										"zhengji": -2,
										"weiji": 1,
										"shengwang": 1
									},
									"dev": 0
								},
								"res": "你提笔签了名。宗室颔首，同僚侧目。回府后独坐良久，把“苟全”二字嚼碎咽下。"
							},
							{
								"t": "力保渠工，独言逐客之非",
								"eff": {
									"attrs": {
										"zhengji": 3,
										"weiji": 2
									},
									"dev": 0
								},
								"res": "你抗言：渠成则关中富，逐客则天下士裹足。宗室目光冷了下来，秦王看你的目光，第一次有了温度。"
							},
							{
								"t": "不置可否",
								"eff": {
									"attrs": {
										"weiji": -1,
										"moulue": 1
									},
									"dev": 0
								},
								"res": "你称“容某三思”，把联名书压案下三日。三日后风头过去，书也没签，人也没伤——只是再没人把机密先讲给你听。"
							}
						]
					},
					"desc": "逐客之议汹汹，联名书寻到你门前——签与不签，皆在你",
					"id": "ACT-71",
					"type": "抉择"
				},
				{
					"chapters": [3, 3],
					"name": "宗室结姻",
					"descHidden": "宗室遣媒登门，愿以族中女妻你长子——是梯子，也是绳子",
					"choice": {
						"segs": ["宗室元老遣媒登门，愿以族中女妻你长子。满府欢喜，你独不语——这亲事是梯子，也是绳子，上了船就由不得你了。", "你站在廊下，看儿子在院里练字。他的笔还拿不稳，却已有人来谈他的婚事。"],
						"options": [
							{
								"t": "应下这门亲",
								"eff": {
									"attrs": {
										"caifu": -3,
										"quanshi": 3,
										"weiji": -2
									},
									"dev": 0
								},
								"res": "你纳币下聘，府门张灯。门楣从此进了咸阳的谱牒——谱牒也是账册，一笔一笔，都是要还的。"
							},
							{
								"t": "婉言辞却",
								"eff": {
									"attrs": {
										"weiji": 1,
										"shengwang": 1
									},
									"dev": 0
								},
								"res": "你以“犬子年幼，恐误佳女”婉辞。不攀这门亲，咸阳的明枪暗箭，你得一个人接。"
							},
							{
								"t": "拖延不答",
								"eff": {
									"attrs": {
										"weiji": 1,
										"moulue": 2
									},
									"dev": 0
								},
								"res": "你一面厚待媒人，一面把婚期往远处推。余地留住了，媒人看你的眼神却凉了——那笔利息迟早要付。"
							}
						]
					},
					"desc": "宗室遣媒登门，愿以族中女妻你长子——是梯子，也是绳子",
					"id": "ACT-72",
					"type": "抉择"
				},
				{
					"chapters": [4, 4],
					"name": "儒生藏诗",
					"descHidden": "焚书令下，旧识深夜叩门，怀中抱着半部《诗》",
					"choice": {
						"segs": ["焚书令下第三日，旧识深夜叩门，怀中抱着半部《诗》——那是兰陵抄的底本，纸页泛黄。他只求藏一夜，天明出城。", "你掌着帝国的法令，也掌着故人的性命。那半部《诗》他抱得很紧，像抱着自己的孩子。"],
						"options": [
							{
								"t": "纵其出城",
								"eff": {
									"attrs": {
										"weiji": 3,
										"shengwang": 2
									},
									"dev": 0
								},
								"res": "你开了角门，看他消失在巷尾。那半部《诗》活着出城了，你心里的某样东西，也跟着出城了。"
							},
							{
								"t": "当面焚书，放其生路",
								"eff": {
									"attrs": {
										"zhengji": 1,
										"weiji": -1,
										"shengwang": -2
									},
									"dev": 0
								},
								"res": "你取火当庭焚书，灰烬未冷，低声道：“书已没了，你走吧。”法令无损，故人无损——损的是你们之间最后一点旧。"
							},
							{
								"t": "缚送廷尉",
								"eff": {
									"attrs": {
										"weiji": -2,
										"junxin": 2,
										"shengwang": -3
									},
									"dev": 0
								},
								"res": "你喝令家仆拿人，亲自押送廷尉府。旧识被带走时没有回头——你后来夜夜梦见那个背影。"
							}
						]
					},
					"desc": "焚书令下，旧识深夜叩门，怀中抱着半部《诗》",
					"id": "ACT-73",
					"type": "抉择"
				},
				{
					"chapters": [4, 5],
					"name": "刻石之争",
					"descHidden": "东巡刻石，功烈稿与德政稿同呈案头——石上的字比人活得久",
					"choice": {
						"segs": ["东巡至名山，皇帝命刻石颂德。博士拟了两稿：一稿铺陈武功，一稿盛赞德政——石头上的字，比写的人活得久。", "一卷字字带金石声，一卷句句藏春雨意。可石头只认一刀，只能刻一种。"],
						"options": [
							{
								"t": "取功烈之稿",
								"eff": {
									"attrs": {
										"junxin": 2,
										"shengwang": -1
									},
									"dev": 0
								},
								"res": "你取功烈稿。皇帝读罢大悦，亲定刊石。只有你听见老博士轻轻叹了口气。"
							},
							{
								"t": "取德政之稿",
								"eff": {
									"attrs": {
										"junxin": -1,
										"shengwang": 2
									},
									"dev": 0
								},
								"res": "你取德政稿。皇帝淡淡说了句“亦可”。刻石立起来那天，百姓围着看，皇帝没有来看。"
							},
							{
								"t": "两稿并呈，请上亲裁",
								"eff": {
									"attrs": { "moulue": 1 },
									"dev": 0
								},
								"res": "你把两稿都呈上去，皇帝各取数句，合成一篇——石头上的字于是谁也不能独揽。"
							}
						]
					},
					"desc": "东巡刻石，功烈稿与德政稿同呈案头——石上的字比人活得久",
					"id": "ACT-74",
					"type": "抉择"
				},
				{
					"chapters": [5, 5],
					"name": "赵高赠璧",
					"descHidden": "中车府令遣使赠白璧一双——璧色无暇，来历浑浊",
					"choice": {
						"segs": ["中车府令赵高遣使赠白璧一双，说是“久慕丞相，聊表寸心”。璧色无暇，来历却浑浊——这双璧不是礼，是钩子。", "你看着那双璧，又看了看使者——他在等你的手，伸向盒子还是缩回去。"],
						"options": [
							{
								"t": "受璧结好",
								"eff": {
									"attrs": {
										"caifu": 6,
										"weiji": 3
									},
									"dev": 0
								},
								"res": "你收了璧，回赠吴绫十匹。璧进了内库，钩子进了肉里。夜里再看那双璧，怎么端详，都像在看你。"
							},
							{
								"t": "璧还，话留下",
								"eff": {
									"attrs": {
										"weiji": 1,
										"moulue": 1
									},
									"dev": 0
								},
								"res": "你把璧原样奉还，只留一句：“共事一主，何礼之有。”赵高沉默了很久——这一局，你没输，也没赢。"
							},
							{
								"t": "掷璧逐使",
								"eff": {
									"attrs": {
										"weiji": 2,
										"shengwang": 2
									},
									"dev": 0
								},
								"res": "你当着使者的面把璧推下案。满朝称快——只有你知道，有一双眼睛再不会离开你的后背。"
							}
						]
					},
					"desc": "中车府令遣使赠白璧一双——璧色无暇，来历浑浊",
					"id": "ACT-75",
					"type": "抉择"
				},
				{
					"chapters": [6, 6],
					"name": "狱卒密语",
					"descHidden": "老狱卒凑近栅门：五十金，替你传一封家书入宫——是生机还是饵",
					"choice": {
						"segs": ["狱中第三夜，老狱卒凑近栅门，压着嗓子：“五十金，我替你传一封家书入宫。”这可能是唯一的生机，也可能是赵高撒的饵。", "家书能写什么？写冤，写功，还是写那个回不去的上蔡？你竟不知道想对家人说什么。"],
						"options": [
							{
								"t": "倾资托书",
								"eff": {
									"attrs": {
										"caifu": -8,
										"weiji": 2
									},
									"dev": 0
								},
								"res": "你解下贴身玉珏又凑足金数，把家书塞进他手里。书有没有到宫里，你永远不知道——狱卒第二天就换了人。"
							},
							{
								"t": "严词拒绝",
								"eff": {
									"attrs": {
										"weiji": -1,
										"tupo": -1
									},
									"dev": 0
								},
								"res": "你隔着栅栏只说了四个字：“我无罪，何须书。”骨气是保住了，可骨气换不来开门。"
							},
							{
								"t": "假意应承，探其虚实",
								"eff": {
									"attrs": {
										"weiji": 1,
										"moulue": 2
									},
									"dev": 0
								},
								"res": "你满口应下，只说金在府中。狱卒眼底的喜色藏不住，多答了三句话——你听出了是谁让他来的。"
							}
						]
					},
					"desc": "老狱卒凑近栅门：五十金，替你传一封家书入宫——是生机还是饵",
					"id": "ACT-76",
					"type": "抉择"
				}
			],
			"GLOSSARY": {
				"上蔡": "楚国之县，今河南上蔡西南，李斯故里。其东城门外多旷野，即他临终念念不忘、牵犬逐兔之处。一部李斯传，起于上蔡的粮仓，终于上蔡的东门。",
				"荀卿": "荀子，名况，赵人，战国末儒学宗师。主“性恶”，倡“隆礼重法”，两度为楚兰陵令，著书授徒，死后葬于兰陵。李斯、韩非皆出其门——儒门之内，走出了法家的两座高峰。",
				"兰陵": "楚县，今山东兰陵县。荀子晚年居此著书授徒，死后亦葬于此。乱世之中，这座小城的学舍，一度是天下文章的源头。",
				"韩非": "韩国诸公子，荀子弟子，口吃而善著书，集法家之大成。著《韩非子》五十五篇，秦王读之叹曰“死不恨矣”。使秦被谮下狱，仰药而死——书在秦国，人在狱中。",
				"嬴政": "秦王政，史称秦始皇。十三岁立为秦王，二十二岁亲政，三十九岁并天下，称始皇帝。前210年崩于沙丘平台——他留下的帝国与遗诏，同在一辆车上。",
				"陈胜": "阳城人，字涉，雇农出身。前209年与吴广率九百戍卒于大泽乡起义，首倡反秦，建号“张楚”。“王侯将相宁有种乎”一语，自此悬于千古。",
				"春申君": "黄歇，楚考烈王相，战国四公子之一，门下食客三千。曾辅太子完归国即位，执楚政二十余年。前238年为李园伏甲刺杀于棘门，满门被诛。",
				"吕不韦": "濮阳大贾，以“奇货可居”立子楚，位至秦相邦，号仲父。集门客著《吕氏春秋》，悬金求瑕，权倾一时。后受嫪毐事连，罢相就国，终饮鸩自尽。",
				"吕氏春秋": "吕不韦集门客所编杂家巨著，兼采百家，分八览、六论、十二纪。书成悬于咸阳市门，扬言“能增损一字者予千金”。无人敢改——非不能也，是不敢也。",
				"嫪毐": "假宦官，吕不韦所进，与秦太后私通，封长信侯，权势几与相邦相埒。前238年盗玺作乱，兵败，车裂灭族。他的叛乱，成了秦王亲政的祭旗。",
				"长史": "秦官，丞相及将军府属官之长，掌机要文书，类后世之秘书长。李斯任此，始得预谋灭六国之事。官阶不高，离枢机极近。",
				"郑国": "韩国水工（水利工程师）。韩桓王遣其入秦凿渠，欲以工程疲敝秦国，史称“疲秦计”。渠成反使关中成沃野，溉田四万余顷，名郑国渠——弱国之谋，反成强秦之本。",
				"逐客令": "前237年，秦宗室借郑国案，请逐一切六国客卿。李斯亦在逐中，乃于出关途中上书力谏，令遂废。一道逐客令，险些逐走了秦国的天下。",
				"谏逐客书": "李斯谏阻逐客之奏章，以“泰山不让土壤”“河海不择细流”为喻，历数客卿之功，历代推为奏议名篇。秦王读罢，即刻收回成命——一纸之力，重于千疏。",
				"廷尉": "秦九卿之一，掌刑辟，全国最高司法官。李斯谏逐客成功后迁此职。掌天下之法的官署，日后也成了囚禁他本人的地方。",
				"郡县": "郡县制：地方政权直辖于中央，长官由皇帝任免，不得世袭。秦以三十六郡行于天下，为后世两千年定制。廷议之上，李斯一言而定。",
				"仓颉篇": "李斯所作识字课本，以标准小篆书写，颁行天下为文字范本，与《爰历》《博学》并称“三仓”。秦人开蒙，先学斯字。",
				"小篆": "秦统一后颁行的标准字体，省改大篆而成，笔画匀圆整饬，传为李斯手定。六国文字自此一统——笔顺里，藏着帝国的秩序。",
				"焚书": "前213年，李斯奏请：非秦记皆烧，民间《诗》《书》百家语悉烧，医药、卜筮、种树之书不烧。令下三十日不烧者，黥为城旦。咸阳之灰，落了两千年。",
				"坑儒": "前212年，方士侯生、卢生逃亡，始皇怒，坑杀犯禁诸生四百六十余人于咸阳。长子扶苏谏阻不听，反被远谪上郡——一坑之土，埋掉的还有父子之情。",
				"扶苏": "始皇长子，刚毅而仁，数直谏。因谏坑儒触怒始皇，北监蒙恬军。沙丘之变，被矫诏赐死，泣而自裁。他若即位，秦的历史或许是另一个写法。",
				"蒙恬": "秦名将，将三十万众北逐匈奴，主持修筑长城，威振塞外。赵高矫诏，囚于阳周，吞药自杀。临死自陈筑长城挖断地脉之罪——名将之死，死得像个隐喻。",
				"赵高": "宦官，通狱法，为中车府令，教胡亥决狱。沙丘之变主谋，指鹿为马，后逼杀二世，立子婴，反为子婴所诛。他一生精研秦律，最后死在秦律之下。",
				"中车府令": "掌皇帝乘舆车马之官，随驾左右，职卑而近。赵高以此职得兼行符玺事，遗诏遂出其手。帝国的方向盘，曾握在一个管车的人手里。",
				"沙丘": "沙丘平台，今河北广宗西北。纣王建酒池肉林于此，赵武灵王饿死于此，始皇亦崩于此——史家视为不祥之地。平台之上，三次改写天下。",
				"胡亥": "始皇第十八子，从赵高学狱法。沙丘之变被立为二世皇帝，在位三年，大杀宗室功臣，终为赵高所弑。他登基时二十一岁，死时二十四岁。",
				"三族": "父族、母族、妻族（一说父母、兄弟、妻子）。秦法，谋反大逆者夷三族。一人之罪，株连满门——李斯亲定的法度，最后落在了他自己头上。",
				"五刑": "具五刑：黥面、劓鼻、斩左右趾、笞杀、枭首，秦刑之最重者。李斯临刑，一项不免。法家集大成者，亲身验证了自己参与编写的全部程序。",
				"督责": "法家术治术语：君主督察责罚臣下，使群臣不敢不竭能尽忠。李斯上《行督责之术书》以悦二世。书一上，税民深者为明吏，杀人众者为忠臣。",
				"大泽乡": "蕲县地名，今安徽宿州东南。前209年，陈胜、吴广率九百戍卒在此起义，天下响应。大泽乡的一场雨，浇灭了一个帝国。",
				"函谷关": "秦之东门，今河南灵宝东北。一夫当关，万夫莫开。士人入秦建功、客卿被逐还乡，皆从此过。一出一入之间，是两种人生。",
				"什伍": "秦制，民户五家为伍、十家为什，互相纠察连坐；军中亦然。与耕战、首功相配，构成秦国这架战争机器。邻里有罪不告者同罪——人人是网中的一结。",
				"王翦": "秦第一名将，灭赵、燕、楚，与子王贲并灭魏、齐。功成请老，得以善终——与白起之死、李斯之族成对照。将兵者知进退，执政者未必。",
				"姚贾": "魏国人，仕秦为上卿，曾以资游说列国，深得秦王信用。史载韩非之死，李斯与姚贾同构其陷：“非终为韩，不为秦。”",
				"李园": "赵人，春申君门客。以女弟进于春申君、转献楚王，所生子立为楚太子。后伏甲刺杀春申君灭口，专楚国之政。",
				"周青臣": "秦仆射。咸阳宫宴上颂扬郡县、面谀始皇，引出淳于越的反驳，遂有焚书之议。一席颂词，无意中做了千古公案的引信。",
				"淳于越": "齐人，秦博士。咸阳宫宴上力主“事不师古而能长久者，非所闻也”，一言触发焚书之议。他要说的是封建，点燃的是竹简。",
				"上郡": "秦北边郡，今陕西榆林一带。蒙恬将三十万军屯此，扶苏监军于此——帝国最后的兵权所在。沙丘之变后，这里的沉默决定了一切。",
				"阳周": "县名，今陕西子长西北。蒙恬不肯就伪诏之死，囚系于此，终吞药自尽。一代名将，死在没有城墙的囚室里。",
				"度量衡": "度（长短）、量（容积）、衡（重量）。秦颁标准器于天下，诏版刻始皇诏书，市场官府一律同准。尺、斗、秤三物，把“统一”二字量进了日常。",
				"驰道": "秦统一后修筑的国家级干道网，以咸阳为中心辐辏四方，“东穷燕齐，南极吴楚”，道广五十步。用兵与巡幸皆便——帝国的血管，也是征夫的坟路。",
				"三川": "秦郡，治雒阳（今河南洛阳东），地当天下之中。李斯长子李由为三川守；陈胜过境而李由不击，遂成赵高构陷的由头。",
				"李由": "李斯长子，娶秦公主，官三川守。陈胜过三川而城守不击，被赵高构为通敌，与父同日就刑。李氏满门的荣华，始于联姻，终于连坐。",
				"阿房宫": "始皇晚年营建的新宫，前殿未竟而秦亡。遗址在今西安西郊；“阿房”的读音与得名，史家至今争论。项羽一把火，烧了三个月。",
				"会稽": "秦郡，治吴（今江苏苏州），辖地南至浙闽。山深林密，正是藏名匿迹的好去处。后来项梁、项羽起兵，亦在此郡。",
				"鲍鱼": "盐渍鱼干，其气腥臭。始皇崩于沙丘，秘不发丧，车载鲍鱼以乱尸臭——鲍鱼之车，遂成千古掩匿的代名词。一车腥气，掩住的是天下的巨变。"
			}
		};
	}));
	//#endregion
	//#region ../prot/lua-data/jingke.json
	var require_jingke = /* @__PURE__ */ __commonJSMin(((exports, module) => {
		module.exports = {
			"ATTRS": [
				{
					"k": "tupo",
					"n": "体魄",
					"words": [
						[80, "龙精虎猛"],
						[55, "筋骨强健"],
						[25, "尚可劳碌"],
						[0, "形销体弱"]
					]
				},
				{
					"k": "wuli",
					"n": "武力",
					"words": [
						[80, "万夫不当"],
						[55, "骁勇善战"],
						[25, "习得武艺"],
						[0, "手无缚鸡"]
					]
				},
				{
					"k": "caixue",
					"n": "文才",
					"words": [
						[75, "剑胆琴心"],
						[55, "文武兼资"],
						[35, "剑书两熟"],
						[0, "略通剑书"]
					]
				},
				{
					"k": "moulue",
					"n": "谋略",
					"words": [
						[80, "算无遗策"],
						[55, "深谋远虑"],
						[25, "粗通权变"],
						[0, "不谙机心"]
					]
				},
				{
					"k": "biancai",
					"n": "辩才",
					"words": [
						[80, "舌动九州"],
						[55, "口若悬河"],
						[25, "能言善对"],
						[0, "拙于言辞"]
					]
				},
				{
					"k": "caifu",
					"n": "财富",
					"words": [
						[70, "一掷万金"],
						[40, "行囊丰足"],
						[15, "川资尚可"],
						[0, "囊中羞涩"]
					]
				},
				{
					"k": "shengwang",
					"n": "名声",
					"words": [
						[80, "名震列国"],
						[50, "侠名远播"],
						[25, "小有侠名"],
						[0, "默默无闻"]
					]
				},
				{
					"k": "quanshi",
					"n": "权势",
					"words": [
						[80, "手眼通天"],
						[50, "门路纵横"],
						[25, "小有奥援"],
						[0, "孤身一人"]
					]
				},
				{
					"k": "zhengji",
					"n": "政绩",
					"words": [
						[80, "功盖当世"],
						[55, "政绩斐然"],
						[25, "小有建树"],
						[0, "寸功未立"]
					]
				},
				{
					"k": "junxin",
					"n": "君心",
					"words": [
						[70, "推心置腹"],
						[45, "青眼有加"],
						[20, "泛泛之交"],
						[0, "疑窦暗生"]
					]
				},
				{
					"k": "weiji",
					"n": "危机",
					"words": [
						[90, "命悬一线"],
						[70, "风声鹤唳"],
						[40, "暗流涌动"],
						[0, "岁月静好"]
					],
					"inverse": true
				}
			],
			"ATTR_NAMES": {
				"tupo": "体魄",
				"wuli": "武力",
				"caixue": "文才",
				"moulue": "谋略",
				"biancai": "辩才",
				"caifu": "财富",
				"shengwang": "名声",
				"quanshi": "权势",
				"zhengji": "政绩",
				"junxin": "君心",
				"weiji": "危机"
			},
			"INIT": {
				"tupo": 45,
				"wuli": 55,
				"caixue": 45,
				"moulue": 30,
				"biancai": 35,
				"caifu": 20,
				"shengwang": 25,
				"quanshi": 5,
				"zhengji": 0,
				"junxin": 10,
				"weiji": 10
			},
			"AGE": {
				"init": 30,
				"bands": [
					[32, 0],
					[35, -1],
					[37, -2],
					[200, -3]
				],
				"longevity": [[50, 1], [60, 2]]
			},
			"ILLNESS": {
				"cost": 3,
				"heal": 5,
				"onsetTupo": 5,
				"onsetWeiji": 3,
				"drainTupo": 2,
				"drainWeiji": 2,
				"death": {
					"ending": "E8",
					"variant": "baobing"
				}
			},
			"ACTION_RULES": { "diminish": false },
			"DIFFICULTY": {
				"story": {
					"n": "剧情",
					"wj": .6,
					"corr": .5,
					"coef": .8,
					"backtrack": -1,
					"lethal": false,
					"hideAttrs": false,
					"desc": "数值全可见，无限回溯，危机增长放缓，不会致死"
				},
				"normal": {
					"n": "普通",
					"wj": 1,
					"corr": 1,
					"coef": 1,
					"backtrack": 1,
					"lethal": true,
					"hideAttrs": false,
					"desc": "标准体验，每章可回溯一次"
				},
				"hardcore": {
					"n": "硬核",
					"wj": 1.2,
					"corr": 1.3,
					"coef": 1.25,
					"backtrack": 0,
					"lethal": true,
					"hideAttrs": true,
					"desc": "危机×1.2，无回溯，属性仅以状态词显示"
				}
			},
			"SCENARIO": {
				"id": "jingke",
				"name": "荆轲 · 图穷之局",
				"sub": "风萧萧兮易水寒",
				"era": "约前 232 — 前 227",
				"protag": "荆轲",
				"desc": "一个明知必死的人。这一次，把「必败」改写成另一种赢法。",
				"recommend": "进阶向（节奏短而烈，建议先通李斯本）"
			},
			"HIDDEN": {
				"init": 20,
				"name": "秦王戒心",
				"showFrom": 3,
				"words": [
					[70, "天威莫测"],
					[50, "警跸森严"],
					[30, "似有察觉"],
					[0, "不以为意"]
				]
			},
			"MERIT_MAP": {
				"燕使": 8,
				"函图": 10,
				"咸阳": 12,
				"刺秦": 25,
				"斥秦": 18
			},
			"PERSIST": { "junxinFrom": 2 },
			"DEV_BANDS": [
				{
					"max": 20,
					"name": "循史",
					"color": "#7fa8a0"
				},
				{
					"max": 45,
					"name": "微澜",
					"color": "#c9a959"
				},
				{
					"max": 70,
					"name": "改流",
					"color": "#c97a3a"
				},
				{
					"max": 100,
					"name": "逆天",
					"color": "#b0432f"
				}
			],
			"ENDINGS": {
				"E1": {
					"name": "图穷匕见",
					"seal": "循史",
					"cuncun": 45,
					"nitian": false,
					"devMax": 45,
					"ach": ["tuxiong"],
					"zhuan": "太史公曰：轲以匹夫之勇，提一匕首入不测之强秦，其所挟持者大，而其志愈皎然也。易水一歌，白衣皆泣，非知其必往而不返哉？往矣。图穷而匕见，揕胸不中，遂倚柱而笑，箕踞而骂，虽死而天下震。惜乎其剑术疏也！然世多言轲刺秦王不成而短之，吾独曰：当其时，一人之躯，系天下之势矣。",
					"variants": {
						"shangqin": {
							"name": "伤秦",
							"zhuan": "太史公曰：轲逐王于柱，王环而走，群臣失色。轲卒断王袖，剑及王体，创之。然卫者麇至，轲知不免，倚柱笑骂，意气自若。或曰：是轲伤秦王也。余考其事，王创甚浅，旬日而愈——虽创之，无改于秦之并吞，而轲之名，反以此益烈焉。",
							"brief": "断袖伤王，然创浅旬日而愈，秦并天下如故"
						},
						"tongzhu": {
							"name": "铜柱",
							"zhuan": "太史公曰：轲穷，以匕首掷王，中铜柱，火星迸焉。左右既前，轲被八创，犹笑骂不绝。夫以一人敌一国，虽败，其气可吞也。后之览者，至铜柱之下，犹闻金铁之声。",
							"brief": "飞匕中铜柱火星迸溅，身被八创而笑骂不绝"
						}
					},
					"brief": "匕首掷出未中，身被八创，犹倚柱笑骂而亡"
				},
				"E2": {
					"name": "易水未寒",
					"seal": "苟活",
					"cuncun": 100,
					"nitian": false,
					"ach": ["weihan"],
					"zhuan": "太史公曰：轲闻命而三辞，终不入秦。或讥其怯，或谅其智。后五年，秦破蓟城，太子丹死衍水，而轲方与鲁句践博于邯郸，闻之，覆枰长叹，终身不复言燕事。易水自寒，不沾客衣。",
					"variants": { "jiuke": {
						"name": "邯郸棋客",
						"zhuan": "太史公曰：邯郸有棋客荆氏者，善剑而不试，善谋而不售。与鲁句践博，争道则笑，复局则和。燕使三至，不为动。及闻易水之事，客默然数日，终其身，不西向而坐。",
						"brief": "邯郸隐为棋客，善剑不试善谋不售，终身不西向而坐"
					} },
					"brief": "闻命三辞终不西入，蓟城破后覆枰长叹，不复言燕"
				},
				"E3": {
					"name": "不辱使节",
					"seal": "苟活",
					"cuncun": 70,
					"nitian": false,
					"zhuan": "太史公曰：轲奉图入秦，至咸阳而不发，伏阙称臣，归报太子。燕人皆骂之，轲曰：吾全燕使节，亦全吾首领，恶名一身当之，易水万骨轻之。后燕亡，轲不知所终。",
					"variants": { "nengli": {
						"name": "能吏归燕",
						"zhuan": "太史公曰：轲自咸阳归，燕人初骂之。及廷议，轲出使秦录目、督造之籍、退守之策，一一陈于殿上——太子丹始知：此人不徒有死志，亦有吏才。遂留为客卿，赞燕廷机务。后燕亡，轲挟其籍入辽东，不知所终。太史公曰：轲之不死，非怯也——其材未尽于匕首，而尽于简册。",
						"brief": "归燕初遭众骂，廷议一一陈籍策，遂以吏才留为客卿"
					} },
					"brief": "奉图入秦而不发，伏阙称臣，恶名一身当之而归"
				},
				"E4": {
					"name": "曹沫之约",
					"seal": "稳健",
					"cuncun": 85,
					"nitian": false,
					"ach": ["caomo"],
					"zhuan": "太史公曰：轲把王袖而不刺，劫之曰：尽归诸侯侵地，则生王；不然，同死。王许之，轲乃掷匕下殿，徐出。秦廷无人敢追者，威之所慑也。后秦果背约伐燕，然燕得一年之缮，人多徙而军多备。昔曹沫劫齐桓，轲今劫秦政——春秋之义，几绝而复续，虽秦人不能轻之矣。",
					"brief": "劫王以归诸侯侵地，掷匕徐出，为燕争得一年之备"
				},
				"E5": {
					"name": "拂袖出秦",
					"seal": "稳健",
					"cuncun": 90,
					"nitian": false,
					"ach": ["fuyi"],
					"zhuan": "太史公曰：轲至秦廷，察事不可为，掷图于地，仰天大笑，斥秦王之暴，拂衣竟出。秦王欲杀之，左右谏曰：杀燕使，绝诸侯望。轲竟得脱，归燕而太子东走。或曰：轲于殿上知死，亦知所以不死——侠者之勇，进固勇，退亦勇也。",
					"brief": "察事不可为，掷图斥秦拂衣竟出，全身而归"
				},
				"E6": {
					"name": "咸阳一击",
					"seal": "逆天",
					"cuncun": 85,
					"nitian": true,
					"devMin": 46,
					"ach": ["yiji"],
					"zhuan": "太史公曰：前227年，燕使献图，图穷匕见，遂中秦王政胸，王毙于九宾之殿。轲亦立碎于卫士。是岁，秦廷大乱，公子争立，王翦束手，六国遗种复纵。向使轲不中，十年而秦并天下；轲既中，天下之势，谁复知之！一人之匕首，而两世之枢机，悲夫，壮夫！",
					"brief": "匕首中胸秦王毙于九宾之殿，轲立碎，天下之势复变"
				},
				"E7": {
					"name": "七创全身",
					"seal": "逆天",
					"cuncun": 70,
					"nitian": true,
					"devMin": 46,
					"ach": ["qichuang"],
					"zhuan": "太史公曰：轲与渐离俱入秦廷，筑声裂柱，匕光及王，秦政毙，咸阳哗。轲身被七创，犹夺门而出，浮渭而东，竟归燕。后秦虽复仇拔蓟，而轲已老于辽东，岁向易水而祭田光。一生一死两相偿：以创易命，以命易史。",
					"brief": "与渐离同入秦廷毙秦政，身被七创，夺门浮渭归燕"
				},
				"E8": {
					"name": "功败垂成",
					"seal": "败局",
					"cuncun": 10,
					"nitian": false,
					"zhuan": "太史公曰：轲之志大矣，而势为之敌。或执于殿阶，或殁于易水，事未举而形已露。侠者之重诺也，轻死生；而天下之向一也，岂一人所能回。易水汤汤，犹记歌声。",
					"variants": {
						"shangdian": {
							"name": "上殿之变",
							"zhuan": "太史公曰：舞阳捧图，色变于丹墀之下，群臣目之，秦吏即起而执。图未展，匕未见，轲仰天长叹，就缚受戮。谋事在人，成事在器，亦在人哉。",
							"brief": "舞阳色变于丹墀，图未展匕未见，就缚受戮"
						},
						"yishui": {
							"name": "易水截杀",
							"zhuan": "太史公曰：轲未渡易水，秦谍夜发，围于野寺。剑出匣而围合，力竭被擒，槛车西去，无复歌者。秦之耳目，先燕之白衣三日矣。",
							"brief": "未渡易水而秦谍夜发，力竭被擒，槛车西去"
						},
						"yaonang": {
							"name": "药囊之厄",
							"zhuan": "太史公曰：轲逐王不及，御医夏无且以药囊掷之，轲一挫之间，王剑已及。微此一击，秦政其殆乎！或曰天命，或曰人事——轲死而笑骂不绝，亦人杰矣。",
							"brief": "逐王之际药囊一掷，挫步之间王剑已及"
						},
						"baobing": {
							"name": "病殁客舍",
							"zhuan": "太史公曰：轲既许燕丹，函首与图俱备，行有日矣。客舍夜半，轲忽染沉疴，寒热交作，药石不进，数日而殁于易水之西。太子丹素服往哭，刺秦之议遂寝。后五年，秦兵拔蓟，燕王喜亡走辽东——终无一人提匕首入咸阳者。易水依旧寒，不送白衣，送一棺。",
							"brief": "临行忽染沉疴，殁于易水之西，刺秦之议遂寝"
						},
						"cike": {
							"name": "事败身死",
							"zhuan": "太史公曰：事机既泄，秦吏夜围馆舍。轲拔剑独战巷陌，所杀十余人，力竭，死于乱刃之下。悬首咸阳门，榜曰燕谍。图未穷，匕未见——然咸阳宫之股栗，已先见于丹墀矣。自是六国之客过秦廷者，皆以目语。",
							"brief": "事机既泄秦吏夜围，独战巷陌力竭，悬首咸阳门"
						},
						"zuzhu": {
							"name": "赤族之诏",
							"zhuan": "太史公曰：秦王之心，积疑如积薪。轲之名三至御前，事未发而王已不能安枕。及缇骑四合，诏下：燕谍荆轲，罪及三族——卫之庆氏，老幼尽于市。匕首未出鞘，先断送了一族人的性命。易水之人闻之，不敢歌，歌则有泣。高渐离毁筑亡去，筑声绝于燕市者三年。",
							"brief": "事未发而缇骑四合，三族尽于市，筑声绝于燕市"
						}
					},
					"brief": "志大而势为敌，事未举形已露，易水犹记歌声"
				}
			},
			"CHAPTERS": [
				{
					"id": "c0",
					"title": "序章 ｜ 剑与棋",
					"sub": "教学章 · 卫—榆次—邯郸",
					"age": 30,
					"summaryNotes": [
						"【教学】上方十一维是你的命数。危机涨满之日，便是秦狱吏登门之时。",
						"【教学】偏离度记你与史实的距离，只增不减：≤20 循史，21–45 微澜，46–70 改流，71 以上逆天。",
						"【教学】选项旁带\"史\"字者，是史书所载荆轲的本来面目。循之则稳，违之则波澜自生。",
						"【教学】岁月催人——体魄随年齿衰减。体魄高则延寿：寿元可逐点抵去当年的衰老之损，并压低发病之率（寿元与阈值见属性面板下方）。体魄低则易病：小病静养两轮自愈，大病须用「求医问药」。病至膏肓，体魄归零，便是殁时。"
					],
					"intro": ["战国之末，七雄只剩一口气。秦在东边磨刀，六国在西边发抖——诸侯的宫里夜夜点着灯，商议的都是同一件事：下一个，会轮到谁。", "你是⟦卫⟧国人，人称庆卿。好读书，击剑，以术说卫元君——卫元君不用。卫太小，容不下你的剑。这一年初春，你负剑东游，腰间一柄剑，囊中几卷书，身后一个留不住你的故国。史书上还没有你的名字——它要等六年，等一把匕首，等易水边一场白衣的雪。"],
					"start": "0-1",
					"events": [
						{
							"id": "0-1",
							"title": "榆次论剑",
							"segs": ["⟦榆次⟧大侠⟦盖聂⟧的地盘。你与他论剑，话不投机，他忽然住口，怒目而视——满堂的酒碗都停在半空。", "他的剑已在手，你的还在鞘中。烛火跳了一下，没有人敢扶——这一瞬，定得下生死。"],
							"options": [
								{
									"t": "还以眼色，徐步而出",
									"hist": true,
									"res": "你瞪了回去，徐步出门。背后没有剑出鞘的声音——这一生，你离剑锋最近的一次。",
									"eff": {
										"attrs": {
											"shengwang": 3,
											"weiji": 2
										},
										"dev": 0,
										"ach": "lunjian"
									},
									"to": "0-2"
								},
								{
									"t": "长揖称谢，请教过失",
									"res": "你长揖到地，请他指点。盖聂火气消了一半，剑理讲了一整夜——那一分，比赢一场剑更值钱。",
									"eff": {
										"attrs": {
											"caixue": 3,
											"wuli": 2,
											"shengwang": -2
										},
										"dev": 3
									},
									"to": "0-2"
								},
								{
									"t": "邀他同饮，化敌为友",
									"res": "你把酒碗推过去：剑上争不出，酒里见。三杯下肚，论剑成了论交。",
									"eff": {
										"attrs": {
											"caifu": -4,
											"shengwang": 2,
											"biancai": 2
										},
										"dev": 0,
										"flags": ["gainie"]
									},
									"to": "0-2"
								}
							]
						},
						{
							"id": "0-2",
							"title": "邯郸博棋",
							"segs": ["邯郸，赵国的旧都。秦人的刀悬在头顶，博徒的骰子照旧掷得山响。⟦鲁句践⟧的棋局，你与他争一道，互不相让。", "他拍案而起，你也按剑而立。棋盘上楚河汉界，一如此刻的天下——这一局棋，谁也输不起。"],
							"options": [
								{
									"t": "拂袖而去，不复相见",
									"hist": true,
									"res": "你拂袖走了，他没追。后来你们都记得这盘没下完的棋——这一局，输在棋盘外。",
									"eff": {
										"attrs": {
											"shengwang": 2,
											"weiji": -2
										},
										"dev": 0
									},
									"to": "0-3"
								},
								{
									"t": "长揖谢罪，结为棋友",
									"res": "你长揖谢罪。鲁句践执手大笑，拉你重开一局，下到日落——有些输，是为了赢得更远。",
									"eff": {
										"attrs": {
											"shengwang": 4,
											"biancai": 2
										},
										"dev": 3,
										"flags": ["lujian"]
									},
									"to": "0-3"
								},
								{
									"t": "掀了这棋盘",
									"res": "棋盘掀翻，黑白子滚了一地。满场死静，继而哄然——博徒们记住了你的名字。",
									"eff": {
										"attrs": {
											"shengwang": -3,
											"weiji": 5,
											"wuli": 2
										},
										"dev": 5
									},
									"to": "0-3"
								}
							]
						},
						{
							"id": "0-3",
							"title": "西市闻歌",
							"segs": ["邯郸西市的酒旗底下，五国的口音在一个棚子里碰杯。有个燕地贩夫说：燕市有个高渐离，击筑绝了，听过的人无不泣下。", "你捏着酒杯，望向北方——北方的风里仿佛真有一缕筑声，隔着五百里敲在你心上，像是在等你。"],
							"options": [
								{
									"t": "西入燕，去会一会这个筑声",
									"res": "你结了酒账，向燕而去。邯郸的棋局还在身后，你听见了更远的声音——那声音里有筑，有歌。",
									"eff": {
										"attrs": { "tupo": 2 },
										"dev": 0
									},
									"to": "NEXT"
								},
								{
									"t": "算了。邯郸的棋还没下完",
									"req": { "notflag": "gainie" },
									"res": "你留下了。棋照下，酒照喝，北方的筑声渐渐听不见了。很多年后，日子把远方磨成了故事。",
									"eff": { "dev": 0 },
									"to": {
										"ending": "E2",
										"variant": "jiuke"
									}
								},
								{
									"t": "一路试剑，打到燕国去",
									"req": { "wuli": 55 },
									"res": "三个月，七场试剑，未逢一败——“卫人庆卿”四个字，先你一步进了蓟城。到燕市那日，筑声正悲，你要了一碗酒。",
									"eff": {
										"attrs": {
											"wuli": 3,
											"shengwang": 2,
											"tupo": -2
										},
										"dev": 3
									},
									"to": "NEXT"
								}
							]
						}
					]
				},
				{
					"id": "c1",
					"title": "第一章 ｜ 燕市击筑",
					"sub": "约前 232 前后",
					"age": 31,
					"summaryNotes": ["田光记住了你。一个老人的眼睛，有时候就是一扇门。", "这一年，太子丹自秦亡归。燕国的天，要变了。"],
					"intro": ["燕国的市声比邯郸杂。你在燕市的第一晚，就听见了那阵⟦筑⟧声——像有人把山河敲碎，又一寸一寸拼回去。", "击筑的人坐在肉案与酒坛之间，衣冠不整，旁若无人。你放下行囊，要了一碗酒。"],
					"start": "1-1",
					"events": [
						{
							"id": "1-1",
							"title": "燕市酒徒",
							"segs": ["击筑的人叫⟦高渐离⟧。筑声一起，满市皆静，连狗屠的刀都停在骨头上。你忍不住和歌——他击筑，你唱，旁人环观如堵。", "歌到变徵，满座流涕；歌到羽声，你又大笑。曲终，你才看清那击筑人的脸：眉目清瘦，指尖全是茧——他也看着你，像看一个等了很久的人。"],
							"options": [
								{
									"t": "放歌相和，引为知音",
									"hist": true,
									"res": "曲终，筑声歇了。你们相视而笑，没有互问姓名——知音不必。你把他的名字在心里念了一遍：高渐离。",
									"eff": {
										"attrs": { "shengwang": 5 },
										"dev": 0,
										"flags": ["gaojianli"],
										"ach": "gaoge"
									},
									"to": "1-2"
								},
								{
									"t": "独酌旁观，不入局中",
									"res": "你在角落里独酌，听完三曲，没有上前。他的筑你记住了——有些缘分，晚来几年也无妨。",
									"eff": {
										"attrs": { "caixue": 3 },
										"dev": 0
									},
									"to": "1-2"
								},
								{
									"t": "掷金十锾，满座皆惊",
									"res": "你掷金十锾，满座皆惊，连筑声都停了半拍。燕市三日皆传卫客之名，也有人暗中记下了你的阔绰。",
									"eff": {
										"attrs": {
											"caifu": -5,
											"shengwang": 8,
											"weiji": 3
										},
										"dev": 3
									},
									"to": "1-2"
								}
							]
						},
						{
							"id": "1-2",
							"title": "田光之目",
							"segs": ["座中有个老者，须发半白，布衣芒鞋，看了你很久——久到酒都凉了两回。他是燕国的处士⟦田光⟧，人称节侠，看人看得比谁都准。", "“卫人庆卿？”他举杯相邀，“老朽这双眼睛，还没看错过人。”你端着酒盏走过去——这一眼，看的不止是你的剑。"],
							"options": [
								{
									"t": "与论天下大势",
									"hist": true,
									"res": "从卫说到燕，从剑说到势，烛花剪了三回。田光离席长揖：燕国有你一席。他说这话时，眼里有火。",
									"eff": {
										"attrs": {
											"junxin": 5,
											"caixue": 3,
											"moulue": 2
										},
										"dev": 0,
										"flags": ["tianguangzhixi"]
									},
									"to": "1-3"
								},
								{
									"t": "谦退不答，自守其拙",
									"res": "你谦退不答，只说些市井闲话。田光笑了笑，没再追问——但他记住你了。若多说一句，路会不一样。",
									"eff": {
										"attrs": { "weiji": -3 },
										"dev": 0,
										"flags": ["tianguangzhixi"]
									},
									"to": "1-3"
								},
								{
									"t": "高谈阔论，锋芒毕露",
									"res": "你纵谈天下，四座皆惊。田光点头，也有人皱眉——锋芒照亮人，也刺伤眼。你走出酒肆时，后背已经汗湿。",
									"eff": {
										"attrs": {
											"shengwang": 4,
											"weiji": 4,
											"biancai": 2
										},
										"dev": 3
									},
									"to": "1-3"
								}
							]
						},
						{
							"id": "1-3",
							"title": "太子归燕",
							"segs": ["这一年，⟦太子丹⟧自秦亡归。他在秦为⟦质子⟧多年，受够了嬴政的慢待——归来时车马萧索，脸色铁青。蓟城街头巷尾都在传：秦王辱太子。", "燕国上下都在传两个字：报仇。像冰面下的暗流——表面风平浪静，底下却一刻不停。你坐在酒肆里听着，觉得这燕市的酒要变味了。"],
							"options": [
								{
									"t": "静观时局，不做急客",
									"res": "报仇是国事，急不得。你把目光从燕廷移回酒碗——筑声依旧，只是碗里的酒，忽然苦了些。",
									"eff": {
										"attrs": {
											"caixue": 4,
											"moulue": 2
										},
										"dev": 0
									},
									"to": "NEXT"
								},
								{
									"t": "投刺求见，为国效力",
									"res": "名刺递进太子宫，三日而见。太子丹看你如看兵器：“庆卿之剑，能斩几人？”你答：斩一人。他默然。",
									"eff": {
										"attrs": {
											"shengwang": 3,
											"junxin": 3,
											"weiji": 3
										},
										"dev": 0
									},
									"to": "NEXT"
								},
								{
									"t": "早做去留之计",
									"res": "风暴眼正在成形，你先想好了退路。马喂在东市，路认到易水，行囊永远不必重新收拾。乱世里，先活下来的人才谈得上做事。",
									"eff": {
										"attrs": {
											"weiji": -5,
											"moulue": 2
										},
										"dev": 3,
										"flags": ["quyi"]
									},
									"to": "NEXT"
								}
							]
						}
					]
				},
				{
					"id": "c2",
					"title": "第二章 ｜ 田光之荐",
					"sub": "前 228 · 历史节点预备",
					"age": 34,
					"summaryNotes": ["田光死了。他用一条命，把你推上了这条没有回头的路。", "太子的局已经布开：首级、地图、匕首、副手——以及，一个回不来的人。"],
					"intro": ["秦破邯郸，虏赵王迁。王翦屯兵中山，兵临易水——河北岸的庄稼还没收，南岸的刀已经出鞘。", "燕国大震。朝堂上吵作一团，酒市里却安静得反常。田光在这时候，走进了太子宫——一个老人，一头白发，一身洗旧的布衣。"],
					"start": "2-1",
					"events": [
						{
							"id": "2-1",
							"title": "田光自刎",
							"segs": ["田光向太子丹举荐了你。临别，太子送至门，嘱曰：国事也，愿勿泄。老人的背，从那一刻起就挺得更直了。", "“长者行事，不使人疑。”他看着你，笑了笑——剑光一闪，老人自刎，以死明不泄言。你跪在血泊边，第一次知道什么叫“以命托命”。"],
							"options": [
								{
									"t": "受遗命，别无选择",
									"hist": true,
									"res": "血还未冷，你已经不能回头。田光的命压在你肩上，比剑重。你替老人合上眼——从今往后，没人能替你抖了。",
									"eff": {
										"attrs": {
											"shengwang": 5,
											"junxin": 8
										},
										"dev": 0,
										"flags": ["yiming"],
										"ach": "tianguang"
									},
									"to": "2-2"
								},
								{
									"t": "闻之而惧，彻夜难眠",
									"res": "你第一次摸到这件事的重量：它先压死了一个老人，才轮到你。那一夜你没合眼，只问自己：值不值？答案由不得你。",
									"eff": {
										"attrs": {
											"weiji": 8,
											"tupo": -2
										},
										"dev": 3,
										"flags": ["yiming"]
									},
									"to": "2-2"
								},
								{
									"t": "欲辞不受",
									"res": "你说了推辞的话，田光的尸首还在那里。太子丹不会答应，你也说服不了自己——有些门，踏进去就只剩向前。",
									"eff": {
										"attrs": { "junxin": -5 },
										"dev": 5,
										"flags": ["yiming"]
									},
									"to": "2-2"
								}
							]
						},
						{
							"id": "2-2",
							"title": "太子三请",
							"key": true,
							"segs": ["太子宫的烛火彻夜不熄。你到时，殿上只余几个心腹，人人面色如铁，像一排立着的刀。", "太子丹避席顿首：“丹之私计，劫秦王，使悉反诸侯侵地，如⟦曹沫⟧之于齐桓公；不可，因而刺之。”说完伏地不起——这一拜，拜的不是你的剑，是整个燕国的命。"],
							"options": [
								{
									"t": "许之",
									"hist": true,
									"res": "你听见自己说：诺。殿外的风应声而起。太子丹顿首再拜——从今夜起，你的命不是你的了。",
									"eff": {
										"attrs": {
											"junxin": 10,
											"quanshi": 3,
											"zhengji": 5
										},
										"dev": 0,
										"flags": ["caomozhi"],
										"merit": "燕使"
									},
									"to": "2-3"
								},
								{
									"t": "固辞",
									"req": { "notflag": "guci" },
									"res": "你长跪力辞：此国之大事，驽马不堪。太子丹顿首固请，额头碰在砖上——不是他的额头在碰地，是燕国在碰地。",
									"eff": {
										"attrs": { "junxin": -8 },
										"dev": 3,
										"flags": ["guci"]
									},
									"to": "2-2"
								},
								{
									"t": "固辞不受",
									"req": { "flag": "guci" },
									"res": "你第二次伏地，一字不改。太子看了你很久，忽然笑了：“先生已决意，我不复劝。”你退出殿外——那四个字，比责备都重。",
									"eff": {
										"attrs": { "junxin": -10 },
										"dev": 5
									},
									"to": { "ending": "E2" }
								},
								{
									"t": "请以辩代刀",
									"req": { "biancai": 55 },
									"res": "“丹能使燕存乎？”你说，“轲请为使，说秦以利害，不战而屈。”太子沉吟良久，手指敲案——这十几下，敲的是你的路。",
									"eff": {
										"attrs": {
											"caixue": 3,
											"biancai": 2,
											"junxin": -3
										},
										"dev": 8,
										"flags": ["shuoke"]
									},
									"to": "2-4"
								}
							]
						},
						{
							"id": "2-3",
							"title": "太子之急",
							"segs": ["你本想等一位真正的帮手——剑术更精，胆色更沉。他还没到，也许永不会到。太子丹却一天比一天急：败报雪片似的来，王翦的旗又近了三十里。", "“日已尽矣，荆卿岂无意哉？”这已经是第二次来催。你站在窗前，看着北方的云——你知道，这盘棋已经等不起了。"],
							"options": [{
								"t": "即刻治装，不再等",
								"hist": true,
								"res": "帮手等不到了。你把行囊收紧，心里把那个名字一笔划掉，划得很慢。你磨着剑：走吧，再不走就来不及了。",
								"eff": {
									"attrs": { "weiji": 3 },
									"dev": 0,
									"flags": ["taizi-ji"]
								},
								"to": "NEXT"
							}, {
								"t": "再求宽限五日",
								"res": "太子的脸色沉了下去，但还是准了。五日换一分稳妥——只是这五日里，秦人的马蹄不会停。五日过完，你瘦了一圈，眼睛却亮了。",
								"eff": {
									"attrs": {
										"junxin": -5,
										"weiji": -3,
										"biancai": 2
									},
									"dev": 3,
									"flags": ["kuanxian"]
								},
								"to": "NEXT"
							}]
						},
						{
							"id": "2-4",
							"title": "说客之计",
							"segs": ["你筹划的，是一条无人走过的路：以燕⟦督亢⟧之地为饵，以⟦合纵⟧旧谊为辞，说秦缓兵——剑不成，舌头也能成事。", "烛下摊开三国的地图，秦的锋芒、燕的软肋一目了然。太子丹将信将疑，但眼下别无更好的牌。说辞在心里又过了一遍：走得通，燕国便多三年；走不通——案边的剑，还在鞘里。"],
							"options": [{
								"t": "尽心筹划说辞",
								"res": "三日三夜，秦燕赵的地图都画烂了。说辞滚熟，字字有锋，句句留余。能不能成，只有三成把握——三成也是路。",
								"eff": {
									"attrs": {
										"caixue": 5,
										"biancai": 3
									},
									"dev": 5
								},
								"to": "NEXT"
							}, {
								"t": "罢了，还是说不过秦国",
								"res": "你想通了：对饿虎，道理是肉，不是绳。说客这条路，尽头没有门。你把那卷说辞投进火盆，看它成灰。",
								"eff": {
									"attrs": { "weiji": -3 },
									"dev": 3,
									"flags": ["caomozhi"]
								},
								"to": "2-3"
							}]
						}
					]
				},
				{
					"id": "c3",
					"title": "第三章 ｜ 樊於期之首",
					"sub": "前 228 · 历史节点",
					"age": 35,
					"summaryNotes": ["函首与地图备齐了。从这一刻起，你不只是一个说客或刺客——你是一件礼物。", "徐夫人的匕首只有七寸。七寸之外，是你和秦王之间最后的距离。"],
					"intro": ["秦将⟦樊於期⟧，得罪于秦王，亡之燕，太子丹受而舍之。秦王购之金千斤，邑万家。", "要进咸阳宫，你需要两样东西：樊於期的头，和燕⟦督亢⟧的地图。一样值万家的封邑，一样是燕国的命门。"],
					"node": "N1",
					"mutations": [
						{
							"if": { "shengwang": 55 },
							"flag": "fenglai",
							"note": "【节点异变】你的侠名传到了樊於期耳中——他不等你上门，自己先来了。"
						},
						{
							"if": { "junxinMax": 25 },
							"flag": "taiziyi",
							"setAttrs": { "weiji": 5 },
							"note": "【节点异变】太子丹的目光在你与秦国之间来回——他疑你。"
						},
						{
							"if": { "weiji": 60 },
							"flag": "qinshi",
							"setAttrs": { "weiji": 8 },
							"note": "【节点异变】秦使先一步至燕，明索樊於期。你的风声，已经漏了。"
						},
						{
							"if": { "devMin": 40 },
							"flag": "xielou",
							"zg": 10,
							"note": "【节点异变】行刺预备走漏，秦谍已动。咸阳宫的那双眼睛，先于你醒了。"
						}
					],
					"start": "3-1",
					"events": [
						{
							"id": "3-1",
							"title": "樊於期之策",
							"key": true,
							"altSegs": {
								"flag": "fenglai",
								"segs": ["樊於期自己来了。他带着酒气进门，眼里却清醒得吓人。“秦王购我头，金千斤，邑万家。荆卿，拿去吧——别让这颗头白值这个价。”他笑了，笑得比哭还难看。"]
							},
							"segs": ["樊於期在燕，日日醉，夜夜哭：父母宗族，皆为戮没。你去见他。院里的雪没人扫，剑扔在廊下锈了——那柄曾斩将的剑，如今连麻雀都敢落上去。", "要开口借一样东西——他的头颅。这三个字在舌尖上，比匕首还沉。你看着他通红的眼睛：这一借，借的是一条命；可这也是唯一的路。"],
							"options": [
								{
									"t": "陈说利害，借首级以见秦王",
									"hist": true,
									"res": "樊於期偏袒扼腕而进：“此臣日夜切齿腐心也！”遂自刎。血溅衣角，是烫的。你捧着函首——从今夜起，你没有资格抖。",
									"eff": {
										"attrs": {
											"shengwang": -8,
											"weiji": 5,
											"biancai": 3,
											"zhengji": 5
										},
										"dev": 0,
										"flags": ["fanshou"],
										"hist": -10,
										"ach": "fanshou",
										"condAttrs": [{
											"if": { "flag": "fenglai" },
											"attrs": { "shengwang": 8 },
											"note": "他先一步来赴死"
										}]
									},
									"to": "3-2"
								},
								{
									"t": "不忍，另谋他途",
									"res": "你出来了，雪落在肩上。院门在身后合上。你走在雪里，脚步很慢——雪把你的脚印，一个一个埋掉。",
									"eff": {
										"attrs": { "weiji": -3 },
										"dev": 10
									},
									"to": "3-1b"
								},
								{
									"t": "劝太子丹亲杀之",
									"res": "太子丹默然良久：“樊将军穷困来归，丹不忍。”他说这话时眼睛红了。你不忍，他不忍，谁忍？最难的不是杀人，是开口向人要一条命。",
									"eff": {
										"attrs": {
											"junxin": -5,
											"shengwang": -3,
											"weiji": 3
										},
										"dev": 3
									},
									"to": "3-1"
								}
							]
						},
						{
							"id": "3-1b",
							"title": "假首之计",
							"segs": ["没有樊於期的头，用什么叩开秦廷的门？你对着空匣坐了一夜，匣底的红绒布，被你的指头摩挲得起了毛。", "牢里有新死的死囚，粗看有三分像。狱吏收了钱，什么都没看见——这世道，钱的记性比人好。万家的封邑，竟要由一颗无名的人头去换。"],
							"options": [{
								"t": "以假首充数",
								"req": { "moulue": 40 },
								"res": "药水浸过，须发改过，匣中之首真假莫辨。但你自己知道——露馅就是死。你把匣子合上，封泥按得很慢。",
								"eff": {
									"attrs": {
										"weiji": 5,
										"moulue": 2
									},
									"dev": 8,
									"flags": ["jiashou"]
								},
								"to": "3-2"
							}, {
								"t": "无首也要行",
								"res": "太子丹眉头拧成了结，但事已至此。无首之局，路要重新踩。你把空匣撤下，换上一卷更重的地图——让那张图多担一分分量。",
								"eff": {
									"attrs": {
										"junxin": -5,
										"weiji": 5
									},
									"dev": 5,
									"flags": ["wushou"]
								},
								"to": "3-2"
							}]
						},
						{
							"id": "3-2",
							"title": "督亢之图",
							"segs": ["⟦督亢⟧，燕国最膏腴之地。桑麻蔽野，河渠如织，秦王做梦都想要的地方。你把地图展开又卷起——这块地一旦递出去，燕国就再无退路。", "这就是敲门砖：门后是咸阳，是九宾之礼，是你等了半辈子的路。你用手指描过督亢的边界——这片土地养了燕人几百年，今夜要卷进你的行囊，替你叩门。"],
							"options": [
								{
									"t": "取真图入秦",
									"hist": true,
									"res": "图是真的，燕国的命门也是真的。你把它卷好，系紧。你抱着图匣，觉得它重得压手：里面装的不是地图，是燕国半壁的桑麻与炊烟。",
									"eff": {
										"dev": 0,
										"flags": ["dktu"]
									},
									"to": "3-3"
								},
								{
									"t": "以假图代之",
									"req": { "moulue": 40 },
									"res": "山川易位，城郭挪形。假图画了三夜，笔笔都像真的——直到展开的最后一刻，已经没有回头路。",
									"eff": {
										"attrs": {
											"weiji": 3,
											"moulue": 2
										},
										"dev": 8,
										"flags": ["jiatu"]
									},
									"to": "3-3"
								},
								{
									"t": "不带图，空手行",
									"res": "没有图，秦王凭什么见你？你想的是另一套说辞——空手上殿，全靠一张嘴。太子丹像看疯子。你笑了笑：最疯的路，有时候才是最近的路。",
									"eff": {
										"attrs": {
											"junxin": -3,
											"weiji": 5
										},
										"dev": 5
									},
									"to": "3-3"
								}
							]
						},
						{
							"id": "3-3",
							"title": "徐夫人匕",
							"segs": ["太子丹使人求来赵人⟦徐夫人⟧的匕首——百金，淬毒，试人血濡缕，无不立死。匕首盛在铜匣里送来，开匣时满室生寒，烛火都矮了半寸。", "它只有七寸。你握了握，像握着一截易水——凉的，沉甸甸的，带着河底的暗。你把它举到灯下：那光很干净，干净得没有一丝犹豫。"],
							"options": [{
								"t": "购徐夫人匕",
								"hist": true,
								"req": { "caifu": 10 },
								"res": "百金易一匕，太子丹的眼都没眨。你接过时手却沉了沉——不是金子的分量，是性命的分量。七寸之匕，抵得上千军万马，也抵得上一条命。",
								"eff": {
									"attrs": { "caifu": -10 },
									"dev": 0,
									"flags": ["xubi"]
								},
								"to": "3-4"
							}, {
								"t": "以常剑淬毒",
								"res": "铁匠铺三日，毒淬三遍。便宜是便宜，但终究差点意思——差一点，就是生死之差。你看着刃口微微发蓝的毒光，没有说话。",
								"eff": {
									"attrs": {
										"caifu": -3,
										"caixue": 2
									},
									"dev": 3,
									"flags": ["changbi"]
								},
								"to": "3-4",
								"req": { "caixue": 40 }
							}]
						},
						{
							"id": "3-4",
							"title": "副手之选",
							"segs": ["太子丹说：燕国有勇士⟦秦舞阳⟧，年十二杀人，人不敢忤视，可为副。你见过那个人：眼里只有凶，没有静——杀鸡够，屠龙未必。", "副手二字，是殿上的第二条命。选错了，就是你的墓志铭——那条命，得在咸阳宫的殿上，替你站着。"],
							"options": [
								{
									"t": "以秦舞阳为副",
									"hist": true,
									"res": "太子的安排，你接了。那一丝不安，你没说出口——说了也无人可换。你看着舞阳练剑：劈得很猛，却劈得很空。",
									"eff": {
										"dev": 0,
										"flags": ["qinwuyang"]
									},
									"to": "NEXT"
								},
								{
									"t": "独往，不要副手",
									"res": "“轲一人足矣。”太子丹愕然，但你意已决。一个人入局，一个人收局，成败都是自己的账。你磨好剑，裹好图——这一生，你从来都是一个人上路。",
									"eff": {
										"attrs": {
											"junxin": -3,
											"wuli": 2
										},
										"dev": 5,
										"flags": ["duxing"]
									},
									"to": "NEXT"
								},
								{
									"t": "求高渐离同往",
									"req": {
										"flag": "gaojianli",
										"junxin": 40
									},
									"res": "“渐离，敢不敢跟我走一趟？”他放下筑，只说了一个字：敢。你看着他把筑囊系紧：若成了，一起回燕市喝酒；若不成——你没往下想，他也没问。",
									"eff": {
										"dev": 10,
										"hist": -5,
										"flags": ["jianli-tong"]
									},
									"to": "NEXT"
								}
							]
						}
					]
				},
				{
					"id": "c4",
					"title": "第四章 ｜ 易水",
					"sub": "前 227 · 历史节点",
					"age": 36,
					"summaryNotes": ["白衣、筑声、易水。从这一刻起，你的名字不再只属于你。", "函谷关在身后合拢。前面的路，史书上只用六个字就写完了——而你要一步一步走。"],
					"intro": ["行期定了。这天天未亮，太子宫的车驾已经到了门口。⟦易水⟧在城南三十里——过了这条水，就没有燕国的路了。", "你把匕首贴身收好，铜匣与图轴装进车底的夹层。铁是凉的，贴着贴着就热了。"],
					"node": "N2",
					"enter": {
						"merit": "函图",
						"note": "函首与地图俱备。从易水开始，你不再只是荆轲——你是燕国的全部赌注。"
					},
					"mutations": [{
						"if": {
							"flag": "taizi-ji",
							"junxinMax": 35
						},
						"flag": "cuixing",
						"zg": 5,
						"note": "【节点异变】太子丹第三催。你等的人不会来了——副手的成色，你心里没底。"
					}, {
						"if": { "devMin": 40 },
						"flag": "qindie",
						"note": "【节点异变】秦谍已南渡。易水的水声里，藏着刀。"
					}],
					"start": "4-1",
					"startAlt": [{
						"if": { "flag": "qindie" },
						"start": "4-1b"
					}],
					"events": [
						{
							"id": "4-1",
							"title": "易水送别",
							"key": true,
							"segs": ["太子丹和宾客知其事者，皆白衣冠相送——白茫茫的，像易水提前下的一场雪，满岸白衣，没有一声笑。高渐离击筑，筑声一起，风就冷了。", "风萧萧兮易水寒，壮士一去兮不复还。歌声落处，芦苇伏了一地，像在替你弯腰。你唱完最后一句，看着面前这条河——这一去，燕国的岸就再也回不来了。"],
							"options": [
								{
									"t": "和歌而去，就车不返",
									"hist": true,
									"res": "你上车了，没有回头。筑声碎成一片，白衣缩成一线。易水寒不寒，你已经没有资格知道——眼里只有对岸的路。",
									"eff": {
										"attrs": { "shengwang": 8 },
										"dev": 0,
										"hist": 10,
										"ach": "yishui"
									},
									"to": "4-2"
								},
								{
									"t": "默然登车",
									"res": "你没有唱。有些歌，唱出来就回不来了。车轴吱呀，替你把那句歌咽了下去。满岸白衣像一场梦。",
									"eff": {
										"attrs": { "weiji": -3 },
										"dev": 0
									},
									"to": "4-2"
								},
								{
									"t": "回首与渐离别",
									"req": { "flag": "gaojianli" },
									"res": "“若我事成，你替我听遍这筑声；不成，就当耳边的风。”他点点头，手指还按在弦上。你登车时，筑声又起，追了很远。",
									"eff": {
										"attrs": [],
										"dev": 3,
										"hist": 5,
										"flags": ["yishuijue"]
									},
									"to": "4-2"
								},
								{
									"t": "弃行",
									"req": { "flag": "quyi" },
									"res": "你解下行囊，向太子丹长揖到地。易水的风停了。满岸白衣无言。你转身走了——身后一片比死更静的沉默。",
									"eff": { "dev": 0 },
									"to": { "ending": "E2" }
								}
							]
						},
						{
							"id": "4-1b",
							"title": "易水劫案",
							"segs": ["行至野寺，夜黑，犬不吠——安静得像有人提前把狗都毒哑了。墙头跃下七条黑影。秦人的刀比你想的快——刀光贴着夜风，直取你的咽喉。", "他们知道图，也知道匕首。你抱紧行囊：有人出卖了这条路，出卖得很彻底。你数了数：七个。你握着剑柄，把每一步都算好了。"],
							"options": [
								{
									"t": "杀出重围",
									"req": { "wuli": 55 },
									"res": "剑光起落，寺门洞开。你提着滴血的剑上路，身后没有活口。你在溪边停下来洗手：水是凉的，血是热的。",
									"eff": {
										"attrs": {
											"weiji": 10,
											"wuli": 3,
											"tupo": -2
										},
										"dev": 5
									},
									"to": "4-2"
								},
								{
									"t": "绕道潜行",
									"req": { "caifu": 8 },
									"res": "重金买通向导，昼伏夜行。刀躲开了，风声没躲开——睡觉都留着半只耳朵。这一路，走的不是路，是刀尖上的缝。",
									"eff": {
										"attrs": {
											"caifu": -8,
											"weiji": -5,
											"tupo": -2
										},
										"dev": 3
									},
									"to": "4-2"
								},
								{
									"t": "力竭被擒",
									"res": "剑脱手的那一刻，你想起易水的歌。原来那句“不复还”，是唱给今天听的。你闭上眼睛，听见刀风落下——那声音和筑声，竟有几分像。",
									"eff": { "dev": 0 },
									"to": {
										"ending": "E8",
										"variant": "yishui"
									}
								},
								{
									"t": "稳住阵脚，等太子援兵",
									"req": { "quanshi": 12 },
									"res": "你没有冲。剑阵收缩，护住图匣——半刻之后，巷口杀声忽起：护卫到了。黑影散得比来时还快。你收剑回鞘——最强的剑，有时候是不出鞘的剑。",
									"eff": {
										"attrs": {
											"weiji": -3,
											"tupo": -1
										},
										"dev": 3
									},
									"to": "4-2"
								}
							]
						},
						{
							"id": "4-2",
							"title": "函谷入关",
							"segs": ["⟦函谷关⟧。两山夹一道，关门窄得只容一车。你以燕使身份递上传书，关吏的眼睛在你和文书之间来回——那目光，像在掂一块石头的分量。", "终于，挥手放行。关内的路笔直，像一条绷紧的弦——这国家的所有路，都通向咸阳。你牵着马走过关道：这道关，进来容易，出去难。"],
							"options": [
								{
									"t": "细察秦廷关节",
									"res": "一路看，一路记：哪座城虚，哪座城实。咸阳宫的殿阶，从函谷关就开始数了。你夜里铺开纸，把所见一条条写下来——每一笔，都可能是一条命的路。",
									"eff": {
										"attrs": {
											"caixue": 3,
											"moulue": 2
										},
										"dev": 0,
										"flags": ["zhiqin"]
									},
									"to": "NEXT"
								},
								{
									"t": "直趋咸阳",
									"res": "咸阳居，大不易。盘缠在瘦，风声在涨。驿站的墙很高，墙外的眼睛比墙更高。你听着隔壁的鼾声——这座城，把每个人都养得小心翼翼的。",
									"eff": {
										"attrs": {
											"caifu": -4,
											"weiji": 3,
											"tupo": -2
										},
										"dev": 0
									},
									"to": "NEXT"
								},
								{
									"t": "修书报燕，以文寄意",
									"req": { "caixue": 45 },
									"res": "驿馆灯下，你把一路所见写成书：关防虚实、道路远近、秦吏嘴脸，文简事核。书递回蓟城，回话只有四个字——善，慎之。",
									"eff": {
										"attrs": {
											"junxin": 3,
											"weiji": -2
										},
										"dev": 0
									},
									"to": "NEXT"
								}
							]
						}
					]
				},
				{
					"id": "c5",
					"title": "第五章 ｜ 咸阳宫",
					"sub": "前 227 · 历史节点 · 全剧本枢纽",
					"age": 36,
					"summaryNotes": ["史书行到此处，只剩最后一页。这一页写杀、写劫、写退——还是写死，由你落笔。"],
					"intro": ["咸阳。九重宫阙，戒备如铁，六国的使者在馆驿进进出出，个个脸上写着心事。你住进燕使馆等觐见——函首与地图收在最里间，匕首贴着心口。", "隔着宫墙，你能听见更漏。一声，一声——这座城在替所有人倒数。"],
					"node": "N3",
					"enter": {
						"merit": "咸阳",
						"note": "前227年，你踏上咸阳宫的丹墀。四海之内，敢走到这里的人不多。"
					},
					"start": "5-1",
					"events": [
						{
							"id": "5-1",
							"title": "蒙嘉之门",
							"segs": ["秦王宠臣⟦蒙嘉⟧，是唯一能直达御前的门路。权臣的门房比将军的营门还难进——台阶都被人磨亮了。门房开价，你听得眼皮直跳：那数目够买燕市半条街。", "在这个国家，连忠诚都是明码标价的。好在你带来的不是忠诚——是图，是首，是一条要进殿的路。你看着蒙府那扇朱漆大门：再沉的门，也有它的缝。"],
							"options": [
								{
									"t": "千金买通",
									"hist": true,
									"req": { "caifu": 10 },
									"res": "金子进了蒙府，话从宫里递了出来：“燕使愿举国为内臣。”话递得漂亮——这一千金，买的不只是进门的路，还有秦王那一点防备的松懈。",
									"eff": {
										"attrs": { "caifu": -10 },
										"dev": 0,
										"flags": ["mengjia"]
									},
									"to": "5-2"
								},
								{
									"t": "以名自荐",
									"req": { "shengwang": 50 },
									"res": "你递上名刺，附了田光的旧事。蒙嘉掂了掂分量，收下了——只是他的眼神多了一层掂量。田光的名字，从来不是拿来攀附的；可今夜，你把它用在了门缝上。",
									"eff": {
										"dev": 5,
										"flags": ["mengjia"],
										"zg": 10
									},
									"to": "5-2"
								},
								{
									"t": "坐等召见",
									"res": "三天，五天。宫里没有回音，秦廷的眼睛却先到了。馆驿门外多了两个不吆喝的摊子，只盯着进出的人。你坐在窗后，看那两把伞在雨里撑了三天。",
									"eff": {
										"attrs": {
											"weiji": 8,
											"junxin": -3
										},
										"dev": 0,
										"zg": 10
									},
									"to": "5-2"
								},
								{
									"t": "修书燕廷，走门人引荐",
									"req": { "quanshi": 15 },
									"res": "你修书一封，走太子门下宾客的路子，递到蒙嘉案头。引荐信比金子先到——蒙嘉看完，把信折了：燕丹的人情，他得给。",
									"eff": {
										"attrs": { "junxin": 2 },
										"dev": 3,
										"flags": ["mengjia"],
										"zg": 5
									},
									"to": "5-2"
								}
							]
						},
						{
							"id": "5-2",
							"title": "九宾之礼",
							"segs": ["秦王闻之大喜，设⟦九宾⟧之礼见燕使者于咸阳宫——满城都在传，燕国来献督亢了。百官云集，钟鼓齐鸣，傧者呼唱一声接一声，像浪推着船，把人往殿心推。", "你和副使一前一后踏上丹墀。台阶一级一级，你数着——数到最后，手心里全是汗。殿门大敞，像一张嘴。你捧着图匣，心跳一下一下，比钟鼓都响。"],
							"options": [
								{
									"t": "如常进殿",
									"hist": true,
									"res": "图匣与函首高举过顶。你数着台阶，一，二，三——每一步都踩在心跳上。三十年，就是为了踏上这最后一级台阶。",
									"eff": {
										"dev": 0,
										"condAttrs": [
											{
												"if": { "flag": "jiashou" },
												"attrs": { "weiji": 3 },
												"note": "函首的封泥太新，验看的廷吏多停了一瞬"
											},
											{
												"if": { "flag": "wushou" },
												"attrs": { "weiji": 5 },
												"note": "无首可献，傧者的呼唱声里多了一分迟疑"
											},
											{
												"if": { "flag": "jiatu" },
												"attrs": { "weiji": 3 },
												"note": "图轴的绢色太新，阶下的史官眯起了眼"
											}
										]
									},
									"to": [{
										"if": { "notflag": "qinwuyang" },
										"to": "5-4"
									}, { "to": "5-3" }]
								},
								{
									"t": "先行调排",
									"req": { "flag": "kuanxian" },
									"res": "进殿前你嘱咐舞阳：低头，捧稳。他点头了，汗顺着鬓角砸在砖上。你拍拍他的肩——这个敢杀人的少年，原来也会怕。",
									"eff": {
										"attrs": { "weiji": -3 },
										"dev": 0,
										"zg": -5
									},
									"to": "5-3"
								},
								{
									"t": "伏阙称臣，献图不刺",
									"res": "你把图匣与函首举过头顶，深深拜了下去。这一拜，易水的歌就散了。钟鼓齐鸣，替你送行。你跪在丹墀下：不刺也是结局，只是配不上这一路的雪、血和筑声。",
									"eff": { "dev": 10 },
									"to": [{
										"if": { "zhengji": 15 },
										"to": {
											"ending": "E3",
											"variant": "nengli"
										}
									}, { "to": { "ending": "E3" } }]
								}
							]
						},
						{
							"id": "5-3",
							"title": "舞阳变色",
							"key": true,
							"segs": ["丹墀之上，⟦秦舞阳⟧的脸色忽然变了——惨白，发抖，几乎捧不住图匣，像一尊要倒的泥胎。群臣的目光刷地聚过来，大殿静得能听见他的牙关响。", "你不能回头。身后这个人，正把整座局往悬崖边上推——你感觉到秦王的目光，越过群臣落在了你脸上。箭已在弦上，容不得半分犹豫。"],
							"options": [
								{
									"t": "笑而谢曰：“北蛮鄙人，故振慑。”",
									"hist": true,
									"res": "“北蛮夷之鄙人，未尝见天子，故振慑。”你笑得轻松，像说一件趣事。秦王信了八分——剩下两分悬在你后颈。这一笑，比剑还快。",
									"eff": {
										"attrs": { "biancai": 3 },
										"dev": 0,
										"zg": -10
									},
									"to": [{
										"if": { "biancai": 40 },
										"to": "5-4"
									}, { "to": {
										"ending": "E8",
										"variant": "shangdian"
									} }]
								},
								{
									"t": "亲自捧图进",
									"req": { "shengwang": 55 },
									"res": "“小臣捧图，不敢假手。”你接过图匣，把舞阳挡在身后。匣比刚才沉了十倍——装的是两个人的命。你捧着它往前走：这条路上，只剩你一个人了。",
									"eff": {
										"dev": 5,
										"zg": 5
									},
									"to": "5-4"
								},
								{
									"t": "令舞阳退下",
									"res": "“鄙人愚劣，使其退。”舞阳退下了，殿上只剩你一人。也好——一个人的局，一个人收。你站在殿心，迎着满殿目光：最孤独，是一个人在所有人面前。",
									"eff": {
										"attrs": { "weiji": 10 },
										"dev": 5,
										"zg": 15
									},
									"to": "5-4"
								}
							]
						},
						{
							"id": "5-4",
							"title": "图穷匕见",
							"key": true,
							"segs": ["你左手展开地图，一寸，一寸。秦王的目光落在督亢的山川上，贪婪而放松——像看着自己的地。图穷，匕见。满殿的呼吸在这一刻停住，连烛火都不再摇。", "你的手已经握住那截冰冷——榆次的剑、邯郸的棋、燕市的筑、易水的歌，都压在这一握上。这一握，你等了三十年。这一次，改写它。"],
							"options": [
								{
									"t": "揕其胸——杀！",
									"hist": true,
									"res": "左手把其袖，右手揕其胸——七寸匕光，直取那颗心跳。六国的怒气，都灌在这一刺里。这一刺，押着三十年的雪、五百里的筑声、一个老人的血。",
									"eff": {
										"attrs": { "weiji": 30 },
										"dev": 40,
										"merit": "刺秦"
									},
									"to": [
										{
											"if": {
												"flag": "jianli-tong",
												"biancai": 60,
												"zgMax": 64
											},
											"to": { "ending": "E7" }
										},
										{
											"if": {
												"flag": "xubi",
												"biancai": 55,
												"zgMax": 49
											},
											"to": { "ending": "E6" }
										},
										{
											"if": {
												"flag": "jianli-tong",
												"zgMax": 64
											},
											"to": { "ending": "E6" }
										},
										{ "to": "5-5" }
									]
								},
								{
									"t": "把袖不刺——劫！",
									"req": { "flag": "caomozhi" },
									"res": "你把住他的袖子，匕首抵而不入：“尽归诸侯侵地，则生王；不然，同死。”曹沫的影子立在你身后。秦王眼里第一次有了惊惧——最锋利的是“同死”两个字。",
									"eff": {
										"attrs": { "weiji": 25 },
										"dev": 25,
										"merit": "刺秦"
									},
									"to": [
										{
											"if": {
												"flag": "xubi",
												"shengwang": 55,
												"zgMax": 39
											},
											"to": { "ending": "E4" }
										},
										{
											"if": {
												"flag": "jianli-tong",
												"zgMax": 49
											},
											"to": { "ending": "E4" }
										},
										{ "to": "5-5" }
									]
								},
								{
									"t": "掷图喝破，拂袖而退",
									"req": { "shengwang": 55 },
									"res": "你掷图于地，声震满殿：“秦王！六国之血，今日溅你丹墀！”咸阳宫在你背后发抖。你大步下阶——这一声，会响很久。",
									"eff": {
										"attrs": { "weiji": 20 },
										"dev": 30,
										"merit": "斥秦"
									},
									"to": [{
										"if": { "zgMax": 34 },
										"to": { "ending": "E5" }
									}, { "to": {
										"ending": "E8",
										"variant": "yaonang"
									} }]
								},
								{
									"t": "与渐离并起",
									"req": { "flag": "jianli-tong" },
									"res": "筑声炸响，铜柱嗡鸣。渐离扑向卫士，你扑向王座——易水边的歌，唱到了咸阳宫的梁上。两个燕市醉汉，赌上了天下。",
									"eff": {
										"attrs": { "weiji": 30 },
										"dev": 40,
										"merit": "刺秦"
									},
									"to": [
										{
											"if": {
												"biancai": 60,
												"zgMax": 64
											},
											"to": { "ending": "E7" }
										},
										{
											"if": { "zgMax": 64 },
											"to": { "ending": "E6" }
										},
										{ "to": "5-5" }
									]
								}
							]
						},
						{
							"id": "5-5",
							"title": "环柱而走",
							"segs": ["秦王惊起，绝袖，环柱而走。秦法殿上不得持兵，群臣只能徒手搏你。御医⟦夏无且⟧的药囊砸在你肩上——只一挫。那一顿，够秦王绕过了柱子。", "王负剑！王负剑！殿下的呼喊炸开。长剑出鞘的声音从柱子后面传来——像一声迟到的雷。你握着匕首站在殿心——这一生所有的路，都通向这一刻。"],
							"options": [
								{
									"t": "再逐",
									"res": "你的剑划过王的臂膀，血溅丹墀——卫士的剑也到了。可惜就差一寸。你低头看靴面上那滴血：这一寸，隔着整个天下的气数。你笑了笑。",
									"eff": {
										"dev": 0,
										"hist": 15,
										"ach": "yaonang"
									},
									"to": [{
										"if": { "biancai": 45 },
										"to": {
											"ending": "E1",
											"variant": "shangqin"
										}
									}, { "to": {
										"ending": "E8",
										"variant": "yaonang"
									} }]
								},
								{
									"t": "弃图塞阶，以身当之",
									"res": "你把图匣横在阶口，秦吏的戈尖离你只有三尺。没有人喊你的名字——咸阳宫里没人知道你是谁。你像一道闸：被记住的，不是名字，是剑，是歌，是这一站。",
									"eff": {
										"dev": 0,
										"attrs": { "weiji": 5 }
									},
									"to": { "ending": "E8" }
								},
								{
									"t": "倚柱而笑，箕踞而骂",
									"hist": true,
									"res": "“事所以不成者，乃欲以生劫之，必得约契以报太子也！”你倚柱而笑，箕踞而骂。左右既前，斩荆轲——笑声先上了梁。这笑声，会比这座殿活得更久。",
									"eff": {
										"dev": 0,
										"hist": 30,
										"ach": "yaonang"
									},
									"to": { "ending": "E1" }
								},
								{
									"t": "掷匕击之",
									"res": "匕首脱手，钉入铜柱，火星四溅——这是你最后的一击。铜柱嗡嗡地响，像一声没唱完的歌。它没刺进那颗心跳，却把一首歌，钉在了咸阳宫的梁上。",
									"eff": {
										"dev": 0,
										"hist": 10
									},
									"to": {
										"ending": "E1",
										"variant": "tongzhu"
									}
								}
							]
						}
					]
				}
			],
			"CORRECTIONS": [
				{
					"minDev": 21,
					"maxDev": 45,
					"chance": .3,
					"title": "修正 ｜ 燕市流言",
					"segs": [
						"【历史修正】燕市的酒旗底下，开始有人编排你：卫人庆卿，靠的到底是剑，还是嘴？",
						"你改动的那几处人事，让人心里泛酸。酸话说给酸人听，越传越酸。",
						"凶手不必拔刀，唾沫就够。"
					],
					"eff": {
						"attrs": { "shengwang": -5 },
						"dev": 0
					}
				},
				{
					"minDev": 21,
					"maxDev": 45,
					"chance": .3,
					"title": "修正 ｜ 行囊被翻",
					"segs": [
						"【历史修正】回馆驿时，你的行囊被人翻过。衣物码得比原来还整齐——整齐得过了头。",
						"东西没少，多了一双眼睛的重量。",
						"预兆早有：前日巷口那个修履的，修得太久了。"
					],
					"eff": {
						"attrs": {
							"caifu": -3,
							"weiji": 3
						},
						"dev": 0
					}
				},
				{
					"minDev": 21,
					"maxDev": 45,
					"chance": .3,
					"title": "修正 ｜ 旧人疏远",
					"segs": [
						"【历史修正】一位邯郸旧识过燕而不入，只留下一句：“庆卿如今的局，不是我辈该问的。”",
						"话传到酒市，老朋友们都低了头，没人接茬。",
						"你改道的那一刻起，旧日的同路人就在一个个掉队。"
					],
					"eff": {
						"attrs": {
							"shengwang": -4,
							"weiji": 2
						},
						"dev": 0
					}
				},
				{
					"minDev": 46,
					"maxDev": 70,
					"chance": 1,
					"title": "修正 ｜ 太子再催",
					"segs": [
						"【历史修正】太子丹第三次遣人至门：“日已尽矣，荆卿岂无意哉？”",
						"使者这次连坐都没坐，话丢下就走。",
						"你改动的时间表，烧的是他的耐心。易水的风，被催得更急了。"
					],
					"eff": {
						"attrs": {
							"junxin": -5,
							"weiji": 8
						},
						"dev": 0
					}
				},
				{
					"minDev": 46,
					"maxDev": 70,
					"chance": 1,
					"title": "修正 ｜ 秦谍加码",
					"segs": [
						"【历史修正】黑市上传言：你的画像，在秦人手里已经传了两版。",
						"第二版连你左眉的断痕都画上了——见过你出剑的人，才能画得这么细。",
						"你改动的每一个环节，都惊动了秦廷的耳目。凶手不在殿上，就在你窗外。"
					],
					"eff": {
						"attrs": { "weiji": 12 },
						"dev": 0
					}
				},
				{
					"minDev": 46,
					"maxDev": 70,
					"chance": 1,
					"title": "修正 ｜ 渐离被疑",
					"segs": [
						"【历史修正】燕廷有人上书：高渐离与卫客过从甚密，宜加察问。",
						"书递上去那天，燕市的筑声歇了一晚。",
						"你拉进局里的人，先替你挨了第一刀。知交二字，在乱世是债。"
					],
					"eff": {
						"attrs": {
							"shengwang": -6,
							"junxin": -4
						},
						"dev": 0
					}
				},
				{
					"minDev": 71,
					"maxDev": 100,
					"chance": 1,
					"title": "修正 ｜ 天命反噬",
					"segs": [
						"【历史修正】你改得太多，触动的已不只是秦与燕——黑市的刀、太子的疑、秦廷的网，都朝一处收拢。",
						"馆驿的井水忽然发浑，檐角的乌鸦三天不散。",
						"历史在用所有人的手，把你推回它写好的那页。"
					],
					"eff": {
						"attrs": {
							"weiji": 18,
							"junxin": -8
						},
						"dev": 0
					}
				},
				{
					"minDev": 71,
					"maxDev": 100,
					"chance": 1,
					"title": "修正 ｜ 蒙嘉索贿",
					"segs": [
						"【历史修正】蒙嘉的门房第二次登门，笑得意味深长：“非常之时，非常之价。”",
						"你的改流惊动了门路——贪得无厌的人闻到了血腥味，要加钱。",
						"这国家的门，一道比一道贵，而且只能进，不能退。"
					],
					"eff": {
						"attrs": {
							"caifu": -10,
							"weiji": 10
						},
						"dev": 0
					}
				},
				{
					"minDev": 71,
					"maxDev": 100,
					"chance": 1,
					"title": "修正 ｜ 宫禁升级",
					"segs": [
						"【历史修正】咸阳宫忽然更换卫率，九宾之礼的仪程平添三道验看。",
						"换防那夜，宫城的火把从黄昏亮到五更。",
						"【秦王戒心】那双你将要面对的眼睛，先于你醒了。"
					],
					"eff": {
						"attrs": { "weiji": 12 },
						"zg": 8,
						"dev": 0
					}
				}
			],
			"ACHIEVEMENTS": {
				"lunjian": "论剑榆次",
				"gaoge": "燕市高歌",
				"tianguang": "田光之托",
				"fanshou": "樊於期之首",
				"yishui": "风萧易水",
				"tuxiong": "图穷匕见",
				"caomo": "曹沫再生",
				"fuyi": "拂衣秦廷",
				"yiji": "咸阳一击",
				"qichuang": "七创全身",
				"weihan": "易水未寒",
				"yaonang": "药囊之下",
				"shiwodai": "时不我待"
			},
			"KEY_NODE_NAMES": {
				"2-2": "受命",
				"3-1": "樊於期",
				"4-1": "易水",
				"5-3": "舞阳",
				"5-4": "图穷匕见"
			},
			"RANDOM_EVENTS": [
				{
					"id": "R-1",
					"title": "狗屠劝酒",
					"chapters": [0, 2],
					"segs": ["邻桌的狗屠拍着你的肩：卫人脸生啊——走一个？案上堆着狗骨，刀插在案缝里，酒气熏人，笑也熏人。"],
					"options": [{
						"t": "干了这碗",
						"res": "一碗浊酒下肚，燕赵的寒气退了三分。狗屠又给你满上：好酒量，像个燕人了。",
						"eff": {
							"attrs": { "weiji": -2 },
							"dev": 0
						},
						"to": "RETURN"
					}, {
						"t": "以茶代酒",
						"res": "狗屠愣了愣，大笑：是个狠人。满桌哄笑，没人再劝。",
						"eff": {
							"attrs": { "shengwang": 2 },
							"dev": 0
						},
						"to": "RETURN"
					}]
				},
				{
					"id": "R-2",
					"title": "棋友来信",
					"chapters": [0, 3],
					"cond": { "flag": "lujian" },
					"segs": ["鲁句践自邯郸捎来一局残棋，附言：这步棋，等你三年。信纸上有酒渍——显然又是赢了棋之后写的。棋枰上的旧怨，隔着五百里递了过来。"],
					"options": [{
						"t": "回赠一局",
						"res": "你在回信里落下最后一子。有些债，只有棋盘记得。",
						"eff": {
							"attrs": {
								"shengwang": 2,
								"weiji": -2
							},
							"dev": 0
						},
						"to": "RETURN"
					}, {
						"t": "搁下不回",
						"res": "你把信压在了剑匣底下，压得很轻，像怕惊动什么。",
						"eff": {
							"attrs": { "weiji": -1 },
							"dev": 0
						},
						"to": "RETURN"
					}]
				},
				{
					"id": "R-3",
					"title": "盖聂过燕",
					"chapters": [1, 3],
					"cond": { "flag": "gainie" },
					"segs": ["榆次故人盖聂过燕，在酒市里一眼就认出了你。他往你对头一坐，自己斟酒——剑客的叙旧，从来不用叙。"],
					"options": [{
						"t": "同饮叙旧",
						"res": "剑理没聊完，酒先见了底。他走时把你的剑穗正了正，什么都没说。",
						"eff": {
							"attrs": {
								"weiji": -4,
								"shengwang": 2
							},
							"dev": 0
						},
						"to": "RETURN"
					}, {
						"t": "避而不见",
						"res": "你绕开了那条街。江湖儿女，见不如不见——见了，话就多了。",
						"eff": {
							"attrs": { "weiji": -1 },
							"dev": 0
						},
						"to": "RETURN"
					}]
				},
				{
					"id": "R-4",
					"title": "太子召宴",
					"chapters": [2, 4],
					"cond": { "junxin": 25 },
					"segs": ["太子宫遣人送帖：今夜小宴，唯君一人。帖子的边角熏了香，印泥是新的——一个储君的\"唯君一人\"，从来都不是小意思。"],
					"options": [{
						"t": "赴宴",
						"res": "一席之间，太子三次避席。出来时，你的分量也更重了。",
						"eff": {
							"attrs": {
								"junxin": 4,
								"weiji": 2
							},
							"dev": 0
						},
						"to": "RETURN"
					}, {
						"t": "称疾辞宴",
						"res": "你把帖还了回去。太子宫的灯，那夜亮到五更。",
						"eff": {
							"attrs": {
								"junxin": -3,
								"weiji": -3
							},
							"dev": 0
						},
						"to": "RETURN"
					}]
				},
				{
					"id": "R-5",
					"title": "渐离新曲",
					"chapters": [1, 4],
					"cond": { "flag": "gaojianli" },
					"segs": ["高渐离新得一支曲子，抱筑来寻你。曲名他不说，只说：听听。筑往膝上一横，屋里就只剩他和弦了。"],
					"options": [{
						"t": "听他说曲",
						"res": "一曲终了，窗外天已微明。心里的皱褶，被抚平了几道。",
						"eff": {
							"attrs": { "weiji": -3 },
							"dev": 0
						},
						"to": "RETURN"
					}, {
						"t": "与他论剑",
						"res": "你说剑，他说筑。说着说着，剑理与筑声竟成了一理——都是一口气的事。",
						"eff": {
							"attrs": { "caixue": 3 },
							"dev": 0
						},
						"to": "RETURN"
					}]
				},
				{
					"id": "R-6",
					"title": "秦客探风",
					"chapters": [3, 5],
					"cond": { "weiji": 30 },
					"segs": ["馆驿来了个\"商人\"，口音却是关中的，问东问西。他讨价还价的功夫很糙，眼睛却一直在你的手上——秦人的探子，连脚底都站得像兵。"],
					"options": [{
						"t": "滴水不漏地敷衍",
						"res": "你陪他演了一个时辰的买卖人。他走时一无所获，茶都凉透了。",
						"eff": {
							"attrs": {
								"caixue": 2,
								"weiji": -2
							},
							"dev": 0
						},
						"to": "RETURN"
					}, {
						"t": "直接送客",
						"res": "门一关，干净。但那张脸，你记住了——颧骨很高，虎口有茧。",
						"eff": {
							"attrs": { "weiji": 3 },
							"dev": 0
						},
						"to": "RETURN"
					}]
				},
				{
					"id": "R-7",
					"title": "门客告急",
					"chapters": [1, 5],
					"segs": ["旧日受过你恩惠的门客深夜叩门：债主盈门，走投无路。他跪在门口不肯起来，雪落了一肩——乱世里的恩情，都是欠账。"],
					"options": [{
						"t": "倾囊相助",
						"res": "钱帛递出去，换来一个能把命交给你的背影。",
						"eff": {
							"attrs": {
								"caifu": -5,
								"shengwang": 3
							},
							"dev": 0
						},
						"to": "RETURN"
					}, {
						"t": "婉言辞谢",
						"res": "门关上，你听见他在门外站了很久，脚步声最后散了。",
						"eff": {
							"attrs": { "shengwang": -2 },
							"dev": 0
						},
						"to": "RETURN"
					}]
				},
				{
					"id": "R-8",
					"title": "夜磨匕首",
					"chapters": [3, 5],
					"cond": { "anyflag": ["xubi", "changbi"] },
					"segs": ["四更天，你把匕首取出来，在灯下慢慢地磨。磨石过刃的声音很轻，像蚕在吃叶。刃口映着烛火，像一线将冻的河。"],
					"options": [{
						"t": "磨到满意",
						"res": "刃口更利了，心也更静了。利器与人，都要夜夜收拾。",
						"eff": {
							"attrs": {
								"caixue": 2,
								"weiji": -2
							},
							"dev": 0
						},
						"to": "RETURN"
					}, {
						"t": "收鞘去睡",
						"res": "利器不示人。你把它收回鞘中，动作比取出时更慢。明天还有明天的路。",
						"eff": {
							"attrs": { "weiji": -3 },
							"dev": 0
						},
						"to": "RETURN"
					}]
				},
				{
					"id": "R-9",
					"title": "辽东商队",
					"chapters": [2, 5],
					"segs": ["一支辽东来的商队在市口歇脚，带着貂皮与东胡的消息。马背上结着霜，说话都冒着白气——北边冷，北边的路却是活的。"],
					"options": [{
						"t": "打听边情",
						"res": "辽东、代北、渔阳——你在心里补全了燕国最后几条退路。",
						"eff": {
							"attrs": { "caixue": 2 },
							"dev": 0
						},
						"to": "RETURN"
					}, {
						"t": "不问不理",
						"res": "边事与你无关。你的事在咸阳，在九重宫阙深处。",
						"eff": {
							"attrs": { "weiji": -1 },
							"dev": 0
						},
						"to": "RETURN"
					}]
				},
				{
					"id": "R-10",
					"title": "筑声隔墙",
					"chapters": [1, 4],
					"cond": { "flag": "gaojianli" },
					"segs": ["夜半，隔壁传来熟悉的筑声，比往常更沉。高渐离在隔壁，一个人喝酒。弦声一下一下，像在敲一堵看不见的墙。"],
					"options": [{
						"t": "叩门同醉",
						"res": "你们谁都没提明天。散场时他说：歌我都记着呢。",
						"eff": {
							"attrs": {
								"shengwang": 2,
								"caifu": -3
							},
							"dev": 0
						},
						"to": "RETURN"
					}, {
						"t": "隔街听罢",
						"res": "你听完最后一曲才睡。筑声止处，心事落地。",
						"eff": {
							"attrs": { "weiji": -2 },
							"dev": 0
						},
						"to": "RETURN"
					}]
				},
				{
					"id": "R-11",
					"title": "黑市风声",
					"chapters": [2, 5],
					"cond": { "weiji": 40 },
					"segs": ["黑市中间人递话：有人在打听燕使的行程，出价不低。递话的人说完就走，影子都没留下——价钱不低，说明问的人来头不小。"],
					"options": [{
						"t": "花钱买平安",
						"res": "金子过手，那双眼睛暂时闭上了。暂时。",
						"eff": {
							"attrs": {
								"caifu": -6,
								"weiji": -6
							},
							"dev": 0
						},
						"to": "RETURN"
					}, {
						"t": "随他去",
						"res": "你装作不知。当夜，枕下的匕首换了个更顺手的位置。",
						"eff": {
							"attrs": { "weiji": 4 },
							"dev": 0
						},
						"to": "RETURN"
					}]
				},
				{
					"id": "R-12",
					"title": "督亢守吏",
					"chapters": [3, 4],
					"segs": ["督亢来的守吏回蓟城述职，席间说起那片水土，眉飞色舞——桑麻几熟，河渠几条，他讲得比自家的院子还熟。你给他斟酒，他讲得更快了。"],
					"options": [
						{
							"t": "席间打点",
							"res": "几分薄礼，换来图册里不曾标注的几处关隘。",
							"eff": {
								"attrs": {
									"caifu": -4,
									"caixue": 2
								},
								"dev": 0
							},
							"to": "RETURN"
						},
						{
							"t": "静听不答",
							"res": "你把每个地名都记下了，一个字都没问。",
							"eff": {
								"attrs": {
									"caixue": 2,
									"weiji": 2
								},
								"dev": 0
							},
							"to": "RETURN"
						},
						{
							"t": "单独约谈，探尽虚实",
							"req": { "caixue": 45 },
							"res": "一席密谈，守吏把督亢的山川险易、关隘虚实倒了个干净，连哪段堤去年决过口都说了。",
							"eff": {
								"attrs": {
									"caixue": 3,
									"weiji": -3
								},
								"dev": 0
							},
							"to": "RETURN"
						}
					]
				}
			],
			"CRISIS_EVENTS": {
				"plots": [
					{
						"id": "C-1",
						"title": "秦谍盯梢",
						"segs": [
							"连日来，馆驿外的茶棚多了几个生面孔；你出门，总被\"顺路\"的人尾随。",
							"仆从擒住一个，那人咬破毒囊前只吐了半句：\"……蒙府。\"",
							"⟦蒙嘉⟧的门路漏了风。动机不必问——你带来的东西，值得秦人出钱。",
							"尸体拖出去的时候，茶棚的茶博士换了人。"
						],
						"options": [{
							"t": "重金反布眼线",
							"res": "金子递过去，墙外的眼睛成了你的眼睛。按日计费——乱世里，忠诚比消息贵。",
							"eff": {
								"attrs": {
									"caifu": -8,
									"weiji": -8
								},
								"dev": 0
							},
							"to": "RETURN"
						}, {
							"t": "不动声色",
							"res": "你装作毫无察觉，出入照旧。暗处的网收得更紧了，紧得能听见丝线的声音。",
							"eff": {
								"attrs": { "weiji": 6 },
								"dev": 0
							},
							"to": "RETURN"
						}]
					},
					{
						"id": "C-2",
						"title": "燕廷猜忌",
						"segs": [
							"太子宫里有人进谗：卫人荆轲，居燕数年，所图难测。",
							"预兆早有——前日赏赐下来，独你没有。",
							"你改了太多人的棋路，便有人先改你的。",
							"谗言这种东西，一旦开了头，就没有尾。"
						],
						"options": [{
							"t": "登门面陈",
							"res": "你把数月行迹一一摊开，连哪天买了几斤羊肉都说得清楚。太子笑了，进谗的人哑了。",
							"eff": {
								"attrs": {
									"junxin": 3,
									"weiji": -6
								},
								"dev": 0
							},
							"to": "RETURN"
						}, {
							"t": "清者自清",
							"res": "你不辩。谗言没有停，只是换了新的名目——清者自清，浊者自浊，但浊水先漫过门槛。",
							"eff": {
								"attrs": { "weiji": 6 },
								"dev": 0
							},
							"to": "RETURN"
						}]
					},
					{
						"id": "C-3",
						"title": "黑市杀价",
						"segs": [
							"黑市忽然挂出一笔暗花：买燕使一行的行踪，出价三千金。",
							"三千金——够买一座小城的城墙。你的行踪，值一座城。",
							"接暗花的是谁不知道，但你的路引、相貌、随从，昨夜都被人描了去。"
						],
						"options": [{
							"t": "出更高的价压下",
							"res": "四千。暗花撤了。黑市的规矩，钱就是规矩——只是这规矩，今夜保你，明夜未必。",
							"eff": {
								"attrs": {
									"caifu": -8,
									"weiji": -6
								},
								"dev": 0
							},
							"to": "RETURN"
						}, {
							"t": "设饵钓出买家",
							"res": "假行程放出去，买家露头了——是燕国自己人。你忽然不知道该怪谁，剑在鞘里躺了一夜，没有出鞘的理由。",
							"eff": {
								"attrs": {
									"weiji": 5,
									"shengwang": -3
								},
								"dev": 0
							},
							"to": "RETURN"
						}]
					}
				],
				"death": {
					"id": "C-DEATH",
					"title": "杀机已至",
					"segs": [
						"秦廷的缇骑到了馆驿门前——不是问话，是拿人。",
						"马蹄声砸在青石板上，一条街都空了。",
						"仆从撞开门时，你的手已经按在枕下的匕首上。",
						"你还有最后一次挣扎的机会。"
					],
					"options": [
						{
							"t": "散尽家财，买命脱身",
							"req": { "caifu": 30 },
							"res": "万金散去，追兵的方向\"恰好\"错了一夜。天亮之前，你已经换了三家客栈。",
							"eff": {
								"attrs": {
									"caifu": -30,
									"weiji": -25
								},
								"dev": 0
							},
							"to": "RETURN"
						},
						{
							"t": "以辩脱罪",
							"req": { "biancai": 50 },
							"res": "你自缚请见，一席话说得缇骑收刀回禀。刀还在，麻烦也还在——只是都暂时挂在了别人腰间。",
							"eff": {
								"attrs": {
									"weiji": -15,
									"junxin": -5
								},
								"dev": 0
							},
							"to": "RETURN"
						},
						{
							"t": "坐以待毙",
							"res": "你搁下匕首，整衣危坐。门外的脚步声越来越近，你给自己斟了最后一碗酒。",
							"eff": {
								"attrs": { "weiji": 15 },
								"dev": 0
							},
							"to": "RETURN"
						}
					]
				}
			},
			"ACTIONS": [
				{
					"desc": "闭门著文，以文养名",
					"res": "数月之功，文成一卷。士林传抄，也有人抄给了不想让你出名的人——名是出去了，眼睛也进来了。",
					"id": "JK-ACT-1",
					"name": "著书立说",
					"eff": {
						"dev": 0,
						"attrs": {
							"weiji": 2,
							"caixue": 3,
							"shengwang": 1
						}
					},
					"descHidden": "闭门著文，以文养名",
					"chapters": [0, 5],
					"type": "进取"
				},
				{
					"desc": "置酒结客（财富-8）",
					"res": "一场大宴，宾主尽欢。散场时多了几个肯替你说话的人，也多了几条门路——酒钱肉疼，人情是值的。",
					"eff": {
						"dev": 0,
						"attrs": {
							"caifu": -8,
							"biancai": 1,
							"junxin": 1,
							"quanshi": 1,
							"shengwang": 3
						}
					},
					"id": "JK-ACT-2",
					"name": "置酒高会",
					"descHidden": "置酒结客（大耗财）",
					"req": { "caifu": 8 },
					"chapters": [0, 5],
					"type": "兑换"
				},
				{
					"desc": "趋府问安，固宠于上（需入燕）",
					"res": "你在阶下站了两个时辰，换来三句问话。值。门客说你谄，你说他们酸——东宫的门路，本就是一阶一阶站出来的。",
					"eff": {
						"dev": 0,
						"attrs": {
							"weiji": 2,
							"junxin": 3,
							"biancai": 1,
							"shengwang": -1
						}
					},
					"id": "JK-ACT-3",
					"name": "太子府问安",
					"descHidden": "趋府问安，固宠于上（需入燕）",
					"req": { "minChapter": 1 },
					"chapters": [0, 5],
					"type": "进取"
				},
				{
					"desc": "白日读书，灯下击剑",
					"res": "书读进去了，剑也顺了。乱世里难得的整时辰，烛花爆了两回，你都舍不得剪。",
					"id": "JK-ACT-4",
					"name": "读书击剑",
					"eff": {
						"dev": 0,
						"attrs": {
							"wuli": 1,
							"weiji": -1,
							"caixue": 2,
							"tupo": -1
						}
					},
					"descHidden": "白日读书，灯下击剑",
					"chapters": [0, 5],
					"type": "守成"
				},
				{
					"desc": "厚币招贤（财富-8）",
					"res": "千金散尽，门下多了几十张嘴，也多了几十双替你看路的眼睛。钱财是流水，人心是堤坝。",
					"eff": {
						"dev": 0,
						"attrs": {
							"weiji": -4,
							"caifu": -8,
							"biancai": 1,
							"shengwang": 2
						}
					},
					"id": "JK-ACT-5",
					"name": "散财结客",
					"descHidden": "厚币招贤（大耗财）",
					"req": { "caifu": 8 },
					"chapters": [0, 5],
					"type": "保身"
				},
				{
					"desc": "闭门称病，避人锋芒（需入局）",
					"res": "病假话递出去，门前清净了几日。探病的人来了几拨，真心难辨——谁先来、谁后到，你都躺在榻上记下了。",
					"eff": {
						"dev": 0,
						"attrs": {
							"tupo": 1,
							"weiji": -5,
							"junxin": -2,
							"quanshi": -3
						}
					},
					"id": "JK-ACT-6",
					"name": "称病闭户",
					"descHidden": "闭门称病，避人锋芒（需入局）",
					"req": { "minChapter": 2 },
					"chapters": [0, 5],
					"type": "保身"
				},
				{
					"desc": "晨起习剑，筋骨与剑俱进",
					"res": "你鸡鸣即起，庭前剑光起落三百回。汗水换了几身衣衫，臂上的力道一日日攒了下来——剑是旧剑，使剑的人已不是从前那人。",
					"id": "JK-ACT-43",
					"name": "习剑强身",
					"eff": {
						"dev": 0,
						"attrs": {
							"wuli": 3,
							"caifu": -1,
							"tupo": 1
						}
					},
					"descHidden": "晨起习剑，筋骨与剑俱进",
					"chapters": [0, 5],
					"type": "守成"
				},
				{
					"desc": "调息导引，养精神于未衰",
					"res": "你闭户调息，依图导引，吐纳之间气血渐顺。门外的人久不见你露面，揣测便淡了——养的是精神，顺带养了一份清静。",
					"id": "JK-ACT-44",
					"name": "导引养生",
					"eff": {
						"dev": 0,
						"attrs": {
							"tupo": 2,
							"weiji": -1
						}
					},
					"descHidden": "调息导引，养精神于未衰",
					"chapters": [0, 5],
					"type": "守成"
				},
				{
					"desc": "与游侠儿试剑",
					"res": "三场两胜。你的袖口被划破一道，他的名字被你记住一个。收剑时他拱手的手势，比出剑时诚恳。",
					"id": "JK-ACT-7",
					"name": "切磋剑术",
					"eff": {
						"dev": 0,
						"attrs": {
							"wuli": 2,
							"weiji": 2,
							"caixue": 3
						}
					},
					"descHidden": "与游侠儿试剑",
					"chapters": [0, 0],
					"type": "守成"
				},
				{
					"desc": "仗剑解人之厄（财富-3）",
					"res": "泼皮散了，老翁要给你磕头。这事当天传遍半座榆次城——侠名一半是打出来的，一半是说出来的。",
					"eff": {
						"dev": 0,
						"attrs": {
							"wuli": 1,
							"caifu": -3,
							"shengwang": 3
						}
					},
					"id": "JK-ACT-8",
					"name": "路见不平",
					"descHidden": "仗剑解人之厄（耗财）",
					"req": { "caifu": 3 },
					"chapters": [0, 0],
					"type": "兑换"
				},
				{
					"desc": "相马贩马，以资川旅",
					"res": "转手两匹驽马，囊中充裕了些。马市的人笑你：剑客也识钱？你没接话——剑客的盘缠，也是一刀一刀省出来的。",
					"id": "JK-ACT-9",
					"name": "贩马于市",
					"eff": {
						"dev": 0,
						"attrs": {
							"shengwang": -2,
							"caifu": 3
						}
					},
					"descHidden": "相马贩马，以资川旅",
					"chapters": [0, 0],
					"type": "兑换"
				},
				{
					"desc": "观棋不语，悟局中势",
					"res": "看了一天棋，没下一子。有人问你懂棋吗，你说：懂一点势。那人似懂非懂——天下的棋，也是这么看的。",
					"id": "JK-ACT-10",
					"name": "棋摊观弈",
					"eff": {
						"dev": 0,
						"attrs": {
							"weiji": -1,
							"caixue": 1,
							"moulue": 1
						}
					},
					"descHidden": "观棋不语，悟局中势",
					"chapters": [0, 0],
					"type": "守成"
				},
				{
					"desc": "折节下交，缓急有援（财富-3）",
					"res": "三教九流都认得你了。乱世里，名单就是路，门路就是命。散场时有人拍胸脯：荆兄有事，言语一声。",
					"eff": {
						"dev": 0,
						"attrs": {
							"quanshi": 1,
							"caifu": -3,
							"biancai": 2,
							"shengwang": 2
						}
					},
					"id": "JK-ACT-11",
					"name": "结交博徒",
					"descHidden": "折节下交，缓急有援（耗财）",
					"req": { "caifu": 3 },
					"chapters": [0, 0],
					"type": "兑换"
				},
				{
					"desc": "野寺一宿，省资养力（财富-2）",
					"res": "佛前一盏灯，身外一场雨。你在蒲团上睡到自然醒，醒来时雨停了，剑还在手边——这样的日子，过一天少一天。",
					"eff": {
						"dev": 0,
						"attrs": {
							"tupo": 1,
							"caifu": -2,
							"weiji": -3
						}
					},
					"id": "JK-ACT-12",
					"name": "野寺借宿",
					"descHidden": "野寺一宿，省资养力（微耗财）",
					"req": { "caifu": 2 },
					"chapters": [0, 0],
					"type": "保身"
				},
				{
					"desc": "市上较艺，名起亦招忌",
					"res": "你在空场上较艺演武，围观的人越聚越多。喝彩声传遍半座城，也传进了几双不好惹的眼睛里——乡野的武名，一半是敬，一半是忌。",
					"id": "JK-ACT-45",
					"name": "市上较艺",
					"eff": {
						"dev": 0,
						"attrs": {
							"wuli": 2,
							"weiji": 1,
							"shengwang": 1
						}
					},
					"descHidden": "市上较艺，名起亦招忌",
					"chapters": [0, 0],
					"type": "守成"
				},
				{
					"desc": "风餐露宿，筋骨换脚程",
					"res": "你在野寺与檐下宿了一路，替人负米赶车，肩头的茧厚了一层，囊中的钱也多了几枚。游侠的脚程与身板，都是这么熬出来的。",
					"id": "JK-ACT-46",
					"name": "风餐野宿",
					"eff": {
						"dev": 0,
						"attrs": {
							"tupo": 2,
							"caifu": 1
						}
					},
					"descHidden": "风餐露宿，筋骨换脚程",
					"chapters": [0, 0],
					"type": "守成"
				},
				{
					"desc": "燕市听筑，且放胸怀",
					"res": "筑声一起，满座皆醉。你听得忘了添酒，曲终人散，还在原地坐了一刻。有人问曲中何意，你随口答了三句，满座又静了一回。",
					"id": "JK-ACT-13",
					"name": "听筑消夜",
					"eff": {
						"dev": 0,
						"attrs": {
							"tupo": 1,
							"weiji": -3,
							"biancai": 1
						}
					},
					"descHidden": "燕市听筑，且放胸怀",
					"chapters": [1, 1],
					"type": "保身"
				},
				{
					"desc": "与狗屠辈共饮（财富-3）",
					"res": "狗屠的话糙，理不糙。三碗下肚，燕市没有你不知道的事——市井的耳朵，比朝堂的更灵。",
					"eff": {
						"dev": 0,
						"attrs": {
							"caifu": -3,
							"biancai": 1,
							"shengwang": 2
						}
					},
					"id": "JK-ACT-14",
					"name": "与屠沽饮",
					"descHidden": "与狗屠辈共饮（耗财）",
					"req": { "caifu": 3 },
					"chapters": [1, 1],
					"type": "兑换"
				},
				{
					"desc": "教童子剑，以技易粟",
					"res": "束脩不多，够吃半月。孩子们喊你师父，你摆摆手：不敢当。他们练剑的架势歪歪扭扭，眼睛却很亮。",
					"id": "JK-ACT-15",
					"name": "授剑糊口",
					"eff": {
						"dev": 0,
						"attrs": {
							"wuli": 1,
							"caifu": 3,
							"weiji": 2
						}
					},
					"descHidden": "教童子剑，以技易粟",
					"chapters": [1, 1],
					"type": "兑换"
				},
				{
					"desc": "打听东宫动静（声望≥30 才有人搭话）",
					"res": "太子宫每日进出多少人、哪辆车是太子丹的，你默默记下了。不为别的——乱世里，门朝哪边开，都要先看清。",
					"eff": {
						"dev": 0,
						"attrs": {
							"weiji": -1,
							"caixue": 1,
							"moulue": 1
						}
					},
					"id": "JK-ACT-16",
					"name": "探太子宫",
					"descHidden": "打听东宫动静（声望不足则无人搭话）",
					"req": { "shengwang": 30 },
					"chapters": [1, 1],
					"type": "守成"
				},
				{
					"desc": "寄书卫中故人",
					"res": "信走了半月，回了一行字：家中都好，勿念。你折好收起——一行字，比信纸还薄，却压得住乡愁。",
					"id": "JK-ACT-17",
					"name": "修书故里",
					"eff": {
						"dev": 0,
						"attrs": {
							"caixue": 1,
							"weiji": -2
						}
					},
					"descHidden": "寄书卫中故人",
					"chapters": [1, 1],
					"type": "保身"
				},
				{
					"desc": "张宴三日，扬名立万（财富-6）",
					"res": "三日流水席，燕市尽知卫客之名。也有人暗中记下了你的阔绰——名与祸，常常是一同进门的。",
					"eff": {
						"dev": 0,
						"attrs": {
							"caifu": -6,
							"biancai": 1,
							"shengwang": 3
						}
					},
					"id": "JK-ACT-18",
					"name": "燕市豪宴",
					"descHidden": "张宴三日，扬名立万（颇耗财）",
					"req": { "caifu": 6 },
					"chapters": [1, 1],
					"type": "兑换"
				},
				{
					"desc": "城郊练剑，剑气欺霜",
					"res": "霜还没化，你已在城郊走完了第三路剑。早起拾粪的老农看你舞到兴处，放下粪叉看了一袋烟的工夫。",
					"id": "JK-ACT-47",
					"name": "晨剑于郊",
					"eff": {
						"dev": 0,
						"attrs": {
							"wuli": 2,
							"tupo": 1
						}
					},
					"descHidden": "城郊练剑，剑气欺霜",
					"chapters": [1, 1],
					"type": "守成"
				},
				{
					"desc": "肉案帮佣，气力换钱",
					"res": "你替狗屠抬了半月的肉案子，气力换来几吊钱。狗屠过意不去，多切了一斤肉送你——市井的交情，都在斤两里。",
					"id": "JK-ACT-48",
					"name": "屠沽帮佣",
					"eff": {
						"dev": 0,
						"attrs": {
							"tupo": 2,
							"caifu": 1
						}
					},
					"descHidden": "肉案帮佣，气力换钱",
					"chapters": [1, 1],
					"type": "守成"
				},
				{
					"desc": "一爵还酹，以答知己",
					"res": "你浇了三次酒。风过处，坟前的草朝着秦国方向倒伏。老人听不见，你还是把近日的事一五一十说了一遍——这一席话，说得比哪个宴席上都清楚。",
					"id": "JK-ACT-19",
					"name": "谒田光墓",
					"eff": {
						"dev": 0,
						"attrs": {
							"weiji": -1,
							"biancai": 1,
							"shengwang": 2
						}
					},
					"descHidden": "一爵还酹，以答知己",
					"chapters": [2, 2],
					"type": "进取"
				},
				{
					"desc": "与太子门下宾客往来",
					"res": "太子宫的宾客各有心思。你记下谁可交、谁须防。宴席散后，名单在心里又过了一遍——东宫的人脉，一条条都连上了你的线。",
					"id": "JK-ACT-20",
					"name": "周旋宾客",
					"eff": {
						"dev": 0,
						"attrs": {
							"quanshi": 1,
							"biancai": 1,
							"junxin": 2,
							"weiji": 2,
							"zhengji": 1
						}
					},
					"descHidden": "与太子门下宾客往来",
					"chapters": [2, 2],
					"type": "进取"
				},
				{
					"desc": "打探秦廷消息",
					"res": "咸阳来的每一条消息你都听了三遍。听得多了，秦廷也听见了你——消息是双向的路，你的脚步声也在路上。",
					"id": "JK-ACT-21",
					"name": "密探秦讯",
					"eff": {
						"dev": 0,
						"zg": 3,
						"attrs": {
							"caixue": 2,
							"moulue": 1
						}
					},
					"descHidden": "打探秦廷消息",
					"chapters": [2, 2],
					"type": "进取"
				},
				{
					"desc": "检点行装器物（财富-3）",
					"res": "函匣、图轴、车轫、干粮，逐项过手。错漏止于此夜——临行前的错漏，出了燕国就是性命。",
					"eff": {
						"dev": 0,
						"attrs": {
							"weiji": -2,
							"caifu": -3,
							"moulue": 1,
							"zhengji": 1
						}
					},
					"id": "JK-ACT-22",
					"name": "督造行装",
					"descHidden": "检点行装器物（耗财）",
					"req": { "caifu": 3 },
					"chapters": [2, 2],
					"type": "兑换"
				},
				{
					"desc": "鬻剑上之饰以充川资",
					"res": "剑饰卖尽，剑还在。懂行的人看你，像看一个落魄的人。落魄就落魄吧——剑在，人就在。",
					"id": "JK-ACT-23",
					"name": "变卖剑饰",
					"eff": {
						"dev": 0,
						"attrs": {
							"shengwang": -2,
							"caifu": 3
						}
					},
					"descHidden": "鬻剑上之饰以充川资",
					"chapters": [2, 2],
					"type": "兑换"
				},
				{
					"desc": "驰马易水之滨",
					"res": "马跑得极快，风把胸口吹得透亮。易水的水，比想象中冷。你在岸边勒马站了很久，没有人来催。",
					"id": "JK-ACT-24",
					"name": "纵马易水",
					"eff": {
						"dev": 0,
						"attrs": {
							"tupo": 1,
							"weiji": -3
						}
					},
					"descHidden": "驰马易水之滨",
					"chapters": [2, 2],
					"type": "保身"
				},
				{
					"desc": "入幕画策，为燕谋退路",
					"res": "你为⟦太子丹⟧谋划辽东、代北的退路与蓟城的守备，一条条写在简上。太子看完沉默良久，说：燕国欠你一策。筹策多了，看不见的眼睛也多了。",
					"id": "JK-ACT-49",
					"name": "为太子画策",
					"eff": {
						"dev": 0,
						"attrs": {
							"weiji": 2,
							"moulue": 1,
							"zhengji": 2
						}
					},
					"descHidden": "入幕画策，为燕谋退路",
					"chapters": [2, 2],
					"type": "进取"
				},
				{
					"desc": "闭门演剑，朝夕揣摩",
					"res": "你在院中反复走同一路剑，起手、转折、收势，各自拆了百遍。门客问练的什么剑，你答：防身的。剑光映在墙上，像一个说不出口的名字。",
					"id": "JK-ACT-50",
					"name": "闭门演剑",
					"eff": {
						"dev": 0,
						"attrs": {
							"wuli": 2,
							"weiji": 1,
							"tupo": 1
						}
					},
					"descHidden": "闭门演剑，朝夕揣摩",
					"chapters": [2, 2],
					"type": "守成"
				},
				{
					"desc": "安抚樊於期从亡之士",
					"res": "那些秦人红着眼眶散了。你答应他们：仇，有人替他们记。记仇的人，自己心里也多了一道口子。",
					"id": "JK-ACT-25",
					"name": "抚樊旧部",
					"eff": {
						"dev": 0,
						"attrs": {
							"weiji": -3,
							"biancai": 1,
							"shengwang": 1
						}
					},
					"descHidden": "安抚樊於期从亡之士",
					"chapters": [3, 3],
					"type": "保身"
				},
				{
					"desc": "亲验函匣封识",
					"res": "封识完好后你才合匣。这件事上，错一处就是死。匣盖合上的声音很轻，你听得很重。",
					"id": "JK-ACT-26",
					"name": "验看函首",
					"eff": {
						"dev": 0,
						"attrs": { "weiji": -1 }
					},
					"descHidden": "亲验函匣封识",
					"chapters": [3, 3],
					"type": "保身"
				},
				{
					"desc": "督亢山川默记于心（才学≥45 方能成图）",
					"res": "合上眼，督亢的城郭河渠都在你脑子里展开。哪条渠先画，哪座城后展，你比画图的吏员还熟。",
					"eff": {
						"dev": 0,
						"attrs": {
							"tupo": -1,
							"caixue": 2,
							"moulue": 1
						}
					},
					"id": "JK-ACT-27",
					"name": "复核地形",
					"descHidden": "督亢山川默记于心（才学不足则难成图）",
					"req": { "caixue": 45 },
					"chapters": [3, 3],
					"type": "守成"
				},
				{
					"desc": "验淬毒之效",
					"res": "血濡缕，无不立死。你把刀刃上的血擦净，沉默了很久——死物尚且如此，何况人。",
					"id": "JK-ACT-28",
					"name": "试毒验匕",
					"eff": {
						"dev": 0,
						"attrs": {
							"caixue": 1,
							"weiji": 3
						}
					},
					"descHidden": "验淬毒之效",
					"chapters": [3, 3],
					"type": "进取"
				},
				{
					"desc": "打点少府胥吏（财富-5）",
					"res": "少府的册子上，你的名字被挪到了\"不必细查\"那一页。那一页的纸，比别的页都贵。",
					"eff": {
						"dev": 0,
						"attrs": {
							"weiji": -3,
							"caifu": -5
						}
					},
					"id": "JK-ACT-29",
					"name": "贿赂少府",
					"descHidden": "打点少府胥吏（颇耗财）",
					"req": { "caifu": 5 },
					"chapters": [3, 3],
					"type": "保身"
				},
				{
					"desc": "闭门不见外客",
					"res": "门一关，是非就进不来了。敲门声响了三次，你没应。第四次没有再来——清净，有时候是等出来的。",
					"id": "JK-ACT-30",
					"name": "杜门谢客",
					"eff": {
						"dev": 0,
						"attrs": {
							"tupo": 1,
							"weiji": -3,
							"shengwang": -2
						}
					},
					"descHidden": "闭门不见外客",
					"chapters": [3, 3],
					"type": "保身"
				},
				{
					"desc": "统筹使团庶务，事事躬亲",
					"res": "函匣的封识、图轴的装裱、币帛的数目、车从的编排，你逐项过目，亲手登记。使团上下只知有位较真的上宾——差事办得越细，册上的名字就越多。",
					"id": "JK-ACT-51",
					"name": "佐理使务",
					"eff": {
						"dev": 0,
						"attrs": {
							"weiji": 2,
							"moulue": 1,
							"zhengji": 2
						}
					},
					"descHidden": "统筹使团庶务，事事躬亲",
					"chapters": [3, 3],
					"type": "进取"
				},
				{
					"desc": "贵邸授剑，束脩充使费",
					"res": "燕邸的贵介子弟慕名来学剑，束脩颇为丰厚。你教得敷衍，他们学得认真——使团的用度，就这么一剑一剑教了出来。",
					"id": "JK-ACT-52",
					"name": "燕邸授剑",
					"eff": {
						"dev": 0,
						"attrs": {
							"wuli": 1,
							"caifu": 3
						}
					},
					"descHidden": "贵邸授剑，束脩充使费",
					"chapters": [3, 3],
					"type": "守成"
				},
				{
					"desc": "最后的检点",
					"res": "行囊不过一肩，心事却有千钧。你掂了掂，都带上。最后放进去的，是一小包燕市的土。",
					"id": "JK-ACT-31",
					"name": "整束行装",
					"eff": {
						"dev": 0,
						"attrs": { "weiji": -2 }
					},
					"descHidden": "最后的检点",
					"chapters": [4, 4],
					"type": "保身"
				},
				{
					"desc": "与渐离对坐",
					"res": "该交代的你都说得清清楚楚，唯独没提明天。散场时他说：歌我都记着呢。你点头——记着就好，总得有人记着。",
					"id": "JK-ACT-32",
					"name": "筑前话别",
					"eff": {
						"dev": 0,
						"attrs": {
							"biancai": 1,
							"weiji": -2
						}
					},
					"descHidden": "与渐离对坐",
					"chapters": [4, 4],
					"type": "保身"
				},
				{
					"desc": "趁夜暗渡（财富-3）",
					"res": "船家不问来路。水到中流，你回头看了一眼北岸——灯火稀稀落落，像一局没下完的棋。",
					"eff": {
						"dev": 0,
						"attrs": {
							"tupo": 1,
							"caifu": -3,
							"weiji": -3
						}
					},
					"id": "JK-ACT-33",
					"name": "夜渡易水",
					"descHidden": "趁夜暗渡（耗财）",
					"req": { "caifu": 3 },
					"chapters": [4, 4],
					"type": "保身"
				},
				{
					"desc": "往来尺素尽付一炬",
					"res": "火光里你忽然想：这些字本来都是清白，如今却要当罪证来烧。纸灰扬起又落下，你一片都没留。",
					"id": "JK-ACT-34",
					"name": "焚尽书信",
					"eff": {
						"dev": 0,
						"attrs": {
							"shengwang": -3,
							"weiji": -3
						}
					},
					"descHidden": "往来尺素尽付一炬",
					"chapters": [4, 4],
					"type": "保身"
				},
				{
					"desc": "白衣之饯（财富-4）",
					"res": "你举爵致辞，满岸鸦雀无声。来送你的人比想象的多。酒过三巡，没人笑得出来。白衣白得晃眼，像提前下的一场雪。",
					"eff": {
						"dev": 0,
						"attrs": {
							"caifu": -4,
							"biancai": 1,
							"shengwang": 3
						}
					},
					"id": "JK-ACT-35",
					"name": "饯行众客",
					"descHidden": "白衣之饯（耗财）",
					"req": { "caifu": 4 },
					"chapters": [4, 4],
					"type": "兑换"
				},
				{
					"desc": "默念遗命，以定心神",
					"res": "田光按剑的样子，你想了一遍，又压下去一遍。压不下去的那一遍，就让它留着——留着才有力气。",
					"id": "JK-ACT-36",
					"name": "默祷田光",
					"eff": {
						"dev": 0,
						"attrs": { "weiji": -3 }
					},
					"descHidden": "默念遗命，以定心神",
					"chapters": [4, 4],
					"type": "保身"
				},
				{
					"desc": "易水之滨，临行试刃",
					"res": "你在⟦易水⟧边上把剑走完了最后三遍。水风寒得刺骨，剑意却越走越顺——过了这条水，这柄剑就不是用来试的了。",
					"id": "JK-ACT-53",
					"name": "寒水试剑",
					"eff": {
						"dev": 0,
						"attrs": {
							"wuli": 2,
							"tupo": 1
						}
					},
					"descHidden": "易水之滨，临行试刃",
					"chapters": [4, 4],
					"type": "守成"
				},
				{
					"desc": "鬻车于市，充西行之用",
					"res": "随行的车马在市口卖了，换成金饼贴身收好。人言燕使寒酸至此——你数着金饼没有接话：西行千里，轻便比体面值钱。",
					"id": "JK-ACT-54",
					"name": "鬻车充行",
					"eff": {
						"dev": 0,
						"attrs": {
							"shengwang": -1,
							"caifu": 3
						}
					},
					"descHidden": "鬻车于市，充西行之用",
					"chapters": [4, 4],
					"type": "兑换"
				},
				{
					"desc": "门路再上一层（财富-5）",
					"res": "蒙府的门房见你，腰弯得比上次更低了一寸。金子能买的不是忠诚，是腰弯的角度——弯到某个角度，门路就成了你的门路。",
					"eff": {
						"dev": 0,
						"attrs": {
							"caifu": -5,
							"quanshi": 2,
							"junxin": 1
						}
					},
					"id": "JK-ACT-37",
					"name": "再贿蒙府",
					"descHidden": "门路再上一层（颇耗财）",
					"req": { "caifu": 5 },
					"chapters": [5, 5],
					"type": "兑换"
				},
				{
					"desc": "记下宫城换防",
					"res": "卫率几时换岗、哪道门最松，你都在心里排了一遍。排完才发现，手心全是汗。",
					"id": "JK-ACT-38",
					"name": "观察宫卫",
					"eff": {
						"dev": 0,
						"attrs": {
							"weiji": 2,
							"caixue": 2,
							"moulue": 1
						}
					},
					"descHidden": "记下宫城换防",
					"chapters": [5, 5],
					"type": "进取"
				},
				{
					"desc": "深居简出，养精蓄锐",
					"res": "馆门三日不出。秦人的眼睛找不到焦点，渐渐散了。第四天开门，阳光刺眼得像殿上的金。",
					"id": "JK-ACT-39",
					"name": "使馆深居",
					"eff": {
						"dev": 0,
						"attrs": {
							"tupo": 1,
							"weiji": -3
						}
					},
					"descHidden": "深居简出，养精蓄锐",
					"chapters": [5, 5],
					"type": "保身"
				},
				{
					"desc": "对烛自陈，字字磨洗",
					"res": "要说的话在舌头上过了百遍。到时候，一个字都不能错——错一个字，错的就不是话，是命。",
					"id": "JK-ACT-40",
					"name": "演练辞令",
					"eff": {
						"dev": 0,
						"attrs": {
							"tupo": -1,
							"biancai": 2,
							"caixue": 3,
							"zhengji": 1
						}
					},
					"descHidden": "对烛自陈，字字磨洗",
					"chapters": [5, 5],
					"type": "守成"
				},
				{
					"desc": "结纳宫中耳目（财富-6）",
					"res": "金子进宫墙的缝隙，话从缝隙里递回来。宫里那一双眼睛替你眯了一眯——宦者的笑比金子还假，但消息是真的。",
					"eff": {
						"dev": 0,
						"zg": -4,
						"attrs": { "caifu": -6 }
					},
					"id": "JK-ACT-41",
					"name": "收买宦者",
					"descHidden": "结纳宫中耳目（颇耗财）",
					"req": { "caifu": 6 },
					"chapters": [5, 5],
					"type": "保身"
				},
				{
					"desc": "枕下之匕，夜夜亲验",
					"res": "刃口映着烛火，像一线将冻的河。你把它放回最顺手的位置——顺手到闭眼也能摸到，它现在是你的一部分。",
					"id": "JK-ACT-42",
					"name": "夜查匕首",
					"eff": {
						"dev": 0,
						"attrs": {
							"wuli": 1,
							"weiji": -1,
							"caixue": 1
						}
					},
					"descHidden": "枕下之匕，夜夜亲验",
					"chapters": [5, 5],
					"type": "守成"
				},
				{
					"desc": "觐见仪程，步步预演",
					"res": "拜起、趋步、献图、奏对，你在客舍里对着屏风走了十几遍。秦国最讲究这些——仪程上错半步，殿上的话就轮不到你说了。副使看你念念有词，只当你怯场。",
					"id": "JK-ACT-55",
					"name": "殿前演礼",
					"eff": {
						"dev": 0,
						"attrs": {
							"weiji": 1,
							"biancai": 2,
							"caixue": 1
						}
					},
					"descHidden": "觐见仪程，步步预演",
					"chapters": [5, 5],
					"type": "守成"
				},
				{
					"desc": "分藏金帛，以备不虞",
					"res": "馆中的金帛悄悄分藏到了几处。咸阳的耳目不是没有察觉，报上去的措辞是\"燕客多疑\"——多疑就多疑，西行的人，本就该先想好退路。",
					"id": "JK-ACT-56",
					"name": "分藏金帛",
					"eff": {
						"dev": 0,
						"attrs": {
							"shengwang": -1,
							"caifu": 2
						}
					},
					"descHidden": "分藏金帛，以备不虞",
					"chapters": [5, 5],
					"type": "兑换"
				},
				{
					"desc": "榆次酒肆，盖聂复会——当年的怒目，化得开，化不开",
					"id": "JK-ACT-57",
					"name": "榆次再论剑",
					"descHidden": "榆次酒肆，盖聂复会——当年的怒目，化得开，化不开",
					"choice": {
						"segs": ["再入榆次，你从当年的酒肆门前过。盖聂坐在老位子上，看见你，没有动——只把酒碗推过来半寸。那个动作，比一句话还长。", "他开口，声音比当年沉了半分：“剑，练到哪一步了？”你接过那半碗酒，碗沿还留着他的手温。"],
						"options": [
							{
								"t": "取剑论道，一笑泯恩仇",
								"eff": {
									"attrs": {
										"wuli": 3,
										"shengwang": 2
									},
									"flags": ["gainie"],
									"dev": 0
								},
								"res": "剑出鞘三寸，他点头：有成。你们隔碗大笑——当年的怒目，只是两道互相打量的目光。"
							},
							{
								"t": "席间论剑理，只谈不谈剑",
								"eff": {
									"attrs": {
										"caixue": 2,
										"shengwang": 1
									},
									"dev": 0
								},
								"res": "你只与他论剑理。他听了一盏茶，叹道：你学会收锋芒了——这把剑，利了三分，也藏了三分。"
							},
							{
								"t": "辞别而去，不问旧事",
								"eff": {
									"attrs": { "weiji": -2 },
									"dev": 0
								},
								"res": "你没有进店，只在门口站了站，便走了。有些旧事，问起来是酒，不问是河。"
							}
						]
					},
					"chapters": [0, 0],
					"type": "抉择"
				},
				{
					"desc": "燕市狗屠与高渐离击筑相和——入席，还是独饮",
					"id": "JK-ACT-58",
					"name": "狗屠击筑",
					"descHidden": "燕市狗屠与高渐离击筑相和——入席，还是独饮",
					"choice": {
						"segs": ["燕市狗屠的刀剁在案板上，高渐离的筑声落在刀声里——一刚一柔，竟合得天衣无缝。你常在那里买酒。", "那日筑声歇了，狗屠忽然开口：“客，听得出门道。”不是问句——他看你，像看一把认识很久的刀。"],
						"options": [
							{
								"t": "入席共饮，击节相和",
								"eff": {
									"attrs": {
										"shengwang": 2,
										"tupo": 1
									},
									"dev": 0
								},
								"res": "你入席，以箸击节。狗屠剁肉，渐离调弦，你击箸——燕市的杂响，头一回成了一支曲子。"
							},
							{
								"t": "独饮旁观，不入热闹",
								"eff": {
									"attrs": { "caixue": 1 },
									"dev": 0
								},
								"res": "你在角落里独饮，看着那两人一应一和。热闹是他们的，你只是听着。"
							},
							{
								"t": "以剑买酒，掷金相请",
								"eff": {
									"attrs": {
										"caifu": -4,
										"shengwang": 3
									},
									"dev": 0
								},
								"res": "你摘下佩剑押在案上：这剑，换三坛好酒。狗屠哈哈大笑，亲自去搬。"
							}
						]
					},
					"chapters": [0, 0],
					"type": "抉择"
				},
				{
					"desc": "道逢负剑客，问剑、问路、问名姓——一言不合，便是生死",
					"id": "JK-ACT-59",
					"name": "燕市负剑人",
					"descHidden": "道逢负剑客，问剑、问路、问名姓——一言不合，便是生死",
					"choice": {
						"segs": ["燕市桥头，一个负剑的游侠拦住你的去路：“听说卫人庆卿，剑术通神。”他说“神”字时嘴角带着笑——那种笑，是来找茬的。", "你扫了一眼他的站姿，就知道他练的是杀人剑，快，狠，不留后路。桥上没人敢靠近，也没人肯绕路。"],
						"options": [
							{
								"t": "拔剑相对，试其锋芒",
								"eff": {
									"attrs": {
										"wuli": 2,
										"shengwang": 3
									},
									"dev": 0
								},
								"res": "三合，他的剑脱了手。他拾剑拱手：服了。末了问：“庆卿此剑，为何人而鸣？”你收剑入鞘，没有回答。"
							},
							{
								"t": "笑而不答，退一步",
								"eff": {
									"attrs": {
										"biancai": 2,
										"shengwang": -1
									},
									"dev": 0
								},
								"res": "你笑着说：“剑术通神的是别人，我只会喝酒。”他盯着你看了半晌，终究没有拔剑。"
							},
							{
								"t": "约期比剑，移日再会",
								"eff": {
									"attrs": {
										"weiji": 5,
										"wuli": 2
									},
									"dev": 0
								},
								"res": "你看了看天色：“明日酉时，桥西柳树下。”他点头，大步去了。那一夜你磨剑到三更。"
							}
						]
					},
					"chapters": [1, 1],
					"type": "抉择"
				},
				{
					"desc": "燕宫高门，名刺递了三天三夜——进，还是不进，是个学问",
					"id": "JK-ACT-60",
					"name": "高门投刺",
					"descHidden": "燕宫高门，名刺递了三天三夜——进，还是不进，是个学问",
					"choice": {
						"segs": ["燕宫的门，比燕市的酒肆难进得多。名刺递进去，回音像掉进井里。你在廊下候了三天，影子从东边挪到西边——像一截无人认领的影子。", "第四天，门终于开了条缝。门房探出半个头：“先生，太子请你。”你站起来，膝盖咯吱响了一声。"],
						"options": [
							{
								"t": "再等三日，磨出真身",
								"eff": {
									"attrs": {
										"junxin": 3,
										"tupo": -2
									},
									"dev": 0
								},
								"res": "你偏不进去，第三天续递一刺：卫人庆卿，剑可为阶。第五日，太子亲出迎你于门。"
							},
							{
								"t": "径自递名刺求见",
								"eff": {
									"attrs": {
										"shengwang": 2,
										"weiji": 2
									},
									"dev": 0
								},
								"res": "你直通通地递刺求见，指名要见太子。门房的眼睛瞪圆了——结果太子竟真见了你。"
							},
							{
								"t": "转身离去",
								"eff": {
									"attrs": {
										"weiji": -2,
										"junxin": -3
									},
									"dev": 0
								},
								"res": "你收起名刺，转身走了。燕宫的门，终究不是为燕市的人开的。走出巷口，你回头看了一眼那高墙。"
							}
						]
					},
					"chapters": [1, 1],
					"type": "抉择"
				},
				{
					"desc": "易水岸边，老渔翁独钓——一竿一线，问的是天下的深浅",
					"id": "JK-ACT-61",
					"name": "易水观潮",
					"descHidden": "易水岸边，老渔翁独钓——一竿一线，问的是天下的深浅",
					"choice": {
						"segs": ["易水岸边，老渔翁独钓。竿是枯竹，线是麻线，浮子却定得稳稳的。你走过去，他在磨刀石上敲了敲烟锅：“客从北边来？”", "他忽然说：“这河水，看着浅，底下深得很。”说完，把竿往你手里一递，自己抽起烟来。"],
						"options": [
							{
								"t": "接竿垂钓，静观浮沉",
								"eff": {
									"attrs": {
										"caixue": 2,
										"moulue": 1
									},
									"dev": 0
								},
								"res": "你接竿坐下，一坐半个时辰。浮子不动，你也不动。老渔翁磕了磕烟锅：“客是个坐得住的人。”"
							},
							{
								"t": "买酒与老翁对饮",
								"eff": {
									"attrs": {
										"caifu": -3,
										"biancai": 2
									},
									"dev": 0
								},
								"res": "你沽了两角酒，与他对饮。酒过三巡，他话多了：“天下要乱了，客知道么？”你没接话。"
							},
							{
								"t": "问渡而去",
								"eff": {
									"attrs": { "tupo": 1 },
									"dev": 0
								},
								"res": "你问明了渡口，拱手谢过，涉水而去。河水漫过膝盖，凉得醒人。"
							}
						]
					},
					"chapters": [1, 2],
					"type": "抉择"
				},
				{
					"desc": "入夜宫门落锁，你却被唤回——是福是祸，全在一念",
					"id": "JK-ACT-62",
					"name": "宫门夜禁",
					"descHidden": "入夜宫门落锁，你却被唤回——是福是祸，全在一念",
					"choice": {
						"segs": ["暮鼓三声，宫门落锁。你正要走，门吏却追出来：“先生慢走——太子有请。”入夜的燕宫，灯少人多。", "门吏忽然压低声音：“先生，今夜这宫里，只有太子和你两个人——你懂么？”说完，他先推开了门。"],
						"options": [
							{
								"t": "坦然入宫，面见太子",
								"eff": {
									"attrs": {
										"junxin": 5,
										"weiji": 2
									},
									"dev": 0
								},
								"res": "你坦然入宫，太子在殿上等你。他压低声音，说的是田光。你只答一句：太子放心，庆卿的剑认路。"
							},
							{
								"t": "称病谢辞，改日再来",
								"eff": {
									"attrs": {
										"weiji": -3,
										"junxin": -2
									},
									"dev": 0
								},
								"res": "你推说夜寒染疾，明日再来。门吏在灯下看了你一眼，像替你松了口气——今夜不进那扇门是对的。"
							},
							{
								"t": "拒入，连夜出城",
								"eff": {
									"attrs": { "weiji": -5 },
									"dev": 3
								},
								"res": "你站在宫门口想了很久，终究没有进去，转身向城门走去。城门已闭，你从水关绕出，沿易水走了半夜。"
							}
						]
					},
					"chapters": [1, 2],
					"type": "抉择"
				},
				{
					"desc": "太子宫中悬金问士——千金买的是骨，还是名，你得分清",
					"id": "JK-ACT-63",
					"name": "千金买骨",
					"descHidden": "太子宫中悬金问士——千金买的是骨，还是名，你得分清",
					"choice": {
						"segs": ["太子宫中悬金问士：能为燕国画策者，千金谢。榜文挂了三天，来看的多，敢揭的少——金子烫手，命更烫手。", "太子丹在宫门处远远看着你——他等的，就是这个站在榜前的影子。"],
						"options": [
							{
								"t": "揭榜献策",
								"eff": {
									"attrs": {
										"junxin": 3,
										"zhengji": 2
									},
									"dev": 0
								},
								"res": "你揭了榜，太子丹亲出相迎。千金你没要，只留一句：“燕国之策，不在金。”走出宫门，有人低声念你的名字，声音里多了分量。"
							},
							{
								"t": "不揭榜，但托言献谋",
								"eff": {
									"attrs": { "moulue": 2 },
									"dev": 0
								},
								"res": "你没有揭榜，却在夜间接了太子的密使，献上三策。名不显，事不废——这是乱世里最稳的活法。"
							},
							{
								"t": "嗤之以鼻，转身离去",
								"eff": {
									"attrs": {
										"shengwang": -2,
										"weiji": -2
									},
									"dev": 0
								},
								"res": "你嗤笑一声：“千金买策？燕国要的，从来不是策。”转身走了。那张榜文，从此没有人再揭。"
							}
						]
					},
					"chapters": [2, 2],
					"type": "抉择"
				},
				{
					"desc": "灯下摊开一卷残破的《司马法》——读与不读，都是一夜",
					"id": "JK-ACT-64",
					"name": "夜读兵书",
					"descHidden": "灯下摊开一卷残破的《司马法》——读与不读，都是一夜",
					"choice": {
						"segs": ["灯下摊开一卷残破的《司马法》——纸页泛黄，边角被虫蛀出细密的小孔。兵书是从旧书肆淘来的，书名都磨得只剩一半。", "你读着读着，忽然停住——里面有一句，与你心里想的那句话，隔着几百年，撞在了一起。"],
						"options": [
							{
								"t": "彻夜攻读，抄录要点",
								"eff": {
									"attrs": {
										"caixue": 3,
										"moulue": 2
									},
									"dev": 0
								},
								"res": "你抄了半夜，把要点记在素绢上。手冻僵了，呵口气再写。天亮时素绢写满，你贴身收好。"
							},
							{
								"t": "断章取义，只取一招",
								"eff": {
									"attrs": {
										"moulue": 2,
										"wuli": 1
									},
									"dev": 0
								},
								"res": "你不求全懂，只挑一招，揣摩到天亮。出门试剑，竟通了三分——读书练剑一个道理：不求多，求通。"
							},
							{
								"t": "合卷而眠",
								"eff": {
									"attrs": { "tupo": 1 },
									"dev": 0
								},
								"res": "你合上卷，吹了灯。书还摊在案上——明天永远有。你把它压在枕下，像压着一个没拆开的秘密。"
							}
						]
					},
					"chapters": [2, 2],
					"type": "抉择"
				},
				{
					"desc": "督亢田埂上，老农问你北去何干——地里的实话，比书上的难答",
					"id": "JK-ACT-65",
					"name": "督亢农人",
					"descHidden": "督亢田埂上，老农问你北去何干——地里的实话，比书上的难答",
					"choice": {
						"segs": ["督亢的田埂上，一个老农拦住你的马：“客人北去？替太子办事？”他问得随意，眼睛却一直看着你——看马，也看马背上的人。", "他忽然说：“这块地要是没了，我们这些人，吃什么？”目光落在远方的田垄上，像落在自己的一辈子上。"],
						"options": [
							{
								"t": "如实相告，图地入秦",
								"eff": {
									"attrs": {
										"junxin": -3,
										"weiji": 3
									},
									"dev": 5
								},
								"res": "你告诉他：这块地，要献给秦王了。老农沉默了很久，转身走了，连背影都没有留给你一句话。"
							},
							{
								"t": "隐瞒实情，含混带过",
								"eff": {
									"attrs": {
										"biancai": 2,
										"weiji": -2
									},
									"dev": 0
								},
								"res": "你笑着说：“替太子办点文书差事。”老农“哦”了一声，不再问，转身继续锄地。"
							},
							{
								"t": "抚其田垄，赠金相慰",
								"eff": {
									"attrs": {
										"caifu": -5,
										"shengwang": 3
									},
									"dev": 0
								},
								"res": "你下马，抚了抚田垄，留下一袋金：“麦子还会长的。”老农没接，只问：“客，燕国会亡么？”你牵着马走了。"
							}
						]
					},
					"chapters": [2, 2],
					"type": "抉择"
				},
				{
					"desc": "蒙嘉府中夜宴，杯盏之间，刀光与酒光一样亮",
					"id": "JK-ACT-66",
					"name": "蒙府夜宴",
					"descHidden": "蒙嘉府中夜宴，杯盏之间，刀光与酒光一样亮",
					"choice": {
						"segs": ["蒙嘉府中夜宴，你以燕使身份在座。堂上灯火通明，酒气蒸腾，秦国的权贵们谈笑风生——谈的却都是军报。", "蒙嘉举杯向你：“燕使远来，我敬一杯。”话是客套，眼里的分量却是真的——他在掂你。席间有人提起燕国，满堂大笑，只有你没笑。"],
						"options": [
							{
								"t": "应对得体，进退有度",
								"eff": {
									"attrs": {
										"biancai": 2,
										"junxin": 3
									},
									"dev": 0
								},
								"res": "你起身还敬：“燕虽小邦，敢效大王，愿为内臣。”满堂静了一瞬，随即笑声又起——只是多了几分客气。"
							},
							{
								"t": "借酒装醉，避重就轻",
								"eff": {
									"attrs": {
										"moulue": 2,
										"weiji": -2
									},
									"dev": 0
								},
								"res": "你连饮三杯，推说醉了，只说些闲话。满堂都笑你是没出过远门的蛮子——只有蒙嘉没有笑。"
							},
							{
								"t": "掷杯而去，当场翻脸",
								"eff": {
									"attrs": {
										"shengwang": -3,
										"weiji": 8
									},
									"dev": 5
								},
								"res": "你掷杯于地：“燕国，不是你们嘴里的笑话！”说完转身就走。这一摔，摔的是气性，也是机会。"
							}
						]
					},
					"chapters": [3, 3],
					"type": "抉择"
				},
				{
					"desc": "咸阳街头，撞见旧日游侠——他乡遇故，是缘，也是劫",
					"id": "JK-ACT-67",
					"name": "咸阳故人",
					"descHidden": "咸阳街头，撞见旧日游侠——他乡遇故，是缘，也是劫",
					"choice": {
						"segs": ["咸阳街头，一个扛着旧剑的背影让你心头一跳——那是五年前在邯郸共饮过的游侠赵二。他如今穿的是秦吏的皂衣——他归了秦国。", "赵二也认出了你，快步过来：“庆卿？你怎么在咸阳？”话里带着热络，眼底却有一丝捉摸不透的东西。"],
						"options": [
							{
								"t": "寒暄数语，即行告别",
								"eff": {
									"attrs": {
										"weiji": -2,
										"biancai": 1
									},
									"dev": 0
								},
								"res": "你笑着寒暄几句，便托辞告别。走出十几步，回头望，赵二还在原地看着你——咸阳城里，每个“故人”都可能是一双眼睛。"
							},
							{
								"t": "把酒叙旧，探其底细",
								"eff": {
									"attrs": {
										"moulue": 2,
										"weiji": 3
									},
									"dev": 0
								},
								"res": "你拉他进了酒肆，三杯下肚，他话多了——秦军的动向、咸阳的风声，都从酒里漏了出来。他忽然停住：“你怎么净问这些？”"
							},
							{
								"t": "当场不相认",
								"eff": {
									"attrs": { "weiji": -3 },
									"dev": 0
								},
								"res": "你低下头，让过身去。赵二追了两步，又停住，终究没有喊出来——不是不肯认，是认一个故人，就要多担一份凶险。"
							}
						]
					},
					"chapters": [3, 4],
					"type": "抉择"
				},
				{
					"desc": "咸阳宫外，扫阶老兵看了你一眼——那一眼，比宫门还深",
					"id": "JK-ACT-68",
					"name": "殿前老兵",
					"descHidden": "咸阳宫外，扫阶老兵看了你一眼——那一眼，比宫门还深",
					"choice": {
						"segs": ["咸阳宫外，一个扫阶的老兵正在扫地。他的背有些驼，扫帚却很稳。他忽然抬头，看了你一眼——那一眼，比宫门还深。", "你走过去，他低声问：“客从哪来？”你答：“燕。”他扫帚停了停，又继续扫：“燕，是个好地方——有易水。”他说“易水”两个字时，声音忽然哑了一下。"],
						"options": [
							{
								"t": "赠酒相谢，不为所动",
								"eff": {
									"attrs": {
										"shengwang": 2,
										"weiji": -2
									},
									"dev": 0
								},
								"res": "你把一壶酒放在他脚边。他停了扫帚，只低低说了句：“客，一路平安。”你走进宫门，把这句话揣在怀里。"
							},
							{
								"t": "攀谈数语，探问宫中",
								"eff": {
									"attrs": {
										"moulue": 2,
										"weiji": 3
									},
									"dev": 0
								},
								"res": "你与他攀谈几句。他话不多，句句有用——秦王何时用膳、侍卫几更换班、哪道门最疏。说完又低头扫地。"
							},
							{
								"t": "默然登阶，不置一词",
								"eff": {
									"attrs": { "weiji": -1 },
									"dev": 0
								},
								"res": "你没有接话，默默登阶。走过他身边时，他把扫帚往旁边让了让——那个动作，比任何话都轻，也重。"
							}
						]
					},
					"chapters": [4, 4],
					"type": "抉择"
				}
			],
			"GLOSSARY": {
				"盖聂": "战国末侠士，居榆次，以剑术与威名重一时。荆轲尝往论剑，语有不合，盖聂怒目而视，轲嘿然徐出，遂去。时人以此短轲，盖聂独曰：曩者吾以目摄之，彼不为动——其人不在此处也。",
				"鲁句践": "邯郸博徒，性烈而直。荆轲游邯郸，与之博，争一道，句践怒而叱之，轲嘿而逃去，遂不复见。后轲刺秦王不成，天下惜之，句践私曰：惜哉，其不讲于刺剑之术也。",
				"高渐离": "燕人，善击筑，隐于狗屠之市。荆轲至燕，日与饮于市，酒酣，渐离击筑，轲和而歌，相乐也，已而相泣，旁若无人。燕亡后渐离为秦所得，矐其目使击筑，卒以筑扑秦皇帝，不中被诛。",
				"筑": "古击弦乐器，形如瑟而颈细，以竹尺击弦发声。其声悲亢激越，宜于燕赵悲歌。高渐离善击之，易水之别，一筑而使千人泣下。",
				"田光": "燕国处士，号节侠，智深而勇沉。鞠武荐之于太子丹，光自度已老，转荐荆轲。为明不泄太子之言，遂自刎而死——以死明志，亦以死激轲也。",
				"太子丹": "燕王喜之子，名丹。少质于赵，与秦王政少时相欢；及质于秦，秦王遇之不善，丹怨而亡归。归而求报秦，阴养死士，卒有易水之事。",
				"曹沫": "春秋鲁人，以勇力事鲁庄公。齐鲁会于柯，曹沫执匕首劫齐桓公于坛上，尽复鲁之侵地。三败之将，一会而雪——荆轲之所慕者也。",
				"樊於期": "秦将，得罪于秦王，父母宗族皆为戮没，亡走燕，太子丹受而舍之。秦王购其首金千斤、邑万家。荆轲以国事说之，於期偏袒扼腕，遂自刎，以首授轲。",
				"督亢": "燕国膏腴之地，在今河北涿州东南，桑麻遍野，河渠纵横，秦所垂涎久矣。荆轲奉其地图入秦——以地为饵，图穷而匕见。",
				"徐夫人": "赵人，藏天下之利匕首。太子丹以百金购之，使工以药淬之，以试人，血濡缕，无不立死者。七寸之器，系天下之势。",
				"秦舞阳": "燕将秦开之孙，年十二杀人，人不敢与忤视。太子丹以为荆轲副使入秦。至咸阳宫陛，舞阳色变振恐，群臣怪之——勇于市井者，未必勇于天子之殿。",
				"蒙嘉": "秦王宠臣。荆轲至秦，以千金厚币遗之，蒙嘉乃为先言于秦王，称燕使振怖畏服，愿举国为内臣。秦王乃设九宾之礼，见使者于咸阳宫。",
				"夏无且": "秦王侍医。荆轲逐秦王，王环柱而走，群臣徒手无以击轲，夏无且以其所奉药囊提轲，王因得拔剑。事后王赐无且黄金二百镒，曰：无且爱我。",
				"九宾": "古代朝会大典，设傧者九人，依次传呼导引，为迎宾之最高仪程。秦王以九宾见燕使于咸阳宫——礼愈隆，刃愈近。",
				"易水": "水名，出燕国西部，东流入涞。荆轲由此入秦，太子丹及宾客知其事者，皆白衣冠送之，渐离击筑，轲和而歌，士皆垂泪涕泣。自此\"易水\"二字，为天下壮别之辞。",
				"函谷关": "秦之东门，在今河南灵宝东北，深险如函，一夫当关，万夫莫开。六国士人入秦皆由此过——进去了多少，出来的又有几个。",
				"质子": "以王子或公子为质于敌国，示不背约也。质于秦者，往往受慢而难归。太子丹少质赵，后质秦，秦王遇之不善，丹怨而亡归——燕秦之怨，由此结死。",
				"合纵": "六国南北联合以抗秦之外交方略，苏秦倡之。秦则以连横破之，远交近攻，各个击破。至荆轲之世，纵约久散，六国各自为计，坐待其亡。",
				"卫": "小国，在今河南濮阳一带，附庸于魏，荆轲之故里也。其先齐人，徙于卫，卫人谓之庆卿。秦并天下而卫独存，至秦二世乃废——小国之亡，反在强秦之后。",
				"榆次": "赵地，在今山西榆次，大侠盖聂所居。荆轲尝往论剑，不合而去。后世论荆轲剑术疏者，多自此始。"
			}
		};
	}));
	//#endregion
	//#region ../prot/lua-data/hanxin.json
	var require_hanxin = /* @__PURE__ */ __commonJSMin(((exports, module) => {
		module.exports = {
			"ATTRS": [
				{
					"k": "tupo",
					"n": "体魄",
					"words": [
						[80, "龙精虎猛"],
						[55, "筋骨强健"],
						[25, "尚可劳碌"],
						[0, "形销体弱"]
					]
				},
				{
					"k": "wuli",
					"n": "武力",
					"words": [
						[80, "万夫不当"],
						[55, "骁勇善战"],
						[25, "习得武艺"],
						[0, "手无缚鸡"]
					]
				},
				{
					"k": "caixue",
					"n": "文才",
					"words": [
						[75, "兵仙降世"],
						[55, "运筹帷幄"],
						[35, "熟读兵书"],
						[0, "略识之无"]
					]
				},
				{
					"k": "moulue",
					"n": "谋略",
					"words": [
						[80, "算无遗策"],
						[55, "深谋远虑"],
						[25, "粗通权变"],
						[0, "不谙机心"]
					]
				},
				{
					"k": "biancai",
					"n": "辩才",
					"words": [
						[80, "舌动九州"],
						[55, "口若悬河"],
						[25, "能言善对"],
						[0, "拙于言辞"]
					]
				},
				{
					"k": "caifu",
					"n": "财富",
					"words": [
						[70, "食邑万户"],
						[40, "仓廪渐足"],
						[15, "赖以温饱"],
						[0, "家徒四壁"]
					]
				},
				{
					"k": "shengwang",
					"n": "名声",
					"words": [
						[80, "天下属目"],
						[50, "名震诸侯"],
						[25, "小有勇名"],
						[0, "默默无闻"]
					]
				},
				{
					"k": "quanshi",
					"n": "权势",
					"words": [
						[80, "军威震主"],
						[50, "节制万军"],
						[25, "号为名将"],
						[0, "身无寸柄"]
					]
				},
				{
					"k": "zhengji",
					"n": "政绩",
					"words": [
						[80, "功盖当世"],
						[55, "政绩斐然"],
						[25, "小有建树"],
						[0, "寸功未立"]
					]
				},
				{
					"k": "junxin",
					"n": "君心",
					"words": [
						[70, "解衣推食"],
						[45, "言听计从"],
						[20, "上下相安"],
						[0, "君臣相疑"]
					]
				},
				{
					"k": "weiji",
					"n": "危机",
					"words": [
						[90, "命悬一线"],
						[70, "弓藏之兆"],
						[40, "暗流涌动"],
						[0, "岁月静好"]
					],
					"inverse": true
				}
			],
			"ATTR_NAMES": {
				"tupo": "体魄",
				"wuli": "武力",
				"caixue": "文才",
				"moulue": "谋略",
				"biancai": "辩才",
				"caifu": "财富",
				"shengwang": "名声",
				"quanshi": "权势",
				"zhengji": "政绩",
				"junxin": "君心",
				"weiji": "危机"
			},
			"INIT": {
				"tupo": 40,
				"wuli": 50,
				"caixue": 42,
				"moulue": 55,
				"biancai": 25,
				"caifu": 10,
				"shengwang": 8,
				"quanshi": 5,
				"zhengji": 0,
				"junxin": 12,
				"weiji": 8
			},
			"AGE": {
				"init": 20,
				"bands": [
					[26, 0],
					[29, -1],
					[32, -2],
					[36, -3],
					[200, -4]
				],
				"longevity": [[45, 1], [58, 2]]
			},
			"ILLNESS": {
				"cost": 3,
				"heal": 5,
				"onsetTupo": 5,
				"onsetWeiji": 3,
				"drainTupo": 2,
				"drainWeiji": 2,
				"death": {
					"ending": "E8",
					"variant": "baobing"
				}
			},
			"ACTION_RULES": { "diminish": false },
			"DIFFICULTY": {
				"story": {
					"n": "剧情",
					"wj": .6,
					"corr": .5,
					"coef": .8,
					"backtrack": -1,
					"lethal": false,
					"hideAttrs": false,
					"desc": "数值全可见，无限回溯，危机增长放缓，不会致死"
				},
				"normal": {
					"n": "普通",
					"wj": 1,
					"corr": 1,
					"coef": 1,
					"backtrack": 1,
					"lethal": true,
					"hideAttrs": false,
					"desc": "标准体验，每章可回溯一次"
				},
				"hardcore": {
					"n": "硬核",
					"wj": 1.2,
					"corr": 1.3,
					"coef": 1.25,
					"backtrack": 0,
					"lethal": true,
					"hideAttrs": true,
					"desc": "危机×1.2，无回溯，属性仅以状态词显示"
				}
			},
			"SCENARIO": {
				"id": "hanxin",
				"name": "韩信 · 兵仙之局",
				"sub": "成也萧何，败也萧何",
				"era": "约前 220 — 前 196",
				"protag": "韩信",
				"desc": "从胯下之辱到长乐钟室——功劳大到封无可封的人，还有没有活路？",
				"recommend": "容错中 · 兵仙线（建议先通李斯本）"
			},
			"HIDDEN": {
				"init": 15,
				"name": "刘邦疑心",
				"showFrom": 2,
				"words": [
					[70, "杀机已动"],
					[50, "猜忌日深"],
					[30, "颇有微词"],
					[0, "尚无猜忌"]
				]
			},
			"PERSIST": { "junxinFrom": 2 },
			"MERIT_MAP": {
				"汉中": 8,
				"三秦": 10,
				"破魏": 10,
				"破赵": 15,
				"破齐": 15,
				"齐王": 20,
				"垓下": 15
			},
			"DEV_BANDS": [
				{
					"max": 20,
					"name": "循史",
					"color": "#7fa8a0"
				},
				{
					"max": 45,
					"name": "微澜",
					"color": "#c9a959"
				},
				{
					"max": 70,
					"name": "改流",
					"color": "#c97a3a"
				},
				{
					"max": 100,
					"name": "逆天",
					"color": "#b0432f"
				}
			],
			"ENDINGS": {
				"E1": {
					"name": "钟室之斩",
					"seal": "循史",
					"cuncun": 25,
					"nitian": false,
					"devMax": 45,
					"ach": ["zhongshi"],
					"zhuan": "太史公曰：信以市井布衣，受辱胯下，卒登坛而拜将。还定三秦，举魏拔赵，胁燕定齐，南摧楚军于垓下——汉之所以得天下者，大抵皆信之功也。然功高震主，鸟尽弓藏。云梦一缚，钟室一斩，夷三族。假令信学道谦让，不伐己功，不矜其能，于汉家勋可比周召，血食后世。悔不用蒯通之计，乃为儿女子所诈，岂非天哉！",
					"brief": "受辱胯下而登坛拜将，功高震主，钟室授首"
				},
				"E2": {
					"name": "漂母之钓",
					"seal": "苟活",
					"cuncun": 100,
					"nitian": false,
					"ach": ["piaomu"],
					"zhuan": "太史公曰：淮阴城下，有钓叟韩生者，日垂一纶，得鱼则喜，不得则歌。或问其名，笑而不答。漂母在日，生每往饭之，岁时不辍。及淮阴侯诛，人始知钓叟谁也。生闻之，投竿于河，终身不复言兵。",
					"brief": "隐姓埋名为钓叟，报漂母一饭，终身不复言兵"
				},
				"E3": {
					"name": "楚营郎中",
					"seal": "苟活",
					"cuncun": 80,
					"nitian": false,
					"zhuan": "太史公曰：信在楚，为郎中，执戟于项羽帐下，数以策干，不用。及汉王入蜀，或劝信亡归，信曰：楚虽不我用，义不可负。后垓下之围，信随众溃，不知所终。天下但知淮阴侯，不知楚营旧郎中——其忠其愚，皆足叹也。",
					"brief": "执戟楚帐而策不见用，垓下溃后不知所终"
				},
				"E4": {
					"name": "王于齐土",
					"seal": "稳健",
					"cuncun": 85,
					"nitian": false,
					"devMin": 21,
					"zhuan": "太史公曰：信既破齐，请为齐王，汉王许之。及蒯通说三分，信谢不纳，然亦深自固：缮甲兵，积粮谷，不轻离其国。汉廷数徙之，信以疾辞。高帝终其身，不能夺信之齐。垓下之役既毕，东西相持，鸿沟为界——信王于齐，得全于英雄之末。",
					"brief": "据齐称王，不纳三分之计，固其国而终全其身"
				},
				"E5": {
					"name": "学道全身",
					"seal": "稳健",
					"cuncun": 95,
					"nitian": false,
					"ach": ["xuedao"],
					"zhuan": "太史公曰：信既诛项羽，即日还兵符，请老于淮阴。人皆笑其怯，信曰：狡兔死，走狗烹；高鸟尽，良弓藏——吾欲全吾名，亦全吾身。后十年，绛灌诸将或以诛，或以族，而信钓于城下，饭于漂母之祠，寿终。太史公所谓学道谦让者，信得之矣。",
					"variants": { "huaiyin": {
						"name": "淮阴之治",
						"zhuan": "太史公曰：信还兵符，归老淮阴。乡人初畏之，既而亲之：信为平狱讼，浚沟洫，课农桑，不出三年，淮阴大治。或问：将军百战之功，甘于一邑乎？信笑曰：吾以此身试于天下，天下几不容我；以一邑试此身，邑人乃知我。后十年，长安诛功臣如刈草，而信晏然于淮水之滨，寿终。太史公所谓学道谦让者，信得之矣；其治绩之美，虽萧曹何以加焉。",
						"brief": "解甲归乡而治淮阴，平狱讼课农桑，三年大治"
					} },
					"brief": "灭楚之日即还兵符，钓于淮阴城下，得以寿终"
				},
				"E6": {
					"name": "三分之局",
					"seal": "逆天",
					"cuncun": 85,
					"nitian": true,
					"devMin": 46,
					"zhuan": "太史公曰：蒯通之说既行，信据齐临淄，收燕赵之众，西向而观楚汉之斗。项王蹙于荥阳，汉王疲于成皋，皆请盟于信。信按兵坐观，三分鼎足。后十年，汉楚皆疲，信乃徐收天下之利。兵仙一生，未尝败绩；其最胜处，不在垓下，在齐王宫之一席话也。",
					"brief": "用蒯通之计据齐观斗，三分鼎足，徐收天下之利"
				},
				"E7": {
					"name": "易帜之夏",
					"seal": "逆天",
					"cuncun": 80,
					"nitian": true,
					"devMin": 46,
					"zhuan": "太史公曰：陈豨反于代，信从中应之，周勃樊哙之师逡巡不敢进。高帝亲征，与信遇于洛阳，两军相望，帝曰：淮阴侯必反乎？信对曰：非反也，求己所当得也。遂盟而去，剖大河以北为信国。是岁，汉室易其政，封赏重议——或曰信伪，或曰信直，千载不决。",
					"brief": "应陈豨而起兵洛阳，剖大河以北为信国"
				},
				"E8": {
					"name": "名将之殁",
					"seal": "败局",
					"cuncun": 10,
					"nitian": false,
					"zhuan": "太史公曰：信之智，敌万人之军；信之愚，不敌一人之疑。或缚于云梦，或族于钟室，谋泄于帷幄，兵败于一旦。天下已定矣，而名将不得晏然——非信之罪也，势也。",
					"variants": {
						"yunmeng": {
							"name": "云梦之缚",
							"zhuan": "太史公曰：高帝伪游云梦，信郊谒于陈。武士一拥，绳缚加身。信呼曰：狡兔死，走狗烹！帝不应，槛车东去。及淮阴国除，人始悟：云梦之云，早罩在英雄头上。",
							"brief": "伪游云梦，郊谒被缚，槛车东去而淮阴国除"
						},
						"mouxie": {
							"name": "谋泄之诛",
							"zhuan": "太史公曰：陈豨之举未发，舍人上书告变。吕后不动干戈，一使召信，一狱待罪。信至长乐，钟室门阖。谋泄于人，亦泄于天——帐中百万兵，救不得殿上一命。",
							"brief": "舍人告变，吕后一召，钟室门阖而身死"
						},
						"weishui": {
							"name": "潍水覆军",
							"zhuan": "太史公曰：信读兵书半生，一战而失其算。潍水合围，沙囊溃堤，汉儿郎溺死者蔽川。信单骑而遁，不知所之。兵无常胜，水无常形——渎之者，其验如响。",
							"brief": "潍水失算，沙囊溃堤，全军覆没单骑而遁"
						},
						"baobing": {
							"name": "病殁侯邸",
							"zhuan": "太史公曰：陈豨之狱兴，吕后之召三至。信病笃，不能兴，及使至而信已殁于淮阴侯邸——长乐钟室之门洞开，终无所待。信以布衣仗剑，功盖天下，不死于战阵，不死于刑戮，死于床笫之间。或曰：是殆有天幸焉，使信生入钟室，夷三族之名又甚于病殁。然英雄之末路，天亦有不忍观者欤？",
							"brief": "吕后三召而病笃，殁于侯邸床笫，终不入钟室"
						},
						"zuzhu": {
							"name": "钟室族诛",
							"zhuan": "太史公曰：帝北征在外，吕后与萧何谋，绐信入贺。信至长乐，钟室之门阖于身后——斩讫，夷三族，父族、母族、妻族同日弃市，淮阴哭声相闻。——信一生算人于千里之外，独不算身侧之一室；能料天下之势，不能料妇人之手。悲夫！",
							"brief": "萧何绐入长乐，钟室斩讫，三族同日弃市"
						},
						"cike": {
							"name": "长安客刃",
							"zhuan": "太史公曰：信之兵，天下莫敢当；信之身，一刃足以毕。夜归侯邸，有客伪为醉卒，踉跄犯驾，袖刃突出，贯胁而入。卫士追之，杳无踪迹——或曰旧楚遗客，或曰侯门怨仆，莫知谁遣。——沙场上百万之师不能近信一步；长安春夜，三尺之刃，足矣。",
							"brief": "百万之师不能近身，长安春夜一刃毕命"
						}
					},
					"brief": "智敌万军而不敌一人之疑，天下定而名将殁"
				}
			},
			"CHAPTERS": [
				{
					"id": "c0",
					"title": "序章 ｜ 淮阴布衣",
					"sub": "教学章 · 约前 220 前后",
					"age": 20,
					"summaryNotes": [
						"【教学】上方十一维是你的命数。危机涨满之日，便是钟室门阖之时。",
						"【教学】偏离度记你与史实的距离，只增不减：≤20 循史，21–45 微澜，46–70 改流，71 以上逆天。",
						"【教学】选项旁带\"史\"字者，是史书所载韩信的本来面目。循之则稳，违之则波澜自生。",
						"【教学】岁月催人——体魄随年齿衰减。体魄高则延寿：寿元可逐点抵去当年的衰老之损，并压低发病之率（寿元与阈值见属性面板下方）。体魄低则易病：小病静养两轮自愈，大病须用「求医问药」。病至膏肓，体魄归零，便是殁时。"
					],
					"intro": [
						"秦并天下十余年，天下像一张摊平了的地图。淮阴这样的小城，只在驿卒换马时被人想起——换过马，驿卒又打马而去，把这座城重新埋回寂静里。",
						"你是⟦淮阴⟧城里的一个布衣。贫，无行，不事生产——在乡邻眼里，这三样加起来，等于废人。你怀里有一卷翻烂的兵书，腰间有一把换不来饭的剑，每天出城下钓，钓的多半是空篓。",
						"可你坐在河边的时候，心里演的全是千军万马：哪条路能伏兵，哪道水能断粮——河水的波纹在你眼里，从来不是波纹，是阵图。史书上还没有你的名字，它要等一个乱世，等一座登坛的高台，才肯动笔。"
					],
					"start": "0-1",
					"events": [
						{
							"id": "0-1",
							"title": "城下之钓",
							"segs": [
								"河水浅了，鱼也刁了。你守了半日，钓起的只有水草——水草缠着钩，一圈一圈，像缠着你的日子。河边漂洗衣絮的⟦漂母⟧收工路过，把粗陶碗递过来：一团饭，一撮盐菜，还冒着热气。",
								"“后生，手是握剑的手，不该抖成这样。”她说完就走，不等你道谢——背影在暮色里，走得很快。",
								"第二天她来了，第三天也来了。一连几十日，碗里的饭从没断过。你捧着饭，喉咙里堵着一句话——说出来是誓言，咽下去是债。"
							],
							"options": [
								{
									"t": "受饭，立誓“吾必有以重报母”",
									"hist": true,
									"res": "漂母把手一摆：“大丈夫不能自食，吾哀王孙而进食，岂望报乎！”她挎起竹篮走了，留你站在河边。你记住了这句话，也记住了这饭——这口气，比饭更重。原来这世上，还有人不图你什么，只图你像个人样地活下去。",
									"eff": {
										"attrs": {
											"shengwang": 2,
											"tupo": 1
										},
										"dev": 0,
										"flags": ["piaomu-en"],
										"ach": "piaomu"
									},
									"to": "0-2"
								},
								{
									"t": "受饭，默然铭记",
									"res": "你没有说话，只把碗吃得一粒不剩。有些恩，说出来就轻了；压着，才有分量。漂母看了你一眼，没再说什么——那一顿饭后，你钓鱼的手，稳了许多。",
									"eff": {
										"attrs": {
											"caixue": 2,
											"moulue": 1
										},
										"dev": 3,
										"flags": ["piaomu-en"]
									},
									"to": "0-2"
								},
								{
									"t": "不食，转身离去",
									"res": "你把碗推回去，饿着肚子走了。路人笑你穷骨头硬——不受，是怕还不起。你走出很远，回头看了一眼，她还在河边，洗她的衣絮。",
									"eff": {
										"attrs": {
											"shengwang": 3,
											"weiji": 3,
											"tupo": -2
										},
										"dev": 5
									},
									"to": "0-2"
								}
							]
						},
						{
							"id": "0-2",
							"title": "胯下之辱",
							"segs": [
								"市中白日，你带剑经过肉市，被一个屠中少年当街拦住。他叉开腿站定，拍着胸脯：“若虽长大，好带刀剑，中情怯耳。”话没说完，围观的已经哄笑起来，人越聚越多。",
								"“能死，刺我；不能死，出我⟦胯下⟧。”他的声音压过了满街的笑声，等着看你选。",
								"你看着他，看了很久。剑在鞘中，手心是汗——杀他易，杀完之后呢？你看了看满街的眼睛，又看了看自己腰间的剑。"
							],
							"options": [
								{
									"t": "俯身，从其胯下钻过",
									"hist": true,
									"res": "你伏下身，从他的胯下慢慢爬了过去。满市皆笑，有人笑出了眼泪。你起身，拍拍膝上的土，走得不快不慢——忍人所不能忍，才做得成人所不能成。只有你自己知道，方才那一刻，你的剑在鞘里，拔了三次，又按回去三次。",
									"eff": {
										"attrs": {
											"weiji": -3,
											"shengwang": -3,
											"moulue": 3
										},
										"dev": 0,
										"flags": ["kuaxia"],
										"ach": "kuaxia"
									},
									"to": "0-3"
								},
								{
									"t": "拔剑而起",
									"res": "剑出鞘半寸，被几个旁人死死抱住。少年吓得跌坐在地，你成了市上的“狠人”。从这天起，县吏的名册上多了一个“刺头”——有些威，是要拿日子来还的。",
									"eff": {
										"attrs": {
											"weiji": 10,
											"shengwang": 2,
											"wuli": 3
										},
										"dev": 8,
										"flags": ["hanyong"]
									},
									"to": "0-3"
								},
								{
									"t": "掷剑于地，绕市而走",
									"res": "你把剑解下掷在地上，绕开市集走远了。笑声在背后追了你三条街。你没有回头，也没有捡——你只是在心里，把那个少年和满街的笑声，都记在了纸上，等将来有个地方能写。",
									"eff": {
										"attrs": {
											"shengwang": -5,
											"weiji": 3,
											"moulue": 2
										},
										"dev": 3
									},
									"to": "0-3"
								}
							]
						},
						{
							"id": "0-3",
							"title": "仗剑何从",
							"segs": ["这一年，天下乱了。陈胜的旗、项梁的兵、六国的旧人，都从土里钻了出来。会稽项氏起兵，渡江西来，渡口挤得水泄不通。", "你把兵书裹好，剑佩上腰，站在人生的第一个岔路口——这一次，鱼竿帮不了你。河水还在流，你看着它，忽然想：该收竿了。"],
							"options": [{
								"t": "杖剑从戎，投项梁去",
								"hist": true,
								"res": "你背着剑向渡口走去，混入投军的人流。乱世从不等犹豫的人——你挤上船的那一瞬，回头看了一眼淮阴的城头，忽然想：这一走，回来的时候，就不再是那个钓鱼的人了。",
								"eff": {
									"attrs": {
										"caixue": 2,
										"tupo": 2
									},
									"dev": 0
								},
								"to": "NEXT"
							}, {
								"t": "守钓不问世事",
								"req": { "notflag": "piaomu-en" },
								"res": "你把剑挂回墙上，次日照旧出城下钓。很多年后，淮阴人还记得城下有个钓了一辈子的老人——他的兵书，至死没有拆封。河水照旧流，你的影子，在河边坐成了一座碑。",
								"eff": { "dev": 0 },
								"to": { "ending": "E2" }
							}]
						}
					]
				},
				{
					"id": "c1",
					"title": "第一章 ｜ 楚营郎中",
					"sub": "前 208—前 206",
					"age": 23,
					"summaryNotes": ["在楚营的两年，你把兵法想透了，也把\"言不用\"三个字尝够了。", "项羽的帐下不缺勇士，缺的是肯听他一句话的人——可惜你不是那个能被听的人。"],
					"intro": ["⟦项梁⟧渡淮，你杖剑投军。定陶一战，项梁败死，楚军几溃。你随残部归⟦项羽⟧，得了一个郎中的微职——执戟侍帐，站在离霸王最近的地方，看最清楚的战场。", "两年执戟的日子，你看清了两样东西：他的勇，天下无双；他的短，无药可医。"],
					"start": "1-1",
					"events": [
						{
							"id": "1-1",
							"title": "从项梁",
							"segs": ["军中你连姓名都没有。仗一仗一仗打过来，同伍的人换了几茬——活着，就是资历；死了，连个记号都留不下。", "又一场攻城战。云梯架上城头，先登者赏，退缩者斩。梯子上的人影一个接一个往下掉，掉进壕沟，再没有人爬起来。"],
							"options": [{
								"t": "陷阵先登",
								"res": "你咬着刀背攀上云梯，第一个翻上城头，肩上添了一道深可见骨的疤。战后记功，营里有人开始叫你的名字——原来这世上最快的路，是用刀砍出来的。",
								"eff": {
									"attrs": {
										"shengwang": 4,
										"weiji": 3,
										"caixue": 2,
										"wuli": 4,
										"tupo": -2
									},
									"dev": 0
								},
								"to": "1-2"
							}, {
								"t": "稳守辎重",
								"res": "你守着粮车寸步不退，流矢擦着耳边飞过去。城破之后，三军吃得饱饱的，没有人问粮食是怎么来的。没有人记得你，但全军都吃了你的粮——打仗打的是刀，赢的是粮。",
								"eff": {
									"attrs": {
										"caifu": 3,
										"shengwang": 1,
										"moulue": 2
									},
									"dev": 0
								},
								"to": "1-2"
							}]
						},
						{
							"id": "1-2",
							"title": "数策于羽",
							"segs": [
								"你写好的策论，一次次递上去——⟦项羽⟧看过，或者没看。有时批个“知道了”，有时连这三个字也没有。策论进了他的帐，像石头进了井，连个响都没有。",
								"巨鹿大胜后分封诸侯。那日你在帐外听得清楚——“以沛公为汉王，王巴蜀汉中。”好棋——把最强的人赶去最远的地方，这是范增的手笔。",
								"你握着戟，忽然想：这天下的人，都在别人的棋盘上。"
							],
							"options": [
								{
									"t": "数数献策，不言则不止",
									"hist": true,
									"res": "策论递上去，如石沉大海。你把每一篇的草稿都留了下来，捆成一束，压在行囊最底层——总有一处江山，识得这些字。你捆那束草稿的时候，手很稳，像在捆一件迟早要用的兵器。",
									"eff": {
										"attrs": {
											"caixue": 4,
											"junxin": -2,
											"shengwang": 3,
											"moulue": 2
										},
										"dev": 0
									},
									"to": "1-3"
								},
								{
									"t": "闭口不言，冷眼观之",
									"res": "你不再递了。霸王听不进的话，说一遍是忠，说十遍是蠢。他的败亡，在你心里一页页翻过去——看得太清楚的人，往往走得最早。",
									"eff": {
										"attrs": {
											"weiji": -3,
											"caixue": 2,
											"moulue": 3
										},
										"dev": 3
									},
									"to": "1-3"
								},
								{
									"t": "当众争锋，直指其失",
									"res": "你出列陈词，直指分封之失，一席话说得满帐皆惊。项羽笑了，笑里没有温度：“郎中执好你的戟。”你退回原位，知道这座大营里再没有你的位置了。",
									"eff": {
										"attrs": {
											"shengwang": 5,
											"weiji": 8,
											"biancai": 3
										},
										"dev": 5
									},
									"to": "1-3"
								}
							]
						},
						{
							"id": "1-3",
							"title": "亡楚归汉",
							"segs": ["汉王入蜀，烧绝栈道，示天下无还心——火烧了三天，浓烟蔽日。关中降卒私下议论：沛公未必肯老死巴蜀。", "你在楚营的第三个年头开始了。楚营的月，照不进你的前程了。走，还是留？你把这个问题在心里掂了半夜，掂得手心全是汗。"],
							"options": [
								{
									"t": "亡楚归汉",
									"hist": true,
									"res": "你把郎中的印绶解下，端端正正挂在帐前。身后是两年执戟，身前是一条烧断了的路——烧断了，就再走出一条来。你牵着马，走进夜色，忽然想：这一走，走的不是路，是命。",
									"eff": {
										"attrs": {
											"weiji": 5,
											"tupo": 2
										},
										"dev": 0
									},
									"to": "NEXT"
								},
								{
									"t": "留楚不去",
									"res": "你想了一夜：楚虽不我用，义不可负。你留下来，执你的戟，站你的岗。很多年后垓下的火光里，楚军溃散如潮，没有人知道你是谁——你握着戟，站在最后一班岗上，用\"不离开\"写自己的名字。",
									"eff": { "dev": 5 },
									"to": { "ending": "E3" }
								},
								{
									"t": "再观形势",
									"req": { "shengwang": 20 },
									"res": "你又看了一年。看霸王用人，看范增去位，看英布离心。看明白了：这座大营气象虽盛，终究不是读书人的江山。你看得越多，心越冷——冷到最后，走字反而说得干脆了。",
									"eff": {
										"attrs": {
											"weiji": 3,
											"junxin": 2,
											"moulue": 2
										},
										"dev": 3
									},
									"to": "NEXT"
								}
							]
						}
					]
				},
				{
					"id": "c2",
					"title": "第二章 ｜ 亡楚归汉",
					"sub": "前 206 · 历史节点",
					"age": 25,
					"summaryNotes": ["从连敖到登坛，中间只隔着一个肯听你把话说完的人。", "斋戒三日，设坛具礼。明日之后，汉王的兵，姓韩。"],
					"intro": ["你翻山越岭亡入汉中。汉王麾下不问来路，给了你一个连敖——管粮草收发的小官。南郑城小，兵卒在田埂上打盹。", "汉中没有人知道，这个新来的粮官怀里，揣着多少没打的仗、没读透的书。从这里到登坛拜将，史书写起来只有三页——走起来，要过一道鬼门关。"],
					"node": "N1",
					"mutations": [
						{
							"if": { "shengwang": 45 },
							"flag": "hexianwen",
							"note": "【节点异变】你的名声先你一步到了汉中——⟦萧何⟧已经在上书人的名单里见过你。"
						},
						{
							"if": { "junxinMax": 20 },
							"flag": "wangqing",
							"note": "【节点异变】你楚营执戟的出身被翻了出来——汉王看你，先带三分轻。"
						},
						{
							"if": { "weiji": 60 },
							"flag": "zaofa",
							"note": "【节点异变】军法吏已在核你的案卷——留给你的时间，比想的少。"
						},
						{
							"if": { "devMin": 40 },
							"flag": "wutenggong",
							"note": "【节点异变】⟦滕公⟧随驾在外，刑场上没有那个肯停下来听你说话的人。"
						}
					],
					"start": "2-1",
					"events": [
						{
							"id": "2-1",
							"title": "坐法当斩",
							"altSegs": {
								"flag": "zaofa",
								"segs": [
									"军法吏核你的案卷核了三夜，细到粮账里每一笔折耗都对上了日子。这案子办得这么快，是因为有人想让它快。",
									"你是第十四个。刀斧手走到你面前：“还有何话说？”",
									"头顶有乌鸦盘旋不去。你抬起头——远处一驾车马，正经过刑场。"
								]
							},
							"segs": [
								"为连敖，坐法当斩。案情你到现在都没完全弄明白——军法不问明白不明白，只看斩不斩。同案的十三个人，已经依次斩完了，血渗进黄土，颜色发暗。",
								"你是第十四个。刀斧手走到你面前：“还有何话说？”声音很平，像问今天吃什么。",
								"头顶有乌鸦盘旋不去。你抬起头——远处一驾车马，正经过刑场，车上的伞盖，在日光下晃了一下。"
							],
							"options": [
								{
									"t": "呼：“上不欲就天下乎？何为斩壮士！”",
									"hist": true,
									"res": "你挣直了身子喊道。刀停在半空。监刑的⟦滕公⟧勒马回头，看了你很久：言貌不凡——放了。你站起来的时候，腿是软的，腰是直的。原来命这东西，有时候就系在一声喊上。",
									"eff": {
										"attrs": {
											"shengwang": 5,
											"biancai": 3
										},
										"dev": 0,
										"flags": ["tenggong"]
									},
									"to": "2-2"
								},
								{
									"t": "仰天长叹，引颈就戮",
									"res": "你闭眼的时候想的是：兵书还没写完，天下还没看完。刀风将至——一驾马车恰在此时停在刑场边，车上人掀帘喝止。是滕公。原来有些死，是注定死不成的——老天留着你，总有它的道理。",
									"eff": {
										"attrs": { "shengwang": 2 },
										"dev": 3,
										"flags": ["tenggong"]
									},
									"to": [{
										"if": { "flag": "wutenggong" },
										"to": { "ending": "E8" }
									}, { "to": "2-2" }]
								},
								{
									"t": "贿赂刀斧手",
									"req": { "caifu": 8 },
									"res": "金子从袖中递过去，刀斧手的手顿了顿，绳子松了一扣。他低声说：夜里走。你活下来了，来路从此说不清——这条命，是拿污名换的。值不值，得看这条命将来干什么。",
									"eff": {
										"attrs": {
											"caifu": -8,
											"weiji": 5
										},
										"dev": 5,
										"flags": ["xinghui"]
									},
									"to": "2-2"
								}
							]
						},
						{
							"id": "2-2",
							"title": "治粟都尉",
							"segs": ["滕公荐你于汉王，王用你为治粟都尉。汉中的粮仓，从此归你调度——官印不大，仓门很沉。", "你日日出入仓廪，看账，看路，看人心。一个政权的筋骨，不在朝堂上的嗓门，在粮道的长短里——这一点，没人比你看得更清楚。"],
							"options": [{
								"t": "整肃仓廪，井井有条",
								"res": "三月之后，仓无陈粟，账无错字，运粮的壮丁少了两成而粮到得更早。汉王听人提起过你两次——名字能递到王案上，已是路。这天下的事，都得从一仓一账做起。",
								"eff": {
									"attrs": {
										"caixue": 3,
										"shengwang": 3,
										"junxin": 3,
										"moulue": 2
									},
									"dev": 0
								},
								"to": "2-3"
							}, {
								"t": "敷衍度日，静待时机",
								"res": "公务应付得过去就行。你的心思在舆图上：秦岭诸道，哪里能走兵，哪里能走粮。你常常看那张舆图看到半夜——你等的，不是这一仓一账，是那张图上的天下。",
								"eff": {
									"attrs": {
										"weiji": -3,
										"junxin": -2,
										"moulue": 3
									},
									"dev": 3
								},
								"to": "2-3"
							}]
						},
						{
							"id": "2-3",
							"title": "萧何数语",
							"altSegs": {
								"flag": "hexianwen",
								"segs": ["相国⟦萧何⟧巡视粮政。他查账极细，问到第三仓时，你脱口答出了屯粮、里程与折耗。萧何抬起头——“原来是你。”你的名字，他早在上书人的名单里见过：名字比人先到了汉中。", "灯下论政三日。第三夜，他忽然搁下笔问：天下事，君何以看？烛花爆了一声。你知道，这扇门开得只有一次。"]
							},
							"segs": ["相国⟦萧何⟧巡视粮政。他查账极细，问到第三仓时，你脱口答出了屯粮、里程与折耗——数字像早就等在那里，等着他问。萧何抬起头，重新打量了你一眼，像在掂你的分量。", "灯下论政三日。第三夜，他忽然搁下笔问：天下事，君何以看？烛花爆了一声——你知道，这扇门开得只有一次。"],
							"options": [
								{
									"t": "尽陈兵略，言不隔夜",
									"hist": true,
									"res": "你从秦制之弊说到楚王之短，从巴蜀之险说到三秦之怨，说到烛尽又续。萧何离席，整衣，长揖到地：国士无双。——这一揖，值你前半生所有的冷落。原来这世上，真有一个人，能把你的名字，从仓廒里捞出来。",
									"eff": {
										"attrs": {
											"caixue": 5,
											"junxin": 5,
											"moulue": 3
										},
										"dev": 0,
										"flags": ["xiaohe"],
										"ach": "xiaohe"
									},
									"to": "2-4"
								},
								{
									"t": "藏拙不言，点到为止",
									"res": "你答得四平八稳，滴水不漏。萧何笑了笑，没再追问，起身告辞。门开了一条缝，又合上了。有些话，今晚不说，也许就再没有机会说了——可你还是没说。",
									"eff": {
										"attrs": {
											"junxin": -3,
											"weiji": -3,
											"moulue": 2
										},
										"dev": 3
									},
									"to": "2-4"
								},
								{
									"t": "以退为进，扬言欲去",
									"res": "“此地终非久居之地。”你把话说得不大不小，恰好够传到该听见的人耳朵里。赌赢了是登坛，赌输了是路。你收拾行囊时，手很稳——你赌的不是萧何，是你自己的判断：这汉中的仓，装得下粮，装不下你。",
									"eff": {
										"attrs": {
											"junxin": -5,
											"shengwang": 3,
											"moulue": 3
										},
										"dev": 5,
										"flags": ["yangqu"]
									},
									"to": "2-4"
								}
							]
						},
						{
							"id": "2-4",
							"title": "萧何月下",
							"segs": [
								"你留书一封，走了。没有辞行，一匹马，一卷书——像来时一样干净。",
								"当夜，萧何没有禀报汉王，解下佩剑换马，单骑直追。月光把山路照成一条白线，马蹄声在你身后响了三十里，一路没有停过。",
								"“将军留步——汉王失天下无日矣！”萧何的声音从夜风里追过来，带着喘。你勒住马——一个追了三十里的人，站在你面前，眼底全是血丝。"
							],
							"options": [
								{
									"t": "归而受命",
									"hist": true,
									"res": "萧何对汉王说：“诸将易得耳，至如信者，国士无双。必欲争天下，非信无所与计事者。”汉王沉默了很久。三日后，王斋戒，设坛，具礼——这一夜的三十里，是你这辈子走过最值的一段路。",
									"eff": {
										"attrs": { "junxin": 5 },
										"dev": 0,
										"flags": ["xiaohe-gui"]
									},
									"to": "2-5"
								},
								{
									"t": "执意要走",
									"req": { "notflag": "zhui2" },
									"res": "“此处不用我，何不走？”萧何又劝了一夜，说到唇干舌燥。天亮时你还是走了。你走出很远，回头，他还站在道口，衣角被风吹起，像一杆没拔走的旗。",
									"eff": {
										"attrs": { "junxin": -8 },
										"dev": 3,
										"flags": ["zhui2"]
									},
									"to": "2-4"
								},
								{
									"t": "执意再走",
									"req": { "flag": "zhui2" },
									"res": "天还没亮透，你再次谢绝了萧何的相送。他把佩剑解下来横在车前：“将军若不念汉家，天下事将付与何人？”你闭目，没有答话——可那把横在车前的剑，你在心里，记了一辈子。",
									"eff": {
										"attrs": { "junxin": -10 },
										"dev": 5
									},
									"to": { "ending": "E2" }
								}
							]
						},
						{
							"id": "2-5",
							"title": "登坛拜将",
							"key": true,
							"altSegs": {
								"flag": "wangqing",
								"segs": [
									"良日，斋戒，设坛场，具礼。三军列于坛下，甲光连成一片。",
									"鼓声响起。汉王捧着大将印绶，在坛上停了一停——他案头的名册上，你的名下注着一行小字：楚营执戟郎。印绶终究还是落了下来，沉得像一块城砖。",
									"坛下哗然。拜将毕，汉王问：“将军何以教寡人计策？”满营文武，都在等你的第一句。"
								]
							},
							"segs": [
								"良日，斋戒，设坛场，具礼。三军列于坛下，甲光连成一片。诸将都在猜新大将是谁——有人已经整好了衣冠，袖子里揣着贺词。",
								"鼓声响起，汉王亲授大将印绶。印绶落在你掌中，沉得像一块城砖。坛下哗然——那个管粮的连敖，那个胯下的淮阴人，满营的目光，像针一样扎在你背上。",
								"拜将毕，汉王问：“将军何以教寡人计策？”坛上坛下，静得能听见风。"
							],
							"options": [{
								"t": "陈“汉中对”，还定三秦之策",
								"hist": true,
								"req": { "moulue": 50 },
								"res": "“项王喑恶叱咤，千人皆废，匹夫之勇也；待人恭敬慈爱，妇人之仁也。秦卒怨其主久矣——还定三秦，可传檄而定。”你一口气说完，坛上坛下鸦雀无声。汉王猛地起身：恨得信晚也！——这满坛的甲光，从今夜起，要照你走的路了。",
								"eff": {
									"attrs": {
										"junxin": 15,
										"quanshi": 10,
										"shengwang": 8,
										"caixue": 2,
										"moulue": 5
									},
									"dev": 0,
									"flags": ["hanzhongdui"],
									"merit": "汉中",
									"ach": "dengtan"
								},
								"to": "NEXT"
							}, {
								"t": "答以守成之策，稳扎稳打",
								"res": "话说得稳妥，也平庸：缮甲、积谷、徐图。汉王礼貌地点头，眼里的光淡了些。坛下诸将交头接耳——这位新大将，看来也不过如此。稳妥二字，救不了这座大营。",
								"eff": {
									"attrs": {
										"junxin": -5,
										"quanshi": 3
									},
									"dev": 5
								},
								"to": "NEXT"
							}]
						}
					]
				},
				{
					"id": "c3",
					"title": "第三章 ｜ 还定三秦",
					"sub": "前 206—前 205",
					"age": 26,
					"summaryNotes": ["三秦传檄而定。史书说\"八月，汉王举兵东出\"——四个字背后，是你画了三年的地图。", "彭城一败，汉王的五十六万，输给项羽的三万。败军之际，方知谁是砥柱。"],
					"intro": ["大将印绶在手，人人都等你出第一道军令。你的第一道军令出乎所有人意料：修路。⟦樊哙⟧带着人在⟦栈道⟧上日日敲石头，凿石声顺着山谷传出几十里。", "关中三王派探子来看，看完都笑：汉军要修栈道出蜀，修到猴年马月去吧。笑声传到南郑时，你的主力已经悄悄离了城——走的是故道，地图上几乎不画的那条。"],
					"start": "3-1",
					"events": [
						{
							"id": "3-1",
							"title": "明修栈道，暗度陈仓",
							"altSegs": {
								"flag": "hanzhongdui",
								"segs": [
									"明修栈道，⟦暗度陈仓⟧。大军昼伏夜行，出山时人衔枚、马裹蹄。登坛那日你对汉王说的话，今日一字一句兑现——史官后来把这番对策，称为「汉中对」。",
									"陈仓城头的守卒先看见的是晨雾，雾里慢慢显出一面汉旗。⟦章邯⟧披衣登城，看了很久——他守了半辈子的关中门户，被人从背后敲开了。",
									"⟦三秦⟧的天，从这一天开始变了。这一仗，是所有人命运的转折——包括你自己的。"
								]
							},
							"segs": [
								"明修栈道，⟦暗度陈仓⟧。大军昼伏夜行，出山时人衔枚、马裹蹄——几万人的队伍，静得像一群影子。",
								"陈仓城头的守卒先看见的是晨雾，雾里慢慢显出一面汉旗——旗从雾里来，像从梦里来。⟦章邯⟧披衣登城，看了很久：他守了半辈子的关中门户，被人从背后敲开了。",
								"⟦三秦⟧的天，从这一天开始变了。你站在陈仓城下，看着那面旗升上城头——从淮阴到陈仓，这条路，你走了整整二十年。"
							],
							"options": [{
								"t": "举兵东出，传檄而定三秦",
								"hist": true,
								"res": "章邯溃走废丘，塞王欣、翟王翳相继而降。关中父老箪食壶浆，挤在道边看汉军的旗。你勒马咸阳故道，忽然想起淮阴城下的那条河——那条河里的鱼，如今该认得你的手了。",
								"eff": {
									"attrs": {
										"quanshi": 8,
										"shengwang": 8,
										"junxin": 8,
										"moulue": 3
									},
									"dev": 0,
									"merit": "三秦",
									"ach": "chencang"
								},
								"to": [{
									"if": { "caixue": 55 },
									"to": "3-2"
								}, { "to": "3-1b" }]
							}, {
								"t": "兵分两路，正奇相济",
								"res": "一路明修栈道，一路出散关徐徐而进。章邯分兵应对，疲于奔命。三秦还是定了——只是史官的笔，不会为“稳”字多留一行。稳，是给活人看的；快，是给死人看的。",
								"eff": {
									"attrs": {
										"quanshi": 6,
										"shengwang": 4,
										"weiji": 5,
										"moulue": 2
									},
									"dev": 5
								},
								"to": "3-2"
							}]
						},
						{
							"id": "3-1b",
							"title": "陈仓苦战",
							"segs": ["陈仓城坚，章邯死守。你的兵在城下磨了半个月，云梯断了七架——城砖上，都溅满了血。", "伤亡的名单一日厚过一日，营里抬伤兵的担架从早到晚没有空过。军中开始有了议论：大将之名，言过其实。"],
							"options": [{
								"t": "血战拔城",
								"res": "城破之日，你站在陈仓城头，风把血腥味吹出去三里。代价付过了，教训也记住了：奇正之间，差的从来不是胆气，是算度。名将两个字，是拿人命喂出来的。",
								"eff": {
									"attrs": {
										"weiji": 15,
										"quanshi": 5,
										"wuli": 3,
										"tupo": -3
									},
									"dev": 0
								},
								"to": "3-2"
							}, {
								"t": "退保汉中，再图后举",
								"res": "退兵的军令很难下，但你下了。大军卷旗夜走，秩序井然。章邯没有追——他也不敢赌这是不是又一个圈套。退，不是怕，是留着力气。",
								"eff": {
									"attrs": {
										"quanshi": -8,
										"junxin": -5,
										"moulue": 2
									},
									"dev": 3
								},
								"to": "3-2"
							}]
						},
						{
							"id": "3-2",
							"title": "彭城之败",
							"segs": ["汉王合诸侯兵五十六万，乘虚入彭城，日置酒高会。项羽自齐地回师，三万精骑，拂晓时撞破汉军西壁——三万对五十六万，他一头撞了进来。", "五十六万人在半天里散了。睢水为之不流——尸首真的堵了河道。旗帜、辎重、冠冕，丢了一路。"],
							"options": [
								{
									"t": "收拢溃兵，与上会于荥阳",
									"hist": true,
									"res": "你一路收兵，一路整队：百人为队，千人为营，溃卒到你手里重新成了兵。到荥阳时，你交出去的是一支还能打仗的军队。汉王拉着你的手，半天没说出话——败军之中，最能看出一个将领的成色。",
									"eff": {
										"attrs": {
											"quanshi": 5,
											"junxin": 8,
											"shengwang": 3,
											"moulue": 2,
											"zhengji": 5
										},
										"dev": 0
									},
									"to": "3-3"
								},
								{
									"t": "自守成皋，稳住阵脚",
									"res": "你按兵成皋，深沟高垒，楚军三攻不下。战线稳住了，荥阳以西没有再走一步。只是功劳簿上没有你的名字——有些仗，打赢了也没有名字，可没有名字的仗，也得有人打。",
									"eff": {
										"attrs": {
											"quanshi": 3,
											"junxin": -3
										},
										"dev": 3
									},
									"to": "3-3"
								},
								{
									"t": "趁乱扩军，自壮其势",
									"res": "溃兵是最好的兵源：无家可奔，有仗可打。你的军力涨了一截。军报递到汉王案头，他夸了你一句能干，放下简，又看了很久——有些夸奖，比训斥更让人睡不着。",
									"eff": {
										"attrs": {
											"quanshi": 8,
											"weiji": 5
										},
										"dev": 5,
										"zg": 8
									},
									"to": "3-3"
								}
							]
						},
						{
							"id": "3-3",
							"title": "破魏之役",
							"segs": [
								"魏王豹反，塞蒲坂渡口，断绝河桥。他把全部兵马堆在临晋，等着看你强攻——桥断得干干净净。",
								"你把大军摆在渡口对面，日日操练，旗帜蔽野——摆给他看，摆得比真的还像真的。魏军的探马一日三报，报得越勤，魏王豹的枕睡得越稳。",
								"真正的渡军，在百里之外的上游夏阳。没有船——⟦木罂缶⟧，缚木为筏，人坐其上。兵法说，能而示之不能。"
							],
							"options": [{
								"t": "木罂缶渡河，袭安邑",
								"hist": true,
								"res": "魏军还盯着渡口的旗帜，你的兵已经进了安邑城。魏王豹就擒之日，河东父老箪食相迎。战报传到荥阳，汉王抚掌：吾有韩信，何愁魏豹。这世上最快的兵，从来不走别人看得见的路。",
								"eff": {
									"attrs": {
										"quanshi": 6,
										"shengwang": 6,
										"junxin": 5,
										"moulue": 3
									},
									"dev": 0,
									"merit": "破魏"
								},
								"to": [{
									"if": { "caixue": 55 },
									"to": "NEXT"
								}, { "to": "3-3b" }]
							}, {
								"t": "正面强攻，以力破之",
								"res": "尸山血海打下渡口，河水红了半日。仗是赢了，兵书上管这种仗叫“下策”。清点伤亡时你没有说话——赢在城上，输在那些本不该死的名字上。",
								"eff": {
									"attrs": {
										"quanshi": 4,
										"weiji": 8,
										"shengwang": -3,
										"wuli": 3
									},
									"dev": 5
								},
								"to": "NEXT"
							}]
						},
						{
							"id": "3-3b",
							"title": "再渡",
							"segs": [
								"第一次强渡，木罂缶散了一半。筏上的人抱着木板漂回来，落水者的呼喊被河水卷走。魏军醒过味来了——下游烟尘日起，他们在增兵，要把夏阳堆成第二个蒲坂。",
								"军议上诸将的脸色都不好看。你没有说话，走到河边看了一夜水。星子落在河里，随水一起流——你看着它们，像看一盘打不完的棋。",
								"天将亮时你回帐下令：再来一次——这一次没有奇袭，只有硬闯。闯不过去，就死在河里。"
							],
							"options": [{
								"t": "再缚木罂，二次渡河",
								"res": "你把第一次没用完的木罂重新捆扎，亲自押着第二批筏子下水。箭雨里，前筏的人用身体挡住后筏。安邑城头换旗那日，河东的雨停了——士卒说，是天也服了将军。",
								"eff": {
									"attrs": {
										"weiji": 10,
										"quanshi": 3,
										"wuli": 2,
										"tupo": -2
									},
									"dev": 0,
									"merit": "破魏"
								},
								"to": "NEXT"
							}]
						}
					]
				},
				{
					"id": "c4",
					"title": "第四章 ｜ 背水·潍水",
					"sub": "前 205—前 203 · 历史节点",
					"age": 28,
					"summaryNotes": ["井陉口的早晨，三万对二十万。兵书被你翻烂的那一页，今天要用上了。", "潍水的水流很急。急到足够把龙且的二十万，送进你的口袋。"],
					"intro": ["破魏之后，兵锋东指。太行山横在眼前，山那边的赵地，赵歇为王，陈馀为将。二十万大军守在⟦井陉口⟧——太行八陉中最险的一条，车不得方轨，骑不得成列。", "你手里只有三万，一半是井陉道上刚征来、锄头还没放热的新卒。所有人都在等你绕路。你下令：继续前进——军令传出时，连亲兵都愣了一下。"],
					"node": "N2",
					"mutations": [{
						"if": { "shengwang": 60 },
						"flag": "qingdi",
						"note": "【节点异变】你的名声太盛，陈馀反而不敢守——赵军倾巢出垒，要与你野战。"
					}, {
						"if": { "devMin": 46 },
						"flag": "zuochece",
						"note": "【节点异变】历史的走向偏了——这一回，陈馀听了⟦李左车⟧的策。"
					}],
					"start": "4-1",
					"events": [
						{
							"id": "4-1",
							"title": "井陉口",
							"key": true,
							"altSegs": {
								"flag": "zuochece",
								"segs": [
									"夜半，你遣两千轻骑伏于赵营侧的山坳里。斥候回报：赵营深沟高垒，闭门不出——广武君⟦李左车⟧的策，这一回陈馀听了。你望着赵营的炊烟，等了整整三日。",
									"第四日，赵营的辕门终究还是开了。二十万大军不肯再陪你对耗下去——历史偏了一寸，又被你掰了回来。",
									"你传令：全军出井陉口，背水而阵。你说：陷之死地而后生，置之亡地而后存。"
								]
							},
							"segs": [
								"夜半，你遣两千轻骑，人持一赤帜，衔枚疾走，伏于赵营侧的山坳里——两千面赤帜，藏在黑暗里，像两千粒火种。",
								"随后你传令：全军出井陉口，背水而阵。诸将愕然。兵书白纸黑字：右倍山陵，前左水泽——你把阵摆在了死地。赵军的瞭望台上，有人笑出了声。",
								"你说：兵书还说，陷之死地而后生，置之亡地而后存。今日之后，他们会把这一页重新读一遍。"
							],
							"options": [
								{
									"t": "背水一战，大破赵军",
									"hist": true,
									"res": "赵军倾巢争功，汉军退无可退。战至午时，两千赤帜突入赵营，拔赵帜，立汉帜。赵军回望，营垒尽赤——二十万人的阵脚，在一瞬间散了。诸将入贺，问你这是什么兵法。你说：是兵书里你们都读过、都不肯信的那一页。死地这两个字，原来不是写给人怕的，是写给人走的。",
									"eff": {
										"attrs": {
											"quanshi": 8,
											"shengwang": 10,
											"junxin": 5,
											"moulue": 3
										},
										"dev": 0,
										"merit": "破赵",
										"ach": "beishui"
									},
									"to": [{
										"if": { "caixue": 60 },
										"to": "4-2"
									}, { "to": "4-1b" }]
								},
								{
									"t": "据险缓图，不与争锋",
									"res": "你扎下营盘，深沟高垒，与赵军隔口对耗。耗得住的是军心，耗不住的是粮道。一个月后，运粮队的人开始掉队——有些仗，等不起；等，也是一种输法。",
									"eff": {
										"attrs": {
											"quanshi": 4,
											"weiji": 5
										},
										"dev": 5
									},
									"to": "4-2"
								},
								{
									"t": "亲率死士，陷阵夺帜",
									"req": { "wuli": 50 },
									"res": "你披甲执枪，率两千死士直楔赵军阵腹。主将先登，三军气夺，赵军的阵脚竟真被撞开一道口子。赤帜竖起时你勒马尸山之上，臂上添了三处伤——兵仙两个字，有时候也是拿血换的。",
									"eff": {
										"attrs": {
											"wuli": 4,
											"shengwang": 6,
											"quanshi": 4,
											"weiji": 5,
											"tupo": -3
										},
										"dev": 5
									},
									"to": "4-2"
								}
							]
						},
						{
							"id": "4-1b",
							"title": "背水覆军",
							"segs": ["背水之阵没有激出死战。先溃的是左翼——新卒们扔下矛，争相往河边跑，忘了身后只有水。赵军的鼓声震得河水都在抖，二十万人压过来，像山塌下来。", "你挥剑斩了两个逃卒，止不住的。兵败如山倒，是真的山——山倒的时候，没有一块石头听你的。你的第一次大败，来得比想象中快，也比想象中冷。"],
							"options": [{
								"t": "收残兵再战",
								"req": { "shengwang": 45 },
								"res": "你在三十里外收拢残部，斩逃将，抚伤卒，把溃兵重新捏成军队。败军之将，卷土重来——这比打赢难十倍。夜里巡营，听见有人在哭，你没有停下——今夜哭的人，明天会跟着你再打一仗。",
								"eff": {
									"attrs": {
										"quanshi": -10,
										"weiji": 10,
										"moulue": 2
									},
									"dev": 0
								},
								"to": "4-2"
							}, {
								"t": "单骑而逃",
								"res": "亲兵死光了，马也中了一箭。你单骑冲出重围，身后的河水吞掉了一切喊声。马识归途，人不识——你不知道自己还能回到哪里去。兵仙两个字，今夜碎了。",
								"eff": {
									"attrs": { "wuli": 2 },
									"dev": 0
								},
								"to": {
									"ending": "E8",
									"variant": "weishui"
								}
							}]
						},
						{
							"id": "4-2",
							"title": "李左车",
							"segs": [
								"破赵之后，你悬千金之赏：生得广武君⟦李左车⟧者，赏千金。他被押进大帐时，衣甲散乱，脊背却挺得笔直——像一杆没倒的旗。",
								"帐中诸将按剑而立——他的深沟高垒之策若被采用，今日站在帐中的就该是他。",
								"你下座，亲手解其缚，请他东向坐，执弟子礼。你说：百里奚居虞而虞亡，在秦而秦霸——非愚于虞而智于秦也，用与不用耳。"
							],
							"options": [
								{
									"t": "师事之，问北略",
									"hist": true,
									"res": "“败军之将，何足言勇？”左车推辞再三，终被你的诚意打动，为你画策：案甲休兵，镇抚赵地，先声后实，传檄燕齐——一席话，替你省了十万兵的粮。你整衣而拜，忽然想：这一拜，拜的不是一个降将，是一双看透天下的眼睛。",
									"eff": {
										"attrs": {
											"caixue": 5,
											"shengwang": 5,
											"moulue": 3,
											"zhengji": 5
										},
										"dev": 0,
										"flags": ["zuoche"],
										"hist": 10,
										"ach": "zuoche"
									},
									"to": "4-3"
								},
								{
									"t": "斩之示众",
									"res": "一颗人头落地，换得三军一凛。只是从此之后，降者见你先闭了嘴——天下谋士，绕着你的军旗走。这一刀，斩的是一颗头，丢的是满天下的心。",
									"eff": {
										"attrs": {
											"shengwang": -8,
											"weiji": 5
										},
										"dev": 5,
										"hist": -10
									},
									"to": "4-3"
								},
								{
									"t": "释而归之",
									"res": "你赠他干粮马匹，放他走了。他回赵地后逢人便说：韩将军，国士也。赵地的民心，竟比破城时还顺了些。放，有时候比杀更难——难就难在，你赌的是一个还不确定的结果。",
									"eff": {
										"attrs": {
											"shengwang": 3,
											"moulue": 2
										},
										"dev": 3
									},
									"to": "4-3"
								}
							]
						},
						{
							"id": "4-3",
							"title": "潍水龙且",
							"segs": [
								"齐楚合兵二十万，楚将⟦龙且⟧率之救齐，与你夹潍水而阵。龙且是项王麾下第一悍将，有人劝他深沟坚守，他笑：吾生平知韩信之为人——易与耳。",
								"你令士卒连夜赶制万余沙囊，趁夜壅塞上流。天亮时，潍水浅得能看见河底的卵石——水浅得，像谁都能蹚过去。",
								"天明，你引军涉水而击，战不数合，佯败回走——你跑得不快不慢，恰好让对岸的人看得清，追得急。龙且大喜：固知信怯也！二十万人争先恐后，下了河。"
							],
							"options": [{
								"t": "半渡而击，水淹楚军",
								"hist": true,
								"res": "楚军半渡，你决开沙囊——壅了一夜的水砸下来，潍水暴涨，二十万人被斩成两段。龙且授首于乱军之中，齐王广就擒。水退之后，河滩上的楚旗铺了十里——这一水，淹的不是楚军，是\"易与耳\"三个字。",
								"eff": {
									"attrs": {
										"quanshi": 8,
										"shengwang": 10,
										"junxin": 5,
										"moulue": 3
									},
									"dev": 0,
									"merit": "破齐",
									"flags": ["poqi"],
									"ach": "longju"
								},
								"to": [{
									"if": { "caixue": 60 },
									"to": "NEXT"
								}, { "to": "4-3b" }]
							}, {
								"t": "深沟高垒，持久疲敌",
								"res": "你不打。龙且骂阵三月，从“胯下夫”骂到祖宗八代，骂不动了，粮尽了，营里先乱了。他退兵那日，你没有追——骂阵的嘴，敌不过断粮的肚子。",
								"eff": {
									"attrs": {
										"quanshi": 4,
										"junxin": -3,
										"weiji": 3,
										"moulue": 2
									},
									"dev": 5,
									"flags": ["poqi"]
								},
								"to": "NEXT"
							}]
						},
						{
							"id": "4-3b",
							"title": "潍水胶着",
							"segs": ["沙囊决早了半刻。大水只冲走了楚军前队，龙且带着主力缩回对岸，两军隔河僵住。河滩上搁浅的楚军尸首没人收，乌鸦落了一层。", "齐地的冬天来得早，粮道拉得太长，士卒的碗里渐渐稀了。夜里巡营，你听见士卒呵着手骂娘——骂娘不怕，怕的是骂完之后，人散了。"],
							"options": [{
								"t": "夜袭连营",
								"req": { "shengwang": 55 },
								"res": "三更火起，你亲率死士踹开楚军后营。楚军自相惊扰，人马相踏。龙且退三十里，齐地的大门，还是被你撞开了——只是门轴上，挂着你的人马。这一夜，赌的是士气。",
								"eff": {
									"attrs": {
										"quanshi": 5,
										"weiji": 8,
										"wuli": 3,
										"tupo": -2
									},
									"dev": 0,
									"flags": ["poqi"]
								},
								"to": "NEXT"
							}, {
								"t": "请汉王增兵",
								"res": "请兵的奏报递上去，援兵到了，仗打赢了。但那封奏报也永远留在了汉王的案头——韩信的兵，也有不够用的那天。谢恩的表章写得比平时更长——有些话，不说透，就永远隔着一层。",
								"eff": {
									"attrs": {
										"junxin": -8,
										"quanshi": 3
									},
									"dev": 3,
									"flags": ["poqi"]
								},
								"to": "NEXT"
							}]
						}
					]
				},
				{
					"id": "c5",
					"title": "第五章 ｜ 齐王",
					"sub": "前 203 · 历史节点 · 全剧本枢纽",
					"age": 29,
					"summaryNotes": ["封王的诏书到的那天，你站在齐王宫的台阶上，看见了汉王眼睛里所有的明天。"],
					"intro": ["齐地初定，七十馀城尽下。你站在齐王宫的台阶上想了一件事：这片刚刚打下来的地，需要一个王来镇。", "你遣使上书荥阳：齐伪诈多变，南近楚地，不为王不足以镇之——愿为假王。汉王览书，勃然大怒，骂声震屋。张良、陈平在案下各踩了他一脚——使者的性命，就悬在这一脚上。"],
					"node": "N3",
					"start": "5-1",
					"events": [
						{
							"id": "5-1",
							"title": "请封假王",
							"key": true,
							"segs": [
								"使者从汉王处回来，带回了诏书。“大丈夫定诸侯，即为真王耳，何以假为！”——字写得很大方，大方得像是在替你高兴。",
								"你读懂了大方背后的东西：他肯给的，是真王；他记下的，是你开口讨过——这两样，都写进了他的心里。",
								"册封的使者南来之日，鼓乐声里，你接过王印——印是凉的，压手。从这一天起，你不只是将军了，也不只是臣子了。"
							],
							"options": [
								{
									"t": "静候汉王处分",
									"hist": true,
									"res": "你从假王成了真齐王。谢恩的表章写得恭谨，一字一句都挑不出错。汉王的猜忌却从这一天开始记账——王冠戴上了，就摘不下来了；摘不下来，也放不下。",
									"eff": {
										"attrs": {
											"quanshi": 12,
											"junxin": 5
										},
										"dev": 0,
										"merit": "齐王",
										"ach": "qiwang",
										"zg": 15
									},
									"to": "5-2"
								},
								{
									"t": "上书谢罪，自贬一级",
									"res": "你上书谢罪，主动把“王”字往外推了一步，言辞恳切。汉王准了，赏你温良恭俭，也记住了你的退让。这一步退得对不对，得看长安的那位怎么看。",
									"eff": {
										"attrs": {
											"junxin": 8,
											"quanshi": -5,
											"caixue": 2
										},
										"dev": 5,
										"zg": -5
									},
									"to": "5-2"
								},
								{
									"t": "再遣使催封",
									"res": "第二封催封的书信送出，齐地弹冠相庆，汉廷上下侧目。诏书还是来了，只是字里行间冷了几分。你要到了王爵，也把自己钉在了长安的眼皮底下——赢在王号，输在那双越来越冷的眼睛里。",
									"eff": {
										"attrs": {
											"quanshi": 5,
											"junxin": -8
										},
										"dev": 5,
										"zg": 20
									},
									"to": "5-2"
								}
							]
						},
						{
							"id": "5-2",
							"title": "垓下之会",
							"segs": ["前202年冬，你会诸侯兵于⟦垓下⟧，围项羽于乌江之侧。三十万大军，十面埋伏。楚军粮尽，夜闻汉营四面皆楚歌——歌声从四面八方来，像从地底下钻出来的。", "这是你一生中最大的一盘棋——项羽是棋子，天下是棋盘。夜里你登上高处，看楚营的火把一点一点暗下去。那个你曾经执戟侍奉的人，就在火光里，正在听四面八方的歌。"],
							"options": [{
								"t": "独当一面，十面埋伏",
								"hist": true,
								"res": "四面楚歌起时，霸王别姬，突围，自刎乌江。六年的楚汉之争，在你的阵前落幕。你站在垓下的寒风里，忽然想起楚营帐外的那轮月——它照过执戟的你，也照过帐中的他。今夜之后，它只照天下，不照故人了。",
								"eff": {
									"attrs": {
										"shengwang": 10,
										"quanshi": 4,
										"moulue": 3
									},
									"dev": 0,
									"merit": "垓下"
								},
								"to": "5-3"
							}, {
								"t": "让首功于诸将",
								"res": "你把中军大帐让给了灌婴，自己领了侧翼。庆功宴上人人夸你大度，汉王看你的眼神暖了几分。从今夜起，你开始学着把自己变小——变小，是为了活；可活着的自己，还认不认得那个从淮阴走出来的人？",
								"eff": {
									"attrs": {
										"shengwang": -5,
										"junxin": 8,
										"moulue": 2
									},
									"dev": 5,
									"zg": -8
								},
								"to": "5-3"
							}]
						},
						{
							"id": "5-3",
							"title": "蒯通之对",
							"key": true,
							"segs": [
								"齐人⟦蒯通⟧来见你。此人遍说诸侯，舌上有江山。他相你之面，说：“贵不可言。”相你之背，欲言又止——话到嘴边，又咽了回去。",
								"屏退左右之后，他才把话说尽：“当今之世，两主之命县于足下。足下为汉则汉胜，为楚则楚胜——莫若三分天下，鼎足而居。”",
								"这一句话，你要用一生来答。你握着酒盏，看着那截将尽的烛，忽然想：这句话，接得住，是王；接不住，是罪。"
							],
							"options": [
								{
									"t": "谢曰：“汉王遇我厚，岂可背义！”",
									"hist": true,
									"res": "“汉王解衣衣我，推食食我——向利而背义，吾不忍也。”蒯通长叹，再拜而去。出门时他说了句什么，风太大，你没有听清。很多年后钟室的门阖上时，你才想起来，那句话说的是：天与弗取，反受其咎。",
									"eff": {
										"attrs": {
											"junxin": 5,
											"biancai": 2
										},
										"dev": 0,
										"zg": -5,
										"flags": ["conghan"]
									},
									"to": "NEXT"
								},
								{
									"t": "听蒯通，据齐三分",
									"res": "“先生之言，深中我心。”你起身送蒯通出帐，亲手替他系好斗篷。当夜，临淄的城头换了备战的灯笼，武库的门锁一一打开——这一夜，你把天下摆上了棋盘。棋局开弓，就没有回头箭了。",
									"eff": {
										"attrs": { "weiji": 30 },
										"dev": 40,
										"ach": "kuaitong"
									},
									"to": [{
										"if": {
											"quanshi": 70,
											"zgMax": 59,
											"devMin": 46
										},
										"to": { "ending": "E6" }
									}, { "to": { "ending": "E4" } }]
								},
								{
									"t": "从汉，但请解兵权归老",
									"res": "“臣愿还兵符，归老淮阴——功已成，名已就，所求者，全此身耳。”话说出口，你自己先静了一瞬。蒯通看了你很久，拱手：将军能下这个决心，胜得过百万兵。归老两个字，说出来轻，做起来——得像当年放下鱼竿一样，放下手里的兵符。",
									"eff": {
										"attrs": {
											"quanshi": -15,
											"weiji": -10
										},
										"dev": 15
									},
									"to": [
										{
											"if": {
												"zhengji": 15,
												"shengwang": 50
											},
											"to": {
												"ending": "E5",
												"variant": "huaiyin"
											}
										},
										{
											"if": { "shengwang": 50 },
											"to": { "ending": "E5" }
										},
										{ "to": "NEXT" }
									]
								},
								{
									"t": "阳从阴蓄，徐图其后",
									"req": { "moulue": 65 },
									"res": "你谢了蒯通，也谢了汉王。两封回信措辞都极恭顺，字缝里却藏着两套心思——只有你自己知道哪一封是真的。从今夜起，你写的每个字都要读两遍——连你自己，都要学会对自己说一半留一半了。",
									"eff": {
										"attrs": {
											"weiji": 15,
											"moulue": 3
										},
										"dev": 15,
										"flags": ["xuli"]
									},
									"to": "NEXT"
								}
							]
						}
					]
				},
				{
					"id": "c6",
					"title": "第六章 ｜ 云梦与钟室",
					"sub": "前 202—前 196（从汉线）",
					"age": 35,
					"summaryNotes": ["史书行到此处，只剩最后一页。云梦的云，长乐的钟，都在这一页里。"],
					"intro": ["垓下既毕，天下底定。论功行赏的名单写了一版又一版，你的名字始终在最上头——也最刺眼。汉王徙你为楚王，都下邳。", "你回到淮阴。赐漂母千金，召辱己之少年为中尉。恩怨两讫，乡人称颂——还乡的路，是离长安最远、也最身不由己的路。"],
					"start": "6-1",
					"events": [
						{
							"id": "6-1",
							"title": "徙楚王",
							"altSegs": {
								"flag": "kuaxia",
								"segs": [
									"项王已死，天下无仗可打——你的兵权也被一并收走了大半。楚王的王冠很好，只是不再染兵气。",
									"还乡的队伍经过淮阴。当年那个屠中少年跪在道旁，伏地不敢抬头——满街的人都在等你怎么处置他。",
									"你下车，亲手把他扶了起来，授为中尉。你说：此壮士也。当年辱我时若杀了他，不过多一桩命案；留下他，才有今日。"
								]
							},
							"segs": ["项王已死，天下无仗可打——你的兵权，也被一并收走了大半。楚王的王冠很好，旒珠垂下来，只是不再染兵气。", "衣锦还乡那日，下邳万人空巷。人山人海里，有人喊楚王，有人喊淮阴侯，有人喊：那不是当年城下钓鱼的小子吗。你坐在车上，脊背挺得笔直。"],
							"options": [{
								"t": "报德雪怨并施",
								"hist": true,
								"res": "“一饭千金”，漂母受之——她已老得认不出你了；“胯下之辱”，少年拜为中尉，伏地发抖。恩怨皆了，史官把这两笔都记下了。这一饭与一胯，是你这辈子的起笔——今夜，都收笔了。",
								"eff": {
									"attrs": {
										"shengwang": 8,
										"moulue": 2
									},
									"dev": 0,
									"hist": 15
								},
								"to": "6-2"
							}, {
								"t": "薄赏旧怨，不置一词",
								"res": "你什么也没赏，什么也没罚。府前等赏的人散了，等罚的人也散了。城下的河水照样流，不欠谁，也不谢谁——有些账，你记了一辈子；有些账，你连翻开都不肯。",
								"eff": {
									"attrs": { "shengwang": -3 },
									"dev": 3,
									"hist": -5
								},
								"to": "6-2"
							}]
						},
						{
							"id": "6-2",
							"title": "钟离眜来投",
							"segs": ["楚旧将⟦钟离眜⟧，帝之宿怨，亡命来归。他夜叩王府后门，一身尘土，进门先解剑：“信与公，旧相识也。”剑穗还是楚军的颜色。", "收留他意味着什么，他知道，你也知道。门外，朝廷缉拿他的海捕文书已经贴到了下邳的城门口，画像画得很像——像得连你自己都认得出。"],
							"options": [
								{
									"t": "收而庇之",
									"hist": true,
									"res": "你把他藏进王府深处，对外只说府里新来了个马夫。义气你全了，把柄你也递出去了——长安的眼睛多，总有一天会看见这座王府的墙缝。这一藏，藏的是故人，也是祸根。",
									"eff": {
										"attrs": { "shengwang": 5 },
										"dev": 0,
										"flags": ["zhongli"],
										"zg": 10
									},
									"to": "6-3"
								},
								{
									"t": "拒而不纳",
									"res": "钟离眜看着你，看了很久，惨笑而去。三日后，他自刭于客舍，血书只有四个字：不怨将军。你把那四个字烧了——烧得掉字，烧不掉意。",
									"eff": {
										"attrs": { "shengwang": -3 },
										"dev": 3,
										"zg": -5
									},
									"to": "6-3"
								},
								{
									"t": "缚而献之",
									"res": "使者押着钟离眜北去时，你站在阶上看了很久。他没有回头，也没有骂你。义与利之间，你选了后者——这一献，献的是一颗头，也是你与\"旧\"字之间，最后一根线。",
									"eff": {
										"attrs": {
											"junxin": 5,
											"shengwang": -8,
											"moulue": 2
										},
										"dev": 5,
										"hist": -10
									},
									"to": "6-3"
								}
							]
						},
						{
							"id": "6-3",
							"title": "伪游云梦",
							"altSegs": {
								"flag": "zhongli",
								"segs": [
									"帝伪游⟦云梦⟧，会诸侯于陈。谁都听得懂弦外之音。去，是局；不去，也是局。",
									"府中有人劝你发兵，有人劝你逃亡。你独坐了一夜。",
									"天明时，钟离眜自己走进了你的书房。一个时辰后，他的头颅函在了你的车里。车轮向北。你想，捧着这颗头去，总该换得一个清白。"
								]
							},
							"segs": [
								"帝伪游⟦云梦⟧，会诸侯于陈。诏书写得云淡风轻：天子巡狩，诸侯朝会——六个字，满天下的诸侯都读出了第三层意思。去，是局；不去，也是局。",
								"府中有人劝你发兵，有人劝你逃亡。你独坐了一夜。",
								"天明时，你整衣登车——两手空空地去。车上没有要献给谁的人头，只有你自己。你想，行得正，未必站得稳；可捧着别人的头去换的清白，不叫清白。"
							],
							"options": [
								{
									"t": "持钟离眜首级往谒",
									"hist": true,
									"res": "你捧着函首入帐，话还没说完，武士一拥而上。绳缚加身时你说：“果若人言：狡兔死，走狗烹。”帝在帘后，没有应声。槛车东去，云梦的云压得很低——这句话，你早知道会有今天，只是你赌的，是它不会来得这么快。",
									"eff": {
										"attrs": { "shengwang": -5 },
										"dev": 0
									},
									"to": [{
										"if": { "zgMax": 69 },
										"to": "6-4"
									}, { "to": {
										"ending": "E8",
										"variant": "yunmeng"
									} }]
								},
								{
									"t": "发兵拒捕",
									"req": { "quanshi": 60 },
									"res": "你下令发兵。令还没出王府，消息已经出了下邳——周勃的大军封锁泗水，比你想的快了三天。原来这些年，你的每一步都有人替你\"记着\"——\"兵仙\"两个字，在长安的账本上，早就写成了\"反\"。",
									"eff": {
										"attrs": { "weiji": 30 },
										"dev": 30
									},
									"to": {
										"ending": "E8",
										"variant": "yunmeng"
									}
								},
								{
									"t": "称病不往",
									"res": "你上表称病。第一道催行的诏书来了，语气温和；第二道，温和少了些；第三道到时，随诏同来的还有廷尉府的人。这世上的病，有的是真病，有的是借口——可坐在龙椅上的人，从来不问哪一种。",
									"eff": {
										"attrs": {
											"junxin": -10,
											"weiji": 10
										},
										"dev": 5,
										"zg": 10
									},
									"to": "6-4"
								},
								{
									"t": "历数战功，廷前自辩",
									"req": { "zhengji": 12 },
									"res": "武士一拥而上时，你没有喊冤——你报功。还定三秦、木罂渡魏、背水破赵、潍水斩龙且、垓下十面，数到无人敢接话。帝在帘后沉默：杀功臣，须向天下交代。到长安，诏书改一字：赦——这一赦，赦的是你的命，也是长安的交代，两样都不是为你。",
									"eff": {
										"attrs": {
											"shengwang": -3,
											"weiji": 5
										},
										"dev": 0
									},
									"to": "6-4"
								}
							]
						},
						{
							"id": "6-4",
							"title": "长安怏怏",
							"key": true,
							"segs": [
								"你被赦了死罪，降为淮阴侯，留居长安。居常怏怏。列侯朝会，你与绛侯、灌婴同列，称病不朝的日子越来越多。",
								"有一回路过⟦樊哙⟧府，他跪拜送迎，口称大王。你出门后自嘲：生乃与哙等为伍！",
								"⟦陈豨⟧拜钜鹿守，临行来辞。屏退左右，烛火摇了三摇。你们谈了很久。谈的是边兵，是陛下，是万一。"
							],
							"options": [{
								"t": "勉其反，约为内应",
								"hist": true,
								"res": "“公之所居，天下精兵处也；公为陛下信臣——人言公反，陛下必不信；再三言，乃怒，必自将而击之。吾为公从中起，天下可图也。”陈豨顿首曰：谨奉教。你送他出门，看着那轮月——这句话说出口，你就把后半生，也押上去了。",
								"eff": {
									"attrs": {
										"weiji": 15,
										"moulue": 3
									},
									"dev": 10,
									"flags": ["chenxi"],
									"zg": 10
								},
								"to": [{
									"if": {
										"flag": "xuli",
										"quanshi": 75,
										"weijiMax": 79
									},
									"to": { "ending": "E7" }
								}, { "to": "6-5" }]
							}, {
								"t": "戒其忠慎，勿生异志",
								"res": "陈豨愕然良久——他原以为会听见另一套话。他拜谢而去，你送他到门口。有些话，你说不出口，不是不想说——是你已经不信了。",
								"eff": {
									"attrs": {
										"shengwang": 3,
										"junxin": 3
									},
									"dev": 3,
									"hist": 5
								},
								"to": "6-5"
							}]
						},
						{
							"id": "6-5",
							"title": "钟室",
							"segs": [
								"陈豨反于代，帝自将击之。你的舍人上书告变。事情败露得比你想的快——或者说，比你想的慢：慢到足够⟦吕后⟧把每一步都铺好。",
								"吕后与⟦萧何⟧以计绐你：豨已死，群臣皆贺，侯虽病，强入贺。相国的亲笔信就放在案上，字迹是你认得的——这个追了你三十里的人，又追了你最后一次。",
								"⟦长乐宫⟧的钟室里，烛火通明。你一生计算的终点，是一间没有窗的屋子。"
							],
							"options": [{
								"t": "入贺",
								"hist": true,
								"res": "你整衣入贺。宫门在你身后一扇接一扇关上，钟声不知何时停了。“吾悔不用蒯通之计，乃为儿女子所诈，岂非天哉！”——钟室之门，在你身后阖上。这一年，你三十五岁。那夜蒯通出门时说的那句话，你终于听懂了——天与弗取，反受其咎。",
								"eff": { "dev": 0 },
								"to": [{
									"if": { "flag": "xuli" },
									"to": {
										"ending": "E8",
										"variant": "mouxie"
									}
								}, { "to": { "ending": "E1" } }]
							}, {
								"t": "称疾不贺",
								"res": "你赌她不敢擅杀功臣——赌错了。称病的第三日，缇骑围府。你忽然明白：从齐王到淮阴侯，从云梦到长安，这条路从来不是你自己在走——龙椅上的那两个人，从来不跟你算账，他们只跟你算命。",
								"eff": {
									"attrs": { "weiji": 15 },
									"dev": 5
								},
								"to": [{
									"if": { "weijiMax": 84 },
									"to": { "ending": "E1" }
								}, { "to": {
									"ending": "E8",
									"variant": "mouxie"
								} }]
							}]
						}
					]
				}
			],
			"CORRECTIONS": [
				{
					"minDev": 21,
					"maxDev": 45,
					"chance": .3,
					"title": "修正 ｜ 军中流言",
					"segs": [
						"【历史修正】军营里开始有人编排你：胯下之夫，也配为大将？",
						"话传得有鼻子有眼，连当年市上围观的张三李四都有名有姓。",
						"你改动的每一步，都有人眼红。旧账不怕没人翻，只怕没人记得。"
					],
					"eff": {
						"attrs": { "shengwang": -5 },
						"dev": 0
					}
				},
				{
					"minDev": 21,
					"maxDev": 45,
					"chance": .3,
					"title": "修正 ｜ 粮道被劾",
					"segs": [
						"【历史修正】御史参了一本：你的军需出入，有三笔对不上。",
						"三笔账其实都有去向。但辩白这件事本身，就已经输了体面。",
						"你灰头土脸了几日。管过粮仓的人，永远洗不净手上的米香。"
					],
					"eff": {
						"attrs": {
							"weiji": 4,
							"junxin": -3
						},
						"dev": 0
					}
				},
				{
					"minDev": 21,
					"maxDev": 45,
					"chance": .3,
					"title": "修正 ｜ 旧部离心",
					"segs": [
						"【历史修正】一名楚营旧部留书出走，信上只有一句：“将军非复淮阴之将军矣。”",
						"他走得干干净净，连当月的军饷都没领。",
						"你改道的每一步，旧日同袍都在重新打量你。"
					],
					"eff": {
						"attrs": {
							"shengwang": -4,
							"weiji": 2
						},
						"dev": 0
					}
				},
				{
					"minDev": 46,
					"maxDev": 70,
					"chance": 1,
					"title": "修正 ｜ 诸将联合",
					"segs": [
						"【历史修正】绛侯、颍阴侯联袂过府，名为叙旧，叙到三更。",
						"酒过三巡，他们说起封赏，说起兵权，说起“有些人”。他们看你的眼神，像看一座迟早要平的山。",
						"你改动的封赏次序，动的都是他们的位置。"
					],
					"eff": {
						"attrs": {
							"weiji": 12,
							"shengwang": -5
						},
						"dev": 0
					}
				},
				{
					"minDev": 46,
					"maxDev": 70,
					"chance": 1,
					"title": "修正 ｜ 君王夜问",
					"segs": [
						"【历史修正】汉王夜召⟦张良⟧入宫，屏退左右，谈到四更。",
						"次日看你的赏赐薄了一档——没有明旨，没有申斥，只是薄了。他在重新称你的分量。",
						"【刘邦疑心】那杆秤，开始往不利于你的一侧倾斜。"
					],
					"eff": {
						"attrs": { "junxin": -6 },
						"zg": 6,
						"dev": 0
					}
				},
				{
					"minDev": 46,
					"maxDev": 70,
					"chance": 1,
					"title": "修正 ｜ 旧敌反噬",
					"segs": [
						"【历史修正】⟦章邯⟧旧部在关中复炽，打着“诛韩”的旗号劫你的粮队。",
						"押粮的军吏带伤逃回，说贼人操秦军旧口令，进退有法。",
						"你改写的那场败仗，败军之将的后人还记得。"
					],
					"eff": {
						"attrs": {
							"weiji": 10,
							"caifu": -6
						},
						"dev": 0
					}
				},
				{
					"minDev": 71,
					"maxDev": 100,
					"chance": 1,
					"title": "修正 ｜ 天命反噬",
					"segs": [
						"【历史修正】你改得太多：军报、谗言、密奏雪片般飞向长安。",
						"有人要用最古老的方式，让历史回到正轨。",
						"天下的棋盘已经容不下一个比棋手更大的棋子。"
					],
					"eff": {
						"attrs": {
							"weiji": 18,
							"junxin": -8
						},
						"dev": 0
					}
				},
				{
					"minDev": 71,
					"maxDev": 100,
					"chance": 1,
					"title": "修正 ｜ 吕后之目",
					"segs": [
						"【历史修正】长乐宫的⟦吕后⟧，开始亲自过问你的起居注。",
						"你几时睡，几时起，见了什么人，收了什么礼，都有人一一记下。她看你的方式，像看一份迟早要批的死刑奏章。",
						"【刘邦疑心】被更早、更冷的眼睛接了过去。"
					],
					"eff": {
						"attrs": { "weiji": 15 },
						"zg": 8,
						"dev": 0
					}
				},
				{
					"minDev": 71,
					"maxDev": 100,
					"chance": 1,
					"title": "修正 ｜ 使者频繁",
					"segs": [
						"【历史修正】朝廷的使者一月三至，名为慰问，实为检校。",
						"他们数你的甲士，看你的仓廪，记你的宾客。你的王府，已经是一座透明的城。",
						"你改动的历史越大，盯着你的眼睛就越多。"
					],
					"eff": {
						"attrs": {
							"weiji": 14,
							"shengwang": -6
						},
						"dev": 0
					}
				}
			],
			"ACHIEVEMENTS": {
				"kuaxia": "胯下之忍",
				"piaomu": "一饭之恩",
				"xiaohe": "国士无双",
				"dengtan": "登坛拜将",
				"chencang": "暗度陈仓",
				"beishui": "背水一战",
				"zuoche": "师事左车",
				"longju": "潍水龙且",
				"qiwang": "齐王",
				"kuaitong": "蒯通之计",
				"zhongshi": "钟室之斩",
				"xuedao": "学道全身",
				"shiwodai": "时不我待"
			},
			"KEY_NODE_NAMES": {
				"2-5": "登坛拜将",
				"4-1": "背水一战",
				"5-1": "请封齐王",
				"5-3": "蒯通之对",
				"6-4": "陈豨之辞"
			},
			"RANDOM_EVENTS": [
				{
					"id": "R-1",
					"title": "漂母旧事",
					"chapters": [0, 1],
					"segs": ["有淮阴同乡路过军营，捎来漂母的口信：饭吃不吃得好，无妨；人要活出个样子。"],
					"options": [{
						"t": "托他捎回钱帛",
						"res": "你把半月的粮饷塞进同乡行囊，又添一句“天寒添衣”。恩可以不报，不能不记。",
						"eff": {
							"attrs": {
								"caifu": -3,
								"shengwang": 2
							},
							"dev": 0
						},
						"to": "RETURN"
					}, {
						"t": "只回一句“记下了”",
						"res": "话说出口你先沉默了。有些债，只能先欠着——欠着才走得动路。",
						"eff": {
							"attrs": { "weiji": -1 },
							"dev": 0
						},
						"to": "RETURN"
					}]
				},
				{
					"id": "R-2",
					"title": "军中较剑",
					"chapters": [1, 3],
					"segs": ["营中几个悍卒听闻你带剑，约你较技，赌注是一坛酒。围观者甚众，都等着看这个“读书人”出丑。"],
					"options": [{
						"t": "下场比试",
						"res": "三招之内见分晓，对方的剑飞出去插在草垛上。从此营中再没人拿你的出身说事。",
						"eff": {
							"attrs": {
								"shengwang": 3,
								"weiji": 2
							},
							"dev": 0
						},
						"to": "RETURN"
					}, {
						"t": "笑而不应",
						"res": "你拱手绕开，人群里爆出几声嗤笑。剑是用来定胜负的，不是用来堵嘴的。",
						"eff": {
							"attrs": {
								"shengwang": -2,
								"weiji": -2
							},
							"dev": 0
						},
						"to": "RETURN"
					}]
				},
				{
					"id": "R-3",
					"title": "萧何问计",
					"chapters": [2, 4],
					"cond": { "flag": "xiaohe" },
					"segs": ["相国深夜过访，屏退左右，开门见山：以君观之，当下时局如何？烛花爆了两声。"],
					"options": [{
						"t": "和盘托出",
						"res": "你们对着地图谈到四更。萧何走时把你的手按了两按——什么都没说，什么都说了。",
						"eff": {
							"attrs": {
								"junxin": 3,
								"caixue": 2
							},
							"dev": 0
						},
						"to": "RETURN"
					}, {
						"t": "点到为止",
						"res": "话说三分留七分。萧何笑了笑，也不深问。聪明人之间，留白也是话。",
						"eff": {
							"attrs": { "weiji": -2 },
							"dev": 0
						},
						"to": "RETURN"
					}]
				},
				{
					"id": "R-4",
					"title": "门客来投",
					"chapters": [2, 6],
					"segs": ["一个落魄的读书人站在你门前三天了，求为门客。仆从问他有何所长，他说：无一长，唯不事二主。"],
					"options": [{
						"t": "收为门客",
						"res": "你收下了他，供饭供屋。这份心气你倒熟悉——当年淮阴城下，你也是这样站着。",
						"eff": {
							"attrs": {
								"caifu": -4,
								"shengwang": 3
							},
							"dev": 0
						},
						"to": "RETURN"
					}, {
						"t": "让仆从打发走",
						"res": "读书人长揖到地，整了整衣襟，走进人流。乱世里，这样的背影太多了。",
						"eff": { "dev": 0 },
						"to": "RETURN"
					}]
				},
				{
					"id": "R-5",
					"title": "樊哙挑衅",
					"chapters": [2, 5],
					"segs": ["军中宴饮，舞阳侯⟦樊哙⟧喝得半醉，当众发难：“胯下之夫，也配与吾等同列？”"],
					"options": [
						{
							"t": "笑而受之",
							"res": "你离席给他斟了一爵酒，双手奉上。樊哙愣了半晌，仰头干了，没再说话。",
							"eff": {
								"attrs": {
									"weiji": -3,
									"shengwang": 2
								},
								"dev": 0
							},
							"to": "RETURN"
						},
						{
							"t": "当庭折之",
							"res": "你历数三场战役，问樊哙打下来几场。帐里静得可怕，连炭火都不响了。",
							"eff": {
								"attrs": {
									"shengwang": 3,
									"weiji": 6
								},
								"dev": 0
							},
							"to": "RETURN"
						},
						{
							"t": "以兵法折服之",
							"req": { "caixue": 55 },
							"res": "你不谈勇力，只谈兵势。三问之后，樊哙离席下拜：听君一席，胜打十年仗。",
							"eff": {
								"attrs": {
									"shengwang": 5,
									"junxin": 3
								},
								"dev": 0
							},
							"to": "RETURN"
						}
					]
				},
				{
					"id": "R-6",
					"title": "张良夜访",
					"chapters": [3, 6],
					"cond": { "junxin": 40 },
					"segs": ["留侯⟦张良⟧携一壶酒来访，披一件半旧的鹤氅。他不谈军，不谈政，只谈山中何所有。"],
					"options": [{
						"t": "与他坐而论道",
						"res": "谈到月斜，子房临去时说了一句：功成身退，天之道也。你送他出门，把这句话记下了。",
						"eff": {
							"attrs": {
								"weiji": -3,
								"caixue": 2
							},
							"dev": 0
						},
						"to": "RETURN"
					}, {
						"t": "只叙寒温，不谈机要",
						"res": "张良看了看天色，笑着告辞。聪明人的试探，你装作没听懂——听懂的人，都死得早。",
						"eff": {
							"attrs": { "weiji": -1 },
							"dev": 0
						},
						"to": "RETURN"
					}]
				},
				{
					"id": "R-7",
					"title": "旧卒求恤",
					"chapters": [1, 6],
					"segs": ["一个断腿的老卒拦在营外，拄着一根削尖的木棍。他说当年与你同伍攻魏，如今残了，无以为生。"],
					"options": [{
						"t": "厚恤之",
						"res": "老卒磕头时，围观的士卒都看着。次日营中多了几分敬意——军队记性好，记着谁把人当人。",
						"eff": {
							"attrs": {
								"caifu": -4,
								"shengwang": 3
							},
							"dev": 0
						},
						"to": "RETURN"
					}, {
						"t": "按例给遣",
						"res": "照章程给了遣散钱，一文不少。老卒没说什么，一瘸一拐走了。你的心里却空了一块。",
						"eff": {
							"attrs": {
								"caifu": -2,
								"shengwang": -2
							},
							"dev": 0
						},
						"to": "RETURN"
					}]
				},
				{
					"id": "R-8",
					"title": "夜读兵书",
					"chapters": [0, 6],
					"segs": ["更鼓三声，府里的人都睡下了。案上的《司马法》还剩最后一卷，烛火只剩一截。"],
					"options": [{
						"t": "挑灯读完",
						"res": "天边泛白时你搁下卷。眼里是血丝，心里是山河。书翻旧了，仗还没打完。",
						"eff": {
							"attrs": {
								"caixue": 4,
								"weiji": 2
							},
							"dev": 0
						},
						"to": "RETURN"
					}, {
						"t": "熄灯睡觉",
						"res": "你吹灭蜡烛，摸黑躺下。书明天还在，命只有一条——这是淮阴城下教你的道理。",
						"eff": {
							"attrs": { "weiji": -2 },
							"dev": 0
						},
						"to": "RETURN"
					}]
				},
				{
					"id": "R-9",
					"title": "汉王观阵",
					"chapters": [3, 5],
					"cond": { "junxin": 45 },
					"segs": ["汉王忽然亲临校场，车驾到时尘土未落，要看你练兵。满营的目光都聚过来——这一看，看的不只是阵。"],
					"options": [{
						"t": "倾囊展示",
						"res": "阵法开合，如臂使指，汉王抚掌三次。他走后，你的名字在营中又重了一分。",
						"eff": {
							"attrs": {
								"junxin": 4,
								"shengwang": 2
							},
							"dev": 0
						},
						"to": "RETURN"
					}, {
						"t": "示以寻常操典",
						"res": "你藏了七分本事，只演了常规操典。汉王看了半场就走了，神色淡淡——藏得住的是本事，藏不住的是心思。",
						"eff": {
							"attrs": {
								"weiji": -2,
								"junxin": -2
							},
							"dev": 0
						},
						"to": "RETURN"
					}]
				},
				{
					"id": "R-10",
					"title": "齐地豪强",
					"chapters": [4, 6],
					"cond": { "quanshi": 30 },
					"segs": ["齐地几户大族联名求见，车马云集，献上厚礼。话说得恭敬，眼睛却不恭敬——都在试探你的意思。"],
					"options": [{
						"t": "收礼结交",
						"res": "礼物入库，交情入账，席散时已经称兄道弟。齐地的水，你算蹚明白了。",
						"eff": {
							"attrs": {
								"caifu": 6,
								"weiji": 4
							},
							"dev": 0
						},
						"to": "RETURN"
					}, {
						"t": "原礼奉还",
						"res": "豪强们的脸色变了变，躬身退下。从此齐地看你，敬少了，计多了。",
						"eff": {
							"attrs": {
								"shengwang": 3,
								"weiji": 2
							},
							"dev": 0
						},
						"to": "RETURN"
					}]
				},
				{
					"id": "R-11",
					"title": "吕后召见",
					"chapters": [5, 6],
					"cond": { "weiji": 40 },
					"segs": ["长乐宫遣人来请，说⟦吕后⟧设小宴，独请你一人。使者笑得客气，眼里没有笑意。赴，是局；不赴，也是局。"],
					"options": [{
						"t": "赴宴，应对如仪",
						"res": "席间她问了三次兵权，你答了三次家务。她笑，你也笑。散席时后背是凉的。",
						"eff": {
							"attrs": {
								"weiji": -3,
								"junxin": 2
							},
							"dev": 0
						},
						"to": "RETURN"
					}, {
						"t": "称疾推辞",
						"res": "你称病不去。长乐宫的回话只有四个字：好生将养。字越少，事越大。",
						"eff": {
							"attrs": {
								"weiji": 5,
								"junxin": -3
							},
							"dev": 0
						},
						"to": "RETURN"
					}]
				},
				{
					"id": "R-12",
					"title": "乌江亭长",
					"chapters": [5, 6],
					"segs": ["乌江亭长携一坛酒来谢：项王自刎那日，他就在渡口，船都备好了。天下人都在传将军的名字——传得比当年传霸王的还响。"],
					"options": [{
						"t": "受酒长谈",
						"res": "你听他把垓下那夜讲了三遍，讲到江水声都仿佛进了屋。有些胜利，越听越不像胜利。",
						"eff": {
							"attrs": {
								"shengwang": 3,
								"weiji": -2
							},
							"dev": 0
						},
						"to": "RETURN"
					}, {
						"t": "谢而不受",
						"res": "你推了那坛酒，赠他盘缠。乌江那么窄，霸王怎么就过不去呢。",
						"eff": {
							"attrs": { "weiji": -1 },
							"dev": 0
						},
						"to": "RETURN"
					}]
				}
			],
			"CRISIS_EVENTS": {
				"plots": [
					{
						"id": "C-1",
						"title": "军中被参",
						"segs": [
							"有裨将联名上书，参你“治军严苛，滥赏亲旧”。",
							"奏本的抄件先一步到了你案头，字迹工整，条理分明——是熟手写的。",
							"预兆早有：前日犒赏下来，偏袒的名单被人抄了一份。",
							"你动了旧部的位置，他们便动你的名声。"
						],
						"options": [{
							"t": "逐条自辩，并主动让赏",
							"res": "奏报上去，逐条分明，末了附一句“臣情愿让赏”。汉王朱笔一批：“知道了。”让出去的赏，换回来的命。",
							"eff": {
								"attrs": {
									"caifu": -6,
									"weiji": -8,
									"junxin": 2
								},
								"dev": 0
							},
							"to": "RETURN"
						}, {
							"t": "置之不理",
							"res": "你不屑分辩，奏本看也不看。参本没有停，名目倒是一月一换——这回是赏罚，下回就是谋逆了。",
							"eff": {
								"attrs": { "weiji": 6 },
								"dev": 0
							},
							"to": "RETURN"
						}]
					},
					{
						"id": "C-2",
						"title": "汉廷削封",
						"segs": [
							"朝廷下诏：诸侯王食邑，核减三成。",
							"名义上是普恩。可你数了数名单——普天之下，只削了你一家。",
							"诏书的措辞客气得像刀鞘。"
						],
						"options": [{
							"t": "奉诏谢恩",
							"res": "你接了诏，谢了恩，谢表写得比谁都恳切。让出去的食邑，是给长安看的姿态——姿态这东西，比食邑便宜。",
							"eff": {
								"attrs": {
									"caifu": -8,
									"weiji": -6,
									"junxin": 3
								},
								"dev": 0
							},
							"to": "RETURN"
						}, {
							"t": "上书诉争",
							"res": "诉争的表章石沉大海。第二道诏书来时，又多削了一成，措辞依旧客气。长安在教你一个道理：越争，越少。",
							"eff": {
								"attrs": {
									"weiji": 8,
									"junxin": -4
								},
								"dev": 0
							},
							"to": "RETURN"
						}]
					},
					{
						"id": "C-3",
						"title": "旧敌暗箭",
						"segs": [
							"夜里，一支冷箭钉在你府门的柱子上，无羽，无记。",
							"侍卫追出去，只抓到一把秦制弩机——⟦章邯⟧旧部的手法。",
							"门客劝你报官。你摆摆手：报给谁听呢。"
						],
						"options": [{
							"t": "加卫闭门，暗中查访",
							"res": "府邸守得铁桶一般，暗桩撒出去半城。箭再没来——至少，你看不见了。",
							"eff": {
								"attrs": {
									"caifu": -6,
									"weiji": -8
								},
								"dev": 0
							},
							"to": "RETURN"
						}, {
							"t": "悬箭于门，示无所惧",
							"res": "你把箭留在柱上，照常出入，会客宴饮如常。暗中的人更恨了，看客却服了——淮阴侯的胆色，市井里又添一段说书。",
							"eff": {
								"attrs": {
									"shengwang": 3,
									"weiji": 5
								},
								"dev": 0
							},
							"to": "RETURN"
						}]
					}
				],
				"death": {
					"id": "C-DEATH",
					"title": "杀机已至",
					"segs": [
						"廷尉府的缇骑包围了你的府邸——这一次，奉的是明诏。",
						"街坊闭门，鸡犬无声。你府里的门客，昨夜走了一半。",
						"亲信连夜来报：钟室的地砖，刚用水洗过。",
						"烛台上的火苗笔直，一丝风都没有。",
						"你还有最后一次挣扎的机会。"
					],
					"options": [
						{
							"t": "散尽家财，求得一线",
							"req": { "caifu": 30 },
							"res": "万金散去，上自宫廷下至狱吏都打点到了。诏书的措辞软了几分。死罪可免——这一次。下一次，不知还散不散得起。",
							"eff": {
								"attrs": {
									"caifu": -30,
									"weiji": -25
								},
								"dev": 0
							},
							"to": "RETURN"
						},
						{
							"t": "上书自辩",
							"req": { "caixue": 60 },
							"res": "你把半生功劳与委屈写成一封书，字字见骨。书达御前，换来几日死缓。死缓也是缓——你比谁都清楚“缓”字值多少钱。",
							"eff": {
								"attrs": {
									"weiji": -15,
									"junxin": -5
								},
								"dev": 0
							},
							"to": "RETURN"
						},
						{
							"t": "坐以待毙",
							"res": "你搁下笔，整衣危坐，把剑横在膝上。该算的账都算完了——剩下的，是别人的账了。",
							"eff": {
								"attrs": { "weiji": 15 },
								"dev": 0
							},
							"to": "RETURN"
						},
						{
							"t": "廷对自明，历陈不反之状",
							"req": { "biancai": 35 },
							"res": "廷尉府的堂上，你不喊冤，不骂座，从胯下说到登坛，从三秦说到垓下——临阵怀二心的人，打不出这样的仗。堂上堂下，一时无词。主审官搁下笔：且收监，容后议。一条舌，又替你赊来几日命。",
							"eff": {
								"attrs": {
									"weiji": -15,
									"junxin": -3,
									"shengwang": 2
								},
								"dev": 0
							},
							"to": "RETURN"
						}
					]
				}
			},
			"ACTIONS": [
				{
					"desc": "闭门著兵法一卷",
					"res": "数月闭门，兵书成卷，笔削如点兵。传抄者众——也有人抄给了不想让你出名的人。",
					"id": "HX-ACT-1",
					"name": "著书立说",
					"eff": {
						"dev": 0,
						"attrs": {
							"tupo": -1,
							"caixue": 3,
							"weiji": 2,
							"moulue": 1,
							"shengwang": 1
						}
					},
					"descHidden": "闭门著兵法一卷",
					"chapters": [0, 6],
					"type": "进取"
				},
				{
					"desc": "置酒结客（财富-8）",
					"res": "一场大宴，水陆毕陈，宾主尽欢。散场时灯火阑珊，多了几个肯替你说话的人。",
					"eff": {
						"dev": 0,
						"attrs": {
							"junxin": 1,
							"caifu": -8,
							"biancai": 1,
							"shengwang": 3
						}
					},
					"id": "HX-ACT-2",
					"name": "置酒高会",
					"descHidden": "置酒结客（筵席耗财）",
					"req": { "caifu": 8 },
					"chapters": [0, 6],
					"type": "兑换"
				},
				{
					"desc": "趋朝问安，固宠于君（需归汉）",
					"res": "你在殿下站了两个时辰，换来三句问话。值。政敌们说你谄，你说他们酸。",
					"eff": {
						"dev": 0,
						"attrs": {
							"junxin": 3,
							"biancai": 1,
							"weiji": 2
						}
					},
					"id": "HX-ACT-3",
					"name": "入宫问安",
					"descHidden": "趋朝问安，固宠于君（需归汉）",
					"req": { "minChapter": 2 },
					"chapters": [0, 6],
					"type": "进取"
				},
				{
					"desc": "谢客静修，温故兵书",
					"res": "门一关，是非就进不来了。竹简翻动的声音，是乱世里难得的清净。",
					"id": "HX-ACT-4",
					"name": "闭门读书",
					"eff": {
						"dev": 0,
						"attrs": {
							"caixue": 2,
							"weiji": -1
						}
					},
					"descHidden": "谢客静修，温故兵书",
					"chapters": [0, 6],
					"type": "守成"
				},
				{
					"desc": "厚币招贤（财富-8）",
					"res": "千金散尽，门下多了几十张嘴。也多了几十双眼睛——替你看路，也替你望风。",
					"eff": {
						"dev": 0,
						"attrs": {
							"caifu": -8,
							"weiji": -4,
							"shengwang": 2
						}
					},
					"id": "HX-ACT-5",
					"name": "散财养士",
					"descHidden": "厚币招贤（厚币耗财）",
					"req": { "caifu": 8 },
					"chapters": [0, 6],
					"type": "保身"
				},
				{
					"desc": "闭门称病，避人锋芒（需归汉）",
					"res": "病假条递上去，朝堂少了一个靶子。探病的人来了几拨，真心难辨。",
					"eff": {
						"dev": 0,
						"attrs": {
							"tupo": 2,
							"weiji": -5,
							"junxin": -2,
							"quanshi": -3
						}
					},
					"id": "HX-ACT-6",
					"name": "称病蛰伏",
					"descHidden": "闭门称病，避人锋芒（需归汉）",
					"req": { "minChapter": 2 },
					"chapters": [0, 6],
					"type": "保身"
				},
				{
					"desc": "校场驰射，强筋壮骨",
					"res": "天未亮透，你已在校场跑了三趟马、射空两壶箭。马是借的，箭是自己削的——大将的膂力，也是一箭一箭喂出来的。",
					"id": "HX-ACT-49",
					"name": "走马骑射",
					"eff": {
						"dev": 0,
						"attrs": {
							"wuli": 2,
							"caifu": -1,
							"tupo": 1
						}
					},
					"descHidden": "校场驰射，强筋壮骨",
					"chapters": [0, 6],
					"type": "守成"
				},
				{
					"desc": "调息导引，养精神于未衰",
					"res": "你闭户调息，依图导引，吐纳之间气血渐顺。军报堆在案上没有拆——将者，先能将息自己，才将得动万人。",
					"id": "HX-ACT-50",
					"name": "导引将息",
					"eff": {
						"dev": 0,
						"attrs": {
							"tupo": 2,
							"weiji": -1
						}
					},
					"descHidden": "调息导引，养精神于未衰",
					"chapters": [0, 6],
					"type": "守成"
				},
				{
					"desc": "代写书信讼状，以笔糊口",
					"res": "你的状纸写得刀刀见骨，原告被告都怕你。润笔不多，够买三日饭——饭粗，笔利。",
					"id": "HX-ACT-7",
					"name": "替人代笔",
					"eff": {
						"dev": 0,
						"attrs": {
							"caifu": 3,
							"caixue": 1,
							"shengwang": -2
						}
					},
					"descHidden": "代写书信讼状，以笔糊口",
					"chapters": [0, 0],
					"type": "兑换"
				},
				{
					"desc": "抄理旧卷，温故知新",
					"res": "翻烂的兵书重新抄理一遍。有些句子，抄着抄着就长进了骨头里。",
					"id": "HX-ACT-8",
					"name": "整理兵书",
					"eff": {
						"dev": 0,
						"attrs": {
							"weiji": 2,
							"caixue": 3,
							"moulue": 1
						}
					},
					"descHidden": "抄理旧卷，温故知新",
					"chapters": [0, 0],
					"type": "守成"
				},
				{
					"desc": "垂纶城下，且放形骸",
					"res": "垂纶一下午，鱼没有，心静了。漂母的饭香从下游飘过来——那是你还不起、也忘不掉的味道。",
					"id": "HX-ACT-9",
					"name": "河边钓叟",
					"eff": {
						"dev": 0,
						"attrs": {
							"tupo": 1,
							"weiji": -3
						}
					},
					"descHidden": "垂纶城下，且放形骸",
					"chapters": [0, 0],
					"type": "保身"
				},
				{
					"desc": "分粮周急（财富-3）",
					"res": "你自己也不宽裕，还是分了一半出去。街坊都记着——淮阴城小，谁家锅里几粒米，人人知道。",
					"eff": {
						"dev": 0,
						"attrs": {
							"caifu": -3,
							"zhengji": 1,
							"shengwang": 2
						}
					},
					"id": "HX-ACT-10",
					"name": "接济邻里",
					"descHidden": "分粮周急（破费粮米）",
					"req": { "caifu": 3 },
					"chapters": [0, 0],
					"type": "兑换"
				},
				{
					"desc": "鬻剑于市，以资川旅",
					"res": "剑卖了个好价钱，买剑的是个游侠儿。他问你来路，你只说：旧主不用了。",
					"id": "HX-ACT-11",
					"name": "市上卖剑",
					"eff": {
						"dev": 0,
						"attrs": {
							"shengwang": -2,
							"caifu": 3
						}
					},
					"descHidden": "鬻剑于市，以资川旅",
					"chapters": [0, 0],
					"type": "兑换"
				},
				{
					"desc": "仰观天象，默察大势",
					"res": "星斗稀微，银河斜挂。天下的大势在你眼里一点点成形——比兵书上的图，活。",
					"id": "HX-ACT-12",
					"name": "夜观星象",
					"eff": {
						"dev": 0,
						"attrs": {
							"weiji": -1,
							"caixue": 1,
							"moulue": 1
						}
					},
					"descHidden": "仰观天象，默察大势",
					"chapters": [0, 0],
					"type": "守成"
				},
				{
					"desc": "荒郊试剑，拳脚与剑俱进",
					"res": "城东的荒坡上没有看客，你把一套剑走了十遍，走到汗出透衣。看相的人说你手无缚鸡之力——那是他们没见过你晨起的样子。",
					"id": "HX-ACT-51",
					"name": "晨起击剑",
					"eff": {
						"dev": 0,
						"attrs": {
							"wuli": 2,
							"tupo": 1
						}
					},
					"descHidden": "荒郊试剑，拳脚与剑俱进",
					"chapters": [0, 0],
					"type": "守成"
				},
				{
					"desc": "为人佣工，气力换钱",
					"res": "你替米行舂了十日的米，肩上磨出茧，囊中多了几钱。掌柜笑你：带剑的人也来舂米？你笑笑——剑要吃饭，人更要。",
					"id": "HX-ACT-52",
					"name": "舂米佣作",
					"eff": {
						"dev": 0,
						"attrs": {
							"tupo": 1,
							"caifu": 2
						}
					},
					"descHidden": "为人佣工，气力换钱",
					"chapters": [0, 0],
					"type": "守成"
				},
				{
					"desc": "校场练兵，以武服众",
					"res": "三场演武，号令分明，士卒心服。老兵蹲在壕边说：这小子，像个带兵的。",
					"id": "HX-ACT-13",
					"name": "阵前演武",
					"eff": {
						"dev": 0,
						"attrs": {
							"wuli": 1,
							"quanshi": 2,
							"weiji": 2,
							"shengwang": 1
						}
					},
					"descHidden": "校场练兵，以武服众",
					"chapters": [1, 1],
					"type": "进取"
				},
				{
					"desc": "为记室抄写军令",
					"res": "军令抄写三百遍，手腕酸了。楚军的虚实，也在你心里抄了一遍。",
					"id": "HX-ACT-14",
					"name": "记室抄书",
					"eff": {
						"dev": 0,
						"attrs": { "caixue": 2 }
					},
					"descHidden": "为记室抄写军令",
					"chapters": [1, 1],
					"type": "守成"
				},
				{
					"desc": "折节下交（财富-3）",
					"res": "三碗浊酒下肚，换来几个拍胸脯的臂膀。他日用不用得着，谁也说不准。",
					"eff": {
						"dev": 0,
						"attrs": {
							"caifu": -3,
							"biancai": 1,
							"shengwang": 2
						}
					},
					"id": "HX-ACT-15",
					"name": "结交楚将",
					"descHidden": "折节下交（酒食耗财）",
					"req": { "caifu": 3 },
					"chapters": [1, 1],
					"type": "兑换"
				},
				{
					"desc": "押运粮草，以勤自效",
					"res": "粮道三百里，昼行夜守，颗粒无损。上官在册子上记了你一笔——小官的功劳，就是这样一笔一笔攒的。",
					"id": "HX-ACT-16",
					"name": "守护辎重",
					"eff": {
						"dev": 0,
						"attrs": {
							"tupo": 1,
							"caifu": 2,
							"weiji": 2,
							"zhengji": 1
						}
					},
					"descHidden": "押运粮草，以勤自效",
					"chapters": [1, 1],
					"type": "进取"
				},
				{
					"desc": "观霸王行军布阵",
					"res": "你站在戟后看他排兵布阵：他的勇你看懂了，他的短你也看懂了。这一课，值千金。",
					"id": "HX-ACT-17",
					"name": "观项王用兵",
					"eff": {
						"dev": 0,
						"attrs": {
							"weiji": 2,
							"caixue": 2,
							"moulue": 1
						}
					},
					"descHidden": "观霸王行军布阵",
					"chapters": [1, 1],
					"type": "守成"
				},
				{
					"desc": "值夜执戟，近闻枢机",
					"res": "大帐里的每一句话你都听见了：范增咳着，项羽笑着，你的策论压着。听见了，也就死心了。",
					"id": "HX-ACT-18",
					"name": "帐外听令",
					"eff": {
						"dev": 0,
						"attrs": {
							"junxin": 1,
							"moulue": 1,
							"weiji": 2
						}
					},
					"descHidden": "值夜执戟，近闻枢机",
					"chapters": [1, 1],
					"type": "守成"
				},
				{
					"desc": "军中较射，以技立名",
					"res": "辕门较射，你三矢皆中鹄，彩头是一坛酒。扛酒回营的路上有人拦你讨教——楚营里，弓马比策论好使人记住。",
					"id": "HX-ACT-53",
					"name": "较射夺彩",
					"eff": {
						"dev": 0,
						"attrs": {
							"wuli": 2,
							"weiji": 1,
							"shengwang": 1
						}
					},
					"descHidden": "军中较射，以技立名",
					"chapters": [1, 1],
					"type": "守成"
				},
				{
					"desc": "随队负重，脚力换赏",
					"res": "转饷的队伍缺人，你顶了上去，负重六十里不堕队。押队的军吏多给了半日的口粮钱——力气换的，干净。",
					"id": "HX-ACT-54",
					"name": "负粮疾行",
					"eff": {
						"dev": 0,
						"attrs": {
							"tupo": 2,
							"caifu": 1
						}
					},
					"descHidden": "随队负重，脚力换赏",
					"chapters": [1, 1],
					"type": "守成"
				},
				{
					"desc": "亲巡诸营，勾稽粮账",
					"res": "三笔假账被你翻了出来，粮官当场面如土色。粮官恨你，士卒念你——账清的人，从来两头不讨好。",
					"id": "HX-ACT-19",
					"name": "巡营核粮",
					"eff": {
						"dev": 0,
						"attrs": {
							"wuli": 1,
							"caifu": 2,
							"caixue": 1
						}
					},
					"descHidden": "亲巡诸营，勾稽粮账",
					"chapters": [2, 2],
					"type": "守成"
				},
				{
					"desc": "修仓固廪，以备军需（财富-3）",
					"res": "新修的仓廒防雨防鼠，可支三月。汉王听后点了一次头——王的一次点头，够小吏记半辈子。",
					"eff": {
						"dev": 0,
						"attrs": {
							"tupo": 1,
							"caifu": -3,
							"quanshi": 2,
							"zhengji": 1
						}
					},
					"id": "HX-ACT-20",
					"name": "修缮仓廒",
					"descHidden": "修仓固廪，以备军需（土木耗财）",
					"req": { "caifu": 3 },
					"chapters": [2, 2],
					"type": "兑换"
				},
				{
					"desc": "与汉中官吏交游",
					"res": "酒过三巡，萧何府上的长史与你换了名刺。路，就是这样一条一条接上的。",
					"id": "HX-ACT-21",
					"name": "结识同僚",
					"eff": {
						"dev": 0,
						"attrs": {
							"junxin": 1,
							"biancai": 1,
							"shengwang": 2
						}
					},
					"descHidden": "与汉中官吏交游",
					"chapters": [2, 2],
					"type": "进取"
				},
				{
					"desc": "以书陈策，自达于上",
					"res": "奏书递上去了，如泥牛入海。没有回音——但你知道有人读了，读的人比你官大。",
					"id": "HX-ACT-22",
					"name": "上书言事",
					"eff": {
						"dev": 0,
						"attrs": {
							"caixue": 2,
							"junxin": 1
						}
					},
					"descHidden": "以书陈策，自达于上",
					"chapters": [2, 2],
					"type": "进取"
				},
				{
					"desc": "为诸将演示阵法",
					"res": "阵法开合，观者无声。散场后有人回去就把你的图样抄走了——抄得走图，抄不走脑子。",
					"id": "HX-ACT-23",
					"name": "演兵示法",
					"eff": {
						"dev": 0,
						"attrs": {
							"wuli": 1,
							"quanshi": 3,
							"weiji": 2
						}
					},
					"descHidden": "为诸将演示阵法",
					"chapters": [2, 2],
					"type": "进取"
				},
				{
					"desc": "纳交殿前（财富-3）",
					"res": "殿前执戟的几个郎官，与你换了名刺。大王昨日的喜怒，今晨你就知道了。",
					"eff": {
						"dev": 0,
						"attrs": {
							"junxin": 1,
							"caifu": -3,
							"biancai": 1,
							"shengwang": 1
						}
					},
					"id": "HX-ACT-24",
					"name": "结交郎官",
					"descHidden": "纳交殿前（贽礼耗财）",
					"req": { "caifu": 3 },
					"chapters": [2, 2],
					"type": "兑换"
				},
				{
					"desc": "教练新卒，什伍相保",
					"res": "你把汉中新募的什伍重新编队，教旗鼓、教号令、教同伍相救。半月之后，乌合之众走得像一支兵了。",
					"id": "HX-ACT-55",
					"name": "教阅什伍",
					"eff": {
						"dev": 0,
						"attrs": {
							"wuli": 1,
							"quanshi": 2
						}
					},
					"descHidden": "教练新卒，什伍相保",
					"chapters": [2, 2],
					"type": "进取"
				},
				{
					"desc": "亲勘粮道，以足量山",
					"res": "褒斜谷的栈道你一步步量过去，哪里驼队要歇、哪里伏兵能藏，都记进心里。脚底的泡，是地图上的墨。",
					"id": "HX-ACT-56",
					"name": "踏勘仓道",
					"eff": {
						"dev": 0,
						"attrs": {
							"moulue": 2,
							"tupo": 1
						}
					},
					"descHidden": "亲勘粮道，以足量山",
					"chapters": [2, 2],
					"type": "守成"
				},
				{
					"desc": "约法安民（财富-3）",
					"res": "约法三章，秋毫无犯，市不易肆。关中父老说：汉军不扰民——这四个字，比十万兵值钱。",
					"eff": {
						"dev": 0,
						"attrs": {
							"zhengji": 1,
							"caifu": -3,
							"weiji": -1,
							"shengwang": 3
						}
					},
					"id": "HX-ACT-25",
					"name": "安抚关中",
					"descHidden": "约法安民（抚民耗财）",
					"req": { "caifu": 3 },
					"chapters": [3, 3],
					"type": "兑换"
				},
				{
					"desc": "申军法于三军",
					"res": "斩了两个劫掠的卒子，首级悬辕三日，全军肃然。慈不掌兵——你懂，士卒也懂了。",
					"id": "HX-ACT-26",
					"name": "整肃军纪",
					"eff": {
						"dev": 0,
						"attrs": {
							"wuli": 1,
							"quanshi": 2,
							"weiji": 2
						}
					},
					"descHidden": "申军法于三军",
					"chapters": [3, 3],
					"type": "进取"
				},
				{
					"desc": "踏勘秦岭诸道（才学≥50 方能成图）",
					"res": "子午、傥骆、褒斜、陈仓，一条一条踩过去。每条道的宽窄险易，都进了你的图，也进了你的命。",
					"eff": {
						"dev": 0,
						"attrs": {
							"tupo": -2,
							"caixue": 2,
							"moulue": 1
						}
					},
					"id": "HX-ACT-27",
					"name": "绘图勘道",
					"descHidden": "踏勘秦岭诸道（才学不济则难成图）",
					"req": { "caixue": 50 },
					"chapters": [3, 3],
					"type": "守成"
				},
				{
					"desc": "以私财犒军（财富-4）",
					"res": "酒肉到营，臂膀攒动，士气大振。士兵记得韩将军的赏——赏在明处，恩在心里。",
					"eff": {
						"dev": 0,
						"attrs": {
							"shengwang": 2,
							"caifu": -4
						}
					},
					"id": "HX-ACT-28",
					"name": "犒赏士卒",
					"descHidden": "以私财犒军（犒赏耗财）",
					"req": { "caifu": 4 },
					"chapters": [3, 3],
					"type": "兑换"
				},
				{
					"desc": "督办栈道之役",
					"res": "栈道日日有新进展——关中的探子日日有回报。你要的就是他们看。",
					"id": "HX-ACT-29",
					"name": "速修栈道",
					"eff": {
						"dev": 0,
						"attrs": {
							"quanshi": 2,
							"caifu": 2
						}
					},
					"descHidden": "督办栈道之役",
					"chapters": [3, 3],
					"type": "进取"
				},
				{
					"desc": "收编三秦降兵",
					"res": "降卒感不杀之恩，歃血为誓，愿效死力。你的军队又厚了一层——厚的不是人，是人心。",
					"id": "HX-ACT-30",
					"name": "收留降卒",
					"eff": {
						"dev": 0,
						"attrs": {
							"weiji": 3,
							"quanshi": 3
						}
					},
					"descHidden": "收编三秦降兵",
					"chapters": [3, 3],
					"type": "进取"
				},
				{
					"desc": "点验降卒，汰弱留强",
					"res": "降卒在校场列队三日，老弱者归农，精壮者补伍。点验完的册子薄了三成，留下的队伍却沉了三成。",
					"id": "HX-ACT-57",
					"name": "简阅新附",
					"eff": {
						"dev": 0,
						"attrs": {
							"weiji": 1,
							"quanshi": 2
						}
					},
					"descHidden": "点验降卒，汰弱留强",
					"chapters": [3, 3],
					"type": "进取"
				},
				{
					"desc": "亲巡关塞，度险设防",
					"res": "函谷、武关、临晋，你一处一处走过，把每座关的虚实都看过一遍。随行的亲兵累得叫苦——用兵的人，先得用脚把地形读一遍。",
					"id": "HX-ACT-58",
					"name": "履险巡塞",
					"eff": {
						"dev": 0,
						"attrs": {
							"moulue": 2,
							"tupo": 1
						}
					},
					"descHidden": "亲巡关塞，度险设防",
					"chapters": [3, 3],
					"type": "守成"
				},
				{
					"desc": "厚恤伤亡（财富-4）",
					"res": "伤者得恤，死者得葬，名单你亲自过目。三军知将军不弃人——不弃人的将军，人才肯替他死。",
					"eff": {
						"dev": 0,
						"attrs": {
							"caifu": -4,
							"weiji": -1,
							"shengwang": 2
						}
					},
					"id": "HX-ACT-31",
					"name": "犒赏伤兵",
					"descHidden": "厚恤伤亡（抚恤耗财）",
					"req": { "caifu": 4 },
					"chapters": [4, 4],
					"type": "兑换"
				},
				{
					"desc": "读燕赵齐地志",
					"res": "地志读了三遍，山川关隘、城郭粮道，都在你脑中展开成图。图在心里，比在案上可靠。",
					"id": "HX-ACT-32",
					"name": "研读地志",
					"eff": {
						"dev": 0,
						"attrs": {
							"caixue": 2,
							"moulue": 1
						}
					},
					"descHidden": "读燕赵齐地志",
					"chapters": [4, 4],
					"type": "守成"
				},
				{
					"desc": "释俘遣归，以收人心",
					"res": "俘卒发给干粮，跪地号哭而去。燕赵之地传你的名——杀出来的名快，放出来的名远。",
					"id": "HX-ACT-33",
					"name": "释放俘卒",
					"eff": {
						"dev": 0,
						"attrs": {
							"weiji": -1,
							"shengwang": 2
						}
					},
					"descHidden": "释俘遣归，以收人心",
					"chapters": [4, 4],
					"type": "进取"
				},
				{
					"desc": "筑垒固防，深根固本",
					"res": "壁垒连成一线，壕深垒高。守得住的胜利，才是胜利——这话你对诸将说了三遍。",
					"id": "HX-ACT-34",
					"name": "修筑壁垒",
					"eff": {
						"dev": 0,
						"attrs": {
							"wuli": 1,
							"quanshi": 2,
							"tupo": -1
						}
					},
					"descHidden": "筑垒固防，深根固本",
					"chapters": [4, 4],
					"type": "进取"
				},
				{
					"desc": "虚心问计于降者（声望≥40 降者方肯尽言）",
					"res": "你执礼甚恭，降将知无不言，言无不尽。敌人的地图，从此也是你的地图。",
					"eff": {
						"dev": 0,
						"attrs": {
							"junxin": 1,
							"caixue": 2,
							"moulue": 1
						}
					},
					"id": "HX-ACT-35",
					"name": "问策降将",
					"descHidden": "虚心问计于降者（名望不足则降者缄口）",
					"req": { "shengwang": 40 },
					"chapters": [4, 4],
					"type": "守成"
				},
				{
					"desc": "察齐地民情",
					"res": "临淄的富庶让你心惊：车毂击，人肩摩。这一块地，养得起一支王师——也养得起别的。",
					"id": "HX-ACT-36",
					"name": "巡行齐市",
					"eff": {
						"dev": 0,
						"attrs": {
							"wuli": 1,
							"caifu": 2,
							"shengwang": 1
						}
					},
					"descHidden": "察齐地民情",
					"chapters": [4, 4],
					"type": "守成"
				},
				{
					"desc": "安集残破，复其生业",
					"res": "赵地新破，你下令归田者复其籍、缴械者不问罪。三月之间，逃亡的编户渐渐回来——打下来的地，要养得住，才算你的。",
					"id": "HX-ACT-59",
					"name": "镇抚赵地",
					"eff": {
						"dev": 0,
						"attrs": {
							"shengwang": 1,
							"zhengji": 2
						}
					},
					"descHidden": "安集残破，复其生业",
					"chapters": [4, 4],
					"type": "进取"
				},
				{
					"desc": "亲巡伤营，亲为裹创（财富-1）",
					"res": "伤营里你一个一个看过去，药不够，你把自己的随军金帛贴了进去。伤卒挣扎着要起身行礼，你按住了他。",
					"eff": {
						"dev": 0,
						"attrs": {
							"caifu": -1,
							"shengwang": 2
						}
					},
					"id": "HX-ACT-60",
					"name": "抚创问疾",
					"descHidden": "亲巡伤营，亲为裹创（略贴金帛）",
					"req": { "caifu": 1 },
					"chapters": [4, 4],
					"type": "进取"
				},
				{
					"desc": "缮治甲兵，积储粮谷",
					"res": "武库新甲三千领，仓谷支三年。临淄城头的旗换了新的——旗是齐旗，心是你的心。",
					"id": "HX-ACT-37",
					"name": "缮甲积谷",
					"eff": {
						"dev": 0,
						"attrs": {
							"wuli": 1,
							"quanshi": 3,
							"weiji": 2
						}
					},
					"descHidden": "缮治甲兵，积储粮谷",
					"chapters": [5, 5],
					"type": "进取"
				},
				{
					"desc": "礼贤下士（财富-3）",
					"res": "齐之辩士说客，揣着各样心思，渐集于你的门下。蒯通，也是其中之一——最有耐心的一个。",
					"eff": {
						"dev": 0,
						"attrs": {
							"caifu": -3,
							"biancai": 1,
							"shengwang": 2
						}
					},
					"id": "HX-ACT-38",
					"name": "延揽齐士",
					"descHidden": "礼贤下士（束脩耗财）",
					"req": { "caifu": 3 },
					"chapters": [5, 5],
					"type": "兑换"
				},
				{
					"desc": "轻徭薄赋，以固齐本（财富-5）",
					"res": "赋减三成，齐人讴歌于野。根基这东西，是拿真金白银换的——换得来，也守得住，才算数。",
					"eff": {
						"dev": 0,
						"attrs": {
							"caifu": -5,
							"zhengji": 2,
							"shengwang": 3
						}
					},
					"id": "HX-ACT-39",
					"name": "减免齐赋",
					"descHidden": "轻徭薄赋，以固齐本（减赋损财）",
					"req": { "caifu": 5 },
					"chapters": [5, 5],
					"type": "兑换"
				},
				{
					"desc": "遣人觇长安动静",
					"res": "长安的每一份动静，你都听了三遍。听得多了，汉廷也听见了你——听，从来都是相互的。",
					"id": "HX-ACT-40",
					"name": "密探汉廷",
					"eff": {
						"dev": 0,
						"zg": 3,
						"attrs": {
							"weiji": 2,
							"caixue": 2,
							"moulue": 1
						}
					},
					"descHidden": "遣人觇长安动静",
					"chapters": [5, 5],
					"type": "进取"
				},
				{
					"desc": "大阅齐兵，申严军令",
					"res": "齐军新成，行止有度。这支军队听谁的号令，你心里有数。",
					"id": "HX-ACT-41",
					"name": "整训齐军",
					"eff": {
						"dev": 0,
						"attrs": {
							"wuli": 1,
							"quanshi": 2,
							"weiji": 2
						}
					},
					"descHidden": "大阅齐兵，申严军令",
					"chapters": [5, 5],
					"type": "进取"
				},
				{
					"desc": "遣使通好于诸侯",
					"res": "燕赵来的回使言辞恭敬，礼物厚重。天下的棋盘，比你想的大——子也不止两色。",
					"id": "HX-ACT-42",
					"name": "报聘诸侯",
					"eff": {
						"dev": 0,
						"attrs": {
							"junxin": 1,
							"biancai": 1,
							"shengwang": 2
						}
					},
					"descHidden": "遣使通好于诸侯",
					"chapters": [5, 5],
					"type": "进取"
				},
				{
					"desc": "修城浚池，固齐之根本（财富-1）",
					"res": "临淄的城垣补了三段，护城河又掘深了一尺。工匠问王上何故急此，你望着城墙没有答——有些墙，是砌给长安看的。",
					"eff": {
						"dev": 0,
						"attrs": {
							"caifu": -1,
							"quanshi": 2
						}
					},
					"id": "HX-ACT-61",
					"name": "缮治临淄",
					"descHidden": "修城浚池，固齐之根本（工役耗财）",
					"req": { "caifu": 1 },
					"chapters": [5, 5],
					"type": "进取"
				},
				{
					"desc": "微行乡野，问齐民疾苦",
					"res": "你换了一身布衣下乡，看田里的禾、听灶边的话。回宫时鞋上全是泥——治一国与带一军，先要懂的都是人。",
					"id": "HX-ACT-62",
					"name": "问俗于野",
					"eff": {
						"dev": 0,
						"attrs": {
							"moulue": 2,
							"shengwang": 1
						}
					},
					"descHidden": "微行乡野，问齐民疾苦",
					"chapters": [5, 5],
					"type": "守成"
				},
				{
					"desc": "厚恤故旧乡邻（财富-4）",
					"res": "故旧乡邻，户户有赠。下邳人都说：韩楚王，不忘本——本是什么，你比谁都清楚。",
					"eff": {
						"dev": 0,
						"attrs": {
							"zhengji": 1,
							"caifu": -4,
							"weiji": -1,
							"shengwang": 2
						}
					},
					"id": "HX-ACT-43",
					"name": "散财恤旧",
					"descHidden": "厚恤故旧乡邻（赠遗耗财）",
					"req": { "caifu": 4 },
					"chapters": [6, 6],
					"type": "兑换"
				},
				{
					"desc": "研读汉律，如履薄冰",
					"res": "律令读得越细，你越明白哪条线不能碰——以及，碰了会怎样。明白得有点晚，但总比不明白强。",
					"id": "HX-ACT-44",
					"name": "闭门读律",
					"eff": {
						"dev": 0,
						"attrs": {
							"caixue": 2,
							"weiji": -1
						}
					},
					"descHidden": "研读汉律，如履薄冰",
					"chapters": [6, 6],
					"type": "守成"
				},
				{
					"desc": "厚结宫中左右（财富-4）",
					"res": "中黄门收你的礼，小黄门递你的话。宫里的风吹草动，总比别人早半日到你案头。",
					"eff": {
						"dev": 0,
						"attrs": {
							"caifu": -4,
							"biancai": 1,
							"junxin": 1
						}
					},
					"id": "HX-ACT-45",
					"name": "结交近侍",
					"descHidden": "厚结宫中左右（馈遗耗财）",
					"req": { "caifu": 4 },
					"chapters": [6, 6],
					"type": "兑换"
				},
				{
					"desc": "巡行楚境，绥抚其民",
					"res": "楚人见故将军，箪食壶浆，迎出十里。你按住心动，只谈农桑——有些情，领了就是罪。",
					"id": "HX-ACT-46",
					"name": "巡视楚地",
					"eff": {
						"dev": 0,
						"attrs": {
							"wuli": 1,
							"quanshi": 1,
							"shengwang": 1
						}
					},
					"descHidden": "巡行楚境，绥抚其民",
					"chapters": [6, 6],
					"type": "进取"
				},
				{
					"desc": "以书剖白，自明心迹",
					"res": "剖白的书递上去了，字斟句酌，改了七遍。有没有用，你不敢想。",
					"id": "HX-ACT-47",
					"name": "上书自陈",
					"eff": {
						"dev": 0,
						"attrs": {
							"junxin": 2,
							"caixue": 1,
							"weiji": 2
						}
					},
					"descHidden": "以书剖白，自明心迹",
					"chapters": [6, 6],
					"type": "进取"
				},
				{
					"desc": "杜门谢客，示无他志",
					"res": "府门三日不出，谢客的帖子积了一摞。长安的眼睛找不到焦点，渐渐散了——散到别处去了，还是散在暗处，你说不准。",
					"id": "HX-ACT-48",
					"name": "深居简出",
					"eff": {
						"dev": 0,
						"attrs": {
							"tupo": 1,
							"weiji": -3,
							"shengwang": -2
						}
					},
					"descHidden": "杜门谢客，示无他志",
					"chapters": [6, 6],
					"type": "保身"
				},
				{
					"desc": "朝请不阙，以示臣节",
					"res": "每次朝会你都到，站位不前不后，奏对不多一字。同列的列侯渐渐习惯了你的安静——安静，是长安城里最贵的护身符。",
					"id": "HX-ACT-63",
					"name": "奉朝如仪",
					"eff": {
						"dev": 0,
						"attrs": {
							"weiji": -1,
							"junxin": 2
						}
					},
					"descHidden": "朝请不阙，以示臣节",
					"chapters": [6, 6],
					"type": "进取"
				},
				{
					"desc": "府中习射，筋骨不废",
					"res": "后园立了箭垛，你每日射满一壶。门客说王上何必亲此小技，你收弓不语——剑不能锈，人更不能。",
					"id": "HX-ACT-64",
					"name": "楚邸课射",
					"eff": {
						"dev": 0,
						"attrs": {
							"wuli": 2,
							"tupo": 1
						}
					},
					"descHidden": "府中习射，筋骨不废",
					"chapters": [6, 6],
					"type": "守成"
				},
				{
					"desc": "你谢漂母：吾必有以重报母。她却沉了脸",
					"id": "HX-ACT-65",
					"name": "漂母之诺",
					"descHidden": "你谢漂母：吾必有以重报母。她却沉了脸",
					"choice": {
						"segs": ["城下钓鱼，饥不可忍。漂母分饭与你，数十日不倦。你谢道：「吾必有以重报母。」漂母却沉了脸：「大丈夫不能自食，吾哀王孙而进食，岂望报乎！」", "你站在河边，捧着那半碗饭——原来有人给你饭，是不要你还的。你要还的，只有自己这条命。"],
						"options": [
							{
								"eff": {
									"dev": 0,
									"attrs": {
										"tupo": 1,
										"shengwang": 2
									}
								},
								"res": "你整衣再拜，把这句话连着饭香咽下。多年后你以千金报母——这一拜，拜的不是饭，是那句\"哀王孙\"：你还没被这世道看死。",
								"t": "再拜受教"
							},
							{
								"eff": {
									"dev": 0,
									"attrs": {
										"moulue": 1,
										"caixue": 1
									}
								},
								"res": "你不再多言，低头吃饭。漂母看你一眼，往你碗里又添了一勺——有些人给你的不是恩，是气，气比饭养人。",
								"t": "默记于心"
							},
							{
								"eff": {
									"dev": 0,
									"attrs": {
										"shengwang": 1,
										"caifu": 1
									}
								},
								"res": "次日你钓得双鲤，一尾送漂母。她笑着收下了——还恩，也可以从一尾鱼开始，这账，慢慢还。",
								"t": "以钓鲤为赠"
							}
						]
					},
					"chapters": [0, 0],
					"type": "抉择"
				},
				{
					"desc": "寄食数月，亭长妻晨炊蓐食——案上没有你那份",
					"id": "HX-ACT-66",
					"name": "亭长之炊",
					"descHidden": "寄食数月，亭长妻晨炊蓐食——案上没有你那份",
					"choice": {
						"segs": ["寄食南昌亭长家数月。今晨亭长妻晨炊蓐食，饭已尽，案上没有你的那一份。屋里的人都低着头，没有人抬头看你。", "你站在门口，忽然想：这顿饭，不是今天才没有的——是打你进门那天起，就没有了。"],
						"options": [
							{
								"eff": {
									"dev": 0,
									"attrs": {
										"moulue": 1,
										"shengwang": -1
									}
								},
								"res": "你在门口站了一瞬，转身去了河边，从此不再登门。有些绝交，不需要说破——最难吃的不是饿，是被人从饭桌上轻轻摘下去的那份尴尬。",
								"t": "佯装不知"
							},
							{
								"eff": {
									"dev": 0,
									"attrs": {
										"tupo": 1,
										"weiji": 1
									}
								},
								"res": "你拂袖而去，从此与亭长家两不相见。骨气是有了，晚饭还没有——淮阴的黄昏，长得能饿死人的尊严。",
								"t": "怒而绝去"
							},
							{
								"eff": {
									"dev": 0,
									"attrs": {
										"caixue": 2,
										"caifu": 1
									}
								},
								"res": "你留下为亭长写了三封文书、两纸诉状，抵了饭钱才走。人欠你的，你用字还——字，就是你在世道里最早磨出来的那把刀。",
								"t": "代笔以偿"
							}
						]
					},
					"chapters": [0, 0],
					"type": "抉择"
				},
				{
					"desc": "项梁麾下执戟为郎中，同列笑你：身材看门正好",
					"id": "HX-ACT-67",
					"name": "执戟之日",
					"descHidden": "项梁麾下执戟为郎中，同列笑你：身材看门正好",
					"choice": {
						"segs": ["项梁麾下，你为郎中，执戟立于帐外。同列笑你：「如此身材，看门正好。」帐内议的是破秦大计，帐外站的是手持长戟的你。", "你握着那杆戟，忽然想：帐里的人说的话，每一句，都是你将来要用的话——看门的人，也可以先听课。"],
						"options": [
							{
								"eff": {
									"dev": 0,
									"attrs": { "moulue": 2 }
								},
								"res": "你不动声色，把帐内每一句话都听进心里——如何分兵，如何赏罚。看门的位子，恰好是听课的位子。这世上的门，站着站着，就有人来替你开。",
								"t": "默立听帐"
							},
							{
								"eff": {
									"dev": 0,
									"attrs": {
										"biancai": 2,
										"weiji": 1
									}
								},
								"res": "你转身入列，请为项梁陈破秦三策。项梁看了你两眼，没有听完。你记下这笔账，也记下了路不通——这条路不通，总还有别的路。",
								"t": "当面自荐"
							},
							{
								"eff": {
									"dev": 0,
									"attrs": {
										"tupo": 1,
										"shengwang": -1
									}
								},
								"res": "你置之一笑，继续站你的岗。同列以为你懦，笑得更大声——笑你的人，站不到你站的位置。不是位置高，是你看得比他们远。",
								"t": "不与争锋"
							}
						]
					},
					"chapters": [1, 1],
					"type": "抉择"
				},
				{
					"desc": "你献策的简册落到范增手中，老亚父遣人唤你",
					"id": "HX-ACT-68",
					"name": "亚父观策",
					"descHidden": "你献策的简册落到范增手中，老亚父遣人唤你",
					"choice": {
						"segs": ["你献策于项羽的简册，辗转落到了范增手中。老亚父遣人唤你，案上摊着你的字：「策是好策，可惜用上的人，不识货。」", "你站在案前，忽然想：这满营的人，只有这个老人看得懂你的字——可他看得懂，也说不上话。"],
						"options": [
							{
								"eff": {
									"dev": 0,
									"attrs": {
										"caixue": 2,
										"shengwang": 1
									}
								},
								"res": "你长揖求教，与范增论兵至夜半。老人送你出门时说了一句：「楚营容不下你。」这句话比你的策更值钱——看得懂你的人，不一定会留你，他只会告诉你路在哪里。",
								"t": "请益问学"
							},
							{
								"eff": {
									"dev": 0,
									"attrs": {
										"moulue": 2,
										"weiji": -1
									}
								},
								"res": "你自称浅陋，把话头轻轻带过。范增深深看你一眼，没有再劝。乱世里被大人物记住，未必是福——这一退，退的是锋芒，留的是后路。",
								"t": "藏拙而退"
							},
							{
								"eff": {
									"dev": 0,
									"attrs": {
										"weiji": 2,
										"quanshi": 1
									}
								},
								"res": "你请范增转荐于项王。老人摇头：「羽之为人，不忍予。」他替你试了，也替你证实了——这营里没有你的路。",
								"t": "请其引荐"
							}
						]
					},
					"chapters": [1, 1],
					"type": "抉择"
				},
				{
					"desc": "夏侯婴刀下留人后又给你饭碗，他笑问：豪言还算数么",
					"id": "HX-ACT-69",
					"name": "滕公之问",
					"descHidden": "夏侯婴刀下留人后又给你饭碗，他笑问：豪言还算数么",
					"choice": {
						"segs": ["坐法当斩，滕公夏侯婴刀下留人，荐你为治粟都尉。上任第三日，滕公过仓廒，笑问：「斩台上那句豪言，还算数么？」", "你握着粮册，忽然想：这一问，问的不是豪言，是你这个人，值不值得他刀下留情。"],
						"options": [
							{
								"eff": {
									"dev": 0,
									"attrs": {
										"caixue": 2,
										"moulue": 1
									}
								},
								"res": "你放下粮册，为滕公细说三秦形势、关中虚实。夏侯婴越听越惊，回府便向萧何提起了你的名字——这一席话，把你这个人，从粮仓里放了出来。",
								"t": "倾囊论兵"
							},
							{
								"eff": {
									"dev": 0,
									"attrs": {
										"shengwang": 1,
										"zhengji": 2
									}
								},
								"res": "你只答：「先治粟，再言兵。」三月之内仓廒清点如新，萧何来验仓时眼里有了光——有些事，做出来了，就是回答。",
								"t": "守拙理粟"
							},
							{
								"eff": {
									"dev": 0,
									"attrs": {
										"quanshi": -1,
										"weiji": -1
									}
								},
								"res": "你只对滕公深深一揖，余话不说。恩是记下了，才却不显——恩压着才，才就沉了底。",
								"t": "衔恩不问"
							}
						]
					},
					"chapters": [2, 2],
					"type": "抉择"
				},
				{
					"desc": "萧何月下追你回来，烛下问：留，何以留之",
					"id": "HX-ACT-70",
					"name": "月下之对",
					"descHidden": "萧何月下追你回来，烛下问：留，何以留之",
					"choice": {
						"segs": ["萧何月下追你回来，烛下对坐。他替你掸去衣上风尘，忽然问：「必欲归乎？归，则策马东去；留，何以留之？」", "你看着他案头上那盏追你之前就没吹灭的灯，忽然想：这一问，问的不是走留，是你这一生要什么。"],
						"options": [
							{
								"eff": {
									"dev": 0,
									"attrs": {
										"biancai": 2,
										"quanshi": 1
									}
								},
								"res": "你答：「臣为将而来，不为吏。」萧何击案而起，连夜入宫。后来的登坛拜将，就从这四个字开始——这四个字，把三十里路走成了登坛。",
								"t": "直言大将志"
							},
							{
								"eff": {
									"dev": 0,
									"attrs": {
										"moulue": 1,
										"weiji": -2
									}
								},
								"res": "你只谢萧何相知之恩，不提要求。萧何反而急了：「君不言，何以荐君？」——你要的，就是他沉不住气。他一急，你的分量就出来了。",
								"t": "谢恩而已"
							},
							{
								"eff": {
									"dev": 0,
									"attrs": {
										"moulue": 2,
										"junxin": 1
									}
								},
								"res": "你反问：「汉王之欲，东向争天下乎，抑或王关中足矣？」萧何怔住，继而大笑——能问出这句话的人，他追对了。",
								"t": "反问汉王志"
							}
						]
					},
					"chapters": [2, 2],
					"type": "抉择"
				},
				{
					"desc": "背水阵后，营中哗然：将军置我们于死地",
					"id": "HX-ACT-71",
					"name": "背水之疑",
					"descHidden": "背水阵后，营中哗然：将军置我们于死地",
					"choice": {
						"segs": ["井陉背水阵后，你下令全军依水结阵。军令传下去，营中哗然——「将军这是置我们于死地！」", "你策马从阵前走过，没有解释。士卒看你一眼，又看你一眼——你的背影，是他们唯一还信的东西。解释这东西，赢之前说了没人信；赢之后，不用人说。"],
						"options": [
							{
								"t": "立誓同死生",
								"eff": {
									"attrs": {
										"tupo": 2,
										"shengwang": 1
									},
									"dev": 0
								},
								"res": "你下马，与士卒同饮一碗水：「背水，是给你们断退路——退路断了，活路就来了。」士气渐渐稳住——将帅二字，写在士卒的眼睛里。"
							},
							{
								"t": "峻令止议",
								"eff": {
									"attrs": {
										"weiji": -1,
										"shengwang": -1
									},
									"dev": 0
								},
								"res": "你传令：妄言者斩。议论声止了，疑心没有止——心这东西，得拿一场赢，才能换回来。"
							},
							{
								"t": "陈说兵机",
								"eff": {
									"attrs": {
										"moulue": 2,
										"caixue": 1
									},
									"dev": 0
								},
								"res": "你召诸校尉入帐，摊开舆图，把死地活用的道理说透。诸将出帐时，腰杆都直了几分——道理这东西，说透了就是兵。"
							}
						]
					},
					"chapters": [4, 4],
					"type": "抉择"
				},
				{
					"desc": "背水战后，李左车被缚至帐前，他抬头看你，长叹一声：「早听我言，君不得至此。」",
					"id": "HX-ACT-72",
					"name": "左车之言",
					"descHidden": "背水战后，李左车被缚至帐前，他抬头看你，长叹一声：「早听我言，君不得至此。」",
					"choice": {
						"segs": ["井陉战后，李左车被缚至帐前。他抬头看你，长叹一声：「早听我言，君不得至此。」——败得坦然，也傲得坦然。", "帐中诸将按剑，等你一声令下。你看着他，忽然想：这个人输的是仗，赢的是见识——见识这东西，比城难攻。"],
						"options": [
							{
								"t": "解缚问策",
								"eff": {
									"attrs": {
										"caixue": 2,
										"moulue": 1,
										"shengwang": 2
									},
									"dev": 0
								},
								"res": "你亲手解其缚，延之上座：「向使听广武君计，信亦不知其然。」李左车感而献策，先声后实，传檄而定燕齐——这一解，解的是满天下谋士的心。"
							},
							{
								"t": "留而不用",
								"eff": {
									"attrs": {
										"moulue": 1,
										"weiji": 1
									},
									"dev": 0
								},
								"res": "你留他在营中，供酒食，不问道。他说过的每一句话你都记下了，却不肯先问他一句——有些谋，晾着晾着，就凉了。"
							},
							{
								"t": "杀之立威",
								"eff": {
									"attrs": {
										"shengwang": -2,
										"weiji": -1
									},
									"dev": 0
								},
								"res": "你斩了李左车。三军凛然，献城者自此裹足——这一刀，斩的是敌，断的是路。"
							}
						]
					},
					"chapters": [4, 4],
					"type": "抉择"
				},
				{
					"desc": "沙囊堵好，探马报：楚军半渡——决，还是再等？",
					"id": "HX-ACT-73",
					"name": "潍水之决",
					"descHidden": "沙囊堵好，探马报：楚军半渡——决，还是再等？",
					"choice": {
						"segs": ["潍水上流，万余沙囊已壅塞完毕。你站在堤上，等着楚军——探马来报：龙且已引军半渡。", "龙且的先锋已经踩进河心。你握着那杆令旗，忽然想：半渡，是兵法上最好的一刻——可这一刻，也只有一次。"],
						"options": [
							{
								"t": "当即决堰",
								"eff": {
									"attrs": {
										"moulue": 2,
										"shengwang": 2
									},
									"dev": 0
								},
								"res": "令旗一落，沙囊崩决。河水奔涌而下，楚军二十万人首尾断绝，龙且授首——这一决，决的不是水，是时机。"
							},
							{
								"t": "再等楚军深入",
								"eff": {
									"attrs": {
										"weiji": 1,
										"moulue": 1
									},
									"dev": 0
								},
								"res": "你压住令旗，等楚军主力尽数下河才决堰。水淹得更全，可先头部队已近对岸，汉军阵前添了一场白刃战——这一回你赌赢了，手心里全是汗。"
							},
							{
								"t": "半决试探",
								"eff": {
									"attrs": {
										"moulue": 1,
										"weiji": 1
									},
									"dev": 0
								},
								"res": "你先放了一小股水，探楚军应变。龙且果然退回岸上观望——你随即决尽沙囊，大水冲走的是空河道。试探，试出的是别人的深浅，也是自己的迟疑。"
							}
						]
					},
					"chapters": [4, 4],
					"type": "抉择"
				},
				{
					"desc": "蒯通去而复返：王若再不见机，此后无人再来了",
					"id": "HX-ACT-74",
					"name": "蒯通再至",
					"descHidden": "蒯通去而复返：王若再不见机，此后无人再来了",
					"choice": {
						"segs": ["你谢绝蒯通三分之策后，他去而复返，径直登堂：「王若再不见机，此后无人再来了。」", "你端坐王位之上，忽然想：这世上敢对你说真话的人，见一个，少一个——这句话，比他的三分之策更重。"],
						"options": [
							{
								"t": "再拒之",
								"eff": {
									"attrs": { "junxin": 2 },
									"dev": 2
								},
								"res": "你仍以「汉王遇我厚」对之。蒯通长叹出门，此后再未登门——今夜你送走的，是最后一个敢对你说真话的人。"
							},
							{
								"t": "夜谈三更",
								"eff": {
									"attrs": {
										"moulue": 3,
										"weiji": 1
									},
									"dev": 0
								},
								"res": "你留他夜谈三更，听他剖陈天下形势，句句入骨。话没有全听，却句句都记下了——收在心里的，比收在府里的更见分量。"
							},
							{
								"t": "故纵其行",
								"eff": {
									"attrs": {
										"biancai": 1,
										"shengwang": -1
									},
									"dev": 0
								},
								"res": "你不答，只命人置酒，为蒯通饯行。他饮尽最后一盏，忽然笑了：「王自珍重。」这三个字，说得比三分之策还重。"
							}
						]
					},
					"chapters": [5, 5],
					"type": "抉择"
				},
				{
					"desc": "你任楚王返乡，漂母已老，亭长在侧，旧时人旧时河",
					"id": "HX-ACT-75",
					"name": "淮阴旧人",
					"descHidden": "你任楚王返乡，漂母已老，亭长在侧，旧时人旧时河",
					"choice": {
						"segs": ["你任楚王，衣锦还乡。淮阴的城门还是那座城门，城下的河还是那条河。漂母已老，挎着竹篮站在人群里；亭长站在另一侧，头微微低着。", "你从车驾上下来，一步一步走回当年钓鱼的岸边。这条河没变，变的，是看它的人。"],
						"options": [
							{
								"t": "报母报亭长",
								"eff": {
									"attrs": {
										"shengwang": 2,
										"weiji": -1
									},
									"dev": 0
								},
								"res": "千金与漂母，百金与亭长。漂母没有推辞，也没有道谢——她只看了你一眼，像当年看你那样。你报的不是恩，是你这条命终于活成了人样。"
							},
							{
								"t": "独谢漂母",
								"eff": {
									"attrs": { "shengwang": 1 },
									"dev": 1
								},
								"res": "千金与漂母，亭长则略过。恩与怨，你分得很清——分得清，是因为你记性好；可记性好的人，走得也格外累。"
							},
							{
								"t": "未认故人",
								"eff": {
									"attrs": [],
									"dev": 3
								},
								"res": "你从人群前走过，没有停。漂母目送你远去，没有喊你——有些恩，你认得，却不敢认，是怕一认，就做不回那个要往高处走的人了。"
							}
						]
					},
					"chapters": [6, 6],
					"type": "抉择"
				},
				{
					"desc": "入长乐宫前你停步回望，宫门重，长安远",
					"id": "HX-ACT-76",
					"name": "钟室之望",
					"descHidden": "入长乐宫前你停步回望，宫门重，长安远",
					"choice": {
						"segs": ["吕后以贺陈豨已死之名召你入宫。长乐宫门前，你停步回望——宫门厚重，长安辽阔，你站在门与城之间，只有一步。", "送信来的人说是相国萧何所嘱。你握着那道请柬，指节微微发白——这一步迈进去，门里的路就由不得你走了，可这一步，你总得迈。"],
						"options": [
							{
								"t": "昂然入宫",
								"eff": {
									"attrs": { "shengwang": 2 },
									"dev": 0
								},
								"res": "你整冠入宫，步伐沉稳。钟室门阖上的那一刻，你忽然想通了：兵家算尽生死，也算不到这一局——这一局，不算谋，只算命。这一步，叫认。"
							},
							{
								"t": "嘱托从者",
								"eff": {
									"attrs": {
										"weiji": -2,
										"shengwang": -1
									},
									"dev": 0
								},
								"res": "你回头叮嘱从者：「兵书在我枕下，替我传下去。」从者伏地而泣。你这个人或许走不出钟室，你的兵书，会走出去——书传下去了，人就还在。"
							},
							{
								"t": "笑而入门",
								"eff": {
									"attrs": { "moulue": 1 },
									"dev": 1
								},
								"res": "你忽然笑了，笑自己当年那句「多多益善」。笑声在宫门间回荡，像当年城下河水的声音——这一笑，笑的是天命。"
							}
						]
					},
					"chapters": [6, 6],
					"type": "抉择"
				}
			],
			"GLOSSARY": {
				"淮阴": "秦县，今江苏淮安，韩信故里。城下有淮水，韩信微时钓于此。后为楚王都、淮阴侯国——一人之荣辱，一城之名。",
				"漂母": "淮阴城下漂洗衣絮的老妇。见韩信饥，饭之数十日，不求报。韩信为楚王，赐以千金——“一饭千金”出此。",
				"胯下": "淮阴屠中少年辱信，令“能死，刺我；不能死，出我胯下”。信俯出，一市皆笑。后信为楚王，召其人拜中尉，曰：此壮士也。",
				"项梁": "楚将项燕之子，与侄羽起兵会稽，渡江西进，拥立楚怀王。骄兵轻敌，败死于定陶——楚之兴也自梁，楚之败兆亦自梁。",
				"项羽": "名籍字羽，西楚霸王。巨鹿破秦主力，分封十八王，勇冠当世而妇人之仁。垓下败亡，自刎乌江，年三十一。",
				"滕公": "夏侯婴，刘邦车夫出身，封滕公。刑场上闻韩信一言而奇之，救其命而荐于王。后数救刘氏于危——识人于刀下者，千古一人。",
				"萧何": "汉初相国。月下追韩信，力荐为大将；晚年又助吕后绐杀之——“成也萧何，败也萧何”。功人功狗之论，亦出其口。",
				"章邯": "秦之末将，曾破陈胜、败项梁。降项羽，封雍王，镇关中以拒汉。陈仓一败，困守废丘经年，城破自刭——秦之长城，终于秦土。",
				"栈道": "秦岭绝壁上凿孔架木的通道，连接汉中与关中。刘邦入蜀时烧绝，示天下无还心——烧的是栈道，蓄的是野心。",
				"暗度陈仓": "韩信出兵故道（陈仓）奇袭关中，与“明修栈道”并称。声东击西之祖，兵家奇正之变，自此开局。",
				"三秦": "秦亡后项羽三分关中，封章邯、司马欣、董翳为王，以拒汉。韩信东出，传檄而定——关中之地，卒为汉有。",
				"井陉口": "太行八陉之一，今河北井陉，车不得方轨，骑不得成列。韩信在此背水列阵，以三万破赵二十万——置之死地而后生，在此一战。",
				"木罂缶": "以木缚罂缶为筏的渡水器械。韩信以此自夏阳渡河袭魏，兵不血刃——制敌于不见，善战者无赫赫之功。",
				"李左车": "赵之广武君。曾策陈馀深沟高垒勿与韩信战，不用；赵败，韩信解其缚，师事之，问以燕齐之策。",
				"龙且": "楚之名将，项羽麾下第一悍将。率二十万救齐，轻敌追击，潍水中流被韩信水淹，授首——项羽失龙且，如失一臂。",
				"垓下": "今安徽灵璧东南。前202年楚汉决战之地，四面楚歌，霸王别姬，项羽于此败亡。",
				"蒯通": "齐人，著名辩士。说韩信三分天下，不用，佯狂为巫。后曹参召为宾客，又得免——辩士之舌，可乱天下，亦可全身。",
				"樊哙": "沛人，屠狗出身，封舞阳侯。鸿门闯帐救刘邦，勇冠汉军；跪拜送迎韩信，口称大王——勇而善下人者，亦豪杰也。",
				"张良": "字子房，韩之后，汉初三杰之一。运筹帷幄，封留侯。晚好黄老，辟谷弃人间事——功成身退，汉廷唯此一人。",
				"吕后": "汉高帝之后，名雉。帝崩前后，诛彭越、杀韩信，皆出其手——汉家功臣之狱，半起于长乐宫。",
				"云梦": "云梦泽，今湖北境。汉高帝伪游云梦，会诸侯于陈，遂执韩信——天子之游猎，从来不止游猎。",
				"钟离眜": "楚之良将，项羽败亡后投奔韩信，素与信善。为帝所怨，韩信逼其自刭，献首于云梦——献首之日，信之狱成。",
				"陈豨": "汉将，封阳夏侯，监赵代边兵，慕魏公子之为人。前197年反于代，后被樊哙军斩。史载韩信曾约为内应。",
				"长乐宫": "汉都长安宫殿名，吕后居之。韩信被绐入贺，斩于宫中钟室，夷三族——钟室无窗，史笔有眼。"
			}
		};
	}));
	//#endregion
	//#region ../prot/lua-data/xiangyu.json
	var require_xiangyu = /* @__PURE__ */ __commonJSMin(((exports, module) => {
		module.exports = {
			"ATTRS": [
				{
					"k": "tupo",
					"n": "体魄",
					"words": [
						[80, "龙精虎猛"],
						[55, "筋骨强健"],
						[25, "尚可劳碌"],
						[0, "形销体弱"]
					]
				},
				{
					"k": "wuli",
					"n": "武力",
					"words": [
						[80, "万夫不当"],
						[55, "骁勇善战"],
						[25, "习得武艺"],
						[0, "手无缚鸡"]
					]
				},
				{
					"k": "caixue",
					"n": "文才",
					"words": [
						[75, "万人之敌"],
						[55, "知兵善战"],
						[35, "粗通兵法"],
						[0, "勇而无谋"]
					]
				},
				{
					"k": "moulue",
					"n": "谋略",
					"words": [
						[80, "算无遗策"],
						[55, "深谋远虑"],
						[25, "粗通权变"],
						[0, "不谙机心"]
					]
				},
				{
					"k": "biancai",
					"n": "辩才",
					"words": [
						[80, "舌动九州"],
						[55, "口若悬河"],
						[25, "能言善对"],
						[0, "拙于言辞"]
					]
				},
				{
					"k": "caifu",
					"n": "财富",
					"words": [
						[70, "府库山积"],
						[40, "仓廪充实"],
						[15, "尚可支军"],
						[0, "囊空如洗"]
					]
				},
				{
					"k": "shengwang",
					"n": "名声",
					"words": [
						[80, "天下归心"],
						[50, "威德并著"],
						[25, "勇名远播"],
						[0, "默默无闻"]
					]
				},
				{
					"k": "quanshi",
					"n": "权势",
					"words": [
						[80, "威震天下"],
						[50, "霸有诸侯"],
						[25, "号为上将"],
						[0, "匹夫之勇"]
					]
				},
				{
					"k": "zhengji",
					"n": "政绩",
					"words": [
						[80, "功盖当世"],
						[55, "政绩斐然"],
						[25, "小有建树"],
						[0, "寸功未立"]
					]
				},
				{
					"k": "junxin",
					"n": "君心",
					"words": [
						[70, "众望所归"],
						[45, "诸侯宾服"],
						[20, "面合心离"],
						[0, "人人自危"]
					]
				},
				{
					"k": "weiji",
					"n": "危机",
					"words": [
						[90, "命悬一线"],
						[70, "四面楚歌"],
						[40, "叛者渐起"],
						[0, "岁月静好"]
					],
					"inverse": true
				}
			],
			"ATTR_NAMES": {
				"tupo": "体魄",
				"wuli": "武力",
				"caixue": "文才",
				"moulue": "谋略",
				"biancai": "辩才",
				"caifu": "财富",
				"shengwang": "名声",
				"quanshi": "权势",
				"zhengji": "政绩",
				"junxin": "君心",
				"weiji": "危机"
			},
			"INIT": {
				"tupo": 60,
				"wuli": 70,
				"caixue": 40,
				"moulue": 25,
				"biancai": 15,
				"caifu": 15,
				"shengwang": 20,
				"quanshi": 10,
				"zhengji": 0,
				"junxin": 16,
				"weiji": 12
			},
			"AGE": {
				"init": 22,
				"bands": [
					[26, 0],
					[28, -1],
					[31, -2],
					[200, -3]
				],
				"longevity": [[65, 1], [74, 2]]
			},
			"ILLNESS": {
				"cost": 3,
				"heal": 5,
				"onsetTupo": 5,
				"onsetWeiji": 3,
				"drainTupo": 2,
				"drainWeiji": 2,
				"death": {
					"ending": "E8",
					"variant": "baobing"
				}
			},
			"ACTION_RULES": { "diminish": false },
			"DIFFICULTY": {
				"story": {
					"n": "剧情",
					"wj": .6,
					"corr": .5,
					"coef": .8,
					"backtrack": -1,
					"lethal": false,
					"hideAttrs": false,
					"desc": "数值全可见，无限回溯，危机增长放缓，不会致死"
				},
				"normal": {
					"n": "普通",
					"wj": 1,
					"corr": 1,
					"coef": 1,
					"backtrack": 1,
					"lethal": true,
					"hideAttrs": false,
					"desc": "标准体验，每章可回溯一次"
				},
				"hardcore": {
					"n": "硬核",
					"wj": 1.2,
					"corr": 1.3,
					"coef": 1.25,
					"backtrack": 0,
					"lethal": true,
					"hideAttrs": true,
					"desc": "危机×1.2，无回溯，属性仅以状态词显示"
				}
			},
			"SCENARIO": {
				"id": "xiangyu",
				"name": "项羽 · 霸王之局",
				"sub": "力拔山兮气盖世",
				"era": "前 209 — 前 202",
				"protag": "项羽",
				"desc": "一个从不打败仗的人，是怎么输掉天下的？",
				"recommend": "硬核定位（容错 0–1，建议通关前两剧本后再来）"
			},
			"HIDDEN": {
				"init": 15,
				"name": "诸侯离心",
				"showFrom": 3,
				"words": [
					[70, "众叛亲离"],
					[50, "叛者四起"],
					[30, "人心浮动"],
					[0, "诸侯畏服"]
				]
			},
			"PERSIST": {
				"junxinFrom": 1,
				"junxinShichong": false
			},
			"MERIT_MAP": {
				"起兵": 8,
				"巨鹿": 20,
				"鸿门": 10,
				"分封": 12,
				"彭城": 20
			},
			"DEV_BANDS": [
				{
					"max": 20,
					"name": "循史",
					"color": "#7fa8a0"
				},
				{
					"max": 45,
					"name": "微澜",
					"color": "#c9a959"
				},
				{
					"max": 70,
					"name": "改流",
					"color": "#c97a3a"
				},
				{
					"max": 100,
					"name": "逆天",
					"color": "#b0432f"
				}
			],
			"ENDINGS": {
				"E1": {
					"name": "乌江自刎",
					"seal": "循史",
					"cuncun": 25,
					"nitian": false,
					"devMax": 45,
					"ach": ["wujiang"],
					"zhuanAppends": [{
						"if": { "flag": "zidii" },
						"text": "又曰：江东子弟八千人从羽渡江而西，及乌江，无一人还。八千家的父母妻子，犹在江东倚门。羽之不渡，非无船也——无面目也。"
					}, {
						"if": { "flag": "yu" },
						"text": "又曰：垓下之帐，羽自为诗，虞姬和之，其辞不传。然“虞兮”二字，千年而下犹令人变色——盖世之雄，末路所系，不过一人一马耳。"
					}],
					"zhuan": "太史公曰：羽之力，拔山；羽之气，盖世。巨鹿九战，秦以不振；彭城一击，汉几不国。然坑降卒二十万，失天下之心；弑义帝于江中，失楚人之心；鸿门一纵，失范增之心；垓下一败，并己之心亦失之。乌江亭长檥船待，羽笑曰：纵江东父兄怜而王我，我何面目见之！遂自刎，年三十一。自矜功伐，奋其私智而不师古，谓“天亡我，非战之罪”——至死不悟，此其所以为羽也，亦其所以为楚也。",
					"brief": "兵败垓下不肯渡江，三十一岁自刎乌江之畔"
				},
				"E2": {
					"name": "会稽老卒",
					"seal": "苟活",
					"cuncun": 100,
					"nitian": false,
					"zhuan": "太史公曰：吴中有项氏子，力能扛鼎，勇闻乡里。及大泽兵起，或劝之举，不应，曰：吾弓马足自给耳。后十年，闻楚汉争，笑曰：幸不我去。卒以寿终，子孙为里中豪。",
					"brief": "吴中扛鼎少年未应起兵，十年局外，寿终于乡里"
				},
				"E3": {
					"name": "执戟余生",
					"seal": "苟活",
					"cuncun": 75,
					"nitian": false,
					"zhuan": "太史公曰：羽起于卒伍，终不预兵机。巨鹿之后，楚虽强，非其楚也。羽执戟于诸侯之师，先登则赏，败阵则罚，十数年解甲归乡。乡人问巨鹿事，曰：阵上风大，看不见。",
					"brief": "起于卒伍终不预兵机，执戟十余年，解甲归乡"
				},
				"E4": {
					"name": "鸿沟真和",
					"seal": "稳健",
					"cuncun": 85,
					"nitian": false,
					"devMin": 21,
					"zhuan": "太史公曰：鸿门纵刘，羽不失天下之望；长沙不弑，楚不失黎民之戴；范增不去，楚不失帷幄之谋。及鸿沟中分，羽守约不渝，汉亦终不能逾。东西各帝，十年而羽薨于彭城，谥曰霸王。向使羽能师古，不奋私智——其业，岂止五年哉！",
					"brief": "鸿门不杀长沙不弑，鸿沟守约，东西分帝而善终彭城"
				},
				"E5": {
					"name": "霸王之业",
					"seal": "稳健",
					"cuncun": 90,
					"nitian": false,
					"devMin": 21,
					"zhuan": "太史公曰：羽不坑一卒，不弑一帝，礼范增以终始。诸侯虽叛，叛而不炽；汉王虽强，强而不东。成皋一役，羽驱汉于巩洛，与之约和而王。太史公所谓“欲以力征经营天下”者，羽为之矣；而不以力征失天下者，羽亦悟之矣。",
					"brief": "不坑一卒不弑一帝，驱汉于巩洛，以力取而以信守之"
				},
				"E6": {
					"name": "江东再砺",
					"seal": "逆天",
					"cuncun": 80,
					"nitian": true,
					"devMin": 46,
					"zhuan": "太史公曰：乌江之渡，羽受亭长之檥。渡江之日，驻马北望，曰：吾必复来。江东父老闻王归，襁负而至者十万。羽乃折节下士，用故楚之才，约法于乡，休兵于野。三年，楚师再振；五年，临淮而观汉。江东子弟多才俊，卷土重来——杜牧之诗，不为虚语矣。",
					"variants": { "renwang": {
						"name": "江东归心",
						"zhuan": "太史公曰：新安之野无冤骨，大江之波无帝魂——羽所全者，非地非兵，天下之望也。是以乌江一渡，父老争迎于浦口，曰：大王不负楚，楚不负大王。残部由是得收，疮痍由是得抚，江东子弟负耒耜而至者相属于道。夫力可以拔山，不可以系人；望可以固圉，亦可以复国。向使羽早悟此二字，又何待垓下之歌哉！",
						"brief": "未坑一卒未弑一帝，江东父老争迎，残兵因望而复聚"
					} },
					"brief": "渡江而归折节下士，江东子弟十万襁负来归"
				},
				"E7": {
					"name": "垓下无楚",
					"seal": "逆天",
					"cuncun": 75,
					"nitian": true,
					"devMin": 46,
					"zhuan": "太史公曰：鸿门一匕，沛公殒于霸上。汉不兴，楚独强。然诸侯之叛，不系一人之存亡：田荣反齐，彭越挠梁，英布畔淮南。羽南征北讨，五年不释甲，终以力定之，都彭城而号霸王。史称：羽以力取天下，亦以力守天下——取者五年，守者亦不过十年耳。",
					"brief": "鸿门一匕沛公殒命，诸侯纷叛，以力取守不过十年"
				},
				"E8": {
					"name": "霸王之殁",
					"seal": "败局",
					"cuncun": 10,
					"nitian": false,
					"zhuan": "太史公曰：羽之勇，冠绝古今；羽之败，亦快于古今。或溃于固陵，或陷于阴陵之泽，或亡于彭城之变，或死于安阳之帐。恃力者，力尽则蹶——项氏之兴也暴，其亡也忽。",
					"variants": {
						"anyang": {
							"name": "安阳之诛",
							"zhuan": "太史公曰：安阳之谋，羽欲斩宋义，为义所觉，先事诛羽。或曰：羽若不死，楚兵不破；宋义若进，赵围不解。然羽死而义终不进，秦亦不复振——一人之去留，天下之枢机，夫岂偶然？",
							"brief": "谋斩宋义而事泄，先死于帐下，楚师由是无人救赵"
						},
						"guling": {
							"name": "固陵之溃",
							"zhuan": "太史公曰：固陵之野，楚师一溃不再振。羽单骑突围，身被十创，殁于乱军。拔山之力，至此山穷；盖世之气，至此水尽。",
							"brief": "固陵一溃不再振，单骑突围身被十创，殁于乱军之中"
						},
						"yinling": {
							"name": "阴陵之泽",
							"zhuan": "太史公曰：羽迷道阴陵，田父绐之“左”，乃陷大泽中，骑不能出，步不能脱，汉骑四合。拔山者，终困于尺寸之地——天之亡楚，以地杀之。",
							"brief": "阴陵迷道为田父所绐，陷于大泽，骑不能出而汉骑四合"
						},
						"baobing": {
							"name": "病殁军中",
							"zhuan": "太史公曰：固陵既胜，楚师退保垓下。壁垒未合，汉骑未至，而羽病矣。连年鞍马，创痍遍体，沉疴暗积，一夕大渐，药石不能进，竟殁于军中，年三十。是时楚歌未起，而霸王先逝；乌骓绕帐长嘶，数日不食。羽既殁，楚师无主，不战自溃——诸侯之兵四合而至，已无复可围者矣。夫力能拔山，不能却一病；气盖当世，不能延一息。天之亡楚，固不待乌江之水也。",
							"brief": "连年鞍马沉疴暗积，未闻楚歌先殁军中，楚师无主自溃"
						},
						"zuzhu": {
							"name": "项氏之夷",
							"zhuan": "太史公曰：新安之坑、义帝之沉、分封之刻，诸侯之怨楚，非一日矣。及楚师疲于外、彭城虚于内，五国连檄，不攻其军，先屠其族。羽转战归救，城头已易赤帜——宫室焚，宗庙隳，项氏无少长皆弃市。力能扛鼎，不能庇其宗；威加海内，不能息天下之怨。羽之兴也，以一剑；项氏之亡也，以万怨。",
							"brief": "诸侯连檄不攻其军先屠其族，宫室焚宗庙隳，项氏弃市"
						},
						"cike": {
							"name": "帐中之匕",
							"zhuan": "太史公曰：羽之神勇，冠绝古今；防身之术，不逮匹夫。是夜巡营方罢，漏下三鼓，有客伪为伤卒求谒，咫尺出袖刃，三击而中要害。百万之军，系于一身；一身既殒，三军遂溃。夫以力服人者，人亦以力伺之——扛鼎之手，终挡不住袖中一缕寒光。",
							"brief": "客伪伤卒夜谒，袖刃三击中要害，一身既殒三军遂溃"
						}
					},
					"brief": "勇冠古今，败亦快于古今，一身既陨霸业随倾"
				}
			},
			"CHAPTERS": [
				{
					"id": "c0",
					"title": "序章 ｜ 吴中少年",
					"sub": "教学章 · 约前 220—前 210",
					"age": 22,
					"summaryNotes": [
						"【教学】上方十一维是你的命数。危机涨满之日，便是垓下歌起之时。",
						"【教学】偏离度记你与史实的距离，只增不减：≤20 循史，21–45 微澜，46–70 改流，71 以上逆天。",
						"【教学】选项旁带\"史\"字者，是史书所载项羽的本来面目。循之则稳，违之则波澜自生。",
						"【教学】岁月催人——体魄随年齿衰减。体魄高则延寿：寿元可逐点抵去当年的衰老之损，并压低发病之率（寿元与阈值见属性面板下方）。体魄低则易病：小病静养两轮自愈，大病须用「求医问药」。病至膏肓，体魄归零，便是殁时。"
					],
					"intro": [
						"秦并天下已十一年。会稽郡的赋税一年重过一年，骊山的刑徒一拨多过一拨，路上的黔首低着头走路，不敢抬头看天。",
						"你是⟦下相⟧人，姓项名籍，字羽。楚将项燕之孙——爷爷死在秦人手里，国仇家恨，项氏的灵位前年年烧着香，越添越旺。",
						"叔父⟦项梁⟧教你读书，不成；教你学剑，又不成。他问：你到底要学什么？你说：书足以记名姓而已；剑一人敌，不足学——学万人敌。这一年你二十二岁，史书上还没有你的名字。"
					],
					"start": "0-1",
					"events": [
						{
							"id": "0-1",
							"title": "学万人敌",
							"segs": ["项梁听罢，搬出一箧兵书：要学万人敌，先读万人之书。你白天演武，夜里读阵——有些东西，不是学来的，是天生就在骨头里的。", "项梁讲一句，你顶三句；顶到第三个月，叔父不讲了，只把目光压在你肩上。吴中的少年子弟，渐渐都不敢直视你的眼睛。"],
							"options": [
								{
									"t": "昼夜研习，志在必得",
									"hist": true,
									"res": "竹简堆满半间屋，又被你翻烂了半箱。兵法的骨架在心里立起来，叔父逢人只说四个字：此子不凡。吴中子弟，已皆惮你。你合上最后一卷兵书，窗外天光微亮——这一箧书，读的不是字，是将来的天下。",
									"eff": {
										"attrs": {
											"caixue": 5,
											"moulue": 2,
											"shengwang": 3
										},
										"dev": 0,
										"flags": ["wanrendi"],
										"ach": "wanrendi"
									},
									"to": "0-2"
								},
								{
									"t": "以力代学，勇闻乡里",
									"res": "竹简你翻了两页就搁下了。可鼎你能举过头顶，剑你能连胜十场——名声传了出去，只是传的不是兵法，是气力。项梁摇头，乡里叫好。你掷鼎于地，尘土腾起半人高——万人敌，难道非要从书里学么？",
									"eff": {
										"attrs": {
											"wuli": 3,
											"shengwang": 5,
											"caixue": -2
										},
										"dev": 3
									},
									"to": "0-2"
								},
								{
									"t": "观始皇渡浙江",
									"res": "始皇东游渡浙江，銮驾如山，万人空巷。你站在人堆里，脱口而出：“彼可取而代也！”项梁一把捂住你的嘴，手心全是汗。人群散尽，叔父看你的眼神亮了一夜——那句话，你不是说给始皇听的，是说给自己听的。",
									"eff": {
										"attrs": {
											"shengwang": 5,
											"weiji": 5
										},
										"dev": 5,
										"flags": ["wanrendi"]
									},
									"to": "0-2"
								}
							]
						},
						{
							"id": "0-2",
							"title": "吴中结客",
							"segs": ["项梁在吴中流亡多年，暗地里早是一方之主。豪杰犯法来投奔，县里大事来请教——门槛都被踏低了一截。叔父让你主办征发与酒席。", "你在酒席间看人：海量的是谁，寡言的是谁，酒后露刃的又是谁——你心里那本册子，一页一页厚了起来。这些人，早晚有一天，要跟着你干一件大事。"],
							"options": [
								{
									"t": "悉心结交，网罗俊杰",
									"res": "桓楚、龙且、季布、钟离眜——酒桌上你记下这些名字，一个一个去结交。他们看你举鼎的手、读阵的眼，渐渐服了气。这些名字，日后都是你的臂膀——臂膀这东西，是拿酒、拿命、拿义气，一寸一寸换来的。",
									"eff": {
										"attrs": {
											"biancai": 2,
											"shengwang": 4,
											"caifu": -3
										},
										"dev": 0,
										"flags": ["jieke"]
									},
									"to": "0-3"
								},
								{
									"t": "独来独往，不事交游",
									"res": "帖子送来一摞，你一推了之。拳头够硬，要朋友做什么——只是夜深人静，项梁替你赴的那些局，你不知道罢了。一个人，终究只有一双手。",
									"eff": {
										"attrs": {
											"weiji": -3,
											"shengwang": -2
										},
										"dev": 3
									},
									"to": "0-3"
								},
								{
									"t": "比武立威，压服一方",
									"res": "校场上你连挫七人，最后一个被掷出丈外。喝彩声里夹着几分惧意——吴中再没人敢在你面前大声说话。威这东西，立起来快，立起来也脆。",
									"eff": {
										"attrs": {
											"wuli": 3,
											"shengwang": 5,
											"weiji": 5
										},
										"dev": 3
									},
									"to": "0-3"
								},
								{
									"t": "仗剑游侠，名动江淮",
									"req": {
										"wuli": 55,
										"tupo": 45
									},
									"res": "你搁下酒盏，仗剑东出江淮。千里泽国群豪风起，你一一剑下论交——亡命大泽的桓楚，从此只认你一个债主。半年后归吴，舟过处豪杰敛衽。你立在船头，看着两岸的芦花——这江淮的每一片水泽，将来都要认得你的旗。",
									"eff": {
										"attrs": {
											"wuli": 2,
											"shengwang": 3
										},
										"dev": 2
									},
									"to": "0-3"
								}
							]
						},
						{
							"id": "0-3",
							"title": "大泽风雷",
							"segs": ["前209年七月，⟦陈胜⟧吴广九百戍卒起于大泽。雨夜里一声“王侯将相宁有种乎”，半个天下的火都被点着了。消息传到会稽，郡县震动。", "郡守⟦殷通⟧也动了心思，连夜请项梁入府议事。酒过三巡，殷通压低声音：“江西皆反，此亦天亡秦之时也。吾欲起兵，以公与桓楚为将。”"],
							"options": [{
								"t": "随叔父赴府，静观其变",
								"hist": true,
								"res": "你按剑随项梁入府。席上烛火摇曳，殷通说得兴起，项梁只是微笑——你知道这个笑：会稽的天，今夜要变了。你按着剑柄，听着窗外更鼓响了三声——这满城的灯火，天亮之前，就要换一种点法了。",
								"eff": {
									"attrs": {
										"caixue": 2,
										"moulue": 2
									},
									"dev": 0
								},
								"to": "NEXT"
							}, {
								"t": "不预兵事，守家自全",
								"req": { "notflag": "wanrendi" },
								"res": "你劝叔父称病谢了。当夜府里的刀光，与你无关。很多年后，楚汉的烽火烧遍中原，吴中的项宅里只有练武的呼喝声——那夜没有拔出的剑，是不是这辈子最干净的一柄？",
								"eff": { "dev": 0 },
								"to": { "ending": "E2" }
							}]
						}
					]
				},
				{
					"id": "c1",
					"title": "第一章 ｜ 会稽起兵",
					"sub": "前 209—前 208",
					"age": 23,
					"summaryNotes": ["一颗头颅，八百人，八千子弟——项氏的楚旗，就这样竖了起来。", "范增来了。七十岁的老人，眼里装着整个天下。用不用他，是你一生的题。"],
					"intro": ["郡守府的夜宴，烛火通明。殷通还在做他的梦：他为将，项梁为副，借着天下的乱，做一方诸侯。", "他不知道，座上那对叔侄，早已把这座府邸的每一道门、每一个甲士都算过了。席间，项梁忽然看你一眼——你懂这个眼神：先下手为强。"],
					"start": "1-1",
					"events": [
						{
							"id": "1-1",
							"title": "会稽夺印",
							"segs": [
								"殷通的话还没说完，项梁说：桓楚亡在泽中，只有籍知道他在哪——唤他进来。你入府，解剑，趋行，跪拜，礼仪一样不缺。",
								"剑光起时，殷通的人头滚落在丹墀之下——他的笑，还停在脸上。",
								"府中大乱。你手提郡守的头颅，腰佩其印绶，立于庭中。须臾之间，击杀数十百人。一府皆慑，莫敢起。"
							],
							"options": [{
								"t": "召故吏豪杰，收兵八千人",
								"hist": true,
								"res": "旧吏豪杰一个接一个来投。你收编郡兵，拣其精锐，得八千人——吴中子弟，争为死士。这八千人，是你全部的本钱。从今夜起，他们活着，你才有资格谈天下。",
								"eff": {
									"attrs": {
										"wuli": 3,
										"quanshi": 10,
										"shengwang": 5
									},
									"dev": 0,
									"flags": ["zidii"],
									"merit": "起兵",
									"ach": "zidii"
								},
								"to": "1-2"
							}, {
								"t": "纵兵大掠，以威立名",
								"res": "会稽三日不宁。府库满了，街巷空了。兵是收得更多了，人心却散了半截。你站在府库门口，看着那满库的财物——这些东西，买得来兵，买不来心。",
								"eff": {
									"attrs": {
										"caifu": 8,
										"shengwang": -5,
										"weiji": 5
									},
									"dev": 5
								},
								"to": "1-2"
							}]
						},
						{
							"id": "1-2",
							"title": "范增来投",
							"segs": ["居巢人⟦范增⟧，年七十，素居家，好奇计。天下乱起，多少人去请他，他一个不见。", "听说项氏起兵，老人自己拄着杖来了。进帐他不坐，先看你：看你按剑的手，看你案上的阵图，看你身后的八千子弟。看了很久，他只说了一句：“羽非百里才也。”"],
							"options": [
								{
									"t": "礼为上宾，尊称亚父",
									"hist": true,
									"res": "你下座相迎，以亚父之礼事之。帐中诸将不解：一村叟耳。范增也不解释——七十年的奇计，总要寻一个配得上它的人。你扶他上座，他按住你的手：这三百里路，老夫走了多久？",
									"eff": {
										"attrs": {
											"junxin": 5,
											"caixue": 3
										},
										"dev": 0,
										"flags": ["fanzeng"],
										"ach": "yafu"
									},
									"to": "1-3"
								},
								{
									"t": "以客卿待之，不亲不疏",
									"res": "你赐座、赐金、赐帐，礼数周全，话却止于军务。范增留下了，策也只说三分——老谋士的分寸，是跟着你的分寸走的。",
									"eff": {
										"attrs": { "weiji": -2 },
										"dev": 3,
										"flags": ["fanzeng"]
									},
									"to": "1-3"
								},
								{
									"t": "以武夫轻之",
									"res": "“七十老叟，何奇计之有？”范增笑了笑，转身出帐，从此只在后排坐着，再没主动献过一策。有些账，当时算不清——要等输赢都定了，才看得明白。",
									"eff": {
										"attrs": {
											"caixue": -3,
											"junxin": -3
										},
										"dev": 5
									},
									"to": "1-3"
								}
							]
						},
						{
							"id": "1-3",
							"title": "立楚怀王",
							"segs": ["项梁渡江而西，众至数万。范增进言：秦灭六国，楚最无罪，楚人至今怜之——“宜立楚后。名不正，则言不顺；旗不立，则众不聚。”", "使者找了三个月，在盱眙的野地里找到了楚怀王的孙子熊心——他正在替人牧羊，手里还攥着鞭子，鞭梢上沾着泥。"],
							"options": [{
								"t": "立熊心为楚怀王，以从民望",
								"hist": true,
								"res": "牧羊儿洗净了手，登上王位，仍号楚怀王——用他祖父的谥号，是要楚人想起旧日的冤。楚地父老山呼万岁，散沙聚成了军。这面旗是给楚人看的；至于旗后坐着谁，那是另一回事。",
								"eff": {
									"attrs": {
										"junxin": 8,
										"shengwang": 5,
										"zhengji": 5
									},
									"dev": 0
								},
								"to": "NEXT"
							}, {
								"t": "不立虚名，自号为长",
								"res": "“楚人之后，何必牧羊儿！”项梁沉吟良久，依了你。帐前少了香火，军中多了干脆——省去一尊神像，也少了一面大旗。省掉的香火，早晚要用别的东西补。",
								"eff": {
									"attrs": {
										"quanshi": 5,
										"junxin": -8,
										"shengwang": -5
									},
									"dev": 8
								},
								"to": "NEXT"
							}]
						}
					]
				},
				{
					"id": "c2",
					"title": "第二章 ｜ 安阳与巨鹿",
					"sub": "前 208—前 207 · 历史节点",
					"age": 25,
					"summaryNotes": ["宋义的头落地时，没人敢说话。上将军的印绶，是自己挣来的，不是怀王给的。", "漳水很凉。⟦破釜沉舟⟧的那把火，会烧进中国两千年的兵书里。"],
					"intro": ["定陶秋雨，楚军大败。项梁战死的消息传回时，你正在攻陈留——城攻到一半，天塌了一半。楚怀王趁势收权：迁都彭城，自将诸军。", "秦将⟦章邯⟧四十万围⟦巨鹿⟧，怀王以⟦宋义⟧为上将军、你为次将、范增为末将，北上救赵。大军行至安阳，宋义一停，就是四十六天。"],
					"node": "N1",
					"mutations": [
						{
							"if": { "shengwang": 50 },
							"flag": "zhufu",
							"note": "【节点异变】你的勇名已压过宋义——诸将早就在等一个由头。"
						},
						{
							"if": { "junxinMax": 20 },
							"flag": "huaiyi",
							"note": "【节点异变】怀王与宋义，已经在商量怎么除掉项氏——先动手的理由，他们递给你了。"
						},
						{
							"if": { "weiji": 60 },
							"flag": "liangjue",
							"note": "【节点异变】军粮见底。宋义还在饮酒高会——你没有下一个四十六天了。"
						},
						{
							"if": { "devMin": 40 },
							"flag": "songyiqiang",
							"note": "【节点异变】历史偏了：宋义先动手了——今夜帐外埋伏的，是他的人。"
						}
					],
					"start": "2-1",
					"events": [
						{
							"id": "2-1",
							"title": "安阳夺军",
							"key": true,
							"altSegs": {
								"flag": "songyiqiang",
								"segs": ["你入帐时，宋义没有抬头。两侧的刀斧手先动了——他算到了你会算他。", "剑光比伏刀快了一线。刀斧手的刀还没落稳，你的剑已经还了鞘。帐外的亲兵冲进来时，宋义已经倒在血泊里。没有人问先动手的是谁。"]
							},
							"segs": [
								"天寒，大雨，士卒冻饥，以芋菽为食。宋义帐中却日日高会，还送儿子去齐国为相，亲自送到无盐——诸将的怒火，像一炉看不见的炭。",
								"你晨朝上将军，即其帐中。“国家安危，在此一举；今不恤士卒而徇其私，非社稷之臣！”剑出鞘，头落地——话落与剑落，几乎是同一个声音。",
								"你提宋义的头出帐：宋义与齐谋反楚，楚王阴令羽诛之。雨声里，诸将慴服，共立你为假上将军。"
							],
							"options": [
								{
									"t": "斩宋义，夺上将军印",
									"hist": true,
									"res": "你遣使回报怀王。彭城沉默了三日——杀都杀了，追认只是给天下一个说法。使者带回真上将军的印绶。从这一天起，楚军姓项，怀王看你的眼神再没缓过来。这印上拴着的，不止是兵，还有一条一条的命。",
									"eff": {
										"attrs": {
											"wuli": 3,
											"quanshi": 10,
											"shengwang": 5,
											"weiji": 5,
											"zhengji": 5
										},
										"dev": 0,
										"merit": "巨鹿",
										"ach": "duojun"
									},
									"to": [
										{
											"if": { "anyflag": [
												"zhufu",
												"huaiyi",
												"songyiqiang",
												"liangjue"
											] },
											"to": "2-2"
										},
										{
											"if": { "quanshi": 20 },
											"to": "2-2"
										},
										{ "to": {
											"ending": "E8",
											"variant": "anyang"
										} }
									]
								},
								{
									"t": "再谏一次，引兵绕开宋义",
									"res": "你又谏了一次。宋义传令：猛如虎、狠如羊、贪如狼者，皆斩之——这话斩的是谁，诸将都听得出来。你自带八千子弟先行北上，身后的大军由不得你了。这一走，走的是赌。",
									"eff": {
										"attrs": {
											"quanshi": -5,
											"weiji": 8,
											"shengwang": 3
										},
										"dev": 8
									},
									"to": "2-2"
								},
								{
									"t": "忍而不发",
									"res": "你又忍了十天。第十一天，宋义请你“议事”——帐后伏刀，席上置毒。你只恨那四十六天里，没有一天先下手。你坐在自己的帐中，看着那柄没有出鞘的剑——忍字头上一把刀，这把刀，早晚要落下来。",
									"eff": {
										"attrs": {
											"junxin": -5,
											"weiji": 10
										},
										"dev": 5
									},
									"to": {
										"ending": "E8",
										"variant": "anyang"
									}
								}
							]
						},
						{
							"id": "2-2",
							"title": "破釜沉舟",
							"segs": ["你引兵渡⟦漳水⟧。河对岸，⟦章邯⟧筑甬道连河，四十万秦军围巨鹿如铁桶。诸侯十余壁，皆作壁上观。", "全军尽渡。你下令：皆沈船，破釜甑，烧庐舍，持三日粮。“以示士卒必死，无一还心。”——船沉了，锅砸了，营烧了，火光里映着几千张没有表情的脸。"],
							"options": [{
								"t": "沉船破釜，决一死战",
								"hist": true,
								"res": "八千楚军过河时没有一个人回头。营垒烧掉的烟，三十里外都看得见——巨鹿城头望见这烟的赵人，先哭了。你骑在马上，看着那烟升起来——退路烧了，路就只剩一条了：这条路，叫赢。",
								"eff": {
									"attrs": {
										"wuli": 2,
										"weiji": 10,
										"shengwang": 8,
										"caixue": 3
									},
									"dev": 0,
									"flags": ["pofu"],
									"ach": "pofu"
								},
								"to": "2-3"
							}, {
								"t": "留船半渡，进退有据",
								"res": "你留了一半船，算是稳妥，也算是留了退路。士卒们看了你一眼，眼神里的东西淡了些——必死的军心，是烧出来的，不是算出来的。有些船，留着留着，就变成了拴住人心的绳子。",
								"eff": {
									"attrs": {
										"weiji": -5,
										"shengwang": -5,
										"caixue": -3
									},
									"dev": 5
								},
								"to": "2-3"
							}]
						},
						{
							"id": "2-3",
							"title": "巨鹿之战",
							"segs": [
								"第一战，断甬道。楚卒绝秦粮道，⟦王离⟧军乏食，章邯引兵却——秦军的阵脚，第一次晃了。",
								"九战。你与秦军九战，楚卒呼声动天地，无不以一当十。诸侯军十余壁，皆在壁上看着——看楚人一军撞进四十万秦军里，像一柄烧红的刀插进牛油。",
								"王离被擒，涉间自焚，苏角授首。巨鹿之围，一朝而解。诸侯将入辕门，无不膝行而前，莫敢仰视。"
							],
							"options": [{
								"t": "九战破秦，诸侯上将军",
								"hist": true,
								"res": "从辕门出来，你就是天下的上将军了——靠的是秦军四十万的溃败堆出来的。那些壁上观的诸侯将，自此见你便膝行。你站在巨鹿城头——这满天下的诸侯都欠你一个跪；可跪着的人，心里都有一本自己的账。",
								"eff": {
									"attrs": {
										"wuli": 5,
										"quanshi": 12,
										"shengwang": 12,
										"junxin": 8
									},
									"dev": 0,
									"merit": "巨鹿",
									"ach": "julu"
								},
								"to": [
									{
										"if": {
											"flag": "pofu",
											"caixue": 45
										},
										"to": "NEXT"
									},
									{
										"if": { "quanshi": 45 },
										"to": "NEXT"
									},
									{ "to": {
										"ending": "E8",
										"variant": "guling"
									} }
								]
							}, {
								"t": "与诸侯合兵同进",
								"res": "你把首功分给诸侯，诸壁之兵并入麾下。破秦的声势小了些，盟主的座位稳了些。只是分出去的首功，日后都会变成他们还价的底气——让出去的东西，人家都记着账。",
								"eff": {
									"attrs": {
										"biancai": 2,
										"quanshi": 6,
										"junxin": 8,
										"shengwang": 5
									},
									"dev": 5
								},
								"to": "NEXT"
							}]
						}
					]
				},
				{
					"id": "c3",
					"title": "第三章 ｜ 鸿门",
					"sub": "前 207—前 206 · 历史节点",
					"age": 26,
					"summaryNotes": ["二十万降卒的命，是新安城外一夜就埋掉的——往后很多年，你才明白这一夜埋的是什么。", "鸿门那一夜，范增举了三次玉玦。你三次都没有看他。"],
					"intro": ["巨鹿战后，章邯率二十万秦卒来降。你封他为雍王，置之楚军中。风光是风光，你的眉头却一天比一天紧——降卒里全是关中子弟，二十万张吃饭的嘴，二十万颗不定的心。", "进关的路还长。那二十万降卒的命，是新安城外一夜就埋掉的——往后很多年，你才明白这一夜埋的是什么。"],
					"node": "N2",
					"mutations": [{
						"if": { "caifu": 30 },
						"flag": "liangzu",
						"note": "【节点异变】军粮尚足——你还有一个\"不必杀\"的选择摆在案上。"
					}, {
						"if": { "devMin": 40 },
						"flag": "jiangbian",
						"note": "【节点异变】降卒夜里哗变了一座营。刀已经替你递到了手边。"
					}],
					"start": "3-1",
					"events": [
						{
							"id": "3-1",
							"title": "新安之夜",
							"key": true,
							"altSegs": {
								"flag": "jiangbian",
								"segs": [
									"⟦新安⟧。夜。降卒的营里先乱了——一座营啸变，火光烧红了半边天，楚骑围了三匝才压下去。",
									"你赶到时，辕门外的尸体还没收。哗变的由头小得可笑：一句口信，说进了关，关中家里老小都要问罪。",
									"诸将跪了一片：秦卒心不信，进关必为变。今夜是一座营，明日就是二十万。范增在你身后，久久没有说话。杀，还是不杀。"
								]
							},
							"segs": [
								"⟦新安⟧。夜。降卒的营连绵十几里，火把像一条冻住的河。楚军押着他们走，走得像押一群牲口。秦卒低声议论：章将军骗了我们——进了关，家里怎么办？",
								"降卒的营里有人唱关中的歌谣，唱着唱着就哭了——哭声会传染，一夜之间，半座营都在哭。",
								"诸将来报：秦卒心不信，进关必为变。范增在你身后，久久没有说话。杀，还是不杀——这个问题，在你心里，像一块烧红的铁。"
							],
							"options": [
								{
									"t": "夜击坑之，永绝后患",
									"hist": true,
									"res": "当夜，楚军围营。二十万人，一夜坑尽——新安城南的土，第二年春天还没长出草。你站在那片新翻的土前——这一夜埋掉的，不止二十万人，还有关中二十万颗心，和“霸王”两个字里所有的软。",
									"eff": {
										"attrs": {
											"shengwang": -15,
											"junxin": -10,
											"weiji": 8
										},
										"dev": 0,
										"flags": ["kengzu"],
										"hist": -25,
										"zg": 10
									},
									"to": "3-2"
								},
								{
									"t": "收编为军，恩威并施",
									"res": "你拣其精锐编入楚军，老弱给粮遣归，降卒各营设楚将监之。有人夜里还在唱关中的歌，调子却缓了。范增看了你一眼，眼里的冰化了一层。恩威两个字，中间隔着一碗饭的距离。",
									"eff": {
										"attrs": {
											"quanshi": 5,
											"shengwang": 5,
											"weiji": 5
										},
										"dev": 10,
										"hist": 10
									},
									"to": "3-2"
								},
								{
									"t": "尽数遣散，放归关中",
									"req": { "caifu": 15 },
									"res": "二十万双眼睛看着你，看完，跪了一片。放虎归山？还是放人归家？你只说了一个字：走。多年后你才知道这个字的价钱。这一走，他们带走的不只是干粮，还有关于你的所有传说。",
									"eff": {
										"attrs": {
											"caifu": -15,
											"shengwang": 8,
											"quanshi": -8
										},
										"dev": 12,
										"hist": 15
									},
									"to": "3-2"
								},
								{
									"t": "拨粮养降，屯田新安",
									"req": { "flag": "liangzu" },
									"res": "你下令：降卒就新安屯田，军粮按营拨付。二十万张嘴有了饭吃，田垄一日日取代了壕沟。范增望着屯田的炊烟，只说了一句：此一着，胜于十万兵。原来二十万把刀，也可以变成二十万双手。",
									"eff": {
										"attrs": {
											"caifu": -12,
											"weiji": -4,
											"shengwang": 4,
											"junxin": 2
										},
										"dev": 8,
										"hist": 10
									},
									"to": "3-2"
								}
							]
						},
						{
							"id": "3-2",
							"title": "函谷受阻",
							"segs": ["前锋来报：⟦函谷关⟧上有兵守关——沛公已经先破咸阳了。怀王有约：先入定关中者王之。你浴血三年，刘邦捡了这个“先”字。", "你大怒，使⟦英布⟧等攻关。四十万大军撞开关门，尘土三日不落。军驻鸿门——咸阳的宫灯，就在三十里外，一夜一夜亮着。"],
							"options": [{
								"t": "厉兵秣马，旦日飨士卒",
								"hist": true,
								"res": "你下令旦日会战。⟦曹无伤⟧的告密就放在案上：沛公欲王关中，珍宝尽有之。范增说：急击勿失。新丰鸿门的夜里，四十万支火把烧到天亮。你站在帐门口，看着那片火海——明天一早，这天下，就要定下第一笔账了。",
								"eff": {
									"attrs": {
										"wuli": 2,
										"quanshi": 3,
										"weiji": 3
									},
									"dev": 0
								},
								"to": "3-3"
							}, {
								"t": "缓兵三日，先观其变",
								"res": "你把战期往后压了压——刘邦先入关，毕竟占着一个“义”字。范增的眉头又深了一寸。灞上的营寨灯火通明，对方没有睡。义字当头，刀就得慢——可刀慢了，人心未必慢。",
								"eff": {
									"attrs": {
										"moulue": 2,
										"weiji": -3,
										"junxin": -3
									},
									"dev": 5
								},
								"to": "3-3"
							}]
						},
						{
							"id": "3-3",
							"title": "鸿门宴",
							"key": true,
							"segs": [
								"⟦鸿门宴⟧之夜：⟦项伯⟧私见⟦张良⟧，回来劝你：沛公不先破关中，公岂敢入乎——今人有大功而击之，不义。",
								"第二天，沛公带百余骑来谢。他进门就拜：臣与将军戮力攻秦，不自意先入关——有小人之言，令将军与臣有隙。话说得谦卑，背却一直微微躬着。",
								"席间酒肉丰盛。范增举所佩玉玦者三，你默然不应。范增起，出，召⟦项庄⟧：“君王为人不忍，请以剑舞，因击沛公于坐杀之。”剑光起来了。你的手指，按在案上。"
							],
							"options": [
								{
									"t": "默然纵之，放刘归灞上",
									"hist": true,
									"res": "⟦项庄⟧的剑被项伯挡了三次。⟦樊哙⟧带剑拥盾闯帐，你赐卮酒彘肩——好壮士。沛公起如厕，一去不回。范增摔了玉斗：竖子不足与谋！夺项王天下者，必沛公也。你看着那碎玉——亚父骂的是刘邦，也是我。",
									"eff": {
										"attrs": {
											"junxin": 3,
											"shengwang": 3
										},
										"dev": 0,
										"flags": ["zongliu"],
										"ach": "hongmen",
										"merit": "鸿门"
									},
									"to": "NEXT"
								},
								{
									"t": "举玦为号，帐中杀刘",
									"req": { "flag": "fanzeng" },
									"res": "你终于举起了手。项庄的剑，这次没有项伯能挡。沛公的血溅在酒案上时，帐外的百骑还不知道帐里发生了什么。你站在那滩血前——这一剑，斩的不是刘邦，是“义”字。",
									"eff": {
										"attrs": {
											"weiji": 20,
											"shengwang": -8
										},
										"dev": 40
									},
									"to": [{
										"if": {
											"quanshi": 40,
											"caixue": 45
										},
										"to": { "ending": "E7" }
									}, { "to": "3-3b" }]
								},
								{
									"t": "留刘为质，不放不归",
									"res": "你扣下了沛公，说是“多留几日叙旧”。关中无主，诸侯侧目，灞上十万汉军日夜磨着刀。范增叹道：杀不得，放不得——此亦失算。一个人质换不来一座天下——这件事，你承认，你算错了。",
									"eff": {
										"attrs": {
											"weiji": 15,
											"junxin": -8
										},
										"dev": 20
									},
									"to": "NEXT"
								},
								{
									"t": "当众折辩，诘其守关之欲",
									"req": { "biancai": 42 },
									"res": "沛公谢罪的话才说到一半，你抬手止住他：“将军使兵守函谷，拒诸侯之军——此亦小人之言么？”满帐一静。刘邦的额头贴着地，久久抬不起来。范增举着玉玦的手，缓缓放下了。这一问，问的是关，也不全是关。",
									"eff": {
										"attrs": {
											"shengwang": 5,
											"junxin": 3,
											"weiji": 3
										},
										"dev": 12
									},
									"to": "NEXT"
								}
							]
						},
						{
							"id": "3-3b",
							"title": "鸿门变起",
							"segs": ["剑已出鞘，沛公的亲兵也亮了刀。项伯张翼挡在中间，樊哙撞开了帐门。帐外的百骑听见动静，一齐拔刀——金属声连成一片，像铁雨落在瓦上。", "杀，变成了乱；乱，正在变成你的笑话——满帐的人，都在看你的手。"],
							"options": [{
								"t": "强令收束，纵刘出帐",
								"res": "你喝止了项庄，收了满帐的刀。沛公走了，带着一身冷汗和一辈子的记性——他出帐时的那个眼神，你很多年后还会在垓下想起来。记住一个人，有时候比恨一个人，更可怕。",
								"eff": {
									"attrs": {
										"weiji": 10,
										"shengwang": -5
									},
									"dev": 10
								},
								"to": "NEXT"
							}, {
								"t": "一不做二不休，追而杀之",
								"res": "沛公的马快，你的追兵更快——但灞上的十万汉军，比你的追兵更近。乱军之中，你第一次尝到了什么叫骑虎难下。有些事，起了头，就收不了尾。",
								"eff": {
									"attrs": { "weiji": 20 },
									"dev": 15
								},
								"to": {
									"ending": "E8",
									"variant": "guling"
								}
							}]
						}
					]
				},
				{
					"id": "c4",
					"title": "第四章 ｜ 分封",
					"sub": "前 206",
					"age": 26,
					"summaryNotes": ["咸阳的火，烧了三个月。有人劝你留，有人劝你走——你只想回家。", "十八颗印绶分出去那天，诸侯谢恩。没人看见，桌子底下已经各自磨刀。"],
					"intro": ["你进咸阳。阿房宫的台榭连绵三百里，秦宫室、府库、子女、玉帛，都在你的兵锋之下。", "有人劝你：关中阻山河四塞，地肥饶，可都以霸。可你望着东边，只想彭城——富贵不归故乡，如衣绣夜行。关中再好，不是家。"],
					"start": "4-1",
					"events": [
						{
							"id": "4-1",
							"title": "咸阳三月",
							"segs": [
								"咸阳的街巷飘着酒气和灰。降王子婴的轵道亭降表，还压在案头。",
								"你下令：杀子婴，烧秦宫室，收其货宝妇女而东。火从阿房宫点起，三月不灭——那火，把咸阳的天都烧红了。",
								"⟦韩生⟧来谏：“关中阻山河四塞，地肥饶，可都以霸——大王何不留？”你说：“富贵不归故乡，如衣绣夜行。”韩生退而叹曰：“人言楚人沐猴而冠耳，果然。”这话，传进了你的耳朵。"
							],
							"options": [
								{
									"t": "收宝货妇女而东",
									"hist": true,
									"res": "你烹了韩生，车载宝货东归，车队长达百里。关中的民心，和那把火一起烧成了灰。你坐在东归的车上，听着车轮碾过灰烬的声音——这一车一车拉回去的，是宝贝，也是骂名。",
									"eff": {
										"attrs": {
											"caifu": 15,
											"shengwang": -8,
											"junxin": -5
										},
										"dev": 0,
										"hist": -15
									},
									"to": "4-2"
								},
								{
									"t": "约法安民，择都关中",
									"res": "你按住了那把火，赦子婴，封府库，约法三章。秦民捧牛酒至军门，你一样不收。范增第一次露出了笑：得关中者，得天下。你站在咸阳城头——原来这座城，也有它自己的心。",
									"eff": {
										"attrs": {
											"caixue": 2,
											"caifu": 10,
											"shengwang": 8,
											"junxin": 8,
											"quanshi": 5
										},
										"dev": 12,
										"hist": 15
									},
									"to": "4-2"
								},
								{
									"t": "烧而不屠，火后徙都",
									"res": "宫室烧了，人留下了。咸阳的烟散了，骂声没散。你站在那片废墟前——有些火，点起来容易，灭下去难，它会在天下的嘴里，烧很多年。",
									"eff": {
										"attrs": {
											"caifu": 8,
											"shengwang": -3,
											"junxin": -3
										},
										"dev": 5,
										"hist": -5
									},
									"to": "4-2"
								},
								{
									"t": "事了拂衣，归老吴中",
									"res": "你把大王的印绶留在了彭城，只身回了吴中。多年后乡人问咸阳事，你说：火太大，看不见。你坐在吴中的河埠头，看着河水缓缓流——这天下，到底是你打下来的，还是它自己烧起来的，你分不清了。",
									"eff": { "dev": 8 },
									"to": { "ending": "E3" }
								}
							]
						},
						{
							"id": "4-2",
							"title": "分封十八王",
							"segs": ["你自立为西楚霸王，王九郡，都⟦彭城⟧。分封十八王：章邯为雍王，刘邦为汉王，故将、新贵、降臣各得一块——笔落的声音，像刀。", "至于那位牧羊出身的皇帝——尊为⟦义帝⟧，徙于长沙郴县。帝是要有的；帝在哪里，你说了算。江上的船载着他越走越远。"],
							"options": [
								{
									"t": "尊义帝以虚名，不加害",
									"res": "义帝老死于长沙。诸侯嘴上不说，心里都松了一口气——一个无害的神像，供着比砸了好。你收到长沙的消息时，正在看舆图——这一分人心，留着留着，说不定哪天，就抵得上一座城。",
									"eff": {
										"attrs": {
											"junxin": 8,
											"shengwang": 5
										},
										"dev": 5,
										"hist": 10
									},
									"to": "4-3"
								},
								{
									"t": "密令英布等杀之江中",
									"hist": true,
									"res": "密令下到九江。义帝沉于江。你说服自己：天下第一人，不容二主。可楚地的人心，从这一天开始漏风——日后刘邦讨你，檄文上第一条就是这个。你站在彭城的宫门前——这天下，终究不是刀说了算的。",
									"eff": {
										"attrs": {
											"shengwang": -12,
											"junxin": -8,
											"weiji": 8
										},
										"dev": 0,
										"flags": ["shiyidi"],
										"hist": -20,
										"merit": "分封",
										"ach": "bawang",
										"zg": 15
									},
									"to": "4-3"
								},
								{
									"t": "废为庶人，幽于彭城",
									"res": "你把皇帝关在自己眼皮底下，废为庶人。杀没有杀，尊没有尊——两头的好处都没占到，两头的骂名都占了。这世上最难的，是让一个神像，安安静静待在该待的地方。",
									"eff": {
										"attrs": {
											"junxin": -5,
											"shengwang": -5,
											"weiji": 5
										},
										"dev": 8,
										"merit": "分封",
										"ach": "bawang"
									},
									"to": "4-3"
								}
							]
						},
						{
							"id": "4-3",
							"title": "诸侯就国",
							"segs": ["十八王拜谢出城，各就封国。彭城的宫殿里，天下的地图挂在墙上——你的霸王业，达到顶点。", "顶点这种东西，往下看全是下坡。齐国的⟦田荣⟧，已经在磨刀了——他压根没得到封。汉中的刘邦烧绝栈道，做出老死汉中的样子——栈道的灰里，他的眼睛一直看着东方。"],
							"options": [
								{
									"t": "遣使镇抚，以恩结之",
									"res": "使者四出，金帛随行。诸侯谢恩的声音很齐，心思却各有各的齐。案头的谢表越堆越高，你的眉头越皱越紧——这满案的金帛谢表，买得到“谢”字，买不到“忠”字。",
									"eff": {
										"attrs": {
											"caifu": -5,
											"junxin": 5,
											"weiji": -3
										},
										"dev": 0
									},
									"to": "NEXT"
								},
								{
									"t": "陈兵示威，以威服之",
									"res": "你的军旗巡行诸侯之境，马蹄声从齐国一直响到淮南。臣服的声音更齐了——只是夜里，又多了几封密信。威这个东西，服的是人，服不了心——心不服，威就得一直举着。",
									"eff": {
										"attrs": {
											"wuli": 2,
											"quanshi": 5,
											"weiji": 5,
											"junxin": -3
										},
										"dev": 0
									},
									"to": "NEXT"
								},
								{
									"t": "以战功名实封赏诸将",
									"req": { "zhengji": 14 },
									"res": "你把巨鹿的功、彭城的绩一笔一笔摊在案上：谁先登，谁陷阵，谁绝甬道——按功行赏，按册授爵。受赏的诸将捧印出帐，腰杆挺得笔直。夜里磨刀的声音，少了好几把。原来人心这杆秤，公道两个字，就是最大的砝码。",
									"eff": {
										"attrs": {
											"junxin": 3,
											"shengwang": 2,
											"weiji": -2
										},
										"dev": 5,
										"zg": -8
									},
									"to": "NEXT"
								}
							]
						}
					]
				},
				{
					"id": "c5",
					"title": "第五章 ｜ 彭城与荥阳",
					"sub": "前 205—前 203",
					"age": 28,
					"summaryNotes": ["彭城那一战，三万人追着五十六万人杀。可你渐渐发现：仗越赢，朋友越少。", "范增走的那天，疽发背，死在路上。你失去的不是一个谋士，是最后一面镜子。"],
					"intro": ["分封不到半年，田荣反齐，自立为齐王。你北击田荣，烧其城郭，坑其降卒——齐人相聚而畔。火能烧掉城，烧不掉人心。", "就在你陷在齐地的泥淖里，刘邦出汉中，定三秦，合诸侯五十六万之众，端了你的彭城。你留诸将继续击齐，自引三万精骑日夜兼程回师。三万，对五十六万。"],
					"start": "5-1",
					"events": [
						{
							"id": "5-1",
							"title": "彭城三万",
							"segs": [
								"你留诸将击齐，自以三万精骑从鲁出胡陵，绕到萧县。天没亮，马蹄裹着布——三万人，静得像一阵风。",
								"晨击汉军，日中，大破——他们昨晚还在你的宫殿里饮酒高会。汉军走，你追。穀泗之水，一日不流；睢水之上，尸塞川原——五十六万，就这样碎在你手里。",
								"刘邦突围西走，只带数十骑——恰逢大风折木发屋，沙石昼晦，连天都替他挡了一阵。这是你最辉煌的一天，也是最危险的一天。"
							],
							"options": [{
								"t": "乘胜穷追，直取荥阳",
								"hist": true,
								"res": "你追汉王至荥阳，一路收复失地。可荥阳城下，汉军的阵脚扎住了——楚汉的战争，从此变成拉锯的磨盘。你勒马荥阳城下，看着城头那面汉旗——你追得越急，它扎得越深。",
								"eff": {
									"attrs": {
										"wuli": 4,
										"quanshi": 10,
										"shengwang": 10,
										"weiji": 5
									},
									"dev": 0,
									"merit": "彭城",
									"ach": "pengcheng"
								},
								"to": "5-2"
							}, {
								"t": "胜而不穷，收兵稳守",
								"res": "你收兵保彭城，先安后方。刘邦捡回一条命，也捡回了喘息的时间——你给磨盘松了扣，它日后再咬合，咬的就是你。这一停，停的是刀，也是势——势这东西，一停，就容易散。",
								"eff": {
									"attrs": {
										"moulue": 2,
										"weiji": -5,
										"shengwang": 3,
										"junxin": 3
									},
									"dev": 5
								},
								"to": "5-2"
							}]
						},
						{
							"id": "5-2",
							"title": "成皋相持",
							"segs": ["楚汉久相持于荥阳、成皋之间。汉军筑甬道连河，食⟦敖仓⟧之粟，兵精粮足。你的粮道却被⟦彭越⟧一年挠了七回——这位梁地的游击将军，像一根拔不掉的刺。", "⟦陈平⟧的反间书，悄悄送进了你的大营——上面写着范增的名字。送书的人，走得很稳。"],
							"options": [
								{
									"t": "捕风捉影，疏远范增",
									"hist": true,
									"res": "你夺了亚父的权。范增大怒：“天下事大定矣，君王自为之！”赐骨归乡，未至彭城，疽发背而死。你的镜子，碎了。亚父走的那天，你该亲自去送——这句话，你在心里，说了很多年。",
									"eff": {
										"attrs": {
											"caixue": -5,
											"junxin": -5,
											"weiji": 5
										},
										"dev": 0,
										"rmflags": ["fanzeng"],
										"hist": -15
									},
									"to": "5-3"
								},
								{
									"t": "察其诈，留范增不疑",
									"req": { "flag": "fanzeng" },
									"res": "你把反间书扔进火盆：“这种字，骗不了我。”火盆的光映在范增脸上。老人看了你很久，第一次叫了你的字：“籍。”——那一个字，比千军万马都重。这世上能叫你“籍”的人，越来越少了。",
									"eff": {
										"attrs": {
											"junxin": 5,
											"caixue": 3,
											"moulue": 2
										},
										"dev": 10,
										"hist": 10
									},
									"to": "5-3"
								},
								{
									"t": "明贬暗保，将计就计",
									"req": { "moulue": 55 },
									"res": "你佯怒逐范增，暗中使人护其归乡，反间之计就此落空。只是诸将看你们君臣失和，真假难辨，话也少了。你站在城头，看着范增的车驾远去——这一场戏，演给陈平看，也演给自己看。",
									"eff": {
										"attrs": {
											"moulue": 3,
											"weiji": 5,
											"junxin": -3
										},
										"dev": 8
									},
									"to": "5-3"
								}
							]
						},
						{
							"id": "5-3",
							"title": "鸿沟之约",
							"key": true,
							"segs": ["⟦韩信⟧已破赵齐，饮马潍水；彭越数反梁地，你的粮道越掐越细。兵少，食尽，城里的粟米一袋一袋见了底。", "汉王使⟦侯公⟧来说：中分天下，割⟦鸿沟⟧以西者为汉，鸿沟而东者为楚。作为诚意，汉王归你父母妻子——太公和吕雉回来的那天，军中欢声雷动。"],
							"options": [
								{
									"t": "许之，引兵东归",
									"hist": true,
									"res": "你引兵解而东归，士卒欢呼万岁。身后的汉王，已经在撕那份墨迹未干的约书——张良和陈平俯在他耳边：楚兵疲食尽，此天亡楚之时也。这满营的欢喜都是真的；可这天下，从来不信“约”字。",
									"eff": {
										"attrs": {
											"weiji": -5,
											"junxin": 3
										},
										"dev": 0,
										"ach": "honggou"
									},
									"to": "NEXT"
								},
								{
									"t": "不许，提兵再决胜负",
									"req": {
										"quanshi": 50,
										"caifu": 15
									},
									"res": "你撕了约书：天下只能有一个主人。父母妻子再入汉营，使者不敢回头看你。粮道的问题，你赌在冬前解决——赌的是你还没输过。有些仗，不是不想打，是不能不打——输赢，都得等刀落下来才知道。",
									"eff": {
										"attrs": {
											"weiji": 15,
											"junxin": -5
										},
										"dev": 15
									},
									"to": [
										{
											"if": {
												"flag": "fanzeng",
												"weijiMax": 59
											},
											"to": { "ending": "E5" }
										},
										{
											"if": {
												"caixue": 55,
												"weijiMax": 69
											},
											"to": { "ending": "E5" }
										},
										{ "to": "5-3b" }
									]
								},
								{
									"t": "许之，而暗增戒备",
									"res": "你签了约，也把斥候撒到了鸿沟两岸。汉王背约追来时，你的阵脚是齐的。盟约这种东西，你早学会只信一半。这条沟，画的不是楚汉的界，是人心里的界——界这种东西，早晚会被人迈过去。",
									"eff": {
										"attrs": {
											"moulue": 2,
											"weiji": -3,
											"caixue": 2
										},
										"dev": 8
									},
									"to": "NEXT"
								}
							]
						},
						{
							"id": "5-3b",
							"title": "成皋决胜",
							"segs": ["你再围成皋。这一回，敖仓的粮尽了，汉军的旌旗开始散乱——城头的炊烟一日薄过一日，夜里能听到城内杀马的声音。", "范增若在，他会说：就是现在。他不在了——这句话，只能你自己对自己说。你说了，声音在空帐里，落下来，没有回声。"],
							"options": [{
								"t": "总攻成皋，一鼓而下",
								"res": "成皋破，巩洛危。刘邦仓皇西窜，你却没有追——这一仗赢的是局面，不是终局。天下的秤，第一次真的倾向了楚。这一胜，若亚父还在，他会怎么说？可惜，这句话，你永远听不到了。",
								"eff": {
									"attrs": {
										"wuli": 4,
										"weiji": 15
									},
									"dev": 20
								},
								"to": [{
									"if": { "flag": "fanzeng" },
									"to": { "ending": "E5" }
								}, { "to": { "ending": "E4" } }]
							}]
						}
					]
				},
				{
					"id": "c6",
					"title": "第六章 ｜ 垓下·乌江",
					"sub": "前 202 · 历史节点 · 全剧本枢纽",
					"age": 30,
					"summaryNotes": ["史书行到此处，只剩最后一页。垓下的歌，东城的雪，乌江的水，都在这一页里。"],
					"intro": ["汉王背约，追你至固陵。你反击，大破之——可这一次，韩信来了，彭越也来了，英布也来了。该赢的仗，你全赢了；该来的援兵，一个没来。你退入⟦垓下⟧，筑壁而守。", "兵少，食尽。汉军及诸侯兵围之数重——三十万之众，对你不足十万的残兵。夜里，你听清了那四面歌声是什么——楚歌，是你的楚人，在敌人的阵里唱你的乡音。"],
					"node": "N3",
					"start": "6-1",
					"events": [
						{
							"id": "6-1",
							"title": "垓下楚歌",
							"segs": [
								"夜闻汉军四面皆楚歌。你大惊：“汉皆已得楚乎？是何楚人之多也！”你披衣出帐，歌声像潮水，漫过整座营盘。",
								"你夜起饮帐中。有美人名虞，常幸从；有骏马名骓，常骑之。悲歌慷慨，你自为诗：“力拔山兮气盖世，时不利兮⟦乌骓⟧不逝。骓不逝兮可奈何，虞兮虞兮奈若何！”歌数阕，⟦虞姬⟧和之。左右皆泣，莫能仰视。",
								"歌罢，你点起八百精骑，溃围南出。"
							],
							"options": [{
								"t": "溃围南出，直取东城",
								"hist": true,
								"res": "夜色的口子撕开又合上。八百骑衔枚疾走，汉军的营垒在两侧退成黑影。出围时，八百人跟住了你。你回头看了一眼那座正在远去的营盘——那座帐里，还亮着一盏灯；灯下的人，你看不见了。",
								"eff": {
									"attrs": {
										"wuli": 3,
										"tupo": -2,
										"weiji": 10
									},
									"dev": 0,
									"flags": ["yu"],
									"ach": "gai"
								},
								"to": "6-2"
							}, {
								"t": "遣骑四散，自领疑兵",
								"res": "你分兵四队，汉军不知你在哪一路，追兵也散了四份。出围时，身边的骑少了一半——散出去的那些人，替你挡了刀，也替你散了。有些路，一个人走是勇，一群人走是命。",
								"eff": {
									"attrs": {
										"moulue": 2,
										"weiji": -5,
										"caixue": 3,
										"quanshi": -5
									},
									"dev": 5
								},
								"to": "6-2"
							}]
						},
						{
							"id": "6-2",
							"title": "阴陵迷道",
							"segs": [
								"渡淮，骑能属者百馀人耳。到⟦阴陵⟧，天色未明，道旁的树影都像一个样。",
								"迷失道。你问一田父，田父绐曰：“左。”——他说话时，眼睛没有看你，看的是地。左，乃陷大泽中。泥沼没到马腹，马蹄拔起来的声音，一声比一声沉。",
								"汉军追骑的烟尘，已经在身后了。"
							],
							"options": [{
								"t": "弃马步涉，夺路而东",
								"hist": true,
								"res": "你弃马涉水，残骑相随出泽。回望大泽，雾还没有散。这一陷，丢了半日光阴——和最后的生机。你站在泽边，水从甲上滴下来——那田父指的路，是别人的路；从今夜起，你自己的路，得自己找了。",
								"eff": {
									"attrs": {
										"tupo": -2,
										"weiji": 10,
										"caifu": -5
									},
									"dev": 0
								},
								"to": "6-3"
							}, {
								"t": "就地结阵，背泽一战",
								"res": "你勒兵回阵，百骑列于泽畔。大泽挡了你的马，也挡了汉军的马——骑兵对冲变成步战，你们最不怕的就是步战。你握着枪，看着汉军的烟尘越来越近——这大泽，今夜就是你们的坟；坟就坟，也要站着埋。",
								"eff": {
									"attrs": {
										"wuli": 3,
										"weiji": 15,
										"shengwang": 5
									},
									"dev": 8
								},
								"to": [{
									"if": {
										"caixue": 50,
										"weijiMax": 79
									},
									"to": "6-3"
								}, { "to": {
									"ending": "E8",
									"variant": "yinling"
								} }]
							}]
						},
						{
							"id": "6-3",
							"title": "东城二十八骑",
							"segs": [
								"至东城，乃有二十八骑。汉骑追者数千人，扬尘蔽日。你勒马回身，看这二十八个人——他们也在看你，眼里没有怕。",
								"“吾起兵至今八岁矣，身七十馀战，所当者破，所击者服，未尝败北——然今卒困于此，此天之亡我，非战之罪也。”“今日固决死，愿为诸君快战：必三胜之，为诸君溃围、斩将、刈旗。”",
								"二十八骑四面分驰，山东的高处，你约他们三处会合。"
							],
							"options": [{
								"t": "分骑四向，斩将刈旗",
								"hist": true,
								"res": "四队四向，如约三胜。汉军披靡，你大呼驰下，斩一都尉，杀数十百人。复聚其骑，亡其两骑耳。“何如？”骑皆伏曰：“如大王言。”这句话，你说了一辈子，今夜，是最后一次说了——天亡我，非战之罪，你得让他们信。",
								"eff": {
									"attrs": {
										"wuli": 4,
										"shengwang": 8,
										"weiji": 10
									},
									"dev": 0,
									"ach": "dongcheng"
								},
								"to": "6-4"
							}, {
								"t": "并力一路，直插乌江",
								"res": "你不再恋战，二十六骑卷作一股，直冲渡口。汉军的包围在你身后裂开又合拢，像被船头劈开的浪。你伏在马背上——乌江的渡口，就在前面了；过了江，是生；过不去，是命。",
								"eff": {
									"attrs": {
										"wuli": 2,
										"weiji": -5,
										"caixue": 2
									},
									"dev": 5
								},
								"to": "6-4"
							}]
						},
						{
							"id": "6-4",
							"title": "乌江",
							"key": true,
							"segs": [
								"至⟦乌江⟧，亭长檥船待。江水滔滔，对岸就是⟦江东⟧——你二十四岁起兵的地方。亭长曰：“江东虽小，地方千里，众数十万人，亦足王也。愿大王急渡。今独臣有船，汉军至，无以渡。”",
								"你望着那叶扁舟，身后是八千子弟没有一个人回来的方向。“且籍与江东子弟八千人渡江而西，今无一人还——纵江东父兄怜而王我，我何面目见之？纵彼不言，籍独不愧于心乎？”",
								"追兵的尘头，在地平线上越来越粗。"
							],
							"options": [
								{
									"t": "笑曰：“天之亡我，我何渡为！”",
									"hist": true,
									"res": "你把⟦乌骓⟧送给了亭长，持短兵步战，独杀汉军数百人，身被十馀创。看见故人⟦吕马童⟧，你笑了：汉购我头千金，邑万户——“吾为若德。”遂自刎，年三十一。这条路，从吴中走到乌江，走了整整八年；今夜，总算走完了。",
									"eff": {
										"attrs": {
											"wuli": 4,
											"shengwang": 10
										},
										"dev": 0,
										"hist": 20
									},
									"to": { "ending": "E1" }
								},
								{
									"t": "受亭长之檥，渡江再砺",
									"res": "你上了船。桨声一起，北岸的烟尘还在追，南岸的灯火已经在等你了。亭长摇橹的手很稳，一句也没多问。你站在船头，看着南岸的灯火一盏一盏亮起来——八千子弟，没有一个回来；回来的人，凭什么是我？",
									"eff": {
										"attrs": { "weiji": -10 },
										"dev": 40
									},
									"to": [
										{
											"if": {
												"shengwang": 50,
												"notflag": "shiyidi",
												"devMin": 46
											},
											"to": { "ending": "E6" }
										},
										{
											"if": {
												"shengwang": 40,
												"devMin": 46
											},
											"to": { "ending": "E6" }
										},
										{ "to": { "ending": "E8" } }
									]
								},
								{
									"t": "回身再战，死不旋踵",
									"res": "你把最后一口气，也留在了北岸。二十八骑一个没退。你回身迎着汉军冲过去，身后没有人喊你——你知道，他们都会跟上来。这一冲，冲的不是生路，是“霸王”两个字最后的分量。",
									"eff": {
										"attrs": {
											"wuli": 3,
											"weiji": 20,
											"shengwang": 5
										},
										"dev": 10,
										"hist": 10
									},
									"to": { "ending": "E1" }
								},
								{
									"t": "怀人望而渡，江东父老犹附",
									"req": { "junxin": 45 },
									"res": "你望着那叶扁舟，想起的却不是八千张脸——是新安城外没有堆起的冤骨，是江上没有沉下的帝王。人望这个东西，你攒了半生。“渡。”你说。南岸的灯火一盏一盏亮起来——这一渡，渡的不是江，是下半生；下半生，从还债开始。",
									"eff": {
										"attrs": {
											"weiji": -10,
											"junxin": 3
										},
										"dev": 40
									},
									"to": [
										{
											"if": {
												"flag": "kengzu",
												"shengwang": 40,
												"devMin": 46
											},
											"to": { "ending": "E6" }
										},
										{
											"if": {
												"shengwang": 50,
												"notflag": "shiyidi",
												"devMin": 46
											},
											"to": {
												"ending": "E6",
												"variant": "renwang"
											}
										},
										{
											"if": {
												"shengwang": 40,
												"devMin": 46
											},
											"to": {
												"ending": "E6",
												"variant": "renwang"
											}
										},
										{ "to": { "ending": "E8" } }
									]
								}
							]
						}
					]
				}
			],
			"CORRECTIONS": [
				{
					"minDev": 21,
					"maxDev": 45,
					"chance": .3,
					"title": "修正 ｜ 营中歌谣",
					"segs": [
						"【历史修正】营里有人唱楚地的旧谣，唱着唱着就骂起了分封。",
						"查歌的校尉回来复命，你摆了摆手：唱罢。楚人的歌，堵不住的。",
						"你改动的那几颗印绶，动的是人心。"
					],
					"eff": {
						"attrs": { "shengwang": -5 },
						"dev": 0
					}
				},
				{
					"minDev": 21,
					"maxDev": 45,
					"chance": .3,
					"title": "修正 ｜ 粮道被抄",
					"segs": [
						"【历史修正】⟦彭越⟧的游兵又抄了你一支粮队。斥候追出三十里，只看到火光。",
						"粮官跪在帐外请罪。你让他起来——罪不在他，在梁地那一汪总也舀不干的水。",
						"你改动的每一步，都有人在暗处记账。"
					],
					"eff": {
						"attrs": {
							"caifu": -5,
							"weiji": 3
						},
						"dev": 0
					}
				},
				{
					"minDev": 21,
					"maxDev": 45,
					"chance": .3,
					"title": "修正 ｜ 旧部辞行",
					"segs": [
						"【历史修正】一名吴中旧部来辞行：“大王非复吴中之大王矣。”",
						"你赐了他金，他没收；你问他去哪里，他说回乡。",
						"你改道的每一步，旧日同袍都在重新打量你。"
					],
					"eff": {
						"attrs": {
							"shengwang": -4,
							"weiji": 2
						},
						"dev": 0
					}
				},
				{
					"minDev": 46,
					"maxDev": 70,
					"chance": 1,
					"title": "修正 ｜ 诸侯连叛",
					"segs": [
						"【历史修正】又有两国相率而叛，使者相望于道——不是来朝，是约叛。",
						"舆图上，红色的旗一天多过一天。你按图看了半夜，看不出哪里是自己人。",
						"你改动的分封格局，正在以叛离的方式自我修正。"
					],
					"eff": {
						"attrs": {
							"weiji": 12,
							"junxin": -5
						},
						"dev": 0
					}
				},
				{
					"minDev": 46,
					"maxDev": 70,
					"chance": 1,
					"title": "修正 ｜ 反间复来",
					"segs": [
						"【历史修正】⟦陈平⟧的第二批反间书到了，这次写得有鼻子有眼。",
						"连龙且都拐弯抹角来问你：那信上说的，是真是假？",
						"你改动的人事越多，能编进谣言里的名字就越多。"
					],
					"eff": {
						"attrs": {
							"weiji": 10,
							"junxin": -6
						},
						"dev": 0
					}
				},
				{
					"minDev": 46,
					"maxDev": 70,
					"chance": 1,
					"title": "修正 ｜ 旧敌寻衅",
					"segs": [
						"【历史修正】⟦韩信⟧遣使问罪于楚，措辞一次比一次硬。东线的压力，开始成形。",
						"来使昂首立于阶下，礼数不缺，骨头很直。",
						"你记得这个钻裤裆的淮阴少年。如今他的使节，敢在你的殿上直着腰说话。"
					],
					"eff": {
						"attrs": {
							"weiji": 10,
							"quanshi": -4
						},
						"dev": 0
					}
				},
				{
					"minDev": 71,
					"maxDev": 100,
					"chance": 1,
					"title": "修正 ｜ 天命反噬",
					"segs": [
						"【历史修正】你改得太多：叛书、流言、密约从四面压向彭城——历史在用所有人的手，把你推回乌江。",
						"夜里你做了个梦：安阳的帐，新安的土，鸿门的剑。醒来一身冷汗。",
						"天数这个东西，你从来不信。可它信你。"
					],
					"eff": {
						"attrs": {
							"weiji": 18,
							"junxin": -8
						},
						"dev": 0
					}
				},
				{
					"minDev": 71,
					"maxDev": 100,
					"chance": 1,
					"title": "修正 ｜ 楚歌先起",
					"segs": [
						"【历史修正】营外的汉军忽然唱起了楚歌。比垓下早了很多——但你知道，这歌迟早要来的。",
						"士卒们停下手里的事，静静地听。没有人说话，火堆哔剥作响。",
						"你按剑巡营，走过之处，歌声矮下去，又升起来。"
					],
					"eff": {
						"attrs": {
							"weiji": 15,
							"shengwang": -8
						},
						"dev": 0
					}
				},
				{
					"minDev": 71,
					"maxDev": 100,
					"chance": 1,
					"title": "修正 ｜ 江东来信",
					"segs": [
						"【历史修正】江东有变：吴中旧族各据乡曲，已不复听彭城号令。",
						"信是族中长辈写的，措辞很客气，意思很硬。",
						"你改动的历史越大，回头的路就越窄。"
					],
					"eff": {
						"attrs": {
							"weiji": 14,
							"caifu": -8
						},
						"dev": 0
					}
				}
			],
			"ACHIEVEMENTS": {
				"wanrendi": "万人敌",
				"yafu": "亚父",
				"zidii": "八千子弟",
				"duojun": "安阳夺军",
				"pofu": "破釜沉舟",
				"julu": "巨鹿",
				"hongmen": "鸿门宴",
				"bawang": "西楚霸王",
				"pengcheng": "彭城三万",
				"honggou": "鸿沟之约",
				"dongcheng": "东城二十八骑",
				"gai": "力拔山兮",
				"wujiang": "乌江",
				"shiwodai": "时不我待"
			},
			"KEY_NODE_NAMES": {
				"2-1": "安阳夺军",
				"3-1": "新安之夜",
				"3-3": "鸿门宴",
				"5-3": "鸿沟之约",
				"6-4": "乌江"
			},
			"RANDOM_EVENTS": [
				{
					"id": "R-1",
					"title": "乌骓食槽",
					"chapters": [0, 6],
					"segs": ["马夫来报：⟦乌骓⟧这几日不肯就槽，见了生人就扬鬃，喂料的奴仆被撂倒了两个。你走过去——它安静了。马夫小声说：这马认人。"],
					"options": [{
						"t": "亲自喂它",
						"res": "乌骓就着你的手吃完了一槽料，吃完还蹭了蹭你的肩。好马认人，人也该认马。",
						"eff": {
							"attrs": { "weiji": -2 },
							"dev": 0
						},
						"to": "RETURN"
					}, {
						"t": "命人加料",
						"res": "料加了，马瘦了。畜生的心思，不是料能哄的。",
						"eff": {
							"attrs": { "caifu": -2 },
							"dev": 0
						},
						"to": "RETURN"
					}]
				},
				{
					"id": "R-2",
					"title": "吴中旧部",
					"chapters": [1, 4],
					"segs": ["一名会稽旧部求见：当年渡江的八千子弟，如今老的老、伤的伤——兄弟们不求赏，想回家看看。帐外，几十个老兵站得笔直。"],
					"options": [{
						"t": "厚赐遣归",
						"res": "老兵磕头时，营中吴中籍的士卒都红了眼眶。第二天，请归的名册又厚了一叠，你一一批了。",
						"eff": {
							"attrs": {
								"caifu": -4,
								"shengwang": 3
							},
							"dev": 0
						},
						"to": "RETURN"
					}, {
						"t": "不准所请",
						"res": "老兵没说什么，第二天就不见了。军法上这叫逃，你没有下令去追。",
						"eff": {
							"attrs": {
								"shengwang": -3,
								"weiji": 2
							},
							"dev": 0
						},
						"to": "RETURN"
					}]
				},
				{
					"id": "R-3",
					"title": "范增弈棋",
					"chapters": [1, 6],
					"cond": { "flag": "fanzeng" },
					"segs": ["亚父召你弈棋。落子到一半，他忽然说：棋如用兵，亦如用人——大王可知错在何处？老人的手停在半空，等着。"],
					"options": [{
						"t": "虚心请教",
						"res": "一局终了，他替你复盘的不只是棋。棋到收官，你忽然明白他今晚真正要教的是什么。",
						"eff": {
							"attrs": {
								"caixue": 3,
								"junxin": 2
							},
							"dev": 0
						},
						"to": "RETURN"
					}, {
						"t": "笑顾而言他",
						"res": "范增笑了笑，把棋子收回匣中，棋子相碰，一声一声很清楚。有些话，只说给想听的人。",
						"eff": {
							"attrs": { "weiji": -1 },
							"dev": 0
						},
						"to": "RETURN"
					}]
				},
				{
					"id": "R-4",
					"title": "猎于郊野",
					"chapters": [0, 5],
					"segs": ["秋高气爽，诸将约你出猎。斥候报：三十里内无敌踪。营门的号角吹了三声，猎犬已经按捺不住。"],
					"options": [{
						"t": "欣然同猎",
						"res": "一日三获，诸将皆呼万岁。弓马是放松了，弦也松了些——回营时，你多看了两眼辕门的哨。",
						"eff": {
							"attrs": {
								"weiji": -3,
								"shengwang": 2
							},
							"dev": 0
						},
						"to": "RETURN"
					}, {
						"t": "以军务辞",
						"res": "你把猎期往后推了推。诸将扫兴而去，斥候却带回了好消息——你赌对了这一晚。",
						"eff": {
							"attrs": { "caixue": 2 },
							"dev": 0
						},
						"to": "RETURN"
					}]
				},
				{
					"id": "R-5",
					"title": "诸侯来朝",
					"chapters": [4, 6],
					"cond": { "quanshi": 40 },
					"segs": ["两位诸侯王亲自来彭城朝见，献礼甚厚，礼单长得念了一刻钟。殿上的礼数越足，你越想笑。"],
					"options": [{
						"t": "加厚赐以结之",
						"res": "厚赏下去，两位诸侯感恩而退，出门时脚步都轻了。今年的盟约，又稳了一分——也就一分。",
						"eff": {
							"attrs": {
								"caifu": -6,
								"junxin": 4
							},
							"dev": 0
						},
						"to": "RETURN"
					}, {
						"t": "以威仪慑之",
						"res": "你让他们在殿下站了一个时辰，一言不发。出去时，两位的后背都是湿的，礼数更恭了，话也更少了。",
						"eff": {
							"attrs": {
								"quanshi": 3,
								"junxin": -3,
								"weiji": 3
							},
							"dev": 0
						},
						"to": "RETURN"
					}]
				},
				{
					"id": "R-6",
					"title": "伤兵归乡",
					"chapters": [1, 6],
					"segs": ["一批重伤难愈的士卒请归乡里——断臂的，跛足的，瞎了一只眼的。军中法：伤残者汰。军吏捧着名册等你画押。"],
					"options": [{
						"t": "给足遣资，遣医随行",
						"res": "伤兵叩首离去，遣资比法定的多了一倍。军中都说：跟着大王，残了也有着落。",
						"eff": {
							"attrs": {
								"caifu": -4,
								"shengwang": 3
							},
							"dev": 0
						},
						"to": "RETURN"
					}, {
						"t": "按法汰之",
						"res": "法就是法。名册画了押，遣资按旧例发。只是那天夜里，营里的歌声低了几分。",
						"eff": {
							"attrs": {
								"caifu": -2,
								"shengwang": -3
							},
							"dev": 0
						},
						"to": "RETURN"
					}]
				},
				{
					"id": "R-7",
					"title": "英布献俘",
					"chapters": [3, 5],
					"segs": ["⟦英布⟧遣人献俘数百，附言：愿为大王前驱。俘虏押到辕门，来使的腰弯得恰到好处——这个九江王的殷勤，总是恰到好处地多一分。"],
					"options": [
						{
							"t": "受其俘，厚赏来使",
							"res": "来使归报，英布愈发恭顺，捷报和贡品流水一样往彭城送。这种人，可用，不可信。",
							"eff": {
								"attrs": {
									"quanshi": 3,
									"weiji": 3
								},
								"dev": 0
							},
							"to": "RETURN"
						},
						{
							"t": "却而不受",
							"res": "俘虏原路退回，你回了八个字：善守其境，毋烦多献。英布的来使走时，眼神深了深。",
							"eff": {
								"attrs": {
									"shengwang": 3,
									"weiji": 2
								},
								"dev": 0
							},
							"to": "RETURN"
						},
						{
							"t": "令其阵前试锋，观其所用",
							"req": { "quanshi": 45 },
							"res": "英布军一冲而陷阵，锋锐不减当年。你看得分明：此人可用为锋，不可托为背。",
							"eff": {
								"attrs": {
									"quanshi": 5,
									"caixue": 2
								},
								"dev": 0
							},
							"to": "RETURN"
						}
					]
				},
				{
					"id": "R-8",
					"title": "楚人献粮",
					"chapters": [4, 6],
					"segs": ["彭城父老结队送粮至营，牛车排了半里。老者拄杖在前：楚兵护楚，理所当然。粮袋上印着各乡各里的字号，最旧的一只，还是项梁时的旧物。"],
					"options": [{
						"t": "拜受而倍偿其值",
						"res": "父老们推辞不过，收了钱，逢人便夸。第二个月，送粮的车队又长了半里。",
						"eff": {
							"attrs": {
								"caifu": -4,
								"shengwang": 4
							},
							"dev": 0
						},
						"to": "RETURN"
					}, {
						"t": "拜受，书券为凭",
						"res": "你写下借券，言明战后倍偿，按了霸王之印。老者把券供了起来，逢人便展。",
						"eff": {
							"attrs": { "shengwang": 3 },
							"dev": 0
						},
						"to": "RETURN"
					}]
				},
				{
					"id": "R-9",
					"title": "反间流言",
					"chapters": [4, 6],
					"cond": { "weiji": 40 },
					"segs": ["营中忽有流言：某某通汉，其辞凿凿，连年月日都编齐了。诸将请你彻查，被点到名字的将领跪在帐外——风是从敌营那边吹过来的。"],
					"options": [{
						"t": "按下不查",
						"res": "你只回了四个字：我信得过。流言三日自息，跪着的将领起身时，眼圈是红的。",
						"eff": {
							"attrs": {
								"weiji": -3,
								"junxin": 2
							},
							"dev": 0
						},
						"to": "RETURN"
					}, {
						"t": "明令彻查",
						"res": "查了十日，一无所获——人心却查散了一层。倒是编流言的人，在汉营那边记了一功。",
						"eff": {
							"attrs": {
								"weiji": 5,
								"junxin": -3
							},
							"dev": 0
						},
						"to": "RETURN"
					}]
				},
				{
					"id": "R-10",
					"title": "虞姬夜话",
					"chapters": [3, 6],
					"segs": ["夜里，⟦虞姬⟧为你添衣。她不问军情，只问：大王的眉头，几时能展？你望着她——这个问题，比军情难答。"],
					"options": [{
						"t": "与她说说心里话",
						"res": "有些话说出口，才知道自己有多累。她听完没劝，只是把灯拨亮了一些。",
						"eff": {
							"attrs": { "weiji": -3 },
							"dev": 0
						},
						"to": "RETURN"
					}, {
						"t": "笑而不答",
						"res": "你替她拢了拢被角。她也不追问，只陪你坐着，坐到灯尽。",
						"eff": {
							"attrs": { "weiji": -1 },
							"dev": 0
						},
						"to": "RETURN"
					}]
				},
				{
					"id": "R-11",
					"title": "斥候急报",
					"chapters": [2, 6],
					"segs": ["斥候连夜来报：北面有兵马异动，旗号不明。中军连夜戒严，火把整个大营照成白昼。你披衣而起，先看了一眼舆图。"],
					"options": [{
						"t": "亲率轻骑往探",
						"res": "虚惊一场，是迁民的流人，老弱三千，推车抱子。你安抚了他们，又得一邑之心。",
						"eff": {
							"attrs": {
								"weiji": -2,
								"shengwang": 2
							},
							"dev": 0
						},
						"to": "RETURN"
					}, {
						"t": "遣偏将查之",
						"res": "偏将回报：流民三千。你拨了粮，也拨了人盯着——乱世的善意，都得留一手。",
						"eff": {
							"attrs": { "caifu": -3 },
							"dev": 0
						},
						"to": "RETURN"
					}]
				},
				{
					"id": "R-12",
					"title": "乌江亭长",
					"chapters": [6, 6],
					"segs": ["乌江亭长提前泊船在渡口，日日擦拭那叶扁舟。他说：江上风大，船总要备好的。你问他备船做什么——他笑笑，不答，又去擦船了。"],
					"options": [{
						"t": "谢其好意",
						"res": "你望着那叶扁舟，忽然想起了八千张脸。江水不语，向东流去。",
						"eff": {
							"attrs": { "weiji": -2 },
							"dev": 0
						},
						"to": "RETURN"
					}, {
						"t": "挥之使去",
						"res": "亭长欲言又止，把船又泊回了原处。船缆收得很慢，像在等什么。",
						"eff": { "dev": 0 },
						"to": "RETURN"
					}]
				}
			],
			"CRISIS_EVENTS": {
				"plots": [
					{
						"id": "C-1",
						"title": "诸侯叛讯",
						"segs": [
							"一夜三报：淮南、临江、九江，各执兵戈，辞以“讨逆”。",
							"预兆早有——上月会盟，三王的使者都只派了副使来，贺表写得一次比一次短。",
							"舆图上三面同时变色。你改动的人事，正在以叛离的形式自我清算。"
						],
						"options": [{
							"t": "亲征其一，慑服其余",
							"res": "你亲提三万南下，一战而下淮南，枭其叛将于市。其余两国，连夜上书谢罪——只是谢表的字缝里都透着算计。",
							"eff": {
								"attrs": {
									"weiji": -8,
									"quanshi": 3,
									"caifu": -5
								},
								"dev": 0
							},
							"to": "RETURN"
						}, {
							"t": "遣使责问",
							"res": "使者被逐了两回，第三回干脆没让进城。叛者没有倒戈，观望者先学会了报价。",
							"eff": {
								"attrs": { "weiji": 6 },
								"dev": 0
							},
							"to": "RETURN"
						}]
					},
					{
						"id": "C-2",
						"title": "反间之信",
						"segs": [
							"截获汉使细作一名，行囊中有给你的\"亲启书\"——措辞亲昵得可疑。",
							"细作咬舌之前笑了：书不止这一封。",
							"若此书公开，你与范增之间，就再也说不清了。"
						],
						"options": [{
							"t": "当众焚书，并召范增共观",
							"res": "火盆支在大帐正中，书简烧得噼啪作响。范增看着火盆，长出一口气——反间者的钱，白花了。",
							"eff": {
								"attrs": {
									"weiji": -6,
									"junxin": 3
								},
								"dev": 0
							},
							"to": "RETURN"
						}, {
							"t": "压下不表",
							"res": "你把书压进了箱底，钥匙贴身收着。夜里想了很久——想的人多了，事就变了味。",
							"eff": {
								"attrs": { "weiji": 5 },
								"dev": 0
							},
							"to": "RETURN"
						}]
					},
					{
						"id": "C-3",
						"title": "粮道断绝",
						"segs": [
							"⟦彭越⟧的游兵连日掐你的粮道，前锋各营已经开始减餐。",
							"军中开始有人私下宰杀战马。马夫抱着马脖子哭，军吏别过脸去。",
							"粮仓的簿子，一页一页翻到了底。"
						],
						"options": [{
							"t": "亲督护粮，剿抚兼施",
							"res": "你亲率精骑护了三趟，斩彭越裨将一人。粮道通了，马也保住了——可你知道，他还会回来。",
							"eff": {
								"attrs": {
									"weiji": -6,
									"quanshi": 2
								},
								"dev": 0
							},
							"to": "RETURN"
						}, {
							"t": "就地征发",
							"res": "粮是征来了，彭城周边的百姓，看楚军的眼神却变了。下次送粮的队伍里，不会有他们了。",
							"eff": {
								"attrs": {
									"caifu": 6,
									"shengwang": -5,
									"weiji": 4
								},
								"dev": 0
							},
							"to": "RETURN"
						}]
					}
				],
				"death": {
					"id": "C-DEATH",
					"title": "杀机已至",
					"segs": [
						"诸侯联军合围彭城，汉军的赤帜已经能看见。你的亲兵在清点最后的车马。",
						"⟦乌骓⟧在槽边不安地刨着地——它比你先感觉到了。",
						"城墙下的尸体来不及收，乌鸦盘旋了三天。",
						"你还有最后一次挣扎的机会。"
					],
					"options": [
						{
							"t": "尽散府库，收拢溃军",
							"req": { "caifu": 30 },
							"res": "府库一空，溃军复聚。老兵们说：跟着这样的大王，饿肚子也认。彭城守住了——这一次。",
							"eff": {
								"attrs": {
									"caifu": -30,
									"weiji": -25
								},
								"dev": 0
							},
							"to": "RETURN"
						},
						{
							"t": "亲犯矢石，决死突围",
							"req": { "caixue": 60 },
							"res": "你亲持画戟开路，三军随之，一日七战。围是突出来了，血也流够了。",
							"eff": {
								"attrs": {
									"weiji": -15,
									"shengwang": -5
								},
								"dev": 0
							},
							"to": "RETURN"
						},
						{
							"t": "困守孤城",
							"res": "你闭上眼，听城外的楚歌。歌声一浪一浪，拍在城墙上。",
							"eff": {
								"attrs": { "weiji": 15 },
								"dev": 0
							},
							"to": "RETURN"
						}
					]
				}
			},
			"ACTIONS": [
				{
					"desc": "亲赴校场，以武统军（权势≥20 三军方服）",
					"res": "三场演武，三军心服。老兵们收队时还在比划你的枪路：跟着大王，死也值。",
					"eff": {
						"dev": 0,
						"attrs": {
							"wuli": 2,
							"quanshi": 2,
							"weiji": 2,
							"shengwang": 1
						}
					},
					"id": "XY-ACT-1",
					"name": "校场演武",
					"descHidden": "亲赴校场，以武统军（威权既立，三军方服）",
					"req": { "quanshi": 20 },
					"chapters": [0, 6],
					"type": "进取"
				},
				{
					"desc": "置酒结客（财富-8）",
					"res": "一场大宴，宾主尽欢。散场时月色正好，府里多了几个肯替你说话的人。",
					"eff": {
						"dev": 0,
						"attrs": {
							"junxin": 1,
							"caifu": -8,
							"biancai": 1,
							"shengwang": 3
						}
					},
					"id": "XY-ACT-2",
					"name": "置酒高会",
					"descHidden": "置酒结客（所费不赀）",
					"req": { "caifu": 8 },
					"chapters": [0, 6],
					"type": "兑换"
				},
				{
					"desc": "趋府问安，以固人心（需起兵）",
					"res": "你在阶下站了半个时辰，换来三句寒暄。值不值，看你怎么算。",
					"eff": {
						"dev": 0,
						"attrs": {
							"weiji": 2,
							"junxin": 3
						}
					},
					"id": "XY-ACT-3",
					"name": "入朝问安",
					"descHidden": "趋府问安，以固人心（需起兵）",
					"req": { "minChapter": 1 },
					"chapters": [0, 6],
					"type": "进取"
				},
				{
					"desc": "谢客静修，温习阵图",
					"res": "门一关，阵图铺了满案，烛火换了两支。这一夜，你的兵又精了一分。",
					"id": "XY-ACT-4",
					"name": "闭门读阵",
					"eff": {
						"dev": 0,
						"attrs": {
							"tupo": -1,
							"weiji": -1,
							"caixue": 2,
							"moulue": 1
						}
					},
					"descHidden": "谢客静修，温习阵图",
					"chapters": [0, 6],
					"type": "守成"
				},
				{
					"desc": "厚币招贤（财富-8）",
					"res": "千金散尽，门下多了几十张嘴。也多了几十双替你看路的眼睛。",
					"eff": {
						"dev": 0,
						"attrs": {
							"caifu": -8,
							"weiji": -4,
							"shengwang": 2
						}
					},
					"id": "XY-ACT-5",
					"name": "散财养士",
					"descHidden": "厚币招贤（倾囊市义）",
					"req": { "caifu": 8 },
					"chapters": [0, 6],
					"type": "保身"
				},
				{
					"desc": "闭门称病，避人锋芒（需起兵）",
					"res": "病假条递上去，麻烦少了一半。探病的人来了几拨，真假难辨。",
					"eff": {
						"dev": 0,
						"attrs": {
							"tupo": 1,
							"weiji": -5,
							"junxin": -2,
							"quanshi": -3
						}
					},
					"id": "XY-ACT-6",
					"name": "称病蛰伏",
					"descHidden": "闭门称病，避人锋芒（需起兵）",
					"req": { "minChapter": 1 },
					"chapters": [0, 6],
					"type": "保身"
				},
				{
					"desc": "校场锻体，砺筋骨于未衰",
					"res": "亲赴校场，不较胜负，只较筋骨。石锁举起又放下三百回，汗透重衣——武已封顶，体犹可砺。士卒围观，喝彩声一浪高过一浪。",
					"id": "XY-ACT-49",
					"name": "演武锻体",
					"eff": {
						"dev": 0,
						"attrs": {
							"tupo": 3,
							"weiji": 1,
							"shengwang": 1
						}
					},
					"descHidden": "校场锻体，砺筋骨于未衰",
					"chapters": [0, 6],
					"type": "守成"
				},
				{
					"desc": "闭帐调息，养精神于鞍马之余",
					"res": "闭帐半日，吐纳调息。连年鞍马攒下的乏，一寸一寸化开。出帐时天色正好，脚步比进帐时轻了三分。",
					"id": "XY-ACT-50",
					"name": "调息养力",
					"eff": {
						"dev": 0,
						"attrs": {
							"tupo": 2,
							"weiji": -1
						}
					},
					"descHidden": "闭帐调息，养精神于鞍马之余",
					"chapters": [0, 6],
					"type": "守成"
				},
				{
					"desc": "举鼎于市，以力服众",
					"res": "千斤之鼎过顶，满市皆呼，鼎足下的青砖裂了两块。吴中的少年，自此不敢与你比肩。",
					"id": "XY-ACT-7",
					"name": "举鼎立威",
					"eff": {
						"dev": 0,
						"attrs": {
							"wuli": 2,
							"weiji": 2,
							"shengwang": 3
						}
					},
					"descHidden": "举鼎于市，以力服众",
					"chapters": [0, 0],
					"type": "进取"
				},
				{
					"desc": "教里中儿剑，以技易粟",
					"res": "束脩不多，够吃半月。孩子们练得起劲，你看得也起劲。",
					"id": "XY-ACT-8",
					"name": "教授剑术",
					"eff": {
						"dev": 0,
						"attrs": {
							"wuli": 1,
							"caifu": 3,
							"weiji": 2
						}
					},
					"descHidden": "教里中儿剑，以技易粟",
					"chapters": [0, 0],
					"type": "兑换"
				},
				{
					"desc": "折节下交（财富-3）",
					"res": "三教九流的门槛，你都踏过了一遍。乱世里，名单就是路。",
					"eff": {
						"dev": 0,
						"attrs": {
							"caifu": -3,
							"biancai": 1,
							"shengwang": 2
						}
					},
					"id": "XY-ACT-9",
					"name": "结交豪杰",
					"descHidden": "折节下交（小有破费）",
					"req": { "caifu": 3 },
					"chapters": [0, 0],
					"type": "兑换"
				},
				{
					"desc": "挑灯读阵，以谋补勇（才学≥45 方能啃下）",
					"res": "兵书难啃，啃下来就是你的。万人敌，先得读过万人之书。",
					"eff": {
						"dev": 0,
						"attrs": {
							"caixue": 2,
							"moulue": 1
						}
					},
					"id": "XY-ACT-10",
					"name": "夜读兵阵",
					"descHidden": "挑灯读阵，以谋补勇（学养不足者难啃）",
					"req": { "caixue": 45 },
					"chapters": [0, 0],
					"type": "守成"
				},
				{
					"desc": "驰马试剑，且放形骸",
					"res": "一日三获，风把胸口吹得透亮。回城时箭囊空了，心也空了片刻。",
					"id": "XY-ACT-11",
					"name": "游猎郊野",
					"eff": {
						"dev": 0,
						"attrs": {
							"tupo": 1,
							"weiji": -3
						}
					},
					"descHidden": "驰马试剑，且放形骸",
					"chapters": [0, 0],
					"type": "保身"
				},
				{
					"desc": "编练乡曲，以观人材",
					"res": "乡曲的丁壮在你眼前过了一遍。哪些人能战、哪些人能用，你心里的册子又厚了一页。",
					"id": "XY-ACT-12",
					"name": "征发乡勇",
					"eff": {
						"dev": 0,
						"attrs": {
							"wuli": 1,
							"quanshi": 2
						}
					},
					"descHidden": "编练乡曲，以观人材",
					"chapters": [0, 0],
					"type": "进取"
				},
				{
					"desc": "与宾客纵谈天下，练练嘴皮子",
					"res": "座上纵谈，秦失其鹿、天下共逐，你一语剖到骨里。满座动容——也有人暗暗记住了这张敢说话的嘴。",
					"id": "XY-ACT-51",
					"name": "纵谈时势",
					"eff": {
						"dev": 0,
						"attrs": {
							"weiji": 1,
							"biancai": 3,
							"moulue": 1
						}
					},
					"descHidden": "与宾客纵谈天下，练练嘴皮子",
					"chapters": [0, 0],
					"type": "守成"
				},
				{
					"desc": "任侠解纷，以理服人（财富-2）",
					"res": "两姓争田，打了三年。你去说了半日，各退一步，事了。乡里自此有争，先来寻你评理。",
					"eff": {
						"dev": 0,
						"attrs": {
							"zhengji": 1,
							"caifu": -2,
							"biancai": 1,
							"shengwang": 2
						}
					},
					"id": "XY-ACT-52",
					"name": "为人解纷",
					"descHidden": "任侠解纷，以理服人（略尽东道）",
					"req": { "caifu": 2 },
					"chapters": [0, 0],
					"type": "兑换"
				},
				{
					"desc": "亲训子弟兵",
					"res": "鼓声起落，八千子弟号令如一。这八千个名字，你都叫得出来。",
					"id": "XY-ACT-13",
					"name": "操练八千",
					"eff": {
						"dev": 0,
						"attrs": {
							"wuli": 2,
							"quanshi": 3,
							"weiji": 2
						}
					},
					"descHidden": "亲训子弟兵",
					"chapters": [1, 1],
					"type": "进取"
				},
				{
					"desc": "绥靖郡城（财富-3）",
					"res": "米价稳了，市集重新开了早市。会稽人开始认这面楚旗。",
					"eff": {
						"dev": 0,
						"attrs": {
							"shengwang": 2,
							"caifu": -3
						}
					},
					"id": "XY-ACT-14",
					"name": "安抚会稽",
					"descHidden": "绥靖郡城（须开仓廪）",
					"req": { "caifu": 3 },
					"chapters": [1, 1],
					"type": "兑换"
				},
				{
					"desc": "收兵刃于民间",
					"res": "府库多了三千副甲。有人夜里咬牙，有人夜里磨刀。",
					"id": "XY-ACT-15",
					"name": "搜缴军械",
					"eff": {
						"dev": 0,
						"attrs": {
							"weiji": 3,
							"caifu": 3
						}
					},
					"descHidden": "收兵刃于民间",
					"chapters": [1, 1],
					"type": "兑换"
				},
				{
					"desc": "礼敬耆老（财富-3）",
					"res": "你亲自登门的几位老成，如今逢人便说项氏的好处。老人的嘴，比布告管用。",
					"eff": {
						"dev": 0,
						"attrs": {
							"caifu": -3,
							"biancai": 1,
							"shengwang": 2
						}
					},
					"id": "XY-ACT-16",
					"name": "礼贤下士",
					"descHidden": "礼敬耆老（束帛将意）",
					"req": { "caifu": 3 },
					"chapters": [1, 1],
					"type": "兑换"
				},
				{
					"desc": "修垒固防，深根固本",
					"res": "城防连成一线，壕深了一丈。守得住的根据地，才是根据地。",
					"id": "XY-ACT-17",
					"name": "加固城防",
					"eff": {
						"dev": 0,
						"attrs": {
							"moulue": 1,
							"quanshi": 2
						}
					},
					"descHidden": "修垒固防，深根固本",
					"chapters": [1, 1],
					"type": "进取"
				},
				{
					"desc": "遣人觇关中消息",
					"res": "关中的每一条消息，你都听了三遍。天下的裂缝在哪里，你看得清。",
					"id": "XY-ACT-18",
					"name": "探秦虚实",
					"eff": {
						"dev": 0,
						"attrs": {
							"weiji": 2,
							"caixue": 2,
							"moulue": 1
						}
					},
					"descHidden": "遣人觇关中消息",
					"chapters": [1, 1],
					"type": "守成"
				},
				{
					"desc": "立规申令，以治新军",
					"res": "十七条军令刻在木牍上，悬于辕门。犯者立斩，先斩的是你自己的一个旧识——自此令行禁止，八千子弟成了一支军。",
					"id": "XY-ACT-53",
					"name": "申明军法",
					"eff": {
						"dev": 0,
						"attrs": {
							"quanshi": 1,
							"zhengji": 1
						}
					},
					"descHidden": "立规申令，以治新军",
					"chapters": [1, 1],
					"type": "进取"
				},
				{
					"desc": "与幕僚问对竟夜，以广耳目",
					"res": "你放下身段，逐条问、逐条驳，驳到幕僚词穷处，自己先笑了。烛火换了两支，心里的图，亮了一片。",
					"id": "XY-ACT-54",
					"name": "问对幕僚",
					"eff": {
						"dev": 0,
						"attrs": {
							"moulue": 2,
							"caixue": 1
						}
					},
					"descHidden": "与幕僚问对竟夜，以广耳目",
					"chapters": [1, 1],
					"type": "守成"
				},
				{
					"desc": "巡营鼓气，以振军心",
					"res": "你走过的地方，士卒的胸膛都挺高了一寸。军营的火堆，今夜烧得格外旺。",
					"id": "XY-ACT-19",
					"name": "激励士卒",
					"eff": {
						"dev": 0,
						"attrs": {
							"weiji": 2,
							"biancai": 1,
							"shengwang": 2
						}
					},
					"descHidden": "巡营鼓气，以振军心",
					"chapters": [2, 2],
					"type": "进取"
				},
				{
					"desc": "亲核粮账，以安三军",
					"res": "粮官的三笔假账被你翻了出来，人赃俱在。军中从此没人敢在粮上做手脚。",
					"id": "XY-ACT-20",
					"name": "检视军粮",
					"eff": {
						"dev": 0,
						"attrs": {
							"moulue": 1,
							"caifu": 2
						}
					},
					"descHidden": "亲核粮账，以安三军",
					"chapters": [2, 2],
					"type": "守成"
				},
				{
					"desc": "设宴结心（财富-3）",
					"res": "酒过三巡，几个别部将领的话也热络了。人心这种东西，要一碗一碗焐。",
					"eff": {
						"dev": 0,
						"attrs": {
							"junxin": 1,
							"caifu": -3,
							"biancai": 1,
							"shengwang": 2
						}
					},
					"id": "XY-ACT-21",
					"name": "与诸将宴",
					"descHidden": "设宴结心（酒肉之费）",
					"req": { "caifu": 3 },
					"chapters": [2, 2],
					"type": "兑换"
				},
				{
					"desc": "亲巡夜哨，以肃军纪",
					"res": "你查到第三座营时，拎出两个偷睡的哨兵。从此夜里站岗的，没人敢合眼。",
					"id": "XY-ACT-22",
					"name": "夜巡营垒",
					"eff": {
						"dev": 0,
						"attrs": {
							"wuli": 1,
							"weiji": -2
						}
					},
					"descHidden": "亲巡夜哨，以肃军纪",
					"chapters": [2, 2],
					"type": "保身"
				},
				{
					"desc": "推演巨鹿地势",
					"res": "漳水的深浅、甬道的走向，都在你脑中展开成图。巨鹿这一仗，你先在沙盘上赢了。",
					"id": "XY-ACT-23",
					"name": "研读阵图",
					"eff": {
						"dev": 0,
						"attrs": {
							"caixue": 2,
							"moulue": 1
						}
					},
					"descHidden": "推演巨鹿地势",
					"chapters": [2, 2],
					"type": "守成"
				},
				{
					"desc": "厚恤伤亡（财富-3）",
					"res": "伤者得恤，死者得葬，名册上每个名字都落了实处。士卒知将军不弃人。",
					"eff": {
						"dev": 0,
						"attrs": {
							"zhengji": 1,
							"caifu": -3,
							"weiji": -1,
							"shengwang": 1
						}
					},
					"id": "XY-ACT-24",
					"name": "抚问伤兵",
					"descHidden": "厚恤伤亡（恤金不菲）",
					"req": { "caifu": 3 },
					"chapters": [2, 2],
					"type": "兑换"
				},
				{
					"desc": "游说诸将同心，以聚力于一战",
					"res": "你挨个营帐走，话不重样：对勇者言义，对疑者言利。出最后一座帐时，诸将的刀，指向了同一个方向。",
					"id": "XY-ACT-55",
					"name": "说合诸将",
					"eff": {
						"dev": 0,
						"attrs": {
							"junxin": 1,
							"biancai": 3,
							"weiji": 1
						}
					},
					"descHidden": "游说诸将同心，以聚力于一战",
					"chapters": [2, 2],
					"type": "守成"
				},
				{
					"desc": "堆沙为山，推演九战之势",
					"res": "沙盘堆了拆、拆了堆，漳水两岸在案上活了。哪一战先断粮、哪一战后夺气，推演到第七遍，天边泛了白。",
					"id": "XY-ACT-56",
					"name": "沙盘演阵",
					"eff": {
						"dev": 0,
						"attrs": {
							"tupo": -1,
							"moulue": 2,
							"caixue": 1
						}
					},
					"descHidden": "堆沙为山，推演九战之势",
					"chapters": [2, 2],
					"type": "守成"
				},
				{
					"desc": "编练新附之众",
					"res": "降卒混编入楚，日日操练，号令渐齐。用好了是军，用不好是火。",
					"id": "XY-ACT-25",
					"name": "整肃降卒",
					"eff": {
						"dev": 0,
						"attrs": {
							"wuli": 1,
							"quanshi": 2,
							"weiji": 3
						}
					},
					"descHidden": "编练新附之众",
					"chapters": [3, 3],
					"type": "进取"
				},
				{
					"desc": "核收秦之府库",
					"res": "府库的账核清了，咸阳的宝货也看清了。账房先生们熬了三夜，有人欢喜有人眼红。",
					"id": "XY-ACT-26",
					"name": "清点府库",
					"eff": {
						"dev": 0,
						"attrs": {
							"caifu": 3,
							"zhengji": 1,
							"shengwang": -2
						}
					},
					"descHidden": "核收秦之府库",
					"chapters": [3, 3],
					"type": "兑换"
				},
				{
					"desc": "就范增问计（需范增在侧）",
					"res": "老人家的三句话，值你三夜长考。出帐时，月亮已经偏西了。",
					"eff": {
						"dev": 0,
						"attrs": {
							"junxin": 1,
							"caixue": 2,
							"moulue": 1
						}
					},
					"id": "XY-ACT-27",
					"name": "问计亚父",
					"descHidden": "就范增问计（需范增在侧）",
					"req": { "flag": "fanzeng" },
					"chapters": [3, 3],
					"type": "守成"
				},
				{
					"desc": "以私财犒军（财富-4）",
					"res": "酒肉到营，士气大振。士兵记得项王的赏，更记得赏的时候你在场。",
					"eff": {
						"dev": 0,
						"attrs": {
							"shengwang": 2,
							"caifu": -4
						}
					},
					"id": "XY-ACT-28",
					"name": "犒赏三军",
					"descHidden": "以私财犒军（犒赏颇厚）",
					"req": { "caifu": 4 },
					"chapters": [3, 3],
					"type": "兑换"
				},
				{
					"desc": "亲巡函谷诸隘",
					"res": "函谷的天险，你在心里又给刘邦留了一道。守关的将士，把腰杆挺直了许多。",
					"id": "XY-ACT-29",
					"name": "巡视关防",
					"eff": {
						"dev": 0,
						"attrs": {
							"wuli": 1,
							"quanshi": 1,
							"caixue": 1
						}
					},
					"descHidden": "亲巡函谷诸隘",
					"chapters": [3, 3],
					"type": "守成"
				},
				{
					"desc": "多备军粮，以支大战",
					"res": "仓廪渐实，运粮的车队没断过。旦日若战，三军不会饿着。",
					"id": "XY-ACT-30",
					"name": "压粮备进",
					"eff": {
						"dev": 0,
						"attrs": {
							"weiji": 2,
							"caifu": 2
						}
					},
					"descHidden": "多备军粮，以支大战",
					"chapters": [3, 3],
					"type": "兑换"
				},
				{
					"desc": "筵前应对，以口舌代干戈",
					"res": "来使话里藏针，你筵前拆针，一句一句还了回去。散席时对方拱手，你自己也惊了一惊：原来嘴也能当剑使。",
					"id": "XY-ACT-57",
					"name": "折冲樽俎",
					"eff": {
						"dev": 0,
						"attrs": {
							"biancai": 3,
							"moulue": 1
						}
					},
					"descHidden": "筵前应对，以口舌代干戈",
					"chapters": [3, 3],
					"type": "守成"
				},
				{
					"desc": "亲抚降卒，以安反侧",
					"res": "你走进降卒的营，问籍贯、问家口，亲手给一个秦卒裹了伤。当夜营里的关中歌谣，调子缓了些。",
					"id": "XY-ACT-58",
					"name": "抚循降营",
					"eff": {
						"dev": 0,
						"attrs": {
							"weiji": -2,
							"biancai": 1,
							"shengwang": 1
						}
					},
					"descHidden": "亲抚降卒，以安反侧",
					"chapters": [3, 3],
					"type": "保身"
				},
				{
					"desc": "绥抚关中（财富-3）",
					"res": "关中父老的脸色，一日比一日缓。民心这种东西，急不来。",
					"eff": {
						"dev": 0,
						"attrs": {
							"caifu": -3,
							"weiji": -1,
							"shengwang": 2
						}
					},
					"id": "XY-ACT-31",
					"name": "安抚秦民",
					"descHidden": "绥抚关中（抚民之费）",
					"req": { "caifu": 3 },
					"chapters": [4, 4],
					"type": "兑换"
				},
				{
					"desc": "修宫治府，以示定居（财富-4）",
					"res": "彭城的宫殿一日高过一日。天下的眼睛都看得见你的野心，也都看得见你的底气。",
					"eff": {
						"dev": 0,
						"attrs": {
							"quanshi": 2,
							"caifu": -4
						}
					},
					"id": "XY-ACT-32",
					"name": "修缮宫室",
					"descHidden": "修宫治府，以示定居（土木糜费）",
					"req": { "caifu": 4 },
					"chapters": [4, 4],
					"type": "兑换"
				},
				{
					"desc": "报聘十八王（财富-3）",
					"res": "使者四出，回话都极恭敬。只是恭敬这个东西，最经不起风。",
					"eff": {
						"dev": 0,
						"attrs": {
							"junxin": 1,
							"caifu": -3,
							"biancai": 1,
							"shengwang": 1
						}
					},
					"id": "XY-ACT-33",
					"name": "遣使诸侯",
					"descHidden": "报聘十八王（聘币甚丰）",
					"req": { "caifu": 3 },
					"chapters": [4, 4],
					"type": "兑换"
				},
				{
					"desc": "核天下兵籍",
					"res": "诸侯各有多少兵、多少粮，你心里的册子又厚了一层。纸上的天下，也是天下。",
					"id": "XY-ACT-34",
					"name": "检阅兵籍",
					"eff": {
						"dev": 0,
						"attrs": {
							"moulue": 1,
							"quanshi": 2
						}
					},
					"descHidden": "核天下兵籍",
					"chapters": [4, 4],
					"type": "进取"
				},
				{
					"desc": "收咸阳战骨",
					"res": "咸阳城的灰烬里，多了几座新坟。咒骂声，因此少了几声。",
					"id": "XY-ACT-35",
					"name": "收葬遗骸",
					"eff": {
						"dev": 0,
						"attrs": {
							"weiji": -1,
							"shengwang": 2
						}
					},
					"descHidden": "收咸阳战骨",
					"chapters": [4, 4],
					"type": "进取"
				},
				{
					"desc": "与秦民约法",
					"res": "市口贴了约法，围观的秦民读了一遍又一遍。有人读完，朝着楚旗的方向拱了拱手。",
					"id": "XY-ACT-36",
					"name": "约法于市",
					"eff": {
						"dev": 0,
						"attrs": {
							"weiji": 2,
							"junxin": 1,
							"caixue": 1,
							"shengwang": 2
						}
					},
					"descHidden": "与秦民约法",
					"chapters": [4, 4],
					"type": "进取"
				},
				{
					"desc": "考校诸侯封域之政，以定赏罚",
					"res": "十八王的封域、户口、赋入，你亲自一笔一笔考校。谁的封地肥、谁的封地贫，册子合上的那一刻，赏罚已在胸中。",
					"id": "XY-ACT-59",
					"name": "考校封政",
					"eff": {
						"dev": 0,
						"attrs": {
							"moulue": 1,
							"zhengji": 2
						}
					},
					"descHidden": "考校诸侯封域之政，以定赏罚",
					"chapters": [4, 4],
					"type": "进取"
				},
				{
					"desc": "殿上亲对诸侯来使，以观四方之心",
					"res": "来使各怀心思，你当庭逐一对答，恩威并施。退殿时，几国的使者把今日的每一句话都默背了下来。",
					"id": "XY-ACT-60",
					"name": "廷对来使",
					"eff": {
						"dev": 0,
						"attrs": {
							"biancai": 2,
							"junxin": 1
						}
					},
					"descHidden": "殿上亲对诸侯来使，以观四方之心",
					"chapters": [4, 4],
					"type": "守成"
				},
				{
					"desc": "亲督护粮，以保敖仓之路",
					"res": "你亲自押了三趟，刀不离鞍。彭越的游兵，近来收敛了些。",
					"id": "XY-ACT-37",
					"name": "护粮通道",
					"eff": {
						"dev": 0,
						"attrs": {
							"wuli": 1,
							"quanshi": 2,
							"weiji": 2
						}
					},
					"descHidden": "亲督护粮，以保敖仓之路",
					"chapters": [5, 5],
					"type": "进取"
				},
				{
					"desc": "剿击梁地游兵",
					"res": "彭越吃了亏，躲得更深了。泥鳅一样的人，抓不如赶。",
					"id": "XY-ACT-38",
					"name": "截击彭越",
					"eff": {
						"dev": 0,
						"attrs": {
							"wuli": 2,
							"quanshi": 3,
							"weiji": 3,
							"tupo": -2
						}
					},
					"descHidden": "剿击梁地游兵",
					"chapters": [5, 5],
					"type": "进取"
				},
				{
					"desc": "休养马力，以蓄锐气",
					"res": "三万精骑饱餐休整，马都喂出了膘。下一战，还得靠他们。",
					"id": "XY-ACT-39",
					"name": "休整精骑",
					"eff": {
						"dev": 0,
						"attrs": {
							"tupo": 1,
							"weiji": -3
						}
					},
					"descHidden": "休养马力，以蓄锐气",
					"chapters": [5, 5],
					"type": "保身"
				},
				{
					"desc": "与谋士夜议军情",
					"res": "舆图前的烛火，烧到了四更。散帐时，诸将的眼里都有了底。",
					"id": "XY-ACT-40",
					"name": "问计帷幄",
					"eff": {
						"dev": 0,
						"attrs": {
							"junxin": 1,
							"caixue": 2,
							"moulue": 1
						}
					},
					"descHidden": "与谋士夜议军情",
					"chapters": [5, 5],
					"type": "守成"
				},
				{
					"desc": "筑垒以困汉军",
					"res": "壁垒向巩洛推进了十里，壕堑如齿。磨盘，就该这么转。",
					"id": "XY-ACT-41",
					"name": "筑垒巩洛",
					"eff": {
						"dev": 0,
						"attrs": {
							"moulue": 1,
							"quanshi": 2
						}
					},
					"descHidden": "筑垒以困汉军",
					"chapters": [5, 5],
					"type": "进取"
				},
				{
					"desc": "募新军于淮南（财富-3）",
					"res": "淮南的应募者络绎于途，名册一日三换。你的兵源，还没有断。",
					"eff": {
						"dev": 0,
						"attrs": {
							"quanshi": 3,
							"weiji": 2,
							"caifu": -3
						}
					},
					"id": "XY-ACT-42",
					"name": "募兵淮南",
					"descHidden": "募新军于淮南（募金所费）",
					"req": { "caifu": 3 },
					"chapters": [5, 5],
					"type": "兑换"
				},
				{
					"desc": "申严号令，以持久战之军",
					"res": "相持日久，军纪易弛。你重申号令，赏罚当日兑现——疲军之怕的不是强敌，是先松了自己的弦。",
					"id": "XY-ACT-61",
					"name": "治军申令",
					"eff": {
						"dev": 0,
						"attrs": {
							"quanshi": 1,
							"zhengji": 1
						}
					},
					"descHidden": "申严号令，以持久战之军",
					"chapters": [5, 5],
					"type": "进取"
				},
				{
					"desc": "遣辩士说诸侯发兵，以分汉势",
					"res": "使者衔命四出，措辞你逐句改过。应者寥寥，但有一国点头，汉王就得分一份心——舌头的仗，也是仗。",
					"id": "XY-ACT-62",
					"name": "遣使说援",
					"eff": {
						"dev": 0,
						"attrs": {
							"junxin": 1,
							"biancai": 2,
							"weiji": 2
						}
					},
					"descHidden": "遣辩士说诸侯发兵，以分汉势",
					"chapters": [5, 5],
					"type": "守成"
				},
				{
					"desc": "收拢溃散之众",
					"res": "溃散的人马一点点聚回来，有的还带着伤。还肯回来的，都是真楚人。",
					"id": "XY-ACT-43",
					"name": "聚拢残骑",
					"eff": {
						"dev": 0,
						"attrs": {
							"weiji": 2,
							"quanshi": 2
						}
					},
					"descHidden": "收拢溃散之众",
					"chapters": [6, 6],
					"type": "进取"
				},
				{
					"desc": "以死义气激励残部",
					"res": "你说：楚虽三户，亡秦必楚。残骑的眼里，熄了的火又着了。",
					"id": "XY-ACT-44",
					"name": "激励死士",
					"eff": {
						"dev": 0,
						"attrs": {
							"biancai": 1,
							"shengwang": 2
						}
					},
					"descHidden": "以死义气激励残部",
					"chapters": [6, 6],
					"type": "进取"
				},
				{
					"desc": "亲探汉军虚实",
					"res": "你摸到敌营三里之内，露水打透了斗篷。围有几重，破绽在哪，你看清了。",
					"id": "XY-ACT-45",
					"name": "夜探敌营",
					"eff": {
						"dev": 0,
						"attrs": {
							"wuli": 1,
							"weiji": 3,
							"caixue": 2,
							"tupo": -1
						}
					},
					"descHidden": "亲探汉军虚实",
					"chapters": [6, 6],
					"type": "守成"
				},
				{
					"desc": "弃辎重，轻装突围（财富-3）",
					"res": "辎重烧掉的烟起了三柱，百里外都看得见。心疼归心疼，命要紧。",
					"eff": {
						"dev": 0,
						"attrs": {
							"weiji": -3,
							"caifu": -3
						}
					},
					"id": "XY-ACT-46",
					"name": "毁辎疾行",
					"descHidden": "弃辎重，轻装突围（辎重尽弃）",
					"req": { "caifu": 3 },
					"chapters": [6, 6],
					"type": "保身"
				},
				{
					"desc": "杀牲祭旗，以壮行色",
					"res": "战旗举起时，八百人没有一个低头。牲血未干，刀已出鞘。",
					"id": "XY-ACT-47",
					"name": "祭旗突围",
					"eff": {
						"dev": 0,
						"attrs": {
							"wuli": 1,
							"shengwang": 3
						}
					},
					"descHidden": "杀牲祭旗，以壮行色",
					"chapters": [6, 6],
					"type": "进取"
				},
				{
					"desc": "于乌江岸休整残骑",
					"res": "江水很急，马饮得很饱，鬃毛在江风里贴成一线。对岸的灯火，比北岸的安静。",
					"id": "XY-ACT-48",
					"name": "秣马乌江岸",
					"eff": {
						"dev": 0,
						"attrs": {
							"tupo": 1,
							"weiji": -2
						}
					},
					"descHidden": "于乌江岸休整残骑",
					"chapters": [6, 6],
					"type": "保身"
				},
				{
					"desc": "烛下审天下之势，定去就之策",
					"res": "围有几重，路有几条，你一条条在心里过了秤。渡与不渡，战与不战——这一夜，你把最坏的几步棋都先想完了。",
					"id": "XY-ACT-63",
					"name": "审势定策",
					"eff": {
						"dev": 0,
						"attrs": {
							"moulue": 2,
							"caixue": 1
						}
					},
					"descHidden": "烛下审天下之势，定去就之策",
					"chapters": [6, 6],
					"type": "守成"
				},
				{
					"desc": "阵前誓师，以固残部之志",
					"res": "你立马阵前，声音不高，字字砸在地上：今日之事，有进无退。残骑举戟相应，声动四野。",
					"id": "XY-ACT-64",
					"name": "誓师固志",
					"eff": {
						"dev": 0,
						"attrs": {
							"weiji": 1,
							"biancai": 2,
							"shengwang": 1
						}
					},
					"descHidden": "阵前誓师，以固残部之志",
					"chapters": [6, 6],
					"type": "守成"
				},
				{
					"desc": "始皇渡浙江，舆驾如山——你脱口而出：彼可取而代也",
					"id": "XY-ACT-65",
					"name": "舆驾之叹",
					"descHidden": "始皇渡浙江，舆驾如山——你脱口而出：彼可取而代也",
					"choice": {
						"segs": ["秦始皇游会稽，渡浙江，舆驾如山，万民俯伏。你脱口而出：「彼可取而代也！」项梁一把捂住你的嘴：「毋妄言，族矣！」——可他的眼睛，在笑。"],
						"options": [
							{
								"eff": {
									"dev": 0,
									"attrs": {
										"wuli": 2,
										"weiji": 2
									}
								},
								"res": "你拨开叔父的手，又补了一句：「有何不可！」项梁拖着你挤出人群——嘴上骂你，脚步却轻快得很。这句话，总有一天，要叫全天下的人听见。",
								"t": "挣开再说"
							},
							{
								"eff": {
									"dev": 0,
									"attrs": {
										"moulue": 1,
										"weiji": -1
									}
								},
								"res": "你顺势低头，随叔父挤出人群。当夜项梁看你的眼神，从此不一样了——有些话，说出来是祸；压在心里，就成了火。",
								"t": "笑笑而已"
							},
							{
								"eff": {
									"dev": 0,
									"attrs": {
										"tupo": 1,
										"caixue": 1
									}
								},
								"res": "你不再言语，把那句话咽回腹中，压成一块铁。这世上的王，不是喊出来的——是打出来的。",
								"t": "自此缄口"
							}
						]
					},
					"chapters": [0, 0],
					"type": "抉择"
				},
				{
					"desc": "两家为丧仪排位争执，刀都按到了柄上",
					"id": "XY-ACT-66",
					"name": "吴中丧事",
					"descHidden": "两家为丧仪排位争执，刀都按到了柄上",
					"choice": {
						"segs": ["吴中每有大徭役与丧事，常由你主办。今日两家为丧仪排位争执不下，刀都按到了柄上。你用兵法部勒宾客，满堂的人，都在看你怎么落这一刀。"],
						"options": [
							{
								"eff": {
									"dev": 0,
									"attrs": {
										"biancai": 1,
										"shengwang": 2
									}
								},
								"res": "你引古礼定尊卑，两家俱服。吴中父老点头：断得正。礼这东西，是让人心服的那杆秤。",
								"t": "以礼断之"
							},
							{
								"eff": {
									"dev": 0,
									"attrs": {
										"wuli": 2,
										"shengwang": -1
									}
								},
								"res": "你一拍棺木：「丧家大事，敢争者逐！」两家偃旗息鼓。快是快，只是有人背后说你霸——这个代价，日后会有人替你还。",
								"t": "以威慑之"
							},
							{
								"eff": {
									"dev": 0,
									"attrs": {
										"moulue": 1,
										"weiji": -1
									}
								},
								"res": "你把争端推给族中宗老，自己退后半步。事情平平稳稳了结——出的面越多，欠的债越多。",
								"t": "推给宗老"
							}
						]
					},
					"chapters": [0, 0],
					"type": "抉择"
				},
				{
					"desc": "点兵册上有故人之子——其父昨夜跪在你帐前",
					"id": "XY-ACT-67",
					"name": "八千之选",
					"descHidden": "点兵册上有故人之子——其父昨夜跪在你帐前",
					"choice": {
						"segs": ["会稽起兵，你点得精兵八千。点兵册上，有故人之子的名字——其父昨夜跪在你帐前，额头磕在土上。你握着笔，笔尖悬在那个名字上。"],
						"options": [
							{
								"eff": {
									"dev": 0,
									"attrs": {
										"quanshi": 1,
										"weiji": -1,
										"shengwang": -1
									}
								},
								"res": "你提笔勾了那个名字。故人千恩万谢地走了。名册的分量，从此轻了一分——勾掉的是一个人的命，也是八千人心里的一问号。",
								"t": "勾其名"
							},
							{
								"eff": {
									"dev": 0,
									"attrs": {
										"wuli": 1,
										"shengwang": 2
									}
								},
								"res": "你把人编进前锋营。其父僵在帐前。你道：「项家军的体面，在阵上挣。」这话传开，八千人站得更直了。",
								"t": "编入前锋"
							},
							{
								"eff": {
									"dev": 0,
									"attrs": {
										"moulue": 1,
										"junxin": 1
									}
								},
								"res": "你把选择丢回去：愿留则留，愿去则去。那少年咬牙留下，后来战死在巨鹿——你亲自为他抬的棺。这账，两清了。",
								"t": "令其自择"
							}
						]
					},
					"chapters": [1, 1],
					"type": "抉择"
				},
				{
					"desc": "居鄛人范增扶杖来投，年轻将领窃笑：又来一个养老的",
					"id": "XY-ACT-68",
					"name": "七十老叟",
					"descHidden": "居鄛人范增扶杖来投，年轻将领窃笑：又来一个养老的",
					"choice": {
						"segs": ["居鄛人范增，年七十，扶杖来投。帐外有年轻将领窃笑：「又来一个养老的。」你迎出帐外——七十岁的眼睛里，盛着你读不完的东西。"],
						"options": [
							{
								"eff": {
									"dev": 0,
									"attrs": {
										"moulue": 1,
										"shengwang": 2
									}
								},
								"res": "你亲自执辔扶杖，以子侄礼迎入。当夜论天下至鸡鸣。次日军中改口：亚父。这一夜的话，够你用十年。",
								"t": "执子侄礼"
							},
							{
								"eff": {
									"dev": 0,
									"attrs": {
										"moulue": 2,
										"shengwang": -1
									}
								},
								"res": "你以三事问之。范增一一答毕，起身便走——你追到辕门才留住。这一试，试的是才，伤的是心。",
								"t": "先试其才"
							},
							{
								"eff": {
									"dev": 0,
									"attrs": {
										"quanshi": -1,
										"weiji": -1
									}
								},
								"res": "你按寻常食客之礼安置了他。范增不愠不火住了下来，只是再没主动进过你的帐。那根杖，你始终没有扶过。",
								"t": "随众慢之"
							}
						]
					},
					"chapters": [1, 1],
					"type": "抉择"
				},
				{
					"desc": "沉船破釜之后，屯长私藏干粮一囊——按令当斩",
					"id": "XY-ACT-69",
					"name": "私藏之粮",
					"descHidden": "沉船破釜之后，屯长私藏干粮一囊——按令当斩",
					"choice": {
						"segs": ["渡漳既毕，沉船破釜，军持三日粮。清查时，有屯长私藏干粮一囊，按你新颁的军令——当斩。跪着的屯长是吴中故人，八千里跟出来的。"],
						"options": [
							{
								"eff": {
									"dev": 0,
									"attrs": {
										"wuli": 1,
										"weiji": -2,
										"shengwang": -1
									}
								},
								"res": "令箭落地，人头亦落。三军股栗，自此军令如山。夜里你独坐，把那囊干粮看了很久——令是立住了，心缺了一块。",
								"t": "斩之徇军"
							},
							{
								"eff": {
									"dev": 0,
									"attrs": {
										"weiji": 1,
										"shengwang": 1
									}
								},
								"res": "四十军棍，留其性命。屯长爬出帐时咬紧牙关没喊一声。有人说，你的令从此有了缝——可今夜，你还是下不去那个手。",
								"t": "杖而释之"
							},
							{
								"eff": {
									"dev": 0,
									"attrs": {
										"moulue": 2,
										"wuli": 1
									}
								},
								"res": "你命他率死士为前锋，以功赎罪。巨鹿城下他第一个登上城墙，死在破城的那一刻——罪与功，一笔结清。",
								"t": "充为死锋"
							}
						]
					},
					"chapters": [2, 2],
					"type": "抉择"
				},
				{
					"desc": "巨鹿既破，诸侯将入辕门，无不膝行而前",
					"id": "XY-ACT-70",
					"name": "诸侯膝行",
					"descHidden": "巨鹿既破，诸侯将入辕门，无不膝行而前",
					"choice": {
						"segs": ["巨鹿既破，诸侯将入辕门谒见，无不膝行而前，莫敢仰视。你是上将军，是破秦第一人——这一跪，受还是不受，天下的诸侯都看着。"],
						"options": [
							{
								"eff": {
									"dev": 0,
									"attrs": {
										"shengwang": -1,
										"quanshi": 2
									}
								},
								"res": "你高坐帐中，坦然受拜。诸侯膝行出帐时，头垂得更低了——畏你如虎，也怨你入骨。威与怨，从来是同一枚钱的两面。",
								"t": "高坐受之"
							},
							{
								"eff": {
									"dev": 0,
									"attrs": {
										"quanshi": -1,
										"shengwang": 3
									}
								},
								"res": "你亲自下座，一一扶起。诸侯感激涕零。只是你扶得起的膝盖，扶不起的，是他们心里的算盘。",
								"t": "起身扶之"
							},
							{
								"eff": {
									"dev": 0,
									"attrs": {
										"moulue": 1,
										"weiji": -1
									}
								},
								"res": "你摆摆手：「战未完，礼先免。」诸侯如蒙大赦。礼省了是痛快；可省掉的，也是诸侯欠你的那份“敬”。",
								"t": "挥之使去"
							}
						]
					},
					"chapters": [2, 2],
					"type": "抉择"
				},
				{
					"desc": "夜坑之前，降卒百长跪于帐外，言家中有八旬老母",
					"id": "XY-ACT-71",
					"name": "新安之夜",
					"descHidden": "夜坑之前，降卒百长跪于帐外，言家中有八旬老母",
					"choice": {
						"segs": ["二十万秦卒已降，坑杀之令将行。动手前夜，降卒百长跪于帐外，言家中有八旬老母，求一线生机。你一句话，是他一个人的生死，也是二十万人的注脚。"],
						"options": [
							{
								"eff": {
									"dev": 0,
									"attrs": {
										"weiji": 1,
										"shengwang": 2
									}
								},
								"res": "你许他带本部百人离去。百长叩首出血。这一百人活了下来，也把「楚军曾纵百人」的话带进了关中——一百个活着的人，比二十万死人，说的话更响。",
								"t": "释其百人"
							},
							{
								"eff": {
									"dev": 0,
									"attrs": {
										"tupo": -1,
										"weiji": -1,
										"shengwang": -2
									}
								},
								"res": "你闭上眼睛，摇了摇头。帐外的哭声只响了一下就断了。成大事者——可那句没说完的话，从此再没找到下半句。",
								"t": "不准"
							},
							{
								"eff": {
									"dev": 0,
									"attrs": {
										"moulue": 2,
										"weiji": 2
									}
								},
								"res": "你把这一营拣入亲军，名为监视，实为保全。夜半坑声起时，他们在中军帐外听得清清楚楚——这一营人，就是你心里的一道缝，缝里漏着光。",
								"t": "编入亲军"
							}
						]
					},
					"chapters": [3, 3],
					"type": "抉择"
				},
				{
					"desc": "范增拔剑撞破玉斗：竖子不足与谋",
					"id": "XY-ACT-72",
					"name": "亚父碎斗",
					"descHidden": "范增拔剑撞破玉斗：竖子不足与谋",
					"choice": {
						"segs": ["鸿门宴罢，刘邦已走。范增受你转赠的玉斗，拔剑撞而破之：「竖子不足与谋！夺项王天下者，必沛公也！」碎玉溅在你脚边——亚父的话，是骂刘邦，也是骂你。"],
						"options": [
							{
								"eff": {
									"dev": 0,
									"attrs": {
										"shengwang": 1,
										"junxin": 2
									}
								},
								"res": "你向范增长揖到地：「亚父言重，籍知悔。」老人气得发抖的手，终于放了下来。这世上能让霸王弯腰的人，越来越少——每少一个，你的腰就硬一分。",
								"t": "长揖谢罪"
							},
							{
								"eff": {
									"dev": 0,
									"attrs": {
										"tupo": -1,
										"weiji": -1
									}
								},
								"res": "你一言不发，任他骂完。范增拂袖而去，背影比来时老了十岁。你没有错到要认，也没有对到能辩——这就是鸿门。",
								"t": "默然受之"
							},
							{
								"eff": {
									"dev": 0,
									"attrs": {
										"weiji": 1,
										"biancai": 2,
										"moulue": -1
									}
								},
								"res": "你昂首陈说放走刘邦的三层道理。范增听完冷笑一声，再不多言——从那以后，亚父进帐的次数少了。这一辩，辩赢了道理，辩输了人。",
								"t": "挺辩其非"
							}
						]
					},
					"chapters": [3, 3],
					"type": "抉择"
				},
				{
					"desc": "韩生讥你「沐猴而冠」，一字不漏传到你耳中",
					"id": "XY-ACT-73",
					"name": "韩生之讥",
					"descHidden": "韩生讥你「沐猴而冠」，一字不漏传到你耳中",
					"choice": {
						"segs": ["有韩生献策留都关中，你以「富贵不归故乡，如衣绣夜行」拒之。韩生退而对人说：「人言楚人沐猴而冠，果然。」这话一字不漏地传到了你耳中。"],
						"options": [
							{
								"eff": {
									"dev": 0,
									"attrs": {
										"shengwang": -3,
										"weiji": -2
									}
								},
								"res": "你命人烹了韩生。读书人从此路过你的辕门，都绕着走——这一锅，煮掉的还有满天下敢说话的心。",
								"t": "烹之"
							},
							{
								"eff": {
									"dev": 0,
									"attrs": {
										"shengwang": -1,
										"weiji": -1
									}
								},
								"res": "你把韩生逐出咸阳。他边走边骂，把「沐猴而冠」四个字带到了全天下——箭挡得住，话挡不住。",
								"t": "逐之"
							},
							{
								"eff": {
									"dev": 0,
									"attrs": {
										"caixue": 1,
										"shengwang": 2
									}
								},
								"res": "你大笑：「沐猴而冠？这颗头颅，偏要戴着王冠回江东！」韩生愕然免死。这一笑，笑的是他，也是你自己。",
								"t": "笑而赦之"
							}
						]
					},
					"chapters": [4, 4],
					"type": "抉择"
				},
				{
					"desc": "关中金城千里，彭城四战之地——你站在残垣上向东望",
					"id": "XY-ACT-74",
					"name": "定都之议",
					"descHidden": "关中金城千里，彭城四战之地——你站在残垣上向东望",
					"choice": {
						"segs": ["宫室已焚，宝物既收。左右争于定都：一说关中金城千里，一说彭城四战之地可示勇武。你站在咸阳的残垣上向东望——关中在身后，故乡在前方。"],
						"options": [
							{
								"eff": {
									"dev": 0,
									"attrs": {
										"weiji": 1,
										"quanshi": 1
									}
								},
								"res": "你决意东归。衣绣昼行，何须他人指点。车驾出关时你没有回头——关中这片你亲手拿下的土地，从此再也不属于你。",
								"t": "东归彭城"
							},
							{
								"eff": {
									"dev": 0,
									"attrs": {
										"shengwang": -1,
										"zhengji": 2
									}
								},
								"res": "你压下乡愁，留都关中。将士的怨言在营中发酵——这座城是金城，可它不是楚人的家；家这个东西，是拿脚认的。",
								"t": "留都关中"
							},
							{
								"eff": {
									"dev": 0,
									"attrs": {
										"moulue": 2,
										"junxin": -1
									}
								},
								"res": "你遣骑夜问范增。老人只回了八个字：「将军之心，已不在秦。」你默然烧掉回信——你要的，从来不是答案，是赞同。",
								"t": "再问亚父"
							}
						]
					},
					"chapters": [4, 4],
					"type": "抉择"
				},
				{
					"desc": "刘邦回话：幸分我一杯羹——这一刀，下还是不下",
					"id": "XY-ACT-75",
					"name": "太公之俎",
					"descHidden": "刘邦回话：幸分我一杯羹——这一刀，下还是不下",
					"choice": {
						"segs": ["你置太公于高俎之上，告刘邦：「今不急下，吾烹太公。」汉军回话：「吾翁即若翁，必欲烹而翁，则幸分我一杯羹。」俎上的老人瑟瑟发抖——这一刀，下还是不下？"],
						"options": [
							{
								"eff": {
									"dev": 0,
									"attrs": {
										"wuli": 1,
										"weiji": 2,
										"shengwang": -2
									}
								},
								"res": "你拍案命举火。项伯死死拦在俎前：「为天下者不顾家，烹之无益，只益祸耳！」火终究没点——但「欲烹太公」的名声，再也洗不掉了。",
								"t": "怒而欲烹"
							},
							{
								"eff": {
									"dev": 0,
									"attrs": {
										"moulue": 1,
										"shengwang": 2
									}
								},
								"res": "你挥手下令撤俎。太公瘫软在地，被搀了下去。这盘棋，你输的不是刀，是心——他赌的，就是你下不去手。",
								"t": "释俎罢兵"
							},
							{
								"eff": {
									"dev": 0,
									"attrs": {
										"biancai": 1,
										"weiji": 1
									}
								},
								"res": "你扣下来使，回书只有一句：「羹则无，刀在此。」汉营再无回音。这局心理战，你们打了个平手——平手，对你就是输。",
								"t": "缚还其使"
							}
						]
					},
					"chapters": [5, 5],
					"type": "抉择"
				},
				{
					"desc": "垓下帐中夜饮，虞姬把盏轻问：若事不济，妾当何如",
					"id": "XY-ACT-76",
					"name": "虞姬之问",
					"descHidden": "垓下帐中夜饮，虞姬把盏轻问：若事不济，妾当何如",
					"choice": {
						"segs": ["垓下帐中，夜饮。楚歌自四野而起，虞姬为你把盏，忽然轻声问：「若事不济，妾当何如？」——她的声音很轻，轻得像怕惊着什么。你握着剑柄，竟答不出一个字。"],
						"options": [
							{
								"eff": {
									"dev": 0,
									"attrs": {
										"tupo": -1,
										"junxin": 2
									}
								},
								"res": "你答：「同归。」虞姬展颜一笑，为你满斟。有些承诺说出口就是永远——这一生，你对天下说过无数句话；只有这一句，你希望它兑现。",
								"t": "许以同归"
							},
							{
								"eff": {
									"dev": 0,
									"attrs": {
										"moulue": 1,
										"shengwang": 1
									}
								},
								"res": "你答：「天明之前，随辎重先走。」虞姬垂眸不语，为你续上酒。她有没有走，史书记载不一——你只记得她最后那支舞。",
								"t": "令其先行"
							},
							{
								"eff": {
									"dev": 0,
									"attrs": {
										"caixue": 1,
										"weiji": -1
									}
								},
								"res": "你没有答，起身按剑而歌：「力拔山兮气盖世……」歌声替你回答了。虞姬和之，帐中诸将皆泣数行下。没有答案，本身就是答案。",
								"t": "不答"
							}
						]
					},
					"chapters": [6, 6],
					"type": "抉择"
				}
			],
			"GLOSSARY": {
				"下相": "秦县，今江苏宿迁，项羽故里。项氏世为楚将，封于项，故为项姓。",
				"项梁": "楚将项燕之子，项羽叔父。起兵会稽，立楚怀王以从民望，败死于定陶。楚军反秦的第一面旗，是他竖起来的。",
				"范增": "居巢人，年七十好奇计，项羽尊为亚父。鸿门之谋不用，后中陈平反间，疽发背而死，未至彭城。",
				"宋义": "楚怀王所拜上将军，号卿子冠军。救赵行至安阳留四十六日不进，为项羽所斩。",
				"破釜沉舟": "项羽渡漳水，沉船、破釜甑、烧庐舍，持三日粮示必死。一战而秦军气夺，后成成语。",
				"巨鹿": "今河北平乡。前207年项羽九战破章邯、虏王离，诸侯由是属目。",
				"章邯": "秦末名将，破陈胜、杀项梁。巨鹿败后降楚，封雍王，终败死于韩信之手。",
				"新安": "今河南渑池东。项羽夜坑秦降卒二十余万于此，关中由是不附楚。",
				"鸿门宴": "前206年项羽设宴鸿门，范增命项庄舞剑欲杀刘邦，沛公终得脱。一顿饭的工夫，天下的走向改了道。",
				"项庄": "项羽堂弟。鸿门宴上奉范增命舞剑，意在沛公，为项伯所蔽，终无所成。",
				"樊哙": "刘邦猛将，屠狗出身。鸿门宴带剑拥盾闯帐，嗔目视羽，羽赐卮酒彘肩，称为壮士。",
				"义帝": "楚怀王孙心，初立以从民望，为反秦之旗。项羽徙之长沙，密令英布杀于江中，刘邦后来正以此讨羽。",
				"韩生": "说项羽都关中者，以“沐猴而冠”讥之，为羽所烹。一句话送了一条命，也送掉了关中。",
				"彭城": "今江苏徐州，西楚霸王之都。前205年项羽以三万精骑大破汉五十六万于此。",
				"敖仓": "荥阳东北敖山之大粮仓。楚汉相持，汉军恃此不绝——粮道之争，就是国运之争。",
				"鸿沟": "古运河，今河南荥阳东南。前203年楚汉中分天下之界，墨迹未干，汉王已追兵。",
				"垓下": "今安徽灵璧东南。前202年项羽兵困于此，四面楚歌，霸王别姬。",
				"乌江": "今安徽和县东北乌江浦，项羽自刎处。亭长檥船之地，千古一叹之地。",
				"乌骓": "项羽坐骑，日行千里，五年相随。乌江赠予亭长，人马之情，至此而终。",
				"虞姬": "项羽美人，常随军中。垓下帐中，羽为悲歌，虞和之——和歌不传，余韵千载。",
				"阴陵": "今安徽定远西北。项羽于此迷道，为田父所绐，陷于大泽，由是失道。",
				"陈胜": "阳城人，字涉，佣耕出身。前209年与吴广起于大泽，首事反秦；虽旋败，天下由是从风。",
				"殷通": "秦会稽郡守。大泽兵起后亦欲举兵，以项梁、桓楚为将——话说完，头先落了地。",
				"漳水": "源出山西，东流经巨鹿之南。项羽尽渡而沉船，破釜沉舟即在此处。",
				"王离": "秦将，王翦之孙，围巨鹿为项羽所虏。祖擒项燕，孙虏于羽——三代恩怨，一朝而偿。",
				"函谷关": "秦之东门，据崤函之险。刘邦先入关而使兵守之，项羽怒而破关，楚汉之隙自此始。",
				"英布": "六人，尝坐法黥面，故亦称黥布。先为楚锋，封九江王，后叛归汉——骁勇而善变。",
				"曹无伤": "沛公左司马。使人言沛公欲王关中，欲以此求封；沛公归营，立诛之。",
				"项伯": "项羽季父，名缠，字伯。夜见张良泄军机，宴上又翼蔽沛公——楚之宗室，汉之新恩。",
				"张良": "字子房，韩贵族之后，博浪一击名动天下。鸿门周旋于生死之际，后又赞汉王背约追楚。",
				"田荣": "齐国王族。分封不与其名，遂反齐自立，首启诸侯之乱。",
				"彭越": "昌邑人，渔民出身，后为梁王。专挠楚军粮道，来无影去无踪——项羽背上的一根刺。",
				"陈平": "阳武人，美如冠玉而多奇计。反间范增、钟离眜，皆出其手。",
				"韩信": "淮阴人，曾受胯下之辱。初事项氏不得用，亡归汉而拜大将，破魏、赵、齐，兵仙之称由此。",
				"江东": "长江芜湖以下折而北流，其东为江东，今苏南浙北之地。项羽起兵之处，八千子弟之来处。",
				"吕马童": "项羽故人，后归汉为骑司马。乌江畔羽顾见之，曰“吾为若德”，以首级相赠。",
				"侯公": "汉之辩士，姓名不传。一说而下鸿沟之约，迎太公、吕后归汉——事成即隐，赏亦不受。"
			}
		};
	}));
	//#endregion
	//#region ../prot/lua-data/chensheng.json
	var require_chensheng = /* @__PURE__ */ __commonJSMin(((exports, module) => {
		module.exports = {
			"ATTRS": [
				{
					"k": "tupo",
					"n": "体魄",
					"words": [
						[80, "龙精虎猛"],
						[55, "筋骨强健"],
						[25, "尚可劳碌"],
						[0, "形销体弱"]
					]
				},
				{
					"k": "wuli",
					"n": "武力",
					"words": [
						[80, "万夫不当"],
						[55, "骁勇善战"],
						[25, "习得武艺"],
						[0, "手无缚鸡"]
					]
				},
				{
					"k": "caixue",
					"n": "文才",
					"words": [
						[75, "军政两通"],
						[55, "知兵善断"],
						[35, "胸有丘壑"],
						[0, "见识平平"]
					]
				},
				{
					"k": "moulue",
					"n": "谋略",
					"words": [
						[80, "算无遗策"],
						[55, "深谋远虑"],
						[25, "粗通权变"],
						[0, "不谙机心"]
					]
				},
				{
					"k": "biancai",
					"n": "辩才",
					"words": [
						[80, "舌动九州"],
						[55, "口若悬河"],
						[25, "能言善对"],
						[0, "拙于言辞"]
					]
				},
				{
					"k": "caifu",
					"n": "财富",
					"words": [
						[70, "府库充盈"],
						[40, "粮草渐足"],
						[15, "尚可裹腹"],
						[0, "身无长物"]
					]
				},
				{
					"k": "shengwang",
					"n": "名声",
					"words": [
						[80, "天下景从"],
						[50, "名动郡县"],
						[25, "乡党称贤"],
						[0, "默默无闻"]
					]
				},
				{
					"k": "quanshi",
					"n": "权势",
					"words": [
						[80, "号令诸侯"],
						[50, "雄踞一方"],
						[25, "众至数万"],
						[0, "孤身一人"]
					]
				},
				{
					"k": "zhengji",
					"n": "政绩",
					"words": [
						[80, "功盖当世"],
						[55, "政绩斐然"],
						[25, "小有建树"],
						[0, "寸功未立"]
					]
				},
				{
					"k": "junxin",
					"n": "君心",
					"words": [
						[70, "万众归心"],
						[45, "将士用命"],
						[20, "人心初附"],
						[0, "离心离德"]
					]
				},
				{
					"k": "weiji",
					"n": "危机",
					"words": [
						[90, "命悬一线"],
						[70, "秦师压境"],
						[40, "暗流涌动"],
						[0, "岁月静好"]
					],
					"inverse": true
				}
			],
			"ATTR_NAMES": {
				"tupo": "体魄",
				"wuli": "武力",
				"caixue": "文才",
				"moulue": "谋略",
				"biancai": "辩才",
				"caifu": "财富",
				"shengwang": "名声",
				"quanshi": "权势",
				"zhengji": "政绩",
				"junxin": "君心",
				"weiji": "危机"
			},
			"INIT": {
				"tupo": 40,
				"wuli": 35,
				"caixue": 35,
				"moulue": 30,
				"biancai": 40,
				"caifu": 10,
				"shengwang": 12,
				"quanshi": 3,
				"zhengji": 0,
				"junxin": 18,
				"weiji": 10
			},
			"AGE": {
				"init": 35,
				"bands": [
					[36, -1],
					[37, -2],
					[200, -3]
				],
				"longevity": [[41, 1], [47, 2]]
			},
			"ILLNESS": {
				"cost": 3,
				"heal": 5,
				"onsetTupo": 5,
				"onsetWeiji": 3,
				"drainTupo": 2,
				"drainWeiji": 2,
				"death": {
					"ending": "E8",
					"variant": "baobing"
				}
			},
			"ACTION_RULES": { "diminish": false },
			"DIFFICULTY": {
				"story": {
					"n": "剧情",
					"wj": .6,
					"corr": .5,
					"coef": .8,
					"backtrack": -1,
					"lethal": false,
					"hideAttrs": false,
					"desc": "数值全可见，无限回溯，危机增长放缓，不会致死"
				},
				"normal": {
					"n": "普通",
					"wj": 1,
					"corr": 1,
					"coef": 1,
					"backtrack": 1,
					"lethal": true,
					"hideAttrs": false,
					"desc": "标准体验，每章可回溯一次"
				},
				"hardcore": {
					"n": "硬核",
					"wj": 1.2,
					"corr": 1.3,
					"coef": 1.25,
					"backtrack": 0,
					"lethal": true,
					"hideAttrs": true,
					"desc": "危机×1.2，无回溯，属性仅以状态词显示"
				}
			},
			"SCENARIO": {
				"id": "chensheng",
				"name": "陈胜 · 首义之局",
				"sub": "王侯将相宁有种乎",
				"era": "前 209 七月 — 前 208 腊月",
				"protag": "陈胜",
				"desc": "九百个必死的人点燃的天下，你能不能不让它六个月就烧完？",
				"recommend": "高难 · 首义线（建议通关后再来）"
			},
			"HIDDEN": {
				"init": 15,
				"name": "诸将离心",
				"showFrom": 3,
				"words": [
					[70, "众将解甲"],
					[50, "各怀异心"],
					[30, "骄气渐长"],
					[0, "众心如一"]
				]
			},
			"PERSIST": { "junxinFrom": 3 },
			"MERIT_MAP": {
				"首义": 10,
				"据陈": 12,
				"张楚": 20,
				"戏亭": 12,
				"荥阳": 10
			},
			"DEV_BANDS": [
				{
					"max": 20,
					"name": "循史",
					"color": "#7fa8a0"
				},
				{
					"max": 45,
					"name": "微澜",
					"color": "#c9a959"
				},
				{
					"max": 70,
					"name": "改流",
					"color": "#c97a3a"
				},
				{
					"max": 100,
					"name": "逆天",
					"color": "#b0432f"
				}
			],
			"ENDINGS": {
				"E1": {
					"name": "下城父之变",
					"seal": "循史",
					"cuncun": 50,
					"nitian": false,
					"devMax": 45,
					"ach": ["xiachufu", "shouyi"],
					"zhuan": "太史公曰：陈胜以九百戍卒，揭竿于大泽，数月而王张楚。当其时，天下云集响应，赢粮而景从，秦之社稷几为摇动。然骤得志者易骄，骤聚众者易散：周文自刭于渑池，吴广见杀于荥阳，田臧授首于敖仓。腊月，王走汝阴，御者庄贾杀之以降秦。王凡六月而亡。然其所置遣侯王将相，竟亡秦矣——首事之功，固不可以成败论也。",
					"brief": "揭竿六月而王，终死于御者之手，首事之功不灭"
				},
				"E2": {
					"name": "陇上归耕",
					"seal": "苟活",
					"cuncun": 100,
					"nitian": false,
					"zhuan": "太史公曰：阳城有佣耕者，尝息于陇上，怅恨久之，曰：苟富贵，无相忘。同伴笑之。后大泽兵起，或劝之往，不应，曰：吾牛尚在。及陈王败，佣者犹耕于阳城之野，岁饥则徙，岁丰则还。或问：鸿鹄之志安在？笑曰：在陇上。",
					"brief": "大泽兵起不应，终身佣耕于阳城，鸿鹄之志留在陇上"
				},
				"E3": {
					"name": "陈县富户",
					"seal": "苟活",
					"cuncun": 60,
					"nitian": false,
					"zhuan": "太史公曰：涉既据陈，不称王，不四出，缮甲积谷，与民休息。及章邯东出，涉散其众于乡，自携百金走沛中，为酒舍翁。后高祖过沛，与之饮，不知其对坐者谁也。涉闻之，但笑，终身不言大泽乡事。",
					"brief": "据陈而不王，散众为酒舍翁，终身不言大泽乡事"
				},
				"E4": {
					"name": "张楚中兴",
					"seal": "稳健",
					"cuncun": 85,
					"nitian": false,
					"devMin": 21,
					"ach": ["zhongxing"],
					"zhuan": "太史公曰：涉存吴广，宽司过之察，收诸将之心；周文不孤进，荥阳不分兵，章邯三攻陈而不能拔。及二世末年，诸侯并起，张楚岿然居其中，号令所及，响应如故。向使陈王早悟\"骤得志者易骄\"六字，张楚之业，岂止六月哉！",
					"brief": "存吴广收众心，章邯三攻不克，张楚岿然居中"
				},
				"E5": {
					"name": "王而不王",
					"seal": "稳健",
					"cuncun": 90,
					"nitian": false,
					"devMin": 21,
					"ach": ["buwang"],
					"zhuan": "太史公曰：涉据陈而三让王号，曰：楚后有在，吾不敢先。乃奉楚之遗胤，自为大将军以号令。诸侯闻之，高其义而归其诚。章邯破陈之日，涉麾帜南徙，师不乱而众不离。及汉兴，涉以首义之勋封于旧楚，寿终。让王者，王其实也。",
					"brief": "三让王号奉楚胤，以大将军号令诸侯，汉兴封于旧楚"
				},
				"E6": {
					"name": "直捣咸阳",
					"seal": "逆天",
					"cuncun": 70,
					"nitian": true,
					"devMin": 46,
					"zhuan": "太史公曰：周文之兵不入函谷，涉悉其锐，自将之，以吴广为副。冬十月，破函谷；十一月，军于灞上。二世大震，关东尽叛。秦失其鹿，天下共逐——而逐鹿者，大泽之戍卒也。或曰：使涉有此一役，汉无可言矣。",
					"brief": "亲提锐师破函谷，军于灞上，逐鹿者竟是大泽戍卒"
				},
				"E7": {
					"name": "诸侯之长",
					"seal": "逆天",
					"cuncun": 85,
					"nitian": true,
					"devMin": 46,
					"zhuan": "太史公曰：涉不王而约诸侯：赵立武臣，燕立韩广，齐魏各复其社稷，张楚为之长。章邯虽胜诸将，不能胜诸侯之并力。及秦亡，诸侯会于戏下，推涉为盟主，曰：首义者，当如是。涉辞曰：吾本佣耕，何德以堪？诸侯愈尊之。",
					"brief": "不王而约诸侯，张楚为长，戏下之会推为盟主"
				},
				"E8": {
					"name": "首义之殁",
					"seal": "败局",
					"cuncun": 10,
					"nitian": false,
					"zhuan": "太史公曰：涉之起也，以必死之心；涉之亡也，或不死于秦。或溃于戏亭，或殁于荥阳之帐，或劫于汝阴之夜，或擒于大泽之初。九百人的薪火，烧得起来，未必烧得长久——然薪尽之时，火已燎原。",
					"variants": {
						"xiting": {
							"name": "戏亭之溃",
							"zhuan": "太史公曰：周文提数十万之师，至关中戏亭，章邯起骊山之徒逆之。战不终日，楚师大崩，文自刭于渑池。孤军深入者，其锐不可恃也——函谷的天险，从来不认首义之名。",
							"brief": "孤军深入戏亭，一战大崩，函谷天险不认首义之名"
						},
						"yingyang": {
							"name": "荥阳之帐",
							"zhuan": "太史公曰：田臧与吴广争兵，矫王令而诛之，献首于陈。将帅相图之日，章邯已在敖仓磨刀。田臧旋亦败死。外患未至，萧墙先破——首义之师，半亡于秦，半亡于己。",
							"brief": "将帅相图矫令诛吴广，首义之师半亡于己"
						},
						"daze": {
							"name": "大泽之雨",
							"zhuan": "太史公曰：九百人屯于大泽，雨不止，吏索亡者急。或发其谋，二尉捕得陈胜吴广，立斩以徇。是岁大泽乡的雨，下透了整个秋天，无人记得。",
							"brief": "谋泄于大泽，二尉斩陈胜吴广，秋雨下透无人记"
						},
						"baobing": {
							"name": "病殁军中",
							"zhuan": "太史公曰：涉弃陈南走，师次汝阴，腊月风雪，王忽染沉疴。军中无医，药石不进，寒热交作，数日而殁于行幄之中——去下城父，尚一日程。御者庄贾怀刃侍侧，竟无所用其刀。或曰：天之亡涉，不借人手也。然王虽殁，其所置遣侯王将相，竟亡秦矣。",
							"brief": "南走途中染沉疴，殁于行幄，庄贾之刃竟无所用"
						},
						"zuzhu": {
							"name": "陈城之缚",
							"zhuan": "太史公曰：涉既苛察，诸将离心，令不出于帐下，众各怀去就。章邯兵至陈，无一人肯为王者战。亲将夜起，缚王及其家小，开门以献。槛车西入咸阳，王与其宗俱戮于市。——首义之名，诸侯犹敬之；张楚之众，已先弃其王。聚人者易，聚心者难；心既散矣，虽王不能独全。",
							"brief": "苛察失众心，亲将缚王献陈，槛车西入咸阳"
						},
						"cike": {
							"name": "御者之刃",
							"zhuan": "太史公曰：涉弃陈南走，师次汝阴，残兵数百，追兵衔尾不舍。御者庄贾掌缰日久，窥王众日散、色日惶，遂怀二心。腊月雪夜，车行下城父之野，四顾无灯，贾忽回刃，刺王于车中，携其首降秦。——以九百人倡天下者，卒死于一人之缰绳。然刃能断王者之命，不能断大泽之火也。",
							"brief": "腊月雪夜下城父，御者回刃刺王于车中，携首降秦"
						}
					},
					"brief": "以必死之心起事，薪尽之时，火已燎原"
				}
			},
			"CHAPTERS": [
				{
					"id": "c0",
					"title": "序章 ｜ 陇上鸿鹄",
					"sub": "教学章 · 前 209 春",
					"age": 35,
					"summaryNotes": [
						"【教学】上方十一维是你的命数。危机涨满之日，便是章邯的军旗压境之时。",
						"【教学】偏离度记你与史实的距离，只增不减：≤20 循史，21–45 微澜，46–70 改流，71 以上逆天。",
						"【教学】选项旁带\"史\"字者，是史书所载陈胜的本来面目。循之则稳，违之则波澜自生。",
						"【教学】岁月催人——体魄随年齿衰减。体魄高则延寿：寿元可逐点抵去当年的衰老之损，并压低发病之率（寿元与阈值见属性面板下方）。体魄低则易病：小病静养两轮自愈，大病须用「求医问药」。病至膏肓，体魄归零，便是殁时。"
					],
					"intro": [
						"始皇帝葬于骊山的那年，二世新立，坟土未干，徭役的簿子已经发到了郡县。天下像一口压了多年的锅，蒸汽顶着盖子响。",
						"你是⟦阳城⟧人，名胜，字涉。秦法把户口钉在闾左，你便给地主打短工——今日的饭，是今日的汗换的。这一日锄到陇上，你忽然停了手，拄锄望天，怅恨良久。同伴问你恨什么，你说：“苟富贵，无相忘。”声音不高，却像一把刀，把“富贵”两个字，从泥里剜了出来。",
						"满垄的人都笑了。笑声顺着陇沟滚过去，惊起两只雀。你没笑，把锄重新抡进土里——那句话说了，就收不回来了。"
					],
					"start": "0-1",
					"events": [
						{
							"id": "0-1",
							"title": "陇上之叹",
							"segs": ["“若为佣耕，何富贵也？”笑声从垄东传到垄西。你不辩，把锄从泥里拔出来，刮掉刃上的土——那动作里，没有怒，只有沉。", "远处官道上，戍卒与囚车不绝，鞭声一声接一声，像敲在谁的心上。你望着那线烟尘，叹道：“嗟乎，燕雀安知鸿鹄之志哉！”"],
							"options": [
								{
									"t": "笑而不辩，志在胸中",
									"hist": true,
									"res": "夜里你躺在草铺上，把那句话又掂了一遍——有些事，说出来是笑话，做出来就是惊雷。月光从茅屋顶的破洞漏下来，细细一缕，像一条别人看不见的路。",
									"eff": {
										"attrs": {
											"caixue": 3,
											"shengwang": 2
										},
										"dev": 0,
										"flags": ["honghu"],
										"ach": "honghu"
									},
									"to": "0-2"
								},
								{
									"t": "恼而掷锄",
									"res": "锄头砸进泥里，溅了半畦。同伴愣了愣，笑得更响了。你弯腰把锄拔出来，再没说话——只是那笑声，你记下了，像记一笔迟早要还的账。",
									"eff": {
										"attrs": {
											"shengwang": -2,
											"weiji": 2
										},
										"dev": 3
									},
									"to": "0-2"
								},
								{
									"t": "就此歇工，沽酒自遣",
									"res": "你提前收了工。酒肆里浊酒一碗，邻座压低声音：徭役名册下来了，阳城又在抽丁。你捏着碗，没接话——酒是苦的，消息更苦。",
									"eff": {
										"attrs": {
											"weiji": -2,
											"caifu": -2
										},
										"dev": 0
									},
									"to": "0-2"
								}
							]
						},
						{
							"id": "0-2",
							"title": "闾左之籍",
							"segs": ["乡里的徭役榜贴出来了：发闾左谪戍⟦渔阳⟧，九百人，七月启程。榜下的人越围越多，没人说话——静得能听见墨迹干透的声音。", "渔阳在北边，三千里。去时盛夏，到了就是严冬——往年戍边的人，十个里回不来三个。你挤进人群，在第二行看见了自己的名字，旁边注着两个字：屯长。"],
							"options": [
								{
									"t": "接籍为屯长",
									"hist": true,
									"res": "你接了那枚半块木的符。九百个人的生死，从此有一线系在你手上。里正斜眼看你：屯长，好自为之。你捏着那半块木，木纹粗粝，硌着手心——比锄头重得多。",
									"eff": {
										"attrs": {
											"quanshi": 3,
											"junxin": 3
										},
										"dev": 0
									},
									"to": "0-3"
								},
								{
									"t": "称病求免",
									"res": "里正把着你的脉门冷笑：装的也得去。榜文上的名字一个没动，倒多了一圈人围观你的笑话——那笑声，和垄上那天的，一模一样。",
									"eff": {
										"attrs": {
											"weiji": 3,
											"junxin": -2
										},
										"dev": 3
									},
									"to": "0-3"
								},
								{
									"t": "连夜亡去",
									"req": { "notflag": "honghu" },
									"res": "你跑了，一头扎进夜色里。通缉令三日后贴到乡亭——后来大泽乡火起，你也只是听人说起。那一跑，把那句“鸿鹄之志”跑丢了。",
									"eff": { "dev": 0 },
									"to": { "ending": "E2" }
								}
							]
						},
						{
							"id": "0-3",
							"title": "北上之路",
							"segs": ["九百人的队伍出了阳城。老小送到村口，哭声被押队的吏卒喝断。⟦吴广⟧，阳夏人，也是屯长——你和他头一回搭话，就很投缘。他问你恨不恨，你说恨，他笑了。", "官道向北，驿站的灯火一站比一站冷。夜里九百人挤在野庙里，鼾声与梦话此起彼伏——你听得出，梦里都在喊娘。"],
							"options": [{
								"t": "与吴广深谈",
								"hist": true,
								"res": "你们从徭役谈到苛法，从苛法谈到天下。吴广往火堆里添了根柴：这人心里的火都有一把，就差个引子。那夜之后，你多了一个可以托命的人。",
								"eff": {
									"attrs": {
										"junxin": 3,
										"caixue": 2,
										"biancai": 2
									},
									"dev": 0,
									"flags": ["wuguang"]
								},
								"to": "NEXT"
							}, {
								"t": "只带队，不多言",
								"res": "你把队伍带得整整齐齐，把话都咽在肚子里。押队的将尉夸你懂事，吴广的目光里却多了试探——这世道，话多的人死得快，可话少的人也未必活得久。",
								"eff": {
									"attrs": {
										"weiji": -2,
										"junxin": -2
									},
									"dev": 0
								},
								"to": "NEXT"
							}]
						}
					]
				},
				{
					"id": "c1",
					"title": "第一章 ｜ 大泽之雨",
					"sub": "前 209 七月 · 历史节点",
					"age": 35,
					"summaryNotes": ["鱼腹里的丹书，丛祠边的狐鸣——人心的引信，有时候得自己亲手造。", "两颗将尉的人头祭旗。大泽乡的火，从这一刻起就不归你一个人管了。"],
					"intro": ["七月的雨下疯了。行至⟦大泽乡⟧，浊流漫道，前路断绝——行期已误。秦法白纸黑字：失期，法皆斩。九百人，九百颗脑袋，都押在这场雨上。", "戍卒们缩在破庙里，盯着门外的雨帘。吴广坐到你身边，把蓑衣拧出一把水，看着你，等你说第一句话。"],
					"node": "N1",
					"mutations": [
						{
							"if": { "junxin": 45 },
							"flag": "zhongxin",
							"note": "【节点异变】九百人都看着你了——你平日攒下的人心，此刻都是柴。"
						},
						{
							"if": { "weiji": 50 },
							"flag": "lijian",
							"note": "【节点异变】县里已经在查逃亡名册了——留给你的不是雨天，是死期。"
						},
						{
							"if": { "devMin": 5 },
							"flag": "yuxie",
							"note": "【节点异变】有军吏在鱼市买到了带字的帛书——你的\"天意\"，提前漏了。"
						}
					],
					"start": "1-1",
					"events": [
						{
							"id": "1-1",
							"title": "失期皆斩",
							"segs": ["雨敲在破瓦上，三日不断，柴都是湿的，只冒烟，不起火。你和吴广并肩看雨。吴广说：“今亡亦死，举大计亦死——等死，死国可乎？”", "你听见自己说：“天下苦秦久矣。”五个字，你憋了半辈子，今夜终于说了出来。“吾闻二世不当立，当立者乃公子⟦扶苏⟧；⟦项燕⟧为楚将，楚人怜之——诈自称公子扶苏、项燕，为天下唱，宜多应者。”庙里静了，只剩雨声。"],
							"options": [
								{
									"t": "定计：诈称扶苏、项燕，为天下唱",
									"hist": true,
									"res": "吴广重重点头。雨声很大，大得刚好盖住两个屯长的密谋。从这一夜起，你俩说的每个字都是要掉脑袋的——可脑袋押对了地方，就不算押错。",
									"eff": {
										"attrs": {
											"caixue": 3,
											"junxin": 3,
											"moulue": 3
										},
										"dev": 0,
										"flags": ["fusu-ming"],
										"ach": "fusu"
									},
									"to": "1-2"
								},
								{
									"t": "再等等，雨停再议",
									"res": "雨不会停——你知道，吴广也知道。他看了你一眼，眼里的火暗了一分。庙门外，死期正踩着积水一步步走近。你听着雨声，竟有些希望这雨永远别停。",
									"eff": {
										"attrs": {
											"weiji": 5,
											"junxin": -3
										},
										"dev": 5
									},
									"to": "1-2"
								},
								{
									"t": "散了吧，各逃性命",
									"res": "“死则死耳，何苦举事？”吴广盯着你看了很久，转身走进雨里。九百人各自散去，像一把撒进泥里的粟——有些话不说出口，就再也没有机会说了。",
									"eff": { "dev": 0 },
									"to": { "ending": "E2" }
								}
							]
						},
						{
							"id": "1-2",
							"title": "鱼书狐鸣",
							"altSegs": {
								"flag": "yuxie",
								"segs": ["鱼市上已有军吏买到了带字的帛：你的把戏还没开场，风声先到了。你将计就计，丹帛照塞鱼腹，字却写得更淡，淡得像鱼腹中自生。", "夜深，⟦狐鸣⟧呼曰：“大楚兴，陈胜王——”放话的人、收声的人，这一回各有各的退路。第二天，军吏看你的眼神，也变了。"]
							},
							"segs": ["卜者眯着眼看你：“足下事皆成，有功。然足下卜之鬼乎？”这是教你先威众。于是⟦鱼书⟧丹帛曰“陈胜王”，塞入鱼腹，炊卒剖鱼得书，捧着帛满营走。", "夜深，丛祠边篝火明灭，⟦狐鸣⟧呼曰：“大楚兴，陈胜王——”第二天，戍卒们看你的眼神全变了——那背影，从此不是屯长的背影了。"],
							"options": [{
								"t": "因势利导，威服其众",
								"hist": true,
								"res": "有人对着你下拜了，头磕在泥里。天意这东西，三分靠造，七分靠人信。你什么都没承认，什么都没否认——原来“王”这个字，是让人先信，才有的。",
								"eff": {
									"attrs": {
										"shengwang": 8,
										"junxin": 5,
										"moulue": 3
									},
									"dev": 0,
									"flags": ["yushu"],
									"ach": "yushu"
								},
								"to": "1-3"
							}, {
								"t": "不用机巧，直告利害",
								"res": "你把失期当斩的律法一条条念给他们听，念一条，人群静一分。没有狐鸣，道理本身就是火——只是火起得慢，风还大。",
								"eff": {
									"attrs": {
										"junxin": 3,
										"caixue": 2,
										"shengwang": -3,
										"biancai": 3
									},
									"dev": 5
								},
								"to": "1-3"
							}]
						},
						{
							"id": "1-3",
							"title": "杀尉首义",
							"key": true,
							"segs": ["将尉醉酒，坐在庙堂上骂雨。吴广故意在阶下连声说要逃亡，一遍一遍，刚好钻进将尉的耳朵。尉拔剑而起，笞吴广——吴广咬着牙不还手，在等那柄剑自己送到手边。", "尉的剑脱手一瞬，吴广夺剑，斩之。你随之而上，并杀两尉。你召令徒属：“公等遇雨，皆已失期，失期当斩。且壮士不死即已，死即举大名耳——⟦王侯将相宁有种乎⟧！”最后九个字，你喊得连雨声都矮了一截。"],
							"options": [{
								"t": "袒右称大楚，为坛而盟",
								"hist": true,
								"res": "九百人袒露右臂，呼声震野。筑坛盟誓，祭以尉首——大泽乡的火点着了。你站在坛上，看着下面那些手臂都指向天，忽然想：原来这天，是可以用人声顶开的。",
								"eff": {
									"attrs": {
										"quanshi": 8,
										"shengwang": 8,
										"junxin": 5,
										"wuli": 3,
										"biancai": 3
									},
									"dev": 0,
									"flags": ["jiegan"],
									"merit": "首义",
									"ach": "jiegan"
								},
								"to": [
									{
										"if": { "anyflag": ["zhongxin", "yushu"] },
										"to": "NEXT"
									},
									{
										"if": { "junxin": 30 },
										"to": "NEXT"
									},
									{ "to": {
										"ending": "E8",
										"variant": "daze"
									} }
								]
							}, {
								"t": "杀尉而散，各奔东西",
								"res": "两颗人头落地，你忽然怕了。九百人哄然而散，各自亡命。县吏赶来时，只收走两具尉尸和一场空雨——九百个人，散得比雨还快。",
								"eff": {
									"attrs": {
										"weiji": 10,
										"wuli": 2
									},
									"dev": 5
								},
								"to": {
									"ending": "E8",
									"variant": "daze"
								}
							}]
						}
					]
				},
				{
					"id": "c2",
					"title": "第二章 ｜ 袒右称楚",
					"sub": "前 209 七月—八月",
					"age": 35,
					"summaryNotes": ["从九百人到数万人，只用了不到一个月。你会发现：收人易，收心难。", "旗号打出去了：公子扶苏之名，项燕之望，大楚之帜——天下苦秦久矣，就等这一声。"],
					"intro": ["你自立为将军，吴广为都尉。没有印绶，就刻木为印；没有旗鼓，就斩木为兵。攻大泽乡，收而攻蕲——蕲，下了。", "符离人葛婴将兵徇蕲以东，你自率主力西进：铚、酂、苦、柘、谯，皆下。行收兵，势如滚雪——昨日荷锄的人，今日荷戈。"],
					"start": "2-1",
					"events": [
						{
							"id": "2-1",
							"title": "滚雪收兵",
							"segs": ["每下一城，城门都是自己开的——城里的百姓把门闩拔了，等着你进去。城头换旗只用一炷香，县衙的案牍烧了三天。", "队伍从九百变成数万。老兵教你打仗，你教新兵立营——白天刀枪，夜里规矩。夜里巡营，灶火一眼望不到头。"],
							"options": [{
								"t": "严立军纪，秋毫无犯",
								"res": "你立下三条军令：不扰民，不私掠，不妄杀。犯令者斩了两个，全军肃然。百姓箪食壶浆，直往士卒怀里塞——塞的是粟米，也是人心。",
								"eff": {
									"attrs": {
										"shengwang": 5,
										"junxin": 5,
										"caixue": 2,
										"moulue": 2
									},
									"dev": 0
								},
								"to": "2-2"
							}, {
								"t": "从民所欲，不拘细行",
								"res": "义军嘛，粗一点才有烟火气——只是苦了城里人，门栓顶不住斧头。你夜里巡城，看见门缝里那些怯怯的眼睛，忽然想：这支队伍再这样下去，和秦军有什么两样？",
								"eff": {
									"attrs": {
										"caifu": 8,
										"shengwang": -3,
										"junxin": -3,
										"weiji": 3
									},
									"dev": 5
								},
								"to": "2-2"
							}]
						},
						{
							"id": "2-2",
							"title": "葛婴东来",
							"segs": ["⟦葛婴⟧徇地至东城，立⟦襄强⟧为楚王。他听说你这边也立了旗号，连夜来归——马跑到辕门时，鞍上的人几乎直不起腰。", "葛婴跪在帐中，把头抵在地上。诸将看着你：怎么处置？帐里静得能听见火把噼啪的声响。"],
							"options": [
								{
									"t": "责而赦之，收其兵符",
									"res": "你责其擅立，赦其死罪，收编其众。葛婴叩首服罪，诸将心服——不杀而降其众，这比杀人难，也比杀人有用。这世上，收一颗心，比杀十个都值。",
									"eff": {
										"attrs": {
											"quanshi": 5,
											"junxin": 3,
											"shengwang": 2,
											"moulue": 2
										},
										"dev": 0
									},
									"to": "2-3"
								},
								{
									"t": "立斩葛婴，以肃号令",
									"hist": true,
									"res": "葛婴的人头挂在辕门上，挂了三天。号令是肃了，归来的将领却都放轻了脚步。你夜里从辕门下过，抬头看见那颗头——人头挂得越高，人心走得越远。",
									"eff": {
										"attrs": {
											"quanshi": 5,
											"junxin": -5,
											"shengwang": -3
										},
										"dev": 0,
										"hist": -5,
										"zg": 5
									},
									"to": "2-3"
								},
								{
									"t": "纵其自守，约为犄角",
									"res": "你让葛婴仍守东城，互为声援。犄角是有了，号令从此是两套。吴广私下说：今日留一线，他日缝不上——你没接话。",
									"eff": {
										"attrs": {
											"quanshi": -3,
											"weiji": 5,
											"moulue": 2
										},
										"dev": 8
									},
									"to": "2-3"
								}
							]
						},
						{
							"id": "2-3",
							"title": "兵至陈城",
							"segs": ["比至陈，车六七百乘，骑千余，卒数万人。旌旗铺出去，把官道两旁的野地都遮了。陈郡的守令都跑了，守丞战死在谯门楼下。", "你勒马谯门下。这地方是楚的旧都，城砖比别处厚——街上的老人看你的旗，看了很久，久得像在替楚国的先人们，看这面旗值不值。"],
							"options": [
								{
									"t": "入据陈，开仓抚民",
									"hist": true,
									"res": "仓开了，粟香漫了半条街。陈人奔走相告：张楚的旗，竖在谯门上了。你站在谯门上，看满城的人涌向粮仓——这一仓粟，喂的不是肚子，是人心。",
									"eff": {
										"attrs": {
											"caifu": 10,
											"shengwang": 5,
											"junxin": 5
										},
										"dev": 0,
										"merit": "据陈",
										"ach": "tanyou"
									},
									"to": "NEXT"
								},
								{
									"t": "纵兵三日，以犒士卒",
									"res": "三日狂欢，酒气熏得谯门楼的旗都打蔫。士卒痛快了，陈人的眼泪也流干了。原来打天下，最难的不是攻城，是管住自己人手里那把火。",
									"eff": {
										"attrs": {
											"caifu": 12,
											"shengwang": -8,
											"junxin": -5
										},
										"dev": 5,
										"hist": -10
									},
									"to": "NEXT"
								},
								{
									"t": "亲冒矢石，先登陷阵",
									"req": { "wuli": 42 },
									"res": "你亲执旗鼓先登，反手一矛把守丞挑下了城。城破那刻，数万人的呼声从脚下滚过去——他们记住的不只是张楚的旗，是你第一个站上城头的影子。",
									"eff": {
										"attrs": {
											"wuli": 2,
											"quanshi": 2,
											"shengwang": 3,
											"junxin": 2,
											"weiji": 4,
											"tupo": -2
										},
										"dev": 0
									},
									"to": "NEXT"
								}
							]
						}
					]
				},
				{
					"id": "c3",
					"title": "第三章 ｜ 陈县称王",
					"sub": "前 209 八月 · 历史节点",
					"age": 35,
					"summaryNotes": ["三老、豪杰都来会计事。他们说：将军功宜为王。", "王号这个东西，戴上是旗，摘下来是靶——戴不戴，你只有这一夜可以想。"],
					"intro": ["据陈数日，你号令召⟦三老⟧、豪杰与皆来会计事。堂设在新占的郡府，秦吏的印绶还扔在廊下，没人捡。", "堂下黑压压跪了一片：“将军身被坚执锐，伐无道，诛暴秦，复立楚国之社稷——功宜为王。”王号两个字，在每个人舌尖上滚。"],
					"node": "N1",
					"mutations": [{
						"if": { "shengwang": 45 },
						"flag": "zhongqing",
						"note": "【节点异变】陈地父老连夜绣好了王旗——民心已经替你把答案写好了。"
					}, {
						"if": { "devMin": 35 },
						"flag": "yidi",
						"note": "【节点异变】有人从南边来：楚之遗胤景驹，正在联络旧臣——\"楚后\"两个字，忽然变得烫手。"
					}],
					"start": "3-1",
					"events": [{
						"id": "3-1",
						"title": "立为王，号张楚",
						"key": true,
						"altSegs": {
							"flag": "yidi",
							"segs": ["角落里有旧臣低声说：⟦景驹⟧在南边，自称楚后，正在联络旧臣。“楚后”两个字一出来，堂上的热气凉了一截。", "你抬手，满堂俱静。王，还是不王——"]
						},
						"segs": ["堂上的劝进声一浪高过一浪。吴广站在阶下，不说话——王号这个东西，戴上是旗，摘下来是靶，九百人里爬出来的人，最懂这个。", "你抬手，满堂俱静。所有的目光都聚在那只握锄头的手上——王，还是不王？你听见窗外的风，忽然想起垄上那天的笑声。"],
						"options": [
							{
								"t": "自立为王，号张楚",
								"hist": true,
								"res": "你受了王号，改元⟦张楚⟧。当夜陈城举火如昼，诸郡县刑其长吏，杀之以应——天下真的动了。垄上的笑声该停了，可它只是换了个方向，从垄上传到了咸阳。",
								"eff": {
									"attrs": {
										"quanshi": 12,
										"shengwang": 8,
										"junxin": 5,
										"weiji": 5,
										"zhengji": 5
									},
									"dev": 0,
									"merit": "张楚",
									"ach": "zhangchu"
								},
								"to": "3-2"
							},
							{
								"t": "三让王号，奉楚后行号令",
								"req": { "shengwang": 35 },
								"res": "“楚后有在，吾不敢先。”你拜了大将军印，奉楚遗胤正朔。满堂愕然之后，有人老泪纵横。让出去的是王号，收回来的是人心。",
								"eff": {
									"attrs": {
										"shengwang": 8,
										"junxin": 8,
										"quanshi": -3,
										"moulue": 3
									},
									"dev": 12,
									"flags": ["buwang"],
									"hist": 15,
									"ach": "buwang"
								},
								"to": "3-2"
							},
							{
								"t": "暂缓王号，先定根本",
								"res": "“王号不急，根基先固。”劝进的人悻悻而退，吴广却松了口气，夜里来见你，只说了一句：这一步，走得稳。王号是花，根基是土——花可以晚开，土不能先松。",
								"eff": {
									"attrs": {
										"weiji": -3,
										"junxin": -3,
										"moulue": 2
									},
									"dev": 5
								},
								"to": "3-2"
							}
						]
					}, {
						"id": "3-2",
						"title": "号令四方",
						"segs": ["称王（或为大将军）的檄文发往各郡。⟦武臣⟧北徇赵地，周市北徇魏地，吴广西击荥阳，周文提大军西击秦——四路大军，像四支射出去的箭。", "军报雪片一样飞回陈城，案上的舆图一天一个模样。捷报里夹着隐忧：徇地的将领走到哪，就把自己的旗插到哪。"],
						"options": [
							{
								"t": "四路并出，以张声势",
								"hist": true,
								"res": "檄文所至，烽燧相望。武臣自立为赵王，韩广为燕王，魏咎为魏王，周市为齐王——王旗一面接一面，都出自你的帐下。天下人只认旗，不认主。",
								"eff": {
									"attrs": {
										"shengwang": 8,
										"quanshi": 5,
										"weiji": 5,
										"moulue": 2
									},
									"dev": 0
								},
								"to": "NEXT"
							},
							{
								"t": "缓图之：先固陈楚根本",
								"res": "你把三路兵符都压了一压，只放周文一路西行。声势是小了些，陈城的根基却一日厚过一日。让他们骂吧——骂声是风，根基是树，风再大，树先立着就倒不了。",
								"eff": {
									"attrs": {
										"quanshi": 3,
										"weiji": -5,
										"junxin": 3,
										"shengwang": -3,
										"moulue": 2
									},
									"dev": 5
								},
								"to": "NEXT"
							},
							{
								"t": "约诸侯并力，自为盟主",
								"req": { "anyflag": ["buwang", "zhongqing"] },
								"res": "你的使者带的是厚礼而非檄文：不立君臣，只约并力，灭秦之日再论名分。赵燕齐魏都回了好话——这天下的事，有时候弯腰比抬头走得远。",
								"eff": {
									"attrs": {
										"shengwang": 5,
										"junxin": 5,
										"biancai": 3
									},
									"dev": 10,
									"flags": ["lianzhu"]
								},
								"to": "NEXT"
							},
							{
								"t": "亲说诸将，以聚其心",
								"req": { "biancai": 45 },
								"res": "你不发檄文，亲自登坛：“王侯将相，宁有种乎！”坛下数万条嗓子接了过去，声浪滚过陈城的屋脊——这句话说一遍是口号，说一千遍，就是火种。",
								"eff": {
									"attrs": {
										"biancai": 3,
										"junxin": 4,
										"shengwang": 3
									},
									"dev": 5
								},
								"to": "NEXT"
							}
						]
					}]
				},
				{
					"id": "c4",
					"title": "第四章 ｜ 诸将四出",
					"sub": "前 209 九月—十一月 · 历史节点",
					"age": 35,
					"summaryNotes": ["周文的大军已经进逼函谷。而你的朝堂上，朱房、胡武的\"司过\"之名，一天比一天响。", "外面的仗在赢，里面的病在长——你看不清哪一样先发作。"],
					"intro": ["⟦周文⟧（周章）提数十万大军，已经叩关。函谷关内，咸阳第一次听见了大泽乡的名字。", "与此同时，你设朱房为中正、胡武为司过，主司群臣——捷报与罪状在案上各垒半尺，一边写着破城，一边写着系狱。夜深时你翻检两遍，吹了灯，还是没个先后。"],
					"node": "N2",
					"mutations": [{
						"if": { "flag": "kuancha" },
						"flag": "kuancha2",
						"note": "【节点异变】你的宽政先一步传了出去——徇地的将领们，这次回来得格外快。"
					}, {
						"if": { "devMin": 40 },
						"flag": "zhanghan",
						"note": "【节点异变】历史提前了：章邯的骊山军，已经出了函谷。"
					}],
					"start": "4-1",
					"events": [
						{
							"id": "4-1",
							"title": "周文叩关",
							"key": true,
							"altSegs": {
								"flag": "zhanghan",
								"segs": ["周文军至⟦戏亭⟧，兵数十万——而关中来的第一封军报不是捷报：⟦章邯⟧的骊山军，已经出了函谷。历史比你的军报，跑快了一程。", "周文的兵书到了：敌锋已至，请速发援兵，并力决之。而章邯的先锋，距信使只差半日。"]
							},
							"segs": ["周文军至⟦戏亭⟧，兵数十万，函谷关内大震。二世以⟦章邯⟧为将，免⟦骊山徒⟧、奴产子，悉发以击楚——几十万刑徒一夜之间从坟工地上拿起了戈。", "周文的兵书到了：请速发援兵，并力破关。字里行间的墨都是飞白的——信使从戏亭到陈城，跑死了两匹马，腿肚子还在打颤。"],
							"options": [
								{
									"t": "发援兵并力西进，直捣咸阳",
									"res": "你悉发陈中之锐，亲自督战西进。这一注，押的是整个张楚。出兵那日，陈城万人空巷——此去要么咸阳，要么没有要么。回头看一眼谯门上的旗，旗若还在，家就还在。",
									"eff": {
										"attrs": {
											"weiji": 20,
											"quanshi": 15,
											"wuli": 3,
											"tupo": 2
										},
										"dev": 25
									},
									"to": [{
										"if": {
											"quanshi": 40,
											"caixue": 45,
											"devMin": 46
										},
										"to": { "ending": "E6" }
									}, { "to": "4-1b" }]
								},
								{
									"t": "令周文持重，勿孤军深入",
									"res": "你令周文屯兵戏亭，待诸路并至。周文回书只四个字：机不可失。你捏着那四个字，一夜没睡好——你知道他说得对，可你也知道，你输不起。",
									"eff": {
										"attrs": {
											"weiji": 5,
											"caixue": 3,
											"moulue": 3
										},
										"dev": 5
									},
									"to": "4-2"
								},
								{
									"t": "听其自战，不置可否",
									"hist": true,
									"res": "你没有发一兵一卒。两个月后，戏亭败报先到：周文败走出关，自刭于⟦渑池⟧，军遂不战。你看着案上的舆图，在“戏亭”两个字上重重按了一下，按到指尖发麻。",
									"eff": {
										"attrs": {
											"quanshi": -8,
											"shengwang": -5,
											"weiji": 10
										},
										"dev": 0,
										"hist": -5,
										"merit": "戏亭"
									},
									"to": "4-2"
								}
							]
						},
						{
							"id": "4-1b",
							"title": "戏亭",
							"segs": ["函谷关下，章邯的骊山军阵列如山，甲光连成一片灰。你的兵虽众，阵却乱了——人多，心不齐，脚就乱。", "骊山之徒本是亡命，人人想拿战功换自由身；你的数十万，大半是上月才放下锄头的农夫，握戈的手还在抖。第一次接战，前锋就退了三里。"],
							"options": [{
								"t": "鸣金收兵，退保曹阳",
								"res": "你抢在崩溃前收住阵脚，且战且退，退保曹阳。败是败了，军队还在——这一退，退得体面。坐在曹阳城墙上看着溃卒归营：只要人还在，败就不算败。",
								"eff": {
									"attrs": {
										"quanshi": -8,
										"weiji": 12,
										"shengwang": -3,
										"wuli": 2,
										"moulue": 2,
										"tupo": -2
									},
									"dev": 0,
									"merit": "戏亭"
								},
								"to": "4-2"
							}, {
								"t": "死战不退",
								"res": "战至日暮，戏亭的黄土被血浸成黑色。溃兵踩着自己的旗往东逃，函谷关的晚霞红得过分。你被人架着后撤——这一仗输的不是兵，是时机，时机输一次，就再也借不回来。",
								"eff": {
									"attrs": {
										"weiji": 25,
										"wuli": 3,
										"tupo": -3
									},
									"dev": 5
								},
								"to": [{
									"if": {
										"caixue": 60,
										"weijiMax": 79
									},
									"to": { "ending": "E6" }
								}, { "to": {
									"ending": "E8",
									"variant": "xiting"
								} }]
							}]
						},
						{
							"id": "4-2",
							"title": "司过之察",
							"segs": ["朱房、胡武拿着“司过”的符节，把徇地归来的将领一个个系狱问罪。狱门比宫门还忙，进出的都是刚打胜仗的人。", "诸将班师，先进的不是你的宫门，是朱房的狱门。吴广从荥阳前线送回一句话：诸将以其故不亲附——王，该醒醒了。"],
							"options": [
								{
									"t": "信用如故，苛察为忠",
									"hist": true,
									"res": "你压下了吴广的话，说苛察即忠。从此诸将回陈城都绕着朱房的门走。你坐在殿上看着空荡荡的堂：什么时候起，满朝的人都学会了不说话？",
									"eff": {
										"attrs": {
											"junxin": -10,
											"shengwang": -5,
											"weiji": 5
										},
										"dev": 0,
										"hist": -8,
										"zg": 15
									},
									"to": "NEXT"
								},
								{
									"t": "黜朱房胡武，行宽察之政",
									"res": "你罢了二人的司过，亲为诸将解缚设酒。有人当场哭了。那夜的酒很淡，话很热——原来人心这东西，用刑是收不来的，要用手，用酒，用一句“委屈你了”。",
									"eff": {
										"attrs": {
											"junxin": 8,
											"shengwang": 5,
											"caixue": 2,
											"moulue": 2
										},
										"dev": 10,
										"flags": ["kuancha"],
										"hist": 10,
										"ach": "kuancha"
									},
									"to": "NEXT"
								},
								{
									"t": "留其名，收其权",
									"res": "司过的牌子还在，手却伸不进来了——竹简照旧抬进院子，只是再没人拆。你坐在灯下把玩那两枚符节：这世上的权柄，留着名，比真握着更稳。",
									"eff": {
										"attrs": {
											"junxin": 3,
											"weiji": -3,
											"moulue": 3
										},
										"dev": 5
									},
									"to": "NEXT"
								}
							]
						}
					]
				},
				{
					"id": "c5",
					"title": "第五章 ｜ 戏亭与荥阳",
					"sub": "前 209 十二月 · 历史节点 · 全剧本枢纽",
					"age": 35,
					"summaryNotes": ["章邯破了戏亭，下一个就是荥阳。而荥阳城里，田臧的刀，比章邯的更快。"],
					"intro": ["章邯起骊山之徒，破周文于戏亭，东出函谷。吴广围⟦荥阳⟧不下——坚城在前，强敌在后，军心像一张拉满的弓弦。", "⟦田臧⟧与他争兵权，帐里的火药味一天比一天浓。你的案头，摆着田臧的密报——字不多，每个字都淬了毒。"],
					"node": "N3",
					"start": "5-1",
					"events": [
						{
							"id": "5-1",
							"title": "章邯东来",
							"segs": ["戏亭一破，章邯的兵锋直指荥阳。荥阳城下，吴广的营盘扎了两个月，士卒的靴底都磨穿了，城头还是没有要开的意思。", "田臧在军前放话：今假王骄，不知兵权，不可与计——他嘴里的假王，说的是你。话传到陈城时，满朝没人接茬。"],
							"options": [
								{
									"t": "以王命切责田臧",
									"res": "你的诏书到荥阳时，田臧正在擦刀。使者回报说他接诏很恭敬——恭敬得叫人心里发毛。这世上有两种恭敬，一种是心里服，一种是刀上亮；田臧的，是后一种。",
									"eff": {
										"attrs": {
											"weiji": 8,
											"junxin": -3,
											"caixue": 2
										},
										"dev": 5
									},
									"to": "5-2"
								},
								{
									"t": "亲赴荥阳，调和诸将",
									"res": "你单骑入荥阳大营。田臧出帐相迎，笑得恭敬，刀却在帐后。吴广迎你的时候，手一直按着你的缰绳——他在用那只手，替你把命牵着。",
									"eff": {
										"attrs": {
											"weiji": 10,
											"junxin": 3,
											"shengwang": 3,
											"tupo": 2,
											"biancai": 2
										},
										"dev": 8
									},
									"to": "5-2"
								},
								{
									"t": "不问，坐观成败",
									"hist": true,
									"res": "你把田臧的密报压在案底，压了三天。几天后荥阳军报：田臧矫王令，诛吴广，献首于陈。你认出那是大泽乡雨夜并肩看雨的人——有些债，隔着一千里也要还，只是方式由不得你挑。",
									"eff": {
										"attrs": { "weiji": 5 },
										"dev": 0,
										"rmflags": ["wuguang"],
										"hist": -8,
										"zg": 10
									},
									"to": "5-2"
								}
							]
						},
						{
							"id": "5-2",
							"title": "荥阳之帐",
							"key": true,
							"altSegs": {
								"flag": "wuguang",
								"segs": ["田臧矫你的令，持剑入吴广帐。吴广没有拔剑——他在等你一句话。", "烛火跳了一下。田臧的剑尖抵着案，话却说得冠冕：奉王令，诛不知兵者。你的军使，此刻就在帐外。"]
							},
							"segs": ["田臧与诸将谋曰：“周章军已破矣，秦兵旦暮至——今假王骄，不知兵权，非诛之，事恐败。”帐里没人反对——刀已经出了鞘，话只是说给史官听的。", "吴广帐中还亮着灯。他大约还在等陈城来的王命——他等的那道王命，此刻正在田臧的刀鞘里睡觉。"],
							"options": [
								{
									"t": "听之任之，以田臧为上将",
									"hist": true,
									"res": "你认下这颗人头，赐田臧楚令尹印，使为上将。印绶送出那天，陈城将校噤若寒蝉。章邯已击田臧于敖仓，荥阳之众皆溃——那一夜若多问一句，风向会不会不一样？可世上没有“若”。",
									"eff": {
										"attrs": {
											"quanshi": -10,
											"shengwang": -8,
											"junxin": -8,
											"weiji": 12
										},
										"dev": 0,
										"hist": -8,
										"merit": "荥阳"
									},
									"to": "NEXT"
								},
								{
									"t": "立诛田臧，以安吴广",
									"req": {
										"anyflag": ["wuguang", "kuancha"],
										"junxin": 50
									},
									"res": "你的使者先一步进帐，当帐验令：田臧矫令，立斩以徇。田臧的剑只出了一半。吴广看着你，良久，拜于帐下——这一刀，斩的是“君臣”两个字里那颗没凉透的心。",
									"eff": {
										"attrs": {
											"junxin": 8,
											"shengwang": 5,
											"weiji": 8,
											"moulue": 3
										},
										"dev": 12,
										"hist": 15,
										"ach": "wuguang"
									},
									"resFail": "你的使者没能走出田臧的大帐。第二天，田臧的军报照旧恭顺，刀却已磨亮。一道令出不了营门，就只是一张纸——纸上的字，救不了任何人。",
									"effFail": { "attrs": {
										"weiji": 8,
										"junxin": -3
									} },
									"to": "NEXT"
								},
								{
									"t": "分田臧兵，调其守陈",
									"res": "你把田臧调回陈城听用，荥阳军务仍归吴广。田臧接令时笑了一声，你听不出那是什么意思。有些棋，走一步是活，走两步是死——可棋盘上，从来不等人想清楚。",
									"eff": {
										"attrs": {
											"weiji": 10,
											"junxin": -3,
											"moulue": 3
										},
										"dev": 8
									},
									"to": "5-2b"
								}
							]
						},
						{
							"id": "5-2b",
							"title": "田臧反噬",
							"segs": ["田臧接到调令的当夜，拔剑斩了来使。使者的首级被他遣人送回陈城，附一句话：将在外，君命有所不受。", "他举兵向陈，沿路裹挟溃卒，旗号打的是“清君侧”。你与田臧之间，再无转圜——舆图上那道从荥阳伸向陈城的线，一日比一日粗。"],
							"options": [{
								"t": "亲征田臧",
								"res": "你亲提陈中之兵东向。内战的箭，射出去就收不回了。两军相望于野，旗是一样的旗，口音是一样的口音——都是自己从大泽乡带出来的人。最苦的事，莫过于自己人的刀，架在自己人的脖子上。",
								"eff": {
									"attrs": {
										"weiji": 15,
										"quanshi": -5,
										"wuli": 3,
										"tupo": -2
									},
									"dev": 10
								},
								"to": [{
									"if": {
										"quanshi": 45,
										"weijiMax": 79
									},
									"to": "NEXT"
								}, { "to": {
									"ending": "E8",
									"variant": "yingyang"
								} }]
							}]
						}
					]
				},
				{
					"id": "c6",
					"title": "第六章 ｜ 腊月",
					"sub": "前 208 腊月",
					"age": 36,
					"summaryNotes": ["史书行到此处，只剩最后一页。汝阴的雪，下城父的夜，都在这一页里。"],
					"intro": ["敖仓破，荥阳溃，章邯乘胜击陈。腊月，陈地落了第一场雪，落在一座空了大半的城上。", "你的张楚，从九百人到数十万，又从数十万回到眼前这点残兵——六个月，像一场大梦。梦醒时分，谯门上的王旗还在，只是看旗的人越来越少了。"],
					"start": "6-1",
					"events": [
						{
							"id": "6-1",
							"title": "陈城之守",
							"segs": ["章邯兵临陈城。守，是瓮中之鳖；走，是崩解之始。府库的粮还能支一月，人心支不了一月——夜里逃卒的名单，一天比一天长。", "诸将看着你，等最后一道王命。殿上的烛火燃了大半，你的影子在墙上忽长忽短，像一个人在做最后的丈量。"],
							"options": [{
								"t": "弃陈南走，退保汝阴",
								"hist": true,
								"res": "你弃了陈城。出城门时回头看了一眼，谯门上的张楚大旗在雪里烧了起来。这面旗烧了，还会有别的旗立起来——只是不知道，立旗的人还记不记得大泽乡那夜的雨。",
								"eff": {
									"attrs": {
										"weiji": 15,
										"quanshi": -8,
										"shengwang": -5,
										"tupo": -2
									},
									"dev": 0
								},
								"to": "6-2"
							}, {
								"t": "据城死战",
								"res": "你把王旗插上谯门，亲自擂鼓。城破之日，雪是红的。你握着旗杆站在谯门楼顶，看着城下涌进来的灰潮——这一战，守的是“王侯将相宁有种乎”那句话，它比城结实，比血也结实。",
								"eff": {
									"attrs": {
										"weiji": 25,
										"shengwang": 5,
										"wuli": 3,
										"tupo": -3
									},
									"dev": 15
								},
								"to": [{
									"if": {
										"quanshi": 40,
										"weijiMax": 74
									},
									"to": "6-2"
								}, { "to": { "ending": "E8" } }]
							}]
						},
						{
							"id": "6-2",
							"title": "下城父",
							"key": true,
							"altSegs": {
								"flag": "kuancha2",
								"segs": ["腊月，你至汝阴，还至⟦下城父⟧。残兵不过数百，沿途坞壁大多闭了门——唯有几处寨子，夜里悄悄递出热食与干薪，他们还认得当年从司过院里被解缚出来的人。", "这一夜，你的御者⟦庄贾⟧替你驾车，走上了一条没有灯的小路。雪粒子打在车帷上，沙沙地响。"]
							},
							"segs": ["腊月，你至汝阴，还至⟦下城父⟧。残兵不过数百，沿途的坞壁都闭了门——半年前箪食壶浆的地方，如今只从墙头探出眼睛。", "你的御者⟦庄贾⟧，连日来勒马的手越来越紧。这一夜，他替你驾车，走上了一条没有灯的小路——雪粒子打在车帷上，沙沙地响。"],
							"options": [
								{
									"t": "不疑，仍使驾车",
									"hist": true,
									"res": "庄贾的刀从背后进来时，你听见雪落在车辕上的声音。陈胜王，凡六月。然薪尽之时，火已燎原——你置遣的侯王将相，正从四面八方替你烧完剩下的路。火不会灭，只是换个人举着它，继续走。",
									"eff": {
										"attrs": [],
										"dev": 0,
										"hist": 40
									},
									"to": { "ending": "E1" }
								},
								{
									"t": "察其异，先收其刃",
									"req": { "moulue": 50 },
									"res": "你按住了庄贾的手。刀跌在车板上，他跪下去磕头——原来人心，也是可以失期的。你没杀他：这雪夜的路，还是你来赶。只是这一路，你枕下的剑再没有离过手。",
									"eff": {
										"attrs": {
											"weiji": 10,
											"wuli": 2,
											"moulue": 2
										},
										"dev": 15
									},
									"to": [{
										"if": {
											"anyflag": ["wuguang", "buwang"],
											"weijiMax": 84
										},
										"to": "6-3"
									}, { "to": { "ending": "E8" } }]
								},
								{
									"t": "弃车易服，孤身夜遁",
									"res": "你解下王者的印绶，走进雪夜。天亮时雪停了，路上只有一串往南的脚印，越走越浅。王号可以丢，那句“无相忘”，你记了一辈子——它跟着你，走进了这一片大雪。",
									"eff": {
										"attrs": {
											"weiji": -10,
											"quanshi": -10,
											"tupo": -2
										},
										"dev": 20
									},
									"to": { "ending": "E3" }
								}
							]
						},
						{
							"id": "6-3",
							"title": "南徙之旗",
							"segs": ["你稳住了身边最后的人心。章邯得了陈城，却追不上你的旗号——雪原上，那面褪色的张楚旗始终在南移。", "南徙的路上，武臣的赵军、项梁的楚师都遣使来迎——首义之名，还有人认。使者的马队在雪地里排开，像一道还没写完的句子。"],
							"options": [{
								"t": "南下合流，再图大举",
								"res": "你的旗与楚师并在一处。项梁出营三十里相迎，两军在雪地里会师，呼声惊起整片林子的寒鸦。天下的大火，从来不是一个人烧起来的——它要很多只手，很多把柴。而你，只是先点了第一把的那个人。",
								"eff": {
									"attrs": {
										"weiji": -10,
										"tupo": -2
									},
									"dev": 20
								},
								"to": [
									{
										"if": {
											"flag": "lianzhu",
											"shengwang": 55,
											"devMin": 46
										},
										"to": { "ending": "E7" }
									},
									{
										"if": { "flag": "buwang" },
										"to": { "ending": "E5" }
									},
									{ "to": { "ending": "E4" } }
								]
							}]
						}
					]
				}
			],
			"CORRECTIONS": [
				{
					"minDev": 21,
					"maxDev": 45,
					"chance": .3,
					"title": "修正 ｜ 乡里流言",
					"segs": [
						"【历史修正】你的家乡阳城，开始有人编排你：佣耕之辈，也配为王？",
						"连陇上那日的笑，都被翻出来加了盐：瞧，那时候就显了狂相。",
						"你改动的那几步，都有人眼红。旧账不怕没人翻，只怕没人记得。"
					],
					"eff": {
						"attrs": { "shengwang": -5 },
						"dev": 0
					}
				},
				{
					"minDev": 21,
					"maxDev": 45,
					"chance": .3,
					"title": "修正 ｜ 小股哗变",
					"segs": [
						"【历史修正】一支新附的小队夜里开了小差，走时卷走了两仓粮。",
						"守仓的卒子追出十里，只捡回几双跑掉的草鞋。",
						"你聚人聚得太快，快到来不及看清每个人的脸。"
					],
					"eff": {
						"attrs": {
							"caifu": -5,
							"weiji": 3
						},
						"dev": 0
					}
				},
				{
					"minDev": 21,
					"maxDev": 45,
					"chance": .3,
					"title": "修正 ｜ 旧部离心",
					"segs": [
						"【历史修正】一名大泽乡旧卒留书出走：\"将军非复大泽乡之将军矣。\"",
						"字迹笨拙，末尾却画了一把锄头——当年陇上的记号。",
						"你改道的每一步，旧日同袍都在重新打量你。"
					],
					"eff": {
						"attrs": {
							"shengwang": -4,
							"weiji": 2
						},
						"dev": 0
					}
				},
				{
					"minDev": 46,
					"maxDev": 70,
					"chance": 1,
					"title": "修正 ｜ 诸将争功",
					"segs": [
						"【历史修正】徇地诸将为争城争功，在陈城朝堂上当堂拔剑。",
						"甲叶相撞，佩剑出鞘半尺，被你一声喝止——剑回去了，怨没回去。",
						"你改动的封赏次序，动的都是他们的位置。"
					],
					"eff": {
						"attrs": {
							"weiji": 12,
							"junxin": -5
						},
						"dev": 0
					}
				},
				{
					"minDev": 46,
					"maxDev": 70,
					"chance": 1,
					"title": "修正 ｜ 秦廷悬赏",
					"segs": ["【历史修正】咸阳贴出悬赏：购陈胜首，金千斤，邑万家。", "告示抄本传到军中，士卒传看，看完都沉默——你的名字，比你的兵走得更远了。"],
					"eff": {
						"attrs": {
							"weiji": 12,
							"shengwang": -4
						},
						"dev": 0
					}
				},
				{
					"minDev": 46,
					"maxDev": 70,
					"chance": 1,
					"title": "修正 ｜ 盟友观望",
					"segs": ["【历史修正】武臣、韩广的使者渐渐不来了。", "共主的信使，在他们门口一等就是三天。门吏回话永远客气，永远没有下文。"],
					"eff": {
						"attrs": {
							"junxin": -6,
							"shengwang": -4
						},
						"dev": 0
					}
				},
				{
					"minDev": 71,
					"maxDev": 100,
					"chance": 1,
					"title": "修正 ｜ 天命反噬",
					"segs": [
						"【历史修正】你改得太多：檄文、谣言、密报从四面八方压向陈城。",
						"连市井的童谣都变了调，唱的还是大泽乡，词已经不是你的词。",
						"历史在用所有人的手，把你推回下城父的小路。"
					],
					"eff": {
						"attrs": {
							"weiji": 18,
							"junxin": -8
						},
						"dev": 0
					}
				},
				{
					"minDev": 71,
					"maxDev": 100,
					"chance": 1,
					"title": "修正 ｜ 章邯提前",
					"segs": [
						"【历史修正】章邯的先锋比军报早到了三天。",
						"斥候回营时马口吐白沫，说秦军的灶烟，已经望得见影子了。",
						"你的时间，被提前支取了一部分。"
					],
					"eff": {
						"attrs": {
							"weiji": 16,
							"caifu": -8
						},
						"dev": 0
					}
				},
				{
					"minDev": 71,
					"maxDev": 100,
					"chance": 1,
					"title": "修正 ｜ 骄纵传染",
					"segs": [
						"【历史修正】连最老成的大泽乡旧部，也学会了居功而骄。",
						"营里开始有人比官印、比宅子、比谁当年离陈王更近。",
						"骄这东西，比秦军的箭传得还快。"
					],
					"eff": {
						"attrs": { "weiji": 14 },
						"zg": 8,
						"dev": 0
					}
				}
			],
			"ACHIEVEMENTS": {
				"honghu": "鸿鹄之志",
				"fusu": "扶苏之名",
				"yushu": "鱼书狐鸣",
				"jiegan": "揭竿而起",
				"tanyou": "袒右称楚",
				"zhangchu": "张楚",
				"buwang": "王而不王",
				"kuancha": "宽察之政",
				"wuguang": "吴广在侧",
				"zhongxing": "张楚中兴",
				"shouyi": "首义之功",
				"xiachufu": "下城父之变",
				"shiwodai": "时不我待"
			},
			"KEY_NODE_NAMES": {
				"1-3": "杀尉首义",
				"3-1": "陈县称王",
				"4-1": "周文叩关",
				"5-2": "荥阳之帐",
				"6-2": "下城父"
			},
			"RANDOM_EVENTS": [
				{
					"id": "R-1",
					"title": "佣耕旧友",
					"chapters": [0, 2],
					"segs": ["当年同垄的佣工找上门来，搓着手笑：还记得“苟富贵，无相忘”吗？新鞋上全是泥，进了帐不知手往哪儿放。"],
					"options": [{
						"t": "厚遇之",
						"res": "你把旧友留在身边，衣食与旧部同。他逢人便说：陈涉这人，不忘本——话传回阳城，比檄文跑得还快。",
						"eff": {
							"attrs": {
								"caifu": -3,
								"shengwang": 3
							},
							"dev": 0
						},
						"to": "RETURN"
					}, {
						"t": "给些盘缠打发",
						"res": "旧友接过钱，笑容淡了些，把那句“无相忘”咽了回去。",
						"eff": {
							"attrs": {
								"caifu": -2,
								"shengwang": -2
							},
							"dev": 0
						},
						"to": "RETURN"
					}]
				},
				{
					"id": "R-2",
					"title": "戍卒夜话",
					"chapters": [0, 1],
					"segs": ["破庙里，戍卒围着火堆咒骂苛法，骂到咸阳。看见你来，忽然都住了口，没人敢先抬头。"],
					"options": [
						{
							"t": "坐下来一起骂",
							"res": "你盘腿坐下接过话头。骂到后半夜，有人低声说：屯长，要真有那一天，我跟你。",
							"eff": {
								"attrs": {
									"junxin": 4,
									"weiji": 2
								},
								"dev": 0
							},
							"to": "RETURN"
						},
						{
							"t": "喝止各回铺位",
							"res": "人群散了，骂声咽回喉咙里。你独自坐了很久，听着庙外的雨。",
							"eff": {
								"attrs": {
									"junxin": -2,
									"weiji": -2
								},
								"dev": 0
							},
							"to": "RETURN"
						},
						{
							"t": "挑明举事之意",
							"req": { "junxin": 30 },
							"res": "火堆静了一瞬，不知谁先伸的手：屯长，到时候，算我一个。一只只手在火光里叠了上来。",
							"eff": {
								"attrs": {
									"junxin": 8,
									"weiji": 3
								},
								"dev": 0
							},
							"to": "RETURN"
						}
					]
				},
				{
					"id": "R-3",
					"title": "里正索贿",
					"chapters": [0, 1],
					"segs": ["里正把你叫到一边，搓着手指：徭役的名册嘛，也不是不能商量——眼睛瞟着你的钱袋。"],
					"options": [{
						"t": "给钱了事",
						"res": "钱塞过去，名册上的注脚淡了一分。里正掂着钱，笑得和善：屯长是个明白人。",
						"eff": {
							"attrs": {
								"caifu": -3,
								"weiji": -3
							},
							"dev": 0
						},
						"to": "RETURN"
					}, {
						"t": "拂袖而去",
						"res": "你拂袖而去。里正在背后冷笑：有你求我的时候——这话刚好够你听见。",
						"eff": {
							"attrs": { "weiji": 3 },
							"dev": 0
						},
						"to": "RETURN"
					}]
				},
				{
					"id": "R-4",
					"title": "新卒闹饷",
					"chapters": [2, 4],
					"segs": ["新收的几营兵围住中军帐：说好的粮饷呢？火把连成一片，矛尖一晃一晃。"],
					"options": [{
						"t": "开仓兑现",
						"res": "粮饷当夜发下去，火气变成了士气。带头的汉子捧着粮，反倒不好意思了：将军，俺就是嗓门大。",
						"eff": {
							"attrs": {
								"caifu": -6,
								"junxin": 4
							},
							"dev": 0
						},
						"to": "RETURN"
					}, {
						"t": "斩带头人以儆",
						"res": "人头示众，营里安静得有些冷。饭还是那些饭，嚼起来没人出声了。",
						"eff": {
							"attrs": {
								"junxin": -4,
								"weiji": 4
							},
							"dev": 0
						},
						"to": "RETURN"
					}]
				},
				{
					"id": "R-5",
					"title": "父老献粮",
					"chapters": [2, 5],
					"segs": ["城中父老结队送粮至营，老者拄杖在前：秦法苦久了，就等你们来。麻袋上还沾着各家灶膛的灰。"],
					"options": [{
						"t": "拜受而倍偿其值",
						"res": "你拜受，加倍偿其值。父老们推辞不过，逢人便夸——夸到后来，邻县也有粮车在路上。",
						"eff": {
							"attrs": {
								"caifu": -4,
								"shengwang": 4
							},
							"dev": 0
						},
						"to": "RETURN"
					}, {
						"t": "拜受，书券为凭",
						"res": "你写下借券，言明战后倍偿。老者把券供了起来，逢人便展示：这是张楚的字据。",
						"eff": {
							"attrs": { "shengwang": 3 },
							"dev": 0
						},
						"to": "RETURN"
					}]
				},
				{
					"id": "R-6",
					"title": "吴广论兵",
					"chapters": [0, 5],
					"cond": { "flag": "wuguang" },
					"segs": ["夜里吴广携一壶浊酒来，只谈下一步的棋——用筷头蘸着酒，把荥阳和函谷的位置点在舆图上。"],
					"options": [{
						"t": "与之彻夜长谈",
						"res": "谈到四更，酒凉了三回。他临走时说：有这一步，死也值。",
						"eff": {
							"attrs": {
								"caixue": 3,
								"junxin": 2
							},
							"dev": 0
						},
						"to": "RETURN"
					}, {
						"t": "只叙寒温，不谈兵",
						"res": "吴广笑着告辞，有些话咽了回去——酒还剩半壶，你没留他。",
						"eff": {
							"attrs": { "weiji": -1 },
							"dev": 0
						},
						"to": "RETURN"
					}]
				},
				{
					"id": "R-7",
					"title": "儒生来投",
					"chapters": [3, 5],
					"segs": ["几个儒生背着书箧来投：听说张楚复立社稷，愿为博士。为首的是⟦孔鲋⟧——孔子的后人，一路上用身体护着书箧。"],
					"options": [{
						"t": "礼为上宾",
						"res": "你设席相待，礼为上宾。儒生们留下了——士林的风评，从此偏向了你一分。",
						"eff": {
							"attrs": {
								"shengwang": 4,
								"caifu": -3
							},
							"dev": 0
						},
						"to": "RETURN"
					}, {
						"t": "以军务推却",
						"res": "儒生们怏怏而去。兵荒马乱，谁还读《诗》呢——只是后来你想找写檄文的人，费了些周折。",
						"eff": {
							"attrs": {
								"shengwang": -3,
								"weiji": -2
							},
							"dev": 0
						},
						"to": "RETURN"
					}]
				},
				{
					"id": "R-8",
					"title": "徇地捷报",
					"chapters": [3, 5],
					"segs": ["北线捷报：又下两城，刑其长吏以应者数十人。报捷的使者满脸红光，甲上还有新鲜的血痂。"],
					"options": [{
						"t": "厚赏其使",
						"res": "使者谢恩而去，赏钱叮当作响。捷报传得更快了——人人都想当下一个报捷的人。",
						"eff": {
							"attrs": {
								"caifu": -4,
								"shengwang": 3
							},
							"dev": 0
						},
						"to": "RETURN"
					}, {
						"t": "只赏战功，不问私馈",
						"res": "使者愣了愣，躬身退下。规矩立住了，人情淡了些——此后报捷的人，嗓门都没那么亮了。",
						"eff": {
							"attrs": {
								"junxin": -2,
								"weiji": -2
							},
							"dev": 0
						},
						"to": "RETURN"
					}]
				},
				{
					"id": "R-9",
					"title": "降卒思归",
					"chapters": [4, 6],
					"segs": ["一批新附的降卒跪在营外，求放归乡里：出来三个月了，家里的田没人种，麦都该下地了。"],
					"options": [{
						"t": "给资放归",
						"res": "你给了盘缠放归。降卒叩首散去，一步三回头——回家的人，会替你说话。",
						"eff": {
							"attrs": {
								"caifu": -4,
								"shengwang": 3,
								"quanshi": -2
							},
							"dev": 0
						},
						"to": "RETURN"
					}, {
						"t": "严令留营",
						"res": "降卒低着头散了。当夜少了二十几个人——营墙上攀过的绳印，到早上还没干。",
						"eff": {
							"attrs": {
								"weiji": 3,
								"junxin": -2
							},
							"dev": 0
						},
						"to": "RETURN"
					}]
				},
				{
					"id": "R-10",
					"title": "朱房密报",
					"chapters": [4, 5],
					"segs": ["朱房呈上一叠“罪证”：某将徇地失期，某将私藏俘获——请王定夺。罪名用朱笔勾过，勾得很深。"],
					"options": [{
						"t": "批允其察",
						"res": "你批了“可”。朱房躬身而退，嘴角的笑藏不住——当夜就有人被系进了狱里。",
						"eff": {
							"attrs": {
								"junxin": -3,
								"weiji": 3
							},
							"dev": 0
						},
						"to": "RETURN"
					}, {
						"t": "压下不问",
						"res": "你把竹简压在案底。朱房的笑僵在脸上，退出去时差点绊在门槛上。",
						"eff": {
							"attrs": { "weiji": -2 },
							"dev": 0
						},
						"to": "RETURN"
					}]
				},
				{
					"id": "R-11",
					"title": "章邯动向",
					"chapters": [4, 6],
					"cond": { "weiji": 40 },
					"segs": ["探马连报：章邯在整军，骊山方向尘土遮了半个天——秦军的灶数比上月多了一倍。"],
					"options": [{
						"t": "加派斥候，预作布防",
						"res": "布防图连夜发了出去，烽燧与哨位重新排过。早一刻知道，就多一分胜算。",
						"eff": {
							"attrs": {
								"caixue": 2,
								"weiji": -3
							},
							"dev": 0
						},
						"to": "RETURN"
					}, {
						"t": "不足为虑",
						"res": "你把探报搁在一边，说骊山之徒不足惧。当夜你睡得并不安稳，梦里都是鼓声。",
						"eff": {
							"attrs": { "weiji": 4 },
							"dev": 0
						},
						"to": "RETURN"
					}]
				},
				{
					"id": "R-12",
					"title": "旧卒问志",
					"chapters": [5, 6],
					"segs": ["一个大泽乡的老卒喝醉了，拉着你的袖子问：屯长，咱们还能赢吗？他的甲旧了，露出里面的絮，周围一圈人都竖着耳朵。"],
					"options": [{
						"t": "答：能",
						"res": "你答：能。就一个字。老卒红着眼笑了——第二天，他把这话传给了全营，传到最后，像真的似的。",
						"eff": {
							"attrs": {
								"junxin": 3,
								"shengwang": 2
							},
							"dev": 0
						},
						"to": "RETURN"
					}, {
						"t": "无言以对",
						"res": "你拍了拍他的肩，什么也没说出来。老卒把剩下的酒一口喝干，醉倒在火堆边。",
						"eff": {
							"attrs": { "junxin": -2 },
							"dev": 0
						},
						"to": "RETURN"
					}]
				}
			],
			"CRISIS_EVENTS": {
				"plots": [
					{
						"id": "C-1",
						"title": "秦谍捕风",
						"segs": [
							"营里揪出两个形迹可疑的“新卒”，搜身时出了咸阳的令牌。",
							"令牌是铜的，磨得发亮——贴身藏了不止一天。",
							"他们交代：像他们这样的人，你的营里还有十几个。"
						],
						"options": [{
							"t": "明正典刑，并顺藤摸瓜",
							"res": "两颗人头挂出去，营里的“新卒”连夜跑了好几个。营门外的树上，从此多了几只常来的乌鸦。",
							"eff": {
								"attrs": {
									"weiji": -6,
									"junxin": -2
								},
								"dev": 0
							},
							"to": "RETURN"
						}, {
							"t": "收为己用，反布流言",
							"res": "你把假消息喂了回去，两人磕头如捣蒜。咸阳收到的军报，从此都是你想让他们看的。",
							"eff": {
								"attrs": {
									"caixue": 3,
									"weiji": 4
								},
								"dev": 0
							},
							"to": "RETURN"
						}]
					},
					{
						"id": "C-2",
						"title": "诸将争城",
						"segs": [
							"两路徇地的将领为一座城的归属，在陈城朝堂上拔剑相向。",
							"一个说我先登的城，一个说我流的血多——血确实都还在甲上。",
							"两边都是大泽乡的老人，都看着你。"
						],
						"options": [{
							"t": "平分其地，各加抚慰",
							"res": "城劈两半，各加抚慰。两人接令时都不太服气，但好歹收了剑。出朝时各走一边的台阶。",
							"eff": {
								"attrs": {
									"junxin": 3,
									"weiji": -4
								},
								"dev": 0
							},
							"to": "RETURN"
						}, {
							"t": "各打五十大板",
							"res": "两人都被夺了半营兵。朝堂安静了，心里都记下了。记的不是彼此，是你。",
							"eff": {
								"attrs": {
									"junxin": -4,
									"weiji": 4
								},
								"dev": 0
							},
							"to": "RETURN"
						}]
					},
					{
						"id": "C-3",
						"title": "军纪之扰",
						"segs": [
							"地方父老联名来告：你的兵借了粮不还，还顺手牵了牛。",
							"告状的老人跪在地上，状纸举过头顶，手背上全是裂口。",
							"他身后，是几十双看着你的眼睛。"
						],
						"options": [{
							"t": "查拿赔补，申令三军",
							"res": "牛赔了，犯卒鞭了，老人磕着头走了。规矩这种东西，立一次是一次。围观的人散了，议论留下了：张楚的兵，管得住。",
							"eff": {
								"attrs": {
									"caifu": -4,
									"shengwang": 3,
									"junxin": 3
								},
								"dev": 0
							},
							"to": "RETURN"
						}, {
							"t": "以军用为由搪塞",
							"res": "你以军用为由搪塞。老人叹了口气，佝偻着背走了。那样的背影，你见过的会越来越多。",
							"eff": {
								"attrs": {
									"shengwang": -5,
									"weiji": 3
								},
								"dev": 0
							},
							"to": "RETURN"
						}]
					}
				],
				"death": {
					"id": "C-DEATH",
					"title": "杀机已至",
					"segs": [
						"秦军的前锋已经望见你的营火。幕僚连夜清点人马：能走的，不足三成。",
						"粮帐、兵册、马数，念一项，帐里冷一分。",
						"帐外，吴广按剑而立——或者，是田臧在磨他的刀。",
						"你还有最后一次挣扎的机会。"
					],
					"options": [
						{
							"t": "尽散府库，收拢溃军",
							"req": { "caifu": 30 },
							"res": "府库一空，金饼直接倒进士卒的怀里。溃军复聚，营盘守住了——这一次。",
							"eff": {
								"attrs": {
									"caifu": -30,
									"weiji": -25
								},
								"dev": 0
							},
							"to": "RETURN"
						},
						{
							"t": "亲赴军前，决死一呼",
							"req": { "biancai": 55 },
							"res": "你站上土台，把“等死，死国可乎”又喊了一遍。溃兵停住了脚——这一次。有人扔下包袱，转身回了队列。",
							"eff": {
								"attrs": {
									"weiji": -15,
									"shengwang": -5
								},
								"dev": 0
							},
							"to": "RETURN"
						},
						{
							"t": "坐以待毙",
							"res": "你搁下笔，听帐外的风声。风声里夹着马蹄，越来越近。",
							"eff": {
								"attrs": { "weiji": 15 },
								"dev": 0
							},
							"to": "RETURN"
						}
					]
				}
			},
			"ACTIONS": [
				{
					"desc": "聚众讲“苦秦”之理",
					"res": "你站在土台上讲了一个时辰。台下的眼睛，一双双都亮了。散场后，还有人蹲在原地，舍不得走。",
					"id": "CS-ACT-1",
					"name": "聚义宣讲",
					"eff": {
						"dev": 0,
						"attrs": {
							"weiji": 2,
							"junxin": 1,
							"biancai": 1,
							"shengwang": 3
						}
					},
					"descHidden": "聚众讲“苦秦”之理",
					"chapters": [0, 6],
					"type": "进取"
				},
				{
					"desc": "置酒结客（财富-8）",
					"res": "一场大宴，宾主尽欢。散场时，多了几个肯替你说话的人。酒醒之后，话比酒走得更远。",
					"eff": {
						"dev": 0,
						"attrs": {
							"junxin": 1,
							"caifu": -8,
							"biancai": 1,
							"shengwang": 3
						}
					},
					"id": "CS-ACT-2",
					"name": "置酒高会",
					"descHidden": "置酒结客（耗财）",
					"req": { "caifu": 8 },
					"chapters": [0, 6],
					"type": "兑换"
				},
				{
					"desc": "趋府通款，以通声气（需起事）",
					"res": "你在堂下站了半个时辰，换来三句回话。乱世里，门路就是粮道。出门时，门吏看你的眼神热了一点。",
					"eff": {
						"dev": 0,
						"attrs": {
							"junxin": 3,
							"biancai": 1,
							"weiji": 2
						}
					},
					"id": "CS-ACT-3",
					"name": "入府联络",
					"descHidden": "趋府通款，以通声气（需起事）",
					"req": { "minChapter": 2 },
					"chapters": [0, 6],
					"type": "进取"
				},
				{
					"desc": "谢客静修，温习兵略",
					"res": "门一关，阵图铺了满案。这一夜，你的兵又精了一分。烛花爆了两次，你没有抬头。",
					"id": "CS-ACT-4",
					"name": "闭门读兵",
					"eff": {
						"dev": 0,
						"attrs": {
							"tupo": -1,
							"weiji": -1,
							"caixue": 2,
							"moulue": 1
						}
					},
					"descHidden": "谢客静修，温习兵略",
					"chapters": [0, 6],
					"type": "守成"
				},
				{
					"desc": "厚币招贤（财富-8）",
					"res": "千金散尽，门下多了几十张嘴，也多了几十双替你看路的眼睛。钱的响声停了，人的脚步声多了。",
					"eff": {
						"dev": 0,
						"attrs": {
							"caifu": -8,
							"weiji": -4,
							"shengwang": 2
						}
					},
					"id": "CS-ACT-5",
					"name": "散财养士",
					"descHidden": "厚币招贤（倾囊以聘）",
					"req": { "caifu": 8 },
					"chapters": [0, 6],
					"type": "保身"
				},
				{
					"desc": "闭门称病，避人锋芒（需起事）",
					"res": "病假话说出去，麻烦少了一半。探病的人来了几拨，真心难辨。你躺在帐里，把每个人的来意都过了一遍。",
					"eff": {
						"dev": 0,
						"attrs": {
							"tupo": 1,
							"weiji": -5,
							"junxin": -2,
							"quanshi": -3
						}
					},
					"id": "CS-ACT-6",
					"name": "称病蛰伏",
					"descHidden": "闭门称病，避人锋芒（需起事）",
					"req": { "minChapter": 2 },
					"chapters": [0, 6],
					"type": "保身"
				},
				{
					"desc": "晨起演武，筋骨与艺俱进",
					"res": "你鸡鸣即起，在场院上演武三百回。汗水换了几身短打，臂上的力道一日日攒了下来——锄把换成了矛杆，使力的人还是那个人。",
					"id": "CS-ACT-49",
					"name": "演武强身",
					"eff": {
						"dev": 0,
						"attrs": {
							"wuli": 3,
							"caifu": -1,
							"tupo": 1
						}
					},
					"descHidden": "晨起演武，筋骨与艺俱进",
					"chapters": [0, 6],
					"type": "守成"
				},
				{
					"desc": "调息导引，养精神于未衰",
					"res": "你闭帐调息，依图导引，吐纳之间气血渐顺。帐外的人久不见你露面，揣测便淡了——养的是精神，顺带也养了一份清静。",
					"id": "CS-ACT-50",
					"name": "导引养生",
					"eff": {
						"dev": 0,
						"attrs": {
							"tupo": 2,
							"weiji": -1
						}
					},
					"descHidden": "调息导引，养精神于未衰",
					"chapters": [0, 6],
					"type": "守成"
				},
				{
					"desc": "代写书信讼状，以笔糊口",
					"res": "你的状纸写得刀刀见骨。润笔不多，够买三日饭。苦主临走时鞠了一躬，比给钱的时候郑重。",
					"id": "CS-ACT-7",
					"name": "代写书信",
					"eff": {
						"dev": 0,
						"attrs": {
							"caifu": 3,
							"caixue": 1,
							"shengwang": -2
						}
					},
					"descHidden": "代写书信讼状，以笔糊口",
					"chapters": [0, 0],
					"type": "兑换"
				},
				{
					"desc": "多接几亩短工",
					"res": "多锄了三亩地，粮袋里又实了一分。天黑收工，手上的茧又厚了一层。",
					"id": "CS-ACT-8",
					"name": "帮佣换粮",
					"eff": {
						"dev": 0,
						"attrs": {
							"tupo": 1,
							"caifu": 2
						}
					},
					"descHidden": "多接几亩短工",
					"chapters": [0, 0],
					"type": "守成"
				},
				{
					"desc": "与过路戍卒攀谈（财富-2）",
					"res": "一碗水一把汗，戍卒们的话你也听明白了：天下没有一个不想骂娘的。临别时有人塞给你半张饼——那是戍卒的交情。",
					"eff": {
						"dev": 0,
						"attrs": {
							"junxin": 1,
							"caifu": -2,
							"biancai": 1,
							"shengwang": 2
						}
					},
					"id": "CS-ACT-9",
					"name": "结交戍卒",
					"descHidden": "与过路戍卒攀谈（略费盘缠）",
					"req": { "caifu": 2 },
					"chapters": [0, 0],
					"type": "兑换"
				},
				{
					"desc": "酒肆听四方消息",
					"res": "咸阳的、渔阳的、大泽的——天下的裂缝，在你耳朵里一点点清楚。听完你走回田里，锄头落下去，比早上重了些。",
					"id": "CS-ACT-10",
					"name": "听人说天下",
					"eff": {
						"dev": 0,
						"attrs": {
							"caifu": -1,
							"caixue": 1,
							"moulue": 1
						}
					},
					"descHidden": "酒肆听四方消息",
					"chapters": [0, 0],
					"type": "守成"
				},
				{
					"desc": "破庙一宿，省资养力（财富-2）",
					"res": "佛前一盏灯，身外一场雨。你在蒲团上睡到自然醒。醒来时雨停了，檐水还在滴，一声一声，很稳。",
					"eff": {
						"dev": 0,
						"attrs": {
							"tupo": 1,
							"caifu": -2,
							"weiji": -3
						}
					},
					"id": "CS-ACT-11",
					"name": "夜宿破庙",
					"descHidden": "破庙一宿，省资养力（费些许宿钱）",
					"req": { "caifu": 2 },
					"chapters": [0, 0],
					"type": "保身"
				},
				{
					"desc": "晨起练武，以健体魄",
					"res": "拳到第三遍，汗透了。这副身板，将来是要经大事的。收势时东方泛白，你比太阳先起来。",
					"id": "CS-ACT-12",
					"name": "练武强身",
					"eff": {
						"dev": 0,
						"attrs": {
							"wuli": 2,
							"weiji": 2,
							"caixue": 1,
							"tupo": 1
						}
					},
					"descHidden": "晨起练武，以健体魄",
					"chapters": [0, 0],
					"type": "守成"
				},
				{
					"desc": "与佣伴较力角抵，筋骨之名渐起",
					"res": "你在陇上放倒了三条壮汉。喝彩声顺着垄沟滚出去，也滚进了里正的耳朵里——乡野的勇名，一半是敬，一半是忌。",
					"id": "CS-ACT-51",
					"name": "陇上较力",
					"eff": {
						"dev": 0,
						"attrs": {
							"wuli": 2,
							"weiji": 1,
							"shengwang": 1
						}
					},
					"descHidden": "与佣伴较力角抵，筋骨之名渐起",
					"chapters": [0, 0],
					"type": "守成"
				},
				{
					"desc": "负麦帮工，气力换钱",
					"res": "你替人扛了半月的麦袋，肩头的茧厚了一层，囊中的钱也多了几枚。佣耕的人以力换食，你以力换命——这副身板，是往后大事的本钱。",
					"id": "CS-ACT-52",
					"name": "负麦换钱",
					"eff": {
						"dev": 0,
						"attrs": {
							"tupo": 2,
							"caifu": 1
						}
					},
					"descHidden": "负麦帮工，气力换钱",
					"chapters": [0, 0],
					"type": "守成"
				},
				{
					"desc": "巡铺安抚，以结众心",
					"res": "你走过每个铺位。九百个人心，一点点聚到你身上。走到最后一铺，有人往你手里塞了块烤热的薯。",
					"id": "CS-ACT-13",
					"name": "安抚戍卒",
					"eff": {
						"dev": 0,
						"attrs": {
							"tupo": -1,
							"junxin": 3,
							"biancai": 1,
							"weiji": 2
						}
					},
					"descHidden": "巡铺安抚，以结众心",
					"chapters": [1, 1],
					"type": "进取"
				},
				{
					"desc": "与另一屯屯长通款",
					"res": "两个屯长对了一次眼神。什么时候动手，你们心里都有了数。分开时谁也没说话——有些话，说出口就是罪证。",
					"id": "CS-ACT-14",
					"name": "联络两屯",
					"eff": {
						"dev": 0,
						"attrs": {
							"weiji": 2,
							"junxin": 2,
							"biancai": 1,
							"zhengji": 1
						}
					},
					"descHidden": "与另一屯屯长通款",
					"chapters": [1, 1],
					"type": "进取"
				},
				{
					"desc": "暗布眼线于队中",
					"res": "队里谁说了什么，你都知道了。眼睛这东西，早一天布早一天有用。当夜收到第一条消息，你记在心上，没写在任何地方。",
					"id": "CS-ACT-15",
					"name": "密置耳目",
					"eff": {
						"dev": 0,
						"attrs": {
							"caifu": -1,
							"weiji": 2,
							"caixue": 1,
							"moulue": 1
						}
					},
					"descHidden": "暗布眼线于队中",
					"chapters": [1, 1],
					"type": "守成"
				},
				{
					"desc": "整肃行伍，以立规矩",
					"res": "队伍走得齐了，将尉骂得少了，你的威信也起来了。队列从你面前过去，脚步声齐得像一个人。",
					"id": "CS-ACT-16",
					"name": "巡查队伍",
					"eff": {
						"dev": 0,
						"attrs": {
							"wuli": 1,
							"quanshi": 1
						}
					},
					"descHidden": "整肃行伍，以立规矩",
					"chapters": [1, 1],
					"type": "守成"
				},
				{
					"desc": "夜观营防，默记虚实",
					"res": "营门几重、将尉住哪、兵器在哪——你都记下了。回铺位时，你把草鞋底的泥蹭干净，像没出去过一样。",
					"id": "CS-ACT-17",
					"name": "夜探营门",
					"eff": {
						"dev": 0,
						"attrs": {
							"weiji": 2,
							"caixue": 2,
							"moulue": 1
						}
					},
					"descHidden": "夜观营防，默记虚实",
					"chapters": [1, 1],
					"type": "守成"
				},
				{
					"desc": "分粮周急（财富-3）",
					"res": "你自己的那份分了一半出去。有人接过粮时，手是抖的。你的晚饭少了半碗，心里的底气多了半碗。",
					"eff": {
						"dev": 0,
						"attrs": {
							"shengwang": 2,
							"caifu": -3
						}
					},
					"id": "CS-ACT-18",
					"name": "散粮结心",
					"descHidden": "分粮周急（损己之粮）",
					"req": { "caifu": 3 },
					"chapters": [1, 1],
					"type": "兑换"
				},
				{
					"desc": "雨隙演阵，隐成部曲",
					"res": "雨小的间隙，你把两屯人拉出去排了三遍队列。戍卒们渐渐走得像一支军队了——将尉远远看了一眼，皱着眉走开了。",
					"id": "CS-ACT-53",
					"name": "雨中演阵",
					"eff": {
						"dev": 0,
						"attrs": {
							"wuli": 2,
							"junxin": 1,
							"weiji": 1
						}
					},
					"descHidden": "雨隙演阵，隐成部曲",
					"chapters": [1, 1],
					"type": "守成"
				},
				{
					"desc": "冒雨探视前路水势",
					"res": "你披着蓑衣蹚出去十几里，把哪段路还能走、哪段已成了泽国都摸了回来。泥水灌了满靴，心里的地图却清楚了。",
					"id": "CS-ACT-54",
					"name": "冒雨探路",
					"eff": {
						"dev": 0,
						"attrs": {
							"tupo": 2,
							"caixue": 1
						}
					},
					"descHidden": "冒雨探视前路水势",
					"chapters": [1, 1],
					"type": "守成"
				},
				{
					"desc": "申令三军，秋毫无犯",
					"res": "三条军令下去，入城的队伍再没有人乱来。箪食壶浆的人更多了。有老妪追到队尾，硬往士卒怀里塞鸡蛋。",
					"id": "CS-ACT-19",
					"name": "申明军纪",
					"eff": {
						"dev": 0,
						"attrs": {
							"zhengji": 1,
							"weiji": 2,
							"junxin": 2,
							"moulue": 1,
							"shengwang": 2
						}
					},
					"descHidden": "申令三军，秋毫无犯",
					"chapters": [2, 2],
					"type": "进取"
				},
				{
					"desc": "收编来降之众",
					"res": "降者感不杀之恩，愿效死力。你的军队，又厚了一层。降卒排队械甲，械完甲，眼里有了光。",
					"id": "CS-ACT-20",
					"name": "抚降纳叛",
					"eff": {
						"dev": 0,
						"attrs": {
							"quanshi": 2,
							"biancai": 1,
							"weiji": 2
						}
					},
					"descHidden": "收编来降之众",
					"chapters": [2, 2],
					"type": "进取"
				},
				{
					"desc": "就食于野，以充军粮",
					"res": "粮是筹来了，乡里的闲话也起了。你让人记了账：哪村哪户，战后要还。",
					"id": "CS-ACT-21",
					"name": "筹粮于野",
					"eff": {
						"dev": 0,
						"attrs": {
							"shengwang": -2,
							"caifu": 2
						}
					},
					"descHidden": "就食于野，以充军粮",
					"chapters": [2, 2],
					"type": "兑换"
				},
				{
					"desc": "亲训新附之卒",
					"res": "昨天还是农夫的人，今天学会了列阵。收操时队列还歪歪扭扭，但已经像一支军队了。",
					"id": "CS-ACT-22",
					"name": "操练新卒",
					"eff": {
						"dev": 0,
						"attrs": {
							"wuli": 2,
							"quanshi": 2,
							"tupo": -1
						}
					},
					"descHidden": "亲训新附之卒",
					"chapters": [2, 2],
					"type": "守成"
				},
				{
					"desc": "以私财犒军（财富-4）",
					"res": "酒肉到营，士气大振。士兵记得陈将军的赏。有人喝醉了抱着矛哭，说跟上你，值。",
					"eff": {
						"dev": 0,
						"attrs": {
							"shengwang": 2,
							"caifu": -4
						}
					},
					"id": "CS-ACT-23",
					"name": "犒赏士卒",
					"descHidden": "以私财犒军（耗私财）",
					"req": { "caifu": 4 },
					"chapters": [2, 2],
					"type": "兑换"
				},
				{
					"desc": "先遣细探，再图攻坚",
					"res": "城里守军多少、人心向背，你都摸清了。细探回来时鞋底磨穿，你赏了他一双新的。",
					"id": "CS-ACT-24",
					"name": "探城虚实",
					"eff": {
						"dev": 0,
						"attrs": {
							"weiji": 2,
							"caixue": 2,
							"moulue": 1
						}
					},
					"descHidden": "先遣细探，再图攻坚",
					"chapters": [2, 2],
					"type": "守成"
				},
				{
					"desc": "小阵试锋，以战练胆",
					"res": "你挑了一队新卒，择一处坞壁小试锋芒。箭放了三轮，门就开了——兵是练出来的，胆是打出来的。",
					"id": "CS-ACT-55",
					"name": "阵前试锋",
					"eff": {
						"dev": 0,
						"attrs": {
							"wuli": 2,
							"quanshi": 1,
							"weiji": 1
						}
					},
					"descHidden": "小阵试锋，以战练胆",
					"chapters": [2, 2],
					"type": "守成"
				},
				{
					"desc": "与士卒同炊共爨",
					"res": "你蹲在灶边和士卒分同一锅羹。有人说将军不该吃这个，你把最后一口喝净：大泽乡出来的，什么没吃过。",
					"id": "CS-ACT-56",
					"name": "与卒同炊",
					"eff": {
						"dev": 0,
						"attrs": {
							"tupo": 2,
							"junxin": 1
						}
					},
					"descHidden": "与士卒同炊共爨",
					"chapters": [2, 2],
					"type": "守成"
				},
				{
					"desc": "开仓放粮（财富-3）",
					"res": "仓开了，陈人山呼。民心这种东西，是拿粮换的，也值。领粮的队伍排到街尾，没人插队。",
					"eff": {
						"dev": 0,
						"attrs": {
							"caifu": -3,
							"weiji": -1,
							"shengwang": 3
						}
					},
					"id": "CS-ACT-25",
					"name": "开仓赈民",
					"descHidden": "开仓放粮（损仓廪之积）",
					"req": { "caifu": 3 },
					"chapters": [3, 3],
					"type": "兑换"
				},
				{
					"desc": "礼请三老豪杰",
					"res": "三老们从堂上下来时，腰板比进去时直了三分。他们在堂下商量了一路，声音压得很低，笑意压不住。",
					"id": "CS-ACT-26",
					"name": "召见三老",
					"eff": {
						"dev": 0,
						"attrs": {
							"caifu": -1,
							"junxin": 2,
							"biancai": 1,
							"shengwang": 1
						}
					},
					"descHidden": "礼请三老豪杰",
					"chapters": [3, 3],
					"type": "进取"
				},
				{
					"desc": "缮城固防，深根固本",
					"res": "陈城的墙高了一尺。守得住的根本，才是根本。夯土声从早响到晚，路过的人都要仰头看一眼。",
					"id": "CS-ACT-27",
					"name": "修筑城防",
					"eff": {
						"dev": 0,
						"attrs": {
							"zhengji": 1,
							"quanshi": 2
						}
					},
					"descHidden": "缮城固防，深根固本",
					"chapters": [3, 3],
					"type": "进取"
				},
				{
					"desc": "汰弱留强，以精其军",
					"res": "老弱遣归，精壮留下。军是精了，骂名也起了。遣归的人走到辕门外，回头望了一眼旗。",
					"id": "CS-ACT-28",
					"name": "裁汰老弱",
					"eff": {
						"dev": 0,
						"attrs": {
							"weiji": 2,
							"quanshi": 2,
							"moulue": 1,
							"shengwang": -2
						}
					},
					"descHidden": "汰弱留强，以精其军",
					"chapters": [3, 3],
					"type": "进取"
				},
				{
					"desc": "以旧部领新附",
					"res": "大泽乡的老人各领一营。刀把子，还是握在自己人手里稳。夜里你睡得踏实了些——踏实这东西，也是花人心换的。",
					"id": "CS-ACT-29",
					"name": "安插亲信",
					"eff": {
						"dev": 0,
						"attrs": {
							"weiji": 2,
							"quanshi": 1,
							"moulue": 1,
							"junxin": 1
						}
					},
					"descHidden": "以旧部领新附",
					"chapters": [3, 3],
					"type": "进取"
				},
				{
					"desc": "核收陈之府库",
					"res": "府库的账核清了。张楚的家底，你心里有数了。算盘珠子响到半夜，响完你心里亮堂了。",
					"id": "CS-ACT-30",
					"name": "清查府库",
					"eff": {
						"dev": 0,
						"attrs": {
							"zhengji": 1,
							"caifu": 3
						}
					},
					"descHidden": "核收陈之府库",
					"chapters": [3, 3],
					"type": "守成"
				},
				{
					"desc": "置官属，定号令，立张楚之制",
					"res": "你设官分职，颁号令于诸县：仓有守，狱有吏，赋有籍。张楚不再只是一面旗，成了一架转得动的机器——咸阳的案上，你的名字又描深了一笔。",
					"id": "CS-ACT-57",
					"name": "置官定号",
					"eff": {
						"dev": 0,
						"attrs": {
							"quanshi": 1,
							"weiji": 2,
							"zhengji": 2
						}
					},
					"descHidden": "置官属，定号令，立张楚之制",
					"chapters": [3, 3],
					"type": "进取"
				},
				{
					"desc": "登城巡夜，与守卒同警",
					"res": "你披衣登城，一更一更巡过去。守卒见王旗在城头移动，腰杆都挺直了些——寒气钻进衣领，你想起佣耕时的霜。",
					"id": "CS-ACT-58",
					"name": "登陴巡夜",
					"eff": {
						"dev": 0,
						"attrs": {
							"tupo": 2,
							"junxin": 1
						}
					},
					"descHidden": "登城巡夜，与守卒同警",
					"chapters": [3, 3],
					"type": "守成"
				},
				{
					"desc": "亲巡徇地诸军（权势≥25 诸将方听）",
					"res": "你走了一趟北线。诸将见你亲来，收敛的收敛，抖擞的抖擞。回程时，各营的军容都比你去时齐整。",
					"eff": {
						"dev": 0,
						"attrs": {
							"wuli": 1,
							"quanshi": 2,
							"tupo": -1,
							"weiji": 3
						}
					},
					"id": "CS-ACT-31",
					"name": "督察徇地",
					"descHidden": "亲巡徇地诸军（威重方听）",
					"req": { "quanshi": 25 },
					"chapters": [4, 4],
					"type": "进取"
				},
				{
					"desc": "犒赏徇地归者（财富-4）",
					"res": "归师的赏发下去了。下回出兵，个个争先。赏薄意厚——领赏的人记住的是后者。",
					"eff": {
						"dev": 0,
						"attrs": {
							"caifu": -4,
							"junxin": 1,
							"shengwang": 2
						}
					},
					"id": "CS-ACT-32",
					"name": "犒赏归师",
					"descHidden": "犒赏徇地归者（耗财犒军）",
					"req": { "caifu": 4 },
					"chapters": [4, 4],
					"type": "兑换"
				},
				{
					"desc": "为诸将和功",
					"res": "两个争功的将领被你按回座位。和事佬不好当，但总得有人当。散帐时两人互相拱了拱手，劲儿还别着，火是压下去了。",
					"id": "CS-ACT-33",
					"name": "调解争功",
					"eff": {
						"dev": 0,
						"attrs": {
							"junxin": 2,
							"biancai": 1,
							"weiji": 2
						}
					},
					"descHidden": "为诸将和功",
					"chapters": [4, 4],
					"type": "进取"
				},
				{
					"desc": "遣使通好（财富-3）",
					"res": "使者四出，回话都极恭敬。只是恭敬这个东西，最经不起风。你把回书一封封收好，也一封封打了折扣。",
					"eff": {
						"dev": 0,
						"attrs": {
							"junxin": 1,
							"caifu": -3,
							"biancai": 1,
							"shengwang": 1
						}
					},
					"id": "CS-ACT-34",
					"name": "联络诸侯",
					"descHidden": "遣使通好（费币帛）",
					"req": { "caifu": 3 },
					"chapters": [4, 4],
					"type": "兑换"
				},
				{
					"desc": "大阅诸营新军",
					"res": "新军列阵，已经有模有样。尘土扬起来，落下去，阵形没有乱。",
					"id": "CS-ACT-35",
					"name": "检阅新军",
					"eff": {
						"dev": 0,
						"attrs": {
							"wuli": 1,
							"quanshi": 2
						}
					},
					"descHidden": "大阅诸营新军",
					"chapters": [4, 4],
					"type": "守成"
				},
				{
					"desc": "收编败散之卒",
					"res": "败兵重新捏成了军队。能聚人，才是真本事。归队的人低着头，你让他们抬起来——败过一场，不等于输了整个人。",
					"id": "CS-ACT-36",
					"name": "收拢溃卒",
					"eff": {
						"dev": 0,
						"attrs": {
							"quanshi": 2,
							"biancai": 1,
							"weiji": 2
						}
					},
					"descHidden": "收编败散之卒",
					"chapters": [4, 4],
					"type": "进取"
				},
				{
					"desc": "驰赴各营，马上阅阵",
					"res": "你一马一鞭跑遍了三座大营。尘土灌了满喉，各营的虚实也看了个透——将校们私下说：大王眼睛是亮的。",
					"id": "CS-ACT-59",
					"name": "马上阅阵",
					"eff": {
						"dev": 0,
						"attrs": {
							"wuli": 2,
							"quanshi": 1,
							"tupo": -1
						}
					},
					"descHidden": "驰赴各营，马上阅阵",
					"chapters": [4, 4],
					"type": "守成"
				},
				{
					"desc": "偷得半日闲，卸甲养神",
					"res": "你把甲卸了，睡了这半年来第一个整觉。醒来时军报堆了半案，精神却回来了——弦绷得太紧，是会断的。",
					"id": "CS-ACT-60",
					"name": "卸甲小憩",
					"eff": {
						"dev": 0,
						"attrs": {
							"tupo": 2,
							"weiji": -1
						}
					},
					"descHidden": "偷得半日闲，卸甲养神",
					"chapters": [4, 4],
					"type": "守成"
				},
				{
					"desc": "亲赴荥阳军中",
					"res": "你出现在军前那天，全军的呼声响了三里。荥阳城头的守军也听见了，旗帜动了一阵，又静下去。",
					"id": "CS-ACT-37",
					"name": "亲赴军前",
					"eff": {
						"dev": 0,
						"attrs": {
							"wuli": 1,
							"quanshi": 2,
							"weiji": 3,
							"tupo": -1,
							"shengwang": 1
						}
					},
					"descHidden": "亲赴荥阳军中",
					"chapters": [5, 5],
					"type": "进取"
				},
				{
					"desc": "以义励众，以固军心",
					"res": "你说：楚虽三户，亡秦必楚。将士的眼里，火又着了。回声滚过营盘，一营接一营，滚了半个时辰。",
					"id": "CS-ACT-38",
					"name": "激励将士",
					"eff": {
						"dev": 0,
						"attrs": {
							"tupo": -1,
							"junxin": 2,
							"biancai": 1,
							"shengwang": 2
						}
					},
					"descHidden": "以义励众，以固军心",
					"chapters": [5, 5],
					"type": "进取"
				},
				{
					"desc": "缮治敖仓壁垒",
					"res": "⟦敖仓⟧的粮与垒，都是命。民夫往来如蚁，新垒一日高过一日。",
					"id": "CS-ACT-39",
					"name": "加固敖仓",
					"eff": {
						"dev": 0,
						"attrs": {
							"caifu": 1,
							"quanshi": 2
						}
					},
					"descHidden": "缮治敖仓壁垒",
					"chapters": [5, 5],
					"type": "进取"
				},
				{
					"desc": "重金募敢死之士（财富-5）",
					"res": "千金之下，必有勇夫。应募的人排开一列，个个把赏金先寄回了家。",
					"eff": {
						"dev": 0,
						"attrs": {
							"quanshi": 2,
							"caifu": -5
						}
					},
					"id": "CS-ACT-40",
					"name": "购募死士",
					"descHidden": "重金募敢死之士（所费不赀）",
					"req": { "caifu": 5 },
					"chapters": [5, 5],
					"type": "兑换"
				},
				{
					"desc": "为两将解仇",
					"res": "两只握刀的手被你按回了桌上。和事佬不好当，但总得有人当。两人碰了杯酒，酒是苦的，好歹碰了。",
					"id": "CS-ACT-41",
					"name": "调解宿怨",
					"eff": {
						"dev": 0,
						"attrs": {
							"weiji": 2,
							"junxin": 2,
							"biancai": 1,
							"zhengji": 1
						}
					},
					"descHidden": "为两将解仇",
					"chapters": [5, 5],
					"type": "进取"
				},
				{
					"desc": "与诸将夜议军机（才学≥40 方能服众）",
					"res": "舆图前的烛火，烧到了四更。散帐时诸将各怀计较，但方向只有一个了。",
					"eff": {
						"dev": 0,
						"attrs": {
							"tupo": -1,
							"caixue": 2,
							"moulue": 2
						}
					},
					"id": "CS-ACT-42",
					"name": "夜议军机",
					"descHidden": "与诸将夜议军机（才学不足则须冒险）",
					"req": { "caixue": 40 },
					"chapters": [5, 5],
					"type": "守成"
				},
				{
					"desc": "亲陷小阵，夺旗励众",
					"res": "你带着亲兵咬下了秦军一处哨垒，旗拔了回来。全军看得真切：陈王的刀还快。哨垒的烟，飘到荥阳城头都看得见。",
					"id": "CS-ACT-61",
					"name": "阵前夺旗",
					"eff": {
						"dev": 0,
						"attrs": {
							"wuli": 2,
							"weiji": 1,
							"shengwang": 1
						}
					},
					"descHidden": "亲陷小阵，夺旗励众",
					"chapters": [5, 5],
					"type": "守成"
				},
				{
					"desc": "与民夫同负土，亲筑营垒",
					"res": "你挽起袖子和民夫一起背土上垒。土筐压弯了扁担，垒墙一日高过一日——佣耕出身的人，力气还在身上。",
					"id": "CS-ACT-62",
					"name": "负土筑垒",
					"eff": {
						"dev": 0,
						"attrs": {
							"tupo": 2,
							"quanshi": 1
						}
					},
					"descHidden": "与民夫同负土，亲筑营垒",
					"chapters": [5, 5],
					"type": "守成"
				},
				{
					"desc": "收拢溃散之众",
					"res": "溃散的人马一点点聚回来。还肯回来的，都是真心跟着你的。有人走了三天三夜，进营门时只说了句：屯长，我回来了。",
					"id": "CS-ACT-43",
					"name": "收拢残部",
					"eff": {
						"dev": 0,
						"attrs": {
							"quanshi": 2,
							"biancai": 1,
							"weiji": 2
						}
					},
					"descHidden": "收拢溃散之众",
					"chapters": [6, 6],
					"type": "进取"
				},
				{
					"desc": "抚辑逃亡，以安余众",
					"res": "逃卒一个个回来领罪。你没罚，只说了句：回来了就好。营门那晚没有锁——锁了，就真没人回来了。",
					"id": "CS-ACT-44",
					"name": "安抚逃卒",
					"eff": {
						"dev": 0,
						"attrs": {
							"junxin": 2,
							"biancai": 1,
							"shengwang": 1
						}
					},
					"descHidden": "抚辑逃亡，以安余众",
					"chapters": [6, 6],
					"type": "进取"
				},
				{
					"desc": "亲巡夜哨，以肃余部",
					"res": "你查到第三座营时，偷睡的两个哨兵从此不敢合眼。后半夜你再巡一遍，哨声应答，无一遗漏。",
					"id": "CS-ACT-45",
					"name": "夜巡残营",
					"eff": {
						"dev": 0,
						"attrs": {
							"wuli": 1,
							"weiji": -2,
							"tupo": -1
						}
					},
					"descHidden": "亲巡夜哨，以肃余部",
					"chapters": [6, 6],
					"type": "保身"
				},
				{
					"desc": "鬻王者仪仗以充军资",
					"res": "仪仗卖了个干净。人穷到这个地步，体面就顾不上了。换来的粮倒进锅里时，士卒们说今天的粥特别稠。",
					"id": "CS-ACT-46",
					"name": "变卖仪仗",
					"eff": {
						"dev": 0,
						"attrs": {
							"shengwang": -2,
							"caifu": 3
						}
					},
					"descHidden": "鬻王者仪仗以充军资",
					"chapters": [6, 6],
					"type": "兑换"
				},
				{
					"desc": "遣人觇章邯之踪",
					"res": "追兵离你多远，你比谁都清楚——清楚到夜夜睡不着。斥候回报的数字一天一换，你在心里给它留了一格。",
					"id": "CS-ACT-47",
					"name": "密探追兵",
					"eff": {
						"dev": 0,
						"attrs": {
							"tupo": -1,
							"weiji": 2,
							"caixue": 2,
							"moulue": 1
						}
					},
					"descHidden": "遣人觇章邯之踪",
					"chapters": [6, 6],
					"type": "守成"
				},
				{
					"desc": "于南郊休整残军",
					"res": "残军饱餐休整。下一程往南，还得靠这些人。马吃饱了打响鼻，人吃饱了，眼里又有了活气。",
					"id": "CS-ACT-48",
					"name": "秣马南郊",
					"eff": {
						"dev": 0,
						"attrs": {
							"tupo": 1,
							"weiji": -2
						}
					},
					"descHidden": "于南郊休整残军",
					"chapters": [6, 6],
					"type": "保身"
				},
				{
					"desc": "雪夜磨刃，意态犹雄",
					"res": "雪粒子打着帐布，你把佩刀磨了一遍又一遍。刃口映着火光，像一线不肯冻的河——刀还利，人就还没输。",
					"id": "CS-ACT-63",
					"name": "雪夜磨刃",
					"eff": {
						"dev": 0,
						"attrs": {
							"wuli": 2,
							"weiji": -1
						}
					},
					"descHidden": "雪夜磨刃，意态犹雄",
					"chapters": [6, 6],
					"type": "守成"
				},
				{
					"desc": "拥炉与残卒话大泽旧事",
					"res": "你和老卒们围着火，从大泽乡的雨讲到陈城的旗。讲到好笑处，一帐人都笑了——火快熄了，笑声把寒气顶了回去。",
					"id": "CS-ACT-64",
					"name": "拥炉话旧",
					"eff": {
						"dev": 0,
						"attrs": {
							"tupo": 2,
							"junxin": 1
						}
					},
					"descHidden": "拥炉与残卒话大泽旧事",
					"chapters": [6, 6],
					"type": "守成"
				},
				{
					"desc": "佣者笑你：若为佣耕，何富贵也——这口气怎么出",
					"id": "CS-ACT-65",
					"name": "燕雀之嘲",
					"descHidden": "佣者笑你：若为佣耕，何富贵也——这口气怎么出",
					"choice": {
						"segs": ["辍耕之垄上，你怅恨久之，曰：「苟富贵，无相忘。」佣者笑而应曰：「若为佣耕，何富贵也？」你望着他们，太息曰：「嗟乎，燕雀安知鸿鹄之志哉！」握锄的指节发白——他们从没想过，人可以不是锄头下的泥。"],
						"options": [
							{
								"eff": {
									"dev": 0,
									"attrs": {
										"tupo": 1,
										"shengwang": 1
									}
								},
								"res": "你折枝在垄上划下深深一道：「今日之言，立此为证。」痕被雨水冲掉了，话没有。多年后你坐在陈城王座上，还记得那道痕：最深的誓言，刻在心里。",
								"t": "刻木为誓"
							},
							{
								"eff": {
									"dev": 0,
									"attrs": {
										"moulue": 1,
										"weiji": -1
									}
								},
								"res": "你不再辩，弯腰把田耕完。志向说给燕雀听，本是浪费。此后你的话少了，眼睛亮了——有些话，从此只在心里说。",
								"t": "默然耕罢"
							},
							{
								"eff": {
									"dev": 0,
									"attrs": {
										"biancai": 1,
										"shengwang": 2
									}
								},
								"res": "你坐下来，把天下大势讲给满垄的人听，笑声渐渐停了。散工时两个年轻人远远跟在你身后——种子看不出深浅，可终究会发芽。",
								"t": "说与众听"
							}
						]
					},
					"chapters": [0, 0],
					"type": "抉择"
				},
				{
					"desc": "里胥拍门催口赋——缸里的米，只够三日",
					"id": "CS-ACT-66",
					"name": "闾左之赋",
					"descHidden": "里胥拍门催口赋——缸里的米，只够三日",
					"choice": {
						"segs": ["里胥拍门催口赋：「闾左贫户，也不例外！」缸里的米只够三日——这间破屋，交不出钱，只交得出人。你摸着腰间父亲留下的旧剑，鞘上的漆都磨没了：这日子，过到什么时候才是个头？"],
						"options": [
							{
								"eff": {
									"dev": 0,
									"attrs": {
										"weiji": -2,
										"caifu": -3
									}
								},
								"res": "你解剑换钱。夜里躺在草铺上，手边没了那柄剑，总觉得缺了什么——缺的是握剑的那口气。",
								"t": "卖剑完赋"
							},
							{
								"eff": {
									"dev": 0,
									"attrs": {
										"shengwang": -1,
										"caifu": -2
									}
								},
								"res": "你向邻家举债完赋，听了一夜算盘声。欠债的日子也得过——过日子的人不怕债，怕的是没有路。",
								"t": "举债应之"
							},
							{
								"eff": {
									"dev": 0,
									"attrs": {
										"tupo": -1,
										"weiji": 1,
										"moulue": 1
									}
								},
								"res": "你翻后墙出去躲了三日，回来时门上多了道催符。你揭下那道符收进怀里，像收着一件迟早要用的东西。",
								"t": "避役三日"
							}
						]
					},
					"chapters": [0, 0],
					"type": "抉择"
				},
				{
					"desc": "行事前夜，吴广问你：若事败，当如何",
					"id": "CS-ACT-67",
					"name": "大泽之约",
					"descHidden": "行事前夜，吴广问你：若事败，当如何",
					"choice": {
						"segs": ["行事前夜，吴广与你对坐篝火旁，忽然问：「若事败，当如何？」他问得很随意——这三个字，他在心里掂了很久。九百人的命就押在这一问一答之间：问的从来不是败不败，是你敢不敢把\"败\"字也扛起来。"],
						"options": [
							{
								"eff": {
									"dev": 0,
									"attrs": {
										"junxin": 1,
										"shengwang": 2
									}
								},
								"res": "你答：「同举事，共存亡。」两掌相击。这誓言传遍九百戍卒，没人再想过逃——两个把命押在同一注上的人。",
								"t": "约以共存亡"
							},
							{
								"eff": {
									"dev": 0,
									"attrs": {
										"moulue": 2,
										"weiji": -1
									}
								},
								"res": "你答：「败则分头举火，薪不尽，火不灭。」吴广沉吟良久，点头——乱世里活下来比死在一起有用，算计也是义气，把火种留着的义气。",
								"t": "约以分举"
							},
							{
								"eff": {
									"dev": 0,
									"attrs": {
										"tupo": 1,
										"biancai": 1
									}
								},
								"res": "你把酒泼进火里：「起事前不言败字！」火苗窜起三尺，吴广大笑——有些字不提，不是不信它存在，是不许它先占了心。",
								"t": "不言败字"
							}
						]
					},
					"chapters": [1, 1],
					"type": "抉择"
				},
				{
					"desc": "老卒染疫而亡，同伍凑不出一副薄棺",
					"id": "CS-ACT-68",
					"name": "老卒之葬",
					"descHidden": "老卒染疫而亡，同伍凑不出一副薄棺",
					"choice": {
						"segs": ["连日淫雨，有老卒染疫而亡，同伍凑不出一副薄棺——九百人里没有一个是富裕的。遗物只有一床破席和半袋干粮。你看着那具尸体：人走的时候连副薄棺都没有，这世道把人逼成了什么样？"],
						"options": [
							{
								"eff": {
									"dev": 0,
									"attrs": {
										"shengwang": 3,
										"caifu": -3
									}
								},
								"res": "你解囊尽出，为老卒置棺。下葬那日九百人默默列队——你埋了一个人，九百个人记住了你的手。",
								"t": "倾囊葬之"
							},
							{
								"eff": {
									"dev": 0,
									"attrs": {
										"shengwang": 1,
										"weiji": -1
									}
								},
								"res": "你主张火葬，省费且防疫。同乡起初不忿，见你亲自执火，不再言语——人来是一团火，走也归于一团火。",
								"t": "火葬从简"
							},
							{
								"eff": {
									"dev": 0,
									"attrs": {
										"moulue": 1,
										"shengwang": -1
									}
								},
								"res": "将尉骂骂咧咧扔出两个钱。规矩是尽了，只是戍卒看你的眼神淡了几分——人心淡了，就再也浓不回来。",
								"t": "报备将尉"
							}
						]
					},
					"chapters": [1, 1],
					"type": "抉择"
				},
				{
					"desc": "葛婴擅立楚王又杀之谢罪，跪在堂下等你发落",
					"id": "CS-ACT-69",
					"name": "葛婴之报",
					"descHidden": "葛婴擅立楚王又杀之谢罪，跪在堂下等你发落",
					"choice": {
						"segs": ["葛婴徇地东城，擅立襄强为楚王。闻你已自立，他杀襄强，还报请罪，跪在堂下——一颗头还没凉，另一颗头已经低下了。这一刀落不落，定的不是葛婴的罪，是张楚的规矩。"],
						"options": [
							{
								"eff": {
									"dev": 0,
									"attrs": {
										"shengwang": -2,
										"quanshi": 2
									}
								},
								"res": "你掷下令牌：「擅立者，斩。」葛婴血溅丹墀，诸将凛然——只是徇地诸将的密报里，从此多了几分惶恐。",
								"t": "诛之立威"
							},
							{
								"eff": {
									"dev": 0,
									"attrs": {
										"quanshi": -1,
										"shengwang": 2
									}
								},
								"res": "你扶他起来：「知错能改，仍为我将。」葛婴感激涕零，战必争先——可堂下有人私语：王之法，原来是可以商量的。",
								"t": "赦而用之"
							},
							{
								"eff": {
									"dev": 0,
									"attrs": {
										"moulue": 2,
										"weiji": 1
									}
								},
								"res": "你夺其兵符，留其性命。恩威并施，恰到好处——只是葛婴看你的眼神里，有什么东西碎了，再也拼不回去。",
								"t": "夺兵留用"
							}
						]
					},
					"chapters": [2, 2],
					"type": "抉择"
				},
				{
					"desc": "旧秦降卒冒雪来投，衣甲上秦徽未除",
					"id": "CS-ACT-70",
					"name": "雪中来投",
					"descHidden": "旧秦降卒冒雪来投，衣甲上秦徽未除",
					"choice": {
						"segs": ["一队旧秦降卒冒雪来投，衣甲上秦徽未除，黑压压跪在雪地里。领头的抬头：「将军，我们……不想再给秦人卖命了。」收他们是兵员，也是隐患——人心最怕的不是冷，是不知道往哪儿靠。"],
						"options": [
							{
								"eff": {
									"dev": 0,
									"attrs": {
										"wuli": 2,
										"weiji": 1
									}
								},
								"res": "你开营尽收，旧秦卒感激效死。兵力涨了一截，老兵的脸色沉了一截——秦卒楚卒一锅煮，火候难掌。",
								"t": "尽收麾下"
							},
							{
								"eff": {
									"dev": 0,
									"attrs": {
										"moulue": 2,
										"shengwang": 1
									}
								},
								"res": "你拣壮者二十人入营，老弱发给干粮遣散。既得了人，又没担包袱——这世上的事难得两全，选了稳，就得分些\"恩\"字给风。",
								"t": "择壮而遣"
							},
							{
								"eff": {
									"dev": 0,
									"attrs": {
										"shengwang": -1,
										"weiji": -2
									}
								},
								"res": "你紧闭营门，任其在雪中散去。当夜雪里有哭声——谨慎保住了营盘，也冻住了名声。有些门关上省事，再开就难了。",
								"t": "疑而不收"
							}
						]
					},
					"chapters": [2, 2],
					"type": "抉择"
				},
				{
					"desc": "旧时佣耕伙伴入宫大惊：伙颐！涉之为王沉沉者",
					"id": "CS-ACT-71",
					"name": "故人叩门",
					"descHidden": "旧时佣耕伙伴入宫大惊：伙颐！涉之为王沉沉者",
					"choice": {
						"segs": ["你既称王，旧时佣耕的伙伴辗转来投，入宫见殿屋帷帐，大惊：「伙颐！涉之为王沉沉者！」逢人便说你的贫贱旧事。近侍进言：「客愚无知，颛妄言，轻威。」——他说的每句都是真的，真的东西，有时候最伤人。"],
						"options": [
							{
								"eff": {
									"dev": 0,
									"attrs": {
										"quanshi": -1,
										"shengwang": 2
									}
								},
								"res": "你大笑受之，赐金留馆。故人越发得意，有人赞你念旧，有人笑你威轻——「苟富贵无相忘」，说的时候是真心，做到的时候才知道有多重。",
								"t": "留而厚待"
							},
							{
								"eff": {
									"dev": 0,
									"attrs": {
										"shengwang": -1,
										"weiji": -1
									}
								},
								"res": "你赐金遣归，客客气气送出城门。故人抱着金子逢人便说陈王寡情——这一送，送走的是垄上那一整片笑声。",
								"t": "逐出陈城"
							},
							{
								"eff": {
									"dev": 0,
									"attrs": {
										"quanshi": 3,
										"weiji": 1,
										"shengwang": -3
									}
								},
								"res": "你咬牙掷下令牌。「陈王斩故人」传遍诸营，旧友自此绝迹——只是夜里你常梦见垄上，梦见自己还是那个没名字的佣耕，醒来枕上凉凉的。",
								"t": "斩之立威"
							}
						]
					},
					"chapters": [3, 3],
					"type": "抉择"
				},
				{
					"desc": "称王次日议分封，吴广独坐阶下不说话",
					"id": "CS-ACT-72",
					"name": "假王之封",
					"descHidden": "称王次日议分封，吴广独坐阶下不说话",
					"choice": {
						"segs": ["称王次日，议分封诸将。吴广独坐阶下，不说话——他与你同举大计，如今你戴上了王冠，他还在阶下。他低头拨弄着大泽乡夺来的那柄佩刀：王座这个东西，站着的人，看得最清楚。"],
						"options": [
							{
								"eff": {
									"dev": 0,
									"attrs": {
										"junxin": 1,
										"quanshi": 2
									}
								},
								"res": "你以吴广为假王，监诸将西击荥阳。他拜谢而出，背影挺直——只是「假王」二字，是君臣之间第一道说不清的缝。",
								"t": "封为假王"
							},
							{
								"eff": {
									"dev": 0,
									"attrs": {
										"moulue": 2,
										"weiji": -1
									}
								},
								"res": "你留吴广坐镇陈城，不入征伐之列。他叩首领命，神色如常——有些安排是为了大局，可大局从来不问人心。",
								"t": "留镇陈城"
							},
							{
								"eff": {
									"dev": 0,
									"attrs": {
										"biancai": 1,
										"shengwang": 1
									}
								},
								"res": "你当众问他：「兄长欲何往？」吴广慨然请击荥阳，你顺势封假王——这一问，问的是去路，立的是君臣。",
								"t": "征询其志"
							}
						]
					},
					"chapters": [3, 3],
					"type": "抉择"
				},
				{
					"desc": "武臣自立为赵王，遣使来告——承认，还是讨伐",
					"id": "CS-ACT-73",
					"name": "武臣自立",
					"descHidden": "武臣自立为赵王，遣使来告——承认，还是讨伐",
					"choice": {
						"segs": ["武臣徇赵，自立为赵王，遣使奉上「贺表」——贺你称王，也贺他自己，字里行间全是分庭抗礼的客气。柱国谏：「秦未亡而诛武臣等家，此生一秦也。」你拿起那方新王玺，又放下——这一印盖下去，天下的旗就不止你一面了。"],
						"options": [
							{
								"eff": {
									"dev": 0,
									"attrs": {
										"moulue": 2,
										"weiji": 1
									}
								},
								"res": "你咽下这口气，遣使贺赵王，徙其家眷入宫「奉养」。面上是盟好，手里是人质——气咽下去最苦，可咽下去往往能走得更远。",
								"t": "遣使往贺"
							},
							{
								"eff": {
									"dev": 0,
									"attrs": {
										"wuli": 2,
										"quanshi": 1,
										"weiji": 2
									}
								},
								"res": "你拍案命点兵，柱国死谏，兵终究没出城——「陈王不能制诸将」的话，却随着商队传遍四方。",
								"t": "怒而欲伐"
							},
							{
								"eff": {
									"dev": 0,
									"attrs": {
										"shengwang": -1,
										"weiji": -1
									}
								},
								"res": "你扣下使者，不贺不伐。赵国等不到答复，索性自己过得热热闹闹——这一晾，晾的是赵国，凉的是自己。",
								"t": "扣使不问"
							}
						]
					},
					"chapters": [4, 4],
					"type": "抉择"
				},
				{
					"desc": "两将为一座县城的归属，当庭按剑相目",
					"id": "CS-ACT-74",
					"name": "殿下争功",
					"descHidden": "两将为一座县城的归属，当庭按剑相目",
					"choice": {
						"segs": ["两将当庭对质，为一座县城的归属，按剑相目——那座县城，是他们各自用血换来的。赏罚是你手里仅剩的两件兵器，用好了是绳，用不好是刃。打天下时刀口朝外，坐天下时，刀口开始朝里了。"],
						"options": [
							{
								"eff": {
									"dev": 0,
									"attrs": {
										"quanshi": -1,
										"weiji": -2
									}
								},
								"res": "你各罚俸一月，县城另派官吏。两将悻悻退朝——公平是公平了，只是打胜仗的人从此学会了先抢文书、再抢城。",
								"t": "各打五十"
							},
							{
								"eff": {
									"dev": 0,
									"attrs": {
										"shengwang": 1,
										"zhengji": 2
									}
								},
								"res": "你调来战报逐条核功，先登者受城。两将心服口服——赏罚只要占着一个\"公\"字，再利的刀也会自己收进鞘里。",
								"t": "论功定赏"
							},
							{
								"eff": {
									"dev": 0,
									"attrs": {
										"wuli": 1,
										"moulue": 1,
										"shengwang": -1
									}
								},
								"res": "你命二人校场较射，胜者得城。三箭既毕，输者掷弓大笑——痛快是痛快，只是国事渐渐有了江湖气，而江湖气撑不起一座国。",
								"t": "令其赌赛"
							}
						]
					},
					"chapters": [4, 4],
					"type": "抉择"
				},
				{
					"desc": "田臧矫令杀吴广，献首于陈——木匣里，吴广的眼睛没有闭",
					"id": "CS-ACT-75",
					"name": "田臧献首",
					"descHidden": "田臧矫令杀吴广，献首于陈——木匣里，吴广的眼睛没有闭",
					"choice": {
						"segs": ["荥阳军报：田臧矫称王令，杀假王吴广，献首于陈。木匣摆在案上，吴广的眼睛没有闭，睁着，像还在等什么。杀矫诏者则荥阳军乱，赏他则你如何面对大泽乡的篝火？你伸出手，停在半空。"],
						"options": [
							{
								"eff": {
									"dev": 0,
									"attrs": {
										"weiji": 2,
										"moulue": 2,
										"shengwang": -2
									}
								},
								"res": "你赐田臧楚令尹印，以为上将。使者欢天喜地地去了。你独坐殿中，合上吴广的眼睛——大泽乡的火，从今夜起只剩你一个人守着了。",
								"t": "赐印为上将"
							},
							{
								"eff": {
									"dev": 0,
									"attrs": {
										"wuli": 1,
										"weiji": 3,
										"shengwang": 2
									}
								},
								"res": "你掷印于地，缚来使，誓师问罪。殿上死一般寂静——公道二字，有时候比王座还重，只是公道从来不问输赢。",
								"t": "缚使问罪"
							},
							{
								"eff": {
									"dev": 0,
									"attrs": {
										"tupo": -2,
										"weiji": 1,
										"quanshi": -1
									}
								},
								"res": "你既不赏也不问，把木匣葬了，把奏报烧了。田臧在荥阳等了三日，明白了——有些东西葬不下，它会在夜里睁着眼睛，看你。",
								"t": "隐忍不问"
							}
						]
					},
					"chapters": [5, 5],
					"type": "抉择"
				},
				{
					"desc": "夜宿下城父，御者庄贾添炭，忽然问：王尚忆垄上之言乎",
					"id": "CS-ACT-76",
					"name": "雪夜添炭",
					"descHidden": "夜宿下城父，御者庄贾添炭，忽然问：王尚忆垄上之言乎",
					"choice": {
						"segs": ["腊月南徙，雪大如掌。夜宿下城父，御者庄贾进帐添炭，忽然低声问：「王尚忆垄上之言乎？」这个跟了你半年的御者，眼底有你读不懂的东西。他蹲在炭盆边等你回答——垄上的话你说了半辈子，记得的人，如今只剩一个御者了。"],
						"options": [
							{
								"eff": {
									"dev": 0,
									"attrs": {
										"tupo": 1,
										"shengwang": 1
									}
								},
								"res": "你答：「苟富贵，无相忘——不敢忘。」庄贾低头添炭，不再言语。这句话你说过很多次，可每一次说，心里都像这炭火，红一阵，又暗一阵。",
								"t": "答不敢忘"
							},
							{
								"eff": {
									"dev": 0,
									"attrs": {
										"moulue": 1,
										"weiji": -1
									}
								},
								"res": "你盯着炭火，没有接话。庄贾站了一会儿，悄无声息地退了——你握紧了枕下的剑。这一夜你不答，他也不再问，可那道缝，天亮之前总得有个了断。",
								"t": "不答"
							},
							{
								"eff": {
									"dev": 0,
									"attrs": {
										"shengwang": -1,
										"weiji": 1
									}
								},
								"res": "你挥手令其退下，炭火独明。你忽然想起垄上那群笑你的人——如今连笑你的人都没有了。黑暗里只有炭火亮着，红红的，像谁的眼睛。",
								"t": "令其退下"
							}
						]
					},
					"chapters": [6, 6],
					"type": "抉择"
				}
			],
			"GLOSSARY": {
				"阳城": "秦县，今河南登封东南。陈胜故里。秦时闾左贫民居此籍者，最先被征发。",
				"渔阳": "秦郡，今北京密云一带。陈胜等九百戍卒原定戍守之地。距阳城三千里，去时盛夏，至则严冬。",
				"大泽乡": "蕲县地名，今安徽宿州东南。前209年陈胜吴广于此起义。一场大雨，九百戍卒，帝国从这道裂缝开始漏水。",
				"扶苏": "始皇长子，仁贤，数谏始皇，被遣上郡监蒙恬军。二世矫诏赐死，天下多闻其贤而不知其死。陈胜起义诈称其名以从民望。",
				"项燕": "楚之名将，王翦破楚时死难，楚人怜之。或以为死，或以为亡。陈胜起义亦诈托其名，以收楚人之心。",
				"鱼书": "陈胜以丹书帛曰\"陈胜王\"，置鱼腹中。戍卒买鱼烹食，得书腹中，皆以为怪——天意就这么从鱼肚子里剖了出来。",
				"狐鸣": "吴广夜于丛祠旁篝火作狐鸣：\"大楚兴，陈胜王。\"戍卒惊恐，旦日往往目语。威众之术，三分靠造，七分靠人信。",
				"王侯将相宁有种乎": "陈胜召令徒属之语，千古名句，为平民反抗的最强音。两千年后读之，犹有雷声。",
				"吴广": "阳夏人，与陈胜同为屯长，素爱人，士卒多为用者。起义为都尉，围荥阳不下，后为田臧矫令所杀。",
				"葛婴": "符离人，陈胜部将，徇蕲以东。至东城，擅立襄强为楚王，闻陈王已立，因杀襄强来报，仍为陈胜所诛。",
				"襄强": "楚之宗室或旧族，为葛婴徇地时所立。王号来得快，去得也快——他的名字只在史书里活了一行。",
				"景驹": "楚之遗胤。秦末乱起，为旧臣拥立于南方，与陈胜的张楚隐隐争楚统。\"楚后\"二字，在名分上是一面更旧的旗。",
				"武臣": "陈胜部将，北徇赵地，下赵十余城。至邯郸，遂自立为赵王——陈王号令诸侯的裂缝，从这里开始。",
				"周文": "即周章，陈县贤人，尝事春申君，自言习兵。陈胜授将军印西击秦，至关中兵数十万，至戏亭为章邯所破，自刭渑池。",
				"戏亭": "戏水旁之亭，今陕西临潼东。周文大军于此为章邯所破。函谷的天险，从来不认首义之名。",
				"渑池": "秦县，今河南渑池西。周文败走出关，自刭于此。一代名将之梦，止于函谷与渑池之间。",
				"章邯": "秦末名将，少府出身。二世免骊山徒、奴产子，授其统之，连破周文、田臧、陈胜诸军——几乎以一己之力，替秦续了两年命。",
				"骊山徒": "秦始皇陵役徒与奴产子。章邯免其罪编为军，成秦军主力。坟工地上拿起的戈，比关外新卒的锄头利得多。",
				"张楚": "陈胜王号，取\"张大楚国\"之义。六月而亡，然其名一立，天下郡县皆刑其长吏以应。",
				"三老": "乡官，掌教化。陈胜据陈，召三老豪杰会计事，劝进为王。乡党的嘴，有时候比檄文管用。",
				"荥阳": "今河南荥阳，扼敖仓粮道，兵家必争。吴广、田臧围攻不下，内讧于此——坚城未破，营帐先破。",
				"敖仓": "秦之大粮仓，在荥阳西北敖山上。田臧败死于此，楚军粮道遂绝。得敖仓者得中原，自古如此。",
				"田臧": "陈胜部将，与吴广争兵，矫令杀吴广，献首于陈，自为上将。旋为章邯击死于敖仓。刀快的人，死在更快的刀下。",
				"孔鲋": "孔子八世孙，名鲋。秦焚书时藏《论语》《尚书》于壁，陈胜王陈，携礼器往归，为博士。后与陈胜同死于陈。",
				"庄贾": "陈胜御者。腊月，于下城父杀陈胜降秦。最贴身的缰绳，成了最后一把刀。",
				"下城父": "地名，今安徽涡阳东南。陈胜殒命处。腊月无灯的小路上，六个月的王业到此为止。"
			}
		};
	}));
	//#endregion
	//#region src/data/library.ts
	var import_lisi = /* @__PURE__ */ __toESM(require_lisi(), 1);
	var import_jingke = /* @__PURE__ */ __toESM(require_jingke(), 1);
	var import_hanxin = /* @__PURE__ */ __toESM(require_hanxin(), 1);
	var import_xiangyu = /* @__PURE__ */ __toESM(require_xiangyu(), 1);
	var import_chensheng = /* @__PURE__ */ __toESM(require_chensheng(), 1);
	const DATA = {
		lisi: import_lisi.default,
		jingke: import_jingke.default,
		hanxin: import_hanxin.default,
		xiangyu: import_xiangyu.default,
		chensheng: import_chensheng.default
	};
	function scenarioData(key) {
		return DATA[key] ?? null;
	}
	//#endregion
	//#region src/port/text.ts
	/** 不能出现在行首的标点(避头) */
	const NO_LINE_START = "，。、；：？！）》」』】…·—,.;:?!)]}";
	/** 不能出现在行尾的标点(避尾) */
	const NO_LINE_END = "（《「『【([{";
	/** 把 ⟦…⟧ 标记的片段解析成带颜色的 run 序列 */
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
	function layoutParagraphs(ctx, font, paras, opts) {
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
		const indent = measure("青") * (opts.indentChars ?? 2);
		const lines = [];
		const paraStarts = [];
		const eps = .5;
		/** 成对破折号作为一个不可拆单元 */
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
		for (const runs of paras) {
			paraStarts.push(lines.length);
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
				if (x + w > opts.maxWidth + eps && line.length) {
					if (!NO_LINE_START.includes(ch)) {
						let carry = null;
						const tail = line[line.length - 1];
						if (line.length > 1 && tail && NO_LINE_END.includes(tail.ch)) carry = line.pop();
						flush();
						if (carry) {
							line.push({
								ch: carry.ch,
								color: carry.color,
								x: 0,
								w: carry.w
							});
							x = carry.w;
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
				if (x >= opts.maxWidth - eps && !NO_LINE_START.includes(ch)) flush();
			}
			flush();
		}
		const gap = opts.paraGap ?? 0;
		const height = Math.max(lines.length * opts.lineHeight + Math.max(0, paraStarts.length - 1) * gap, opts.lineHeight);
		return {
			lines,
			lineHeight: opts.lineHeight,
			fontSize: opts.fontSize,
			height,
			paraStarts
		};
	}
	/**
	* 把排版结果烘焙到离屏画布(只画一次,之后整屏 blit,
	* 避免每帧上千次 fillText —— 真机上 fillText 是主要开销)。
	*/
	function renderTextCanvas(offscreen, layout, font, baseColor, paraGap) {
		const width = Math.ceil(layout.lines.flat().reduce((m, g) => Math.max(m, g.x + g.w), 0)) + 4;
		const c = offscreen.create(width, Math.ceil(layout.height) + 4);
		const ctx = c.getContext("2d");
		ctx.textBaseline = "top";
		ctx.font = font;
		const pad = (layout.lineHeight - layout.fontSize) / 2;
		const starts = new Set(layout.paraStarts);
		let extra = 0;
		layout.lines.forEach((line, i) => {
			if (i > 0 && starts.has(i)) extra += paraGap;
			const y = i * layout.lineHeight + extra + pad;
			for (const g of line) if (g.color === baseColor) {
				ctx.fillStyle = baseColor;
				ctx.fillText(g.ch, g.x, y);
			}
			for (const g of line) if (g.color !== baseColor) {
				ctx.fillStyle = g.color;
				ctx.fillText(g.ch, g.x, y);
			}
		});
		return c;
	}
	//#endregion
	//#region src/ui/kit.ts
	/**
	* 菜单类界面共用的 canvas 小工具:几何、描框、按钮、换行。
	*
	* 对局屏(scenes/play.ts)自带一套同名实现,是因为它的排版与烘焙跟这里不同频;
	* 这里只收菜单页真正重复的部分,不往对局屏倒灌。
	*/
	const inRect$1 = (x, y, r) => x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;
	function roundRect$1(ctx, r, radius) {
		const rr = Math.min(radius, r.w / 2, r.h / 2);
		ctx.beginPath();
		ctx.moveTo(r.x + rr, r.y);
		ctx.arcTo(r.x + r.w, r.y, r.x + r.w, r.y + r.h, rr);
		ctx.arcTo(r.x + r.w, r.y + r.h, r.x, r.y + r.h, rr);
		ctx.arcTo(r.x, r.y + r.h, r.x, r.y, rr);
		ctx.arcTo(r.x, r.y, r.x + r.w, r.y, rr);
		ctx.closePath();
	}
	function fitCover$1(sw, sh, iw, ih) {
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
	function makeFont(family) {
		const fam = family ? `"${family}", ` : "";
		return (size, bold = false) => `${bold ? "bold " : ""}${size}px ${fam}serif`;
	}
	/** 一次画完的底框:填充 + 描边(缺省不描) */
	function frame(ctx, r, o) {
		ctx.save();
		if (o.alpha !== void 0) ctx.globalAlpha = o.alpha;
		if (o.fill) {
			ctx.fillStyle = o.fill;
			roundRect$1(ctx, r, o.radius ?? 10);
			ctx.fill();
		}
		if (o.stroke) {
			ctx.strokeStyle = o.stroke;
			ctx.lineWidth = o.width ?? 1;
			roundRect$1(ctx, r, o.radius ?? 10);
			ctx.stroke();
		}
		ctx.restore();
	}
	/** 按钮三态配色:主(朱)/次(纸)/金 */
	function button(ctx, font, r, label, o = {}) {
		const variant = o.variant ?? "ghost";
		const radius = o.radius ?? 8;
		ctx.save();
		if (o.disabled) ctx.globalAlpha = .4;
		if (variant === "primary") {
			ctx.fillStyle = COLOR.zhu;
			roundRect$1(ctx, r, radius);
			ctx.fill();
		} else if (variant === "gold") {
			ctx.fillStyle = COLOR.goldHi;
			roundRect$1(ctx, r, radius);
			ctx.fill();
		} else {
			ctx.fillStyle = "rgba(246,239,224,0.92)";
			roundRect$1(ctx, r, radius);
			ctx.fill();
			ctx.strokeStyle = COLOR.line;
			ctx.lineWidth = 1;
			ctx.stroke();
		}
		ctx.fillStyle = variant === "ghost" ? COLOR.ink : "#f6efe0";
		ctx.font = font(o.size ?? 22, true);
		ctx.textAlign = "center";
		ctx.fillText(label, r.x + r.w / 2, r.y + (r.h - (o.size ?? 22)) / 2 + 1);
		ctx.textAlign = "left";
		ctx.restore();
	}
	/** 胶囊(难度/开关):选中描朱,未选留纸 */
	function chip(ctx, font, r, label, on, size = 19) {
		ctx.save();
		ctx.fillStyle = on ? "rgba(176,67,47,0.10)" : "rgba(246,239,224,0.85)";
		roundRect$1(ctx, r, r.h / 2);
		ctx.fill();
		ctx.strokeStyle = on ? COLOR.zhu : COLOR.lineSoft;
		ctx.lineWidth = on ? 1.6 : 1;
		ctx.stroke();
		ctx.fillStyle = on ? COLOR.zhu : COLOR.inkSoft;
		ctx.font = font(size, on);
		ctx.textAlign = "center";
		ctx.fillText(label, r.x + r.w / 2, r.y + (r.h - size) / 2 + 1);
		ctx.textAlign = "left";
		ctx.restore();
	}
	/** 顶层命中:后画的优先(与对局屏同口径) */
	function fireTap(x, y, hits) {
		for (let i = hits.length - 1; i >= 0; i--) {
			const h = hits[i];
			if (h && inRect$1(x, y, h.rect)) {
				h.on();
				return true;
			}
		}
		return false;
	}
	/**
	* 全屏压暗层:必须按「屏幕在设计坐标里的实际范围」铺,
	* 不能只填 1280×720 —— 异形屏下多出来的边会漏光(右/下一条亮边)。
	*/
	function veil(ctx, plat) {
		const x = -plat.offsetX / plat.scale;
		const y = -plat.offsetY / plat.scale;
		ctx.fillStyle = "rgba(24,20,15,0.55)";
		ctx.fillRect(x, y, plat.screenW / plat.scale, plat.screenH / plat.scale);
	}
	/**
	* 页脚小注:底图在页面下缘往往是最亮的(水面/远山),纯文字会被吃掉,
	* 所以统一垫一层薄纸。right 对齐时 x 是右边界。
	*/
	function notePlate(ctx, font, text, x, y, align = "right", size = 15) {
		ctx.font = font(size);
		const w = ctx.measureText(text).width + 26;
		const bx = align === "right" ? x - w : x;
		frame(ctx, {
			x: bx,
			y: y - 7,
			w,
			h: size + 15
		}, {
			fill: "rgba(246,239,224,0.74)",
			radius: 7
		});
		ctx.fillStyle = COLOR.inkSoft;
		ctx.textAlign = "left";
		ctx.fillText(text, bx + 13, y);
	}
	//#endregion
	//#region src/scenes/play.ts
	const SIDE = {
		x: 856,
		y: 92,
		w: 368,
		h: 452
	};
	/** 正文可视区:面板内、底部按钮之上 */
	const STORY = {
		x: PANEL$1.x + 48,
		y: PANEL$1.y + 34,
		w: PANEL$1.w - 96,
		h: PANEL$1.h - 106
	};
	/** 关键事件提示条:钉在面板与选项卡之间 */
	const KEYBAR = {
		x: PANEL$1.x + 22,
		y: PANEL$1.y + PANEL$1.h + 6,
		w: PANEL$1.w - 44,
		h: 26
	};
	const SLOT_Y = 584;
	const SLOT_H = 110;
	const BTN = {
		x: PANEL$1.x + PANEL$1.w - 172,
		y: PANEL$1.y + PANEL$1.h - 58,
		w: 124,
		h: 38
	};
	const BACK$3 = {
		x: 1132,
		y: 26,
		w: 72,
		h: 32
	};
	/** 顶栏「菜单」:回主菜单前由外层决定是否落一条自动档 */
	const MENU = {
		x: 1050,
		y: 26,
		w: 72,
		h: 32
	};
	/** 右栏:五维雷达 + 身外六维 */
	const RADAR_AXES = [
		"tupo",
		"wuli",
		"caixue",
		"moulue",
		"biancai"
	];
	const SIDE_ATTRS = [
		"caifu",
		"shengwang",
		"quanshi",
		"zhengji",
		"junxin",
		"weiji"
	];
	/** 行动卡类型徽标配色(对齐 H5 card-face-* 的五色) */
	const TYPE_COLOR = {
		进取: "#9e3422",
		守成: "#467069",
		兑换: "#8a6a34",
		保身: "#567444",
		抉择: "#6b4a76"
	};
	const inRect = (x, y, r) => x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;
	function roundRect(ctx, r, radius) {
		const rr = Math.min(radius, r.w / 2, r.h / 2);
		ctx.beginPath();
		ctx.moveTo(r.x + rr, r.y);
		ctx.arcTo(r.x + r.w, r.y, r.x + r.w, r.y + r.h, rr);
		ctx.arcTo(r.x + r.w, r.y + r.h, r.x, r.y + r.h, rr);
		ctx.arcTo(r.x, r.y + r.h, r.x, r.y, rr);
		ctx.arcTo(r.x, r.y, r.x + r.w, r.y, rr);
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
	/** 「第一章 ｜ 兰陵问道」→「兰陵问道」 */
	function shortTitle(full) {
		const parts = full.split("｜");
		return parts.length > 1 ? (parts[1] ?? full).trim() : full;
	}
	const TYPE_ERA = /^(教学章|历史节点预备|历史节点|全剧本枢纽)$/;
	var PlayScene = class {
		plat;
		assets;
		run;
		fontFamily;
		opts;
		blocks = [];
		scrollY = 0;
		totalH = 0;
		drag = null;
		hits = [];
		lastScreen = "";
		lastRev = -1;
		lastPending = null;
		timer = null;
		/** 绘制帧数:冒烟脚本据此判断渲染循环是否还在跑 */
		frames = 0;
		toast = null;
		confirm = null;
		/** 正文字号倍率:进局时定死,一局之内不换字号(已烘焙的块不跟着变) */
		textMul;
		constructor(plat, assets, run, fontFamily, opts = {}) {
			this.plat = plat;
			this.assets = assets;
			this.run = run;
			this.fontFamily = fontFamily;
			this.opts = opts;
			/** 外层已经替我们 start()/resume() 过引擎:这里只负责把相位摆上卷轴 */
			this.textMul = opts.settings?.value.textScale === "small" ? .9 : opts.settings?.value.textScale === "large" ? 1.12 : 1;
			this.refresh();
		}
		dispose() {
			this.cancelTimer();
		}
		/** 调试/冒烟用:当前相位、卷轴规模、可点区域(设计坐标) */
		debug() {
			return {
				screen: this.run.screen,
				blocks: this.blocks.length,
				totalH: this.totalH,
				scrollY: this.scrollY,
				pending: this.run.pending ? this.run.pending.r.kind ?? "settle" : null,
				frames: this.frames,
				hits: this.hits.map((h) => ({
					kind: h.kind,
					x: h.rect.x,
					y: h.rect.y,
					w: h.rect.w,
					h: h.rect.h
				}))
			};
		}
		cancelTimer() {
			if (this.timer !== null) clearTimeout(this.timer);
			this.timer = null;
		}
		/** 每次交互/定时推进后调:换相位补题签块、结算补结果块、自动推进挂计时 */
		refresh() {
			const run = this.run;
			if (run.revision !== this.lastRev) {
				this.lastRev = run.revision;
				this.blocks = [];
				this.scrollY = 0;
				this.totalH = 0;
				this.pushPhaseBlock();
			} else if (run.screen !== this.lastScreen) this.pushPhaseBlock();
			this.lastScreen = run.screen;
			if (run.pending && run.pending !== this.lastPending) {
				this.lastPending = run.pending;
				const p = run.pending;
				this.pushBlock(p.title, [p.r.text], [p.warn], p.r.changes);
				this.cancelTimer();
				if (p.auto) {
					const base = this.opts.settings?.value.segDelay ?? 650;
					const wait = p.r.changes.length > 0 ? base * 3 : base * 2;
					this.timer = setTimeout(() => this.act(() => run.advance()), wait);
				}
			} else if (!run.pending && this.lastPending !== null) {
				this.lastPending = null;
				this.cancelTimer();
			}
			if (run.toast) {
				this.toast = {
					text: run.toast,
					until: Date.now() + 2e3
				};
				run.toast = "";
			}
		}
		act(fn) {
			fn();
			this.refresh();
		}
		/** 相位切换时补一块正文(回合不推正文,只换手牌) */
		pushPhaseBlock() {
			const run = this.run;
			const g = run.game;
			switch (run.screen) {
				case "intro": {
					const ch = g.chapter();
					if (!ch) return;
					const era = (ch.sub ?? "").split("·").map((s) => s.trim()).filter((s) => s && !TYPE_ERA.test(s)).join(" · ");
					this.pushBlock(`${shortTitle(ch.title)}${era ? ` · ${era}` : ""}`, ch.intro ?? [], [], void 0, g.introNotes);
					break;
				}
				case "event": {
					const ev = g.eventId ? g.findEvent(g.eventId) : null;
					if (!ev) return;
					const title = g.currentRandom != null ? `际遇 · 随机事件——${ev.title}` : `关键事件 · ${ev.title}`;
					this.pushBlock(title, run.eventSegs(ev), []);
					break;
				}
				case "choice": {
					const v = g.getChoiceCard();
					if (!v) return;
					this.pushBlock(`抉择 · ${v.title}`, run.eventSegs(v), []);
					break;
				}
				case "endEvent": {
					const ev = g.currentEndEvent;
					if (!ev) return;
					this.pushBlock(ev.title, run.eventSegs(ev), []);
					break;
				}
			}
		}
		font(size, bold = false) {
			const fam = this.fontFamily ? `"${this.fontFamily}", ` : "";
			return `${bold ? "bold " : ""}${size}px ${fam}serif`;
		}
		wrap(text, size, bold, maxW, maxLines = 99) {
			const ctx = this.plat.ctx;
			ctx.font = this.font(size, bold);
			const out = [];
			let line = "";
			for (const ch of text) {
				const test = line + ch;
				if (ctx.measureText(test).width > maxW && line) {
					out.push(line);
					line = ch;
				} else line = test;
			}
			if (line) out.push(line);
			if (out.length > maxLines) {
				out.length = maxLines;
				const last = out[maxLines - 1] ?? "";
				out[maxLines - 1] = `${last.slice(0, Math.max(1, last.length - 1))}…`;
			}
			return out;
		}
		/** 追加一块:排版 + 烘焙正文;题签/胶囊画时直出 */
		pushBlock(title, segs, warns, changes, notes) {
			const accent = COLOR.zhu;
			const paras = segs.map((s) => parseRuns(s, COLOR.ink, accent));
			for (const n of notes ?? []) paras.push(parseRuns(n, COLOR.zhu, accent));
			const fs = Math.round(TEXT.fontSize * this.textMul);
			const lh = Math.round(TEXT.lineHeight * this.textMul);
			const layout = layoutParagraphs(this.plat.ctx, this.font(fs), paras, {
				maxWidth: STORY.w,
				fontSize: fs,
				lineHeight: lh,
				paraGap: TEXT.paraGap
			});
			const body = paras.length ? renderTextCanvas(this.plat.offscreen, layout, this.font(fs), COLOR.ink, TEXT.paraGap) : null;
			const bodyH = paras.length ? layout.height : 0;
			const titleLines = title ? this.wrap(title, 26, true, STORY.w, 2) : [];
			const warnLines = [];
			for (const w of warns) if (w) warnLines.push(...this.wrap(w, 19, true, STORY.w, 2));
			const chipRows = [];
			let row = [];
			let x = 0;
			this.plat.ctx.font = this.font(17);
			for (const c of changes ?? []) {
				const text = `${c.label} ${c.delta > 0 ? "+" : ""}${c.delta}${c.note ? `（${c.note}）` : ""}`;
				const w = Math.ceil(this.plat.ctx.measureText(text).width) + 18;
				if (x + w > STORY.w && row.length) {
					chipRows.push(row);
					row = [];
					x = 0;
				}
				row.push({
					text,
					up: c.delta > 0,
					x,
					w
				});
				x += w + 8;
			}
			if (row.length) chipRows.push(row);
			const chipH = chipRows.length ? chipRows.length * 30 + 6 : 0;
			const h = (titleLines.length ? titleLines.length * 34 + 4 : 0) + (warnLines.length ? warnLines.length * 25 + 2 : 0) + bodyH + chipH + 26;
			this.blocks.push({
				titleLines,
				warnLines,
				body,
				bodyH,
				chipRows,
				chipH,
				h
			});
			this.totalH += h;
			this.scrollY = Math.max(0, Math.min(this.maxScroll, this.totalH - h));
		}
		get maxScroll() {
			return Math.max(0, this.totalH - STORY.h);
		}
		pointerDown(x, y, id) {
			if (this.confirm) return;
			if (inRect(x, y, STORY)) this.drag = {
				id,
				startY: y,
				startScroll: this.scrollY,
				moved: false
			};
		}
		pointerMove(_x, y, id) {
			if (!this.drag || this.drag.id !== id) return;
			const dy = y - this.drag.startY;
			if (!this.drag.moved && Math.abs(dy) > 6) this.drag.moved = true;
			if (!this.drag.moved) return;
			this.scrollY = Math.max(0, Math.min(this.maxScroll, this.drag.startScroll - dy));
		}
		pointerUp(x, y, id) {
			const moved = this.drag?.moved ?? false;
			if (this.drag && this.drag.id === id) this.drag = null;
			if (moved) return;
			this.tap(x, y);
		}
		tap(x, y) {
			if (this.confirm) {
				for (const h of this.hits) {
					if (h.kind !== "yes" && h.kind !== "no") continue;
					if (!inRect(x, y, h.rect)) continue;
					const c = this.confirm;
					this.confirm = null;
					if (h.kind === "yes") this.act(c.onOk);
					return;
				}
				return;
			}
			for (let i = this.hits.length - 1; i >= 0; i--) {
				const h = this.hits[i];
				if (!h || !inRect(x, y, h.rect)) continue;
				this.fire(h);
				return;
			}
		}
		fire(h) {
			const run = this.run;
			switch (h.kind) {
				case "overlay":
					if (run.screen === "summary") this.act(() => run.proceedSummary());
					else if (run.screen === "correction") this.act(() => run.correctionContinue());
					else if (run.screen === "ending" || run.screen === "finished") this.act(() => this.opts.onFinish?.());
					break;
				case "continue":
					this.act(() => run.pending ? run.advance() : run.beginEvents());
					break;
				case "key":
					this.act(() => run.playCard(h.index));
					break;
				case "card":
					this.act(() => run.playCard(h.index));
					break;
				case "option":
					this.act(() => run.choose(h.index));
					break;
				case "xushi":
					this.act(() => run.playXushi());
					break;
				case "choice":
					this.act(() => run.chooseCardOption(h.index));
					break;
				case "cancel":
					this.act(() => run.cancelChoice());
					break;
				case "endEvent":
					this.act(() => run.endEventChoose(h.index));
					break;
				case "back":
					this.openBacktrack();
					break;
				case "menu": this.opts.onMenu?.();
			}
		}
		openBacktrack() {
			const g = this.run.game;
			if (!g.canBacktrack()) return;
			const quota = g.diff.backtrack;
			const left = quota > 0 ? Math.max(0, quota - g.backtracksThisChapter) : null;
			this.confirm = {
				title: "回溯 ｜ 回到本章开头",
				lines: [quota < 0 ? "本章可无限次回溯,但每回溯一次,本章收益便削减一分。" : `本章还剩 ${left} 次回溯机会。`, "偏离度与已解锁的成就、声望、图鉴都不会重置——史书会记得。"],
				okText: "回 溯",
				onOk: () => this.act(() => this.run.backtrack())
			};
		}
		draw() {
			const { ctx, dpr, screenW, screenH, scale, offsetX, offsetY } = this.plat;
			this.frames += 1;
			this.hits = [];
			ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
			ctx.fillStyle = COLOR.app;
			ctx.fillRect(0, 0, screenW, screenH);
			const bg = this.assets.get(IMG.bgGame);
			if (bg) {
				const r = fitCover(screenW, screenH, bg.w, bg.h);
				ctx.drawImage(bg.img, r.x, r.y, r.w, r.h);
			}
			ctx.setTransform(dpr * scale, 0, 0, dpr * scale, dpr * offsetX, dpr * offsetY);
			ctx.textBaseline = "top";
			ctx.textAlign = "left";
			this.drawPanel();
			this.drawSide();
			this.drawTop();
			const s = this.run.screen;
			if (s === "summary" || s === "ending" || s === "correction" || s === "finished") this.drawOverlay(s);
			else {
				this.drawStory();
				this.drawKeybar();
				this.drawSlots();
				this.drawTopButton();
			}
			this.drawToast();
			if (this.confirm) this.drawConfirm();
		}
		drawPanel() {
			const ctx = this.plat.ctx;
			const panel = this.assets.get(IMG.panelScroll);
			if (panel) ctx.drawImage(panel.img, PANEL$1.x, PANEL$1.y, PANEL$1.w, PANEL$1.h);
			else {
				ctx.fillStyle = COLOR.paper;
				roundRect(ctx, PANEL$1, 10);
				ctx.fill();
				ctx.strokeStyle = COLOR.line;
				ctx.stroke();
			}
		}
		drawTop() {
			const ctx = this.plat.ctx;
			const g = this.run.game;
			const ch = g.chapter();
			let right = ch ? ch.title : "";
			if (ch && (g.phase === "round" || g.phase === "event")) {
				const p = g.chapterProgress();
				right += ` · ${p.done}/${p.total}`;
			}
			ctx.font = this.font(20);
			ctx.fillStyle = COLOR.inkDim;
			ctx.textAlign = "left";
			const name = g.d.SCENARIO.name;
			ctx.fillText(name, PANEL$1.x, 32);
			const nameW = ctx.measureText(name).width + 22;
			ctx.fillStyle = COLOR.line;
			ctx.fillText("｜", PANEL$1.x + nameW, 32);
			ctx.fillStyle = COLOR.inkStrong;
			ctx.fillText(right, PANEL$1.x + nameW + 20, 32);
		}
		/** 顶栏右侧「菜单 / 回溯」:回溯不可用时压暗,菜单常驻 */
		drawTopButton() {
			const ctx = this.plat.ctx;
			ctx.fillStyle = "rgba(246,239,224,0.75)";
			roundRect(ctx, MENU, 6);
			ctx.fill();
			ctx.strokeStyle = COLOR.line;
			ctx.lineWidth = 1;
			ctx.stroke();
			ctx.fillStyle = COLOR.ink;
			ctx.font = this.font(17);
			ctx.textAlign = "center";
			ctx.fillText("菜单", MENU.x + MENU.w / 2, MENU.y + 8);
			ctx.textAlign = "left";
			if (this.opts.onMenu) this.hits.push({
				rect: MENU,
				kind: "menu",
				index: 0
			});
			const can = this.run.game.canBacktrack();
			ctx.globalAlpha = can ? 1 : .35;
			ctx.fillStyle = "rgba(246,239,224,0.75)";
			roundRect(ctx, BACK$3, 6);
			ctx.fill();
			ctx.strokeStyle = COLOR.line;
			ctx.lineWidth = 1;
			ctx.stroke();
			ctx.fillStyle = COLOR.ink;
			ctx.font = this.font(17);
			ctx.textAlign = "center";
			ctx.fillText("回溯", BACK$3.x + BACK$3.w / 2, BACK$3.y + 8);
			ctx.textAlign = "left";
			ctx.globalAlpha = 1;
			if (can) this.hits.push({
				rect: BACK$3,
				kind: "back",
				index: 0
			});
		}
		drawStory() {
			const ctx = this.plat.ctx;
			ctx.save();
			ctx.beginPath();
			ctx.rect(STORY.x, STORY.y, STORY.w, STORY.h);
			ctx.clip();
			let y = STORY.y - Math.round(this.scrollY);
			for (const b of this.blocks) {
				if (b.titleLines.length) {
					ctx.fillStyle = COLOR.inkHeavy;
					ctx.font = this.font(26, true);
					for (const line of b.titleLines) {
						ctx.fillText(line, STORY.x, y + 4);
						y += 34;
					}
					y += 4;
				}
				if (b.warnLines.length) {
					ctx.fillStyle = COLOR.zhu;
					ctx.font = this.font(19, true);
					for (const line of b.warnLines) {
						ctx.fillText(line, STORY.x, y + 2);
						y += 25;
					}
					y += 2;
				}
				if (b.body) {
					ctx.drawImage(b.body, STORY.x, y);
					y += b.bodyH;
				}
				if (b.chipRows.length) {
					y += 6;
					for (const row of b.chipRows) {
						for (const chip of row) {
							const r = {
								x: STORY.x + chip.x,
								y,
								w: chip.w,
								h: 25
							};
							ctx.fillStyle = chip.up ? "rgba(176,67,47,0.08)" : "rgba(70,112,105,0.10)";
							roundRect(ctx, r, 12);
							ctx.fill();
							ctx.strokeStyle = chip.up ? COLOR.zhu : COLOR.qing;
							ctx.lineWidth = 1;
							ctx.stroke();
							ctx.fillStyle = chip.up ? COLOR.zhu : COLOR.qing;
							ctx.font = this.font(17);
							ctx.textAlign = "center";
							ctx.fillText(chip.text, r.x + r.w / 2, r.y + 4);
							ctx.textAlign = "left";
						}
						y += 30;
					}
					y += 6;
				}
				y += 26;
			}
			if (this.blocks.length === 0) {
				ctx.fillStyle = COLOR.inkDim;
				ctx.font = this.font(22);
				ctx.textAlign = "center";
				ctx.fillText("选一张行动牌，推进这一轮", STORY.x + STORY.w / 2, STORY.y + 20);
				ctx.textAlign = "left";
			}
			ctx.restore();
			if (this.maxScroll > 0) {
				const barH = Math.max(28, STORY.h * (STORY.h / this.totalH));
				const barY = STORY.y + (STORY.h - barH) * (this.scrollY / this.maxScroll);
				ctx.fillStyle = "rgba(176,67,47,0.45)";
				roundRect(ctx, {
					x: STORY.x + STORY.w + 12,
					y: barY,
					w: 5,
					h: barH
				}, 2.5);
				ctx.fill();
			}
		}
		drawKeybar() {
			const run = this.run;
			if (run.screen !== "round" || run.pending) return;
			const offer = run.game.getOffer();
			const idx = offer.findIndex((e) => e.type === "key");
			const key = idx >= 0 ? offer[idx] : null;
			if (!key || key.type !== "key" || !key.enterable) return;
			const ctx = this.plat.ctx;
			ctx.fillStyle = "rgba(176,67,47,0.10)";
			roundRect(ctx, KEYBAR, 6);
			ctx.fill();
			ctx.strokeStyle = COLOR.zhu;
			ctx.lineWidth = 1;
			ctx.stroke();
			ctx.fillStyle = COLOR.zhu;
			ctx.font = this.font(16, true);
			ctx.textAlign = "center";
			ctx.fillText(`关键事件「${key.title ?? ""}」已至——点此了断本章`, KEYBAR.x + KEYBAR.w / 2, KEYBAR.y + 5);
			ctx.textAlign = "left";
			this.hits.push({
				rect: KEYBAR,
				kind: "key",
				index: idx
			});
		}
		drawSlots() {
			const run = this.run;
			const screen = run.screen;
			if (screen === "intro") {
				if (!run.pending) this.drawContinue("继 续");
				return;
			}
			if (screen === "round") {
				this.drawRoundCards();
				return;
			}
			if (screen === "event") {
				this.drawOptions(run.game.getOptions(), false);
				return;
			}
			if (screen === "choice") {
				const opts = (run.game.getChoiceCard()?.options ?? []).map((o) => ({
					opt: o,
					locked: !!o.locked,
					reason: o.reason ?? null,
					hist: !!o.hist,
					risky: null
				}));
				this.drawOptions(opts, true);
				return;
			}
			if (screen === "endEvent") {
				const opts = run.game.currentEndEvent?.options ?? [];
				this.drawEndEventOptions(opts);
			}
		}
		/** 行内选项卡:等宽排布,最多 5 张 */
		slotRects(n) {
			const usable = 1160;
			let w = 240;
			let gap = 20;
			if (n > 4) {
				gap = 12;
				w = Math.floor((usable - gap * (n - 1)) / n);
			}
			const total = w * n + gap * Math.max(0, n - 1);
			const x0 = Math.round((DESIGN_W - total) / 2);
			const out = [];
			for (let i = 0; i < n; i++) out.push({
				x: x0 + i * (w + gap),
				y: SLOT_Y,
				w,
				h: SLOT_H
			});
			return out;
		}
		drawRoundCards() {
			const run = this.run;
			if (run.pending) {
				this.drawSettleHint();
				return;
			}
			const offer = run.game.getOffer();
			const idxs = [];
			for (let i = 0; i < offer.length; i++) if (offer[i]?.type === "action") idxs.push(i);
			const rects = this.slotRects(idxs.length + 1);
			const hide = run.game.diff.hideAttrs;
			idxs.forEach((offerIdx, k) => {
				const e = offer[offerIdx];
				const rect = rects[k];
				if (!e || !rect) return;
				const a = e.action;
				const type = a?.type ?? (a?.id === "__cure__" ? "保身" : "");
				const desc = (hide ? a?.descHidden : a?.desc) ?? "";
				const lock = e.locked && e.reason ? `🔒 ${e.reason}` : "";
				const risk = e.risky ? run.riskText(e.risky) : "";
				const foot = e.diminishing ? `已用 ${e.usedCount ?? 0} 次 · 收益递减` : "";
				this.drawCard(rect, {
					type,
					name: `${a?.name ?? e.id ?? ""}${e.risky ? "  ⚠" : ""}`,
					desc,
					lock,
					risk,
					foot,
					dim: !!e.locked
				});
				if (!e.locked) this.hits.push({
					rect,
					kind: "card",
					index: offerIdx
				});
			});
			const xr = rects[idxs.length];
			if (xr) {
				this.drawCard(xr, {
					type: "蓄势",
					name: "蓄势 · 静观其变",
					desc: run.game.xushi ? "已蓄势——下一次抉择的险招成功率 +10" : "不出手牌，为下一次抉择蓄一分胜算（险招 +10）",
					dim: run.game.xushi
				});
				if (!run.game.xushi) this.hits.push({
					rect: xr,
					kind: "xushi",
					index: -1
				});
			}
		}
		drawOptions(opts, isChoice) {
			const run = this.run;
			if (run.pending) {
				this.drawSettleHint();
				return;
			}
			const n = opts.length + (isChoice ? 1 : 0);
			const rects = this.slotRects(Math.max(1, n));
			opts.forEach((o, i) => {
				const rect = rects[i];
				if (!rect) return;
				const lock = o.locked && o.reason ? `🔒 ${o.reason}` : "";
				const risky = o.risky ? run.riskText(o.risky) : "";
				this.drawCard(rect, {
					name: o.opt.t,
					lock,
					risk: risky,
					hist: o.hist,
					dim: o.locked
				});
				if (!o.locked) this.hits.push({
					rect,
					kind: isChoice ? "choice" : "option",
					index: i
				});
			});
			if (isChoice) {
				const rect = rects[opts.length];
				if (rect) {
					this.drawCard(rect, {
						name: "且搁置",
						desc: "暂不作决，回这一轮另作打算",
						dim: false
					});
					this.hits.push({
						rect,
						kind: "cancel",
						index: -1
					});
				}
			}
		}
		drawEndEventOptions(opts) {
			const run = this.run;
			if (run.pending) {
				this.drawSettleHint();
				return;
			}
			const rects = this.slotRects(Math.max(1, opts.length));
			opts.forEach((o, i) => {
				const rect = rects[i];
				if (!rect) return;
				const gate = run.reqCheck(o.req);
				const broke = run.brokeFor(o);
				const ok = gate.ok && !broke;
				const reason = gate.ok ? broke ? "财富见底，无力为之" : "" : gate.reason ?? "";
				this.drawCard(rect, {
					name: o.t,
					lock: ok ? "" : `🔒 ${reason}`,
					dim: !ok
				});
				if (ok) this.hits.push({
					rect,
					kind: "endEvent",
					index: i
				});
			});
		}
		drawCard(rect, o) {
			const ctx = this.plat.ctx;
			const art = this.assets.get(IMG.card);
			ctx.globalAlpha = o.dim ? .72 : 1;
			if (art) ctx.drawImage(art.img, rect.x, rect.y, rect.w, rect.h);
			else {
				ctx.fillStyle = COLOR.paperCard;
				roundRect(ctx, rect, 10);
				ctx.fill();
				ctx.strokeStyle = COLOR.line;
				ctx.lineWidth = 1;
				ctx.stroke();
			}
			let y = rect.y + 10;
			const x = rect.x + 12;
			const maxW = rect.w - 24;
			let firstX = x;
			let nameW = o.hist ? maxW - 26 : maxW;
			if (o.type && TYPE_COLOR[o.type]) {
				const label = o.type;
				ctx.font = this.font(14);
				const bw = Math.ceil(ctx.measureText(label).width) + 16;
				const br = {
					x,
					y: y + 1,
					w: bw,
					h: 18
				};
				ctx.fillStyle = TYPE_COLOR[o.type];
				roundRect(ctx, br, 9);
				ctx.fill();
				ctx.fillStyle = "#f6efe0";
				ctx.textAlign = "center";
				ctx.fillText(label, br.x + br.w / 2, br.y + 2);
				ctx.textAlign = "left";
				firstX = x + bw + 8;
				nameW = Math.max(40, nameW - bw - 8);
			} else if (o.type) {
				ctx.font = this.font(14);
				ctx.fillStyle = COLOR.gold;
				ctx.fillText(o.type, x, y + 2);
				y += 22;
			}
			if (o.hist) {
				const cx = rect.x + rect.w - 20;
				const cy = rect.y + 16;
				ctx.beginPath();
				ctx.arc(cx, cy, 10, 0, Math.PI * 2);
				ctx.fillStyle = "rgba(246,239,224,0.92)";
				ctx.fill();
				ctx.strokeStyle = COLOR.zhu;
				ctx.lineWidth = 1;
				ctx.stroke();
				ctx.fillStyle = COLOR.zhu;
				ctx.font = this.font(13, true);
				ctx.textAlign = "center";
				ctx.fillText("史", cx, cy - 6);
				ctx.textAlign = "left";
			}
			const nameLines = this.wrap(o.name, 19, true, nameW, 2);
			ctx.fillStyle = COLOR.inkHeavy;
			ctx.font = this.font(19, true);
			nameLines.forEach((line, i) => {
				ctx.fillText(line, i === 0 ? firstX : x, y);
				y += 22;
			});
			const bottomLimit = rect.y + rect.h - (o.foot ? 20 : 8);
			const fits = (size) => Math.max(0, Math.floor((bottomLimit - y) / size));
			if (o.lock) {
				const lines = this.wrap(o.lock, 14, false, maxW, Math.max(1, fits(17)));
				ctx.fillStyle = COLOR.zhu;
				ctx.font = this.font(14);
				for (const line of lines) {
					ctx.fillText(line, x, y);
					y += 17;
				}
			} else {
				if (o.desc) {
					const n = Math.min(2, fits(16));
					if (n > 0) {
						const lines = this.wrap(o.desc, 13, false, maxW, n);
						ctx.fillStyle = COLOR.inkDim;
						ctx.font = this.font(13);
						for (const line of lines) {
							ctx.fillText(line, x, y);
							y += 16;
						}
					}
				}
				if (o.risk) {
					const n = Math.min(2, fits(16));
					if (n > 0) {
						const lines = this.wrap(o.risk, 13, false, maxW, n);
						ctx.fillStyle = COLOR.gold;
						ctx.font = this.font(13);
						for (const line of lines) {
							ctx.fillText(line, x, y);
							y += 16;
						}
					}
				}
			}
			if (o.foot) {
				ctx.fillStyle = COLOR.gold;
				ctx.font = this.font(12);
				ctx.fillText(o.foot, x, rect.y + rect.h - 18);
			}
			ctx.globalAlpha = 1;
		}
		/** 结算中:选项卡区不再可点 */
		drawSettleHint() {
			const ctx = this.plat.ctx;
			const run = this.run;
			const rect = {
				x: 60,
				y: SLOT_Y,
				w: 1160,
				h: SLOT_H
			};
			ctx.fillStyle = "rgba(246,239,224,0.55)";
			roundRect(ctx, rect, 8);
			ctx.fill();
			ctx.strokeStyle = COLOR.lineSoft;
			ctx.lineWidth = 1;
			ctx.stroke();
			if (run.pending && !run.pending.auto) {
				const btn = {
					x: rect.x + rect.w / 2 - 62,
					y: rect.y + 26,
					w: 124,
					h: 46
				};
				ctx.fillStyle = COLOR.zhu;
				roundRect(ctx, btn, 8);
				ctx.fill();
				ctx.fillStyle = "#f6efe0";
				ctx.font = this.font(22, true);
				ctx.textAlign = "center";
				ctx.fillText("继 续", btn.x + btn.w / 2, btn.y + 10);
				ctx.textAlign = "left";
				this.hits.push({
					rect: btn,
					kind: "continue",
					index: 0
				});
			} else {
				ctx.fillStyle = COLOR.inkDim;
				ctx.font = this.font(18);
				ctx.textAlign = "center";
				ctx.fillText("结算中…", rect.x + rect.w / 2, rect.y + 38);
				ctx.textAlign = "left";
			}
		}
		drawContinue(label) {
			const ctx = this.plat.ctx;
			if (this.run.pending) {
				this.drawSettleHint();
				return;
			}
			ctx.fillStyle = COLOR.zhu;
			roundRect(ctx, BTN, 8);
			ctx.fill();
			ctx.fillStyle = "#f6efe0";
			ctx.font = this.font(20, true);
			ctx.textAlign = "center";
			ctx.fillText(label, BTN.x + BTN.w / 2, BTN.y + 8);
			ctx.textAlign = "left";
			this.hits.push({
				rect: BTN,
				kind: "continue",
				index: 0
			});
		}
		drawSide() {
			const ctx = this.plat.ctx;
			const g = this.run.game;
			ctx.fillStyle = "rgba(246,239,224,0.82)";
			roundRect(ctx, SIDE, 8);
			ctx.fill();
			ctx.strokeStyle = COLOR.lineSoft;
			ctx.lineWidth = 1;
			ctx.stroke();
			ctx.fillStyle = COLOR.inkDim;
			ctx.font = this.font(17, true);
			ctx.textAlign = "center";
			ctx.fillText("属 性", SIDE.x + SIDE.w / 2, SIDE.y + 14);
			ctx.textAlign = "left";
			this.drawRadar();
			this.drawAttrRows();
			const band = g.d.DEV_BANDS[g.devBand()];
			ctx.fillStyle = COLOR.zhu;
			ctx.font = this.font(18, true);
			ctx.textAlign = "center";
			const footY = SIDE.y + SIDE.h - 34;
			const ageTxt = g.age != null ? ` · ${g.age} 岁` : "";
			ctx.fillText(`偏离 ${g.dev}（${band ? band.name : "—"}）${ageTxt}`, SIDE.x + SIDE.w / 2, footY);
			ctx.textAlign = "left";
		}
		drawRadar() {
			const ctx = this.plat.ctx;
			const g = this.run.game;
			const cx = SIDE.x + SIDE.w / 2;
			const cy = SIDE.y + 118;
			const R = 52;
			const pt = (i, ratio) => {
				const a = Math.PI * 2 * i / RADAR_AXES.length - Math.PI / 2;
				return {
					x: cx + Math.cos(a) * R * ratio,
					y: cy + Math.sin(a) * R * ratio
				};
			};
			ctx.strokeStyle = "rgba(198,180,146,0.75)";
			ctx.lineWidth = 1;
			for (let ring = 1; ring <= 5; ring++) {
				ctx.beginPath();
				for (let i = 0; i < 5; i++) {
					const p = pt(i, ring / 5);
					if (i === 0) ctx.moveTo(p.x, p.y);
					else ctx.lineTo(p.x, p.y);
				}
				ctx.closePath();
				ctx.stroke();
			}
			ctx.beginPath();
			for (let i = 0; i < 5; i++) {
				const k = RADAR_AXES[i];
				const max = Math.max(1, g.attrMax(k));
				const p = pt(i, Math.max(0, Math.min(1, (g.attrs[k] ?? 0) / max)));
				if (i === 0) ctx.moveTo(p.x, p.y);
				else ctx.lineTo(p.x, p.y);
			}
			ctx.closePath();
			ctx.fillStyle = "rgba(176,67,47,0.20)";
			ctx.fill();
			ctx.strokeStyle = COLOR.zhu;
			ctx.lineWidth = 1.5;
			ctx.stroke();
			ctx.font = this.font(14);
			for (let i = 0; i < 5; i++) {
				const k = RADAR_AXES[i];
				const p = pt(i, 1);
				ctx.beginPath();
				ctx.arc(p.x, p.y, 2.5, 0, Math.PI * 2);
				ctx.fillStyle = COLOR.zhu;
				ctx.fill();
				const lp = pt(i, 1.42);
				ctx.fillStyle = COLOR.inkSoft;
				ctx.textAlign = "center";
				ctx.fillText(g.d.ATTR_NAMES[k] ?? k, lp.x, lp.y - 8);
			}
			ctx.textAlign = "left";
		}
		drawAttrRows() {
			const ctx = this.plat.ctx;
			const g = this.run.game;
			const x = SIDE.x + 22;
			const w = SIDE.w - 44;
			let y = SIDE.y + 208;
			for (const k of SIDE_ATTRS) {
				const v = g.attrs[k] ?? 0;
				ctx.fillStyle = COLOR.inkSoft;
				ctx.font = this.font(16);
				ctx.fillText(g.d.ATTR_NAMES[k] ?? k, x, y);
				ctx.fillStyle = COLOR.inkStrong;
				ctx.font = this.font(16, true);
				ctx.textAlign = "right";
				ctx.fillText(g.diff.hideAttrs ? g.attrWord(k) : String(v), x + w, y);
				ctx.textAlign = "left";
				const max = Math.max(1, g.attrMax(k));
				const ratio = Math.max(0, Math.min(1, v / max));
				ctx.fillStyle = "rgba(198,180,146,0.55)";
				ctx.fillRect(x, y + 21, w, 3);
				ctx.fillStyle = k === "weiji" ? COLOR.zhu : COLOR.gold;
				ctx.fillRect(x, y + 21, w * ratio, 3);
				y += 31;
			}
		}
		drawOverlay(screen) {
			const ctx = this.plat.ctx;
			const run = this.run;
			const g = run.game;
			veil(ctx, this.plat);
			const box = {
				x: 250,
				y: 64,
				w: 780,
				h: 592
			};
			ctx.fillStyle = COLOR.paper;
			roundRect(ctx, box, 10);
			ctx.fill();
			ctx.strokeStyle = COLOR.line;
			ctx.lineWidth = 1.5;
			ctx.stroke();
			const x = box.x + 44;
			const w = box.w - 88;
			let y = box.y + 34;
			const title = (t) => {
				ctx.fillStyle = COLOR.inkHeavy;
				ctx.font = this.font(28, true);
				ctx.textAlign = "center";
				ctx.fillText(t, box.x + box.w / 2, y);
				ctx.textAlign = "left";
				y += 44;
				ctx.strokeStyle = COLOR.line;
				ctx.beginPath();
				ctx.moveTo(x, y);
				ctx.lineTo(x + w, y);
				ctx.stroke();
				y += 18;
			};
			const para = (t, color, size = 20, bold = false) => {
				ctx.fillStyle = color;
				ctx.font = this.font(size, bold);
				for (const line of this.wrap(t, size, bold, w)) {
					ctx.fillText(line, x, y);
					y += size + 9;
				}
			};
			const bottom = box.y + box.h - 84;
			if (screen === "summary") {
				const s = run.summary;
				title(`章末结算 ｜ ${shortTitle(s?.chapter ?? "")} 终`);
				para(`偏离归因 ｜ 当前偏离 ${s?.dev ?? 0}（${s?.bandName ?? "—"}）`, COLOR.zhu, 21, true);
				y += 6;
				if (!s || s.devLog.length === 0) para("本章你循史而行，史官的笔尚跟得上你。", COLOR.inkDim);
				else for (const d of s.devLog) {
					if (y > bottom - 120) break;
					para(`${d.ev} ｜ ${d.t}`, COLOR.inkDim, 18);
				}
				for (const n of (s?.notes ?? []).filter((t) => !t.startsWith("【教学】"))) {
					if (y > bottom - 90) break;
					para(n, COLOR.qing, 18);
				}
				if (s?.corrTitle) para(`历史修正 ｜ ${s.corrTitle}`, COLOR.qing, 18);
				if (y < bottom - 60) {
					y += 8;
					para("本 章 境 遇", COLOR.inkDim, 18, true);
					const deltas = g.d.ATTRS.filter((a) => s?.attrDelta[a.k]);
					if (deltas.length === 0) para("诸维如止水，无增无减。", COLOR.inkDim, 18);
					else {
						const chips = deltas.map((a) => {
							const d = s?.attrDelta[a.k] ?? 0;
							return {
								text: `${a.n} ${g.diff.hideAttrs ? d > 0 ? "升" : "降" : `${d > 0 ? "+" : ""}${d}`}`,
								up: d > 0
							};
						});
						this.drawChips(chips, x, y, w);
						y += 34;
					}
				}
				this.drawOverlayButton(s?.nextTitle ? "进 入 下 一 章" : "继 续");
			} else if (screen === "ending") {
				const e = g.ending;
				if (!e) {
					this.drawOverlayButton("返 回 主 页");
					return;
				}
				ctx.fillStyle = COLOR.zhu;
				roundRect(ctx, {
					x,
					y: y + 4,
					w: 64,
					h: 64
				}, 4);
				ctx.fill();
				ctx.fillStyle = "#f6efe0";
				ctx.font = this.font(20, true);
				ctx.textAlign = "center";
				ctx.fillText((e.seal || "史").slice(0, 2), x + 32, y + 22);
				ctx.textAlign = "left";
				ctx.fillStyle = COLOR.inkHeavy;
				ctx.font = this.font(28, true);
				ctx.fillText(e.name, x + 82, y + 8);
				ctx.fillStyle = COLOR.inkDim;
				ctx.font = this.font(18);
				ctx.fillText(`${e.diffName} · 总分 ${e.total} · 评级 ${e.grade}`, x + 82, y + 44);
				y += 96;
				ctx.strokeStyle = COLOR.line;
				ctx.beginPath();
				ctx.moveTo(x, y);
				ctx.lineTo(x + w, y);
				ctx.stroke();
				y += 16;
				ctx.fillStyle = COLOR.gold;
				ctx.font = this.font(18, true);
				ctx.textAlign = "center";
				ctx.fillText("太 史 公 曰", box.x + box.w / 2, y);
				ctx.textAlign = "left";
				y += 30;
				ctx.save();
				ctx.beginPath();
				ctx.rect(x, y, w, bottom - y - 8);
				ctx.clip();
				para(e.zhuan || "", COLOR.ink, 19);
				ctx.restore();
				this.drawOverlayButton("返 回 主 页");
			} else if (screen === "correction") {
				const c = run.correction;
				title(`历史修正 ｜ ${c?.title ?? ""}`);
				para((c?.segs ?? []).join(""), COLOR.ink);
				if (c?.changes?.length) {
					y += 8;
					this.drawChips(c.changes.filter((x2) => x2.delta !== 0).map((x2) => ({
						text: `${x2.label} ${x2.delta > 0 ? "+" : ""}${x2.delta}`,
						up: x2.delta > 0
					})), x, y, w);
				}
				this.drawOverlayButton("继 续");
			} else {
				title("这一卷已到尽头");
				para("青史长存，后会有期。", COLOR.inkDim);
				this.drawOverlayButton("返 回 主 页");
			}
		}
		drawChips(chips, x, y, maxW) {
			const ctx = this.plat.ctx;
			ctx.font = this.font(17);
			let cx = 0;
			let cy = y;
			for (const chip of chips) {
				const w = Math.ceil(ctx.measureText(chip.text).width) + 18;
				if (cx + w > maxW && cx > 0) {
					cx = 0;
					cy += 30;
				}
				const r = {
					x: x + cx,
					y: cy,
					w,
					h: 25
				};
				ctx.fillStyle = chip.up ? "rgba(176,67,47,0.08)" : "rgba(70,112,105,0.10)";
				roundRect(ctx, r, 12);
				ctx.fill();
				ctx.strokeStyle = chip.up ? COLOR.zhu : COLOR.qing;
				ctx.lineWidth = 1;
				ctx.stroke();
				ctx.fillStyle = chip.up ? COLOR.zhu : COLOR.qing;
				ctx.textAlign = "center";
				ctx.fillText(chip.text, r.x + r.w / 2, r.y + 4);
				ctx.textAlign = "left";
				cx += w + 8;
			}
		}
		drawOverlayButton(label) {
			const ctx = this.plat.ctx;
			const box = {
				x: 250,
				y: 64,
				w: 780,
				h: 592
			};
			const btn = {
				x: box.x + box.w / 2 - 90,
				y: box.y + box.h - 68,
				w: 180,
				h: 46
			};
			ctx.fillStyle = COLOR.zhu;
			roundRect(ctx, btn, 8);
			ctx.fill();
			ctx.fillStyle = "#f6efe0";
			ctx.font = this.font(20, true);
			ctx.textAlign = "center";
			ctx.fillText(label, btn.x + btn.w / 2, btn.y + 10);
			ctx.textAlign = "left";
			this.hits.push({
				rect: btn,
				kind: "overlay",
				index: 0
			});
		}
		drawConfirm() {
			const ctx = this.plat.ctx;
			const c = this.confirm;
			if (!c) return;
			veil(ctx, this.plat);
			const box = {
				x: 320,
				y: 220,
				w: 640,
				h: 280
			};
			ctx.fillStyle = COLOR.paper;
			roundRect(ctx, box, 10);
			ctx.fill();
			ctx.strokeStyle = COLOR.line;
			ctx.lineWidth = 1.5;
			ctx.stroke();
			const x = box.x + 40;
			let y = box.y + 34;
			ctx.fillStyle = COLOR.inkHeavy;
			ctx.font = this.font(26, true);
			ctx.textAlign = "center";
			ctx.fillText(c.title, box.x + box.w / 2, y);
			ctx.textAlign = "left";
			y += 48;
			ctx.fillStyle = COLOR.inkSoft;
			ctx.font = this.font(19);
			for (const line of c.lines) {
				for (const l of this.wrap(line, 19, false, box.w - 80)) {
					ctx.fillText(l, x, y);
					y += 28;
				}
				y += 4;
			}
			const yes = {
				x: box.x + box.w / 2 - 150,
				y: box.y + box.h - 68,
				w: 140,
				h: 44
			};
			const no = {
				x: box.x + box.w / 2 + 10,
				y: box.y + box.h - 68,
				w: 140,
				h: 44
			};
			ctx.fillStyle = COLOR.zhu;
			roundRect(ctx, yes, 8);
			ctx.fill();
			ctx.fillStyle = COLOR.paper;
			roundRect(ctx, no, 8);
			ctx.fill();
			ctx.strokeStyle = COLOR.line;
			ctx.lineWidth = 1;
			ctx.stroke();
			ctx.font = this.font(20, true);
			ctx.textAlign = "center";
			ctx.fillStyle = "#f6efe0";
			ctx.fillText(c.okText, yes.x + yes.w / 2, yes.y + 9);
			ctx.fillStyle = COLOR.ink;
			ctx.fillText("再 想 想", no.x + no.w / 2, no.y + 9);
			ctx.textAlign = "left";
			this.hits.push({
				rect: yes,
				kind: "yes",
				index: 0
			}, {
				rect: no,
				kind: "no",
				index: 0
			});
		}
		drawToast() {
			const t = this.toast;
			if (!t || Date.now() > t.until) {
				if (t) this.toast = null;
				return;
			}
			const ctx = this.plat.ctx;
			ctx.font = this.font(18);
			const w = Math.min(1160, Math.ceil(ctx.measureText(t.text).width) + 40);
			const box = {
				x: (DESIGN_W - w) / 2,
				y: 96,
				w,
				h: 40
			};
			ctx.fillStyle = "rgba(26,22,18,0.82)";
			roundRect(ctx, box, 20);
			ctx.fill();
			ctx.fillStyle = COLOR.paper;
			ctx.textAlign = "center";
			ctx.fillText(t.text, box.x + box.w / 2, box.y + 10);
			ctx.textAlign = "left";
		}
	};
	//#endregion
	//#region src/port/version.ts
	/**
	* 版本号唯一来源(移植线自带一份,避免构建期注入的差异:
	* vite 用 define、rolldown 用 transform.define,两边写法不一致时最容易漏注入)。
	* 发布前与 rpk/manifest.json 的 versionName 对齐。
	*/
	const APP_VERSION = "0.1.0";
	//#endregion
	//#region src/scenes/home.ts
	var HomeScene = class {
		plat;
		assets;
		saves;
		sfx;
		act;
		hits = [];
		font;
		constructor(plat, assets, fontFamily, saves, sfx, act) {
			this.plat = plat;
			this.assets = assets;
			this.saves = saves;
			this.sfx = sfx;
			this.act = act;
			this.font = makeFont(fontFamily);
		}
		pointerDown(_x, _y, _id) {}
		pointerMove(_x, _y, _id) {}
		pointerUp(x, y, _id) {
			fireTap(x, y, this.hits);
		}
		/** 冒烟用:当前可点区域(设计坐标) */
		debug() {
			return {
				screen: "home",
				hits: this.hits.map((h) => ({
					kind: "tap",
					x: h.rect.x,
					y: h.rect.y,
					w: h.rect.w,
					h: h.rect.h
				}))
			};
		}
		draw() {
			const { ctx, dpr, screenW, screenH, scale, offsetX, offsetY } = this.plat;
			this.hits = [];
			ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
			ctx.fillStyle = COLOR.app;
			ctx.fillRect(0, 0, screenW, screenH);
			const bg = this.assets.get(IMG.menuBg);
			if (bg) {
				const r = fitCover$1(screenW, screenH, bg.w, bg.h);
				ctx.drawImage(bg.img, r.x, r.y, r.w, r.h);
			}
			ctx.setTransform(dpr * scale, 0, 0, dpr * scale, dpr * offsetX, dpr * offsetY);
			ctx.textBaseline = "top";
			ctx.textAlign = "left";
			this.drawTitle();
			this.drawEntry();
			this.drawFoot();
		}
		/** 组合题名:花纹徽 → 竖排书法 → 朱印 */
		drawTitle() {
			const { ctx } = this.plat;
			const art = this.assets.get(IMG.title);
			const boxH = 258;
			const boxW = art ? Math.round(boxH * art.w / art.h) : 120;
			const cx = DESIGN_W / 2;
			const top = 66;
			if (art) ctx.drawImage(art.img, cx - boxW / 2, top, boxW, boxH);
			const icon = this.assets.get(IMG.logoIcon);
			if (icon) {
				const s = 78;
				ctx.globalAlpha = .92;
				ctx.drawImage(icon.img, cx - boxW / 2 - s - 26, 92, s, s);
				ctx.globalAlpha = 1;
			}
			const yin = this.assets.get(IMG.logoYin);
			if (yin) ctx.drawImage(yin.img, cx + boxW / 2 + 14, 256, 46, 46);
			ctx.fillStyle = COLOR.inkDim;
			ctx.font = this.font(18);
			ctx.textAlign = "center";
			ctx.fillText("一 卷 青 史 ， 五 种 人 生", cx, 342);
			ctx.textAlign = "left";
		}
		drawEntry() {
			const { ctx } = this.plat;
			const latest = this.saves.getLatestAuto();
			const cx = DESIGN_W / 2;
			const res = {
				x: 372,
				y: 398,
				w: 536,
				h: 64
			};
			frame(ctx, res, {
				fill: latest ? "rgba(246,239,224,0.90)" : "rgba(246,239,224,0.55)",
				stroke: latest ? COLOR.line : COLOR.lineSoft,
				radius: 32
			});
			ctx.textAlign = "left";
			if (latest) {
				ctx.fillStyle = COLOR.inkHeavy;
				ctx.font = this.font(21, true);
				ctx.fillText(`${latest.scenName} · ${latest.chapterTitle}`, res.x + 28, res.y + 14);
				ctx.fillStyle = COLOR.inkSoft;
				ctx.font = this.font(15);
				ctx.fillText(DIFF_LABEL[latest.diffKey] ?? "", res.x + 28, res.y + 41);
				ctx.fillStyle = COLOR.zhu;
				ctx.font = this.font(18, true);
				ctx.textAlign = "right";
				ctx.fillText("继续 ›", res.x + res.w - 26, res.y + 22);
				ctx.textAlign = "left";
				this.hits.push({
					rect: res,
					on: () => {
						this.sfx?.play("click");
						this.act.onContinue(latest);
					}
				});
			} else {
				ctx.fillStyle = COLOR.inkSoft;
				ctx.font = this.font(19);
				ctx.textAlign = "center";
				ctx.fillText("尚无存档 · 青史待启", cx, res.y + 21);
				ctx.textAlign = "left";
			}
			const enter = {
				x: 500,
				y: 480,
				w: 280,
				h: 66
			};
			button(ctx, this.font, enter, "入 局", {
				variant: "primary",
				size: 30
			});
			this.hits.push({
				rect: enter,
				on: () => {
					this.sfx?.play("enter");
					this.act.onStart();
				}
			});
			const hasSaves = this.saves.listAutos().length > 0;
			const subY = 568;
			const w = 92;
			const x0 = 533;
			const mk = (label, x, enabled, fn) => {
				const r = {
					x,
					y: subY,
					w,
					h: 38
				};
				ctx.globalAlpha = enabled ? 1 : .45;
				ctx.fillStyle = enabled ? COLOR.inkStrong : COLOR.inkDim;
				ctx.font = this.font(20);
				ctx.textAlign = "center";
				ctx.fillText(label, r.x + r.w / 2, r.y + 8);
				ctx.textAlign = "left";
				ctx.globalAlpha = 1;
				ctx.strokeStyle = enabled ? COLOR.line : COLOR.lineSoft;
				ctx.lineWidth = 1;
				ctx.beginPath();
				ctx.moveTo(r.x + 16, r.y + 32);
				ctx.lineTo(r.x + r.w - 16, r.y + 32);
				ctx.stroke();
				if (!enabled) return;
				this.hits.push({
					rect: r,
					on: () => {
						this.sfx?.play("click");
						fn();
					}
				});
			};
			mk("存 档", x0, hasSaves, () => this.act.onSaves());
			ctx.fillStyle = COLOR.line;
			ctx.font = this.font(18);
			ctx.textAlign = "center";
			ctx.fillText("｜", 640, 576);
			ctx.textAlign = "left";
			mk("设 置", 655, true, () => this.act.onSettings());
		}
		drawFoot() {
			const { ctx } = this.plat;
			notePlate(ctx, this.font, `青史志 ${APP_VERSION}`, 1240, 690, "right", 14);
			ctx.textAlign = "left";
		}
	};
	//#endregion
	//#region src/data/scenarios.ts
	/** 展示顺序,与 Lua 版 home.lua 的 ORDER 保持一致 */
	const SCENARIOS = [
		{
			"key": "lisi",
			"id": "lisi",
			"name": "李斯 · 仓鼠之局",
			"sub": "如果你来走这一生",
			"noSave": false,
			"chapters": 7,
			"era": "约前 280 — 前 208",
			"protag": "李斯",
			"endings": 20
		},
		{
			"key": "jingke",
			"id": "jingke",
			"name": "荆轲 · 图穷之局",
			"sub": "风萧萧兮易水寒",
			"noSave": false,
			"chapters": 6,
			"era": "约前 232 — 前 227",
			"protag": "荆轲",
			"endings": 18
		},
		{
			"key": "hanxin",
			"id": "hanxin",
			"name": "韩信 · 兵仙之局",
			"sub": "成也萧何，败也萧何",
			"noSave": false,
			"chapters": 7,
			"era": "约前 220 — 前 196",
			"protag": "韩信",
			"endings": 15
		},
		{
			"key": "xiangyu",
			"id": "xiangyu",
			"name": "项羽 · 霸王之局",
			"sub": "力拔山兮气盖世",
			"noSave": false,
			"chapters": 7,
			"era": "前 209 — 前 202",
			"protag": "项羽",
			"endings": 15
		},
		{
			"key": "chensheng",
			"id": "chensheng",
			"name": "陈胜 · 首义之局",
			"sub": "王侯将相宁有种乎",
			"noSave": false,
			"chapters": 7,
			"era": "前 209 七月 — 前 208 腊月",
			"protag": "陈胜",
			"endings": 14
		}
	];
	const DIFFICULTIES = [
		"story",
		"normal",
		"hardcore"
	];
	//#endregion
	//#region src/scenes/select.ts
	const BACK$2 = {
		x: 62,
		y: 28,
		w: 82,
		h: 34
	};
	const CARDS = {
		x0: 70,
		y: 106,
		w: 1140,
		h: 380,
		gap: 12
	};
	const PLATE_H = 84;
	const CHIP_Y = 512;
	const START = {
		x: 1002,
		y: 508,
		w: 198,
		h: 62
	};
	var SelectScene = class {
		plat;
		assets;
		sfx;
		act;
		initialKey;
		hits = [];
		font;
		curIndex;
		diff = "normal";
		constructor(plat, assets, fontFamily, sfx, act, initialKey) {
			this.plat = plat;
			this.assets = assets;
			this.sfx = sfx;
			this.act = act;
			this.initialKey = initialKey;
			this.font = makeFont(fontFamily);
			const hit = this.initialKey ? SCENARIOS.findIndex((s) => s.key === this.initialKey) : -1;
			this.curIndex = hit >= 0 ? hit : 0;
		}
		get cur() {
			return SCENARIOS[this.curIndex] ?? SCENARIOS[0];
		}
		pointerDown(_x, _y, _id) {}
		pointerMove(_x, _y, _id) {}
		pointerUp(x, y, _id) {
			fireTap(x, y, this.hits);
		}
		/** 冒烟用:当前可点区域(设计坐标) */
		debug() {
			return {
				screen: "select",
				hits: this.hits.map((h) => ({
					kind: "tap",
					x: h.rect.x,
					y: h.rect.y,
					w: h.rect.w,
					h: h.rect.h
				}))
			};
		}
		draw() {
			const { ctx, dpr, screenW, screenH, scale, offsetX, offsetY } = this.plat;
			this.hits = [];
			ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
			ctx.fillStyle = COLOR.app;
			ctx.fillRect(0, 0, screenW, screenH);
			const bg = this.assets.get(IMG.bgSelect);
			if (bg) {
				const r = fitCover$1(screenW, screenH, bg.w, bg.h);
				ctx.drawImage(bg.img, r.x, r.y, r.w, r.h);
			}
			ctx.setTransform(dpr * scale, 0, 0, dpr * scale, dpr * offsetX, dpr * offsetY);
			ctx.textBaseline = "top";
			ctx.textAlign = "left";
			this.drawHead();
			this.drawCards();
			this.drawDiff();
		}
		drawHead() {
			const { ctx } = this.plat;
			button(ctx, this.font, BACK$2, "返回", {
				size: 18,
				radius: 6
			});
			this.hits.push({
				rect: BACK$2,
				on: () => {
					this.sfx?.play("back");
					this.act.onBack();
				}
			});
			ctx.fillStyle = COLOR.inkHeavy;
			ctx.font = this.font(32, true);
			ctx.textAlign = "center";
			ctx.fillText("选 择 剧 本", DESIGN_W / 2, 30);
			ctx.textAlign = "left";
			ctx.strokeStyle = COLOR.goldHi;
			ctx.lineWidth = 1.4;
			ctx.beginPath();
			ctx.moveTo(DESIGN_W / 2 - 120, 78);
			ctx.lineTo(760, 78);
			ctx.stroke();
			ctx.strokeStyle = COLOR.lineSoft;
			ctx.lineWidth = 1;
			ctx.beginPath();
			ctx.moveTo(70, 78);
			ctx.lineTo(DESIGN_W / 2 - 140, 78);
			ctx.moveTo(780, 78);
			ctx.lineTo(1210, 78);
			ctx.stroke();
		}
		cardRect(i) {
			const n = SCENARIOS.length;
			const selW = 300;
			const otherW = (CARDS.w - selW - CARDS.gap * (n - 1)) / (n - 1);
			let x = CARDS.x0;
			for (let k = 0; k < n; k++) {
				const w = k === this.curIndex ? selW : otherW;
				if (k === i) return {
					x,
					y: CARDS.y,
					w,
					h: CARDS.h
				};
				x += w + CARDS.gap;
			}
			return {
				x: CARDS.x0,
				y: CARDS.y,
				w: otherW,
				h: CARDS.h
			};
		}
		drawCards() {
			const { ctx } = this.plat;
			SCENARIOS.forEach((s, i) => {
				const rect = this.cardRect(i);
				const on = i === this.curIndex;
				ctx.save();
				ctx.beginPath();
				roundRect$1(ctx, rect, 10);
				ctx.clip();
				const cover = this.assets.get(IMG.cover(s.key));
				if (cover) {
					const r = fitCover$1(rect.w, rect.h, cover.w, cover.h);
					ctx.drawImage(cover.img, rect.x + r.x, rect.y + r.y, r.w, r.h);
				} else {
					ctx.fillStyle = COLOR.paperCard;
					ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
				}
				if (!on) {
					ctx.fillStyle = "rgba(26,22,18,0.55)";
					ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
				}
				const py = rect.y + rect.h - PLATE_H;
				ctx.fillStyle = on ? "rgba(246,239,224,0.94)" : "rgba(246,239,224,0.74)";
				ctx.fillRect(rect.x, py, rect.w, PLATE_H);
				ctx.fillStyle = on ? COLOR.zhu : COLOR.inkDim;
				ctx.fillRect(rect.x, py, rect.w, 2);
				ctx.fillStyle = on ? COLOR.inkHeavy : COLOR.inkStrong;
				ctx.font = this.font(26, true);
				ctx.textAlign = "center";
				ctx.fillText(s.protag, rect.x + rect.w / 2, py + 12);
				ctx.fillStyle = on ? COLOR.inkSoft : COLOR.inkDim;
				ctx.font = this.font(14);
				ctx.fillText(s.sub, rect.x + rect.w / 2, py + 46);
				ctx.fillStyle = COLOR.inkDim;
				ctx.font = this.font(13);
				ctx.fillText(`${s.chapters} 章 · ${s.endings} 结局`, rect.x + rect.w / 2, py + 66);
				ctx.textAlign = "left";
				if (s.noSave) {
					const tag = {
						x: rect.x + 10,
						y: rect.y + 10,
						w: 62,
						h: 22
					};
					ctx.fillStyle = "rgba(176,67,47,0.88)";
					roundRect$1(ctx, tag, 4);
					ctx.fill();
					ctx.fillStyle = "#f6efe0";
					ctx.font = this.font(13);
					ctx.textAlign = "center";
					ctx.fillText("不可存", tag.x + tag.w / 2, tag.y + 4);
					ctx.textAlign = "left";
				}
				ctx.restore();
				frame(ctx, rect, {
					stroke: on ? COLOR.goldHi : "rgba(198,180,146,0.65)",
					width: on ? 2 : 1,
					radius: 10
				});
				this.hits.push({
					rect,
					on: () => {
						if (i === this.curIndex) return;
						this.curIndex = i;
						this.sfx?.play("card");
					}
				});
			});
		}
		diffText(dk) {
			const row = (scenarioData(this.cur.key)?.DIFFICULTY)?.[dk];
			return {
				name: row?.n ?? DIFF_LABEL[dk],
				desc: row?.desc ?? ""
			};
		}
		drawDiff() {
			const { ctx } = this.plat;
			let x = 70;
			DIFFICULTIES.forEach((dk) => {
				const t = this.diffText(dk);
				const r = {
					x,
					y: CHIP_Y,
					w: 132,
					h: 44
				};
				chip(ctx, this.font, r, t.name, dk === this.diff, 20);
				this.hits.push({
					rect: r,
					on: () => {
						if (this.diff === dk) return;
						this.diff = dk;
						this.sfx?.play("click");
					}
				});
				x += r.w + 16;
			});
			ctx.fillStyle = COLOR.inkSoft;
			ctx.font = this.font(18);
			const desc = this.diffText(this.diff).desc;
			if (desc) {
				const lines = desc.length > 34 ? [`${desc.slice(0, 34)}…`] : [desc];
				let y = 570;
				for (const line of lines) {
					ctx.fillText(line, 70, y);
					y += 26;
				}
			}
			button(ctx, this.font, START, "入 局", {
				variant: "primary",
				size: 26
			});
			this.hits.push({
				rect: START,
				on: () => {
					this.sfx?.play("enter");
					this.act.onEnter(this.cur.key, this.diff);
				}
			});
			notePlate(ctx, this.font, "选中剧本后择难度，入局即展卷", 1210, 680, "right");
			ctx.textAlign = "left";
		}
	};
	//#endregion
	//#region src/scenes/saves.ts
	const BACK$1 = {
		x: 62,
		y: 28,
		w: 82,
		h: 34
	};
	const TABS = {
		x0: 70,
		y: 100,
		w: 214,
		gap: 10,
		h: 42
	};
	const LIST = {
		x: 70,
		y: 166,
		w: 1140,
		rowH: 64,
		gap: 10
	};
	var SavesScene = class {
		plat;
		assets;
		saves;
		sfx;
		act;
		hits = [];
		font;
		tab = 0;
		confirm = null;
		constructor(plat, assets, fontFamily, saves, sfx, act) {
			this.plat = plat;
			this.assets = assets;
			this.saves = saves;
			this.sfx = sfx;
			this.act = act;
			this.font = makeFont(fontFamily);
		}
		get scen() {
			return SCENARIOS[this.tab] ?? SCENARIOS[0];
		}
		pointerDown(_x, _y, _id) {}
		pointerMove(_x, _y, _id) {}
		pointerUp(x, y, _id) {
			if (this.confirm) {
				const box = {
					x: DESIGN_W / 2 - 280,
					y: 236,
					w: 560,
					h: 236
				};
				const yes = {
					x: box.x + box.w / 2 - 150,
					y: box.y + box.h - 66,
					w: 140,
					h: 44
				};
				const no = {
					x: box.x + box.w / 2 + 10,
					y: box.y + box.h - 66,
					w: 140,
					h: 44
				};
				const c = this.confirm;
				if (x >= yes.x && x <= yes.x + yes.w && y >= yes.y && y <= yes.y + yes.h) {
					this.confirm = null;
					c.onOk();
				} else if (x >= no.x && x <= no.x + no.w && y >= no.y && y <= no.y + no.h) this.confirm = null;
				return;
			}
			fireTap(x, y, this.hits);
		}
		/** 冒烟用:当前可点区域(设计坐标) */
		debug() {
			return {
				screen: "saves",
				hits: this.hits.map((h) => ({
					kind: "tap",
					x: h.rect.x,
					y: h.rect.y,
					w: h.rect.w,
					h: h.rect.h
				}))
			};
		}
		draw() {
			const { ctx, dpr, screenW, screenH, scale, offsetX, offsetY } = this.plat;
			this.hits = [];
			ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
			ctx.fillStyle = COLOR.app;
			ctx.fillRect(0, 0, screenW, screenH);
			const bg = this.assets.get(IMG.bgSave);
			if (bg) {
				const r = fitCover$1(screenW, screenH, bg.w, bg.h);
				ctx.drawImage(bg.img, r.x, r.y, r.w, r.h);
			}
			ctx.setTransform(dpr * scale, 0, 0, dpr * scale, dpr * offsetX, dpr * offsetY);
			ctx.textBaseline = "top";
			ctx.textAlign = "left";
			this.drawHead();
			this.drawTabs();
			this.drawList();
			this.drawFoot();
			if (this.confirm) this.drawConfirm();
		}
		drawHead() {
			const { ctx } = this.plat;
			button(ctx, this.font, BACK$1, "返回", {
				size: 18,
				radius: 6
			});
			this.hits.push({
				rect: BACK$1,
				on: () => {
					this.sfx?.play("back");
					this.act.onBack();
				}
			});
			ctx.fillStyle = COLOR.inkHeavy;
			ctx.font = this.font(32, true);
			ctx.textAlign = "center";
			ctx.fillText("存 档", DESIGN_W / 2, 30);
			ctx.textAlign = "left";
			ctx.strokeStyle = COLOR.goldHi;
			ctx.lineWidth = 1.4;
			ctx.beginPath();
			ctx.moveTo(DESIGN_W / 2 - 90, 78);
			ctx.lineTo(730, 78);
			ctx.stroke();
			ctx.strokeStyle = COLOR.lineSoft;
			ctx.lineWidth = 1;
			ctx.beginPath();
			ctx.moveTo(70, 78);
			ctx.lineTo(DESIGN_W / 2 - 106, 78);
			ctx.moveTo(746, 78);
			ctx.lineTo(1210, 78);
			ctx.stroke();
		}
		drawTabs() {
			const { ctx } = this.plat;
			SCENARIOS.forEach((s, i) => {
				const r = {
					x: TABS.x0 + i * (TABS.w + TABS.gap),
					y: TABS.y,
					w: TABS.w,
					h: TABS.h
				};
				const on = i === this.tab;
				const count = this.saves.autoCount(s.key);
				frame(ctx, r, {
					fill: on ? "rgba(246,239,224,0.96)" : "rgba(246,239,224,0.55)",
					stroke: on ? COLOR.zhu : COLOR.lineSoft,
					width: on ? 1.6 : 1,
					radius: 8
				});
				ctx.fillStyle = on ? COLOR.inkHeavy : COLOR.inkSoft;
				ctx.font = this.font(19, on);
				ctx.textAlign = "center";
				ctx.fillText(`${s.protag} · ${count}`, r.x + r.w / 2, r.y + 11);
				ctx.textAlign = "left";
				this.hits.push({
					rect: r,
					on: () => {
						if (i === this.tab) return;
						this.tab = i;
						this.sfx?.play("click");
					}
				});
			});
		}
		drawList() {
			const { ctx } = this.plat;
			const entries = this.saves.listAutoEntries(this.scen.key).slice(0, 6);
			if (entries.length === 0) {
				const box = {
					x: LIST.x,
					y: LIST.y,
					w: LIST.w,
					h: 300
				};
				frame(ctx, box, {
					fill: "rgba(246,239,224,0.55)",
					stroke: COLOR.lineSoft,
					radius: 10
				});
				ctx.fillStyle = COLOR.inkDim;
				ctx.font = this.font(22);
				ctx.textAlign = "center";
				ctx.fillText(`「${this.scen.protag}」尚无存档`, DESIGN_W / 2, box.y + 116);
				ctx.font = this.font(17);
				ctx.fillText("对局中离开时若已经营满 5 轮，会自动存一条", DESIGN_W / 2, box.y + 158);
				ctx.textAlign = "left";
				return;
			}
			entries.forEach((e, i) => {
				const y = LIST.y + i * (LIST.rowH + LIST.gap);
				const r = {
					x: LIST.x,
					y,
					w: LIST.w,
					h: LIST.rowH
				};
				frame(ctx, r, {
					fill: "rgba(246,239,224,0.92)",
					stroke: COLOR.lineSoft,
					radius: 8
				});
				ctx.fillStyle = COLOR.zhu;
				ctx.font = this.font(16, true);
				ctx.textAlign = "center";
				ctx.fillText(String(i + 1), r.x + 22, r.y + 22);
				ctx.textAlign = "left";
				const s = e.slot;
				ctx.fillStyle = COLOR.inkHeavy;
				ctx.font = this.font(22, true);
				ctx.fillText(s.chapterTitle, r.x + 46, r.y + 10);
				ctx.fillStyle = COLOR.inkDim;
				ctx.font = this.font(15);
				const roundTxt = s.roundNo && s.roundNo > 0 ? `第 ${s.roundNo} 轮` : "章首";
				const bt = s.backtracksLeft < 0 ? "回溯不限" : `回溯 ${s.backtracksLeft}`;
				ctx.fillText(`${DIFF_LABEL[s.diffKey]} · ${roundTxt} · ${bt} · ${fmtTime(s.at)}`, r.x + 46, r.y + 40);
				const read = {
					x: r.x + r.w - 210,
					y: r.y + 12,
					w: 98,
					h: 40
				};
				button(ctx, this.font, read, "读 档", {
					variant: "primary",
					size: 18,
					radius: 6
				});
				this.hits.push({
					rect: read,
					on: () => {
						this.sfx?.play("enter");
						this.act.onLoad(s, this.scen.key);
					}
				});
				const del = {
					x: r.x + r.w - 100,
					y: r.y + 12,
					w: 82,
					h: 40
				};
				button(ctx, this.font, del, "删 除", {
					size: 18,
					radius: 6
				});
				this.hits.push({
					rect: del,
					on: () => {
						this.sfx?.play("dialog");
						this.confirm = {
							text: "删除这条存档？",
							detail: `${s.chapterTitle} · ${fmtTime(s.at)} ‑ 删除后不可恢复`,
							onOk: () => {
								this.saves.removeAuto(this.scen.key, e.idx);
								this.sfx?.play("back");
							}
						};
					}
				});
			});
		}
		drawFoot() {
			const { ctx } = this.plat;
			notePlate(ctx, this.font, `每部剧本最多 6 条自动档 · 读档即回到存档那一刻`, 1210, 680, "right");
			ctx.textAlign = "left";
		}
		drawConfirm() {
			const { ctx } = this.plat;
			const c = this.confirm;
			if (!c) return;
			veil(ctx, this.plat);
			const box = {
				x: DESIGN_W / 2 - 280,
				y: 236,
				w: 560,
				h: 236
			};
			frame(ctx, box, {
				fill: COLOR.paper,
				stroke: COLOR.line,
				width: 1.5,
				radius: 10
			});
			ctx.fillStyle = COLOR.inkHeavy;
			ctx.font = this.font(26, true);
			ctx.textAlign = "center";
			ctx.fillText(c.text, box.x + box.w / 2, box.y + 36);
			ctx.fillStyle = COLOR.inkSoft;
			ctx.font = this.font(18);
			ctx.fillText(c.detail, box.x + box.w / 2, box.y + 86);
			ctx.textAlign = "left";
			const yes = {
				x: box.x + box.w / 2 - 150,
				y: box.y + box.h - 66,
				w: 140,
				h: 44
			};
			const no = {
				x: box.x + box.w / 2 + 10,
				y: box.y + box.h - 66,
				w: 140,
				h: 44
			};
			button(ctx, this.font, yes, "删 除", {
				variant: "primary",
				size: 20
			});
			button(ctx, this.font, no, "再 想 想", { size: 20 });
		}
	};
	//#endregion
	//#region src/game/settings.ts
	const DEFAULTS = {
		scale: "default",
		segDelay: 650,
		textScale: "normal",
		voice: true,
		voiceGain: 1,
		music: true,
		musicGain: .06,
		sfx: true,
		sfxGain: .5
	};
	const SPEED_OPTS = [
		{
			value: 1100,
			label: "慢"
		},
		{
			value: 650,
			label: "标准"
		},
		{
			value: 300,
			label: "快"
		}
	];
	const TEXT_OPTS = [
		{
			value: "small",
			label: "小"
		},
		{
			value: "normal",
			label: "标准"
		},
		{
			value: "large",
			label: "大"
		}
	];
	const KEY = "qingshi.settings.v1";
	/** 逐字段校验:类型/区间不合就落回默认值,布尔只认真布尔(同 H5 2026-10-21 修) */
	function num(v, dflt, min, max) {
		return typeof v === "number" && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : dflt;
	}
	function bool(v, dflt) {
		return typeof v === "boolean" ? v : dflt;
	}
	function oneOf(v, allowed, dflt) {
		return typeof v === "string" && allowed.includes(v) ? v : dflt;
	}
	const SCALE_VALUES = [
		"small",
		"default",
		"large"
	];
	const TEXT_VALUES = [
		"small",
		"normal",
		"large"
	];
	var SettingsStore = class {
		plat;
		cur;
		subs = /* @__PURE__ */ new Set();
		constructor(plat) {
			this.plat = plat;
			this.cur = this.read();
		}
		get value() {
			return this.cur;
		}
		/** 合并改动 → 持久化 → 广播。设置页每一项改动都走这里。 */
		update(patch) {
			this.cur = {
				...this.cur,
				...patch
			};
			this.persist();
			for (const cb of [...this.subs]) cb(this.cur);
			return this.cur;
		}
		onChange(cb) {
			this.subs.add(cb);
			return () => {
				this.subs.delete(cb);
			};
		}
		read() {
			try {
				const raw = this.plat.getStorage(KEY);
				if (!raw) return { ...DEFAULTS };
				const s = JSON.parse(raw);
				if (!s || typeof s !== "object") return { ...DEFAULTS };
				const o = s;
				return {
					scale: oneOf(o.scale, SCALE_VALUES, DEFAULTS.scale),
					segDelay: num(o.segDelay, DEFAULTS.segDelay, 0, 5e3),
					textScale: oneOf(o.textScale, TEXT_VALUES, DEFAULTS.textScale),
					voice: bool(o.voice, DEFAULTS.voice),
					voiceGain: num(o.voiceGain, DEFAULTS.voiceGain, 0, 1),
					music: bool(o.music, DEFAULTS.music),
					musicGain: num(o.musicGain, DEFAULTS.musicGain, 0, 1),
					sfx: bool(o.sfx, DEFAULTS.sfx),
					sfxGain: num(o.sfxGain, DEFAULTS.sfxGain, 0, 1)
				};
			} catch {
				return { ...DEFAULTS };
			}
		}
		persist() {
			this.plat.setStorage(KEY, JSON.stringify(this.cur));
		}
	};
	//#endregion
	//#region src/scenes/settings.ts
	const BACK = {
		x: 62,
		y: 28,
		w: 82,
		h: 34
	};
	const PANEL = {
		x: 70,
		y: 104,
		w: 1140,
		h: 434
	};
	const ROW_X = 112;
	const TOGGLE_X = 300;
	const SLIDER = {
		x: 566,
		w: 430
	};
	/** 三档节奏直接对齐 settings.SPEED_OPTS,不在页面里另造一套毫秒值 */
	var SettingsScene = class {
		plat;
		assets;
		settings;
		sfx;
		act;
		hits = [];
		font;
		drag = null;
		constructor(plat, assets, fontFamily, settings, sfx, act) {
			this.plat = plat;
			this.assets = assets;
			this.settings = settings;
			this.sfx = sfx;
			this.act = act;
			this.font = makeFont(fontFamily);
		}
		get value() {
			return this.settings.value;
		}
		/** 音量行:标签在左,开关在中,滑条在右 */
		volRow(index) {
			return PANEL.y + 30 + index * 88;
		}
		sliderY(index) {
			return this.volRow(index) + 22;
		}
		setGain(key, v) {
			const n = Math.max(0, Math.min(1, v));
			if (key === "music") this.settings.update({ musicGain: n });
			else if (key === "sfx") this.settings.update({ sfxGain: n });
			else this.settings.update({ voiceGain: n });
		}
		gainOf(key) {
			const v = this.value;
			return key === "music" ? v.musicGain : key === "sfx" ? v.sfxGain : v.voiceGain;
		}
		onOf(key) {
			const v = this.value;
			return key === "music" ? v.music : key === "sfx" ? v.sfx : v.voice;
		}
		toggle(key, on) {
			if (key === "music") this.settings.update({ music: on });
			else if (key === "sfx") this.settings.update({ sfx: on });
			else this.settings.update({ voice: on });
		}
		pointerDown(x, y, _id) {
			[
				"music",
				"sfx",
				"voice"
			].forEach((key, i) => {
				if (this.drag || !this.onOf(key)) return;
				const cy = this.sliderY(i);
				if (x >= SLIDER.x - 12 && x <= SLIDER.x + SLIDER.w + 12 && y >= cy - 18 && y <= cy + 18) {
					this.drag = {
						key,
						index: i
					};
					this.setGain(key, (x - SLIDER.x) / SLIDER.w);
				}
			});
		}
		pointerMove(x, _y, _id) {
			if (!this.drag) return;
			this.setGain(this.drag.key, (x - SLIDER.x) / SLIDER.w);
		}
		pointerUp(x, y, _id) {
			if (this.drag) {
				this.drag = null;
				this.sfx?.play("click");
				return;
			}
			fireTap(x, y, this.hits);
		}
		/** 冒烟用:当前可点区域(设计坐标) */
		debug() {
			return {
				screen: "settings",
				hits: this.hits.map((h) => ({
					kind: "tap",
					x: h.rect.x,
					y: h.rect.y,
					w: h.rect.w,
					h: h.rect.h
				}))
			};
		}
		draw() {
			const { ctx, dpr, screenW, screenH, scale, offsetX, offsetY } = this.plat;
			this.hits = [];
			ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
			ctx.fillStyle = COLOR.app;
			ctx.fillRect(0, 0, screenW, screenH);
			const bg = this.assets.get(IMG.bgSettings);
			if (bg) {
				const r = fitCover$1(screenW, screenH, bg.w, bg.h);
				ctx.drawImage(bg.img, r.x, r.y, r.w, r.h);
			}
			ctx.setTransform(dpr * scale, 0, 0, dpr * scale, dpr * offsetX, dpr * offsetY);
			ctx.textBaseline = "top";
			ctx.textAlign = "left";
			this.drawHead();
			frame(ctx, PANEL, {
				fill: "rgba(246,239,224,0.88)",
				stroke: COLOR.lineSoft,
				radius: 12
			});
			this.drawVol("music", 0, "音 乐");
			this.drawVol("sfx", 1, "音 效");
			this.drawVol("voice", 2, "配 音");
			this.drawTextSize();
			this.drawPace();
			notePlate(ctx, this.font, "设置即时生效，保存在本机", 1210, 680, "right");
			ctx.textAlign = "left";
		}
		drawHead() {
			const { ctx } = this.plat;
			button(ctx, this.font, BACK, "返回", {
				size: 18,
				radius: 6
			});
			this.hits.push({
				rect: BACK,
				on: () => {
					this.sfx?.play("back");
					this.act.onBack();
				}
			});
			ctx.fillStyle = COLOR.inkHeavy;
			ctx.font = this.font(32, true);
			ctx.textAlign = "center";
			ctx.fillText("设 置", DESIGN_W / 2, 30);
			ctx.textAlign = "left";
			ctx.strokeStyle = COLOR.goldHi;
			ctx.lineWidth = 1.4;
			ctx.beginPath();
			ctx.moveTo(DESIGN_W / 2 - 90, 78);
			ctx.lineTo(730, 78);
			ctx.stroke();
			ctx.strokeStyle = COLOR.lineSoft;
			ctx.lineWidth = 1;
			ctx.beginPath();
			ctx.moveTo(70, 78);
			ctx.lineTo(DESIGN_W / 2 - 106, 78);
			ctx.moveTo(746, 78);
			ctx.lineTo(1210, 78);
			ctx.stroke();
		}
		drawVol(key, index, label) {
			const { ctx } = this.plat;
			const y = this.volRow(index);
			const on = this.onOf(key);
			ctx.fillStyle = COLOR.inkHeavy;
			ctx.font = this.font(22, true);
			ctx.fillText(label, ROW_X, y + 12);
			ctx.fillStyle = COLOR.inkDim;
			ctx.font = this.font(15);
			ctx.fillText(on ? "" : "已关闭", 222, y + 20);
			const w = 78;
			const onRect = {
				x: TOGGLE_X,
				y: y + 6,
				w,
				h: 38
			};
			const offRect = {
				x: 388,
				y: y + 6,
				w,
				h: 38
			};
			chip(ctx, this.font, onRect, "开", on, 19);
			chip(ctx, this.font, offRect, "关", !on, 19);
			this.hits.push({
				rect: onRect,
				on: () => {
					if (!on) this.toggle(key, true);
					this.sfx?.play("click");
				}
			});
			this.hits.push({
				rect: offRect,
				on: () => {
					if (on) this.toggle(key, false);
					this.sfx?.play("click");
				}
			});
			const cy = this.sliderY(index);
			const gain = this.gainOf(key);
			ctx.save();
			ctx.globalAlpha = on ? 1 : .35;
			ctx.fillStyle = COLOR.lineSoft;
			ctx.fillRect(SLIDER.x, cy - 3, SLIDER.w, 6);
			ctx.fillStyle = COLOR.zhu;
			ctx.fillRect(SLIDER.x, cy - 3, SLIDER.w * gain, 6);
			const kx = SLIDER.x + SLIDER.w * gain;
			ctx.beginPath();
			ctx.arc(kx, cy, 9, 0, Math.PI * 2);
			ctx.fillStyle = COLOR.paper;
			ctx.fill();
			ctx.strokeStyle = COLOR.zhu;
			ctx.lineWidth = 1.6;
			ctx.stroke();
			ctx.restore();
			ctx.fillStyle = COLOR.inkSoft;
			ctx.font = this.font(15);
			ctx.textAlign = "right";
			ctx.fillText(`${Math.round(gain * 100)}`, SLIDER.x + SLIDER.w + 56, cy - 9);
			ctx.textAlign = "left";
			if (index < 2) {
				const ly = y + 74;
				ctx.strokeStyle = "rgba(198,180,146,0.45)";
				ctx.lineWidth = 1;
				ctx.beginPath();
				ctx.moveTo(ROW_X, ly);
				ctx.lineTo(1162, ly);
				ctx.stroke();
			}
		}
		/** 正文大小:对局屏按此倍率烘焙正文 */
		drawTextSize() {
			const { ctx } = this.plat;
			const y = PANEL.y + 300;
			ctx.fillStyle = COLOR.inkHeavy;
			ctx.font = this.font(22, true);
			ctx.fillText("正 文 大 小", ROW_X, y + 12);
			const items = TEXT_OPTS.map((o) => ({
				label: o.label,
				v: o.value
			}));
			let x = TOGGLE_X;
			for (const it of items) {
				const r = {
					x,
					y: y + 4,
					w: 88,
					h: 40
				};
				chip(ctx, this.font, r, it.label, this.value.textScale === it.v, 19);
				this.hits.push({
					rect: r,
					on: () => {
						if (this.value.textScale === it.v) return;
						this.settings.update({ textScale: it.v });
						this.sfx?.play("click");
					}
				});
				x += r.w + 12;
			}
			ctx.fillStyle = COLOR.inkDim;
			ctx.font = this.font(15);
			ctx.fillText("影响卷轴正文字号，下一局起生效", PANEL.x + PANEL.w - 300, y + 16);
		}
		/** 阅读节奏:对齐 settings.segDelay(毫秒) */
		drawPace() {
			const { ctx } = this.plat;
			const y = PANEL.y + 368;
			ctx.fillStyle = COLOR.inkHeavy;
			ctx.font = this.font(22, true);
			ctx.fillText("阅 读 节 奏", ROW_X, y + 12);
			let x = TOGGLE_X;
			for (const it of SPEED_OPTS) {
				const r = {
					x,
					y: y + 4,
					w: 96,
					h: 40
				};
				const on = Math.abs(this.value.segDelay - it.value) < 1;
				chip(ctx, this.font, r, it.label, on, 19);
				this.hits.push({
					rect: r,
					on: () => {
						if (on) return;
						this.settings.update({ segDelay: it.value });
						this.sfx?.play("click");
					}
				});
				x += r.w + 12;
			}
			ctx.fillStyle = COLOR.inkDim;
			ctx.font = this.font(15);
			ctx.fillText("一段落定后等多久自动翻页", PANEL.x + PANEL.w - 300, y + 16);
		}
	};
	//#endregion
	//#region src/game/run.ts
	var import_engine = /* @__PURE__ */ __toESM((/* @__PURE__ */ __commonJSMin(((exports, module) => {
		(function(root, factory) {
			if (typeof module !== "undefined" && module.exports) module.exports = factory();
			else root.QINGSHI_ENGINE = factory();
		})(typeof self !== "undefined" ? self : exports, function() {
			function clamp(v) {
				return Math.max(0, Math.min(100, Math.round(v)));
			}
			function makeStateRng(seed) {
				var a = seed | 0;
				var f = function() {
					a |= 0;
					a = a + 1831565813 | 0;
					var t = Math.imul(a ^ a >>> 15, 1 | a);
					t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
					return ((t ^ t >>> 14) >>> 0) / 4294967296;
				};
				f._getState = function() {
					return a | 0;
				};
				f._setState = function(s) {
					a = s | 0;
				};
				return f;
			}
			var KEY_CARD_ROUNDS = 3;
			var ENCOUNTER_DEFAULT = {
				randomChance: .4,
				randomMax: 2
			};
			var CAIFU_SOFT_EVENT = false;
			function Game(data, diffKey, rng, streams) {
				this.d = data;
				this.diffKey = diffKey;
				this.diff = data.DIFFICULTY[diffKey];
				this.rng = rng || makeStateRng(Math.floor(Math.random() * 4294967296));
				this._streams = streams || null;
				this._rngStreams = {};
				this.resetAll();
			}
			Game.prototype._stream = function(name) {
				if (this._streams && typeof this._streams[name] === "function") return this._streams[name];
				if (name === "card") return this.rng;
				var s = this._rngStreams[name];
				if (!s) {
					s = makeStateRng(Math.floor(this.rng() * 4294967296));
					this._rngStreams[name] = s;
				}
				return s;
			};
			Game.prototype.resetAll = function() {
				this.attrs = Object.assign({}, this.d.INIT);
				this.dev = 0;
				this.flags = {};
				this._once = {};
				this.histScore = 0;
				this.merits = [];
				this.ach = [];
				this.keyChoices = [];
				this.peak = {
					quanshi: this.attrs.quanshi,
					junxin: this.attrs.junxin
				};
				this.coef = 1;
				this.backtracksThisChapter = 0;
				this.chapterIdx = -1;
				this.eventId = null;
				this.phase = "home";
				this.introNotes = [];
				this.pendingEndEvents = [];
				this.currentEndEvent = null;
				this.correction = null;
				this.summaryView = null;
				this._next = null;
				this.ending = null;
				this.snapshot = null;
				this.pendingCardId = null;
				this.choiceUsed = {};
				this.choiceGap = 1;
				this.offer = null;
				this.keyRoundsLeft = 0;
				this.actionUses = {};
				this.randomOn = true;
				var ENC = this.d.ENCOUNTER || ENCOUNTER_DEFAULT;
				this.randomChance = ENC.randomChance != null ? ENC.randomChance : ENCOUNTER_DEFAULT.randomChance;
				this.randomMax = ENC.randomMax != null ? ENC.randomMax : ENCOUNTER_DEFAULT.randomMax;
				this.keyCardRounds = ENC.keyCardRounds != null ? ENC.keyCardRounds : KEY_CARD_ROUNDS;
				this.chapterDeck = [];
				this.randomCount = 0;
				this.currentRandom = null;
				this.pendingEventId = null;
				this._skipRandom = false;
				this.gloss = [];
				this.zg = this.d.HIDDEN && this.d.HIDDEN.init != null ? this.d.HIDDEN.init : 30;
				this.chapterDev = [];
				this._corrShown = null;
				this._backlashDone = false;
				this._weijiClamp = 0;
				this._endEventsChecked = false;
				this._newAch = [];
				this._warns = [];
				this._crisisPlotPending = false;
				this.passedEvents = {};
				this._chapterStartId = null;
				this._burned = {};
				this._settledOpts = {};
				this.xushi = false;
				var selfA = this;
				this._amax = {};
				(this.d.ATTRS || []).forEach(function(a) {
					selfA._amax[a.k] = a.max || 100;
				});
				this._actions = this._indexActions();
				this.age = this.d.AGE && this.d.AGE.init != null ? this.d.AGE.init : null;
				this.ill = null;
			};
			Game.prototype._longevity = function() {
				var lon = this.d.AGE && this.d.AGE.longevity || [];
				var c = 0;
				for (var i = 0; i < lon.length; i++) if (this.attrs.tupo >= lon[i][0]) c = lon[i][1];
				return c;
			};
			Game.prototype.attrMax = function(k) {
				return this._amax && this._amax[k] || 100;
			};
			Game.prototype._clampA = function(k, v) {
				return Math.max(0, Math.min(this.attrMax(k), Math.round(v)));
			};
			Game.prototype._setAttrRaw = function(k, v) {
				this.attrs[k] = this._clampA(k, v);
				if (k === "quanshi" && this.attrs[k] > this.peak.quanshi) this.peak.quanshi = this.attrs[k];
				if (k === "junxin" && this.attrs[k] > this.peak.junxin) this.peak.junxin = this.attrs[k];
				return this.attrs[k];
			};
			Game.prototype.start = function() {
				this.enterChapter(0);
			};
			Game.prototype.chapter = function() {
				return this.d.CHAPTERS[this.chapterIdx];
			};
			Game.prototype.findEvent = function(id) {
				if (this.currentRandom && this.currentRandom.id === id) return this.currentRandom;
				var ch = this.chapter();
				var evs = ch && ch.events || [];
				for (var i = 0; i < evs.length; i++) if (evs[i].id === id) return evs[i];
				return null;
			};
			Game.prototype.devBand = function(dev) {
				var bands = this.d.DEV_BANDS, v = dev == null ? this.dev : dev;
				for (var i = 0; i < bands.length; i++) if (v <= bands[i].max) return i;
				return bands.length - 1;
			};
			var FLAG_REASONS = {
				fusu: "需要扶苏的信任",
				guanshu: "需要序章观鼠悟道",
				liuzheng: "需要沙丘留证",
				hanfeicun: "需要韩非尚在",
				ziwu: "需要自污保身",
				mibao: "需要宫中密报",
				guangjiaoyou: "需要广交游",
				shouxi: "当前处境不适用",
				piaobo: "已经漂泊过一遭",
				lianmeng: "需要已密联蒙恬",
				mtdi: "蒙恬已生敌意"
			};
			Game.prototype.check = function(cond) {
				if (!cond) return true;
				var self = this, ok = true, reason = null;
				var names = this.d.ATTR_NAMES;
				Object.keys(cond).forEach(function(k) {
					if (!ok) return;
					var v = cond[k];
					if (k === "flag") {
						if (!self.flags[v]) {
							ok = false;
							reason = FLAG_REASONS[v] || "需要特定经历";
						}
					} else if (k === "notflag") {
						if (self.flags[v]) {
							ok = false;
							reason = "与已有经历冲突";
						}
					} else if (k === "anyflag") {
						if (!v.some(function(f) {
							return self.flags[f];
						})) {
							ok = false;
							reason = FLAG_REASONS[v[0]] || "需要特定经历";
						}
					} else if (k === "weijiMax") {
						if (self.attrs.weiji > v) {
							ok = false;
							reason = "危机须≤" + v;
						}
					} else if (k === "quanshiMax") {
						if (self.attrs.quanshi > v) {
							ok = false;
							reason = "权势须≤" + v;
						}
					} else if (k === "junxinMax") {
						if (self.attrs.junxin > v) {
							ok = false;
							reason = "君心须≤" + v;
						}
					} else if (k === "zgMax") {
						if (self.zg > v) {
							ok = false;
							reason = "戒心须≤" + v;
						}
					} else if (k === "junxinMaxSeen") {
						if (self.peak.junxin < v) {
							ok = false;
							reason = "君心峰值须≥" + v;
						}
					} else if (k === "minChapter") {
						if (self.chapterIdx < v) {
							ok = false;
							reason = "当前处境不适用";
						}
					} else if (k === "devMin") {
						if (self.dev < v) {
							ok = false;
							reason = "需偏离≥" + v + "（改流之势）";
						}
					} else if (k === "devMax") {
						if (self.dev > v) {
							ok = false;
							reason = "需偏离≤" + v;
						}
					} else if (names[k]) {
						if (self.attrs[k] < v) {
							ok = false;
							reason = names[k] + "须≥" + v;
						}
					} else if (typeof v === "number") {
						ok = false;
						reason = "条件「" + k + "」无法识别";
					}
				});
				return {
					ok,
					reason
				};
			};
			Game.prototype.riskRate = function(gap) {
				if (gap <= 3) return 70;
				if (gap <= 6) return 50;
				if (gap <= 9) return 40;
				if (gap <= 12) return 30;
				if (gap <= 15) return 20;
				return 15;
			};
			Game.prototype.riskRateHist = function(rate) {
				if (rate >= 50) return 70;
				if (rate >= 40) return 50;
				if (rate >= 30) return 40;
				if (rate >= 20) return 30;
				return 20;
			};
			Game.prototype._caifuCost = function(opt) {
				var a = opt && opt.eff && opt.eff.attrs;
				return a && typeof a.caifu === "number" && a.caifu < 0 ? -a.caifu : 0;
			};
			Game.prototype._caifuBroke = function() {
				return (this.attrs.caifu || 0) <= 0;
			};
			Game.prototype.CAIFU_LOCK_REASON = "财富见底，无力为之";
			Game.prototype.checkRisk = function(req, actionHardCaifu) {
				var self = this, names = this.d.ATTR_NAMES;
				var caifuHard = !(actionHardCaifu === false && CAIFU_SOFT_EVENT);
				var hard = {}, unmet = [];
				Object.keys(req || {}).forEach(function(k) {
					if (names[k] && (k !== "caifu" || !caifuHard)) {
						var have = self.attrs[k], need = req[k];
						if (have < need) unmet.push({
							k,
							name: names[k],
							need,
							have,
							gap: need - have
						});
					} else hard[k] = req[k];
				});
				var hc = Object.keys(hard).length ? this.check(hard) : {
					ok: true,
					reason: null
				};
				var rate = null;
				if (unmet.length) {
					rate = 100;
					unmet.forEach(function(u) {
						rate = Math.min(rate, self.riskRate(u.gap));
					});
				}
				return {
					hardOk: hc.ok === true,
					hardReason: hc.reason || null,
					unmet,
					rate
				};
			};
			Game.prototype._rollRisk = function(rate, unmet) {
				var roll = Math.floor(this._stream("risk")() * 100) + 1;
				return {
					rate,
					roll,
					success: roll <= rate,
					unmet
				};
			};
			Game.prototype.riskTitle = function(r) {
				if (!r || !r.risk) return "";
				var rk = r.risk;
				var res = rk.success ? " · 成" : " · 败";
				if (this.diff.hideAttrs) return "🎲 成算" + riskWord(rk.rate) + res;
				return "🎲 掷骰 " + rk.roll + (rk.success ? " ≤ " : " ＞ ") + rk.rate + res;
			};
			var RISK_WORDS = [
				[70, "七成"],
				[50, "五成"],
				[40, "四成"],
				[30, "三成"],
				[20, "二成"],
				[15, "一成五"]
			];
			function riskWord(rate) {
				for (var i = 0; i < RISK_WORDS.length; i++) if (rate >= RISK_WORDS[i][0]) return RISK_WORDS[i][1];
				return "一成五";
			}
			Game.prototype.enterChapter = function(idx) {
				this.chapterIdx = idx;
				this.backtracksThisChapter = 0;
				var ch = this.chapter();
				this.introNotes = [];
				if (ch.enter) {
					if (ch.enter.merit && this.merits.indexOf(ch.enter.merit) < 0) this.merits.push(ch.enter.merit);
					if (ch.enter.note) this.introNotes.push(ch.enter.note);
				}
				if (ch.mutations) {
					var self = this;
					ch.mutations.forEach(function(m) {
						if (self.check(m.if).ok) {
							if (m.flag) self.flags[m.flag] = true;
							if (m.zg) self.zg = clamp(self.zg + m.zg);
							if (m.zgSet != null) self.zg = clamp(m.zgSet);
							if (m.setAttrs) Object.keys(m.setAttrs).forEach(function(k) {
								self._setAttrRaw(k, m.setAttrs[k]);
							});
							if (m.capAttrs) Object.keys(m.capAttrs).forEach(function(k) {
								if (self.attrs[k] > m.capAttrs[k]) self._setAttrRaw(k, m.capAttrs[k]);
							});
							if (m.note) self.introNotes.push(m.note);
						}
					});
				}
				if (ch.age != null && this.d.AGE) {
					this.age = ch.age;
					var ageBands = this.d.AGE.bands || [
						[40, 0],
						[55, -2],
						[65, -4],
						[76, -6],
						[200, -8]
					];
					var dAge = 0;
					for (var abi = 0; abi < ageBands.length; abi++) if (this.age < ageBands[abi][0]) {
						dAge = ageBands[abi][1];
						break;
					}
					if (dAge) {
						var cred = this._longevity();
						var dAgeRaw = dAge;
						if (cred) dAge = Math.min(0, dAge + cred);
						this.attrs.tupo = this._clampA("tupo", this.attrs.tupo + dAge);
						if (dAge) this.introNotes.push("【春秋渐高】年已" + this.age + "，筋骨大不如前——体魄" + dAge + "。");
						else this.introNotes.push("【春秋渐高】年已" + this.age + "，然筋骨犹胜常人，衰老之损尽为体魄所抵（寿元+" + cred + "，本应体魄" + dAgeRaw + "）——体魄无损。");
					}
				}
				var wj = this.diff.wj, dWj;
				var jxFrom = this.d.PERSIST && this.d.PERSIST.junxinFrom != null ? this.d.PERSIST.junxinFrom : 0;
				var shichongOn = !(this.d.PERSIST && this.d.PERSIST.junxinShichong === false);
				if (this.attrs.quanshi >= 80) {
					dWj = Math.round(5 * wj);
					this.attrs.weiji = this._clampA("weiji", this.attrs.weiji + dWj);
					this.introNotes.push("【树大招风】权势过盛，君主猜忌日深——危机+" + dWj + "。");
				}
				if (this.attrs.junxin <= 15 && shichongOn && this.chapterIdx >= jxFrom) {
					dWj = Math.round(10 * wj);
					this.attrs.weiji = this._clampA("weiji", this.attrs.weiji + dWj);
					this.introNotes.push("【失宠于上】君心已冷，构陷者众——危机+" + dWj + "。");
				}
				if (this.attrs.caifu <= 0) {
					this.attrs.shengwang = this._clampA("shengwang", this.attrs.shengwang - 5);
					this.introNotes.push("【门客散去】无钱养士，门前冷落——声望-5。");
				}
				if (this.attrs.shengwang >= 80 && this.attrs.junxin < 40 && !this._once._gonggao) {
					this._once._gonggao = true;
					dWj = Math.round(10 * wj);
					this.attrs.weiji = this._clampA("weiji", this.attrs.weiji + dWj);
					this.introNotes.push("【功高震主】你的名望已越过人臣的界限——危机+" + dWj + "。");
				}
				if (this.attrs.caifu >= this.attrMax("caifu") * .9 && !this._once._jiyu) {
					this._once._jiyu = true;
					dWj = Math.round(8 * wj);
					this.attrs.weiji = this._clampA("weiji", this.attrs.weiji + dWj);
					this.introNotes.push("【宗室觊觎】你的家产引来了宗室的目光——危机+" + dWj + "。");
				}
				if (this.flags.wu_fenshu && idx >= 5) {
					if (!this._once._wfsWarn) {
						this._once._wfsWarn = true;
						this.introNotes.push("【污名·焚书】士林至今以焚书之议罪你——辩白无用，这份敌意会伴你走到局终。");
					}
					this.attrs.shengwang = this._clampA("shengwang", this.attrs.shengwang - 3);
					this.introNotes.push("【士林侧目】焚书之议，士林视你为仇——声望-3。");
				}
				if (ch.achOnEnter) this.unlockAch(ch.achOnEnter);
				this.chapterDev = [];
				this._corrShown = null;
				this._backlashDone = false;
				this.summaryView = null;
				this.passedEvents = {};
				this._settledOpts = {};
				this.xushi = false;
				this.offer = null;
				this.keyRoundsLeft = this.keyCardRounds;
				this.actionUses = {};
				this.randomCount = 0;
				this.currentRandom = null;
				this.pendingEventId = null;
				this._crisisPlotPending = false;
				this._weijiClamp = 0;
				var self = this;
				this.chapterDeck = this._buildChapterDeck(idx);
				var start = ch.start;
				if (ch.startAlt) {
					for (var i = 0; i < ch.startAlt.length; i++) if (this.check(ch.startAlt[i].if).ok) {
						start = ch.startAlt[i].start;
						break;
					}
				}
				this._chapterStartId = start;
				if (this.attrs.weiji >= 90 && this.d.CRISIS_EVENTS && this.d.CRISIS_EVENTS.death) {
					var dev0 = JSON.parse(JSON.stringify(this.d.CRISIS_EVENTS.death));
					this.pendingEventId = start;
					this.currentRandom = dev0;
					this.eventId = dev0.id;
				} else if (this.diffKey === "hardcore" && this.flags.tanmo && !this._once._tanmo_qs && idx >= 4 && idx <= 5 && this.d.CRISIS_EVENTS && this.d.CRISIS_EVENTS.qingsuan) {
					this._once._tanmo_qs = true;
					this.pendingEventId = start;
					this.currentRandom = this.d.CRISIS_EVENTS.qingsuan;
					this.eventId = this.d.CRISIS_EVENTS.qingsuan.id;
					if (this.attrs.weiji >= 70) this._crisisPlotPending = true;
				} else {
					this.eventId = start;
					if (this.attrs.weiji >= 70) this._crisisPlotPending = true;
				}
				this.onEventEnter();
				this.snapshot = this.makeSnapshot();
				this.phase = "intro";
			};
			Game.prototype.makeSnapshot = function() {
				return {
					attrs: Object.assign({}, this.attrs),
					dev: this.dev,
					flags: Object.assign({}, this.flags),
					once: Object.assign({}, this._once),
					histScore: this.histScore,
					merits: this.merits.slice(),
					ach: this.ach.slice(),
					keyChoices: this.keyChoices.slice(),
					peak: Object.assign({}, this.peak),
					zg: this.zg,
					eventId: this.eventId,
					pendingEventId: this.pendingEventId,
					currentRandom: this.currentRandom,
					crisisPlotPending: this._crisisPlotPending,
					keyRoundsLeft: this.keyRoundsLeft,
					actionUses: Object.assign({}, this.actionUses),
					choiceUsed: Object.assign({}, this.choiceUsed),
					choiceGap: this.choiceGap,
					passed: Object.assign({}, this.passedEvents),
					settled: Object.assign({}, this._settledOpts || {}),
					age: this.age,
					ill: this.ill ? Object.assign({}, this.ill) : null,
					introNotes: (this.introNotes || []).slice(),
					coef: this.coef
				};
			};
			Game.prototype.chapterProgress = function() {
				var ch = this.chapter();
				var total = ch ? ch.events.length : 0;
				if (ch && this._chapterStartId && this._chapterStartId !== ch.start) total -= 1;
				return {
					done: Object.keys(this.passedEvents).length,
					total: Math.max(total, 1)
				};
			};
			Game.prototype._buildChapterDeck = function(idx) {
				return (this.d.RANDOM_EVENTS || []).filter(function(e) {
					return idx >= e.chapters[0] && idx <= e.chapters[1];
				}).slice();
			};
			Game.prototype.beginEvents = function() {
				return this.beginRounds();
			};
			Game.prototype.beginRounds = function() {
				var self = this;
				var pool = (this.d.ACTIONS || []).filter(function(a) {
					var chs = a.chapters || [0, 6];
					if (self.chapterIdx < chs[0] || self.chapterIdx > chs[1]) return false;
					return a.req ? self.checkRisk(a.req, true).hardOk : true;
				});
				var picks = [];
				var deal = this._stream("card");
				this.choiceGap = (this.choiceGap || 0) + 1;
				pool = pool.filter(function(a) {
					return !(a.choice && self.choiceUsed[a.id]);
				});
				var crest = pool.filter(function(a) {
					return a.choice;
				});
				var cpick = null;
				if (crest.length > 0 && this.choiceGap >= 2) {
					cpick = crest[Math.floor(deal() * crest.length)];
					this.choiceGap = 0;
					for (var ci = 0; ci < pool.length; ci++) if (pool[ci] === cpick) {
						pool.splice(ci, 1);
						break;
					}
				}
				pool = pool.filter(function(a) {
					return !a.choice;
				});
				var cure = !!(this.ill && this.d.ILLNESS);
				var n = Math.min(3 - ((cpick ? 1 : 0) + (cure ? 1 : 0)), pool.length);
				for (var k = 0; k < n; k++) {
					var idx = Math.floor(deal() * pool.length);
					picks.push(pool.splice(idx, 1)[0]);
				}
				this.offer = [{ type: "key" }];
				picks.forEach(function(a) {
					self.offer.push({
						type: "action",
						id: a.id
					});
				});
				if (cpick) this.offer.push({
					type: "action",
					id: cpick.id
				});
				if (cure) this.offer.push({
					type: "action",
					id: "__cure__"
				});
				this.phase = "round";
				return { type: "round" };
			};
			Game.prototype.getOffer = function() {
				if (!this.offer) return [];
				var self = this;
				return this.offer.map(function(e) {
					if (e.type === "key") {
						var ev = self.findEvent(self.eventId);
						return {
							type: "key",
							eventId: self.eventId,
							title: ev ? ev.title : String(self.eventId),
							inserted: !!self.currentRandom,
							roundsLeft: self.keyRoundsLeft,
							enterable: !self._hasOpenOption()
						};
					}
					var a = null;
					if (e.id === "__cure__") {
						if (self.d.ILLNESS) a = {
							id: "__cure__",
							name: "求医问药",
							desc: (self.ill && self.ill.type === "major" ? "沉疴非药石不起——" : "小病亦不可拖——") + "延医诊治（财富-" + self.d.ILLNESS.cost + "）",
							descHidden: (self.ill && self.ill.type === "major" ? "沉疴非药石不起——" : "小病亦不可拖——") + "延医诊治（耗财）"
						};
					} else a = self._actionById(e.id);
					var c = {
						ok: true,
						reason: null
					}, risky = null;
					if (a && a.req) {
						var cr = self.checkRisk(a.req, true);
						c = {
							ok: cr.hardOk,
							reason: cr.hardReason
						};
						if (cr.hardOk && cr.rate != null) risky = {
							rate: cr.rate,
							unmet: cr.unmet
						};
					}
					if (e.id === "__cure__" && self.d.ILLNESS && self.attrs.caifu <= 0) c = {
						ok: false,
						reason: "囊中羞涩——连延医的药资都拿不出"
					};
					var used = self.actionUses[e.id] || 0;
					var noDim = self.d.ACTION_RULES && self.d.ACTION_RULES.diminish === false;
					return {
						type: "action",
						action: a,
						locked: !c.ok,
						reason: c.reason || null,
						usedCount: used,
						diminishing: !noDim && used > 0,
						risky,
						choice: a && a.choice ? true : null
					};
				});
			};
			var COST_WORD = {
				caifu: "耗财",
				tupo: "费力",
				wuli: "耗力",
				caixue: "耗神",
				moulue: "费心",
				biancai: "费辞"
			};
			Game.prototype.cardDesc = function(desc) {
				if (!desc) return desc;
				if (!this.diff.hideAttrs) return desc;
				var names = this.d.ATTR_NAMES || {}, byName = {};
				Object.keys(names).forEach(function(k) {
					byName[names[k]] = k;
				});
				var wordOf = function(nm) {
					var k = byName[nm];
					return k && COST_WORD[k] || "有代价";
				};
				return String(desc).replace(/（([^（）]{1,8})-\d+）/g, function(_, nm) {
					return "（" + wordOf(nm) + "）";
				}).replace(/（([^（）]{1,8})[≥>]=?\s*\d+\s*([^（）]*)）/g, function(_, nm, tail) {
					return "（" + nm + "不足则须冒险" + (tail ? "，" + tail : "") + "）";
				});
			};
			Game.prototype.playCard = function(i) {
				if (this.phase !== "round" || !this.offer) return null;
				var entry = this.offer[i];
				if (!entry) return null;
				if (entry.type === "key") {
					if (!this._hasOpenOption()) {
						this._next = { type: "chapterEnd" };
						this.phase = "settle";
						return {
							kind: "key",
							forcedEnding: false,
							chapterEnd: true
						};
					}
					this.phase = "event";
					return { kind: "key" };
				}
				if (entry.id === "__cure__") {
					if (!this.ill || !this.d.ILLNESS) return null;
					if (this.attrs.caifu <= 0) return null;
					var ILL = this.d.ILLNESS, wasMajor = this.ill.type === "major";
					this.ill = null;
					var paid = Math.min(this.attrs.caifu, ILL.cost), owed = this.attrs.caifu < ILL.cost;
					this.attrs.caifu = this._clampA("caifu", this.attrs.caifu - ILL.cost);
					var heal = ILL.heal || 5;
					var oldTupo = this.attrs.tupo;
					this.attrs.tupo = this._clampA("tupo", this.attrs.tupo + heal);
					var healReal = this.attrs.tupo - oldTupo;
					var cureChanges = [{
						k: "caifu",
						label: "财富",
						delta: -paid,
						note: owed ? "举债求医，债台高筑" : "延医之资"
					}, {
						k: "tupo",
						label: "体魄",
						delta: healReal,
						note: healReal > 0 ? "药石有功" : "体魄已盈，药石无功"
					}];
					var rc = {
						kind: "action",
						id: "__cure__",
						text: wasMajor ? "医者换了三次方，前前后后一个月，你终于能扶着墙坐起来了。这场大病，把日子熬短了一截。" : "一剂汤药下去，病气散了。小病早治，原是至理。",
						changes: cureChanges,
						devDelta: 0,
						useCount: 1,
						achNew: null,
						bandUp: false,
						bandName: null,
						forcedEnding: false,
						risk: null,
						failed: false
					};
					var feC = this.checkDeath(cureChanges);
					if (feC) {
						this._next = feC;
						this.phase = "settle";
						rc.forcedEnding = true;
						return rc;
					}
					return this._advanceRound(rc);
				}
				var a = this._actionById(entry.id);
				if (!a) return null;
				var cr = a.req ? this.checkRisk(a.req, true) : {
					hardOk: true,
					rate: null,
					unmet: []
				};
				if (!cr.hardOk) return null;
				if (a.choice) {
					this.pendingCardId = a.id;
					this.phase = "choice";
					return {
						kind: "choice",
						id: a.id
					};
				}
				var risk = null, failed = false;
				if (cr.rate != null) {
					risk = this._rollRisk(cr.rate, cr.unmet);
					failed = !risk.success;
				}
				var useN = (this.actionUses[a.id] || 0) + 1;
				this.actionUses[a.id] = useN;
				var noDim = this.d.ACTION_RULES && this.d.ACTION_RULES.diminish === false;
				var eff = failed ? { attrs: { weiji: 3 } } : noDim ? JSON.parse(JSON.stringify(a.eff || {})) : this._scaleActionEff(a.eff || {}, useN);
				var changes = this.applyEff(eff);
				if (this.d.ILLNESS) this._tickIllness(changes);
				var r = {
					kind: "action",
					id: a.id,
					text: failed ? "徒劳一场。" : a.res,
					changes,
					devDelta: eff.dev || 0,
					useCount: useN,
					achNew: null,
					bandUp: false,
					bandName: null,
					forcedEnding: false,
					risk,
					failed
				};
				var forcedEnding = this.checkDeath(changes);
				if (forcedEnding) {
					this._next = forcedEnding;
					this.phase = "settle";
					r.forcedEnding = true;
					return r;
				}
				return this._advanceRound(r);
			};
			Game.prototype._advanceRound = function(r) {
				this.keyRoundsLeft--;
				if (this.keyRoundsLeft <= 0) {
					var opts0 = this.getOptions(), anyOpen = false;
					for (var oi = 0; oi < opts0.length; oi++) if (!opts0[oi].locked) {
						anyOpen = true;
						break;
					}
					if (anyOpen) {
						this.phase = "event";
						r.forcedKey = true;
						if (this.unlockAch("shiwodai")) {
							var nm0 = this.d.ACHIEVEMENTS.shiwodai;
							if (nm0) r.achNew = r.achNew ? r.achNew + "、" + nm0 : nm0;
						}
					} else {
						this.keyRoundsLeft = this.keyCardRounds;
						this.beginRounds();
						r.route = { type: "round" };
					}
				} else {
					this.beginRounds();
					r.route = { type: "round" };
				}
				return r;
			};
			Game.prototype.playXushi = function() {
				if (this.phase !== "round" || this.xushi) return null;
				this.xushi = true;
				var r = {
					kind: "xushi",
					text: "你按兵不动，把心思都留给了即将到来的那件事。",
					changes: [],
					devDelta: 0,
					achNew: null,
					bandUp: false,
					bandName: null,
					forcedEnding: false,
					risk: null,
					failed: false
				};
				var forcedEnding = this.checkDeath(r.changes);
				if (forcedEnding) {
					this._next = forcedEnding;
					this.phase = "settle";
					r.forcedEnding = true;
					return r;
				}
				return this._advanceRound(r);
			};
			Game.prototype.getChoiceCard = function() {
				if (this.phase !== "choice" || !this.pendingCardId) return null;
				var a = this._actionById(this.pendingCardId);
				if (!a || !a.choice) return null;
				var self = this;
				return {
					id: a.id,
					title: a.choice.title || a.name,
					segs: a.choice.segs || [],
					options: (a.choice.options || []).map(function(o) {
						if (self._caifuBroke() && self._caifuCost(o) > 0) return Object.assign({}, o, {
							locked: true,
							reason: Game.prototype.CAIFU_LOCK_REASON
						});
						return o;
					}),
					usedCount: this.actionUses[a.id] || 0
				};
			};
			Game.prototype.chooseCardOption = function(i) {
				if (this.phase !== "choice" || !this.pendingCardId) return null;
				var a = this._actionById(this.pendingCardId);
				if (!a || !a.choice) return null;
				var opt = (a.choice.options || [])[i];
				if (!opt) return null;
				if (this._caifuBroke() && this._caifuCost(opt) > 0) return null;
				this.pendingCardId = null;
				this.choiceUsed[a.id] = true;
				var useN = (this.actionUses[a.id] || 0) + 1;
				this.actionUses[a.id] = useN;
				var eff = this.d.ACTION_RULES && this.d.ACTION_RULES.diminish === false ? JSON.parse(JSON.stringify(opt.eff || {})) : this._scaleActionEff(opt.eff || {}, useN);
				var changes = this.applyEff(eff);
				if (this.d.ILLNESS) this._tickIllness(changes);
				var r = {
					kind: "action",
					id: a.id,
					text: opt.res || "",
					changes,
					devDelta: eff.dev || 0,
					useCount: useN,
					achNew: null,
					bandUp: false,
					bandName: null,
					forcedEnding: false,
					risk: null,
					failed: false
				};
				var forcedEnding = this.checkDeath(changes);
				if (forcedEnding) {
					this._next = forcedEnding;
					this.phase = "settle";
					r.forcedEnding = true;
					return r;
				}
				return this._advanceRound(r);
			};
			Game.prototype.cancelChoice = function() {
				if (this.phase !== "choice") return false;
				this.pendingCardId = null;
				this.phase = "round";
				return true;
			};
			Game.prototype._tickIllness = function(changes) {
				var ILL = this.d.ILLNESS;
				if (!ILL) return;
				var wj = this.diff.wj, dW;
				if (this.ill) {
					if (this.ill.type === "minor") {
						this.ill.left = (this.ill.left != null ? this.ill.left : 2) - 1;
						if (this.ill.left <= 0) {
							this.ill = null;
							changes.push({
								k: "tupo",
								label: "体魄",
								delta: 0,
								note: "病体自愈——小病靠养，总算过去了"
							});
						}
					} else {
						this.attrs.tupo = this._clampA("tupo", this.attrs.tupo - (ILL.drainTupo || 2));
						dW = Math.round((ILL.drainWeiji || 2) * wj);
						this.attrs.weiji = this._clampA("weiji", this.attrs.weiji + dW);
						if (this.age != null) this.age += 1;
						changes.push({
							k: "tupo",
							label: "体魄",
							delta: -(ILL.drainTupo || 2),
							note: "沉疴缠身，病势日重，病一年老三年——须用「求医问药」"
						});
						changes.push({
							k: "weiji",
							label: "危机",
							delta: dW,
							note: "病中无人主事，谗言易入"
						});
					}
					return;
				}
				var tupo = this.attrs.tupo, age = this.age != null ? this.age : 30;
				var cred = this._longevity();
				var effTupo = tupo + cred, effAge = Math.max(0, age - cred);
				var p = (ILL.base != null ? ILL.base : .03) + Math.max(0, 45 - effTupo) * .004 + Math.max(0, effAge - 55) * .004;
				if (this._stream("ill")() >= Math.min(.35, p)) return;
				var majorP = .2 + Math.max(0, effAge - 60) * .01 + Math.max(0, 30 - effTupo) * .01;
				if (this._stream("ill")() < majorP) {
					this.ill = { type: "major" };
					this.attrs.tupo = this._clampA("tupo", tupo - (ILL.onsetTupo || 5));
					dW = Math.round((ILL.onsetWeiji || 3) * wj);
					this.attrs.weiji = this._clampA("weiji", this.attrs.weiji + dW);
					changes.push({
						k: "tupo",
						label: "体魄",
						delta: -(ILL.onsetTupo || 5),
						note: "沉疴骤至，一病不起——非「求医问药」不能愈"
					});
					changes.push({
						k: "weiji",
						label: "危机",
						delta: dW,
						note: "病榻之侧，人心浮动"
					});
				} else {
					this.ill = {
						type: "minor",
						left: 2
					};
					this.attrs.tupo = this._clampA("tupo", tupo - 2);
					dW = Math.round(1 * wj);
					this.attrs.weiji = this._clampA("weiji", this.attrs.weiji + dW);
					changes.push({
						k: "tupo",
						label: "体魄",
						delta: -2,
						note: "偶感风寒——静养两轮可自愈，亦可即服「求医问药」"
					});
					if (dW) changes.push({
						k: "weiji",
						label: "危机",
						delta: dW,
						note: "病中耳目闭塞"
					});
				}
			};
			Game.prototype._scaleActionEff = function(eff, n) {
				var scaled = JSON.parse(JSON.stringify(eff || {}));
				if (!scaled.attrs || n <= 1) return scaled;
				var div = Math.pow(2, n - 1);
				Object.keys(scaled.attrs).forEach(function(k) {
					var v = scaled.attrs[k];
					if (k === "weiji") {
						if (v < 0) scaled.attrs[k] = Math.min(-1, -Math.floor(Math.abs(v) / div));
					} else if (v > 0) scaled.attrs[k] = Math.max(1, Math.floor(v / div));
				});
				return scaled;
			};
			Game.prototype.onEventEnter = function() {
				var ev = this.findEvent(this.eventId);
				if (!ev || !ev.enterEffects) return;
				if (ev.enterOnce) {
					if (this._once[ev.enterOnce]) return;
					this._once[ev.enterOnce] = true;
				}
				var self = this;
				ev.enterEffects.forEach(function(ef) {
					if (ef.if && !self.check(ef.if).ok) return;
					if (ef.setFlags) ef.setFlags.forEach(function(f) {
						self.flags[f] = true;
					});
					if (ef.attrs) Object.keys(ef.attrs).forEach(function(k) {
						self.attrs[k] = self._clampA(k, self.attrs[k] + ef.attrs[k]);
					});
					if (ef.zg) self.zg = clamp(self.zg + ef.zg);
					if (ef.zgSet != null) self.zg = clamp(ef.zgSet);
				});
			};
			Game.prototype._burnKey = function(i) {
				return this.chapterIdx + ":" + this.eventId + ":" + i;
			};
			Game.prototype._settledKey = function(i) {
				return this.chapterIdx + ":" + this.eventId + ":" + i;
			};
			Game.prototype._warn = function(msg) {
				if (!this._warns) this._warns = [];
				this._warns.push(msg);
			};
			Game.prototype._readOnce = function(s) {
				var once = Object.assign({}, s.once || {}), flags = this.flags || {};
				Object.keys(flags).forEach(function(k) {
					if (k.charAt(0) === "_") {
						once[k] = true;
						delete flags[k];
					}
				});
				return once;
			};
			Game.prototype._indexActions = function() {
				var m = {};
				(this.d.ACTIONS || []).forEach(function(a) {
					m[a.id] = a;
				});
				return m;
			};
			Game.prototype._actionById = function(id) {
				return this._actions[id] || null;
			};
			Game.prototype._hasOpenOption = function() {
				var opts = this.getOptions();
				for (var i = 0; i < opts.length; i++) if (!opts[i].locked) return true;
				return false;
			};
			Game.prototype.getOptions = function() {
				var ev = this.findEvent(this.eventId);
				if (!ev || !ev.options || !ev.options.length) return [];
				var self = this;
				var _opts = ev.options.map(function(o, i) {
					if (self.auditHide && self.auditHide.ev === ev.id && self.auditHide.idx === i) return null;
					var req = o.req ? Object.assign({}, o.req) : null;
					if (o.reqAdjust) {
						req = req || {};
						o.reqAdjust.forEach(function(ra) {
							if (!ra.if || self.check(ra.if).ok) req[ra.attr] = (req[ra.attr] || 0) + ra.delta;
						});
					}
					var locked = false, reason = null, risky = null;
					if (self._burned[self._burnKey(i)]) {
						locked = true;
						reason = "已试，事未谐";
					} else if (self._settledOpts[self._settledKey(i)]) {
						locked = true;
						reason = "此事已了，不可复选";
					} else if (req) {
						var cr = self.checkRisk(req, false);
						if (!cr.hardOk) {
							locked = true;
							reason = cr.hardReason;
						} else if (cr.rate != null) risky = {
							rate: o.hist ? self.riskRateHist(cr.rate) : cr.rate,
							unmet: cr.unmet
						};
					}
					if (!locked && self._caifuBroke() && self._caifuCost(o) > 0) {
						locked = true;
						reason = Game.prototype.CAIFU_LOCK_REASON;
						risky = null;
					}
					return {
						opt: o,
						locked,
						reason,
						hist: !!o.hist,
						risky
					};
				});
				var anyOpen = false;
				_opts.forEach(function(e) {
					if (e && !e.locked) anyOpen = true;
				});
				if (!anyOpen && self._caifuBroke()) {
					var cheapest = null;
					_opts.forEach(function(e) {
						if (e && e.locked && e.reason === Game.prototype.CAIFU_LOCK_REASON) {
							if (!cheapest || self._caifuCost(e.opt) < self._caifuCost(cheapest.opt)) cheapest = e;
						}
					});
					if (cheapest) {
						cheapest.locked = false;
						cheapest.reason = null;
					}
				}
				return self.auditHide && self.auditHide.ev === ev.id ? _opts.filter(Boolean) : _opts;
			};
			Game.prototype.choose = function(i) {
				var ev = this.findEvent(this.eventId);
				var entry = this.getOptions()[i];
				if (!ev || !entry || entry.locked) return null;
				var o = entry.opt;
				var xushiBonus = this.xushi ? 10 : 0;
				this.xushi = false;
				var dataIdx = ev.options ? ev.options.indexOf(o) : -1;
				this._settledOpts[this._settledKey(dataIdx >= 0 ? dataIdx : i)] = true;
				var risk = null;
				if (entry.risky) {
					risk = this._rollRisk(Math.min(70, entry.risky.rate + xushiBonus), entry.risky.unmet);
					if (!risk.success) {
						this._burned[this._burnKey(i)] = true;
						var fchg = this.applyEff(o.effFail || { attrs: { weiji: 5 } });
						var fEnd = this.checkDeath(fchg);
						if (fEnd) {
							this._next = fEnd;
							this.phase = "settle";
						} else this.phase = "event";
						return {
							failed: true,
							risk,
							text: o.resFail || "事与愿违。时机未到，强行为之，徒增其败。",
							changes: fchg,
							devDelta: 0,
							achNew: null,
							bandUp: false,
							bandName: null,
							forcedEnding: !!fEnd
						};
					}
				}
				if (!this.currentRandom && this.eventId) this.passedEvents[this.eventId] = true;
				var beforeBand = this.devBand();
				var changes = this.applyEff(o.eff || {});
				var devDelta0 = o.eff && o.eff.dev || 0;
				if (devDelta0 > 0) this.chapterDev.push({
					ev: ev.title,
					t: o.t,
					dev: devDelta0
				});
				if (ev.key) {
					var histOpt = null;
					ev.options.forEach(function(x) {
						if (x.hist) histOpt = x;
					});
					this.keyChoices.push({
						node: this.d.KEY_NODE_NAMES[ev.id] || ev.title,
						you: o.t,
						hist: histOpt ? histOpt.t : "—",
						isHist: !!o.hist,
						dev: o.eff && o.eff.dev || 0
					});
				}
				var afterBand = this.devBand();
				var self = this;
				var achNew = (this._newAch || []).map(function(a) {
					return self.d.ACHIEVEMENTS[a];
				}).filter(Boolean).join("、") || null;
				var forcedEnding = this.checkDeath(changes);
				this._next = forcedEnding || this.resolveTo(o.to);
				this.phase = "settle";
				return {
					text: o.res || "",
					changes,
					devDelta: o.eff && o.eff.dev || 0,
					achNew,
					bandUp: afterBand > beforeBand,
					bandName: this.d.DEV_BANDS[afterBand].name,
					forcedEnding: !!forcedEnding,
					risk
				};
			};
			Game.prototype.checkDeath = function(changes) {
				if (this.d.ILLNESS && this.attrs.tupo <= 0) {
					if (this.diff.lethal) {
						var dd = this.d.ILLNESS.death || { ending: "E8" };
						return {
							type: "ending",
							ending: dd.ending,
							variant: dd.variant || null
						};
					}
					this.attrs.tupo = 1;
				}
				if (this.attrs.weiji < 100) return null;
				if (this.diff.lethal) return {
					type: "ending",
					ending: "E8",
					variant: this.zg >= 70 ? "zuzhu" : "cike"
				};
				var back = this.attrs.weiji - 95;
				this._weijiClamp += back;
				this.attrs.weiji = 95;
				if (changes && back > 0) changes.push({
					k: "weiji",
					label: this.d.ATTR_NAMES && this.d.ATTR_NAMES.weiji || "危机",
					delta: -back,
					note: "危机封顶回落（非致命难度上限 95）"
				});
				return null;
			};
			Game.prototype.abandonEvent = function() {
				if (this.phase !== "event") return null;
				this.phase = "settle";
				this._next = this.currentRandom ? { type: "return" } : { type: "none" };
				return this.proceed();
			};
			Game.prototype.applyEff = function(eff) {
				var changes = [], self = this;
				this._newAch = [];
				var names = this.d.ATTR_NAMES;
				var known = function(k) {
					return !!(names && names[k]);
				};
				if (eff.attrs) Object.keys(eff.attrs).forEach(function(k) {
					if (!known(k)) {
						self._warn("忽略未知属性键（eff.attrs）：" + k);
						return;
					}
					var v = eff.attrs[k];
					if (k === "weiji" && v > 0) v = Math.round(v * self.diff.wj);
					var old = self.attrs[k];
					self._setAttrRaw(k, self.attrs[k] + v);
					var d = self.attrs[k] - old;
					if (d === 0) return;
					var chg = {
						k,
						label: names[k],
						delta: d
					};
					if (eff.notes && eff.notes[k]) chg.note = eff.notes[k];
					changes.push(chg);
				});
				if (eff.setAttrs) Object.keys(eff.setAttrs).forEach(function(k) {
					if (!known(k)) {
						self._warn("忽略未知属性键（eff.setAttrs）：" + k);
						return;
					}
					var old = self.attrs[k];
					self._setAttrRaw(k, eff.setAttrs[k]);
					var d = self.attrs[k] - old;
					if (d !== 0) changes.push({
						k,
						label: names[k],
						delta: d
					});
				});
				if (eff.condAttrs) eff.condAttrs.forEach(function(ca) {
					if (ca.if && !self.check(ca.if).ok) return;
					Object.keys(ca.attrs || {}).forEach(function(k) {
						if (!known(k)) {
							self._warn("忽略未知属性键（eff.condAttrs）：" + k);
							return;
						}
						var v = ca.attrs[k];
						if (k === "weiji" && v > 0) v = Math.round(v * self.diff.wj);
						var old = self.attrs[k];
						self._setAttrRaw(k, self.attrs[k] + v);
						var d = self.attrs[k] - old;
						if (d !== 0) changes.push({
							k,
							label: names[k],
							delta: d,
							note: ca.note
						});
					});
				});
				if (eff.dev > 0) this.dev = Math.min(100, this.dev + eff.dev);
				if (eff.flags) eff.flags.forEach(function(f) {
					self.flags[f] = true;
				});
				if (eff.rmflags) eff.rmflags.forEach(function(f) {
					delete self.flags[f];
				});
				if (eff.zg) this.zg = clamp(this.zg + eff.zg);
				if (eff.zgSet != null) this.zg = clamp(eff.zgSet);
				if (eff.hist) this.histScore += eff.hist;
				if (eff.merit && this.merits.indexOf(eff.merit) < 0) this.merits.push(eff.merit);
				if (eff.ach) {
					if (typeof eff.ach === "string") this.unlockAch(eff.ach);
					else if (eff.ach.id && (!eff.ach.if || this.check(eff.ach.if).ok)) this.unlockAch(eff.ach.id);
				}
				var wj = this.diff.wj, dT, oldT;
				var jxFrom2 = this.d.PERSIST && this.d.PERSIST.junxinFrom != null ? this.d.PERSIST.junxinFrom : 0;
				var shichongOn2 = !(this.d.PERSIST && this.d.PERSIST.junxinShichong === false);
				if (this.attrs.quanshi >= 80 && !this._once._caizhi) {
					this._once._caizhi = true;
					dT = Math.round(8 * wj);
					oldT = this.attrs.weiji;
					this.attrs.weiji = clamp(this.attrs.weiji + dT);
					dT = this.attrs.weiji - oldT;
					if (dT) changes.push({
						k: "weiji",
						label: "危机",
						delta: dT,
						note: "权势过盛，君主猜忌"
					});
				}
				if (this.attrs.junxin <= 15 && shichongOn2 && this.chapterIdx >= jxFrom2 && !this._once._shichong) {
					this._once._shichong = true;
					dT = Math.round(10 * wj);
					oldT = this.attrs.weiji;
					this.attrs.weiji = clamp(this.attrs.weiji + dT);
					dT = this.attrs.weiji - oldT;
					if (dT) changes.push({
						k: "weiji",
						label: "危机",
						delta: dT,
						note: "失宠于上"
					});
				}
				if (this.attrs.caifu <= 0 && !this._once._menke) {
					this._once._menke = true;
					oldT = this.attrs.shengwang;
					this.attrs.shengwang = clamp(this.attrs.shengwang - 5);
					dT = this.attrs.shengwang - oldT;
					if (dT) changes.push({
						k: "shengwang",
						label: "声望",
						delta: dT,
						note: "门客散去"
					});
				}
				if (this.attrs.weiji >= 70 && !this._once._liuyan) {
					this._once._liuyan = true;
					changes.push({
						k: "weiji",
						label: "危机",
						delta: 0,
						note: "流言四起，你已身处流言中心"
					});
				}
				if (this.attrs.weiji >= 90 && !this._once._mingxuan) {
					this._once._mingxuan = true;
					changes.push({
						k: "weiji",
						label: "危机",
						delta: 0,
						note: "命悬一线"
					});
				}
				return changes;
			};
			Game.prototype.unlockAch = function(id) {
				if (this.ach.indexOf(id) >= 0) return false;
				this.ach.push(id);
				if (this._newAch) this._newAch.push(id);
				return true;
			};
			Game.prototype.resolveTo = function(to) {
				if (to == null) return { type: "none" };
				if (typeof to === "string") {
					if (to === "NEXT") return { type: "chapterEnd" };
					if (to === "RETURN") return { type: "return" };
					return {
						type: "event",
						eventId: to
					};
				}
				if (Array.isArray(to)) {
					for (var i = 0; i < to.length; i++) if (!to[i].if || this.check(to[i].if).ok) return this.resolveTo(to[i].to);
					return {
						type: "ending",
						ending: "E8"
					};
				}
				if (to.ending) return {
					type: "ending",
					ending: to.ending,
					variant: to.variant || null
				};
				return { type: "none" };
			};
			Game.prototype.proceed = function() {
				var n = this._next;
				this._next = null;
				if (!n) return this.chapterEnd();
				if (n.type === "event") {
					this.eventId = n.eventId;
					this.onEventEnter();
					this.keyRoundsLeft = this.keyCardRounds;
					this.beginRounds();
					return { type: "round" };
				}
				if (n.type === "return") {
					this.eventId = this.pendingEventId;
					this.pendingEventId = null;
					this.currentRandom = null;
					this._skipRandom = true;
					this.onEventEnter();
					this.keyRoundsLeft = this.keyCardRounds;
					this.beginRounds();
					return {
						type: "round",
						resumed: true
					};
				}
				if (n.type === "ending") {
					this.finishEnding(n.ending, n.variant);
					return { type: "ending" };
				}
				if (n.type === "chapterEnd") return this.chapterEnd();
				this.beginRounds();
				return { type: "round" };
			};
			Game.prototype.correctionEff = function(c) {
				var eff = JSON.parse(JSON.stringify(c.eff || {})), corr = this.diff.corr;
				if (eff.attrs && corr !== 1) Object.keys(eff.attrs).forEach(function(k) {
					if (k !== "weiji" && eff.attrs[k]) eff.attrs[k] = Math.round(eff.attrs[k] * corr);
				});
				return eff;
			};
			Game.prototype.chapterEnd = function() {
				var ch = this.chapter();
				var self = this;
				if (ch.endEvents && !this._endEventsChecked) {
					this._endEventsChecked = true;
					this.pendingEndEvents = ch.endEvents.filter(function(e) {
						return self.check(e.if).ok;
					});
				}
				if (this.pendingEndEvents && this.pendingEndEvents.length > 0) {
					this.currentEndEvent = this.pendingEndEvents.shift();
					this.phase = "endEvent";
					return {
						type: "endEvent",
						event: this.currentEndEvent
					};
				}
				this._endEventsChecked = false;
				if (this.devBand() > 0) {
					var pool = this.d.CORRECTIONS.filter(function(c) {
						return self.dev >= c.minDev && self.dev <= c.maxDev;
					});
					if (pool.length > 0) {
						var total2 = pool.reduce(function(s, c) {
							return s + c.chance;
						}, 0);
						var maxC = 0;
						pool.forEach(function(c) {
							if (c.chance > maxC) maxC = c.chance;
						});
						var c = null;
						if (total2 > 0 && maxC > 0) {
							var pick2 = this._stream("corr")() * total2, acc2 = 0;
							for (var ci = 0; ci < pool.length; ci++) {
								acc2 += pool[ci].chance;
								if (pick2 < acc2) {
									c = pool[ci];
									break;
								}
							}
							if (!c) c = pool[pool.length - 1];
						}
						if (c && (maxC >= 1 || this._stream("corr")() < maxC)) {
							var changes = this.applyEff(this.correctionEff(c));
							var forced = this.checkDeath(changes);
							this.correction = {
								title: c.title,
								segs: c.segs,
								changes,
								forced
							};
							this._corrShown = c.title;
							this.phase = "correction";
							return {
								type: "correction",
								correction: this.correction
							};
						}
					}
				}
				return this.makeSummary();
			};
			Game.prototype.endEventChoose = function(i) {
				var ev = this.currentEndEvent;
				var o = ev && ev.options[i];
				if (!o) return null;
				if (o.req && !this.check(o.req).ok) return null;
				if (this._caifuBroke() && this._caifuCost(o) > 0) return null;
				var changes = this.applyEff(o.eff || {});
				var devDelta0 = o.eff && o.eff.dev || 0;
				if (devDelta0 > 0) this.chapterDev.push({
					ev: ev.title,
					t: o.t,
					dev: devDelta0
				});
				this.currentEndEvent = null;
				var forcedEnding = this.checkDeath(changes);
				var r = {
					text: o.res,
					changes,
					devDelta: o.eff && o.eff.dev || 0,
					forcedEnding: !!forcedEnding
				};
				this._next = forcedEnding || (o.to ? this.resolveTo(o.to) : null);
				this.phase = "settle";
				return r;
			};
			Game.prototype.proceedAfterEndEvent = function() {
				if (this._next) return this.proceed();
				return this.chapterEnd();
			};
			Game.prototype.correctionContinue = function() {
				if (this.correction && this.correction.forced) {
					this.finishEnding(this.correction.forced.ending, this.correction.forced.variant);
					return { type: "ending" };
				}
				this.correction = null;
				return this.makeSummary();
			};
			Game.prototype.makeSummary = function() {
				var snapAttrs = this.snapshot && this.snapshot.attrs || this.d.INIT;
				var attrDelta = {}, self = this;
				Object.keys(this.d.ATTR_NAMES).forEach(function(k) {
					var d = self.attrs[k] - (snapAttrs[k] != null ? snapAttrs[k] : 0);
					if (d !== 0) attrDelta[k] = d;
				});
				this._weijiClamp = 0;
				var next = this.d.CHAPTERS[this.chapterIdx + 1] || null;
				this.phase = "summary";
				this.summaryView = {
					chapter: this.chapter().title,
					devLog: this.chapterDev.slice(),
					attrDelta,
					corrTitle: this._corrShown,
					notes: this.chapter().summaryNotes || [],
					nextTitle: next ? next.title : null,
					bandName: this.d.DEV_BANDS[this.devBand()].name,
					dev: this.dev
				};
				return {
					type: "summary",
					summary: this.summaryView
				};
			};
			Game.prototype.proceedSummary = function() {
				return this.nextChapter();
			};
			Game.prototype.nextChapter = function() {
				if (this.chapterIdx + 1 < this.d.CHAPTERS.length) {
					this.enterChapter(this.chapterIdx + 1);
					return {
						type: "chapter",
						chapter: this.chapter()
					};
				}
				return { type: "none" };
			};
			Game.prototype.canBacktrack = function() {
				if (this.phase === "home") return false;
				if (this.phase === "ending") return false;
				if (this.diff.backtrack === 0) return false;
				if (this.diff.backtrack > 0 && this.backtracksThisChapter >= this.diff.backtrack) return false;
				return !!this.snapshot;
			};
			Game.prototype.backtrack = function() {
				if (!this.canBacktrack()) return false;
				var s = this.snapshot;
				var keepDev = Math.max(s.dev, this.dev);
				var keepAch = this.ach.slice();
				this.attrs = Object.assign({}, s.attrs);
				this.flags = Object.assign({}, s.flags);
				this._once = this._readOnce(s);
				this.histScore = s.histScore;
				this.merits = s.merits.slice();
				this.ach = s.ach.slice();
				keepAch.forEach(function(a) {
					if (this.ach.indexOf(a) < 0) this.ach.push(a);
				}, this);
				this.keyChoices = s.keyChoices.slice();
				this.peak = Object.assign({}, s.peak);
				this.zg = s.zg != null ? s.zg : this.zg;
				this.dev = keepDev;
				this.eventId = s.eventId;
				this.pendingEventId = s.pendingEventId || null;
				this.currentRandom = s.currentRandom || null;
				this._crisisPlotPending = !!s.crisisPlotPending;
				this.keyRoundsLeft = s.keyRoundsLeft != null ? s.keyRoundsLeft : this.keyCardRounds;
				this.actionUses = Object.assign({}, s.actionUses || {});
				this.choiceUsed = Object.assign({}, s.choiceUsed || {});
				this.choiceGap = s.choiceGap != null ? s.choiceGap : 1;
				this.pendingCardId = null;
				this.passedEvents = Object.assign({}, s.passed || {});
				this._settledOpts = Object.assign({}, s.settled || {});
				this.xushi = false;
				this._burned = {};
				this.age = s.age != null ? s.age : this.age;
				this.ill = s.ill ? Object.assign({}, s.ill) : null;
				this.introNotes = (s.introNotes || []).slice();
				this.coef = typeof s.coef === "number" && isFinite(s.coef) ? s.coef : this.coef;
				this.offer = null;
				this.backtracksThisChapter++;
				this.coef = Math.round(this.coef * .98 * 100) / 100;
				this.pendingEndEvents = [];
				this.currentEndEvent = null;
				this.correction = null;
				this.summaryView = null;
				this._endEventsChecked = false;
				this.chapterDev = [];
				this._corrShown = null;
				this._backlashDone = false;
				this.ending = null;
				this.randomCount = 0;
				this.chapterDeck = this._buildChapterDeck(this.chapterIdx);
				this._skipRandom = false;
				this._weijiClamp = 0;
				this.phase = "intro";
				return true;
			};
			Game.prototype.exportSave = function() {
				if (this.d.SCENARIO && this.d.SCENARIO.noSave) return null;
				if (this.diff.backtrack === 0) return null;
				if (!this.snapshot) return null;
				if (this.phase === "ending" || this.phase === "home") return null;
				var s = JSON.parse(JSON.stringify(this.snapshot));
				s.currentRandomId = this.snapshot.currentRandom ? this.snapshot.currentRandom.id : null;
				delete s.currentRandom;
				return {
					v: 2,
					diffKey: this.diffKey,
					scenKey: this.d.SCENARIO.id,
					chapterIdx: this.chapterIdx,
					snapshot: s,
					live: this.makeLiveState(),
					backtracksThisChapter: this.backtracksThisChapter
				};
			};
			Game.prototype.makeLiveState = function() {
				var s = this.makeSnapshot();
				s.currentRandomId = this.currentRandom ? this.currentRandom.id : null;
				delete s.currentRandom;
				s.phase = this.phase;
				s.offer = this.offer ? JSON.parse(JSON.stringify(this.offer)) : null;
				s.pendingCardId = this.pendingCardId;
				s.randomCount = this.randomCount;
				s.chapterDeckIds = (this.chapterDeck || []).map(function(e) {
					return e.id;
				});
				s.skipRandom = this._skipRandom;
				s.chapterDev = JSON.parse(JSON.stringify(this.chapterDev || []));
				s.corrShown = this._corrShown;
				s.backlashDone = this._backlashDone;
				s.weijiClamp = this._weijiClamp;
				s.endEventsChecked = this._endEventsChecked;
				s.chapterStartId = this._chapterStartId;
				s.xushi = !!this.xushi;
				s.burned = Object.assign({}, this._burned || {});
				s.next = this._next ? JSON.parse(JSON.stringify(this._next)) : null;
				s.pendingEndEvents = JSON.parse(JSON.stringify(this.pendingEndEvents || []));
				s.currentEndEvent = this.currentEndEvent ? JSON.parse(JSON.stringify(this.currentEndEvent)) : null;
				s.correction = this.correction ? JSON.parse(JSON.stringify(this.correction)) : null;
				s.summaryView = this.summaryView ? JSON.parse(JSON.stringify(this.summaryView)) : null;
				var rngState = {
					main: null,
					streams: {}
				};
				if (this.rng && typeof this.rng._getState === "function") rngState.main = this.rng._getState();
				for (var nm in this._rngStreams) {
					var st = this._rngStreams[nm];
					if (st && typeof st._getState === "function") rngState.streams[nm] = st._getState();
				}
				s.rng = rngState;
				return s;
			};
			Game.prototype._eventResolvable = function(id) {
				if (this.findEvent(id)) return true;
				return !!this._findInsertEvent(id);
			};
			Game.prototype._findInsertEvent = function(id) {
				var pools = [this.d.RANDOM_EVENTS || []];
				if (this.d.CRISIS_EVENTS) {
					pools.push(this.d.CRISIS_EVENTS.plots || []);
					if (this.d.CRISIS_EVENTS.death) pools.push([this.d.CRISIS_EVENTS.death]);
					if (this.d.CRISIS_EVENTS.qingsuan) pools.push([this.d.CRISIS_EVENTS.qingsuan]);
				}
				for (var i = 0; i < pools.length; i++) for (var j = 0; j < pools[i].length; j++) if (pools[i][j].id === id) return pools[i][j];
				return null;
			};
			Game.prototype._validStateFields = function(s) {
				if (!s || !s.attrs || typeof s.attrs !== "object" || Array.isArray(s.attrs)) return false;
				for (var ak in s.attrs) if (typeof s.attrs[ak] !== "number" || !isFinite(s.attrs[ak])) return false;
				if (s.dev != null && (typeof s.dev !== "number" || !isFinite(s.dev) || s.dev < 0)) return false;
				if (s.ach != null && !Array.isArray(s.ach)) return false;
				if (s.age != null && (typeof s.age !== "number" || !isFinite(s.age) || s.age < 0)) return false;
				if (s.ill != null && (typeof s.ill !== "object" || s.ill.type !== "minor" && s.ill.type !== "major")) return false;
				var numOk = function(v) {
					return typeof v === "number" && isFinite(v);
				};
				var numRange = function(v, lo, hi) {
					return numOk(v) && v >= lo && v <= hi;
				};
				if (s.histScore != null && !numOk(s.histScore)) return false;
				if (s.peak != null && (typeof s.peak !== "object" || Array.isArray(s.peak))) return false;
				if (s.peak) {
					for (var pk in s.peak) if (!numRange(s.peak[pk], 0, 1e3)) return false;
				}
				if (s.zg != null && !numRange(s.zg, 0, 100)) return false;
				if (s.merits != null && !Array.isArray(s.merits)) return false;
				if (s.keyChoices != null && !Array.isArray(s.keyChoices)) return false;
				if (s.flags != null && (typeof s.flags !== "object" || Array.isArray(s.flags))) return false;
				if (s.actionUses != null && (typeof s.actionUses !== "object" || Array.isArray(s.actionUses))) return false;
				if (s.choiceUsed != null && (typeof s.choiceUsed !== "object" || Array.isArray(s.choiceUsed))) return false;
				if (s.choiceGap != null && (!numOk(s.choiceGap) || s.choiceGap < 0)) return false;
				if (s.passed != null && (typeof s.passed !== "object" || Array.isArray(s.passed))) return false;
				if (s.settled != null && (typeof s.settled !== "object" || Array.isArray(s.settled))) return false;
				if (s.keyRoundsLeft != null && (!numOk(s.keyRoundsLeft) || s.keyRoundsLeft < 0)) return false;
				for (var ak2 in s.attrs) {
					if (!this.d.ATTR_NAMES[ak2]) return false;
					if (!numRange(s.attrs[ak2], 0, this.attrMax(ak2))) return false;
				}
				return true;
			};
			Game.prototype._chapterStartFallback = function() {
				var ch = this.chapter(), start = ch.start;
				if (ch.startAlt) {
					for (var sa = 0; sa < ch.startAlt.length; sa++) if (this.check(ch.startAlt[sa].if).ok) {
						start = ch.startAlt[sa].start;
						break;
					}
				}
				if (start && this._eventResolvable(start)) return start;
				return ch.events[0] && ch.events[0].id || null;
			};
			Game.prototype.importSave = function(obj) {
				if (!obj || typeof obj !== "object") return false;
				if (obj.diffKey !== this.diffKey) return false;
				if (obj.scenKey != null && obj.scenKey !== this.d.SCENARIO.id) return false;
				if (typeof obj.chapterIdx !== "number" || !this.d.CHAPTERS[obj.chapterIdx]) return false;
				if (obj.v === 2 && obj.live != null) return this._importLive(obj);
				var s = obj.snapshot;
				this.chapterIdx = obj.chapterIdx;
				if (!this._validStateFields(s)) return false;
				var bt = obj.backtracksThisChapter;
				if (bt == null) bt = 0;
				if (typeof bt !== "number" || !isFinite(bt) || Math.floor(bt) !== bt || bt < 0) return false;
				if (this.diff.backtrack > 0 && bt > this.diff.backtrack) return false;
				var attrs2 = Object.assign({}, s.attrs);
				for (var ak3 in this.d.ATTR_NAMES) if (attrs2[ak3] == null) attrs2[ak3] = this._clampA(ak3, this.d.INIT[ak3] != null ? this.d.INIT[ak3] : 0);
				var evId = s.eventId;
				if (evId != null && !this._eventResolvable(evId)) evId = null;
				var pendId = s.pendingEventId != null && this._eventResolvable(s.pendingEventId) ? s.pendingEventId : null;
				if (evId == null && pendId == null) {
					evId = this._chapterStartFallback();
					if (evId == null) return false;
				}
				this.attrs = attrs2;
				this.dev = s.dev || 0;
				this.flags = Object.assign({}, s.flags || {});
				this._once = this._readOnce(s);
				this.histScore = s.histScore || 0;
				this.merits = (s.merits || []).slice();
				var keepAch = this.ach.slice();
				this.ach = (s.ach || []).slice();
				keepAch.forEach(function(a) {
					if (this.ach.indexOf(a) < 0) this.ach.push(a);
				}, this);
				this.keyChoices = (s.keyChoices || []).slice();
				this.peak = Object.assign({
					quanshi: 0,
					junxin: 0
				}, s.peak || {});
				this.zg = s.zg != null ? s.zg : this.d.HIDDEN && this.d.HIDDEN.init != null ? this.d.HIDDEN.init : 30;
				this.eventId = evId;
				this.pendingEventId = pendId;
				this._crisisPlotPending = !!s.crisisPlotPending;
				this.keyRoundsLeft = s.keyRoundsLeft != null ? s.keyRoundsLeft : this.keyCardRounds;
				this.actionUses = Object.assign({}, s.actionUses || {});
				this.choiceUsed = Object.assign({}, s.choiceUsed || {});
				this.choiceGap = s.choiceGap != null ? s.choiceGap : 1;
				this.passedEvents = Object.assign({}, s.passed || {});
				this._settledOpts = Object.assign({}, s.settled || {});
				this.age = s.age != null ? s.age : this.d.AGE && this.d.AGE.init != null ? this.d.AGE.init : null;
				this.ill = s.ill ? Object.assign({}, s.ill) : null;
				this.introNotes = (s.introNotes || []).slice();
				this.coef = typeof s.coef === "number" && isFinite(s.coef) ? s.coef : 1;
				this.offer = null;
				this.pendingCardId = null;
				this._chapterStartId = pendId || evId || null;
				var rid = s.currentRandomId || null;
				var rev = rid ? this._findInsertEvent(rid) : null;
				if (rid && !rev) {
					this.eventId = this.pendingEventId || this.eventId;
					this.pendingEventId = null;
				}
				this.currentRandom = rev;
				this.backtracksThisChapter = bt;
				this.randomCount = 0;
				this.chapterDeck = this._buildChapterDeck(this.chapterIdx);
				this.chapterDev = [];
				this._corrShown = null;
				this._backlashDone = false;
				this.pendingEndEvents = [];
				this.currentEndEvent = null;
				this.correction = null;
				this._endEventsChecked = false;
				this._newAch = [];
				this._skipRandom = false;
				this.snapshot = this.makeSnapshot();
				this.phase = "intro";
				return true;
			};
			Game.prototype._importLive = function(obj) {
				var live = obj.live;
				this.chapterIdx = obj.chapterIdx;
				if (!this._validStateFields(live)) return false;
				var snap = obj.snapshot;
				if (snap != null && !this._validStateFields(snap)) return false;
				var bt = obj.backtracksThisChapter;
				if (bt == null) bt = 0;
				if (typeof bt !== "number" || !isFinite(bt) || Math.floor(bt) !== bt || bt < 0) return false;
				if (this.diff.backtrack > 0 && bt > this.diff.backtrack) return false;
				if (!{
					intro: 1,
					round: 1,
					event: 1,
					choice: 1,
					settle: 1,
					summary: 1,
					correction: 1,
					endEvent: 1
				}[live.phase]) return false;
				var self = this;
				var actionOk = function(id) {
					return id === "__cure__" || !!self._actions[id];
				};
				var offer = null;
				if (live.offer != null) {
					if (!Array.isArray(live.offer)) return false;
					offer = [];
					for (var oi = 0; oi < live.offer.length; oi++) {
						var oe = live.offer[oi];
						if (!oe || typeof oe !== "object") return false;
						if (oe.type === "key") offer.push({ type: "key" });
						else if (oe.type === "action" && typeof oe.id === "string" && actionOk(oe.id)) offer.push({
							type: "action",
							id: oe.id
						});
						else return false;
					}
				}
				if (live.phase === "round" && !offer) return false;
				if (live.phase === "choice" && (!offer || typeof live.pendingCardId !== "string" || !actionOk(live.pendingCardId))) return false;
				if (live.phase === "summary" && (!live.summaryView || typeof live.summaryView !== "object" || Array.isArray(live.summaryView))) return false;
				if (live.phase === "correction" && (!live.correction || typeof live.correction !== "object" || Array.isArray(live.correction))) return false;
				if (live.phase === "endEvent" && (!live.currentEndEvent || typeof live.currentEndEvent !== "object" || Array.isArray(live.currentEndEvent))) return false;
				var evId = live.eventId;
				if (evId != null && !this._eventResolvable(evId)) evId = null;
				var pendId = live.pendingEventId != null && this._eventResolvable(live.pendingEventId) ? live.pendingEventId : null;
				if (evId == null && pendId == null) {
					evId = this._chapterStartFallback();
					if (evId == null) return false;
				}
				var attrs2 = Object.assign({}, live.attrs);
				for (var ak3 in this.d.ATTR_NAMES) if (attrs2[ak3] == null) attrs2[ak3] = this._clampA(ak3, this.d.INIT[ak3] != null ? this.d.INIT[ak3] : 0);
				this.attrs = attrs2;
				this.dev = live.dev || 0;
				this.flags = Object.assign({}, live.flags || {});
				this._once = this._readOnce(live);
				this.histScore = live.histScore || 0;
				this.merits = (live.merits || []).slice();
				var keepAch = this.ach.slice();
				this.ach = (live.ach || []).slice();
				keepAch.forEach(function(a) {
					if (this.ach.indexOf(a) < 0) this.ach.push(a);
				}, this);
				this.keyChoices = (live.keyChoices || []).slice();
				this.peak = Object.assign({
					quanshi: 0,
					junxin: 0
				}, live.peak || {});
				this.zg = live.zg != null ? live.zg : this.d.HIDDEN && this.d.HIDDEN.init != null ? this.d.HIDDEN.init : 30;
				this.eventId = evId;
				this.pendingEventId = pendId;
				this._crisisPlotPending = !!live.crisisPlotPending;
				this.keyRoundsLeft = live.keyRoundsLeft != null ? live.keyRoundsLeft : this.keyCardRounds;
				this.actionUses = Object.assign({}, live.actionUses || {});
				this.choiceUsed = Object.assign({}, live.choiceUsed || {});
				this.choiceGap = live.choiceGap != null ? live.choiceGap : 1;
				this.passedEvents = Object.assign({}, live.passed || {});
				this._settledOpts = Object.assign({}, live.settled || {});
				this.age = live.age != null ? live.age : this.d.AGE && this.d.AGE.init != null ? this.d.AGE.init : null;
				this.ill = live.ill ? Object.assign({}, live.ill) : null;
				this.introNotes = (live.introNotes || []).slice();
				this.coef = typeof live.coef === "number" && isFinite(live.coef) ? live.coef : 1;
				this.offer = offer;
				this.pendingCardId = live.phase === "choice" ? live.pendingCardId : null;
				this._chapterStartId = typeof live.chapterStartId === "string" ? live.chapterStartId : pendId || evId || null;
				var rid = live.currentRandomId || null;
				var rev = rid ? this._findInsertEvent(rid) : null;
				if (rid && !rev) {
					this.eventId = this.pendingEventId || this.eventId;
					this.pendingEventId = null;
				}
				this.currentRandom = rev;
				this.backtracksThisChapter = bt;
				this.randomCount = typeof live.randomCount === "number" && isFinite(live.randomCount) && live.randomCount >= 0 ? Math.floor(live.randomCount) : 0;
				var fullDeck = this._buildChapterDeck(this.chapterIdx);
				if (Array.isArray(live.chapterDeckIds)) {
					var deck = [];
					live.chapterDeckIds.forEach(function(id) {
						for (var di = 0; di < fullDeck.length; di++) if (fullDeck[di].id === id && deck.indexOf(fullDeck[di]) < 0) {
							deck.push(fullDeck[di]);
							break;
						}
					});
					this.chapterDeck = deck;
				} else this.chapterDeck = fullDeck;
				this._skipRandom = !!live.skipRandom;
				this.chapterDev = Array.isArray(live.chapterDev) ? JSON.parse(JSON.stringify(live.chapterDev)) : [];
				this._corrShown = typeof live.corrShown === "string" ? live.corrShown : null;
				this._backlashDone = !!live.backlashDone;
				this._weijiClamp = typeof live.weijiClamp === "number" && isFinite(live.weijiClamp) ? live.weijiClamp : 0;
				this._endEventsChecked = !!live.endEventsChecked;
				this._newAch = [];
				this.xushi = !!live.xushi;
				this._burned = live.burned && typeof live.burned === "object" && !Array.isArray(live.burned) ? Object.assign({}, live.burned) : {};
				this._next = live.next && typeof live.next === "object" ? JSON.parse(JSON.stringify(live.next)) : null;
				this.pendingEndEvents = Array.isArray(live.pendingEndEvents) ? JSON.parse(JSON.stringify(live.pendingEndEvents)) : [];
				this.currentEndEvent = live.currentEndEvent && typeof live.currentEndEvent === "object" ? JSON.parse(JSON.stringify(live.currentEndEvent)) : null;
				this.correction = live.correction && typeof live.correction === "object" ? JSON.parse(JSON.stringify(live.correction)) : null;
				this.summaryView = live.summaryView && typeof live.summaryView === "object" ? JSON.parse(JSON.stringify(live.summaryView)) : null;
				this.ending = null;
				var rs = live.rng;
				if (rs && typeof rs === "object") {
					if (typeof rs.main === "number" && isFinite(rs.main) && this.rng && typeof this.rng._setState === "function") this.rng._setState(rs.main);
					if (rs.streams && typeof rs.streams === "object") for (var nm in rs.streams) {
						var sv2 = rs.streams[nm];
						if (typeof sv2 !== "number" || !isFinite(sv2)) continue;
						var f = makeStateRng(0);
						f._setState(sv2);
						this._rngStreams[nm] = f;
					}
				}
				if (snap) {
					var snapRestore = JSON.parse(JSON.stringify(snap));
					for (var ak4 in this.d.ATTR_NAMES) if (snapRestore.attrs[ak4] == null) snapRestore.attrs[ak4] = this._clampA(ak4, this.d.INIT[ak4] != null ? this.d.INIT[ak4] : 0);
					if (snapRestore.eventId != null && !this._eventResolvable(snapRestore.eventId)) snapRestore.eventId = evId;
					if (snapRestore.pendingEventId != null && !this._eventResolvable(snapRestore.pendingEventId)) snapRestore.pendingEventId = null;
					var srid = snapRestore.currentRandomId || null;
					snapRestore.currentRandom = srid ? this._findInsertEvent(srid) : null;
					delete snapRestore.currentRandomId;
					this.snapshot = snapRestore;
				} else this.snapshot = this.makeSnapshot();
				this.phase = live.phase;
				return true;
			};
			Game.prototype.finishEnding = function(id, variant) {
				this._newAch = [];
				var def0 = this.d.ENDINGS[id];
				var achIds = (def0 && def0.ach || []).slice();
				if (def0 && def0.variantAch && variant && def0.variantAch[variant]) achIds = achIds.concat(def0.variantAch[variant]);
				if (def0 && def0.nitian && this.d.ACHIEVEMENTS && this.d.ACHIEVEMENTS.nitian) achIds.push("nitian");
				var selfAch = this;
				achIds.forEach(function(a) {
					selfAch.unlockAch(a);
				});
				this.ending = this.buildEnding(id, variant);
				var self = this;
				this.ending.achNew = (this._newAch || []).map(function(a) {
					return self.d.ACHIEVEMENTS[a];
				}).filter(Boolean).join("、") || null;
				this.phase = "ending";
			};
			Game.prototype.buildEnding = function(id, variant) {
				var self = this;
				var def = this.d.ENDINGS[id];
				if (!def) {
					def = this.d.ENDINGS.E8 || {
						id,
						name: "终局",
						zhuan: "史笔至此中断。",
						cuncun: 0,
						seal: "xunshi",
						epilogue: ""
					};
					id = "E8";
					variant = null;
				}
				var v = variant && def.variants ? def.variants[variant] : null;
				var meritScore = 0;
				var meritMap = this.d.MERIT_MAP || {
					"长史": 5,
					"廷尉": 8,
					"丞相": 20,
					"郡县": 15,
					"书同文": 15
				};
				this.merits.forEach(function(m) {
					meritScore += meritMap[m] || 0;
				});
				var gongye = clamp((this.peak.quanshi || 0) * .45 + (this.attrs.zhengji || 0) * .15 + meritScore);
				var cuncun = def.cuncun || 0;
				var shipBonus = 0;
				(this.d.SHIPING_BONUS_FLAGS || []).forEach(function(sb) {
					if (self.flags[sb.flag]) shipBonus += sb.bonus;
				});
				var shiping = clamp(50 + this.histScore * .5 + shipBonus);
				if (def.seal === "循史") shiping = Math.max(shiping, 35);
				var yingxiang = clamp(this.dev * .6 + gongye * .4);
				var total = (.3 * gongye + .3 * cuncun + .2 * shiping + .2 * yingxiang) * this.diff.coef * (def.nitian ? 1.15 : 1) * (this.coef || 1);
				total = Math.round(total);
				if (!isFinite(total)) total = 0;
				var grade = total >= 95 ? "甲上" : total >= 90 ? "甲" : total >= 85 ? "甲下" : total >= 80 ? "乙上" : total >= 70 ? "乙" : total >= 60 ? "乙下" : total >= 50 ? "丙上" : total >= 40 ? "丙" : total >= 30 ? "丙下" : "丁";
				var devC = this.dev;
				var epilogue;
				if (devC <= 20) epilogue = "你完整复刻了他的一生，包括他的错误。史书翻到今天，仍写着你的名字与骂名。历史给了你所有提示，你决定照抄一遍——这也是一种玩法。";
				else if (devC <= 45) epilogue = "你在大势之内做了几次小小的挣扎。史书的正文没有变，但字里行间，多了几处只有你知道的批注。";
				else epilogue = "史官的笔追不上你。从某个抉择开始，这就成了一段无人见过的新历史——无论结局如何，它属于你。";
				var zhuan = v ? v.zhuan : def.zhuan;
				if (def.zhuanAppends) def.zhuanAppends.forEach(function(za) {
					if (!za.if || self.check(za.if).ok) zhuan += za.text;
				});
				zhuan = zhuan || def.zhuan || "";
				if ((id === "E4" || id === "E6") && this.flags.zhezhong) zhuan += "史又曰：焚书之议起，斯以官藏代焚，典籍得不绝于灰烟。天下读书人受其赐而不知，斯亦终不自言。";
				return {
					id,
					variant,
					name: v ? v.name : def.name,
					seal: def.seal,
					zhuan,
					nitian: def.nitian,
					aliveNote: (function() {
						var an = def.aliveNote || self.d.ALIVE_NOTE;
						return an && self.flags[an.flag] ? an.text : null;
					})(),
					scores: {
						gongye,
						cuncun,
						shiping,
						yingxiang
					},
					merits: this.merits.slice(),
					dev: this.dev,
					total,
					grade,
					diffName: this.diff.n,
					review: this.keyChoices.slice(),
					epilogue
				};
			};
			Game.prototype.maybeRandom = function() {
				if (this._skipRandom) {
					this._skipRandom = false;
					return null;
				}
				var inPlay = this.phase === "event" || this.phase === "round";
				if (this._crisisPlotPending && inPlay && !this.currentRandom) {
					var ppool = this.d.CRISIS_EVENTS && this.d.CRISIS_EVENTS.plots || [];
					if (ppool.length > 0) {
						this._crisisPlotPending = false;
						var pev = ppool[Math.floor(this._stream("event")() * ppool.length)];
						this.pendingEventId = this.eventId;
						this.eventId = pev.id;
						this.currentRandom = pev;
						this.phase = "event";
						return pev;
					}
				}
				if (!this.randomOn) return null;
				if (!inPlay || this.currentRandom) return null;
				if (!this._backlashDone && this.devBand() >= 3) {
					this._backlashDone = true;
					var bpool = this.d.CORRECTIONS.filter(function(c) {
						return c.minDev >= 71;
					});
					if (bpool.length > 0) {
						var bc = bpool[Math.floor(this._stream("event")() * bpool.length)];
						var bev = {
							id: "BACKLASH",
							title: bc.title,
							segs: bc.segs,
							options: [{
								t: "咬牙撑住",
								res: "你挺过了这一波反噬——代价已经付清，路还要继续走。",
								eff: this.correctionEff(bc),
								to: "RETURN"
							}]
						};
						this.pendingEventId = this.eventId;
						this.eventId = bev.id;
						this.currentRandom = bev;
						this.phase = "event";
						return bev;
					}
				}
				if (this.randomCount >= this.randomMax || this.chapterDeck.length === 0) return null;
				if (this._stream("event")() >= this.randomChance) return null;
				var idx = Math.floor(this._stream("event")() * this.chapterDeck.length);
				var ev = this.chapterDeck.splice(idx, 1)[0];
				if (ev.cond && !this.check(ev.cond).ok) return null;
				this.pendingEventId = this.eventId;
				this.eventId = ev.id;
				this.currentRandom = ev;
				this.randomCount++;
				this.phase = "event";
				return ev;
			};
			Game.prototype.attrWord = function(k) {
				var def = null;
				this.d.ATTRS.forEach(function(a) {
					if (a.k === k) def = a;
				});
				var v = this.attrs[k];
				for (var i = 0; i < def.words.length; i++) if (v >= def.words[i][0]) return def.words[i][1];
				return def.words[def.words.length - 1][1];
			};
			Game.prototype.zgWord = function() {
				var words = this.d.HIDDEN && this.d.HIDDEN.words || [
					[70, "杀机毕露"],
					[50, "图穷匕见"],
					[35, "隐约不安"],
					[0, "敛迹藏锋"]
				];
				for (var i = 0; i < words.length; i++) if (this.zg >= words[i][0]) return words[i][1];
				return words[words.length - 1][1];
			};
			function setCaifuSoftEvent(on) {
				CAIFU_SOFT_EVENT = !!on;
				return CAIFU_SOFT_EVENT;
			}
			return {
				Game,
				KEY_CARD_ROUNDS,
				riskWord,
				setCaifuSoftEvent
			};
		});
	})))(), 1);
	var Run = class {
		diffKey;
		voice;
		sfx;
		game;
		screen = "intro";
		/** 本已经营轮数:只在引擎消耗一轮时 +1(与 H5 advanceRound 同口径) */
		roundNo = 0;
		pending = null;
		/** 章节代际:换章/回溯/重开时 +1,场景据此清空卷轴 */
		revision = 0;
		/** 章末结算视图(读档落在 summary 相位时也用它) */
		summary = null;
		/** 历史修正视图 */
		correction = null;
		/** 一次性提示(选项走不通等),场景画成 toast */
		toast = "";
		constructor(data, diffKey, voice = null, sfx = null) {
			this.diffKey = diffKey;
			this.voice = voice;
			this.sfx = sfx;
			this.game = new import_engine.default.Game(data, diffKey);
		}
		get data() {
			return this.game.d;
		}
		/** 入队一条配音切片(不打断当前句) */
		speak(clip) {
			const s = this.game.d.SCENARIO.id;
			const c = this.game.chapter()?.id;
			if (!s || !c || !this.voice?.enabled) return;
			this.voice.enqueue(s, c, clip);
		}
		/** 掐断当前句并切到结果切片(结算语音) */
		speakReplace(clip) {
			this.voice?.stop();
			if (clip) this.speak(clip);
		}
		/** 进入某相位后该念什么:照抄 H5 各 render 的 speak 口径 */
		voiceForPhase() {
			const g = this.game;
			switch (this.screen) {
				case "intro":
					if (!this.voice?.enabled) break;
					this.voice.stop();
					this.speak("intro");
					break;
				case "event": {
					const ev = g.eventId ? g.findEvent(g.eventId) : null;
					if (!ev) break;
					if (g.currentRandom) {
						if (g.eventId?.startsWith("C-")) this.speak(`crisis_${g.eventId}`);
					} else if (!this.altActive(ev)) this.speak(ev.id);
					break;
				}
				case "choice": {
					const v = g.getChoiceCard();
					if (v) this.speak(`choice_${v.id}`);
					break;
				}
				case "ending": {
					const e = g.ending;
					if (e) this.speak(`ending_${e.id}${e.variant ? `_${e.variant}` : ""}`);
					break;
				}
			}
		}
		setScreen(s) {
			this.screen = s;
			this.pending = null;
			this.voiceForPhase();
		}
		/** 开局:引擎进章首,场景从卷轴第一屏起稿 */
		start() {
			this.game.start();
			this.roundNo = 0;
			this.revision += 1;
			this.setScreen("intro");
		}
		/**
		* 读档:把存档 payload 导回引擎,再按引擎相位落到对应屏幕。
		* 存的是「存档那一刻」而不是章首(engine exportSave/importSave 的轮次语义),
		* 所以这里不能走 start(),否则玩家会从本章开头重来。
		*/
		resume(payload, roundNo = 0) {
			if (!this.game.importSave(payload)) return false;
			this.roundNo = roundNo;
			this.revision += 1;
			this.pending = null;
			this.summary = this.game.summaryView;
			this.correction = this.game.correction;
			this.toast = "";
			switch (this.game.phase) {
				case "round":
					this.route({ type: "round" });
					break;
				case "event":
					this.setScreen("event");
					break;
				case "choice":
					this.setScreen("choice");
					break;
				case "endEvent":
					this.setScreen("endEvent");
					break;
				case "summary":
					this.setScreen("summary");
					break;
				case "correction":
					this.setScreen("correction");
					break;
				case "ending":
					this.setScreen("ending");
					break;
				default: this.setScreen("intro");
			}
			return true;
		}
		/**
		* 相位路由(与 H5 Session.route 同构)。
		* 所有 advance 型引擎方法的返回值都从这里进入。
		*/
		route(n) {
			this.voice?.stop();
			if (!n || n.type === "none") {
				if (this.game.ending) {
					this.setScreen("ending");
					return;
				}
				this.setScreen("finished");
				return;
			}
			switch (n.type) {
				case "round":
					if (this.game.maybeRandom()) this.setScreen("event");
					else this.setScreen("round");
					break;
				case "event":
					this.setScreen("event");
					break;
				case "ending":
					this.setScreen("ending");
					break;
				case "chapter":
					this.roundNo = 0;
					this.revision += 1;
					this.setScreen("intro");
					break;
				case "summary":
					this.summary = n.summary;
					this.setScreen("summary");
					this.sfx?.play("chapter");
					break;
				case "endEvent":
					this.setScreen("endEvent");
					break;
				case "correction":
					this.correction = n.correction;
					this.setScreen("correction");
					break;
				default: this.setScreen("round");
			}
		}
		beginEvents() {
			this.sfx?.play("enter");
			this.route(this.game.beginEvents());
		}
		/** 打一张行动/关键/抉择牌(下标是 getOffer 的下标) */
		playCard(i) {
			const name = this.game.getOffer()[i]?.action?.name ?? "行动";
			const r = this.game.playCard(i);
			if (!r) {
				this.thaw("这张牌眼下走不通（门槛已变或状态不同步）。");
				return;
			}
			this.sfx?.play("card");
			if (r.kind === "key") {
				if (r.chapterEnd) this.route(this.game.proceed());
				else this.setScreen("event");
				return;
			}
			if (r.kind === "choice") {
				this.setScreen("choice");
				return;
			}
			this.roundNo += 1;
			this.showResult(r, `经营 · 第 ${this.roundNo} 轮——${name}`, () => this.routeAfterCard(r), true);
		}
		/** 蓄势 */
		playXushi() {
			const r = this.game.playXushi();
			if (!r) {
				this.thaw("蓄势只在一个关键事件内生效一次。");
				return;
			}
			this.sfx?.play("card");
			this.roundNo += 1;
			this.showResult(r, `经营 · 第 ${this.roundNo} 轮——蓄势 · 静观其变`, () => this.routeAfterCard(r), true);
		}
		/** 事件选项(关键事件/际遇同口径) */
		choose(i) {
			const r = this.game.choose(i);
			if (!r) {
				this.thaw("这个选项眼下走不通（已试过或条件已变）。");
				return;
			}
			this.speakReplace(this.game.eventId?.startsWith("C-") && !r.forcedEnding ? `crisis_${this.game.eventId}_o${i + 1}` : null);
			const after = r.failed && !r.forcedEnding ? () => this.route(this.game.abandonEvent()) : () => this.route(this.game.proceed());
			const warn = [r.risk ? this.game.riskTitle(r) : "", r.bandUp && r.bandName ? `史书提示：偏离度已入「${r.bandName}」` : ""].filter(Boolean).join(" ｜ ");
			this.showResult(r, "", after, false, warn);
		}
		/** 抉择卡落定 */
		chooseCardOption(i) {
			const cardId = this.game.getChoiceCard()?.id ?? "";
			const r = this.game.chooseCardOption(i);
			if (!r) {
				this.thaw("这一抉择眼下走不通（状态已变）。");
				return;
			}
			if (!r.forcedEnding) this.roundNo += 1;
			this.speakReplace(cardId ? `choice_${cardId}_o${i + 1}` : null);
			this.showResult(r, "", () => this.routeAfterCard(r), false);
		}
		/** 且搁置:引擎退出 choice 相位,回回合重发牌 */
		cancelChoice() {
			if (this.game.cancelChoice()) this.setScreen("round");
			else this.thaw("这一抉择此刻不能搁置。");
		}
		/** 章末事件选项 */
		endEventChoose(i) {
			const r = this.game.endEventChoose(i);
			if (!r) {
				this.thaw("这个选项眼下走不通（条件已变）。");
				return;
			}
			this.showResult(r, "", () => this.route(this.game.proceedAfterEndEvent()), false);
		}
		showResult(r, title, after, auto, warn = "") {
			this.pending = {
				r,
				title,
				warn,
				after,
				auto
			};
		}
		/** 结果看完了:执行挂起的推进 */
		advance() {
			const p = this.pending;
			if (!p) return;
			this.pending = null;
			this.sfx?.play("enter");
			p.after();
		}
		/** 牌落定后的相位:强制结局 > 强制关键事件 > 引擎给的去向(默认回回合) */
		routeAfterCard(r) {
			if (r.forcedEnding) this.route(this.game.proceed());
			else if (r.forcedKey) this.setScreen("event");
			else this.route(r.route ?? { type: "round" });
		}
		proceedSummary() {
			this.sfx?.play("enter");
			this.route(this.game.proceedSummary());
		}
		proceedAfterEndEvent() {
			this.route(this.game.proceedAfterEndEvent());
		}
		correctionContinue() {
			this.route(this.game.correctionContinue());
		}
		/** 回溯:回到本章开头(能否回溯只问引擎) */
		backtrack() {
			if (!this.game.canBacktrack()) return;
			if (!this.game.backtrack()) return;
			this.roundNo = 0;
			this.revision += 1;
			this.setScreen("intro");
		}
		/** 该事件的异变文案是否生效 */
		altActive(ev) {
			return !!(ev.altSegs && this.game.flags[ev.altSegs.flag]);
		}
		/** 事件正文:异变生效时用变体(H5 eventSegs 同口径) */
		eventSegs(ev) {
			return this.altActive(ev) ? ev.altSegs.segs : ev.segs ?? [];
		}
		/** 选项门槛(无条件时引擎直接返回 true) */
		reqCheck(req) {
			if (!req) return {
				ok: true,
				reason: null
			};
			const r = this.game.check(req);
			return r === true ? {
				ok: true,
				reason: null
			} : r;
		}
		/** 财富见底锁:扣财选项不可执行 */
		brokeFor(opt) {
			return this.game.attrs.caifu <= 0 && (opt.eff?.attrs?.caifu ?? 0) < 0;
		}
		/** 险招提示文案(硬核隐藏具体数值) */
		riskText(risky) {
			const eff = Math.min(70, risky.rate + (this.game.xushi ? 10 : 0));
			const gaps = risky.unmet.map((u) => this.game.diff.hideAttrs ? `${u.name}不足` : `${u.name} ${u.have}/${u.need}`).join("、");
			return `⚠ 险招 · ${this.game.diff.hideAttrs ? "成算" : "成功率"} ${eff}%（${gaps}）`;
		}
		/** 走不通的统一兜底:按引擎相位把界面摆回去(不留静默锁死) */
		thaw(msg) {
			this.toast = msg;
			this.sfx?.play("fail");
			const g = this.game;
			switch (g.phase) {
				case "round":
					this.setScreen("round");
					break;
				case "event":
					if (g.getOptions().some((o) => o && !o.locked)) this.setScreen("event");
					else this.route(g.abandonEvent());
					break;
				case "choice": this.setScreen("choice");
			}
		}
	};
	//#endregion
	//#region src/game/app.ts
	var App = class {
		d;
		cur = null;
		/** 当前对局的剧本键(结局落地时用来清自动档) */
		curKey = null;
		constructor(d) {
			this.d = d;
			this.toHome();
			this.d.plat.onHide?.(() => this.stashOnHide());
		}
		draw() {
			this.cur?.draw();
		}
		pointerDown(x, y, id) {
			this.cur?.pointerDown(x, y, id);
		}
		pointerMove(x, y, id) {
			this.cur?.pointerMove(x, y, id);
		}
		pointerUp(x, y, id) {
			this.cur?.pointerUp(x, y, id);
		}
		debug() {
			return this.cur?.debug?.() ?? {
				screen: "none",
				hits: []
			};
		}
		/** 外部改了引擎状态(冒烟/调试)后手动同步一次视图 */
		refresh() {
			this.cur?.refresh?.();
		}
		/** 当前对局的 Run(菜单页为 null):冒烟脚本与调试口读它 */
		get currentRun() {
			return this.cur instanceof PlayScene ? this.cur.run : null;
		}
		swap(s) {
			this.cur?.dispose?.();
			this.cur = s;
		}
		toHome() {
			this.d.bgm.idle();
			this.curKey = null;
			this.swap(new HomeScene(this.d.plat, this.d.assets, this.d.fontFamily, this.d.saves, this.d.sfx, {
				onStart: () => this.toSelect(),
				onContinue: (slot) => this.play(slot.scenKey, slot.diffKey, slot),
				onSaves: () => this.toSaves(),
				onSettings: () => this.toSettings()
			}));
		}
		toSelect() {
			this.swap(new SelectScene(this.d.plat, this.d.assets, this.d.fontFamily, this.d.sfx, {
				onEnter: (key, diff) => this.play(key, diff),
				onBack: () => this.toHome()
			}));
		}
		toSaves() {
			this.swap(new SavesScene(this.d.plat, this.d.assets, this.d.fontFamily, this.d.saves, this.d.sfx, {
				onLoad: (slot, key) => this.play(key, slot.diffKey, slot),
				onBack: () => this.toHome()
			}));
		}
		toSettings() {
			this.swap(new SettingsScene(this.d.plat, this.d.assets, this.d.fontFamily, this.d.settings, this.d.sfx, { onBack: () => this.toHome() }));
		}
		play(key, diff, slot) {
			const data = scenarioData(key);
			if (!data) {
				console.error(`[qingshi] 找不到剧本数据:${key}`);
				return;
			}
			const run = new Run(data, diff, this.d.voice, this.d.sfx);
			if (slot) {
				if (!run.resume(slot.payload, slot.roundNo ?? 0)) run.start();
			} else run.start();
			this.d.bgm.play(data.SCENARIO.id);
			this.curKey = key;
			this.swap(new PlayScene(this.d.plat, this.d.assets, run, this.d.fontFamily, {
				settings: this.d.settings,
				onFinish: () => this.finishRun(),
				onMenu: () => this.leaveRun()
			}));
		}
		/** 顶栏「菜单」:够存档门槛就先落一条自动档,再回主菜单 */
		leaveRun() {
			const p = this.cur instanceof PlayScene ? this.cur : null;
			if (p) {
				const run = p.run;
				if (run.roundNo >= 5) {
					const id = run.game.d.SCENARIO.id;
					const name = run.game.d.SCENARIO.name;
					const r = this.d.saves.saveAuto(run.game, id, name, { roundNo: run.roundNo });
					if (!r.ok && r.full) this.d.saves.saveAuto(run.game, id, name, {
						roundNo: run.roundNo,
						overwriteOldest: true
					});
				}
			}
			this.toHome();
		}
		/** 结局落地:本局自动档不再复活 */
		finishRun() {
			if (this.curKey) this.d.saves.clearAutos(this.curKey);
			this.toHome();
		}
		/** 切后台:不够存档门槛也留一份暂存,防手滑丢进度 */
		stashOnHide() {
			const p = this.cur instanceof PlayScene ? this.cur : null;
			if (!p) return;
			const run = p.run;
			if (run.screen === "ending" || run.screen === "finished") return;
			if (run.roundNo < 5) return;
			const id = run.game.d.SCENARIO.id;
			this.d.saves.stashSave(run.game, id, run.game.d.SCENARIO.name, run.roundNo);
		}
	};
	const BGM_DIR = `assets/bgm`;
	function bgmPath(key, variant) {
		return key === "idle" ? `${BGM_DIR}/idle.webm` : `${BGM_DIR}/${key}-${variant}.webm`;
	}
	var Bgm = class {
		plat;
		handle = null;
		/** 当前音源路径;空串表示没有在播的曲目 */
		currentPath = "";
		currentKey = "";
		currentVariant = "inst";
		/** 非空表示正在剧本双轨轮播中 */
		rotateKey = null;
		wanted = true;
		/** 音量由设置项驱动(musicGain,默认 0.06),这里只是设置加载前的兜底 */
		volume = .06;
		/** 缺失/出错的音源:不再反复重试,换曲时仍会给新路径机会 */
		missing = /* @__PURE__ */ new Set();
		pausedByHidden = false;
		unlockArmed = false;
		constructor(plat) {
			this.plat = plat;
			this.bindVisibility();
			this.armUnlock();
		}
		get enabled() {
			return this.wanted;
		}
		/** 当前曲目标签(调试用):`<key>#<variant>` */
		get current() {
			return this.currentKey ? `${this.currentKey}#${this.currentVariant}` : "";
		}
		setEnabled(on) {
			this.wanted = on;
			if (!on) {
				this.handle?.pause();
				return;
			}
			if (!this.currentPath) {
				this.idle();
				return;
			}
			this.start(this.currentPath, this.rotateKey === null);
		}
		/**
		* 切到某本剧本的音乐:inst / vocal 双轨轮播,先播无人声。
		* vocal 缺失时(播放报错)退化为 inst 单曲循环。
		*/
		play(key) {
			if (!this.wanted) return;
			const path = bgmPath(key, "inst");
			if (`${key}#inst` === this.current && this.currentPath === path) return;
			if (this.missing.has(path)) return;
			this.currentKey = key;
			this.currentVariant = "inst";
			this.currentPath = path;
			this.rotateKey = this.missing.has(bgmPath(key, "vocal")) ? null : key;
			this.start(path, this.rotateKey === null);
		}
		/** 菜单/选择页:idle 单曲循环 */
		idle() {
			if (!this.wanted) return;
			const path = bgmPath("idle", "inst");
			if (this.currentPath === path && this.currentKey === "idle") return;
			if (this.missing.has(path)) return;
			this.currentKey = "idle";
			this.currentVariant = "inst";
			this.currentPath = path;
			this.rotateKey = null;
			this.start(path, true);
		}
		stop() {
			this.handle?.stop();
			this.currentPath = "";
			this.currentKey = "";
			this.rotateKey = null;
			this.pausedByHidden = false;
		}
		/** 设置页改档位时走这里 */
		setVolume(v) {
			this.volume = Math.max(0, Math.min(1, v));
			this.handle?.setVolume(this.volume);
		}
		ensure() {
			if (this.handle) return this.handle;
			const h = this.plat.audio(bgmPath("idle", "inst"), { volume: this.volume });
			h.onEnded(() => this.onEnded());
			h.onError((msg) => this.onError(msg));
			this.handle = h;
			return h;
		}
		start(path, loop) {
			const h = this.ensure();
			h.setLoop(loop);
			h.setSrc(path);
			h.setVolume(this.volume);
			h.play();
		}
		/** inst 播完 → vocal,vocal 播完 → inst,如此轮播 */
		onEnded() {
			const key = this.rotateKey;
			if (!key || !this.wanted) return;
			const next = this.currentVariant === "vocal" ? "inst" : "vocal";
			const path = bgmPath(key, next);
			if (this.missing.has(path)) {
				this.rotateKey = null;
				this.start(bgmPath(key, this.currentVariant), true);
				return;
			}
			this.currentVariant = next;
			this.currentPath = path;
			this.start(path, false);
		}
		/**
		* 音源出错(缺失/解码失败):记住这条路径,别让整局静音。
		* vocal 出错 → 退化为 inst 循环;inst 出错 → 放弃音乐(游戏照常)。
		*/
		onError(msg) {
			const failed = this.currentPath;
			if (!failed) return;
			this.missing.add(failed);
			if (this.currentVariant === "vocal" && this.currentKey) {
				this.rotateKey = null;
				this.start(bgmPath(this.currentKey, "inst"), true);
				return;
			}
			if (this.plat.kind === "web") console.warn("[qingshi] BGM 播放失败", failed, msg);
			this.currentPath = "";
			this.currentKey = "";
			this.rotateKey = null;
		}
		/** 自动播放策略兜底:第一次 pointerdown 补播当前曲 */
		armUnlock() {
			if (this.unlockArmed) return;
			this.unlockArmed = true;
			this.plat.onPointer({
				down: () => {
					if (this.wanted && this.handle && this.currentPath) this.handle.resume();
				},
				move: () => {},
				up: () => {}
			});
		}
		/** 切后台暂停,回前台续播;主动 stop 的不自动续 */
		bindVisibility() {
			this.plat.onHide(() => {
				if (!this.handle || !this.currentPath) return;
				this.pausedByHidden = true;
				this.handle.pause();
			});
			this.plat.onShow(() => {
				if (!this.pausedByHidden) return;
				this.pausedByHidden = false;
				if (this.wanted && this.currentPath) this.handle?.resume();
			});
		}
	};
	//#endregion
	//#region src/game/voice.ts
	const VOICE_BASE = "assets/voice";
	/** 一条切片在本章与 _shared 两处的候选路径(按顺序试) */
	function clipCandidates(scenario, chapter, clip) {
		return [`${VOICE_BASE}/${scenario}/${chapter}/${clip}.webm`, `${VOICE_BASE}/${scenario}/_shared/${clip}.webm`];
	}
	var Voice = class {
		plat;
		/** 预取队列(缓冲窗口内攒的活)。串行,不并发。 */
		queue = [];
		handle = null;
		playing = false;
		wanted = true;
		/** 音量由设置项驱动(voiceGain,默认 1.0) */
		volume = 1;
		/** 当前这句的收尾回调;stop() 主动调它,好让 pump 的循环能退出 */
		settle = null;
		/** 当前这句的换源重试(本章没有 → _shared) */
		retry = null;
		/** 当前句的代际号:陈旧事件不许碰当前句状态 */
		token = 0;
		pausedByHidden = false;
		hidden = false;
		unlockArmed = false;
		constructor(plat) {
			this.plat = plat;
			this.bindVisibility();
			this.armUnlock();
		}
		get enabled() {
			return this.wanted;
		}
		setEnabled(on) {
			this.wanted = on;
			if (!on) this.stop();
		}
		setVolume(v) {
			this.volume = Math.max(0, Math.min(1, v));
			this.handle?.setVolume(this.volume);
		}
		/**
		* 排队一条配音。传 follow 数组时按顺序排在后面(章 intro、事件各段就是这种)。
		*/
		enqueue(scenario, chapter, clip, follow = []) {
			if (!this.wanted) return;
			this.queue.push({ cands: clipCandidates(scenario, chapter, clip) });
			for (const f of follow) this.queue.push({ cands: clipCandidates(scenario, chapter, f) });
			this.pump();
		}
		/** 立刻掐断当前这句,并清空未播的。不该让上一章的语音继续响下去。 */
		stop() {
			this.queue.length = 0;
			this.pausedByHidden = false;
			this.settle?.();
			this.token += 1;
			this.handle?.stop();
		}
		/**
		* 串行取队列。一条放完再放下一条 —— 这同时也是预取顺序的保证。
		* 若已在 pump 中,直接返回:正在跑的循环每轮都会重查队列。
		*/
		async pump() {
			if (this.playing) return;
			this.playing = true;
			try {
				while (this.queue.length) {
					await this.waitVisible();
					if (!this.queue.length) break;
					const item = this.queue.shift();
					if (!item) break;
					await this.playOne(item.cands);
					if (this.queue.length) await this.wait(260);
				}
			} finally {
				this.playing = false;
			}
		}
		async waitVisible() {
			while (this.hidden) await this.wait(200);
		}
		playOne(cands) {
			return new Promise((resolve) => {
				const h = this.ensure(cands[0] ?? `assets/voice/_shared/empty.webm`);
				const token = ++this.token;
				let settled = false;
				let i = 0;
				const done = () => {
					if (settled) return;
					settled = true;
					if (token === this.token) {
						this.settle = null;
						this.retry = null;
					}
					resolve();
				};
				this.settle = done;
				const attempt = () => {
					if (settled || token !== this.token) return;
					const path = cands[i];
					if (!path) {
						done();
						return;
					}
					i += 1;
					this.retry = attempt;
					h.setSrc(path);
					h.setVolume(this.volume);
					h.play();
				};
				attempt();
			});
		}
		ensure(firstPath) {
			if (this.handle) return this.handle;
			const h = this.plat.audio(firstPath, { volume: this.volume });
			h.onEnded(() => {
				this.settle?.();
			});
			h.onError(() => {
				const retry = this.retry;
				if (retry) retry();
				else this.settle?.();
			});
			this.handle = h;
			return h;
		}
		wait(ms) {
			return new Promise((r) => setTimeout(r, ms));
		}
		/** 自动播放被拒时的第一次手势补播 */
		armUnlock() {
			if (this.unlockArmed) return;
			this.unlockArmed = true;
			this.plat.onPointer({
				down: () => {
					if (this.wanted && this.settle) this.handle?.resume();
				},
				move: () => {},
				up: () => {}
			});
		}
		/**
		* 页面不可见时暂停当前这句,回前台续播。
		* 续播被拒也不能卡死 pump —— 由 error/ended 事件结算。
		*/
		bindVisibility() {
			this.plat.onHide(() => {
				this.hidden = true;
				if (this.handle && this.settle) {
					this.pausedByHidden = true;
					this.handle.pause();
				}
			});
			this.plat.onShow(() => {
				this.hidden = false;
				if (!this.pausedByHidden) return;
				this.pausedByHidden = false;
				if (this.wanted && this.settle) this.handle?.resume();
			});
		}
	};
	//#endregion
	//#region src/game/sfx.ts
	const SFX_DIR = "assets/sfx";
	/** 单个音的并发上限:连点超过这个数就轮回复用最老的那个(从头重播) */
	const POOL_MAX = 3;
	var Sfx = class {
		plat;
		pools = /* @__PURE__ */ new Map();
		wanted = true;
		/** 音量由设置页滑杆驱动(sfxGain,默认 0.5) */
		volume = .5;
		constructor(plat) {
			this.plat = plat;
		}
		get enabled() {
			return this.wanted;
		}
		setEnabled(on) {
			this.wanted = on;
			if (!on) this.stopAll();
		}
		setVolume(v) {
			this.volume = Math.max(0, Math.min(1, v));
		}
		/** 播一条。素材缺失/被策略拒绝都静默。 */
		play(name) {
			if (!this.wanted) return;
			const h = this.take(name);
			h.setVolume(this.volume);
			h.replay();
		}
		stopAll() {
			for (const pool of this.pools.values()) for (const h of pool.handles) h.stop();
		}
		take(name) {
			let pool = this.pools.get(name);
			if (!pool) {
				pool = {
					handles: [],
					idx: 0
				};
				this.pools.set(name, pool);
			}
			if (pool.handles.length < POOL_MAX) {
				const h = this.plat.audio(`${SFX_DIR}/${name}.webm`, { volume: this.volume });
				h.onError((msg) => this.drop(pool, h, msg));
				pool.handles.push(h);
				return h;
			}
			const h = pool.handles[pool.idx % pool.handles.length] ?? pool.handles[0];
			pool.idx = (pool.idx + 1) % pool.handles.length;
			return h;
		}
		/** 加载失败的元素会永远哑掉,从池里摘掉,下次重建 */
		drop(pool, h, msg) {
			const i = pool.handles.indexOf(h);
			if (i < 0) return;
			pool.handles.splice(i, 1);
			if (this.plat.kind === "web") console.warn("[qingshi] 音效播放失败", msg);
			h.destroy();
		}
	};
	//#endregion
	//#region src/main.ts
	/**
	* 小米小游戏移植线入口。
	*
	* 与 h5/ 的区别只有一处:这里没有 DOM,所有界面在 canvas 2D 上重画。
	* 剧本数据、素材、规则引擎仍然指向同一份真源,不复制。
	*/
	const raf = (cb) => {
		if (typeof requestAnimationFrame !== "undefined") requestAnimationFrame(() => cb());
		else setTimeout(cb, 16);
	};
	function bootError(plat, err) {
		const text = String(err?.message ?? err);
		console.error("[qingshi] boot failed", text);
		const { ctx, dpr, screenW, screenH } = plat;
		ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
		ctx.fillStyle = COLOR.app;
		ctx.fillRect(0, 0, screenW, screenH);
		ctx.fillStyle = COLOR.zhu;
		ctx.font = `${Math.round(screenH / 18)}px serif`;
		ctx.textAlign = "center";
		ctx.fillText("启动失败", screenW / 2, screenH / 2 - 20);
		ctx.fillStyle = COLOR.ink;
		ctx.font = `${Math.round(screenH / 34)}px serif`;
		ctx.fillText(text.slice(0, 60), screenW / 2, screenH / 2 + 20);
		ctx.textAlign = "left";
	}
	async function main() {
		const plat = createPlatform();
		console.log(`[qingshi] start kind=${plat.kind} screen=${plat.screenW}x${plat.screenH} dpr=${plat.dpr}`);
		const paintLoading = () => {
			const { ctx, dpr, screenW, screenH } = plat;
			ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
			ctx.fillStyle = COLOR.app;
			ctx.fillRect(0, 0, screenW, screenH);
			ctx.fillStyle = COLOR.inkDim;
			ctx.font = `${Math.round(screenH / 26)}px serif`;
			ctx.textAlign = "center";
			ctx.fillText(`青史志 · 正在载入 ${APP_VERSION}`, screenW / 2, screenH / 2 - 10);
			ctx.textAlign = "left";
		};
		paintLoading();
		try {
			const fontFamily = await plat.loadFont(FONT.family, FONT.path);
			console.log(`[qingshi] font=${fontFamily}`);
			const assets = new AssetStore(plat);
			await assets.preload([
				IMG.menuBg,
				IMG.title,
				IMG.logoIcon,
				IMG.logoYin,
				IMG.bgSelect,
				IMG.bgSave,
				IMG.bgSettings,
				...SCENARIOS.map((s) => IMG.cover(s.key)),
				IMG.bgGame,
				IMG.panelScroll,
				IMG.card,
				IMG.badge
			]);
			console.log(`[qingshi] assets ok=${assets.failed.length === 0 ? "yes" : assets.failed.join(",")}`);
			const settings = new SettingsStore(plat);
			const bgm = new Bgm(plat);
			const voice = new Voice(plat);
			const sfx = new Sfx(plat);
			const saves = new SaveStore(plat);
			const applyAudio = (s) => {
				bgm.setEnabled(s.music);
				bgm.setVolume(s.musicGain);
				sfx.setEnabled(s.sfx);
				sfx.setVolume(s.sfxGain);
				voice.setEnabled(s.voice);
				voice.setVolume(s.voiceGain);
			};
			applyAudio(settings.value);
			settings.onChange(applyAudio);
			const app = new App({
				plat,
				assets,
				fontFamily,
				settings,
				saves,
				bgm,
				voice,
				sfx
			});
			plat.onPointer({
				down: (x, y, id) => app.pointerDown(x, y, id),
				move: (x, y, id) => app.pointerMove(x, y, id),
				up: (x, y, id) => app.pointerUp(x, y, id)
			});
			globalThis.__qingshi = {
				plat,
				assets,
				settings,
				saves,
				bgm,
				voice,
				sfx,
				app,
				DESIGN_W,
				DESIGN_H: 720,
				get scene() {
					return app;
				},
				get run() {
					return app.currentRun;
				}
			};
			const loop = () => {
				try {
					app.draw();
				} catch (e) {
					console.error("[qingshi] draw error", String(e));
					return;
				}
				raf(loop);
			};
			loop();
		} catch (e) {
			bootError(plat, e);
		}
	}
	main();
	//#endregion
})();
