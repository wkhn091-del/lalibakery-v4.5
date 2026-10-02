// Runs the VIP club migration on a real Postgres (PGlite) set up like Supabase (anon, authenticated,
// service_role, auth.users, auth.uid()), then plays the whole business through it: who can see
// what, orders, referrals, the punch card, credit, expiry and anniversary reminders.
//
//   npm i -D @electric-sql/pglite
//   node supabase/tests/vip_club.test.mjs
import { readdirSync, readFileSync } from "node:fs";
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
// every migration, in order: the club must keep working as later ones change the tables around it
const dir = new URL("../migrations/", import.meta.url);
for (const file of readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()) await db.exec(readFileSync(new URL(file, dir), "utf8"));
console.log("migration applied");

// ── a Supabase-like session: role + the JWT's sub ──
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

// ── people: Supabase stores the confirmed phone without "+" ──
const user = (n) => ({ id: `00000000-0000-0000-0000-00000000000${n}` });
const owner = user(1), rachel = user(2), dana = user(3), yossi = user(4), tamar = user(5);
await db.exec("set role supabase_auth_admin");
for (const [u, phone] of [[owner, "972508739090"], [rachel, "972501111111"], [dana, "972502222222"]])
  await db.query("insert into auth.users (id, phone, phone_confirmed_at) values ($1, $2, now())", [u.id, phone]);
await db.exec("reset role");
await su("insert into public.staff (user_id) values ($1)", [owner.id]);

console.log("\nsign-in creates the customer");
const custs = await su("select phone, user_id from public.customers order by phone");
ok(custs.length === 3 && custs.every((c) => c.phone.startsWith("+972") && c.user_id), "three verified phones → three linked customers (E.164 with +)");

console.log("\nwho can see and do what");
await fails(null, "select * from public.customers", [], /permission denied/, "a visitor who isn't signed in reads nothing");
ok((await run(rachel, "select * from public.customers")).length === 1, "Rachel sees only her own customer row");
await run(rachel, "update public.customers set full_name = 'רחל כהן'");
ok((await su("select full_name from public.customers where phone = '+972501111111'"))[0].full_name === "רחל כהן", "Rachel can change her name");
await fails(rachel, "update public.customers set phone = '+972509999999'", [], /permission denied/, "…but not her phone");
await fails(rachel, "insert into public.credit_ledger (customer_id, amount_agorot, reason) select id, 100000, 'adjust' from public.customers", [], /row-level security/, "a customer can't write herself credit");
await fails(rachel, "select * from public.enqueue_due_reminders()", [], /permission denied/, "a customer can't run the reminder job");
await fails(rachel, "select public.complete_order(gen_random_uuid(), 1000, 0)", [], /staff only/, "a customer can't complete orders");

console.log("\nthe wizard sends an order (with the celebration)");
const consent = "תזכירו לי בשנה הבאה, 3 שבועות לפני, בוואטסאפ. אפשר לבטל בכל רגע.";
const details = JSON.stringify({ category: { id: "birthday", title: "עוגות יום הולדת מעוצבות" }, size: { id: "d22", label: "קוטר 22 ס״מ" }, message: "מזל טוב נועם, 6" });
const [o1] = await run(rachel, "select * from public.submit_order('birthday', $1::jsonb, '2026-10-19', 41000, $2::jsonb, $3)", [
  details, JSON.stringify({ name: "נועם", occasion: "birthday", age: 6, remind: true }), consent]);
ok(Number(o1.order_number) === 1001, `order #${o1.order_number} saved`);
const cel = (await su("select * from public.celebrations"))[0];
ok(cel.celebrant_name === "נועם" && cel.event_month === 10 && cel.event_day === 19 && cel.age_turning === 6 && cel.remind, "celebration saved: נועם, 19.10, turning 6, remind on");
ok((await su("select * from public.consent_events where granted and purpose = 'anniversary_reminders'")).length === 1, "consent logged with its wording");
await fails(rachel, "select * from public.submit_order('birthday', '{}', '2026-10-20', null, $1::jsonb, null)", [JSON.stringify({ name: "מיקה", remind: true })], /consent wording/, "a reminder without consent wording is refused");
await fails(rachel, "select * from public.submit_order('birthday', '{}', '2020-01-01')", [], /date has passed/, "a date in the past is refused");
await fails(rachel, "select * from public.submit_order('birthday', '{}', '2026-12-01', null, $1::jsonb, $2)", [JSON.stringify({ name: "איתי", occasion: "bar_mitzvah", remind: true }), consent], /check constraint/, "no yearly reminder for a bar mitzvah");
ok((await run(dana, "select * from public.orders")).length === 0, "Dana can't see Rachel's order");
ok((await run(owner, "select * from public.orders")).length >= 1, "the owner sees it");
await fails(owner, "update public.orders set status = 'completed', final_price_agorot = 1, completed_at = now()", [], /complete_order/, "even the owner can't mark 'completed' by hand");
await run(owner, "update public.orders set status = 'confirmed', confirmed_at = now() where number = 1001");
ok((await su("select status from public.orders where number = 1001"))[0].status === "confirmed", "the owner confirms it");

console.log("\nreferral: Rachel shares, Dana buys");
const code = (await su("select referral_code from public.customers where phone = '+972501111111'"))[0].referral_code;
ok((await run(dana, "select public.claim_referral($1) as r", [code.toUpperCase()]))[0].r === true, `Dana arrives with Rachel's link (/r/${code})`);
ok((await run(dana, "select public.claim_referral($1) as r", [code]))[0].r === false, "a second claim does nothing");
ok((await run(rachel, "select public.claim_referral($1) as r", [code]))[0].r === false, "Rachel can't refer herself");
const [od] = await run(dana, "select * from public.submit_order('designer', '{}', '2026-11-02', 38000)");
const res1 = (await run(owner, "select public.complete_order($1, 20000, 0) as r", [od.order_id]))[0].r;
ok(res1.referrer_rewarded === true && res1.stamps === 1, "Dana's first purchase (200 ₪): her first stamp, and Rachel is paid");
ok((await run(rachel, "select credit_agorot from public.customer_wallet"))[0].credit_agorot === 5000, "Rachel's wallet: 50 ₪ credit");
await fails(owner, "select public.complete_order($1, 20000, 0)", [od.order_id], /already completed/, "completing twice pays nothing twice");

console.log("\nan order that came by phone, before the customer ever signed in");
const yossiId = (await run(owner, "select public.staff_upsert_customer('+972503333333', 'יוסי') as id"))[0].id;
const [py] = await run(owner, "insert into public.orders (customer_id, source, needed_date) values ($1, 'phone', '2026-10-30') returning id", [yossiId]);
await run(owner, "select public.complete_order($1, 25000, 0)", [py.id]);
await su("insert into auth.users (id, phone, phone_confirmed_at) values ($1, '972503333333', now())", [yossi.id]);
ok((await run(yossi, "select * from public.orders")).length === 1, "Yossi signs in later and finds his phone order");
ok((await run(yossi, "select stamps from public.customer_wallet"))[0].stamps === 1, "…with its stamp");
ok((await run(yossi, "select public.claim_referral($1) as r", [code]))[0].r === false, "an existing buyer can't be claimed as a referral");

console.log("\nthe punch card: 6 stamps → 100 ₪");
await run(owner, "select public.complete_order($1, 32000, 0)", [o1.order_id]);
const rachelCustomer = (await su("select id from public.customers where phone = '+972501111111'"))[0].id;
const newOrder = async () => (await run(owner, "insert into public.orders (customer_id, source) values ($1, 'admin') returning id", [rachelCustomer]))[0].id;
const small = (await run(owner, "select public.complete_order($1, 9000, 0) as r", [await newOrder()]))[0].r;
ok(small.stamps === undefined, "a 90 ₪ order earns no stamp (minimum 150 ₪)");
let last;
for (let i = 0; i < 5; i++) last = (await run(owner, "select public.complete_order($1, 18000, 0) as r", [await newOrder()]))[0].r;
ok(last.card_completed === true && last.stamps === 0, "the 6th stamp completes the card, and it starts again");
const w = (await run(rachel, "select * from public.customer_wallet"))[0];
ok(w.stamps === 0 && w.credit_agorot === 15000 && w.completed_orders === 7, "Rachel: 0/6 stamps, 150 ₪ credit (50 referral + 100 card), 7 purchases");

console.log("\nspending credit");
await fails(owner, "select public.complete_order($1, 20000, 16000)", [await newOrder()], /has 15000 agorot/, "can't spend more than the balance");
await fails(owner, "select public.complete_order($1, 3000, 5000)", [await newOrder()], /price and the credit/, "can't spend more than the price");
await run(owner, "select public.complete_order($1, 20000, 5000)", [await newOrder()]);
ok((await run(rachel, "select credit_agorot from public.customer_wallet"))[0].credit_agorot === 10000, "50 ₪ used on an order: 100 ₪ left");

console.log("\ncancelling");
const [oc] = await run(rachel, "select * from public.submit_order('number', '{}', '2026-12-10')");
await fails(dana, "select public.cancel_order($1)", [oc.order_id], /not allowed/, "Dana can't cancel Rachel's order");
await run(rachel, "select public.cancel_order($1)", [oc.order_id]);
ok((await su("select status from public.orders where id = $1", [oc.order_id]))[0].status === "cancelled", "Rachel withdraws her own new order");
await fails(rachel, "select public.cancel_order($1)", [od.order_id], /not allowed/, "…but not one that's already done");

console.log("\ncredit expires first-in, first-out");
await su("insert into auth.users (id, phone, phone_confirmed_at) values ($1, '972505555555', now())", [tamar.id]);
const tamarId = (await su("select id from public.customers where phone = '+972505555555'"))[0].id;
await su(`insert into public.credit_ledger (customer_id, amount_agorot, reason, expires_at, created_at) values
  ($1, 5000, 'adjust', '2027-01-01', '2026-01-01'), ($1, 10000, 'adjust', '2027-03-01', '2026-02-01')`, [tamarId]);
await su("insert into public.credit_ledger (customer_id, amount_agorot, reason, created_at) values ($1, -7000, 'redeem', '2026-06-01')", [tamarId]);
ok((await run("service", "select public.expire_credits('2027-01-02', null) as n"))[0].n === 0, "1 Jan: the first 50 ₪ were already spent, nothing expires");
ok((await run("service", "select public.expire_credits('2027-03-02', null) as n"))[0].n === 1, "1 Mar: what's left of the second credit expires");
ok(Number((await su("select sum(amount_agorot) s from public.credit_ledger where customer_id = $1", [tamarId]))[0].s) === 0 &&
   (await su("select amount_agorot from public.credit_ledger where customer_id = $1 and reason = 'expire'", [tamarId]))[0].amount_agorot === -8000,
   "80 ₪ expired (150 earned − 70 spent), balance 0");
ok((await run("service", "select public.expire_credits('2027-03-03', null) as n"))[0].n === 0, "running it again changes nothing");

console.log("\nanniversary reminders");
const due = (day) => run("service", "select * from public.enqueue_due_reminders($1)", [day]);
ok((await due("2026-09-28")).length === 0, "this year's party (the one just ordered) gets no reminder");
const r1 = await run("service", "select celebrant_name, age_turning, phone, occurrence_date::text as day from public.enqueue_due_reminders('2027-09-28')");
ok(r1.length === 1 && r1[0].celebrant_name === "נועם" && r1[0].age_turning === 7 && r1[0].phone === "+972501111111" && r1[0].day === "2027-10-19",
   "28.9.2027, three weeks before 19.10.2027: one reminder, to Rachel's phone, נועם turning 7");
ok((await due("2027-09-28")).length === 0 && (await due("2027-09-29")).length === 0, "the job running twice, or a day late, sends nothing twice");
// Dana: a celebration she already ordered for → no nagging
const danaId = (await su("select id from public.customers where phone = '+972502222222'"))[0].id;
await su("insert into public.celebrations (customer_id, celebrant_name, event_month, event_day, event_year, remind) values ($1, 'אורי', 11, 5, 2026, true)", [danaId]);
await su("insert into public.consent_events (customer_id, purpose, granted, wording, source) values ($1, 'anniversary_reminders', true, $2, 'wizard')", [danaId, consent]);
await su("insert into public.orders (customer_id, needed_date) values ($1, '2027-11-04')", [danaId]);
ok((await due("2027-10-15")).length === 0, "Dana already ordered for אורי's birthday: no reminder");
// 29 February
await su("insert into public.celebrations (customer_id, celebrant_name, event_month, event_day, event_year, remind) values ($1, 'ליה', 2, 29, 2024, true)", [tamarId]);
await su("insert into public.consent_events (customer_id, purpose, granted, wording, source) values ($1, 'anniversary_reminders', true, $2, 'wizard')", [tamarId, consent]);
const feb = await due("2027-02-07");
ok(feb.length === 1 && feb[0].celebrant_name === "ליה", "born on 29 Feb: in 2027 the reminder goes three weeks before 28 Feb");
// opting out
await run(rachel, "select public.set_consent('anniversary_reminders', false, 'ביטול תזכורות מהחשבון')");
ok((await due("2028-09-28")).length === 0, "after Rachel opts out: no reminder in 2028");

console.log("\nprivacy of the celebrations");
ok((await run(dana, "select * from public.celebrations")).length === 1, "Dana sees only her own celebration, not Rachel's");
await run(rachel, "delete from public.celebrations where celebrant_name = 'נועם'");
ok((await su("select count(*)::int n from public.celebrations where celebrant_name = 'נועם'"))[0].n === 0, "Rachel can delete a celebration she saved");

console.log("\nthe owner's reminder list, and nobody else's");
ok((await run(owner, "select * from public.reminder_messages")).length === 1, "the owner sees the queued message (נועם's left with his deleted celebration)");
ok((await run(rachel, "select * from public.reminder_messages")).length === 0, "customers don't");

console.log(`\nall ${passed} checks passed`);
