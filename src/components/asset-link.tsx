type AssetLike = {
  id: string;
  kind?: string | null;
  filename: string;
  url?: string | null;
  thumbnailUrl?: string | null;
};

// 行内链接形式（用于列表里的一行）
export function AssetInline({ asset, label }: { asset: AssetLike; label?: string | null }) {
  const isLink = asset.kind === "LINK";
  const href = isLink && asset.url ? asset.url : `/api/assets/${asset.id}`;
  return (
    <a href={href} target="_blank" className="text-indigo-600 hover:underline">
      {isLink ? "🔗" : "📎"} {label ? `${label} · ` : ""}{asset.filename}
    </a>
  );
}

// 卡片形式：链接带缩略图，文件回退图标
export function AssetCard({ asset, label }: { asset: AssetLike; label?: string | null }) {
  const isLink = asset.kind === "LINK";
  const href = isLink && asset.url ? asset.url : `/api/assets/${asset.id}`;
  return (
    <a
      href={href}
      target="_blank"
      className="flex items-center gap-3 rounded-lg border border-zinc-200 p-2 hover:border-indigo-300 hover:bg-indigo-50/30 transition-colors max-w-sm"
    >
      {asset.thumbnailUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={asset.thumbnailUrl} alt="" className="h-12 w-16 rounded object-cover bg-zinc-50 shrink-0" />
      ) : (
        <div className="h-12 w-16 rounded bg-zinc-100 flex items-center justify-center text-lg shrink-0">
          {isLink ? "🔗" : "📄"}
        </div>
      )}
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm text-zinc-800">{label ? `${label} · ` : ""}{asset.filename}</div>
        {isLink && asset.url && (
          <div className="truncate text-xs text-zinc-400">{asset.url}</div>
        )}
      </div>
    </a>
  );
}
