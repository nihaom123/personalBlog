# 交互升级与评论迁移方案

- **状态**: 仅方案，未改动任何代码
- **生成日期**: 2026-10-25
- **适用范围**: Firefly 主题站（`e:\presonal_blog\Firefly`）与周边基础设施（`e:\presonal_blog\infra`）

## 一、已确认的决策

| 项目 | 决策 |
| --- | --- |
| 本次范围 | 只出方案，不改代码 |
| 文章评论区 | 迁移到 Waline，使用 Waline 官方默认 UI |
| 历史评论 | 不迁移，Waline 从空库开始 |
| 播放器三态 | 迷你胶囊 / 侧栏面板 / 全屏唱片 |
| 图床 | 继续使用 CloudFlare-ImgBed，补齐 R2 存储即可 |

## 二、现状与约束

### 2.1 评论区

- [commentConfig.ts](../src/config/commentConfig.ts) 中 `type: "waline"`，文章评论区与 `/guestbook/` 聊天式留言板共用同一套 Waline 后端。
- 评论路由：[index.astro](../src/components/comment/index.astro) 根据 `type` 渲染 Waline 等评论组件。
- [Waline.astro](../src/components/comment/Waline.astro) 已经支持 `path`、`pageview`、表情、上传接口。
- [PostMeta.astro](../src/components/layout/PostMeta.astro) 已实现 Waline 阅读量节点 `.waline-pageview-count`。
- 留言板 [GuestbookChat.svelte](../src/components/features/GuestbookChat.svelte) 使用固定路径 `CHANNEL_PATH = "/guestbook/"`，与文章路径 `/posts/{slug}` 不冲突。

### 2.2 播放器

- 音频单例由 [MusicManager.astro](../src/components/features/MusicManager.astro) 维护，`window.__fireflyMusic` + CustomEvent 同步多个视图。
- UI 目前是 Astro + 内联脚本：[MusicPlayer.astro](../src/components/features/MusicPlayer.astro)、[MusicPlayerView.astro](../src/components/features/MusicPlayerView.astro)。
- 导航栏与侧栏各有实例（[Navbar.astro](../src/components/layout/Navbar.astro)、[Music.astro](../src/components/widget/Music.astro)）。
- 关键约束：`MusicPlayerView.astro` 的内联脚本依赖 Swup 的 `content:replace` 重跑，不能简单改成打包模块。

### 2.3 壁纸与友链

- [WallpaperSection.astro](../src/components/layout/WallpaperSection.astro) 支持全屏 / 横幅 / 轮播，但没有滚动视差和揭幕入场。
- [friends.astro](../src/pages/friends.astro) 的卡片层为 `z-10`，背景是空的，适合放 Canvas 粒子层。

## 三、阶段一：评论统一到 Waline（官方默认 UI）

### 改动清单

1. `src/config/commentConfig.ts`
   - `type` 已改为 `"waline"`，并移除旧评论系统的配置块。
   - 注释说明文章区与留言板统一使用 Waline。
2. `src/components/comment/Waline.astro`（按需微调）
   - 文章评论字数上限由 `["2", "300"]` 调整为 `["2", "1000"]`；留言板不受影响。
   - CDN 可保持 `unpkg.com`；若国内加载慢，再换 `registry.npmmirror.com` 的 `@waline/client@v3`。
3. 已删除旧评论组件及其主题覆盖样式，[PostMeta.astro](../src/components/layout/PostMeta.astro) 的旧阅读量分支同步移除。

### 行为变化

- 阅读量：Waline 从 0 开始累计，旧计数不迁移。
- 留言板：路径仍是 `/guestbook/`，与文章评论互不影响。
- 管理入口：统一到 `https://waline.05221024.xyz/ui`。

### 验收标准

- 任意文章页出现 Waline 默认评论框，匿名可提交。
- 刷新后评论仍在，不同文章评论互相隔离。
- 文章页阅读量正常增长。
- 留言板聊天界面不受影响。
- `pnpm check`、`pnpm type-check`、`pnpm build` 全部通过。

### 回滚

- 旧评论系统已从主题代码、配置、静态资源和文档中彻底移除，不再保留回滚路径。

## 四、阶段二：友链页 Canvas 粒子特效

### 实现方式

新增 `src/components/features/FriendParticles.svelte`，在 [friends.astro](../src/pages/friends.astro) 卡片容器内挂载：

- 结构：`<canvas>` 绝对定位铺满容器，`pointer-events: none`，层级 `z-0`，卡片保持 `z-10`。
- 渲染：设备像素比适配、`requestAnimationFrame`、按面积计算粒子数（桌面上限 80、移动端上限 40）。
- 交互：鼠标 120px 范围内轻微排斥，粒子距离小于 110px 时连线。
- 性能：`ResizeObserver` 重算尺寸；`IntersectionObserver` 离屏暂停；页面隐藏暂停；`prefers-reduced-motion` 时只画静态点。
- 配色：读取 CSS 变量 `--primary`，跟随明暗主题变化。

### 配置

在 `src/config/friendsPageConfig.ts`（若不存在则新增）加入：

```ts
particles: {
  enabled: true,
  density: 1,
  interactive: true,
}
```

### 验收标准

- 粒子层不遮挡搜索、标签筛选与卡片点击。
- 手机滚动与筛选无明显掉帧感。
- 关闭动效偏好时不播放动画。
- 明暗主题切换后颜色同步。

## 五、阶段三：全屏壁纸视差 + 揭幕

### 视差

- 仅在全屏壁纸模式启用，横幅模式不启用。
- 图片层放大到 1.12 倍，滚动时 `translate3d(0, scrollY * 0.25, 0)`，避免边缘露底。
- 使用 rAF 合并滚动事件，`will-change: transform`。
- 移动端、`prefers-reduced-motion`、低性能设备（`navigator.hardwareConcurrency <= 4` 可选）直接关闭。

### 揭幕

- 首次进入站点时，用 `clip-path` 从中间向两侧揭开壁纸，同时图片从 1.06 倍回落到 1 倍，约 700ms。
- 用 `sessionStorage` 标记，同一会话内换页不重复播放。
- 站点内跳转（Swup）不触发，整页刷新才触发。

### 改动文件

- `src/components/layout/WallpaperSection.astro`：增加视差数据属性与内联脚本。
- 新增 `src/styles/wallpaper-effects.css`：只放动画与 transform 规则。
- `src/layouts/Layout.astro`：引入新样式。

### 验收标准

- 滚动时背景移动平滑，无横向抖动、无露边。
- 首屏 LCP 不明显变差，CLS 为 0。
- 关掉动画偏好后只剩静态壁纸。

## 六、阶段四：Svelte 播放器三态变形

### 三态定义

| 状态 | 形态 | 入口 |
| --- | --- | --- |
| 迷你胶囊 | 右下角固定小条：封面 + 歌名 + 播放/暂停 | 默认收起态 |
| 侧栏面板 | 340px 卡片：进度、音量、播放列表、歌词入口 | 点击胶囊、导航栏音乐按钮 |
| 全屏唱片 | 全屏遮罩：旋转唱片、歌词、进度 | 点击封面或“展开”按钮 |

### 架构建议

- 保留 `MusicManager.astro` 作为唯一音频引擎，不改播放逻辑。
- 新增 `src/components/features/MusicPlayerShell.svelte`：
  - 通过 `window.__fireflyMusic` 和现有 CustomEvent 读写状态。
  - 挂载在 [Layout.astro](../src/layouts/Layout.astro) 中，位置在 Swup 替换容器之外，保证换页后播放器不重建、音乐不断。
- 原 `MusicPlayer.astro` / `MusicPlayerView.astro` 在三态版本通过验收后再下线，保留 git 回滚。

### 变形实现

- 单个容器元素，不要为三态各写一套 DOM。
- 用 `svelte/motion` 的 `tweened` 驱动宽高、圆角、位移；或记录收起态 `getBoundingClientRect()` 后做 FLIP 动画。
- 展开时封面从迷你尺寸平滑放大到面板/唱片尺寸，标题与按钮用 `fade`/`fly` 过渡。
- 全屏态使用 `position: fixed; inset: 0`，背景做毛玻璃，Esc 与点击遮罩退出。

### 兼容与细节

- 移动端：胶囊吸附底部；面板改为底部抽屉；全屏态铺满。
- 键盘：Space 播放/暂停，Esc 收起，焦点在全屏态内循环。
- Swup 换页：胶囊与全屏态状态保留，不重新初始化音频。
- 无障碍：`aria-expanded`、`aria-label`、`prefers-reduced-motion` 下取消旋转与形变。

### 验收标准

- 三种状态互相切换无黑屏、无跳动，形变连续。
- 换页后播放进度与播放状态不丢失。
- 导航栏与侧栏入口都能打开同一个播放器，不出现两个音频同时播放。
- 手机端可单手操作，播放列表可滚动。

## 七、阶段五：CloudFlare-ImgBed 补齐 R2

仓库里 [infra/imgbed](../../infra/imgbed) 与 Waline 上传代理已就绪，[upload.ts](../../infra/waline-worker/src/router/upload.ts) 使用 `IMGBED_URL`、`IMGBED_AUTH_CODE`、`IMGBED_UPLOAD_CHANNEL=cfr2`。

### 待办

1. Cloudflare 控制台启用 R2，创建存储桶（例如 `blog-images`）。
2. 在 ImgBed Worker 绑定该桶，配置 `cfr2` 上传渠道。
3. 给 `img.05221024.xyz` 配置 CORS，允许博客域名读取。
4. 在 Waline Worker 确认 `IMGBED_URL`、`IMGBED_AUTH_CODE` 已设置。
5. 验证：留言板发图 → ImgBed 上传 → 返回可访问的 `publicUrl` → 刷新仍显示。

### 验收标准

- 图片上传成功且返回公网可访问地址。
- 超过 5MB 或非图片文件被拒绝。
- 删除图片后 D1 记录与 R2 对象同步清理。

## 八、验证与上线顺序

建议按风险从低到高执行：

1. 评论区切 Waline（配置改动小，可立刻回滚）。
2. 友链粒子（独立组件，不影响其他页面）。
3. 壁纸视差 / 揭幕（只影响首屏）。
4. 播放器 Svelte 三态（改动最大，最后做）。
5. R2 开通与上传联调（控制台操作，独立于代码）。

每个阶段完成后固定执行：

```bash
pnpm check
pnpm type-check
pnpm build
```

涉及 Worker 的阶段再补一次线上验证：

- 文章页提交评论、刷新、换浏览器复查。
- 留言板发图并确认图片可访问。
- 手机与桌面各看一次首屏和播放器。

## 九、风险与回滚

| 风险 | 应对 |
| --- | --- |
| Waline 在部分网络下加载慢 | 换 npmmirror CDN |
| 阅读量从 0 开始 | 接受 |
| 粒子特效拖慢低端机 | 密度按面积自适应，离屏暂停，可配置关闭 |
| 视差造成 CLS / 掉帧 | 只在全屏模式启用，移动端关闭，`prefers-reduced-motion` 关闭 |
| Svelte 播放器换页被重建 | 挂载点在 Swup 容器外；验收时专门测试换页 |
| R2 未开通导致上传 502 | 先在控制台开通并绑桶，再联调上传 |

## 十、明确不做

- 不迁移旧评论数据，也不做双向互转脚本。
- 旧评论系统的代码、配置与文档引用已全部移除。
- 不把留言板聊天界面改成 Waline 官方 UI（留言板保持现有聊天式）。
- 不改文章发布流程、栏目结构与其他既有功能。
