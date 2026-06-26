"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import {
  bindMaterialFolderIdAction,
  createMaterialFolderAction,
  listClientMaterialFoldersAction,
  type MaterialFolderItem,
} from "@/lib/material-actions";
import type { Messages } from "@/lib/i18n/messages/en";

export function GdriveFolderPicker({
  partnerId,
  customerId,
  entityName,
  boundUrl,
  uploaderConnected,
  copy,
  onBound,
}: {
  partnerId?: string | null;
  customerId?: string | null;
  entityName: string;
  boundUrl: string | null;
  uploaderConnected: boolean;
  copy: Messages["gdriveMaterials"];
  onBound: (folderUrl: string) => void;
}) {
  const target = { partnerId, customerId };
  const [folders, setFolders] = useState<MaterialFolderItem[]>([]);
  const [parentUrl, setParentUrl] = useState<string | null>(null);
  const [parentName, setParentName] = useState<string | null>(null);
  const [suggested, setSuggested] = useState<MaterialFolderItem | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState(!boundUrl);
  const [pending, startTransition] = useTransition();

  const loadFolders = useCallback(async () => {
    if (!uploaderConnected) return;
    setLoading(true);
    setLoadError(null);
    const res = await listClientMaterialFoldersAction(entityName);
    setLoading(false);
    if (!res.ok) {
      setLoadError(res.error);
      return;
    }
    setFolders(res.folders);
    setParentUrl(res.parentUrl);
    setParentName(res.parentName);
    setSuggested(res.suggested);
  }, [entityName, uploaderConnected]);

  useEffect(() => {
    if (expanded && uploaderConnected) void loadFolders();
  }, [expanded, uploaderConnected, loadFolders]);

  function bindFolderId(folderId: string) {
    startTransition(async () => {
      setActionError(null);
      const res = await bindMaterialFolderIdAction(target, folderId);
      if (!res.ok) {
        setActionError(res.error ?? copy.folderPickFailed);
        return;
      }
      onBound(res.folderUrl);
      setExpanded(false);
    });
  }

  function createFolder() {
    startTransition(async () => {
      setActionError(null);
      const res = await createMaterialFolderAction(target, entityName);
      if (!res.ok) {
        setActionError(res.error ?? copy.folderCreateFailed);
        return;
      }
      onBound(res.folderUrl);
      setExpanded(false);
    });
  }

  if (!uploaderConnected) return null;

  if (boundUrl && !expanded) {
    return (
      <div className="rounded-lg border border-emerald-100 bg-emerald-50/50 px-3 py-2.5 space-y-1">
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="text-emerald-800 font-medium">{copy.bound}</span>
          <a href={boundUrl} target="_blank" rel="noopener noreferrer" className="text-sky-700 hover:underline truncate max-w-full">
            📁 {copy.openFolder}
          </a>
          <button
            type="button"
            onClick={() => setExpanded(true)}
            className="text-slate-500 hover:text-slate-800 underline"
          >
            {copy.changeFolder}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50/60 px-3 py-3 space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-xs font-medium text-slate-800">{copy.pickFolderTitle}</p>
          {parentName && parentUrl && (
            <a
              href={parentUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-sky-700 hover:underline"
            >
              {copy.pickFolderParent.replace("{name}", parentName)} ↗
            </a>
          )}
        </div>
        {boundUrl && (
          <button type="button" onClick={() => setExpanded(false)} className="text-xs text-slate-400 hover:text-slate-700">
            {copy.cancelPick}
          </button>
        )}
      </div>

      {loading && <p className="text-xs text-slate-400">{copy.folderListLoading}</p>}
      {loadError && <p className="text-xs text-red-600">{loadError}</p>}

      {!loading && !loadError && folders.length > 0 && (
        <ul className="max-h-44 overflow-y-auto rounded-lg border border-slate-200 bg-white divide-y divide-slate-100">
          {folders.map((f) => (
            <li key={f.id} className="flex items-center gap-2 px-2.5 py-2">
              <div className="min-w-0 flex-1">
                <div className="text-sm text-slate-800 truncate">{f.name}</div>
                {f.suggested && (
                  <span className="text-[10px] text-emerald-700">{copy.suggestedMatch}</span>
                )}
              </div>
              <button
                type="button"
                disabled={pending}
                onClick={() => bindFolderId(f.id)}
                className="shrink-0 rounded-md border border-slate-200 px-2.5 py-1 text-xs hover:bg-slate-50 disabled:opacity-50"
              >
                {copy.selectFolder}
              </button>
            </li>
          ))}
        </ul>
      )}

      {!loading && !loadError && folders.length === 0 && (
        <p className="text-xs text-slate-500">{copy.folderListEmpty}</p>
      )}

      <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-slate-200/80">
        {suggested ? (
          <button
            type="button"
            disabled={pending}
            onClick={() => bindFolderId(suggested.id)}
            className="rounded-lg bg-slate-900 text-white px-3 py-1.5 text-xs hover:bg-slate-800 disabled:opacity-50"
          >
            {copy.useSuggested.replace("{name}", suggested.name)}
          </button>
        ) : (
          <button
            type="button"
            disabled={pending}
            onClick={createFolder}
            className="rounded-lg bg-slate-900 text-white px-3 py-1.5 text-xs hover:bg-slate-800 disabled:opacity-50"
          >
            {copy.createFolder.replace("{name}", entityName)}
          </button>
        )}
        <button
          type="button"
          disabled={loading}
          onClick={() => void loadFolders()}
          className="text-xs text-slate-500 hover:text-slate-800"
        >
          {copy.refreshFolders}
        </button>
      </div>

      {actionError && <p className="text-xs text-red-600">{actionError}</p>}
    </div>
  );
}
