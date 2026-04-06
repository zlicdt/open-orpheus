// See https://svelte.dev/docs/kit/types#app.d.ts
// for information about these interfaces
import type { DesktopLyricsAPI } from "$lib/types";

declare global {
  namespace App {
    // interface Error {}
    // interface Locals {}
    // interface PageData {}
    // interface PageState {}
    // interface Platform {}
  }

  interface Window {
    desktopLyrics?: DesktopLyricsAPI;
  }

  const __APP_VERSION__: string;
}

export {};
