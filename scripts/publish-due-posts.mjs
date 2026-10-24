/**
 * 按 docs/operations/publish-schedule.json 把到期的草稿翻转为发布状态。
 *
 * 用法：
 *   node scripts/publish-due-posts.mjs --dry-run
 *   node scripts/publish-due-posts.mjs --batch morning
 *   node scripts/publish-due-posts.mjs --batch auto --now 2026-10-24T20:30:00+08:00
 *
 * 规则：
 * - 只处理 frontmatter 中显式 `draft: true` 的文章；
 * - `published` 不晚于当前时间（北京时间）才算到期；
 * - 按 `published` 升序取该批次的数量，不足则发布现有并告警；
 * - 幂等：已发布（`draft: false`）的文件不会被再次改动。
 */

import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const POSTS_DIR = path.resolve("src/content/posts");
const SCHEDULE_FILE = path.resolve("docs/operations/publish-schedule.json");
const BEIJING_OFFSET_MS = 8 * 60 * 60 * 1000;
const FRONTMATTER_RE = /^---\r?\n([\s\S]*?)\r?\n---/;

function parseArgs(argv) {
	const args = { dryRun: false, batch: "auto", now: null };
	for (let i = 0; i < argv.length; i += 1) {
		const arg = argv[i];
		if (arg === "--dry-run") {
			args.dryRun = true;
		} else if (arg === "--batch") {
			args.batch = argv[i + 1] ?? "auto";
			i += 1;
		} else if (arg.startsWith("--batch=")) {
			args.batch = arg.slice("--batch=".length);
		} else if (arg === "--now") {
			args.now = argv[i + 1] ?? null;
			i += 1;
		} else if (arg.startsWith("--now=")) {
			args.now = arg.slice("--now=".length);
		} else {
			console.error(`未知参数：${arg}`);
			process.exit(1);
		}
	}
	return args;
}

function parseDate(value) {
	const raw = value.trim().replace(/^["']|["']$/g, "");
	const match = raw.match(
		/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?\s*(Z|[+-]\d{2}:?\d{2})?$/,
	);
	if (!match) return null;

	const [, year, month, day, hour = "0", minute = "0", second = "0", zone] =
		match;
	const utcMs = Date.UTC(
		Number(year),
		Number(month) - 1,
		Number(day),
		Number(hour),
		Number(minute),
		Number(second),
	);
	// 没有时区信息时按北京时间解释
	if (!zone) return utcMs - BEIJING_OFFSET_MS;
	if (zone === "Z") return utcMs;

	const digits = zone.slice(1).replace(":", "");
	const offsetMinutes =
		Number(digits.slice(0, 2)) * 60 + Number(digits.slice(2));
	return zone.startsWith("-")
		? utcMs + offsetMinutes * 60000
		: utcMs - offsetMinutes * 60000;
}

function beijingParts(ms) {
	const date = new Date(ms + BEIJING_OFFSET_MS);
	return {
		minuteOfDay: date.getUTCHours() * 60 + date.getUTCMinutes(),
		label: `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")} ${String(date.getUTCHours()).padStart(2, "0")}:${String(date.getUTCMinutes()).padStart(2, "0")}`,
	};
}

function formatBeijing(ms) {
	return beijingParts(ms).label;
}

function readField(frontmatter, name) {
	const match = frontmatter.match(new RegExp(`^${name}:\\s*(.*)$`, "m"));
	return match ? match[1].trim() : "";
}

function walkMarkdownFiles(dir) {
	if (!fs.existsSync(dir)) return [];
	const entries = fs.readdirSync(dir, { withFileTypes: true });
	return entries.flatMap((entry) => {
		const fullPath = path.join(dir, entry.name);
		if (entry.isDirectory()) return walkMarkdownFiles(fullPath);
		return /\.(md|mdx)$/i.test(entry.name) ? [fullPath] : [];
	});
}

function loadPosts() {
	return walkMarkdownFiles(POSTS_DIR)
		.map((file) => {
			const text = fs.readFileSync(file, "utf8");
			const match = text.match(FRONTMATTER_RE);
			if (!match) return null;

			const frontmatter = match[1];
			const draft = readField(frontmatter, "draft")
				.replace(/^["']|["']$/g, "")
				.toLowerCase();
			return {
				file,
				relativeFile: path.relative(process.cwd(), file),
				text,
				title: readField(frontmatter, "title").replace(/^["']|["']$/g, ""),
				category:
					readField(frontmatter, "category").replace(/^["']|["']$/g, "") ||
					"未分类",
				publishedMs: parseDate(readField(frontmatter, "published")),
				isDraft: draft === "true",
			};
		})
		.filter(Boolean);
}

function resolveBatch(schedule, requested, nowMs) {
	if (requested !== "auto") {
		const batch = schedule.batches.find((item) => item.id === requested);
		if (!batch) {
			console.error(
				`未知批次：${requested}（可选：${schedule.batches.map((item) => item.id).join(" / ")}）`,
			);
			process.exit(1);
		}
		return batch;
	}

	const nowMinute = beijingParts(nowMs).minuteOfDay;
	return schedule.batches.reduce((closest, item) => {
		const [hour, minute] = item.time.split(":").map(Number);
		const distance = Math.abs(hour * 60 + minute - nowMinute);
		if (!closest || distance < closest.distance) {
			return { ...item, distance };
		}
		return closest;
	}, null);
}

function markPublished(text) {
	let changed = false;
	const updated = text.replace(FRONTMATTER_RE, (all, frontmatter) => {
		const updatedFrontmatter = frontmatter.replace(
			/^draft:\s*["']?true["']?\s*$/im,
			"draft: false",
		);
		if (updatedFrontmatter === frontmatter) return all;
		changed = true;
		return all.replace(frontmatter, updatedFrontmatter);
	});
	return changed ? updated : null;
}

function writeGitHubOutput(values) {
	const outputFile = process.env.GITHUB_OUTPUT;
	if (!outputFile) return;
	const lines = Object.entries(values).map(([key, value]) => `${key}=${value}`);
	fs.appendFileSync(outputFile, `${lines.join("\n")}\n`);
}

const args = parseArgs(process.argv.slice(2));
const nowMs = args.now ? parseDate(args.now) : Date.now();
if (nowMs === null || Number.isNaN(nowMs)) {
	console.error(`无法解析 --now：${args.now}`);
	process.exit(1);
}

const schedule = JSON.parse(fs.readFileSync(SCHEDULE_FILE, "utf8"));
const batch = resolveBatch(schedule, args.batch, nowMs);
const posts = loadPosts();

const candidates = posts
	.filter((post) => post.isDraft && post.publishedMs !== null)
	.filter((post) => post.publishedMs <= nowMs)
	.sort((a, b) => a.publishedMs - b.publishedMs)
	.slice(0, batch.count);

console.log(
	`批次 ${batch.id}（${batch.time}，目标 ${batch.count} 篇）｜当前北京时间 ${formatBeijing(nowMs)}${args.dryRun ? "｜dry-run" : ""}`,
);
console.log(`草稿总数：${posts.filter((post) => post.isDraft).length}`);

if (candidates.length === 0) {
	console.log("没有到期的草稿，本次不发布。");
	if (!args.dryRun) writeGitHubOutput({ batch: batch.id, count: 0 });
	process.exit(0);
}

const staleDrafts = posts.filter(
	(post) => post.isDraft && post.publishedMs === null,
);
if (staleDrafts.length > 0) {
	console.warn(
		`有 ${staleDrafts.length} 篇草稿的 published 无法解析，已跳过：${staleDrafts.map((post) => post.relativeFile).join("、")}`,
	);
}

let publishedCount = 0;
for (const post of candidates) {
	const updated = markPublished(post.text);
	if (updated === null) {
		console.warn(
			`${args.dryRun ? "[待发布]" : "[跳过]"} ${formatBeijing(post.publishedMs)}｜${post.category}｜${post.title}｜frontmatter 中没有可替换的 draft 行：${post.relativeFile}`,
		);
		continue;
	}
	publishedCount += 1;
	console.log(
		`${args.dryRun ? "[待发布]" : "[发布]"} ${formatBeijing(post.publishedMs)}｜${post.category}｜${post.title}｜${post.relativeFile}`,
	);
	if (!args.dryRun) fs.writeFileSync(post.file, updated, "utf8");
}

if (!args.dryRun) {
	if (publishedCount < batch.count) {
		console.warn(
			`候选不足：目标 ${batch.count} 篇，实际发布 ${publishedCount} 篇，请补充稿件。`,
		);
	}
	console.log(`已发布 ${publishedCount} 篇。`);
	writeGitHubOutput({ batch: batch.id, count: publishedCount });
}
