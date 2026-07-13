# Dinner Menu Design QA

## Evidence

- Source visual truth: `docs/design/tonight-menu-empty.png`, `docs/design/tonight-menu-draft-baseline.png`, `docs/design/tonight-menu-confirmed.png`, `docs/design/cooking-record-detail.png`
- Implementation captures: `docs/design/qa/tonight-empty-implemented.jpeg`, `docs/design/qa/tonight-draft-implemented.jpeg`, `docs/design/qa/tonight-confirmed-implemented.jpeg`, `docs/design/qa/record-detail-implemented.jpeg`, `docs/design/qa/record-detail-four-dishes-implemented.jpeg`
- Viewport: WeChat Developer Tools iPhone 12/13 simulator, 390 × 844 logical pixels
- Runtime state: real local API, two-member household, empty → separate A/B selections → three-dish merge with one consensus dish → confirmed → modified to four dishes → reconfirmed → completed four-dish record
- Primary interactions tested: login, open recipes, select and save from both accounts, merge, confirm, modify after confirmation, reconfirm, concurrent completion, open record list/detail, bottom navigation
- Console check: zero application/runtime errors after the final icon pass; only Developer Tools platform/deprecation warnings remain

## Full-view comparison evidence

The source `cooking-record-detail.png` and the final four-dish implementation capture were opened together in the same comparison input. The implementation retains the warm off-white canvas, orange primary actions, olive completion/consensus language, two-column food grid, real food photography, safe-area navigation and record card hierarchy. Native WeChat navigation and compact mobile typography are retained intentionally.

## Focused-region comparison evidence

- Header and agreement summary: generated companion avatars replace the missing reference portraits; counts and semantic colors match the source hierarchy.
- Menu rows: 1:1 local food assets remain sharp under `aspectFill`; source labels distinguish me, partner and consensus without relying on color alone.
- Actions and navigation: primary and secondary actions remain above the bottom safe area; all four navigation entries open working pages.
- Record panel: the live four-dish record reproduces the source's completion banner, two-column image grid, consensus badge, action hierarchy and record-safe copy without cropping or overlap.

## Required fidelity surfaces

- Fonts and typography: system `PingFang SC` stack, weights, line height and wrapping are consistent and readable at 390 px; no clipped labels were observed.
- Spacing and layout rhythm: cards, list rows and action spacing align consistently. No horizontal overflow was observed at 375, 390 or 430 px; fixed actions and bottom navigation remained inside the safe area.
- Colors and visual tokens: off-white `#FFFAF3`, orange `#C84D20/#CA5325`, olive `#7B823B` and partner blue `#426687` map to the source semantics.
- Image quality and asset fidelity: eight independent recipe JPEGs and two independent avatar JPEGs are local, sharp and consistently art-directed; standard UI icons come from the MIT-licensed Tabler icon library and are stored locally.
- Copy and content: empty, draft, confirmed, completed, conflict and record messages reflect the approved Chinese product copy.

## Findings and comparison history

1. Initial pass found a P1 remote TDesign icon-font failure and missing npm build path. Replaced remote font components with local Tabler SVG library assets; the final simulator pass had zero render errors.
2. Initial record-detail pass found a P2 missing persistent bottom navigation. Added the shared navigation with “记录” selected and increased safe-area padding.
3. Initial header pass found a P2 omission of the two-person visual identity. Generated and placed independent local avatar assets in the tonight and profile views.
4. Final four-dish pass used real A/B selections. Both completion requests resolved to record ID `2`; a read-only database check returned exactly one record for `2026-07-13` with four dish snapshots.
5. The record list showed one `2026-07-13` item and the existing `2026-07-11` item. The merged, reconfirmed and completed states were also verified through the live API. Version-conflict recovery remains covered by the automated state tests because its visible toast is transient and has no source-design counterpart.
6. Responsive checks used iPhone 6/7/8 at 375 px, iPhone 12/13 Pro at 390 px and iPhone 14 Pro Max at 430 px. Switching simulator models creates a fresh WeChat storage scope, so the authenticated four-dish detail was checked at 390 px while the entry flow and shared layout primitives were checked at 375 and 430 px.

## Implementation checklist

- [x] Complete the A/B merged-menu acceptance with four live dishes.
- [x] Capture the resulting completed record at 390 px and re-run the same-input comparison.
- [x] Verify concurrent completion produces one record ID and four snapshots.
- [x] Check 375 px and 430 px for horizontal overflow and safe-area problems.
- [x] Confirm no unresolved P0, P1 or P2 visual finding remains.

final result: passed
