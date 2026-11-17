import { connection } from "next/server";
import { Suspense } from "react";
import { AskCopper } from "@/components/copper/ask-copper";
import {
  AutoRefresh,
  DecideButtons,
  LimitForm,
} from "@/components/copper/support/console-controls";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { isAiConfigured } from "@/lib/ai/call";
import { formatUsd } from "@/lib/copper/catalog";
import { daysSince } from "@/lib/copper/refunds/rules";
import { getAutoRefundLimit } from "@/lib/copper/refunds/settings";
import { getStore, isDatabaseConfigured } from "@/lib/copper/refunds/store";
import type { RefundRequest } from "@/lib/copper/refunds/types";

export const metadata = { title: "Support · Copper State Labs" };

export default function SupportPage() {
  return (
    <div className="bg-secondary flex h-screen">
      <main className="flex-1 overflow-y-auto px-6 py-6">
        <Suspense fallback={<p className="text-sm">Loading the console…</p>}>
          <RefundConsole />
        </Suspense>
      </main>
      <aside className="bg-background hidden h-screen w-full max-w-md shrink-0 border-l md:block">
        <AskCopper aiConfigured={isAiConfigured()} docked />
      </aside>
    </div>
  );
}

const STATUS_STYLE: Record<RefundRequest["status"], string> = {
  pending: "bg-chart-4 text-chart-5",
  approved: "bg-accent text-white",
  rejected: "bg-chart-3 text-white",
};

async function RefundConsole() {
  await connection();
  const store = getStore();
  const [limit, orders, requests] = await Promise.all([
    getAutoRefundLimit(),
    store.listAllOrders(),
    store.listRequests(),
  ]);
  const pending = requests.filter((r) => r.status === "pending");
  const decided = requests.filter((r) => r.status !== "pending");

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <AutoRefresh />
      <header className="space-y-3">
        <div>
          <h1 className="text-2xl font-bold">Refund Console</h1>
          <p className="text-muted-foreground text-sm">
            Refunds under the limit are approved by the Refund agent on its own.
            Refunds at or over it wait here for you.
            {!isDatabaseConfigured() && " (Demo memory store.)"}
          </p>
        </div>
        <div className="bg-card rounded-xl border p-4">
          <LimitForm key={limit} limit={limit} />
          <p className="text-muted-foreground mt-2 text-xs">
            Now: refunds under {formatUsd(limit)} are automatic.
          </p>
        </div>
      </header>

      <section>
        <h2 className="mb-2 text-lg font-semibold">
          Waiting for approval ({pending.length})
        </h2>
        <div className="bg-card rounded-xl border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Request</TableHead>
                <TableHead>Customer</TableHead>
                <TableHead>Item</TableHead>
                <TableHead>Reason</TableHead>
                <TableHead>Decision</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {pending.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="text-muted-foreground">
                    Nothing is waiting.
                  </TableCell>
                </TableRow>
              )}
              {pending.map((r) => (
                <TableRow
                  key={r.id}
                  data-testid="pending-row"
                  className="align-top"
                >
                  <TableCell className="font-mono">{r.id}</TableCell>
                  <TableCell>{r.customer_email}</TableCell>
                  <TableCell>
                    {r.product}
                    <br />
                    <span className="font-semibold">
                      {formatUsd(r.amount_usd)}
                    </span>
                  </TableCell>
                  <TableCell className="max-w-xs whitespace-normal">
                    “{r.reason}”
                  </TableCell>
                  <TableCell>
                    <DecideButtons id={r.id} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </section>

      <section>
        <h2 className="mb-2 text-lg font-semibold">
          Decided ({decided.length})
        </h2>
        <div className="bg-card rounded-xl border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Request</TableHead>
                <TableHead>Customer</TableHead>
                <TableHead>Item</TableHead>
                <TableHead>Result</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {decided.length === 0 && (
                <TableRow>
                  <TableCell colSpan={4} className="text-muted-foreground">
                    No decisions yet.
                  </TableCell>
                </TableRow>
              )}
              {decided.map((r) => (
                <TableRow key={r.id} data-testid="decided-row">
                  <TableCell className="font-mono">{r.id}</TableCell>
                  <TableCell>{r.customer_email}</TableCell>
                  <TableCell>
                    {r.product} · {formatUsd(r.amount_usd)}
                  </TableCell>
                  <TableCell>
                    <Badge className={STATUS_STYLE[r.status]}>
                      {r.status === "approved" ? "refunded" : "rejected"}
                    </Badge>
                    <p className="text-muted-foreground mt-1 text-xs">
                      {r.admin_note ?? "Approved by an admin"}
                    </p>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </section>

      <section>
        <h2 className="mb-2 text-lg font-semibold">Orders</h2>
        <div className="bg-card rounded-xl border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Order</TableHead>
                <TableHead>Customer</TableHead>
                <TableHead>Item</TableHead>
                <TableHead>Bought</TableHead>
                <TableHead>Refund</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {orders.map((o) => (
                <TableRow key={o.id} data-testid="order-row">
                  <TableCell className="font-mono">{o.id}</TableCell>
                  <TableCell>{o.customer_email}</TableCell>
                  <TableCell>
                    {o.product}
                    {o.color
                      ? `, ${o.color}`
                      : o.billing
                        ? `, ${o.billing}`
                        : ""}{" "}
                    · {formatUsd(o.amount_usd)}
                  </TableCell>
                  <TableCell>{daysSince(o.purchased_at)} days ago</TableCell>
                  <TableCell>
                    {o.refund_status === "none"
                      ? "–"
                      : o.refund_status === "pending"
                        ? "waiting"
                        : "refunded"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </section>
    </div>
  );
}
