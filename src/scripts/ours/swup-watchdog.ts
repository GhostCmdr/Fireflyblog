// [OURS] swup 切换看门狗（自愈 + 留证）
//
// 背景：swup 软导航时会在 <html>/<body> 上加 is-page-transitioning / is-changing / is-animating /
// is-leaving 等过渡类，过渡结束由 swup 自己摘掉。快速来回点击（或竞态）时这些类有可能**残留**，
// 页面就表现为"卡死"：内容被过渡样式隐藏、点击无响应，只能手动刷新。
//
// 本模块只做两件事（不参与正常过渡，零副作用）：
//   1) visit:start 起一个超时表；超时后若过渡类仍在 → 判定卡死；
//   2) 打印现场（路径 / html 类 / body 类 / swup 状态）便于定位，并强行摘掉过渡类恢复交互。
//
// 幂等：重复 init 只注册一次；正常切换在 visit:end 时清表，永不触发。
// 只加在 Layout 里 1 行 import + 1 行调用（与 editor-mode 同款挂载方式）。

const TIMEOUT_MS = 8000;
const TRANSITION_CLASSES = [
	"is-page-transitioning",
	"is-changing",
	"is-animating",
	"is-leaving",
	"is-rendering",
];

let timer: number | null = null;
let inited = false;

function clearTimer(): void {
	if (timer !== null) {
		window.clearTimeout(timer);
		timer = null;
	}
}

function hasTransitionClass(): boolean {
	const cls = `${document.documentElement.className} ${document.body?.className ?? ""}`;
	return TRANSITION_CLASSES.some((c) => cls.includes(c));
}

function stripTransitionClasses(): void {
	for (const c of TRANSITION_CLASSES) {
		document.documentElement.classList.remove(c);
		document.body?.classList.remove(c);
	}
}

function arm(): void {
	clearTimer();
	timer = window.setTimeout(() => {
		timer = null;
		if (!hasTransitionClass()) return; // 正常结束，什么都不做
		// 走到这里 = 过渡类超时未清 → 判定卡死：先留证，再自愈
		console.warn(
			"[OURS][watchdog] swup 过渡超时未结束，判定卡死并自动恢复。现场：",
			{
				path: window.location.pathname,
				htmlClass: document.documentElement.className,
				bodyClass: document.body?.className ?? "",
				swupContainerChildren:
					document.getElementById("swup-container")?.children.length ?? -1,
				hasSwup: !!(window as unknown as { swup?: unknown }).swup,
				at: new Date().toISOString(),
			},
		);
		stripTransitionClasses();
	}, TIMEOUT_MS);
}

/** 挂载看门狗（幂等；swup 事件晚于本模块时由 swup:enable 兜底） */
export function initSwupWatchdog(): void {
	if (inited) return;
	inited = true;

	document.addEventListener("swup:visit:start", arm);
	document.addEventListener("swup:visit:end", clearTimer);
	document.addEventListener("swup:content:replace", arm); // 兜底：有些路径不发 visit:start
	document.addEventListener("swup:page:view", clearTimer);
	document.addEventListener("astro:page-load", clearTimer);
}
