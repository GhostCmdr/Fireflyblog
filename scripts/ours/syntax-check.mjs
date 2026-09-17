#!/usr/bin/env node
/**
 * [OURS] 内联脚本语法自检（避免"改坏了 is:inline 脚本 → 整个编辑器页失效"的坑）
 * ─────────────────────────────────────────────────────────────
 * 为什么需要它：`src/pages/editor.astro` 里的大脚本是 `<script is:inline>` —— Astro 不处理、不类型检查，
 *   `astro check` 也**不会**报其中的语法错误；一旦写错一个括号，页面打开后**所有按钮全失效**（无任何提示）。
 * 做法：把 .astro 里所有"纯 JS 的 is:inline 块"抽出来，用 `new Function(code)` 只做**编译**（不执行）来验语法。
 *   带 `define:vars` 的块含 Astro 模板表达式，无法直接当 JS 解析 → 自动跳过。
 *
 * 用法：node scripts/ours/syntax-check.mjs [文件...]      （默认检查 src/pages/editor.astro）
 */
import fs from "node:fs";
import { execFileSync } from "node:child_process";
import path from "node:path";

const files = process.argv.slice(2);
const targets = files.length ? files : ["src/pages/editor.astro"];
const DUMP_DIR = ".backups";

let failed = 0;
for (const file of targets) {
	const src = fs.readFileSync(file, "utf8");
	// 只取不含 define:vars 的 is:inline 块。
	// ⚠️ 开闭标签都要求**独占一行**（^[ \t]*<script … / ^[ \t]*</script>）：
	//   否则会把注释里"提到的" <script is:inline> 当成真标签，截出一段垃圾内容 → 报假语法错误。
	const re = /^[ \t]*<script(?![^>]*define:vars)[^>]*\bis:inline\b[^>]*>([\s\S]*?)^[ \t]*<\/script>/gm;
	const blocks = [...src.matchAll(re)].map((m) => m[1]);
	let ok = 0;
	blocks.forEach((code, i) => {
		try {
			// 仅编译不执行；函数体包裹不影响语法判定
			new Function(code);
			ok++;
		} catch (e) {
			failed++;
			console.log(`✖ ${file} 第 ${i + 1} 个 is:inline 块语法错误：${e.message}`);
			// 落到磁盘再用 `node --check` 拿**精确行号与上下文**：
			// 注意：块内若出现 `</script` 文本（例如代码里拼 HTML），上面的正则会提前截断 →
			// 此时报的是"假错"，这里同时把该情况提示出来，避免误判。
			try {
				fs.mkdirSync(DUMP_DIR, { recursive: true });
				const dump = path.join(DUMP_DIR, `_inline-block-${i + 1}-check.js`);
				fs.writeFileSync(dump, code, "utf8");
				console.log(`   已导出：${dump}（用 node --check 可看精确行号）`);
				const hasScriptText = /<\/script/i.test(code);
				if (hasScriptText) console.log("   ⚠️ 该块内含 `</script` 文本，正则可能提前截断 → 这可能是**假错**，看浏览器是否正常即可。");
			} catch {}
		}
	});
	console.log(`· ${file}：检查 ${blocks.length} 个纯 JS 内联块，通过 ${ok} 个`);
}
console.log(failed ? `\n✖ 有 ${failed} 个块语法错误，请结合实际导出文件/浏览器表现判断是否真错` : "\n✓ 内联脚本语法检查全部通过");
process.exit(failed ? 1 : 0);
