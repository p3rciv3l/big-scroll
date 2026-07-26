import test from "node:test";
import assert from "node:assert/strict";
import {
  FeedbackStore,
  FEEDBACK_KEY,
  LEGACY_ENGAGEMENT_KEY,
  LEGACY_LIKES_KEY,
} from "../site/feedback-store.mjs";

class MemoryStorage {
  values = new Map();
  getItem(key) { return this.values.get(key) ?? null; }
  setItem(key, value) { this.values.set(key, value); }
}

const article = {
  pageid: 42,
  title: "Moon",
  url: "https://en.wikipedia.org/wiki/Moon",
  extract: "Earth's moon",
  image: "moon.jpg",
};

test("explicit reactions are mutually exclusive, reversible, and preserve implicit feedback", () => {
  const storage = new MemoryStorage();
  let now = 0;
  const store = new FeedbackStore(storage, { now: () => ++now });
  store.recordView(article, 2_000);
  store.recordClick(article);
  store.toggleReaction(article, "like");
  assert.equal(store.reaction(article), "like");
  assert.deepEqual(store.likedArticles(), [article]);

  store.toggleReaction(article, "dislike");
  assert.equal(store.reaction(article), "dislike");
  assert.deepEqual(store.likedArticles(), []);
  assert.equal(store.get(article).signals.click, true);
  assert.equal(store.get(article).signals.dwellMs, 2_000);

  store.toggleReaction(article, "dislike");
  assert.equal(store.reaction(article), null);
  assert.equal(store.get(article).signals.click, true);
  assert.match(storage.getItem(FEEDBACK_KEY), /"version":2/);
});

test("not interested suppresses the exact item and can be undone", () => {
  const store = new FeedbackStore(new MemoryStorage());
  store.toggleReaction(article, "notInterested");
  assert.equal(store.isSuppressed(article), true);
  store.toggleReaction(article, "notInterested");
  assert.equal(store.isSuppressed(article), false);
});

test("arbitrary future signals round-trip without a schema change", () => {
  const storage = new MemoryStorage();
  const store = new FeedbackStore(storage);
  store.recordSignal(article, "shared", 2);

  assert.equal(new FeedbackStore(storage).get(article).signals.shared, 2);
});

test("v1 likes and engagements migrate into one richer v2 record", () => {
  const storage = new MemoryStorage();
  storage.setItem(LEGACY_LIKES_KEY, JSON.stringify({
    version: 1,
    articles: [article],
  }));
  storage.setItem(LEGACY_ENGAGEMENT_KEY, JSON.stringify({
    version: 1,
    engagements: [{
      article: { ...article, image: undefined },
      clicked: true,
      viewMs: 5_000,
      updatedAt: 12,
    }],
  }));

  const store = new FeedbackStore(storage, { now: () => 10 });
  assert.deepEqual(store.get(article), {
    article,
    signals: { reaction: "like", click: true, dwellMs: 5_000 },
    reactionAt: 10,
    updatedAt: 12,
  });
  assert.match(storage.getItem(FEEDBACK_KEY), /"version":2/);
});

test("one corrupt legacy source does not prevent partial migration", () => {
  const storage = new MemoryStorage();
  storage.setItem(LEGACY_LIKES_KEY, "not json");
  storage.setItem(LEGACY_ENGAGEMENT_KEY, JSON.stringify({
    version: 1,
    engagements: [{ article, clicked: true, viewMs: 0, updatedAt: 4 }],
  }));

  assert.equal(new FeedbackStore(storage).get(article).signals.click, true);
});

test("the implicit cap never evicts explicit reactions", () => {
  const store = new FeedbackStore(new MemoryStorage(), { implicitLimit: 2 });
  store.toggleReaction({ ...article, pageid: 1 }, "like");
  store.toggleReaction({ ...article, pageid: 2 }, "dislike");
  store.toggleReaction({ ...article, pageid: 3 }, "notInterested");
  store.recordClick({ ...article, pageid: 4 });
  store.recordClick({ ...article, pageid: 5 });
  store.recordClick({ ...article, pageid: 6 });

  assert.deepEqual(
    store.values().filter(({ signals }) => signals.reaction).map(({ article: item }) => item.pageid).sort(),
    [1, 2, 3],
  );
  assert.deepEqual(
    store.values().filter(({ signals }) => !signals.reaction).map(({ article: item }) => item.pageid),
    [5, 6],
  );
});

test("liked ordering is based on reaction time, not later viewing", () => {
  let now = 0;
  const store = new FeedbackStore(new MemoryStorage(), { now: () => ++now });
  const first = { ...article, pageid: 1 };
  const second = { ...article, pageid: 2 };
  store.toggleReaction(first, "like");
  store.toggleReaction(second, "like");
  store.recordView(first, 3_000);

  assert.deepEqual(store.likedArticles().map(({ pageid }) => pageid), [1, 2]);
});

test("unavailable storage keeps the app usable", () => {
  const unavailable = {
    getItem() { throw new Error("disabled"); },
    setItem() { throw new Error("disabled"); },
  };
  const store = new FeedbackStore(unavailable);
  store.toggleReaction(article, "like");
  assert.equal(store.reaction(article), "like");
  assert.equal(store.persist(), false);
});
