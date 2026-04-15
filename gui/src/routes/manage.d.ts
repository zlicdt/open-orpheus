declare type CacheGroupStats = {
  entryCount: number;
  sizeBytes: number;
};

declare type AllCacheStats = {
  play: CacheGroupStats;
  http: CacheGroupStats;
  lyrics: CacheGroupStats;
  wasm: CacheGroupStats;
};

declare const orpheus: {
  getWebPackCommitHash: () => Promise<string>;

  getCacheStats: () => Promise<AllCacheStats>;
  clearResources: (category: "http" | "lyrics" | "wasm") => Promise<void>;

  openGpuInfo: () => Promise<void>;
};
