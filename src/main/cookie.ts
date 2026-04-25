import { session } from "electron";
import * as cookie from "cookie";

const cookies = session.defaultSession.cookies;

export async function getFullCookies(url: string) {
  return await cookies.get({ url });
}

export async function getCookies(url: string) {
  const fullCookies = await getFullCookies(url);
  return Object.fromEntries(
    fullCookies
      .filter((cookieValue) => cookieValue.value !== undefined)
      .map((cookieValue) => [cookieValue.name, cookieValue.value])
  );
}

export async function removeCookie(url: string, name: string) {
  await cookies.remove(url, name);
}

export async function setCookie(url: string, setCookieValue: cookie.SetCookie) {
  await cookies.set({
    url,
    ...setCookieValue,
    expirationDate: setCookieValue.expires
      ? Math.floor(new Date(setCookieValue.expires).getTime() / 1000)
      : setCookieValue.maxAge
        ? Math.floor(Date.now() / 1000) + setCookieValue.maxAge
        : undefined,
    sameSite:
      setCookieValue.sameSite === true
        ? "strict"
        : setCookieValue.sameSite === false
          ? "unspecified"
          : setCookieValue.sameSite === "none"
            ? "no_restriction"
            : setCookieValue.sameSite,
  });
}
