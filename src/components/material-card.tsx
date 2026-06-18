import Link from "next/link";
import { Badge, fmtDateTime } from "@/components/ui";
import { providerIcon } from "@/components/material-link-field";

type MaterialCardProps = {
  id: string;
  title: string;
  description?: string | null;
  category: string;
  categoryLabel: string;
  updatedAt: Date;
  author?: string | null;
  bcp47: string;
  asset?: {
    url: string | null;
    thumbnailUrl: string | null;
    provider: string | null;
    filename: string;
  } | null;
  labels: {
    openLink: string;
    edit: string;
    delete: string;
    providers: Record<string, string>;
  };
  deleteAction: () => void;
};

export function MaterialCard({
  id,
  title,
  description,
  category,
  categoryLabel,
  updatedAt,
  author,
  bcp47,
  asset,
  labels,
  deleteAction,
}: MaterialCardProps) {
  const href = asset?.url ?? `/materials/${id}`;
  const provider = asset?.provider ?? "web";

  return (
    <div className="bg-white rounded-xl border p-4 hover:border-indigo-200 transition-colors">
      <div className="flex gap-4">
        <a
          href={href}
          target={asset?.url ? "_blank" : undefined}
          rel={asset?.url ? "noopener noreferrer" : undefined}
          className="shrink-0"
        >
          {asset?.thumbnailUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={asset.thumbnailUrl}
              alt=""
              className="h-20 w-28 rounded-lg object-cover bg-zinc-50 border hover:opacity-90 transition-opacity"
            />
          ) : (
            <div className="h-20 w-28 rounded-lg bg-zinc-100 border flex items-center justify-center text-3xl hover:bg-zinc-50 transition-colors">
              {providerIcon(provider)}
            </div>
          )}
        </a>

        <div className="min-w-0 flex-1">
          <div className="flex justify-between gap-3 items-start">
            <div className="min-w-0">
              <a
                href={href}
                target={asset?.url ? "_blank" : undefined}
                rel={asset?.url ? "noopener noreferrer" : undefined}
                className="font-semibold text-zinc-900 hover:text-indigo-600 line-clamp-2"
              >
                {title}
              </a>
              <div className="text-xs text-zinc-400 mt-1 flex gap-2 flex-wrap items-center">
                <Badge tone="zinc">{categoryLabel}</Badge>
                <Badge tone="indigo">{labels.providers[provider] ?? provider}</Badge>
                <span>{author} · {fmtDateTime(updatedAt, bcp47)}</span>
              </div>
            </div>
            <div className="flex items-center gap-3 shrink-0">
              {asset?.url && (
                <a
                  href={asset.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-indigo-600 hover:underline"
                >
                  {labels.openLink}
                </a>
              )}
              <Link href={`/materials/${id}`} className="text-xs text-zinc-400 hover:text-indigo-600">
                {labels.edit}
              </Link>
              <form action={deleteAction}>
                <button className="text-xs text-zinc-400 hover:text-red-600">{labels.delete}</button>
              </form>
            </div>
          </div>
          {description && (
            <p className="text-sm text-zinc-500 mt-2 line-clamp-2">{description}</p>
          )}
          {asset?.url && (
            <p className="text-xs text-zinc-400 mt-1 truncate">{asset.url}</p>
          )}
        </div>
      </div>
    </div>
  );
}
