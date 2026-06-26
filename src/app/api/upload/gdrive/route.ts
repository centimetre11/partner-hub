import { NextRequest, NextResponse } from "next/server";
import { getSessionUserId } from "@/lib/session";
import { db } from "@/lib/db";
import { isAllowedFile, maxUploadBytes } from "@/lib/assets";
import { parseGdriveFolderId, uploadFileToGdrive } from "@/lib/google-drive";
import { getUploaderAccessToken } from "@/lib/google-oauth";
import { resolveEntityGdriveFolder } from "@/lib/gdrive-entity-folder";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const uid = await getSessionUserId();
  if (!uid) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const form = await req.formData();
  const file = form.get("file");
  const partnerId = String(form.get("partnerId") ?? "").trim() || null;
  const customerId = String(form.get("customerId") ?? "").trim() || null;
  const folderUrlOverride = String(form.get("folderUrl") ?? "").trim() || null;

  if (!file || !(file instanceof File)) {
    return NextResponse.json({ error: "Missing file field" }, { status: 400 });
  }
  if (!isAllowedFile(file.name, file.type || "")) {
    return NextResponse.json({ error: "Unsupported file type" }, { status: 400 });
  }
  if (file.size > maxUploadBytes()) {
    return NextResponse.json(
      { error: `File exceeds ${process.env.MAX_UPLOAD_MB || 20}MB limit` },
      { status: 400 },
    );
  }

  let entityName: string | null = null;
  let folderUrl = folderUrlOverride;
  if (!folderUrl && partnerId) {
    const p = await db.partner.findUnique({
      where: { id: partnerId },
      select: { gdriveFolderUrl: true, name: true },
    });
    folderUrl = p?.gdriveFolderUrl?.trim() || null;
    entityName = p?.name ?? null;
  }
  if (!folderUrl && customerId) {
    const c = await db.customer.findUnique({
      where: { id: customerId },
      select: { gdriveFolderUrl: true, name: true },
    });
    folderUrl = c?.gdriveFolderUrl?.trim() || null;
    entityName = c?.name ?? null;
  }

  let autoResolvedFolderUrl: string | null = null;

  try {
    const accessToken = await getUploaderAccessToken();

    if (!folderUrl && entityName) {
      const resolved = await resolveEntityGdriveFolder(entityName);
      if (resolved) {
        folderUrl = resolved.folderUrl;
        autoResolvedFolderUrl = resolved.folderUrl;
        if (partnerId) {
          await db.partner.update({
            where: { id: partnerId },
            data: { gdriveFolderUrl: resolved.folderUrl },
          });
        } else if (customerId) {
          await db.customer.update({
            where: { id: customerId },
            data: { gdriveFolderUrl: resolved.folderUrl },
          });
        }
      }
    }

    if (!folderUrl) {
      return NextResponse.json(
        {
          code: "FOLDER_NOT_FOUND",
          error: entityName
            ? `未找到与「${entityName}」同名的 Drive 子目录。请在下方粘贴目录链接并保存，或在 07_Client Information 下创建同名文件夹后重试。`
            : "No Google Drive folder bound for this record — bind one first",
        },
        { status: 400 },
      );
    }

    const folderId = parseGdriveFolderId(folderUrl);
    if (!folderId) {
      return NextResponse.json({ error: "Invalid Google Drive folder URL" }, { status: 400 });
    }

    const uploaded = await uploadFileToGdrive(folderId, file, accessToken);

    const asset = await db.asset.create({
      data: {
        kind: "LINK",
        filename: uploaded.name || file.name,
        mimeType: uploaded.mimeType || file.type || "application/octet-stream",
        size: file.size,
        url: uploaded.webViewLink,
        thumbnailUrl: uploaded.thumbnailLink,
        provider: "gdrive",
        uploadedById: uid,
        partnerId,
        customerId,
      },
    });

    return NextResponse.json({
      asset: {
        id: asset.id,
        filename: asset.filename,
        mimeType: asset.mimeType,
        size: asset.size,
        url: asset.url,
        thumbnailUrl: asset.thumbnailUrl,
        provider: asset.provider,
      },
      folderUrl: autoResolvedFolderUrl,
    });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 400 });
  }
}
