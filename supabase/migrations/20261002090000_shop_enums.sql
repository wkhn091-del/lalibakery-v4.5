-- ═══════════════════════════════════════════════════════════════════════════════════════════
--  LaliBakery shop, part 1 of 2: the new values of existing types.
--  Runs after 20260929090000_cart_recovery.sql, before 20261002090100_shop.sql.
--  On its own because Postgres can't use an enum value in the transaction that added it, and
--  each migration file runs in one transaction.
-- ═══════════════════════════════════════════════════════════════════════════════════════════

-- a shop order paid online waits here, holding its day, until the payment arrives (or 30 minutes pass)
alter type public.order_status add value if not exists 'pending_payment' before 'requested';

-- orders placed through the site's checkout (the cart): the shop's products, and builder requests
alter type public.order_source add value if not exists 'shop';
