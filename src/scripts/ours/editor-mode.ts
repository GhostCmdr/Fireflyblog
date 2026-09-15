// [OURS] 编辑器模式模块（迁移自 Layout.astro 的内联脚本，行为保持一致）
//
// 职责：进入/离开 /editor 时的布局铺满、壁纸冻结、滚动条隐藏、导航栏同宽同位对齐、
//       壁纸模式保存/恢复、resize 重算、退出清理（ESC 监听、Worker、全局状态）。
// 挂载：上游 Layout.astro 里只需 import + 调用 initEditorMode()（各 1 行）。
// 说明：为保持"搬迁零行为变化"，本文件暂不做类型收紧，只保证可解析与运行。
// @ts-nocheck
import { setWallpaperMode } from "@/utils/setting-utils";

    // [Editor] 编辑器模式：检测 /editor/ 页面并注入/移除全屏编辑器 CSS（必须在 Layout 中，因为 editor.astro 的 script 在 swup 容器内不会被 SPA 导航重新执行）
    let editorStyleEl: HTMLStyleElement | null = null;
    let editorResizeHandler: (() => void) | null = null;
    function isEditorPath() {
      var p = window.location.pathname;
      return p === '/editor/' || p === '/editor';
    }
    // 测量平台滚动条宽度（临时 div）。注意 scrollbar-width 不继承，
    // 所以 html.editor-page 上的"藏滑块"不影响这里的测量值（= 平台默认宽度，如 15px）。
    function measureScrollbarWidth() {
      var d = document.createElement('div');
      d.style.cssText = 'overflow:scroll;position:absolute;top:-9999px;width:100px;height:100px;';
      document.body.appendChild(d);
      var w = d.offsetWidth - d.clientWidth;
      d.remove();
      return w;
    }
    // 计算滚动条区域的背景图片 CSS（可复用，壁纸模式切换时重新计算）

    // 冻结壁纸视觉状态：编辑器页面壁纸和主页保持一致，右边多出滚动条宽度的区域自然露出
    function freezeWallpaperForEditor(scrollbarWidth: number) {
      var ww = document.getElementById('wallpaper-wrapper');
      if (!ww) return;
      // 找到桌面端实际显示的壁纸图片：
      // 1) 轮播模式：当前 .active 的桌面端 slide 内的 img（避免冻结到 index 0 而与主页当前图不一致）
      // 2) 单图模式：.banner-image-slot-desktop 内的 img
      // 3) 轮播模式回退：第一个桌面端 slide 内的 img
      // 4) 回退：wrapper 内第一个 img
      // 注意 HTML 中 mobile img 在 DOM 顺序上更靠前，直接 querySelector('img') 会拿到 mobile img，
      // 导致 src/尺寸错误且 desktop img 未被隐藏
      var img = (ww.querySelector('.slide-item.active.hidden.lg\\:block img') as HTMLImageElement)
        || (ww.querySelector('.banner-image-slot-desktop img') as HTMLImageElement)
        || (ww.querySelector('.slide-item.hidden.lg\\:block img') as HTMLImageElement)
        || (ww.querySelector('img') as HTMLImageElement);
      if (!img || !img.src) return;
      // 用主页真实内容宽高计算 cover，保证与主页 object-fit:cover 像素级一致：
      // homeVW 取 window.innerWidth - scrollbarWidth（= 主页内容区宽 W-s，enter 前在带滚动条的主页测得），
      // 不能用 clientWidth（编辑器 overflow:hidden 无滚动条，clientWidth 会返回整窗宽 W，导致 cover 按更宽算而放大/拉伸）。
      // homeVH 取 innerHeight（与 100vh 一致）。编辑器 wrapper 为 100% 全视口宽度，右侧自然多露出滚动条盖住的原图区域（无拉伸）。
      var homeVW = window.innerWidth - scrollbarWidth;
      var homeVH = window.innerHeight;
      // 记录被冻结时使用的图片 src，用于 unfreeze 时只清理对应图片的 inline display
      ww.dataset.frozenImgSrc = img.src;
      // 等图片加载完再计算
      function apply(iw: number, ih: number) {
        if (!ww) return;
        if (!iw) return;
        // 和主页 object-fit: cover 相同的缩放算法，基于主页可见宽度（内边距一致）
        var coverScale = Math.max(homeVW / iw, homeVH / ih);
        // 编辑器对壁纸来源恒定使用「全屏透明」(overlay) 的布局：cover 后再放大 1.05x，
        // 与主页全屏壁纸形成 1.05 倍关系；不再按来源模式区分布局，避免复现 fullscreen/banner 带来的卡顿/错乱。
        // 1.05x 直接烘焙进 background-size（sw*1.05 × sh*1.05），不再用 transform:scale(1.05)。
        // 原因：transform 方案依赖 #editor-bg-layer 的 will-change:transform 预留独立合成层，
        // 而编辑期内背景静止（仅缩放、无动画），持久 will-change 会迫使浏览器长期保留全屏合成层，
        // 每次文本输入/选区变化时该模糊层被迫重参与合成，造成编辑器输入延迟（仅 overlay 来源有模糊、故仅此路径卡）。
        // 改用 background-size 烘焙后无需 transform/will-change，放大的模糊羽化边缘仍由
        // #wallpaper-wrapper（.wallpaper-overlay 自带 overflow:hidden）裁掉，与主页 overlay 机制完全等价，四边不再出现白色模糊边。
        // 注意：模糊度不恒定——跟随主页来源模式（见下方 layer.style.filter），仅主页本身是 overlay 才模糊，避免比主页更糊。
        var sw = Math.round(iw * coverScale);
        var sh = Math.round(ih * coverScale);
        // 1.05x 放大烘焙进背景尺寸（替代 transform:scale），与主页 overlay img 的 1.05 放大视觉一致
        var swScaled = Math.round(sw * 1.05);
        var shScaled = Math.round(sh * 1.05);
        // 复现主页 img 真实的 object-position（默认 center），精确对齐"插入点"，
        // 避免硬编码 center 导致与主页起始位置不一致、切换产生视觉位移/移动。
        var opRaw = (getComputedStyle(img).objectPosition || '50% 50%').trim().split(/\s+/);
        function parsePos(p: string) {
          p = p.toLowerCase();
          if (p === 'center') return { v: 0.5, pct: true };
          if (p === 'left' || p === 'top') return { v: 0, pct: true };
          if (p === 'right' || p === 'bottom') return { v: 1, pct: true };
          if (p.indexOf('%') >= 0) return { v: parseFloat(p) / 100, pct: true };
          return { v: parseFloat(p) || 0, pct: false }; // px / 数值按绝对偏移
        }
        var pX = parsePos(opRaw[0] || '50%');
        var pY = parsePos(opRaw[1] || '50%');
        // object-position 百分比语义与 background-position 一致：偏移 = pct ? p*(容器-图片) : 绝对px；
        // 容器取主页实际渲染尺寸（homeVW/homeVH），使编辑器背景图左上角与主页完全一致（固定四角插入点）。
        // 注意：图片尺寸用放大后的 swScaled/shScaled，使 1.05x 放大下的"插入点"与主页 cover+1.05 完全一致。
        var bgX = pX.pct ? pX.v * (homeVW - swScaled) : pX.v;
        var bgY = pY.pct ? pY.v * (homeVH - shScaled) : pY.v;
        // 标记冻结状态：由 CSS 把 wrapper 内的 img / LQIP 渐变占位 / 过渡遮罩一并隐藏，
        // 否则这些 absolute inset-0 的遮挡层会盖在 background-image 之上（LQIP 为不透明渐变），
        // 导致壁纸看起来"消失"
        ww.classList.add('editor-frozen');
        // 背景与模糊改画在内层 #editor-bg-layer 上（复刻主页 overlay 的「放大+裁切」机制，消除四边白色模糊边）：
        // 获取或创建内层背景层，置于视频 #bg-player 之下（作为 ww 首个子节点）
        var layer = ww.querySelector('#editor-bg-layer') as HTMLElement | null;
        if (!layer) {
          layer = document.createElement('div');
          layer.id = 'editor-bg-layer';
          ww.insertBefore(layer, ww.firstChild);
        }
        layer.style.backgroundImage = 'url(' + img.src + ')';
        layer.style.backgroundSize = swScaled + 'px ' + shScaled + 'px';
        layer.style.backgroundPosition = bgX + 'px ' + bgY + 'px';
        layer.style.backgroundRepeat = 'no-repeat';
        // 1.05x 已由 background-size 烘焙，无需 transform（避免持久合成层导致的编辑器输入卡顿）
        layer.style.transform = 'none';
        // 编辑器模糊统一跟随全局主题设置（--overlay-blur），不再按主页来源 mode 二选一：
        // 只要进入了 overlay 布局（壁纸/透明来源 freeze 出 #editor-bg-layer），就读取全局模糊变量，
        // 导航栏/设置面板调整模糊度时编辑器自动同步，与其他页面完全一致（满足"模糊跟随主题设置"需求）。
        // 主页是纯色(none) 时根本不 freeze、无 layer，模糊对其无意义（保持纯色背景）。
        // 透明度仍由 wallpaper-overlay 类提供（保持"全屏透明"观感）。
        // 注：1.05x 已由 background-size 烘焙 + 已移除 will-change，模糊层不再是持久合成层，
        // 调模糊不会重新引入之前编辑器输入卡顿。
        layer.style.filter = 'blur(var(--overlay-blur, 0px))';
      }
      if (img.complete && img.naturalWidth) {
        apply(img.naturalWidth, img.naturalHeight);
      } else {
        img.onload = function() { apply(img.naturalWidth, img.naturalHeight); };
      }
    }
    function unfreezeWallpaper() {
      var ww = document.getElementById('wallpaper-wrapper');
      if (!ww) return;
      // 取消冻结状态，恢复遮挡层（img / LQIP / 过渡遮罩）的可见性
      ww.classList.remove('editor-frozen');
      delete ww.dataset.frozenImgSrc;
      // 移除编辑器内层背景层（背景与模糊已不再设在 ww 上）
      var layer = ww.querySelector('#editor-bg-layer');
      if (layer) layer.remove();
    }
    function applyEditorModeLayout() {
      if (editorStyleEl) return;
      // 测量滚动条宽度
      var scrollbarWidth = measureScrollbarWidth();
      // 编辑器导航栏与主页"同宽同位置"（2026-09-15 重做：宽度交回 CSS，JS 只补"编辑器少一条滚动条"）
      // #top-row 宽度完全由上游 CSS 决定：`w-full xl:w-[92vw] max-w-(--page-width)`（HeaderTopRow.astro）。
      // 编辑器页把根滚动条藏了（ours/editor-shell.css），可用空间比主页宽 sw → mx-auto 居中后整体右移 sw/2。
      // 修正只需一处：把包含块右界收 sw（left 保持 0），使可用空间回到与主页一致（innerWidth - sw）。
      // 不能对称收缩（left/right 各收 sw/2）：滚动条只占右侧、主页包含块起点就是 0，对称收缩会右偏。
      // 另：不再用 JS 复刻宽度。旧实现写 max-width = min(--page-width, 0.92 × 客户区宽)，与上游 CSS 的
      // 92vw 语义不同（Chrome/Edge 的 vw 按含滚动条视口计算）→ 编辑器比主页窄 0.92×sw（≈14px），
      // 并让导航栏内层 grid 的 minmax(0,1fr) 中列被压扁（表现为中间菜单文字挤成一团）。
      // 宽度交回 CSS 后，上游将来改宽度规则我们自动跟随，无需再同步公式。
      var rightInset = scrollbarWidth;
      var navbarCss = 'body.editor-page.sticky-navbar #top-row, body.editor-page.dynamic-navbar #top-row { left: 0px !important; right: ' + rightInset + 'px !important; transition: none !important; }';
      document.body.classList.add('editor-page');
      document.documentElement.classList.add('editor-page');
      // 编辑器仅保留两种背景模式：
      // 来源是纯色背景(none) → 纯色背景；来源是壁纸(横幅/全屏/透明) → 全屏透明(overlay：1.05x+模糊)。
      // setWallpaperMode 同步写入 data-wallpaper-mode，使后续 page:view 的 fullscreen/banner 布局分支被跳过，杜绝卡顿/错乱。
      var _srcMode = document.documentElement.getAttribute('data-wallpaper-mode');
      if (_srcMode === 'none') {
        setWallpaperMode('none');
      } else {
        setWallpaperMode('overlay');
      }
      editorStyleEl = document.createElement('style');
      editorStyleEl.id = 'editor-dynamic-style';
      editorStyleEl.textContent = [
        'body.editor-page #left-sidebar-wrapper,',
        'body.editor-page #left-sidebar-dynamic,',
        'body.editor-page #right-sidebar-static,',
        'body.editor-page #right-sidebar-dynamic,',
        'body.editor-page #category-bar-wrapper,',
        'body.editor-page .footer,',
        'body.editor-page #sidebar-sticky,',
        'body.editor-page .sidebar-container { display: none !important; }',
        'body.editor-page #main-grid { display: flex !important; flex-direction: column !important; grid-template-columns: none !important; width: 100% !important; padding: 0 !important; }',
        'body.editor-page #swup-container { max-width: 100% !important; width: 100% !important; padding: 0 !important; margin: 0 !important; flex: 1 !important; }',
        'body.editor-page #main-grid > div:first-child { max-width: 100% !important; width: 100% !important; padding: 0 !important; }',
        'body.editor-page #main-grid ~ div,',
        'body.editor-page .pointer-events-auto { max-width: 100% !important; width: 100% !important; padding: 0 !important; }',
        'body.editor-page #main-grid > div { max-width: 100% !important; }',
        // 壁纸层固定全屏定位：编辑器需要一层固定的全屏背景，而主页可能是 banner/fullscreen/overlay 任一模式。
        // 这里统一用 fixed inset:0 让编辑器壁纸始终是固定全屏层（不再依赖强制 overlay 类提供定位），
        // 具体的 cover/1.05x/模糊由 freezeWallpaperForEditor 按主页当前模式复现，保证"插入点"与主页一致。
        // transition:none 关闭过渡：避免进入编辑器时 wrapper 定位变化被 animate 成漂移。
        'body.editor-page #wallpaper-wrapper { position: fixed !important; inset: 0 !important; width: 100% !important; height: 100vh !important; height: 100lvh !important; left: 0 !important; top: 0 !important; z-index: -1 !important; transition: none !important; }',
        // 冻结状态下隐藏壁纸层内的遮挡元素（img / LQIP 渐变占位 / 过渡遮罩），
        // 让 background-image 能正常透出，避免壁纸"消失"
        'body.editor-page #wallpaper-wrapper.editor-frozen .lqip-placeholder,',
        'body.editor-page #wallpaper-wrapper.editor-frozen .transition,',
        'body.editor-page #wallpaper-wrapper.editor-frozen img { display: none !important; }',
        // 轮播模式下 #banner-images-container 带 bg-black，作为 wrapper 子元素会盖在
        // background-image 之上导致编辑器背景变黑；冻结时置为透明让背景透出
        'body.editor-page #wallpaper-wrapper.editor-frozen #banner-images-container { background-color: transparent !important; }',
        'body.editor-page { overflow: hidden !important; }',
        'body.editor-page #markdown-input { overflow-y: scroll !important; scrollbar-width: none; -ms-overflow-style: none; }',
        'body.editor-page #markdown-input::-webkit-scrollbar { display: none; }',
        'body.editor-page #preview-content { scrollbar-width: none; -ms-overflow-style: none; }',
        'body.editor-page #preview-content::-webkit-scrollbar { display: none; }',
        'body.editor-page { scrollbar-width: none; -ms-overflow-style: none; }',
        'body.editor-page::-webkit-scrollbar { display: none; }',
        'html.editor-page { scrollbar-width: none; -ms-overflow-style: none; }',
        'html.editor-page::-webkit-scrollbar { display: none; }',
        /* 目录面板和图标栏：允许独立滚动 */
        'body.editor-page #panel-inner { display: flex !important; flex-direction: column !important; height: 100% !important; }',
        'body.editor-page #panel-content { overflow-y: auto !important; overflow-x: hidden !important; }',
        'body.editor-page #right-icon-bar { overflow-y: auto !important; }',
        navbarCss
      ].join('\n');
      document.head.appendChild(editorStyleEl);
      // 导航栏：只补"右界收 sw"（左界保持 0，与主页包含块起点一致）；宽度不再由 JS 写（交回 CSS）
      // 注意：必须用 setProperty(..., 'important')。body.sticky/dynamic-navbar #top-row 里有 `right: 0 !important`，
      // 内联的**普通**声明打不过 !important（实测 inlineRight=15px 但 computedRight=0px），必须同级对抗。
      var row = document.getElementById('top-row');
      if (row) {
        row.style.width = '';
        row.style.transform = '';
        // 清掉可能残留的旧 max-width（上一版实现写过），确保宽度完全由 CSS 决定
        row.style.removeProperty('max-width');
        row.style.setProperty('left', '0px', 'important');
        row.style.setProperty('right', rightInset + 'px', 'important');
      }
      // 冻结壁纸视觉状态（仅全屏透明模式需要；纯色背景不冻结，wrapper 由 hideAllWallpapers 隐藏透出 body 纯色）
      if (document.documentElement.getAttribute('data-wallpaper-mode') === 'overlay') {
        freezeWallpaperForEditor(scrollbarWidth);
      }
      // resize 监听：rAF 帧节流（宽度已交回 CSS，这里只做幂等的"右界重写 + 冻结层复算"）
      var _resizeRaf: number | null = null;
      editorResizeHandler = function() {
        if (_resizeRaf) return; // 已有待执行帧则合并，避免堆积
        _resizeRaf = requestAnimationFrame(function() {
          _resizeRaf = null;
          var sw2 = measureScrollbarWidth();
          var rightInset2 = sw2;
          var r = document.getElementById('top-row');
          if (r) {
            r.style.width = '';
            r.style.transform = '';
            // 同样必须 important，否则被 body.sticky/dynamic-navbar #top-row 的 right:0 !important 压制
            r.style.removeProperty('max-width');
            r.style.setProperty('left', '0px', 'important');
            r.style.setProperty('right', rightInset2 + 'px', 'important');
          }
          if (editorStyleEl) {
            var rules = editorStyleEl.textContent || '';
            rules = rules.replace(/left: [\d.]+px !important; right: [\d.]+px !important;/, 'left: 0px !important; right: ' + rightInset2 + 'px !important;');
            editorStyleEl.textContent = rules;
          }
          // 窗口尺寸变化后按新的视口宽度重新冻结壁纸（仅全屏透明模式）
          if (document.documentElement.getAttribute('data-wallpaper-mode') === 'overlay') {
            freezeWallpaperForEditor(sw2);
          }
        });
      };
      window.addEventListener('resize', editorResizeHandler);
    }
    // [编辑器背景视频] 与正常页面保持一致：播放时隐藏冻结壁纸并去掉模糊，露出清晰视频；停止时恢复冻结壁纸。
    // 正常页面播放背景视频会淡出壁纸(img opacity:0)，此处用同一思路（隐藏冻结层 + 取消模糊）。
    function syncEditorBgVideo() {
      if (!document.body.classList.contains('editor-page')) return;
      var ww2 = document.getElementById('wallpaper-wrapper');
      if (!ww2) return;
      var layer2 = ww2.querySelector('#editor-bg-layer') as HTMLElement | null;
      var playing = document.documentElement.hasAttribute('data-bg-video-playing');
      if (document.documentElement.getAttribute('data-wallpaper-mode') === 'overlay') {
        if (playing) {
          // 播放时隐藏内层冻结壁纸，露出清晰的背景视频（视频 #bg-player 在其上方）
          if (layer2) layer2.style.display = 'none';
        } else {
          // 停止时：若内层背景层已被移除则重建（resize 重冻结会复用），否则恢复显示
          if (!layer2) {
            // 重新测量滚动条宽度并恢复冻结壁纸
            var _d = document.createElement('div');
            _d.style.cssText = 'overflow:scroll;position:absolute;top:-9999px;width:100px;height:100px;';
            document.body.appendChild(_d);
            var _sbw = _d.offsetWidth - _d.clientWidth;
            document.body.removeChild(_d);
            freezeWallpaperForEditor(_sbw);
          } else {
            layer2.style.display = '';
          }
        }
      }
    }
    window.addEventListener('bg-player-state-change', syncEditorBgVideo);
    function removeEditorModeLayout() {
      document.body.classList.remove('editor-page');
      document.documentElement.classList.remove('editor-page');
      unfreezeWallpaper();
      if (editorStyleEl) { editorStyleEl.remove(); editorStyleEl = null; }
      if (editorResizeHandler) { window.removeEventListener('resize', editorResizeHandler); editorResizeHandler = null; }
      // 移除 ESC 全局监听器
      if (window.__editorKeydownEsc) {
        document.removeEventListener('keydown', window.__editorKeydownEsc);
        window.__editorKeydownEsc = null;
      }
      // 终止 Markdown 预览 Web Worker
      if (window.__editorMdWorker) {
        window.__editorMdWorker.terminate();
        window.__editorMdWorker = null;
      }
      // 清理编辑器全局状态（释放 Base64 图片数据占用的内存）
      window.__editorImageMap = {};
      window.__editorCoverValue = '';
      window.__editorCoverDataUrl = '';
      window.__editorCoverFilename = '';
      window.__editorMetaCheckbox = { pinned: false, comment: true };
      var row = document.getElementById('top-row');
      if (row) {
        // 先禁用过渡动画，避免清除 offset 时导航栏弹动
        row.style.transition = 'none';
        row.style.width = '';
        row.style.transform = '';
        // 这三个是用 setProperty(..., 'important') 写入的，必须 removeProperty 才能清干净（= '' 对 important 无效）
        row.style.removeProperty('max-width');
        row.style.removeProperty('left');
        row.style.removeProperty('right');
        // 下一帧恢复过渡动画
        requestAnimationFrame(function() {
          if (row) row.style.transition = '';
        });
      }
    }


/** 当前是否已处于"编辑器模式已应用"状态（避免重复 apply/remove） */
let editorModeApplied = false;

/** 切页后同步编辑器模式状态（幂等：状态一致时不重复应用） */
function handlePageView(): void {
  const want = isEditorPath();
  if (want === editorModeApplied) {
    // 状态一致：编辑器页顺带刷新一次视频/冻结层同步
    if (want) syncEditorBgVideo();
    return;
  }
  editorModeApplied = want;
  if (want) {
    applyEditorModeLayout();
    syncEditorBgVideo();
  } else {
    removeEditorModeLayout();
  }
}

/** 切页前：保存/恢复壁纸模式（原 visit:start 中的编辑器片段） */
function handleVisitStart(visit: { to: { url: string } }): void {
  // 编辑器页面壁纸模式：visit:start 只保存原模式，实际切换在 content:replace 阶段
  const _visitPath = new URL(visit.to.url, location.origin).pathname;
  const _isGoingToEditor = _visitPath === '/editor/' || _visitPath === '/editor';
  const _isCurrentlyEditor = location.pathname === '/editor/' || location.pathname === '/editor';
  if (_isGoingToEditor && !_isCurrentlyEditor) {
    // 进入编辑器：只保存当前模式，不切换（避免主页动画变透明）
    const curMode = document.documentElement.getAttribute('data-wallpaper-mode');
    if (curMode !== 'overlay' && curMode !== 'none') {
      sessionStorage.setItem('wallpaper-mode-before-editor', curMode!);
    }
  } else if (!_isGoingToEditor && _isCurrentlyEditor) {
    // 离开编辑器：恢复原模式
    const savedMode = sessionStorage.getItem('wallpaper-mode-before-editor');
    if (savedMode) {
      sessionStorage.removeItem('wallpaper-mode-before-editor');
      setWallpaperMode(savedMode as any);
    }
  }
}

/**
 * 注册 swup 钩子。注意：swup 可能晚于本模块初始化（本仓库其它组件一律用
 * "先试注册，失败则等 swup:enable" 的写法），因此这里必须返回是否成功，
 * 不能静默失败——否则 page:view 不会触发，离开编辑器时无人清理（页面残留 editor-page）。
 */
let swupHooksRegistered = false;
function registerSwupHooks(): boolean {
  if (swupHooksRegistered) return true;
  const swup = (window as any).swup;
  if (!swup?.hooks) return false;
  swup.hooks.on("page:view", handlePageView);
  swup.hooks.on("visit:start", handleVisitStart);
  swupHooksRegistered = true;
  return true;
}

/** 挂载编辑器模式：幂等，重复调用无副作用 */
export function initEditorMode(): void {
  const w = window as any;
  if (w.__oursEditorModeMounted) return;
  w.__oursEditorModeMounted = true;

  // 首次加载（直接访问 /editor 或刷新）——module script 为 defer 语义，此时 DOM 已解析
  if (isEditorPath()) {
    editorModeApplied = true;
    applyEditorModeLayout();
    syncEditorBgVideo();
  }

  if (!registerSwupHooks()) {
    // swup 尚未就绪：等 swup:enable 后再注册（与 Navbar / LightDarkSwitch / DisplaySettings 同款）
    document.addEventListener("swup:enable", () => { registerSwupHooks(); }, { once: true });
    // 再兜底：万一 swup:enable 在监听前已触发，用短轮询补注册（最多约 3 秒）
    let tries = 0;
    const retry = () => {
      if (registerSwupHooks() || ++tries >= 60) return;
      setTimeout(retry, 50);
    };
    setTimeout(retry, 50);
  }
  // 兜底：即使 hooks 注册异常，astro:page-load 也能保证进出编辑器状态正确（handlePageView 幂等）
  document.addEventListener("astro:page-load", handlePageView);
}
