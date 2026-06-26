import type { Training } from "@prisma/client";
import { deleteTrainingAction, upsertTrainingAction } from "@/lib/actions";
import type { Messages } from "@/lib/i18n/messages/en";

type TrainingOwner = { partnerId: string } | { customerId: string };

export function TrainingList({
  owner,
  trainings,
  input,
  m,
}: {
  owner: TrainingOwner;
  trainings: Training[];
  input: string;
  m: Messages;
}) {
  const upsert = upsertTrainingAction.bind(null, owner);
  const del = (id: string) => deleteTrainingAction.bind(null, owner, id);

  return (
    <div className="space-y-2">
      {trainings.map((t) => (
        <form key={t.id} action={upsert} className="grid grid-cols-2 md:grid-cols-6 gap-2 text-sm items-center">
          <input type="hidden" name="id" value={t.id} />
          <input name="person" defaultValue={t.person} className={input} />
          <input name="currentSkill" defaultValue={t.currentSkill ?? ""} placeholder={m.common.currentSkill} className={input} />
          <input name="targetCert" defaultValue={t.targetCert ?? ""} placeholder={m.common.targetCert} className={input} />
          <input name="deadline" type="date" defaultValue={t.deadline ? new Date(t.deadline).toISOString().slice(0, 10) : ""} className={input} />
          <select name="status" defaultValue={t.status} className={input}>
            <option value="PLANNED">{m.common.planned}</option>
            <option value="IN_PROGRESS">{m.common.inProgress}</option>
            <option value="DONE">{m.common.completed}</option>
          </select>
          <div className="flex gap-1 justify-end">
            <button className="rounded-md bg-slate-900 text-white px-2.5 py-1.5 text-xs">{m.common.save}</button>
            <button formAction={del(t.id)} className="text-xs text-slate-400 hover:text-red-600 px-1">
              {m.partnerDetail.trainingDel}
            </button>
          </div>
        </form>
      ))}
      <details className="rounded-lg border border-dashed border-slate-200">
        <summary className="px-4 py-2.5 text-sm text-sky-600 cursor-pointer list-none">
          {m.partnerDetail.addTrainingPlan}
        </summary>
        <form action={upsert} className="px-4 pb-4 grid grid-cols-2 md:grid-cols-5 gap-2 text-sm">
          <input name="person" required placeholder={m.partnerDetail.personRequired} className={input} />
          <input name="currentSkill" placeholder={m.common.currentSkill} className={input} />
          <input name="targetCert" placeholder={m.common.targetCert} className={input} />
          <input name="deadline" type="date" className={input} />
          <select name="status" defaultValue="PLANNED" className={input}>
            <option value="PLANNED">{m.common.planned}</option>
            <option value="IN_PROGRESS">{m.common.inProgress}</option>
            <option value="DONE">{m.common.completed}</option>
          </select>
          <div className="col-span-2 md:col-span-5 flex justify-end">
            <button className="rounded-md bg-slate-900 text-white px-3 py-1.5 text-xs">{m.common.add}</button>
          </div>
        </form>
      </details>
      {trainings.length === 0 && (
        <p className="text-xs text-slate-400 px-1">{m.partnerDetail.noTrainingPlans}</p>
      )}
    </div>
  );
}
