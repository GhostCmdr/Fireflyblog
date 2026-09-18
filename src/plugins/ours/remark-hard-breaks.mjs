/**
 * [OURS] GFM 风格硬换行（等价于 remark-breaks），**无第三方依赖**。
 *
 * 作用：把段落内的软换行（`text` 节点里的 `\n`）转成 mdast 的 `break` 节点 → 渲染成 `<br>`。
 *      效果与 GitHub / Obsidian（非严格换行）一致：**单个换行即换行**；空行仍然是段落分隔。
 *
 * 为什么自写而不装 remark-breaks：
 *   1) 不新增依赖 → 不动 package.json / pnpm-lock.yaml，减少与上游的依赖冲突面；
 *   2) 逻辑只有十几行，行为可控（只在 text 节点上拆分，代码块/行内代码天然不受影响）。
 *
 * 覆盖范围：
 *   - 会处理：段落、列表项、引用、表格单元格等所有含 text 子节点的地方
 *   - 不会处理：代码块（code/inlineCode 节点没有 children，本插件不进入）
 */
export default function remarkHardBreaks() {
	return (tree) => walk(tree);
}

/** 把一个含 \n 的文本节点拆成 文本/break/文本… 序列 */
function splitText(value) {
	const out = [];
	const lines = String(value).split("\n");
	for (let i = 0; i < lines.length; i++) {
		if (i > 0) out.push({ type: "break" });
		if (lines[i] !== "") out.push({ type: "text", value: lines[i] });
	}
	return out;
}

/** 深度遍历，就地替换含 \n 的 text 节点 */
function walk(node) {
	if (!node || !Array.isArray(node.children)) return;
	const next = [];
	for (const child of node.children) {
		if (
			child &&
			child.type === "text" &&
			typeof child.value === "string" &&
			child.value.includes("\n")
		) {
			next.push(...splitText(child.value));
		} else {
			walk(child);
			next.push(child);
		}
	}
	node.children = next;
}
