import { NextRequest, NextResponse } from "next/server";
import { getSessionUserId } from "@/lib/session";
import { isAllowedFile, maxUploadBytes, maxUploadMb } from "@/lib/assets";
import { initResumableGdriveUpload } from "@/lib/google-drive";
import { resolveGdriveUploadTarget } from "@/lib/gdrive-upload-context";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const uid = await getSessionUserId();
  if (!uid) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const body = (await req.json()) as {
    filename?: string;
    mimeType?: string;
    size?: number;
    partnerId?: string;
    customerId?: string;
    folderUrl?: string;
  };

  const filename = String(body.filename ?? "").trim();
  const mimeType = String(body.mimeType ?? "").trim() || "application/octet-stream";
  const size = Number(body.size);
  const partnerId = String(body.partnerId ?? "").trim() || null;
  const customerId = String(body.customerId ?? "").trim() || null;
  const folderUrlOverride = String(body.folderUrl ?? "").trim() || null;

  if (!filename) {
    return NextResponse.json({ error: "Missing filename" }, { status: 400 });
  }
  if (!Number.isFinite(size) || size <= 0) {
    return NextResponse.json({ error: "Invalid file size" }, { status: 400 });
  }
  if (!isAllowedFile(filename, mimeType)) {
    return NextResponse.json({ error: "Unsupported file type" }, { status: 400 });
  }
  if (size > maxUploadBytes()) {
    return NextResponse.json(
      { error: `File exceeds ${maxUploadMb()}MB limit` },
      { status: 400 },
    );
  }

  const target = await resolveGdriveUploadTarget(partnerId, customerId, folderUrlOverride);
  if (!target.ok) {
    return NextResponse.json(
      { error: target.error, code: target.code },
      { status: 400 },
    );
  }

  try {
    const { uploadUrl } = await initResumableGdriveUpload(
      target.folderId,
      filename,
      mimeType,
      size,
      target.accessToken,
    );

    return NextResponse.json({
      uploadUrl,
      folderUrl: target.autoResolvedFolderUrl,
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 400 },
    );
  }
}
