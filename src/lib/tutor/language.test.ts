import { expect, test } from "vitest";
import { tongueOf } from "./language";

test("an English sentence is English", () => {
  expect(tongueOf("I went to the cinema with my sister")).toBe("en");
});

test("a Russian sentence is Russian", () => {
  expect(tongueOf("давай лучше поговорим по-русски")).toBe("ru");
});

test("one Russian word inside an English sentence is not drift", () => {
  // The learner is short of a word, which calls for the English word rather than a
  // warning. Counted by character share instead, this sentence is 40% Cyrillic and
  // would have been judged the same as a sentence that is actually Russian.
  expect(tongueOf("yesterday I cooked борщ for my family")).toBe("en");
});

test("half and half is neither", () => {
  expect(tongueOf("I think это is трудно")).toBe("mixed");
  // Mostly Russian with an English word left in is still the learner having
  // switched languages.
  expect(tongueOf("I think что это трудно")).toBe("ru");
});

test("nothing to judge is unknown, not English", () => {
  // An empty transcript must not count as the learner speaking English, or silence
  // would quietly clear a streak the learner never broke.
  for (const quiet of ["", "   ", "...", "123", "?!"]) {
    expect(tongueOf(quiet), quiet).toBe("unknown");
  }
});

test("a one-word answer is still judged", () => {
  expect(tongueOf("да")).toBe("ru");
  expect(tongueOf("sure")).toBe("en");
});

test("a short English reply with one Russian word is still English", () => {
  // Found in review: by share alone these are `mixed`, and `mixed` is inert — so a
  // learner coming back to English while short of one word kept the streak they had
  // just broken and got escalated for it.
  expect(tongueOf("I like борщ")).toBe("en");
  expect(tongueOf("my мама is nice")).toBe("en");
});

test("a Russian reply with one English word is not a return to English", () => {
  // Found in the second review: `en` is the one verdict that forgives a streak, so
  // "one Russian word is a gap" without a majority test was an escape hatch — a
  // borrowed interjection every other turn held the ladder at its bottom rung and
  // the rule was never stated. These are inert instead: neither forgiven nor punished.
  for (const half of ["нет, sorry", "да, please", "хорошо ok", "yes, спасибо"]) {
    expect(tongueOf(half), half).toBe("mixed");
  }
});

test("two Russian words among two English ones is not English", () => {
  expect(tongueOf("I купил новый phone")).toBe("mixed");
});

test("a contraction is one word, not two English ones", () => {
  // Found in the third review: splitting on the apostrophe counted "can't" as two
  // English words, and two of those dragged a plainly Russian sentence down to
  // `mixed` — where nothing is said about it at all.
  expect(tongueOf("I can't давай по-русски сейчас")).toBe("ru");
  expect(tongueOf("I don't know")).toBe("en");
});

test("throat-clearing is not a language", () => {
  // `ru` would tell a learner who said "mm" that they spoke Russian; `en` would
  // forgive a run of Russian they never actually broke.
  for (const sound of ["а", "мм", "ммм", "um", "uh", "hmm", "э"]) {
    expect(tongueOf(sound), sound).toBe("unknown");
  }
  // Still real answers, though.
  expect(tongueOf("да")).toBe("ru");
  expect(tongueOf("ok")).toBe("en");
});
