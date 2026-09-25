// [OURS] 我方配置值集中文件
//
// 设计目的：上游的 `src/config/*.ts` 保持"上游默认值"，只在文件末尾用 mergeDeep 叠加本文件的值。
// 这样未来从上游更新时，我们只在这些配置文件里留 2~3 行 hook，冲突面极小。
//
// 合并语义（见下方 mergeDeep）：
//   - 对象：深合并（我方键覆盖，其余保留上游新默认值）
//   - 数组：整体替换（关键词/导航项/侧栏组件/友链等由我们完全掌控）
//   - 我方写 `undefined`：表示"删除上游该键"（用于上游有、我们不要的字段）

type AnyObj = Record<string, any>;

// 仅类型导入（无运行时代价）：给下面的数组加显式类型，确保结构写错时 astro check 能报出来
import type { BooknavGroup } from "../../types/booknavConfig";
import type { FriendLink } from "../../types/friendsConfig";
import type { GalleryAlbum } from "../../types/galleryConfig";
import type { ProfileConfig } from "../../types/profileConfig";

// 相册数据（JSON 数据源）：供 /gallery-admin/ 在线增删改；编辑器只改这个 json 文件
import galleryAlbums from "./gallery-albums.json";

// 【isolatedDeclarations / TS9017】本文件导出的对象里，数组字面量必须写 `as const`：
// 该修饰只在类型层生效，编译后不留痕迹，运行时行为完全不变。
// 若该导出本身能引用上游类型（如 oursFriendsConfig / oursBooknavConfig），
// 则优先用显式类型标注（顺带让 astro check 校验结构），无需 as const。

/** 深合并：对象合并、数组替换、undefined=删除键 */
export function mergeDeep<T extends AnyObj>(
	base: T,
	override: AnyObj | undefined,
): T {
	if (!override) return base;
	const out: AnyObj = Array.isArray(base)
		? [...(base as any)]
		: { ...(base as AnyObj) };
	for (const [k, v] of Object.entries(override)) {
		if (v === undefined) {
			delete out[k];
			continue;
		}
		const cur = out[k];
		if (
			v &&
			typeof v === "object" &&
			!Array.isArray(v) &&
			cur &&
			typeof cur === "object" &&
			!Array.isArray(cur)
		) {
			out[k] = mergeDeep(cur as AnyObj, v as AnyObj);
		} else {
			out[k] = v;
		}
	}
	return out as T;
}

/* ────────────────────────── siteConfig ────────────────────────── */
export const oursSiteConfig = {
	title: "小埋小站",
	subtitle: "埋学研究员",
	site_url: "https://xiaomaisos.me",
	description: "本站致力于研究生活中的埋学事件",
	keywords: ["SOS团长", "地球Online资深玩家", "独狼玩家", "埋学生活"] as const,
	// 标签页图标（浏览器窗口左上角）：合并上游 6.16.x 时该键被上游默认值覆盖成 /favicon/firefly-32.png，
	// 而我方原图标 public/favicon/favicon.ico 一直没被动过（blob 与合并前一致）→ 这里显式指回。
	// 数组 → 整体替换（mergeDeep 语义），写一项即可，不依赖上游数组内容。
	// 注：Layout.astro 对以 "/" 开头的 src 会走 url() 加 basePath，请勿改成 src/assets 相对路径。
	favicon: [{ src: "/favicon/favicon.ico" }] as const,
	navbar: {
		// 站点图标（src 目录，构建时自动优化）
		logo: { value: "assets/images/xiaomai.png" },
		title: "小埋小站",
	},
	siteStartDate: "2026-06-30",
	pages: {
		// 上游 6.16.x 起把「追番(anime)」拆分为 bilibili / myanimelist / vndb 三个页面
		bilibili: true,
		bangumi: false,
	},
	// [OURS] 上游 6.16.x 已把 Bilibili 配置从旧结构 `anime.bilibili.uid` 迁到**顶层 `bilibili.uid`**；
	// 我们原先仍写在旧键上 → 不生效，追番页用的是上游默认 uid(38932988)。2026-09-16 修正为顶层键。
	bilibili: {
		uid: "114421126",
	},
	// 文章列表布局：我方自定义了 meta / stats / tagsPosition / showStatsIcons 等显示控制项
	postListLayout: {
		descriptionLines: 2,
		showStatsIcons: true,
		tagsPosition: "bottom" as "meta" | "bottom",
		meta: {
			showPublished: true,
			showCategory: true,
			showTags: true,
			tagCount: 5,
			showWords: false,
			showReadingTime: false,
		},
		stats: {
			showPublished: true,
			showWords: true,
			showReadingTime: true,
		},
	},
};

/* ────────────────────────── commentConfig ────────────────────────── */
export const oursCommentConfig = {
	type: "waline",
	waline: {
		serverURL: "https://waline.xiaomaisos.me/",
		// 表情反应（B站表情）
		reaction: [
			"https://unpkg.com/@waline/emojis@1.4.0/bilibili/bb_look_down.png",
			"https://unpkg.com/@waline/emojis@1.4.0/bilibili/bb_trollface.png",
			"https://unpkg.com/@waline/emojis@1.4.0/bilibili/bb_antic.png",
			"https://unpkg.com/@waline/emojis@1.4.0/bilibili/bb_think.png",
			"https://unpkg.com/@waline/emojis@1.4.0/bilibili/bb_spit_blodd.png",
		] as const,
		locale: {
			reactionTitle: "(๑˃ᴗ˂)ﻭ 求一连！投个币嘛~",
			reaction0: "求",
			reaction1: "一",
			reaction2: "个",
			reaction3: "投",
			reaction4: "币",
		},
	},
};

/* ────────────────────────── musicConfig ────────────────────────── */
export const oursMusicConfig = {
	// 使用本地自动扫描模式（播放列表由 scripts/generate-music-playlist.mjs 生成）
	mode: "auto",
	auto: {
		playlistPath: "/assets/music/playlist.json",
	},
	// [OURS] 歌词按钮开关：上游 6.16.8 把默认值从 `true` 改成了 `false`
	// （合并前 backup/pre-upstream-port-20260912 版本为 true），我方未显式覆盖 →
	// 按钮整体消失。按「凡想长期控制的值必须写进 ours/values.ts」的约定在此固定为 true。
	// MusicManager.astro 取值 `config.showLyrics ?? true`；单曲是否有歌词仍取决于是否存在同名 .lrc/.txt。
	showLyrics: true,
};

/* ────────────────────────── 共用链接常量 ────────────────────────── */
// QQ 群分享链接（供侧栏个人资料 links 使用），集中一处便于维护。
// 注：首页横幅 common.homeText.links 因所在数组必须写 `as const`（isolatedDeclarations，
//     且该处无法用上游类型标注 —— BackgroundWallpaperConfig 的 mode/src/homeText.enable 均必填），
//     `as const` 数组内不能引用任何标识符 ⇒ 那里内联了同一个 URL。改链接时请同时更新两处。
const QQ_GROUP_URL =
	"https://qun.qq.com/universal-share/share?ac=1&authKey=6xUUPggAwydgR5HmPw88VpNvuT4IEfJUqTPneDfVeVOPS0eXKNIkmcQSdNhW%2BIdH&busi_data=eyJncm91cENvZGUiOiI4OTc0NTAwNzYiLCJ0b2tlbiI6ImpPaFZtaFdHOG91Y1JIRnNjVWdjbGVvaHBVaWFqeUtIU3hNeVZUMlNqSmNsMWFRSXNSNnVFOGVvelE2WG9qNWoiLCJ1aW4iOiIyNTI4NjM5NjYzIn0%3D&data=oK3veCc2W6Fd28QQJnEwKFlvlHhdZuuT0xpF4vvNCs0eGTYVDehw23dKD-JBBPvAw0wNy4Z6fm-j1dZrgHYeQA&svctype=4&tempid=h5_group_info";

/* ────────────────────────── backgroundWallpaper ────────────────────────── */
export const oursBackgroundWallpaper = {
	common: {
		homeText: {
			title: "埋学生",
			subtitle: [
				"埋学生活，埋学人生",
				"研究埋学事件，探索埋学世界",
				"地球Online资深独狼玩家",
				"享受生活，享受埋学",
			] as const,
			// 首页横幅标题下方的链接按钮（数组 → 整体替换）。
			// ⚠️ 上游 6.16.x 新增了这个 links 数组且默认指向 CuteLeaf（GitHub / Email / Sponsor / RSS），
			//    合并时我方没有覆盖它 → 点开全是上游地址（2026-09-16 修）。
			// 这里改为我方地址，与下方 oursProfileConfig.links 保持一致；图标名沿用上游的 Iconify 写法。
			links: [
				{
					name: "GitHub",
					icon: "fa7-brands:github",
					url: "https://github.com/GhostCmdr",
					showName: true,
				},
				{
					name: "QQ群",
					icon: "fa7-brands:qq",
					url: "https://qun.qq.com/universal-share/share?ac=1&authKey=6xUUPggAwydgR5HmPw88VpNvuT4IEfJUqTPneDfVeVOPS0eXKNIkmcQSdNhW%2BIdH&busi_data=eyJncm91cENvZGUiOiI4OTc0NTAwNzYiLCJ0b2tlbiI6ImpPaFZtaFdHOG91Y1JIRnNjVWdjbGVvaHBVaWFqeUtIU3hNeVZUMlNqSmNsMWFRSXNSNnVFOGVvelE2WG9qNWoiLCJ1aW4iOiIyNTI4NjM5NjYzIn0%3D&data=oK3veCc2W6Fd28QQJnEwKFlvlHhdZuuT0xpF4vvNCs0eGTYVDehw23dKD-JBBPvAw0wNy4Z6fm-j1dZrgHYeQA&svctype=4&tempid=h5_group_info",
				},
				{
					name: "Bilibili",
					icon: "fa7-brands:bilibili",
					url: "https://space.bilibili.com/114421126",
				},
				{
					name: "RSS",
					icon: "fa7-solid:rss",
					url: "/rss/",
				},
			] as const,
		},
	},
};

/* ────────────────────────── profileConfig ────────────────────────── */
// 注意：links 为数组 → 整体替换（我方完全掌控；上游新增的默认链接不会出现）
export const oursProfileConfig: ProfileConfig = {
	name: "小埋SOS团长",
	bio: "地球Online资深独狼玩家",
	// ⚠️ 数组顺序 = 侧栏个人资料里图标的显示顺序（从左到右）
	// 2026-09-16：按用户要求互换 GitHub 与 QQ，再互换 QQ 与 Bilibili
	// 现顺序：GitHub → QQ → Bilibili → RSS（与首页横幅标题下方的 links 顺序保持一致）
	links: [
		{
			name: "GitHub",
			icon: "fa7-brands:github",
			url: "https://github.com/GhostCmdr",
			showName: false,
		},
		{
			name: "qq",
			icon: "fa7-brands:qq",
			url: QQ_GROUP_URL,
			showName: false,
		},
		{
			name: "Bilibili",
			icon: "fa7-brands:bilibili",
			url: "https://space.bilibili.com/114421126",
			showName: false,
		},
		{
			name: "RSS",
			icon: "fa7-solid:rss",
			url: "/rss/",
			showName: false,
		},
	],
};

/* ────────────────────────── friendsConfig ────────────────────────── */
export const oursFriendsPageConfig = {
	description: "这是我的友链页面，欢迎互相访问友链",
};

// 数组 → 整体替换
// [OURS] 本数组支持「网站端就地编辑」：在 /friends/ 页面配置 GitHub Token 后会出现「编辑友链」按钮。
// ⚠️ 编辑器会**整块重写方括号内的内容** ⇒ 注释一律写在数组外部，方括号内保持纯数据。
//    字段顺序固定：title → imgurl → desc → siteurl → tags → weight → enabled（weight 由编辑器按顺序自动生成）。
//    声明行必须保留 `: FriendLink[]` 显式类型标注（isolatedDeclarations 要求，见文件顶部说明）。
// 图标填法：站点图标用 `https://a.favicon.im/<对方域名>`（与书签导航 booknavConfig 同一服务 ✓）；
//          若友链是某个人的主页（如 GitHub），也可直接填其头像地址 ✓
export const oursFriendsConfig: FriendLink[] = [
	{
		title: "小埋团长",
		imgurl: "https://a.favicon.im/xiaomaisos.me",
		desc: "小埋团长的博客",
		siteurl: "https://xiaomaisos.me",
		tags: ["Blog"],
		weight: 3,
		enabled: false,
	},
	{
		title: "测试专用1",
		imgurl:
			"https://ubiservices.cdn.ubi.com/77560d22-668e-40ad-a445-69ae77826b40/upload/b2f82519_2cab_4b0c_986d_fe47903c8e35.png?rs=146",
		desc: "测试",
		siteurl: "https://www.ubisoft.com/en-gb/account/account-information",
		tags: ["大大", "哒哒哒", "大大", "dada1", "dadda1"],
		weight: 2,
		enabled: false,
	},
	{
		title: "GitHub",
		imgurl: "https://avatars.githubusercontent.com/u/115412785?v=4",
		desc: "小埋团长的主页",
		siteurl: "https://github.com/GhostCmdr",
		tags: ["Web"],
		weight: 1,
		enabled: true,
	},
];

/* ────────────────────────── booknavConfig（书签导航页 /booknav/）────────────────────────── */
// 数组 → 整体替换（与 friendsConfig 同一套做法：上游的示例书签不再使用）
// 分组按 weight 降序排列，组内条目同样按 weight 降序（权重越大越靠前）
// 条目不填 icon → 由 booknavPageConfig.favicon.api 自动抓目标站点图标（当前已启用）
export const oursBooknavConfig: BooknavGroup[] = [
	{
		id: "dev",
		name: "开发",
		icon: "material-symbols:code-rounded",
		desc: "写代码时常用的站点",
		weight: 100,
		items: [
			{
				title: "GitHub",
				url: "https://github.com/",
				desc: "全球最大的代码托管平台",
				weight: 10,
			},
			{
				title: "VScode",
				url: "https://code.visualstudio.com/",
				desc: "Visual Studio Code 代码编辑器",
				weight: 9,
			},
			{
				title: "JETBRAINS",
				url: "https://www.jetbrains.com.cn/",
				desc: "JetBrains 全家桶（IDEA / PyCharm / WebStorm…）",
				weight: 8,
			},
		],
	},
	{
		id: "ai",
		name: "AI工具",
		icon: "material-symbols:smart-toy",
		desc: "常用大模型与 AI 工具",
		weight: 90,
		items: [
			{
				title: "DeepSeek",
				url: "https://chat.deepseek.com/",
				desc: "DeepSeek 对话",
				weight: 10,
			},
			{
				title: "ChatGPT",
				url: "https://chatgpt.com/",
				desc: "OpenAI ChatGPT",
				weight: 9,
			},
			{
				title: "Claude",
				url: "https://claude.ai/downloads",
				desc: "Anthropic Claude（下载页）",
				weight: 8,
			},
			{
				title: "WorkBuddy",
				url: "https://www.workbuddy.cn/app",
				desc: "AI 效率工具",
				weight: 7,
			},
			{
				title: "MiMo",
				url: "https://mimo.mi.com/",
				desc: "小米 MiMo 大模型",
				weight: 6,
			},
		],
	},
	{
		id: "anime",
		name: "动漫",
		icon: "material-symbols:movie",
		desc: "追番与在线动漫",
		weight: 80,
		items: [
			{
				title: "Bilibili",
				url: "https://www.bilibili.com/",
				desc: "哔哩哔哩弹幕网",
				weight: 10,
			},
			{
				title: "樱花动漫",
				url: "https://www.yinhuadm.one/",
				desc: "在线动漫",
				weight: 9,
			},
			{
				title: "次元城动漫",
				url: "https://www.cycani.org/",
				desc: "在线动漫",
				weight: 8,
			},
			{
				title: "OmoFun动漫",
				url: "https://www.omofuns.com/",
				desc: "在线动漫",
				weight: 7,
			},
			{
				title: "AGE动漫",
				url: "https://rentry.org/agefans",
				desc: "AGE 动漫地址发布页",
				weight: 6,
			},
			{
				title: "片库网",
				url: "https://www.988lm.com",
				desc: "在线影视",
				weight: 5,
			},
		],
	},
];

/* ────────────────────────── sidebarConfig ────────────────────────── */
// 数组 → 整体替换（左右侧栏与移动端底部组件的启用/顺序由我方完全掌控）
// 注意：不含已废弃的 homePageOnly 字段（2026-09-14 决定删除）
export const oursSidebarConfig = {
	leftComponents: [
		{ type: "profile", enable: true, position: "top", showOnPostPage: true },
		{
			type: "announcement",
			enable: true,
			position: "top",
			showOnPostPage: false,
		},
		{
			type: "categories",
			enable: true,
			position: "sticky",
			showOnPostPage: true,
			specificConfig: { collapseThreshold: 5 },
		},
		{
			type: "tags",
			enable: true,
			position: "sticky",
			showOnPostPage: true,
			specificConfig: { collapseThreshold: 10 },
		},
		{ type: "stats", enable: true, position: "sticky", showOnPostPage: false },
	] as const,
	rightComponents: [
		// [OURS] 最新动态（上游新增侧栏组件，2026-09-16 启用）：右栏第一块、在音乐播放器上方。
		// position: "top" = 不吸附（随页面滚动看，滚上去就离开视口）；默认显示最近 3 条
		// （未配 specificConfig.dynamic.limit → 组件默认 3 条）。
		// 数据来自 /api/dynamic.json（由 src/content/dynamic/*.md 生成）：
		// 当前动态为空（上游示例已清）→ 会显示空态「还没有发布动态」，发一条动态后即有内容。
		{ type: "dynamic", enable: true, position: "top", showOnPostPage: true },
		{ type: "music", enable: true, position: "sticky", showOnPostPage: true },
		{
			type: "calendar",
			enable: true,
			showTitle: false,
			position: "sticky",
			showOnPostPage: false,
			specificConfig: { calendar: { showHeatmap: true } },
		},
		{
			type: "sidebarToc",
			enable: true,
			position: "sticky",
			showOnPostPage: true,
			hideOnNonPostPage: true,
		},
		{
			type: "siteInfo",
			enable: true,
			position: "sticky",
			showOnPostPage: false,
			specificConfig: { siteInfo: { unknownBuildPlatform: "Unknown CI" } },
		},
		{
			type: "advertisement",
			enable: false,
			showTitle: false,
			position: "sticky",
			showOnPostPage: true,
			specificConfig: {
				ad: {
					image: {
						src: "/assets/images/ad/ad1.webp",
						alt: "广告横幅",
						link: "https://haoka.lot-ml.com/plugreg.html?agentid=1423316",
						external: true,
					},
					closable: false,
					displayCount: -1,
					padding: { all: "1rem" },
				},
			},
		},
		{
			type: "advertisement",
			enable: false,
			position: "sticky",
			showOnPostPage: true,
			specificConfig: {
				ad: {
					title: "支持博主",
					content:
						"如果您觉得本站内容对您有帮助，欢迎支持我们的创作！您的支持是我们持续更新的动力。",
					link: { text: "支持一下", url: "about/", external: false },
					closable: false,
					displayCount: -1,
				},
			},
		},
	] as const,
	mobileBottomComponents: [
		// [OURS] 最新动态：与桌面右栏一致放到最前（移动端底部栏没有 position 字段）
		{ type: "dynamic", enable: true, showOnPostPage: true },
		{ type: "profile", enable: true, showOnPostPage: true },
		{ type: "announcement", enable: true, showOnPostPage: true },
		{ type: "music", enable: true, showOnPostPage: true },
		{
			type: "categories",
			enable: true,
			showOnPostPage: true,
			specificConfig: { collapseThreshold: 5 },
		},
		{
			type: "tags",
			enable: true,
			showOnPostPage: true,
			specificConfig: { collapseThreshold: 10 },
		},
		{ type: "stats", enable: true, showOnPostPage: true },
		{
			type: "siteInfo",
			enable: true,
			showOnPostPage: true,
			specificConfig: { siteInfo: { unknownBuildPlatform: "Unknown CI" } },
		},
	] as const,
};

/* ────────────────────────── navBarConfig ────────────────────────── */
// links 为数组 → 整体替换（导航项由我方完全掌控）
// 这里内联写全量导航项（不复用 navBarConfig.ts 的 LinkPresets，避免循环引用）
export const oursNavBarConfig = {
	links: [
		{ name: "主页", url: "/", icon: "material-symbols:home" },
		{
			name: "文章",
			url: "#",
			icon: "material-symbols:article",
			children: [
				{ name: "归档", url: "/archive/", icon: "material-symbols:archive" },
				{
					name: "分类",
					url: "/categories/",
					icon: "material-symbols:folder-open-rounded",
				},
				{ name: "标签", url: "/tags/", icon: "material-symbols:tag-rounded" },
				// [OURS] 系列（上游新增页面）：入口之前缺失。位置/名称/图标与上游 LinkPresets.Series 一致
				// （上游把「系列」放在「文章」组里，紧跟「标签」）。上游该预设无 pageKey，故此处也不写。
				{ name: "系列", url: "/series/", icon: "material-symbols:layers" },
				{ name: "写文章", url: "/editor/", icon: "material-symbols:edit-note" },
			],
		},
		// [OURS] 社交分组：与上游结构一致（上游 navBarConfig 的「社交」= 友链 + 留言）
		{
			name: "社交",
			url: "#",
			icon: "material-symbols:group",
			children: [
				{
					name: "友链",
					url: "/friends/",
					icon: "material-symbols:link-2-rounded",
					pageKey: "friends",
				},
				{
					name: "留言",
					url: "/guestbook/",
					icon: "material-symbols:chat",
					pageKey: "guestbook",
				},
			],
		},
		{
			name: "我的",
			url: "#",
			icon: "material-symbols:person",
			children: [
				// [OURS] 动态（上游新增页面）：数据由 src/pages/api/dynamic.json.ts 从
				// src/content/dynamic/*.md 生成，入口之前一直缺失（我方自定义导航没列它）
				{
					name: "动态",
					url: "/dynamic/",
					icon: "material-symbols:forum-rounded",
					pageKey: "dynamic",
				},
				// [OURS] 项目展示（上游新增页面）：入口之前缺失；内容由 src/content/projects/*.md 提供
				{
					name: "项目",
					url: "/projects/",
					icon: "material-symbols:rocket-launch",
					pageKey: "projects",
				},
				{
					name: "相册",
					url: "/gallery/",
					icon: "material-symbols:photo-library",
					pageKey: "gallery",
				},
				// [OURS] 上游已把 /anime/ 拆为 /bilibili/ 等页面；名称对齐上游预设「哔哩哔哩」（2026-09-16）
				{
					name: "哔哩哔哩",
					url: "/bilibili/",
					icon: "fa7-brands:bilibili",
					pageKey: "bilibili",
				},
				{
					name: "番组计划",
					url: "/bangumi/",
					icon: "material-symbols:movie",
					pageKey: "bangumi",
				},
				// [OURS] 书签导航（上游新增页面）：pageKey 会让该入口随 siteConfig.pages.booknav 自动显隐
				{
					name: "书签导航",
					url: "/booknav/",
					icon: "material-symbols:bookmarks",
					pageKey: "booknav",
				},
			],
		},
		{
			name: "关于",
			url: "#",
			icon: "material-symbols:info",
			children: [
				{
					name: "打赏",
					url: "/sponsor/",
					icon: "material-symbols:favorite",
					pageKey: "sponsor",
				},
				{ name: "关于我", url: "/about/", icon: "material-symbols:person" },
			],
		},
		{
			name: "链接",
			url: "#",
			icon: "material-symbols:link",
			children: [
				{
					name: "GitHub",
					url: "https://github.com/GhostCmdr",
					external: true,
					icon: "fa7-brands:github",
				},
				{
					name: "Gitee",
					url: "https://gitee.com/ghostwebdata",
					external: true,
					icon: "fa7-brands:gitee",
				},
				{
					name: "CSDN",
					url: "https://blog.csdn.net/qq_49525131?type=blog",
					external: true,
					icon: "material-symbols:copyright",
				},
				{
					name: "博客园",
					url: "https://home.cnblogs.com/u/3321696",
					external: true,
					icon: "material-symbols:article",
				},
			],
		},
	] as const,
};

/* ────────────────────────── Fancybox（图片灯箱）选项 ────────────────────────── */
// 我方关闭了动画/快捷键并精简工具栏；写 undefined = 删除上游该键
export const oursFancyboxOptions = {
	Thumbs: { autoStart: false, showOnStart: "no" },
	Toolbar: {
		display: {
			// isolatedDeclarations 下的导出对象：数组字面量须 as const（纯类型层，运行时不变）
			middle: ["zoomIn", "zoomOut", "toggle1to1"] as const,
			right: ["close"] as const,
		},
	},
	zoomEffect: false, // 禁用缩略图→全屏的缩放动画
	fadeEffect: false, // 禁用 UI 淡入
	showClass: false, // 禁用打开动画
	hideClass: false, // 禁用关闭动画
	dragToClose: false,
	Carousel: { transition: "none", preload: 1 },
	keyboard: {
		Delete: undefined,
		Backspace: undefined,
		PageUp: undefined,
		PageDown: undefined,
	},
	animated: undefined, // 上游默认开启，我方不要
};

/* ────────────────────────── galleryConfig ────────────────────────── */
// 相册数据已抽出为 JSON（gallery-albums.json），供 /gallery-admin/ 在线增删改；
// 这里用显式类型标注（而非 as const）满足 isolatedDeclarations：见文件顶部说明。
export const oursGalleryConfig: { albums: GalleryAlbum[] } = {
	albums: galleryAlbums,
};

/* ────────────────────────── displaySettingsConfig ────────────────────────── */
// 显示设置面板总开关：上游默认 false（为省体积，官方建议生产关闭），我方需要该面板
// 来切换"壁纸模式/主题色/文章布局/特效"，故在本地开启。
// 注意：只覆盖 enable 一项，其余子开关沿用上游默认（resolveDisplaySettingsConfig 会把
// enable=false 解析成"全部子项关闭"的整份禁用配置，所以必须在配置层开启而不是事后覆盖）。
export const oursDisplaySettingsConfig = {
	enable: true,
};
