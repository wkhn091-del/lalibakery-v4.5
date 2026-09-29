-- ═══════════════════════════════════════════════════════════════════════════════════════════
--  LaliBakery VIP club: customers, orders, anniversary reminders, punch card, credit, referrals
--  Supabase (Postgres 15+). Drop into supabase/migrations/ and run `supabase db push`.
--
--  Principles
--   • Customers are keyed by phone. A login (phone OTP) claims the customer row with that phone,
--     so orders the owner logged by hand before the customer ever signed in show up in their account.
--   • Money is integer agorot (5000 = 50 ₪). Points and credit live in append-only ledgers; a
--     balance is always a SUM, never a stored number that can drift.
--   • Customers can read only their own rows (RLS). Nothing that is worth money (stamps, credit,
--     referral rewards) can be written by a customer: only SECURITY DEFINER functions write it,
--     inside one transaction, with unique indexes that make every reward happen at most once.
--   • A purchase counts when the owner completes the order (final price known), not when the
--     customer sends the wizard. That is what earns stamps and pays referral rewards.
--   • Dates are Israel dates (Asia/Jerusalem).
-- ═══════════════════════════════════════════════════════════════════════════════════════════

create schema if not exists private;   -- helpers; not exposed through the API

-- ───────────────────────────────────────── settings ─────────────────────────────────────────

create table public.loyalty_settings (
  id                         boolean primary key default true check (id),   -- exactly one row
  stamps_per_reward          int  not null default 6     check (stamps_per_reward > 0),
  punch_card_reward_agorot   int  not null default 10000 check (punch_card_reward_agorot >= 0), -- 100 ₪
  min_order_for_stamp_agorot int  not null default 15000 check (min_order_for_stamp_agorot >= 0), -- 150 ₪
  referral_reward_agorot     int  not null default 5000  check (referral_reward_agorot >= 0),   -- 50 ₪ to the friend who shared
  referee_reward_agorot      int  not null default 0     check (referee_reward_agorot >= 0),    -- optional welcome credit for the new friend
  referral_min_order_agorot  int  not null default 15000 check (referral_min_order_agorot >= 0),
  referral_window_days       int  not null default 60    check (referral_window_days > 0),
  credit_valid_days          int  not null default 365   check (credit_valid_days > 0),
  reminder_days_before       int  not null default 21    check (reminder_days_before between 1 and 90)
);
insert into public.loyalty_settings default values;

-- ───────────────────────────────────────── types ────────────────────────────────────────────

create type public.order_status    as enum ('requested', 'quoted', 'confirmed', 'completed', 'cancelled');
create type public.order_source    as enum ('wizard', 'whatsapp', 'phone', 'admin');
create type public.occasion        as enum ('birthday', 'round_birthday', 'bar_mitzvah', 'bat_mitzvah', 'anniversary', 'other');
create type public.channel         as enum ('whatsapp', 'sms');
create type public.credit_reason   as enum ('referral_reward', 'referral_welcome', 'punch_card_reward', 'redeem', 'expire', 'adjust');
create type public.referral_status as enum ('pending', 'rewarded', 'expired', 'rejected');
create type public.message_status  as enum ('queued', 'sent', 'failed', 'skipped');

-- ───────────────────────────────────────── helpers ──────────────────────────────────────────

create function private.il_today() returns date
language sql stable set search_path = '' as $$
  select (now() at time zone 'Asia/Jerusalem')::date
$$;

-- a short, unambiguous code for referral links: lalibakery.co.il/r/k7m2x9qa
create function private.new_referral_code() returns text
language sql volatile set search_path = '' as $$
  select string_agg(substr('abcdefghjkmnpqrstuvwxyz23456789', 1 + floor(random() * 31)::int, 1), '')
  from generate_series(1, 8)
$$;

-- the date a celebration falls on in a given year (29 Feb → 28 Feb in other years)
create function private.occurrence_in(p_year int, p_month int, p_day int) returns date
language sql immutable set search_path = '' as $$
  select case
    when p_month = 2 and p_day = 29 and not (p_year % 4 = 0 and (p_year % 100 <> 0 or p_year % 400 = 0))
      then make_date(p_year, 2, 28)
    else make_date(p_year, p_month, p_day)
  end
$$;

-- the next time it falls on, from a given day (that day included)
create function private.next_occurrence(p_month int, p_day int, p_from date) returns date
language sql immutable set search_path = '' as $$
  select case
    when private.occurrence_in(extract(year from p_from)::int, p_month, p_day) >= p_from
      then private.occurrence_in(extract(year from p_from)::int, p_month, p_day)
    else private.occurrence_in(extract(year from p_from)::int + 1, p_month, p_day)
  end
$$;

-- ───────────────────────────────────────── people ───────────────────────────────────────────

create table public.customers (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid unique references auth.users (id) on delete set null,  -- null until they sign in
  phone         text not null unique check (phone ~ '^\+[1-9][0-9]{7,14}$'),  -- E.164
  full_name     text check (char_length(full_name) <= 80),
  referral_code text not null unique default private.new_referral_code(),
  created_at    timestamptz not null default now()
);

create table public.staff (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  role       text not null default 'owner' check (role in ('owner', 'staff')),
  created_at timestamptz not null default now()
);

create function private.current_customer_id() returns uuid
language sql stable security definer set search_path = '' as $$
  select id from public.customers where user_id = auth.uid()
$$;

create function private.is_staff() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.staff where user_id = auth.uid())
$$;

-- a verified phone login creates the customer, or claims the one the owner created for that phone
create function private.link_customer() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.phone is null or new.phone = '' or new.phone_confirmed_at is null then
    return new;
  end if;
  insert into public.customers (phone, user_id)
  values ('+' || ltrim(new.phone, '+'), new.id)
  on conflict (phone) do update set user_id = excluded.user_id
    where public.customers.user_id is null;
  return new;
end
$$;

create trigger link_customer
  after insert or update of phone, phone_confirmed_at on auth.users
  for each row execute function private.link_customer();

-- ───────────────────────────────────────── orders ───────────────────────────────────────────

create table public.orders (
  id                     uuid primary key default gen_random_uuid(),
  number                 bigint generated always as identity (start with 1001) unique, -- "#1042" in WhatsApp
  customer_id            uuid not null references public.customers (id) on delete restrict,
  status                 public.order_status not null default 'requested',
  source                 public.order_source not null default 'wizard',
  category               text check (category in ('number', 'designer', 'birthday', 'kindergarten')),
  -- the wizard's CakeOrder, as the customer saw it: size, base, cream, colors, inscription,
  -- exclusions, allergy flag, notes. Also what "order again" loads back into the wizard.
  details                jsonb not null default '{}'::jsonb check (pg_column_size(details) < 16384),
  needed_date            date,
  estimated_price_agorot int check (estimated_price_agorot >= 0),   -- "החל מ-" at the time of ordering
  final_price_agorot     int check (final_price_agorot >= 0),       -- set by the owner
  credit_applied_agorot  int not null default 0 check (credit_applied_agorot >= 0),
  staff_notes            text,
  created_at             timestamptz not null default now(),
  confirmed_at           timestamptz,
  completed_at           timestamptz,
  cancelled_at           timestamptz,
  check (status <> 'completed' or (final_price_agorot is not null and completed_at is not null)),
  check (credit_applied_agorot <= coalesce(final_price_agorot, credit_applied_agorot))
);
create index orders_by_customer on public.orders (customer_id, created_at desc);
create index orders_open on public.orders (status, needed_date) where status not in ('completed', 'cancelled');

-- "completed" is what pays out stamps and referral rewards, so it can only be reached through
-- complete_order(); and a completed order can't be edited back out of that state
create function private.guard_order() returns trigger
language plpgsql set search_path = '' as $$
begin
  if old.status = 'completed' and (new.status <> 'completed'
      or new.final_price_agorot is distinct from old.final_price_agorot
      or new.credit_applied_agorot <> old.credit_applied_agorot) then
    raise exception 'order % is completed; correct it with an adjustment instead', old.number using errcode = '55000';
  end if;
  if new.status = 'completed' and old.status <> 'completed'
     and coalesce(current_setting('lali.completing', true), '') <> 'on' then
    raise exception 'complete orders with complete_order()' using errcode = '42501';
  end if;
  return new;
end
$$;
create trigger guard_order before update on public.orders
  for each row execute function private.guard_order();

-- ───────────────────────────────── celebrations and consent ─────────────────────────────────

create table public.celebrations (
  id             uuid primary key default gen_random_uuid(),
  customer_id    uuid not null references public.customers (id) on delete cascade,
  first_order_id uuid references public.orders (id) on delete set null,
  celebrant_name text not null check (char_length(btrim(celebrant_name)) between 1 and 40),
  occasion       public.occasion not null default 'birthday',
  event_month    smallint not null check (event_month between 1 and 12),
  event_day      smallint not null check (event_day between 1 and 31),
  age_turning    smallint check (age_turning between 0 and 120),  -- the age celebrated in event_year
  event_year     smallint not null,                                -- the year it was captured
  remind         boolean not null default false,
  created_at     timestamptz not null default now(),
  check (make_date(2024, event_month, event_day) is not null),     -- a real date (2024: 29 Feb allowed)
  -- a bar or bat mitzvah happens once: nothing to remind next year
  check (not remind or occasion not in ('bar_mitzvah', 'bat_mitzvah'))
);
create unique index celebrations_once on public.celebrations (customer_id, lower(celebrant_name), event_month, event_day);

-- proof of consent, as the spam law requires: what they agreed to, when, and where
create table public.consent_events (
  id          bigint generated always as identity primary key,
  customer_id uuid not null references public.customers (id) on delete cascade,
  purpose     text not null check (purpose in ('anniversary_reminders', 'club_news')),
  granted     boolean not null,
  channel     public.channel not null default 'whatsapp',
  wording     text not null check (char_length(wording) between 5 and 500),  -- the exact text shown
  source      text not null check (source in ('wizard', 'account', 'reply', 'staff')),
  created_at  timestamptz not null default now()
);
create index consent_latest on public.consent_events (customer_id, purpose, created_at desc, id desc);

create view public.current_consents with (security_invoker = true) as
  select distinct on (customer_id, purpose) customer_id, purpose, granted, channel, created_at
  from public.consent_events
  order by customer_id, purpose, created_at desc, id desc;

-- ─────────────────────────────── punch card, credit, referrals ──────────────────────────────

create table public.referrals (
  id                  uuid primary key default gen_random_uuid(),
  referrer_id         uuid not null references public.customers (id) on delete cascade,
  referee_id          uuid not null unique references public.customers (id) on delete cascade, -- referred once
  status              public.referral_status not null default 'pending',
  qualifying_order_id uuid references public.orders (id) on delete set null,
  created_at          timestamptz not null default now(),
  rewarded_at         timestamptz,
  check (referrer_id <> referee_id)
);
create index referrals_by_referrer on public.referrals (referrer_id);

create table public.stamp_ledger (
  id          bigint generated always as identity primary key,
  customer_id uuid not null references public.customers (id) on delete cascade,
  order_id    uuid references public.orders (id) on delete set null,
  delta       smallint not null check (delta <> 0),
  reason      text not null check (reason in ('order', 'reward', 'adjust')),
  note        text,
  created_by  uuid references auth.users (id) on delete set null,
  created_at  timestamptz not null default now()
);
create index stamps_by_customer on public.stamp_ledger (customer_id);
create unique index stamp_once_per_order  on public.stamp_ledger (order_id) where reason = 'order';
create unique index reward_once_per_order on public.stamp_ledger (order_id) where reason = 'reward';

create table public.credit_ledger (
  id               bigint generated always as identity primary key,
  customer_id      uuid not null references public.customers (id) on delete cascade,
  amount_agorot    int not null check (amount_agorot <> 0),   -- + earned, − spent or expired
  reason           public.credit_reason not null,
  order_id         uuid references public.orders (id) on delete set null,
  referral_id      uuid references public.referrals (id) on delete set null,
  expires_at       timestamptz,                                 -- earned credit only
  expires_entry_id bigint references public.credit_ledger (id), -- on 'expire' rows: which credit ran out
  note             text,
  created_by       uuid references auth.users (id) on delete set null,
  created_at       timestamptz not null default now(),
  check ((amount_agorot > 0) = (reason in ('referral_reward', 'referral_welcome', 'punch_card_reward') or (reason = 'adjust' and amount_agorot > 0))),
  check (expires_at is null or amount_agorot > 0)
);
create index credit_by_customer on public.credit_ledger (customer_id, created_at);
create unique index referral_paid_once     on public.credit_ledger (referral_id) where reason = 'referral_reward';
create unique index referral_welcome_once  on public.credit_ledger (referral_id) where reason = 'referral_welcome';
create unique index punch_reward_once      on public.credit_ledger (order_id) where reason = 'punch_card_reward';
create unique index redeem_once_per_order  on public.credit_ledger (order_id) where reason = 'redeem';
create unique index expire_once            on public.credit_ledger (expires_entry_id) where reason = 'expire';

-- what "My Account" shows: stamps on the card, credit, orders, friends who joined
create view public.customer_wallet with (security_invoker = true) as
  select c.id as customer_id,
         coalesce((select sum(s.delta) from public.stamp_ledger s where s.customer_id = c.id), 0)::int          as stamps,
         (select stamps_per_reward from public.loyalty_settings)                                                 as stamps_per_reward,
         coalesce((select sum(l.amount_agorot) from public.credit_ledger l where l.customer_id = c.id), 0)::int  as credit_agorot,
         (select count(*) from public.orders o where o.customer_id = c.id and o.status = 'completed')::int      as completed_orders,
         (select count(*) from public.referrals r where r.referrer_id = c.id and r.status = 'rewarded')::int    as friends_rewarded
  from public.customers c;

-- ───────────────────────────────────── reminder outbox ──────────────────────────────────────

create table public.reminder_messages (
  id                  uuid primary key default gen_random_uuid(),
  celebration_id      uuid not null references public.celebrations (id) on delete cascade,
  occurrence_date     date not null,
  channel             public.channel not null,
  status              public.message_status not null default 'queued',
  provider_message_id text,
  error               text,
  created_at          timestamptz not null default now(),
  sent_at             timestamptz,
  unique (celebration_id, occurrence_date)   -- one reminder per celebration per year, however often the job runs
);

-- ═══════════════════════════════════════ functions ═══════════════════════════════════════════

-- The wizard's "send": saves the order (and the celebration, and the consent, if given) for the
-- signed-in customer. The Next.js server action validates the order against the catalog first.
create function public.submit_order(
  p_category               text,
  p_details                jsonb,
  p_needed_date            date default null,
  p_estimated_price_agorot int default null,
  p_celebration            jsonb default null,  -- {name, occasion, date?, age?, remind}
  p_consent_wording        text default null,   -- required when remind is true
  p_channel                public.channel default 'whatsapp'
) returns table (order_id uuid, order_number bigint)
language plpgsql security definer set search_path = '' as $$
#variable_conflict use_column
declare
  v_customer uuid := private.current_customer_id();
  v_order    public.orders;
  v_name     text := btrim(coalesce(p_celebration ->> 'name', ''));
  v_remind   boolean := coalesce((p_celebration ->> 'remind')::boolean, false);
  v_date     date := coalesce((p_celebration ->> 'date')::date, p_needed_date);
begin
  if v_customer is null then
    raise exception 'sign in with your phone first' using errcode = '28000';
  end if;
  if p_needed_date is not null and p_needed_date < private.il_today() then
    raise exception 'the date has passed' using errcode = '22023';
  end if;
  if (select count(*) from public.orders where customer_id = v_customer and status = 'requested') >= 5 then
    raise exception 'too many open orders; we will be in touch about the ones you sent' using errcode = '54000';
  end if;

  insert into public.orders (customer_id, category, details, needed_date, estimated_price_agorot)
  values (v_customer, p_category, coalesce(p_details, '{}'::jsonb), p_needed_date, p_estimated_price_agorot)
  returning * into v_order;

  if v_name <> '' and v_date is not null then
    if v_remind and coalesce(btrim(p_consent_wording), '') = '' then
      raise exception 'a reminder needs the consent wording' using errcode = '22023';
    end if;
    insert into public.celebrations
      (customer_id, first_order_id, celebrant_name, occasion, event_month, event_day, age_turning, event_year, remind)
    values
      (v_customer, v_order.id, v_name, coalesce((p_celebration ->> 'occasion')::public.occasion, 'birthday'),
       extract(month from v_date), extract(day from v_date),
       nullif(p_celebration ->> 'age', '')::smallint, extract(year from v_date), v_remind)
    on conflict (customer_id, lower(celebrant_name), event_month, event_day) do update
      set remind      = excluded.remind or public.celebrations.remind,
          age_turning = coalesce(excluded.age_turning, public.celebrations.age_turning),
          event_year  = case when excluded.age_turning is null then public.celebrations.event_year else excluded.event_year end,
          occasion    = excluded.occasion;
    if v_remind then
      insert into public.consent_events (customer_id, purpose, granted, channel, wording, source)
      values (v_customer, 'anniversary_reminders', true, p_channel, p_consent_wording, 'wizard');
    end if;
  end if;

  return query select v_order.id, v_order.number;
end
$$;

-- a friend's link: called once, right after a new customer signs in with a referral cookie
create function public.claim_referral(p_code text) returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  v_customer uuid := private.current_customer_id();
  v_referrer uuid;
begin
  if v_customer is null then
    raise exception 'sign in with your phone first' using errcode = '28000';
  end if;
  select id into v_referrer from public.customers where referral_code = lower(btrim(p_code));
  if v_referrer is null or v_referrer = v_customer then
    return false;
  end if;
  -- friends are new customers: someone who already bought can't be "referred"
  if exists (select 1 from public.orders where customer_id = v_customer and status = 'completed') then
    return false;
  end if;
  insert into public.referrals (referrer_id, referee_id) values (v_referrer, v_customer)
  on conflict (referee_id) do nothing;
  return found;
end
$$;

-- opt in or out (the account page, a reply of "הסר", or the owner on the customer's behalf)
create function public.set_consent(p_purpose text, p_granted boolean, p_wording text,
                                   p_channel public.channel default 'whatsapp', p_source text default 'account')
returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_customer uuid := private.current_customer_id();
begin
  if v_customer is null then
    raise exception 'sign in with your phone first' using errcode = '28000';
  end if;
  insert into public.consent_events (customer_id, purpose, granted, channel, wording, source)
  values (v_customer, p_purpose, p_granted, p_channel, p_wording, p_source);
  if p_purpose = 'anniversary_reminders' and not p_granted then
    update public.celebrations set remind = false where customer_id = v_customer;
  end if;
end
$$;

-- the customer withdraws an order they just sent; the owner can cancel anything not completed
create function public.cancel_order(p_order_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_order public.orders;
begin
  select * into v_order from public.orders where id = p_order_id for update;
  if not found then
    raise exception 'no such order' using errcode = 'P0002';
  end if;
  if not (private.is_staff() or (v_order.customer_id = private.current_customer_id() and v_order.status = 'requested')) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if v_order.status in ('completed', 'cancelled') then
    raise exception 'order % is already %', v_order.number, v_order.status using errcode = '55000';
  end if;
  update public.orders set status = 'cancelled', cancelled_at = now() where id = p_order_id;
end
$$;

-- the owner, for orders that came by phone or WhatsApp: find or create the customer by phone
create function public.staff_upsert_customer(p_phone text, p_name text default null) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid;
begin
  if not private.is_staff() then
    raise exception 'staff only' using errcode = '42501';
  end if;
  insert into public.customers (phone, full_name) values (p_phone, nullif(btrim(p_name), ''))
  on conflict (phone) do update set full_name = coalesce(public.customers.full_name, excluded.full_name)
  returning id into v_id;
  return v_id;
end
$$;

-- credit runs out first-in, first-out: spending uses the oldest credit, and what's left of a
-- credit on its expiry date becomes an 'expire' row. Runs daily, and before every redemption.
create function public.expire_credits(p_at timestamptz default now(), p_customer uuid default null) returns int
language plpgsql security definer set search_path = '' as $$
declare
  e        record;
  v_earned bigint;
  v_used   bigint;
  v_left   int;
  v_count  int := 0;
begin
  for e in
    select * from public.credit_ledger l
    where l.amount_agorot > 0 and l.expires_at <= p_at
      and (p_customer is null or l.customer_id = p_customer)
      and not exists (select 1 from public.credit_ledger x where x.reason = 'expire' and x.expires_entry_id = l.id)
    order by l.customer_id, l.created_at, l.id
  loop
    select coalesce(sum(amount_agorot) filter (where amount_agorot > 0 and (created_at, id) <= (e.created_at, e.id)), 0),
           coalesce(-sum(amount_agorot) filter (where amount_agorot < 0), 0)
      into v_earned, v_used
      from public.credit_ledger where customer_id = e.customer_id;
    v_left := least(e.amount_agorot, greatest(0, v_earned - v_used))::int;
    if v_left > 0 then
      insert into public.credit_ledger (customer_id, amount_agorot, reason, expires_entry_id, note)
      values (e.customer_id, -v_left, 'expire', e.id, 'expired');
      v_count := v_count + 1;
    end if;
  end loop;
  return v_count;
end
$$;

-- The owner closes an order with its final price. In one transaction: spends the credit the
-- customer chose to use, stamps the punch card (and pays the card out when it's full), and pays
-- the referral reward if this is the friend's first qualifying purchase.
create function public.complete_order(p_order_id uuid, p_final_price_agorot int, p_apply_credit_agorot int default 0)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  s        public.loyalty_settings;
  o        public.orders;
  r        public.referrals;
  v_bal    int;
  v_stamps int;
  v_out    jsonb := '{}'::jsonb;
begin
  if not private.is_staff() then
    raise exception 'staff only' using errcode = '42501';
  end if;
  if p_final_price_agorot is null or p_final_price_agorot < 0
     or p_apply_credit_agorot < 0 or p_apply_credit_agorot > p_final_price_agorot then
    raise exception 'check the price and the credit' using errcode = '22023';
  end if;

  select * into s from public.loyalty_settings;
  select * into o from public.orders where id = p_order_id for update;
  if not found then
    raise exception 'no such order' using errcode = 'P0002';
  end if;
  if o.status in ('completed', 'cancelled') then
    raise exception 'order % is already %', o.number, o.status using errcode = '55000';
  end if;
  perform 1 from public.customers where id = o.customer_id for update;   -- one payout at a time per customer

  -- 1. credit the customer chose to use
  if p_apply_credit_agorot > 0 then
    perform public.expire_credits(now(), o.customer_id);
    select coalesce(sum(amount_agorot), 0) into v_bal from public.credit_ledger where customer_id = o.customer_id;
    if v_bal < p_apply_credit_agorot then
      raise exception 'the customer has % agorot of credit', v_bal using errcode = '22023';
    end if;
    insert into public.credit_ledger (customer_id, amount_agorot, reason, order_id, created_by)
    values (o.customer_id, -p_apply_credit_agorot, 'redeem', o.id, auth.uid());
  end if;

  -- 2. the order itself
  perform set_config('lali.completing', 'on', true);
  update public.orders
     set status = 'completed', final_price_agorot = p_final_price_agorot,
         credit_applied_agorot = p_apply_credit_agorot, completed_at = now()
   where id = o.id;
  perform set_config('lali.completing', '', true);

  -- 3. the punch card
  if p_final_price_agorot >= s.min_order_for_stamp_agorot then
    insert into public.stamp_ledger (customer_id, order_id, delta, reason, created_by)
    values (o.customer_id, o.id, 1, 'order', auth.uid());
    select coalesce(sum(delta), 0) into v_stamps from public.stamp_ledger where customer_id = o.customer_id;
    if v_stamps >= s.stamps_per_reward then
      insert into public.stamp_ledger (customer_id, order_id, delta, reason, created_by)
      values (o.customer_id, o.id, -s.stamps_per_reward, 'reward', auth.uid());
      if s.punch_card_reward_agorot > 0 then
        insert into public.credit_ledger (customer_id, amount_agorot, reason, order_id, expires_at, created_by)
        values (o.customer_id, s.punch_card_reward_agorot, 'punch_card_reward', o.id,
                now() + make_interval(days => s.credit_valid_days), auth.uid());
      end if;
      v_stamps := v_stamps - s.stamps_per_reward;
      v_out := v_out || jsonb_build_object('card_completed', true);
    end if;
    v_out := v_out || jsonb_build_object('stamps', v_stamps);
  end if;

  -- 4. the referral: the friend's first purchase above the minimum, within the window
  select * into r from public.referrals where referee_id = o.customer_id and status = 'pending' for update;
  if found and p_final_price_agorot >= s.referral_min_order_agorot then
    if r.created_at < now() - make_interval(days => s.referral_window_days) then
      update public.referrals set status = 'expired' where id = r.id;
    else
      if s.referral_reward_agorot > 0 then
        insert into public.credit_ledger (customer_id, amount_agorot, reason, referral_id, expires_at, created_by)
        values (r.referrer_id, s.referral_reward_agorot, 'referral_reward', r.id,
                now() + make_interval(days => s.credit_valid_days), auth.uid());
      end if;
      if s.referee_reward_agorot > 0 then
        insert into public.credit_ledger (customer_id, amount_agorot, reason, referral_id, expires_at, created_by)
        values (r.referee_id, s.referee_reward_agorot, 'referral_welcome', r.id,
                now() + make_interval(days => s.credit_valid_days), auth.uid());
      end if;
      update public.referrals set status = 'rewarded', qualifying_order_id = o.id, rewarded_at = now() where id = r.id;
      v_out := v_out || jsonb_build_object('referrer_rewarded', true);
    end if;
  end if;

  return v_out;
end
$$;

-- The daily job (Vercel Cron → /api/cron/reminders, with the service role): queues the reminders
-- due today and returns what the sender needs. Catches up if the job missed up to two days.
-- Skips customers who withdrew consent, and customers who already ordered for this celebration.
create function public.enqueue_due_reminders(p_today date default null)
returns table (message_id uuid, phone text, customer_name text, celebrant_name text,
               occasion public.occasion, occurrence_date date, age_turning int, channel public.channel)
language plpgsql security definer set search_path = '' as $$
#variable_conflict use_column
declare
  s       public.loyalty_settings;
  v_today date := coalesce(p_today, private.il_today());
begin
  select * into s from public.loyalty_settings;
  return query
  with due as (
    select cel.id as celebration_id, n.occ, cons.channel
    from public.celebrations cel
    cross join lateral (select private.next_occurrence(cel.event_month, cel.event_day, v_today) as occ) n
    join lateral (
      select ce.granted, ce.channel from public.consent_events ce
      where ce.customer_id = cel.customer_id and ce.purpose = 'anniversary_reminders'
      order by ce.created_at desc, ce.id desc limit 1
    ) cons on cons.granted
    where cel.remind
      and n.occ - s.reminder_days_before between v_today - 2 and v_today
      and extract(year from n.occ) > cel.event_year              -- next year onwards, never this year's party
      and not exists (
        select 1 from public.orders o
        where o.customer_id = cel.customer_id and o.status <> 'cancelled'
          and o.needed_date between n.occ - 30 and n.occ + 7)
  ), queued as (
    insert into public.reminder_messages (celebration_id, occurrence_date, channel)
    select due.celebration_id, due.occ, due.channel from due
    on conflict (celebration_id, occurrence_date) do nothing
    returning id, celebration_id, reminder_messages.occurrence_date, reminder_messages.channel
  )
  select q.id, c.phone, c.full_name, cel.celebrant_name, cel.occasion, q.occurrence_date,
         case when cel.age_turning is null then null
              else cel.age_turning + (extract(year from q.occurrence_date)::int - cel.event_year) end,
         q.channel
  from queued q
  join public.celebrations cel on cel.id = q.celebration_id
  join public.customers c on c.id = cel.customer_id;
end
$$;

-- ═════════════════════════════════════ access control ════════════════════════════════════════

alter table public.loyalty_settings  enable row level security;
alter table public.customers         enable row level security;
alter table public.staff             enable row level security;
alter table public.orders            enable row level security;
alter table public.celebrations      enable row level security;
alter table public.consent_events    enable row level security;
alter table public.referrals         enable row level security;
alter table public.stamp_ledger      enable row level security;
alter table public.credit_ledger     enable row level security;
alter table public.reminder_messages enable row level security;

create policy "anyone signed in reads the rules" on public.loyalty_settings for select to authenticated using (true);
create policy "staff change the rules"           on public.loyalty_settings for update to authenticated
  using (private.is_staff()) with check (private.is_staff());

create policy "own row, or staff" on public.customers for select to authenticated
  using (user_id = auth.uid() or private.is_staff());
create policy "own name"          on public.customers for update to authenticated
  using (user_id = auth.uid() or private.is_staff()) with check (user_id = auth.uid() or private.is_staff());

create policy "am I staff" on public.staff for select to authenticated using (user_id = auth.uid());

create policy "own orders, or staff" on public.orders for select to authenticated
  using (customer_id = private.current_customer_id() or private.is_staff());
create policy "staff log orders"     on public.orders for insert to authenticated with check (private.is_staff());
create policy "staff manage orders"  on public.orders for update to authenticated
  using (private.is_staff()) with check (private.is_staff());

create policy "own celebrations, or staff" on public.celebrations for all to authenticated
  using (customer_id = private.current_customer_id() or private.is_staff())
  with check (customer_id = private.current_customer_id() or private.is_staff());

create policy "own consents, or staff" on public.consent_events for select to authenticated
  using (customer_id = private.current_customer_id() or private.is_staff());

create policy "own referrals, or staff" on public.referrals for select to authenticated
  using (referrer_id = private.current_customer_id() or referee_id = private.current_customer_id() or private.is_staff());

create policy "own stamps, or staff" on public.stamp_ledger for select to authenticated
  using (customer_id = private.current_customer_id() or private.is_staff());
create policy "staff adjust stamps"  on public.stamp_ledger for insert to authenticated
  with check (private.is_staff() and reason = 'adjust');

create policy "own credit, or staff" on public.credit_ledger for select to authenticated
  using (customer_id = private.current_customer_id() or private.is_staff());
create policy "staff adjust credit"  on public.credit_ledger for insert to authenticated
  with check (private.is_staff() and reason = 'adjust');

create policy "staff see reminders" on public.reminder_messages for select to authenticated using (private.is_staff());

-- column-level: a customer may change their name, nothing else on their row
revoke update on public.customers from authenticated;
grant update (full_name) on public.customers to authenticated;

-- nothing for visitors who aren't signed in
revoke all on all tables in schema public from anon;

grant usage on schema private to authenticated;
revoke all on all functions in schema private from public, anon;
grant execute on function private.current_customer_id(), private.is_staff(), private.il_today() to authenticated;

revoke all on function public.submit_order(text, jsonb, date, int, jsonb, text, public.channel) from public, anon;
revoke all on function public.claim_referral(text)                                              from public, anon;
revoke all on function public.set_consent(text, boolean, text, public.channel, text)            from public, anon;
revoke all on function public.cancel_order(uuid)                                                from public, anon;
revoke all on function public.staff_upsert_customer(text, text)                                 from public, anon;
revoke all on function public.complete_order(uuid, int, int)                                    from public, anon;
grant execute on function public.submit_order(text, jsonb, date, int, jsonb, text, public.channel) to authenticated;
grant execute on function public.claim_referral(text)                                              to authenticated;
grant execute on function public.set_consent(text, boolean, text, public.channel, text)            to authenticated;
grant execute on function public.cancel_order(uuid)                                                to authenticated;
grant execute on function public.staff_upsert_customer(text, text)                                 to authenticated; -- checks is_staff
grant execute on function public.complete_order(uuid, int, int)                                    to authenticated; -- checks is_staff

-- jobs: the server only (service role key, never in the browser)
revoke all on function public.enqueue_due_reminders(date)       from public, anon, authenticated;
revoke all on function public.expire_credits(timestamptz, uuid) from public, anon, authenticated;
grant execute on function public.enqueue_due_reminders(date)       to service_role;
grant execute on function public.expire_credits(timestamptz, uuid) to service_role;
