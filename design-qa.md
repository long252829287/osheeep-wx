# Ingredient Inventory and Recipe Discovery Design QA

## Scope and visual truth

This report validates only the ingredient inventory and recipe discovery pages in native WeChat Developer Tools rendering. It does not approve the current dish-image files for release and does not claim that the broader formal-release backlog is complete.

- Inventory source: `docs/design/formal-release/ingredient-inventory-final-direction.png`
- Recipe source: `docs/design/formal-release/recipe-discovery-final-direction.png`
- 390 px same-input comparisons: `docs/design/qa/inventory-390-comparison.png`, `docs/design/qa/recipes-390-comparison.png`
- Inventory captures: `docs/design/qa/inventory-375.png`, `docs/design/qa/inventory-390.png`, `docs/design/qa/inventory-430.png`
- Recipe captures: `docs/design/qa/recipes-375.png`, `docs/design/qa/recipes-390.png`, `docs/design/qa/recipes-430.png`
- Additional scrolled evidence: `docs/design/qa/recipes-430-utilities.png`
- Runtime: isolated local Spring Boot API and MySQL 8 container with six stocked ingredients and three `AVAILABLE` recipes
- Viewports: iPhone 12/13 mini at 375 × 812, iPhone 12/13 Pro at 390 × 844, and iPhone 14 Pro Max at 430 × 932 logical pixels

## Same-input comparison result

The source and implementation were opened together at the same 390 × 844 viewport and default state.

- Inventory preserves the selected direction's warm off-white canvas, olive category hierarchy, quiet search field, compact divider rows, right-aligned quantities and plain orange save actions. Native WeChat navigation accounts for the vertical offset; the content hierarchy and row density remain faithful.
- Recipe discovery preserves the title and prompt, pantry summary, “只看能做” control, featured image card, orange primary action, lightweight secondary rows and fixed native bottom navigation. The implementation uses explicit “加入” row actions because those rows add to tonight's menu; a chevron would incorrectly imply navigation.
- Utility links appear after the recipe rows instead of being compressed into the first viewport. The 430 px scrolled evidence confirms that both remain reachable above the native safe-area navigation without overlap.
- The reference's dish imagery is used only to judge slot size, crop and hierarchy. It was not copied into the app. The current local dish images remain generated development placeholders and are excluded from release-asset approval.

## Native interaction evidence

- Inventory category shortcuts move to the requested group without filtering the list; search input produced the correct empty-result state, while name/category matching is covered by the page behavior test.
- A live quantity was edited from `2` to `2.5`, saved through the isolated API with zero application errors, and restored to `2`. Blank/unknown, invalid precision, save guarding and conflict recovery are covered by deterministic tests.
- Recipe pantry “展开全部/收起” was exercised in the simulator and exposed all six household ingredients.
- The recipe page's lightweight rows remain full width at 375, 390 and 430 px, show complete recipe names, and use action labels that match their add-to-menu behavior.
- The two utility entries were reached by scrolling at 430 px and were not obscured by bottom navigation.
- Final simulator passes reported zero application errors. Remaining messages were Developer Tools platform, deprecation or hot-reload warnings, not app exceptions.

## Findings fixed during comparison

1. P1: native `<button>` intrinsic sizing pushed inventory save actions beyond the 430 px safe width. Fixed with explicit width, minimum width and flex basis.
2. P1: lightweight recipe buttons rendered as a narrow centered column. Added definite row width/minimum width, left alignment and a bounded flexible copy column.
3. P1: inventory names wrapped vertically at 375/390 px. Reserved a readable name column and tightened the quantity editor while retaining 44 px-equivalent save targets.
4. P2: the pantry summary exposed only the first three ingredients even though more were available. Added working expand/collapse behavior.
5. P2: the 430 px featured image had a breakpoint-only height increase that broke the approved density. Removed the special-case height.
6. P2: category anchors were exposed as ARIA tabs even though they perform page jumps. Restored button semantics and explicit jump labels; search resets the shortcut state to “全部”.
7. P2: “保存” and pantry expansion targets were smaller than the product's 44 px interaction baseline. Raised both to `88rpx` minimum height.
8. P2: row chevrons implied details navigation while tapping added a dish. Replaced them with visible “加入/重试/已加入” state text.
9. P2: attribute selectors produced WeChat component-WXSS warnings. Replaced them with explicit state classes in this scope.

## Responsive and accessibility result

- No horizontal overflow, cropped action, unsafe bottom overlap or truncated current recipe name remains at 375, 390 or 430 px.
- Search, category jumps, quantity inputs, save states, pantry expansion, switches and recipe actions expose descriptive accessible names or state.
- Status and error messages do not depend on color alone; save and add controls expose disabled/loading copy and deterministic retry states.
- Native WeChat title bars and safe areas are intentional platform adaptations and are not treated as missing source content.

## Release boundary

This design QA passes the implemented inventory/discovery layout and core interaction scope. Formal release is still blocked elsewhere by the generated dish-photo placeholders, missing custom recipes, incomplete household management, incomplete reminder/message work, missing inventory removal/unit/custom-ingredient UI, missing recipe details/method selection, and the absence of a fresh uploaded candidate plus two-account iPhone/Android/weak-network regression for that candidate.

final result: passed
