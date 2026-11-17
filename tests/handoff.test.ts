// @vitest-environment node
// Copper hands a refund request to the Refund specialist and back. A mock
// model plays each agent, so we can check who is active, which instructions
// and tools each one got, and that the customer's email reaches the tools.
import type { LanguageModelV4StreamPart as Part } from "@ai-sdk/provider";
import { convertArrayToReadableStream, MockLanguageModelV4 } from "ai/test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { finalValue } from "@/lib/ai/live";
import { toolCallsOf } from "@/lib/copper/assistant/progress";
import { createMemoryStore } from "@/lib/copper/refunds/memory-store";
import { resetStore } from "@/lib/copper/refunds/store";

let chat: MockLanguageModelV4;
vi.mock("@ai-sdk/google", () => ({
  createGoogleGenerativeAI: () =>
    Object.assign(() => chat, { embedding: () => null }),
}));

const usage = {
  inputTokens: {
    total: 5,
    noCache: 5,
    cacheRead: undefined,
    cacheWrite: undefined,
  },
  outputTokens: { total: 5, text: 5, reasoning: undefined },
};
const finish = (reason: "stop" | "tool-calls"): Part => ({
  type: "finish",
  finishReason: { unified: reason, raw: undefined },
  usage,
});
const call = (id: string, toolName: string, input: object): Part[] => {
  const json = JSON.stringify(input);
  return [
    { type: "tool-input-start", id, toolName },
    { type: "tool-input-delta", id, delta: json },
    { type: "tool-input-end", id },
    { type: "tool-call", toolCallId: id, toolName, input: json },
    finish("tool-calls"),
  ];
};
const say = (text: string): Part[] => [
  { type: "text-start", id: "t" },
  { type: "text-delta", id: "t", delta: text },
  { type: "text-end", id: "t" },
  finish("stop"),
];
function script(steps: Part[][]) {
  let n = 0;
  return new MockLanguageModelV4({
    doStream: async () => ({
      stream: convertArrayToReadableStream(steps[n++] ?? say("(done)")),
    }),
  });
}
const names = (call: { tools?: { name: string }[] }) =>
  (call.tools ?? []).map((t) => t.name);

beforeEach(() => {
  vi.stubEnv("GOOGLE_GENERATIVE_AI_API_KEY", "AIza-test-key");
  vi.spyOn(console, "info").mockImplementation(() => {});
  resetStore(createMemoryStore());
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("Copper -> Refund specialist -> Copper", () => {
  it("hands over, files a pending request with the customer's own email, and hands back", async () => {
    chat = script([
      call("c1", "hand_to_refund", { summary: "Wants to return Copper Home" }),
      call("r1", "get_purchase_history", {}),
      call("r2", "get_refund_rules", { orderId: "ORD-1001" }),
      call("r3", "request_refund", { orderId: "ORD-1001", reason: "Too big" }),
      say("Request REQ-1001 is waiting for an admin to review."),
    ]);
    const { askCopper } = await import("@/lib/copper/assistant/ask");
    const result = await askCopper({
      messages: [{ role: "user", content: "I want a refund" }],
      useTools: true,
      customerEmail: "ava@example.com",
    });
    const progress = await finalValue(result.progress);
    expect(toolCallsOf(progress).map((c) => c.name)).toEqual([
      "hand_to_refund",
      "get_purchase_history",
      "get_refund_rules",
      "request_refund",
    ]);
    expect(toolCallsOf(progress)[3].output).toMatchObject({
      status: "created",
    });
    expect(progress.agent).toBe("refund");
    expect(progress.reply).toContain("waiting for an admin");

    // Copper's turn: Copper's tools. The specialist's turn: its own tools,
    // and the handoff note, but not update_availability.
    expect(names(chat.doStreamCalls[0])).toContain("hand_to_refund");
    expect(names(chat.doStreamCalls[0])).not.toContain("request_refund");
    expect(names(chat.doStreamCalls[1]).sort()).toEqual([
      "get_purchase_history",
      "get_refund_rules",
      "hand_to_copper",
      "request_refund",
    ]);
    expect(names(chat.doStreamCalls[1])).not.toContain("update_availability");
    expect(JSON.stringify(chat.doStreamCalls[1].prompt)).toContain(
      "Wants to return Copper Home",
    );
  });

  it("the specialist hands back to Copper for non-refund questions", async () => {
    chat = script([
      call("r1", "hand_to_copper", {
        summary: "Asks the price of Copper Notes",
      }),
      say("Copper Notes is $129."),
    ]);
    const { askCopper } = await import("@/lib/copper/assistant/ask");
    const result = await askCopper({
      messages: [{ role: "user", content: "How much is Copper Notes?" }],
      useTools: true,
      activeAgent: "refund",
    });
    const progress = await finalValue(result.progress);
    expect(progress.agent).toBe("copper");
    expect(names(chat.doStreamCalls[1])).toContain("get_prices");
  });

  it("starts with the active agent from the last turn", async () => {
    chat = script([say("Which order?")]);
    const { askCopper } = await import("@/lib/copper/assistant/ask");
    const result = await askCopper({
      messages: [{ role: "user", content: "the first one" }],
      useTools: true,
      activeAgent: "refund",
    });
    const progress = await finalValue(result.progress);
    expect(progress.agent).toBe("refund");
    expect(names(chat.doStreamCalls[0])).toContain("request_refund");
  });

  it("the agents' instructions say what they must and must not do", async () => {
    const { REFUND_INSTRUCTIONS: refund } =
      await import("@/lib/copper/refunds/instructions");
    const { COPPER_INSTRUCTIONS: copper } =
      await import("@/lib/copper/assistant/instructions");
    expect(copper).toContain("hand_to_refund");
    expect(refund).toMatch(/NEVER say a refund is approved/);
    expect(refund).toContain("get_refund_rules");
    expect(refund).toContain("hand_to_copper");
  });
});
