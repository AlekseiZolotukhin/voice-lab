/**
 * Which language the learner just spoke, decided by script.
 *
 * Counted in words rather than characters on purpose. By character share, an
 * English sentence reaching for one Russian noun ("I like борщ") lands in the same
 * bucket as a sentence that is actually Russian, and the two call for opposite
 * responses: supply the missing word, or steer the lesson back.
 *
 * The agent is left multilingual for this to work at all. Forcing
 * `overrides.agent.language` to English would lock ASR to English, and a Russian
 * sentence would come back as mangled Latin rather than Cyrillic — the drift this
 * module exists to notice would become invisible. The agent answers in English
 * because the prompt says so, not because the transport forbids anything else.
 */

export type Tongue = "en" | "ru" | "mixed" | "unknown";

const CYRILLIC = /[Ѐ-ӿ]/;
const LATIN = /[A-Za-z]/;

/**
 * Share of Russian words at which an utterance counts as Russian, and the share
 * under which it counts as English. Chosen, not measured: no recording of a
 * learner drifting mid-lesson exists yet. What would move them is a fixture from
 * `?record` showing how ASR actually renders a half-Russian sentence.
 */
const RUSSIAN_AT = 0.6;
const ENGLISH_UNDER = 0.2;

/**
 * Russian words that still read as an English utterance, when English words
 * outnumber them.
 *
 * A share alone is not enough. "I like борщ" is one third Russian, which at any
 * useful threshold is neither English nor Russian — and because `mixed` is inert,
 * a learner who came back to English but reached for one noun would keep the
 * streak they had already broken, and be escalated for it.
 *
 * The majority test is what keeps that from becoming an escape hatch: "нет, sorry"
 * is also one Russian word, and `en` is the one verdict that forgives a streak.
 * Without it, a borrowed interjection every other turn held the ladder at its
 * bottom rung forever and the rule was never stated.
 */
const GAP_WORDS = 1;

/**
 * Sounds, not words. A learner clearing their throat is not choosing a language, and
 * either verdict on one is wrong in a way that matters: `ru` tells somebody who said
 * "mm" that they spoke Russian, and `en` forgives a run of Russian the learner never
 * actually broke.
 */
const FILLERS = new Set([
  "мм", "ммм", "эм", "ээ", "аа", "ааа", "ээм", "эээ",
  "mm", "mmm", "hmm", "hm", "um", "uh", "er", "erm", "ah",
]);

/**
 * One letter is never evidence of anything — "а" and "э" are the commonest things
 * ASR invents out of breath. Two still are: "да" and "ok" are real answers.
 */
const MIN_LETTERS = 2;

/** A word belongs to whichever script more of its letters are in. */
function wordTongue(word: string): "ru" | "en" | null {
  let cyr = 0;
  let lat = 0;
  for (const ch of word) {
    if (CYRILLIC.test(ch)) cyr++;
    else if (LATIN.test(ch)) lat++;
  }
  if (cyr === 0 && lat === 0) return null;
  return cyr > lat ? "ru" : "en";
}

/**
 * `mixed` is deliberately inert further up: it is a vocabulary gap, not a refusal
 * to speak English, so it neither escalates the steering nor clears it.
 * `unknown` covers "123", "…" and silence — nothing was said to judge.
 */
export function tongueOf(text: string): Tongue {
  let ru = 0;
  let en = 0;
  let letters = 0;
  // Apostrophes stay inside the word: splitting on them turned "can't" into two
  // English words, and two of those were enough to drag a Russian sentence down to
  // `mixed`, where nothing is said about it at all.
  for (const word of text.toLowerCase().split(/[^\p{L}'’]+/u)) {
    const tongue = wordTongue(word);
    if (tongue === null || FILLERS.has(word)) continue;
    letters += word.length;
    if (tongue === "ru") ru++;
    else en++;
  }
  if (ru + en === 0 || letters < MIN_LETTERS) return "unknown";
  if (ru === 0) return "en";
  if (en === 0) return "ru";
  // One Russian word among a majority of English ones is the gap, whatever the
  // arithmetic says. A 1:1 split is not: it falls through to `mixed`, which is inert.
  if (ru <= GAP_WORDS && en > ru) return "en";

  const share = ru / (ru + en);
  if (share >= RUSSIAN_AT) return "ru";
  if (share <= ENGLISH_UNDER) return "en";
  return "mixed";
}
