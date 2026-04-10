export interface LyricWord {
  text: string;
  start_time: number;
  duration: number;
}

export interface LyricLine {
  start_time: number;
  end_time: number;
  words: LyricWord[];
}

export interface LyricsData {
  lines: LyricLine[];
  secondary_lines?: LyricLine[];
}

export type TextAlignType = "left" | "center" | "right";

export interface LyricStyleConfig {
  fontFamily: string;
  fontSize: number;
  fontWeight: string;
  textAlign: [TextAlignType, TextAlignType];
  lineMode: boolean;
  vertical: boolean;
  colorNotPlayedTop: string;
  colorNotPlayedBottom: string;
  colorPlayedTop: string;
  colorPlayedBottom: string;
  outlineColorNotPlayed: string;
  outlineColorPlayed: string;
  dropShadow: string;
  showProgress: boolean;
  offset: number;
  slogan: string;
}

export interface DesktopLyricsAPI {
  onLyricsUpdate(callback: (data: LyricsData) => void): void;
  onTimeUpdate(
    callback: (data: { currentTime: number; playing: boolean }) => void
  ): void;
  onStyleUpdate(callback: (data: Partial<LyricStyleConfig>) => void): void;
  onPlayStateChange(callback: (playing: boolean) => void): void;
  requestFullUpdate(): void;
  dragWindow(): void;
  changeOrientation(): void;
  performAction(action: string): void;
}

export interface DesktopLyricsPreviewAPI {
  requestInit(): Promise<{ style: Record<string, unknown>; text: string }>;
  ready(): void;
}

export interface MenuAPI {
  onShow(
    callback: (
      items: unknown[],
      templates: Record<string, string>,
      cursorX: number,
      cursorY: number
    ) => void
  ): void;
  onUpdate(callback: (items: unknown[]) => void): void;
  pull(): Promise<{ items: unknown[]; templates: Record<string, string> }>;
  reportSize(width: number, height: number): void;
  itemClick(menuId: string | null): void;
  btnClick(btnId: string): void;
  close(): void;
  isWayland(): boolean;
}
