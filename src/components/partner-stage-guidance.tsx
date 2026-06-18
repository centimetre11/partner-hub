import { Card } from "@/components/ui";
import { StageGuidanceContent } from "@/components/stage-guidance-content";
import {
  getStageGuidance,
  type PartnerFrameworkInput,
} from "@/lib/partner-framework";
import type { LabelsBundle } from "@/lib/i18n/labels";
import type { Messages } from "@/lib/i18n/messages/en";

export function PartnerStageGuidancePanel({
  partner,
  labels,
  messages: m,
}: {
  partner: PartnerFrameworkInput;
  labels: LabelsBundle;
  messages: Messages;
}) {
  const guidance = getStageGuidance(partner, labels);
  const title = m.partnerDetail.stageGuidanceTitle
    .replace("{stage}", String(guidance.stage))
    .replace("{name}", guidance.name);

  return (
    <Card title={title}>
      <StageGuidanceContent guidance={guidance} labels={labels} messages={m} variant="light" />
    </Card>
  );
}
