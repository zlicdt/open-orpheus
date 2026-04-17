import { resolve } from "node:path";

import { cache } from "./folders";

import LyricCacheManager from "./cache/LyricCahceManager";
import PlayCacheManager from "./cache/PlayCacheManager";
import URLCacheManager from "./cache/URLCacheManager";

export let lyricCacheManager: LyricCacheManager | null = null;
export let playCacheManager: PlayCacheManager | null = null;
export let urlCacheManager: URLCacheManager | null = null;

export default function createCacheManager() {
  lyricCacheManager = new LyricCacheManager(resolve(cache, "lyrics"));
  playCacheManager = new PlayCacheManager(resolve(cache, "play"));
  urlCacheManager = new URLCacheManager(resolve(cache, "http"));
}
