export const RECOMMENDER_DIMENSIONS = 256;
const DIMENSIONS = RECOMMENDER_DIMENSIONS;
const STOP_WORDS = new Set(
  "a an and are as at be been by for from has have he her his in into is it its of on or that the their this to was were which who will with".split(" "),
);

// This model composes established techniques rather than defining a new recommender:
// - Rocchio positive-centroid relevance feedback: J. J. Rocchio,
//   The SMART Retrieval System (1971).
// - Feature hashing: Weinberger et al., ICML 2009, https://doi.org/10.1145/1553374.1553516
// - Epsilon-greedy exploration: Sutton & Barto, Reinforcement Learning (2nd ed.), section 2.2.

function hashToken(token) {
  let hash = 2166136261;
  for (let index = 0; index < token.length; index += 1) {
    hash ^= token.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function articleVector(article) {
  const vector = new Float32Array(DIMENSIONS);
  const categories = (article.categories || []).map((category) => category.title || category).join(" ");
  const text = `${article.title || ""} ${article.title || ""} ${categories} ${article.extract || ""}`.toLowerCase();
  const tokens = text.match(/[\p{L}\p{N}]{3,}/gu) || [];

  for (const token of tokens) {
    if (STOP_WORDS.has(token)) continue;
    const hash = hashToken(token);
    const bucket = hash % DIMENSIONS;
    const sign = (hash & 256) === 0 ? 1 : -1;
    vector[bucket] += sign;
  }

  normalizeInPlace(vector);
  return vector;
}

function cosine(left, right) {
  let score = 0;
  for (let index = 0; index < left.length; index += 1) score += left[index] * right[index];
  return score;
}

function normalizeInPlace(vector) {
  let magnitude = 0;
  for (const value of vector) magnitude += value * value;
  magnitude = Math.sqrt(magnitude) || 1;
  for (let index = 0; index < vector.length; index += 1) vector[index] /= magnitude;
}

export class RocchioRecommender {
  constructor(likedArticles = []) {
    this.profile = new Float32Array(DIMENSIONS);
    this.feedback = new Map();
    for (const article of likedArticles) this.feedback.set(this.keyFor(article), articleVector(article));
    this.rebuild();
  }

  get feedbackCount() {
    return this.feedback.size;
  }

  keyFor(article) {
    return String(article.pageid ?? article.title);
  }

  like(article) {
    this.feedback.set(this.keyFor(article), articleVector(article));
    this.rebuild();
  }

  unlike(article) {
    this.feedback.delete(this.keyFor(article));
    this.rebuild();
  }

  rebuild() {
    this.profile.fill(0);
    if (this.feedback.size === 0) return;
    for (const item of this.feedback.values()) {
      for (let index = 0; index < DIMENSIONS; index += 1) this.profile[index] += item[index];
    }
    normalizeInPlace(this.profile);
  }

  score(article) {
    if (this.feedbackCount === 0) return 0;
    return cosine(this.profile, articleVector(article));
  }

  rerank(articles, random = Math.random) {
    if (this.feedbackCount === 0) {
      const shuffled = [...articles];
      for (let index = shuffled.length - 1; index > 0; index -= 1) {
        const swapWith = Math.floor(random() * (index + 1));
        [shuffled[index], shuffled[swapWith]] = [shuffled[swapWith], shuffled[index]];
      }
      return shuffled;
    }
    const epsilon = Math.max(0.05, 0.22 * Math.exp(-this.feedbackCount / 18));
    const remaining = articles.map((article) => ({ article, score: this.score(article) }));
    const ranked = [];
    while (remaining.length > 0) {
      const index = random() < epsilon
        ? Math.floor(random() * remaining.length)
        : remaining.reduce(
          (best, candidate, candidateIndex, all) => candidate.score > all[best].score ? candidateIndex : best,
          0,
        );
      ranked.push(remaining.splice(index, 1)[0].article);
    }
    return ranked;
  }
}
