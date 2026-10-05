#!/usr/bin/env node
/**
 * [OURS] 数据段回填脚本 —— 让「结构取上游、数据保我方」在拉上游更新后自动成立
 * ────────────────────────────────────────────────────────────────
 * 背景：我方把成块的纯数据（书签等）**写在上游配置文件的原有位置**，用成对标记圈住：
 *
 *     // [OURS-DATA-BEGIN]
 *     const _baseBooknav: BooknavGroup[] = [ ...我方数据... ];
 *     // [OURS-DATA-END]
 *
 * git 本身不认识标记 —— 上游改动可能把它的示例数据混进来、或制造冲突。本脚本在
 * `git merge upstream/master` **之后**运行，把标记之间的正文**整块替换**成我方存档的那份
 * ⇒ 输出**恒等于我方数据**，绝不会出现「上游 + 我方」混合（例如 BA）。
 *
 * 用法：
 *   node scripts/ours/merge-ours-data.mjs            回填（默认从缓存取；缺缓存回退 git show ORIG_HEAD → HEAD）
 *   node scripts/ours/merge-ours-data.mjs --save     把当前工作区各数据段存入 .ours-data 缓存
 *   node scripts/ours/merge-ours-data.mjs --check    只校验：标记成对 + 与缓存 sha256 一致
 *   node scripts/ours/merge-ours-data.mjs --ref REF  指定回填来源 ref（如要合并的上游分支名 / HEAD~1）
 *
 * 退出码：0 = 正常；1 = 硬错误（标记不成对 / 取不到来源 / 与缓存 sha256 不一致）
 *
 * ⚠️ `.ours-data/` 必须随仓库提交，否则换电脑 / CI 上失效。
 * ⚠️ 数据段位置由扫描自动发现（默认扫 src/config 下的 .ts/.json），将来友链/相册迁移后无需改本脚本。
 */

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";

// ── 配置 ────────────────────────────────────────────────────────────
/** 扫描根目录（递归找含标记的文件） */
const SCAN_ROOT = "src/config";
/** 只扫这两类文件 */
const SCAN_EXT = new Set([".ts", ".json"]);
/** 缓存目录（随仓库提交） */
const CACHE_DIR = ".ours-data";
const MANIFEST_PATH = path.join(CACHE_DIR, "manifest.json");

/** 标记行（BEGIN 吃掉行尾换行；END 不吃） */
const RE_BEGIN = /^[ \t]*\/\/[ \t]*\[OURS-DATA-BEGIN\][ \t]*\r?\n/m;
const RE_END = /^[ \t]*\/\/[ \t]*\[OURS-DATA-END\][ \t]*\r?$/m;
/** 计数用（全局匹配） */
const RE_BEGIN_ALL = /^[ \t]*\/\/[ \t]*\[OURS-DATA-BEGIN\][ \t]*\r?$/gm;
const RE_END_ALL = /^[ \t]*\/\/[ \t]*\[OURS-DATA-END\][ \t]*\r?$/gm;

// ── 基础工具 ────────────────────────────────────────────────────────
const sha256 = (s) => crypto.createHash("sha256").update(s, "utf8").digest("hex");
const toPosix = (p) => p.split(path.sep).join("/");

/** 递归收集待扫描文件（不排序，调用方统一排序） */
function walk(dir, out = []) {
	if (!fs.existsSync(dir)) return out;
	for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
		if (e.isDirectory()) {
			if (e.name === "node_modules" || e.name.startsWith(".")) continue;
			walk(path.join(dir, e.name), out);
		} else if (SCAN_EXT.has(path.extname(e.name))) {
			out.push(path.join(dir, e.name));
		}
	}
	return out;
}

/** 切出「标记之间的正文」；不成对时返回 error */
function extractInner(text) {
	const begins = text.match(RE_BEGIN_ALL) || [];
	const ends = text.match(RE_END_ALL) || [];
	if (begins.length !== 1 || ends.length !== 1) {
		return { error: `标记行数量异常（BEGIN ${begins.length} / END ${ends.length}，每个文件必须恰好各 1）` };
	}
	const b = text.match(RE_BEGIN);
	const e = text.match(RE_END);
	if (!b || !e || e.index < b.index) return { error: "标记顺序异常（END 出现在 BEGIN 之前）" };
	return {
		inner: text.slice(b.index + b[0].length, e.index),
		bEnd: b.index + b[0].length,
		eStart: e.index,
	};
}

/** 用 inner 替换标记之间的正文 */
const replaceInner = (text, inner, m) => text.slice(0, m.bEnd) + inner + text.slice(m.eStart);

/** 取某个 ref 下某文件的完整内容；失败返回 null */
function gitShow(ref, file) {
	try {
		return execFileSync("git", ["show", `${ref}:${file}`], {
			encoding: "utf8",
			maxBuffer: 64 * 1024 * 1024,
			stdio: ["ignore", "pipe", "ignore"],
		});
	} catch {
		return null;
	}
}

function gitSafe(args) {
	try {
		return execFileSync("git", args, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
	} catch {
		return "";
	}
}

/** 扫描工作区所有含标记的文件 */
function scan() {
	const files = [];
	const issues = [];
	for (const full of walk(SCAN_ROOT).sort()) {
		const text = fs.readFileSync(full, "utf8");
		if (!(text.match(RE_BEGIN_ALL) || []).length && !(text.match(RE_END_ALL) || []).length) continue;
		const item = { file: toPosix(full), text };
		const r = extractInner(text);
		if (r.error) {
			item.error = r.error;
			issues.push(item);
		} else {
			item.inner = r.inner;
			item.marks = { bEnd: r.bEnd, eStart: r.eStart };
			item.sha = sha256(r.inner);
			item.bytes = Buffer.byteLength(r.inner, "utf8");
			item.lines = Math.max(0, r.inner.split("\n").length - 1);
		}
		files.push(item);
	}
	return { files, issues };
}

function loadManifest() {
	if (!fs.existsSync(MANIFEST_PATH)) return null;
	try {
		return JSON.parse(fs.readFileSync(MANIFEST_PATH, "utf8"));
	} catch {
		return null;
	}
}

function fail(lines) {
	console.error("\n❌ 中止（硬错误）");
	for (const l of lines) console.error(`   ${l}`);
	process.exit(1);
}

// ── 子命令：存档 ────────────────────────────────────────────────────
function cmdSave() {
	const { files, issues } = scan();
	if (issues.length) {
		fail(issues.map((i) => `${i.file} —— ${i.error}`));
	}
	if (!files.length) fail([`在 ${SCAN_ROOT}/ 下没找到任何带 [OURS-DATA] 标记的文件`]);

	fs.mkdirSync(CACHE_DIR, { recursive: true });
	const list = [];
	for (const it of files) {
		const target = path.join(CACHE_DIR, `${it.file}.txt`);
		fs.mkdirSync(path.dirname(target), { recursive: true });
		fs.writeFileSync(target, it.inner, "utf8");
		list.push({ file: it.file, sha256: it.sha, bytes: it.bytes, lines: it.lines });
		console.log(`   ✓ ${it.file.padEnd(40)} ${String(it.lines).padStart(3)} 行 / ${it.bytes} B / ${it.sha.slice(0, 8)}`);
	}

	const prev = loadManifest();
	if (prev) {
		const now = new Set(list.map((f) => f.file));
		for (const old of prev.files) if (!now.has(old.file)) console.warn(`   ⚠️ 缓存里的 ${old.file} 已不在工作区（保留旧文件，未覆盖清单）`);
	}

	fs.writeFileSync(
		MANIFEST_PATH,
		`${JSON.stringify({ version: 1, savedAt: new Date().toISOString(), savedFrom: gitSafe(["rev-parse", "--short", "HEAD"]) || "unknown", files: list }, null, 2)}\n`,
		"utf8",
	);
	console.log(`\n✅ 已存档 ${list.length} 个数据段 → ${CACHE_DIR}/manifest.json`);
	console.log("   ⚠️ 记得把 .ours-data/ 一并提交进仓库（换电脑 / CI 都要用）");
}

// ── 子命令：校验 ────────────────────────────────────────────────────
function cmdCheck() {
	const { files, issues } = scan();
	if (issues.length) fail(issues.map((i) => `${i.file} —— ${i.error}`));
	if (!files.length) fail([`在 ${SCAN_ROOT}/ 下没找到任何带 [OURS-DATA] 标记的文件`]);

	const cache = loadManifest();
	if (!cache) fail([`缓存不存在（${MANIFEST_PATH}），请先运行 --save`]);

	let bad = 0;
	const seen = new Set();
	for (const it of files) {
		seen.add(it.file);
		const c = cache.files.find((f) => f.file === it.file);
		if (!c) {
			console.warn(`   ⚠️ ${it.file} 不在缓存清单里（新增数据段？跑一次 --save）`);
			continue;
		}
		if (c.sha256 !== it.sha) {
			bad++;
			console.error(`   ✗ ${it.file} 与缓存不一致`);
			console.error(`       缓存 ${c.sha256.slice(0, 16)}… (${c.lines} 行)`);
			console.error(`       工作区 ${it.sha.slice(0, 16)}… (${it.lines} 行)`);
		} else {
			console.log(`   ✓ ${it.file.padEnd(40)} ${String(it.lines).padStart(3)} 行 / ${it.sha.slice(0, 8)}`);
		}
	}
	for (const c of cache.files) if (!seen.has(c.file)) console.warn(`   ⚠️ 缓存里的 ${c.file} 在工作区已无标记（数据段被移除？）`);

	if (bad) fail([`${bad} 个数据段与缓存不一致 —— 若这是有意改动，请跑一次 --save 更新缓存`]);
	console.log(`\n✅ 校验通过：${files.length} 个数据段，标记成对且与缓存一致`);
}

// ── 子命令：回填 ────────────────────────────────────────────────────
function cmdRestore(refArg) {
	const { files, issues } = scan();
	if (issues.length) fail(issues.map((i) => `${i.file} —— ${i.error}`));
	if (!files.length) fail([`在 ${SCAN_ROOT}/ 下没找到任何带 [OURS-DATA] 标记的文件`]);

	const cache = refArg ? null : loadManifest();
	const refs = refArg ? [refArg] : ["ORIG_HEAD", "HEAD"];
	if (refArg) console.log(`   来源：git ${refArg}（--ref 指定，忽略缓存）`);
	else if (cache) console.log(`   来源：${CACHE_DIR}/ 缓存（存于 ${cache.savedAt}，源 ${cache.savedFrom}）`);
	else console.warn(`   ⚠️ 未找到 ${CACHE_DIR}/ 缓存，回退 git ${refs.join(" → ")}`);

	let restored = 0;
	let untouched = 0;
	const errors = [];

	for (const it of files) {
		let inner = null;
		let from = "";

		if (cache) {
			const c = cache.files.find((f) => f.file === it.file);
			const p = path.join(CACHE_DIR, `${it.file}.txt`);
			if (c && fs.existsSync(p)) {
				inner = fs.readFileSync(p, "utf8");
				from = "缓存";
			}
		}
		if (inner === null) {
			for (const ref of refs) {
				const old = gitShow(ref, it.file);
				if (old === null) continue;
				const r = extractInner(old);
				if (r.error) continue;
				inner = r.inner;
				from = `git ${ref}`;
				break;
			}
		}
		if (inner === null) {
			errors.push(`${it.file}：缓存与 ${refs.join("/")} 都取不到我方数据`);
			continue;
		}

		const newText = replaceInner(it.text, inner, it.marks);
		if (newText === it.text) {
			untouched++;
			console.log(`   · ${it.file.padEnd(40)} 已是目标数据（未改动）`);
			continue;
		}
		fs.writeFileSync(it.file, newText, "utf8");
		restored++;

		const wantSha = cache ? (cache.files.find((f) => f.file === it.file) || {}).sha256 : null;
		if (wantSha && wantSha !== sha256(inner)) {
			errors.push(`${it.file}：取到的数据与缓存 sha256 不符（缓存被人改过？）`);
			continue;
		}
		console.log(`   ✓ ${it.file.padEnd(40)} 已回填（来源 ${from}，${sha256(inner).slice(0, 8)}）`);
	}

	if (errors.length) fail(errors);
	console.log(`\n✅ 回填完成：${restored} 个改动 / ${untouched} 个本就一致`);
	console.log("   下一步：pnpm check && pnpm build");
}

// ── 入口 ────────────────────────────────────────────────────────────
const argv = process.argv.slice(2);
const refIdx = argv.indexOf("--ref");
const refArg = refIdx >= 0 ? argv[refIdx + 1] : null;

if (argv.includes("--save")) {
	console.log("📦 存档工作区数据段…");
	cmdSave();
} else if (argv.includes("--check")) {
	console.log("🔍 校验数据段…");
	cmdCheck();
} else {
	if (refIdx >= 0 && !refArg) fail(["--ref 后面要跟一个 ref 名"]);
	console.log("♻️  回填数据段…");
	cmdRestore(refArg);
}
