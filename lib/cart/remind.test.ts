// The cart reminder callback: carrying out the database's answer, and never sending twice.   npm test
import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";
import { type ClaimRow, handleCartReminder, reminderText, type RemindDeps, type SendResult } from "./remind";
import { saveCartDraft, type SaveDeps } from "./save";
import { EMPTY } from "../order/model";

const DRAFT = "3f0b6a52-8a8e-4a57-9d0e-6c1f3f4b2a10";
const none = { not_before: null, reason: null, message_id: null, phone: null, customer_name: null, channel: null };
const send = (over: Partial<ClaimRow> = {}): ClaimRow => ({ ...none, action: "send", message_id: "m1", phone: "+972501111111", customer_name: "רחל", channel: "sms", ...over });

let calls: { claims: string[]; rescheduled: [string, string][]; sent: [string, string, string][]; recorded: [string, SendResult][]; reports: string[] };
let deps: RemindDeps;
let answer: ClaimRow;

beforeEach(() => {
  calls = { claims: [], rescheduled: [], sent: [], recorded: [], reports: [] };
  answer = send();
  deps = {
    claim: async (id) => (calls.claims.push(id), answer),
    reschedule: async (id, at) => void calls.rescheduled.push([id, at.toISOString()]),
    send: async (channel, to, text) => (calls.sent.push([channel, to, text]), "SM123"),
    record: async (id, result) => void calls.recorded.push([id, result]),
    report: { exception: (_e, text) => void calls.reports.push(text) },
    siteUrl: "https://www.lalibakery.co.il",
  };
});
const body = { draftId: DRAFT };
const json = (res: Response) => res.json() as Promise<Record<string, unknown>>;

describe("cart reminder", () => {
  it("sends once and records it", async () => {
    const res = await handleCartReminder(body, deps);
    assert.equal(res.status, 200);
    assert.deepEqual(await json(res), { action: "send", status: "sent" });
    assert.deepEqual(calls.sent, [["sms", "+972501111111", reminderText("רחל", deps.siteUrl)]]);
    assert.deepEqual(calls.recorded, [["m1", { status: "sent", providerId: "SM123" }]]);
  });

  it("is labelled as an advertisement, links to the cake, and says how to opt out", () => {
    const text = reminderText("רחל", "https://www.lalibakery.co.il");
    assert.match(text, /^פרסומת: שלום רחל,/);
    assert.match(text, /https:\/\/www\.lalibakery\.co\.il\/custom-cake/);
    assert.match(text, /להסרה השיבו "הסר"$/);
    assert.match(reminderText(null, "https://www.lalibakery.co.il"), /^פרסומת: שלום,/);
  });

  it("answers 200 when sending fails, so QStash never sends it again", async () => {
    deps.send = async () => {
      throw new Error("Twilio refused the message (HTTP 400, error 21211)");
    };
    const res = await handleCartReminder(body, deps);
    assert.equal(res.status, 200);
    assert.equal((await json(res)).status, "failed");
    assert.deepEqual(calls.recorded, [["m1", { status: "failed", error: "Error: Twilio refused the message (HTTP 400, error 21211)" }]]);
    assert.deepEqual(calls.reports, ["cart reminder: the message could not be sent"]);
  });

  it("still answers 200 when the result can't be recorded", async () => {
    deps.record = async () => {
      throw new Error("database down");
    };
    assert.equal((await handleCartReminder(body, deps)).status, 200);
    assert.equal(calls.sent.length, 1);
    assert.deepEqual(calls.reports, ["cart reminder: the result could not be recorded"]);
  });

  it("asks again later when the database says wait", async () => {
    answer = { ...none, action: "wait", reason: "quiet_hours", not_before: "2026-10-11T06:00:00+00:00" };
    const res = await json(await handleCartReminder(body, deps));
    assert.equal(res.action, "wait");
    assert.deepEqual(calls.rescheduled, [[DRAFT, "2026-10-11T06:00:00.000Z"]]);
    assert.equal(calls.sent.length, 0);
  });

  it("does nothing when the database says stop", async () => {
    answer = { ...none, action: "stop", reason: "submitted" };
    assert.deepEqual(await json(await handleCartReminder(body, deps)), { action: "stop", reason: "submitted" });
    assert.equal(calls.sent.length + calls.rescheduled.length + calls.recorded.length, 0);
  });

  it("fails before the claim, so QStash can ask again", async () => {
    deps.claim = async () => {
      throw new Error("database down");
    };
    await assert.rejects(handleCartReminder(body, deps), /database down/);
  });

  it("refuses a body without a draft id", async () => {
    for (const bad of [null, {}, { draftId: "1; drop table" }]) assert.equal((await handleCartReminder(bad, deps)).status, 400);
    assert.equal(calls.claims.length, 0);
  });
});

describe("saving a draft", () => {
  let saved: { details: unknown; step: number }[];
  let scheduled: [string, string][];
  let reports: string[];
  let save: SaveDeps;
  let isNew: boolean;
  beforeEach(() => {
    saved = [];
    scheduled = [];
    reports = [];
    isNew = true;
    save = {
      save: async (details, step) => (saved.push({ details, step }), { draft_id: DRAFT, is_new: isNew, remind_at: "2026-10-05T11:00:00+00:00" }),
      schedule: async (id, at) => (scheduled.push([id, at.toISOString()]), true),
      report: { exception: (_e, text) => void reports.push(text) },
    };
  });
  const draft = { ...EMPTY, category: "designer", size: "d20", message: " מזל טוב​ " };

  it("saves a valid draft, cleaned, and schedules the reminder for a new one", async () => {
    assert.deepEqual(await saveCartDraft({ step: 1, draft }, save), { ok: true, draftId: DRAFT });
    assert.equal((saved[0].details as typeof draft).message, "מזל טוב");
    assert.deepEqual(scheduled, [[DRAFT, "2026-10-05T11:00:00.000Z"]]);
  });

  it("schedules nothing when the draft already existed", async () => {
    isNew = false;
    await saveCartDraft({ step: 2, draft }, save);
    assert.equal(scheduled.length, 0);
  });

  it("saves nothing before a cake type is chosen, or from a tampered draft", async () => {
    assert.deepEqual(await saveCartDraft({ step: 0, draft: EMPTY }, save), { ok: false, error: "empty" });
    assert.deepEqual(await saveCartDraft({ step: 9, draft }, save), { ok: false, error: "invalid" });
    assert.deepEqual(await saveCartDraft({ step: 1, draft: { ...draft, colors: "all" } }, save), { ok: false, error: "invalid" });
    assert.equal(saved.length, 0);
  });

  it("keeps the draft when the reminder can't be scheduled", async () => {
    save.schedule = async () => {
      throw new Error("QStash down");
    };
    assert.deepEqual(await saveCartDraft({ step: 1, draft }, save), { ok: true, draftId: DRAFT });
    assert.deepEqual(reports, ["cart draft: the reminder could not be scheduled"]);
  });
});
