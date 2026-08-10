---
name: editor-overlay-input-lag
overview: "排查并修复\"主页全屏透明(overlay)模式切到编辑器后，文本输入/删除/选区高亮出现延迟卡顿\"的问题。根因是编辑器冻结壁纸的 #editor-bg-layer 持久持有 will-change:transform + filter:blur，叠加 wrapper 的 opacity:0.8，在每次输入/选区变化时触发整屏高频模糊重算与合成层开销，阻塞主线程。全屏壁纸模式无 blur/will-change 故不受影响。"
todos:
  - id: fix-bg-layer-css
    content: "修改 layout-styles.css 中 #editor-bg-layer 移除 will-change: transform 持久合成层声明"
    status: completed
  - id: fix-freeze-apply
    content: 修改 Layout.astro 的 freezeWallpaperForEditor.apply()：用 background-size 烘焙 1.05x 替代 transform:scale，并强制 filter:none
    status: completed
    dependencies:
      - fix-bg-layer-css
  - id: verify-overlay
    content: 本地 dev 验证 overlay 来源编辑器输入/选区无延迟且背景与主页像素级一致
    status: completed
    dependencies:
      - fix-freeze-apply
---

## 用户需求
排查并修复一个特定场景下的编辑器卡顿问题：
- 主页处于「全屏透明模式」（即 wallpaper overlay 模式）时，通过 SPA 切换到编辑器页面，出现文本输入、删除、鼠标选区高亮均明显延迟（非实时）。
- 主页处于「全屏壁纸模式」（fullscreen 模式）时，同样切到编辑器页面，则无此延迟。
- 用户希望定位并排除产生该差异的原因。

## 现象特征
- 卡顿仅发生在「主页 overlay → 编辑器」这一路径，与背景模糊层强相关。
- 延迟作用于 textarea 的输入/删除反馈与选区高亮渲染，属于合成/绘制层面的持续开销，而非 JS 逻辑阻塞（预览经 Web Worker 渲染，已排除）。

## 核心结论（已核实）
根因是：overlay 来源下，编辑器冻结背景层 `#editor-bg-layer` 同时带有 `will-change: transform`（持久合成层）+ `transform: scale(1.05)`（静态，非动画）+ `filter: blur()`（来自 `--overlay-blur`）+ 外层 `.wallpaper-overlay` 的 `opacity: 0.8`。该层在编辑会话内一直存在（离开才移除），使浏览器持续维护一个高成本合成层；每次文本输入/选区变化触发整页合成时，模糊层被迫重新参与合成管线，造成输入与选区高亮延迟。fullscreen 来源下 `editorSrcMode !== 'overlay'`，`filter` 为 `none`，因此无此开销，现象吻合。


## 技术栈
- 框架：Astro 7 + Svelte + Tailwind CSS（项目既定，不引入新框架）
- 语言：TypeScript / 原生 DOM 脚本（`<script>` 内联于 Layout.astro、CSS 于 layout-styles.css）
- 渲染：Swup v4 SPA 导航；CSS 合成层由浏览器管理

## 实现思路
通过消除「编辑器内静态背景层的不必要持久合成层开销」来根治卡顿，同时严格保持现有视觉一致性（1.05x 放大、四边被 overflow 裁切、半透明 overlay 观感、与主页对齐）。

### 关键决策
1. **去掉 `#editor-bg-layer` 的持久 `will-change: transform`**（layout-styles.css:710）。编辑期内该层 `transform: scale(1.05)` 是静止的，不存在动画需求，持久 `will-change` 反而强迫浏览器长期保留独立合成层并参与每次合成。改为不声明 `will-change`（或仅 resize 重冻结时临时加、完成后移除）。这是收益最高、风险最低的一处改动。
2. **将 1.05x 放大由 `transform: scale` 改为 `background-size` 烘焙**（Layout.astro `freezeWallpaperForEditor` 的 `apply()`，约 1308-1312 行）。原实现用 `transform: scale(1.05)` 提供放大，正是因此它依赖 `will-change`。若改为 `background-size = sw*1.05 × sh*1.05` + `background-position` 相应平移，则完全不需要 transform，从而可安全移除 `will-change`，且放大的模糊羽化仍由 `.wallpaper-overlay` 的 `overflow:hidden` 裁掉，视觉等价。
3. **编辑器环境内对背景层强制 `filter: none`**（Layout.astro:1315）。主页 overlay 的模糊是「主页观感」需求，编辑器冻结层只是复刻静态背景图，无需真实模糊管线参与；即便 `--overlay-blur` 为 0，blur 声明也可能触发模糊合成路径。在编辑器 freeze 时统一置 `filter: none`，可彻底消除模糊合成开销（半透明由外层 `opacity:0.8` 保留，观感一致）。

### 取舍分析
- 方案 1（去 will-change）单独即可解决大部分合成开销，且零视觉变化，优先实施。
- 方案 2（去 transform，改用 background-size 烘焙）与方案 1 协同：去掉 transform 后 will-change 更无存在必要，且减少一处潜在合成触发源；需同步修正 `backgroundPosition` 计算（放大后容器-图片差变大，按 1.05 系数重算）以保证与主页对齐不变。
- 方案 3（强制 filter:none）防御性兜底，确保任何 blur 配置下编辑器都不付出模糊成本。
- 三者叠加改动量小、均位于已确认的两处文件，不触及导航栏对齐/背景视频等已稳定逻辑，blast radius 可控。

## 实现注意事项
- 改动后须验证：编辑器背景仍与主页 overlay 像素级一致（1.05x + 四边裁切 + 半透明），尤其在非 100% 系统缩放下。
- `background-size` 烘焙方案需重新核算 `bgX/bgY`：原 `sw = iw*coverScale`，新 `sw' = sw*1.05`、`sh' = sh*1.05`，`bgX = pX.pct ? pX.v*(homeVW - sw') : pX.v`（同原公式代入新值即可，逻辑不变）。
- 不改动 `removeEditorModeLayout` / `syncEditorBgVideo` / 导航栏逻辑，保持现有清理与视频播放行为。
- resize 重冻结（`editorResizeHandler` → `freezeWallpaperForEditor`）沿用同一 `apply()`，自动继承修复，无需额外处理。

## 架构设计
本次为局部 CSS / 脚本优化，不引入新模块或新文件，沿用现有 `Layout.astro` + `layout-styles.css` 的冻结壁纸体系。修改点：
- `layout-styles.css`：`#editor-bg-layer` 规则移除 `will-change: transform`
- `Layout.astro` `freezeWallpaperForEditor.apply()`：用 `background-size` 烘焙 1.05x 替代 `transform: scale(1.05)`；`filter` 统一置 `none`

## 目录结构（仅改动文件）
```
src/
├── layouts/
│   └── Layout.astro              # [MODIFY] freezeWallpaperForEditor.apply()：background-size 烘焙 1.05x 替代 transform:scale；filter 强制 none
└── styles/
    └── layout-styles.css         # [MODIFY] #editor-bg-layer 移除 will-change: transform
```

