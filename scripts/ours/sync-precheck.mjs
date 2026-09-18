#!/usr/bin/env node
/**
 * [OURS] 推送前预检 —— 把"同步到我方仓库（main）"这一步从"凭感觉推"变成"先看清再推"
 * ─────────────────────────────────────────────────────────────────────────────
 * 用法：
 *   node scripts/ours/sync-precheck.mjs [--remote origin] [--target main] [--upstream upstream/master]
 *
 * 为什么需要（2026-09-18 实测踩坑）：
 *   在 `port/upstream-6.16.8` 分支上执行 `git push origin main` ✗ —— 它推的是**本地 main 分支**
 *   （不是当前分支）→ 输出 "Everything up-to-date"、远程毫无变化 ✗，而人以为已经推上去了 ✗。
 *   正确写法是 `git push origin <当前分支>:main` ✓ —— 本脚本负责把这件事说清楚。
 *
 * 本脚本**只读**：不推送、不改任何引用，只做检查并打印**可直接复制的正确命令**。
 *   会不会需要 force、要不要先建还原点，都由下面的判定给出（含完整安全流程）。
 */
import { execFileSync } from "node:child_process";

const CWD = process.cwd();
const argv = process.argv.slice(2);
const opt = (name, def) => {
	const i = argv.indexOf("--" + name);
	return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[i + 1] : def;
};
function git(args, { allowFail = false } = {}) {
	try {
		return execFileSync("git", args, {
			cwd: CWD,
			encoding: "utf8",
			maxBuffer: 128 * 1024 * 1024,
			stdio: allowFail ? ["ignore", "pipe", "ignore"] : ["ignore", "pipe", "pipe"],
		}).trim();
	} catch (e) {
		if (allowFail) return null;
		throw new Error(`git ${args.join(" ")} 执行失败：${e.message}`);
	}
}

const remote = opt("remote", "origin");
const target = opt("target", "main");
const upstreamRef = opt("upstream", "upstream/master");

const out = [];
out.push(`═══ 推送前预检（${remote}/${target}）═══`);

/* ── 1. 当前分支与工作区 ─────────────────────────────────────────── */
const branch = git(["rev-parse", "--abbrev-ref", "HEAD"]);
if (branch === "HEAD") {
	out.push(`✖ 当前处于 detached HEAD 状态，没有分支可推 —— 先 git switch <分支>`);
	process.stdout.write(out.join("\n") + "\n");
	process.exit(1);
}
const dirty = git(["status", "--porcelain"]) || "";
out.push(`- 当前分支：${branch}`);
out.push(
	dirty
		? `- ⚠️ 工作区有未提交改动 ${dirty.split("\n").length} 项 —— 推送只影响已提交内容，未提交改动不会被同步（如需一并带上请先提交）`
		: `- 工作区干净 ✓`,
);

/* ── 2. 远程目标的"本地记录"与"权威实际值" ──────────────────────── */
const remoteRef = `${remote}/${target}`;
const recorded = git(["rev-parse", "--verify", "--quiet", remoteRef], { allowFail: true });
const actualLine = git(["ls-remote", remote, `refs/heads/${target}`], { allowFail: true }) || "";
const actual = actualLine ? actualLine.split(/\s+/)[0] : "";
out.push("");
out.push(`- 本地记录的 ${remoteRef}：${recorded ? recorded.slice(0, 8) : "（无，需先 git fetch）"}`);
out.push(`- 远程实际 ${target}：${actual ? actual.slice(0, 8) : "（取不到，可能网络/权限问题）"} ⚠️ 以这一行为准`);

/* ── 3. 关系判定（决定"快进推送"还是"必须先备份再强推"）─────────── */
const head = git(["rev-parse", "HEAD"]);
const isAncestor = (a, b) => git(["merge-base", "--is-ancestor", a, b], { allowFail: true }) !== null;
let verdict = "";
if (!actual) {
	verdict = "⚠️ 无法取得远程实际值（网络/权限）—— 先 `git fetch " + remote + "` 再跑本脚本";
} else if (head === actual) {
	verdict = "✓ 已同步：当前分支与远程 " + target + " 完全相同，无需推送";
} else if (isAncestor(actual, head)) {
	verdict = "✓ 可快进推送（fast-forward）：远程是当前分支的祖先，**不需要 force** ✓";
} else if (isAncestor(head, actual)) {
	verdict = "⚠️ 本地落后于远程：当前分支是远程的祖先 → 先 `git fetch` + 处理上游更新，别急着推";
} else {
	verdict = "✖ 两条线已分叉（无祖先关系）：直接推会被拒；**必须先建还原点 tag，再用 --force-with-lease 强推** ✗";
}
out.push("");
out.push(`- 判定：${verdict}`);

/* ── 4. 本次会推送的提交 ─────────────────────────────────────────── */
if (recorded) {
	const pending = git(["log", "--oneline", `${remoteRef}..HEAD`], { allowFail: true }) || "";
	const n = pending ? pending.split("\n").length : 0;
	out.push(`- 相比本地记录，本次将推送 **${n}** 个提交${n ? "：" : ""}`);
	for (const line of pending.split("\n").filter(Boolean).slice(0, 8)) out.push(`    ${line}`);
	if (n > 8) out.push(`    …… 其余 ${n - 8} 条省略`);
	// 远程实际值若与本地记录不同 ⇒ 说明有人/编辑器在此期间写过远程（lease 会因此失配）
	if (actual && actual !== recorded) {
		out.push(`- ⚠️ 远程实际值与本地记录**不一致**（本地记录过期）→ 请先 \`git fetch ${remote}\` 让本地记录追上，否则 --force-with-lease 会失败`);
	}
} else {
	out.push(`- 本地没有 ${remoteRef} 记录（未 fetch），无法列出待推送提交`);
}

/* ── 5. 上游（可选）：提醒本次同步是否夹带上游更新 ──────────────── */
if (git(["rev-parse", "--verify", "--quiet", upstreamRef], { allowFail: true })) {
	const upstreamPending = git(["log", "--oneline", `HEAD..${upstreamRef}`], { allowFail: true }) || "";
	const un = upstreamPending ? upstreamPending.split("\n").length : 0;
	out.push(`- 上游 ${upstreamRef} 领先当前分支 **${un}** 个提交${un ? "（如需一并带入：git merge " + upstreamRef + "）" : ""}`);
}

/* ── 6. 给出可直接复制的命令 ─────────────────────────────────────── */
out.push("");
out.push("─── 建议执行（复制即用）───");
if (!actual) {
	out.push(`git fetch ${remote}`);
	out.push(`node scripts/ours/sync-precheck.mjs`);
} else if (head === actual) {
	out.push(`# 无需推送 ✓`);
} else if (isAncestor(actual, head)) {
	out.push(`# 关键：推的是「当前分支 → ${target}」，**不要**写 \`git push ${remote} ${target}\`（那推的是本地 ${target} 分支 ✗）`);
	out.push(`git push ${remote} ${branch}:${target}`);
	out.push(`git branch -f ${target} ${branch}   # 同步本地 ${target} 引用，避免以后误用`);
} else if (isAncestor(head, actual)) {
	out.push(`git fetch ${remote} && git merge ${remoteRef}`);
	out.push(`node scripts/ours/sync-precheck.mjs`);
} else {
	out.push(`# 分叉场景：先建还原点（必须推到远程，否则旧历史不可达 ✗），再保护式强推`);
	out.push(`git tag backup-${target}-pre-sync <远程实际值> && git push ${remote} backup-${target}-pre-sync`);
	out.push(`git push ${remote} ${branch}:${target} --force-with-lease`);
	out.push(`git branch -f ${target} ${branch}`);
	out.push(`# 回滚：git push ${remote} backup-${target}-pre-sync:${target} --force`);
}

process.stdout.write("\n" + out.join("\n") + "\n");
