import type { EventBus } from "../events";
import {
  INITIAL_LESSON,
  step,
  undelivered,
  type LessonState,
  type TutorAction,
} from "./lesson";

/**
 * Runs the lesson reducer against the live conversation.
 *
 * The only impure part of the tutor, and deliberately thin: it reads the same event
 * bus the scene reads, so it never touches the pipeline, and it acts through one
 * method. Everything that decides anything is in `lesson.ts` and is pure.
 */

/**
 * How the tutor reaches the agent mid-conversation. `AgentSession` satisfies it;
 * a test hands over a recorder instead.
 *
 * `false` means the directive was not handed over at all — there was no live
 * conversation to hand it to. `true` means the SDK took it, which is as much as
 * anything here can know: the SDK itself drops a message with a console warning
 * when the room is mid-reconnect, and nothing acknowledges one that arrives.
 */
export interface TutorChannel {
  sendContext(text: string): boolean;
}

export class Tutor {
  private state: LessonState = INITIAL_LESSON;

  constructor(
    private bus: EventBus,
    private channel: TutorChannel,
  ) {}

  get lesson(): LessonState {
    return this.state;
  }

  /** Subscribes to the conversation. Returns the unsubscribe, like `EventBus.on`. */
  attach(): () => void {
    return this.bus.on((e) => {
      // `stt-result` is what the recogniser heard, i.e. the learner's own words.
      // The agent's replies are not judged: steering the tutor by its own English
      // would clear the streak the learner just set.
      if (e.type !== "stt-result") return;
      const [next, actions] = step(this.state, {
        kind: "user-utterance",
        text: e.result.text,
      });
      let delivered = true;
      for (const action of actions) delivered = this.dispatch(action) && delivered;
      this.state = delivered ? next : undelivered(this.state, next);
    });
  }

  /** A new conversation is a new lesson; the previous streak is not the learner's. */
  reset(): void {
    this.state = INITIAL_LESSON;
  }

  private dispatch(action: TutorAction): boolean {
    return this.channel.sendContext(action.text);
  }
}
