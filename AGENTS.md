# Repository Guidelines

## Project Structure & Module Organization

Firefly is an Astro 7 site with Svelte islands and TypeScript configuration. Main source code lives in `src/`: routes in `src/pages`, layouts in `src/layouts`, reusable UI in `src/components`, styles in `src/styles`, content in `src/content`, helpers in `src/utils`, and Markdown/HTML plugins in `src/plugins`. Site configuration is split across `src/config` with matching type definitions in `src/types`; prefer imports from `@/config` when available. Static files served directly belong in `public`, source-managed images in `src/assets`, docs in `docs` and `Firefly-Docs`, and automation in `scripts`.

## Repository-Specific Conventions

This repository tracks the upstream Firefly theme, so local customization lives in a thin override layer instead of being edited into upstream files in place.

- Configuration overrides live in `src/config/ours/values.ts` (marked `[OURS]`). Upstream `src/config/*.ts` files keep their stock default values and only keep a small `mergeDeep` hook near the end (about 2-3 lines each). Never change an upstream default value in place: add the override to `src/config/ours/values.ts` and leave the hook line untouched.
- `mergeDeep` semantics (see `src/config/ours/values.ts`): objects are merged deeply (our keys win, other upstream defaults survive), arrays are replaced wholesale (keywords, nav items, sidebar widgets, friend links, ...), and a key set to `undefined` deletes that upstream key.
- The `[OURS]` comment marker flags every line that diverges from upstream. Keep the marker when editing so future upstream diffs stay easy to review.
- Content-level customization is written directly in the content files (for example `src/content/spec/friends.mdx`). Upstream treats these as templates meant to be rewritten, so they need no override layer.
- Shared external services are declared in config: `https://a.favicon.im/{domain}` is the upstream favicon API used by the bookmark navigation page and reused for friend-link icons. Prefer reusing these configured services over hardcoding service URLs elsewhere.

## Build, Test, and Development Commands

Use `pnpm`; the `preinstall` script enforces it.

- `pnpm dev` or `pnpm start`: run the local Astro dev server.
- `pnpm check`: run Astro diagnostics.
- `pnpm type-check`: run TypeScript with `--noEmit`.
- `pnpm format`: format `src` with Biome.
- `pnpm lint`: run Biome checks and safe fixes on `src`.
- `pnpm build`: generate icons, LQIPs, the Astro build, font subsets, and Pagefind search output in `dist`.
- `pnpm preview`: preview the production build locally.
- `pnpm new-post`: scaffold a new content post.

## Coding Style & Naming Conventions

Biome is the formatter and linter. It uses tabs for indentation and double quotes for JavaScript/TypeScript strings. Keep Astro and Svelte components in `PascalCase` (`PostCard.astro`, `Search.svelte`), config modules in `camelCase` ending with `Config.ts`, and utilities in descriptive kebab case such as `date-utils.ts`. Keep `src/types` aligned with `src/config`. Avoid unrelated formatting churn.

## Testing Guidelines

There is no dedicated unit-test framework configured. Before submitting changes, run `pnpm check`, `pnpm type-check`, and `pnpm build` for rendering, content, or generated asset work. For visual or interactive changes, verify with `pnpm dev` or `pnpm preview` and include screenshots in the PR. Name future tests near the feature they cover, using the local file name as the stem.

## Commit & Pull Request Guidelines

Use Conventional Commits, matching the current history: `feat: ...`, `fix: ...`, and `chore: ...`. Keep commits and PRs focused on one concern. PRs should include a concise summary, linked issues when relevant, validation commands run, and screenshots for UI changes. Discuss major features or design changes in an issue or discussion before implementation.

## Security & Configuration Tips

Do not commit secrets, tokens, or service keys in config files. Keep deployment-specific settings in the target platform environment, and review generated files such as `dist`, `src/constants/lqips.json`, and `src/constants/icons.ts` before committing them.
