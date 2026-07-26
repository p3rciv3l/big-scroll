import { expect, test } from "@playwright/test";

test.use({ serviceWorkers: "allow" });

test("service worker cache remains readable offline", async ({ context, page }) => {
  await page.goto("/");

  const cached = await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
    const assets = ["./", "./styles.css?v=12", "./app.js?v=12", "./feedback-store.mjs?v=12", "./feedback-registry.mjs?v=12", "./recommender.mjs?v=12"];
    return Promise.all(
      assets.map(async (asset) => Boolean(await caches.match(new URL(asset, location.href)))),
    );
  });

  expect(cached).toEqual([true, true, true, true, true, true]);
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller));

  await context.setOffline(true);
  const offlineResponses = await page.evaluate(async () => {
    const assets = ["./", "./styles.css?v=12", "./app.js?v=12", "./feedback-store.mjs?v=12", "./feedback-registry.mjs?v=12", "./recommender.mjs?v=12"];
    return Promise.all(assets.map(async (asset) => {
      const response = await caches.match(new URL(asset, location.href));
      return { ok: response.ok, bytes: (await response.text()).length };
    }));
  });
  expect(offlineResponses.every(({ ok, bytes }) => ok && bytes > 0)).toBe(true);
  await context.setOffline(false);
});

test("the full module graph is cache-versioned for atomic upgrades", async ({ page }) => {
  await page.goto("/");
  const imports = await page.evaluate(async () => {
    const files = ["./app.js?v=12", "./feedback-store.mjs?v=12", "./recommender.mjs?v=12"];
    return Promise.all(files.map(async (file) => ({
      file,
      source: await (await fetch(file)).text(),
    })));
  });

  for (const { file, source } of imports) {
    expect(source, file).not.toMatch(/from\s+["'][^"']+\.mjs["']/);
  }
});
