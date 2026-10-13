import { expect, test } from "vitest";
import { EventBus } from "../events";
import { Tutor, type TutorChannel } from "./supervisor";

function harness({ deliver = true }: { deliver?: boolean } = {}) {
  const bus = new EventBus();
  const sent: string[] = [];
  const live = { deliver };
  const channel: TutorChannel = {
    sendContext: (text) => {
      sent.push(text);
      return live.deliver;
    },
  };
  const tutor = new Tutor(bus, channel);
  const detach = tutor.attach();
  const said = (text: string) =>
    bus.emit({ type: "stt-result", result: { text, words: [] } });
  return { bus, sent, tutor, detach, said, live };
}

test("a learner drifting into Russian is steered through the live conversation", () => {
  const { sent, said } = harness();

  said("I like cooking on weekends");
  expect(sent, "English needs no steering").toEqual([]);

  said("дальше давай по-русски");
  expect(sent).toHaveLength(1);
  expect(sent[0]).toMatch(/^\[TUTOR DIRECTIVE\]/);
  expect(sent[0]).toMatch(/English/);
});

test("the agent's own English is not judged as the learner's", () => {
  // `agent-reply` carries what the tutor said. Counting it would clear the streak
  // the learner had just set, on every single turn.
  const { sent, said, bus, tutor } = harness();

  said("не хочу по-английски");
  bus.emit({ type: "agent-reply", text: "No problem — tell me in English?", at: 0 });
  said("по-русски проще");

  expect(sent, "two slips in a row, two directives").toHaveLength(2);
  expect(sent[1], "the second states the rule").not.toBe(sent[0]);
});

test("a new lesson does not inherit the last learner's streak", () => {
  const { said, tutor, sent } = harness();

  said("по-русски давай");
  said("по-русски");
  tutor.reset();
  said("опять по-русски");

  expect(sent).toHaveLength(3);
  expect(sent[2], "back to the gentle rung").toBe(sent[0]);
});

test("detaching stops the steering", () => {
  const { sent, said, detach } = harness();
  detach();
  said("давай по-русски");
  expect(sent).toEqual([]);
});

test("a dropped directive leaves the learner on the rung they never heard", () => {
  // There is no live conversation to hand it to — mid-reconnect, or the socket died
  // between the transcript and the directive.
  const { sent, said, tutor, live } = harness({ deliver: false });

  said("давай по-русски");
  expect(sent, "attempted").toHaveLength(1);
  expect(tutor.lesson.steersDelivered, "nothing landed").toBe(0);

  live.deliver = true;
  said("и дальше по-русски");
  expect(sent[1], "the invitation back, not the rule").toBe(sent[0]);
  expect(tutor.lesson.steersDelivered, "now it landed").toBe(1);
});
