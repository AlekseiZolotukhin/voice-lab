import { expect, test, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, cleanup, fireEvent } from "@testing-library/react";
import { App } from "./App";

/**
 * The tutor reaches the agent only if App actually subscribes it to the bus. Every
 * other test here is of a pure function, and all of them stayed green with the
 * wiring deleted — which is the one thing CLAUDE.md forbids a suite to do.
 *
 * So this drives the whole chain through the real App: the SDK reports what the
 * learner said, the bus carries it, the reducer judges it, and the directive comes
 * back out at the SDK.
 */

vi.mock("./lib/tokenStore", () => ({
  loadToken: () => Promise.resolve("vibe_test"),
  saveToken: () => Promise.resolve(),
}));

/** The SDK callbacks App handed over, so a transcript can be delivered by hand. */
let handlers: Record<string, (arg?: unknown) => void> = {};
let contextSent: string[] = [];

vi.mock("@elevenlabs/client", () => ({
  Conversation: {
    startSession: async (opts: Record<string, unknown>) => {
      handlers = {};
      for (const [key, value] of Object.entries(opts)) {
        if (typeof value === "function") handlers[key] = value as () => void;
      }
      return {
        endSession: async () => {},
        sendContextualUpdate: (text: string) => contextSent.push(text),
        getOutputVolume: () => 0,
        getOutputByteFrequencyData: () => new Uint8Array(1024),
      };
    },
  },
}));

beforeEach(() => {
  contextSent = [];
  handlers = {};
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response(JSON.stringify({ token: "t", agentId: "a" }))),
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

/**
 * Starts a conversation the way a visitor does.
 *
 * Waits for the button to flip rather than for the callbacks to appear: App flips it
 * only after `session.start()` has resolved, which is when the conversation handle
 * exists. Waiting on `handlers.onMessage` instead cannot tell the second handshake
 * from the first — the callbacks are still those of session one — so a transcript
 * could arrive while the handle was null and the directive be dropped. With a
 * zero-delay fetch stub that passed anyway; with 5 ms it did not.
 */
async function startTalking() {
  const start = await screen.findByRole("button", { name: /start conversation/i });
  await waitFor(() => expect(start.hasAttribute("disabled")).toBe(false));
  handlers = {};
  fireEvent.click(start);
  await screen.findByRole("button", { name: /end conversation/i });
  await waitFor(() => expect(handlers.onMessage).toBeTypeOf("function"));
}

test("a learner drifting into Russian is steered, end to end through the page", async () => {
  render(<App />);
  await startTalking();

  handlers.onMessage?.({ message: "I cooked pasta yesterday", source: "user" } as never);
  expect(contextSent, "English needs no steering").toEqual([]);

  handlers.onMessage?.({ message: "дальше давай по-русски", source: "user" } as never);

  await waitFor(() => expect(contextSent).toHaveLength(1));
  expect(contextSent[0]).toMatch(/^\[TUTOR DIRECTIVE\]/);
  expect(contextSent[0]).toMatch(/English/);
});

test("a second conversation does not inherit the first learner's streak", async () => {
  render(<App />);
  await startTalking();

  handlers.onMessage?.({ message: "по-русски давай", source: "user" } as never);
  handlers.onMessage?.({ message: "нет, по-русски", source: "user" } as never);
  await waitFor(() => expect(contextSent).toHaveLength(2));

  // End it, then start again: this is a new lesson, and without the reset the rule
  // gets stated to a learner who was never invited back.
  fireEvent.click(screen.getByRole("button", { name: /end conversation/i }));
  await startTalking();

  handlers.onMessage?.({ message: "опять по-русски", source: "user" } as never);

  await waitFor(() => expect(contextSent).toHaveLength(3));
  expect(contextSent[2], "back to the gentle rung").toBe(contextSent[0]);
});
