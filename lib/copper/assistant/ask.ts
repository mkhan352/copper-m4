"use server";

// The server action the Ask Copper chat calls. It streams the conversation to
// the model through callStream (lib/ai/call.ts), with or without the tools,
// and sends back each step as it happens, so the panel can show Copper
// thinking and using its tools.
import { hasToolCall, stepCountIs } from "ai";
import { callStream, THOUGHT_SUMMARIES } from "@/lib/ai/call";
import { createLive, type Live } from "@/lib/ai/live";
import { COPPER_INSTRUCTIONS } from "@/lib/copper/assistant/instructions";
import type {
  AgentId,
  Progress,
  ToolStep,
} from "@/lib/copper/assistant/progress";
import { copperTools } from "@/lib/copper/assistant/tools";
import { REFUND_INSTRUCTIONS } from "@/lib/copper/refunds/instructions";
import { makeRefundTools } from "@/lib/copper/refunds/tools";

export type ChatMessage = { role: "user" | "assistant"; content: string };

export type AskCopperRequest = {
  messages: ChatMessage[];
  useTools: boolean;
  /** Who was talking at the end of the last turn. Starts as Copper Support. */
  activeAgent?: AgentId;
  /** The demo customer's order email from the chat panel. */
  customerEmail?: string;
};

export type AskCopperResult = { progress: Live<Progress> };

/** At most this many model steps (tool calls plus the reply) per segment. */
const MAX_STEPS = 6;
/** Copper -> refund -> Copper is already a lot for one question. */
const MAX_HANDOFFS = 2;

const SORRY = "Sorry, something went wrong on my end. Please try again.";
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** The instructions and tools each agent gets. */
function agentSetup(agent: AgentId, email: string | undefined, note?: string) {
  const handoff = note
    ? `\n\nHANDOFF NOTE from the previous agent: ${note}`
    : "";
  return agent === "refund"
    ? {
        instructions: REFUND_INSTRUCTIONS + handoff,
        tools: makeRefundTools(email),
        stopWhen: [stepCountIs(MAX_STEPS), hasToolCall("hand_to_copper")],
      }
    : {
        instructions: COPPER_INSTRUCTIONS + handoff,
        tools: copperTools,
        stopWhen: [stepCountIs(MAX_STEPS), hasToolCall("hand_to_refund")],
      };
}

/** The summary of a hand_to_* call in this segment, if the agent made one. */
function handoffOf(steps: Progress["steps"], from: number) {
  for (const step of steps.slice(from)) {
    if (step.type !== "tool") continue;
    const out = step.output as
      { handoff?: AgentId; summary?: string } | undefined;
    if (step.state === "done" && out?.handoff)
      return { to: out.handoff, summary: out.summary ?? "" };
  }
  return null;
}

export async function askCopper({
  messages,
  useTools,
  activeAgent = "copper",
  customerEmail,
}: AskCopperRequest): Promise<AskCopperResult> {
  const { live, update, done } = createLive<Progress>();
  const email = customerEmail?.trim().toLowerCase();
  const knownEmail = email && EMAIL.test(email) ? email : undefined;
  const progress: Progress = {
    agent: useTools ? activeAgent : "copper",
    steps: [],
    reply: "",
    status: "working",
  };
  // A fresh copy each time, so earlier updates never change underneath the
  // panel.
  const snapshot = (): Progress => ({
    ...progress,
    steps: progress.steps.map((step) => ({ ...step })),
  });
  const toolStep = (id: string) =>
    progress.steps.findLast(
      (step): step is ToolStep => step.type === "tool" && step.id === id,
    );

  /** Runs one agent until it answers or hands over. */
  async function runSegment(agent: AgentId, note?: string) {
    // Without tools, send no instructions either: "always use your tools"
    // with no tools makes the model answer with nothing.
    const result = callStream(
      {
        module: agent === "refund" ? 4 : 2,
        feature: agent === "refund" ? "refund-agent" : "ask-copper",
      },
      {
        messages,
        providerOptions: THOUGHT_SUMMARIES,
        ...(useTools && agentSetup(agent, knownEmail, note)),
      },
    );
    for await (const part of result.fullStream) {
      switch (part.type) {
        case "reasoning-delta": {
          const last = progress.steps.at(-1);
          if (last?.type === "thinking") last.text += part.text;
          else progress.steps.push({ type: "thinking", text: part.text });
          break;
        }
        case "tool-input-start":
          progress.steps.push({
            type: "tool",
            id: part.id,
            name: part.toolName,
            state: "calling",
          });
          break;
        case "tool-call": {
          const step = toolStep(part.toolCallId);
          if (step) step.input = part.input;
          else
            progress.steps.push({
              type: "tool",
              id: part.toolCallId,
              name: part.toolName,
              state: "calling",
              input: part.input,
            });
          break;
        }
        case "tool-result": {
          const step = toolStep(part.toolCallId);
          if (step) Object.assign(step, { output: part.output, state: "done" });
          break;
        }
        case "tool-error": {
          const step = toolStep(part.toolCallId);
          const message =
            part.error instanceof Error
              ? part.error.message
              : String(part.error);
          if (step) Object.assign(step, { output: message, state: "error" });
          break;
        }
        case "text-delta":
          progress.reply += part.text;
          break;
        case "error":
          throw part.error;
        default:
          continue;
      }
      update(snapshot());
    }
  }

  void (async () => {
    try {
      let agent = progress.agent!;
      let from = 0;
      let note: string | undefined;
      for (let turn = 0; turn <= (useTools ? MAX_HANDOFFS : 0); turn++) {
        await runSegment(agent, note);
        const next = useTools ? handoffOf(progress.steps, from) : null;
        if (!next || next.to === agent) break;
        // Whatever the first agent said is replaced by the new agent's answer.
        agent = next.to;
        note = next.summary;
        progress.agent = agent;
        progress.reply = "";
        from = progress.steps.length;
        update(snapshot());
      }
      progress.status = "done";
      if (!progress.reply.trim()) progress.reply = SORRY;
    } catch {
      progress.status = "error";
      if (!progress.reply.trim()) progress.reply = SORRY;
    }
    done(snapshot());
  })();

  return { progress: live };
}
