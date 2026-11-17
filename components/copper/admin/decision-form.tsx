"use client";

import { useState, useTransition } from "react";
import { decide } from "@/app/admin/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const MESSAGES: Record<string, string> = {
  approved: "Approved. Simulated payout sent.",
  rejected: "Rejected.",
  already_decided: "Someone already decided this request.",
  not_signed_in: "Please sign in again.",
  unavailable: "Couldn't save that. Try again.",
};

export function DecisionForm({
  id,
  isDevice,
}: {
  id: string;
  isDevice: boolean;
}) {
  const [message, setMessage] = useState("");
  const [pending, start] = useTransition();

  function submit(decision: "approve" | "reject", form: HTMLFormElement) {
    const data = new FormData(form);
    data.set("id", id);
    data.set("decision", decision);
    start(async () => {
      const result = await decide(data);
      setMessage(
        result.status === "approved" && result.restocked
          ? "Approved. Simulated payout sent, and the device is back in stock."
          : (MESSAGES[result.status] ?? ""),
      );
    });
  }

  return (
    <form
      onSubmit={(event) => event.preventDefault()}
      className="flex flex-col gap-2"
    >
      <Input
        name="note"
        aria-label="Note (optional)"
        placeholder="Note (optional)"
      />
      <div className="flex gap-2">
        <Button
          type="button"
          size="sm"
          disabled={pending}
          onClick={(event) => submit("approve", event.currentTarget.form!)}
        >
          Approve{isDevice ? " + restock" : ""}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={pending}
          onClick={(event) => submit("reject", event.currentTarget.form!)}
        >
          Reject
        </Button>
      </div>
      {message && (
        <p role="status" className="text-muted-foreground text-xs">
          {message}
        </p>
      )}
    </form>
  );
}
