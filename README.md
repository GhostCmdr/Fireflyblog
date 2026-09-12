<div align="center">

# 🍀 小埋小站

> 基于 [Firefly](https://github.com/CuteLeaf/Firefly) 主题深度定制的个人博客

[![Astro](https://img.shields.io/badge/Astro-7.0.2-orange)](https://astro.build)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.9.2-blue)](https://www.typescriptlang.org/)
[![Node.js](https://img.shields.io/badge/Node.js-%3E%3D22-brightgreen)](https://nodejs.org/)
[![pnpm](https://img.shields.io/badge/pnpm-%3E%3D9-blue)](https://pnpm.io/)
[![License](https://img.shields.io/github/license/GhostCmdr/Fireflyblog)](LICENSE)

**[🖥️ 在线预览](https://xiaomaisos.me)** · **[📝 原版文档](https://docs-firefly.cuteleaf.cn/)** · **[🍀 原版仓库](https://github.com/CuteLeaf/Firefly)** · **[📖 English](README.en.md)**

</div>

---

## 📖 项目简介

本仓库基于 [CuteLeaf/Firefly](https://github.com/CuteLeaf/Firefly) Astro 博客主题进行深度自定义修改。保留了原版清新美观的设计风格，同时新增了多项功能和优化。

> **致谢：** 核心主题由 [CuteLeaf](https://github.com/CuteLeaf) 开发，遵循 MIT 协议。如需使用原版主题，请前往 [Firefly 仓库](https://github.com/CuteLeaf/Firefly)。

---

## ✨ 相比原版的改动

### 📐 页面布局优化

| 功能 | 说明 |
|------|------|
| **页面缩放** | 调整根字体大小，使初始页面呈现约 85% 缩放效果，更紧凑美观 |
| **侧边栏智能显示** | 站点统计、站点信息仅在主页显示，其他页面自动隐藏 |

侧边栏主页专属显示通过服务端渲染 + 客户端 swup 切页动态控制实现，确保页面切换后状态正确。

---

### 🎵 音乐播放器增强

新增 `auto` 自动识别模式，无需手动编辑代码即可管理音乐。

| 功能 | 说明 |
|------|------|
| **自动识别模式** | 歌曲/封面/歌词放同一文件夹，按 `序号 - 歌曲名 - 歌手` 命名，运行脚本自动生成播放列表 |
| **多格式支持** | 支持 mp3、flac、wav、ogg、m4a、aac、wma |
| **歌词间距优化** | 调整歌词显示区域，减少顶部空白 |

支持三种模式：`meting`（在线API）、`local`（手动配置）、`auto`（自动扫描）

```bash
# 文件命名规则：序号 - 歌曲名 - 歌手.扩展名
public/assets/music/
├── 01 - 知我 (宁姚) - 谭渊.mp3
├── 01 - 知我 (宁姚) - 谭渊.jpg    ← 同名自动匹配封面
├── 01 - 知我 (宁姚) - 谭渊.lrc    ← 同名自动匹配歌词
└── playlist.json                   # 自动生成

# 生成播放列表
node scripts/generate-music-playlist.mjs
```

配置 `src/config/musicConfig.ts`，设置 `mode: "auto"` 即可。

---

### ✏️ 在线 Markdown 编辑器（新增）

全新开发的在线 Markdown 编辑器，无需本地工具，直接在浏览器中撰写、编辑、发布博客文章。支持纯前端工作流：草稿保存在浏览器本地，发布通过 GitHub API 直连推送仓库。

**文章元信息面板：**

| 功能 | 说明 |
|------|------|
| **标题 / 描述** | 标题必填，支持置顶、评论开关 |
| **自定义 URL（Slug）** | 可选，留空默认使用文件名；填写后文章 URL 使用 slug（字母、数字和连字符） |
| **分类 / 标签** | 分类单个、标签多个（含自定义标签） |
| **发布时间 / 更新时间** | 双时间字段：新建默认今天、支持"今天"一键填入；发布时自动写入 frontmatter（手动填历史值则以手动值为准；发布即写 updated） |
| **封面图** | 支持 URL 引用、本地上传（上传前预览）与更新 |
| **文章密码** | 可选，空则不加密，发布加密文章 |

**编辑器功能：**
- Markdown 工具栏：加粗、斜体、删除线、标题(H1-H4)、列表、引用、代码、链接、图片、表格、分割线、撤销/重做
- 实时预览、四种视图模式（编辑/分栏/预览/全屏）、同步滚动
- 底部实时字数/字符/行数统计
- **图片布局**：单行图自适应自然宽（加载带灰底占位）、`[grid]` 语法并列多图
- **草稿箱**：保存草稿（Ctrl+Shift+S）、自定义名称、重命名/删除/批量管理，草稿完整保留标题/时间/封面等元信息（含留空状态）
- **从文章页一键编辑**：已发布文章页点"编辑此文"→ 编辑器通过 GitHub API 读取仓库原文并回填全部元信息，改完直接重新发布

**发布与保存：**
- 发布到 GitHub（GitHub API 直连推送 `src/content/posts/`，静态托管无需服务端）
- 下载 .md 文件到本地、一键复制 Markdown 源码

**性能与体验：**
- Markdown 解析走 Web Worker，输入不卡顿
- 预览渲染按块增量更新，图片灰底占位 → 加载完成淡入
- 编辑器导航栏与主页同宽同位（滚动条宽度补偿对齐）

---

### 🖼️ 相册优化（新增）

重构相册页面，从静态展示升级为可视化管理的相册系统：

| 功能 | 说明 |
|------|------|
| **新建相册** | 页面内直接创建相册，设置名称/描述 |
| **封面上传** | 相册封面上传与更新，封面视觉统一 |
| **搜索相册** | 按相册名称实时搜索 |
| **标签筛选** | 按标签快速过滤相册（全部 / 自定义标签分组） |
| **相册卡片** | 封面大图 + 照片数 + 位置 + 时间 + 标签，悬停动效 |
| **布局自适应** | 相册网格自适应宽度，配合全站玻璃拟态风格 |

---

### ⚡ 性能优化

| 功能 | 说明 |
|------|------|
| **Cloudflare CDN** | 接入 Cloudflare CDN 加速，提升全球访问速度 |
| **加载优化** | 修复编辑页加载缓慢问题 |

---

### 🔧 其他修改

- 站点标题、描述、关键词等基础配置自定义
- 导航栏标题自定义
- 评论系统、统计分析配置
- 多处样式和交互细节调整

---

## 🚀 快速开始

### 环境要求

- Node.js ≥ 22
- pnpm ≥ 9

### 安装运行

```bash
# 1. 克隆仓库
git clone https://github.com/GhostCmdr/Fireflyblog.git
cd Fireflyblog

# 2. 安装依赖
pnpm install

# 3. 启动开发服务器
pnpm dev
```

访问 http://localhost:4321 查看效果。

### 构建部署

```bash
pnpm run build
```

构建产物在 `dist/` 目录，可部署至 Vercel、Netlify、Cloudflare Pages、GitHub Pages 等平台。

---

## ⚙️ 主要配置文件

```
src/config/
├── siteConfig.ts              # 站点基础配置
├── backgroundWallpaper.ts     # 背景壁纸配置
├── musicConfig.ts             # 音乐播放器配置（meting/local/auto）
├── sidebarConfig.ts           # 侧边栏组件配置
├── commentConfig.ts           # 评论系统配置
├── profileConfig.ts           # 个人资料配置
├── analyticsConfig.ts         # 统计分析配置
└── ...                        # 更多配置项
```

详细配置说明请参考 [Firefly 使用文档](https://docs-firefly.cuteleaf.cn/)。

---

## 📁 目录结构

```
├── scripts/                         # 构建脚本
│   └── generate-music-playlist.mjs  # 音乐播放列表自动生成（新增）
├── src/
│   ├── components/
│   │   ├── features/                # 功能组件（音乐播放器等）
│   │   ├── widget/                  # 侧边栏小组件
│   │   └── layout/                  # 布局组件（侧边栏等）
│   ├── config/                      # 配置文件
│   ├── layouts/                     # 页面布局
│   ├── pages/
│   │   ├── editor.astro             # 在线编辑器（新增）
│   │   ├── gallery/                 # 相册页面（优化）
│   │   └── ...
│   ├── types/                       # TypeScript 类型定义
│   └── utils/                       # 工具函数
├── public/assets/music/             # 音乐文件目录
├── astro.config.mjs
└── package.json
```

---

## 🛠️ 技术栈

- **框架：** [Astro](https://astro.build/) 7.0
- **UI：** [Svelte](https://svelte.dev/) + [Tailwind CSS](https://tailwindcss.com/)
- **语言：** [TypeScript](https://www.typescriptlang.org/)
- **搜索：** [Pagefind](https://pagefind.app/)
- **代码高亮：** [Expressive Code](https://expressive-code.com/)
- **数学公式：** [KaTeX](https://katex.org/)
- **CDN：** [Cloudflare](https://www.cloudflare.com/)
- **部署：** GitHub Pages / Vercel / Cloudflare Pages

---

## 📝 致谢

- **主题作者：** [CuteLeaf](https://github.com/CuteLeaf) — [Firefly 主题](https://github.com/CuteLeaf/Firefly)
- **原始模板：** [Fuwari](https://github.com/saicaca/fuwari)

---

## 📄 许可证

本项目基于 [MIT License](LICENSE) 开源。

核心主题代码版权归 [CuteLeaf](https://github.com/CuteLeaf) 所有。
