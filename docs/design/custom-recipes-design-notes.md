# Custom Recipes Design Notes

- Viewport: 390 × 844
- Canvas: `#FFFAF3`
- Primary action: `#CA5325`
- Section accent: `#7B823B`
- Main text: `#282722`
- Horizontal page padding: 38rpx
- Minimum touch target: 88rpx
- Fixed editor action bar: safe-area bottom padding included
- List: divider rows, one restrained create action, no per-row floating card
- Save states: text plus color; never color-only
- Photo: only verified CC0 runtime asset; reference contains no generated dish image

## Screen-specific measurements

- Native secondary-page navigation: the top row in each PNG is semantic reference only. Configure the page's WeChat native navigation; do not implement a duplicate custom back/title bar. There is no bottom navigation.
- Compact tab and step rails: minimum 88rpx interaction height with text labels kept visible at 390px.
- Recipe list rows: lightweight 1rpx dividers, one 192rpx-class thumbnail slot, metadata beneath the name, and one trailing navigation affordance. The “新建菜谱” button itself must use `min-height: 88rpx`; do not infer its hit target from the smaller painted shape in the PNG.
- Editor: five labelled steps; ordered method rows use inline move/remove actions; the “添加步骤” button itself and every move/remove action must use `min-height: 88rpx`; the bottom action bar has a 1rpx top divider and safe-area padding.
- Image picker: 88rpx search field, one approved asset per grouped surface, aligned provenance rows, a copyable source address, and one fixed primary selection action.

## Implementation authority

- Use the hexadecimal tokens in this document as the color source of truth. The PNGs include light presentation texture and must not be sampled for production colors.
- The PNGs define hierarchy and placement. All actionable controls still require an explicit `min-height: 88rpx` (and equivalent minimum width where applicable), even when a painted outline appears smaller.

## Verified runtime photo

- Asset: `tomato-with-egg`
- Provider: Wikimedia Commons
- Author: Kaap bij Sneeuw
- License: CC0 1.0
- Source: `https://commons.wikimedia.org/wiki/File:Tomato_with_egg.jpg`
- Acquired: 2026-07-16
- Rule: use this verified source only; do not substitute generated food photography, third-party hotlinks, or upload controls.
