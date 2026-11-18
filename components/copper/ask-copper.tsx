"use client";

// Ask Copper: the floating shopping chat. Each answer is drawn as a rail of
// stations (the tools on offer, Copper's thinking, each tool call with what
// went in and what came back), then the reply, so shoppers can see how the
// answer was worked out.
import {
  ArrowLeftIcon,
  ArrowRightIcon,
  ArrowUpIcon,
  BrainIcon,
  MessageCircleIcon,
  TriangleAlertIcon,
  WrenchIcon,
  XIcon,
} from "lucide-react";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { SetupRequired } from "@/components/setup-required";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetTitle,
} from "@/components/ui/sheet";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import { readLive } from "@/lib/ai/live";
import { askCopper, type ChatMessage } from "@/lib/copper/assistant/ask";
import {
  AGENT_LABELS,
  type AgentId,
  type Progress,
  type ToolStep,
  TOOL_LABELS,
  TOOLS_BY_AGENT,
} from "@/lib/copper/assistant/progress";
import { formatUsd, getPlans, getProducts } from "@/lib/copper/catalog";
import {
  decisionNotice,
  REFUND_DECIDED_EVENT,
  type RefundDecidedDetail,
} from "@/lib/copper/refunds/events";
import { refundUpdates } from "@/lib/copper/refunds/updates";
import { cn } from "@/lib/utils";

const STARTERS = [
  "How much is Copper Home with Copper Plus, paid yearly, for 2 years?",
  "Is Copper Notes in Night Sky in stock?",
  "Is Copper Plus cheaper monthly or yearly?",
  "I'd like a refund on my order.",
];

const DEMO_EMAILS = [
  "ava@example.com",
  "ben@example.com",
  "cara@example.com",
  "dan@example.com",
  "eve@example.com",
  "finn@example.com",
];

/** A `notice` is a message from the app (like "your refund was approved"). */
type Turn = {
  question: string;
  progress: Progress;
  notice?: boolean;
  /** For a notice: the refund request it is about. */
  requestId?: string;
};
type Chats = { tools: Turn[]; noTools: Turn[] };

const WORKING: Progress = { steps: [], reply: "", status: "working" };

export function AskCopper({
  aiConfigured,
  docked = false,
}: {
  aiConfigured: boolean;
  /** Show the chat as a column on the page (the Support page) instead of a pop-out. */
  docked?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [useTools, setUseTools] = useState(true);
  const [chats, setChats] = useState<Chats>({ tools: [], noTools: [] });
  const [draft, setDraft] = useState("");
  const [email, setEmail] = useState("");
  const body = useRef<HTMLDivElement>(null);

  const key = useTools ? "tools" : "noTools";
  const turns = chats[key];
  const busy = turns.at(-1)?.progress.status === "working";

  // Open from the header's #ask link or a page load at /#ask. Clicking the
  // link again fires no hashchange, so listen for the click too.
  useEffect(() => {
    const openOnHash = () => window.location.hash === "#ask" && setOpen(true);
    const openOnClick = (event: MouseEvent) => {
      if ((event.target as Element).closest?.('a[href$="#ask"]')) setOpen(true);
    };
    openOnHash();
    window.addEventListener("hashchange", openOnHash);
    document.addEventListener("click", openOnClick);
    return () => {
      window.removeEventListener("hashchange", openOnHash);
      document.removeEventListener("click", openOnClick);
    };
  }, []);

  useEffect(() => {
    if (body.current) body.current.scrollTop = body.current.scrollHeight;
  }, [chats, useTools]);

  // When an admin decides a refund in the Refund Console, tell the customer
  // here, if the decision is about the email this chat is using.
  const emailNow = useRef(email);
  useEffect(() => {
    emailNow.current = email;
  }, [email]);
  // Each decision is told once, whether it arrives as a browser event from the
  // console on this page or from checking the server (any page, or /admin).
  const told = useRef(new Set<string>());
  const tell = useRef((detail: RefundDecidedDetail) => {
    if (told.current.has(detail.requestId)) return;
    told.current.add(detail.requestId);
    const notice: Turn = {
      question: "",
      notice: true,
      requestId: detail.requestId,
      progress: {
        agent: "refund",
        steps: [],
        reply: decisionNotice(detail),
        status: "done",
      },
    };
    setChats((all) => ({ ...all, tools: [...all.tools, notice] }));
  });
  useEffect(() => {
    const onDecided = (event: Event) => {
      const detail = (event as CustomEvent<RefundDecidedDetail>).detail;
      if (detail.email.toLowerCase() !== emailNow.current.trim().toLowerCase())
        return;
      tell.current(detail);
    };
    window.addEventListener(REFUND_DECIDED_EVENT, onDecided);
    return () => window.removeEventListener(REFUND_DECIDED_EVENT, onDecided);
  }, []);

  // Refund requests this chat filed that are still waiting for a person.
  const toldIds = new Set(chats.tools.map((turn) => turn.requestId));
  const waiting = chats.tools
    .flatMap((turn) => turn.progress.steps)
    .flatMap((step) =>
      step.type === "tool" &&
      step.name === "request_refund" &&
      (step.output as { status?: string } | undefined)?.status === "created"
        ? [String((step.output as { requestId: string }).requestId)]
        : [],
    )
    .filter((id) => !toldIds.has(id));
  const waitingKey = waiting.join(",");
  useEffect(() => {
    if (!waitingKey || !email.trim()) return;
    const ids = waitingKey.split(",");
    let stopped = false;
    const check = async () => {
      try {
        const decided = await refundUpdates(email, ids);
        if (!stopped) decided.forEach((detail) => tell.current(detail));
      } catch {
        // Try again on the next tick.
      }
    };
    const timer = setInterval(check, 4000);
    return () => {
      stopped = true;
      clearInterval(timer);
    };
  }, [waitingKey, email]);

  async function send(question: string) {
    question = question.trim();
    if (!question || busy) return;
    setDraft("");
    const chat = key;
    const index = turns.length;
    // Only finished turns go to the model: questions and Copper's replies.
    const messages: ChatMessage[] = [
      ...turns
        .filter((turn) => !turn.notice)
        .flatMap(({ question, progress }): ChatMessage[] => [
          { role: "user", content: question },
          { role: "assistant", content: progress.reply },
        ]),
      { role: "user", content: question },
    ];
    const setProgress = (progress: Progress) =>
      setChats((all) => ({
        ...all,
        [chat]: all[chat].map((turn, i) =>
          i === index ? { ...turn, progress } : turn,
        ),
      }));
    setChats((all) => ({
      ...all,
      [chat]: [...all[chat], { question, progress: WORKING }],
    }));
    try {
      // Whoever answered last keeps the conversation until they hand it over.
      const activeAgent: AgentId =
        turns.findLast((turn) => turn.progress.agent)?.progress.agent ??
        "copper";
      const { progress } = await askCopper({
        messages,
        useTools: chat === "tools",
        activeAgent,
        customerEmail: email,
      });
      for await (const update of readLive(progress)) setProgress(update);
    } catch {
      setProgress({
        steps: [],
        reply: "Sorry, I couldn't reach Copper. Please try again.",
        status: "error",
      });
    }
  }

  return (
    <>
      {!open && !docked && (
        <Button
          data-testid="ask-copper-launcher"
          aria-label="Ask Copper"
          onClick={() => setOpen(true)}
          className="fixed right-4 bottom-4 z-40 h-12 gap-2 rounded-full px-5 shadow-lg sm:right-6 sm:bottom-6"
        >
          <MessageCircleIcon className="size-5" />
          Ask Copper
        </Button>
      )}
      <Shell docked={docked} open={open} onOpenChange={setOpen}>
        <header className="bg-chart-5 dark:bg-background text-white">
          <div className="flex items-center gap-3 px-4 pt-4 pb-3">
            <span className="bg-primary flex size-10 shrink-0 items-center justify-center rounded-full">
              <MessageCircleIcon className="size-5" />
            </span>
            <div className="min-w-0 flex-1">
              {docked ? (
                <h2 className="text-base font-bold text-white">Ask Copper</h2>
              ) : (
                <SheetTitle className="text-base font-bold text-white">
                  Ask Copper
                </SheetTitle>
              )}
              {docked ? (
                <p className="text-xs text-white/70">
                  Prices, stock, support and refunds, checked with tools.
                </p>
              ) : (
                <SheetDescription className="text-xs text-white/70">
                  Prices, stock, support and refunds, checked with tools.
                </SheetDescription>
              )}
            </div>
            {!docked && (
              <SheetClose asChild>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  className="text-white hover:bg-white/10 hover:text-white"
                >
                  <XIcon />
                  <span className="sr-only">Close</span>
                </Button>
              </SheetClose>
            )}
          </div>
          {aiConfigured && useTools && (
            <div className="flex items-center gap-3 bg-white/10 px-4 py-2">
              <label
                htmlFor="customer-email"
                className="text-xs font-semibold whitespace-nowrap"
              >
                Your order email
              </label>
              <input
                id="customer-email"
                list="demo-emails"
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="ava@example.com"
                className="h-8 min-w-0 flex-1 rounded-md bg-white/90 px-2 text-xs text-black outline-none"
              />
              <datalist id="demo-emails">
                {DEMO_EMAILS.map((demo) => (
                  <option key={demo} value={demo} />
                ))}
              </datalist>
            </div>
          )}
          {aiConfigured && (
            <div className="flex items-center gap-3 bg-white/10 px-4 py-2">
              <div className="flex-1 text-sm">
                <span className="font-semibold">Use tools</span>
                <span className="ml-2 text-xs text-white/70">
                  {useTools ? "Checks every answer" : "Model guesses alone"}
                </span>
              </div>
              <Switch
                aria-label="Use tools"
                checked={useTools}
                onCheckedChange={setUseTools}
              />
            </div>
          )}
        </header>

        {aiConfigured ? (
          <>
            <div
              ref={body}
              className="bg-secondary flex-1 space-y-6 overflow-y-auto px-4 py-5"
            >
              {turns.map((turn, i) =>
                turn.notice ? (
                  <div
                    key={i}
                    data-testid="refund-notice"
                    className="bg-card ml-2 rounded-2xl rounded-tl-sm border p-4 text-sm shadow-xs"
                  >
                    <p className="text-primary mb-1 text-xs font-bold">
                      {AGENT_LABELS.refund}
                    </p>
                    {turn.progress.reply}
                  </div>
                ) : (
                  <div key={i} className="space-y-4">
                    <p className="bg-primary text-primary-foreground ml-auto w-fit max-w-[85%] rounded-2xl rounded-br-sm px-4 py-2">
                      {turn.question}
                    </p>
                    <Answer progress={turn.progress} useTools={useTools} />
                  </div>
                ),
              )}
              {!busy && (
                <div className="space-y-2">
                  {turns.length === 0 && (
                    <p className="text-muted-foreground text-sm">
                      Hi, I&apos;m Copper! Ask me about prices, stock or a
                      refund (add your order email above). Try one of these:
                    </p>
                  )}
                  {STARTERS.map((starter) => (
                    <button
                      key={starter}
                      type="button"
                      onClick={() => send(starter)}
                      className="bg-background hover:border-primary block w-full rounded-xl border px-3 py-2 text-left text-sm transition-colors"
                    >
                      {starter}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <form
              onSubmit={(event) => {
                event.preventDefault();
                send(draft);
              }}
              className="bg-background flex items-center gap-2 border-t p-3"
            >
              <input
                aria-label="Your question"
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                placeholder="Ask about prices, stock or a refund…"
                className="bg-background focus-visible:ring-ring h-10 flex-1 rounded-full border px-4 text-sm outline-none focus-visible:ring-2"
              />
              <Button
                type="submit"
                size="icon"
                aria-label="Send"
                disabled={busy || !draft.trim()}
                className="size-10 rounded-full"
              >
                <ArrowUpIcon />
              </Button>
            </form>
          </>
        ) : (
          <div className="bg-secondary flex-1 overflow-y-auto px-4">
            <SetupRequired service="ai" />
          </div>
        )}
      </Shell>
    </>
  );
}

/** The chat's frame: a slide-over sheet, or a column docked on the page. */
function Shell({
  docked,
  open,
  onOpenChange,
  children,
}: {
  docked: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: ReactNode;
}) {
  if (docked)
    return (
      <div data-testid="ask-copper" className="flex h-full min-h-0 flex-col">
        {children}
      </div>
    );
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        data-testid="ask-copper"
        side="right"
        showCloseButton={false}
        className="gap-0 p-0 data-[side=right]:w-full data-[side=right]:sm:max-w-md"
      >
        {children}
      </SheetContent>
    </Sheet>
  );
}

/** One answer: the rail of stations, then Copper's reply. */
function Answer({
  progress,
  useTools,
}: {
  progress: Progress;
  useTools: boolean;
}) {
  const { steps, reply, status } = progress;
  const used = new Set(
    steps.filter((s): s is ToolStep => s.type === "tool").map((s) => s.name),
  );
  const working = status === "working";
  let toolCount = 0;
  return (
    <div className="space-y-3">
      <div className="relative space-y-4 pl-9">
        <span
          aria-hidden
          className={cn(
            "absolute top-3 bottom-3 left-[11px] w-0.5 bg-gradient-to-b",
            useTools
              ? "from-primary via-accent to-accent"
              : "from-chart-3 to-chart-3",
          )}
        />
        <Station
          node={<WrenchIcon className="size-3" />}
          nodeClass="bg-muted-foreground"
          label={
            useTools
              ? `Tools ${AGENT_LABELS[progress.agent ?? "copper"]} can use`
              : "Tools given to Copper: none"
          }
        >
          <div className="flex flex-wrap gap-1.5">
            {TOOLS_BY_AGENT[progress.agent ?? "copper"].map((name) => (
              <span
                key={name}
                className={cn(
                  "rounded-md px-2 py-0.5 font-mono text-xs",
                  !useTools &&
                    "text-muted-foreground bg-background line-through",
                  useTools &&
                    used.has(name) &&
                    "bg-accent font-bold text-white",
                  useTools &&
                    !used.has(name) &&
                    "bg-background text-muted-foreground",
                )}
              >
                {name}
              </span>
            ))}
          </div>
          {!useTools && (
            <p className="text-muted-foreground mt-1.5 text-xs">
              Copper has to answer from memory alone.
            </p>
          )}
        </Station>

        {steps.map((step, i) =>
          step.type === "thinking" ? (
            <Station
              key={i}
              node={<BrainIcon className="size-3" />}
              nodeClass={useTools ? "bg-primary" : "bg-chart-3"}
              label="Copper is thinking"
            >
              <p
                data-testid="thinking"
                className="text-muted-foreground border-l-2 pl-3 text-sm whitespace-pre-wrap italic"
              >
                <InlineMarkdown text={step.text} />
              </p>
            </Station>
          ) : (
            <Station
              key={i}
              node={<WrenchIcon className="size-3" />}
              nodeClass="bg-accent"
              label={
                step.state === "calling"
                  ? "Copper is calling a tool"
                  : "Copper called a tool"
              }
            >
              <ToolCard step={step} number={++toolCount} />
            </Station>
          ),
        )}

        {working && (
          <div className="relative">
            <span className="bg-primary ring-secondary absolute top-0.5 -left-9 flex size-6 animate-pulse items-center justify-center gap-0.5 rounded-full ring-4">
              {[0, 150, 300].map((delay) => (
                <span
                  key={delay}
                  className="size-1 animate-bounce rounded-full bg-white"
                  style={{ animationDelay: `${delay}ms` }}
                />
              ))}
            </span>
            <p className="text-muted-foreground pt-1 text-sm">
              {reply
                ? "Writing the answer…"
                : !useTools
                  ? "Answering from memory…"
                  : steps.length
                    ? "Deciding what to do next…"
                    : "Reading your question…"}
            </p>
          </div>
        )}
      </div>

      {(reply || !working) && (
        <div className="bg-card ml-2 rounded-2xl rounded-tl-sm border p-4 shadow-xs">
          <p
            data-testid="agent-badge"
            className="text-primary mb-1 text-xs font-bold"
          >
            {progress.agent === "refund" ? AGENT_LABELS.refund : "Copper"}
          </p>
          {!useTools && (
            <div className="border-chart-3 bg-chart-3/10 mb-3 rounded-lg border p-3 text-xs">
              <p className="flex items-center gap-1.5 font-bold">
                <TriangleAlertIcon className="text-chart-3 size-4" />
                Answered without tools: may be made up
              </p>
              <p className="text-muted-foreground mt-1">
                With tools off, Copper can&apos;t see today&apos;s prices or
                stock. The AI only has what it learned in training, so it fills
                the gaps with guesses that sound right. That&apos;s a
                hallucination.
              </p>
            </div>
          )}
          <p className="text-sm whitespace-pre-wrap">
            <InlineMarkdown text={reply} />
            {working && (
              <span className="bg-primary ml-0.5 inline-block h-4 w-0.5 animate-pulse align-middle" />
            )}
          </p>
        </div>
      )}
    </div>
  );
}

function Station({
  node,
  nodeClass,
  label,
  children,
}: {
  node: ReactNode;
  nodeClass: string;
  label: string;
  children: ReactNode;
}) {
  return (
    <section className="relative">
      <span
        className={cn(
          "ring-secondary absolute top-0 -left-9 flex size-6 items-center justify-center rounded-full text-white ring-4",
          nodeClass,
        )}
      >
        {node}
      </span>
      <p className="text-muted-foreground mb-2 pt-1 text-[11px] font-semibold tracking-widest uppercase">
        {label}
      </p>
      {children}
    </section>
  );
}

// The only links Copper's replies may contain: a page of one of our PDFs. The
// link is rebuilt from just that path, so a website name the model puts in
// front of it is dropped, and any other address is shown as plain text.
const DOC_LINK = /^(?:https?:\/\/[^/\s]+)?(\/docs\/[\w-]+\.pdf#page=\d+)$/;

/**
 * Thought summaries and replies arrive as markdown: render **bold**, `code`
 * and [citation](/docs/file.pdf#page=9) links.
 */
function InlineMarkdown({ text }: { text: string }) {
  return text
    .split(/(\[[^\]]+\]\(\s*[^)\s]+\s*\)|\*\*[^*]+\*\*|`[^`]+`)/)
    .map((part, i) => {
      // Small models sometimes leave a space after the "(", so allow one.
      const link = part.match(/^\[([^\]]+)\]\(\s*([^)\s]+)\s*\)$/);
      if (link)
        return DOC_LINK.test(link[2]) ? (
          <a
            key={i}
            href={link[2].match(DOC_LINK)![1]}
            target="_blank"
            rel="noreferrer"
            data-testid="citation"
            className="text-primary font-medium underline"
          >
            {link[1]}
          </a>
        ) : (
          link[1]
        );
      if (part.startsWith("**") && part.endsWith("**"))
        return (
          <strong key={i} className="text-foreground not-italic">
            {part.slice(2, -2)}
          </strong>
        );
      if (part.startsWith("`") && part.endsWith("`"))
        return (
          <code key={i} className="font-mono not-italic">
            {part.slice(1, -1)}
          </code>
        );
      return part;
    });
}

function ToolCard({ step, number }: { step: ToolStep; number: number }) {
  return (
    <div
      data-testid="tool-call"
      data-tool={step.name}
      className="bg-card overflow-hidden rounded-xl border text-sm"
    >
      <div className="bg-accent flex items-center gap-2 px-3 py-2 text-white">
        <span className="font-mono font-bold">{step.name}()</span>
        <span className="rounded bg-white/20 px-1.5 text-[10px]">
          tool {number}
        </span>
        <span className="ml-auto text-xs text-white/80">
          {TOOL_LABELS[step.name] ?? "Using a tool"}
        </span>
      </div>
      <div className="space-y-2 px-3 py-3">
        <p className="text-muted-foreground flex items-center gap-1 text-[11px] font-semibold tracking-widest uppercase">
          <ArrowRightIcon className="size-3" /> What Copper sent
        </p>
        {step.input === undefined ? (
          <p className="text-muted-foreground text-xs italic">
            filling in the details…
          </p>
        ) : (
          <ToolInput name={step.name} input={step.input} />
        )}
      </div>
      <div className="bg-accent/10 space-y-2 border-t px-3 py-3">
        <p className="text-muted-foreground flex items-center gap-1 text-[11px] font-semibold tracking-widest uppercase">
          <ArrowLeftIcon className="size-3" /> What came back
        </p>
        {step.state === "calling" ? (
          <p className="text-muted-foreground flex items-center gap-2 text-xs">
            <Spinner className="size-3" /> the app is running the code…
          </p>
        ) : step.state === "error" ? (
          <p className="text-chart-3 text-xs">{String(step.output)}</p>
        ) : (
          <ToolOutput name={step.name} output={step.output} />
        )}
      </div>
    </div>
  );
}

const NAMES: Record<string, string> = Object.fromEntries([
  ...getProducts().map((p) => [p.id, p.name]),
  ...getPlans().map((p) => [p.id, p.name]),
]);

const nameOf = (value: unknown) =>
  Array.isArray(value)
    ? value.map((v) => NAMES[String(v)] ?? String(v)).join(", ") || "None"
    : (NAMES[String(value)] ?? String(value));

const NO_INPUT: Record<string, string> = {
  get_prices: "Nothing, it just asked for the price list",
  get_products: "Nothing, it just asked what Copper sells",
};

function ToolInput({ name, input }: { name: string; input: unknown }) {
  const entries = Object.entries((input ?? {}) as Record<string, unknown>);
  if (entries.length === 0)
    return (
      <p className="text-muted-foreground text-xs">
        {NO_INPUT[name] ?? "Nothing"}
      </p>
    );
  return (
    <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-xs">
      {entries.map(([field, value]) => (
        <div key={field} className="contents">
          <dt className="text-muted-foreground capitalize">{field}</dt>
          <dd className="font-medium">{nameOf(value)}</dd>
        </div>
      ))}
    </dl>
  );
}

/* eslint-disable @typescript-eslint/no-explicit-any -- tool outputs arrive untyped from the stream */
function ToolOutput({ name, output }: { name: string; output: any }) {
  if (
    (name === "hand_to_refund" || name === "hand_to_copper") &&
    output?.handoff
  )
    return (
      <p className="text-xs">
        Now talking to{" "}
        <strong>{AGENT_LABELS[output.handoff as AgentId]}</strong>
        {output.summary ? `: ${output.summary}` : ""}
      </p>
    );
  if (name === "get_purchase_history" && output?.status === "need_email")
    return <p className="text-xs">Needs the order email from the box above.</p>;
  if (name === "get_purchase_history" && output?.orders)
    return (
      <div className="space-y-1 text-xs" data-testid="purchase-history">
        {output.orders.length === 0 && <p>No orders found.</p>}
        {output.orders.map((o: any) => (
          <div key={o.orderId} className="flex justify-between gap-2 py-0.5">
            <span>
              <span className="font-mono">{o.orderId}</span> {o.product}
              {o.color ? `, ${o.color}` : o.billing ? `, ${o.billing}` : ""}
              <span className="text-muted-foreground">
                {" "}
                · {o.daysSincePurchase} days ago
              </span>
            </span>
            <span className="font-mono">{formatUsd(o.amountUsd)}</span>
          </div>
        ))}
      </div>
    );
  if (name === "get_refund_rules" && output?.status === "ok")
    return (
      <div className="space-y-1 text-xs" data-testid="refund-rules">
        <Pill
          className={
            output.eligible ? "bg-accent text-white" : "bg-chart-3 text-white"
          }
        >
          {output.eligible ? "Eligible" : "Not eligible"}
        </Pill>
        {output.autoApproved && (
          <p>
            Under the {formatUsd(output.autoRefundLimitUsd)} auto-refund limit:
            no admin approval needed.
          </p>
        )}
        <p className="font-medium">{output.rule}</p>
        <p className="text-muted-foreground">{output.reason}</p>
      </div>
    );
  if (name === "request_refund" && output?.status === "created")
    return (
      <p className="text-xs" data-testid="refund-created">
        Request <span className="font-mono font-bold">{output.requestId}</span>{" "}
        for {formatUsd(output.refundUsd)} is{" "}
        <strong>pending admin review</strong>.
      </p>
    );
  if (name === "request_refund" && output?.status === "auto_approved")
    return (
      <p className="text-xs" data-testid="refund-auto-approved">
        Request <span className="font-mono font-bold">{output.requestId}</span>{" "}
        for {formatUsd(output.refundUsd)} was{" "}
        <strong>approved automatically</strong> (under the auto-refund limit).
      </p>
    );
  if (name === "request_refund" && output?.status === "not_eligible")
    return <p className="text-xs">Not filed: {output.reason}</p>;
  if (name === "calculate_cost" && output?.lines)
    return (
      <div className="text-xs">
        {output.lines.map((line: any) => (
          <div key={line.item} className="flex justify-between py-0.5">
            <span>{line.item}</span>
            <span className="font-mono">{formatUsd(line.usd)}</span>
          </div>
        ))}
        <div className="mt-1 flex items-baseline justify-between border-t pt-2">
          <span className="font-semibold">Total</span>
          <span className="text-primary text-xl font-bold">
            {formatUsd(output.totalUsd)}
          </span>
        </div>
      </div>
    );
  if (name === "get_products" && output?.products)
    return (
      <div className="space-y-2 text-xs">
        {output.products.map((p: any) => (
          <div key={p.id}>
            <div className="flex justify-between font-medium">
              <span>{p.name}</span>
              <span className="font-mono">{formatUsd(p.priceUsd)}</span>
            </div>
            <p className="text-muted-foreground">{p.type}</p>
            <div className="mt-1 flex flex-wrap gap-1">
              {p.colors.map((c: string) => (
                <span key={c} className="bg-accent/15 rounded-full px-2 py-0.5">
                  {c}
                </span>
              ))}
            </div>
          </div>
        ))}
      </div>
    );
  if (name === "get_prices" && output?.products)
    return (
      <div className="text-xs">
        {output.products.map((p: any) => (
          <div key={p.id} className="flex justify-between py-0.5">
            <span>{p.name}</span>
            <span className="font-mono">{formatUsd(p.priceUsd)}</span>
          </div>
        ))}
        {output.plans
          .filter((p: any) => p.monthlyUsd > 0)
          .map((p: any) => (
            <div key={p.id} className="flex justify-between py-0.5">
              <span>{p.name}</span>
              <span className="font-mono">
                {formatUsd(p.monthlyUsd)}/mo · {formatUsd(p.annualUsd)}/yr
              </span>
            </div>
          ))}
      </div>
    );
  if (name === "search_docs" && output?.status) {
    if (output.status === "unavailable")
      return <p className="text-xs">{output.message}</p>;
    return (
      <ol className="space-y-2 text-xs">
        {output.passages.map((p: any) => (
          <li
            key={`${p.title}-${p.page}-${p.rank}`}
            data-testid="doc-passage"
            className="bg-card rounded-lg border p-2"
          >
            <div className="flex items-baseline justify-between gap-2">
              <span className="font-semibold">
                {p.rank}. {p.title}
              </span>
              <span className="text-muted-foreground font-mono">
                {p.similarity.toFixed(2)}
              </span>
            </div>
            <a
              href={p.url}
              target="_blank"
              rel="noreferrer"
              className="text-primary font-medium underline"
            >
              Open page {p.page}
            </a>
            {p.mentions?.length > 0 && (
              <span className="bg-accent/15 ml-2 rounded-full px-2 py-0.5">
                has {p.mentions.join(", ")}
              </span>
            )}
            <p className="text-muted-foreground mt-1 line-clamp-3">{p.text}</p>
          </li>
        ))}
      </ol>
    );
  }
  if (name === "check_availability" && output?.status) {
    if (output.status === "unavailable")
      return <p className="text-xs">{output.message}</p>;
    if (output.status === "not_a_color")
      return (
        <p className="text-xs">
          {output.product} doesn&apos;t come in {output.color}. It comes in{" "}
          {output.colors.join(", ")}.
        </p>
      );
    return (
      <div className="space-y-1 text-xs">
        {output.colors.map((c: any) => (
          <div key={c.color} className="flex items-center justify-between">
            <span>{c.color}</span>
            <StockPill stock={c.stock} restockDate={c.restockDate} />
          </div>
        ))}
      </div>
    );
  }
  // A tool without its own layout yet: show what came back as plain text.
  return (
    <pre className="max-h-48 overflow-auto text-xs whitespace-pre-wrap">
      {typeof output === "string" ? output : JSON.stringify(output, null, 2)}
    </pre>
  );
}
/* eslint-enable @typescript-eslint/no-explicit-any */

function StockPill({
  stock,
  restockDate,
}: {
  stock: string;
  restockDate: string | null;
}) {
  if (stock === "in_stock")
    return <Pill className="bg-accent text-white">In stock</Pill>;
  if (stock === "low_stock")
    return <Pill className="bg-chart-4 text-chart-5">Low stock</Pill>;
  const date = restockDate
    ? new Date(`${restockDate}T12:00:00`).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      })
    : "later";
  return (
    <Pill className="bg-chart-3 text-white">Back-ordered until {date}</Pill>
  );
}

function Pill({
  className,
  children,
}: {
  className: string;
  children: ReactNode;
}) {
  return (
    <span
      className={cn(
        "rounded-full px-2 py-0.5 text-[11px] font-semibold",
        className,
      )}
    >
      {children}
    </span>
  );
}
