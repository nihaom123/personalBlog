# 任务与 AI 交接清单

- **项目**: 温水煮冷水博客运营
- **类型**: content
- **生成时间**: 2026-10-23 19:15 +0800
- **文档作用**: 将方案拆成执行任务，并在适用时整理成可交给 AI 助手、编码工具或类似 agent 的任务。

## 任务概览

| 编号 | 任务 | 类型 | 依赖 | 优先级 |
| --- | --- | --- | --- | --- |
| TASK-001 | 建立运营目录、草稿规范与排期文件 | 编码/内容 | 无 | P0 |
| TASK-002 | 每日定时发布工作流（3/4/3） | 编码 | 001 | P0 |
| TASK-003 | 评论系统部署与前端接入 | 编码/运维 | 无 | P0 |
| TASK-004 | Cloudflare Web Analytics 接入 | 运维 | 无 | P1 |
| TASK-005 | 四栏目导航与归档页核对 | 编码/内容 | 无 | P1 |
| TASK-006 | 首周 70 篇稿件生产 | 内容 | 001 | P0 |
| TASK-007 | 一周复盘与节奏调整 | 运营 | 002/006 | P0 |
| TASK-008 | 可选：番组/VNDB/MAL 账号、音乐替换 | 配置 | 无 | P2 |

## 任务顺序

001 → 002 → 003 → 006 并行推进 → 004/005 穿插 → 007（一周后）→ 008（随时）。

## TASK-001

**Goal**：建立按周管理的选题/排期文件与统一的文章 frontmatter 规范，让「草稿 → 发布」有明确数据源。

**Context**：站点内容位于 `src/content/posts/`，`src/content.config.ts` 已支持 `draft`、`category`、`tags`、`description`、`published`；生产构建会过滤 `draft: true`（`src/utils/content-utils.ts`）。

**Scope**
- 新建 `docs/operations/`，含：`publish-schedule.json`、`topic-pool-YYYY-Www.md` 模板、`weekly-review-YYYY-Www.md` 模板。
- 新建 `scripts/publish-due-posts.mjs`：按排期筛选当日批次草稿并翻转 `draft`，支持 `--dry-run`。
- 提供 1 篇样例草稿（`draft: true`）用于验证。

**Non-goals**：不接模型 API；不做后台管理界面。

**Implementation Notes**
- 排期结构示例：`{ "batches": [{"time":"07:30","count":3},{"time":"12:30","count":4},{"time":"20:30","count":3}], "categories": ["热点搞怪","生活随笔","技术折腾","二次元"] }`
- 脚本用 Node 原生 fs + 正则改 frontmatter，避免引入新依赖；按 `published` 升序取够数量。
- 幂等：已发布（`draft: false`）不再处理；不足数量则发布现有并输出警告。

**Acceptance Criteria**
- `node scripts/publish-due-posts.mjs --dry-run` 能列出待发布清单且不修改文件。
- 正式运行后目标文件 `draft` 变为 `false`，其他文件不变。
- 构建后草稿不出现在 `dist` 与其他页面列表中。

**Verification**
```bash
node scripts/publish-due-posts.mjs --dry-run
pnpm build
# 检查 dist 中不存在样例草稿标题
```

**Suggested Prompt**
> 在 e:\presonal_blog\Firefly 中实现 TASK-001：创建 docs/operations 下的排期与模板文件，并新增 scripts/publish-due-posts.mjs，按排期把当日批次草稿的 frontmatter `draft` 置为 false，支持 --dry-run 与幂等。遵守 AGENTS.md（pnpm、tabs、双引号、Biome）。完成后运行 pnpm build 验证草稿未进入产物。

## TASK-002

**Goal**：每天早/中/晚自动发布 3/4/3 篇，无需人工。

**Context**：Cloudflare Workers Builds 监听 `main` 分支 push 后自动 `pnpm build` + `wrangler deploy`；现有 CI 文件为 `.github/workflows/build.yml`（仅 `master` 分支）。

**Scope**
- 新增 `.github/workflows/daily-publish.yml`：三个 cron（UTC `30 23`、`30 4`、`30 12`）+ `workflow_dispatch`（输入 `batch: morning|noon|evening`）。
- 步骤：checkout → setup pnpm/node → 运行 TASK-001 脚本 → 有变更则 commit & push，无变更退出。
- 提交信息：`chore(content): publish <batch> batch`。

**Non-goals**：不在 Action 内跑构建；不创建 PR 流程（除非博主后续要求）。

**Implementation Notes**
- `permissions: contents: write`；使用 `GITHUB_TOKEN`。
- 时区注意：cron 为 UTC，北京时间减 8 小时。
- 若 Actions 排队延迟，接受 ±30 分钟误差。
- 失败重试：脚本失败时任务失败并邮件通知，不重试以避免重复发布。

**Acceptance Criteria**
- `workflow_dispatch` 手动触发可成功推送一次发布 commit。
- 连续 3 天三批均成功，每次线上出现对应数量新文章。
- 无候选稿件时 workflow 成功退出且无空提交。

**Verification**
```bash
gh workflow run daily-publish.yml -f batch=morning
gh run list --workflow=daily-publish.yml
```
线上检查 `/` 首页新文章数量与 `/rss/`。

## TASK-003

**Goal**：上线 Waline 评论，读者可匿名留言，数据持久化。

**Context**：`src/config/commentConfig.ts` 中 `type: "waline"`；站点与评论服务均部署在 Cloudflare Workers。

**Scope**
- 在 Cloudflare 部署 Waline 服务端（独立 Worker，绑定 `waline.05221024.xyz`），数据库使用 Cloudflare D1，按 `schema.sql` 初始化。
- 修改 `commentConfig`：`serverURL` 指向 Worker、`visitorCount: true`。
- 留言板图片上传走 Waline Worker 的 `/api/upload` 代理到 Cloudflare-ImgBed。

**Non-goals**：不迁移历史评论；不做第三方 OAuth 登录。

**Implementation Notes**
- 自定义域名与主站 Worker 不要复用，避免 `run_worker_first` 冲突。
- 数据库连接通过 D1 binding 注入，密钥存 Worker 环境变量。
- 开启后台管理密码，防止未授权管理。

**Acceptance Criteria**
- 文章页出现评论框；匿名提交后刷新仍在；不同文章评论隔离。
- 访问量统计正常增长。
- 评论接口返回 200，无 CORS 报错。

**Verification**：线上任意文章提交一条测试评论 → 换浏览器/隐身窗口确认可见 → `https://waline.05221024.xyz/ui` 管理面板可见。

## TASK-004

**Goal**：能看到访问量与热门文章。

**Scope**：Cloudflare Dashboard 启用 Web Analytics，获取 beacon 脚本或 token，按 Firefly 现有配置接入；确认只统计生产域名。

**Acceptance Criteria**：24 小时内后台有数据；无重复统计；不影响 Lighthouse。

**Verification**：访问站点数次后刷新 Analytics 面板。

## TASK-005

**Goal**：四栏目在站内可见、归档正确。

**Scope**：核对 `category` 取值与分类页展示一致；确保「热点搞怪/生活随笔/技术折腾/二次元」出现在分类导航或归档；不需要的演示分类不留残余。

**Acceptance Criteria**：四个分类页各至少 1 篇；文章卡片分类标签正确；移动端导航可点。

**Verification**：`pnpm dev` 逐个访问 `/categories/`、各分类页与文章页。

## TASK-006

**Goal**：产出首周 70 篇符合规范的草稿。

**Context**：来源为微博热搜、B站热门、知乎热榜、抖音/百度热搜；基调搞怪；四栏目分配建议 4:3:2:1。

**Scope**
- 每日 10 篇：热点搞怪 4、生活随笔 3、技术折腾 2、二次元 1。
- 每篇 400–900 字，含 `description`、2–5 个 `tags`、结尾互动提问。
- 全部 `draft: true`，按 `published` 排出发布时间。

**Non-goals**：不追求深度长文；不做系列连载（除非自然形成）。

**Acceptance Criteria**
- 70 篇均可通过 `pnpm check`/`build`；无红线话题；无搬运段落；分类与标签规范一致。

**Verification**：`pnpm build` 通过；抽查 7 篇人工通读；红线清单逐条对照。

## TASK-007

**Goal**：一周后给出是否调整节奏的明确结论。

**Scope**：汇总 7 天数据（发布数、访问、Top5 文章、评论数、抽检问题），输出 `docs/operations/weekly-review-YYYY-Www.md`，结论三选一：维持 10 篇 / 下调（写明数量）/ 调整栏目配比。

**Acceptance Criteria**：结论有数据支撑；若调整，明确写出需要改的文件（排期 json、配比说明），不直接改代码。

## TASK-008

**Goal**：补齐可选配置。

**Scope**：番组（Bangumi userId）、VNDB（userId）、MAL（username + clientId）填入后验证页面；音乐播放器若替换，更新 `src/config/musicConfig.ts` 的歌曲列表与封面。

**Acceptance Criteria**：对应页面无「未配置」提示；构建通过。

## 验证计划

| 层级 | 方法 | 频率 |
| --- | --- | --- |
| 本地 | `pnpm check` / `type-check` / `build` | 每次改代码 |
| 内容 | 红线清单 + 抽检 10% | 每周 |
| 发布 | workflow 日志 + 线上 URL 核查 | 每日 |
| 互动 | 提交测试评论、查看管理面板 | 每周 |
| 数据 | Analytics 面板 | 每周日 |

## 如何把这些任务交给 AI 助手、编码工具或类似 agent 使用

- **先给上下文**：`00-project-blueprint.md`（目标与风险）+ `03-solution-blueprint.md`（执行模型）+ 本文件的对应 TASK。
- **一次只给一个 TASK**，用 TASK 里的「Suggested Prompt」作为起始指令，附上验收标准，要求执行完跑验证命令。
- **编码类任务（001/002/003/005）**：交给能读写仓库的 agent，要求遵守 `AGENTS.md`（pnpm、tabs、双引号、Biome、Conventional Commits）。
- **内容类任务（006）**：交给写作型 AI 或人工；先给红线清单与栏目配比，按批次产出，避免一次生成 70 篇导致风格重复。
- **运营类任务（007）**：由博主拍板，AI 只负责汇总数据与起草结论，不代做决定。
- **不要**让 agent 自行改发布频率、栏目结构或红线——这些只能改本文档，再由人确认。
