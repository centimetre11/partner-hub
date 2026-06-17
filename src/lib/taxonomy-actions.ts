"use server";

import { revalidatePath } from "next/cache";
import { db } from "./db";
import { requireUser } from "./session";
import {
  ensureTaxonomySeed,
  slugTaxonomyCode,
  type TaxonomyDimension,
} from "./taxonomy";

export async function createTaxonomyOptionAction(formData: FormData) {
  const user = await requireUser();
  await ensureTaxonomySeed();

  const dimension = String(formData.get("dimension") ?? "") as TaxonomyDimension;
  const label = String(formData.get("label") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim() || null;
  let code = String(formData.get("code") ?? "").trim().toUpperCase();

  if (!label || !["ARCHETYPE", "INDUSTRY", "VALUE_PATTERN", "CATEGORY"].includes(dimension)) {
    return;
  }
  if (!code) code = slugTaxonomyCode(label);

  const exists = await db.taxonomyOption.findUnique({
    where: { dimension_code: { dimension, code } },
  });
  if (exists) return;

  const maxSort = await db.taxonomyOption.aggregate({
    where: { dimension },
    _max: { sortOrder: true },
  });

  await db.taxonomyOption.create({
    data: {
      dimension,
      code,
      label,
      description,
      sortOrder: (maxSort._max.sortOrder ?? 0) + 1,
      isBuiltin: false,
      createdById: user.id,
    },
  });

  revalidatePath("/taxonomy");
  revalidatePath("/partners");
}

export async function deleteTaxonomyOptionAction(id: string) {
  await requireUser();
  const row = await db.taxonomyOption.findUnique({ where: { id } });
  if (!row) return;
  if (row.isBuiltin) return;

  await db.taxonomyOption.delete({ where: { id } });
  revalidatePath("/taxonomy");
  revalidatePath("/partners");
}
