import { connection } from "next/server";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { logout } from "@/app/admin/actions";
import { DecisionForm } from "@/components/copper/admin/decision-form";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { isAdmin } from "@/lib/copper/admin/session";
import { formatUsd } from "@/lib/copper/catalog";
import { getStore, isDatabaseConfigured } from "@/lib/copper/refunds/store";
import type { RefundRequest } from "@/lib/copper/refunds/types";

export const metadata = { title: "Refund requests · Copper admin" };

export default function AdminPage() {
  return (
    <main className="bg-secondary min-h-screen px-4 py-8">
      <div className="mx-auto max-w-6xl space-y-8">
        <Suspense fallback={<p className="text-sm">Loading…</p>}>
          <Requests />
        </Suspense>
      </div>
    </main>
  );
}

const STATUS_STYLE: Record<RefundRequest["status"], string> = {
  pending: "bg-chart-4 text-chart-5",
  approved: "bg-accent text-white",
  rejected: "bg-chart-3 text-white",
};

async function Requests() {
  await connection();
  if (!(await isAdmin())) redirect("/admin/login");
  const store = getStore();
  const [requests, stock] = await Promise.all([
    store.listRequests(),
    store.listInventory(),
  ]);
  const pending = requests.filter((r) => r.status === "pending");
  const decided = requests.filter((r) => r.status !== "pending");

  return (
    <>
      <header className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Refund requests</h1>
          <p className="text-muted-foreground text-sm">
            {pending.length} waiting for review
            {!isDatabaseConfigured() &&
              " · demo memory store (resets on restart)"}
          </p>
        </div>
        <form action={logout}>
          <Button variant="outline" size="sm" type="submit">
            Sign out
          </Button>
        </form>
      </header>

      <RequestTable title="Pending" rows={pending} actions />
      <RequestTable title="Decided" rows={decided} />

      <section>
        <h2 className="mb-2 text-lg font-semibold">Stock</h2>
        <div className="bg-card rounded-xl border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>SKU</TableHead>
                <TableHead>Product</TableHead>
                <TableHead>Color</TableHead>
                <TableHead className="text-right">In stock</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {stock.map((row) => (
                <TableRow key={row.sku} data-testid="stock-row">
                  <TableCell className="font-mono">{row.sku}</TableCell>
                  <TableCell>{row.product}</TableCell>
                  <TableCell>{row.color}</TableCell>
                  <TableCell className="text-right font-mono">
                    {row.units_in_stock}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </section>
    </>
  );
}

function RequestTable({
  title,
  rows,
  actions = false,
}: {
  title: string;
  rows: RefundRequest[];
  actions?: boolean;
}) {
  return (
    <section>
      <h2 className="mb-2 text-lg font-semibold">{title}</h2>
      <div className="bg-card rounded-xl border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Request</TableHead>
              <TableHead>Customer</TableHead>
              <TableHead>Order</TableHead>
              <TableHead>Reason and rule</TableHead>
              <TableHead>Status</TableHead>
              {actions && <TableHead>Decision</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 && (
              <TableRow>
                <TableCell
                  colSpan={actions ? 6 : 5}
                  className="text-muted-foreground"
                >
                  Nothing here.
                </TableCell>
              </TableRow>
            )}
            {rows.map((r) => (
              <TableRow
                key={r.id}
                data-testid="refund-row"
                className="align-top"
              >
                <TableCell className="font-mono">{r.id}</TableCell>
                <TableCell>{r.customer_email}</TableCell>
                <TableCell>
                  <span className="font-mono">{r.order_id}</span>
                  <br />
                  {r.product} · {formatUsd(r.amount_usd)}
                </TableCell>
                <TableCell className="max-w-xs whitespace-normal">
                  “{r.reason}”
                  <p className="text-muted-foreground text-xs">
                    {r.rule_applied}. {r.agent_summary}
                  </p>
                  {r.admin_note && (
                    <p className="text-xs">Admin note: {r.admin_note}</p>
                  )}
                </TableCell>
                <TableCell>
                  <Badge className={STATUS_STYLE[r.status]}>{r.status}</Badge>
                  <p className="text-muted-foreground mt-1 text-xs">
                    Agent says: {r.recommendation}
                  </p>
                </TableCell>
                {actions && (
                  <TableCell>
                    <DecisionForm id={r.id} isDevice={r.kind === "device"} />
                  </TableCell>
                )}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </section>
  );
}
