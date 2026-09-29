// Runs both migrations on a real Postgres (PGlite) set up like Supabase, then plays the
// abandoned-cart reminders through them: saving drafts, who sees what, the claim's decisions
// (wait, send, stop), quiet hours and Shabbat, consent, and the anniversary outbox still working.
//
//   node supabase/tests/cart_recovery.test.mjs      (npm run test:db runs both database tests)
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";

const db = await PGlite.create();
let passed = 0;
const ok = (cond, label) => {
  if (!cond) throw new Error(`FAILED: ${label}`);
  passed++;
  console.log(`  ✓ ${label}`);
};

await db.exec(`
  create role anon nologin;
  create role authenticated nologin;
  create role service_role nologin bypassrls;
  create role supabase_auth_admin nologin;
  create schema auth;
  create table auth.users (id uuid primary key, phone text unique, phone_confirmed_at timestamptz, created_at timestamptz default now());
  create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  grant usage on schema auth to anon, authenticated, service_role, supabase_auth_admin;
  grant all on auth.users to supabase_auth_admin;
  grant usage on schema public to anon, authenticated, service_role;
  alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
  alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
  alter default privileges in schema public grant execute on functions to anon, authenticated, service_role;
`);
for (const file of ["20260928090000_vip_club.sql", "20260929090000_cart_recovery.sql"])
  await db.exec(readFileSync(new URL(`../migrations/${file}`, import.meta.url), "utf8"));
console.log("migrations applied");

async function run(who, sql, params = []) {
  await db.exec("reset role");
  await db.query("select set_config('request.jwt.claim.sub', $1, false)", [who?.id ?? ""]);
  await db.exec(who === "service" ? "set role service_role" : who ? "set role authenticated" : "set role anon");
  try {
    return (await db.query(sql, params)).rows;
  } finally {
    await db.exec("reset role");
  }
}
async function fails(who, sql, params, pattern, label) {
  try {
    await run(who, sql, params);
  } catch (e) {
    ok(pattern.test(e.message), `${label} (${e.message.split("\n")[0]})`);
    return;
  }
  throw new Error(`FAILED: ${label} (it succeeded)`);
}
const su = async (sql, params = []) => (await db.query(sql, params)).rows;
const iso = (t) => (t instanceof Date ? t.toISOString() : t);

// ── people ──
const user = (n) => ({ id: `00000000-0000-0000-0000-00000000000${n}` });
const owner = user(1), rachel = user(2), dana = user(3), yossi = user(4), tamar = user(5), noa = user(6);
const phones = [[owner, "972508739090"], [rachel, "972501111111"], [dana, "972502222222"], [yossi, "972503333333"], [tamar, "972505555555"], [noa, "972506666666"]];
for (const [u, phone] of phones) await su("insert into auth.users (id, phone, phone_confirmed_at) values ($1, $2, now())", [u.id, phone]);
await su("insert into public.staff (user_id) values ($1)", [owner.id]);
await su("update public.customers set full_name = 'רחל' where phone = '+972501111111'");
const customerOf = async (u) => (await su("select c.id from public.customers c join auth.users a on '+' || a.phone = c.phone where a.id = $1", [u.id]))[0].id;

const WORDING = "שלחו לי תזכורת ב-SMS אם לא סיימתי להזמין. אפשר להסיר בכל רגע.";
const consent = (u, granted = true) => run(u, "select public.set_consent('cart_reminders', $1, $2, 'sms', 'wizard')", [granted, WORDING]);
const draft = JSON.stringify({ category: "designer", size: "d20", base: "vanilla", cream: null, colors: ["blush"], date: "2026-10-20" });
const save = (u, details = draft, step = 2) => run(u, "select draft_id, is_new, remind_at from public.save_cart_draft($1::jsonb, $2::smallint, 'designer')", [details, step]);
const claim = async (id, at) => (await run("service", "select action, not_before, reason, message_id, phone, customer_name, channel from public.claim_cart_reminder($1, $2)", [id, at]))[0];
// set a draft's clock: when it was started and last touched
const touch = (id, at, created = at) => su("update public.cart_drafts set updated_at = $2, created_at = $3 where id = $1", [id, at, created]);

console.log("\nsaving a draft");
await fails(null, "select * from public.save_cart_draft('{}'::jsonb)", [], /permission denied/, "a visitor who isn't signed in can't save a draft");
const [first] = await save(rachel);
ok(first.is_new === true, "Rachel's first save starts a draft (the server schedules the reminder)");
ok(new Date(first.remind_at) - Date.now() > 119 * 60e3, "…due 2 hours after the save");
const [second] = await save(rachel, draft, 3);
ok(second.is_new === false && second.draft_id === first.draft_id, "the next save updates the same draft (no second reminder)");
ok((await su("select count(*)::int n from public.cart_drafts where status = 'open'"))[0].n === 1, "one open draft per customer");
await fails(rachel, "update public.cart_drafts set status = 'submitted'", [], /permission denied/, "a customer can't change a draft directly");
await fails(rachel, "insert into public.cart_drafts (customer_id) select id from public.customers", [], /permission denied/, "…or write one");
ok((await run(rachel, "select * from public.cart_drafts")).length === 1, "Rachel sees her draft");
ok((await run(dana, "select * from public.cart_drafts")).length === 0, "Dana doesn't");
ok((await run(owner, "select * from public.cart_drafts")).length === 1, "the owner does");
await fails(rachel, "select * from public.claim_cart_reminder(gen_random_uuid())", [], /permission denied/, "only the server can claim a reminder");
await fails(rachel, "select public.save_cart_draft($1::jsonb)", [JSON.stringify({ notes: "א".repeat(20000) })], /check constraint/, "a draft over 16 KB is refused");

console.log("\nthe reminder, 2 hours after the last change (Monday 5.10, Israel time)");
const id = first.draft_id;
await touch(id, "2026-10-05T09:00:00Z"); // 12:00 in Israel
let c = await claim(id, "2026-10-05T10:30:00Z");
ok(c.action === "wait" && c.reason === "active" && iso(c.not_before) === "2026-10-05T11:00:00.000Z", "13:30, still inside the 2 hours: wait until 14:00");
c = await claim(id, "2026-10-05T11:00:00Z");
ok(c.action === "stop" && c.reason === "no_consent", "14:00, but Rachel never agreed to reminders: nothing is sent");
ok((await su("select status, closed_reason from public.cart_drafts where id = $1", [id]))[0].closed_reason === "no_consent", "…and the draft is closed for good");

await consent(rachel);
const [again] = await save(rachel);
ok(again.is_new === true, "after she agrees, her next change starts a new draft");
await touch(again.draft_id, "2026-10-05T09:00:00Z");
c = await claim(again.draft_id, "2026-10-05T11:00:00Z");
ok(c.action === "send" && c.phone === "+972501111111" && c.customer_name === "רחל" && c.channel === "sms", "14:00: send, by SMS as she chose, to her confirmed number");
const msg = (await su("select kind, cart_draft_id, celebration_id, status from public.reminder_messages where id = $1", [c.message_id]))[0];
ok(msg.kind === "cart" && msg.cart_draft_id === again.draft_id && msg.celebration_id === null && msg.status === "queued", "the message is queued in the shared outbox");
c = await claim(again.draft_id, "2026-10-05T11:05:00Z");
ok(c.action === "stop" && c.reason === "reminded", "QStash delivering twice sends nothing twice");

console.log("\nnot more than once a week");
const [third] = await save(rachel);
await touch(third.draft_id, "2026-10-07T07:00:00Z");
c = await claim(third.draft_id, "2026-10-07T09:00:00Z");
ok(c.action === "stop" && c.reason === "recently_reminded", "Wednesday, another abandoned draft: no second reminder within 7 days");

console.log("\nquiet hours and Shabbat");
const next = async (at) => iso((await su("select private.next_send_time($1) as t", [at]))[0].t);
ok((await next("2026-10-05T19:30:00Z")) === "2026-10-06T06:00:00.000Z", "Monday 22:30 → Tuesday 09:00");
ok((await next("2026-10-08T05:00:00Z")) === "2026-10-08T06:00:00.000Z", "Thursday 08:00 → 09:00");
ok((await next("2026-10-09T07:00:00Z")) === "2026-10-09T07:00:00.000Z", "Friday 10:00 → now");
ok((await next("2026-10-09T12:00:00Z")) === "2026-10-11T06:00:00.000Z", "Friday 15:00 → Sunday 09:00");
ok((await next("2026-10-10T09:00:00Z")) === "2026-10-11T06:00:00.000Z", "Saturday noon → Sunday 09:00");
ok((await next("2026-10-25T06:00:00Z")) === "2026-10-25T07:00:00.000Z", "after the clocks go back (25.10): 08:00 → 09:00, winter time");

await consent(yossi);
const [y] = await save(yossi);
await touch(y.draft_id, "2026-10-09T09:30:00Z"); // Friday 12:30
c = await claim(y.draft_id, "2026-10-09T11:30:00Z");
ok(c.action === "wait" && c.reason === "quiet_hours" && iso(c.not_before) === "2026-10-11T06:00:00.000Z", "Yossi's draft falls due Friday 14:30: wait until Sunday 09:00");
c = await claim(y.draft_id, "2026-10-11T06:00:00Z");
ok(c.action === "send", "Sunday 09:00: sent");

console.log("\nwhat cancels a reminder");
await consent(tamar);
const [t] = await save(tamar);
await run(tamar, "select * from public.submit_order('designer', $1::jsonb, '2026-10-20', 42000)", [draft]);
ok((await su("select status from public.cart_drafts where id = $1", [t.draft_id]))[0].status === "submitted", "sending the order closes the draft");
c = await claim(t.draft_id, "2026-10-05T11:00:00Z");
ok(c.action === "stop" && c.reason === "submitted", "…so the reminder on its way finds nothing to send");
await su("update public.orders set created_at = '2026-10-05T08:30:00Z' where customer_id = $1", [await customerOf(tamar)]);
const [late] = await save(tamar);
await touch(late.draft_id, "2026-10-05T08:31:00Z");
c = await claim(late.draft_id, "2026-10-05T11:00:00Z");
ok(late.is_new && c.action === "stop" && c.reason === "ordered", "an autosave that lands just after the order opens a new draft, but no reminder follows");

await consent(noa);
const [n1] = await save(noa);
await touch(n1.draft_id, "2026-10-05T08:00:00Z");
await run(owner, "insert into public.orders (customer_id, source, created_at) values ($1, 'whatsapp', '2026-10-05T10:00:00Z')", [await customerOf(noa)]);
c = await claim(n1.draft_id, "2026-10-05T11:00:00Z");
ok(c.action === "stop" && c.reason === "ordered", "Noa ordered on WhatsApp instead (logged by the owner): no reminder");

const [n2] = await save(noa, JSON.stringify({ category: "birthday", date: "2026-10-06" }));
await touch(n2.draft_id, "2026-10-06T06:00:00Z", "2026-10-06T06:00:00Z");
await su("update public.orders set created_at = '2026-10-01' where customer_id = $1", [await customerOf(noa)]);
c = await claim(n2.draft_id, "2026-10-07T08:00:00Z");
ok(c.action === "stop" && c.reason === "date_passed", "the party date in the draft has passed: no reminder");

const [n3] = await save(noa);
await touch(n3.draft_id, "2026-10-01T08:00:00Z");
c = await claim(n3.draft_id, "2026-10-05T08:00:00Z");
ok(c.action === "stop" && c.reason === "stale", "a draft untouched for 4 days: too late to remind");

const [n4] = await save(noa);
await run(noa, "select public.dismiss_cart_draft()");
c = await claim(n4.draft_id, "2026-10-05T11:00:00Z");
ok(c.action === "stop" && c.reason === "dismissed", "starting over in the wizard drops the draft and its reminder");
ok((await claim("00000000-0000-0000-0000-00000000abcd", "2026-10-05T11:00:00Z")).reason === "missing", "an unknown draft: stop");

await run(noa, "select public.set_consent('cart_reminders', false, 'השיבה \"הסר\" להודעה', 'sms', 'reply')");
const [n5] = await save(noa);
await touch(n5.draft_id, "2026-10-12T07:00:00Z");
c = await claim(n5.draft_id, "2026-10-12T09:00:00Z");
ok(c.action === "stop" && c.reason === "no_consent", "after Noa replies \"הסר\": no reminders");

console.log("\nsettings and the shared outbox");
await run(owner, "update public.loyalty_settings set cart_reminder_after_minutes = 180, friday_messages_until = '13:00'");
const [d4] = await save(dana);
ok(new Date(d4.remind_at) - Date.now() > 179 * 60e3, "the owner sets 3 hours instead of 2, and new drafts follow it");
await fails(owner, "update public.loyalty_settings set messages_from = '22:00'", [], /message_hours/, "hours that end before they start are refused");
await fails(owner, "update public.loyalty_settings set cart_reminder_after_minutes = 5", [], /check constraint/, "…as is a reminder 5 minutes after");
await fails("service", "insert into public.reminder_messages (kind, channel) values ('cart', 'sms')", [], /reminder_target/, "a cart message must name its draft");

const danaId = await customerOf(dana);
await su("insert into public.celebrations (customer_id, celebrant_name, event_month, event_day, event_year, remind) values ($1, 'אורי', 11, 5, 2026, true)", [danaId]);
await su("insert into public.consent_events (customer_id, purpose, granted, wording, source) values ($1, 'anniversary_reminders', true, 'תזכירו לי בשנה הבאה', 'wizard')", [danaId]);
const due = await run("service", "select * from public.enqueue_due_reminders('2027-10-15')");
ok(due.length === 1 && due[0].celebrant_name === "אורי", "the anniversary reminders still queue as before");
ok((await su("select kind from public.reminder_messages where id = $1", [due[0].message_id]))[0].kind === "anniversary", "…as kind 'anniversary'");

console.log(`\nall ${passed} checks passed`);
