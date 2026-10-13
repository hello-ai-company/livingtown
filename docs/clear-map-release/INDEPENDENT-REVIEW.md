# LivingTown Clear Map: independent review

Date: 2026-10-12 UTC. Scope: unpublished source derived from Helpful Agent v1 (508 manifest files). No browser, external account, deployment, credential, or paid service was used.

## Independent results

- Presentation DOM: **9/9 passed**, using React DOM and jsdom, with Map2D replaced by a renderer stub. Verified initial details closed on MAP/DRILL/REPLAY; filters/close focus; marker selection and detail reopen; selected context after map-only; focus-mode Tab wrapping and layered Escape; body scroll restoration; focus restoration entering/leaving map-only; DRILL collapsed-detail focus restoration; native place-list open/select/close.
- Two focus-return failures were independently reproduced and corrected by the implementation owner before the final 9/9 pass. An advanced DRILL/REPLAY summary still using old absolute positioning was also identified and moved to normal flow.
- Lazy renderer runtime: **3/3 passed** against actual Map2D with a deliberately deferred fake MapLibre module. Import rejection rendered the SVG fallback and removed Loading; resolution after unmount left the DOM empty and never invoked the renderer; resolution while mounted displayed the renderer and removed Loading.
- Overlay update comparison was independently rerun against the unchanged baseline with actual MapLibreMap React effects and a mocked MapLibre source. Twenty alternating selections invoked source.setData **100 times before / 20 after**. Twenty camera-only changes invoked it **0 before / 0 after**. Both initial loads invoked it five times.
- Additional lifecycle check: locale-induced map recreation, followed by selection and coordinate changes before map load, supplied all five sources and the latest selected ID/coordinates when load completed.
- Original 508 baseline files were checked byte-for-byte against the prior source manifest. None changed. Candidate retained all 508 original paths and their filesystem permission modes; six existing paths changed at this review stage.
- Code review confirmed dynamic import rejection reaches the SVG fallback, unmount before completion prevents setting the lazy renderer, MapOnly retains a separate fictional-training/unverified-safety note, and STOP's existing legacy-unmount flow remains unchanged. Focus mode cleanup restores body overflow on unmount.

## Measurement interpretation

The static production JavaScript graph/gzip comparison counts byte sizes, not device speed. The overlay comparison counts source.setData calls, not actual worker execution, frame rate, or network latency. Repository mutations still clone snapshot collections, so the 100-to-20 result applies specifically to selection changes with the same snapshot. It must not be described as an 80% reduction for every data update.

## Limits

No real browser rendering, WebGL, touch device, screen-reader, screenshot, frame-rate, memory, or network-speed validation was performed. jsdom has no layout; visibility rectangles were modeled for focus-event assertions. The renderer stub does not verify physical map marker interaction. Full project tests/build are run and recorded by the implementation owner separately. Archive, mode, and forward/reverse patch checks are recorded separately after packaging.
