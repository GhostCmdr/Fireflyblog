/**
 * 自动生成音乐播放列表（单文件夹模式）
 *
 * 使用方式：
 *   node scripts/generate-music-playlist.mjs
 *
 * 命名规则：
 *   文件名格式：序号 - 歌曲名 - 歌手.扩展名
 *   示例：01 - 知我 (宁姚) - 谭渊.mp3
 *
 * 所有文件放在同一个文件夹中：
 *   public/assets/music/
 *   ├── 01 - 知我 (宁姚) - 谭渊.mp3     ← 歌曲
 *   ├── 01 - 知我 (宁姚) - 谭渊.jpg     ← 封面（可选）
 *   ├── 01 - 知我 (宁姚) - 谭渊.lrc     ← 歌词（可选）
 *   ├── 02 - 晴天 - 周杰伦.mp3
 *   ├── 02 - 晴天 - 周杰伦.webp
 *   ├── 02 - 晴天 - 周杰伦.lrc
 *   └── playlist.json                    ← 自动生成
 *
 * 同名文件（去掉扩展名后相同）自动关联。
 */

import { readdirSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join, extname, basename, sep } from "node:path";

// ── 配置 ──────────────────────────────────────────────────
const MUSIC_DIR = join(process.cwd(), "public", "assets", "music");
const OUTPUT = join(MUSIC_DIR, "playlist.json");

const AUDIO_EXTS = new Set([".mp3", ".flac", ".wav", ".ogg", ".m4a", ".aac", ".wma"]);
const IMAGE_EXTS = new Set([".jpg", ".jpeg", ".png", ".webp", ".gif", ".avif"]);
const LRC_EXTS = new Set([".lrc", ".txt"]);

// ── 解析文件名 ────────────────────────────────────────────
// 格式：序号 - 歌曲名 - 歌手
// 示例：01 - 知我 (宁姚) - 谭渊
function parseFilename(name) {
  var parts = name.split(" - ");

  // 至少有 3 段，且第一段是纯数字 → 序号 - 歌名 - 歌手
  if (parts.length >= 3 && /^\d+$/.test(parts[0].trim())) {
    return {
      number: parseInt(parts[0].trim(), 10),
      name: parts.slice(1, -1).join(" - ").trim(),
      artist: parts[parts.length - 1].trim(),
    };
  }

  // 至少有 2 段 → 歌名 - 歌手（无序号）
  if (parts.length >= 2) {
    return {
      number: null,
      name: parts.slice(0, -1).join(" - ").trim(),
      artist: parts[parts.length - 1].trim(),
    };
  }

  // 只有文件名 → 整体作为歌名
  return {
    number: null,
    name: name.trim(),
    artist: "未知艺术家",
  };
}

// ── 扫描文件夹 ────────────────────────────────────────────
function scanDir(dir, validExts) {
  if (!existsSync(dir)) return new Map();
  var map = new Map();
  var files = readdirSync(dir);
  for (var i = 0; i < files.length; i++) {
    var file = files[i];
    var ext = extname(file).toLowerCase();
    if (validExts.has(ext)) {
      var name = basename(file, ext);
      if (!map.has(name)) map.set(name, []);
      map.get(name).push(file);
    }
  }
  return map;
}

// 将 Windows 路径转为 URL 路径（正斜杠）
function toUrlPath(relativePath) {
  return relativePath.split(sep).join("/");
}

// ── 主逻辑 ────────────────────────────────────────────────
function main() {
  if (!existsSync(MUSIC_DIR)) {
    mkdirSync(MUSIC_DIR, { recursive: true });
    console.log("✅ 已创建目录: " + MUSIC_DIR);
    console.log("📁 请将音乐文件放入此目录后重新运行脚本");
    process.exit(0);
  }

  var audioFiles = scanDir(MUSIC_DIR, AUDIO_EXTS);
  var imageFiles = scanDir(MUSIC_DIR, IMAGE_EXTS);
  var lrcFiles = scanDir(MUSIC_DIR, LRC_EXTS);

  if (audioFiles.size === 0) {
    console.log("⚠️  未找到音乐文件");
    console.log("   支持的格式: " + Array.from(AUDIO_EXTS).join(", "));
    console.log("   请将文件放入: " + MUSIC_DIR);
    process.exit(0);
  }

  var playlist = [];

  audioFiles.forEach(function (files, baseName) {
    var info = parseFilename(baseName);
    var audioFile = files[0];

    // 匹配封面（同名图片文件）
    var cover = "";
    if (imageFiles.has(baseName)) {
      cover = "/assets/music/" + imageFiles.get(baseName)[0];
    }

    // 匹配歌词（同名歌词文件）
    var lrc = "";
    if (lrcFiles.has(baseName)) {
      lrc = "/assets/music/" + lrcFiles.get(baseName)[0];
    }

    playlist.push({
      name: info.name,
      artist: info.artist,
      number: info.number,
      url: "/assets/music/" + audioFile,
      cover: cover,
      lrc: lrc,
    });
  });

  // 按序号排序，无序号的排在最后
  playlist.sort(function (a, b) {
    if (a.number !== null && b.number !== null) return a.number - b.number;
    if (a.number !== null) return -1;
    if (b.number !== null) return 1;
    return a.name.localeCompare(b.name);
  });

  writeFileSync(OUTPUT, JSON.stringify(playlist, null, 2), "utf-8");

  console.log("🎵 已生成播放列表: " + OUTPUT);
  console.log("   共 " + playlist.length + " 首歌曲");

  var withCover = playlist.filter(function (s) { return s.cover; }).length;
  var withLrc = playlist.filter(function (s) { return s.lrc; }).length;
  console.log("   封面匹配: " + withCover + "/" + playlist.length);
  console.log("   歌词匹配: " + withLrc + "/" + playlist.length);

  if (withCover < playlist.length) {
    console.log("\n💡 提示: 添加同名图片文件即可自动匹配封面");
    console.log("   例: 01 - 知我 (宁姚) - 谭渊.jpg");
  }
  if (withLrc < playlist.length) {
    console.log("💡 提示: 添加同名 .lrc 文件即可自动匹配歌词");
    console.log("   例: 01 - 知我 (宁姚) - 谭渊.lrc");
  }
}

main();
