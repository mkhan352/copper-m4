-- Demo data for Copper M4 (same as lib/copper/refunds/seed.ts). Safe to re-run:
-- it also resets the auto-refund limit to $100.
create table if not exists settings (
  key text primary key,
  value text not null
);
alter table settings enable row level security;

delete from refund_requests;
delete from orders;
delete from customers;
delete from inventory;
delete from settings;
insert into settings (key, value) values ('auto_refund_limit_usd', '100');
insert into customers (email, name) values
  ('ava@example.com','Ava'),('ben@example.com','Ben'),('cara@example.com','Cara'),
  ('dan@example.com','Dan'),('eve@example.com','Eve'),('finn@example.com','Finn');
insert into inventory (sku, product, color, units_in_stock, next_shipment) values
  ('CH-POL','Copper Home','Polished Copper',240,'2026-11-20'),
  ('CH-TEA','Copper Home','Patina Teal',6,'2026-11-06'),
  ('CH-NSK','Copper Home','Night Sky',185,'2026-11-20'),
  ('CN-BRC','Copper Notes','Brushed Copper',310,'2026-11-13'),
  ('CN-DSA','Copper Notes','Desert Sand',92,'2026-11-13'),
  ('CN-NSK','Copper Notes','Night Sky',0,'2026-11-14');
insert into orders (id, customer_email, kind, product, color, sku, billing, amount_usd, purchased_at, refund_status) values
  ('ORD-1001','ava@example.com','device','Copper Home','Polished Copper','CH-POL',null,149, now() - interval '10 days','none'),
  ('ORD-1002','ben@example.com','device','Copper Notes','Night Sky','CN-NSK',null,129, now() - interval '45 days','none'),
  ('ORD-1003','cara@example.com','plan','Copper Plus',null,null,'annual',79, now() - interval '5 days','none'),
  ('ORD-1004','dan@example.com','plan','Copper Plus',null,null,'annual',79, now() - interval '40 days','none'),
  ('ORD-1005','eve@example.com','plan','Copper Plus',null,null,'monthly',7.99, now() - interval '20 days','none'),
  ('ORD-1006','finn@example.com','device','Copper Home','Night Sky','CH-NSK',null,149, now() - interval '10 days','none');
