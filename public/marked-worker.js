// Markdown 解析 Web Worker
// 在后台线程执行 marked。为支持"块级增量"(方案1)：
// 用 marked.lexer 切出顶层块，逐块 marked.parser([token]) 得到每块 html，
// 返回 { ok, blocks:[{raw,html}], joined }（joined 为各块拼接，供整段渲染与比对）。
// 图片/URL 等预处理由主线程在传参前完成(与原先一致)。

importScripts('https://cdn.jsdelivr.net/npm/marked/marked.min.js');

self.onmessage = function(e) {
  var md = e.data;
  try {
    if (typeof marked !== 'undefined') {
      marked.setOptions({ breaks: false, gfm: true });
      var tokens = marked.lexer(md);
      var blocks = [];
      var joined = '';
      for (var i = 0; i < tokens.length; i++) {
        var html = '';
        try { html = marked.parser([tokens[i]]); }
        catch (err) { html = '<p style="color:red">块渲染错误: ' + err.message + '</p>'; }
        blocks.push({ raw: tokens[i].raw || '', html: html });
        joined += html;
      }
      self.postMessage({ ok: true, blocks: blocks, joined: joined });
    } else {
      self.postMessage({ ok: false, html: md.replace(/\n/g, '<br>') });
    }
  } catch (err) {
    self.postMessage({ ok: false, html: '<p style="color:red">渲染错误: ' + err.message + '</p>' });
  }
};
