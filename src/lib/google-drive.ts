import { importPKCS8, SignJWT } from "jose";
import { resolveGdriveFolderId, resolveGdriveFolderUrl, resolveGdriveServiceAccountJson } from "./ammo-config";

const DRIVE_SCOPE = "https://www.googleapis.com/auth/drive.readonly";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const DRIVE_API = "https://www.googleapis.com/drive/v3";
const FOLDER_MIME = "application/vnd.google-apps.folder";

export type GdriveFileItem = {
  id: string;
  name: string;
  mimeType: string;
  webViewLink: string | null;
  thumbnailLink: string | null;
  iconLink: string | null;
  modifiedTime: string | null;
};

export type GdriveFolderItem = {
  id: string;
  name: string;
  modifiedTime: string | null;
};

export type GdriveBrowseResult =
  | {
      ok: true;
      folderUrl: string;
      rootFolderId: string;
      currentFolderId: string;
      currentFolderName: string;
      folders: GdriveFolderItem[];
      files: GdriveFileItem[];
    }
  | { ok: false; reason: "not_configured" | "missing_credentials" | "error"; message: string };

type ServiceAccount = {
  client_email: string;
  private_key: string;
};

type RawDriveItem = {
  id: string;
  name: string;
  mimeType: string;
  thumbnailLink?: string;
  webViewLink?: string;
  modifiedTime?: string;
  iconLink?: string;
};

export function parseGdriveFolderId(url: string): string | null {
  const trimmed = url.trim();
  const fromFolders = trimmed.match(/\/folders\/([a-zA-Z0-9_-]+)/)?.[1];
  if (fromFolders) return fromFolders;
  const fromQuery = trimmed.match(/[?&]id=([a-zA-Z0-9_-]+)/)?.[1];
  return fromQuery ?? null;
}

export function parseGdriveFileId(url: string): string | null {
  const trimmed = url.trim();
  const fromFile = trimmed.match(/\/file\/d\/([a-zA-Z0-9_-]+)/)?.[1];
  if (fromFile) return fromFile;
  const fromOpen = trimmed.match(/[?&]id=([a-zA-Z0-9_-]+)/)?.[1];
  if (fromOpen) return fromOpen;
  const fromDocs = trimmed.match(/\/d\/([a-zA-Z0-9_-]+)/)?.[1];
  return fromDocs ?? null;
}

export type GdriveUploadResult = {
  id: string;
  name: string;
  webViewLink: string;
  thumbnailLink: string | null;
  mimeType: string;
};

/**
 * 用 OAuth access token 把文件直传到指定文件夹（multipart 上传，内存中转，不落本地磁盘）。
 * 上传者/文件归属为授权的真人账号。
 */
export async function uploadFileToGdrive(
  folderId: string,
  file: File,
  accessToken: string,
): Promise<GdriveUploadResult> {
  const metadata = {
    name: file.name,
    parents: [folderId],
  };
  const boundary = `partnerhub${crypto.randomUUID().replace(/-/g, "")}`;
  const encoder = new TextEncoder();
  const mime = file.type || "application/octet-stream";

  const head = encoder.encode(
    `--${boundary}\r\n` +
      `Content-Type: application/json; charset=UTF-8\r\n\r\n` +
      `${JSON.stringify(metadata)}\r\n` +
      `--${boundary}\r\n` +
      `Content-Type: ${mime}\r\n\r\n`,
  );
  const tail = encoder.encode(`\r\n--${boundary}--\r\n`);
  const fileBytes = new Uint8Array(await file.arrayBuffer());

  const body = new Uint8Array(head.length + fileBytes.length + tail.length);
  body.set(head, 0);
  body.set(fileBytes, head.length);
  body.set(tail, head.length + fileBytes.length);

  const params = new URLSearchParams({
    uploadType: "multipart",
    supportsAllDrives: "true",
    fields: "id,name,mimeType,webViewLink,thumbnailLink",
  });

  const res = await fetch(`https://www.googleapis.com/upload/drive/v3/files?${params}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": `multipart/related; boundary=${boundary}`,
    },
    body,
    signal: AbortSignal.timeout(120000),
  });

  const data = (await res.json()) as RawDriveItem & { error?: { message?: string } };
  if (!res.ok) {
    throw new Error(data.error?.message || `Drive upload failed (${res.status})`);
  }
  return {
    id: data.id,
    name: data.name,
    webViewLink: data.webViewLink ?? `https://drive.google.com/file/d/${data.id}/view`,
    thumbnailLink: data.thumbnailLink ?? null,
    mimeType: data.mimeType,
  };
}

export async function fetchGdriveFileById(
  fileId: string,
  serviceAccountJson: string,
): Promise<GdriveFileItem | null> {
  const token = await getAccessToken(serviceAccountJson);
  const params = new URLSearchParams({
    fields: "id,name,mimeType,thumbnailLink,webViewLink,modifiedTime,iconLink",
    supportsAllDrives: "true",
  });
  const res = await fetch(`${DRIVE_API}/files/${fileId}?${params}`, {
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(15000),
  });
  const data = (await res.json()) as RawDriveItem & { error?: { message?: string } };
  if (!res.ok) return null;
  return mapFileItem(data);
}

function mimeKind(mimeType: string): string {
  if (mimeType.includes("folder")) return "folder";
  if (mimeType.includes("presentation")) return "slides";
  if (mimeType.includes("spreadsheet")) return "sheet";
  if (mimeType.includes("document")) return "doc";
  if (mimeType.startsWith("image/")) return "image";
  if (mimeType.includes("pdf")) return "pdf";
  return "file";
}

export function gdriveFileIcon(mimeType: string): string {
  const kind = mimeKind(mimeType);
  const icons: Record<string, string> = {
    folder: "📁",
    slides: "📊",
    sheet: "📈",
    doc: "📄",
    image: "🖼️",
    pdf: "📕",
    file: "📎",
  };
  return icons[kind] ?? "📎";
}

async function getAccessToken(serviceAccountJson: string): Promise<string> {
  const sa = JSON.parse(serviceAccountJson) as ServiceAccount;
  if (!sa.client_email || !sa.private_key) {
    throw new Error("Invalid service account JSON: missing client_email or private_key");
  }
  const key = await importPKCS8(sa.private_key.replace(/\\n/g, "\n"), "RS256");
  const assertion = await new SignJWT({ scope: DRIVE_SCOPE })
    .setProtectedHeader({ alg: "RS256" })
    .setIssuedAt()
    .setIssuer(sa.client_email)
    .setSubject(sa.client_email)
    .setAudience(TOKEN_URL)
    .setExpirationTime("1h")
    .sign(key);

  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }),
    signal: AbortSignal.timeout(15000),
  });
  const data = (await res.json()) as { access_token?: string; error?: string; error_description?: string };
  if (!res.ok || !data.access_token) {
    throw new Error(data.error_description || data.error || `Google token exchange failed (${res.status})`);
  }
  return data.access_token;
}

async function fetchDriveFolderName(token: string, folderId: string): Promise<string> {
  const res = await fetch(`${DRIVE_API}/files/${folderId}?fields=name&supportsAllDrives=true`, {
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(15000),
  });
  const data = (await res.json()) as { name?: string; error?: { message?: string } };
  if (!res.ok) {
    throw new Error(data.error?.message || `Drive metadata failed (${res.status})`);
  }
  return data.name ?? "Folder";
}

function mapFileItem(f: RawDriveItem): GdriveFileItem {
  return {
    id: f.id,
    name: f.name,
    mimeType: f.mimeType,
    webViewLink: f.webViewLink ?? `https://drive.google.com/file/d/${f.id}/view`,
    thumbnailLink: f.thumbnailLink ?? null,
    iconLink: f.iconLink ?? null,
    modifiedTime: f.modifiedTime ?? null,
  };
}

async function fetchDriveFolderChildren(
  folderId: string,
  token: string,
): Promise<RawDriveItem[]> {
  const params = new URLSearchParams({
    q: `'${folderId}' in parents and trashed=false`,
    fields: "files(id,name,mimeType,thumbnailLink,webViewLink,modifiedTime,iconLink)",
    pageSize: "100",
    supportsAllDrives: "true",
    includeItemsFromAllDrives: "true",
    orderBy: "folder,name,modifiedTime desc",
  });

  const res = await fetch(`${DRIVE_API}/files?${params}`, {
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(20000),
  });
  const data = (await res.json()) as { files?: RawDriveItem[]; error?: { message?: string } };
  if (!res.ok) {
    throw new Error(data.error?.message || `Drive API failed (${res.status})`);
  }
  return data.files ?? [];
}

/** OAuth access token 下列出子文件夹（上传时自动匹配目录用） */
export async function listGdriveSubfoldersOauth(
  folderId: string,
  accessToken: string,
): Promise<GdriveFolderItem[]> {
  const items = await fetchDriveFolderChildren(folderId, accessToken);
  return items
    .filter((f) => f.mimeType === FOLDER_MIME)
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }))
    .map((f) => ({
      id: f.id,
      name: f.name,
      modifiedTime: f.modifiedTime ?? null,
    }));
}

export async function listGdriveFolderContents(
  folderId: string,
  serviceAccountJson: string,
): Promise<{ folderName: string; folders: GdriveFolderItem[]; files: GdriveFileItem[] }> {
  const token = await getAccessToken(serviceAccountJson);
  let items: RawDriveItem[];
  try {
    items = await fetchDriveFolderChildren(folderId, token);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes("404")) {
      throw new Error(`${msg} — check folder ID and that the folder is shared with the service account email`);
    }
    throw e;
  }

  const folders = items
    .filter((f) => f.mimeType === FOLDER_MIME)
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }))
    .map((f) => ({
      id: f.id,
      name: f.name,
      modifiedTime: f.modifiedTime ?? null,
    }));
  const files = items
    .filter((f) => f.mimeType !== FOLDER_MIME)
    .sort((a, b) => {
      const ta = a.modifiedTime ? Date.parse(a.modifiedTime) : 0;
      const tb = b.modifiedTime ? Date.parse(b.modifiedTime) : 0;
      return tb - ta;
    })
    .map(mapFileItem);

  const folderName = await fetchDriveFolderName(token, folderId);
  return { folderName, folders, files };
}

export async function fetchAmmoGdriveBrowse(folderId?: string): Promise<GdriveBrowseResult> {
  const folderUrl = await resolveGdriveFolderUrl();
  const rootFolderId = folderUrl ? parseGdriveFolderId(folderUrl) : await resolveGdriveFolderId();
  const saJson = await resolveGdriveServiceAccountJson();
  const targetFolderId = folderId?.trim() || rootFolderId;

  if (!folderUrl || !rootFolderId) {
    return { ok: false, reason: "not_configured", message: "Google Drive folder URL is not configured" };
  }
  if (!saJson) {
    return {
      ok: false,
      reason: "missing_credentials",
      message: "Google service account JSON is not configured",
    };
  }
  if (!targetFolderId) {
    return { ok: false, reason: "error", message: "Invalid folder ID" };
  }

  try {
    const { folderName, folders, files } = await listGdriveFolderContents(targetFolderId, saJson);
    return {
      ok: true,
      folderUrl,
      rootFolderId,
      currentFolderId: targetFolderId,
      currentFolderName: folderName,
      folders,
      files,
    };
  } catch (e) {
    return {
      ok: false,
      reason: "error",
      message: e instanceof Error ? e.message : String(e),
    };
  }
}

export async function testGdriveConnection(
  folderUrl: string,
  serviceAccountJson: string,
): Promise<
  | { ok: true; folderCount: number; fileCount: number; sampleName: string | null }
  | { ok: false; error: string }
> {
  const folderId = parseGdriveFolderId(folderUrl);
  if (!folderId) return { ok: false, error: "Invalid Google Drive folder URL" };
  if (!serviceAccountJson.trim()) return { ok: false, error: "Service account JSON is required" };
  try {
    const { folders, files } = await listGdriveFolderContents(folderId, serviceAccountJson);
    return {
      ok: true,
      folderCount: folders.length,
      fileCount: files.length,
      sampleName: folders[0]?.name ?? files[0]?.name ?? null,
    };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
