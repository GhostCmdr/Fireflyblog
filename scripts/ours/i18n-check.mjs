#!/usr/bin/env node
/**
 * [OURS] i18n 一致性检查（静态，不需要跑网站/不需要切语言）
 * ─────────────────────────────────────────────────────────────
 * 背景：本站**没有运行时语言切换控件** —— 语言由 `src/config/siteConfig.ts` 顶部
 *       `const SITE_LANG = resolveSiteLang("zh_CN")` 构建期决定。
 *       所以"检查各语言是否齐全"不能靠点 UI，只能静态比对语言文件的键集合。
 *
 * 用法：node scripts/ours/i18n-check.mjs
 * 输出：每个语言文件的键数 + 相对"全部语言键并集"缺哪些键；再以 zh_CN 为基准列出其它语言缺失项。
 */
import fs from "node:fs";

const DIR = "src/i18n/languages";
const files = fs
	.readdirSync(DIR)
	.filter((f) => f.endsWith(".ts"))
	.sort();

function keysOf(file) {
	const src = fs.readFileSync(`${DIR}/${file}`, "utf8");
	const set = new Set();
	for (const m of src.matchAll(/^\s*\[Key\.([A-Za-z0-9_]+)\]/gm)) set.add(m[1]);
	return set;
}

const map = Object.fromEntries(files.map((f) => [f, keysOf(f)]));
const all = new Set(files.flatMap((f) => [...map[f]]));

console.log(`\n语言文件 ${files.length} 个，键并集 ${all.size} 个（语言由 siteConfig 顶部 SITE_LANG 决定，构建期固定）\n`);
console.log("文件".padEnd(16) + "键数".padEnd(8) + "缺少的键");
console.log("-".repeat(72));
for (const f of files) {
	const miss = [...all].filter((k) => !map[f].has(k));
	console.log(
		f.padEnd(16) +
			String(map[f].size).padEnd(8) +
			(miss.length ? `${miss.length} → ${miss.slice(0, 10).join(", ")}${miss.length > 10 ? " …" : ""}` : "0 ✅"),
	);
}

const base = "zh_CN.ts";
if (map[base]) {
	const others = files.filter((f) => f !== base);
	const only = [...map[base]].filter((k) => others.some((f) => !map[f].has(k)));
	console.log(`\n以 ${base} 为基准、其它语言缺失的键（去重）：${only.length ? only.join(", ") : "无 ✅"}`);
}
console.log("");
