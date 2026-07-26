const HEART_OUTLINE_PATH = "M480 840 422 788Q321 697 255 631T150 512.5Q111 460 95.5 416T80 326Q80 232 143 169T300 106Q352 106 399 128T480 190Q514 150 561 128T660 106Q754 106 817 169T880 326Q880 372 864.5 416T810 512.5Q771 565 705 631T538 788L480 840ZM480 732Q576 646 638 584.5T736 477.5Q772 432 786 396.5T800 326Q800 266 760 226T660 186Q613 186 573 212.5T518 280H442Q427 239 387 212.5T300 186Q240 186 200 226T160 326Q160 361 174 396.5T224 477.5Q260 523 322 584.5T480 732Z";
const HEART_FILL_PATH = "M480 840 422 788Q321 697 255 631T150 512.5Q111 460 95.5 416T80 326Q80 232 143 169T300 106Q352 106 399 128T480 190Q514 150 561 128T660 106Q754 106 817 169T880 326Q880 372 864.5 416T810 512.5Q771 565 705 631T538 788L480 840Z";
const THUMB_DOWN_PATH = "M280 120H720L840 400V520H594L640 760Q646 795 623 827T560 860L520 840 300 590H160Q127 590 103 566T80 510V440Q80 425 84 411L180 170Q192 145 219 133T280 120ZM280 200 160 440V510H336L550 754 504 440H744L666 200H280Z";
const NOT_INTERESTED_PATH = "M480 80Q563 80 636 111T764 196Q819 251 849 324T880 480Q880 563 849 636T764 764Q709 819 636 849T480 880Q397 880 324 849T196 764Q141 709 111 636T80 480Q80 397 111 324T196 196Q251 141 324 111T480 80ZM480 160Q374 160 291 219L741 669Q800 586 800 480Q800 347 706 254T480 160ZM219 291Q160 374 160 480Q160 613 254 706T480 800Q586 800 669 741L219 291Z";

export const REACTION_DEFINITIONS = Object.freeze([
  Object.freeze({
    id: "like",
    label: "Like",
    activeLabel: "Unlike",
    path: HEART_OUTLINE_PATH,
    activePath: HEART_FILL_PATH,
    exactItemBlock: false,
  }),
  Object.freeze({
    id: "dislike",
    label: "Dislike",
    activeLabel: "Remove dislike",
    path: THUMB_DOWN_PATH,
    activePath: THUMB_DOWN_PATH,
    exactItemBlock: false,
  }),
  Object.freeze({
    id: "notInterested",
    label: "Not interested",
    activeLabel: "Undo not interested",
    path: NOT_INTERESTED_PATH,
    activePath: NOT_INTERESTED_PATH,
    exactItemBlock: true,
  }),
]);

export const REACTION_IDS = Object.freeze(REACTION_DEFINITIONS.map(({ id }) => id));

function dwellStrength(viewMs, context = {}) {
  const elapsed = Math.max(0, Number(viewMs) || 0);
  if (elapsed === 0) return 0;
  const contextualLongMs = Math.max(15_000, Number(context.longDwellMs) || 0);
  const normalized = Math.log1p(elapsed) / Math.log1p(contextualLongMs);
  return Math.min(0.68, 0.18 + 0.5 * normalized);
}

// Each signal is an independent relation/objective. Adding a future feedback type
// means registering one extractor instead of inserting it into a global rank ladder.
export const FEEDBACK_SIGNALS = Object.freeze([
  Object.freeze({
    id: "like",
    objective: "affinity",
    polarity: 1,
    strength: (record) => record.signals.reaction === "like" ? 0.82 : 0,
  }),
  Object.freeze({
    id: "click",
    objective: "affinity",
    polarity: 1,
    strength: (record) => record.signals.click ? 1 : 0,
  }),
  Object.freeze({
    id: "dwell",
    objective: "affinity",
    polarity: 1,
    strength: (record, context) => dwellStrength(record.signals.dwellMs, context),
  }),
  Object.freeze({
    id: "dislike",
    objective: "avoidance",
    polarity: -1,
    strength: (record) => record.signals.reaction === "dislike" ? 0.92 : 0,
  }),
  Object.freeze({
    id: "notInterested",
    objective: "avoidance",
    polarity: -1,
    strength: (record) => record.signals.reaction === "notInterested" ? 1.35 : 0,
  }),
]);

export function feedbackTerms(record, context = {}) {
  if (!record) return [];
  const explicitNegative = record.signals.reaction === "dislike" || record.signals.reaction === "notInterested";
  return FEEDBACK_SIGNALS
    .filter(({ polarity }) => !explicitNegative || polarity < 0)
    .map((signal) => ({ ...signal, strength: signal.strength(record, context) }))
    .filter(({ strength }) => strength > 0);
}

export function reactionDefinition(id) {
  return REACTION_DEFINITIONS.find((reaction) => reaction.id === id);
}
