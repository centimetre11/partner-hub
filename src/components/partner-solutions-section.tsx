import { Card, EmptyState } from "@/components/ui";
import { AddSolutionForm } from "@/components/add-solution-form";
import { EditSolutionForm } from "@/components/edit-solution-form";
import type { LinkPreviewState } from "@/components/solution-link-field";
import type { Messages } from "@/lib/i18n/messages/en";

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

function primaryLink(sol: SolutionRow) {
  return sol.assets.find((a) => a.asset.kind === "LINK" && a.asset.url)?.asset ?? null;
}

function toPreview(asset: NonNullable<ReturnType<typeof primaryLink>>): LinkPreviewState {
  return {
    url: asset.url!,
    title: asset.filename,
    description: null,
    thumbnailUrl: asset.thumbnailUrl,
    provider: asset.provider ?? "web",
  };
}

export function PartnerSolutionsSection({
  partnerId,
  solutions,
  copy,
}: {
  partnerId: string;
  solutions: SolutionRow[];
  copy: Messages["partnerDetail"]["solutionsSection"];
}) {
  return (
    <Card title={copy.title.replace("{count}", String(solutions.length))}>
      <div className="space-y-4">
        {solutions.map((sol) => {
          const link = primaryLink(sol);
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
                  initialPreview={link ? toPreview(link) : null}
                  defaultNotes={sol.notes ?? ""}
                  copy={copy}
                />
              </div>
            </details>
          );
        })}
        {solutions.length === 0 && <EmptyState text={copy.empty} />}

        <details className="rounded-lg border border-dashed border-slate-200">
          <summary className="px-4 py-2.5 text-sm text-sky-600 cursor-pointer list-none">{copy.addSolution}</summary>
          <AddSolutionForm partnerId={partnerId} copy={copy} />
        </details>
      </div>
    </Card>
  );
}
