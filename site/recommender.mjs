import { feedbackTerms } from "./feedback-registry.mjs?v=14";

export const RECOMMENDER_DIMENSIONS = 256;
const DIMENSIONS = RECOMMENDER_DIMENSIONS;
const MIN_VIEW_MS = 1_500;
const LONG_DWELL_PRIOR_MS = 15_000;
const LEARNING_RATE = 0.08;
const REGULARIZATION = 0.002;
const MAX_PAIR_UPDATES = 512;
const MAX_UNOBSERVED_UPDATES = 256;
const MIN_UNOBSERVED_SAMPLES_PER_ITEM = 8;
// This is a lightweight, relation-aware implementation built from published
// Multi-Feedback BPR and explicit "not-to-recommend" objectives. Each registered
// signal contributes its own positive or negative pairwise loss; no global
// feedback ladder collapses clicks, dwell, likes, and negative controls:
// - https://doi.org/10.1145/2959100.2959163 (multi-feedback BPR)
// - https://www.ismll.uni-hildesheim.de/pub/pdfs/Rendle_et_al2009-Bayesian_Personalized_Ranking.pdf
// - https://arxiv.org/abs/2308.12256 (explicit not-to-recommend feedback)
// - https://arxiv.org/abs/1903.06059 (Gumbel-top-k sampling)
// - https://www.ietf.org/archive/id/draft-eastlake-fnv-25.html (FNV-1a)
// The 256 dimensions are an implementation memory bound, not a new ranking method.

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
  const text = `${article.title || ""} ${categories} ${article.extract || ""}`.toLowerCase();
  const tokens = text.match(/[\p{L}\p{N}]{3,}/gu) || [];

  for (const token of tokens) {
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

function boundMagnitude(vector, maximum = 4) {
  let squared = 0;
  for (const value of vector) squared += value * value;
  const magnitude = Math.sqrt(squared);
  if (magnitude <= maximum) return;
  for (let index = 0; index < vector.length; index += 1) vector[index] *= maximum / magnitude;
}

function quantile(sorted, fraction) {
  if (sorted.length === 1) return sorted[0];
  const position = (sorted.length - 1) * fraction;
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  const mix = position - lower;
  return sorted[lower] * (1 - mix) + sorted[upper] * mix;
}

export class MultiFeedbackBprRecommender {
  constructor({ feedback = [] } = {}) {
    this.profile = new Float32Array(DIMENSIONS);
    this.feedback = new Map();
    this.activeFeedbackCount = 0;
    this.hasPreference = false;
    this.relationEvidence = [];
    for (const record of feedback) this.setFeedback(record, false);
    this.rebuild();
  }

  get feedbackCount() {
    return this.activeFeedbackCount;
  }

  keyFor(article) {
    return String(article.pageid ?? article.title);
  }

  setFeedback(record, rebuild = true) {
    if (!record?.article) return;
    const key = this.keyFor(record.article);
    if (feedbackTerms(record).length === 0) this.feedback.delete(key);
    else this.feedback.set(key, record);
    if (rebuild) this.rebuild();
  }

  context() {
    const logViews = [
      LONG_DWELL_PRIOR_MS,
      ...[...this.feedback.values()].map((record) => Number(record.signals.dwellMs) || 0),
    ]
      .filter((value) => value >= MIN_VIEW_MS)
      .map((value) => Math.log1p(value))
      .sort((left, right) => left - right);
    return { longDwellMs: Math.expm1(quantile(logViews, 0.75)) };
  }

  evidence() {
    const context = this.context();
    return [...this.feedback.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .flatMap(([key, record]) => feedbackTerms(record, context).map((term) => ({
        key,
        record,
        term,
        vector: articleVector(record.article),
      })));
  }

  updatePair(positive, negative, rate = LEARNING_RATE) {
    let margin = 0;
    for (let index = 0; index < DIMENSIONS; index += 1) {
      margin += this.profile[index] * (positive[index] - negative[index]);
    }
    const gain = 1 / (1 + Math.exp(Math.max(-30, Math.min(30, margin))));
    for (let index = 0; index < DIMENSIONS; index += 1) {
      const delta = positive[index] - negative[index];
      this.profile[index] += rate * (gain * delta - 2 * REGULARIZATION * this.profile[index]);
    }
  }

  rebuild() {
    this.profile.fill(0);
    const evidence = this.evidence();
    this.relationEvidence = evidence;
    this.activeFeedbackCount = new Set(evidence.map(({ key }) => key)).size;
    this.hasPreference = false;
    for (const { term, vector } of evidence) {
      const direction = term.polarity * LEARNING_RATE * term.strength;
      for (let index = 0; index < DIMENSIONS; index += 1) {
        this.profile[index] += direction * vector[index];
      }
    }
    const positives = evidence.filter(({ term }) => term.polarity > 0);
    const negatives = evidence.filter(({ term }) => term.polarity < 0);
    const totalPairs = positives.length * negatives.length;
    if (totalPairs === 0) {
      this.hasPreference = evidence.length > 0;
      boundMagnitude(this.profile);
      return;
    }

    const samples = Math.min(MAX_PAIR_UPDATES, totalPairs);
    for (let sample = 0; sample < samples; sample += 1) {
      const flatIndex = Math.min(totalPairs - 1, Math.floor(((sample + 0.5) * totalPairs) / samples));
      const positive = positives[Math.floor(flatIndex / negatives.length)];
      const negative = negatives[flatIndex % negatives.length];
      const strength = Math.sqrt(positive.term.strength * negative.term.strength);
      this.updatePair(positive.vector, negative.vector, LEARNING_RATE * strength);
    }
    this.hasPreference = true;
    boundMagnitude(this.profile);
  }

  trainAgainstUnobserved(articles) {
    const candidates = articles
      .filter((article) => !this.feedback.has(this.keyFor(article)))
      .sort((left, right) => this.keyFor(left).localeCompare(this.keyFor(right)))
      .map((article) => ({ article, vector: articleVector(article) }));
    if (this.relationEvidence.length === 0 || candidates.length === 0) return;

    const samplesPerRelation = Math.max(
      1,
      Math.floor(MAX_UNOBSERVED_UPDATES / this.relationEvidence.length),
    );
    for (const evidence of this.relationEvidence) {
      const samples = Math.min(
        candidates.length,
        Math.max(MIN_UNOBSERVED_SAMPLES_PER_ITEM, samplesPerRelation),
      );
      for (let sample = 0; sample < samples; sample += 1) {
        const candidateIndex = Math.min(
          candidates.length - 1,
          Math.floor(((sample + 0.5) * candidates.length) / samples),
        );
        const candidate = candidates[candidateIndex];
        const rate = LEARNING_RATE * evidence.term.strength;
        if (evidence.term.polarity > 0) {
          this.updatePair(evidence.vector, candidate.vector, rate);
        } else {
          this.updatePair(candidate.vector, evidence.vector, rate);
        }
      }
    }
    this.hasPreference = true;
    boundMagnitude(this.profile);
  }

  score(article) {
    if (!this.hasPreference) return 0;
    return cosine(this.profile, articleVector(article));
  }

  rerank(articles, random = Math.random) {
    if (this.feedbackCount > 0) this.trainAgainstUnobserved(articles);
    if (!this.hasPreference) {
      const shuffled = [...articles];
      for (let index = shuffled.length - 1; index > 0; index -= 1) {
        const swapWith = Math.floor(random() * (index + 1));
        [shuffled[index], shuffled[swapWith]] = [shuffled[swapWith], shuffled[index]];
      }
      return shuffled;
    }
    const temperature = Math.max(0.14, 0.34 / Math.sqrt(this.feedbackCount));
    return articles
      .map((article) => {
        const uniform = Math.min(1 - Number.EPSILON, Math.max(Number.EPSILON, random()));
        const gumbel = -Math.log(-Math.log(uniform));
        return { article, key: this.score(article) / temperature + gumbel };
      })
      .sort((left, right) => right.key - left.key)
      .map(({ article }) => article);
  }
}
