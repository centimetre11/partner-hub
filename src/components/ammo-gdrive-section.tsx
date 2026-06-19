import Link from "next/link";
import type { GdriveFileItem, GdriveListResult } from "@/lib/google-drive";
import { gdriveFileIcon } from "@/lib/google-drive";
import { fmtDateTime } from "@/components/ui";

export function AmmoGdriveSection({
  result,
  labels,
  bcp47,
  isAdmin,
}: {
  result: GdriveListResult;
  labels: {
    title: string;
    openFolder: string;
    openFile: string;
    empty: string;
    notConfigured: string;
    missingCredentials: string;
    configure: string;
    files: string;
  };
  bcp47: string;
  isAdmin: boolean;
}) {
  return (
    <section className="bg-white rounded-xl border">
      <div className="px-5 py-4 border-b flex items-center justify-between gap-3">
        <div>
          <h2 className="font-semibold text-zinc-900">{labels.title}</h2>
          {result.ok && (
            <p className="text-xs text-zinc-400 mt-0.5">
              {labels.files.replace("{count}", String(result.files.length))}
            </p>
          )}
        </div>
        {result.ok && (
          <a
            href={result.folderUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm text-indigo-600 hover:underline shrink-0"
          >
            {labels.openFolder}
          </a>
        )}
      </div>

      <div className="p-5">
        {!result.ok && (
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
        )}

        {result.ok && result.files.length === 0 && (
          <p className="text-sm text-zinc-400 text-center py-8">{labels.empty}</p>
        )}

        {result.ok && result.files.length > 0 && (
          <div className="divide-y">
            {result.files.map((file) => (
              <GdriveFileRow key={file.id} file={file} openLabel={labels.openFile} bcp47={bcp47} />
            ))}
          </div>
        )}
      </div>
    </section>
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
        <img src={file.thumbnailLink} alt="" className="h-12 w-16 rounded object-cover bg-zinc-50 border shrink-0" />
      ) : (
        <div className="h-12 w-16 rounded bg-zinc-100 border flex items-center justify-center text-xl shrink-0">
          {gdriveFileIcon(file.mimeType)}
        </div>
      )}
      <div className="min-w-0 flex-1">
        <a href={href} target="_blank" rel="noopener noreferrer" className="font-medium text-sm text-zinc-900 hover:text-indigo-600 line-clamp-2">
          {file.name}
        </a>
        {file.modifiedTime && (
          <p className="text-xs text-zinc-400 mt-0.5">{fmtDateTime(new Date(file.modifiedTime), bcp47)}</p>
        )}
      </div>
      <a href={href} target="_blank" rel="noopener noreferrer" className="text-xs text-indigo-600 hover:underline shrink-0">
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
      <p className="text-sm text-zinc-500 whitespace-pre-wrap">{message}</p>
      {showConfigure && (
        <Link href="/settings" className="inline-block text-sm text-indigo-600 hover:underline">
          {configureLabel}
        </Link>
      )}
    </div>
  );
}
