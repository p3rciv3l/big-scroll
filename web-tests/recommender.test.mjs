import test from "node:test";
import assert from "node:assert/strict";
import { articleVector, RECOMMENDER_DIMENSIONS, RocchioRecommender } from "../site/recommender.mjs";

const space = { pageid: 1, title: "Moon mission", extract: "A spacecraft, rocket, astronaut and lunar orbit.", categories: ["Spaceflight"] };
const cooking = { pageid: 2, title: "French cuisine", extract: "Recipes, restaurants, bread, sauce and pastry.", categories: ["Cooking"] };

test("article vectors are normalized and bounded", () => {
  const vector = articleVector(space);
  const magnitude = Math.sqrt([...vector].reduce((total, value) => total + value * value, 0));
  assert.equal(vector.length, RECOMMENDER_DIMENSIONS);
  assert.ok(Math.abs(magnitude - 1) < 0.0001);
});

test("a like raises similar content above unrelated content", () => {
  const model = new RocchioRecommender([space]);
  assert.ok(model.score({ ...space, title: "Lunar spacecraft" }) > model.score(cooking));
});

test("the learned profile reconstructs from persisted likes", () => {
  const restored = new RocchioRecommender(JSON.parse(JSON.stringify([space])));
  assert.equal(restored.feedbackCount, 1);
  assert.ok(restored.score(space) > restored.score(cooking));
});

test("like then unlike restores the empty profile", () => {
  const model = new RocchioRecommender();
  model.like(space);
  model.unlike(space);
  assert.equal(model.feedbackCount, 0);
  assert.equal(model.score(space), 0);
});

test("repeating the same like is idempotent", () => {
  const model = new RocchioRecommender();
  model.like(space);
  const firstProfile = [...model.profile];
  model.like(space);
  assert.equal(model.feedbackCount, 1);
  assert.deepEqual([...model.profile], firstProfile);
});

test("the Rocchio centroid is independent of like order", () => {
  const left = new RocchioRecommender([space, cooking]);
  const right = new RocchioRecommender([cooking, space]);
  assert.deepEqual([...left.profile], [...right.profile]);
});

test("reranking is deterministic when exploration randomness is controlled", () => {
  const model = new RocchioRecommender([space]);
  const ranked = model.rerank([cooking, space], () => 0.99);
  assert.equal(ranked[0], space);
});

test("cold start shuffles instead of preserving API order", () => {
  const model = new RocchioRecommender();
  const ranked = model.rerank([space, cooking], () => 0);
  assert.deepEqual(ranked, [cooking, space]);
});
