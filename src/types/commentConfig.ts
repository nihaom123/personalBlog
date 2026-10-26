export type CommentConfig = {
	/**
	 * 当前启用的评论系统类型
	 * "none" | "waline" | "giscus" | "disqus" | 'artalk'
	 */
	type: "none" | "waline" | "giscus" | "disqus" | "artalk";
	waline?: {
		serverURL: string;
		lang?: string;
		emoji: string[];
		/**
		 * 留言板图片上传接口地址（可选）
		 * 未配置时图片会以 base64 内联，单张不能超过 128 KB
		 */
		imageUploadURL?: string;
		login?: "enable" | "force" | "disable";
		visitorCount?: boolean; // 是否统计访问量，true 启用访问量，false 关闭
	};
	artalk?: {
		// 后端程序 API 地址
		server: string;
		/**
		 * 语言，支持语言如下：
		 * - "en" (English)
		 * - "zh-CN" (简体中文)
		 * - "zh-TW" (繁体中文)
		 * - "ja" (日本語)
		 * - "ko" (한국어)
		 * - "fr" (Français)
		 * - "ru" (Русский)
		 * */
		locale: string | "auto";
		// 是否统计访问量，true 启用访问量，false 关闭
		visitorCount?: boolean;
	};
	giscus?: {
		repo: string;
		repoId: string;
		category: string;
		categoryId: string;
		mapping: string;
		strict: string;
		reactionsEnabled: string;
		emitMetadata: string;
		inputPosition: string;
		lang: string;
		loading: string;
	};
	disqus?: {
		shortname: string;
	};
};
