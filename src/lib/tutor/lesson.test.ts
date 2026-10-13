import { expect, test } from "vitest";
import {
  INITIAL_LESSON,
  step,
  undelivered,
  type LessonState,
  type TutorAction,
} from "./lesson";

/** Feeds a conversation through the reducer and collects what the agent was told. */
function run(texts: string[], from: LessonState = INITIAL_LESSON) {
  let state = from;
  const actions: TutorAction[] = [];
  for (const text of texts) {
    const [next, produced] = step(state, { kind: "user-utterance", text });
    state = next;
    actions.push(...produced);
  }
  return { state, actions, levels: actions.map((a) => a.level) };
}

test("English is left alone", () => {
  const { actions } = run(["I had eggs for breakfast", "my favourite film is Alien"]);
  expect(actions, "nothing to steer").toEqual([]);
});

test("Russian is steered back, harder the longer it goes on", () => {
  // The product promise: the lesson does not become a Russian conversation.
  const { levels } = run([
    "мне проще по-русски",
    "давай по-русски",
    "не хочу по-английски",
    "я же сказал, по-русски",
  ]);
  expect(levels).toEqual([1, 2, 2, 3]);
});

test("the ladder stops at offering, it never ends the lesson", () => {
  const { levels } = run(Array(8).fill("нет, по-русски"));
  expect(Math.max(...levels), "3 is the top rung").toBe(3);
});

test("the exit is offered once, then the reminders go back to steady", () => {
  // Found in review: the top rung used to repeat for every utterance after it, so a
  // learner was offered the exit on every single turn — the nagging rung 2 exists to
  // avoid. Saying nothing instead would leave the lesson running in Russian.
  const { levels } = run(Array(8).fill("нет, по-русски"));

  expect(levels).toEqual([1, 2, 2, 3, 2, 2, 2, 2]);
  expect(levels.filter((l) => l === 3), "offered once").toHaveLength(1);
});

test("a nudge that never reached the agent is repeated, not escalated past", () => {
  // The learner heard nothing, so stating the rule next would be answering a question
  // they were never asked.
  const [after, actions] = step(INITIAL_LESSON, {
    kind: "user-utterance",
    text: "давай по-русски",
  });
  expect(actions[0].level).toBe(1);

  const lost = undelivered(INITIAL_LESSON, after);
  const again = run(["и дальше по-русски"], lost);
  expect(again.levels, "the same rung again").toEqual([1]);
});

test("coming back to English forgives the run", () => {
  const first = run(["давай по-русски", "ну пожалуйста"]);
  expect(first.levels).toEqual([1, 2]);

  const back = run(["ok, sorry, what did you ask me"], first.state);
  expect(back.actions, "nothing to say about an English reply").toEqual([]);

  // And the next slip starts over gently rather than resuming where it left off.
  expect(run(["а можно по-русски"], back.state).levels).toEqual([1]);
});

test("a learner who was offered the exit and came back is invited, not warned", () => {
  // Found in the third review: deleting the offer's reset left every test green. With
  // it latched, a learner who returned to English for the rest of the lesson and
  // drifted once an hour later got "the lesson only works in English" on that first
  // slip, and could never be offered the exit again.
  const offered = run(Array(4).fill("по-русски")).state;
  expect(offered.offered).toBe(true);

  const back = run(["sorry, I will try in English"], offered).state;
  expect(back.offered, "forgiven with the rest of the run").toBe(false);

  const relapse = run(Array(4).fill("опять по-русски"), back);
  expect(relapse.levels, "the whole ladder again, from the invitation").toEqual([1, 2, 2, 3]);
});

test("a vocabulary gap neither escalates nor forgives", () => {
  const drifted = run(["давай по-русски"]).state;
  const mixed = run(["I cooked что-то simple yesterday"], drifted);
  expect(mixed.actions, "not a warning").toEqual([]);
  // Not a pardon either: the next slip carries on up the ladder.
  expect(run(["и давай по-русски"], mixed.state).levels).toEqual([2]);
});

test("silence and throat-clearing do not pass for English", () => {
  const drifted = run(["давай по-русски"]).state;
  const quiet = run(["", "...", "мм", "а", "um"], drifted);
  expect(quiet.actions, "nothing was said to judge").toEqual([]);
  // The run is intact, so the next Russian sentence states the rule.
  expect(run(["и дальше по-русски"], quiet.state).levels).toEqual([2]);
});

test("every directive is marked so the agent does not read it aloud", () => {
  const { actions } = run(["по-русски", "по-русски", "по-русски", "по-русски"]);
  expect(actions).not.toHaveLength(0);
  for (const action of actions) {
    expect(action.text, action.text).toMatch(/^\[TUTOR DIRECTIVE\]/);
  }
});

test("a borrowed English word does not hold the ladder at its bottom rung", () => {
  // The learner answers in Russian every turn, with one English interjection in
  // between. Treating that as a return to English reset the streak each time, so the
  // rule was never stated and the exit was never offered.
  const { levels, state } = run([
    "давай по-русски",
    "нет, sorry",
    "давай по-русски",
    "да, please",
    "давай по-русски",
    "хорошо ok",
    "давай по-русски",
  ]);

  // Four slips, so the ladder reaches the offer exactly as it would have without the
  // interjections. Before the fix it read [1, 1, 1, 1] and never left the invitation.
  expect(levels).toEqual([1, 2, 2, 3]);
  expect(state.offered).toBe(true);
});
