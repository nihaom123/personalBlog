# 实现/执行方案

- **项目**: 温水煮冷水博客运营
- **类型**: content
- **生成时间**: 2026-10-23 19:15 +0800
- **文档作用**: 说明项目的实现方式或执行路径。

## 推荐方案

**三池模型：选题池 → 草稿池 → 发布池。**

1. **选题池**：每周一处抓取四大热搜（微博、B站、知乎、抖音/百度）各前 20 条，人工筛掉红线话题，按四栏目分配，形成 70 条选题清单（放在 `docs/operations/topic-pool-YYYY-Www.md`）。
2. **草稿池**：按选题批量写稿，全部落在 `src/content/posts/`，统一 `draft: true`，文件命名 `YYYY-MM-DD-HHmm-slug.md`，用 `draftDate` 之外的 `published` 字段记录计划发布时间。
3. **发布池**：GitHub Actions 每日三个时间点运行脚本，把「当天该批次且仍在草稿态」的稿件 `draft` 置为 `false`，提交并 push，触发 Cloudflare Workers Builds 构建上线。

发布节奏由 `docs/operations/publish-schedule.json`（每天每批数量与时间）控制；改节奏 = 改这个文件，不改代码。

## 备选方案与取舍

| 方案 | 优点 | 缺点 | 结论 |
| --- | --- | --- | --- |
| A. 草稿池 + 定时翻转 `draft`（推荐） | 复用现有字段，构建产物干净，回滚简单 | 每次发布都会重新构建全站 | 采用 |
| B. 独立 `_drafts/` 目录 + Action 移动到 posts | 草稿不参与任何构建 | 文件移动会造成大量 diff，回滚麻烦 | 不采用 |
| C. 预生成静态文件直接上传 R2/Pages | 构建次数少 | 与现有 Workers 部署链路冲突，维护成本高 | 不采用 |
| D. 纯手动发布 | 最可控 | 违背「全托管」目标 | 不采用 |

## 架构或执行模型

```
热搜抓取（手动/脚本）
      │
      ▼
选题清单（docs/operations/）
      │  批量写稿
      ▼
src/content/posts/*.md  （draft: true）
      │  博主抽检 10%
      ▼
GitHub Actions 定时任务（07:30 / 12:30 / 20:30）
      │  翻转 draft → false，git commit + push
      ▼
Cloudflare Workers Builds（pnpm build → wrangler deploy）
      │
      ▼
线上站点 05221024.xyz  ←→  Waline 评论（Worker + D1）
      │
      ▼
Cloudflare Web Analytics → 周日复盘
```

## 主要模块或工作流

### 1. 内容目录与规范

- 位置：`src/content/posts/`
- 必填：`title`、`published`
- 本项目约定：
  - `draft`: 草稿 `true`，发布 `false`
  - `category`: 四栏目之一，严格取值：`热点搞怪` / `生活随笔` / `技术折腾` / `二次元`
  - `tags`: 2–5 个，含 1 个话题来源标签（如 `微博热搜`）
  - `description`: 40–80 字，用于卡片与 SEO
  - `image`: 可选，无图留空
  - `comment`: 默认 `true`
- 文件名：`YYYY-MM-DD-HHmm-<kebab-slug>.md`（slug 用英文或拼音）

### 2. 定时发布工作流

- 文件：`.github/workflows/daily-publish.yml`
- 触发：`schedule` 三个 cron（UTC，对应北京时间 `30 23 * * *` / `30 4 * * *` / `30 12 * * *`），并保留 `workflow_dispatch` 手动触发（带 `batch` 输入）。
- 逻辑：读取排期 → 选出当日该批次草稿 → 修改 frontmatter → commit（`chore: publish batch X`）→ push。
- 安全：脚本幂等；无候选则直接退出，不产生空提交。

### 3. 评论系统（Waline）

- 后端：Cloudflare Worker 部署 Waline 服务端，数据库使用 Cloudflare D1。
- 前端：`src/config/commentConfig.ts` 中 `type: "waline"`，`serverURL` 指向 Worker 地址。
- 域名：`waline.05221024.xyz`，与主站 Worker 分离，避免路由冲突。

### 4. 统计分析

- Cloudflare Web Analytics：在 Cloudflare Dashboard 添加站点后获取 beacon token，注入到 `siteConfig` 对应字段或布局模板。
- 周日复盘看三个数：总访问、单篇 Top5、评论数。

### 5. 抽检机制

- 博主每周一随机抽 7 篇（10%）通读。
- 抽检不通过 → 该篇改回 `draft: true` 并删除已发布 commit（或 `git revert`）。
- 每周记录抽检结论到 `docs/operations/weekly-review-YYYY-Www.md`。

## 数据、资源或资产

- 图片：优先使用 `src/assets` 本地图；若用网络图，需确认授权，禁止直接引用热搜原图。
- 选题与排期文件：`docs/operations/` 下按周归档。
- 评论数据：Cloudflare D1（不入 git）。
- 统计：Cloudflare Analytics（不入 git）。

## 集成或工具

- GitHub Actions（定时 + 提交）
- Cloudflare Workers Builds（构建部署）
- Waline Worker + Cloudflare D1
- Cloudflare Web Analytics
- 现有 Firefly 能力：sitemap、RSS/Atom、OG 图、Pagefind 搜索

## 安全、隐私或执行约束

- 仓库内不得出现任何 Key、连接串、Token；Waline 的密钥存于 Cloudflare Worker 环境变量。
- Action 使用最小权限：`contents: write` 仅用于发布任务分支。
- 评论开启防垃圾（Waline 反垃圾 + 可选验证码/频率限制）。
- 内容红线见 [02-scope-and-requirements.md](02-scope-and-requirements.md#硬性红线任一命中即弃稿)。

## 部署、发布或交付计划

| 阶段 | 内容 | 完成标志 |
| --- | --- | --- |
| D1 | 草稿规范 + 目录准备 | 一篇样例草稿构建后不显示 |
| D2 | 定时工作流上线 | 手动 dispatch 成功发布一批 |
| D3 | Waline 上线 | 线上可评论并存库 |
| D4 | Analytics 上线 | 后台可见访问数据 |
| D5 | 首周 70 篇入库 | 抽检通过 |
| D6 | 连续 7 天自动发布 | 无构建失败 |
| D7 | 复盘 | 输出节奏结论 |

## 测试与验证策略

- 本地：`pnpm check`、`pnpm type-check`、`pnpm build`；`pnpm dev` 目测四栏目归档与文章页。
- 草稿隔离：构建后 grep `dist` 中不该出现的草稿标题。
- 工作流：先用 `workflow_dispatch` 在测试分支验证，再合并到 `main`。
- 线上：每次发布后访问对应文章 URL 与 `/rss/`，确认收录。
- 评论：匿名提交 → 刷新 → 换设备可见。
- 回滚演练：任选一篇改回 `draft: true` 并发布，确认下线。
