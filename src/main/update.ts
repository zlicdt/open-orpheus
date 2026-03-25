import { session } from "electron";
import { CORE_VERSION, OSVER } from "../constants";
import { deserialData, serialData } from "./crypto";
import { getADDeviceId, getDeviceId } from "./device";

const ENDPOINT = "https://interfacepc.music.163.com/eapi/pc/upgrade/get";

interface UpgradeInfo {
  upgradeTitle: string;
  upgradeContent: string;
  needPopUp: boolean;
  forceUpdate: boolean;
  ext: null; // TODO: Figure out what this is
  packageVO: {
    appver: string;
    buildver: string;
    code: number;
    md5: string;
    downloadUrl: string;
    incrementalDownloadUrl: string | null;
    incrementalMd5: string | null;
    grayPolicyId: number;
  };
  abGroupInfo: string;
}

export async function fetchUpgradeInfo(): Promise<{
  code: number;
  data: UpgradeInfo;
  message: string;
}> {
  const response = await fetch(ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "User-Agent": session.defaultSession.getUserAgent(),
    },
    body: `params=${serialData("/api/pc/upgrade/get", {
      action: "manual",
      cpuBitWidth: "64",
      patch: JSON.stringify({
        mainver: "",
        buildver: "",
        isIncremental: true,
        md5: "",
      }), // Empty patch gives us no incremental pack
      e_r: true,
      header: JSON.stringify({
        clientSign: getADDeviceId(),
        os: "pc",
        appver: CORE_VERSION,
        deviceId: getDeviceId(),
        requestId: 0,
        osver: OSVER,
      }),
    })}`,
  });
  const buf = await response.arrayBuffer();
  const res = deserialData(buf);
  return JSON.parse(res);
}
