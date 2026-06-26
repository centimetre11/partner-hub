"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { EmptyState } from "@/components/ui";
import { GdriveUploadField, type UploadedAsset } from "@/components/gdrive-upload-field";
import { GdriveFolderPicker } from "@/components/gdrive-folder-picker";
import { BoundFolderContents } from "@/components/bound-folder-contents";
import { AddSolutionForm } from "@/components/add-solution-form";
import { EditSolutionForm } from "@/components/edit-solution-form";
import type { LinkPreviewState } from "@/components/solution-link-field";
import {
  setPartnerGdriveFolderAction,
  setCustomerGdriveFolderAction,
  addMaterialLinkAction,
  deleteMaterialAssetAction,
} from "@/lib/material-actions";
import type { Messages } from "@/lib/i18n/messages/en";

export type MaterialAsset = {
  id: string;
  filename: string;
  url: string | null;
  thumbnailUrl: string | null;
  provider: string | null;
};

type SolutionRow = {
  id: string;
  name: string;
  notes: string | null;
  assets: {
    assetId: string;
    label: string | null;
    asset: {
      id: string;
      kind: string | null;
      filename: string;
      url: string | null;
      thumbnailUrl: string | null;
      provider: string | null;
    };
  }[];
};

function primarySolutionLink(sol: SolutionRow) {
  return sol.assets.find((a) => a.asset.kind === "LINK" && a.asset.url)?.asset ?? null;
}

function toLinkPreview(asset: NonNullable<ReturnType<typeof primarySolutionLink>>): LinkPreviewState {
  return {
    url: asset.url!,
    title: asset.filename,
    description: null,
    thumbnailUrl: asset.thumbnailUrl,
    provider: asset.provider ?? "web",
  };
}

function formatUploadError(message: string, copy: Messages["gdriveMaterials"]): string {
  if (/insufficient authentication scopes/i.test(message)) return copy.needReconnectScopes;
  return message;
}

export function MaterialsSection({
  partnerId,
  customerId,
  entityName,
  folderUrl,
  browseReady,
  uploaderConnected,
  assets: initialAssets,
  copy,
  solutions = [],
  solutionCopy,
}: {
  partnerId?: string | null;
  customerId?: string | null;
  entityName: string;
  folderUrl: string | null;
  /** 服务账号已配置，可浏览 07_Client Information 子目录 */
  browseReady: boolean;
  uploaderConnected: boolean;
  assets: MaterialAsset[];
  copy: Messages["gdriveMaterials"];
  solutions?: SolutionRow[];
  solutionCopy?: Messages["partnerDetail"]["solutionsSection"];
}) {
  const router = useRouter();
  const [folderDraft, setFolderDraft] = useState<string | null>(null);
  const [localBoundUrl, setLocalBoundUrl] = useState<string | null>(null);
  const [extraAssets, setExtraAssets] = useState<MaterialAsset[]>([]);
  const folder = folderDraft ?? folderUrl ?? "";
  const boundUrl = localBoundUrl ?? (folderUrl?.trim() || null);
  const assets = [
    ...extraAssets,
    ...initialAssets.filter((a) => !extraAssets.some((e) => e.id === a.id)),
  ];
  const [mode, setMode] = useState<"file" | "link">("file");
  const [linkUrl, setLinkUrl] = useState("");
  const [linkLoading, setLinkLoading] = useState(false);
  const [showFolderBind, setShowFolderBind] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [folderContentsKey, setFolderContentsKey] = useState(0);
  const [pending, startTransition] = useTransition();

  function saveFolder() {
    startTransition(async () => {
      setError(null);
      const fd = new FormData();
      fd.set("gdriveFolderUrl", folder.trim());
      const action = partnerId
        ? setPartnerGdriveFolderAction.bind(null, partnerId)
        : setCustomerGdriveFolderAction.bind(null, customerId!);
      const res = await action(fd);
      if (res && "error" in res && res.error) setError(copy.invalidFolder);
      else {
        setLocalBoundUrl(folder.trim() || null);
        setFolderDraft(folder.trim() || null);
        setShowFolderBind(false);
        setFolderContentsKey((k) => k + 1);
        router.refresh();
      }
    });
  }

  function handleUploaded(asset: UploadedAsset, meta?: { folderUrl?: string | null }) {
    setExtraAssets((prev) => [
      {
        id: asset.id,
        filename: asset.filename,
        url: asset.url,
        thumbnailUrl: asset.thumbnailUrl,
        provider: asset.provider,
      },
      ...prev,
    ]);
    if (meta?.folderUrl) {
      setLocalBoundUrl(meta.folderUrl);
      setFolderDraft(meta.folderUrl);
      setShowFolderBind(false);
    }
    setFolderContentsKey((k) => k + 1);
    router.refresh();
  }

  async function submitLink() {
    const url = linkUrl.trim();
    if (!url) return;
    setLinkLoading(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.set("linkUrl", url);
      const res = await addMaterialLinkAction({ partnerId, customerId }, fd);
      if (res && "error" in res && res.error) {
        setError(res.error);
      } else {
        setLinkUrl("");
        router.refresh();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLinkLoading(false);
    }
  }

  function remove(id: string) {
    if (!window.confirm(copy.removeConfirm)) return;
    startTransition(async () => {
      await deleteMaterialAssetAction(id);
      setExtraAssets((prev) => prev.filter((a) => a.id !== id));
      router.refresh();
    });
  }

  const tabBase = "px-3 py-1 text-xs rounded-md";
  const totalCount = assets.length + solutions.length;

  return (
    <div className="ui-card">
      <div className="px-4 sm:px-5 py-3 border-b border-slate-100">
        <h3 className="text-sm font-medium text-slate-800">
          {copy.title.replace("{count}", String(totalCount))}
        </h3>
        <p className="text-xs text-slate-500 mt-0.5">{copy.desc}</p>
      </div>

      <div className="px-4 sm:px-5 py-4 space-y-4 text-sm">
        {!browseReady && (
          <p className="rounded-md bg-amber-50 border border-amber-100 px-3 py-2 text-xs text-amber-800">
            {copy.needServiceAccount}
          </p>
        )}

        {!uploaderConnected && browseReady && (
          <p className="rounded-md bg-amber-50 border border-amber-100 px-3 py-2 text-xs text-amber-800">
            {copy.needConnect}
          </p>
        )}

        {browseReady && (
          <GdriveFolderPicker
            partnerId={partnerId}
            customerId={customerId}
            entityName={entityName}
            boundUrl={boundUrl}
            browseReady={browseReady}
            uploaderConnected={uploaderConnected}
            copy={copy}
            onBound={(url) => {
              setLocalBoundUrl(url);
              setFolderDraft(url);
              setError(null);
              setFolderContentsKey((k) => k + 1);
              router.refresh();
            }}
          />
        )}

        {boundUrl && browseReady && (
          <BoundFolderContents folderUrl={boundUrl} copy={copy} refreshKey={folderContentsKey} />
        )}

        {/* 上传 / 贴链接 — 主操作 */}
        <div className="space-y-2">
          <div className="inline-flex rounded-lg bg-slate-100 p-0.5">
            <button
              type="button"
              onClick={() => { setMode("file"); setError(null); }}
              className={`${tabBase} ${mode === "file" ? "bg-white shadow-sm text-slate-900" : "text-slate-500"}`}
            >
              {copy.uploadTab}
            </button>
            <button
              type="button"
              onClick={() => { setMode("link"); setError(null); }}
              className={`${tabBase} ${mode === "link" ? "bg-white shadow-sm text-slate-900" : "text-slate-500"}`}
            >
              {copy.linkTab}
            </button>
          </div>

          {mode === "file" ? (
            <>
              <GdriveUploadField
                partnerId={partnerId}
                customerId={customerId}
                folderUrl={boundUrl}
                disabled={!uploaderConnected || !boundUrl}
                disabledReason={
                  !uploaderConnected
                    ? copy.needConnect
                    : !boundUrl
                      ? copy.needPickFolder
                      : null
                }
                buttonLabel={copy.chooseAndUpload}
                matchingLabel={copy.uploadMatching}
                uploadingLabel={copy.uploadUploading}
                successLabel={copy.uploadSuccess}
                onUploaded={handleUploaded}
                onError={(msg, code) => {
                  setError(formatUploadError(msg, copy));
                  if (code === "FOLDER_NOT_FOUND") setShowFolderBind(true);
                }}
              />
              {!boundUrl && uploaderConnected && (
                <p className="text-xs text-amber-700">{copy.needPickFolder}</p>
              )}
            </>
          ) : (
            <div className="flex gap-2">
              <input
                value={linkUrl}
                onChange={(e) => setLinkUrl(e.target.value)}
                placeholder={copy.linkPlaceholder}
                className="flex-1 rounded-lg border border-slate-200 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400"
              />
              <button
                type="button"
                onClick={submitLink}
                disabled={linkLoading || !linkUrl.trim()}
                className="rounded-lg bg-slate-900 text-white px-3 py-1.5 text-xs hover:bg-slate-800 disabled:opacity-40 shrink-0"
              >
                {linkLoading ? copy.parsing : copy.parseLink}
              </button>
            </div>
          )}
        </div>

        {error && <p className="text-xs text-red-500">{error}</p>}

        {/* 材料列表 */}
        {assets.length === 0 ? (
          <p className="text-xs text-slate-400">{copy.empty}</p>
        ) : (
          <ul className="space-y-2">
            {assets.map((a) => (
              <li
                key={a.id}
                className="flex items-center gap-3 rounded-lg border border-slate-200 p-2"
              >
                {a.thumbnailUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={a.thumbnailUrl} alt="" className="h-10 w-14 rounded object-cover bg-slate-50" />
                ) : (
                  <div className="h-10 w-14 rounded bg-slate-100 flex items-center justify-center text-lg">📎</div>
                )}
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm text-slate-800">{a.filename}</div>
                  {a.url && (
                    <a
                      href={a.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="truncate block text-xs text-sky-700 hover:underline"
                    >
                      {copy.view} →
                    </a>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => remove(a.id)}
                  disabled={pending}
                  className="text-xs text-slate-400 hover:text-red-600 shrink-0"
                >
                  {copy.remove}
                </button>
              </li>
            ))}
          </ul>
        )}

        {partnerId && solutionCopy && (
          <div className="border-t border-slate-100 pt-4 space-y-3">
            <div>
              <h4 className="text-xs font-medium text-slate-800">
                {solutionCopy.title.replace("{count}", String(solutions.length))}
              </h4>
              <p className="text-xs text-slate-500 mt-0.5">{copy.solutionsHint}</p>
            </div>

            {solutions.map((sol) => {
              const link = primarySolutionLink(sol);
              return (
                <details key={sol.id} className="group rounded-lg border border-slate-100 hover:border-slate-200">
                  <summary className="flex items-center gap-3 px-4 py-3 cursor-pointer list-none">
                    <div className="min-w-0 flex-1">
                      <div className="font-medium text-slate-900 truncate">{sol.name}</div>
                      {link?.url && (
                        <div className="text-xs text-slate-400 mt-0.5 truncate">{link.url}</div>
                      )}
                    </div>
                    <span className="text-slate-300 group-open:rotate-90">›</span>
                  </summary>
                  <div className="px-4 pb-4 pt-1 border-t border-slate-50">
                    <EditSolutionForm
                      partnerId={partnerId}
                      solutionId={sol.id}
                      defaultLinkUrl={link?.url ?? ""}
                      initialPreview={link ? toLinkPreview(link) : null}
                      defaultNotes={sol.notes ?? ""}
                      copy={solutionCopy}
                    />
                  </div>
                </details>
              );
            })}

            {solutions.length === 0 && <EmptyState text={solutionCopy.empty} />}

            <details className="rounded-lg border border-dashed border-slate-200">
              <summary className="px-4 py-2.5 text-sm text-sky-600 cursor-pointer list-none">
                {solutionCopy.addSolution}
              </summary>
              <AddSolutionForm partnerId={partnerId} copy={solutionCopy} />
            </details>
          </div>
        )}

        {/* 手动粘贴目录链接（备用） */}
        <div className="border-t border-slate-100 pt-3 space-y-2">
          <button
            type="button"
            onClick={() => setShowFolderBind((v) => !v)}
            className="text-xs text-slate-500 hover:text-slate-800"
          >
            {showFolderBind ? copy.hidePasteFolder : copy.showPasteFolder}
          </button>
          {showFolderBind && (
            <div className="space-y-1.5">
              <label className="block text-xs font-medium text-slate-700">{copy.bindLabel}</label>
              <div className="flex gap-2">
                <input
                  value={folder}
                  onChange={(e) => setFolderDraft(e.target.value)}
                  placeholder={copy.bindPlaceholder}
                  className="flex-1 rounded-lg border border-slate-200 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400"
                />
                <button
                  type="button"
                  onClick={saveFolder}
                  disabled={pending}
                  className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs hover:bg-slate-50 disabled:opacity-50 shrink-0"
                >
                  {copy.bindSave}
                </button>
              </div>
              <div className="flex items-center gap-3 text-xs">
                {boundUrl ? (
                  <>
                    <span className="text-emerald-700">{copy.bound}</span>
                    <a
                      href={boundUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sky-700 hover:underline"
                    >
                      📁 {copy.openFolder}
                    </a>
                  </>
                ) : (
                  <span className="text-slate-400">{copy.autoFolderHint}</span>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
