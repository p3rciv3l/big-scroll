# Big Scroll

Big Scroll is a lightweight, iPhone-first Wikipedia feed built from
[terrakok/WikWok](https://github.com/terrakok/WikWok). The deployed web surface lives in
`site/`: it has no logo, About menu, or language menu. Its only global surface is the
device-local Likes collection; each article has Like, Dislike, and Not interested controls.

The personalized order is derived from device-local reactions, Read clicks, and
foreground-visible card time. Each registered signal contributes its own positive or negative
objective, so adding a feedback type does not require inserting it into a hard-coded ladder.
It uses established methods:

- [Multi-Feedback Bayesian Personalized Ranking](https://doi.org/10.1145/2959100.2959163) for relation-specific feedback
- the original [Bayesian Personalized Ranking](https://www.ismll.uni-hildesheim.de/pub/pdfs/Rendle_et_al2009-Bayesian_Personalized_Ranking.pdf) pairwise update
- an explicit [not-to-recommend objective](https://arxiv.org/abs/2308.12256) for negative controls
- context-normalized logarithmic dwell confidence
- signed feature hashing from [Weinberger et al., ICML 2009](https://icml.cc/Conferences/2009/papers/407.pdf)
- the published [FNV-1a hash](https://www.ietf.org/archive/id/draft-eastlake-fnv-25.html) for fixed-size feature placement
- [Gumbel-top-k](https://arxiv.org/abs/1903.06059) sampling for a non-deterministic order without duplicates

The same registry defines reaction presentation and model semantics, while the versioned feedback
store persists a generic `signals` map. New channels can therefore be added without changing the
storage schema or the pairwise training loop.

There is no server-side profile, account, database, analytics SDK, or paid hosting. GitHub
Actions tests the recommendation model and deploys `site/` to free GitHub Pages hosting.

Run locally with:

```sh
node web-tests/static-server.mjs site 4173
node --test web-tests/*.test.mjs
npm ci
npm run test:browser
npm run test:baseline
```

The WebKit suite uses Playwright's iPhone 13 emulation (not a physical phone) and covers
reaction migration and persistence, the Likes-only global UI, constrained scrolling, buffered
pagination, image filtering, and shell cache availability while offline. CI also rebuilds
untouched upstream WikWok and rejects a
scroll-latency regression beyond the documented tolerance. Exact results are recorded in
[`web-tests/PERFORMANCE.md`](web-tests/PERFORMANCE.md).

## Upstream

Forked from [terrakok/WikWok](https://github.com/terrakok/WikWok), Apache License 2.0. See [LICENSE](LICENSE).
