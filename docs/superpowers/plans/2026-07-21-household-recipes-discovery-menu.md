# 家庭菜谱接入找菜、今晚菜单与历史快照 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让当前家庭已发布菜谱与系统菜统一参与找菜和今晚菜单，并在完成晚饭时保存不再回查当前菜谱的完整版本、图片、食材与默认做法快照。

**Architecture:** `osheeep-server` 新增只向前演进的 V7，扩展现有统一发现入口，以批量目录组装边界解析家庭菜谱食材、默认做法和已审核内部图片；菜单选择保存服务端解析的菜谱版本与方法身份；完成服务在创建记录前批量装载并复验整个聚合，再把有序 JSON 快照与现有基本字段写入同一事务。`osheeep-wx` 保持现有找菜、今晚菜单和记录详情路由，只扩展传输类型、可单测展示模型、轻量“自家菜谱”标签、失效恢复及历史详情区块。

**Tech Stack:** Java 21、Spring Boot 3.5.16、MyBatis-Plus 3.5.17、MySQL 8、Flyway、Jackson、JUnit 5、Mockito、MockMvc；微信原生小程序、TypeScript 5.9、WXML、WXSS、Jest；微信开发者工具原生模拟器。

## Completion Evidence（2026-07-22，Asia/Shanghai）

- 后端实现 HEAD：`437768c`；小程序实现 HEAD：`b80d6f8`（均为文档收口提交之前的功能提交）。
- 后端默认全量：`mvn test`，438/438 通过；`git diff --check` 通过。
- 一次性本地 MySQL 8.0.45：迁移 IT 1/1 通过，单个用例覆盖空库 V1→V7、生产形态 V4→V7、当前 V6→V7；双用户端到端 IT 6/6 通过。测试只连接 `127.0.0.1:33307`，临时目录无残留，容器已销毁。
- 小程序默认全量：34/34 suites、343/343 tests 通过；typecheck、lint、format check、`git diff --check` 全部通过。
- 微信开发者工具 Stable 2.01.2510290、基础库 3.16.2：找菜、今晚菜单、记录详情在 375×812、390×844、430×932 三个视口完成原生 QA；最终 Errors=0、Problems=0。两个 P2（长家庭菜名截断、库存摘要误显空态）已修复并复验，独立复核无剩余 P0–P3。
- 证据边界：V7 尚未应用到生产，后端尚未部署，小程序尚未上传体验版、提审或发布；本地视觉 fixture 也不代表真实微信内容安全发布成功。

## Global Constraints

- 设计真相来源是 `docs/superpowers/specs/2026-07-21-household-recipes-discovery-menu-design.md`；若实现发现规格缺口，先停下更新并重新确认规格，不在代码中临时猜测。
- 两个仓库继续直接使用 `main`；每个任务只暂存本任务列出的文件，提交前检查未知改动，不覆盖用户或其他任务的工作。
- 不修改 V1–V6；数据库变化只新增 `V7__connect_household_recipes_to_menus.sql`。
- 发现接口只返回 `SYSTEM + PUBLISHED` 和当前家庭的 `HOUSEHOLD + PUBLISHED`；草稿、归档、其他家庭和损坏聚合不得降级泄漏。
- 家庭菜与系统菜使用同一库存匹配、临时包含/排除、“只看能做”和稳定排序；不得客户端二次排序、家庭菜置顶或新增筛选器。
- `PUT /api/dinner/menus/today/selections` 请求仍只有 `recipeIds` 与菜单 `version`；`recipeVersion`、`methodId`、scope 和 household 均由服务端解析。
- 系统菜选择固定 `recipe_version = 1`、`method_id = NULL`；家庭菜选择必须保存当前菜谱版本和唯一活动默认做法 ID。
- 完成时必须再次验证家庭、菜谱、选择版本、方法归属和同菜多选择行一致性；任何不一致都必须在创建记录前失败。
- 家庭菜图片快照复用 `dinner_record_dish_snapshots.image_path`，写入完成时解析出的内部不可变列表图 URL；不写第三方原图 URL，不新增重复图片列。
- `APPROVED` 图片对象键和内容不得原位覆盖；换图必须创建新资产，保证历史 URL 的内容身份稳定。
- 历史详情只读快照表，不按 `recipe_id`、`method_id` 或 `image_asset_id` 回查当前聚合。
- 旧记录统一输出 `scope=SYSTEM`、`recipeVersion=1`、`servings=null`、`method=null`、`ingredients=[]`。
- 食材和步骤 JSON 按 `sortOrder` 升序；数量 `null` 表示“适量”，不得转换为 `0`。
- 菜单 409 后保留待加入菜但不自动重放；`DINNER_RECIPE_INVALID` 显示“这道家庭菜谱已不可用，请刷新后重试”并刷新发现结果与菜单。
- 页面不新增路由、不重选视觉方向；主要触控目标至少 `88rpx`，标签必须有文字与无障碍语义，不能只靠颜色。
- 每项生产代码必须先写测试并实际观察预期 RED，再做最小 GREEN；若测试意外先绿，先修正测试，不能直接继续。
- 每个任务结束只提交该任务范围；后端提交在 `osheeep-server`，小程序和跨仓文档提交在 `osheeep-wx`。
- 本计划不执行生产 Flyway、生产部署、真实微信内容安全联调、体验版上传、提审或正式发布。

---

### Task 1: V7 菜单选择身份与历史快照持久化契约

**Files:**

- Create: `../osheeep-server/src/main/resources/db/migration/V7__connect_household_recipes_to_menus.sql`
- Modify: `../osheeep-server/src/main/java/com/osheeep/server/dinner/menu/entity/DinnerMenuSelectionEntity.java`
- Modify: `../osheeep-server/src/main/java/com/osheeep/server/dinner/record/entity/DinnerRecordDishSnapshotEntity.java`
- Create: `../osheeep-server/src/test/java/com/osheeep/server/dinner/menu/DinnerHouseholdRecipeMenuPersistenceContractTest.java`

**Interfaces:**

- Produces selection fields: `recipeVersion: Long`, `methodId: Long | null`.
- Produces snapshot fields: `recipeScope`, `recipeVersion`, `servings`, `methodId`, `methodName`, `cookingStyle`, `methodStepsJson`, `ingredientsJson`.
- Preserves existing selection rows with version `1` and existing history rows with nullable new snapshot fields.

- [x] **Step 1: Write the failing migration/entity contract**

```java
class DinnerHouseholdRecipeMenuPersistenceContractTest {
    @Test
    void v7AddsSelectionIdentityAndImmutableSnapshotColumns() throws Exception {
        String sql = Files.readString(Path.of(
                "src/main/resources/db/migration/V7__connect_household_recipes_to_menus.sql"));

        assertThat(sql).contains("ADD COLUMN recipe_version BIGINT NOT NULL DEFAULT 1");
        assertThat(sql).contains("ADD COLUMN method_id BIGINT NULL");
        assertThat(sql).contains("fk_dinner_selections_method");
        assertThat(sql).contains("ADD COLUMN recipe_scope VARCHAR(16) NULL");
        assertThat(sql).contains("ADD COLUMN method_steps JSON NULL");
        assertThat(sql).contains("ADD COLUMN ingredients JSON NULL");
        String snapshotAlter = sql.substring(
                sql.indexOf("ALTER TABLE dinner_record_dish_snapshots"));
        assertThat(snapshotAlter).doesNotContain("FOREIGN KEY");
    }

    @Test
    void entitiesExposeEveryV7Column() throws Exception {
        assertThat(DinnerMenuSelectionEntity.class.getMethod("getRecipeVersion")).isNotNull();
        assertThat(DinnerMenuSelectionEntity.class.getMethod("getMethodId")).isNotNull();
        assertThat(DinnerRecordDishSnapshotEntity.class.getMethod("getMethodStepsJson"))
                .isNotNull();
        assertThat(DinnerRecordDishSnapshotEntity.class.getMethod("getIngredientsJson"))
                .isNotNull();
        TableField ingredients = DinnerRecordDishSnapshotEntity.class
                .getDeclaredField("ingredientsJson")
                .getAnnotation(TableField.class);
        assertThat(ingredients).isNotNull();
        assertThat(ingredients.value()).isEqualTo("ingredients");
    }
}
```

The SQL assertion about history means only the selection-table `method_id` gets a foreign key. The historical snapshot `method_id` must remain a scalar identity.

- [x] **Step 2: Run the focused contract and verify RED**

```bash
cd ../osheeep-server
mvn test -Dtest=DinnerHouseholdRecipeMenuPersistenceContractTest
```

Expected: FAIL because V7 and the new entity properties do not exist.

- [x] **Step 3: Add the complete V7 migration**

```sql
ALTER TABLE dinner_menu_selections
    ADD COLUMN recipe_version BIGINT NOT NULL DEFAULT 1 AFTER recipe_id,
    ADD COLUMN method_id BIGINT NULL AFTER recipe_version,
    ADD KEY idx_dinner_selections_method (method_id),
    ADD CONSTRAINT fk_dinner_selections_method
        FOREIGN KEY (method_id) REFERENCES dinner_recipe_methods (id);

ALTER TABLE dinner_record_dish_snapshots
    ADD COLUMN recipe_scope VARCHAR(16) NULL AFTER recipe_id,
    ADD COLUMN recipe_version BIGINT NULL AFTER recipe_scope,
    ADD COLUMN servings INT NULL AFTER estimated_minutes,
    ADD COLUMN method_id BIGINT NULL AFTER servings,
    ADD COLUMN method_name VARCHAR(64) NULL AFTER method_id,
    ADD COLUMN cooking_style VARCHAR(32) NULL AFTER method_name,
    ADD COLUMN method_steps JSON NULL AFTER cooking_style,
    ADD COLUMN ingredients JSON NULL AFTER method_steps;
```

Do not backfill old record JSON and do not add a snapshot-to-method foreign key.

- [x] **Step 4: Map the V7 columns in Java**

Use exact MyBatis field names:

```java
@TableField("recipe_version") private Long recipeVersion;
@TableField("method_id") private Long methodId;
```

and in `DinnerRecordDishSnapshotEntity`:

```java
@TableField("recipe_scope") private String recipeScope;
@TableField("recipe_version") private Long recipeVersion;
private Integer servings;
@TableField("method_id") private Long methodId;
@TableField("method_name") private String methodName;
@TableField("cooking_style") private String cookingStyle;
@TableField("method_steps") private String methodStepsJson;
@TableField("ingredients") private String ingredientsJson;
```

Add ordinary getters/setters following the existing entity style.

- [x] **Step 5: Run GREEN and commit the schema contract**

```bash
cd ../osheeep-server
mvn test -Dtest=DinnerHouseholdRecipeMenuPersistenceContractTest,DinnerMenuPersistenceContractTest
git diff --check
git add src/main/resources/db/migration/V7__connect_household_recipes_to_menus.sql \
  src/main/java/com/osheeep/server/dinner/menu/entity/DinnerMenuSelectionEntity.java \
  src/main/java/com/osheeep/server/dinner/record/entity/DinnerRecordDishSnapshotEntity.java \
  src/test/java/com/osheeep/server/dinner/menu/DinnerHouseholdRecipeMenuPersistenceContractTest.java
git commit -m "feat: add household recipe menu snapshots"
```

Expected: focused tests PASS and only the four listed paths are committed.

### Task 2: 批量目录组装边界与列表级 DTO

**Files:**

- Create: `../osheeep-server/src/main/java/com/osheeep/server/dinner/recipe/DinnerRecipeCatalogAssembler.java`
- Create: `../osheeep-server/src/main/java/com/osheeep/server/dinner/recipe/dto/RecipeMethodSummaryResponse.java`
- Modify: `../osheeep-server/src/main/java/com/osheeep/server/dinner/recipe/dto/RecipeResponse.java`
- Modify: `../osheeep-server/src/main/java/com/osheeep/server/dinner/recipe/RecipeDraftValidator.java`
- Create: `../osheeep-server/src/test/java/com/osheeep/server/dinner/recipe/DinnerRecipeCatalogAssemblerTest.java`
- Modify: `../osheeep-server/src/test/java/com/osheeep/server/dinner/recipe/RecipeDraftValidatorTest.java`
- Modify: `../osheeep-server/src/test/java/com/osheeep/server/dinner/recipe/DinnerRecipePublishTransactionTest.java`
- Modify: `../osheeep-server/src/test/java/com/osheeep/server/dinner/recipe/DinnerRecipePublishSnapshotLoaderTest.java`
- Modify: `../osheeep-server/src/test/java/com/osheeep/server/dinner/recipe/DinnerRecipeControllerTest.java`
- Modify: `../osheeep-server/src/test/java/com/osheeep/server/dinner/menu/DinnerMenuControllerTest.java`

**Interfaces:**

- Produces `RecipeMethodSummaryResponse(Long id, String name, String cookingStyle)` without steps.
- Produces a batch-loaded `CatalogEntry` per valid recipe with sorted ingredients, resolved list image URL and optional default-method summary.
- Household published aggregate is catalog-valid only when every existing publication rule still passes: required scalars, at least one required ingredient, one named active default method, a named cooking style, 1–12 nonblank steps and one approved image.
- System recipe may have `defaultMethod = null` and continues using `image_path`.

- [x] **Step 1: Write failing assembler and serialization tests**

Cover all of these cases in `DinnerRecipeCatalogAssemblerTest`:

```java
@Test
void assemblesSystemAndHouseholdRowsInBatches() {
    var entries = assembler.assemble(List.of(
            systemRecipe(1L), householdRecipe(14L, 70L, 8L, 91L)));

    assertThat(entries.get(1L).imagePath()).isEqualTo("/assets/recipes/1.jpg");
    assertThat(entries.get(1L).defaultMethod()).isNull();
    assertThat(entries.get(14L).imagePath())
            .isEqualTo("https://www.osheeep.com/media/recipes/tomato-with-egg-list.webp");
    assertThat(entries.get(14L).defaultMethod())
            .isEqualTo(new RecipeMethodSummaryResponse(21L, "家常做法", "炒"));
    assertThat(entries.get(14L).ingredients())
            .extracting(RecipeIngredientResponse::sortOrder)
            .containsExactly(0, 1);
    verify(ingredientMapper).selectWithIngredientNames(List.of(1L, 14L));
    verify(methodMapper).selectList(any());
    verify(stepMapper).selectList(any());
    verify(imageAssetService).findApprovedByIds(List.of(91L));
    verifyNoMoreInteractions(
            ingredientMapper, methodMapper, stepMapper, imageAssetService);
}

@ParameterizedTest
@MethodSource("damagedPublishedHouseholdAggregates")
void omitsDamagedHouseholdAggregateWithoutLeakingDraftFields(
        DamagedAggregateFixture fixture
) {
    fixture.stubDependencies();
    assertThat(assembler.assemble(List.of(fixture.recipe()))).isEmpty();
}
```

The damaged fixtures must separately cover: only optional ingredients, blank method name, blank cooking style, zero steps, blank step instruction, more than 12 steps and missing/unapproved image. Add a validator test that method name over 40 characters or cooking style over 32 characters is rejected with stable `METHOD` field issues.

Extend controller JSON assertions:

```java
.andExpect(jsonPath("$.data[0].scope").value("HOUSEHOLD"))
.andExpect(jsonPath("$.data[0].version").value(8))
.andExpect(jsonPath("$.data[0].defaultMethod.id").value(21))
.andExpect(jsonPath("$.data[0].defaultMethod.steps").doesNotExist());
```

- [x] **Step 2: Run focused tests and verify RED**

```bash
cd ../osheeep-server
mvn test -Dtest=DinnerRecipeCatalogAssemblerTest,RecipeDraftValidatorTest,DinnerRecipeControllerTest,DinnerMenuControllerTest
```

Expected: FAIL because the summary DTO, assembler, method-name/style publication checks and response fields do not exist.

- [x] **Step 3: Add the summary DTO and exact response shape**

```java
public record RecipeMethodSummaryResponse(
        Long id,
        String name,
        String cookingStyle
) {
}
```

Expand `RecipeResponse` to:

```java
public record RecipeResponse(
        Long id,
        String name,
        String imagePath,
        String category,
        String flavor,
        Integer estimatedMinutes,
        String scope,
        Long version,
        RecipeMethodSummaryResponse defaultMethod,
        List<RecipeIngredientResponse> ingredients,
        RecipeMatchResponse match
) {
}
```

Keep both current convenience shapes so Task 2 compiles before Task 3: the six-argument constructor normalizes to system/version-one/null-method/empty-ingredients/null-match, and the existing eight-argument `(basic fields, ingredients, match)` constructor normalizes to system/version-one/null-method while preserving those last two values. Do not reuse `RecipeMethodResponse`, because it contains steps.

- [x] **Step 4: Close the publication-rule gap for method metadata**

Extend `RecipeDraftValidator.validateMethod` before catalog work:

```java
if (!hasTextWithin(method.name(), 40)) {
    issues.add(issue("METHOD", "name", "请填写做法名称"));
}
if (!hasTextWithin(method.cookingStyle(), 32)) {
    issues.add(issue("METHOD", "cookingStyle", "请填写烹饪方式"));
}
```

Keep draft save fields nullable; this changes only publication completeness. Update all existing validator fixtures that represent a complete draft to use nonblank method name/style, and preserve stable issue ordering: method name, cooking style, then steps. In particular:

- change `DinnerRecipePublishTransactionTest.completeResponse()` from null method metadata to `"家常炒"` and `"炒"`, so success, image-validation and duplicate-key cases continue reaching their intended boundaries;
- replace `DinnerRecipePublishSnapshotLoaderTest.moderationTextLimitFailureIsReturnedAsValidationFailure()` with an overlong-method-name test that expects `RecipeValidationException` before `imageAssetService.requireApproved`. The validator's 40/32/12×160 limits make a >2500-character moderation payload unreachable through a valid publication snapshot; keep the direct 2500/2501 defensive boundary tests in `RecipeModerationTextBuilderTest` unchanged.

- [x] **Step 5: Implement one-query-per-table catalog assembly**

The public boundary is:

```java
@Component
public final class DinnerRecipeCatalogAssembler {
    public record CatalogEntry(
            DinnerRecipeEntity recipe,
            String imagePath,
            List<RecipeIngredientResponse> ingredients,
            RecipeMethodSummaryResponse defaultMethod
    ) {
    }
}
```

Add the concrete `public Map<Long, CatalogEntry> assemble(List<DinnerRecipeEntity> recipes)` method to that class; the following rules define its full behavior.

Implementation rules:

1. Return `Map.of()` immediately for an empty input.
2. Load all ingredient rows once and sort by `(recipeId, sortOrder)`.
3. Load active default methods once for household recipe IDs; use a merge function only to detect duplicates, then reject that aggregate instead of arbitrarily choosing one.
4. Load all steps for those method IDs once and sort by `(methodId, sortOrder)`; no steps appear in `CatalogEntry`, but they are mandatory for integrity validation.
5. Resolve all non-null household `imageAssetId`s through `DinnerImageAssetService.findApprovedByIds` once.
6. For system rows, keep `imagePath` and allow no method.
7. For each household row, construct a full in-memory `RecipePublishSnapshot` from the entity, sorted ingredients, method and steps, then call the same `RecipeDraftValidator.validate(snapshot)` used by publication. Also require the asset ID to resolve in the approved-image map. Only an empty issue list plus approved `listUrl` produces a `CatalogEntry`.
8. Omit a damaged household entry and log only IDs plus issue field names; never log recipe name, step, ingredient name or other user text.

- [x] **Step 6: Run GREEN, repair constructor fixtures and commit**

```bash
cd ../osheeep-server
mvn test -Dtest=DinnerRecipeCatalogAssemblerTest,RecipeDraftValidatorTest,DinnerRecipePublishTransactionTest,DinnerRecipePublishSnapshotLoaderTest,RecipeModerationTextBuilderTest,DinnerRecipeControllerTest,DinnerMenuControllerTest
git diff --check
git add src/main/java/com/osheeep/server/dinner/recipe/DinnerRecipeCatalogAssembler.java \
  src/main/java/com/osheeep/server/dinner/recipe/dto/RecipeMethodSummaryResponse.java \
  src/main/java/com/osheeep/server/dinner/recipe/dto/RecipeResponse.java \
  src/main/java/com/osheeep/server/dinner/recipe/RecipeDraftValidator.java \
  src/test/java/com/osheeep/server/dinner/recipe/DinnerRecipeCatalogAssemblerTest.java \
  src/test/java/com/osheeep/server/dinner/recipe/RecipeDraftValidatorTest.java \
  src/test/java/com/osheeep/server/dinner/recipe/DinnerRecipePublishTransactionTest.java \
  src/test/java/com/osheeep/server/dinner/recipe/DinnerRecipePublishSnapshotLoaderTest.java \
  src/test/java/com/osheeep/server/dinner/recipe/DinnerRecipeControllerTest.java \
  src/test/java/com/osheeep/server/dinner/menu/DinnerMenuControllerTest.java
git commit -m "feat: assemble household recipe catalog entries"
```

### Task 3: 统一发现当前家庭菜谱、匹配与稳定排序

**Files:**

- Modify: `../osheeep-server/src/main/java/com/osheeep/server/dinner/recipe/DinnerRecipeService.java`
- Modify: `../osheeep-server/src/test/java/com/osheeep/server/dinner/recipe/DinnerRecipeServiceTest.java`
- Modify: `../osheeep-server/src/test/java/com/osheeep/server/dinner/recipe/DinnerRecipeControllerTest.java`

**Interfaces:**

- Preserves `GET /api/dinner/recipes` request query and matching semantics.
- Adds only current-household `HOUSEHOLD + PUBLISHED` entries to the same ordered result.
- Excludes other household, draft, archived and damaged published aggregates before client delivery.

- [x] **Step 1: Extend service tests for visibility, shared matching and order**

Add explicit test rows for a system recipe, current household published recipe, other-household published recipe, current draft and current archived recipe. The mapper stub should only return rows permitted by the query; capture the wrapper and assert its SQL segment includes status plus the system/current-household OR boundary.

```java
@Test
void discoversCurrentHouseholdRecipesWithTheSameMatchingAndSorting() {
    DinnerRecipeEntity family = householdRecipe(14L, 70L, 8L);
    DinnerRecipeEntity system = systemRecipe(1L);
    when(authorizer.requireMembership(7L))
            .thenReturn(new RecipeAccess(7L, 70L));
    when(recipeMapper.selectList(any())).thenReturn(List.of(family, system));
    when(catalogAssembler.assemble(List.of(family, system))).thenReturn(Map.of(
            14L, new DinnerRecipeCatalogAssembler.CatalogEntry(
                    family,
                    "https://www.osheeep.com/media/recipes/family-list.webp",
                    List.of(new RecipeIngredientResponse(
                            101L, "鸡蛋", null, "枚", true, 0)),
                    new RecipeMethodSummaryResponse(21L, "家常做法", "炒")),
            1L, new DinnerRecipeCatalogAssembler.CatalogEntry(
                    system,
                    "/assets/recipes/1.jpg",
                    List.of(new RecipeIngredientResponse(
                            101L, "鸡蛋", null, "枚", true, 0)),
                    null)));
    when(inventoryMapper.selectList(any()))
            .thenReturn(List.of(stock(70L, 101L, null, "枚")));

    var result = service.discover(7L, Set.of(), Set.of(), false);

    assertThat(result).extracting(RecipeResponse::id).containsExactly(14L, 1L);
    assertThat(result.getFirst().scope()).isEqualTo("HOUSEHOLD");
    assertThat(result.getFirst().defaultMethod().name()).isEqualTo("家常做法");
}
```

Also retain and generalize the existing tests for include-over-inventory, exclude-over-include, `onlyCookable`, null quantities and order by status → percent descending → minutes → ID.

- [x] **Step 2: Run the service/controller tests and verify RED**

```bash
cd ../osheeep-server
mvn test -Dtest=DinnerRecipeServiceTest,DinnerRecipeControllerTest
```

Expected: FAIL because `DinnerRecipeService` still queries only system recipes and does not use the catalog assembler.

- [x] **Step 3: Inject the assembler and replace the visibility query**

Replace the member-only lookup with `DinnerRecipeAuthorizer.requireMembership(userId)` so inactive/deleted households are rejected consistently. Inject that authorizer and `DinnerRecipeCatalogAssembler`; after this refactor the service no longer owns ingredient batch queries. Use one predicate with a common published status:

```java
RecipeAccess access = authorizer.requireMembership(userId);
List<DinnerRecipeEntity> recipes = recipeMapper.selectList(
        Wrappers.<DinnerRecipeEntity>lambdaQuery()
                .eq(DinnerRecipeEntity::getStatus, "PUBLISHED")
                .and(visible -> visible
                        .eq(DinnerRecipeEntity::getScope, "SYSTEM")
                        .or(household -> household
                                .eq(DinnerRecipeEntity::getScope, "HOUSEHOLD")
                                .eq(DinnerRecipeEntity::getHouseholdId,
                                        access.householdId())))
                .orderByAsc(DinnerRecipeEntity::getId));
Map<Long, DinnerRecipeCatalogAssembler.CatalogEntry> catalog =
        catalogAssembler.assemble(recipes);
```

Build responses only from recipes whose IDs remain in `catalog`. Match requirements from `CatalogEntry.ingredients()`, use `CatalogEntry.imagePath()` and `defaultMethod()`, and preserve the existing comparator exactly.

`listSystemRecipes()` remains system-only but must construct the expanded `RecipeResponse` with `scope`, `version=1` and null method.

- [x] **Step 4: Run focused and adjacent regression tests**

```bash
cd ../osheeep-server
mvn test -Dtest=DinnerRecipeServiceTest,DinnerRecipeControllerTest,RecipeMatchCalculatorTest,DinnerRecipeQueryServiceTest
git diff --check
```

Expected: PASS; query, shared match and stable order assertions all hold.

- [x] **Step 5: Commit unified discovery**

```bash
cd ../osheeep-server
git add src/main/java/com/osheeep/server/dinner/recipe/DinnerRecipeService.java \
  src/test/java/com/osheeep/server/dinner/recipe/DinnerRecipeServiceTest.java \
  src/test/java/com/osheeep/server/dinner/recipe/DinnerRecipeControllerTest.java
git commit -m "feat: discover published household recipes"
```

### Task 4: 菜单保存版本/默认做法并按选择身份读取

**Files:**

- Modify: `../osheeep-server/src/main/java/com/osheeep/server/dinner/menu/DinnerMenuService.java`
- Modify: `../osheeep-server/src/main/java/com/osheeep/server/dinner/menu/dto/MenuDishResponse.java`
- Modify: `../osheeep-server/src/test/java/com/osheeep/server/dinner/menu/DinnerMenuServiceTest.java`
- Modify: `../osheeep-server/src/test/java/com/osheeep/server/dinner/menu/DinnerMenuControllerTest.java`

**Interfaces:**

- Preserves `UpdateSelectionsRequest(recipeIds, version)` exactly.
- Saves `recipeVersion=1/methodId=null` for system recipes.
- Saves the current aggregate version and unique active default method ID for current-household recipes.
- Produces `MenuDishResponse.scope`, `recipeVersion` and nullable `method` from saved selection identity.

- [x] **Step 1: Write failing menu-save and menu-read tests**

Add service cases for:

1. current-household published recipe saves version and default method;
2. system recipe saves version 1 with null method;
3. cross-household, draft, archived and missing IDs all return `DINNER_RECIPE_INVALID` before delete/insert;
4. two users choosing the same family recipe merge to `BOTH` with one identical saved version/method;
5. different versions or method IDs on two rows for the same recipe fail instead of picking one;
6. a saved method whose `recipe_id` differs from the selection fails;
7. a published household aggregate with only optional ingredients, blank method metadata, zero steps or no approved image is rejected before writes;
8. a tampered existing selection pointing at another household fails on `today()` without returning its name/image;
9. a multi-dish menu performs one recipe batch, one referenced-method batch and one approved-image batch rather than per-dish queries;
10. stale menu version still performs no selection writes.
11. a household selection with null `methodId`, a system selection with non-null `methodId`, or a system selection whose saved version is not `1` all fail on `today()` with `DINNER_RECIPE_INVALID`.

Capture inserted rows:

```java
ArgumentCaptor<DinnerMenuSelectionEntity> inserted =
        ArgumentCaptor.forClass(DinnerMenuSelectionEntity.class);
verify(selectionMapper, times(2)).insert(inserted.capture());
assertThat(inserted.getAllValues())
        .anySatisfy(row -> {
            assertThat(row.getRecipeId()).isEqualTo(1L);
            assertThat(row.getRecipeVersion()).isEqualTo(1L);
            assertThat(row.getMethodId()).isNull();
        })
        .anySatisfy(row -> {
            assertThat(row.getRecipeId()).isEqualTo(14L);
            assertThat(row.getRecipeVersion()).isEqualTo(8L);
            assertThat(row.getMethodId()).isEqualTo(21L);
        });
```

Extend the controller contract to assert the request has not changed and response has:

```java
.andExpect(jsonPath("$.data.dishes[0].scope").value("HOUSEHOLD"))
.andExpect(jsonPath("$.data.dishes[0].recipeVersion").value(8))
.andExpect(jsonPath("$.data.dishes[0].method.name").value("家常做法"))
.andExpect(jsonPath("$.data.dishes[0].method.steps").doesNotExist());
```

- [x] **Step 2: Run menu tests and verify RED**

```bash
cd ../osheeep-server
mvn test -Dtest=DinnerMenuServiceTest,DinnerMenuControllerTest
```

Expected: FAIL because validation is system-only, selection rows lack identity and menu DTO lacks the new fields.

- [x] **Step 3: Expand the menu response DTO**

```java
public record MenuDishResponse(
        Long recipeId,
        String name,
        String imagePath,
        String category,
        String flavor,
        Integer estimatedMinutes,
        String source,
        String scope,
        Long recipeVersion,
        RecipeMethodSummaryResponse method
) {
}
```

Update existing controller fixtures explicitly; do not make the HTTP request accept scope, version or method.

- [x] **Step 4: Return resolved metadata from validation and persist it**

Replace the boolean-only validator with a concrete private method named `validateRecipes` that accepts `(List<Long> recipeIds, Long householdId)` and returns `Map<Long, ValidatedRecipe>`. Define this exact validated value type:

```java
private record ValidatedRecipe(
        DinnerRecipeEntity recipe,
        RecipeMethodSummaryResponse method
) {
    long selectedVersion() {
        return "SYSTEM".equals(recipe.getScope()) ? 1L : recipe.getVersion();
    }
}
```

Rules:

- Query all requested recipes once and require exact ID coverage.
- Accept system only when published.
- Accept household only when published and `recipe.householdId == menu.householdId`.
- Pass the accepted recipe rows through `DinnerRecipeCatalogAssembler.assemble(recipes)` and require exact ID coverage. This deliberately reuses the publication-completeness check, including required ingredient, named method/style, steps and approved image, rather than duplicating a weaker menu-only validator.
- Convert every invalid/missing/status/ownership case to `DINNER_RECIPE_INVALID`; do not reveal which rule failed.
- Run this validation after menu row/version/mutability checks but before deleting current selections.

When inserting:

```java
ValidatedRecipe validated = recipesById.get(recipeId);
selection.setRecipeVersion(validated.selectedVersion());
selection.setMethodId(validated.method() == null ? null : validated.method().id());
```

- [x] **Step 5: Assemble menu dishes from saved identities in batches**

Group selection rows by `recipeId` and derive exactly one identity per group:

```java
private record SelectionIdentity(Long recipeVersion, Long methodId) { }
```

For every group, require all rows to have the same identity. Batch-load recipes, referenced methods and approved family image assets. Require exact recipe/method coverage, method→recipe linkage and nonblank saved method name/cooking style. Revalidate visibility against the locked menu on every read: system rows must still be `SYSTEM + PUBLISHED`; household rows must still be `HOUSEHOLD + PUBLISHED` with `recipe.householdId == menu.householdId`. System dishes use `recipe.imagePath`; household dishes use the approved asset `listUrl`. Use the saved method ID rather than re-querying “current default”. Missing/corrupt/cross-household data throws `DINNER_RECIPE_INVALID`; remove the existing silent `continue` for a missing recipe.

Validate each resolved identity before producing a response: system rows require `recipeVersion == 1` and `methodId == null`; household rows require a positive saved version and non-null `methodId`. A uniformly corrupted identity is invalid even when every selector row agrees with it.

Preserve selector source/count logic and selected ID ordering.

- [x] **Step 6: Run GREEN, adjacent concurrency tests and commit**

```bash
cd ../osheeep-server
mvn test -Dtest=DinnerMenuServiceTest,DinnerMenuControllerTest,DinnerRecipeServiceTest
git diff --check
git add src/main/java/com/osheeep/server/dinner/menu/DinnerMenuService.java \
  src/main/java/com/osheeep/server/dinner/menu/dto/MenuDishResponse.java \
  src/test/java/com/osheeep/server/dinner/menu/DinnerMenuServiceTest.java \
  src/test/java/com/osheeep/server/dinner/menu/DinnerMenuControllerTest.java
git commit -m "feat: preserve recipe identity in dinner menus"
```

### Task 5: 历史 JSON 编解码、独立响应 DTO 与旧记录兼容

**Files:**

- Create: `../osheeep-server/src/main/java/com/osheeep/server/dinner/record/DinnerRecordSnapshotJsonCodec.java`
- Create: `../osheeep-server/src/main/java/com/osheeep/server/dinner/record/dto/RecordMethodSnapshotResponse.java`
- Create: `../osheeep-server/src/main/java/com/osheeep/server/dinner/record/dto/RecordMethodStepSnapshotResponse.java`
- Create: `../osheeep-server/src/main/java/com/osheeep/server/dinner/record/dto/RecordIngredientSnapshotResponse.java`
- Modify: `../osheeep-server/src/main/java/com/osheeep/server/dinner/record/dto/RecordDishResponse.java`
- Modify: `../osheeep-server/src/main/java/com/osheeep/server/dinner/record/DinnerRecordService.java`
- Create: `../osheeep-server/src/test/java/com/osheeep/server/dinner/record/DinnerRecordSnapshotJsonCodecTest.java`
- Modify: `../osheeep-server/src/test/java/com/osheeep/server/dinner/record/DinnerRecordServiceTest.java`
- Modify: `../osheeep-server/src/test/java/com/osheeep/server/dinner/menu/DinnerMenuControllerTest.java`

**Interfaces:**

- JSON steps: `{instruction, sortOrder}` sorted ascending.
- JSON ingredients: `{ingredientId, name, quantity, unit, required, sortOrder}` sorted ascending.
- Null/blank historical JSON reads as an empty immutable list.
- `RecordDishResponse` no longer shares menu response semantics and normalizes all pre-V7 records.

- [x] **Step 1: Write codec and old-record RED tests**

```java
@Test
void roundTripsOrderedStepsAndNullableIngredientQuantity() {
    String steps = codec.writeSteps(List.of(
            new RecordMethodStepSnapshotResponse("盛盘", 1),
            new RecordMethodStepSnapshotResponse("翻炒", 0)));
    String ingredients = codec.writeIngredients(List.of(
            new RecordIngredientSnapshotResponse(2L, "鸡蛋", null, "枚", true, 0)));

    assertThat(codec.readSteps(steps))
            .extracting(RecordMethodStepSnapshotResponse::sortOrder)
            .containsExactly(0, 1);
    assertThat(codec.readIngredients(ingredients).getFirst().quantity()).isNull();
}

@Test
void readsNullLegacyJsonAsEmptyLists() {
    assertThat(codec.readSteps(null)).isEmpty();
    assertThat(codec.readIngredients(null)).isEmpty();
}
```

In `DinnerRecordServiceTest`, create a pre-V7 snapshot with every new field null and assert detail output is exactly system/version-one/null-method/empty-ingredients without mapper calls to recipe, method, ingredient or image tables.

- [x] **Step 2: Run focused tests and verify RED**

```bash
cd ../osheeep-server
mvn test -Dtest=DinnerRecordSnapshotJsonCodecTest,DinnerRecordServiceTest,DinnerMenuControllerTest
```

Expected: FAIL because the codec and expanded record DTOs do not exist.

- [x] **Step 3: Add immutable snapshot response records**

```java
public record RecordMethodStepSnapshotResponse(String instruction, int sortOrder) { }

public record RecordMethodSnapshotResponse(
        Long id,
        String name,
        String cookingStyle,
        List<RecordMethodStepSnapshotResponse> steps
) { }

public record RecordIngredientSnapshotResponse(
        Long ingredientId,
        String name,
        BigDecimal quantity,
        String unit,
        boolean required,
        int sortOrder
) { }
```

Expand `RecordDishResponse`:

```java
public record RecordDishResponse(
        Long recipeId,
        String name,
        String imagePath,
        String category,
        String flavor,
        Integer estimatedMinutes,
        String source,
        String scope,
        Long recipeVersion,
        Integer servings,
        RecordMethodSnapshotResponse method,
        List<RecordIngredientSnapshotResponse> ingredients
) { }
```

- [x] **Step 4: Implement Jackson codec with deterministic ordering**

`DinnerRecordSnapshotJsonCodec` is a Spring component that receives the application `ObjectMapper`. It must sort defensive copies before serialization and return `List.copyOf(parsedValues)` after parsing. Use separate `TypeReference<List<RecordMethodStepSnapshotResponse>>` and `TypeReference<List<RecordIngredientSnapshotResponse>>`; wrap malformed stored JSON in a non-user-facing `IllegalStateException("Invalid dinner record snapshot JSON", cause)` so a corrupted record fails safely.

```java
public String writeIngredients(List<RecordIngredientSnapshotResponse> values) {
    return write(values.stream()
            .sorted(Comparator.comparingInt(RecordIngredientSnapshotResponse::sortOrder))
            .toList());
}
```

- [x] **Step 5: Make record detail read snapshots only and normalize legacy rows**

Inside the existing snapshot stream mapping:

```java
String scope = snapshot.getRecipeScope() == null
        ? "SYSTEM" : snapshot.getRecipeScope();
Long recipeVersion = snapshot.getRecipeVersion() == null
        ? 1L : snapshot.getRecipeVersion();
List<RecordMethodStepSnapshotResponse> steps =
        codec.readSteps(snapshot.getMethodStepsJson());
boolean methodAbsent = snapshot.getMethodId() == null
        && snapshot.getMethodName() == null
        && snapshot.getCookingStyle() == null
        && steps.isEmpty();
if (!methodAbsent && (snapshot.getMethodId() == null
        || snapshot.getMethodName() == null
        || snapshot.getCookingStyle() == null)) {
    throw new IllegalStateException("Incomplete dinner record method snapshot");
}
RecordMethodSnapshotResponse method = methodAbsent ? null
        : new RecordMethodSnapshotResponse(
            snapshot.getMethodId(), snapshot.getMethodName(),
            snapshot.getCookingStyle(), steps);
```

A partial method snapshot is corrupt stored history and must fail safely instead of emitting a DTO that violates the wire contract. Always return `codec.readIngredients(snapshot.getIngredientsJson())`. Do not inject or query recipe/method/image mappers for detail reconstruction.

- [x] **Step 6: Run GREEN and commit the read contract**

```bash
cd ../osheeep-server
mvn test -Dtest=DinnerRecordSnapshotJsonCodecTest,DinnerRecordServiceTest,DinnerMenuControllerTest
git diff --check
git add src/main/java/com/osheeep/server/dinner/record/DinnerRecordSnapshotJsonCodec.java \
  src/main/java/com/osheeep/server/dinner/record/dto/RecordMethodSnapshotResponse.java \
  src/main/java/com/osheeep/server/dinner/record/dto/RecordMethodStepSnapshotResponse.java \
  src/main/java/com/osheeep/server/dinner/record/dto/RecordIngredientSnapshotResponse.java \
  src/main/java/com/osheeep/server/dinner/record/dto/RecordDishResponse.java \
  src/main/java/com/osheeep/server/dinner/record/DinnerRecordService.java \
  src/test/java/com/osheeep/server/dinner/record/DinnerRecordSnapshotJsonCodecTest.java \
  src/test/java/com/osheeep/server/dinner/record/DinnerRecordServiceTest.java \
  src/test/java/com/osheeep/server/dinner/menu/DinnerMenuControllerTest.java
git commit -m "feat: read immutable dinner dish snapshots"
```

### Task 6: 完成前批量聚合复验与原子快照写入

**Files:**

- Create: `../osheeep-server/src/main/java/com/osheeep/server/dinner/record/DinnerRecordSnapshotAssembler.java`
- Modify: `../osheeep-server/src/main/java/com/osheeep/server/dinner/record/DinnerRecordService.java`
- Create: `../osheeep-server/src/test/java/com/osheeep/server/dinner/record/DinnerRecordSnapshotAssemblerTest.java`
- Modify: `../osheeep-server/src/test/java/com/osheeep/server/dinner/record/DinnerRecordServiceTest.java`

**Interfaces:**

- `assemble(householdId, selections)` performs all recipe/method/version/image/ingredient/step reads before a cooking record insert.
- Returns ordered `SnapshotDraft`s with selectors, basic fields, resolved image, method and ingredient snapshot values.
- Throws `DINNER_RECIPE_INVALID` for any missing/cross-household/cross-method/version-inconsistent aggregate.

- [x] **Step 1: Write assembler validation tests and service atomicity tests**

Required assembler cases:

- valid system dish with version 1/null method and explicitly null `servings`;
- valid household dish with two selectors and an approved list image;
- confirmed menu with no selection rows;
- same recipe selected with different saved versions;
- same recipe selected with different method IDs;
- current recipe version differs from saved version;
- household differs from menu household;
- method recipe differs from selected recipe;
- missing approved image, missing required ingredient on either scope, missing method or missing step;
- deterministic recipe ID, ingredient and step order.

For a multi-dish fixture, verify each recipe, ingredient, method, step and image dependency is called at most once with the complete ID set; no mapper may be invoked from inside the per-draft loop.

Representative assertion:

```java
assertThatThrownBy(() -> assembler.assemble(70L, List.of(
        selection(14L, 7L, 8L, 21L),
        selection(14L, 8L, 9L, 21L))))
        .isInstanceOfSatisfying(BusinessException.class,
                error -> assertThat(error.errorCode())
                        .isEqualTo(ErrorCode.DINNER_RECIPE_INVALID));
verifyNoInteractions(recordMapper, snapshotMapper);
```

In service tests, make `snapshotAssembler.assemble(householdId, selections)` throw and assert record/action/menu writes never occur. Make the second `snapshotMapper.insert` throw and assert the exception escapes; the real rollback is proved in Task 7 through Spring/MySQL, not by Mockito pretending to run transactions.

- [x] **Step 2: Run focused tests and verify RED**

```bash
cd ../osheeep-server
mvn test -Dtest=DinnerRecordSnapshotAssemblerTest,DinnerRecordServiceTest
```

Expected: FAIL because completion still loads only recipe basics and creates the record before aggregate validation.

- [x] **Step 3: Implement the batch snapshot assembler**

Use this boundary:

```java
@Component
public final class DinnerRecordSnapshotAssembler {
    public record SnapshotDraft(
            Long recipeId,
            String scope,
            Long recipeVersion,
            String name,
            String imagePath,
            String category,
            String flavor,
            Integer servings,
            Integer estimatedMinutes,
            Set<Long> selectedByUserIds,
            Long methodId,
            String methodName,
            String cookingStyle,
            List<RecordMethodStepSnapshotResponse> steps,
            List<RecordIngredientSnapshotResponse> ingredients
    ) { }
}
```

Add the concrete `public List<SnapshotDraft> assemble(Long householdId, List<DinnerMenuSelectionEntity> selections)` method to this class; the validation and batching rules below define its full behavior.

Load in at most five batch operations: recipes, joined ingredient rows, referenced methods, method steps and approved images. Validation order:

1. at least one selection row exists;
2. every selected recipe ID resolves exactly once;
3. selection rows for one recipe agree on version and method;
4. system recipe is published, saved version is 1 and method is null;
5. household recipe is published, belongs to `householdId`, current version equals saved version and method is non-null;
6. every recipe has at least one required ingredient, so a corrupted system row cannot produce an incomplete history snapshot;
7. referenced family method exists, is active, has nonblank name/style and `method.recipeId == recipe.id`;
8. published family aggregate has 1–12 nonblank steps and an approved list image;
9. scope, name, category, flavor and estimated minutes required by the snapshot are non-null, and the resolved image URL fits the existing 255-character `image_path` column. Household `servings` must be within `1..20`; existing system recipes may keep `servings = null` and must not be rejected or backfilled with a guessed value.

For household images use `ImageAssetResponse.listUrl()`. Never use `detailUrl`, `sourcePageUrl` or `originalFileUrl` for the snapshot.

- [x] **Step 4: Move aggregate loading ahead of the record insert and write every field**

In `DinnerRecordService.complete`, preserve current ordering for membership, household, menu lock, existing-record idempotency, version and confirmed state. Then:

```java
List<DinnerMenuSelectionEntity> selections = selectionMapper.selectList(
        Wrappers.<DinnerMenuSelectionEntity>lambdaQuery()
                .eq(DinnerMenuSelectionEntity::getMenuId, menu.getId()));
List<DinnerRecordSnapshotAssembler.SnapshotDraft> drafts =
        snapshotAssembler.assemble(household.getId(), selections);

// Only now insert DinnerCookingRecordEntity.
```

For each draft populate existing basics plus:

```java
snapshot.setRecipeScope(draft.scope());
snapshot.setRecipeVersion(draft.recipeVersion());
snapshot.setServings(draft.servings());
snapshot.setMethodId(draft.methodId());
snapshot.setMethodName(draft.methodName());
snapshot.setCookingStyle(draft.cookingStyle());
snapshot.setMethodStepsJson(codec.writeSteps(draft.steps()));
snapshot.setIngredientsJson(codec.writeIngredients(draft.ingredients()));
```

Keep record inserts, all snapshot inserts, menu completion and COMPLETE action in the existing `@Transactional` method. Do not catch a snapshot insertion failure. Keep the duplicate-record winner path, but require a non-null winner before returning.

- [x] **Step 5: Run GREEN and commit completion snapshots**

```bash
cd ../osheeep-server
mvn test -Dtest=DinnerRecordSnapshotAssemblerTest,DinnerRecordSnapshotJsonCodecTest,DinnerRecordServiceTest,DinnerMenuServiceTest
git diff --check
git add src/main/java/com/osheeep/server/dinner/record/DinnerRecordSnapshotAssembler.java \
  src/main/java/com/osheeep/server/dinner/record/DinnerRecordService.java \
  src/test/java/com/osheeep/server/dinner/record/DinnerRecordSnapshotAssemblerTest.java \
  src/test/java/com/osheeep/server/dinner/record/DinnerRecordServiceTest.java
git commit -m "feat: snapshot household recipes on completion"
```

### Task 7: 三条 MySQL 8 迁移路径与双用户端到端闭环

**Files:**

- Create: `../osheeep-server/src/test/java/com/osheeep/server/dinner/menu/DinnerEphemeralCatalogHarness.java`
- Create: `../osheeep-server/src/test/java/com/osheeep/server/dinner/menu/DinnerEphemeralCatalogHarnessTest.java`
- Create: `../osheeep-server/src/test/java/com/osheeep/server/dinner/menu/DinnerHouseholdRecipeMenuMigrationMySqlIT.java`
- Modify: `../osheeep-server/src/test/java/com/osheeep/server/dinner/recipe/DinnerCustomRecipeMySqlIT.java`
- Modify: `../osheeep-server/docs/api-contract.md`

**Interfaces:**

- Proves fresh V1→V7, production-shaped V4→V5→V6→V7 and current V6→V7 in three random, per-run catalogs on a guarded loopback MySQL 8 server.
- Proves two household users discover/select/merge/confirm/complete/read one family recipe.
- Proves tampered association/version fails before record creation and snapshot insert failure rolls back.
- Never runs Flyway clean against the long-lived `.env.local` test catalog; it drops only catalogs created and tracked by the current test run, and never connects to or copies production data.

- [x] **Step 1: Write the guarded migration-path IT and observe RED**

Reuse `DinnerCustomRecipeTestDatabaseSafetyInitializer` semantics for the base connection. Before any catalog DDL, fixture write or migration, additionally require an explicit ephemeral-catalog opt-in and a loopback JDBC host:

```java
String expected = System.getenv("OSHEEEP_DB_TEST_NAME");
assertThat(expected).isNotBlank();
assertThat(System.getenv("OSHEEEP_DB_NAME")).isEqualTo(expected);
assertThat(System.getenv("OSHEEEP_ALLOW_EPHEMERAL_DATABASES"))
        .isEqualTo("true");
assertThat(jdbcTemplate.queryForObject("SELECT DATABASE()", String.class))
        .isEqualTo(expected);
assertThat(jdbcTemplate.queryForObject("SELECT VERSION()", String.class))
        .startsWith("8.");
```

Parse the effective `spring.datasource.url` and reject every host except `127.0.0.1`, `localhost` or IPv6 loopback. If the configured database is remote, use a disposable local MySQL 8 container for this test; do not weaken the host guard.

Require the base catalog to match `[A-Za-z0-9_]+`; reject generated names longer than MySQL's 64-character identifier limit. `DinnerEphemeralCatalogHarness` generates one run UUID and exact names under:

```text
<OSHEEEP_DB_TEST_NAME>_ephemeral_<32 lowercase hex run id>_fresh
<OSHEEEP_DB_TEST_NAME>_ephemeral_<32 lowercase hex run id>_v4
<OSHEEEP_DB_TEST_NAME>_ephemeral_<32 lowercase hex run id>_v6
```

It creates those catalogs from the guarded base connection, quotes only already-regex-validated generated identifiers, records each successfully created name in an in-memory set, and exposes a catalog-switching `DataSource` whose two `getConnection` overloads delegate credentials/connections but call `connection.setCatalog(exactName)` before returning. Its connection wrapper restores the guarded base catalog before delegating `close()`, so pooled connections cannot leak an ephemeral catalog into the business-flow IT. Before each Flyway call, query `SELECT DATABASE()` through that exact data source and require the generated name. Drop is permitted only when the requested name both matches the exact current-run prefix/suffix pattern and remains in the created-name set; otherwise throw before issuing SQL.

Write ordinary `DinnerEphemeralCatalogHarnessTest` cases for missing opt-in, remote host, unsafe/generated-name mismatch and untracked drop. Then, in one IT method, use three test-only Flyway configurations:

1. create the `fresh` catalog, migrate V1→V7, assert version 7 and all new columns;
2. create the `v4` catalog, migrate with target V4, insert generated fake users/household/old system selection/old record snapshot, then migrate V5→V7 and assert selection defaults plus null new history fields;
3. create the `v6` catalog, migrate with target V6, assert version 6, then migrate V7 and assert constraints/JSON columns;
4. in `finally`, drop exactly the three tracked per-run catalogs, even after an assertion failure.

Do not call `Flyway.clean()` anywhere. Never use real user data. The migration test must be named `*IT`, so ordinary `mvn test` does not select it.

Run and expect RED:

```bash
cd ../osheeep-server
export OSHEEEP_DB_HOST=127.0.0.1
export OSHEEEP_DB_PORT=33307
export OSHEEEP_DB_NAME=osheeep_it_v7
export OSHEEEP_DB_TEST_NAME=osheeep_it_v7
export OSHEEEP_ALLOW_EPHEMERAL_DATABASES=true
export OSHEEEP_DB_USERNAME=root
export OSHEEEP_DB_PASSWORD=osheeep-local-it-only
export OSHEEEP_JWT_SECRET=osheeep-local-it-jwt-secret-at-least-32-bytes
export OSHEEEP_REDIS_HOST=127.0.0.1
export OSHEEEP_REDIS_PORT=6379
export OSHEEEP_REDIS_PASSWORD=
export OSHEEEP_RABBITMQ_HOST=127.0.0.1
export OSHEEEP_RABBITMQ_PORT=5672
export OSHEEEP_RABBITMQ_USERNAME=guest
export OSHEEEP_RABBITMQ_PASSWORD=guest
export OSHEEEP_RABBITMQ_VHOST=/
export OSHEEEP_WECHAT_APP_ID=osheeep-local-it-app
export OSHEEEP_WECHAT_APP_SECRET=osheeep-local-it-app-secret
mvn test -Dtest=DinnerEphemeralCatalogHarnessTest
mvn test -Dtest=DinnerHouseholdRecipeMenuMigrationMySqlIT -Dspring.profiles.active=local
```

Run this only after starting a disposable MySQL 8 instance whose credentials and loopback port exactly match the explicit values above. Do not `source .env.local`. Expected: FAIL before implementation because the harness/class/path assertions do not exist or V7 behavior is incomplete. If any base, host, opt-in, created-name or active-catalog gate fails, stop; never relax it merely to obtain a RED.

- [x] **Step 2: Implement all three migration paths and legacy assertions**

For each catalog-specific Flyway instance set `defaultSchema` and `schemas` to only that exact generated catalog. Its actual data source must independently return the same catalog before `migrate()`. Production-shaped V4 fixture assertions, executed through the `v4` catalog's `JdbcTemplate`, must include:

```java
assertThat(jdbcTemplate.queryForObject(
        "SELECT recipe_version FROM dinner_menu_selections WHERE id = ?",
        Long.class, legacySelectionId)).isEqualTo(1L);
assertThat(jdbcTemplate.queryForObject(
        "SELECT method_id IS NULL FROM dinner_menu_selections WHERE id = ?",
        Boolean.class, legacySelectionId)).isTrue();
assertThat(jdbcTemplate.queryForObject(
        "SELECT recipe_scope IS NULL AND method_steps IS NULL "
                + "AND ingredients IS NULL FROM dinner_record_dish_snapshots WHERE id = ?",
        Boolean.class, legacySnapshotId)).isTrue();
```

Assert the selection method foreign key exists and the historical method column has no foreign key.

- [x] **Step 3: Extend the existing two-user MySQL vertical slice**

Update its startup assertion from successful V6 to successful V7. Create two test-owned `APPROVED` image assets with unique generated SHA-256 values and immutable list/detail object keys; publish the family recipe with the first asset. Track both IDs and delete them in teardown only after selections/methods/recipe rows are gone. Never update the shared V6 seed asset. Then:

1. give household inventory the recipe ingredient;
2. assert both JWT users find the same recipe through `/api/dinner/recipes` with household scope, method summary and approved internal list URL;
3. each user PUTs the same recipe in today selections using the latest returned menu version;
4. assert one `BOTH` dish and identical persisted `recipe_version/method_id` rows;
5. confirm and complete with UUID v4 idempotency keys;
6. assert record detail contains ordered steps, null quantity, “枚” unit and the internal list URL;
7. directly change the source recipe name/version, method text, steps and ingredient, and point `recipe.image_asset_id` to the second test-owned asset; assert record detail bytes for the dish remain unchanged and still contain the first asset's list URL;
8. repeat completion and assert the same record ID and one snapshot row.

Add separate setup scenarios that tamper selection version, method recipe or recipe household before completion and assert no cooking record. Add one database-backed snapshot insertion failure seam and assert record/snapshots/action are absent and menu remains `CONFIRMED`.

Implement the failure seam in the same IT with Spring's `@MockitoSpyBean DinnerRecordDishSnapshotMapper` and a two-dish confirmed menu:

```java
AtomicInteger inserts = new AtomicInteger();
Answer<?> realMapperDelegate = Mockito.mockingDetails(snapshotMapper)
        .getMockCreationSettings()
        .getDefaultAnswer();
doAnswer(invocation -> {
    if (inserts.incrementAndGet() == 2) {
        throw new DataIntegrityViolationException("forced snapshot failure");
    }
    return realMapperDelegate.answer(invocation);
}).when(snapshotMapper).insert(any(DinnerRecordDishSnapshotEntity.class));
```

`DinnerRecordDishSnapshotMapper` is a MyBatis JDK proxy, so never call `invocation.callRealMethod()` on its abstract `insert` method. The captured spy default answer delegates non-failing calls to the original mapper proxy. Call the real transactional completion endpoint, then query the real tables to prove the first snapshot, record and COMPLETE action all rolled back and the menu remains `CONFIRMED`. Reset the spy in `finally` so later integration cases delegate to the real MyBatis mapper. Do not add a production-only failure flag or weaken a database constraint for this test.

Because V7 makes methods referenced by menu selections, fix the integration test's own cleanup to delete `dinner_menu_selections` before `dinner_recipe_methods`. Delete the two test-owned image assets after recipes, then retain the existing baseline count assertion to prove no asset pollution. Production `DinnerAccountCleanupService` already uses that order and `DinnerAccountCleanupServiceTest` already locks it; run that existing regression test without editing either file.

- [x] **Step 4: Run migration IT then business-flow IT sequentially**

```bash
cd ../osheeep-server
export OSHEEEP_DB_HOST=127.0.0.1
export OSHEEEP_DB_PORT=33307
export OSHEEEP_DB_NAME=osheeep_it_v7
export OSHEEEP_DB_TEST_NAME=osheeep_it_v7
export OSHEEEP_ALLOW_EPHEMERAL_DATABASES=true
export OSHEEEP_DB_USERNAME=root
export OSHEEEP_DB_PASSWORD=osheeep-local-it-only
export OSHEEEP_JWT_SECRET=osheeep-local-it-jwt-secret-at-least-32-bytes
export OSHEEEP_REDIS_HOST=127.0.0.1
export OSHEEEP_REDIS_PORT=6379
export OSHEEEP_REDIS_PASSWORD=
export OSHEEEP_RABBITMQ_HOST=127.0.0.1
export OSHEEEP_RABBITMQ_PORT=5672
export OSHEEEP_RABBITMQ_USERNAME=guest
export OSHEEEP_RABBITMQ_PASSWORD=guest
export OSHEEEP_RABBITMQ_VHOST=/
export OSHEEEP_WECHAT_APP_ID=osheeep-local-it-app
export OSHEEEP_WECHAT_APP_SECRET=osheeep-local-it-app-secret
mvn test -Dtest=DinnerEphemeralCatalogHarnessTest
mvn test -Dtest=DinnerHouseholdRecipeMenuMigrationMySqlIT -Dspring.profiles.active=local
mvn test -Dtest=DinnerCustomRecipeMySqlIT -Dspring.profiles.active=local
```

Run this only against a disposable MySQL 8 instance matching those explicit loopback values, and remove the instance afterward. Never `source .env.local` for these write tests. Expected: all three commands PASS; logs name only the guarded base catalog and current-run generated catalogs; the base Flyway history records V7 and no generated catalog remains. Do not combine the ITs into a parallel test run: one owns ephemeral catalog DDL while the other owns business fixtures in the guarded base catalog.

- [x] **Step 5: Run full backend verification and update measured API documentation**

```bash
cd ../osheeep-server
mvn test
git diff --check
```

The ordinary suite must include the existing `DinnerAccountCleanupServiceTest` and keep it green under the new selection foreign key.

Update `docs/api-contract.md` with:

- the three expanded response examples;
- unchanged selection request;
- V7 schema and legacy normalization;
- publication now requires nonblank default-method name and cooking style in addition to valid steps;
- exact measured unit/IT counts and commands;
- the immutable approved-list-image URL rule;
- explicit wording that local dedicated-MySQL evidence is not production Flyway, deployment or release evidence.

- [x] **Step 6: Commit MySQL evidence and API contract**

```bash
cd ../osheeep-server
git add src/test/java/com/osheeep/server/dinner/menu/DinnerHouseholdRecipeMenuMigrationMySqlIT.java \
  src/test/java/com/osheeep/server/dinner/menu/DinnerEphemeralCatalogHarness.java \
  src/test/java/com/osheeep/server/dinner/menu/DinnerEphemeralCatalogHarnessTest.java \
  src/test/java/com/osheeep/server/dinner/recipe/DinnerCustomRecipeMySqlIT.java \
  docs/api-contract.md
git commit -m "test: verify household recipe dinner flow"
```

### Task 8: 小程序 wire 类型与纯展示模型

**Files:**

- Modify: `miniprogram/types/recipe.ts`
- Modify: `miniprogram/types/menu.ts`
- Modify: `miniprogram/types/record.ts`
- Modify: `miniprogram/utils/recipe-discovery.ts`
- Modify: `miniprogram/utils/menu-state.ts`
- Create: `miniprogram/utils/record-detail.ts`
- Modify: `tests/recipe-wire-contract.test.ts`
- Modify: `tests/recipe-discovery.test.ts`
- Modify: `tests/recipe-discovery-page.test.ts`
- Modify: `tests/menu-state.test.ts`
- Create: `tests/record-detail.test.ts`
- Modify: `tests/menu-service.test.ts`

**Interfaces:**

- Defines shared `RecipeScope` and list-only `RecipeMethodSummary`.
- Keeps `RecipeSummary`, `MenuDish` and `RecordDish` distinct and faithful to their server DTOs.
- Produces pure, deterministic labels for discovery, tonight and history; pages only bind prepared values.
- Preserves all service URLs and request payloads.

- [x] **Step 1: Write compile-time/wire and view-model RED tests**

Add literal fixtures that must typecheck:

```ts
const discovered: RecipeSummary = {
  id: 14,
  name: '番茄炒蛋',
  imagePath: 'https://www.osheeep.com/media/recipes/tomato-list.webp',
  category: '家常菜',
  flavor: '酸甜',
  estimatedMinutes: 15,
  scope: 'HOUSEHOLD',
  version: 8,
  defaultMethod: { id: 21, name: '家常做法', cookingStyle: '炒' },
  ingredients: [],
  match,
};

const legacyDish: RecordDish = {
  recipeId: 1,
  name: '番茄炒蛋',
  imagePath: '/assets/recipes/tomato-eggs.jpg',
  category: '家常菜',
  flavor: '酸甜',
  estimatedMinutes: 10,
  source: 'BOTH',
  scope: 'SYSTEM',
  recipeVersion: 1,
  servings: null,
  method: null,
  ingredients: [],
};
```

Pure helper expectations:

```ts
expect(toRecipeDiscoveryView([discovered], [], false).featured).toMatchObject({
  scopeLabel: '自家菜谱',
  ariaName: '自家菜谱，番茄炒蛋',
});
expect(toMenuDishPresentation(familyDish).contextLabel).toBe(
  '自家菜谱 · 家常做法',
);
expect(toRecordDishPresentation(snapshotDish).ingredients[0].amountLabel).toBe(
  '适量',
);
expect(toRecordDishPresentation(legacyDish).showSnapshotDetails).toBe(false);
```

- [x] **Step 2: Run focused tests/typecheck and verify RED**

```bash
npm test -- --runInBand tests/recipe-wire-contract.test.ts tests/recipe-discovery.test.ts tests/recipe-discovery-page.test.ts tests/menu-state.test.ts tests/record-detail.test.ts tests/menu-service.test.ts
npm run typecheck
```

Expected: FAIL because new fields/types/helpers are absent.

- [x] **Step 3: Add exact wire types**

In `types/recipe.ts`:

```ts
export type RecipeScope = 'SYSTEM' | 'HOUSEHOLD';

export interface RecipeMethodSummary {
  id: number;
  name: string;
  cookingStyle: string;
}

export interface RecipeSummary {
  id: number;
  name: string;
  imagePath?: string;
  category: string;
  flavor: string;
  estimatedMinutes: number;
  scope: RecipeScope;
  version: number;
  defaultMethod: RecipeMethodSummary | null;
  ingredients: RecipeIngredient[];
  match: RecipeMatch;
}
```

In `types/menu.ts`, avoid inheriting the discovery method field accidentally:

```ts
export interface MenuDish extends Omit<
  RecipeSummary,
  'id' | 'version' | 'defaultMethod' | 'ingredients' | 'match'
> {
  recipeId: number;
  recipeVersion: number;
  method: RecipeMethodSummary | null;
  source: MenuDishSource;
}
```

In `types/record.ts`, define independent `RecordMethodStepSnapshot`, `RecordMethodSnapshot`, `RecordIngredientSnapshot`, `RecordDish` and set `RecordDetail.dishes: RecordDish[]`. `RecordDish.imagePath` is `string | null` for preexisting snapshots; `scope` and `recipeVersion` are required after server normalization; `servings` is `number | null`; a non-null method has required numeric ID/name/style/steps. Do not extend `MenuDish`; history method contains steps and history ingredients contain snapshot names/amounts.

Update every existing typed recipe/menu fixture in `recipe-discovery.test.ts`, `recipe-discovery-page.test.ts` and `menu-state.test.ts` with explicit system compatibility values (`scope: 'SYSTEM'`, `version`/`recipeVersion: 1`, null method). Do not make the new server keys optional merely to avoid fixture repairs.

- [x] **Step 4: Implement pure presentation helpers**

Extend `RecipeCardView` with:

```ts
scopeLabel: '' | '自家菜谱';
ariaName: string;
```

Add to `menu-state.ts`:

```ts
export const toMenuDishPresentation = (dish: MenuDish) => ({
  ...dish,
  sourceLabel: getSourcePresentation(dish.source).label,
  sourceTone: getSourcePresentation(dish.source).tone,
  contextLabel:
    dish.scope === 'HOUSEHOLD'
      ? `自家菜谱${dish.method ? ` · ${dish.method.name}` : ''}`
      : '',
});
```

Add `record-detail.ts` with `formatSnapshotAmount` and `toRecordDishPresentation`. `quantity === null` maps to `适量`; otherwise use `${quantity}${unit}`. Set `showSnapshotDetails` only when method exists or ingredients are nonempty, so legacy rows never render empty sections.

- [x] **Step 5: Run GREEN and prove service requests are unchanged**

```bash
npm test -- --runInBand tests/recipe-wire-contract.test.ts tests/recipe-discovery.test.ts tests/recipe-discovery-page.test.ts tests/menu-state.test.ts tests/record-detail.test.ts tests/menu-service.test.ts
npm run typecheck
npm run lint
git diff --check
```

`tests/menu-service.test.ts` must still assert `saveSelections([1, 14], 3)` sends only `{recipeIds:[1,14], version:3}`.

- [x] **Step 6: Commit wire types and view models**

```bash
git add miniprogram/types/recipe.ts miniprogram/types/menu.ts miniprogram/types/record.ts \
  miniprogram/utils/recipe-discovery.ts miniprogram/utils/menu-state.ts \
  miniprogram/utils/record-detail.ts tests/recipe-wire-contract.test.ts \
  tests/recipe-discovery.test.ts tests/recipe-discovery-page.test.ts tests/menu-state.test.ts \
  tests/record-detail.test.ts tests/menu-service.test.ts
git commit -m "feat: model household recipe dinner snapshots"
```

### Task 9: 找菜页“自家菜谱”标签与失效恢复

**Files:**

- Modify: `miniprogram/utils/menu-errors.ts`
- Modify: `miniprogram/pages/recipes/index.ts`
- Modify: `miniprogram/pages/recipes/index.wxml`
- Modify: `miniprogram/pages/recipes/index.wxss`
- Modify: `tests/menu-errors.test.ts`
- Modify: `tests/recipe-discovery-page.test.ts`

**Interfaces:**

- Shows the same light text label on household featured card and compact rows without changing result order.
- Includes “自家菜谱” in add-button and row accessibility names.
- Keeps 409 explicit retry semantics.
- On `DINNER_RECIPE_INVALID`, refreshes recipes and today menu, clears the invalid pending item and does not leak backend ownership/status details.

- [x] **Step 1: Run the required product-design checkpoint before visual edits**

Invoke `product-design:index` and route this as a targeted evolution of the existing approved find-recipes page, not a redesign. Inspect:

- `docs/design/formal-release/recipe-discovery-final-direction.png`
- `docs/design/qa/recipes-390.png`
- current 375/390/430 page captures if available.

The outcome must preserve hierarchy, spacing and orange add action while selecting one unobtrusive text-tag treatment. If the skill identifies a material interaction change beyond the confirmed spec, pause and return to design review.

- [x] **Step 2: Write page/error RED tests**

Extend structure assertions for both card forms:

```ts
expect(wxml).toContain('wx:if="{{featured.scopeLabel}}"');
expect(wxml).toContain('wx:if="{{item.scopeLabel}}"');
expect(wxml).toContain('{{featured.scopeLabel}}');
expect(wxml).toContain('{{item.scopeLabel}}');
expect(wxss).toMatch(/\.recipe-scope-label\s*\{/);
```

Add the exact error mapping and a behavioral test:

```ts
app.saveSelections.mockRejectedValueOnce(
  new ApiError('DINNER_RECIPE_INVALID', 'invalid'),
);
app.getRecipes.mockResolvedValueOnce([systemRecipe]);
app.getTodayMenu.mockResolvedValueOnce(latestMenu);

await definition.onAddToTonight.call(instance, eventFor(14));

expect(instance.data.actionMessage).toBe('这道家庭菜谱已不可用，请刷新后重试');
expect(instance.data.pendingRecipeId).toBe(0);
expect(app.getRecipes).toHaveBeenCalledTimes(2);
expect(app.getTodayMenu).toHaveBeenCalledTimes(2);
```

Retain the existing 409 test proving `pendingRecipeId=14`, latest menu refresh and no automatic second PUT.

- [x] **Step 3: Run focused tests and verify RED**

```bash
npm test -- --runInBand tests/menu-errors.test.ts tests/recipe-discovery.test.ts tests/recipe-discovery-page.test.ts
```

Expected: FAIL on absent labels/error recovery while existing selection tests continue to execute.

- [x] **Step 4: Implement label markup, accessibility and CSS**

Place the label next to the recipe name in both card variants:

```xml
<view class="recipe-title-line">
  <text class="recipe-name recipe-name--featured">{{featured.name}}</text>
  <text wx:if="{{featured.scopeLabel}}" class="recipe-scope-label">{{featured.scopeLabel}}</text>
</view>
```

Use the same class for rows. Keep it text-based, allow title line wrapping without shrinking the action, and do not use an attribute selector in WXSS. Set button `aria-label` from prepared `ariaName` plus selected/retry state.

- [x] **Step 5: Implement invalid-recipe recovery without auto replay**

Add exact mapping:

```ts
DINNER_RECIPE_INVALID: '这道家庭菜谱已不可用，请刷新后重试',
```

In the non-409 catch branch, detect this code, clear `pendingRecipeId`, refresh recipes with the current filters and fetch/apply the latest menu. Use existing request tokens so stale responses cannot overwrite newer state. After refresh, set the exact action message; because `reloadRecipes()` currently clears `actionMessage`, do not set the final message until refresh settles. Never call `saveSelections` again automatically.

- [x] **Step 6: Run GREEN, static checks and commit**

```bash
npm test -- --runInBand tests/menu-errors.test.ts tests/recipe-discovery.test.ts tests/recipe-discovery-page.test.ts tests/menu-service.test.ts
npm run typecheck
npm run lint
git diff --check
git add miniprogram/utils/menu-errors.ts miniprogram/pages/recipes/index.ts \
  miniprogram/pages/recipes/index.wxml miniprogram/pages/recipes/index.wxss \
  tests/menu-errors.test.ts tests/recipe-discovery-page.test.ts
git commit -m "feat: add household recipes from discovery"
```

### Task 10: 今晚菜单、记录详情、原生三视口 QA 与交接收口

**Files:**

- Modify: `miniprogram/pages/tonight/index.ts`
- Modify: `miniprogram/pages/tonight/index.wxml`
- Modify: `miniprogram/pages/tonight/index.wxss`
- Modify: `miniprogram/pages/record-detail/index.ts`
- Modify: `miniprogram/pages/record-detail/index.wxml`
- Modify: `miniprogram/pages/record-detail/index.wxss`
- Create: `tests/tonight-page.test.ts`
- Create: `tests/record-detail-page.test.ts`
- Modify: `docs/HANDOFF.md`
- Modify: `docs/superpowers/plans/2026-07-21-household-recipes-discovery-menu.md`
- Create: `docs/design/qa/household-recipe-menu/recipes-375.png`
- Create: `docs/design/qa/household-recipe-menu/recipes-390.png`
- Create: `docs/design/qa/household-recipe-menu/recipes-430.png`
- Create: `docs/design/qa/household-recipe-menu/tonight-375.png`
- Create: `docs/design/qa/household-recipe-menu/tonight-390.png`
- Create: `docs/design/qa/household-recipe-menu/tonight-430.png`
- Create: `docs/design/qa/household-recipe-menu/record-detail-375.png`
- Create: `docs/design/qa/household-recipe-menu/record-detail-390.png`
- Create: `docs/design/qa/household-recipe-menu/record-detail-430.png`
- Create: `docs/design/qa/household-recipe-menu/recipes-390-comparison.png`
- Create: `docs/design/qa/household-recipe-menu/tonight-390-comparison.png`
- Create: `docs/design/qa/household-recipe-menu/record-detail-390-comparison.png`
- Create: `docs/design/qa/household-recipe-menu/household-recipe-menu-qa.md`

**Interfaces:**

- Tonight household dish shows `自家菜谱 · 默认做法名`; system/no-method dish shows no empty placeholder.
- Record detail shows household tag, snapshot method/style/ordered steps and snapshot ingredients; old records keep the compact basic card.
- Proves native 375/390/430 layout and current full automated baselines without claiming upload or production release.

- [x] **Step 1: Write tonight and record page RED tests**

`tests/tonight-page.test.ts` should capture the page definition like `recipe-discovery-page.test.ts` and assert:

- `toMenuDishPresentation` drives `contextLabel`;
- household row renders `自家菜谱 · 家常做法`;
- system row has empty context and no “未知做法”;
- `BOTH` source still maps to one row and existing source tone;
- polling, confirm, complete and version-conflict reload behavior remains unchanged.

`tests/record-detail-page.test.ts` should assert:

- household record builds ordered steps and ingredients;
- null quantity renders `适量`, non-null quantity includes unit;
- method/cooking style and “自家菜谱” appear only when present;
- legacy record has `showSnapshotDetails=false` and no empty method/ingredient headings;
- invalid ID and request errors keep existing recovery copy.

Add WXML/WXSS structure assertions for headings, text labels, safe-area padding, no horizontal overflow and `88rpx` action targets.

- [x] **Step 2: Run page tests and verify RED**

```bash
npm test -- --runInBand tests/tonight-page.test.ts tests/record-detail-page.test.ts tests/menu-state.test.ts tests/record-detail.test.ts
```

Expected: FAIL because pages still bind raw menu dishes and history only shows basic image/name cards.

- [x] **Step 3: Bind tonight page to the pure presentation model**

Replace its local duplicate mapping with imported `toMenuDishPresentation`. Under the name render:

```xml
<text class="dish-name">{{item.name}}</text>
<text wx:if="{{item.contextLabel}}" class="dish-context">{{item.contextLabel}}</text>
<text class="dish-meta">{{item.flavor}} · {{item.estimatedMinutes}} 分钟</text>
```

Use a light olive/neutral text treatment for `.dish-context`; keep source labels and `dish-card--both` unchanged. Household method is guaranteed by the server, but the client still safely omits an empty context rather than displaying “未知做法”.

- [x] **Step 4: Build record detail from snapshot presentation only**

On load:

```ts
const record = await getApp<OsheeepApp>().getRecord(recordId);
this.setData({
  record,
  dishes: record.dishes.map(toRecordDishPresentation),
});
```

For each dish, retain image/name/source and add:

- a text “自家菜谱” tag for household scope;
- method name plus cooking style when method exists;
- ordered numbered steps;
- ingredient name and prepared `amountLabel`;
- no method/ingredient containers when `showSnapshotDetails` is false.

Prefer one-column detailed-content cards over the current two-column image grid when snapshot details exist; legacy cards may remain compact. Use the approved warm-white/olive/orange system, not a new visual direction.

- [x] **Step 5: Run page GREEN and full automated verification**

```bash
npm test -- --runInBand tests/tonight-page.test.ts tests/record-detail-page.test.ts tests/menu-state.test.ts tests/record-detail.test.ts
npm test -- --runInBand
npm run typecheck
npm run lint
npm run format:check
git diff --check
```

Backend final verification in the sibling repository:

```bash
cd ../osheeep-server
mvn test
git diff --check
```

Expected: all commands exit 0. Record exact suite/test counts in the QA report and handoff; never copy stale counts from this plan.

- [x] **Step 6: Run native three-viewport visual/interaction QA and direction comparison**

Use the Product Design audit workflow on the implemented pages. In WeChat Developer Tools, keep one fixed fixture for each implemented page across 375, 390 and 430px, then capture all listed images. Compare the 390px implementation against the approved existing page direction. The available references use different data states, so the comparison is evidence for preserved visual hierarchy, tokens and layout direction only—not a same-state, pixel-level or exact-spacing claim. Record that limitation explicitly in the QA report.

Verify:

- discovery featured card and compact rows show the label without moving the add target off-screen;
- unified server order is preserved and no client resort occurs;
- 409 preserves explicit retry and performs no auto PUT;
- invalid recipe refreshes both recipe/menu state;
- tonight household context and `BOTH` source fit without clipping;
- record steps and ingredient amounts wrap, `适量` is visible, legacy rows show no empty sections;
- native `<button>` elements do not shrink or overflow;
- all primary targets are at least `88rpx`;
- Console Errors and Problems both finish at 0.

Have an independent review classify findings P0–P3. Fix every P0/P1/P2, rerun affected automation and replace obsolete captures before marking this step complete.

- [x] **Step 7: Update QA, handoff and measured plan state**

`household-recipe-menu-qa.md` records viewport, fixture, reference, capture, findings, fixes, retest and final Errors/Problems counts. `docs/HANDOFF.md` records:

- exact front/back commit SHAs;
- exact automated and guarded MySQL results;
- what the feature now does;
- remaining formal-launch blockers from the prior audit;
- explicit statement that V7 is not production-applied and the mini program is not newly uploaded, submitted or released.

Tick plan checkboxes only for steps with current evidence.

- [x] **Step 8: Commit page implementation and verified QA/handoff separately**

Implementation commit:

```bash
git add miniprogram/pages/tonight/index.ts miniprogram/pages/tonight/index.wxml \
  miniprogram/pages/tonight/index.wxss miniprogram/pages/record-detail/index.ts \
  miniprogram/pages/record-detail/index.wxml miniprogram/pages/record-detail/index.wxss \
  tests/tonight-page.test.ts tests/record-detail-page.test.ts
git commit -m "feat: show household recipe dinner details"
```

Evidence/docs commit:

```bash
git add docs/HANDOFF.md \
  docs/superpowers/plans/2026-07-21-household-recipes-discovery-menu.md \
  docs/design/qa/household-recipe-menu
git commit -m "docs: verify household recipe dinner flow"
```

- [x] **Step 9: Verify both repositories and report the continuation point**

```bash
git status -sb
git log -8 --oneline
git rev-list --left-right --count origin/main...main
cd ../osheeep-server
git status -sb
git log -8 --oneline
git rev-list --left-right --count origin/main...main
```

Expected: both worktrees clean. Local branches may be ahead until the user explicitly authorizes the implementation push. Do not infer production deployment, WeChat upload, review submission or release from clean Git state.

---

## Plan Self-Review Checklist

- [x] Every confirmed design requirement maps to at least one task and one test/QA assertion.
- [x] V7 is the only migration changed; V1–V6 remain byte-for-byte unchanged.
- [x] Discovery, menu and history use three distinct DTO shapes; list method summaries never contain steps.
- [x] Every list/complete aggregate load is batched and tests assert no N+1 behavior.
- [x] Cross-household, draft, archived, missing and damaged recipes fail without data leakage.
- [x] Menu rows persist server-resolved version/method and menu reads reject inconsistent selector identities.
- [x] Completion revalidates household/method/version before record insert and writes approved list-image URL.
- [x] Old record output is explicitly normalized and never backfills or re-queries current aggregates.
- [x] All frontend error, label, amount and empty-section copy is exact and covered.
- [x] All commands, file paths and commit boundaries are executable from the stated repository.
- [x] MySQL tests are guarded, isolated, sequential and leave the dedicated catalog at V7.
- [x] No step implies production Flyway, upload, submission or release.
