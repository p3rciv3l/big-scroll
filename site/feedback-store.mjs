import { REACTION_IDS, reactionDefinition } from "./feedback-registry.mjs?v=13";

export const FEEDBACK_KEY = "big-scroll.feedback.v2";
export const LEGACY_LIKES_KEY = "big-scroll.likes.v1";
export const LEGACY_ENGAGEMENT_KEY = "big-scroll.engagement.v1";
const DEFAULT_IMPLICIT_LIMIT = 250;
const MAX_VIEW_MS = 15 * 60 * 1_000;

function isArticle(article) {
  return article
    && (typeof article.pageid === "number" || typeof article.pageid === "string")
    && typeof article.title === "string"
    && typeof article.url === "string";
}

function isReaction(reaction) {
  return reaction === null || REACTION_IDS.includes(reaction);
}

function isFeedback(item) {
  return item
    && isArticle(item.article)
    && item.signals
    && typeof item.signals === "object"
    && isReaction(item.signals.reaction ?? null)
    && Number.isFinite(item.reactionAt)
    && Number.isFinite(item.updatedAt);
}

function richerArticle(current = {}, incoming = {}) {
  const merged = { ...current };
  for (const [key, value] of Object.entries(incoming)) {
    if (value !== undefined && value !== null && value !== "") merged[key] = value;
  }
  return merged;
}

function emptyRecord(article) {
  return {
    article,
    signals: { reaction: null, click: false, dwellMs: 0 },
    reactionAt: 0,
    updatedAt: 0,
  };
}

function hasSignals(record) {
  return Object.values(record.signals).some((value) => (
    typeof value === "number" ? value > 0 : Boolean(value)
  ));
}

export class FeedbackStore {
  constructor(storage = globalThis.localStorage, { implicitLimit = DEFAULT_IMPLICIT_LIMIT, now = Date.now } = {}) {
    this.storage = storage;
    this.implicitLimit = implicitLimit;
    this.now = now;
    this.records = new Map();
    if (!this.restore()) {
      const migrated = this.migrateLegacy();
      if (migrated) this.persist();
    }
    this.trim();
  }

  keyFor(article) {
    return String(article.pageid);
  }

  restore() {
    try {
      const parsed = JSON.parse(this.storage?.getItem(FEEDBACK_KEY));
      if (parsed?.version !== 2 || !Array.isArray(parsed.feedback)) return false;
      for (const item of parsed.feedback.filter(isFeedback)) {
        this.records.set(this.keyFor(item.article), item);
      }
      return true;
    } catch {
      return false;
    }
  }

  migrateLegacy() {
    let migrated = false;
    try {
      const parsed = JSON.parse(this.storage?.getItem(LEGACY_LIKES_KEY));
      if (parsed?.version === 1 && Array.isArray(parsed.articles)) {
        for (const article of parsed.articles.filter(isArticle)) {
          const timestamp = this.now();
          this.records.set(this.keyFor(article), {
            ...emptyRecord(article),
            signals: { reaction: "like", click: false, dwellMs: 0 },
            reactionAt: timestamp,
            updatedAt: timestamp,
          });
          migrated = true;
        }
      }
    } catch {
      // A corrupt legacy source does not prevent migration from the other source.
    }
    try {
      const parsed = JSON.parse(this.storage?.getItem(LEGACY_ENGAGEMENT_KEY));
      if (parsed?.version === 1 && Array.isArray(parsed.engagements)) {
        for (const legacy of parsed.engagements) {
          if (!legacy || !isArticle(legacy.article)) continue;
          const key = this.keyFor(legacy.article);
          const current = this.records.get(key) || emptyRecord(legacy.article);
          const updatedAt = Number.isFinite(legacy.updatedAt) ? legacy.updatedAt : this.now();
          this.records.set(key, {
            ...current,
            article: richerArticle(current.article, legacy.article),
            signals: {
              ...current.signals,
              click: Boolean(legacy.clicked),
              dwellMs: Math.max(0, Number(legacy.viewMs) || 0),
            },
            updatedAt: Math.max(current.updatedAt, updatedAt),
          });
          migrated = true;
        }
      }
    } catch {
      // A corrupt legacy source does not prevent migration from the other source.
    }
    return migrated;
  }

  values() {
    return [...this.records.values()].sort((left, right) => (
      left.updatedAt - right.updatedAt || this.keyFor(left.article).localeCompare(this.keyFor(right.article))
    ));
  }

  get(article) {
    return this.records.get(this.keyFor(article));
  }

  reaction(article) {
    return this.get(article)?.signals.reaction || null;
  }

  likedArticles() {
    return [...this.records.values()]
      .filter(({ signals }) => signals.reaction === "like")
      .sort((left, right) => left.reactionAt - right.reactionAt)
      .map(({ article }) => article);
  }

  isSuppressed(article) {
    const reaction = this.reaction(article);
    return Boolean(reaction && reactionDefinition(reaction)?.exactItemBlock);
  }

  update(article, changes, { persist = true } = {}) {
    const key = this.keyFor(article);
    const current = this.records.get(key) || emptyRecord(article);
    const next = {
      ...current,
      ...changes,
      article: richerArticle(current.article, article),
      signals: { ...current.signals, ...changes.signals },
      updatedAt: this.now(),
    };
    if (hasSignals(next)) this.records.set(key, next);
    else this.records.delete(key);
    this.trim();
    if (persist) this.persist();
    return next;
  }

  toggleReaction(article, reaction, options) {
    if (!REACTION_IDS.includes(reaction)) throw new TypeError(`Unknown reaction: ${reaction}`);
    const current = this.get(article) || emptyRecord(article);
    const nextReaction = current.signals.reaction === reaction ? null : reaction;
    return this.update(article, {
      signals: { reaction: nextReaction },
      reactionAt: nextReaction ? this.now() : 0,
    }, options);
  }

  recordSignal(article, signal, value, options) {
    return this.update(article, { signals: { [signal]: value } }, options);
  }

  recordClick(article, options) {
    return this.recordSignal(article, "click", true, options);
  }

  recordView(article, elapsedMs, options) {
    const current = this.get(article);
    const dwellMs = Math.min(
      MAX_VIEW_MS,
      (current?.signals.dwellMs || 0) + Math.max(0, Number(elapsedMs) || 0),
    );
    return this.recordSignal(article, "dwellMs", dwellMs, options);
  }

  trim() {
    const implicit = this.values().filter(({ signals }) => !signals.reaction);
    const excess = implicit.length - this.implicitLimit;
    if (excess <= 0) return;
    for (const item of implicit.slice(0, excess)) this.records.delete(this.keyFor(item.article));
  }

  persist() {
    try {
      this.storage?.setItem(FEEDBACK_KEY, JSON.stringify({ version: 2, feedback: this.values() }));
      return Boolean(this.storage);
    } catch {
      return false;
    }
  }
}
