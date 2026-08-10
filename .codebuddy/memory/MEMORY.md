# 项目长期记忆（xiaomaiFirefly）

> 本文件是唯一的记忆主文件，已合并原 `2026-07-31.md` / `2026-08-01.md` 的全部内容。
> 逐日日志已并入本章节，不再单独保留日期文件。

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
| 比主页更糊 | 主页 fullscreen 无模糊，编辑器被强制 overlay 天生 blur | 早期 `editorSrcMode` 跟随主页来源二选一；**2026-08-04 改为统一跟随全局 `--overlay-blur`**（见 3b），不再按来源区分 |
| 漂移/位移 | wrapper 上 Tailwind `transition duration-700` 动画化定位切换；强制 setWallpaperMode('overlay') 与主页模式不一致 | 编辑器加 `transition: none !important`；改为精确复现主页当前模式，不再强制 overlay |
| 左右不一致 | cover 硬编码 `object-position:center`，与主页自定义锚点不符 | 读取主页 img 真实 `object-position` 计算 `background-position` |

### 3. `#editor-bg-layer` 方案（消除四边白边）— 已落地
- 新增内层 `#editor-bg-layer`（CSS：`position:absolute; inset:0; transform-origin:center; pointer-events:none; z-index:0`），置于视频 `#bg-player` 之下（`ww.firstChild`）。
- 背景图与 `filter:blur` 设到 layer；1.05 放大由 `background-size` 烘焙（`sw*1.05 × sh*1.05` + `bgX/bgY` 同步用放大后值重算），**不再用 `transform:scale`**。
- `ww` 不再设 background/filter，仅保留 `editor-frozen` 类。
- `unfreezeWallpaper` 改为 `ww.querySelector('#editor-bg-layer').remove()`。
- `syncEditorBgVideo`：播放时 `layer.style.display='none'` 露视频；停止时若 layer 不存在则重 freeze、否则 `display=''`。

### 3b. 编辑器输入卡顿修复（2026-08-04 落地）
- **现象**：主页全屏透明(overlay) → 编辑器，文本输入/删除/选区高亮延迟；全屏壁纸(fullscreen) → 编辑器无此问题。
- **根因**：overlay 来源下 `#editor-bg-layer` 持久 `will-change:transform` + `transform:scale(1.05)` 把全屏层钉成独立合成层，每次输入触发整页合成时模糊层被迫重算 → 主线程阻塞。fullscreen 来源 `filter:none` 故不卡。
- **修复**：(1) 删除 `#editor-bg-layer` 的 `will-change:transform`；(2) 1.05x 由 `transform:scale` 改为 `background-size` 烘焙（移除 transform）；(3) `filter` 统一 `blur(var(--overlay-blur,0px))` 跟随全局主题变量（不再用 `editorSrcMode` 二选一，删除了 `editorSrcMode` 变量）。纯色来源(none) 不 freeze、无 layer。
- **用户约束**（改此体系时务必遵守）：导航栏对齐设置、滚动条相关、背景图位置/宽度/右边自然露出被滚动条盖住的图——这四项功能绝对不能动。模糊度跟随主题设置，编辑器不另设专属模糊。

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

### 7. 透明设置面板进度条显示偏差修复（2026-08-04 落地）
- **现象**：主页全屏壁纸 → 切编辑器 → 打开设置面板，透明/模糊/卡片透明度三个进度条填充显示约一半（与真实值不符），数值文本正确，可拖动设置。
- **根因**：进度条绿色填充宽度由 JS 计算的 `--range-progress` CSS 变量决定（`refreshAllRangeProgress()`），该函数只在组件首次 `onMount` 调用一次。设置面板是导航栏一部分（Swup 外部组件，SPA 导航不重挂载）；主页 fullscreen 时透明面板 DOM 不存在，切编辑器后 `setWallpaperMode('overlay')` 派发 `wallpaperModeChange`，面板**重新插入 DOM** 却不再触发 `onMount` → `--range-progress` 停在 fallback 50%。
- **修复**：`DisplaySettingsIntegrated.svelte` 的 `wallpaperModeChange` 监听里，切到 `overlay` 时 `requestAnimationFrame(refreshAllRangeProgress)` 重新计算进度条样式。

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

## 三、编辑器导航栏与主页对齐体系（src/layouts/Layout.astro）

> 本章节为导航栏对齐的完整档案（合并自 2026-07-31.md 与 2026-08-01.md）。

### 需求
编辑器导航栏必须与主页**同宽、同位置、同大小**，且**跨浏览器（Edge+Chrome）一致**；编辑器背景与主页一致、无拉伸、右边自然显示被主页滚动条盖住的图。

### 铁律（违反必踩坑）
1. **绝不能给 `#top-row` 设 `width`**：它是 `position:fixed` 且 `left:0`+`right:0` 并存，一旦设 `width`，`right` 失效退化为左对齐、居中崩溃。**只能用 `max-width` 限宽**。
2. **内联 `left`/`right` 必须 `setProperty(...,'important')`**（对抗 `body.sticky-navbar #top-row` 的 `!important`）；清理用 `removeProperty`。
3. **1px 奇偶补偿不是多余的**：修正"编辑器被 max-width 截断 vs 主页走 92vw"的舍入路径差，无缓存/JS 现算时必须加（`rightInset = sw + ((homeClient - round(homeMax)) % 2 !== 0 ? 1 : 0)`）。

### 根因链条（为什么需要这套对齐）
- 编辑器 `body{overflow:hidden}` 删滚动条 → 视觉视口（1528）比主页（1513）宽一个滚动条 sw≈15px。
- `#top-row` 是 `position:fixed; left:0; right:0` + `mx-auto` 居中（sticky 下 `left:0!important; right:0!important`），宽度由 `w-full xl:w-[92vw] max-w-(--page-width)` 决定，`--page-width`=`siteConfig.pageWidth(100)rem=1600px`（Layout.astro:537）远大于主页实测宽、从不截断 → 主页宽度 = `92vw`（基准=视觉视口 1513）。
- 因编辑器视口宽 15px，导航栏居中后变宽且右移 → 需收右界 + 复算宽度让其与主页对齐。

### 决定性 CSS 事实（踩坑核心）
`#top-row` 在 sticky 下（Layout.astro:657-664）：
```css
body.sticky-navbar #top-row {
  position: fixed !important; top: 0 !important;
  left: 0 !important; right: 0 !important;
}
```
`left:0` 与 `right:0` **同时存在**，内层靠 `mx-auto`+`max-w` 居中。**一旦再给 `width`，`right` 被忽略、退化左对齐、居中失效**（早期"方案3"即因此失败）。结论：**绝不设 `width`/`max-width` 之外的 width 属性**。

第二个陷阱：内联普通 `el.style.right='15px'` 优先级低于 `!important` 规则，必须用 `el.style.setProperty('right', v, 'important')` 同级对抗；清理用 `el.style.removeProperty('right')`。

### 走过的弯路（勿重蹈）
1. **固定 px 宽度快照**（`sessionStorage.navbar-width` 写死 `width/max-width !important`）：`!important` 覆盖响应式规则，拖窗卡死；resize 重测在无滚动条环境读 92vw 比主页宽 15px，越调越偏。
2. **仅 translateX 偏移、不写宽度**（`translateX(-sw*0.92)`）：平移≠缩宽，宽度天然多 sw，单纯平移无法同时修正宽度和左界。
3. **实时算宽 `width=innerWidth-sw` + `translateX(-sw/2)`**：左右不对称、居中失效。
4. **只收右界 `right: sw`**（无补偿）：vw 不受 right 影响，仍偏。
5. **左右各收 `sw/2`**：宽度纹丝不动（92vw 按含滚动条视口算不变）。
6. **复算 max-width + 左右各收 `sw/2`**：宽度对上但位置右偏 sw/2（滚动条只占右侧，起点应留 0）。
7. **只收右界 + 复算 max-width**：宽度对上，但左界差 1px（亚像素舍入，结构性）。
8. **去掉 Math.round 保留亚像素**：仍是 61，舍入路径不同绕不开。
9. **`width:92%` 方案（曾误提，已废弃）**：`%` 相对包含块在编辑器无滚动条时为整窗 1528，算成 1405≠主页 1392；且 fixed 元素设 width 会让 right 失效。**死胡同，绝不再用。**

### ✅ 最终方案（复算 max-width + 只收右界 + 1px 奇偶补偿）
三步缺一不可：
- `homeClient = innerWidth - sw`（主页布局可用宽）
- `homeMax = min(--page-width, homeClient * 0.92)` → 设为 `max-width`（**不取整**，保留亚像素）
- `rightInset = sw + ((homeClient - round(homeMax)) % 2 !== 0 ? 1 : 0)` → 设为 `right`
- `left: 0`（滚动条只占右侧，起点必须留 0）
- **不设** `width`
- `--page-width` 读取：`parseFloat(getComputedStyle(documentElement).getPropertyValue('--page-width'))`，值 < 200 视为 rem 需 ×16 换算。
- 1px 补偿原理：`包含块宽 - 内容宽` 为奇数时居中落在 `.5`，编辑器侧向上舍入；右界多收 1px 使包含块变偶数差，居中起点下压 0.5 触发向下舍入，与主页一致。差值偶数时不补偿。
- 宽度与补偿量每次实时算（进入 + resize），随视口自适应，非快照。
- 验算（视口1528/sw15）：`1513-1392=121`(奇) → right=16 → 包含块 1512 → `(1512-1392)/2=60` ✓
- 实测验证（视口1528）：主页/编辑器 `#top-row` 均 `60/1452/1392` ✅，`#navbar-wrapper`/`#navbar` 均 `74/1438/1364` ✅

### 后续演进：精确宽度缓存 + Chrome 修复（8-01 定稿）
1. **0.4px 整体位移**：主页 `#top-row` 宽度由浏览器按 vw 渲染（1391.950073…），编辑器 JS 现算 `1513*0.92=1391.96` 差 0.01px；叠加过时 1px 补偿把左界推到 60.025 → 真实 0.4px 位移（`btnLeft` 342.000 vs 341.600，但 `realGap=10.500` 两页一致）。修复：`cacheNavbarWidth` 新增缓存不取整精确宽度 `navbar-width-exact`；`applyEditorModeLayout` 优先读它做 `max-width`；并去掉进入/resize 的 1px 补偿。
2. **Chrome 崩**：上述改法依赖 `navbar-width-exact` 缓存（仅主页写入，`sessionStorage` 不跨浏览器），Chrome 直接进编辑器无缓存、回退 JS 现算 + **无补偿** → 比原方案偏更多。修复：
   - `applyEditorModeLayout`：`_usedCache=(_cachedExact>0)`；`rightInset` 分支——**有缓存**=`scrollbarWidth`（精确宽度已逐位一致，无需补偿）；**无缓存**=`scrollbarWidth + 1px补偿`（恢复 memory 稳定方案）。
   - `editorResizeHandler`：resize 无缓存，恒定 JS 现算 + `rightInset2 = sw2 + 1px补偿`。
   - 方案本质：**回到验证过的稳定方案（JS 现算 + 1px 补偿 + 不设 width）作兜底，仅在有精确缓存时用精确宽度增强精度。** 跨浏览器稳定靠前者，精度靠后者。
3. **验证通过**：Chrome 直接进编辑器 `topRow left=60.838 width=1399.313` 与主页**逐位一致**；Edge 同水平。按钮 `realGap=10.500` 两页一致。跨浏览器偏移已修复。

### 最终定性：导航栏"间距变化"感知 = 亚像素抗锯齿（非 bug）
1. 按钮内"图标↔文字间距" `realGap=10.500`、`htmlFontSize=14px`、`btnFontSize=14px` 两页**完全一致**——间距从未变化。
2. 用户实测"**网页缩放到某程度就正常**"——亚像素渲染铁证（真间距变化不会有此现象）。
3. 用户"87% 缩放参数"经 `getComputedStyle(html).zoom=1` 证实**不是 CSS zoom**，而是**根字体 14px**（`16×0.875`，来自浏览器字体设置，项目代码里未设根字体）。
4. 真凶：`devicePixelRatio=1.25`（Windows 系统显示缩放 125%，`visualViewport.scale=1` 排除浏览器页面 zoom）× 导航栏 vw 小数位置（`left=60.838×1.25=76.05` 物理像素非整数）→ 文字/图标边缘抗锯齿发虚 → 看着像"间距变了"。
5. 根字体实验（13/15px）更正：根字体虽不影响导航栏 vw 整体位置，但**按钮内部图标/文字/`gap`/`mr` 是 rem**，随根字体缩放改变物理像素落点——用户改 13px 后大部分按钮"间距变化"感消失（只剩"留言"），证明根字体确实影响按钮内部亚像素落点。但"凑巧压网格"**不稳定**（换视口/zoom/设备落点又变），只是验证手段，非可靠修复。已撤销 `main.css` 的 `font-size` 实验（`html` 回到仅 `scroll-behavior`）。**项目代码全程未设根字体/缩放**。
6. 关键认知：根字体 ≠ 网页缩放（CSS `zoom` 同时缩放 vw/px/rem 方能改变映射；根字体只缩 rem）。这是系统渲染层正常现象，非代码 bug；布局层面 topRow 逐位一致、跨浏览器一致、间距实测一致，已无可改之处。应对：用户侧用浏览器 zoom 调到清晰档位，**不应为此改代码或根字体**。devicePixelRatio=1.25 是系统/硬件层，代码无法干预。

### 背景（与导航栏独立，勿动）
`freezeWallpaperForEditor` 用 `homeVW = window.innerWidth` 整窗 cover，背景铺满整窗、右边露出主页被滚动条盖住的图。

### 代码改动位置（Layout.astro）
- **~1345-1358** `navbarCss`：计算 `_pwPx`/`homeMax`，生成 `#top-row { max-width:<homeMax>px !important; left:0px !important; right:<sw>px !important; transition:none !important; }`
- **~1360** `applyEditorModeLayout`：`_cachedExact`/`_usedCache` 分支决定 `rightInset`。
- **~1422-1430** 进入编辑器内联样式：清 `width/transform`，设 `maxWidth`、`left='0px'`、`right=sw+'px'`（important）。
- **~1447-1462** `editorResizeHandler`：用 `sw2` 复算 `homeMax2`，写回内联；`rightInset2 = sw2 + 1px补偿`。
- **~1517-1530** `removeEditorModeLayout`：已清 `width/maxWidth/transform/left/right`，无需改动。
- **~2052** `cacheNavbarWidth`：写 `navbar-width`（取整）与 `navbar-width-exact`（不取整）。

---

## 四、已删除/未采纳的方案
- `fix-editor-wallpaper-offset`（计划文件）：将 `homeVW` 从 `innerWidth` 改回 `innerWidth - scrollbarWidth` 以消左侧 7px 偏移。**状态 pending/未完成**，且与已落地的 `homeVW=innerWidth` 方案冲突，未纳入正式代码，故丢弃该计划文件。
- 导航栏"固定 px 宽度快照""仅 translateX""实时算宽+translateX""左右各收 sw/2""`width:92%`"等方案均因破坏居中或宽度对不齐而废弃（详见第三章弯路清单）。
