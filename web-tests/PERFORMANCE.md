# Mobile performance gate

The live implementation and the untouched upstream Kotlin/Wasm build were measured at a
390 x 844 viewport in the same Chrome session. Both tabs used 4x CPU slowdown and simulated
3G (150 ms RTT, 1.5 Mbps down, 0.75 Mbps up). Each steady-state run sampled animation-frame
gaps while performing repeated full-card scrolls.

| Build | p95 frame gap | Frames over 50 ms | Deployable size | JS heap after run |
| --- | ---: | ---: | ---: | ---: |
| Big Scroll | 10.0 ms | 1 | 32 KB | 43.2 MB |
| Upstream WikWok | 10.1 ms | 2 | 15 MB | 74.7 MB |

Big Scroll therefore did not regress steady-state scroll latency in this constrained test.
The recommendation reranker was also exercised for 500 twelve-candidate batches: median
0.20 ms and p95 0.28 ms per batch on the local machine.

`browser/mobile.spec.mjs` preserves the regression gate in WebKit with an iPhone 13
viewport. It mocks MediaWiki latency, adds synthetic main-thread pressure, checks frame-gap
budgets, verifies the 48-card memory bound, and covers likes persistence plus removal of
logo, About, and language controls.
