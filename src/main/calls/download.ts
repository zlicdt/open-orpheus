/* eslint-disable @typescript-eslint/no-unused-vars */
import { registerCallHandler } from "../calls";

type DownloadStartRequest = {
  ext_header: string;
  id: string;
  md5: string;
  md5_check_fail: number; // 0 or 1?
  mediaType: number;
  pre_path: string;
  rel_path: string;
  size: number;
  url: string;
};

// Payload of `download.onprocess`
type DownloadProcessPayload = {
  down: number; // Downloaded bytes
  islast: boolean; // Is the last progress update
  path: string; // Local file path
  relative: string; // Relative path from the download request
  speed: number; // Download speed in bytes/sec
  total: number; // Total bytes to download
  type: number;
};

registerCallHandler<[DownloadStartRequest], void>(
  "download.start",
  (event, request: DownloadStartRequest) => {}
);
