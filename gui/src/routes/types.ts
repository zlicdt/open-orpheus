declare type CacheGroupStats = {
  entryCount: number;
  sizeBytes: number;
};

declare type AllCacheStats = {
  play: CacheGroupStats;
  http: CacheGroupStats;
  lyrics: CacheGroupStats;
};

declare const orpheus: {
  getWebPackCommitHash: () => Promise<string>;
  getCacheStats: () => Promise<AllCacheStats>;
  clearCache: (category: "http" | "lyrics") => Promise<void>;
};
