<script lang="ts">
  import { onMount } from "svelte";
  import Lyrics from "$lib/components/Lyrics.svelte";
  import type { LyricsData, LyricStyleConfig } from "$lib/types";

  let lyricsData: LyricsData | null = $state(null);
  let currentTime = $state(0);
  let playing = $state(false);

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
  class="flex h-screen w-screen cursor-grab items-center justify-center rounded-lg hover:bg-black/40"
  onmousedown={onDrag}
>
  <Lyrics {lyricsData} {currentTime} style={lyricStyle} />
</div>
