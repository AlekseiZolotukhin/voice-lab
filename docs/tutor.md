# Tutor

The agent is an English tutor. The lesson is held in two places, and the split is the
whole design: the **prompt** carries the manner, and `src/lib/tutor/` carries whatever
must be true whether or not a model felt like following seven instructions at once.

- [`persona.ts`](../src/lib/persona.ts) — the role, sent once in the handshake
- [`language.ts`](../src/lib/tutor/language.ts) — which language the learner just spoke
- [`lesson.ts`](../src/lib/tutor/lesson.ts) — the pure reducer: state in, directives out
- [`supervisor.ts`](../src/lib/tutor/supervisor.ts) — the only impure part, bus to channel

## How the tutor reaches a conversation already running

The role applies once, at session start ([pipeline](pipeline.md)), so nothing about it
can be changed mid-lesson. What can is `sendContextualUpdate()`: context the agent acts
on, which is neither a turn it answers nor a line it reads out. Every decision the
reducer makes leaves as one of those, marked `[TUTOR DIRECTIVE]` — the marker is what
the prompt keys on to keep it unspoken.

**A directive lands one turn late, or very nearly.** `stt-result` is emitted in the same
tick that opens the `llm` lane — recognition finishing is what tells us the model has
started — so the update is published while the reply to that very sentence is already
being generated. Whether it reaches the current turn or the next one is the server's
race, not ours, and there is no earlier signal to use: the language of a sentence is not
knowable before the sentence has been recognised. So the first nudge is normally heard
in the reply *after* the slip. The ladder is built for that — the first rung is an
invitation, not a reprimand — but a rung never means "this was said about this
sentence".

**Delivery is only half observable.** `sendContext` reports whether there was a live
conversation to hand the update to; past that the SDK drops a message with a console
warning of its own when the room is mid-reconnect, and nothing acknowledges one that
arrives. The rung is therefore counted in directives *handed over*, not in Russian
sentences: a nudge that never left the page is a rung the learner never heard, and
climbing past it would state the rule to somebody who was never invited back.

## Holding the lesson in English

The product's first promise, so it is not left to the prompt alone. `lesson.ts` counts
consecutive Russian utterances and escalates: an invitation back, then the rule stated,
then an offer to stop. The third slip is deliberately given another chance at rung 2
rather than escalated — asking twice is a nudge, asking every time is nagging.

**The ladder stops at offering.** Nothing in here ends a conversation; the learner does.
The agent cannot hang up either — that needs ElevenLabs' end-call tool, which lives on
the agent and is not configured.

Two numbers are the whole policy (`FIRM_AT`, `OFFER_AT`). They are chosen, not measured:
no recording of a learner drifting mid-lesson exists yet.

## Why the agent is left multilingual

`overrides.agent.language` would force English, and it is tempting. It also locks ASR to
English, and then a Russian sentence comes back as mangled Latin instead of Cyrillic —
the drift this code exists to notice would become invisible, with nothing in the
transcript to see it by. The agent answers in English because the prompt says so.

For the same reason the opening question about level is in the prompt rather than in
`overrides.agent.firstMessage`: an override the agent does not permit closes the
connection instead of being ignored, and that reaches the page as a dropped
conversation rather than an error about prompts.

**So the first thing the learner hears is still the dashboard's.** Whatever first message
the ElevenLabs agent has configured is said before the tutor's role has any say, and this
code can neither read it nor change it. The prompt therefore asks for the level in the
agent's *first reply* rather than as an opening line, which holds whether that first
message is the old pipeline greeting, something else, or nothing at all. Getting the
greeting itself under code needs the `firstMessage` override enabled on the agent.

## What counts as speaking Russian

Counted in words, not characters. By character share, "yesterday I cooked борщ for my
family" is 40% Cyrillic and lands in the same bucket as a sentence that is actually
Russian — and the two call for opposite responses: supply the English word, or steer the
lesson back.

So `mixed` is inert: it neither escalates the ladder nor clears it. `unknown` — an empty
transcript, "123", "..." — is not silence passing for English, which would quietly
forgive a streak the learner never broke.

## Checking a change

`npm test`. The reducer is a pure function over strings, and the supervisor is tested
against a real `EventBus` with a recording channel, so a whole lesson — drift, steering,
return, relapse — runs in milliseconds without a token or a microphone.

One of those tests is not of a pure function:
[`tutor-wiring.test.tsx`](../src/tutor-wiring.test.tsx) drives the chain through the real
`App`, because every pure-function test here stayed green when the single line that
subscribes the tutor was deleted.

What tests cannot tell you is whether the tutor is any good to talk to: whether it
corrects without nagging, and whether it is dull. That needs a conversation.
