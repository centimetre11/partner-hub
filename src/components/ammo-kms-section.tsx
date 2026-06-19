import Link from "next/link";
import type { AmmoKmsResult } from "@/lib/kms";
import { Badge, fmtDateTime } from "@/components/ui";

export function AmmoKmsSection({
  result,
  labels,
  bcp47,
  isAdmin,
}: {
  result: AmmoKmsResult;
  labels: {
    title: string;
    open: string;
    empty: string;
    notConfigured: string;
    kmsNotConfigured: string;
    configure: string;
    configureKms: string;
    pages: string;
    underParent: string;
  };
  bcp47: string;
  isAdmin: boolean;
}) {
  return (
    <section className="bg-white rounded-xl border">
      <div className="px-5 py-4 border-b">
        <h2 className="font-semibold text-zinc-900">{labels.title}</h2>
        {result.ok && (
          <p className="text-xs text-zinc-400 mt-0.5">
            {labels.pages.replace("{count}", String(result.pages.length))}
          </p>
        )}
      </div>

      <div className="p-5 space-y-3">
        {!result.ok && (
          <div className="text-center py-8 space-y-3">
            <p className="text-sm text-zinc-500 whitespace-pre-wrap">
              {result.reason === "not_configured"
                ? labels.notConfigured
                : result.reason === "kms_not_configured"
                  ? labels.kmsNotConfigured
                  : result.message}
            </p>
            {isAdmin && (
              <div className="flex justify-center gap-4 text-sm">
                <Link href="/settings" className="text-indigo-600 hover:underline">
                  {labels.configure}
                </Link>
                {result.reason === "kms_not_configured" && (
                  <Link href="/settings" className="text-indigo-600 hover:underline">
                    {labels.configureKms}
                  </Link>
                )}
              </div>
            )}
          </div>
        )}

        {result.ok && result.pages.length === 0 && (
          <p className="text-sm text-zinc-400 text-center py-8">{labels.empty}</p>
        )}

        {result.ok &&
          result.pages.map((page) => (
            <div key={page.id} className="rounded-lg border p-4 hover:border-indigo-200 transition-colors">
              <div className="flex justify-between gap-3 items-start">
                <div className="min-w-0">
                  <a
                    href={page.webUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-semibold text-zinc-900 hover:text-indigo-600 line-clamp-2"
                  >
                    {page.title}
                  </a>
                  <div className="text-xs text-zinc-400 mt-1 flex gap-2 flex-wrap items-center">
                    <Badge tone="indigo">KMS</Badge>
                    {page.spaceName && <Badge tone="zinc">{page.spaceName}</Badge>}
                    {page.parentTitle && (
                      <span>{labels.underParent.replace("{name}", page.parentTitle)}</span>
                    )}
                    {page.updatedAt && <span>{fmtDateTime(new Date(page.updatedAt), bcp47)}</span>}
                  </div>
                </div>
                <a
                  href={page.webUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-indigo-600 hover:underline shrink-0"
                >
                  {labels.open}
                </a>
              </div>
              {page.excerpt && (
                <p className="text-sm text-zinc-500 mt-2 line-clamp-3">{page.excerpt}</p>
              )}
            </div>
          ))}
      </div>
    </section>
  );
}
