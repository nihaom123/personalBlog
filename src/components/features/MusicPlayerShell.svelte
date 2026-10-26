<script lang="ts">
import {
	ChevronDown,
	ListMusic,
	Maximize2,
	Minimize2,
	Music2,
	Pause,
	Play,
	Repeat,
	Repeat1,
	Shuffle,
	SkipBack,
	SkipForward,
	Volume2,
	VolumeX,
} from "@lucide/svelte";
import { onMount } from "svelte";
import { fade, fly } from "svelte/transition";
import { musicPlayerConfig } from "@/config/musicConfig";

type Track = {
	name: string;
	artist: string;
	url: string;
	pic?: string;
	lrc?: string;
};

type LyricLine = { time: number; text: string };

type PlayerState = {
	playlist: Track[];
	currentIndex: number;
	track: Track | null;
	isPlaying: boolean;
	playMode: number;
	volume: number;
	isMuted: boolean;
	progress: number;
	currentTimeStr: string;
	durationStr: string;
	lyrics: LyricLine[];
	currentLrcIndex: number;
};

type MusicManager = {
	init: () => Promise<void>;
	getState: () => PlayerState;
	togglePlay: () => void;
	playNext: () => void;
	playPrev: () => void;
	cyclePlayMode: () => void;
	setVolume: (value: number) => void;
	toggleMute: () => void;
	seek: (percent: number) => void;
	playTrackByIndex: (index: number) => void;
};

type ShellMode = "hidden" | "capsule" | "panel" | "full";

let mode = $state<ShellMode>("hidden");
let playlist = $state<Track[]>([]);
let currentIndex = $state(0);
let track = $state<Track | null>(null);
let isPlaying = $state(false);
let playMode = $state(0);
let volume = $state(0.7);
let isMuted = $state(false);
let progress = $state(0);
let currentTimeStr = $state("0:00");
let durationStr = $state("0:00");
let lyrics = $state<LyricLine[]>([]);
let lrcIndex = $state(-1);
let errorMessage = $state("");
let manager: MusicManager | null = null;
let lyricList = $state<HTMLDivElement | null>(null);

const showLyrics = musicPlayerConfig.showLyrics ?? false;

const playModeLabel = $derived(
	playMode === 0 ? "列表循环" : playMode === 1 ? "单曲循环" : "随机播放",
);

function getManager(): MusicManager | null {
	return (
		(window as unknown as { __fireflyMusic?: MusicManager }).__fireflyMusic ??
		null
	);
}

function applyState(state: PlayerState) {
	playlist = state.playlist;
	currentIndex = state.currentIndex;
	track = state.track;
	isPlaying = state.isPlaying;
	playMode = state.playMode;
	volume = state.volume;
	isMuted = state.isMuted;
	progress = state.progress;
	currentTimeStr = state.currentTimeStr;
	durationStr = state.durationStr;
	lyrics = state.lyrics ?? [];
	lrcIndex = state.currentLrcIndex;
}

function revealCapsule() {
	if (mode === "hidden" && playlist.length > 0) mode = "capsule";
}

function openPanel() {
	if (mode === "hidden") mode = "capsule";
	if (mode !== "full") mode = "panel";
}

function minimize() {
	mode = mode === "full" ? "panel" : "capsule";
}

function openFull() {
	mode = "full";
}

function handleKeydown(event: KeyboardEvent) {
	if (event.key !== "Escape") return;
	if (mode === "full") mode = "panel";
	else if (mode === "panel") mode = "capsule";
}

function togglePlay() {
	manager?.togglePlay();
}

function seekTo(percent: number) {
	manager?.seek(Math.max(0, Math.min(100, percent)) / 100);
}

function changeVolume(percent: number) {
	manager?.setVolume(Math.max(0, Math.min(100, percent)) / 100);
}

function playIndex(index: number) {
	manager?.playTrackByIndex(index);
}

onMount(() => {
	manager = getManager();
	if (!manager) return;

	applyState(manager.getState());

	const onInit = (event: Event) => {
		const detail = (event as CustomEvent).detail as {
			playlist: Track[];
			playMode: number;
			volume: number;
			isMuted: boolean;
		};
		playlist = detail.playlist ?? [];
		playMode = detail.playMode;
		volume = detail.volume;
		isMuted = detail.isMuted;
		revealCapsule();
	};

	const onTrack = (event: Event) => {
		const detail = (event as CustomEvent).detail as {
			index: number;
			track: Track;
		};
		currentIndex = detail.index;
		track = detail.track;
		progress = 0;
		currentTimeStr = "0:00";
		durationStr = "0:00";
		lyrics = [];
		lrcIndex = -1;
		revealCapsule();
	};

	const onPlayState = (event: Event) => {
		isPlaying = (event as CustomEvent).detail.isPlaying;
		revealCapsule();
	};

	const onTime = (event: Event) => {
		const detail = (event as CustomEvent).detail as PlayerState;
		progress = detail.progress;
		currentTimeStr = detail.currentTimeStr;
		durationStr = detail.durationStr;
	};

	const onLyrics = (event: Event) => {
		const detail = (event as CustomEvent).detail as {
			lyrics: LyricLine[];
			status: string;
		};
		lyrics = detail.lyrics ?? [];
	};

	const onLrcIndex = (event: Event) => {
		lrcIndex = (event as CustomEvent).detail.index;
		if (mode !== "full" || !lyricList) return;
		const active = lyricList.querySelector<HTMLElement>("[data-active='true']");
		active?.scrollIntoView({ block: "center", behavior: "smooth" });
	};

	const onMode = (event: Event) => {
		playMode = (event as CustomEvent).detail.playMode;
	};

	const onVolume = (event: Event) => {
		const detail = (event as CustomEvent).detail;
		volume = detail.volume;
		isMuted = detail.isMuted;
	};

	const onError = (event: Event) => {
		errorMessage = (event as CustomEvent).detail.message ?? "";
		window.setTimeout(() => {
			errorMessage = "";
		}, 3000);
	};

	const onShellOpen = () => {
		if (playlist.length > 0) openPanel();
	};

	window.addEventListener("fm:init", onInit);
	window.addEventListener("fm:track", onTrack);
	window.addEventListener("fm:play-state", onPlayState);
	window.addEventListener("fm:time", onTime);
	window.addEventListener("fm:lyrics", onLyrics);
	window.addEventListener("fm:lrc-index", onLrcIndex);
	window.addEventListener("fm:mode", onMode);
	window.addEventListener("fm:volume", onVolume);
	window.addEventListener("fm:error", onError);
	window.addEventListener("fm:shell-open", onShellOpen);
	window.addEventListener("keydown", handleKeydown);

	manager.init().catch(() => {
		/* 初始化失败由 MusicManager 自行广播错误 */
	});

	return () => {
		window.removeEventListener("fm:init", onInit);
		window.removeEventListener("fm:track", onTrack);
		window.removeEventListener("fm:play-state", onPlayState);
		window.removeEventListener("fm:time", onTime);
		window.removeEventListener("fm:lyrics", onLyrics);
		window.removeEventListener("fm:lrc-index", onLrcIndex);
		window.removeEventListener("fm:mode", onMode);
		window.removeEventListener("fm:volume", onVolume);
		window.removeEventListener("fm:error", onError);
		window.removeEventListener("fm:shell-open", onShellOpen);
		window.removeEventListener("keydown", handleKeydown);
	};
});
</script>

{#if mode !== "hidden" && playlist.length > 0}
	<div
		class={mode === "panel" ? "music-shell is-panel" : "music-shell is-capsule"}
		aria-label="音乐播放器"
	>
		{#if mode === "capsule"}
			<div class="capsule-main">
				<button class="capsule-open" type="button" onclick={openPanel} aria-label="展开播放器">
					<span class={isPlaying ? "capsule-cover is-playing" : "capsule-cover"}>
						{#if track?.pic}
							<img src={track.pic} alt={track.name} />
						{:else}
							<Music2 size={18} />
						{/if}
					</span>
					<span class="capsule-text">
						<span class="capsule-title">{track?.name ?? "暂无歌曲"}</span>
						<span class="capsule-artist">{track?.artist ?? "点击选择音乐"}</span>
					</span>
				</button>
				<div class="capsule-actions">
					<button
						type="button"
						class="icon-button primary"
						aria-label={isPlaying ? "暂停" : "播放"}
						onclick={togglePlay}
					>
						{#if isPlaying}
							<Pause size={18} fill="currentColor" />
						{:else}
							<Play size={18} fill="currentColor" />
						{/if}
					</button>
					<button
						type="button"
						class="icon-button"
						aria-label="展开大播放器"
						onclick={openFull}
					>
						<Maximize2 size={16} />
					</button>
				</div>
			</div>
			<div class="capsule-progress" style={`--progress: ${progress}%`}></div>
		{:else}
			<div class="panel-card" in:fly={{ y: 16, duration: 260 }}>
				<header class="panel-header">
					<div class="panel-heading">
						<span class="panel-eyebrow">正在播放</span>
						<span class="panel-title">{track?.name ?? "暂无歌曲"}</span>
						<span class="panel-artist">{track?.artist ?? ""}</span>
					</div>
					<div class="panel-header-actions">
						<button type="button" class="icon-button" aria-label="全屏唱片" onclick={openFull}>
							<Maximize2 size={16} />
						</button>
						<button type="button" class="icon-button" aria-label="收起播放器" onclick={minimize}>
							<ChevronDown size={18} />
						</button>
					</div>
				</header>

				<div class="panel-cover-row">
					<button
						type="button"
						class={isPlaying ? "panel-cover is-playing" : "panel-cover"}
						onclick={openFull}
						aria-label="打开全屏唱片"
					>
						{#if track?.pic}
							<img src={track.pic} alt={track.name} />
						{:else}
							<Music2 size={30} />
						{/if}
					</button>
					<div class="panel-progress-area">
						<input
							class="progress-range"
							type="range"
							min="0"
							max="100"
							step="0.1"
							value={progress}
							aria-label="播放进度"
							oninput={(event) => seekTo(Number(event.currentTarget.value))}
						/>
						<div class="time-row">
							<span>{currentTimeStr}</span>
							<span>{durationStr}</span>
						</div>
					</div>
				</div>

				<div class="panel-controls">
					<button
						type="button"
						class="icon-button"
						aria-label={playModeLabel}
						title={playModeLabel}
						onclick={() => manager?.cyclePlayMode()}
					>
						{#if playMode === 0}
							<Repeat size={16} />
						{:else if playMode === 1}
							<Repeat1 size={16} />
						{:else}
							<Shuffle size={16} />
						{/if}
					</button>
					<button type="button" class="icon-button" aria-label="上一首" onclick={() => manager?.playPrev()}>
						<SkipBack size={18} fill="currentColor" />
					</button>
					<button
						type="button"
						class="icon-button primary big"
						aria-label={isPlaying ? "暂停" : "播放"}
						onclick={togglePlay}
					>
						{#if isPlaying}
							<Pause size={20} fill="currentColor" />
						{:else}
							<Play size={20} fill="currentColor" />
						{/if}
					</button>
					<button type="button" class="icon-button" aria-label="下一首" onclick={() => manager?.playNext()}>
						<SkipForward size={18} fill="currentColor" />
					</button>
					<button type="button" class="icon-button" aria-label="静音" onclick={() => manager?.toggleMute()}>
						{#if isMuted || volume === 0}
							<VolumeX size={16} />
						{:else}
							<Volume2 size={16} />
						{/if}
					</button>
				</div>

				<div class="volume-row">
					<input
						class="volume-range"
						type="range"
						min="0"
						max="100"
						step="1"
						value={isMuted ? 0 : volume * 100}
						aria-label="音量"
						oninput={(event) => changeVolume(Number(event.currentTarget.value))}
					/>
				</div>

				<div class="playlist-section">
					<div class="playlist-heading">
						<ListMusic size={15} />
						<span>播放列表</span>
						<em>{playlist.length} 首</em>
					</div>
					<div class="playlist-list">
						{#each playlist as item, index (item.url + index)}
							<button
								type="button"
								class={index === currentIndex ? "playlist-item is-active" : "playlist-item"}
								onclick={() => playIndex(index)}
							>
								<span class="item-index">{index + 1}</span>
								<span class="item-titles">
									<span class="item-name">{item.name}</span>
									<span class="item-artist">{item.artist}</span>
								</span>
								{#if index === currentIndex && isPlaying}
									<span class="playing-bars" aria-hidden="true">
										<i></i><i></i><i></i>
									</span>
								{/if}
							</button>
						{/each}
					</div>
				</div>

				{#if errorMessage}
					<div class="shell-error" role="status">{errorMessage}</div>
				{/if}
			</div>
		{/if}
	</div>
{/if}

{#if mode === "full"}
	<div class="music-full" transition:fade={{ duration: 220 }} role="dialog" aria-modal="true" aria-label="全屏唱片">
		<button class="full-backdrop" type="button" aria-label="退出全屏" onclick={minimize}></button>
		<div class="full-card" in:fly={{ y: 24, duration: 320 }}>
			<div class="full-header">
				<span class="full-eyebrow">{playModeLabel}</span>
				<button type="button" class="icon-button" aria-label="收起" onclick={minimize}>
					<Minimize2 size={20} />
				</button>
			</div>

			<div class={isPlaying ? "full-vinyl is-playing" : "full-vinyl"}>
				{#if track?.pic}
					<img src={track.pic} alt={track.name} />
				{:else}
					<Music2 size={48} />
				{/if}
				<span class="vinyl-hole"></span>
			</div>

			<div class="full-meta">
				<span class="full-title">{track?.name ?? "暂无歌曲"}</span>
				<span class="full-artist">{track?.artist ?? ""}</span>
			</div>

			{#if showLyrics}
				<div
					class="full-lyrics"
					bind:this={lyricList}
					role="log"
					aria-label="歌词"
				>
					{#if lyrics.length > 0}
						{#each lyrics as line, index (index)}
							<p class={index === lrcIndex ? "lyric-line is-active" : "lyric-line"} data-active={index === lrcIndex}>
								{line.text}
							</p>
						{/each}
					{:else}
						<p class="lyric-empty">暂无歌词</p>
					{/if}
				</div>
			{:else}
				<div class="full-lyrics compact">
					<p class="lyric-empty">当前未启用歌词显示</p>
				</div>
			{/if}

			<div class="full-progress">
				<input
					class="progress-range"
					type="range"
					min="0"
					max="100"
					step="0.1"
					value={progress}
					aria-label="播放进度"
					oninput={(event) => seekTo(Number(event.currentTarget.value))}
				/>
				<div class="time-row">
					<span>{currentTimeStr}</span>
					<span>{durationStr}</span>
				</div>
			</div>

			<div class="full-controls">
				<button
					type="button"
					class="icon-button"
					aria-label={playModeLabel}
					onclick={() => manager?.cyclePlayMode()}
				>
					{#if playMode === 0}
						<Repeat size={18} />
					{:else if playMode === 1}
						<Repeat1 size={18} />
					{:else}
						<Shuffle size={18} />
					{/if}
				</button>
				<button type="button" class="icon-button" aria-label="上一首" onclick={() => manager?.playPrev()}>
					<SkipBack size={22} fill="currentColor" />
				</button>
				<button
					type="button"
					class="icon-button primary big"
					aria-label={isPlaying ? "暂停" : "播放"}
					onclick={togglePlay}
				>
					{#if isPlaying}
						<Pause size={24} fill="currentColor" />
					{:else}
						<Play size={24} fill="currentColor" />
					{/if}
				</button>
				<button type="button" class="icon-button" aria-label="下一首" onclick={() => manager?.playNext()}>
					<SkipForward size={22} fill="currentColor" />
				</button>
				<button type="button" class="icon-button" aria-label="静音" onclick={() => manager?.toggleMute()}>
					{#if isMuted || volume === 0}
						<VolumeX size={18} />
					{:else}
						<Volume2 size={18} />
					{/if}
				</button>
			</div>
		</div>
	</div>
{/if}

<style>
	.music-shell {
		position: fixed;
		left: 1rem;
		bottom: 1rem;
		z-index: 950;
		color: var(--btn-content, #1f2937);
		transition:
			width 320ms cubic-bezier(0.22, 1, 0.36, 1),
			height 320ms cubic-bezier(0.22, 1, 0.36, 1),
			border-radius 320ms cubic-bezier(0.22, 1, 0.36, 1);
	}

	.music-shell.is-capsule {
		width: min(320px, calc(100vw - 2rem));
		height: 64px;
	}

	.music-shell.is-panel {
		width: min(360px, calc(100vw - 2rem));
		height: min(520px, calc(100vh - 6rem));
	}

	.capsule-main {
		display: flex;
		align-items: center;
		gap: 0.35rem;
		width: 100%;
		height: 100%;
		padding: 0.5rem 0.55rem 0.55rem 0.75rem;
		border: 1px solid var(--line-divider, rgba(0, 0, 0, 0.1));
		border-radius: 1rem;
		background: var(--card-bg, rgba(255, 255, 255, 0.86));
		backdrop-filter: blur(14px);
		box-shadow: 0 10px 30px rgba(15, 23, 42, 0.14);
		overflow: hidden;
	}

	.capsule-open {
		display: flex;
		align-items: center;
		gap: 0.65rem;
		flex: 1;
		min-width: 0;
		height: 100%;
		padding: 0;
		border: none;
		background: transparent;
		color: inherit;
		cursor: pointer;
		text-align: left;
	}

	.capsule-cover {
		display: grid;
		place-items: center;
		width: 44px;
		height: 44px;
		flex: 0 0 44px;
		border-radius: 999px;
		overflow: hidden;
		background: var(--btn-regular-bg, rgba(0, 0, 0, 0.06));
		color: var(--primary, #6366f1);
	}

	.capsule-cover img {
		width: 100%;
		height: 100%;
		object-fit: cover;
		animation: shell-spin 14s linear infinite;
		animation-play-state: paused;
	}

	.is-playing .capsule-cover img {
		animation-play-state: running;
	}

	.capsule-text {
		display: flex;
		flex-direction: column;
		min-width: 0;
		flex: 1;
	}

	.capsule-title {
		font-size: 0.82rem;
		font-weight: 700;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.capsule-artist {
		font-size: 0.68rem;
		opacity: 0.62;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.capsule-actions {
		display: flex;
		align-items: center;
		gap: 0.2rem;
		flex: 0 0 auto;
	}

	.capsule-progress {
		position: absolute;
		left: 0.9rem;
		right: 0.9rem;
		bottom: 0.32rem;
		height: 2px;
		border-radius: 999px;
		background: var(--btn-regular-bg, rgba(0, 0, 0, 0.08));
		overflow: hidden;
		pointer-events: none;
	}

	.capsule-progress::after {
		content: "";
		display: block;
		height: 100%;
		width: var(--progress, 0%);
		background: var(--primary, #6366f1);
		transition: width 120ms linear;
	}

	.panel-card {
		display: flex;
		flex-direction: column;
		gap: 0.7rem;
		width: 100%;
		height: 100%;
		padding: 0.9rem;
		border: 1px solid var(--line-divider, rgba(0, 0, 0, 0.1));
		border-radius: 1.25rem;
		background: var(--card-bg, rgba(255, 255, 255, 0.92));
		backdrop-filter: blur(18px);
		box-shadow: 0 18px 45px rgba(15, 23, 42, 0.18);
		overflow: hidden;
	}

	.panel-header {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: 0.5rem;
	}

	.panel-heading {
		display: flex;
		flex-direction: column;
		min-width: 0;
	}

	.panel-eyebrow {
		font-size: 0.62rem;
		letter-spacing: 0.14em;
		text-transform: uppercase;
		opacity: 0.5;
	}

	.panel-title {
		font-size: 0.95rem;
		font-weight: 700;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.panel-artist {
		font-size: 0.72rem;
		opacity: 0.62;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.panel-header-actions {
		display: flex;
		gap: 0.2rem;
	}

	.panel-cover-row {
		display: flex;
		align-items: center;
		gap: 0.8rem;
	}

	.panel-cover {
		display: grid;
		place-items: center;
		width: 76px;
		height: 76px;
		flex: 0 0 76px;
		border: none;
		border-radius: 1rem;
		overflow: hidden;
		background: var(--btn-regular-bg, rgba(0, 0, 0, 0.06));
		color: var(--primary, #6366f1);
		cursor: pointer;
		padding: 0;
	}

	.panel-cover img {
		width: 100%;
		height: 100%;
		object-fit: cover;
		transition: transform 300ms ease;
	}

	.panel-cover:hover img {
		transform: scale(1.06);
	}

	.panel-progress-area {
		flex: 1;
		min-width: 0;
	}

	.time-row {
		display: flex;
		justify-content: space-between;
		font-size: 0.65rem;
		opacity: 0.55;
		margin-top: 0.15rem;
	}

	.progress-range,
	.volume-range {
		width: 100%;
		height: 4px;
		appearance: none;
		border-radius: 999px;
		background: var(--btn-regular-bg, rgba(0, 0, 0, 0.1));
		outline: none;
		cursor: pointer;
		accent-color: var(--primary, #6366f1);
	}

	.progress-range::-webkit-slider-thumb,
	.volume-range::-webkit-slider-thumb {
		appearance: none;
		width: 12px;
		height: 12px;
		border-radius: 999px;
		background: var(--primary, #6366f1);
		border: 2px solid var(--card-bg, #fff);
		box-shadow: 0 1px 4px rgba(0, 0, 0, 0.2);
	}

	.panel-controls {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.25rem;
	}

	.icon-button {
		display: grid;
		place-items: center;
		width: 34px;
		height: 34px;
		border: none;
		border-radius: 999px;
		background: transparent;
		color: inherit;
		cursor: pointer;
		transition:
			background 180ms ease,
			transform 180ms ease;
		flex: 0 0 auto;
	}

	.icon-button:hover {
		background: var(--btn-regular-bg, rgba(0, 0, 0, 0.06));
	}

	.icon-button:active {
		transform: scale(0.92);
	}

	.icon-button.primary {
		background: var(--primary, #6366f1);
		color: #fff;
	}

	.icon-button.primary:hover {
		filter: brightness(1.08);
	}

	.icon-button.big {
		width: 42px;
		height: 42px;
	}

	.volume-row {
		padding: 0 0.3rem;
	}

	.playlist-section {
		display: flex;
		flex-direction: column;
		min-height: 0;
		flex: 1;
		border-top: 1px solid var(--line-divider, rgba(0, 0, 0, 0.08));
		padding-top: 0.55rem;
	}

	.playlist-heading {
		display: flex;
		align-items: center;
		gap: 0.35rem;
		font-size: 0.72rem;
		opacity: 0.7;
		margin-bottom: 0.3rem;
	}

	.playlist-heading em {
		margin-left: auto;
		font-style: normal;
		font-size: 0.65rem;
		opacity: 0.6;
	}

	.playlist-list {
		overflow-y: auto;
		min-height: 0;
		display: flex;
		flex-direction: column;
		gap: 0.15rem;
		padding-right: 0.15rem;
	}

	.playlist-item {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		width: 100%;
		padding: 0.35rem 0.45rem;
		border: none;
		border-radius: 0.6rem;
		background: transparent;
		color: inherit;
		text-align: left;
		cursor: pointer;
	}

	.playlist-item:hover {
		background: var(--btn-regular-bg, rgba(0, 0, 0, 0.05));
	}

	.playlist-item.is-active {
		background: color-mix(in srgb, var(--primary, #6366f1) 12%, transparent);
	}

	.item-index {
		width: 1.1rem;
		font-size: 0.65rem;
		opacity: 0.45;
		text-align: center;
		flex: 0 0 auto;
	}

	.item-titles {
		display: flex;
		flex-direction: column;
		min-width: 0;
		flex: 1;
	}

	.item-name {
		font-size: 0.75rem;
		font-weight: 600;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.playlist-item.is-active .item-name {
		color: var(--primary, #6366f1);
	}

	.item-artist {
		font-size: 0.65rem;
		opacity: 0.55;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.playing-bars {
		display: flex;
		align-items: flex-end;
		gap: 2px;
		height: 12px;
		flex: 0 0 auto;
	}

	.playing-bars i {
		width: 2px;
		background: var(--primary, #6366f1);
		border-radius: 1px;
		animation: shell-eq 0.9s ease-in-out infinite;
	}

	.playing-bars i:nth-child(2) {
		animation-delay: 0.15s;
	}

	.playing-bars i:nth-child(3) {
		animation-delay: 0.3s;
	}

	.shell-error {
		font-size: 0.68rem;
		color: #dc2626;
		text-align: center;
	}

	.music-full {
		position: fixed;
		inset: 0;
		z-index: 1300;
		display: grid;
		place-items: center;
		padding: 1.5rem;
	}

	.full-backdrop {
		position: absolute;
		inset: 0;
		border: none;
		background: rgba(10, 12, 20, 0.72);
		backdrop-filter: blur(16px);
		cursor: pointer;
	}

	.full-card {
		position: relative;
		z-index: 1;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.65rem;
		width: min(560px, 100%);
		max-height: min(90vh, 760px);
		padding: 1.2rem 1.4rem 1.4rem;
		border: 1px solid rgba(255, 255, 255, 0.15);
		border-radius: 1.75rem;
		background: rgba(22, 25, 38, 0.82);
		backdrop-filter: blur(22px);
		color: #f9fafb;
		box-shadow: 0 30px 80px rgba(0, 0, 0, 0.45);
		overflow-y: auto;
	}

	.full-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		width: 100%;
	}

	.full-eyebrow {
		font-size: 0.65rem;
		letter-spacing: 0.16em;
		text-transform: uppercase;
		opacity: 0.55;
	}

	.full-card .icon-button:hover {
		background: rgba(255, 255, 255, 0.1);
	}

	.full-vinyl {
		position: relative;
		width: min(230px, 52vw);
		aspect-ratio: 1;
		margin: 0.4rem 0 0.2rem;
		border-radius: 999px;
		overflow: hidden;
		display: grid;
		place-items: center;
		background: radial-gradient(circle at center, #4b5563 0 8%, #111827 9% 100%);
		box-shadow:
			0 0 0 10px rgba(255, 255, 255, 0.04),
			0 24px 50px rgba(0, 0, 0, 0.5);
		color: rgba(255, 255, 255, 0.6);
	}

	.full-vinyl img {
		width: 100%;
		height: 100%;
		object-fit: cover;
		animation: shell-spin 18s linear infinite;
		animation-play-state: paused;
	}

	.full-vinyl.is-playing img {
		animation-play-state: running;
	}

	.vinyl-hole {
		position: absolute;
		width: 14px;
		height: 14px;
		border-radius: 999px;
		background: var(--card-bg, #fff);
		box-shadow: inset 0 0 0 3px rgba(0, 0, 0, 0.35);
	}

	.full-meta {
		display: flex;
		flex-direction: column;
		align-items: center;
		text-align: center;
		gap: 0.1rem;
	}

	.full-title {
		font-size: 1.05rem;
		font-weight: 700;
	}

	.full-artist {
		font-size: 0.78rem;
		opacity: 0.62;
	}

	.full-lyrics {
		width: 100%;
		max-height: 26vh;
		overflow-y: auto;
		text-align: center;
		padding: 0.4rem 0;
		mask-image: linear-gradient(to bottom, transparent, #000 12%, #000 88%, transparent);
		-webkit-mask-image: linear-gradient(to bottom, transparent, #000 12%, #000 88%, transparent);
	}

	.full-lyrics.compact {
		max-height: 4rem;
	}

	.lyric-line {
		font-size: 0.82rem;
		line-height: 1.7;
		opacity: 0.42;
		transition:
			opacity 200ms ease,
			transform 200ms ease;
		margin: 0;
	}

	.lyric-line.is-active {
		opacity: 1;
		font-weight: 700;
		transform: scale(1.03);
		color: var(--primary, #a5b4fc);
	}

	.lyric-empty {
		font-size: 0.8rem;
		opacity: 0.55;
		margin: 0.6rem 0;
	}

	.full-progress {
		width: 100%;
	}

	.full-controls {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 0.55rem;
		margin-top: 0.2rem;
	}

	@media (max-width: 640px) {
		.music-shell {
			left: 0.5rem;
			bottom: 0.75rem;
		}

		.music-shell.is-capsule,
		.music-shell.is-panel {
			width: calc(100vw - 1rem);
		}

		.music-full {
			padding: 0.5rem;
		}

		.full-card {
			padding: 1rem 1rem 1.1rem;
			border-radius: 1.4rem;
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.capsule-cover img,
		.full-vinyl img,
		.playing-bars i {
			animation: none;
		}

		.music-shell {
			transition: none;
		}
	}

	@keyframes shell-spin {
		to {
			transform: rotate(360deg);
		}
	}

	@keyframes shell-eq {
		0%,
		100% {
			height: 4px;
			opacity: 0.6;
		}
		50% {
			height: 12px;
			opacity: 1;
		}
	}
</style>
