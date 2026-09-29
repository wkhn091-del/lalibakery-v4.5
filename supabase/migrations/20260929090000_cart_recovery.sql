-- ═══════════════════════════════════════════════════════════════════════════════════════════
--  LaliBakery: "did you forget your cake?" (abandoned-cart reminders)
--  Runs after 20260928090000_vip_club.sql.
--
--  How it works
--   • A signed-in customer's half-finished cake is saved here as a draft (save_cart_draft), one
--     open draft per customer. The first save schedules a QStash message for 2 hours after it.
--   • When the message arrives, claim_cart_reminder decides, in one transaction, whether a
--     reminder goes out: not while the customer is still working on it, not after they ordered,
--     not without their consent to cart reminders, not twice for one draft, not more than once a
--     week, and not at night or on Shabbat (the hours are in loyalty_settings).
--   • Reminders share the outbox with the anniversary reminders: reminder_messages gets a kind.
--  Only confirmed numbers are ever reminded: a draft exists only for a customer who passed the
--  phone OTP, so a number typed on someone else's behalf is never messaged.
-- ═══════════════════════════════════════════════════════════════════════════════════════════

-- ───────────────────────────────────────── settings ─────────────────────────────────────────

alter table public.loyalty_settings
  add column cart_reminder_after_minutes int  not null default 120     check (cart_reminder_after_minutes between 15 and 1440),
  add column cart_reminder_gap_days      int  not null default 7       check (cart_reminder_gap_days between 1 and 90),
  -- when marketing messages may go out, Israel time: Sunday to Thursday from–until, Friday
  -- from–friday_until, never on Saturday
  add column messages_from               time not null default '09:00',
  add column messages_until              time not null default '21:00',
  add column friday_messages_until       time not null default '14:00',
  add constraint message_hours check (messages_from < messages_until and messages_from < friday_messages_until);

-- ───────────────────────────────────────── drafts ───────────────────────────────────────────

create type public.cart_status   as enum ('open', 'submitted', 'reminded', 'dismissed');
create type public.reminder_kind as enum ('anniversary', 'cart');

create table public.cart_drafts (
  id            uuid primary key default gen_random_uuid(),
  customer_id   uuid not null references public.customers (id) on delete cascade,
  status        public.cart_status not null default 'open',
  category      text check (category in ('number', 'designer', 'birthday', 'kindergarten')),
  step          smallint not null default 0 check (step between 0 and 4),
  -- the wizard's draft, validated on the server (lib/order/schema.ts) before it gets here
  details       jsonb not null default '{}'::jsonb check (pg_column_size(details) < 16384),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  closed_at     timestamptz,
  closed_reason text   -- why a draft was dismissed without a reminder: no_consent, ordered, stale, …
);
create unique index one_open_draft on public.cart_drafts (customer_id) where status = 'open';
create index drafts_by_customer on public.cart_drafts (customer_id, created_at desc);

-- consent to cart reminders is its own purpose, asked for separately (spam law, section 30A)
alter table public.consent_events drop constraint consent_events_purpose_check;
alter table public.consent_events add constraint consent_events_purpose_check
  check (purpose in ('anniversary_reminders', 'club_news', 'cart_reminders'));

-- one outbox for both kinds of reminder
alter table public.reminder_messages
  add column kind          public.reminder_kind not null default 'anniversary',
  add column cart_draft_id uuid references public.cart_drafts (id) on delete cascade,
  alter column celebration_id  drop not null,
  alter column occurrence_date drop not null,
  add constraint reminder_target check (
    (kind = 'anniversary' and celebration_id is not null and occurrence_date is not null and cart_draft_id is null)
    or (kind = 'cart' and cart_draft_id is not null and celebration_id is null));
create unique index cart_reminder_once on public.reminder_messages (cart_draft_id) where kind = 'cart';

-- ───────────────────────────────────────── helpers ──────────────────────────────────────────

-- the first moment at or after p_at when a marketing message may go out
create function private.next_send_time(p_at timestamptz) returns timestamptz
language plpgsql stable set search_path = '' as $$
declare
  s       public.loyalty_settings;
  v_local timestamp := p_at at time zone 'Asia/Jerusalem';
  v_day   date := (p_at at time zone 'Asia/Jerusalem')::date;
  v_until time;
begin
  select * into s from public.loyalty_settings;
  for i in 0..7 loop
    v_until := case extract(dow from v_day) when 6 then null when 5 then s.friday_messages_until else s.messages_until end;
    if v_until is not null then
      if i > 0 or v_local::time < s.messages_from then
        return (v_day + s.messages_from) at time zone 'Asia/Jerusalem';
      elsif v_local::time < v_until then
        return p_at;
      end if;
    end if;
    v_day := v_day + 1;
  end loop;
  return null;   -- unreachable: every week has a Sunday
end
$$;

-- a date from the draft's JSON, or null when it isn't one
create function private.try_date(p text) returns date
language plpgsql immutable set search_path = '' as $$
begin
  return case when p ~ '^\d{4}-\d{2}-\d{2}$' then p::date end;
exception when others then
  return null;
end
$$;

-- ═══════════════════════════════════════ functions ═══════════════════════════════════════════

-- The wizard, while a signed-in customer works on it (the Next.js server action validates the
-- draft first). Returns whether the draft is new, and when its reminder falls due: the server
-- schedules the QStash message only for a new draft.
create function public.save_cart_draft(p_details jsonb, p_step smallint default 0, p_category text default null)
returns table (draft_id uuid, is_new boolean, remind_at timestamptz)
language plpgsql security definer set search_path = '' as $$
declare
  v_customer uuid := private.current_customer_id();
  v_after    int  := (select cart_reminder_after_minutes from public.loyalty_settings);
begin
  if v_customer is null then
    raise exception 'sign in with your phone first' using errcode = '28000';
  end if;
  return query
  with saved as (
    insert into public.cart_drafts as d (customer_id, category, step, details)
    values (v_customer, p_category, coalesce(p_step, 0), coalesce(p_details, '{}'::jsonb))
    on conflict (customer_id) where status = 'open' do update
      set category = excluded.category, step = excluded.step, details = excluded.details, updated_at = now()
    returning d.id, d.xmax = 0 as inserted, d.updated_at   -- xmax is 0 on a row this statement inserted
  )
  select saved.id, saved.inserted, saved.updated_at + make_interval(mins => v_after) from saved;
end
$$;

-- "start over" in the wizard: the draft is dropped, and no reminder will follow
create function public.dismiss_cart_draft() returns void
language sql security definer set search_path = '' as $$
  update public.cart_drafts set status = 'dismissed', closed_at = now(), closed_reason = 'started_over'
  where customer_id = private.current_customer_id() and status = 'open'
$$;

-- The QStash callback (/api/cart/remind, with the service role), 2 hours after the first save.
-- One of three answers:
--   send  the draft is marked reminded and the message queued; here is who to send it to
--   wait  not yet (still being worked on, or quiet hours): ask again at not_before
--   stop  nothing to send, ever, for this draft (reason says why)
create function public.claim_cart_reminder(p_draft_id uuid, p_now timestamptz default now())
returns table (action text, not_before timestamptz, reason text, message_id uuid,
               phone text, customer_name text, channel public.channel)
language plpgsql security definer set search_path = '' as $$
#variable_conflict use_column
declare
  s         public.loyalty_settings;
  d         public.cart_drafts;
  c         public.customers;
  v_due     timestamptz;
  v_at      timestamptz;
  v_stop    text;
  v_granted boolean;
  v_channel public.channel;
  v_message uuid;
begin
  select * into s from public.loyalty_settings;
  select * into d from public.cart_drafts where id = p_draft_id for update;
  if not found then
    return query select 'stop', null::timestamptz, 'missing', null::uuid, null::text, null::text, null::public.channel;
    return;
  end if;
  if d.status <> 'open' then
    return query select 'stop', null::timestamptz, d.status::text, null::uuid, null::text, null::text, null::public.channel;
    return;
  end if;

  -- still being worked on: the reminder moves to 2 hours after the last change
  v_due := d.updated_at + make_interval(mins => s.cart_reminder_after_minutes);
  if p_now < v_due then
    return query select 'wait', v_due, 'active', null::uuid, null::text, null::text, null::public.channel;
    return;
  end if;

  select ce.granted, ce.channel into v_granted, v_channel
    from public.consent_events ce
   where ce.customer_id = d.customer_id and ce.purpose = 'cart_reminders'
   order by ce.created_at desc, ce.id desc limit 1;

  v_stop := case
    when p_now > d.updated_at + interval '3 days' then 'stale'
    when private.try_date(d.details ->> 'date') < (p_now at time zone 'Asia/Jerusalem')::date then 'date_passed'
    -- an order since the draft began, or in the day before it: an autosave that lands just after
    -- "send" opens a new draft, and that customer has just ordered
    when exists (select 1 from public.orders o
                  where o.customer_id = d.customer_id and o.status <> 'cancelled'
                    and o.created_at >= d.created_at - interval '1 day') then 'ordered'
    when not coalesce(v_granted, false) then 'no_consent'
    when exists (select 1 from public.reminder_messages m
                   join public.cart_drafts x on x.id = m.cart_draft_id
                  where m.kind = 'cart' and x.customer_id = d.customer_id
                    and m.created_at > p_now - make_interval(days => s.cart_reminder_gap_days)) then 'recently_reminded'
  end;
  if v_stop is not null then
    update public.cart_drafts set status = 'dismissed', closed_at = p_now, closed_reason = v_stop where id = d.id;
    return query select 'stop', null::timestamptz, v_stop, null::uuid, null::text, null::text, null::public.channel;
    return;
  end if;

  v_at := private.next_send_time(p_now);
  if v_at > p_now then
    return query select 'wait', v_at, 'quiet_hours', null::uuid, null::text, null::text, null::public.channel;
    return;
  end if;

  update public.cart_drafts set status = 'reminded', closed_at = p_now where id = d.id;
  insert into public.reminder_messages (kind, cart_draft_id, channel, created_at)
  values ('cart', d.id, v_channel, p_now)
  returning id into v_message;
  select * into c from public.customers where id = d.customer_id;
  return query select 'send', null::timestamptz, null::text, v_message, c.phone, c.full_name, v_channel;
end
$$;

-- submit_order, as before, and it also closes the customer's open draft: a reminder already on
-- its way finds nothing to send
create or replace function public.submit_order(
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

  update public.cart_drafts set status = 'submitted', closed_at = now()
   where customer_id = v_customer and status = 'open';

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

-- ═════════════════════════════════════ access control ════════════════════════════════════════

alter table public.cart_drafts enable row level security;
-- a customer reads their own drafts (to continue on another device); the owner reads them all.
-- Writes go through the functions only.
create policy "own drafts, or staff" on public.cart_drafts for select to authenticated
  using (customer_id = private.current_customer_id() or private.is_staff());
revoke all on public.cart_drafts from anon;
revoke insert, update, delete, truncate on public.cart_drafts from authenticated;

revoke all on function private.next_send_time(timestamptz), private.try_date(text) from public, anon;

revoke all on function public.save_cart_draft(jsonb, smallint, text) from public, anon;
revoke all on function public.dismiss_cart_draft()                    from public, anon;
grant execute on function public.save_cart_draft(jsonb, smallint, text) to authenticated;
grant execute on function public.dismiss_cart_draft()                    to authenticated;

-- the job: the server only (service role key, never in the browser)
revoke all on function public.claim_cart_reminder(uuid, timestamptz) from public, anon, authenticated;
grant execute on function public.claim_cart_reminder(uuid, timestamptz) to service_role;
