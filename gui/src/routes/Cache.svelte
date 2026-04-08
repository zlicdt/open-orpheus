<script lang="ts">
  import "./types";
  import { Button } from "$lib/components/ui/button";

  function formatBytes(bytes: number): string {
    if (bytes === 0) return "0 B";
    const units = ["B", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return `${(bytes / 1024 ** i).toFixed(2)} ${units[i]}`;
  }

  let statsPromise = $state(orpheus.getCacheStats());
  let clearing = $state<"http" | "lyrics" | null>(null);

  async function clearCache(category: "http" | "lyrics") {
    clearing = category;
    try {
      await orpheus.clearCache(category);
    } finally {
      clearing = null;
      statsPromise = orpheus.getCacheStats();
    }
  }

  async function clearAll() {
    await clearCache("http");
    await clearCache("lyrics");
  }
</script>

<h1 class="text-2xl font-bold">缓存</h1>
<p class="mt-2 text-gray-700">
  Open Orpheus
  日常使用时会产生缓存，如歌曲、歌词和封面等。你可以在这里查看和管理这些缓存。
</p>

{#await statsPromise}
  <p class="mt-4 text-gray-500">正在加载缓存信息…</p>
{:then stats}
  <div class="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
    <div class="rounded-lg border p-4">
      <h2 class="font-semibold">播放缓存</h2>
      <p class="mt-1 text-sm text-gray-600">{stats.play.entryCount} 首</p>
      <p class="text-sm text-gray-600">{formatBytes(stats.play.sizeBytes)}</p>
      <p class="text-xs text-gray-600">播放缓存请在网易云音乐设置中管理</p>
    </div>
    <div class="rounded-lg border p-4">
      <h2 class="font-semibold">HTTP（图片）缓存</h2>
      <p class="mt-1 text-sm text-gray-600">{stats.http.entryCount} 个条目</p>
      <p class="text-sm text-gray-600">{formatBytes(stats.http.sizeBytes)}</p>
      <Button
        class="mt-3"
        variant="outline"
        size="sm"
        disabled={clearing !== null}
        onclick={() => clearCache("http")}
        >{clearing === "http" ? "清除中…" : "清除"}</Button
      >
    </div>
    <div class="rounded-lg border p-4">
      <h2 class="font-semibold">歌词缓存</h2>
      <p class="mt-1 text-sm text-gray-600">{stats.lyrics.entryCount} 首</p>
      <p class="text-sm text-gray-600">{formatBytes(stats.lyrics.sizeBytes)}</p>
      <Button
        class="mt-3"
        variant="outline"
        size="sm"
        disabled={clearing !== null}
        onclick={() => clearCache("lyrics")}
        >{clearing === "lyrics" ? "清除中…" : "清除"}</Button
      >
    </div>
  </div>
  <div class="text-right">
    <Button
      class="mt-4 w-full sm:w-auto"
      variant="destructive"
      disabled={clearing !== null}
      onclick={clearAll}
      >{clearing !== null ? "清除中…" : "清除所有可清除的缓存"}</Button
    >
  </div>
{:catch}
  <p class="mt-4 text-red-500">获取缓存信息失败。</p>
{/await}
