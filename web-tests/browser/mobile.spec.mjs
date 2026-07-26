import { expect, test } from "@playwright/test";
import { addConstrainedCpuLoad, mockWikipedia } from "../browser-fixtures.mjs";

async function sampleOneCardScroll(page) {
  return page.locator("#feed").evaluate(async (feed) => {
    const maximum = feed.scrollHeight - feed.clientHeight;
    const from = Math.min(feed.scrollTop, Math.max(0, maximum - feed.clientHeight));
    const to = Math.min(from + feed.clientHeight, maximum);
    feed.scrollTop = from;
    const gaps = [];
    let previous = performance.now();
    const started = previous;
    await new Promise((resolve) => {
      function frame(now) {
        gaps.push(now - previous);
        previous = now;
        const progress = Math.min(1, (now - started) / 500);
        feed.scrollTop = from + (to - from) * progress;
        if (progress < 1) requestAnimationFrame(frame);
        else resolve();
      }
      requestAnimationFrame(frame);
    });
    const samples = gaps.slice(1).sort((left, right) => left - right);
    return {
      frames: samples.length,
      p95: samples[Math.floor(samples.length * 0.95)] || 0,
      max: samples.at(-1) || 0,
    };
  });
}

test("Likes remains the only global UI and article reactions share one button system", async ({ page }) => {
  await mockWikipedia(page, { latency: 150 });
  await page.goto("/");
  await expect.poll(() => page.locator(".article").count()).toBeGreaterThanOrEqual(10);

  await expect(page.getByText("About", { exact: true })).toHaveCount(0);
  await expect(page.getByText("Language", { exact: true })).toHaveCount(0);
  await expect(page.locator('[aria-label*="logo" i], .logo')).toHaveCount(0);

  const firstCard = page.locator(".article").first();
  const like = firstCard.locator('[data-reaction="like"]');
  const dislike = firstCard.locator('[data-reaction="dislike"]');
  const notInterested = firstCard.locator('[data-reaction="notInterested"]');
  await expect(firstCard.locator(".article-action-button")).toHaveCount(3);
  await expect(firstCard.locator(".article-action-button svg")).toHaveCount(3);

  await like.click();
  await expect(page.locator("#likes-count")).toHaveText("1");
  await expect(like).toHaveCSS("background-color", "rgb(255, 45, 64)");
  await dislike.click();
  await expect(page.locator("#likes-count")).toHaveText("0");
  await expect(like).toHaveAttribute("aria-pressed", "false");
  await expect(dislike).toHaveAttribute("aria-pressed", "true");
  await notInterested.click();
  await expect(dislike).toHaveAttribute("aria-pressed", "false");
  await expect(notInterested).toHaveAttribute("aria-pressed", "true");
  await notInterested.click();
  await like.click();
  await expect(page.locator("#likes-count")).toHaveText("1");
  await expect(page.locator(".share-button")).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Read article" }).first()).toBeVisible();
  await page.reload();
  await expect(page.locator("#likes-count")).toHaveText("1");
  await page.locator("#open-likes").click();
  await expect(page.getByRole("dialog", { name: "Likes" })).toBeVisible();
  await expect(page.locator(".liked-card")).toHaveCount(1);
});

test("visible time and Read clicks become local recommendation feedback", async ({ page }) => {
  await mockWikipedia(page, { latency: 0 });
  await page.goto("/");
  await expect.poll(() => page.locator(".article").count()).toBeGreaterThanOrEqual(10);

  const firstPageId = Number(await page.locator(".article").first().getAttribute("data-pageid"));
  await page.waitForTimeout(300);
  const popupPromise = page.waitForEvent("popup");
  await page.getByRole("link", { name: "Read article" }).first().click();
  const popup = await popupPromise;
  await popup.close();
  await page.locator("#feed").evaluate((feed) => feed.scrollTo({ top: feed.clientHeight, behavior: "instant" }));

  await expect.poll(() => page.evaluate((pageid) => {
    const payload = JSON.parse(localStorage.getItem("big-scroll.feedback.v2"));
    const item = payload?.feedback?.find(({ article }) => article.pageid === pageid);
    return item && { clicked: item.signals.click, hasView: item.signals.dwellMs > 100 };
  }, firstPageId)).toEqual({ clicked: true, hasView: true });

  const first = await page.evaluate((pageid) => {
    const payload = JSON.parse(localStorage.getItem("big-scroll.feedback.v2"));
    return payload.feedback.find(({ article }) => article.pageid === pageid);
  }, firstPageId);
  expect(first.signals.dwellMs).toBeGreaterThan(100);
});

test("warm feedback history batches scroll-time persistence", async ({ page }) => {
  await mockWikipedia(page, { latency: 0 });
  await page.addInitScript(() => {
    const feedback = Array.from({ length: 250 }, (_, index) => ({
      article: {
        pageid: 10_000 + index,
        title: `History article ${index}`,
        extract: "Science, history, culture, technology, medicine, and art.",
        url: `https://en.wikipedia.org/?curid=${10_000 + index}`,
      },
      signals: {
        reaction: null,
        click: index % 3 === 0,
        dwellMs: 5_000 + index,
      },
      reactionAt: 0,
      updatedAt: index,
    }));
    const original = Storage.prototype.setItem;
    original.call(localStorage, "big-scroll.feedback.v2", JSON.stringify({ version: 2, feedback }));
    window.__feedbackWrites = 0;
    Storage.prototype.setItem = function setItem(key, value) {
      if (key === "big-scroll.feedback.v2") window.__feedbackWrites += 1;
      return original.call(this, key, value);
    };
  });
  await page.goto("/");
  await expect.poll(() => page.locator(".article").count()).toBeGreaterThanOrEqual(10);

  for (let index = 1; index < 5; index += 1) {
    await page.locator(".article").nth(index).scrollIntoViewIfNeeded();
    await page.waitForTimeout(150);
  }

  expect(await page.evaluate(() => window.__feedbackWrites)).toBeLessThanOrEqual(1);
});

test("persisted engagement changes the next ranking after reload", async ({ page }) => {
  await page.addInitScript(() => { Math.random = () => 0.5; });
  const image = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='390' height='844'%3E%3Crect width='390' height='844' fill='%23263548'/%3E%3C/svg%3E";
  await page.route("https://en.wikipedia.org/w/api.php**", (route) => route.fulfill({ json: {
    query: { pages: {
      101: { pageid: 101, title: "French cooking", extract: "Recipes, bread, sauce, pastry, cuisine and restaurants.", fullurl: "https://en.wikipedia.org/?curid=101", thumbnail: { source: image } },
      102: { pageid: 102, title: "Lunar spacecraft", extract: "A spacecraft, rocket, astronaut and lunar orbit mission.", fullurl: "https://en.wikipedia.org/?curid=102", thumbnail: { source: image } },
    } },
  } }));

  await page.goto("/");
  await expect(page.locator(".article h2").first()).toHaveText("French cooking");
  await page.locator(".read-link").nth(1).evaluate((link) => {
    addEventListener("click", (event) => event.preventDefault(), { capture: true, once: true });
    link.click();
  });
  await page.locator(".article").nth(1).scrollIntoViewIfNeeded();
  await page.waitForTimeout(300);
  await page.locator(".article").first().scrollIntoViewIfNeeded();
  await page.waitForTimeout(700);
  await page.reload();

  await expect(page.locator(".article h2").first()).toHaveText("Lunar spacecraft");
});

test("not interested survives reload and filters the exact article", async ({ page }) => {
  const image = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='390' height='844'%3E%3Crect width='390' height='844' fill='%23263548'/%3E%3C/svg%3E";
  await page.addInitScript(() => {
    const article = {
      pageid: 101,
      title: "Hidden article",
      extract: "An article the user explicitly asked not to see again.",
      url: "https://en.wikipedia.org/?curid=101",
      image: "hidden.jpg",
    };
    localStorage.setItem("big-scroll.feedback.v2", JSON.stringify({
      version: 2,
      feedback: [{
        article,
        signals: { reaction: "notInterested", click: false, dwellMs: 0 },
        reactionAt: 1,
        updatedAt: 1,
      }],
    }));
  });
  await page.route("https://en.wikipedia.org/w/api.php**", (route) => route.fulfill({ json: {
    query: { pages: {
      101: { pageid: 101, title: "Hidden article", extract: "An article the user explicitly asked not to see again.", fullurl: "https://en.wikipedia.org/?curid=101", thumbnail: { source: image } },
      102: { pageid: 102, title: "Visible article", extract: "An article that remains eligible for recommendation.", fullurl: "https://en.wikipedia.org/?curid=102", thumbnail: { source: image } },
    } },
  } }));

  await page.goto("/");
  await expect(page.locator(".article")).toHaveCount(1);
  await expect(page.locator(".article h2")).toHaveText("Visible article");
});

test("long constrained session keeps images present and frame gaps bounded", async ({ page }) => {
  const wikipedia = await mockWikipedia(page, { latency: 180 });
  await addConstrainedCpuLoad(page);
  await page.addInitScript(() => {
    const feedback = Array.from({ length: 30 }, (_, index) => ({
      article: {
        pageid: 10_000 + index,
        title: `Liked science article ${index}`,
        extract: "Science, medicine, technology, astronomy, and research.",
        url: `https://en.wikipedia.org/?curid=${10_000 + index}`,
        categories: [{ title: "Category:Science" }],
      },
      signals: { reaction: "like", click: false, dwellMs: 0 },
      reactionAt: index,
      updatedAt: index,
    }));
    localStorage.setItem("big-scroll.feedback.v2", JSON.stringify({ version: 2, feedback }));
  });
  await page.goto("/");
  await expect.poll(() => page.locator(".article").count()).toBeGreaterThanOrEqual(10);
  await expect(page.locator("#likes-count")).toHaveText("30");
  const firstPageId = Number(await page.locator(".article").first().getAttribute("data-pageid"));

  for (let batch = 0; batch < 6; batch += 1) {
    const previousCount = await page.locator(".article").count();
    await page.locator("#feed").evaluate((feed) => {
      feed.scrollTo({ top: feed.scrollHeight - feed.clientHeight, behavior: "instant" });
    });
    await expect.poll(() => page.locator(".article").count()).toBeGreaterThan(previousCount);
    await page.waitForTimeout(350);
  }

  await page.waitForTimeout(500);
  expect(wikipedia.calls).toBeGreaterThanOrEqual(3);
  expect(wikipedia.calls).toBeLessThanOrEqual(4);
  const articleCount = await page.locator(".article").count();
  expect(articleCount).toBeGreaterThanOrEqual(70);
  await expect(page.locator(".article-image[src]")).toHaveCount(articleCount);

  const timing = await sampleOneCardScroll(page);
  console.log(`iPhone constrained scroll: ${JSON.stringify(timing)}`);
  expect(timing.frames).toBeGreaterThan(15);
  expect(timing.p95).toBeLessThan(50);
  expect(timing.max).toBeLessThan(150);

  const viewBefore = await page.evaluate((pageid) => {
    const payload = JSON.parse(localStorage.getItem("big-scroll.feedback.v2") || "{\"feedback\":[]}");
    return payload.feedback.find(({ article }) => article.pageid === pageid)?.signals.dwellMs || 0;
  }, firstPageId);
  await page.locator(".article").first().scrollIntoViewIfNeeded();
  await page.waitForTimeout(250);
  await page.locator(".article").nth(1).scrollIntoViewIfNeeded();
  await page.waitForTimeout(700);
  const viewAfter = await page.evaluate((pageid) => {
    const payload = JSON.parse(localStorage.getItem("big-scroll.feedback.v2"));
    return payload.feedback.find(({ article }) => article.pageid === pageid)?.signals.dwellMs || 0;
  }, firstPageId);
  expect(viewAfter).toBeGreaterThan(viewBefore);
});

test("feed excludes articles without usable images", async ({ page }) => {
  const wikipedia = await mockWikipedia(page, {
    latency: 0,
    imageSource: ({ index }) => index % 2 === 0
      ? "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='390' height='844'%3E%3Crect width='390' height='844' fill='%23263548'/%3E%3C/svg%3E"
      : null,
  });

  await page.goto("/");
  await expect.poll(() => page.locator(".article").count()).toBeGreaterThanOrEqual(5);

  const imageState = await page.locator(".article").evaluateAll((cards) => ({
    cards: cards.length,
    withImages: cards.filter((card) => card.querySelector(".article-image[src]")).length,
    placeholders: cards.filter((card) => card.querySelector(".no-image")).length,
  }));
  expect(imageState.withImages).toBe(imageState.cards);
  expect(imageState.placeholders).toBe(0);
  expect(wikipedia.calls).toBeGreaterThanOrEqual(2);
  expect(wikipedia.calls).toBeLessThanOrEqual(4);
});

test("startup renders promptly and fills an offscreen runway", async ({ page }) => {
  const wikipedia = await mockWikipedia(page, { latency: 0 });

  await page.goto("/");
  await expect.poll(() => page.locator(".article").count()).toBeGreaterThanOrEqual(10);
  await expect.poll(() => page.locator(".article").count()).toBeGreaterThanOrEqual(20);

  expect(wikipedia.calls).toBe(2);
  const request = new URL(wikipedia.urls[0]);
  expect(request.searchParams.get("grnlimit")).toBe("10");
  expect(request.searchParams.get("prop")).toBe("extracts|info|pageimages");
});

test("pagination waits for active scrolling to settle", async ({ page }) => {
  const wikipedia = await mockWikipedia(page, { latency: 0 });

  await page.goto("/");
  await expect.poll(() => page.locator(".article").count()).toBeGreaterThanOrEqual(20);
  const bufferedCount = await page.locator(".article").count();
  await page.locator("#feed").evaluate(async (feed) => {
    const started = performance.now();
    await new Promise((resolve) => {
      function frame(now) {
        const progress = Math.min(1, (now - started) / 500);
        feed.scrollTop = (feed.scrollHeight - feed.clientHeight) * progress;
        if (progress < 1) requestAnimationFrame(frame);
        else resolve();
      }
      requestAnimationFrame(frame);
    });
  });

  expect(await page.locator(".article").count()).toBe(bufferedCount);
  await expect.poll(() => page.locator(".article").count()).toBeGreaterThan(bufferedCount);
  expect(wikipedia.calls).toBeGreaterThan(1);
});

test("pagination mounts without a long frame gap", async ({ page }) => {
  await mockWikipedia(page, { latency: 150 });
  await addConstrainedCpuLoad(page);
  await page.goto("/");
  await expect.poll(() => page.locator(".article").count()).toBeGreaterThanOrEqual(10);
  await page.waitForTimeout(1_000);
  const bufferedCount = await page.locator(".article").count();
  expect(bufferedCount).toBeGreaterThan(10);
  await page.evaluate(() => {
    window.__paginationGaps = [];
    window.__samplePagination = true;
    let previous = performance.now();
    function frame(now) {
      window.__paginationGaps.push(now - previous);
      previous = now;
      if (window.__samplePagination) requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  });
  for (let index = 0; index < 12; index += 1) {
    await page.locator("#feed").evaluate((feed) => {
      feed.dispatchEvent(new WheelEvent("wheel"));
      feed.scrollTop += 620;
    });
    await page.waitForTimeout(85);
  }
  await page.waitForTimeout(300);
  const { cardCount, maxGap } = await page.evaluate(() => {
    window.__samplePagination = false;
    return {
      cardCount: document.querySelectorAll(".article").length,
      maxGap: Math.max(...window.__paginationGaps.slice(1)),
    };
  });

  console.log(`pagination max frame gap: ${Math.round(maxGap)}ms`);
  expect(cardCount).toBe(bufferedCount);
  expect(maxGap).toBeLessThan(50);
  await expect.poll(() => page.locator(".article").count()).toBeGreaterThan(bufferedCount);
});

test("thumbnail-sparse pagination does not stall the next card", async ({ page }) => {
  const image = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='390' height='844'%3E%3Crect width='390' height='844' fill='%23263548'/%3E%3C/svg%3E";
  await mockWikipedia(page, {
    latency: 400,
    imageSource: ({ pageid, index }) => {
      const call = Math.floor(pageid / 100);
      return call === 1 || index === 24 ? image : null;
    },
  });
  await page.goto("/");
  await expect.poll(() => page.locator(".article").count()).toBeGreaterThanOrEqual(10);

  const started = Date.now();
  await page.locator("#feed").evaluate((feed) => {
    feed.scrollTo({ top: feed.scrollHeight - feed.clientHeight, behavior: "instant" });
  });
  await expect.poll(() => page.locator(".article").count(), { timeout: 4_000 }).toBeGreaterThan(10);

  expect(Date.now() - started).toBeLessThan(1_200);

  const secondStarted = Date.now();
  await page.locator("#feed").evaluate((feed) => {
    feed.scrollTo({ top: feed.scrollHeight - feed.clientHeight, behavior: "instant" });
  });
  await expect.poll(() => page.locator(".article").count(), { timeout: 4_000 }).toBeGreaterThan(11);
  expect(Date.now() - secondStarted).toBeLessThan(1_200);
});
