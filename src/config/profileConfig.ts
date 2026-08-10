import type { ProfileConfig } from "../types/profileConfig";

export const profileConfig: ProfileConfig = {
	// 头像
	// 图片路径支持三种格式：
	// 1. public 目录（以 "/" 开头，不优化）："/assets/images/avatar.webp"
	// 2. src 目录（不以 "/" 开头，自动优化但会增加构建时间，推荐）："assets/images/avatar.webp"
	// 3. 远程 URL："https://example.com/avatar.jpg"
	avatar: "assets/images/avatar.avif",

	// 名字
	name: "小埋SOS团长",

	// 个人签名
	bio: "地球Online资深独狼玩家",

	// 链接配置
	// 已经预装的图标集：fa7-brands，fa7-regular，fa7-solid，material-symbols，simple-icons
	// 访问https://icones.js.org/ 获取图标代码，
	// 如果想使用尚未包含相应的图标集，则需要安装它
	// `pnpm add @iconify-json/<icon-set-name>`
	// showName: true 时显示图标和名称，false 时只显示图标
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
        url: "https://space.bilibili.com/114421126",  // 替换为你的 B 站个人空间链接
        showName: false,
    	},
		{
			name: "GitHub",
			icon: "fa7-brands:github",
			url: "https://github.com/GhostCmdr",
			showName: false,
		},
		/*
		{
			name: "Email",
			icon: "fa7-solid:envelope",
			url: "mailto:3055401252@qq.com",
			showName: false,
		},
		*/
		{
			name: "RSS",
			icon: "fa7-solid:rss",
			url: "/rss/",
			showName: false,
		},
	],
};
