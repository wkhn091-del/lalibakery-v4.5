/*
  Saving the wizard's draft on the server, for a customer signed in with their phone: the
  wizard calls it (through a Server Action, with the customer's own Supabase session, so
  save_cart_draft can only ever write that customer's draft) when the step changes, and at most
  every 30 s while they type. Before a cake type is chosen there is nothing to save.
  The first save of a draft schedules its reminder (lib/qstash.ts); later saves only move the
  moment it falls due, which the database works out when QStash asks.
*/
import * as z from "zod/mini";
import type { Draft } from "../order/model";
import { asDraft, DraftSchema } from "../order/schema";

export type SavedDraft = { draft_id: string; is_new: boolean; remind_at: string };
export type SaveDeps = {
  /** save_cart_draft, as the signed-in customer */
  save(details: Draft, step: number): Promise<SavedDraft>;
  schedule(draftId: string, at: Date): Promise<boolean>;
  report: { exception(error: unknown, text: string): void };
};
export type SaveResult = { ok: true; draftId: string } | { ok: false; error: "invalid" | "empty" };

const Input = z.object({
  step: z.int().check(z.gte(0), z.lte(4)),
  draft: DraftSchema,
});

export async function saveCartDraft(input: unknown, deps: SaveDeps): Promise<SaveResult> {
  const parsed = Input.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid" };
  const draft = asDraft(parsed.data.draft);
  if (!draft.category) return { ok: false, error: "empty" };

  const saved = await deps.save(draft, parsed.data.step);
  if (saved.is_new) {
    try {
      if (!(await deps.schedule(saved.draft_id, new Date(saved.remind_at))))
        deps.report.exception(new Error("QStash is not set up: no reminder for this draft"), "cart draft");
    } catch (error) {
      // the draft is saved either way; only its reminder is lost
      deps.report.exception(error, "cart draft: the reminder could not be scheduled");
    }
  }
  return { ok: true, draftId: saved.draft_id };
}
