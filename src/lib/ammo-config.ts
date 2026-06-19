import { db } from "./db";
import { parseGdriveFolderId } from "./google-drive";

export const DEFAULT_GDRIVE_FOLDER_URL =
  "https://drive.google.com/drive/folders/167rUvv3r0lo17tSW6zfX53a4WewFV22J";

export type AmmoConfigForClient = {
  gdriveFolderUrl: string;
  gdriveServiceAccountConfigured: boolean;
  gdriveServiceAccountEmail: string | null;
  kmsPageUrls: string;
  updatedAt?: string;
};

export function parseKmsPageUrlsInput(raw: string): string[] {
  return raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

export function serializeKmsPageUrls(urls: string[]): string {
  return JSON.stringify(urls);
}

export function deserializeKmsPageUrls(raw: string | null | undefined): string[] {
  if (!raw?.trim()) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (Array.isArray(parsed)) {
      return parsed.map((u) => String(u).trim()).filter(Boolean);
    }
  } catch {
    return parseKmsPageUrlsInput(raw);
  }
  return [];
}

function parseServiceAccountEmail(json: string | null | undefined): string | null {
  if (!json?.trim()) return null;
  try {
    const sa = JSON.parse(json) as { client_email?: string };
    return sa.client_email ?? null;
  } catch {
    return null;
  }
}

export async function getSystemAmmoConfigRow() {
  return db.systemAmmoConfig.findUnique({ where: { id: "singleton" } });
}

export async function resolveGdriveServiceAccountJson(): Promise<string | null> {
  const row = await getSystemAmmoConfigRow();
  const fromDb = row?.gdriveServiceAccount?.trim();
  if (fromDb) return fromDb;
  const fromEnv = process.env.GOOGLE_SERVICE_ACCOUNT_JSON?.trim();
  return fromEnv || null;
}

export async function resolveGdriveFolderUrl(): Promise<string | null> {
  const row = await getSystemAmmoConfigRow();
  const fromDb = row?.gdriveFolderUrl?.trim();
  if (fromDb) return fromDb;
  const fromEnv = process.env.GDRIVE_FOLDER_URL?.trim();
  return fromEnv || null;
}

export async function resolveGdriveFolderId(): Promise<string | null> {
  const url = await resolveGdriveFolderUrl();
  if (!url) return null;
  return parseGdriveFolderId(url);
}

export async function resolveKmsAmmoPageUrls(): Promise<string[]> {
  const row = await getSystemAmmoConfigRow();
  return deserializeKmsPageUrls(row?.kmsPageUrls);
}

export async function getAmmoConfigForClient(): Promise<AmmoConfigForClient> {
  const row = await getSystemAmmoConfigRow();
  const saJson = row?.gdriveServiceAccount?.trim() || process.env.GOOGLE_SERVICE_ACCOUNT_JSON?.trim() || null;
  return {
    gdriveFolderUrl: row?.gdriveFolderUrl?.trim() || process.env.GDRIVE_FOLDER_URL?.trim() || DEFAULT_GDRIVE_FOLDER_URL,
    gdriveServiceAccountConfigured: !!saJson,
    gdriveServiceAccountEmail: parseServiceAccountEmail(saJson),
    kmsPageUrls: deserializeKmsPageUrls(row?.kmsPageUrls).join("\n"),
    updatedAt: row?.updatedAt?.toISOString(),
  };
}
