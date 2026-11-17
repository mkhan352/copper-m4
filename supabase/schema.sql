-- Copper M4 tables. Run this once in the Supabase SQL editor, then seed.sql.
create table if not exists customers (
  email text primary key,
  name text not null
);

create table if not exists orders (
  id text primary key,
  customer_email text not null references customers(email),
  kind text not null check (kind in ('device', 'plan')),
  product text not null,
  color text,
  sku text,
  billing text check (billing in ('monthly', 'annual')),
  amount_usd numeric not null,
  purchased_at timestamptz not null,
  refund_status text not null default 'none'
    check (refund_status in ('none', 'pending', 'refunded'))
);

create table if not exists inventory (
  sku text primary key,
  product text not null,
  color text not null,
  units_in_stock integer not null,
  next_shipment text not null
);

create sequence if not exists refund_request_seq start 1001;

create table if not exists refund_requests (
  id text primary key default ('REQ-' || nextval('refund_request_seq')),
  order_id text not null references orders(id),
  customer_email text not null,
  kind text not null,
  product text not null,
  sku text,
  reason text not null,
  agent_summary text not null,
  amount_usd numeric not null,
  rule_applied text not null,
  recommendation text not null check (recommendation in ('approve', 'reject')),
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'rejected')),
  admin_note text,
  created_at timestamptz not null default now(),
  decided_at timestamptz
);

-- Only the server (service-role key) reads or writes; nothing is public.
alter table customers enable row level security;
alter table orders enable row level security;
alter table inventory enable row level security;
alter table refund_requests enable row level security;

create table if not exists settings (
  key text primary key,
  value text not null
);
alter table settings enable row level security;
