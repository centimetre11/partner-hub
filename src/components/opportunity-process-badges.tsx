import { Badge } from "@/components/ui";
import {
  formatNextProcessDisplay,
  parseProcessTags,
  processTagLabel,
  type ProcessTagCode,
} from "@/lib/opportunity-process-tags";

function tagTone(code: ProcessTagCode): "blue" | "amber" | "indigo" | "green" | "zinc" {
  switch (code) {
    case "DISCOVERY":
    case "ASSESSMENT":
      return "blue";
    case "SOLUTION":
    case "DEMO":
      return "indigo";
    case "QUOTE":
    case "BID_DOC":
    case "BID":
      return "amber";
    case "NEGOTIATION":
    case "CONTRACT":
      return "green";
    default:
      return "zinc";
  }
}

export function OpportunityProcessBadges({
  stage,
  nextStep,
  locale = "zh",
  nextPrefix,
}: {
  stage: string;
  nextStep?: string | null;
  locale?: "zh" | "en";
  nextPrefix?: string;
}) {
  const codes = parseProcessTags(stage);
  const nextLabel = formatNextProcessDisplay(nextStep, locale);

  return (
    <>
      {codes.map((code) => (
        <Badge key={code} tone={tagTone(code)}>
          {processTagLabel(code, locale)}
        </Badge>
      ))}
      {nextLabel ? (
        <Badge tone="zinc">
          {nextPrefix ? `${nextPrefix}${nextLabel}` : nextLabel}
        </Badge>
      ) : null}
    </>
  );
}
