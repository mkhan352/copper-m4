"use client";

// The small interactive pieces of the Refund Console: keeping it fresh, the
// Approve / Reject buttons and the auto-refund limit box.
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { changeAutoRefundLimit, decideInConsole } from "@/app/support/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  REFUND_DECIDED_EVENT,
  type RefundDecidedDetail,
} from "@/lib/copper/refunds/events";

/** Reloads the console's data every few seconds, so new requests appear. */
export function AutoRefresh({ seconds = 3 }: { seconds?: number }) {
  const router = useRouter();
  useEffect(() => {
    const timer = setInterval(() => router.refresh(), seconds * 1000);
    return () => clearInterval(timer);
  }, [router, seconds]);
  return null;
}

export function DecideButtons({ id }: { id: string }) {
  const [message, setMessage] = useState("");
  const [pending, start] = useTransition();

  function decide(decision: "approved" | "rejected") {
    start(async () => {
      const { result, detail } = await decideInConsole(id, decision);
      if (detail) {
        // Tell the chat, so the customer hears about it.
        window.dispatchEvent(
          new CustomEvent<RefundDecidedDetail>(REFUND_DECIDED_EVENT, {
            detail,
          }),
        );
      }
      if (result.status === "already_decided") setMessage("Already decided.");
      else if (result.status === "unavailable") setMessage("Try again.");
    });
  }

  return (
    <div className="flex flex-col gap-1">
      <div className="flex gap-2">
        <Button size="sm" disabled={pending} onClick={() => decide("approved")}>
          Approve
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={pending}
          onClick={() => decide("rejected")}
        >
          Reject
        </Button>
      </div>
      {message && (
        <p role="status" className="text-muted-foreground text-xs">
          {message}
        </p>
      )}
    </div>
  );
}

export function LimitForm({ limit }: { limit: number }) {
  const [value, setValue] = useState(String(limit));
  const [message, setMessage] = useState("");
  const [pending, start] = useTransition();

  function save() {
    start(async () => {
      const { ok } = await changeAutoRefundLimit(Number(value));
      setMessage(ok ? "Saved." : "Enter a dollar amount, 0 or more.");
    });
  }

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        save();
      }}
      className="flex flex-wrap items-center gap-2"
    >
      <label htmlFor="auto-limit" className="text-sm font-medium">
        Auto-refund limit
      </label>
      <div className="flex items-center gap-1">
        <span className="text-sm">$</span>
        <Input
          id="auto-limit"
          type="number"
          min={0}
          step="1"
          value={value}
          onChange={(event) => setValue(event.target.value)}
          className="w-24"
        />
      </div>
      <Button type="submit" size="sm" disabled={pending}>
        Save
      </Button>
      {message && (
        <span role="status" className="text-muted-foreground text-xs">
          {message}
        </span>
      )}
    </form>
  );
}
