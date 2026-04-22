import { stringifyError } from "../../util";
import { registerCallHandler } from "../calls";
import { getCookies, getFullCookies, removeCookie, setCookie } from "../cookie";

type SetCookie = {
  Domain: string;
  Name: string;
  Value: string;
  Path?: string;
  Url: string;
};

type FullCookie = {
  Creation: number;
  Domain: string;
  Expires: number;
  HasExpires: number;
  Httponly: number;
  LastAccess: number;
  Name: string;
  Path: string;
  Secure: number;
  Url: string;
  Value: string;
};
registerCallHandler<[string], [FullCookie[]]>(
  "browser.getFullCookies",
  async (_, url) => {
    // TODO: We might need to know when the cookie was actually created/last accessed and what's the original URL.
    return [
      (await getFullCookies(url)).map((cookie) => ({
        Creation: Date.now(),
        Domain: cookie.domain || "",
        Expires: cookie.expirationDate?.valueOf() || Date.now(),
        HasExpires: cookie.expirationDate !== undefined ? 1 : 0,
        Httponly: cookie.httpOnly ? 1 : 0,
        LastAccess: Date.now(),
        Name: cookie.name,
        Path: cookie.path || "/",
        Secure: cookie.secure ? 1 : 0,
        Url: `${cookie.secure ? "https:" : "http:"}//${cookie.domain}${cookie.path}`,
        Value: cookie.value,
      })),
    ];
  }
);

registerCallHandler<[string], [Record<string, string>]>(
  "browser.getCookies",
  async (_, url) => {
    return [await getCookies(url)];
  }
);

registerCallHandler<[SetCookie], [boolean]>(
  "browser.setCookie",
  async (_, cookie) => {
    try {
      setCookie(cookie.Url, {
        name: cookie.Name,
        value: cookie.Value,
        domain: cookie.Domain,
        path: cookie.Path,
      });
    } catch (error) {
      console.error(`Error setting cookie: ${stringifyError(error)}`);
      return [false];
    }
    return [true];
  }
);

registerCallHandler<[string, string], [number]>(
  "browser.removeCookie",
  async (_, url, name) => {
    const hasCookie = (await getCookies(url))[name] !== undefined;
    if (!hasCookie) {
      return [0];
    }
    await removeCookie(url, name);
    return [1];
  }
);
