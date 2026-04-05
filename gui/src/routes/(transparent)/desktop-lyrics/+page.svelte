<script lang="ts">
  import { onMount } from "svelte";
  import Lyrics from "$lib/components/Lyrics.svelte";
  import type { LyricsData, LyricStyleConfig } from "$lib/types";
  import IconButton from "$lib/components/IconButton.svelte";

  let lyricsData: LyricsData | null = $state(null);
  let currentTime = $state(0);
  let playing = $state(false);

  const items: ([string, string] | [string, string, true])[] = $derived([
    ["home", "detail"],
    ["poffset", "offset_forward"], // TODO: In what situations offsets will be locked
    ["moffset", "offset_back"],
    ["prev", "playprev"],
    [playing ? "topause" : "toplay", "play_pause"],
    ["next", "playnext"],
    ["setting", "setting"],
    ["lock", "lock"],
    ["close", "close"],
  ]);

  const defaultStyle: LyricStyleConfig = {
    fontFamily: "sans-serif",
    fontSize: 36,
    fontWeight: "normal",
    textAlign: ["center", "center"],
    lineMode: false,
    vertical: false,
    colorNotPlayedTop: "#ffffff",
    colorNotPlayedBottom: "#cccccc",
    colorPlayedTop: "#00ff88",
    colorPlayedBottom: "#00cc66",
    outlineColorNotPlayed: "transparent",
    outlineColorPlayed: "transparent",
    dropShadow: "0 2px 4px rgba(0,0,0,0.5)",
    showProgress: true,
    offset: 0,
    slogan: "",
  };

  let lyricStyle: LyricStyleConfig = $state({ ...defaultStyle });

  // rAF time interpolation
  let lastKnownTime = 0;
  let lastUpdateTimestamp = 0;
  let rafId: number | null = null;

  function rafLoop() {
    if (!playing) return;
    const elapsed = performance.now() - lastUpdateTimestamp;
    currentTime = lastKnownTime + elapsed;
    rafId = requestAnimationFrame(rafLoop);
  }

  function startRaf() {
    if (rafId !== null) return;
    lastUpdateTimestamp = performance.now();
    rafId = requestAnimationFrame(rafLoop);
  }

  function stopRaf() {
    if (rafId !== null) {
      cancelAnimationFrame(rafId);
      rafId = null;
    }
  }

  // svelte-ignore state_referenced_locally -- we need this to trigger updates when vertical changes
  let previousVertical = lyricStyle.vertical;
  $effect(() => {
    if (lyricStyle.vertical !== previousVertical) {
      previousVertical = lyricStyle.vertical;
      const api = (window as any).desktopLyrics;
      api?.changeOrientation();
    }
  });

  onMount(() => {
    const api = (window as any).desktopLyrics;
    if (!api) return;

    api.onLyricsUpdate((data: LyricsData) => {
      lyricsData = data;
    });

    api.onTimeUpdate((data: { currentTime: number; playing: boolean }) => {
      lastKnownTime = data.currentTime;
      lastUpdateTimestamp = performance.now();
      currentTime = data.currentTime;

      if (data.playing !== playing) {
        playing = data.playing;
        if (playing) startRaf();
        else stopRaf();
      }
    });

    api.onStyleUpdate((data: Partial<LyricStyleConfig>) => {
      lyricStyle = { ...lyricStyle, ...data };
    });

    api.onPlayStateChange((isPlaying: boolean) => {
      playing = isPlaying;
      if (playing) {
        lastUpdateTimestamp = performance.now();
        startRaf();
      } else {
        stopRaf();
      }
    });

    // Request full state from Player on load
    api.requestFullUpdate();

    return () => stopRaf();
  });

  function onDrag() {
    const api = (window as any).desktopLyrics;
    api?.dragWindow();
  }
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
  class="group flex h-screen w-screen cursor-grab items-center justify-evenly overflow-hidden rounded-lg p-2 hover:bg-black/40 select-none{lyricStyle.vertical
    ? ''
    : ' flex-col'}"
  onmousedown={onDrag}
>
  <div
    class="flex justify-center gap-2 group-hover:visible invisible{lyricStyle.vertical
      ? ' flex-col'
      : ''}"
  >
    {#each items as [icon, action, disabled]}
      <IconButton
        normal={`gui://skin/lrc/${icon}_normal.svg`}
        hover={`gui://skin/lrc/${icon}_over.svg`}
        active={`gui://skin/lrc/${icon}_push.svg`}
        disabled={disabled ? `gui://skin/lrc/${icon}_dis.svg` : undefined}
        onmousedown={(e) => {
          e.stopPropagation();
        }}
        onclick={() => {
          const api = (window as any).desktopLyrics;
          api?.performAction(action);
        }}
        class="cursor-pointer"
        imgClass="size-6"
      />
    {/each}
  </div>
  <!-- svelte-ignore attribute_quoted -->
  <Lyrics
    {lyricsData}
    {currentTime}
    {lyricStyle}
    class={lyricStyle.vertical ? "h-full" : "w-full"}
  />
</div>
