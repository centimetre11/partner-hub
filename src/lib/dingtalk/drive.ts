import { getDingTalkAccessToken } from "./token";

type DingDriveFileMeta = {
  fileId: string;
  fileName: string;
  spaceId?: string;
  downloadUrl?: string;
  contentType?: string;
};

/**
 * 通过钉盘 open API 获取文件下载信息。
 * 钉钉盘接口版本较多，这里用通用 media/download 与 storage 接口兜底。
 */
export async function fetchDingDriveFileDownloadUrl(opts: {
  spaceId?: string;
  fileId: string;
}): Promise<string | null> {
  const token = await getDingTalkAccessToken();

  // 新版 storage API
  try {
    const res = await fetch(
      `https://api.dingtalk.com/v1.0/storage/spaces/${opts.spaceId ?? "0"}/dentries/${opts.fileId}/downloadInfos?unionId=system`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-acs-dingtalk-access-token": token,
        },
        body: JSON.stringify({ option: {} }),
        cache: "no-store",
      },
    );
    if (res.ok) {
      const data = (await res.json()) as { downloadUrl?: string; result?: { downloadUrl?: string } };
      const url = data.downloadUrl ?? data.result?.downloadUrl;
      if (url) return url;
    }
  } catch {
    // fall through
  }

  // 旧版 get_download_info
  try {
    const url = new URL("https://oapi.dingtalk.com/cspace/get_custom_space");
    url.searchParams.set("access_token", token);
    // not always available — try media download by file id as last resort
  } catch {
    // ignore
  }

  const mediaUrl = `https://oapi.dingtalk.com/media/downloadFile?access_token=${encodeURIComponent(token)}&media_id=${encodeURIComponent(opts.fileId)}`;
  return mediaUrl;
}

export async function downloadDingDriveText(opts: {
  spaceId?: string;
  fileId: string;
}): Promise<{ text: string; meta: DingDriveFileMeta } | null> {
  const downloadUrl = await fetchDingDriveFileDownloadUrl(opts);
  if (!downloadUrl) return null;

  const res = await fetch(downloadUrl, { cache: "no-store" });
  if (!res.ok) {
    throw new Error(`下载钉盘文件失败: ${res.status} ${res.statusText}`);
  }
  const text = await res.text();
  return {
    text,
    meta: {
      fileId: opts.fileId,
      fileName: "",
      spaceId: opts.spaceId,
      downloadUrl,
      contentType: res.headers.get("content-type") ?? undefined,
    },
  };
}

/** 从会议云录制接口拉取转写文本（若有 conferenceId） */
export async function fetchConferenceTranscriptText(opts: {
  conferenceId: string;
  unionId?: string;
}): Promise<string | null> {
  const token = await getDingTalkAccessToken();
  const sentences: string[] = [];
  let nextToken: number | undefined;

  for (let page = 0; page < 20; page++) {
    const url = new URL(
      `https://api.dingtalk.com/v1.0/conference/videoConferences/${encodeURIComponent(opts.conferenceId)}/cloudRecords/getTexts`,
    );
    if (opts.unionId) url.searchParams.set("unionId", opts.unionId);
    url.searchParams.set("maxResults", "200");
    if (nextToken != null) url.searchParams.set("nextToken", String(nextToken));

    const res = await fetch(url.toString(), {
      headers: { "x-acs-dingtalk-access-token": token },
      cache: "no-store",
    });
    if (!res.ok) break;
    const data = (await res.json()) as {
      nextToken?: number;
      hasMore?: boolean;
      paragraphList?: Array<{ nickName?: string; sentence?: string; startTime?: number }>;
    };
    for (const p of data.paragraphList ?? []) {
      const who = p.nickName?.trim() || "发言人";
      const sentence = p.sentence?.trim();
      if (sentence) sentences.push(`${who}: ${sentence}`);
    }
    if (!data.hasMore || data.nextToken == null) break;
    nextToken = data.nextToken;
  }

  return sentences.length ? sentences.join("\n") : null;
}
