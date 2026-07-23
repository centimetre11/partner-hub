# Meeting framework

Shared UI shell for review-style meetings (partner reviews, lead reviews, and future scenarios).

## Pieces

| Component | Role |
|---|---|
| `MeetingShell` | Top toolbar + flash + slots for recording / post / main |
| `MeetingToolbar` | Prep / Start / End / Back / Share (shared colors & order) |
| `MeetingShareActions` | Open / copy preview link |
| `MeetingAgendaPanel` | Agenda list + discuss-on-click in LIVE |
| `MeetingLiveRecording` | LIVE-only iFlytek batch recorder |
| `PostMinutesDualPath` | Path A paste + Path B slot |
| `MeetingMatchSourceSwitch` | Toggle Tencent vs iFlytek result |
| `MeetingPostStepIndicator` | paste → assign → extract/tag |
| `MeetingAssignmentTimeline` | Edit ownership by discuss order |
| `MeetingBatchRecorder` | Mic / tab audio → upload → iFlytek |

## Wired scenes

- Partner review: `src/app/(app)/partner-reviews/[id]/meeting-workspace.tsx`
- Lead review: `src/app/(app)/lead-reviews/[id]/meeting-workspace.tsx`
- Presales project meeting: `src/app/(app)/presales-meetings/[id]/meeting-workspace.tsx`

All use the same shell chrome (toolbar colors/order, agenda, LIVE recording, post dual-path, step indicator). Domain panels stay in adapters (partner AI extract / final report; lead verdicts / CRM cards; presales prep-facts + project work logs).

## Adding a new meeting scenario

1. Keep domain models + server actions under `src/lib/<scene>/`.
2. Build workspace with `MeetingShell` + agenda/post slots.
3. Pass `apiBase` for recording routes and `resolvePreviewPath` for share pages.
4. Put scene-specific panels (verdicts, partner extract/report, …) in `children` / post confirm handlers — not in the shell.

Domain differences stay in adapters; chrome stays identical.
