import { DIRECTIVE_MARKER } from "../persona";
import { tongueOf } from "./language";

/**
 * The lesson's state machine: what the tutor knows, and what it wants the agent to
 * do about it.
 *
 * A pure reducer, because the one thing this feature promises — the conversation
 * stays in English — must not depend on a model choosing to remember seven
 * instructions at once. The prompt carries the manner; the counters, the thresholds
 * and the decision to escalate live here, where a test can drive them. Full
 * reasoning: docs/tutor.md
 */

/**
 * Deliberately only what drives a decision. Counters that nothing reads look like
 * the lesson's record and are not one — a streak nobody consults cannot be wrong,
 * so it cannot be tested either. The observable record of a lesson is the sequence
 * of directives it produced.
 */
export interface LessonState {
  /**
   * Directives the agent was actually handed during this run of Russian. The rung is
   * derived from this rather than from how many Russian sentences there were: a nudge
   * that never left the page is a rung the learner never heard, and climbing past it
   * would state the rule to someone who was never invited back.
   */
  steersDelivered: number;
  /** The exit has been offered. Made once per run, not on every sentence after it. */
  offered: boolean;
}

export const INITIAL_LESSON: LessonState = {
  steersDelivered: 0,
  offered: false,
};

export type TutorInput = { kind: "user-utterance"; text: string };

/**
 * `level` is the assertion; `text` is only the wording handed to the agent. Tests
 * assert the level, so the phrasing can be reworded without a test going red over
 * a sentence nobody promised.
 */
export type TutorAction = { type: "steer-english"; level: 1 | 2 | 3; text: string };

/**
 * Where the ladder steps, counted in nudges the learner has actually been given.
 * The first gets a warm invitation back, the second gets the rule stated, and only
 * a learner who keeps going after that is offered the exit — the third is
 * deliberately given another chance at rung 2 rather than escalated, because
 * asking twice is a nudge and asking every time is nagging.
 *
 * Chosen, not measured, and these two numbers are the whole policy: raise OFFER_AT
 * to be more patient, lower it to be stricter.
 */
const FIRM_AT = 2;
const OFFER_AT = 4;

/**
 * Directives reach the agent as contextual updates — context it acts on, not a turn
 * it answers and not a line it reads out.
 */
export function steerDirective(level: 1 | 2 | 3): string {
  if (level === 1) {
    return `${DIRECTIVE_MARKER} The learner just spoke Russian. Answer in English only, warmly, and invite them to try the same thing in English. Do not translate it for them.`;
  }
  if (level === 2) {
    return `${DIRECTIVE_MARKER} The learner is speaking Russian again. Stay in English, say in one short sentence that the lesson only works in English, and give them an easy question they can answer in three or four words.`;
  }
  return `${DIRECTIVE_MARKER} The learner keeps speaking Russian. In English, offer to stop the lesson for today and say they are welcome back whenever they want to practise in English. Do not hang up — wait for their answer, and carry on in English if they choose to stay.`;
}

/**
 * Which rung the next nudge belongs on.
 *
 * Once the exit has been offered, further slips drop back to steady reminders. The
 * learner has heard the offer; repeating it every turn is the nagging the rung-2
 * rule above exists to avoid, and the alternative — saying nothing — would leave
 * the lesson to carry on in Russian unopposed.
 */
function levelFor(nudge: number, offered: boolean): 1 | 2 | 3 {
  if (offered) return 2;
  if (nudge >= OFFER_AT) return 3;
  if (nudge >= FIRM_AT) return 2;
  return 1;
}

/**
 * One utterance in, the next state and whatever the agent should be told out.
 *
 * The state returned assumes the directives reach the agent. They are sent by
 * `supervisor.ts`, which reports a failure back through `undelivered()`.
 *
 * Only Russian advances the ladder. `mixed` leaves the streak untouched on
 * purpose — reaching for one Russian word inside an English sentence is a gap to
 * fill, not drift to correct — and `unknown` is nothing having been said.
 */
export function step(state: LessonState, input: TutorInput): [LessonState, TutorAction[]] {
  const tongue = tongueOf(input.text);

  if (tongue === "ru") {
    const nudge = state.steersDelivered + 1;
    const level = levelFor(nudge, state.offered);
    return [
      { steersDelivered: nudge, offered: state.offered || level === 3 },
      [{ type: "steer-english", level, text: steerDirective(level) }],
    ];
  }

  // A return to English forgives the run outright, the offer included: a learner who
  // came back and later drifts again is invited back warmly rather than met with the
  // rule they earned an hour ago.
  if (tongue === "en") return [INITIAL_LESSON, []];

  return [state, []];
}

/**
 * The state to keep when a directive did not reach the agent.
 *
 * Everything the utterance taught us is kept — it was still said — but the rung is
 * not climbed, so the next slip repeats the nudge the learner never heard instead
 * of escalating past it.
 */
export function undelivered(before: LessonState, _after: LessonState): LessonState {
  return before;
}
