<script lang="ts">
import { onMount } from "svelte";
import { friendsPageConfig } from "@/config/friendsConfig";

type Particle = {
	x: number;
	y: number;
	vx: number;
	vy: number;
	r: number;
};

const options = {
	enabled: true,
	density: 1,
	interactive: true,
	...(friendsPageConfig.particles ?? {}),
};

let canvas: HTMLCanvasElement;

onMount(() => {
	if (!options.enabled || !canvas) return;

	// Astro 会在组件外再包一层 <astro-island>，它的尺寸为 0，不能当画布容器
	const host =
		canvas.closest<HTMLElement>(".card-base") ??
		(canvas.parentElement as HTMLElement | null);
	if (!host) return;

	const ctx = canvas.getContext("2d");
	if (!ctx) return;

	const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
	let width = 0;
	let height = 0;
	let dpr = 1;
	let particles: Particle[] = [];
	let rafId = 0;
	let running = false;
	let visible = true;
	let pointer: { x: number; y: number } | null = null;
	const LINK_DISTANCE = 110;
	const POINTER_DISTANCE = 120;

	function readColor(): string {
		const value = getComputedStyle(document.documentElement)
			.getPropertyValue("--primary")
			.trim();
		if (!value) return "99, 102, 241";
		if (value.startsWith("#")) {
			const hex = value.slice(1);
			const full =
				hex.length === 3
					? hex
							.split("")
							.map((c) => c + c)
							.join("")
					: hex;
			const num = Number.parseInt(full.slice(0, 6), 16);
			if (Number.isNaN(num)) return "99, 102, 241";
			return `${(num >> 16) & 255}, ${(num >> 8) & 255}, ${num & 255}`;
		}
		const rgb = value.match(/\d+(?:\.\d+)?/g);
		return rgb && rgb.length >= 3
			? `${rgb[0]}, ${rgb[1]}, ${rgb[2]}`
			: "99, 102, 241";
	}

	let color = readColor();

	function resize() {
		const rect = host.getBoundingClientRect();
		width = Math.max(1, rect.width);
		height = Math.max(1, rect.height);
		dpr = Math.min(window.devicePixelRatio || 1, 2);
		canvas.width = Math.round(width * dpr);
		canvas.height = Math.round(height * dpr);
		canvas.style.width = `${width}px`;
		canvas.style.height = `${height}px`;

		const maxCount = window.innerWidth < 768 ? 36 : 76;
		const count = Math.round(
			Math.min(maxCount, (width * height) / 18000) * options.density,
		);
		particles = Array.from({ length: count }, () => ({
			x: Math.random() * width,
			y: Math.random() * height,
			vx: (Math.random() - 0.5) * 0.35,
			vy: (Math.random() - 0.5) * 0.35,
			r: 0.8 + Math.random() * 1.6,
		}));
	}

	function drawFrame(animate: boolean) {
		ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
		ctx.clearRect(0, 0, width, height);

		for (const p of particles) {
			if (animate) {
				p.x += p.vx;
				p.y += p.vy;

				if (options.interactive && pointer) {
					const dx = p.x - pointer.x;
					const dy = p.y - pointer.y;
					const dist = Math.hypot(dx, dy);
					if (dist > 0 && dist < POINTER_DISTANCE) {
						const force = (1 - dist / POINTER_DISTANCE) * 0.6;
						p.x += (dx / dist) * force;
						p.y += (dy / dist) * force;
					}
				}

				if (p.x < -10) p.x = width + 10;
				else if (p.x > width + 10) p.x = -10;
				if (p.y < -10) p.y = height + 10;
				else if (p.y > height + 10) p.y = -10;
			}

			ctx.beginPath();
			ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
			ctx.fillStyle = `rgba(${color}, 0.45)`;
			ctx.fill();
		}

		for (let i = 0; i < particles.length; i++) {
			for (let j = i + 1; j < particles.length; j++) {
				const a = particles[i];
				const b = particles[j];
				const dist = Math.hypot(a.x - b.x, a.y - b.y);
				if (dist < LINK_DISTANCE) {
					const alpha = (1 - dist / LINK_DISTANCE) * 0.22;
					ctx.beginPath();
					ctx.moveTo(a.x, a.y);
					ctx.lineTo(b.x, b.y);
					ctx.strokeStyle = `rgba(${color}, ${alpha})`;
					ctx.lineWidth = 0.6;
					ctx.stroke();
				}
			}
		}

		if (options.interactive && pointer) {
			for (const p of particles) {
				const dist = Math.hypot(p.x - pointer.x, p.y - pointer.y);
				if (dist < POINTER_DISTANCE) {
					ctx.beginPath();
					ctx.moveTo(p.x, p.y);
					ctx.lineTo(pointer.x, pointer.y);
					ctx.strokeStyle = `rgba(${color}, ${(1 - dist / POINTER_DISTANCE) * 0.3})`;
					ctx.lineWidth = 0.5;
					ctx.stroke();
				}
			}
		}
	}

	function loop() {
		if (!running) return;
		drawFrame(true);
		rafId = requestAnimationFrame(loop);
	}

	function start() {
		if (running || reducedMotion.matches || !visible) return;
		running = true;
		rafId = requestAnimationFrame(loop);
	}

	function stop() {
		running = false;
		if (rafId) cancelAnimationFrame(rafId);
		rafId = 0;
	}

	function handlePointerMove(event: PointerEvent) {
		const rect = host.getBoundingClientRect();
		pointer = {
			x: event.clientX - rect.left,
			y: event.clientY - rect.top,
		};
	}

	function handlePointerLeave() {
		pointer = null;
	}

	function handleVisibility() {
		if (document.hidden) stop();
		else start();
	}

	function handleThemeChange() {
		color = readColor();
		if (reducedMotion.matches) drawFrame(false);
	}

	function handleReducedMotion() {
		if (reducedMotion.matches) {
			stop();
			drawFrame(false);
		} else {
			start();
		}
	}

	resize();
	drawFrame(false);

	const resizeObserver = new ResizeObserver(() => {
		resize();
		if (reducedMotion.matches) drawFrame(false);
	});
	resizeObserver.observe(host);

	const intersectionObserver = new IntersectionObserver((entries) => {
		visible = entries[0]?.isIntersecting ?? true;
		if (visible) start();
		else stop();
	});
	intersectionObserver.observe(host);

	const themeObserver = new MutationObserver(handleThemeChange);
	themeObserver.observe(document.documentElement, {
		attributes: true,
		attributeFilter: ["class", "style"],
	});

	document.addEventListener("visibilitychange", handleVisibility);
	reducedMotion.addEventListener("change", handleReducedMotion);
	if (options.interactive) {
		host.addEventListener("pointermove", handlePointerMove);
		host.addEventListener("pointerleave", handlePointerLeave);
	}

	start();

	return () => {
		stop();
		resizeObserver.disconnect();
		intersectionObserver.disconnect();
		themeObserver.disconnect();
		document.removeEventListener("visibilitychange", handleVisibility);
		reducedMotion.removeEventListener("change", handleReducedMotion);
		host.removeEventListener("pointermove", handlePointerMove);
		host.removeEventListener("pointerleave", handlePointerLeave);
	};
});
</script>

<canvas bind:this={canvas} class="friends-particles" aria-hidden="true"></canvas>
