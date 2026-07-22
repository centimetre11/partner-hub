/**
 * After a redeploy, open tabs still hold old Server Action IDs.
 * Calling those actions fails with "Failed to find Server Action …".
 * Recover by a full reload so the client picks up the new build.
 */

export function isStaleServerActionError(error: unknown): boolean {
  const msg = error instanceof Error ? error.message : String(error ?? "");
  return (
    msg.includes("Failed to find Server Action") ||
    msg.includes("was not found on the server") ||
    // Next may wrap the message
    msg.includes("older or newer deployment")
  );
}

/** @returns true if a reload was triggered */
export function recoverFromStaleServerAction(error: unknown): boolean {
  if (!isStaleServerActionError(error)) return false;
  if (typeof window !== "undefined") {
    window.location.reload();
  }
  return true;
}
