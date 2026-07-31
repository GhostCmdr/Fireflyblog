# 项目长期记忆（xiaomaiFirefly）

> 本文件汇总了编辑器壁纸冻结体系与樱花特效的历次修改，便于跨会话快速回顾。
> 原始逐日日志见 `.codebuddy/memory/2026-07-30.md` 与 `2026-07-31.md`（已并入本文件，可保留或删除）。

---

## 一、编辑器背景冻结体系（src/layouts/Layout.astro + src/styles/layout-styles.css）

### 1. 整体机制（务必理解的前提）
- 编辑器页面把主页壁纸"冻结"成一张背景图，避免 SPA 导航时重复重排/卡顿。
- 壁纸模式由 `data-wallpaper-mode` 属性 + `wallpaper-overlay` / `wallpaper-fullscreen` 等 CSS 类控制，由 `src/utils/setting-utils.ts` 的 `setWallpaperMode` 切换。
- 关键 CSS 事实：`.wallpaper-overlay` 的 1.05x 缩放写在**内部 img**（`transform: scale(1.05)`），wrapper 本身 `transform: none !important`；所以**不能给 wrapper 自身加 transform**，冻结必须用内层 layer。
- `.wallpaper-overlay` 自带 `opacity: 0.8` + `overflow: hidden`，半透明与裁切由它提供。

### 2. 已修复的编辑器壁纸 bug 时间线
| 问题 | 根因 | 修复 |
|------|------|------|
| 右侧溢出显示 | wrapper 宽度 `calc(100% - scrollbarWidth)` 改为 `100%` | 右侧 scrollbar 区自然露出原图溢出内容 |
| 拉伸轻微放大 | `querySelector('div#banner img')` 拿到 mobile img，wrapper 变全宽后 cover 算法放大 | 改用 `.banner-image-slot-desktop img`；隐藏 wrapper 内所有 img |
| 背景被隐藏（空白） | `lqip-placeholder` + `transition` 遮挡层未隐藏 | 加 `editor-frozen` class，注入 CSS 一并 `display:none` 三个遮挡层 |
| 背景变黑（轮播） | `#banner-images-container` 带 `bg-black` 盖住背景 | `editor-frozen` 下该容器 `background-color: transparent !important`（保留 display 保高度） |
| 切编辑器换图 | 轮播模式 freeze 取了 slide 0，主页已转到其他图 | img 选择器优先抓 `.slide-item.active.hidden.lg\:block img` |
| 右侧白边 | cover 用 `homeVW=innerWidth-scrollbarWidth` 但 wrapper=100%，右侧无图透白 | `homeVW` 改 `window.innerWidth`（代价：左侧约 7px 偏移） |
| 四边白色模糊边 | `filter:blur` 直接加在 wrapper（边界=视口）上，羽化暴露 | 见下"#editor-bg-layer 方案" |
| 比主页更糊 | 主页 fullscreen 无模糊，编辑器被强制 overlay 天生 blur | `editorSrcMode` 跟随主页 `_srcMode`，仅主页本身 overlay 才模糊 |
| 漂移/位移 | wrapper 上 Tailwind `transition duration-700` 动画化定位切换；强制 setWallpaperMode('overlay') 与主页模式不一致 | 编辑器加 `transition: none !important`；改为精确复现主页当前模式，不再强制 overlay |
| 左右不一致 | cover 硬编码 `object-position:center`，与主页自定义锚点不符 | 读取主页 img 真实 `object-position` 计算 `background-position` |

### 3. `#editor-bg-layer` 方案（消除四边白边）— 已落地
- 新增内层 `#editor-bg-layer`（CSS：`position:absolute; inset:0; transform-origin:center; pointer-events:none; will-change:transform; z-index:0`），置于视频 `#bg-player` 之下（`ww.firstChild`）。
- 背景图与 `filter:blur` 设到 layer；1.05 放大从 `background-size` 改为 `layer.style.transform='scale(1.05)'`（sw 仅做 cover）。放大的模糊羽化被 `.wallpaper-overlay` 的 `overflow:hidden` 裁掉，复刻主页。
- `ww` 不再设 background/filter，仅保留 `editor-frozen` 类。
- `unfreezeWallpaper` 改为 `ww.querySelector('#editor-bg-layer').remove()`。
- `syncEditorBgVideo`：播放时 `layer.style.display='none'` 露视频；停止时若 layer 不存在则重 freeze、否则 `display=''`。

### 4. 两种模式重构（仅全屏透明 / 纯色）— 已落地
- 需求：编辑器只保留两种背景——壁纸来源（横幅/全屏/透明）→「全屏透明」(overlay：1.05x+模糊)；纯色来源(none)→「纯色背景」。
- 实现：`Layout.astro` 移除 `content:replace` 钩子里旧编辑器块；模式转换集中到 `applyEditorModeLayout`（none→`setWallpaperMode('none')`，其余→`setWallpaperMode('overlay')`；`if (editorStyleEl) return` 保证只初始化一次）；`freezeWallpaperForEditor` 恒定 overlay（`overlayMode=true`、`scale=coverScale*1.05`、`filter=blur`）；freeze 调用用 `data-wallpaper-mode==='overlay'` 守卫，纯色来源不冻结。
- 关键事实复核：`.wallpaper-overlay` 的 1.05x 在内部 img，wrapper `transform:none`；freeze 隐藏 img 改用 wrapper background-size，1.05x 仅由 background-size 提供，无双重缩放。

### 5. 编辑器禁用横幅/全屏切换 + 背景视频按钮（DisplaySettingsIntegrated.svelte）— 已落地
- 根因：编辑器 `#wallpaper-wrapper` 被 `freezeWallpaperForEditor` 加了 `ww.style.filter='blur(...)'`，整层（含视频）一起被模糊 → 视频按钮失效。修复 `syncEditorBgVideo()`：编辑器 overlay 下播放时清 background/filter 露清晰视频，停止时重 freeze。
- `DisplaySettingsIntegrated.svelte` 新增 `isEditor` 状态 + `checkIsEditor()`（pathname === '/editor/' 或 '/editor'）；`onMount` 通过 `window.swup.hooks.on('page:view', checkIsEditor)`（未就绪则监听 `swup:enable` 一次性注册）及 `astro:page-load` 随导航更新。
- 横幅/全屏两按钮在编辑器加 `disabled` + 置灰 `style`；`switchWallpaperMode()` 与 `resetWallpaperMode()` 内拦截（编辑器内禁止切到 BANNER/FULLSCREEN；reset 时若默认是 BANNER/FULLSCREEN 则回退 OVERLAY）。编辑器仅支持 overlay/none。

### 6. 关键经验（避免重复踩坑）
- `homeVW` **必须用** `window.innerWidth - scrollbarWidth`（主页内容区宽），**不能用 `document.documentElement.clientWidth`**——freeze 在编辑器环境（无滚动条）执行，clientWidth 返回整窗宽会错位。`scrollbarWidth` 由 `applyEditorModeLayout` 用 `overflow:scroll` 的 div 测得。
- overlay 判定用 `document.documentElement.getAttribute('data-wallpaper-mode') === 'overlay'`（setWallpaperMode 内同步写入，早于 rAF 加类），消除 `classList.contains` 竞态。
- `unfreezeWallpaper` / `removeEditorModeLayout` 会清 wrapper 内联样式，离开编辑器不残留。

---

## 二、樱花特效开关跨页失效（src/components/features/SakuraEffect.astro）— 已落地

### 现象
主页开关正常；Swup 客户端导航到 /editor/、/albums/ 等页后开关失效，须刷新整页。

### 根因
- `SakuraEffect.astro` 的 `<script is:inline>` 渲染在 `<body>` 直属、Swup containers 之外；`astro.config.mjs` 未关 `reloadScripts`（默认 true），Swup 强制克隆并重跑内联脚本。
- 原代码 `window.sakuraManager = null` 写在 IIFE 守卫**之外**，每次重跑都清空管理器；紧接着 `if (window.sakuraInitialized) return` 拦住重建 → 管理器永久为 null、canvas 归零、监听器丢失。
- 设置面板 `DisplaySettingsIntegrated.svelte` 与 `setting-utils.ts` 派发 `sakuraToggle` 逻辑均正确，是接收端问题。`src/utils/sakura-manager.ts` 为死代码（零 import）。

### 修复（仅改 SakuraEffect.astro）
将 322–377 行（管理器声明、`initSakura`、IIFE 初始化、`sakuraToggle` 监听）整体包入 `if (!window.sakuraInitialized) { ... }` 守卫；`sakuraToggle` 回调增加 `if (!mgr)` 时按 localStorage 惰性重建兜底。**守卫末尾不要额外置 `window.sakuraInitialized = true`**，否则首次 `loading` 路径会提前置位、跳过真实初始化（标记交给 IIFE 内 `setupSakura`）。改动 lint 0 错误。

---

## 三、已删除/未采纳的方案
- `fix-editor-wallpaper-offset`（计划文件）：将 `homeVW` 从 `innerWidth` 改回 `innerWidth - scrollbarWidth` 以消左侧 7px 偏移。**状态 pending/未完成**，且与 7-30 已落地的 `homeVW=innerWidth` 方案冲突，未纳入正式代码，故丢弃该计划文件。
