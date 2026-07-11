# Dinner Menu Design QA

## Evidence

- Source visual truth: `docs/design/tonight-menu-empty.png`, `docs/design/tonight-menu-draft-baseline.png`, `docs/design/tonight-menu-confirmed.png`, `docs/design/cooking-record-detail.png`
- Implementation captures: `docs/design/qa/tonight-empty-implemented.jpeg`, `docs/design/qa/tonight-draft-implemented.jpeg`, `docs/design/qa/tonight-confirmed-implemented.jpeg`, `docs/design/qa/record-detail-implemented.jpeg`
- Viewport: WeChat Developer Tools iPhone 12/13 simulator, 390 × 844 logical pixels
- Runtime state: real local API, two-member household, empty → one-dish draft → confirmed → completed one-dish record
- Primary interactions tested: login, open recipes, select and save, confirm, complete, open record list/detail, bottom navigation
- Console check: zero application/runtime errors after the final icon pass; only Developer Tools platform/deprecation warnings remain

## Full-view comparison evidence

The source and implementation captures were opened in the same comparison input. The implementation retains the warm off-white canvas, orange primary actions, olive consensus language, three-column agreement summary, single-column merged menu, real food photography, safe-area navigation and record card hierarchy. Native WeChat navigation is retained intentionally.

## Focused-region comparison evidence

- Header and agreement summary: generated companion avatars replace the missing reference portraits; counts and semantic colors match the source hierarchy.
- Menu rows: 1:1 local food assets remain sharp under `aspectFill`; source labels distinguish me, partner and consensus without relying on color alone.
- Actions and navigation: primary and secondary actions remain above the bottom safe area; all four navigation entries open working pages.
- Record panel: the two-column grid, completion banner and record-safe copy match the source structure. The live record currently contains one dish, so the four-dish density still requires a same-state capture.

## Required fidelity surfaces

- Fonts and typography: system `PingFang SC` stack, weights, line height and wrapping are consistent and readable at 390 px; no clipped labels were observed.
- Spacing and layout rhythm: cards, list rows and action spacing align consistently; no horizontal overflow or bottom-navigation overlap was observed at 390 px.
- Colors and visual tokens: off-white `#FFFAF3`, orange `#C84D20/#CA5325`, olive `#7B823B` and partner blue `#426687` map to the source semantics.
- Image quality and asset fidelity: eight independent recipe JPEGs and two independent avatar JPEGs are local, sharp and consistently art-directed; standard UI icons come from the MIT-licensed Tabler icon library and are stored locally.
- Copy and content: empty, draft, confirmed, completed, conflict and record messages reflect the approved Chinese product copy.

## Findings and comparison history

1. Initial pass found a P1 remote TDesign icon-font failure and missing npm build path. Replaced remote font components with local Tabler SVG library assets; the final simulator pass had zero render errors.
2. Initial record-detail pass found a P2 missing persistent bottom navigation. Added the shared navigation with “记录” selected and increased safe-area padding.
3. Initial header pass found a P2 omission of the two-person visual identity. Generated and placed independent local avatar assets in the tonight and profile views.
4. Remaining P2: source record detail shows four dishes including a consensus dish, while the real completed test record contains one dish. A same-state four-dish A/B capture is required during Task 8 acceptance before final handoff.

## Implementation checklist

- Complete the A/B merged-menu acceptance with four live dishes.
- Capture the resulting completed record at 390 px and re-run the same-input comparison.
- Check 375 px and 430 px for overflow and fixed-action overlap.

## Follow-up polish

- P3: increase tonight-page type scale slightly if the 430 px capture feels too sparse.

final result: blocked
