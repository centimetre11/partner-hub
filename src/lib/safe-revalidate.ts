import { revalidatePath as nextRevalidatePath } from "next/cache";

const OUTSIDE_REQUEST_RE = /static generation store missing/i;

/** Safe revalidate for App Router handlers and background workers (WeCom bot, cron). */
export function revalidatePath(path: string, type?: "layout" | "page"): void {
  try {
    if (type) nextRevalidatePath(path, type);
    else nextRevalidatePath(path);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (OUTSIDE_REQUEST_RE.test(msg)) return;
    throw e;
  }
}
