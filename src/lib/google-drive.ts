import { importPKCS8, SignJWT } from "jose";
import { resolveGdriveFolderId, resolveGdriveFolderUrl, resolveGdriveServiceAccountJson } from "./ammo-config";

const DRIVE_SCOPE = "https://www.googleapis.com/auth/drive.readonly";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const DRIVE_API = "https://www.googleapis.com/drive/v3";

export type GdriveFileItem = {
  id: string;
  name: string;
  mimeType: string;
  webViewLink: string | null;
  thumbnailLink: string | null;
  iconLink: string | null;
  modifiedTime: string | null;
};

export type GdriveListResult =
  | { ok: true; folderUrl: string; files: GdriveFileItem[] }
  | { ok: false; reason: "not_configured" | "missing_credentials" | "error"; message: string };

type ServiceAccount = {
  client_email: string;
  private_key: string;
};

export function parseGdriveFolderId(url: string): string | null {
  const trimmed = url.trim();
  const fromFolders = trimmed.match(/\/folders\/([a-zA-Z0-9_-]+)/)?.[1];
  if (fromFolders) return fromFolders;
  const fromQuery = trimmed.match(/[?&]id=([a-zA-Z0-9_-]+)/)?.[1];
  return fromQuery ?? null;
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

export async function listGdriveFolderFiles(folderId: string, serviceAccountJson: string): Promise<GdriveFileItem[]> {
  const token = await getAccessToken(serviceAccountJson);
  const params = new URLSearchParams({
    q: `'${folderId}' in parents and trashed=false`,
    fields: "files(id,name,mimeType,thumbnailLink,webViewLink,modifiedTime,iconLink)",
    pageSize: "100",
    supportsAllDrives: "true",
    includeItemsFromAllDrives: "true",
    orderBy: "modifiedTime desc",
  });

  const res = await fetch(`${DRIVE_API}/files?${params}`, {
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(20000),
  });
  const data = (await res.json()) as {
    files?: Array<{
      id: string;
      name: string;
      mimeType: string;
      thumbnailLink?: string;
      webViewLink?: string;
      modifiedTime?: string;
      iconLink?: string;
    }>;
    error?: { message?: string };
  };

  if (!res.ok) {
    const msg = data.error?.message || `Drive API failed (${res.status})`;
    if (res.status === 404) {
      throw new Error(`${msg} — check folder ID and that the folder is shared with the service account email`);
    }
    throw new Error(msg);
  }

  return (data.files ?? [])
    .filter((f) => f.mimeType !== "application/vnd.google-apps.folder")
    .map((f) => ({
      id: f.id,
      name: f.name,
      mimeType: f.mimeType,
      webViewLink: f.webViewLink ?? `https://drive.google.com/file/d/${f.id}/view`,
      thumbnailLink: f.thumbnailLink ?? null,
      iconLink: f.iconLink ?? null,
      modifiedTime: f.modifiedTime ?? null,
    }));
}

export async function fetchAmmoGdriveFiles(): Promise<GdriveListResult> {
  const folderUrl = await resolveGdriveFolderUrl();
  const folderId = folderUrl ? parseGdriveFolderId(folderUrl) : await resolveGdriveFolderId();
  const saJson = await resolveGdriveServiceAccountJson();

  if (!folderUrl || !folderId) {
    return { ok: false, reason: "not_configured", message: "Google Drive folder URL is not configured" };
  }
  if (!saJson) {
    return {
      ok: false,
      reason: "missing_credentials",
      message: "Google service account JSON is not configured",
    };
  }

  try {
    const files = await listGdriveFolderFiles(folderId, saJson);
    return { ok: true, folderUrl, files };
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
): Promise<{ ok: true; fileCount: number; sampleName: string | null } | { ok: false; error: string }> {
  const folderId = parseGdriveFolderId(folderUrl);
  if (!folderId) return { ok: false, error: "Invalid Google Drive folder URL" };
  if (!serviceAccountJson.trim()) return { ok: false, error: "Service account JSON is required" };
  try {
    const files = await listGdriveFolderFiles(folderId, serviceAccountJson);
    return {
      ok: true,
      fileCount: files.length,
      sampleName: files[0]?.name ?? null,
    };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
