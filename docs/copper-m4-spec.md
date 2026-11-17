# Copper M4: Refund Agent: Build Spec

Status: DRAFT for review. Nothing is built yet.
Source: the architecture sketch (IMG_6340) plus the answers below.

## 1. Goal

Add a **Refund agent** to Copper State Labs. A customer chats with Ask Copper. When they want money back, Copper hands the conversation to a specialist Refund agent. The Refund agent looks up the customer's orders, checks the refund rules, and files a refund request. A human **admin** reviews each request on an `/admin` page and approves or rejects it. Approving a device refund puts the item back in stock.

## 2. Decisions already made

| Topic | Decision |
|---|---|
| Repo | New public GitHub repo `mkhan352/copper-m4`, in a new folder `copper-m4` next to `copper-m3` (not inside it) |
| Starting code | A copy of `copper-m3` at its latest commit (keeps Ask Copper, `search_docs`, PDFs, embeddings). Fresh git history, one first commit |
| Data storage | Supabase Postgres (orders, refund requests, stock) |
| Admin sign-in | One admin password in an env var, checked on `/admin` |
| Customer identity | Customer types a demo email in the chat widget; seeded demo customers each have orders |
| `update_availability` | Adds the returned unit back to stock. Runs only when an admin approves a device refund (never from the chat) |
| Model | Same free `google/gemini-3.1-flash-lite` through `lib/ai/call.ts` |
| Hosting | New Vercel project in the **uzair** team (`uzair-dd57`), linked to the repo; same Gemini key reused |

## 3. Architecture (from the sketch)

**Copper Support agent** (the existing Ask Copper). Tools:
1. `get_products` (exists)
2. `get_prices` (exists)
3. `calculate_cost` (exists)
4. `check_availability` (exists)
5. `search_docs` (exists)
6. **`hand_to_refund`** (new): passes the conversation to the Refund agent.

**Refund agent** (new). Tools:
1. **`get_purchase_history`**: the customer's orders.
2. **`update_availability`**: stock +1 for a returned item (see 7).
3. **`get_refund_rules`**: the refund policy for a given order.
4. **`request_refund`**: creates a pending refund request for admin review.
5. **`hand_to_copper`**: passes the conversation back to Copper Support.

```
Customer -> Ask Copper -- hand_to_refund --> Refund agent -- request_refund --> refund_requests (pending)
                 ^                               |                                     |
                 +------- hand_to_copper --------+                           Admin /admin: Approve | Reject
                                                                                       |
                                                                       approve -> update_availability (+1 stock)
```

Handoff design: one chat, one message list. A `activeAgent` value (`"copper" | "refund"`) is kept by the chat panel and sent with each request. The server picks that agent's instructions and tools. `hand_to_*` tools return `{ handoff: "refund" | "copper", summary }`; the server sees this, switches the active agent and continues the same turn so the customer never has to repeat themselves. The panel shows a small "Now talking to: Refund specialist" badge and a handoff card in the tool list.

## 4. Data model (Supabase)

`customers`: `email` (pk), `name`.
`orders`: `id` (pk, e.g. `ORD-1001`), `customer_email` (fk), `kind` (`device` | `plan`), `product` (`Copper Home` | `Copper Notes` | `Copper Plus`), `color` (nullable), `sku` (nullable, matches inventory), `billing` (`monthly` | `annual` | null), `amount_usd`, `purchased_at`, `refund_status` (`none` | `pending` | `refunded`).
`inventory`: `sku` (pk), `product`, `color`, `units_in_stock`, `next_shipment`. (Replaces `inventory.json`; `readInventory()` keeps its signature and now reads this table. It is the only file that knows where stock lives.)
`refund_requests`: `id` (uuid), `order_id` (fk), `customer_email`, `reason` (text, customer's words), `agent_summary` (text), `amount_usd`, `rule_applied` (text), `recommendation` (`approve` | `reject`), `status` (`pending` | `approved` | `rejected`), `admin_note` (nullable), `created_at`, `decided_at` (nullable).
`ai_calls` stays as it is (console logging per the repo convention).

A SQL file `supabase/schema.sql` creates the tables; `supabase/seed.sql` seeds them. Server-only access with the service-role key (never exposed to the browser). Row Level Security on, no public policies.

### Seed data (so every demo path works)
Rules below are relative to a fixed "today" read from `new Date()`, so seed `purchased_at` as offsets (the seed script computes dates).

| Customer | Order | Purpose |
|---|---|---|
| `ava@example.com` | Copper Home, Polished Copper, 10 days ago | Device inside 30-day window: eligible |
| `ben@example.com` | Copper Notes, Night Sky, 45 days ago | Device past 30 days: not eligible |
| `cara@example.com` | Copper Plus annual, 5 days ago | Annual within 14 days: eligible |
| `dan@example.com` | Copper Plus annual, 40 days ago | Annual past 14 days: not eligible |
| `eve@example.com` | Copper Plus monthly, 20 days ago | Monthly: no partial-month refund |
| `finn@example.com` | Copper Home (10 days ago) with a refund already pending | Duplicate request is blocked |

## 5. Refund rules (from Product Bible, reflected in code)

Rules live in `lib/copper/refunds/rules.ts` as plain code (pure functions, unit-tested). `get_refund_rules` returns the matching rule and a clear `eligible` yes/no for a specific order. The model never decides eligibility itself.

- **Devices:** 30-day return window from purchase. Eligible if within 30 days and not already refunded or pending.
- **Copper Plus annual:** refundable within 14 days of purchase.
- **Copper Plus monthly:** not refunded for partial months. Not eligible.
- **Exceptions** (outage/bug credits, trial extensions) are supervisor-only per the Product Bible and are **out of scope**: the agent must say it can't do those and suggest contacting the Copper Crew.
- Do not touch the Product Bible's conflicting/outdated facts (project rule). Rules are implemented from the 2026 policy lines only.
- `request_refund` re-checks eligibility server-side. It refuses ineligible orders, duplicates and orders belonging to another customer. The model cannot bypass this by wording.

## 6. Tool contracts (zod inputs, plain-data outputs)

All tools live under `lib/copper/refunds/` (Refund agent) and `lib/copper/assistant/` (Copper). Each returns `{ status: "ok" | ..., ... }` and never throws to the model.

- `hand_to_refund({ summary })` -> `{ handoff: "refund", summary }`
- `hand_to_copper({ summary })` -> `{ handoff: "copper", summary }`
- `get_purchase_history({})` -> orders for the customer email in the session (the email comes from server context, **not** from model input, so the model can't read someone else's orders). Returns `status: "need_email"` if none was given.
- `get_refund_rules({ orderId })` -> `{ orderId, eligible, rule, reason, refundUsd, daysSincePurchase }`
- `request_refund({ orderId, reason })` -> `{ status: "created", requestId, recommendation } | { status: "not_eligible", reason } | { status: "duplicate" } | { status: "not_found" }`. Always creates `pending`. It never approves anything itself.
- `update_availability({ sku })` -> `{ status: "ok", sku, unitsInStock }`. **Not offered to the chat model.** It exists as a tool (per the sketch) but is only callable by the approve action (section 7). If the chat model had it, a customer could raise stock. See 11 for how it is exposed.

## 7. Admin profile

- Route `/admin` (and `/admin/login`). Password from env `ADMIN_PASSWORD`. Login sets an httpOnly, signed cookie (`jose` JWT or HMAC with env `ADMIN_SESSION_SECRET`). All `/admin` pages and admin Server Actions check it. Wrong password shows an error, no crash.
- `/admin` lists refund requests, **Pending** first, then Decided. Each row: request id, customer, order, product, amount, reason, agent summary, rule applied, recommendation badge, status, created time.
- Pending rows have **Approve** and **Reject** buttons, plus an optional note field. Both are Server Actions.
- **Approve:** sets request `approved`, order `refund_status = refunded`, sets `decided_at`, and for `kind = device` calls `update_availability(sku)` (stock +1). Plan refunds don't touch stock. The "refund issued" step is simulated (no real payment); the UI says "Simulated payout".
- **Reject:** sets request `rejected`, order back to `refund_status = none`, stores the note.
- Deciding twice is blocked (only `pending` rows can be decided; done in one SQL update with `where status = 'pending'`).
- A small stock table on the admin page shows current units so the +1 is visible.
- Uses shadcn components already in the repo (`table`, `badge`, `button`, `card`, `textarea` if missing via `npx shadcn@4.21.4 add <name>`).
- Customer-facing: the chat tells the customer the request is **pending review** and gives the request id. A simple `/refund-status` isn't included (out of scope); status is shown if they ask the Refund agent again (add a `get_purchase_history` field `refundStatus`).

## 8. Chat UI changes (`components/copper/ask-copper.tsx`)

- Email field at the top of the panel ("Your order email", pre-filled dropdown of the 6 demo emails + free text). Stored in component state and sent with each request. Not sent to the model as text; the server puts it into tool context.
- Agent badge showing who's active, and a handoff card when it changes.
- Tool cards for the new tools: purchase history (small table), rules (eligible/not with reason), refund request (id + "pending review").
- Existing behavior stays: citations, search_docs card, thinking summaries.
- `SetupRequired` shown if the model key or Supabase isn't configured; never crash.

## 9. Server changes

- `lib/copper/assistant/ask.ts`: accepts `{ messages, useTools, activeAgent, customerEmail }`. Builds the agent config:
  - `copper`: `COPPER_INSTRUCTIONS` + 6 tools
  - `refund`: `REFUND_INSTRUCTIONS` + 4 tools (`get_purchase_history`, `get_refund_rules`, `request_refund`, `hand_to_copper`); `update_availability` withheld, see 11
- Handoff flow: when a step contains a `hand_to_*` result, switch agent and run another model segment with the new instructions and tools, within the same overall step cap (raise `MAX_STEPS` to 8). The final progress returns `activeAgent` so the panel stays in sync.
- All calls through `callStream` (feature `"ask-copper"` / `"refund-agent"` logged separately). No direct provider calls.
- Tool context: `customerEmail` is closed over per request (factory `makeRefundTools(email)`), never a model argument.

## 10. Agent instructions (`lib/copper/refunds/instructions.ts`)

Refund agent rules:
- Be brief, kind, plain English.
- First call `get_purchase_history`; if the order is unclear, ask which one (list by id and product).
- Call `get_refund_rules` for the chosen order before saying anything about eligibility. Only state what the rules tool returned.
- If eligible and the customer wants it, call `request_refund` with their reason in their own words. Tell them it is **pending admin review** and give the request id. Never say a refund is approved or issued.
- If not eligible, explain the rule in one sentence and do not file a request. Offer the Copper Crew for exceptions.
- Never reveal other customers' data. Never promise stock, money or timing.
- Non-refund questions: call `hand_to_copper`.
Copper instructions add: for refund, return or "money back" requests call `hand_to_refund` (and keep policy questions like "what is the refund policy" on `search_docs` with citations).

## 11. Open item for you (decide when reviewing)

The sketch lists `update_availability` among the Refund agent's tools. Giving it to the chat model means a prompt could add stock. My spec withholds it from the model and calls it only on admin approval, so the tool exists and is in the sketch's list but is run by the approve button. If you instead want the agent itself to call it right after `request_refund` (and have it count only on approval), say so and I'll change section 9.

## 12. Tests (vitest, all mock-model, no cost)

- `rules.test.ts`: every seed case (window edges: day 30 yes, day 31 no; annual day 14 yes, day 15 no; monthly no; duplicate; already refunded).
- `refund-tools.test.ts`: `request_refund` refuses ineligible, duplicate, other customer's order; `get_purchase_history` only returns the session customer's orders; never auto-approves.
- `admin.test.ts`: approve and reject Server Actions (stock +1 on device approval only; no double decision; unauthenticated call is refused).
- `handoff.test.ts`: Copper calls `hand_to_refund`, active agent switches, tools/instructions swap, `hand_to_copper` switches back.
- `ask-copper.test.tsx` additions: email field, agent badge, new tool cards.
- Existing 149 tests keep passing. A Supabase test double (in-memory) is used in tests; real Supabase only runs in the app and in one manual check.

## 13. Build order (for smooth development)

1. **Repo and base:** create `copper-m4` folder (sibling of m3), copy m3 without `.git`, `.env.local`, `.vercel`, `node_modules`; `git init`; `gh repo create mkhan352/copper-m4 --public`; `npm ci`; confirm `npm test` is green; push.
2. **Vercel:** create project in team `uzair-dd57` linked to the repo; copy the Gemini key via a hidden terminal prompt (never printed).
3. **Supabase:** you create a Supabase project (see 14); add `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` via hidden prompts to `.env.local` and Vercel; I run `schema.sql` and `seed.sql`.
4. **Data layer:** `lib/copper/refunds/db.ts` (Supabase client + in-memory fake for tests), orders/refunds/inventory repositories; switch `readInventory()` to the table.
5. **Rules** + tests.
6. **Refund tools** + tests.
7. **Agent switching** in `ask.ts` + instructions + tests.
8. **Chat UI** (email, badge, cards) + tests.
9. **Admin:** login, list, approve/reject, stock table + tests.
10. **Docs:** add a "Module 4" section to `docs/architecture.md`; update `README`.
11. **Quality gate:** `npm test`, `npm run lint`, `npm run typecheck`, then a live run in the browser: ava asks for a refund -> request appears in `/admin` -> approve -> stock +1.
12. **Deploy** to Vercel, verify the live URL end to end.

## 14. What I need from you (the only manual parts)

- Create a free Supabase project (supabase.com, takes ~2 minutes) and tell me when it's ready. I'll give exact steps and hidden-prompt commands for the keys. If you'd rather use another database, tell me.
- Choose an admin password via a hidden terminal prompt (never typed in chat).

## 15. Acceptance criteria

1. The live site opens Ask Copper; setup/warranty questions still answer from the PDFs with citations.
2. As `ava@example.com`, "I want a refund for my Copper Home" -> hand-off badge, purchase history, rule check, pending request with an id.
3. As `ben@example.com` (45 days), the agent explains the 30-day rule and files nothing.
4. `eve@example.com` (monthly) is told monthly plans aren't refunded for partial months.
5. `finn@example.com` can't create a duplicate request.
6. `/admin` needs the password; shows pending requests; **Approve** marks it approved, order refunded and device stock +1; **Reject** records the note.
7. A refund can never be approved or stock changed from the chat.
8. All tests, lint and typecheck pass; Vercel deployment is live.

## 16. Out of scope

Real payments, real customer accounts, email notifications, supervisor exception playbook, partial refunds, multiple units per order, customer-facing refund tracking page.
