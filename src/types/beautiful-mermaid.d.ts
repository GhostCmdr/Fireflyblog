// beautiful-mermaid 为纯运行时依赖，无自带类型声明；mermaidConfig 用 keyof typeof THEMES 派生主题名
// 注意：此文件必须是"脚本文件"(无顶层 import/export)，declare module 才会作为 ambient(shim)生效，
// 不能放进带 export 的 global.d.ts(那会被当作"对已存在模块的增强"而失效)
declare module "beautiful-mermaid" {
	// biome-ignore lint/suspicious/noExplicitAny: 第三方运行时无类型，宽松声明
	const THEMES: Record<string, any>;

	export { THEMES };
}
