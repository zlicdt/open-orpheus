import { parseSetCookie, stringifyCookie } from "cookie";
import got from "got";
import { session } from "electron";

import { getCookies, setCookie } from "./cookie";

const client = got.extend({
  headers: {
    // We get User-Agent from Electron, so make sure this module is only imported after app ready.
    "User-Agent": session.defaultSession.getUserAgent(),
    Origin: "orpheus://orpheus",
  },
  cookieJar: {
    getCookieString: async (url: string) => {
      return stringifyCookie(await getCookies(url));
    },
    setCookie: async (rawCookie: string, url: string) => {
      await setCookie(url, parseSetCookie(rawCookie));
    },
  },
  http2: true,
});

export default client;
