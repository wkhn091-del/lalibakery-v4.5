// Runs every migration on a real Postgres (PGlite) set up like Supabase, then plays the shop's
// checkout through them: who may call what, orders that must add up, the day's capacity and the
// 30-minute hold, coupons, payments (the gateway's and the owner's), builder quotes, the paid
// order's guard, and the 24-month address rule.
//
//   node supabase/tests/shop.test.mjs      (npm run test:db runs every database test)
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
const dir = new URL("../migrations/", import.meta.url);
for (const file of readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()) await db.exec(readFileSync(new URL(file, dir), "utf8"));
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

// a day n days from today, Israel time (YYYY-MM-DD)
const day = (n) => new Date(Date.now() + n * 86400e3).toLocaleDateString("en-CA", { timeZone: "Asia/Jerusalem" });

// ── people ──
const owner = { id: "00000000-0000-0000-0000-000000000001" };
const rachel = { id: "00000000-0000-0000-0000-000000000002" };
await su("insert into auth.users (id, phone, phone_confirmed_at) values ($1, '972508739090', now()), ($2, '972501111111', now())", [owner.id, rachel.id]);
await su("insert into public.staff (user_id) values ($1)", [owner.id]);
await su("update public.customers set full_name = 'רחל' where phone = '+972501111111'");

// ── the checkout, as the server calls it ──
const PLACE = `select * from public.place_order(
  p_kind => $1, p_phone => $2, p_name => $3, p_email => $4, p_needed_date => $5::date, p_capacity => $6,
  p_fulfilment => $7::public.fulfilment, p_delivery => $8::jsonb, p_window_from => $9::time, p_window_to => $10::time,
  p_items => $11::jsonb, p_subtotal_agorot => $12, p_discount_agorot => $13, p_discount_source => $14, p_coupon_id => $15::uuid,
  p_shipping_agorot => $16, p_total_agorot => $17, p_payment_method => $18::public.payment_method,
  p_category => $19, p_details => $20::jsonb, p_estimated_price_agorot => $21)`;
const cake = { product_id: "p-rachel", variant_id: "v20", kind: "single", title: "עוגת רחל", variant_label: "קוטר 20", quantity: 1, unit_price_agorot: 24990 };
const cupcakes = { product_id: "p-cupcakes", variant_id: "v12", kind: "single", title: "קאפקייקס", variant_label: "מארז 12", quantity: 2, unit_price_agorot: 9000 };
const netanya = { zone: "netanya", city: "נתניה", address: "הרצל 10, דירה 4", notes: "קומה 2", recipient_name: "דנה", recipient_phone: "+972502222222" };

function order(over = {}) {
  const o = {
    kind: "catalog", phone: "+972503333333", name: "יוסי", email: "Yossi@Example.com", date: day(10), capacity: 5,
    fulfilment: "delivery", delivery: netanya, from: "09:00", to: "12:00",
    items: [cake, cupcakes], subtotal: 42990, discount: 0, source: null, coupon: null, shipping: 0, total: 42990,
    method: "online", category: null, details: {}, estimated: null, ...over,
  };
  return [o.kind, o.phone, o.name, o.email, o.date, o.capacity, o.fulfilment, o.delivery && JSON.stringify(o.delivery), o.from, o.to,
    JSON.stringify(o.items), o.subtotal, o.discount, o.source, o.coupon, o.shipping, o.total, o.method, o.category, JSON.stringify(o.details), o.estimated];
}
const place = async (over) => (await run("service", PLACE, order(over)))[0];
const orderRow = async (id) => (await su("select * from public.orders where id = $1", [id]))[0];

console.log("\nwho may place an order");
await fails(null, PLACE, order(), /permission denied/, "a visitor can't call the checkout directly");
await fails(rachel, PLACE, order(), /permission denied/, "…nor a signed-in customer: only the server");
await fails(rachel, "select * from public.record_payment('grow', 'e1', gen_random_uuid(), true, 100)", [], /permission denied/, "only the server records gateway payments");
await fails(rachel, "select * from public.booked_counts(current_date, current_date + 7)", [], /permission denied/, "…and reads the calendar's counts");
await fails(null, "select * from public.orders", [], /permission denied/, "visitors read no orders");

console.log("\na shop order, paid online");
const a = await place();
ok(/^LB-[A-HJ-NP-Z2-9]{8}$/.test(a.order_code), `it gets a public code (${a.order_code}), not the running number`);
let row = await orderRow(a.order_id);
ok(row.status === "pending_payment" && row.payment_status === "pending", "it waits for its payment");
ok(Math.abs(new Date(a.held_until) - Date.now() - 30 * 60e3) < 60e3, "…holding its day for 30 minutes");
ok(row.total_agorot === 42990 && row.final_price_agorot === 42990 && row.kind === "catalog" && row.source === "shop", "its amounts are stored in agorot");
ok(row.phone_verified === false && row.contact_email === "yossi@example.com", "a guest's phone is marked unproven; the email is kept lower-case");
const lines = await su("select line_no, title, quantity, line_total_agorot from public.order_items where order_id = $1 order by line_no", [a.order_id]);
ok(lines.length === 2 && lines[1].line_total_agorot === 18000 && lines[0].title === "עוגת רחל", "its lines keep the names and prices the customer saw");

console.log("\norders that don't add up are refused");
await fails("service", PLACE, order({ subtotal: 40000, total: 40000 }), /amounts_mismatch/, "lines that don't sum to the subtotal");
await fails("service", PLACE, order({ shipping: 2000 }), /amounts_mismatch/, "a total that isn't subtotal − discount + shipping");
await fails("service", PLACE, order({ discount: 50000, source: "launch_promo", total: -7010, method: "phone" }), /amounts_mismatch/, "a discount bigger than the order");
await fails("service", PLACE, order({ items: [{ ...cake, quantity: 0 }], subtotal: 0, total: 0 }), /bad_order/, "a line with no quantity");
await fails("service", PLACE, order({ items: [], subtotal: 0, total: 0 }), /bad_order/, "an empty cart");
await fails("service", PLACE, order({ date: day(-1) }), /date_passed/, "a day that has passed");
await fails("service", PLACE, order({ fulfilment: "delivery", delivery: { city: "נתניה" } }), /order_delivery/, "a delivery without an address");
await fails("service", PLACE, order({ fulfilment: "pickup" }), /order_delivery/, "a pickup with an address");
await fails("service", PLACE, order({ from: "12:00", to: "09:00" }), /order_window/, "a window that ends before it starts");
await fails("service", PLACE, order({ discount: 1000, source: null, total: 41990 }), /order_discount/, "a discount without a reason");

console.log("\na pickup, paid in person");
const b = await place({ phone: "+972501111111", name: "מישהי אחרת", fulfilment: "pickup", delivery: null, method: "in_person", items: [cake], subtotal: 24990, total: 24990 });
row = await orderRow(b.order_id);
ok(row.status === "confirmed" && row.payment_status === "unpaid" && b.held_until === null, "confirmed at once, unpaid until the owner marks it");
ok((await su("select full_name from public.customers where phone = '+972501111111'"))[0].full_name === "רחל", "a guest's name never replaces the customer's own");
ok(row.contact_name === "מישהי אחרת", "…the order keeps the name typed at checkout");
ok((await run(rachel, "select id from public.orders")).some((o) => o.id === b.order_id), "Rachel (signed in) sees the order placed with her number");
ok((await run(rachel, "select * from public.order_items")).length === 1, "…and its lines, and nobody else's");

console.log("\nthe day's capacity");
const D = day(14);
const c1 = await place({ date: D, capacity: 2, phone: "+972504444441" });
await place({ date: D, capacity: 2, phone: "+972504444442", method: "phone" });
await fails("service", PLACE, order({ date: D, capacity: 2, phone: "+972504444443" }), /date_full/, "a third order on a day of 2 is refused");
await fails("service", PLACE, order({ date: day(15), capacity: 0 }), /date_full/, "a closed day (capacity 0) takes nothing");
await su("update public.orders set slot_held_until = now() - interval '1 minute' where id = $1", [c1.order_id]);
const c3 = await place({ date: D, capacity: 2, phone: "+972504444443" });
ok(!!c3.order_id, "an unpaid hold that ran out frees its place at once (before the job tidies it)");
const builderOnD = await place({ kind: "builder", date: D, capacity: 3, phone: "+972504444444", fulfilment: null, delivery: null, from: null, to: null, items: [], subtotal: null, total: null, shipping: null, method: null, category: "designer", details: { size: "d20" }, estimated: 42000 });
ok(!!builderOnD.order_id, "a builder request takes a place too (the owner's daily limit counts every cake)");
const counts = await run("service", "select day, booked from public.booked_counts($1::date, $1::date)", [D]);
ok(counts.length === 1 && counts[0].booked === 3, "the calendar counts 3 for that day (the expired hold doesn't count)");
ok((await run("service", "select public.expire_pending_orders()"))[0].expire_pending_orders === 1, "the job cancels the order whose 30 minutes ran out");
row = await orderRow(c1.order_id);
ok(row.status === "cancelled" && row.cancelled_reason === "payment_timeout" && row.payment_status === "unpaid", "…as a payment timeout");

console.log("\ncoupons");
const HASH = "a".repeat(64);
await fails(rachel, "insert into public.coupons (code_hash, code_hint, kind, value) values ($1, 'WE..10', 'percent', 10)", [HASH], /row-level security/, "a customer can't create a coupon");
const [coupon] = await run(owner, "insert into public.coupons (code_hash, code_hint, kind, value, max_redemptions, min_subtotal_agorot) values ($1, 'WE..10', 'percent', 10, 2, 20000) returning id", [HASH]);
ok((await run(rachel, "select * from public.coupons")).length === 0, "a customer sees no coupons (codes are checked by the server)");
await fails(owner, "delete from public.coupons", [], /permission denied/, "a coupon is switched off, never deleted");
await fails(owner, "insert into public.coupons (code_hash, code_hint, kind, value) values ($1, 'X', 'percent', 80)", ["b".repeat(64)], /check constraint/, "no coupon above 50%");
const withCoupon = (over) => ({ discount: 4299, source: "coupon", coupon: coupon.id, total: 42990 - 4299, ...over });
const k1 = await place(withCoupon({ phone: "+972505555551" }));
ok((await su("select amount_agorot from public.coupon_redemptions where order_id = $1", [k1.order_id]))[0].amount_agorot === 4299, "10% off: the redemption is recorded with the order");
await fails("service", PLACE, order(withCoupon({ phone: "+972505555551", date: day(11) })), /coupon_invalid/, "once per customer");
await fails("service", PLACE, order(withCoupon({ phone: "+972505555552", discount: 5000, total: 37990 })), /coupon_invalid/, "more than 10% off is refused");
await fails("service", PLACE, order(withCoupon({ phone: "+972505555552", items: [{ ...cupcakes, quantity: 1 }], subtotal: 9000, discount: 900, total: 8100 })), /coupon_invalid/, "below the coupon's minimum order");
await fails("service", PLACE, order({ phone: "+972505555552", discount: 4299, source: "coupon", total: 38691 }), /coupon_invalid/, "a coupon discount without a coupon");
await place(withCoupon({ phone: "+972505555552" }));
await fails("service", PLACE, order(withCoupon({ phone: "+972505555553" })), /coupon_invalid/, "used up after 2 redemptions");
await run(owner, "select public.cancel_order($1)", [k1.order_id]);
ok(!!(await place(withCoupon({ phone: "+972505555553" }))).order_id, "a cancelled order gives its redemption back");
await run(owner, "update public.coupons set active = false where id = $1", [coupon.id]);
await su("update public.coupons set max_redemptions = null where id = $1", [coupon.id]);
await fails("service", PLACE, order(withCoupon({ phone: "+972505555554" })), /coupon_invalid/, "a coupon switched off");
await run(owner, "update public.coupons set active = true, ends_at = now() - interval '1 second', starts_at = now() - interval '1 day' where id = $1", [coupon.id]);
await fails("service", PLACE, order(withCoupon({ phone: "+972505555554" })), /coupon_invalid/, "an expired coupon");

console.log("\nthe gateway's payment notification");
const pay = async (event, orderId, amount, succeeded = true, txn = `txn-${event}`) =>
  (await run("service", "select * from public.record_payment('grow', $1, $2, $3, $4, $5, 'bit', '{}'::jsonb)", [event, orderId, succeeded, amount, txn]))[0];
let p = await pay("ev-fail", a.order_id, 42990, false);
ok(p.outcome === "failed" && (await orderRow(a.order_id)).status === "pending_payment", "a failed attempt is recorded; the order still waits");
p = await pay("ev-low", a.order_id, 100);
ok(p.outcome === "amount_mismatch" && (await orderRow(a.order_id)).payment_status === "pending", "the wrong amount doesn't pay the order");
p = await pay("ev-ok", a.order_id, 42990);
row = await orderRow(a.order_id);
ok(p.outcome === "paid" && p.order_code === a.order_code, "the right amount pays it");
ok(row.status === "confirmed" && row.payment_status === "paid" && row.grow_transaction_id === "txn-ev-ok" && row.slot_held_until === null, "…confirmed, with the gateway's transaction");
ok((await pay("ev-ok", a.order_id, 42990)).outcome === "duplicate", "the same notification twice changes nothing");
ok((await pay("ev-again", a.order_id, 42990)).outcome === "already_paid", "a second payment is flagged for a refund");
ok((await pay("ev-late", c1.order_id, 42990)).outcome === "paid_late" && (await orderRow(c1.order_id)).status === "confirmed", "paid after the hold ran out: confirmed, and flagged for the owner");
ok((await pay("ev-cancel", k1.order_id, 38691)).outcome === "after_cancel", "paid for an order the owner cancelled: flagged for a refund");
ok((await pay("ev-ghost", "00000000-0000-0000-0000-00000000dead", 100)).outcome === "unknown_order", "an unknown order");
ok((await su("select count(*)::int n from public.payment_events"))[0].n === 7, "every notification is in the trail, each once");

console.log("\nthe paid order's guard");
await fails(owner, "update public.orders set total_agorot = 100, subtotal_agorot = 100, final_price_agorot = 100 where id = $1", [a.order_id], /paid/, "a paid order's amounts can't change");
await fails(owner, "update public.orders set payment_status = 'unpaid', paid_at = null where id = $1", [a.order_id], /refunded/, "…nor go back to unpaid");
await fails(owner, "update public.orders set payment_status = 'paid', paid_at = now() where id = $1", [b.order_id], /record payments/, "the owner can't just set an order to paid");
await fails(owner, "update public.orders set public_code = 'LB-AAAAAAAA' where id = $1", [b.order_id], /never change/, "an order's code never changes");
await run(owner, "update public.orders set payment_status = 'refunded' where id = $1", [a.order_id]);
ok((await orderRow(a.order_id)).payment_status === "refunded", "a paid order can be marked refunded");

console.log("\npaid in person, marked by the owner");
await fails(rachel, "select public.staff_record_offline_payment($1, 'in_person')", [b.order_id], /staff only/, "only the owner marks payments");
await fails(owner, "select public.staff_record_offline_payment($1, 'online')", [b.order_id], /gateway/, "online payments come from the gateway");
await run(owner, "select public.staff_record_offline_payment($1, 'in_person')", [b.order_id]);
row = await orderRow(b.order_id);
ok(row.payment_status === "paid" && row.payment_method === "in_person", "marked paid, in person");
ok((await su("select recorded_by from public.payment_events where order_id = $1", [b.order_id]))[0].recorded_by === owner.id, "…and the trail says who marked it");
await fails(owner, "select public.staff_record_offline_payment($1, 'in_person')", [b.order_id], /can't be marked/, "…once");
const done = await run(owner, "select public.complete_order($1, 24990)", [b.order_id]);
ok(done[0].complete_order.stamps === 1, "completing a shop order still stamps the punch card");

console.log("\na builder request, quoted and paid");
const r = await place({ kind: "builder", phone: "+972506666666", name: "נועה", date: day(20), fulfilment: "pickup", delivery: null, items: [], subtotal: null, total: null, shipping: null, method: null, category: "birthday", details: { size: "d22", message: "מזל טוב" }, estimated: 38000 });
row = await orderRow(r.order_id);
ok(row.status === "requested" && row.total_agorot === null && row.estimated_price_agorot === 38000 && row.category === "birthday", "a request, with no price yet");
await fails("service", PLACE, order({ kind: "builder", method: null }), /bad_order/, "a request can't carry items or a price");
await fails(rachel, "select public.staff_quote_order($1, 45000)", [r.order_id], /staff only/, "only the owner quotes");
await run(owner, "select public.staff_quote_order($1, 45000, 0)", [r.order_id]);
row = await orderRow(r.order_id);
ok(row.status === "quoted" && row.total_agorot === 45000 && row.quoted_at, "the owner's price makes it quoted");
ok((await pay("ev-builder", r.order_id, 45000)).outcome === "paid" && (await orderRow(r.order_id)).status === "confirmed", "paid online: confirmed");
await fails(owner, "select public.staff_quote_order($1, 50000)", [r.order_id], /can't be quoted/, "a paid request can't be re-quoted");

console.log("\nlimits");
for (let i = 0; i < 4; i++) await place({ kind: "builder", phone: "+972507777777", date: null, fulfilment: null, delivery: null, from: null, to: null, items: [], subtotal: null, total: null, shipping: null, method: null, category: "number", details: {} });
await place({ phone: "+972507777777", date: day(30) });
await fails("service", PLACE, order({ phone: "+972507777777", date: day(31) }), /too_many_open_orders/, "5 open orders per phone at most");
await fails("service", PLACE, order({ phone: "0501234567" }), /customers_phone_check/, "phones are E.164 only");

console.log("\nthe 24-month address rule");
const old = await place({ phone: "+972508888888", date: day(40) });
await su("update public.orders set needed_date = current_date - interval '25 months' where id = $1", [old.order_id]);
const recent = await place({ phone: "+972508888889", date: day(41) });
await su("update public.orders set needed_date = current_date - interval '23 months' where id = $1", [recent.order_id]);
const purged = (await run("service", "select public.purge_old_addresses()"))[0].purge_old_addresses;
row = await orderRow(old.order_id);
ok(purged >= 1 && row.delivery_address === null && row.recipient_name === null && row.recipient_phone === null && row.delivery_notes === null, "a delivery from 25 months ago loses its address, notes and recipient");
ok(row.delivery_city === "נתניה" && row.address_purged_at, "…the city stays, and the order says when");
ok((await orderRow(recent.order_id)).delivery_address === "הרצל 10, דירה 4", "a delivery from 23 months ago keeps it");
ok((await run("service", "select public.purge_old_addresses()"))[0].purge_old_addresses === 0, "running the job again changes nothing");
await fails(rachel, "select public.purge_old_addresses()", [], /permission denied/, "only the server runs it");

console.log(`\nall ${passed} checks passed`);
