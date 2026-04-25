import dns from "node:dns";

import { stringifyCookie } from "cookie";
import got, { RequestError } from "got";
import type { Method } from "got";
import { registerCallHandler } from "../calls";
import { getCookies, processSetCookie } from "../cookie";
import { deserialData } from "../crypto";
import { session } from "electron";

let globalFailCount = 0;
let globalSucCount = 0;

type NetworkFetchResponse = {
  code: number;
  error: string;
} & Partial<{
  globalFailCount: number;
  globalSucCount: number;
  headers: Record<string, string>;
  retryTimes: number;
  status: number;
  blob: string;
}>;
registerCallHandler<
  [
    {
      url: string;
      method: string;
      headers: Record<string, string>;
      body: string;
      retryCount: number;
      isDecrypt?: boolean;
    },
  ],
  [NetworkFetchResponse]
>("network.fetch", async (_, request): Promise<[NetworkFetchResponse]> => {
  const retryCount = request.retryCount ?? 1;
  try {
    const response = await got(request.url, {
      method: request.method as Method,
      headers: {
        ...request.headers,
        "User-Agent": session.defaultSession.getUserAgent(),
        Cookie: stringifyCookie(await getCookies(request.url)),
        Origin: "orpheus://orpheus",
      },
      body: request.body || undefined,
      throwHttpErrors: false,
      retry: {
        limit: retryCount,
        backoffLimit: 10000,
      },
      hooks: {
        beforeRetry: [
          () => {
            globalFailCount++;
          },
        ],
      },
    });

    const headers: Record<string, string> = {};
    for (const [key, value] of Object.entries(response.headers)) {
      if (Array.isArray(value)) {
        headers[key] = value.join(", ");
      } else if (value !== undefined) {
        headers[key] = value;
      }
    }

    const setCookie = response.headers["set-cookie"];
    const setCookieHeaders = Array.isArray(setCookie)
      ? setCookie
      : setCookie
        ? [setCookie]
        : [];
    processSetCookie(request.url, setCookieHeaders);

    const responseBody = Buffer.from(response.rawBody);
    const blob = request.isDecrypt
      ? deserialData(
          responseBody.buffer.slice(
            responseBody.byteOffset,
            responseBody.byteOffset + responseBody.byteLength
          )
        )
      : responseBody.toString();

    globalSucCount++;

    return [
      {
        code: 0,
        blob,
        error: "",
        globalFailCount,
        globalSucCount,
        headers,
        retryTimes: retryCount - response.retryCount - 1,
        status: response.statusCode,
      },
    ];
  } catch (error) {
    globalFailCount++;
    const retryTimes =
      error instanceof RequestError && error.request
        ? retryCount - error.request.retryCount - 1
        : 0;

    return [
      {
        code: 28,
        error:
          (error as Error)?.message ||
          (error ? String(error) : "Unknown error"),
        status: 0,
        blob: "",
        headers: {},
        retryTimes,
      },
    ];
  }
});

registerCallHandler<
  [],
  [
    {
      dnsInvalid: boolean;
      firstDNS: string;
      inProxy: boolean;
      restricted: boolean;
      unreachable: boolean;
    },
  ]
>("network.getEnv", () => [
  {
    dnsInvalid: false,
    firstDNS: dns.getServers()[0] || "",
    inProxy: false,
    restricted: false,
    unreachable: false,
  },
]);
