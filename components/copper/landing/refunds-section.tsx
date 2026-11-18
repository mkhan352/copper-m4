import { ClockIcon, MessageCircleIcon, ShieldCheckIcon } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
  ANNUAL_WINDOW_DAYS,
  DEVICE_WINDOW_DAYS,
} from "@/lib/copper/refunds/rules";

// Returns and refunds on the home page. The numbers come from the same rules
// the Refund agent uses, so the page and the chat always agree.
const POINTS = [
  {
    icon: ClockIcon,
    title: `Devices: ${DEVICE_WINDOW_DAYS} days`,
    text: `Copper Home and Copper Notes can be refunded within ${DEVICE_WINDOW_DAYS} days of purchase.`,
  },
  {
    icon: ShieldCheckIcon,
    title: `Copper Plus yearly: ${ANNUAL_WINDOW_DAYS} days`,
    text: `A yearly plan can be refunded within ${ANNUAL_WINDOW_DAYS} days. Monthly plans aren't refunded for part of a month.`,
  },
  {
    icon: MessageCircleIcon,
    title: "Ask in the chat",
    text: "Copper hands you to our Refund specialist, who checks your order and files the refund. Smaller refunds go through right away; larger ones are checked by our team.",
  },
];

export function RefundsSection() {
  return (
    <section
      data-testid="refunds-section"
      id="refunds"
      className="bg-secondary scroll-mt-20"
    >
      <div className="mx-auto max-w-6xl px-4 py-16 md:py-24">
        <div className="mb-10 text-center">
          <h2 className="font-heading text-3xl font-bold sm:text-4xl">
            Returns and refunds
          </h2>
          <p className="text-muted-foreground mx-auto mt-3 max-w-xl text-lg">
            Changed your mind? Ask Copper with the email on your order.
          </p>
        </div>
        <div className="grid gap-6 md:grid-cols-3">
          {POINTS.map(({ icon: Icon, title, text }) => (
            <div key={title} className="bg-card rounded-2xl border p-6">
              <Icon aria-hidden className="text-primary mb-3 size-6" />
              <h3 className="font-heading text-lg font-bold">{title}</h3>
              <p className="text-muted-foreground mt-2">{text}</p>
            </div>
          ))}
        </div>
        <div className="mt-10 flex flex-wrap justify-center gap-3">
          <Button asChild size="lg">
            <a href="#ask">Ask Copper for a refund</a>
          </Button>
          <Button asChild size="lg" variant="outline">
            <Link href="/support">Go to Support</Link>
          </Button>
        </div>
      </div>
    </section>
  );
}
