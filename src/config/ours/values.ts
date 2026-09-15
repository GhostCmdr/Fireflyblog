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

/** 深合并：对象合并、数组替换、undefined=删除键 */
export function mergeDeep<T extends AnyObj>(base: T, override: AnyObj | undefined): T {
	if (!override) return base;
	const out: AnyObj = Array.isArray(base) ? [...(base as any)] : { ...(base as AnyObj) };
	for (const [k, v] of Object.entries(override)) {
		if (v === undefined) {
			delete out[k];
			continue;
		}
		const cur = out[k];
		if (v && typeof v === "object" && !Array.isArray(v) && cur && typeof cur === "object" && !Array.isArray(cur)) {
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
	keywords: ["SOS团长", "地球Online资深玩家", "独狼玩家", "埋学生活"],
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
	anime: {
		bilibili: { uid: "114421126" },
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
		],
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
};

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
			],
		},
	},
};

/* ────────────────────────── profileConfig ────────────────────────── */
// 注意：links 为数组 → 整体替换（我方完全掌控；上游新增的默认链接不会出现）
export const oursProfileConfig = {
	name: "小埋SOS团长",
	bio: "地球Online资深独狼玩家",
	links: [
		{
			name: "qq",
			icon: "fa7-brands:qq",
			url: "https://qun.qq.com/universal-share/share?ac=1&authKey=6xUUPggAwydgR5HmPw88VpNvuT4IEfJUqTPneDfVeVOPS0eXKNIkmcQSdNhW%2BIdH&busi_data=eyJncm91cENvZGUiOiI4OTc0NTAwNzYiLCJ0b2tlbiI6ImpPaFZtaFdHOG91Y1JIRnNjVWdjbGVvaHBVaWFqeUtIU3hNeVZUMlNqSmNsMWFRSXNSNnVFOGVvelE2WG9qNWoiLCJ1aW4iOiIyNTI4NjM5NjYzIn0%3D&data=oK3veCc2W6Fd28QQJnEwKFlvlHhdZuuT0xpF4vvNCs0eGTYVDehw23dKD-JBBPvAw0wNy4Z6fm-j1dZrgHYeQA&svctype=4&tempid=h5_group_info",
			showName: false,
		},
		{
			name: "Bilibili",
			icon: "fa7-brands:bilibili",
			url: "https://space.bilibili.com/114421126",
			showName: false,
		},
		{
			name: "GitHub",
			icon: "fa7-brands:github",
			url: "https://github.com/GhostCmdr",
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
export const oursFriendsConfig = [
	{
		title: "小埋团长",
		imgurl:
			"https://weavatar.com/avatar/d252655d40d6874417a720bad0a6c5f77f8f6a1fd2f882f8f338402dc37e4190?s=640",
		desc: "小埋团长的博客",
		siteurl: "https://xiaomaisos.me",
		tags: ["Blog"],
		weight: 10,
		enabled: true,
	},
	{
		title: "GitHub",
		imgurl:
			"https://github.githubassets.com/images/modules/logos_page/GitHub-Mark.png",
		desc: "小埋团长的主页",
		siteurl: "https://github.com/GhostCmdr",
		tags: ["Web"],
		weight: 9,
		enabled: true,
	},
];

/* ────────────────────────── sidebarConfig ────────────────────────── */
// 数组 → 整体替换（左右侧栏与移动端底部组件的启用/顺序由我方完全掌控）
// 注意：不含已废弃的 homePageOnly 字段（2026-09-14 决定删除）
export const oursSidebarConfig = {
	leftComponents: [
		{ type: "profile", enable: true, position: "top", showOnPostPage: true },
		{ type: "announcement", enable: true, position: "top", showOnPostPage: false },
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
	],
	rightComponents: [
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
	],
	mobileBottomComponents: [
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
	],
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
				{ name: "分类", url: "/categories/", icon: "material-symbols:folder-open-rounded" },
				{ name: "标签", url: "/tags/", icon: "material-symbols:tag-rounded" },
				{ name: "写文章", url: "/editor/", icon: "material-symbols:edit-note" },
			],
		},
		{ name: "友链", url: "/friends/", icon: "material-symbols:group", pageKey: "friends" },
		{ name: "留言", url: "/guestbook/", icon: "material-symbols:chat", pageKey: "guestbook" },
		{
			name: "我的",
			url: "#",
			icon: "material-symbols:person",
			children: [
				{ name: "相册", url: "/gallery/", icon: "material-symbols:photo-library", pageKey: "gallery" },
				// [OURS] 上游已把 /anime/ 拆为 /bilibili/(哔哩哔哩) 等页面 → 追番指向新路由
				{ name: "追番", url: "/bilibili/", icon: "fa7-brands:bilibili", pageKey: "bilibili" },
				{ name: "番组计划", url: "/bangumi/", icon: "material-symbols:movie", pageKey: "bangumi" },
			],
		},
		{
			name: "关于",
			url: "#",
			icon: "material-symbols:info",
			children: [
				{ name: "打赏", url: "/sponsor/", icon: "material-symbols:favorite", pageKey: "sponsor" },
				{ name: "关于我", url: "/about/", icon: "material-symbols:person" },
			],
		},
		{
			name: "链接",
			url: "#",
			icon: "material-symbols:link",
			children: [
				{ name: "GitHub", url: "https://github.com/GhostCmdr", external: true, icon: "fa7-brands:github" },
				{ name: "Gitee", url: "https://gitee.com/ghostwebdata", external: true, icon: "fa7-brands:gitee" },
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
	],
};

/* ────────────────────────── Fancybox（图片灯箱）选项 ────────────────────────── */
// 我方关闭了动画/快捷键并精简工具栏；写 undefined = 删除上游该键
export const oursFancyboxOptions = {
	Thumbs: { autoStart: false, showOnStart: "no" },
	Toolbar: {
		display: {
			middle: ["zoomIn", "zoomOut", "toggle1to1"],
			right: ["close"],
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
// 数组 → 整体替换
export const oursGalleryConfig = {
	albums: [
		{
			id: "测试相簿",
			name: "测试相簿",
			description: "测试1",
			location: "网页",
			date: "2026-07-21",
			tags: ["异次元", "测试", "相册"],
		},
		{
			id: "封面上传相册测试",
			cover: "/gallery/封面上传相册测试/cover.jpg",
			name: "封面上传相册测试",
			description: "封面设置ghost",
			location: "hub20260101",
			date: "2026-07-23",
			tags: ["测试", "封面", "时间", "设置"],
		},
		{
			id: "封面上传相册测试222",
			cover: "/gallery/封面上传相册测试222/cover.png",
			name: "封面上传相册测试222",
			description: "封面设置ghost",
			location: "hub20260101",
			date: "2026-07-23",
			tags: ["测试", "封面", "时间", "设置"],
		},
	],
};
