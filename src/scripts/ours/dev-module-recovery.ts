// [OURS] 开发环境「模块过期」自愈（dev-only）
//
// 背景（2026-09-15 实锤）：在 dev 下，只要 Vite 重建了依赖预构建（改 astro.config / 装删依赖 /
// 删 node_modules/.astro|.vite 缓存，或首次访问新路由触发新依赖优化），**已经打开的标签页**里
// 引用的优化依赖块（如 @swup_astro_idle.js、@iconify_svelte_offline.js）会全部 504
// (Outdated Optimize Dep)，接着 Astro 的 island 注入失败：
//   [astro-island] Error hydrating X.svelte → TypeError: Failed to fetch dynamically imported module
// 于是明暗切换/设置面板/搜索等交互组件全部没挂上 → 整页点不动 = 用户看到的"卡死"，只能手动刷新。
//
// Vite 客户端只在部分路径上会自动 reload，实测这类 island 失败不会自愈，所以这里自己兜底：
//   1) 监听脚本加载错误 / 动态 import 失败 / unhandledrejection；
//   2) 命中"模块过期"特征时，弹一个提示条并**自动刷新一次**；
//   3) 防死循环：sessionStorage 记次数，30 秒窗口内最多自动刷 2 次，超出则只提示不强刷。
//
// 生产环境（import.meta.env.DEV === false）整个模块直接空转，不产生任何监听与 UI。

const HINT = "检测到页面模块已过期（Vite 依赖重建），正在自动刷新…";
const HINT_FAIL = "页面模块已过期，请按 Ctrl+Shift+R 强制刷新";
const GUARD_KEY = "ours:moduleRecovery";
const WINDOW_MS = 30_000;
const MAX_AUTO_RELOADS = 2;

/** 这些是"模块过期"的特征，不要误伤普通运行时错误（否则会陷入刷新循环） */
function isStaleModuleError(text: string): boolean {
	const t = text.toLowerCase();
	return (
		t.includes("failed to fetch dynamically imported module") ||
		t.includes("importing a module script failed") ||
		t.includes("error loading dynamically imported module") ||
		t.includes("outdated optimize dep") ||
		(t.includes("504") && t.includes("dep")) ||
		t.includes("dynamically imported module")
	);
}

function readGuard(): { t: number; n: number } {
	try {
		const raw = sessionStorage.getItem(GUARD_KEY);
		if (!raw) return { t: 0, n: 0 };
		const parsed = JSON.parse(raw) as { t?: number; n?: number };
		return { t: Number(parsed.t) || 0, n: Number(parsed.n) || 0 };
	} catch {
		return { t: 0, n: 0 };
	}
}

function writeGuard(t: number, n: number): void {
	try {
		sessionStorage.setItem(GUARD_KEY, JSON.stringify({ t, n }));
	} catch {
		/* sessionStorage 不可用时忽略 */
	}
}

function showToast(text: string): void {
	const el = document.createElement("div");
	el.textContent = text;
	el.style.cssText = [
		"position:fixed",
		"left:50%",
		"top:16px",
		"transform:translateX(-50%)",
		"z-index:2147483647",
		"padding:10px 16px",
		"border-radius:10px",
		"background:rgba(20,20,20,.88)",
		"color:#fff",
		"font-size:13px",
		"line-height:1.4",
		"box-shadow:0 6px 24px rgba(0,0,0,.28)",
		"pointer-events:none",
	].join(";");
	document.body?.appendChild(el);
}

let handled = false;

function handle(reason: string, where: string): void {
	if (handled) return;
	if (!isStaleModuleError(reason)) return;
	handled = true;

	const now = Date.now();
	const guard = readGuard();
	const fresh = now - guard.t > WINDOW_MS ? { t: now, n: 0 } : guard;
	const next = { t: fresh.t, n: fresh.n + 1 };

	console.warn("[OURS][module-recovery] 检测到模块过期（dev 环境）", {
		where,
		reason: reason.slice(0, 200),
		path: location.pathname,
		attempt: next.n,
		at: new Date().toISOString(),
	});

	if (next.n <= MAX_AUTO_RELOADS) {
		writeGuard(next.t, next.n);
		showToast(HINT);
		// 给提示条留一帧再刷新
		window.setTimeout(() => window.location.reload(), 400);
	} else {
		// 反复失败：不再自动刷，避免死循环，交给用户强刷
		showToast(HINT_FAIL);
		console.error(
			"[OURS][module-recovery] 自动刷新次数超出上限，请手动强刷（Ctrl+Shift+R）",
		);
	}
}

/** 挂载（幂等；dev-only） */
export function initDevModuleRecovery(): void {
	if (!import.meta.env.DEV) return; // 生产不启用
	if (
		(window as unknown as { __oursModuleRecovery?: boolean })
			.__oursModuleRecovery
	)
		return;
	(
		window as unknown as { __oursModuleRecovery?: boolean }
	).__oursModuleRecovery = true;

	// 1) 脚本/样式等资源加载失败（捕获阶段才能拿到 script.onerror）
	window.addEventListener(
		"error",
		(e: Event) => {
			const target = e.target as HTMLElement | null;
			const tag = target?.tagName;
			if (tag === "SCRIPT" || tag === "LINK") {
				const url =
					(target as HTMLScriptElement).src ||
					(target as HTMLLinkElement).href ||
					"";
				handle(`resource load error: ${url}`, "resource");
			} else if (e instanceof ErrorEvent) {
				handle(e.message || "", "window.error");
			}
		},
		true,
	);

	// 2) 动态 import 失败（Astro island 注入失败走这里）
	window.addEventListener("unhandledrejection", (e: PromiseRejectionEvent) => {
		const r = e.reason as { message?: string } | string | undefined;
		const msg = typeof r === "string" ? r : (r?.message ?? "");
		handle(msg, "unhandledrejection");
	});

	// 3) 兜底：Astro island 自带的失败提示（它只打 console，不给事件，这里补一个 MutationObserver 成本太高，不做）
}
