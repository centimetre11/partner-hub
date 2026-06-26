"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { EmptyState } from "@/components/ui";
import { GdriveUploadField } from "@/components/gdrive-upload-field";
import { GdriveFolderPicker } from "@/components/gdrive-folder-picker";
import { BoundFolderContents } from "@/components/bound-folder-contents";
import { MaterialLinkAddForm } from "@/components/material-link-add-form";
import { EditSolutionForm } from "@/components/edit-solution-form";
import { providerIcon } from "@/lib/provider-icon";
import type { LinkPreviewState } from "@/components/solution-link-field";
import {
  setPartnerGdriveFolderAction,
  setCustomerGdriveFolderAction,
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
  const folder = folderDraft ?? folderUrl ?? "";
  const boundUrl = localBoundUrl ?? (folderUrl?.trim() || null);
  const linkAssets = initialAssets;
  const [showFolderBind, setShowFolderBind] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [folderContentsKey, setFolderContentsKey] = useState(0);
  const [linkFormKey, setLinkFormKey] = useState(0);
  const [pending, startTransition] = useTransition();

  const linkCount = linkAssets.length + solutions.length;

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

  function handleUploaded(_meta?: { folderUrl?: string | null }) {
    if (_meta?.folderUrl) {
      setLocalBoundUrl(_meta.folderUrl);
      setFolderDraft(_meta.folderUrl);
      setShowFolderBind(false);
    }
    setFolderContentsKey((k) => k + 1);
    router.refresh();
  }

  function removeLink(id: string) {
    if (!window.confirm(copy.removeConfirm)) return;
    startTransition(async () => {
      await deleteMaterialAssetAction(id);
      router.refresh();
    });
  }

  return (
    <div className="ui-card">
      <div className="px-4 sm:px-5 py-3 border-b border-slate-100">
        <h3 className="text-sm font-medium text-slate-800">
          {copy.title.replace("{count}", String(linkCount))}
        </h3>
        <p className="text-xs text-slate-500 mt-0.5">{copy.desc}</p>
      </div>

      <div className="px-4 sm:px-5 py-4 space-y-5 text-sm">
        {/* —— Google 云盘 —— */}
        <section className="space-y-3">
          <h4 className="text-xs font-semibold text-slate-800 tracking-wide">{copy.gdriveCategoryTitle}</h4>

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

          {boundUrl && browseReady && (
            <BoundFolderContents folderUrl={boundUrl} copy={copy} refreshKey={folderContentsKey} />
          )}
        </section>

        {/* —— 链接（KMS / 外链）—— */}
        <section className="space-y-3 border-t border-slate-100 pt-5">
          <h4 className="text-xs font-semibold text-slate-800 tracking-wide">{copy.linksCategoryTitle}</h4>

          {linkAssets.length === 0 && solutions.length === 0 ? (
            <EmptyState text={copy.linksEmpty} />
          ) : (
            <ul className="space-y-2">
              {linkAssets.map((a) => (
                <li
                  key={a.id}
                  className="flex items-center gap-3 rounded-lg border border-slate-200 p-2"
                >
                  {a.thumbnailUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={a.thumbnailUrl} alt="" className="h-10 w-14 rounded object-cover bg-slate-50" />
                  ) : (
                    <div className="h-10 w-14 rounded bg-slate-100 flex items-center justify-center text-lg shrink-0">
                      {providerIcon(a.provider ?? "web")}
                    </div>
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
                    onClick={() => removeLink(a.id)}
                    disabled={pending}
                    className="text-xs text-slate-400 hover:text-red-600 shrink-0"
                  >
                    {copy.remove}
                  </button>
                </li>
              ))}

              {solutionCopy &&
                solutions.map((sol) => {
                  const link = primarySolutionLink(sol);
                  return (
                    <li key={sol.id}>
                      <details className="group rounded-lg border border-slate-200 hover:border-slate-300">
                        <summary className="flex items-center gap-3 px-3 py-2 cursor-pointer list-none">
                          {link?.thumbnailUrl ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={link.thumbnailUrl}
                              alt=""
                              className="h-10 w-14 rounded object-cover bg-slate-50 shrink-0"
                            />
                          ) : (
                            <div className="h-10 w-14 rounded bg-slate-100 flex items-center justify-center text-lg shrink-0">
                              {providerIcon(link?.provider ?? "web")}
                            </div>
                          )}
                          <div className="min-w-0 flex-1">
                            <div className="truncate text-sm text-slate-800">{sol.name}</div>
                            {link?.url && (
                              <div className="text-xs text-slate-400 truncate">{link.url}</div>
                            )}
                          </div>
                          <span className="text-slate-300 group-open:rotate-90 shrink-0">›</span>
                        </summary>
                        <div className="px-3 pb-3 pt-1 border-t border-slate-100">
                          <EditSolutionForm
                            partnerId={partnerId!}
                            solutionId={sol.id}
                            defaultLinkUrl={link?.url ?? ""}
                            initialPreview={link ? toLinkPreview(link) : null}
                            defaultNotes={sol.notes ?? ""}
                            copy={solutionCopy}
                          />
                        </div>
                      </details>
                    </li>
                  );
                })}
            </ul>
          )}

          <MaterialLinkAddForm
            key={linkFormKey}
            partnerId={partnerId}
            customerId={customerId}
            copy={copy}
            onAdded={() => {
              setLinkFormKey((k) => k + 1);
              router.refresh();
            }}
          />
        </section>

        {error && <p className="text-xs text-red-500">{error}</p>}

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
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
