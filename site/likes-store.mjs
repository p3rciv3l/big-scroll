export const LIKES_KEY = "big-scroll.likes.v1";

function isArticle(article) {
  return article
    && (typeof article.pageid === "number" || typeof article.pageid === "string")
    && typeof article.title === "string"
    && typeof article.url === "string";
}

export function loadLikes(storage = globalThis.localStorage) {
  try {
    const parsed = JSON.parse(storage?.getItem(LIKES_KEY));
    if (parsed?.version !== 1 || !Array.isArray(parsed.articles)) return new Map();
    return new Map(
      parsed.articles
        .filter(isArticle)
        .map((article) => [String(article.pageid), article]),
    );
  } catch {
    return new Map();
  }
}

export function saveLikes(likes, storage = globalThis.localStorage) {
  try {
    storage?.setItem(LIKES_KEY, JSON.stringify({ version: 1, articles: [...likes.values()] }));
    return Boolean(storage);
  } catch {
    return false;
  }
}
