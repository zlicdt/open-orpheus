import { player } from "../audioplayer";
import { registerCallHandler } from "../calls";

let currentMetadata: MediaMetadata | null = null;

registerCallHandler<
  [
    {
      albumId: string;
      albumName: string;
      artistName: string;
      playId: string;
      songName: string;
      songType: string;
      url: string;
    },
  ],
  void
>("player.setInfo", (playInfo) => {
  if (!playInfo.playId) {
    navigator.mediaSession.metadata = currentMetadata = null;
    return;
  }
  navigator.mediaSession.metadata = currentMetadata = new MediaMetadata({
    title: playInfo.songName,
    artist: playInfo.artistName,
    album: playInfo.albumName,
    artwork: [96, 128, 192, 256, 384, 512].map((size) => ({
      src: playInfo.url + `?param=${size}y${size}`,
      sizes: `${size}x${size}`,
      type: "image/jpeg",
    })),
  });
});

// TODO: Link mediaSession
registerCallHandler<[boolean], void>("player.setSMTCEnable", () => {
  return;
});

registerCallHandler<[string], [boolean]>("player.addListElement", () => {
  return [true];
});

registerCallHandler<[], [boolean]>("player.removeAll", () => {
  return [true];
});

registerCallHandler<[string], [boolean]>("player.setCurrentPlay", () => {
  return [true];
});

registerCallHandler<[string], [boolean]>("player.setCover", () => {
  return [true];
});

registerCallHandler<[number /* 0 or 1? */], [boolean]>(
  "player.setLikeMark",
  () => {
    return [true];
  }
);

registerCallHandler<[number], [boolean]>("player.setTotalTime", () => {
  return [true];
});

registerCallHandler<
  [
    {
      playstate: number; // 0 or 1?
    },
  ],
  [boolean]
>("player.setMiniPlayerState", () => {
  return [true];
});

registerCallHandler<[string, string], [boolean]>("player.setTextAlign", () => {
  // "center" ...?
  return [true];
});

registerCallHandler<[boolean], [boolean]>("player.setLineMode", () => {
  // single line mode
  return [true];
});

registerCallHandler<[boolean], [boolean]>(
  "player.setDesktopLyricTopMost",
  () => {
    return [true];
  }
);

registerCallHandler<[string], [boolean]>("player.showTranslateLyric", () => {
  // "translate" ...?
  return [true];
});

registerCallHandler<[string, string, string, string], [boolean]>(
  "player.setLRCColor",
  () => {
    // rrggbb
    // notplayed, played
    // top to bottom for each state
    return [true];
  }
);

registerCallHandler<[string, string], [boolean]>(
  "player.setOutlineColor",
  () => {
    // notplayed, played
    return [true];
  }
);

registerCallHandler<[boolean, boolean, boolean, boolean], [boolean]>(
  "player.setOutlineShadow",
  () => {
    // On: true true false false
    // Off: false false false false
    return [true];
  }
);

registerCallHandler<[boolean], [boolean]>("player.showHorizontalLyric", () => {
  return [true];
});

registerCallHandler<[string, string, string], [boolean]>(
  "player.setLRCFont",
  () => {
    // font size, bold (1 or 0), font name
    return [true];
  }
);

registerCallHandler<[boolean], [boolean]>("player.setLock", () => {
  return [true];
});

registerCallHandler<[string], [boolean]>("player.setLRCSlogan", () => {
  return [true];
});

registerCallHandler<
  [
    {
      krc: string;
      lrc: string;
      romalrc: string;
      tlrc: string;
      yrc: string;
      // No lyric = empty string
    },
  ],
  [boolean]
>("player.setLyrics", () => {
  return [true];
});

registerCallHandler<[number], [boolean]>("player.setOffset", () => {
  return [true];
});

registerCallHandler<[string, number], [boolean]>("player.setFont", () => {
  // What font is this?
  return [true];
});

player.addEventListener("load", () => {
  if (!currentMetadata) return;
  // Ensure media session update
  navigator.mediaSession.metadata = currentMetadata;
});
