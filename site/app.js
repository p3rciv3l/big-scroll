import { MultiFeedbackBprRecommender } from "./recommender.mjs?v=12";
import { FeedbackStore } from "./feedback-store.mjs?v=12";
import { REACTION_DEFINITIONS } from "./feedback-registry.mjs?v=12";

const API_ENDPOINT = "https://en.wikipedia.org/w/api.php";
const BATCH_SIZE = 10;
const PAGINATION_FETCH_SIZE = 30;
const PAGINATION_SETTLE_MS = 200;
const FEEDBACK_SETTLE_MS = 500;
const feed = document.querySelector("#feed");
const status = document.querySelector("#status");
const openLikes = document.querySelector("#open-likes");
const closeLikes = document.querySelector("#close-likes");
const likesPanel = document.querySelector("#likes-panel");
const likedArticles = document.querySelector("#liked-articles");
const likesCount = document.querySelector("#likes-count");
const seen = new Set();
const candidateBuffer = [];
const feedbackStore = new FeedbackStore();
const recommender = new MultiFeedbackBprRecommender({
  feedback: feedbackStore.values(),
});
let loading = false;
let requestSequence = 0;
let loadTrigger = null;
let loadTimer = 0;
let lastScrollAt = 0;
let feedbackTimer = 0;
let feedbackDirty = false;
let candidateRequest = null;
let viewFrame = 0;
let activeView = null;
const articleElements = new WeakMap();

function flushFeedback() {
  clearTimeout(feedbackTimer);
  feedbackTimer = 0;
  if (!feedbackDirty) return;
  feedbackStore.persist();
  recommender.rebuild();
  feedbackDirty = false;
}

function flushFeedbackWhenIdle() {
  const sinceScroll = performance.now() - lastScrollAt;
  if (lastScrollAt && sinceScroll < FEEDBACK_SETTLE_MS) {
    feedbackTimer = setTimeout(flushFeedbackWhenIdle, FEEDBACK_SETTLE_MS - sinceScroll);
    return;
  }
  flushFeedback();
}

function scheduleFeedback() {
  feedbackDirty = true;
  clearTimeout(feedbackTimer);
  feedbackTimer = setTimeout(flushFeedbackWhenIdle, FEEDBACK_SETTLE_MS);
}

function recordClick(article) {
  recommender.setFeedback(feedbackStore.recordClick(article, { persist: false }), false);
  scheduleFeedback();
}

function recordView(article, elapsedMs) {
  if (elapsedMs <= 0) return;
  const feedback = feedbackStore.recordView(article, elapsedMs, { persist: false });
  recommender.setFeedback(feedback, false);
  scheduleFeedback();
}

function trackingEnabled() {
  return !document.hidden && !likesPanel.classList.contains("open");
}

function pauseViews() {
  if (!activeView) return;
  recordView(activeView.article, performance.now() - activeView.startedAt);
  activeView = null;
}

function resumeViews() {
  scheduleActiveView();
}

function refreshActiveView() {
  viewFrame = 0;
  if (!trackingEnabled()) {
    pauseViews();
    return;
  }
  const bounds = feed.getBoundingClientRect();
  const center = document.elementFromPoint(bounds.left + bounds.width / 2, bounds.top + bounds.height / 2);
  const section = center?.closest("article.article");
  if (section === activeView?.section) return;
  pauseViews();
  const article = articleElements.get(section);
  if (article) activeView = { section, article, startedAt: performance.now() };
}

function scheduleActiveView() {
  if (!viewFrame) viewFrame = requestAnimationFrame(refreshActiveView);
}

function updateLikesCount() {
  likesCount.textContent = String(feedbackStore.likedArticles().length);
}

function setStatus(message, visible = true) {
  status.textContent = message;
  status.classList.toggle("visible", visible);
}

function articleImage(article) {
  return article.thumbnail?.source || "";
}

function createActionIcon(path) {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 960 960");
  svg.setAttribute("aria-hidden", "true");
  const shape = document.createElementNS("http://www.w3.org/2000/svg", "path");
  shape.setAttribute("d", path);
  svg.append(shape);
  return svg;
}

function setActionState(button, article, reaction) {
  const selected = feedbackStore.reaction(article) === reaction.id;
  button.replaceChildren(createActionIcon(selected ? reaction.activePath : reaction.path));
  button.setAttribute("aria-label", `${selected ? reaction.activeLabel : reaction.label} ${article.title}`);
  button.setAttribute("aria-pressed", String(selected));
}

function prepareImage(image, source) {
  image.alt = "";
  image.decoding = "async";
  image.loading = "lazy";
  image.src = source;
}

function normalizeArticle(page) {
  return {
    pageid: page.pageid,
    title: page.title,
    extract: page.extract || "Open this article on Wikipedia to learn more.",
    url: page.fullurl || `https://en.wikipedia.org/?curid=${page.pageid}`,
    image: articleImage(page),
  };
}

async function fetchCandidates(limit = BATCH_SIZE) {
  requestSequence += 1;
  const params = new URLSearchParams({
    action: "query",
    generator: "random",
    grnnamespace: "0",
    grnlimit: String(limit),
    prop: "extracts|info|pageimages",
    exintro: "1",
    exlimit: "max",
    explaintext: "1",
    exsentences: "5",
    piprop: "thumbnail",
    pithumbsize: "800",
    inprop: "url",
    format: "json",
    origin: "*",
    _: String(requestSequence),
  });
  const response = await fetch(`${API_ENDPOINT}?${params}`, { cache: "default" });
  if (!response.ok) throw new Error(`Wikipedia returned ${response.status}`);
  const payload = await response.json();
  return Object.values(payload.query?.pages || {})
    .map(normalizeArticle)
    .filter((article) => (
      article.pageid
      && article.image
      && article.extract.length > 15
      && !feedbackStore.isSuppressed(article)
      && !seen.has(String(article.pageid))
    ));
}

async function refillCandidates(limit) {
  if (candidateRequest) return candidateRequest;
  candidateRequest = fetchCandidates(limit)
    .then((candidates) => {
      for (const article of candidates) {
        const key = String(article.pageid);
        if (seen.has(key)) continue;
        seen.add(key);
        candidateBuffer.push(article);
      }
      return candidates.length;
    })
    .finally(() => { candidateRequest = null; });
  return candidateRequest;
}

function createActionButton(article, reaction) {
  const button = document.createElement("button");
  button.className = "article-action-button";
  button.type = "button";
  button.dataset.reaction = reaction.id;
  setActionState(button, article, reaction);
  button.addEventListener("click", () => toggleReaction(article, reaction.id));
  return button;
}

function createArticle(article) {
  const section = document.createElement("article");
  section.className = "article";
  section.dataset.pageid = String(article.pageid);

  const image = document.createElement("img");
  image.className = "article-image";
  prepareImage(image, article.image);
  image.addEventListener("load", () => image.classList.add("is-loaded"));
  image.addEventListener("error", () => {
    if (activeView?.section === section) pauseViews();
    observer.unobserve(section);
    section.remove();
    void loadMore();
  });
  section.append(image);

  const shade = document.createElement("div");
  shade.className = "article-shade";
  const content = document.createElement("div");
  content.className = "article-content";
  const heading = document.createElement("h2");
  heading.textContent = article.title;
  const extract = document.createElement("p");
  extract.textContent = article.extract;

  const actions = document.createElement("div");
  actions.className = "article-actions";
  actions.append(...REACTION_DEFINITIONS.map((reaction) => createActionButton(article, reaction)));
  const header = document.createElement("div");
  header.className = "article-header";
  header.append(heading, actions);
  const readLink = document.createElement("a");
  readLink.className = "read-link";
  readLink.href = article.url;
  readLink.target = "_blank";
  readLink.rel = "noopener noreferrer";
  readLink.textContent = "Read article →";
  readLink.addEventListener("click", () => recordClick(article));
  content.append(header, extract, readLink);
  section.append(shade, content);
  articleElements.set(section, article);
  return section;
}

function toggleReaction(article, reactionId) {
  const feedback = feedbackStore.toggleReaction(article, reactionId, { persist: false });
  if (!feedbackStore.persist()) setStatus("Feedback could not be saved on this device.");
  recommender.setFeedback(feedback);
  const section = feed.querySelector(`[data-pageid="${article.pageid}"]`);
  if (section) {
    for (const reaction of REACTION_DEFINITIONS) {
      const button = section.querySelector(`[data-reaction="${reaction.id}"]`);
      if (button) setActionState(button, article, reaction);
    }
  }
  updateLikesCount();
  renderLikes();
}

function renderLikes() {
  const likes = feedbackStore.likedArticles();
  likedArticles.replaceChildren();
  if (likes.length === 0) {
    const empty = document.createElement("p");
    empty.className = "empty-state";
    empty.textContent = "Tap a heart and the article will stay here—even after you close the tab.";
    likedArticles.append(empty);
    return;
  }

  for (const article of [...likes].reverse()) {
    const card = document.createElement("article");
    card.className = "liked-card";
    const copy = document.createElement("div");
    copy.className = "liked-card-copy";
    const link = document.createElement("a");
    link.href = article.url;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.textContent = article.title;
    link.addEventListener("click", () => recordClick(article));
    const extract = document.createElement("p");
    extract.textContent = article.extract;
    copy.append(link, extract);
    const remove = document.createElement("button");
    remove.className = "remove-like";
    remove.type = "button";
    remove.textContent = "♥";
    remove.setAttribute("aria-label", `Unlike ${article.title}`);
    remove.addEventListener("click", () => toggleReaction(article, "like"));
    if (article.image) {
      const image = document.createElement("img");
      image.className = "liked-card-image";
      prepareImage(image, article.image);
      card.append(image);
    }
    card.append(copy, remove);
    likedArticles.append(card);
  }
}

function scheduleLoadMore() {
  clearTimeout(loadTimer);
  loadTimer = setTimeout(() => {
    loadTimer = 0;
    void loadMore();
  }, PAGINATION_SETTLE_MS);
}

async function waitForScrollSettle() {
  while (lastScrollAt) {
    const remaining = PAGINATION_SETTLE_MS - (performance.now() - lastScrollAt);
    if (remaining <= 0) return;
    await new Promise((resolve) => setTimeout(resolve, remaining));
  }
}

function nextFrame() {
  return new Promise((resolve) => requestAnimationFrame(resolve));
}

async function appendArticles(articles, incremental) {
  if (!incremental) {
    const fragment = document.createDocumentFragment();
    for (const article of articles) fragment.append(createArticle(article));
    feed.append(fragment);
    return;
  }
  for (const article of articles) {
    await nextFrame();
    feed.append(createArticle(article));
  }
}

const observer = new IntersectionObserver((entries) => {
  if (entries.some((entry) => entry.isIntersecting)) scheduleLoadMore();
}, { root: feed, rootMargin: "700% 0px" });

feed.addEventListener("scroll", () => {
  lastScrollAt = performance.now();
  scheduleActiveView();
  if (loadTimer) scheduleLoadMore();
}, { passive: true });

async function loadMore(attempt = 0) {
  if (loading) return;
  loading = true;
  if (feed.children.length === 0) setStatus("Finding articles…");
  try {
    const initialLoad = feed.children.length === 0;
    if (candidateBuffer.length === 0) {
      await refillCandidates(initialLoad ? BATCH_SIZE : PAGINATION_FETCH_SIZE);
    }
    if (!initialLoad) await waitForScrollSettle();
    const candidates = candidateBuffer.splice(0, BATCH_SIZE);
    const ranked = recommender.rerank(candidates);
    await appendArticles(ranked, !initialLoad);
    scheduleActiveView();
    if (loadTrigger) observer.unobserve(loadTrigger);
    loadTrigger = feed.lastElementChild;
    if (loadTrigger) observer.observe(loadTrigger);
    setStatus("", false);
    if (ranked.length === 0) {
      setTimeout(() => void loadMore(), 100);
    } else if (!initialLoad && candidateBuffer.length < BATCH_SIZE) {
      void refillCandidates(PAGINATION_FETCH_SIZE).catch(() => {});
    }
  } catch (error) {
    const delay = Math.min(8000, 500 * (2 ** attempt));
    setStatus("Wikipedia is taking a moment…");
    setTimeout(() => void loadMore(attempt + 1), delay);
  } finally {
    loading = false;
  }
}

function showLikes() {
  pauseViews();
  renderLikes();
  feed.inert = true;
  openLikes.inert = true;
  likesPanel.inert = false;
  likesPanel.classList.add("open");
  likesPanel.setAttribute("aria-hidden", "false");
  closeLikes.focus();
}

function hideLikes() {
  likesPanel.inert = true;
  feed.inert = false;
  openLikes.inert = false;
  likesPanel.classList.remove("open");
  likesPanel.setAttribute("aria-hidden", "true");
  openLikes.focus();
  resumeViews();
}

openLikes.addEventListener("click", showLikes);
closeLikes.addEventListener("click", hideLikes);
likesPanel.inert = true;
document.addEventListener("visibilitychange", () => {
  if (document.hidden) pauseViews();
  else resumeViews();
});
addEventListener("pagehide", () => {
  pauseViews();
  flushFeedback();
});
document.addEventListener("keydown", (event) => {
  if (!likesPanel.classList.contains("open")) return;
  if (event.key === "Escape") hideLikes();
  if (event.key === "Tab") {
    const focusable = [...likesPanel.querySelectorAll("button, a[href]")].filter((element) => !element.inert);
    if (focusable.length === 0) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }
});

updateLikesCount();
renderLikes();
void loadMore();

if ("serviceWorker" in navigator) {
  addEventListener("load", () => navigator.serviceWorker.register("./service-worker.js").catch(() => {}), { once: true });
}
