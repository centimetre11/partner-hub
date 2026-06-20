"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import type { GdriveBrowseResult, GdriveFileItem, GdriveFolderItem } from "@/lib/google-drive";
import { gdriveFileIcon } from "@/lib/google-drive";
import { browseGdriveFolderAction } from "@/lib/ammo-actions";
import { fmtDateTime } from "@/components/ui";

type Crumb = { id: string; name: string };

export function AmmoGdriveSection({
  initialResult,
  labels,
  bcp47,
  isAdmin,
}: {
  initialResult: GdriveBrowseResult;
  labels: {
    title: string;
    openFolder: string;
    openFile: string;
    empty: string;
    notConfigured: string;
    missingCredentials: string;
    configure: string;
    summary: string;
    root: string;
    loading: string;
  };
  bcp47: string;
  isAdmin: boolean;
}) {
  const [result, setResult] = useState(initialResult);
  const [crumbs, setCrumbs] = useState<Crumb[]>([]);
  const [pending, startTransition] = useTransition();
  const rootFolderId = initialResult.ok ? initialResult.rootFolderId : "";

  if (!result.ok) {
    return (
      <section className="bg-white rounded-lg border">
        <div className="px-5 py-4 border-b">
          <h2 className="font-semibold text-slate-900">{labels.title}</h2>
        </div>
        <div className="p-5">
          <AmmoEmptyState
            message={
              result.reason === "not_configured"
                ? labels.notConfigured
                : result.reason === "missing_credentials"
                  ? labels.missingCredentials
                  : result.message
            }
            showConfigure={isAdmin}
            configureLabel={labels.configure}
          />
        </div>
      </section>
    );
  }

  function navigate(folderId: string, folderName: string) {
    startTransition(async () => {
      const next = await browseGdriveFolderAction(folderId);
      if (!next.ok) {
        setResult(next);
        return;
      }
      setResult(next);
      setCrumbs((prev) => {
        const idx = prev.findIndex((c) => c.id === folderId);
        if (idx >= 0) return prev.slice(0, idx + 1);
        return [...prev, { id: folderId, name: folderName }];
      });
    });
  }

  function goToCrumb(index: number) {
    if (index < 0) {
      startTransition(async () => {
        const next = await browseGdriveFolderAction(rootFolderId);
        setResult(next);
        setCrumbs([]);
      });
      return;
    }
    const crumb = crumbs[index];
    startTransition(async () => {
      const next = await browseGdriveFolderAction(crumb.id);
      setResult(next);
      setCrumbs(crumbs.slice(0, index + 1));
    });
  }

  const summary = labels.summary
    .replace("{folders}", String(result.folders.length))
    .replace("{files}", String(result.files.length));

  return (
    <section className="bg-white rounded-lg border">
      <div className="px-5 py-4 border-b flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h2 className="font-semibold text-slate-900">{labels.title}</h2>
          <p className="text-xs text-slate-400 mt-0.5">{pending ? labels.loading : summary}</p>
          <nav className="flex flex-wrap items-center gap-1 text-xs text-slate-500 mt-2">
            <button
              type="button"
              onClick={() => goToCrumb(-1)}
              disabled={pending}
              className="hover:text-sky-600 disabled:opacity-50"
            >
              {labels.root}
            </button>
            {crumbs.map((crumb, index) => (
              <span key={crumb.id} className="flex items-center gap-1">
                <span>/</span>
                <button
                  type="button"
                  onClick={() => goToCrumb(index)}
                  disabled={pending || index === crumbs.length - 1}
                  className="hover:text-sky-600 disabled:opacity-50 truncate max-w-[12rem]"
                  title={crumb.name}
                >
                  {crumb.name}
                </button>
              </span>
            ))}
          </nav>
        </div>
        <a
          href={result.folderUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="text-sm text-sky-600 hover:underline shrink-0"
        >
          {labels.openFolder}
        </a>
      </div>

      <div className={`p-5 ${pending ? "opacity-60 pointer-events-none" : ""}`}>
        {result.folders.length === 0 && result.files.length === 0 && (
          <p className="text-sm text-slate-400 text-center py-8">{labels.empty}</p>
        )}

        {(result.folders.length > 0 || result.files.length > 0) && (
          <div className="divide-y">
            {result.folders.map((folder) => (
              <GdriveFolderRow
                key={folder.id}
                folder={folder}
                onOpen={() => navigate(folder.id, folder.name)}
              />
            ))}
            {result.files.map((file) => (
              <GdriveFileRow key={file.id} file={file} openLabel={labels.openFile} bcp47={bcp47} />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

function GdriveFolderRow({ folder, onOpen }: { folder: GdriveFolderItem; onOpen: () => void }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="flex w-full items-center gap-3 py-3 first:pt-0 last:pb-0 text-left hover:bg-slate-50 -mx-2 px-2 rounded-lg"
    >
      <div className="h-12 w-16 rounded bg-amber-50 border border-amber-100 flex items-center justify-center text-xl shrink-0">
        📁
      </div>
      <div className="min-w-0 flex-1">
        <p className="font-medium text-sm text-slate-900 line-clamp-2">{folder.name}</p>
      </div>
      <span className="text-xs text-slate-400 shrink-0">›</span>
    </button>
  );
}

function GdriveFileRow({
  file,
  openLabel,
  bcp47,
}: {
  file: GdriveFileItem;
  openLabel: string;
  bcp47: string;
}) {
  const href = file.webViewLink ?? `https://drive.google.com/file/d/${file.id}/view`;
  return (
    <div className="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
      {file.thumbnailLink ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={file.thumbnailLink} alt="" className="h-12 w-16 rounded object-cover bg-slate-50 border shrink-0" />
      ) : (
        <div className="h-12 w-16 rounded bg-slate-100 border flex items-center justify-center text-xl shrink-0">
          {gdriveFileIcon(file.mimeType)}
        </div>
      )}
      <div className="min-w-0 flex-1">
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className="font-medium text-sm text-slate-900 hover:text-sky-600 line-clamp-2"
        >
          {file.name}
        </a>
        {file.modifiedTime && (
          <p className="text-xs text-slate-400 mt-0.5">{fmtDateTime(new Date(file.modifiedTime), bcp47)}</p>
        )}
      </div>
      <a href={href} target="_blank" rel="noopener noreferrer" className="text-xs text-sky-600 hover:underline shrink-0">
        {openLabel}
      </a>
    </div>
  );
}

function AmmoEmptyState({
  message,
  showConfigure,
  configureLabel,
}: {
  message: string;
  showConfigure: boolean;
  configureLabel: string;
}) {
  return (
    <div className="text-center py-8 space-y-3">
      <p className="text-sm text-slate-500 whitespace-pre-wrap">{message}</p>
      {showConfigure && (
        <Link href="/settings" className="inline-block text-sm text-sky-600 hover:underline">
          {configureLabel}
        </Link>
      )}
    </div>
  );
}
