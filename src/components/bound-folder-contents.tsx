"use client";

import { useCallback, useEffect, useState } from "react";
import { fmtDateTime } from "@/components/ui";
import { listBoundMaterialFolderAction } from "@/lib/material-actions";
import { gdriveFileIcon } from "@/lib/google-drive";
import { useLocale } from "@/lib/i18n";
import type { Messages } from "@/lib/i18n/messages/en";

type FolderRow = { id: string; name: string; modifiedTime: string | null; url: string };
type FileRow = {
  id: string;
  name: string;
  mimeType: string;
  webViewLink: string | null;
  thumbnailLink: string | null;
  modifiedTime: string | null;
};

export function BoundFolderContents({
  folderUrl,
  copy,
  refreshKey = 0,
}: {
  folderUrl: string;
  copy: Messages["gdriveMaterials"];
  refreshKey?: number;
}) {
  const bcp47 = useLocale();
  const [folderName, setFolderName] = useState<string | null>(null);
  const [folders, setFolders] = useState<FolderRow[]>([]);
  const [files, setFiles] = useState<FileRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const res = await listBoundMaterialFolderAction(folderUrl);
    setLoading(false);
    if (!res.ok) {
      setError(res.error);
      setFolderName(null);
      setFolders([]);
      setFiles([]);
      return;
    }
    setFolderName(res.folderName);
    setFolders(res.folders);
    setFiles(res.files);
  }, [folderUrl]);

  useEffect(() => {
    void load();
  }, [load, refreshKey]);

  if (loading) {
    return <p className="text-xs text-slate-400">{copy.folderContentsLoading}</p>;
  }

  if (error) {
    return (
      <div className="rounded-lg border border-red-100 bg-red-50/50 px-3 py-2.5 space-y-2">
        <p className="text-xs text-red-600">{error}</p>
        <button type="button" onClick={() => void load()} className="text-xs text-slate-600 hover:text-slate-900 underline">
          {copy.refreshFolderContents}
        </button>
      </div>
    );
  }

  const empty = folders.length === 0 && files.length === 0;

  return (
    <div className="rounded-lg border border-slate-200 bg-white divide-y divide-slate-100">
      <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 bg-slate-50/80">
        <p className="text-xs font-medium text-slate-700">
          {copy.folderContentsTitle.replace("{name}", folderName ?? "—")}
        </p>
        <button
          type="button"
          onClick={() => void load()}
          className="text-xs text-slate-500 hover:text-slate-800"
        >
          {copy.refreshFolderContents}
        </button>
      </div>

      {empty ? (
        <p className="px-3 py-4 text-xs text-slate-400">{copy.folderContentsEmpty}</p>
      ) : (
        <ul className="max-h-72 overflow-y-auto divide-y divide-slate-100">
          {folders.map((f) => (
            <li key={f.id} className="flex items-center gap-3 px-3 py-2.5">
              <div className="h-10 w-12 rounded bg-amber-50 border border-amber-100 flex items-center justify-center text-lg shrink-0">
                📁
              </div>
              <div className="min-w-0 flex-1">
                <a
                  href={f.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-slate-800 hover:text-sky-700 line-clamp-2"
                >
                  {f.name}
                </a>
                {f.modifiedTime && (
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    {fmtDateTime(new Date(f.modifiedTime), bcp47)}
                  </p>
                )}
              </div>
              <a
                href={f.url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-sky-600 hover:underline shrink-0"
              >
                {copy.view} →
              </a>
            </li>
          ))}
          {files.map((f) => {
            const href = f.webViewLink ?? `https://drive.google.com/file/d/${f.id}/view`;
            return (
              <li key={f.id} className="flex items-center gap-3 px-3 py-2.5">
                {f.thumbnailLink ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={f.thumbnailLink}
                    alt=""
                    className="h-10 w-12 rounded object-cover bg-slate-50 border shrink-0"
                  />
                ) : (
                  <div className="h-10 w-12 rounded bg-slate-100 border flex items-center justify-center text-lg shrink-0">
                    {gdriveFileIcon(f.mimeType)}
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <a
                    href={href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm text-slate-800 hover:text-sky-700 line-clamp-2"
                  >
                    {f.name}
                  </a>
                  {f.modifiedTime && (
                    <p className="text-[11px] text-slate-400 mt-0.5">
                      {fmtDateTime(new Date(f.modifiedTime), bcp47)}
                    </p>
                  )}
                </div>
                <a
                  href={href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-sky-600 hover:underline shrink-0"
                >
                  {copy.view} →
                </a>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
