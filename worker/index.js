// 入口 Worker：把 http 请求 301 跳转到 https，其余请求交给静态资源。
export default {
	async fetch(request, env) {
		const url = new URL(request.url);

		if (url.protocol === "http:") {
			url.protocol = "https:";
			return Response.redirect(url.toString(), 301);
		}

		return env.ASSETS.fetch(request);
	},
};
