import test from "node:test";
import assert from "node:assert/strict";
import {
  articleVector,
  MultiFeedbackBprRecommender,
  RECOMMENDER_DIMENSIONS,
} from "../site/recommender.mjs";
import { feedbackTerms } from "../site/feedback-registry.mjs";

const space = { pageid: 1, title: "Moon mission", extract: "A spacecraft, rocket, astronaut and lunar orbit.", categories: ["Spaceflight"] };
const cooking = { pageid: 2, title: "French cuisine", extract: "Recipes, restaurants, bread, sauce and pastry.", categories: ["Cooking"] };
const music = { pageid: 3, title: "String quartet", extract: "Violin, viola, cello, chamber music and composition.", categories: ["Music"] };
const similarSpace = { ...space, pageid: 7, title: "Lunar spacecraft" };

function feedback(article, changes = {}) {
  return {
    article,
    signals: { reaction: null, click: false, dwellMs: 0 },
    reactionAt: 0,
    updatedAt: 1,
    ...changes,
    signals: { reaction: null, click: false, dwellMs: 0, ...changes.signals },
  };
}

function trained(record, candidates = [cooking, similarSpace]) {
  const model = new MultiFeedbackBprRecommender({ feedback: [record] });
  model.rerank(candidates, () => 0.5);
  return model;
}

test("article vectors are normalized and bounded", () => {
  const vector = articleVector(space);
  const magnitude = Math.sqrt([...vector].reduce((total, value) => total + value * value, 0));
  assert.equal(vector.length, RECOMMENDER_DIMENSIONS);
  assert.ok(Math.abs(magnitude - 1) < 0.0001);
});

test("registered relations remain independent instead of forming a hard-coded ladder", () => {
  const terms = feedbackTerms(feedback(space, { signals: { reaction: "like", click: true, dwellMs: 45_000 } }), {
    longDwellMs: 15_000,
  });
  assert.deepEqual(terms.map(({ id }) => id), ["like", "click", "dwell"]);
  assert.ok(terms.find(({ id }) => id === "click").strength > terms.find(({ id }) => id === "like").strength);

  const negativeTerms = feedbackTerms(feedback(space, {
    signals: { reaction: "notInterested", click: true, dwellMs: 45_000 },
  }));
  assert.deepEqual(negativeTerms.map(({ id }) => id), ["notInterested"]);
  assert.equal(negativeTerms[0].polarity, -1);

  const dwell = (dwellMs) => feedbackTerms(
    feedback(space, { signals: { dwellMs } }),
    { longDwellMs: 15_000 },
  )[0]?.strength || 0;
  assert.ok(dwell(45_000) > dwell(5_000));
  assert.ok(dwell(5_000) > dwell(500));
  assert.equal(dwell(0), 0);
});

test("like, click, and dwell all learn toward similar content", () => {
  for (const record of [
    feedback(space, { signals: { reaction: "like" } }),
    feedback(space, { signals: { click: true } }),
    feedback(space, { signals: { dwellMs: 45_000 } }),
  ]) {
    const model = trained(record);
    assert.ok(model.score(similarSpace) > model.score(cooking));
  }
});

test("combined click and like contributes more confidence than either signal alone", () => {
  const combined = trained(feedback(space, { signals: { reaction: "like", click: true } }));
  const clicked = trained(feedback(space, { signals: { click: true } }));
  const liked = trained(feedback(space, { signals: { reaction: "like" } }));
  const longView = trained(feedback(space, { signals: { dwellMs: 45_000 } }));
  const margin = (model) => model.score(similarSpace) - model.score(cooking);

  assert.ok(margin(combined) > margin(clicked));
  assert.ok(margin(clicked) > margin(liked));
  assert.ok(margin(liked) > margin(longView));
});

test("negative-only history learns away from similar candidates", () => {
  for (const reaction of ["dislike", "notInterested"]) {
    const model = trained(feedback(space, { signals: { reaction } }));
    assert.ok(model.score(cooking) > model.score(similarSpace));
  }
});

test("not interested applies a stronger avoidance objective than dislike", () => {
  const disliked = trained(feedback(space, { signals: { reaction: "dislike" } }));
  const dismissed = trained(feedback(space, { signals: { reaction: "notInterested" } }));
  const avoidance = (model) => model.score(cooking) - model.score(similarSpace);
  assert.ok(avoidance(dismissed) > avoidance(disliked));
});

test("an explicit negative overrides earlier click and dwell until cleared", () => {
  const negative = trained(feedback(space, {
    signals: { reaction: "dislike", click: true, dwellMs: 45_000 },
  }));
  assert.ok(negative.score(cooking) > negative.score(similarSpace));

  const cleared = trained(feedback(space, {
    signals: { reaction: null, click: true, dwellMs: 45_000 },
  }));
  assert.ok(cleared.score(similarSpace) > cleared.score(cooking));
});

test("positive and negative relations jointly separate their content", () => {
  const model = new MultiFeedbackBprRecommender({
    feedback: [
      feedback(space, { signals: { reaction: "like", click: true } }),
      feedback(cooking, { signals: { reaction: "notInterested" } }),
    ],
  });
  assert.ok(model.score(space) > model.score(cooking));
});

test("the learned profile reconstructs independently of storage order", () => {
  const records = [
    feedback(space, { signals: { reaction: "like" } }),
    feedback(cooking, { signals: { reaction: "dislike" } }),
    feedback(music, { signals: { click: true } }),
  ];
  const left = new MultiFeedbackBprRecommender({ feedback: records });
  const right = new MultiFeedbackBprRecommender({ feedback: [...records].reverse() });
  assert.deepEqual([...left.profile], [...right.profile]);
});

test("reranking is deterministic when exploration randomness is controlled", () => {
  const model = trained(feedback(space, { signals: { reaction: "like" } }));
  const ranked = model.rerank([cooking, similarSpace], () => 0.99);
  assert.equal(ranked[0], similarSpace);
});

test("Gumbel sampling can explore an alternative without replacement", () => {
  const model = trained(feedback(space, { signals: { reaction: "like" } }));
  const draws = [1 - Number.EPSILON, Number.EPSILON];
  const ranked = model.rerank([cooking, similarSpace], () => draws.shift());
  assert.deepEqual(ranked, [cooking, similarSpace]);
  assert.equal(new Set(ranked).size, ranked.length);
});

test("cold start shuffles instead of preserving API order", () => {
  const model = new MultiFeedbackBprRecommender();
  const ranked = model.rerank([space, cooking], () => 0);
  assert.deepEqual(ranked, [cooking, space]);
});
