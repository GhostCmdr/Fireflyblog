// Markdown 解析 Web Worker
// 在后台线程执行 marked.parse()，不阻塞主线程

importScripts('https://cdn.jsdelivr.net/npm/marked/marked.min.js');

self.onmessage = function(e) {
  var md = e.data;
  var html = '';
  try {
    if (typeof marked !== 'undefined') {
      marked.setOptions({ breaks: true, gfm: true });
      html = marked.parse(md);
    } else {
      html = md.replace(/\n/g, '<br>');
    }
  } catch(err) {
    html = '<p style="color:red">渲染错误: ' + err.message + '</p>';
  }
  self.postMessage(html);
};
