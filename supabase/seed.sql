-- Demo data for Copper M4 (same as lib/copper/refunds/seed.ts). Safe to re-run.
delete from refund_requests;
delete from orders;
delete from customers;
delete from inventory;
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
  ('ORD-1006','finn@example.com','device','Copper Home','Night Sky','CH-NSK',null,149, now() - interval '10 days','pending');
insert into refund_requests (id, order_id, customer_email, kind, product, sku, reason, agent_summary, amount_usd, rule_applied, recommendation, status, created_at) values
  ('REQ-1000','ORD-1006','finn@example.com','device','Copper Home','CH-NSK','The device is too big for my desk.','Device bought 10 days ago, inside the 30-day window.',149,'Devices: 30-day return window','approve','pending', now() - interval '2 days');
