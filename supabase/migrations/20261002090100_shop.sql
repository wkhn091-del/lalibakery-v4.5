-- ═══════════════════════════════════════════════════════════════════════════════════════════
--  LaliBakery shop, part 2 of 2: the checkout. Shop orders at a fixed price, builder requests,
--  delivery or pickup, the day's capacity, coupons, payments, and the address retention rule.
--  Runs after 20261002090000_shop_enums.sql.
--
--  Principles
--   • The Next.js server is the only caller (service role): the checkout has no login in this
--     version. It prices the cart from the published CMS content (lib/pricing) and hands over the
--     result; the database refuses anything that doesn't add up (items to subtotal, subtotal less
--     discount plus shipping to total), a coupon that can't be used, and a day that's full.
--   • A day's capacity comes from the CMS (the owner's setting), so the server passes it in; the
--     count is the database's own, under a lock per date: two customers can't both take the last
--     place. An order paid online holds its place for 30 minutes while the customer pays.
--   • Money is integer agorot. A paid order's amounts never change; a payment is recorded only
--     through record_payment() (the gateway's notification, at most once per event) or
--     staff_record_offline_payment() (cash, Bit by phone...).
--   • The public face of an order is its code (LB-7KQ2M9XA), never the running number, which
--     would tell anyone how many orders the shop has. The guest order page also needs a signed
--     token (the server's, not stored here).
--   • A guest checkout doesn't prove the phone number: orders placed that way say so
--     (phone_verified = false), and never change the name on an existing customer.
--   • Retention: a delivery's full address (street, notes, recipient) is erased 24 months after
--     the delivery date; the city stays, for the owner's statistics.
-- ═══════════════════════════════════════════════════════════════════════════════════════════

-- ───────────────────────────────────────── types ────────────────────────────────────────────

create type public.fulfilment     as enum ('delivery', 'pickup');
-- online: the payment page (Grow: card, Bit, Apple Pay, Google Pay). The rest are arranged with
-- the owner and marked paid by her.
create type public.payment_method as enum ('online', 'whatsapp', 'phone', 'in_person');
create type public.payment_status as enum ('unpaid', 'pending', 'paid', 'refunded');

-- ───────────────────────────────────────── helpers ──────────────────────────────────────────

-- LB- and 8 characters without look-alikes (no 0/O, 1/I/L), from a strong random source
create function private.new_public_code() returns text
language sql volatile set search_path = '' as $$
  select 'LB-' || string_agg(substr('ABCDEFGHJKMNPQRSTUVWXYZ23456789', 1 + (get_byte(b, i) % 31), 1), '' order by i)
  from (select uuid_send(gen_random_uuid()) as b) r, generate_series(0, 7) as i
$$;

-- an order that counts: it takes a place on its day and uses its coupon
create function private.order_is_live(p_status public.order_status, p_held_until timestamptz) returns boolean
language sql stable set search_path = '' as $$
  select p_status in ('requested', 'quoted', 'confirmed', 'completed')
      or (p_status = 'pending_payment' and p_held_until > now())
$$;

-- ───────────────────────────────────────── coupons ──────────────────────────────────────────

-- The code itself is never stored: the server keeps its HMAC (with a secret pepper), so a leaked
-- table gives away no working code. code_hint is what the owner sees in her list.
create table public.coupons (
  id                  uuid primary key default gen_random_uuid(),
  code_hash           text not null unique check (code_hash ~ '^[0-9a-f]{64}$'),
  code_hint           text not null check (char_length(code_hint) between 1 and 12),
  label               text check (char_length(label) <= 80),            -- the owner's note, e.g. "Instagram, October"
  kind                text not null check (kind in ('percent', 'amount')),
  value               int  not null,                                     -- whole percent, or agorot
  min_subtotal_agorot int  not null default 0 check (min_subtotal_agorot between 0 and 10000000),
  starts_at           timestamptz,
  ends_at             timestamptz,
  max_redemptions     int check (max_redemptions > 0),                   -- null: no limit
  max_per_customer    int not null default 1 check (max_per_customer between 1 and 100),
  active              boolean not null default true,
  created_by          uuid references auth.users (id) on delete set null,
  created_at          timestamptz not null default now(),
  check ((kind = 'percent' and value between 1 and 50) or (kind = 'amount' and value between 100 and 100000)),
  check (starts_at is null or ends_at is null or ends_at > starts_at)
);

-- ───────────────────────────────────────── orders ───────────────────────────────────────────

alter table public.orders
  add column public_code      text unique default private.new_public_code(),
  add column kind             text not null default 'builder' check (kind in ('builder', 'catalog')),
  add column phone_verified   boolean not null default true,
  add column contact_name     text check (char_length(btrim(contact_name)) between 1 and 80),
  add column contact_email    text check (char_length(contact_email) <= 254 and contact_email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  add column fulfilment       public.fulfilment,
  add column delivery_zone    text check (char_length(delivery_zone) between 1 and 64),
  add column delivery_city    text check (char_length(btrim(delivery_city)) between 2 and 40),
  add column delivery_address text check (char_length(btrim(delivery_address)) between 3 and 200),
  add column delivery_notes   text check (char_length(delivery_notes) <= 300),
  add column recipient_name   text check (char_length(btrim(recipient_name)) between 1 and 80),
  add column recipient_phone  text check (recipient_phone ~ '^\+[1-9][0-9]{7,14}$'),
  add column window_from      time,
  add column window_to        time,
  add column subtotal_agorot  int check (subtotal_agorot >= 0),
  add column discount_agorot  int not null default 0 check (discount_agorot >= 0),
  add column discount_source  text check (discount_source in ('coupon', 'launch_promo')),
  add column coupon_id        uuid references public.coupons (id) on delete restrict,
  add column shipping_agorot  int check (shipping_agorot >= 0),
  add column total_agorot     int check (total_agorot >= 0),
  add column payment_method   public.payment_method,
  add column payment_status   public.payment_status not null default 'unpaid',
  add column grow_transaction_id text unique check (char_length(grow_transaction_id) <= 200),
  add column paid_at          timestamptz,
  add column quoted_at        timestamptz,
  add column slot_held_until  timestamptz,
  add column cancelled_reason text check (char_length(cancelled_reason) <= 40),
  add column address_purged_at timestamptz,
  -- money adds up
  add constraint order_amounts check (
    (subtotal_agorot is null) = (total_agorot is null)
    and (subtotal_agorot is null or (shipping_agorot is not null
         and discount_agorot <= subtotal_agorot
         and total_agorot = subtotal_agorot - discount_agorot + shipping_agorot))),
  add constraint order_discount check ((discount_agorot = 0) = (discount_source is null)),
  add constraint order_coupon   check ((coupon_id is not null) = (discount_source is not distinct from 'coupon')),
  -- a delivery has where to; a pickup has no address at all
  add constraint order_delivery check (
    fulfilment is null
    or (fulfilment = 'delivery' and delivery_city is not null and (delivery_address is not null or address_purged_at is not null))
    or (fulfilment = 'pickup' and delivery_city is null and delivery_address is null and delivery_zone is null)),
  add constraint order_window check ((window_from is null) = (window_to is null) and (window_to is null or window_to > window_from)),
  -- a shop order is complete from the start: a day, how it arrives, its price and how it's paid
  add constraint order_catalog check (
    kind <> 'catalog'
    or (needed_date is not null and fulfilment is not null and total_agorot is not null and payment_method is not null and contact_name is not null)),
  add constraint order_paid check ((payment_status in ('paid', 'refunded')) = (paid_at is not null));

-- orders from before the shop get their own codes. phone_verified stays true by default: the
-- signed-in builder (submit_order) and the owner's own entries know the number; the guest
-- checkout (place_order) says false.
update public.orders set public_code = private.new_public_code() where public_code is null;
alter table public.orders alter column public_code set not null;

create index orders_by_day on public.orders (needed_date) where status <> 'cancelled';
create index orders_holding on public.orders (slot_held_until) where slot_held_until is not null;
create index orders_to_purge on public.orders (needed_date) where delivery_address is not null;

-- ─────────────────────────────────────── order lines ────────────────────────────────────────

-- what was bought, as the customer saw it at checkout (names and prices are kept, so a later
-- change in the CMS never rewrites an order)
create table public.order_items (
  id                bigint generated always as identity primary key,
  order_id          uuid not null references public.orders (id) on delete cascade,
  line_no           smallint not null check (line_no between 1 and 30),
  product_id        text not null check (char_length(product_id) between 1 and 128),   -- the CMS document
  variant_id        text not null check (char_length(variant_id) between 1 and 128),   -- the size's key
  kind              text not null check (kind in ('single', 'bundle')),
  title             text not null check (char_length(title) between 1 and 120),
  variant_label     text not null check (char_length(variant_label) between 1 and 60),
  quantity          smallint not null check (quantity between 1 and 20),
  unit_price_agorot int not null check (unit_price_agorot between 1 and 10000000),
  line_total_agorot int generated always as (quantity * unit_price_agorot) stored,
  bundle            jsonb check (bundle is null or (kind = 'bundle' and pg_column_size(bundle) < 4096)),  -- what the bundle held
  unique (order_id, line_no)
);

create table public.coupon_redemptions (
  id            bigint generated always as identity primary key,
  coupon_id     uuid not null references public.coupons (id) on delete restrict,
  order_id      uuid not null unique references public.orders (id) on delete cascade,
  customer_id   uuid not null references public.customers (id) on delete cascade,
  amount_agorot int not null check (amount_agorot > 0),
  created_at    timestamptz not null default now()
);
create index redemptions_by_coupon on public.coupon_redemptions (coupon_id, customer_id);

-- ───────────────────────────────────────── payments ─────────────────────────────────────────

-- every notification from the gateway, and every payment the owner marks by hand: the trail
-- behind a paid order. The server keeps card details and personal data out of `payload`.
create table public.payment_events (
  id                bigint generated always as identity primary key,
  provider          text not null check (provider in ('grow', 'manual')),
  provider_event_id text not null check (char_length(provider_event_id) between 1 and 200),
  order_id          uuid references public.orders (id) on delete set null,
  succeeded         boolean not null,
  amount_agorot     int check (amount_agorot >= 0),
  transaction_id    text check (char_length(transaction_id) <= 200),
  method            text check (char_length(method) <= 40),
  outcome           text check (char_length(outcome) <= 40),
  payload           jsonb not null default '{}'::jsonb check (pg_column_size(payload) < 8192),
  recorded_by       uuid references auth.users (id) on delete set null,   -- the owner, for a payment marked by hand
  received_at       timestamptz not null default now(),
  unique (provider, provider_event_id)      -- a notification delivered twice is recorded once
);
create index payments_by_order on public.payment_events (order_id);

-- ─────────────────────────────────────── the guard ──────────────────────────────────────────

-- what no update may do, whoever runs it: change an order's code or kind, mark it paid outside
-- the payment functions, or change the money of an order that's been paid
create function private.guard_order_money() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.public_code is distinct from old.public_code or new.kind is distinct from old.kind then
    raise exception 'an order''s code and kind never change' using errcode = '42501';
  end if;
  if new.payment_status = 'paid' and old.payment_status <> 'paid'
     and coalesce(current_setting('lali.paying', true), '') <> 'on' then
    raise exception 'record payments with record_payment() or staff_record_offline_payment()' using errcode = '42501';
  end if;
  if old.payment_status = 'paid' and new.payment_status not in ('paid', 'refunded') then
    raise exception 'a paid order can only be refunded' using errcode = '55000';
  end if;
  if new.payment_status = 'refunded' and old.payment_status not in ('paid', 'refunded') then
    raise exception 'only a paid order can be refunded' using errcode = '55000';
  end if;
  if old.payment_status in ('paid', 'refunded') and (
       new.subtotal_agorot is distinct from old.subtotal_agorot
    or new.discount_agorot is distinct from old.discount_agorot
    or new.shipping_agorot is distinct from old.shipping_agorot
    or new.total_agorot    is distinct from old.total_agorot
    or new.coupon_id       is distinct from old.coupon_id) then
    raise exception 'order % is paid: its amounts can''t change', old.number using errcode = '55000';
  end if;
  return new;
end
$$;
create trigger guard_order_money before update on public.orders
  for each row execute function private.guard_order_money();

-- ═══════════════════════════════════════ functions ═══════════════════════════════════════════

-- the orders that take a place on a day
create function private.booked_on(p_day date) returns int
language sql stable security definer set search_path = '' as $$
  select count(*)::int from public.orders o
  where o.needed_date = p_day and private.order_is_live(o.status, o.slot_held_until)
$$;

-- Takes a place on a day, or raises date_full. The lock (per date, until the transaction ends)
-- makes the count and the insert that follows it one step: no two checkouts share the last place.
create function private.reserve_day(p_day date, p_capacity int) returns int
language plpgsql security definer set search_path = '' as $$
declare
  v_booked int;
begin
  if p_capacity is null or p_capacity not between 0 and 50 then
    raise exception 'bad_capacity' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('lali.day:' || p_day::text, 0));
  v_booked := private.booked_on(p_day);
  if v_booked >= p_capacity then
    raise exception 'date_full' using errcode = 'P0001';
  end if;
  return p_capacity - v_booked - 1;   -- places left after this one
end
$$;

-- For the calendar: how many places each day has taken (the server compares with the CMS
-- capacity and shows only "available", "few left" or "full", never the numbers).
create function public.booked_counts(p_from date, p_to date)
returns table (day date, booked int)
language plpgsql stable security definer set search_path = '' as $$
#variable_conflict use_column
begin
  if p_to < p_from or p_to - p_from > 400 then
    raise exception 'bad_range' using errcode = '22023';
  end if;
  return query
    select o.needed_date, count(*)::int from public.orders o
    where o.needed_date between p_from and p_to and private.order_is_live(o.status, o.slot_held_until)
    group by o.needed_date;
end
$$;

-- The checkout (the server, after pricing the cart against the published CMS content).
--   catalog  the shop's products at a fixed price: items, amounts, delivery or pickup, a day and
--            a payment method are all required. Paid online: pending_payment, holding the day for
--            p_hold_minutes. Paid otherwise: confirmed, unpaid until the owner marks it.
--   builder  a request from the cake builder: no items and no amounts (the owner quotes over
--            WhatsApp, staff_quote_order); it takes a place on its day if it has one.
-- Raises (the server turns these into a friendly message): date_passed, date_full, bad_order,
-- amounts_mismatch, coupon_invalid, too_many_open_orders.
create function public.place_order(
  p_kind                   text,
  p_phone                  text,
  p_name                   text,
  p_email                  text,
  p_needed_date            date,
  p_capacity               int,
  p_fulfilment             public.fulfilment default null,
  p_delivery               jsonb default null,          -- {zone, city, address, notes, recipient_name, recipient_phone}
  p_window_from            time default null,
  p_window_to              time default null,
  p_items                  jsonb default '[]'::jsonb,   -- [{product_id, variant_id, kind, title, variant_label, quantity, unit_price_agorot, bundle?}]
  p_subtotal_agorot        int default null,
  p_discount_agorot        int default 0,
  p_discount_source        text default null,
  p_coupon_id              uuid default null,
  p_shipping_agorot        int default null,
  p_total_agorot           int default null,
  p_payment_method         public.payment_method default null,
  p_category               text default null,
  p_details                jsonb default '{}'::jsonb,
  p_estimated_price_agorot int default null,
  p_hold_minutes           int default 30
) returns table (order_id uuid, order_code text, held_until timestamptz)
language plpgsql security definer set search_path = '' as $$
#variable_conflict use_column
declare
  v_customer uuid;
  v_order    public.orders;
  v_item     jsonb;
  v_qty      int;
  v_unit     int;
  v_sum      bigint := 0;
  c          public.coupons;
  v_live     int;
  v_mine     int;
  v_status   public.order_status;
  v_online   boolean := p_payment_method = 'online';
begin
  if p_kind not in ('builder', 'catalog') or p_hold_minutes not between 5 and 120 then
    raise exception 'bad_order' using errcode = '22023';
  end if;
  if p_needed_date is not null and p_needed_date < private.il_today() then
    raise exception 'date_passed' using errcode = '22023';
  end if;

  if p_kind = 'catalog' then
    if p_needed_date is null or p_fulfilment is null or p_payment_method is null
       or p_subtotal_agorot is null or p_shipping_agorot is null or p_total_agorot is null
       or jsonb_typeof(p_items) is distinct from 'array' or jsonb_array_length(p_items) not between 1 and 30
       or (v_online and p_total_agorot <= 0) then
      raise exception 'bad_order' using errcode = '22023';
    end if;
    for v_item in select value from jsonb_array_elements(p_items) loop
      v_qty  := (v_item ->> 'quantity')::int;
      v_unit := (v_item ->> 'unit_price_agorot')::int;
      if v_qty is null or v_qty not between 1 and 20 or v_unit is null or v_unit not between 1 and 10000000 then
        raise exception 'bad_order' using errcode = '22023';
      end if;
      v_sum := v_sum + v_qty::bigint * v_unit;
    end loop;
    if v_sum <> p_subtotal_agorot
       or coalesce(p_discount_agorot, -1) not between 0 and p_subtotal_agorot
       or p_total_agorot <> p_subtotal_agorot - p_discount_agorot + p_shipping_agorot then
      raise exception 'amounts_mismatch' using errcode = '22023';
    end if;
  else
    if jsonb_array_length(coalesce(p_items, '[]'::jsonb)) <> 0 or p_subtotal_agorot is not null or p_total_agorot is not null
       or coalesce(p_discount_agorot, 0) <> 0 or p_coupon_id is not null or p_payment_method is not null then
      raise exception 'bad_order' using errcode = '22023';
    end if;
  end if;

  -- the customer, found by phone. A guest's name never replaces the one the customer already has.
  insert into public.customers (phone, full_name) values (p_phone, nullif(btrim(p_name), ''))
  on conflict (phone) do update set full_name = coalesce(public.customers.full_name, excluded.full_name)
  returning id into v_customer;
  perform 1 from public.customers where id = v_customer for update;   -- one checkout at a time per customer

  if (select count(*) from public.orders o
       where o.customer_id = v_customer
         and (o.status = 'requested' or (o.status = 'pending_payment' and o.slot_held_until > now()))) >= 5 then
    raise exception 'too_many_open_orders' using errcode = '54000';
  end if;

  if p_needed_date is not null then
    perform private.reserve_day(p_needed_date, p_capacity);
  end if;

  -- a coupon: usable now, by this customer, and the discount within what it gives
  if p_coupon_id is not null or p_discount_source = 'coupon' then
    select * into c from public.coupons where id = p_coupon_id for update;
    if not found or p_discount_source is distinct from 'coupon' or not c.active
       or (c.starts_at is not null and now() < c.starts_at) or (c.ends_at is not null and now() >= c.ends_at)
       or p_subtotal_agorot < c.min_subtotal_agorot
       or p_discount_agorot <= 0
       or (c.kind = 'amount'  and p_discount_agorot > c.value)
       or (c.kind = 'percent' and p_discount_agorot > (p_subtotal_agorot * c.value) / 100) then
      raise exception 'coupon_invalid' using errcode = 'P0001';
    end if;
    select count(*), count(*) filter (where r.customer_id = v_customer)
      into v_live, v_mine
      from public.coupon_redemptions r join public.orders o on o.id = r.order_id
     where r.coupon_id = c.id and private.order_is_live(o.status, o.slot_held_until);
    if (c.max_redemptions is not null and v_live >= c.max_redemptions) or v_mine >= c.max_per_customer then
      raise exception 'coupon_invalid' using errcode = 'P0001';
    end if;
  end if;

  v_status := case when p_kind = 'builder' then 'requested'::public.order_status
                   when v_online then 'pending_payment'::public.order_status
                   else 'confirmed'::public.order_status end;

  insert into public.orders (
    customer_id, status, source, kind, phone_verified, category, details, needed_date, estimated_price_agorot,
    final_price_agorot, contact_name, contact_email, fulfilment,
    delivery_zone, delivery_city, delivery_address, delivery_notes, recipient_name, recipient_phone,
    window_from, window_to, subtotal_agorot, discount_agorot, discount_source, coupon_id, shipping_agorot, total_agorot,
    payment_method, payment_status, slot_held_until, confirmed_at)
  values (
    v_customer, v_status, 'shop', p_kind, false,
    case when p_kind = 'builder' then p_category end,
    coalesce(p_details, '{}'::jsonb), p_needed_date,
    case when p_kind = 'builder' then p_estimated_price_agorot end,
    case when p_kind = 'catalog' then p_total_agorot end,
    nullif(btrim(p_name), ''), nullif(lower(btrim(p_email)), ''), p_fulfilment,
    nullif(p_delivery ->> 'zone', ''), nullif(btrim(p_delivery ->> 'city'), ''), nullif(btrim(p_delivery ->> 'address'), ''),
    nullif(btrim(p_delivery ->> 'notes'), ''), nullif(btrim(p_delivery ->> 'recipient_name'), ''), nullif(p_delivery ->> 'recipient_phone', ''),
    p_window_from, p_window_to,
    p_subtotal_agorot, coalesce(p_discount_agorot, 0), p_discount_source, p_coupon_id, p_shipping_agorot, p_total_agorot,
    p_payment_method,
    case when v_online then 'pending'::public.payment_status else 'unpaid'::public.payment_status end,
    case when v_status = 'pending_payment' then now() + make_interval(mins => p_hold_minutes) end,
    case when v_status = 'confirmed' then now() end)
  returning * into v_order;

  if p_kind = 'catalog' then
    insert into public.order_items (order_id, line_no, product_id, variant_id, kind, title, variant_label, quantity, unit_price_agorot, bundle)
    select v_order.id, e.ord, e.value ->> 'product_id', e.value ->> 'variant_id', e.value ->> 'kind',
           e.value ->> 'title', e.value ->> 'variant_label', (e.value ->> 'quantity')::smallint,
           (e.value ->> 'unit_price_agorot')::int, nullif(e.value -> 'bundle', 'null'::jsonb)
    from jsonb_array_elements(p_items) with ordinality as e(value, ord);
  end if;

  if p_coupon_id is not null then
    insert into public.coupon_redemptions (coupon_id, order_id, customer_id, amount_agorot)
    values (p_coupon_id, v_order.id, v_customer, p_discount_agorot);
  end if;

  return query select v_order.id, v_order.public_code, v_order.slot_held_until;
end
$$;

-- The owner's price for a builder request (agreed over WhatsApp): the order becomes "quoted",
-- ready to be paid online or marked paid.
create function public.staff_quote_order(p_order_id uuid, p_price_agorot int, p_shipping_agorot int default 0)
returns void
language plpgsql security definer set search_path = '' as $$
declare
  o public.orders;
begin
  if not private.is_staff() then
    raise exception 'staff only' using errcode = '42501';
  end if;
  if p_price_agorot is null or p_price_agorot not between 1 and 10000000 or coalesce(p_shipping_agorot, -1) not between 0 and 100000 then
    raise exception 'check the price' using errcode = '22023';
  end if;
  select * into o from public.orders where id = p_order_id for update;
  if not found then
    raise exception 'no such order' using errcode = 'P0002';
  end if;
  if o.kind <> 'builder' or o.status not in ('requested', 'quoted') or o.payment_status <> 'unpaid' then
    raise exception 'order % can''t be quoted now', o.number using errcode = '55000';
  end if;
  update public.orders
     set status = 'quoted', quoted_at = now(),
         subtotal_agorot = p_price_agorot, discount_agorot = 0, discount_source = null,
         shipping_agorot = p_shipping_agorot, total_agorot = p_price_agorot + p_shipping_agorot
   where id = o.id;
end
$$;

-- The payment gateway's notification (the server, after verifying it with the gateway). At most
-- once per event; the amount must be the order's total. Outcomes:
--   paid             the order is paid and confirmed
--   paid_late        paid after its 30 minutes ran out: confirmed anyway (the customer paid), and
--                    the server tells the owner, since the day may now be over capacity
--   duplicate        this event was already recorded: nothing changes
--   failed           a failed attempt: recorded; the customer can try again while the hold lasts
--   amount_mismatch  not marked paid; the owner checks
--   already_paid     a second payment for a paid order: the owner refunds it
--   after_cancel     paid for an order the owner cancelled: the owner refunds it
--   unknown_order    no such order
create function public.record_payment(
  p_provider       text,
  p_event_id       text,
  p_order_id       uuid,
  p_succeeded      boolean,
  p_amount_agorot  int,
  p_transaction_id text default null,
  p_method         text default null,
  p_payload        jsonb default '{}'::jsonb
) returns table (outcome text, order_code text)
language plpgsql security definer set search_path = '' as $$
#variable_conflict use_column
declare
  v_event   bigint;
  v_outcome text;
  o         public.orders;
begin
  -- an order id that doesn't exist is kept in the payload (for the owner to look into), not linked
  insert into public.payment_events (provider, provider_event_id, order_id, succeeded, amount_agorot, transaction_id, method, payload)
  values (p_provider, p_event_id, (select x.id from public.orders x where x.id = p_order_id), p_succeeded, p_amount_agorot,
          p_transaction_id, p_method, coalesce(p_payload, '{}'::jsonb) || jsonb_build_object('order_ref', p_order_id))
  on conflict (provider, provider_event_id) do nothing
  returning id into v_event;
  if v_event is null then
    return query select 'duplicate'::text, (select x.public_code from public.orders x where x.id = p_order_id);
    return;
  end if;

  select * into o from public.orders where id = p_order_id for update;
  v_outcome := case
    when not found then 'unknown_order'
    when not p_succeeded then 'failed'
    when o.payment_status = 'paid' then 'already_paid'
    when o.total_agorot is null or p_amount_agorot is distinct from o.total_agorot then 'amount_mismatch'
    when o.status = 'cancelled' and o.cancelled_reason is distinct from 'payment_timeout' then 'after_cancel'
    when o.status = 'cancelled' then 'paid_late'
    else 'paid'
  end;

  if v_outcome in ('paid', 'paid_late') then
    perform set_config('lali.paying', 'on', true);
    update public.orders
       set payment_status = 'paid', paid_at = now(), payment_method = 'online',
           grow_transaction_id = case when p_provider = 'grow' then coalesce(p_transaction_id, grow_transaction_id) else grow_transaction_id end,
           status = case when status in ('pending_payment', 'quoted', 'cancelled') then 'confirmed'::public.order_status else status end,
           confirmed_at = coalesce(confirmed_at, now()),
           cancelled_at = null, cancelled_reason = null, slot_held_until = null
     where id = o.id;
    perform set_config('lali.paying', '', true);
  end if;

  update public.payment_events set outcome = v_outcome where id = v_event;
  return query select v_outcome, o.public_code;
end
$$;

-- The owner marks a payment she received herself (cash, Bit to her phone, a transfer)
create function public.staff_record_offline_payment(p_order_id uuid, p_method public.payment_method)
returns void
language plpgsql security definer set search_path = '' as $$
declare
  o public.orders;
begin
  if not private.is_staff() then
    raise exception 'staff only' using errcode = '42501';
  end if;
  if p_method is null or p_method = 'online' then
    raise exception 'online payments are recorded by the gateway' using errcode = '22023';
  end if;
  select * into o from public.orders where id = p_order_id for update;
  if not found then
    raise exception 'no such order' using errcode = 'P0002';
  end if;
  if o.total_agorot is null or o.payment_status <> 'unpaid' or o.status = 'cancelled' then
    raise exception 'order % can''t be marked paid now', o.number using errcode = '55000';
  end if;
  insert into public.payment_events (provider, provider_event_id, order_id, succeeded, amount_agorot, method, outcome, recorded_by)
  values ('manual', 'manual:' || o.id, o.id, true, o.total_agorot, p_method::text, 'paid', auth.uid());
  perform set_config('lali.paying', 'on', true);
  update public.orders
     set payment_status = 'paid', paid_at = now(), payment_method = p_method,
         status = case when status in ('pending_payment', 'quoted') then 'confirmed'::public.order_status else status end,
         confirmed_at = coalesce(confirmed_at, now()), slot_held_until = null
   where id = o.id;
  perform set_config('lali.paying', '', true);
end
$$;

-- The job (every few minutes): online orders whose 30 minutes ran out unpaid are cancelled. Their
-- day and coupon were already free (order_is_live); this tidies the list.
create function public.expire_pending_orders(p_now timestamptz default now()) returns int
language sql security definer set search_path = '' as $$
  with expired as (
    update public.orders
       set status = 'cancelled', cancelled_at = p_now, cancelled_reason = 'payment_timeout',
           payment_status = 'unpaid', slot_held_until = null
     where status = 'pending_payment' and slot_held_until <= p_now and payment_status <> 'paid'
    returning 1
  )
  select count(*)::int from expired
$$;

-- The job (daily): a delivery's full address is erased 24 months after its day. The city stays.
create function public.purge_old_addresses(p_now timestamptz default now()) returns int
language sql security definer set search_path = '' as $$
  with purged as (
    update public.orders
       set delivery_address = null, delivery_notes = null, recipient_name = null, recipient_phone = null,
           address_purged_at = p_now
     where address_purged_at is null
       and (delivery_address is not null or delivery_notes is not null or recipient_name is not null or recipient_phone is not null)
       and coalesce(needed_date, (created_at at time zone 'Asia/Jerusalem')::date)
           < ((p_now at time zone 'Asia/Jerusalem')::date - interval '24 months')::date
    returning 1
  )
  select count(*)::int from purged
$$;

-- ═════════════════════════════════════ access control ════════════════════════════════════════

alter table public.coupons            enable row level security;
alter table public.order_items        enable row level security;
alter table public.coupon_redemptions enable row level security;
alter table public.payment_events     enable row level security;

-- the owner manages coupons (from the admin screen, which hashes the code on the server);
-- customers never read them: a code is checked by the server, by its hash
create policy "staff read coupons"   on public.coupons for select to authenticated using (private.is_staff());
create policy "staff create coupons" on public.coupons for insert to authenticated with check (private.is_staff());
create policy "staff edit coupons"   on public.coupons for update to authenticated using (private.is_staff()) with check (private.is_staff());

create policy "own order lines, or staff" on public.order_items for select to authenticated
  using (private.is_staff() or exists (
    select 1 from public.orders o where o.id = order_id and o.customer_id = private.current_customer_id()));
create policy "staff see redemptions" on public.coupon_redemptions for select to authenticated using (private.is_staff());
create policy "staff see payments"    on public.payment_events     for select to authenticated using (private.is_staff());

revoke all on public.coupons, public.order_items, public.coupon_redemptions, public.payment_events from anon;
revoke delete, truncate on public.coupons from authenticated;    -- a coupon is switched off, never deleted
revoke insert, update, delete, truncate on public.order_items, public.coupon_redemptions, public.payment_events from authenticated;

revoke all on function private.new_public_code(), private.order_is_live(public.order_status, timestamptz),
                       private.booked_on(date), private.reserve_day(date, int) from public, anon, authenticated;
-- the code is the orders column's default: whoever may insert an order (the owner logging one by
-- hand, the server) runs it
grant execute on function private.new_public_code() to authenticated, service_role;

revoke all on function public.staff_quote_order(uuid, int, int)                            from public, anon;
revoke all on function public.staff_record_offline_payment(uuid, public.payment_method)    from public, anon;
grant execute on function public.staff_quote_order(uuid, int, int)                         to authenticated; -- checks is_staff
grant execute on function public.staff_record_offline_payment(uuid, public.payment_method) to authenticated; -- checks is_staff

-- the checkout, the gateway and the jobs: the server only (service role key, never in the browser)
revoke all on function public.place_order(text, text, text, text, date, int, public.fulfilment, jsonb, time, time, jsonb,
                                          int, int, text, uuid, int, int, public.payment_method, text, jsonb, int, int)
  from public, anon, authenticated;
revoke all on function public.record_payment(text, text, uuid, boolean, int, text, text, jsonb) from public, anon, authenticated;
revoke all on function public.booked_counts(date, date)                                         from public, anon, authenticated;
revoke all on function public.expire_pending_orders(timestamptz)                                from public, anon, authenticated;
revoke all on function public.purge_old_addresses(timestamptz)                                  from public, anon, authenticated;
grant execute on function public.place_order(text, text, text, text, date, int, public.fulfilment, jsonb, time, time, jsonb,
                                             int, int, text, uuid, int, int, public.payment_method, text, jsonb, int, int)
  to service_role;
grant execute on function public.record_payment(text, text, uuid, boolean, int, text, text, jsonb) to service_role;
grant execute on function public.booked_counts(date, date)                                         to service_role;
grant execute on function public.expire_pending_orders(timestamptz)                                to service_role;
grant execute on function public.purge_old_addresses(timestamptz)                                  to service_role;
