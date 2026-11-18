# Copper M4: Refund Agent: Spec (updated to match what was built)

Status: BUILT and deployed. Live: https://copper-m4-sage.vercel.app (Support page: `/support`, admin: `/admin`). Repo: https://github.com/mkhan352/copper-m4 (branch `main`).
This file started as the build plan from the architecture sketch and now records what the app actually does, including later changes (auto-refund limit, Support page, decision notices).

## 1. Goal

A customer chats with Ask Copper. When they want money back, Copper hands the chat to a separate Refund agent. The Refund agent looks up the customer's orders, checks the refund rules and files a refund request. Refunds under the **auto-refund limit** are approved automatically by the agent. Refunds at or over the limit wait for a person to Approve or Reject in the Refund Console. The customer is told the result in the chat.

## 2. Decisions

| Topic | Decision |
|---|---|
| Repo | `mkhan352/copper-m4`, a sibling folder of `copper-m3`, started as a copy of it (keeps Ask Copper, `search_docs`, PDFs, embeddings) |
| Data | Supabase Postgres (orders, refund requests, stock, settings). Without Supabase settings the app falls back to an in-memory demo store that resets on restart |
| Admin sign-in | `/admin` uses one password (`ADMIN_PASSWORD`), signed httpOnly cookie |
| Support page | `/support` has the Refund Console and the chat docked on the right. The console is **open** (no password), for the class demo; `/admin` is the protected version |
| Customer identity | The customer types a demo email in the chat panel. The server fixes the email for the tools, so the model can't read other customers' orders |
| Auto-refund limit | Default **$100**, changeable in the Refund Console, saved in the `settings` table. A refund is automatic only if it is eligible and **strictly below** the limit |
| `update_availability` | Adds one unit back to stock. Runs only after a **device** refund is approved, whether by the agent (under the limit) or an admin. It is not a tool the chat model can call |
| Model | Free `google/gemini-3.1-flash-lite` through `lib/ai/call.ts` |
| Hosting | Vercel project `copper-m4` in the `uzair` team, connected to the GitHub repo |

## 3. Architecture

**Copper Support** (Ask Copper) tools: `get_products`, `get_prices`, `calculate_cost`, `check_availability`, `search_docs`, and **`hand_to_refund`**.

**Refund agent** tools: `get_purchase_history`, `get_refund_rules`, `request_refund`, `hand_to_copper`.
(`update_availability` is run by code, see below, so it is not offered to the model.)

```
Customer -> Ask Copper -- hand_to_refund --> Refund agent
                 ^                               |
                 +------- hand_to_copper --------+
                                                 |
                      get_purchase_history, get_refund_rules, request_refund
                                                 |
                    eligible and under limit  ->  auto-approved (stock +1 for a device)
                    eligible, at/over limit   ->  pending -> Refund Console: Approve | Reject
                    not eligible              ->  explained, nothing filed
```

Handoff design: one chat, one message list. The panel keeps the active agent (`copper` or `refund`) and sends it with each question. The server (`lib/copper/assistant/ask.ts`) picks that agent's instructions and tools. A `hand_to_*` result ends the current segment, switches the agent and starts a new segment in the same turn (at most 2 handoffs). The first agent's text is replaced by the new agent's answer. The panel shows who is answering and lists each agent's own tools.

## 4. Data model (Supabase; SQL in `supabase/schema.sql` and `supabase/seed.sql`)

- `customers` (`email`, `name`)
- `orders` (`id`, `customer_email`, `kind` device|plan, `product`, `color`, `sku`, `billing` monthly|annual, `amount_usd`, `purchased_at`, `refund_status` none|pending|refunded)
- `inventory` (`sku`, `product`, `color`, `units_in_stock`, `next_shipment`); `readInventory()` reads this table
- `refund_requests` (`id` like `REQ-1001`, `order_id`, `customer_email`, `kind`, `product`, `sku`, `reason`, `agent_summary`, `amount_usd`, `rule_applied`, `recommendation`, `status` pending|approved|rejected, `admin_note`, `created_at`, `decided_at`)
- `settings` (`key`, `value`): holds `auto_refund_limit_usd`
- Row Level Security is on with no public policies; only the server (service-role key) reads or writes.
- Re-running `seed.sql` resets the demo data, including stock and the limit ($100).

### Demo customers (type the email in the chat panel)

| Customer | Order | What it shows |
|---|---|---|
| `ava@example.com` | Copper Home, $149, 10 days ago | Over the limit: waits for approval |
| `finn@example.com` | Copper Home, $149, 10 days ago | Over the limit: waits (good one to Reject) |
| `cara@example.com` | Copper Plus annual, $79, 5 days ago | Under the limit: automatic |
| `ben@example.com` | Copper Notes, $129, 45 days ago | Past the 30-day window: refused |
| `dan@example.com` | Copper Plus annual, $79, 40 days ago | Past the 14-day window: refused |
| `eve@example.com` | Copper Plus monthly, $7.99, 20 days ago | Monthly: no partial-month refund |

## 5. Refund rules (`lib/copper/refunds/rules.ts`, plain code, unit-tested)

- Devices: eligible within 30 days of purchase (day 30 yes, day 31 no).
- Copper Plus annual: eligible within 14 days (day 14 yes, day 15 no).
- Copper Plus monthly: never refunded for a partial month.
- One request per order: an order with a pending or finished refund is not eligible again.
- Auto-approval: `eligible && refundUsd > 0 && refundUsd < limit`. The limit is the saved setting, else `AUTO_REFUND_LIMIT_USD`, else $100.
- The model never decides eligibility or auto-approval. `get_refund_rules` reports it and `request_refund` re-checks it on the server, so no wording from the model or customer can skip the rules.
- Out of scope: supervisor exceptions (outage credits, trial extensions). The agent says it can't do those and suggests the Copper Crew.

## 6. Tools

- `hand_to_refund({ summary })`, `hand_to_copper({ summary })` return `{ handoff, summary }`.
- `get_purchase_history()` returns the signed-in customer's orders, or `need_email`.
- `get_refund_rules({ orderId })` returns `eligible`, `rule`, `reason`, `refundUsd`, `daysSincePurchase`, `autoApproved`, `autoRefundLimitUsd`. Other customers' orders return `not_found`.
- `request_refund({ orderId, reason })` returns one of:
  - `auto_approved` (under the limit): the request is created and approved at once with the note "Auto-approved: under the $X limit"; a device goes back in stock.
  - `created` (at or over the limit): pending, for the Refund Console.
  - `not_eligible`, `not_found`, `need_email`, `unavailable`.
- `update_availability` (`lib/copper/refunds/availability.ts`) adds stock for a SKU. It is run by `decideRefund` after an approval of a device refund, never by the chat model.

## 7. Refund Console and admin

**`/support`** (open): the Refund Console on the left, the chat docked on the right. It shows:
- The auto-refund limit with a Save button.
- Waiting for approval: each request with customer, item and amount, reason, and **Approve** and **Reject** buttons.
- Decided requests (refunded or rejected, with the note, for example "Auto-approved: under the $100 limit").
- All orders with their refund status.
- The page refreshes every 3 seconds, so new requests appear without reloading.
- When Approve or Reject is clicked, the page sends a browser event and the chat shows a message to the customer whose email matches the chat's email box:
  - Approved: "Good news: a Copper admin approved your refund REQ-xxxx ... The refund has been issued."
  - Rejected: "... a Copper admin reviewed it and did not approve it, so your ... was not refunded and your payment stays as it was."

**`/admin`** (password): the same job with extra detail (reason, rule applied, agent recommendation, admin note field) and a stock table. Approve also restocks a device. The refund payout is simulated everywhere.

Deciding is safe:
- A request can be decided only once (a guarded update on `status = 'pending'`).
- Approve sets the order to `refunded`; Reject sets it back to `none` and leaves stock alone.
- Plan refunds never change stock.

## 8. Chat panel

- "Your order email" box with the six demo emails as suggestions.
- Badge showing who is answering (Copper, or Refund specialist) and each agent's tool list.
- Tool cards for the new tools: handoff, purchase history, rules (with "under the limit, no admin needed"), and the refund request (auto-approved or pending admin review).
- On `/support` the panel is docked (no pop-out); elsewhere it is the usual slide-over.
- Notices from the console appear as messages from the Refund specialist and are not sent to the model.

## 9. Agent instructions

- Copper (`lib/copper/assistant/instructions.ts`): for a refund or return of something the shopper bought, call `hand_to_refund`. Questions about what the refund policy says still use `search_docs` with citations.
- Refund agent (`lib/copper/refunds/instructions.ts`): call `get_purchase_history` first (ask for the email if missing); call `get_refund_rules` before saying anything about eligibility; if eligible and wanted, call `request_refund` and read its result. For `auto_approved`, say it is approved. For `created`, say it is waiting for an admin and never say it is approved or issued. If not eligible, say why in one sentence and file nothing. Non-refund questions go back with `hand_to_copper`.

## 10. Settings (names only)

`GOOGLE_GENERATIVE_AI_API_KEY`, `ADMIN_PASSWORD`, `ADMIN_SESSION_SECRET`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, optional `AUTO_REFUND_LIMIT_USD` (starting value only; the Refund Console's saved limit wins). Set in `.env.local` and in Vercel (production, preview, development).

## 11. Tests (vitest, no real model calls)

179 tests pass, plus lint, typecheck and the production build.
- `tests/refunds.test.ts`: every rule edge (days 30/31, 14/15, monthly, duplicate), the tools (own orders only, ineligible, duplicate, other customer, no email), admin decisions (restock only after approval and only for devices, reject keeps stock, decide once), the auto-refund limit (default, strictly-below, auto-approve with restock, over-limit waits, ineligible never auto), the saved limit overriding the default, and the console actions returning the notice text for approve and reject.
- `tests/handoff.test.ts`: Copper to Refund agent and back with a mock model, tools and instructions swap per agent, the customer's email reaches the tools, `update_availability` is never offered, instructions say what each agent must do.
- `tests/ask-copper.test.tsx` and the rest of the Module 2 and 3 tests still pass.

## 12. Acceptance (checked on the live site)

1. Under the limit: cara's $79 annual plan refund is approved automatically, with no admin step.
2. Over the limit: ava's $149 refund waits in the console; **Approve** refunds it and the chat tells her.
3. Over the limit: finn's $149 refund waits; **Reject** keeps the money and the chat tells him it was not refunded.
4. Copper hands refund requests to the separate Refund agent, and the chat shows the handoff.
5. The limit can be changed in the console and the next refund uses the new limit.
6. Nobody can approve or change stock from the chat; ineligible orders are never refunded.

## 13. Known limits and out of scope

- `/support` is open on purpose for the class demo (anyone with the link can approve). Put it behind the admin password before any real use.
- Real payments, real customer accounts, email notifications, partial refunds, multiple units per order, supervisor exceptions, and a customer-facing refund tracking page.
- The Gemini free tier has daily limits; heavy testing can return "Sorry, something went wrong".
- The build prints a notice that this Next.js version has a known security advisory; it has not been upgraded.
