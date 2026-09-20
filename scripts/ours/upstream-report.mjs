#!/usr/bin/env node
/**
 * [OURS] 上游更新体检报告 —— 每次拉取上游前/后跑一次，把"玄学合并"变成"看报告"
 * ─────────────────────────────────────────────────────────────────────────────
 * 用法：
 *   node scripts/ours/upstream-report.mjs [--base <ref>] [--target <ref>] [--snapshot <ref>] [--fetch] [--out <file>]
 *
 *   --base     对比基准，默认 HEAD（语义＝"我方分支相对上游"）
 *   --target   上游目标，默认 upstream/master（退化时自动试 upstream/main）
 *   --snapshot 第七节（默认值变化）的对比基准，默认自动探测最近的 `backup-*` tag 或 `backup/pre-upstream-port-*` 分支，
 *              都没有则退回 --base。语义＝"上次合并的基线"，与 --base 不同（见第七节顶部说明）
 *   --fetch    先 git fetch upstream --tags（报告会更准）
 *   --out      报告输出路径，默认 .backups/upstream-report-<时间戳>.md
 *
 * 报告内容（九节）：
 *   一、上游提交摘要（按 feat/fix/perf/refactor… 分组，带 hash/日期/作者）← 你要的"上游这次加了什么"
 *   二、新功能开关表（上游新增的配置键 → 是否已被我方 ours/ 覆盖 → 建议动作）
 *   三、配置文件键级变化（新增/删除，逐文件）
 *   四、我方 ours 覆盖健康度（hook 是否还在 / 覆盖的键是否还存在＝键搬家检测）
 *   五、改动文件清单（含"与我方定制同路径"的冲突预警）
 *   六、依赖版本变化（dependencies / devDependencies）
 *   七、默认值变化（快照 → 当前工作区）＝"上游悄悄改默认值"导致的静默回归
 *      （第三节只查"键新增/删除"，**查不到"键还在但值被改了"**；历史踩坑：musicConfig.showLyrics
 *       被上游由 true 改 false → 播放器歌词按钮消失；displaySettingsConfig.enable → 设置面板消失）
 *   八、评论组件（Waline）检查＝SOP 约定"每次拉上游必须顺带检查"的三件事：CDN 声明解析到的版本、
 *      是否已出 v4、上游该组件是否改动（我方 [OURS] wordLimit 是否仍成立）
 *      （需要联网：取不到数据时只标注"未取到"，不影响其余章节）
 *   九、依赖版本检查＝把"依赖有新版本"也纳入定期提醒（原先靠 dependabot PR，现已改为
 *      `open-pull-requests-limit: 0` 不再自动开 PR ⇒ 由本节在双周体检里提示 ✓）
 *      只列"有更新"的包，并突出 **major 升级** 与 **关键包**（避免 40+ 依赖啰嗦 ✓）
 *
 * ⚠️ 说明：这是"启发式"报告工具（键提取按"行首 1 个 Tab 的 `键:`"识别，深度只到第一层；
 *    第七节按"缩进栈"还原点路径、只比标量值），用于**提示风险与待评估项**，不是精确 diff。
 *    第七节的已知局限：① 数组项会被误当键（如 galleryConfig.albums.id）② 多行对象 / 模板字符串 /
 *    `as` 类型断言解析不到 → 可能漏报 ③ 只扫 `src/config/`，`src/constants/`（如自动生成的 lqips.json）
 *    等**不在范围内** ⇒ **不代表全站已查**。结论请人工确认后再动手。
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

// ── 0.2 第七节的对比基准（"上次合并的基线"）────────────────────────
// 为什么需要单独一个基准：第一/二/三/五/六节都走 `base..target`（我方分支 vs 上游），
// 那样得到的是"上游改了什么"；而第七节要回答的是"**我上次合并时的基线 vs 我现在工作区实际用的值**"——
// 两者语义不同，混用会得出误导结论，所以这里单独解析。
// 优先级：--snapshot 显式指定 > 自动探测最近的 backup-* tag > 自动探测 backup/pre-upstream-port-* 分支 >
// 退回 --base（并在报告里注明"未找到快照"，避免把结果误当成"快照对比"）。
function detectSnapshot() {
	const tags = git(["tag", "-l", "backup-*", "--sort=-creatordate"], { allowFail: true });
	const tag = tags ? tags.split("\n").map((s) => s.trim()).filter(Boolean)[0] : "";
	if (tag) return { ref: tag, how: "自动探测：最近的 backup-* tag" };
	const brs = git(["for-each-ref", "--format=%(refname:short)", "--sort=-creatordate", "refs/heads/backup/"], {
		allowFail: true,
	});
	const br = brs ? brs.split("\n").map((s) => s.trim()).filter(Boolean)[0] : "";
	if (br) return { ref: br, how: "自动探测：backup/ 下最近的分支" };
	return null;
}
let snapshot = opt("snapshot", null);
let snapshotHow = "由 --snapshot 显式指定";
if (!snapshot) {
	const detected = detectSnapshot();
	if (detected) {
		snapshot = detected.ref;
		snapshotHow = detected.how;
	} else {
		snapshot = base;
		snapshotHow = "⚠️ 未找到备份快照，退回 --base 对照（结果仅供参考）";
	}
}
const snapshotShort = git(["rev-parse", "--short", snapshot], { allowFail: true }) || snapshot;

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

/* ── 4.5 默认值变化（第七节数据：快照 → 当前工作区）──────────────── */
// 只做一件事：找出"上次合并基线里存在、当前工作区里**同一路径但值不同**"的标量项。
// 为什么比的是"工作区"而不是 target 版本：本节要回答"我现在实际用的值有没有被悄悄改掉"，
// 而上游文件里的值只是默认值（我方可能已覆盖）⇒ 工作区文件才是真实来源。
// 键的新增/删除/改名由第三节负责，本节只管"值变化"，两节职责不重叠。
// 开关类键名识别。⚠️ 必须含"前缀式"命名（如 showLyrics / enableXxx），
// 首版写成精确 `show`／`enable` 会漏掉 showLyrics —— 那正是本节要抓的那个案例（自测抓出的漏洞）。
const SWITCH_KEY_RE = /^(?:enable[\w$]*|show[\w$]*|hide[\w$]*|is[A-Z][\w$]*|[\w$]*Switchable|[\w$]*Enabled|[\w$]*Enable)$/;
function scalarPaths(src) {
	const map = new Map();
	if (!src) return map;
	const stack = [];
	for (const raw of src.split(/\r?\n/)) {
		// tab 统一折算成 2 空格再比缩进：本项目配置用 tab，混用空格会把层级算错
		const line = raw.replace(/\t/g, "  ");
		const m = line.match(/^\s*([A-Za-z_$][\w$]*)\s*:\s*(.*)$/);
		if (!m) continue;
		const indent = line.search(/\S/);
		while (stack.length && stack[stack.length - 1].indent >= indent) stack.pop();
		const key = m[1];
		const val = m[2].replace(/,\s*$/, "").trim();
		if (val === "" || /^[[{]/.test(val)) {
			// 进入对象/数组：只记路径，不进值表。把"是不是数组"也记下来 ——
			// 数组项（如 leftComponents[].showOnPostPage）会被本启发式当成键，属已知误报，
			// 后面据此把它们从 7.1 低噪音视图里剔除，只在 7.2 标注展示。
			stack.push({ indent, key, isArray: val.startsWith("[") });
			continue;
		}
		// 函数式赋值 / 类型注解行不是"上游默认值"，跳过（否则会大量误报）
		if (/=>|\bmergeDeep\b|\bresolve[A-Z]|^ours|^_base/.test(val)) continue;
		map.set([...stack.map((s) => s.key), key].join("."), { val, fromArray: stack.some((s) => s.isArray) });
	}
	return map;
}
// 覆盖判定：严格＝同一上游文件对应的 ours 块里含该键（第一层键有效，与第二节判定方式一致）；
// 退化＝键名出现在 values.ts 任意位置（嵌套键只能这样粗判）→ 标"疑似覆盖、需人工确认"
function coverageOf(file, dotPath) {
	const leaf = dotPath.split(".").pop();
	const strict = Object.entries(mine)
		.filter(([n, keys]) => keys.has(leaf) && hookMap[n] === file)
		.map(([n]) => n);
	if (strict.length) return { state: "covered", by: strict.join("、") };
	const loose = new RegExp(`(^|[^\\w$])${leaf}\\s*:`, "m").test(valuesSrc);
	return loose ? { state: "maybe", by: "" } : { state: "none", by: "" };
}
// 内部先收全集（含数组项），最后再按 --include-array-items 决定是否过滤 → 变量名用 allChanges 以免与最终的 defaultChanges 冲突
const allChanges = [];
{
	// 覆盖范围：src/config/** + src/constants/**（后者以前没扫 ⇒ 属 §7.3 声明的"覆盖不全"，现补上 ✓）
	const listed = git(["ls-tree", "-r", "--name-only", snapshot, "--", "src/config", "src/constants"], {
		allowFail: true,
	});
	const files = (listed || "")
		.split("\n")
		.map((s) => s.trim())
		.filter((f) => f.endsWith(".ts") && !f.includes("/ours/"));
	for (const file of files) {
		const abs = path.join(CWD, file);
		if (!fs.existsSync(abs)) continue; // 快照有、工作区已无 → 属"文件级变化"，由第五节清单体现
		const oldSrc = git(["show", `${snapshot}:${file}`], { allowFail: true });
		if (!oldSrc) continue;
		const before = scalarPaths(oldSrc);
		const after = scalarPaths(fs.readFileSync(abs, "utf8"));
		// 比较用的归一化：去掉 TS 类型断言（如 `"bottom" as "meta" | "bottom"`）——
		// 断言属类型层写法，不剥离会把"同一个值"误报成"上游改了这个值" ✗（展示仍保留原文 ✓）
		const normVal = (s) => s.replace(/\s+as\s+.+$/, "").trim();
		for (const [dotPath, o] of before) {
			const n = after.get(dotPath);
			if (!n) continue;
			if (normVal(n.val) === normVal(o.val)) continue;
			const leaf = dotPath.split(".").pop();
			const fromArray = o.fromArray || n.fromArray;
			// 数组项一律不算"开关类"：它们本来就属已知误报，不能进 7.1 低噪音视图（否则噪音又回来了）
			const isSwitch =
				!fromArray && SWITCH_KEY_RE.test(leaf) && /^(true|false)$/.test(o.val) && /^(true|false)$/.test(n.val);
			allChanges.push({
				file,
				key: dotPath,
				old: o.val,
				now: n.val,
				isSwitch,
				fromArray,
				...coverageOf(file, dotPath),
			});
		}
	}
	// 开关类排前面：它们才是"功能被悄悄关掉"的高发区，方便一眼扫到
	allChanges.sort((a, b) => (a.isSwitch === b.isSwitch ? a.key.localeCompare(b.key) : a.isSwitch ? -1 : 1));
}
// 数组项默认过滤：数组里的元素（如 `albums.id`、`leftComponents.type`）会被本启发式当成"键"，
// 属已知误报 ✗（§7.3 有说明）⇒ 默认不列、避免淹没真正要紧的项；要看它们加 --include-array-items ✓
const includeArrayItems = flag("include-array-items");
const arrayItemCount = allChanges.filter((r) => r.fromArray).length;
const defaultChanges = includeArrayItems ? allChanges : allChanges.filter((r) => !r.fromArray);
const switchRows = defaultChanges.filter((r) => r.isSwitch);
const switchUncovered = switchRows.filter((r) => r.state !== "covered");

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

/* ── 5.5 评论组件（Waline）版本与上游改动（第八节数据）─────────────
 * 为什么单独一节：SOP 约定「每次拉上游必须顺带检查」——
 *   ① 我方组件里 `@waline/client@vX` 声明当前解析到什么版本 / 是否已出 v4（没法锁版本 ⇒ 必须人工盯）
 *   ② 上游 `Waline.astro` 是否被改动（我方 `[OURS] wordLimit` 那行是否还成立）
 * 这是全脚本**唯一联网**的一节：拿不到数据只标注"未取到"，绝不让整份报告失败。
 */
const WALINE_COMPONENT = "src/components/comment/Waline.astro";
const walineLocalSrc = fs.existsSync(path.join(CWD, WALINE_COMPONENT))
	? fs.readFileSync(path.join(CWD, WALINE_COMPONENT), "utf8")
	: "";
// 只取"版本/主版本"部分：组件里写的是 `@waline/client@v3/dist/waline.css`，
// 旧正则会把 `/dist/waline.css` 一起吃进来（实测导致请求 404）→ 在数字/点号后立即停。
const walineDeclared = (walineLocalSrc.match(/@waline\/client@(v?\d+(?:\.\d+)*)/) || [])[1] || "";
const walineHasOurs = /\[OURS\]/.test(walineLocalSrc) && /wordLimit/.test(walineLocalSrc);
// ⚠️ 不能用 `base..target` 判断"上游是否改了这个文件"：base 是**我方分支**（含我方改动）✗，
// 且在"已合并"状态下同一提交还会互换语义。正确做法是取**我方与上游的共同祖先**
// （= 上次合并进来的那个上游提交，其文件内容就是"上游原样"）再与 target 比 ✓
const upstreamMergeBase = git(["merge-base", base, target], { allowFail: true }) || base;
const walineUpstreamChanged =
	git(["diff", "--name-only", `${upstreamMergeBase}..${target}`, "--", WALINE_COMPONENT], { allowFail: true }) || "";
async function fetchJson(url) {
	try {
		const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
		if (!res.ok) return null;
		return await res.json();
	} catch {
		return null;
	}
}
const walineResolved = walineDeclared
	? await fetchJson(`https://unpkg.com/@waline/client@${walineDeclared}/package.json`)
	: null;
const walineRegistry = await fetchJson("https://registry.npmjs.org/@waline/client");
// npm registry 的完整包文档**没有顶层 `version`**（实测取到 undefined）→ 必须读 `dist-tags.latest`
const walineLatest =
	(walineRegistry && walineRegistry["dist-tags"] && walineRegistry["dist-tags"].latest) || "";
const walineHasV4 = !!(
	walineRegistry &&
	walineRegistry.versions &&
	Object.keys(walineRegistry.versions).some((v) => /^4\./.test(v))
);

/* ── 5.6 依赖版本检查（第九节数据）────────────────────────────────
 * 目的：把"依赖有新版本"纳入定期提醒 —— 原先靠 dependabot 的 PR，现改为
 *   `.github/dependabot.yml` 里 `open-pull-requests-limit: 0`（不再自动开 PR ⇒ 也不再有
 *   dependabot/* 分支 ✗），所以这份双周体检负责提醒 ✓
 * 规则：只列出"有更新"的包，并突出两类 ——
 *   ① **major 升级**（主版本号变大 ⇒ 可能有破坏性 ✓ 必看）
 *   ② **关键包**白名单内的任何升级（与本站核心功能相关 ✓）
 * 当前版本：优先取 node_modules 里**实际安装**的版本 ✓（本地跑最准）；CI 无 node_modules 时
 *   回退到 package.json 声明的范围下限 ✓ 并在报告里注明来源 ✓
 * 网络失败/查不到 ⇒ 跳过该包，绝不让整份报告失败 ✓（并发限 8，避免一次 40+ 请求）
 */
const KEY_DEPS = [
	"astro",
	"@astrojs/",
	"mermaid",
	"@mermaid-js/",
	"astro-expressive-code",
	"tailwindcss",
	"pagefind",
	"sharp",
];
function isKeyDep(name) {
	return KEY_DEPS.some((p) => (p.endsWith("/") ? name.startsWith(p) : name === p || name.startsWith(p + "/")));
}
function cleanVersion(v) {
	return String(v || "")
		.replace(/^[\^~>=<\s]+/, "")
		.trim();
}
function installedVersionOf(name) {
	try {
		const p = path.join(CWD, "node_modules", ...name.split("/"), "package.json");
		if (fs.existsSync(p)) return JSON.parse(fs.readFileSync(p, "utf8")).version || "";
	} catch {
		/* 读不到就当没安装 */
	}
	return "";
}
function majorOf(v) {
	const m = String(v || "").match(/^(\d+)/);
	return m ? Number(m[1]) : null;
}
const projectPkg = (() => {
	try {
		return JSON.parse(fs.readFileSync(path.join(CWD, "package.json"), "utf8"));
	} catch {
		return {};
	}
})();
const depEntries = Object.entries({ ...(projectPkg.dependencies || {}), ...(projectPkg.devDependencies || {}) })
	// 评论组件已在第八节专门检查 ✓ 这里不重复列
	.filter(([name]) => name !== "@waline/client");
const depResults = [];
{
	const queue = depEntries.slice();
	const worker = async () => {
		while (queue.length) {
			const [name, range] = queue.shift();
			const data = await fetchJson(`https://registry.npmjs.org/${name.replace("/", "%2F")}`);
			const latest = (data && data["dist-tags"] && data["dist-tags"].latest) || "";
			if (!latest) continue; // 查不到就跳过 ✓
			const installed = installedVersionOf(name);
			const cur = installed || cleanVersion(range);
			if (!cur || cur === latest) continue; // 没更新就不列 ✓
			const mCur = majorOf(cur);
			const mLatest = majorOf(latest);
			depResults.push({
				name,
				cur,
				latest,
				source: installed ? "已安装" : "package.json",
				isMajor: mCur !== null && mLatest !== null && mLatest > mCur,
				isKey: isKeyDep(name),
			});
		}
	};
	await Promise.all(Array.from({ length: 8 }, worker));
	// 排序：major → 关键包 → 其它（各自内按包名）
	depResults.sort((a, b) => {
		if (a.isMajor !== b.isMajor) return a.isMajor ? -1 : 1;
		if (a.isKey !== b.isKey) return a.isKey ? -1 : 1;
		return a.name.localeCompare(b.name);
	});
}
const depMajorCount = depResults.filter((r) => r.isMajor).length;
const depKeyCount = depResults.filter((r) => r.isKey).length;

/* ── 6. 汇总输出 ─────────────────────────────────────────────────── */
const L = [];
const stamp = new Date().toISOString().replace(/[-:T]/g, "").slice(0, 12);
L.push(`# 上游更新体检报告`);
L.push("");
L.push(`- 生成时间：${new Date().toLocaleString("zh-CN")}`);
L.push(`- 对比范围：\`${base}\` (${baseShort}) → \`${target}\` (${targetShort}，最后提交 ${targetDate})`);
L.push(`- 上游提交数：**${commits.length}** 条（不含 merge 提交）`);
// 上游"最新版本号"怎么取：⚠️ 实测**上游根本不打 tag**（`git describe --tags --abbrev=0 upstream/master`
// 直接报 "No tags can describe …" ✗）⇒ 权威来源 = **上游仓库里 package.json 的 version** ✓
// 与我方 package.json 一比 ⇒ 一眼看出"我落后几个版本"（比"提交数"直观：提交数多也可能只是同版本内小改 ✓）
function versionOf(ref) {
	const txt = git(["show", `${ref}:package.json`], { allowFail: true });
	if (!txt) return "";
	try {
		return JSON.parse(txt).version || "";
	} catch {
		return "";
	}
}
const upstreamVersion = versionOf(target);
const ourVersion = versionOf("HEAD");
// tag 只作补充展示：上游某天开始打 tag 时能顺带看到 ✓ 没有则注明"上游未打 tag" ✓
const upstreamTag = git(["describe", "--tags", "--abbrev=0", target], { allowFail: true }) || "";
if (upstreamVersion) {
	const diff = ourVersion && upstreamVersion !== ourVersion;
	L.push(
		`- **上游版本（package.json）：\`${upstreamVersion}\`**；我方：\`${ourVersion || "?"}\`${
			diff ? " ⚠️ **不同 → 可能已有新版可拉**" : ourVersion ? " ✓ 同版本" : ""
		}${upstreamTag ? `（上游最近 tag：\`${upstreamTag}\`）` : "（上游未打 tag）"}`,
	);
} else {
	L.push(`- 上游版本：未取到（\`git show ${target}:package.json\` 失败）`);
}
L.push(`- 说明：键位识别为启发式（行首 1 Tab 的 \`键:\`，深度一层），结论请人工确认。`);
L.push("");
// ⚠️ 常见误读（2026-09-17 实测踩到）：`base..target` **没有提交**、却**有文件差异** ⇒ 说明
// 你已经把 target 合并进 base 了，此时一~六节展示的是"我方相对上游的定制差异"，**不是上游的新变化** ✗
// 应在**拉上游之前**运行本脚本才有一~六节的意义；第七/第八节不受运行时机影响 ✓
if (commits.length === 0 && fileChanges.length > 0) {
	L.push("> ⚠️ **检测到 `target` 已包含在 `base` 中（说明你已合并过上游）**：");
	L.push("> 一~六节展示的差异是**我方相对上游的定制**，**不代表上游有新变化** ✗ —— 一~六节请在**拉上游之前**运行；");
	L.push("> **第七节（默认值变化）与第八节（Waline 检查）不受运行时机影响** ✓");
	L.push("");
}

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
L.push(`## 七、默认值变化（快照 → 当前工作区）`);
L.push("");
L.push(`- 对比：\`${snapshot}\` (${snapshotShort}) **${snapshotHow}** → 当前工作区文件`);
L.push(`  （比工作区而非 target：工作区才是"我现在实际用的值"；上游文件里的只是默认值）`);
L.push(
	`- 共 **${defaultChanges.length}** 处标量默认值变化，其中**开关类布尔键 ${switchRows.length} 处**（未确认覆盖 ${switchUncovered.length} 处＝未覆盖 ${switchRows.filter((r) => r.state === "none").length} + 疑似 ${switchRows.filter((r) => r.state === "maybe").length}）`,
);
L.push("");
if (!defaultChanges.length) {
	L.push("_（未检测到默认值变化）_");
	L.push("");
} else {
	L.push("### 7.1 开关类布尔键（功能开关，最需要人工判断）");
	L.push("");
	if (!switchRows.length) {
		L.push("_（无开关类默认值变化）_");
		L.push("");
	} else {
		L.push("| 键（点路径） | 文件 | 旧 → 新 | 我方覆盖 | 建议 |");
		L.push("|---|---|---|---|---|");
		for (const r of switchRows) {
			const cover = r.state === "covered" ? `✅ ${r.by}` : r.state === "maybe" ? "❓ 疑似覆盖（同名键，需确认）" : "❌ 未覆盖";
			const advice =
				r.state === "covered"
					? "已固定在我方 → 上游再改也影响不到你（确认上游语义未变即可）"
					: "**会跟随上游**：若这正是你要的行为则无需处理，否则写进 `src/config/ours/values.ts` 固定";
			L.push(`| \`${r.key}\` | ${r.file} | \`${r.old}\` → \`${r.now}\` | ${cover} | ${advice} |`);
		}
		L.push("");
	}
	const others = defaultChanges.filter((r) => !r.isSwitch);
	L.push("### 7.2 其它标量值变化（多为美化/文案，通常随上游即可）");
	L.push("");
	if (!others.length) {
		L.push("_（无）_");
		L.push("");
	} else {
		L.push(`共 ${others.length} 处，展开查看：`);
		L.push("");
		L.push("<details><summary>展开其它值变化</summary>");
		L.push("");
		L.push("| 键（点路径） | 文件 | 旧 → 新 | 我方覆盖 |");
		L.push("|---|---|---|---|");
		for (const r of others) {
			const cover = r.state === "covered" ? `✅ ${r.by}` : r.state === "maybe" ? "❓ 疑似（同名键）" : "❌ 未覆盖";
			// 数组项标记出来：本节的启发式会把数组项当键（已知误报），标了才不会被当成真变化
			const arrMark = r.fromArray ? " ⚠️数组项(可能误报)" : "";
			L.push(`| \`${r.key}\`${arrMark} | ${r.file} | \`${r.old}\` → \`${r.now}\` | ${cover} |`);
		}
		L.push("");
		L.push("</details>");
		L.push("");
	}
	L.push("### 7.3 本节的口径与已知局限（务必知道，别当成「已全查」）");
	L.push("");
	L.push("- 覆盖范围：`src/config/**` + `src/constants/**`（仅 `.ts`；`.astro` / `.svelte` / `.json` 不扫）；");
	if (arrayItemCount) {
		L.push(
			`- **已默认过滤 ${arrayItemCount} 个「数组项」**（如 \`albums.*\`、\`leftComponents.*\` —— 数组元素会被本启发式当成键，属误报 ✗）；要看它们加 \`--include-array-items\`；`,
		);
	}
	L.push("- **会漏报**：多行对象、跨行模板字符串、函数式赋值（`=>` / `mergeDeep` / `resolve*` 属有意跳过 ✓）；");
	L.push("- **比较已归一化**：TS 类型断言（`as …`）只在比较时剥离，避免把同一个值误报成变化 ✓（展示仍保留原文）；");
	L.push("- 因此本节是**提示清单**、不是权威结论 → 拿不准就人工打开两个版本的文件对比 ✓。");
	L.push("");
}

L.push("---");
L.push("");
L.push("## 八、评论组件（Waline）检查");
L.push("");
L.push(`- 我方组件：\`${WALINE_COMPONENT}\`；CDN 声明：${walineDeclared ? "`@" + walineDeclared + "`" : "**未识别到**"}`);
if (walineResolved && walineResolved.version) {
	L.push(`- 该声明**当前解析到 v${walineResolved.version}**（unpkg 实时取值）`);
} else {
	L.push("- ⚠️ 未能从 unpkg 取到解析版本（离线 / 网络受限 / 包名写法变化）");
}
if (walineLatest) {
	L.push(
		`- npm registry 最新版本：**v${walineLatest}**${walineHasV4 ? "；**已存在 v4** ⚠️ 需人工决定是否迁移（URL 里的 `@v3` 不会自动跟随）" : "（尚无 v4）"}`,
	);
} else {
	L.push("- ⚠️ 未能从 npm registry 取到最新版本（离线 / 网络受限）");
}
L.push(`- 我方 \`[OURS] wordLimit\` 是否仍在：${walineHasOurs ? "✅ 在（英文单词评论不被拒）" : "⚠️ 未检出 —— 可能被上游覆盖，需人工检查"}`);
L.push(
	`- 上游本次是否改动该组件：${walineUpstreamChanged ? "⚠️ **有改动** → 合并时务必保住我方 `[OURS]` 那行（勿整文件取上游版）" : "无改动 ✓"}`,
);
L.push("");
L.push("---");
L.push("");
L.push("## 九、依赖版本检查（npm 最新版对比）");
L.push("");
L.push("- 当前版本优先取本地**已安装**版本 ✓（CI 环境无 node_modules 时回退 `package.json` 声明值，见「来源」列）；");
L.push("- 只列**有更新**的包，并突出 **major 升级**（可能有破坏性）与 **关键包**（与本站核心功能相关）✓；评论组件见第八节；");
L.push("");
if (!depResults.length) {
	L.push("_（未查到可更新项，或网络受限导致查询失败）_");
	L.push("");
} else {
	L.push(`共 **${depResults.length}** 个包有更新：**major ${depMajorCount} 个**、关键包 ${depKeyCount} 个（按 重大 → 关键 → 其它 排序）：`);
	L.push("");
	L.push("| 包 | 当前 | 最新 | 类型 | 来源 |");
	L.push("|---|---|---|---|---|");
	for (const r of depResults) {
		const tag = r.isMajor ? "⚠️ **major**" : r.isKey ? "关键包" : "minor/patch";
		L.push(`| \`${r.name}\` | ${r.cur} | ${r.latest} | ${tag} | ${r.source} |`);
	}
	L.push("");
	L.push("- 升级方式：本机 `pnpm update <包名>`（或 `pnpm up --latest`）后提交 ✓；");
	L.push("  或临时把 `.github/dependabot.yml` 的 `open-pull-requests-limit` 改回 `5` 让机器人开 PR ✓（Merge/Close 后分支会自动删除 ✓）；");
	L.push("- **major 升级有破坏性风险** ⇒ 升完必须跑 `pnpm exec astro check` + `pnpm build`，并复测相关功能 ✓。");
	L.push("");
}

L.push("---");
L.push("");
L.push("## 下一步建议（固定动作）");
L.push("");
L.push("1. 先看【一】的 feat 段：逐条判断是否要开启/适配；对照【二】开关表给出结论。");
L.push("2. 看【四】失配项：把上游改名/删掉的键在 `src/config/ours/values.ts` 里改到新路径（**键搬家是历史高频坑**）。");
L.push("3. 看【五】冲突预警：与我方同路径的改动，合并时一律保我方，再人工比对上游意图。");
L.push("4. 看【六】：依赖大版本（major 变化）单独评估，别顺手升。");
L.push(
	"5. **看【七】7.1 开关类未覆盖项**：这是「上游改默认值把功能悄悄关掉」的高发区（曾导致播放器歌词按钮、设置面板消失）→ 逐条判断是否写进 `src/config/ours/values.ts` 固定。**只有写进 ours 才是免疫，本报告只负责提醒。**",
);
L.push("6. 合并后必跑：`pnpm exec astro check` + `pnpm run build`（改过 remark/rehype 插件要先删 `node_modules/.astro`）。");

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
if (defaultChanges.length) {
	const swNone = switchRows.filter((r) => r.state === "none").length;
	const swMaybe = switchRows.filter((r) => r.state === "maybe").length;
	process.stdout.write(
		`⚠️ 默认值变化 ${defaultChanges.length} 处｜开关类 ${switchRows.length} 处（未覆盖 ${swNone} / 疑似 ${swMaybe}）→ 见报告第七节\n`,
	);
}
process.stdout.write(
	`上游版本：${upstreamVersion || "未取到"}（我方 ${ourVersion || "?"}）${
		upstreamVersion && ourVersion && upstreamVersion !== ourVersion ? " ⚠️ 可能已有新版可拉" : " ✓"
	}\n`,
);
if (depResults.length) {
	process.stdout.write(
		`依赖：${depResults.length} 个包有更新（major ${depMajorCount} / 关键包 ${depKeyCount}）→ 见第九节\n`,
	);
}
process.stdout.write(
	`Waline：声明 @${walineDeclared || "?"} → 解析 v${(walineResolved && walineResolved.version) || "?"}` +
		(walineLatest ? `；npm 最新 v${walineLatest}${walineHasV4 ? "（已出 v4 ⚠️）" : ""}` : "；npm 最新未取到") +
		(walineHasOurs ? "；[OURS] wordLimit 在 ✓" : "；⚠️ [OURS] wordLimit 未检出") +
		(walineUpstreamChanged ? "；上游改了该组件 ⚠️" : "") +
		"\n",
);
process.stdout.write(`\n📄 完整报告：${outPath}\n`);
