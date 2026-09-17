#!/usr/bin/env node
/**
 * [OURS] 上游更新体检报告 —— 每次拉取上游前/后跑一次，把"玄学合并"变成"看报告"
 * ─────────────────────────────────────────────────────────────────────────────
 * 用法：
 *   node scripts/ours/upstream-report.mjs [--base <ref>] [--target <ref>] [--fetch] [--out <file>]
 *
 *   --base    对比基准，默认 HEAD
 *   --target  上游目标，默认 upstream/master（退化时自动试 upstream/main）
 *   --fetch   先 git fetch upstream --tags（报告会更准）
 *   --out     报告输出路径，默认 .backups/upstream-report-<时间戳>.md
 *
 * 报告内容（六节）：
 *   一、上游提交摘要（按 feat/fix/perf/refactor… 分组，带 hash/日期/作者）← 你要的"上游这次加了什么"
 *   二、新功能开关表（上游新增的配置键 → 是否已被我方 ours/ 覆盖 → 建议动作）
 *   三、配置文件键级变化（新增/删除，逐文件）
 *   四、我方 ours 覆盖健康度（hook 是否还在 / 覆盖的键是否还存在＝键搬家检测）
 *   五、改动文件清单（含"与我方定制同路径"的冲突预警）
 *   六、依赖版本变化（dependencies / devDependencies）
 *
 * ⚠️ 说明：这是"启发式"报告工具（键提取按"行首 1 个 Tab 的 `键:`"识别，深度只到第一层），
 *    用于**提示风险与待评估项**，不是精确 diff。结论请人工确认后再动手。
 * ⚠️ 本文件属我方工具（scripts/ours/），不修改 package.json（避免与上游冲突）：
 *    想加 npm script 请自行在 package.json 里加 "upstream:report": "node scripts/ours/upstream-report.mjs --fetch"。
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const CWD = process.cwd();
const argv = process.argv.slice(2);
const opt = (name, def) => {
	const i = argv.indexOf("--" + name);
	return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[i + 1] : def;
};
const flag = (name) => argv.includes("--" + name);

function git(args, { allowFail = false } = {}) {
	try {
		return execFileSync("git", args, {
			cwd: CWD,
			encoding: "utf8",
			maxBuffer: 128 * 1024 * 1024,
			// allowFail 的场景（老提交里没有该文件等）git 会把 fatal 打到 stderr，这里直接吞掉，避免污染报告输出
			stdio: allowFail ? ["ignore", "pipe", "ignore"] : ["ignore", "pipe", "pipe"],
		}).trim();
	} catch (e) {
		if (allowFail) return null;
		throw new Error(`git ${args.join(" ")} 执行失败：${e.message}`);
	}
}

/* ── 0. 参数与引用解析 ───────────────────────────────────────────── */
let target = opt("target", "upstream/master");
const base = opt("base", "HEAD");

if (flag("fetch")) {
	process.stdout.write("· 正在 git fetch upstream --tags …\n");
	const r = git(["fetch", "upstream", "--tags"], { allowFail: true });
	if (r === null) process.stdout.write("  ⚠️ fetch 失败（离线或未配置 upstream remote），改用本地已有引用\n");
}
if (!git(["rev-parse", "--verify", "--quiet", target], { allowFail: true })) {
	const alt = "upstream/main";
	if (git(["rev-parse", "--verify", "--quiet", alt], { allowFail: true })) {
		process.stdout.write(`  ⚠️ ${target} 不存在，改用 ${alt}\n`);
		target = alt;
	} else {
		console.error(`\n✖ 找不到上游引用 ${target}。先执行：git fetch upstream --tags\n`);
		process.exit(1);
	}
}
const targetShort = git(["rev-parse", "--short", target]);
const baseShort = git(["rev-parse", "--short", base]);
const targetDate = git(["log", "-1", "--format=%ad", "--date=short", target]);

/* ── 1. 提交摘要（按 conventional commit 类型分组）───────────────── */
const CONV = /^([a-zA-Z]+)(?:\(([^)]*)\))?(!)?:\s*(.+)$/;
const rawCommits = git(["log", "--no-merges", "--pretty=format:%h\u0001%ad\u0001%an\u0001%s", "--date=short", `${base}..${target}`]);
const commits = rawCommits
	? rawCommits.split("\n").map((line) => {
			const [hash, date, author, subject] = line.split("\u0001");
			const m = (subject || "").match(CONV);
			return {
				hash,
				date,
				author,
				subject: subject || "",
				type: m ? m[1].toLowerCase() : "other",
				scope: m ? m[2] || "" : "",
				text: m ? m[4] : subject || "",
			};
		})
	: [];
const TYPE_ORDER = ["feat", "fix", "perf", "refactor", "style", "docs", "build", "ci", "test", "chore", "other"];
const TYPE_LABEL = {
	feat: "✨ 新功能",
	fix: "🐛 修复",
	perf: "⚡ 性能",
	refactor: "♻️ 重构",
	style: "🎨 样式",
	docs: "📄 文档",
	build: "📦 构建",
	ci: "🔧 CI",
	test: "🧪 测试",
	chore: "🧹 杂项",
	other: "❔ 其它",
};
const byType = {};
for (const c of commits) (byType[c.type] = byType[c.type] || []).push(c);

/* ── 2. 改动文件清单 ─────────────────────────────────────────────── */
const nameStatus = git(["diff", "--name-status", `${base}..${target}`, "--", "src", "public", "scripts", "package.json"], {
	allowFail: true,
});
const fileChanges = nameStatus
	? nameStatus
			.split("\n")
			.filter(Boolean)
			.map((l) => {
				const parts = l.split("\t");
				return { status: parts[0][0], file: parts[parts.length - 1] };
			})
	: [];
const fileByStatus = { A: [], M: [], D: [] };
for (const f of fileChanges) (fileByStatus[f.status] = fileByStatus[f.status] || []).push(f.file);

// 与我方定制"同路径"（或同目录）的改动 → 冲突预警
const OURS_PATH_PATTERNS = [
	/^src\/config\/ours\//,
	/^src\/styles\/ours\//,
	/^src\/components\/ours\//,
	/^src\/scripts\/ours\//,
	/^src\/plugins\/ours\//,
	/^scripts\/ours\//,
	/^src\/pages\/editor\.astro$/,
];
const conflictRisk = fileChanges.filter((f) => OURS_PATH_PATTERNS.some((re) => re.test(f.file)));

/* ── 3. 配置文件键级变化（行首 1 个 Tab 的 `键:`）─────────────────── */
const TOP_KEY_RE = /^\t([A-Za-z_$][\w$]*)\s*:/gm;
function keysOf(src) {
	const set = new Set();
	if (!src) return set;
	TOP_KEY_RE.lastIndex = 0;
	let m;
	while ((m = TOP_KEY_RE.exec(src)) !== null) set.add(m[1]);
	return set;
}
const cfgChangedFiles = fileChanges
	.filter((f) => f.file.startsWith("src/config/") && f.file.endsWith(".ts") && !f.file.includes("/ours/"))
	.map((f) => f.file);
const cfgDiffs = [];
for (const file of cfgChangedFiles) {
	const oldSrc = git(["show", `${base}:${file}`], { allowFail: true });
	const newSrc = git(["show", `${target}:${file}`], { allowFail: true });
	const before = keysOf(oldSrc);
	const after = keysOf(newSrc);
	const added = [...after].filter((k) => !before.has(k) && oldSrc !== null);
	const removed = [...before].filter((k) => !after.has(k) && newSrc !== null);
	if (added.length || removed.length) cfgDiffs.push({ file, added, removed });
}

/* ── 4. 我方 ours 覆盖健康度 ─────────────────────────────────────── */
// 4.1 读我方 values.ts，抽出每个 `export const oursXxx = {` 块里的第一层键
const VALUES_PATH = "src/config/ours/values.ts";
const valuesSrc = fs.existsSync(path.join(CWD, VALUES_PATH)) ? fs.readFileSync(path.join(CWD, VALUES_PATH), "utf8") : "";
function oursBlocks(src) {
	const blocks = {};
	let cur = null;
	for (const line of src.split(/\r?\n/)) {
		const m = line.match(/^export const (ours\w+)\s*=\s*\{/);
		if (m) {
			cur = m[1];
			blocks[cur] = new Set();
			continue;
		}
		if (!cur) continue;
		if (/^\}/.test(line)) {
			cur = null;
			continue;
		}
		const k = line.match(/^\t([A-Za-z_$][\w$]*)\s*:/);
		if (k) blocks[cur].add(k[1]);
	}
	return blocks;
}
const mine = oursBlocks(valuesSrc);

// 4.2 找 hook： mergeDeep(_base, oursXxx)
// ⚠️ 必须扫【工作区】而不是 target：hook 是我方加进上游文件的，上游版本里根本没有它。
//    用工作区扫描还有个好处——若某次合并把 hook 弄丢了，这里就会报"上游已不再引用该覆盖块"。
const HOOK_RE = /mergeDeep\(\s*_base\w*\s*,\s*(ours\w+)\s*[,)]/g;
const hookMap = {}; // oursXxx -> 上游文件相对路径（src/config/xxx.ts）
const cfgDirAbs = path.join(CWD, "src/config");
if (fs.existsSync(cfgDirAbs)) {
	for (const name of fs.readdirSync(cfgDirAbs)) {
		if (!name.endsWith(".ts") || name === "ours") continue;
		const rel = `src/config/${name}`;
		const src = fs.readFileSync(path.join(cfgDirAbs, name), "utf8");
		HOOK_RE.lastIndex = 0;
		let m;
		while ((m = HOOK_RE.exec(src)) !== null) hookMap[m[1]] = rel;
	}
}
// 键校验用的上游版本内容：取 target 版本（= 我们要合并进来的新版）；target 里没有该文件则退回工作区
const cfgFileKeys = {};
for (const rel of new Set(Object.values(hookMap))) {
	const targetSrc = git(["show", `${target}:${rel}`], { allowFail: true });
	const src = targetSrc !== null ? targetSrc : fs.existsSync(path.join(CWD, rel)) ? fs.readFileSync(path.join(CWD, rel), "utf8") : "";
	cfgFileKeys[rel] = keysOf(src);
}

// 4.3 校验：我方每个块是否还有 hook、覆盖的键是否还存在（键搬家检测）
const oursHealth = [];
for (const name of Object.keys(mine)) {
	const file = hookMap[name];
	if (!file) {
		oursHealth.push({ name, file: null, missing: [], note: "上游已不再引用该覆盖块（hook 可能被删除/重构）" });
		continue;
	}
	const keys = cfgFileKeys[file] || new Set();
	const missing = [...mine[name]].filter((k) => !keys.has(k));
	oursHealth.push({ name, file, missing, note: missing.length ? "上游该键已不存在（疑似改名/删除/搬家）" : "" });
}

/* ── 5. 依赖版本变化 ─────────────────────────────────────────────── */
function depsOf(ref) {
	const txt = git(["show", `${ref}:package.json`], { allowFail: true });
	if (!txt) return null;
	try {
		const json = JSON.parse(txt);
		return { ...(json.dependencies || {}), ...(json.devDependencies || {}) };
	} catch {
		return null;
	}
}
const depsBase = depsOf(base) || {};
const depsTarget = depsOf(target) || {};
const depAdded = Object.keys(depsTarget).filter((k) => !(k in depsBase));
const depRemoved = Object.keys(depsBase).filter((k) => !(k in depsTarget));
const depChanged = Object.keys(depsTarget).filter((k) => k in depsBase && depsBase[k] !== depsTarget[k]);

/* ── 6. 汇总输出 ─────────────────────────────────────────────────── */
const L = [];
const stamp = new Date().toISOString().replace(/[-:T]/g, "").slice(0, 12);
L.push(`# 上游更新体检报告`);
L.push("");
L.push(`- 生成时间：${new Date().toLocaleString("zh-CN")}`);
L.push(`- 对比范围：\`${base}\` (${baseShort}) → \`${target}\` (${targetShort}，最后提交 ${targetDate})`);
L.push(`- 上游提交数：**${commits.length}** 条（不含 merge 提交）`);
L.push(`- 说明：键位识别为启发式（行首 1 Tab 的 \`键:\`，深度一层），结论请人工确认。`);
L.push("");

L.push(`## 一、上游提交摘要（按类型）`);
L.push("");
if (!commits.length) L.push("_（无差异：当前分支已包含目标上游的全部提交）_");
for (const t of TYPE_ORDER.concat(Object.keys(byType).filter((k) => !TYPE_ORDER.includes(k)))) {
	const list = byType[t];
	if (!list || !list.length) continue;
	L.push(`### ${TYPE_LABEL[t] || t}（${list.length} 条）`);
	L.push("");
	for (const c of list) {
		const scope = c.scope ? `**${c.scope}** ` : "";
		L.push(`- ${scope}${c.text} \`${c.hash}\` ${c.date} @${c.author}`);
	}
	L.push("");
}

L.push(`## 二、新功能开关表（上游新增的配置键）`);
L.push("");
const addedKeyRows = [];
for (const d of cfgDiffs) {
	for (const k of d.added) {
		// 该键是否被我方 ours/ 覆盖（按"同名块 + 同名键"粗判）
		const coveredBy = Object.entries(mine)
			.filter(([, keys]) => keys.has(k))
			.map(([n]) => n);
		const mapped = coveredBy.find((n) => hookMap[n] === d.file);
		addedKeyRows.push({ file: d.file, key: k, covered: mapped || "" });
	}
}
if (!addedKeyRows.length) {
	L.push("_（未检测到上游新增配置键）_");
} else {
	L.push("| 配置键 | 所在文件 | 我方是否已覆盖 | 建议 |");
	L.push("|---|---|---|---|");
	for (const r of addedKeyRows) {
		const advice = r.covered
			? `已由 \`${r.covered}\` 覆盖 → 维持我方行为，但建议确认上游语义是否变化`
			: "**未覆盖** → 会跟随上游默认值，需评估：开启 / 关闭 / 写进 ours/values.ts";
		L.push(`| \`${r.key}\` | ${r.file} | ${r.covered ? "✅ " + r.covered : "❌ 未覆盖"} | ${advice} |`);
	}
}
L.push("");

L.push(`## 三、配置文件键级变化`);
L.push("");
if (!cfgDiffs.length) L.push("_（无键级变化）_");
for (const d of cfgDiffs) {
	L.push(`### ${d.file}`);
	L.push("");
	if (d.added.length) L.push(`- 新增：${d.added.map((k) => `\`${k}\``).join("、")}`);
	if (d.removed.length) L.push(`- 删除：${d.removed.map((k) => `\`${k}\``).join("、")} ⚠️ 若我方覆盖了这些键将静默失效`);
	if (!d.added.length && !d.removed.length) L.push("- （无变化）");
	L.push("");
}

L.push(`## 四、我方 ours 覆盖健康度`);
L.push("");
L.push("| 覆盖块 | 上游文件 | 状态 |");
L.push("|---|---|---|");
for (const h of oursHealth) {
	const bad = !h.file || h.missing.length;
	L.push(
		`| \`${h.name}\` | ${h.file ? h.file : "—"} | ${bad ? "⚠️ " + h.note + (h.missing.length ? `：${h.missing.map((k) => `\`${k}\``).join("、")}` : "") : "✅ 正常"} |`,
	);
}
L.push("");

L.push(`## 五、改动文件清单（含冲突预警）`);
L.push("");
L.push(`- 新增 ${(fileByStatus.A || []).length} / 修改 ${(fileByStatus.M || []).length} / 删除 ${(fileByStatus.D || []).length}`);
if (conflictRisk.length) {
	L.push("");
	L.push("**⚠️ 与我方定制同路径的改动（重点检查）：**");
	L.push("");
	for (const f of conflictRisk) L.push(`- \`${f.status}\` ${f.file}`);
} else {
	L.push("");
	L.push("_（无与我方 ours/、editor.astro 同路径的改动）_");
}
L.push("");
if (fileByStatus.A && fileByStatus.A.length) {
	L.push("<details><summary>新增文件</summary>");
	L.push("");
	for (const f of fileByStatus.A) L.push(`- ${f}`);
	L.push("");
	L.push("</details>");
	L.push("");
}

L.push(`## 六、依赖版本变化`);
L.push("");
if (!depAdded.length && !depRemoved.length && !depChanged.length) L.push("_（无变化）_");
if (depAdded.length) L.push(`- 新增依赖：${depAdded.map((k) => `\`${k}@${depsTarget[k]}\``).join("、")}`);
if (depRemoved.length) L.push(`- 移除依赖：${depRemoved.map((k) => `\`${k}\``).join("、")}`);
if (depChanged.length) {
	L.push(`- 版本变化：`);
	for (const k of depChanged) L.push(`  - \`${k}\`：${depsBase[k]} → ${depsTarget[k]}`);
}
L.push("");
L.push("---");
L.push("");
L.push("## 下一步建议（固定动作）");
L.push("");
L.push("1. 先看【一】的 feat 段：逐条判断是否要开启/适配；对照【二】开关表给出结论。");
L.push("2. 看【四】失配项：把上游改名/删掉的键在 `src/config/ours/values.ts` 里改到新路径（**键搬家是历史高频坑**）。");
L.push("3. 看【五】冲突预警：与我方同路径的改动，合并时一律保我方，再人工比对上游意图。");
L.push("4. 看【六】：依赖大版本（major 变化）单独评估，别顺手升。");
L.push("5. 合并后必跑：`pnpm exec astro check` + `pnpm run build`（改过 remark/rehype 插件要先删 `node_modules/.astro`）。");

const md = L.join("\n");
const outPath = opt("out", path.join(".backups", `upstream-report-${stamp}.md`));
fs.mkdirSync(path.dirname(path.resolve(CWD, outPath)), { recursive: true });
fs.writeFileSync(path.resolve(CWD, outPath), md, "utf8");

// 控制台简报
process.stdout.write("\n");
process.stdout.write(`═══ 上游更新体检（${baseShort} → ${targetShort}）═══\n`);
process.stdout.write(`提交 ${commits.length} 条：` + TYPE_ORDER.filter((t) => byType[t]).map((t) => `${TYPE_LABEL[t] || t} ${byType[t].length}`).join(" / ") + "\n");
process.stdout.write(`文件：新增 ${(fileByStatus.A || []).length} / 修改 ${(fileByStatus.M || []).length} / 删除 ${(fileByStatus.D || []).length}\n`);
if (addedKeyRows.length) process.stdout.write(`⚠️ 上游新增配置键 ${addedKeyRows.length} 个（其中未被我方覆盖 ${addedKeyRows.filter((r) => !r.covered).length} 个）\n`);
const badOurs = oursHealth.filter((h) => !h.file || h.missing.length);
if (badOurs.length) process.stdout.write(`⚠️ ours 覆盖失配 ${badOurs.length} 处：${badOurs.map((h) => h.name).join("、")}\n`);
if (conflictRisk.length) process.stdout.write(`⚠️ 与我方同路径改动 ${conflictRisk.length} 个文件\n`);
if (depAdded.length || depRemoved.length || depChanged.length) process.stdout.write(`依赖：+${depAdded.length} / -${depRemoved.length} / ~${depChanged.length}\n`);
process.stdout.write(`\n📄 完整报告：${outPath}\n`);
