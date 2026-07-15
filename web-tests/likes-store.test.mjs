import test from "node:test";
import assert from "node:assert/strict";
import { LIKES_KEY, loadLikes, saveLikes } from "../site/likes-store.mjs";

class MemoryStorage {
  values = new Map();
  getItem(key) { return this.values.get(key) ?? null; }
  setItem(key, value) { this.values.set(key, value); }
}

const article = { pageid: 42, title: "Moon", url: "https://en.wikipedia.org/wiki/Moon", extract: "Earth's moon" };

test("likes round-trip through the versioned device store", () => {
  const storage = new MemoryStorage();
  const likes = new Map([[String(article.pageid), article]]);
  assert.equal(saveLikes(likes, storage), true);
  assert.deepEqual([...loadLikes(storage).values()], [article]);
  assert.match(storage.getItem(LIKES_KEY), /\"version\":1/);
});

test("corrupt and wrong-version records reset safely", () => {
  const storage = new MemoryStorage();
  storage.setItem(LIKES_KEY, "not json");
  assert.equal(loadLikes(storage).size, 0);
  storage.setItem(LIKES_KEY, JSON.stringify({ version: 99, articles: [article] }));
  assert.equal(loadLikes(storage).size, 0);
});

test("invalid article records are ignored", () => {
  const storage = new MemoryStorage();
  storage.setItem(LIKES_KEY, JSON.stringify({ version: 1, articles: [article, { pageid: 9 }] }));
  assert.deepEqual([...loadLikes(storage).values()], [article]);
});

test("unavailable storage keeps the app usable", () => {
  const unavailable = {
    getItem() { throw new Error("disabled"); },
    setItem() { throw new Error("disabled"); },
  };
  assert.equal(loadLikes(unavailable).size, 0);
  assert.equal(saveLikes(new Map(), unavailable), false);
});
