import fs from "node:fs";
import path from "node:path";
import type { GalleryAlbum } from "@/types/config";
import { url } from "@/utils/url-utils";

function withBase(assetPath: string): string {
	if (!assetPath) return "";
	if (/^(https?:)?\/\//i.test(assetPath) || /^(data|blob):/i.test(assetPath)) {
		return assetPath;
	}
	const normalizedPath = assetPath.startsWith("/")
		? assetPath
		: `/${assetPath}`;
	const base = import.meta.env.BASE_URL || "/";
	if (base !== "/" && normalizedPath.startsWith(base)) {
		return normalizedPath;
	}
	return url(normalizedPath);
}

/**
 * 扫描相册的照片清单：本地图片**文件名**（已排序、排除 cover.*）与 urls.txt 里的外链。
 * 供相册编辑器在**构建时**内嵌一份快照用（口径与 scanAlbumPhotos 完全一致）。
 */
export function scanAlbumPhotoManifest(albumId: string): {
	files: string[];
	urls: string[];
} {
	const dir = path.join(process.cwd(), "public", "gallery", albumId);
	if (!fs.existsSync(dir)) return { files: [], urls: [] };

	const files = fs
		.readdirSync(dir)
		.filter(
			(f) => /\.(jpe?g|png|webp|avif|gif)$/i.test(f) && !/^cover\./i.test(f),
		)
		.sort();

	// 读取 urls.txt 中的远程图片 URL
	const urlsFile = path.join(dir, "urls.txt");
	let urls: string[] = [];
	if (fs.existsSync(urlsFile)) {
		urls = fs
			.readFileSync(urlsFile, "utf-8")
			.split("\n")
			.map((line) => line.trim())
			.filter((line) => line && !line.startsWith("#"));
	}

	return { files, urls };
}

/**
 * 扫描相册目录中的所有图片文件（排除 cover.* 文件）
 * （内部复用 scanAlbumPhotoManifest，返回值与行为保持完全不变）
 */
export function scanAlbumPhotos(albumId: string): string[] {
	const { files, urls } = scanAlbumPhotoManifest(albumId);
	const localPhotos = files.map((f) => withBase(`/gallery/${albumId}/${f}`));
	return [...localPhotos, ...urls];
}

/**
 * 获取相册封面图
 * 优先级：手动指定 > cover.* 文件 > 第一张图片
 */
export function getAlbumCover(album: GalleryAlbum, photos: string[]): string {
	if (album.cover) return withBase(album.cover);
	const coverFile = photos.find((p) => /\/cover\./i.test(p));
	return coverFile || photos[0] || "";
}
