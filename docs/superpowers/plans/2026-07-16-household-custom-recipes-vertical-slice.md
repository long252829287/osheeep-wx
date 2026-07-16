# 家庭自定义菜谱首个竖切 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 交付“个人草稿 → 自动保存 → 食材 → 默认做法 → 已审核真实图片 → 内容安全发布 → 家庭菜谱列表双方可见”的第一个端到端竖切。

**Architecture:** `osheeep-server` 用 V6 把现有菜谱演进为带聚合版本的 `DRAFT/PUBLISHED/ARCHIVED` 模型，新增默认做法、步骤和可追溯图片资产；草稿写入按步骤整组替换，发布先在事务外检查微信内容安全，再在短事务内重新锁定相同版本并转换状态。`osheeep-wx` 增加家庭菜谱列表、五步编辑器、真实图片选择页和可单测的串行自动保存协调器；现有找菜与今晚菜单在本竖切保持兼容，不接入家庭菜谱。

**Tech Stack:** Java 21、Spring Boot 3.5.16、MyBatis-Plus 3.5.17、MySQL 8、Flyway、RestClient、JUnit 5、MockMvc；微信原生小程序、TypeScript 5.9、WXML、WXSS、Jest；Wikimedia Commons CC0 实拍资产、FFmpeg/cwebp 派生图。

## Global Constraints

- 两个仓库继续直接使用 `main`；每个任务只提交对应范围，不覆盖未知改动。
- 不修改已经提交的 V1–V5；数据库变化只新增 `V6__add_household_custom_recipes.sql`。
- 现有系统菜从 `ACTIVE` 迁移为 `PUBLISHED`，并同步修改所有读取与今晚菜单校验，不能让现有找菜闭环失效。
- 草稿只有创建者可见；发布后只对当前家庭双方可见。
- 草稿图片可空；发布必须绑定 `APPROVED` 图片资产。
- 首版不开放图片上传，不热链第三方，不生成菜品成品图。
- 菜谱食材数量可空并显示“适量”；单位和必需/可选状态不能为空。
- 持久化菜谱新行版本从 `1` 开始；每个成功写操作递增一次；409 后不自动重放。
- 菜谱与图片的 MySQL `DATETIME` 按 `Asia/Shanghai` 显式转换为 API `Instant`，不得依赖 JVM 或数据库默认时区。
- 自动保存去抖为 `800ms`，同一草稿写请求必须串行，页面隐藏或下一步前必须 `flush()`。
- 基本信息限制：名称 1–40 字、分类 1–16 字、口味 1–16 字、份量 1–20、预计耗时 1–1440 分钟。
- 默认做法限制：名称 1–40 字、烹饪方式 1–32 字、1–12 个步骤、每步发布时 1–160 字。
- 微信内容安全使用 `msgSecCheck` 2.0、`scene=3`；归一化后的 `content` 不得超过官方上限 2500 字；只有 `result.suggest=pass` 可以发布。
- 微信内容安全调用在数据库事务外；事务内必须重新锁定草稿并核对同一个 `expectedVersion` 后才发布。
- 生产内容安全未配置、超时、限流或返回非零错误码时失败关闭，返回 503 并保留草稿。
- UI 延续库存/找菜页的暖白、橄榄绿、橙色主动作和微信原生导航；主要触控目标至少 `88rpx`。
- 页面实现前必须使用 `product-design` skill 基于现有正式版参考图建立本功能参考图；不重新选择整体视觉方向。
- 每项生产代码先写失败测试并观察正确 RED，再做最小 GREEN；每个任务结束运行聚焦回归并提交。
- 本计划不执行生产部署、生产 Flyway、微信上传、体验版、提审或发布。

---

### Task 1: V6 聚合模型、真实图片资产与现有闭环兼容

**Files:**

- Create: `../osheeep-server/src/main/resources/db/migration/V6__add_household_custom_recipes.sql`
- Create: `../osheeep-server/src/main/java/com/osheeep/server/dinner/image/entity/DinnerImageAssetEntity.java`
- Create: `../osheeep-server/src/main/java/com/osheeep/server/dinner/image/mapper/DinnerImageAssetMapper.java`
- Create: `../osheeep-server/src/main/java/com/osheeep/server/dinner/recipe/entity/DinnerRecipeMethodEntity.java`
- Create: `../osheeep-server/src/main/java/com/osheeep/server/dinner/recipe/entity/DinnerRecipeMethodStepEntity.java`
- Create: `../osheeep-server/src/main/java/com/osheeep/server/dinner/recipe/mapper/DinnerRecipeMethodMapper.java`
- Create: `../osheeep-server/src/main/java/com/osheeep/server/dinner/recipe/mapper/DinnerRecipeMethodStepMapper.java`
- Modify: `../osheeep-server/src/main/java/com/osheeep/server/dinner/recipe/entity/DinnerRecipeEntity.java`
- Modify: `../osheeep-server/src/main/java/com/osheeep/server/dinner/recipe/mapper/DinnerRecipeMapper.java`
- Modify: `../osheeep-server/src/main/java/com/osheeep/server/dinner/recipe/DinnerRecipeService.java`
- Modify: `../osheeep-server/src/main/java/com/osheeep/server/dinner/menu/DinnerMenuService.java`
- Create: `../osheeep-server/docs/image-assets/tomato-with-egg/metadata.json`
- Create: `../osheeep-server/docs/image-assets/tomato-with-egg/original.jpg`
- Create: `../osheeep-server/src/main/resources/static/media/recipes/tomato-with-egg-list.webp`
- Create: `../osheeep-server/src/main/resources/static/media/recipes/tomato-with-egg-detail.webp`
- Create: `../osheeep-server/src/test/java/com/osheeep/server/dinner/recipe/DinnerCustomRecipePersistenceContractTest.java`
- Modify: `../osheeep-server/src/test/java/com/osheeep/server/dinner/recipe/DinnerRecipeServiceTest.java`
- Modify: `../osheeep-server/src/test/java/com/osheeep/server/dinner/menu/DinnerMenuServiceTest.java`

**Interfaces:**

- Produces: `DinnerRecipeMapper.selectByIdForUpdate(Long)`; `DinnerRecipeMethodMapper`; `DinnerRecipeMethodStepMapper`; `DinnerImageAssetMapper`.
- Produces statuses: `DRAFT`, `PUBLISHED`, `ARCHIVED`; aggregate version starts at `1`.
- Preserves: `GET /api/dinner/recipes` and tonight-menu validation for migrated system recipes.
- Seeds: one `APPROVED` CC0 asset with id selected by database auto-increment, object keys under `media/recipes/`.

- [ ] **Step 1: Write the failing persistence and legacy-compatibility contracts**

```java
class DinnerCustomRecipePersistenceContractTest {
    @Test
    void v6AddsVersionedRecipeAggregateMethodsStepsAndApprovedImages() throws Exception {
        String sql = Files.readString(Path.of(
                "src/main/resources/db/migration/V6__add_household_custom_recipes.sql"));

        assertThat(sql).contains("CREATE TABLE dinner_image_assets");
        assertThat(sql).contains("ADD COLUMN version BIGINT NOT NULL DEFAULT 1");
        assertThat(sql).contains("CREATE TABLE dinner_recipe_methods");
        assertThat(sql).contains("CREATE TABLE dinner_recipe_method_steps");
        assertThat(sql).contains("UPDATE dinner_recipes");
        assertThat(sql).contains("status = 'PUBLISHED'");
        assertThat(sql).contains("0c9df553e9cc5ad1ae7e879dc753436ac60a89b8bb62eae70f2d02f18261e544");
    }

    @Test
    void recipeMapperExposesAggregateLock() throws Exception {
        assertThat(DinnerRecipeMapper.class.getMethod("selectByIdForUpdate", Long.class))
                .isNotNull();
    }
}
```

Extend existing recipe/menu tests so their mocked system rows use `status=PUBLISHED`, and assert discovery and `saveSelections` still accept those rows.

- [ ] **Step 2: Run the focused backend tests and verify RED**

Run:

```bash
cd ../osheeep-server
mvn test -Dtest=DinnerCustomRecipePersistenceContractTest,DinnerRecipeServiceTest,DinnerMenuServiceTest
```

Expected: FAIL because V6, new entities/mappers, mapper lock and `PUBLISHED` compatibility do not exist.

- [ ] **Step 3: Acquire and verify the first real photo before adding database metadata**

Use the Wikimedia Commons source page `https://commons.wikimedia.org/wiki/File:Tomato_with_egg.jpg`. It identifies author `Kaap bij Sneeuw`, dimensions `1198×1091`, and license `CC0 1.0`.

```bash
cd ../osheeep-server
mkdir -p docs/image-assets/tomato-with-egg src/main/resources/static/media/recipes
curl -L -sS https://upload.wikimedia.org/wikipedia/commons/5/56/Tomato_with_egg.jpg -o docs/image-assets/tomato-with-egg/original.jpg
shasum -a 256 docs/image-assets/tomato-with-egg/original.jpg
ffmpeg -y -i docs/image-assets/tomato-with-egg/original.jpg -vf "scale=640:480:force_original_aspect_ratio=increase,crop=640:480" -c:v libwebp -quality 82 src/main/resources/static/media/recipes/tomato-with-egg-list.webp
ffmpeg -y -i docs/image-assets/tomato-with-egg/original.jpg -vf "scale=1120:840:force_original_aspect_ratio=increase,crop=1120:840" -c:v libwebp -quality 86 src/main/resources/static/media/recipes/tomato-with-egg-detail.webp
```

Expected original SHA-256 exactly:

```text
0c9df553e9cc5ad1ae7e879dc753436ac60a89b8bb62eae70f2d02f18261e544
```

Write `metadata.json` with exact evidence:

```json
{
  "provider": "WIKIMEDIA_COMMONS",
  "displayName": "番茄炒鸡蛋",
  "searchKeywords": "番茄 西红柿 鸡蛋 家常菜",
  "sourcePageUrl": "https://commons.wikimedia.org/wiki/File:Tomato_with_egg.jpg",
  "originalFileUrl": "https://upload.wikimedia.org/wikipedia/commons/5/56/Tomato_with_egg.jpg",
  "author": "Kaap bij Sneeuw",
  "licenseName": "CC0 1.0",
  "licenseUrl": "https://creativecommons.org/publicdomain/zero/1.0/",
  "acquiredOn": "2026-07-16",
  "sha256": "0c9df553e9cc5ad1ae7e879dc753436ac60a89b8bb62eae70f2d02f18261e544",
  "width": 1198,
  "height": 1091,
  "originalObjectKey": "internal/recipes/tomato-with-egg/original.jpg",
  "listObjectKey": "media/recipes/tomato-with-egg-list.webp",
  "detailObjectKey": "media/recipes/tomato-with-egg-detail.webp",
  "status": "APPROVED"
}
```

- [ ] **Step 4: Add the complete V6 migration**

Use this schema shape; keep all names exact because later tasks depend on them:

```sql
CREATE TABLE dinner_image_assets (
    id BIGINT NOT NULL AUTO_INCREMENT,
    provider VARCHAR(32) NOT NULL,
    display_name VARCHAR(100) NOT NULL,
    search_keywords VARCHAR(255) NOT NULL,
    source_page_url VARCHAR(512) NOT NULL,
    original_file_url VARCHAR(512) NOT NULL,
    author VARCHAR(120) NOT NULL,
    license_name VARCHAR(120) NOT NULL,
    license_url VARCHAR(512) NOT NULL,
    acquired_on DATE NOT NULL,
    sha256 CHAR(64) NOT NULL,
    original_width INT NOT NULL,
    original_height INT NOT NULL,
    original_object_key VARCHAR(255) NOT NULL,
    list_object_key VARCHAR(255) NOT NULL,
    detail_object_key VARCHAR(255) NOT NULL,
    status VARCHAR(16) NOT NULL DEFAULT 'PENDING',
    reviewed_at DATETIME(3) NULL,
    created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
    PRIMARY KEY (id),
    UNIQUE KEY uk_dinner_image_assets_sha256 (sha256),
    KEY idx_dinner_image_assets_status_id (status, id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

ALTER TABLE dinner_recipes
    MODIFY name VARCHAR(100) NULL,
    MODIFY category VARCHAR(32) NULL,
    MODIFY flavor VARCHAR(32) NULL,
    MODIFY estimated_minutes INT NULL,
    MODIFY status VARCHAR(16) NOT NULL DEFAULT 'DRAFT',
    ADD COLUMN servings INT NULL AFTER flavor,
    ADD COLUMN version BIGINT NOT NULL DEFAULT 1 AFTER status,
    ADD COLUMN image_asset_id BIGINT NULL AFTER image_path,
    ADD COLUMN last_modified_by BIGINT NULL AFTER creator_id,
    ADD COLUMN source_recipe_id BIGINT NULL AFTER last_modified_by,
    ADD COLUMN revision_of_recipe_id BIGINT NULL AFTER source_recipe_id,
    ADD COLUMN base_published_version BIGINT NULL AFTER revision_of_recipe_id,
    ADD COLUMN published_at DATETIME(3) NULL AFTER base_published_version,
    ADD COLUMN archived_at DATETIME(3) NULL AFTER published_at,
    ADD KEY idx_dinner_recipes_household_status (household_id, status, id),
    ADD KEY idx_dinner_recipes_creator_status (creator_id, status, id),
    ADD CONSTRAINT fk_dinner_recipes_image_asset FOREIGN KEY (image_asset_id) REFERENCES dinner_image_assets (id),
    ADD CONSTRAINT fk_dinner_recipes_last_modified_by FOREIGN KEY (last_modified_by) REFERENCES users (id),
    ADD CONSTRAINT fk_dinner_recipes_source FOREIGN KEY (source_recipe_id) REFERENCES dinner_recipes (id),
    ADD CONSTRAINT fk_dinner_recipes_revision FOREIGN KEY (revision_of_recipe_id) REFERENCES dinner_recipes (id);

CREATE TABLE dinner_recipe_methods (
    id BIGINT NOT NULL AUTO_INCREMENT,
    recipe_id BIGINT NOT NULL,
    name VARCHAR(64) NULL,
    cooking_style VARCHAR(32) NULL,
    estimated_minutes INT NULL,
    is_default TINYINT(1) NOT NULL DEFAULT 0,
    status VARCHAR(16) NOT NULL DEFAULT 'ACTIVE',
    sort_order INT NOT NULL DEFAULT 0,
    default_recipe_id BIGINT GENERATED ALWAYS AS (
        CASE WHEN is_default = 1 AND status = 'ACTIVE' THEN recipe_id ELSE NULL END
    ) STORED,
    created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
    PRIMARY KEY (id),
    UNIQUE KEY uk_dinner_recipe_default_method (default_recipe_id),
    KEY idx_dinner_recipe_methods_recipe (recipe_id, status, sort_order),
    CONSTRAINT fk_dinner_recipe_methods_recipe FOREIGN KEY (recipe_id) REFERENCES dinner_recipes (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE dinner_recipe_method_steps (
    id BIGINT NOT NULL AUTO_INCREMENT,
    method_id BIGINT NOT NULL,
    instruction VARCHAR(160) NOT NULL,
    sort_order INT NOT NULL,
    PRIMARY KEY (id),
    UNIQUE KEY uk_dinner_recipe_method_step_order (method_id, sort_order),
    CONSTRAINT fk_dinner_recipe_method_steps_method FOREIGN KEY (method_id) REFERENCES dinner_recipe_methods (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

UPDATE dinner_recipes
SET status = 'PUBLISHED',
    version = 1,
    published_at = created_at
WHERE scope = 'SYSTEM' AND status = 'ACTIVE';

INSERT INTO dinner_image_assets (
    provider, display_name, search_keywords,
    source_page_url, original_file_url, author, license_name, license_url,
    acquired_on, sha256, original_width, original_height, original_object_key,
    list_object_key, detail_object_key, status, reviewed_at
) VALUES (
    'WIKIMEDIA_COMMONS', '番茄炒鸡蛋', '番茄 西红柿 鸡蛋 家常菜',
    'https://commons.wikimedia.org/wiki/File:Tomato_with_egg.jpg',
    'https://upload.wikimedia.org/wikipedia/commons/5/56/Tomato_with_egg.jpg',
    'Kaap bij Sneeuw', 'CC0 1.0',
    'https://creativecommons.org/publicdomain/zero/1.0/',
    '2026-07-16',
    '0c9df553e9cc5ad1ae7e879dc753436ac60a89b8bb62eae70f2d02f18261e544',
    1198, 1091,
    'internal/recipes/tomato-with-egg/original.jpg',
    'media/recipes/tomato-with-egg-list.webp',
    'media/recipes/tomato-with-egg-detail.webp',
    'APPROVED', CURRENT_TIMESTAMP(3)
);
```

- [ ] **Step 5: Add entities, aggregate lock and `PUBLISHED` compatibility**

Expand `DinnerRecipeEntity` with exact Java properties matching the V6 columns. Add simple MyBatis-Plus entities for image assets, methods and steps. Add the lock method:

```java
@Select("SELECT * FROM dinner_recipes WHERE id = #{id} FOR UPDATE")
DinnerRecipeEntity selectByIdForUpdate(@Param("id") Long id);
```

Change existing discovery and menu validation predicates from:

```java
"SYSTEM".equals(recipe.getScope()) && "ACTIVE".equals(recipe.getStatus())
```

to:

```java
"SYSTEM".equals(recipe.getScope()) && "PUBLISHED".equals(recipe.getStatus())
```

and update the discovery query to `.eq(DinnerRecipeEntity::getStatus, "PUBLISHED")`.

- [ ] **Step 6: Run focused tests and static diff checks**

Run:

```bash
cd ../osheeep-server
mvn test -Dtest=DinnerCustomRecipePersistenceContractTest,DinnerRecipeServiceTest,DinnerMenuServiceTest
git diff --check
```

Expected: all focused tests PASS; `git diff --check` produces no output.

- [ ] **Step 7: Commit Task 1**

```bash
cd ../osheeep-server
git add src/main/resources/db/migration/V6__add_household_custom_recipes.sql src/main/java/com/osheeep/server/dinner/image src/main/java/com/osheeep/server/dinner/recipe src/main/java/com/osheeep/server/dinner/menu/DinnerMenuService.java src/test/java/com/osheeep/server/dinner/recipe src/test/java/com/osheeep/server/dinner/menu/DinnerMenuServiceTest.java docs/image-assets src/main/resources/static/media/recipes
git commit -m "feat: add custom recipe persistence model"
```

### Task 2: 个人草稿创建、家庭列表与聚合详情

**Files:**

- Create: `../osheeep-server/src/main/java/com/osheeep/server/dinner/recipe/DinnerRecipeAuthorizer.java`
- Create: `../osheeep-server/src/main/java/com/osheeep/server/dinner/recipe/DinnerRecipeQueryService.java`
- Create: `../osheeep-server/src/main/java/com/osheeep/server/dinner/recipe/DinnerRecipeDraftService.java`
- Create: `../osheeep-server/src/main/java/com/osheeep/server/dinner/recipe/DinnerFamilyRecipeController.java`
- Create: `../osheeep-server/src/main/java/com/osheeep/server/dinner/recipe/dto/FamilyRecipeTab.java`
- Create: `../osheeep-server/src/main/java/com/osheeep/server/dinner/recipe/dto/FamilyRecipeListItemResponse.java`
- Create: `../osheeep-server/src/main/java/com/osheeep/server/dinner/recipe/dto/RecipeDraftResponse.java`
- Create: `../osheeep-server/src/main/java/com/osheeep/server/dinner/recipe/dto/RecipeMethodResponse.java`
- Create: `../osheeep-server/src/main/java/com/osheeep/server/dinner/recipe/dto/RecipeMethodStepResponse.java`
- Create: `../osheeep-server/src/main/java/com/osheeep/server/dinner/image/dto/ImageAssetResponse.java`
- Create: `../osheeep-server/src/test/java/com/osheeep/server/dinner/recipe/DinnerRecipeDraftServiceTest.java`
- Create: `../osheeep-server/src/test/java/com/osheeep/server/dinner/recipe/DinnerRecipeQueryServiceTest.java`
- Create: `../osheeep-server/src/test/java/com/osheeep/server/dinner/recipe/DinnerFamilyRecipeControllerTest.java`

**Interfaces:**

- Produces: `RecipeDraftResponse DinnerRecipeDraftService.create(Long userId)`.
- Produces: `List<FamilyRecipeListItemResponse> DinnerRecipeQueryService.list(Long userId, FamilyRecipeTab tab)`.
- Produces: `RecipeDraftResponse DinnerRecipeQueryService.detail(Long userId, Long recipeId)`.
- HTTP: `POST /api/dinner/recipes/drafts`, `GET /api/dinner/recipes/family?tab={PUBLISHED|DRAFT|ARCHIVED}`, `GET /api/dinner/recipes/{id}`.

- [ ] **Step 1: Write failing service tests for visibility and ownership**

```java
@Test
void createsVersionOneDraftForTheCurrentHouseholdAndOwner() {
    when(memberMapper.selectOne(any())).thenReturn(member(7L, 70L));
    when(recipeMapper.insert(any())).thenAnswer(invocation -> {
        DinnerRecipeEntity row = invocation.getArgument(0);
        row.setId(101L);
        return 1;
    });

    RecipeDraftResponse result = service.create(7L);

    assertThat(result.id()).isEqualTo(101L);
    assertThat(result.status()).isEqualTo("DRAFT");
    assertThat(result.version()).isEqualTo(1L);
    verify(recipeMapper).insert(argThat(row ->
            "HOUSEHOLD".equals(row.getScope())
                    && "DRAFT".equals(row.getStatus())
                    && row.getHouseholdId().equals(70L)
                    && row.getCreatorId().equals(7L)
                    && row.getLastModifiedBy().equals(7L)));
}

@Test
void draftListContainsOnlyTheCurrentUsersDrafts() {
    when(memberMapper.selectOne(any())).thenReturn(member(7L, 70L));
    when(recipeMapper.selectList(any())).thenReturn(List.of(draft(101L, 7L)));

    assertThat(queryService.list(7L, FamilyRecipeTab.DRAFT))
            .extracting(FamilyRecipeListItemResponse::id)
            .containsExactly(101L);
}

@Test
void partnerCannotReadAnotherUsersDraft() {
    when(memberMapper.selectOne(any())).thenReturn(member(8L, 70L));
    when(recipeMapper.selectById(101L)).thenReturn(draft(101L, 7L));

    assertThatThrownBy(() -> queryService.detail(8L, 101L))
            .isInstanceOfSatisfying(BusinessException.class,
                    error -> assertThat(error.errorCode()).isEqualTo(ErrorCode.FORBIDDEN));
}
```

- [ ] **Step 2: Write failing controller contract tests**

Assert authentication and exact response fields:

```java
mockMvc.perform(authenticated(post("/api/dinner/recipes/drafts")))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.data.status").value("DRAFT"))
        .andExpect(jsonPath("$.data.version").value(1));

mockMvc.perform(authenticated(get("/api/dinner/recipes/family").queryParam("tab", "PUBLISHED")))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.data").isArray());
```

- [ ] **Step 3: Run the new tests and verify RED**

```bash
cd ../osheeep-server
mvn test -Dtest=DinnerRecipeDraftServiceTest,DinnerRecipeQueryServiceTest,DinnerFamilyRecipeControllerTest
```

Expected: FAIL because the services, DTOs and endpoints do not exist.

- [ ] **Step 4: Implement exact response contracts and authorization boundary**

```java
public enum FamilyRecipeTab { PUBLISHED, DRAFT, ARCHIVED }

public record FamilyRecipeListItemResponse(
        Long id,
        String status,
        String name,
        String imageUrl,
        String category,
        String flavor,
        Integer servings,
        Integer estimatedMinutes,
        Long version,
        Long creatorId,
        String creatorName,
        Long lastModifiedBy,
        String lastModifiedByName,
        String completedStep,
        Instant updatedAt
) { }

public record RecipeDraftResponse(
        Long id,
        String status,
        Long version,
        String name,
        String category,
        String flavor,
        Integer servings,
        Integer estimatedMinutes,
        List<RecipeIngredientResponse> ingredients,
        RecipeMethodResponse defaultMethod,
        ImageAssetResponse image,
        List<String> incompleteSteps,
        Instant updatedAt
) { }

public record ImageAssetResponse(
        Long id,
        String displayName,
        String listUrl,
        String detailUrl,
        String sourcePageUrl,
        String author,
        String licenseName,
        String licenseUrl,
        LocalDate acquiredOn,
        int width,
        int height
) { }
```

`DinnerRecipeAuthorizer` owns membership and visibility rules:

```java
public record RecipeAccess(Long userId, Long householdId) { }

public RecipeAccess requireMembership(Long userId);
public DinnerRecipeEntity requireOwnedDraft(Long userId, Long recipeId);
public DinnerRecipeEntity requireVisible(Long userId, Long recipeId);
```

`requireMembership` loads both the membership and `dinner_households` row and rejects a missing or non-`ACTIVE` household. `requireVisible` permits `PUBLISHED/ARCHIVED` only when `household_id` equals the current household; `DRAFT` only when `creator_id` equals the current user.

- [ ] **Step 5: Implement create, list, detail and controllers**

Create inserts exactly:

```java
DinnerRecipeEntity draft = new DinnerRecipeEntity();
draft.setScope("HOUSEHOLD");
draft.setHouseholdId(access.householdId());
draft.setCreatorId(userId);
draft.setLastModifiedBy(userId);
draft.setStatus("DRAFT");
draft.setVersion(1L);
recipeMapper.insert(draft);
```

List predicates are exact:

- `DRAFT`: `creator_id=userId AND status='DRAFT'`.
- `PUBLISHED`: `household_id=currentHousehold AND scope='HOUSEHOLD' AND status='PUBLISHED'`.
- `ARCHIVED`: `household_id=currentHousehold AND scope='HOUSEHOLD' AND status='ARCHIVED'`.

Order lists by `updated_at DESC, id DESC`. Batch-load `creator_id` and `last_modified_by` through the existing `UserMapper`; return `display_name`, then `username`, then “家庭成员” as the fallback. Convert `DATETIME` with `ZoneId.of("Asia/Shanghai")`. Detail batches ingredients, default method/steps and image metadata without issuing one query per row.

- [ ] **Step 6: Run focused tests**

```bash
cd ../osheeep-server
mvn test -Dtest=DinnerRecipeDraftServiceTest,DinnerRecipeQueryServiceTest,DinnerFamilyRecipeControllerTest,DinnerRecipeControllerTest
git diff --check
```

Expected: PASS; existing discovery controller remains green.

- [ ] **Step 7: Commit Task 2**

```bash
cd ../osheeep-server
git add src/main/java/com/osheeep/server/dinner/recipe src/test/java/com/osheeep/server/dinner/recipe
git commit -m "feat: create and query personal recipe drafts"
```

### Task 3: 分步骤草稿保存、版本冲突与结构化发布校验

**Files:**

- Create: `../osheeep-server/src/main/java/com/osheeep/server/dinner/recipe/dto/UpdateRecipeBasicInfoRequest.java`
- Create: `../osheeep-server/src/main/java/com/osheeep/server/dinner/recipe/dto/ReplaceRecipeIngredientsRequest.java`
- Create: `../osheeep-server/src/main/java/com/osheeep/server/dinner/recipe/dto/RecipeIngredientInput.java`
- Create: `../osheeep-server/src/main/java/com/osheeep/server/dinner/recipe/dto/UpdateDefaultMethodRequest.java`
- Create: `../osheeep-server/src/main/java/com/osheeep/server/dinner/recipe/dto/RecipeMethodStepInput.java`
- Create: `../osheeep-server/src/main/java/com/osheeep/server/dinner/recipe/dto/RecipeValidationIssue.java`
- Create: `../osheeep-server/src/main/java/com/osheeep/server/dinner/recipe/RecipeValidationException.java`
- Create: `../osheeep-server/src/main/java/com/osheeep/server/dinner/recipe/RecipeDraftValidator.java`
- Create: `../osheeep-server/src/main/java/com/osheeep/server/dinner/recipe/RecipePublishSnapshot.java`
- Modify: `../osheeep-server/src/main/java/com/osheeep/server/dinner/recipe/DinnerRecipeDraftService.java`
- Modify: `../osheeep-server/src/main/java/com/osheeep/server/dinner/recipe/DinnerFamilyRecipeController.java`
- Modify: `../osheeep-server/src/main/java/com/osheeep/server/common/error/ErrorCode.java`
- Modify: `../osheeep-server/src/main/java/com/osheeep/server/common/api/ApiResponse.java`
- Modify: `../osheeep-server/src/main/java/com/osheeep/server/common/error/GlobalExceptionHandler.java`
- Modify: `../osheeep-server/src/test/java/com/osheeep/server/dinner/recipe/DinnerRecipeDraftServiceTest.java`
- Create: `../osheeep-server/src/test/java/com/osheeep/server/dinner/recipe/RecipeDraftValidatorTest.java`
- Modify: `../osheeep-server/src/test/java/com/osheeep/server/dinner/recipe/DinnerFamilyRecipeControllerTest.java`
- Modify: `../osheeep-server/src/test/java/com/osheeep/server/common/error/GlobalExceptionHandlerTest.java`

**Interfaces:**

- Produces draft writes: `updateBasicInfo`, `replaceIngredients`, `updateDefaultMethod`; each returns `RecipeDraftResponse` with incremented version.
- Produces error codes: `DINNER_RECIPE_NOT_FOUND`, `DINNER_RECIPE_VERSION_CONFLICT`, `DINNER_RECIPE_VALIDATION_FAILED`.
- Produces `ApiResponse.error(ErrorCode, String, T details)` for structured validation issues.

- [ ] **Step 1: Write failing versioned-write tests**

```java
@Test
void basicInfoSaveLocksExpectedVersionAndIncrementsOnce() {
    DinnerRecipeEntity draft = draft(101L, 7L, 70L, 3L);
    when(recipeMapper.selectByIdForUpdate(101L)).thenReturn(draft);

    RecipeDraftResponse saved = service.updateBasicInfo(
            7L, 101L,
            new UpdateRecipeBasicInfoRequest(3L, "番茄炒蛋", "家常菜", "酸甜", 2, 15));

    assertThat(saved.version()).isEqualTo(4L);
    verify(recipeMapper).updateById(argThat(row ->
            row.getVersion() == 4L
                    && row.getLastModifiedBy().equals(7L)
                    && row.getName().equals("番茄炒蛋")));
}

@Test
void staleVersionNeverReplacesIngredients() {
    when(recipeMapper.selectByIdForUpdate(101L)).thenReturn(draft(101L, 7L, 70L, 4L));

    assertThatThrownBy(() -> service.replaceIngredients(
            7L, 101L,
            new ReplaceRecipeIngredientsRequest(3L, List.of(
                    new RecipeIngredientInput(1L, null, "克", true)))))
            .isInstanceOfSatisfying(BusinessException.class,
                    error -> assertThat(error.errorCode())
                            .isEqualTo(ErrorCode.DINNER_RECIPE_VERSION_CONFLICT));
    verifyNoInteractions(recipeIngredientMapper);
}

@Test
void quantityMayBeNullButUnitAndVisibleIngredientAreRequired() {
    // Stub ingredient 1 as ACTIVE/SYSTEM and save quantity=null.
    RecipeDraftResponse saved = service.replaceIngredients(
            7L, 101L,
            new ReplaceRecipeIngredientsRequest(1L, List.of(
                    new RecipeIngredientInput(1L, null, "克", true))));

    assertThat(saved.ingredients()).singleElement()
            .satisfies(item -> assertThat(item.quantity()).isNull());
}
```

- [ ] **Step 2: Write failing publish-completeness validator tests**

```java
@Test
void reportsStableStepAndFieldIssuesForIncompleteDraft() {
    List<RecipeValidationIssue> issues = validator.validate(snapshot(
            "", null, null, null, null, List.of(), null, null));

    assertThat(issues).extracting(
            RecipeValidationIssue::step,
            RecipeValidationIssue::field)
            .containsExactly(
                    tuple("BASIC", "name"),
                    tuple("BASIC", "category"),
                    tuple("BASIC", "flavor"),
                    tuple("BASIC", "servings"),
                    tuple("BASIC", "estimatedMinutes"),
                    tuple("INGREDIENTS", "ingredients"),
                    tuple("METHOD", "defaultMethod"),
                    tuple("IMAGE", "imageAssetId"));
}

@Test
void rejectsBlankStepsAndMoreThanTwelveSteps() {
    assertThat(validator.validate(snapshotWithSteps(List.of(" "))))
            .extracting(RecipeValidationIssue::field)
            .contains("steps[0]");
}
```

- [ ] **Step 3: Run tests and verify RED**

```bash
cd ../osheeep-server
mvn test -Dtest=DinnerRecipeDraftServiceTest,RecipeDraftValidatorTest,DinnerFamilyRecipeControllerTest,GlobalExceptionHandlerTest
```

Expected: FAIL because requests, writes, validator and structured error mapping do not exist.

- [ ] **Step 4: Define requests that allow incomplete drafts but enforce safe maxima**

```java
public record UpdateRecipeBasicInfoRequest(
        @Min(1) long version,
        @Size(max = 40) String name,
        @Size(max = 16) String category,
        @Size(max = 16) String flavor,
        @Min(1) @Max(20) Integer servings,
        @Min(1) @Max(1440) Integer estimatedMinutes
) { }

public record RecipeIngredientInput(
        @NotNull Long ingredientId,
        @DecimalMin("0.000") @Digits(integer = 9, fraction = 3) BigDecimal quantity,
        @NotBlank @Size(max = 16) String unit,
        boolean required
) { }

public record ReplaceRecipeIngredientsRequest(
        @Min(1) long version,
        @NotNull @Size(max = 50) @Valid List<RecipeIngredientInput> ingredients
) { }

public record RecipeMethodStepInput(@Size(max = 160) String instruction) { }

public record UpdateDefaultMethodRequest(
        @Min(1) long version,
        @Size(max = 40) String name,
        @Size(max = 32) String cookingStyle,
        @NotNull @Size(max = 12) @Valid List<RecipeMethodStepInput> steps
) { }

public record RecipePublishSnapshot(
        Long recipeId,
        Long creatorId,
        Long householdId,
        long version,
        String name,
        String category,
        String flavor,
        Integer servings,
        Integer estimatedMinutes,
        Long imageAssetId,
        List<RecipeIngredientResponse> ingredients,
        RecipeMethodResponse defaultMethod,
        String moderationText
) { }

```

Normalize blank basic/method strings to `null`; keep blank step strings so preview can identify the exact incomplete step.

- [ ] **Step 5: Implement one lock/version/owner path for all draft writes**

Every write starts with the same helper:

```java
private DinnerRecipeEntity lockOwnedDraft(Long userId, Long recipeId, long expectedVersion) {
    DinnerRecipeEntity draft = recipeMapper.selectByIdForUpdate(recipeId);
    if (draft == null) throw new BusinessException(ErrorCode.DINNER_RECIPE_NOT_FOUND);
    if (!"DRAFT".equals(draft.getStatus()) || !userId.equals(draft.getCreatorId())) {
        throw new BusinessException(ErrorCode.FORBIDDEN);
    }
    if (!Objects.equals(draft.getVersion(), expectedVersion)) {
        throw new BusinessException(ErrorCode.DINNER_RECIPE_VERSION_CONFLICT);
    }
    return draft;
}

private void advance(DinnerRecipeEntity draft, Long userId) {
    draft.setVersion(draft.getVersion() + 1L);
    draft.setLastModifiedBy(userId);
    recipeMapper.updateById(draft);
}
```

Ingredient replacement validates every ingredient against the current household-visible catalog, rejects duplicates before deleting old rows, then deletes and reinserts by request order. Default-method replacement upserts one `is_default=1` method, copies `dinner_recipes.estimated_minutes` into the method row, deletes its old steps and inserts request steps with zero-based `sort_order`. The basic-info step is the sole editable source of estimated time in this slice; a later basic-info save also synchronizes an existing default-method row.

- [ ] **Step 6: Add structured 422 validation mapping**

Add exact errors:

```java
DINNER_RECIPE_NOT_FOUND(HttpStatus.NOT_FOUND, "Dinner recipe was not found"),
DINNER_RECIPE_VERSION_CONFLICT(HttpStatus.CONFLICT, "Dinner recipe was updated elsewhere"),
DINNER_RECIPE_VALIDATION_FAILED(HttpStatus.UNPROCESSABLE_ENTITY, "Dinner recipe is incomplete"),
```

Add an overload:

```java
public static <T> ApiResponse<T> error(ErrorCode code, String message, T details) {
    return new ApiResponse<>(false, code.name(), message, details, RequestIdFilter.currentRequestId());
}
```

Map `RecipeValidationException` to HTTP 422 with `data` equal to `List<RecipeValidationIssue>`.

- [ ] **Step 7: Add exact controller routes**

```java
@PutMapping("/{id}/basic-info")
@PutMapping("/{id}/ingredients")
@PutMapping("/{id}/default-method")
```

Each route passes `currentUser.id()`, path id and validated body to the draft service and returns the latest full `RecipeDraftResponse`.

- [ ] **Step 8: Run focused tests and commit**

```bash
cd ../osheeep-server
mvn test -Dtest=DinnerRecipeDraftServiceTest,RecipeDraftValidatorTest,DinnerFamilyRecipeControllerTest,GlobalExceptionHandlerTest
git diff --check
git add src/main/java/com/osheeep/server/common src/main/java/com/osheeep/server/dinner/recipe src/test/java/com/osheeep/server/common src/test/java/com/osheeep/server/dinner/recipe
git commit -m "feat: autosave versioned recipe drafts"
```

Expected: all named tests PASS and the commit contains no image-query or publication implementation.

### Task 4: 已审核图片查询与自有静态派生图

**Files:**

- Create: `../osheeep-server/src/main/java/com/osheeep/server/dinner/image/DinnerImageProperties.java`
- Create: `../osheeep-server/src/main/java/com/osheeep/server/dinner/image/DinnerImageConfig.java`
- Create: `../osheeep-server/src/main/java/com/osheeep/server/dinner/image/DinnerImageAssetService.java`
- Create: `../osheeep-server/src/main/java/com/osheeep/server/dinner/image/DinnerImageAssetController.java`
- Create: `../osheeep-server/src/main/java/com/osheeep/server/dinner/recipe/dto/SelectRecipeImageRequest.java`
- Modify: `../osheeep-server/src/main/java/com/osheeep/server/dinner/recipe/DinnerRecipeDraftService.java`
- Modify: `../osheeep-server/src/main/java/com/osheeep/server/dinner/recipe/DinnerRecipeQueryService.java`
- Modify: `../osheeep-server/src/main/java/com/osheeep/server/dinner/recipe/DinnerFamilyRecipeController.java`
- Modify: `../osheeep-server/src/main/java/com/osheeep/server/common/error/ErrorCode.java`
- Modify: `../osheeep-server/src/main/java/com/osheeep/server/common/security/SecurityConfig.java`
- Modify: `../osheeep-server/src/main/resources/application-local.yml`
- Modify: `../osheeep-server/src/main/resources/application-prod.yml`
- Modify: `../osheeep-server/src/main/resources/application-test.yml`
- Modify: `../osheeep-server/.env.example`
- Create: `../osheeep-server/src/test/java/com/osheeep/server/dinner/image/DinnerImageAssetServiceTest.java`
- Create: `../osheeep-server/src/test/java/com/osheeep/server/dinner/image/DinnerImageAssetControllerTest.java`
- Create: `../osheeep-server/src/test/java/com/osheeep/server/dinner/image/DinnerImageStaticResourceTest.java`

**Interfaces:**

- Produces: `List<ImageAssetResponse> search(String query)`.
- Produces: `RecipeDraftResponse selectImage(Long userId, Long recipeId, SelectRecipeImageRequest request)`.
- HTTP: authenticated `GET /api/dinner/image-assets?query={text}`; public read-only `GET /media/recipes/{fileName}`.
- URL rule: trim trailing slash from configured base and append `/` + object key.

- [ ] **Step 1: Write failing approved-only and public-resource tests**

```java
@Test
void searchReturnsOnlyApprovedAssetsAndStableSelfHostedUrls() {
    when(mapper.selectList(any())).thenReturn(List.of(asset(1L, "APPROVED")));

    assertThat(service.search("番茄")).singleElement().satisfies(asset -> {
        assertThat(asset.listUrl()).isEqualTo(
                "https://assets.test/media/recipes/tomato-with-egg-list.webp");
        assertThat(asset.sourcePageUrl()).contains("commons.wikimedia.org/wiki/File:Tomato_with_egg.jpg");
        assertThat(asset.licenseName()).isEqualTo("CC0 1.0");
    });
    verify(mapper).selectList(argThat(wrapper -> wrapper.getSqlSegment().contains("status")));
}

@Test
void derivativeCanBeReadWithoutAuthentication() throws Exception {
    mockMvc.perform(get("/media/recipes/tomato-with-egg-list.webp"))
            .andExpect(status().isOk())
            .andExpect(header().string("Content-Type", containsString("image/webp")));
}

@Test
void draftCanSelectApprovedImageButRejectsDisabledImage() {
    when(recipeMapper.selectByIdForUpdate(101L)).thenReturn(draft(101L, 7L, 70L, 3L));
    when(imageMapper.selectById(9L)).thenReturn(asset(9L, "APPROVED"));

    RecipeDraftResponse saved = draftService.selectImage(
            7L, 101L, new SelectRecipeImageRequest(3L, 9L));

    assertThat(saved.version()).isEqualTo(4L);
    assertThat(saved.image().id()).isEqualTo(9L);
}
```

- [ ] **Step 2: Run tests and verify RED**

```bash
cd ../osheeep-server
mvn test -Dtest=DinnerImageAssetServiceTest,DinnerImageAssetControllerTest,DinnerImageStaticResourceTest,DinnerRecipeDraftServiceTest
```

Expected: FAIL because the query service, property and security permit rule do not exist.

- [ ] **Step 3: Implement image URL configuration and response**

```java
@ConfigurationProperties(prefix = "osheeep.dinner.images")
public record DinnerImageProperties(String publicBaseUrl) { }

public record ImageAssetResponse(
        Long id,
        String displayName,
        String listUrl,
        String detailUrl,
        String sourcePageUrl,
        String author,
        String licenseName,
        String licenseUrl,
        LocalDate acquiredOn,
        int width,
        int height
) { }
```

Set profiles exactly:

```yaml
osheeep:
  dinner:
    images:
      public-base-url: ${OSHEEEP_IMAGE_PUBLIC_BASE_URL:http://127.0.0.1:8080}
```

Production default is `https://www.osheeep.com`; test is `https://assets.test`. Add `OSHEEEP_IMAGE_PUBLIC_BASE_URL=http://127.0.0.1:8080` to `.env.example`.

- [ ] **Step 4: Implement approved-only search and static permit rule**

Search `status='APPROVED'`; when query is nonblank, add a grouped `LIKE` predicate over `display_name` and `search_keywords`. Never query or proxy the third-party URL. Add before the authenticated API matcher:

```java
.requestMatchers(HttpMethod.GET, "/media/recipes/**").permitAll()
```

Add the image write request and route:

```java
public record SelectRecipeImageRequest(@Min(1) long version, Long imageAssetId) { }

@PutMapping("/{id}/image")
public ApiResponse<RecipeDraftResponse> selectImage(
        @AuthenticationPrincipal CurrentUser currentUser,
        @PathVariable Long id,
        @Valid @RequestBody SelectRecipeImageRequest request
) {
    return ApiResponse.ok(draftService.selectImage(currentUser.id(), id, request));
}
```

`selectImage` uses the same draft lock/version/advance helpers from Task 3. `null` clears the association; non-null ids must be `APPROVED`. Add:

```java
DINNER_RECIPE_IMAGE_INVALID(
        HttpStatus.UNPROCESSABLE_ENTITY, "Dinner recipe image is unavailable"),
```

Update query/draft response mapping to resolve the selected image through `DinnerImageAssetService`; it must never expose original object keys or original third-party file URLs.

- [ ] **Step 5: Run focused tests and commit**

```bash
cd ../osheeep-server
mvn test -Dtest=DinnerImageAssetServiceTest,DinnerImageAssetControllerTest,DinnerImageStaticResourceTest,DinnerRecipeDraftServiceTest
git diff --check
git add src/main/java/com/osheeep/server/dinner/image src/main/java/com/osheeep/server/dinner/recipe src/main/java/com/osheeep/server/common/error/ErrorCode.java src/main/java/com/osheeep/server/common/security/SecurityConfig.java src/main/resources/application-local.yml src/main/resources/application-prod.yml src/main/resources/application-test.yml .env.example src/test/java/com/osheeep/server/dinner/image src/test/java/com/osheeep/server/dinner/recipe
git commit -m "feat: serve approved recipe images"
```

### Task 5: 微信 access token 与菜谱文本内容安全网关

**Files:**

- Create: `../osheeep-server/src/main/java/com/osheeep/server/auth/wechat/WechatAccessTokenProvider.java`
- Create: `../osheeep-server/src/main/java/com/osheeep/server/auth/wechat/WechatAccessTokenClient.java`
- Create: `../osheeep-server/src/main/java/com/osheeep/server/dinner/recipe/moderation/RecipeTextSafetyGateway.java`
- Create: `../osheeep-server/src/main/java/com/osheeep/server/dinner/recipe/moderation/RecipeTextSafetyResult.java`
- Create: `../osheeep-server/src/main/java/com/osheeep/server/dinner/recipe/moderation/RecipeModerationTextBuilder.java`
- Create: `../osheeep-server/src/main/java/com/osheeep/server/dinner/recipe/moderation/WechatRecipeTextSafetyClient.java`
- Modify: `../osheeep-server/src/main/java/com/osheeep/server/common/error/ErrorCode.java`
- Create: `../osheeep-server/src/test/java/com/osheeep/server/auth/wechat/WechatAccessTokenClientTest.java`
- Create: `../osheeep-server/src/test/java/com/osheeep/server/dinner/recipe/moderation/RecipeModerationTextBuilderTest.java`
- Create: `../osheeep-server/src/test/java/com/osheeep/server/dinner/recipe/moderation/WechatRecipeTextSafetyClientTest.java`

**Interfaces:**

- Produces: `String WechatAccessTokenProvider.currentToken()` and `void invalidate(String token)`.
- Produces: `RecipeTextSafetyResult check(String openid, String title, String content)`.
- `RecipeTextSafetyResult`: `PASS` or `REJECT`; transport/platform faults throw `DINNER_RECIPE_MODERATION_UNAVAILABLE`.

- [ ] **Step 1: Write failing token-cache tests**

```java
@Test
void cachesTokenUntilFiveMinutesBeforeWechatExpiry() {
    server.expect(once(), requestTo("https://api.weixin.qq.com/cgi-bin/token"
                    + "?grant_type=client_credential&appid=app-id&secret=app-secret"))
            .andRespond(withSuccess(
                    "{\"access_token\":\"token-1\",\"expires_in\":7200}",
                    MediaType.APPLICATION_JSON));

    assertThat(client.currentToken()).isEqualTo("token-1");
    assertThat(client.currentToken()).isEqualTo("token-1");
    server.verify();
}

@Test
void tokenFailureDoesNotExposeWechatBodyOrSecret(CapturedOutput output) {
    server.expect(anything()).andRespond(withSuccess(
            "{\"errcode\":40013,\"errmsg\":\"invalid appid secret-value\"}",
            MediaType.APPLICATION_JSON));

    assertThatThrownBy(client::currentToken)
            .isInstanceOfSatisfying(BusinessException.class,
                    error -> assertThat(error.errorCode())
                            .isEqualTo(ErrorCode.DINNER_RECIPE_MODERATION_UNAVAILABLE));
    assertThat(output).doesNotContain("secret-value");
}
```

- [ ] **Step 2: Write failing moderation request/response tests**

```java
@Test
void sendsVersionTwoForumCheckAndAcceptsOnlyPass() {
    server.expect(requestTo("https://api.weixin.qq.com/wxa/msg_sec_check?access_token=token-1"))
            .andExpect(method(HttpMethod.POST))
            .andExpect(content().json("""
                    {"openid":"openid-7","scene":3,"version":2,
                     "title":"番茄炒蛋","content":"口味：酸甜\\n做法：家常炒\\n1. 切番茄"}
                    """))
            .andRespond(withSuccess(
                    "{\"errcode\":0,\"result\":{\"suggest\":\"pass\",\"label\":100},\"trace_id\":\"trace-1\"}",
                    MediaType.APPLICATION_JSON));

    assertThat(client.check("openid-7", "番茄炒蛋", content))
            .isEqualTo(RecipeTextSafetyResult.PASS);
}

@Test
void reviewAndRiskyAreRejectedWithoutReturningPlatformDetails() {
    server.expect(requestTo(
                    "https://api.weixin.qq.com/wxa/msg_sec_check?access_token=token-1"))
            .andRespond(withSuccess(
                    "{\"errcode\":0,\"result\":{\"suggest\":\"review\",\"label\":21000}}",
                    MediaType.APPLICATION_JSON));
    assertThat(client.check("openid-7", "菜名", "内容"))
            .isEqualTo(RecipeTextSafetyResult.REJECT);

    server.expect(requestTo(
                    "https://api.weixin.qq.com/wxa/msg_sec_check?access_token=token-1"))
            .andRespond(withSuccess(
                    "{\"errcode\":0,\"result\":{\"suggest\":\"risky\",\"label\":20006}}",
                    MediaType.APPLICATION_JSON));
    assertThat(client.check("openid-7", "菜名", "内容"))
            .isEqualTo(RecipeTextSafetyResult.REJECT);
    server.verify();
}

@Test
void invalidTokenIsInvalidatedAndRetriedExactlyOnce() {
    when(tokenProvider.currentToken()).thenReturn("stale-token", "fresh-token");
    server.expect(requestTo(
                    "https://api.weixin.qq.com/wxa/msg_sec_check?access_token=stale-token"))
            .andRespond(withSuccess(
                    "{\"errcode\":40001,\"errmsg\":\"invalid credential\"}",
                    MediaType.APPLICATION_JSON));
    server.expect(requestTo(
                    "https://api.weixin.qq.com/wxa/msg_sec_check?access_token=fresh-token"))
            .andRespond(withSuccess(
                    "{\"errcode\":0,\"result\":{\"suggest\":\"pass\",\"label\":100}}",
                    MediaType.APPLICATION_JSON));

    assertThat(client.check("openid-7", "菜名", "内容"))
            .isEqualTo(RecipeTextSafetyResult.PASS);
    verify(tokenProvider).invalidate("stale-token");
    server.verify();
}

@Test
void transportFailureMapsToUnavailable() {
    server.expect(requestTo(
                    "https://api.weixin.qq.com/wxa/msg_sec_check?access_token=token-1"))
            .andRespond(withServerError());

    assertThatThrownBy(() -> client.check("openid-7", "菜名", "内容"))
            .isInstanceOfSatisfying(BusinessException.class,
                    error -> assertThat(error.errorCode())
                            .isEqualTo(ErrorCode.DINNER_RECIPE_MODERATION_UNAVAILABLE));
    server.verify();
}
```

- [ ] **Step 3: Write failing normalized-text limit tests**

```java
@Test
void buildsStableTextInUserVisibleOrder() {
    String text = builder.build(snapshotWithSteps(List.of("切番茄", "炒鸡蛋")));
    assertThat(text).isEqualTo("口味：酸甜\n做法：家常炒\n烹饪方式：炒\n1. 切番茄\n2. 炒鸡蛋");
}

@Test
void refusesContentBeyondWechatTwoThousandFiveHundredCharacterLimit() {
    assertThatThrownBy(() -> builder.requireWithinLimit("菜".repeat(2501)))
            .isInstanceOf(RecipeValidationException.class);
}
```

- [ ] **Step 4: Run tests and verify RED**

```bash
cd ../osheeep-server
mvn test -Dtest=WechatAccessTokenClientTest,RecipeModerationTextBuilderTest,WechatRecipeTextSafetyClientTest
```

Expected: FAIL because token and moderation clients do not exist.

- [ ] **Step 5: Implement token cache and fail-closed error mapping**

Cache record:

```java
private record CachedToken(String value, Instant refreshAt) { }
```

Synchronize only the refresh path, set `refreshAt = now + max(60, expiresIn - 300) seconds`, never log token, secret, response body or inspected content. Add errors:

```java
DINNER_RECIPE_CONTENT_REJECTED(
        HttpStatus.UNPROCESSABLE_ENTITY, "Dinner recipe content was rejected"),
DINNER_RECIPE_MODERATION_UNAVAILABLE(
        HttpStatus.SERVICE_UNAVAILABLE, "Dinner recipe moderation is temporarily unavailable"),
```

- [ ] **Step 6: Implement official `msgSecCheck` 2.0 contract**

Follow the official server API exactly:

```text
POST https://api.weixin.qq.com/wxa/msg_sec_check?access_token=ACCESS_TOKEN
{"openid":"OPENID","scene":3,"version":2,"title":"RECIPE_TITLE","content":"NORMALIZED_CONTENT"}
```

Official reference: `https://developers.weixin.qq.com/miniprogram/dev/server/API/sec-center/sec-check/api_msgseccheck.html`.

Only `errcode=0` and `result.suggest=pass` returns `PASS`. `review` and `risky` return `REJECT`. On `errcode=40001`, invalidate that token and retry the check once; all other nonzero codes and the second 40001 map to unavailable.

- [ ] **Step 7: Run tests and commit**

```bash
cd ../osheeep-server
mvn test -Dtest=WechatAccessTokenClientTest,RecipeModerationTextBuilderTest,WechatRecipeTextSafetyClientTest,WechatApiClientTest
git diff --check
git add src/main/java/com/osheeep/server/auth/wechat src/main/java/com/osheeep/server/dinner/recipe/moderation src/main/java/com/osheeep/server/common/error/ErrorCode.java src/test/java/com/osheeep/server/auth/wechat src/test/java/com/osheeep/server/dinner/recipe/moderation
git commit -m "feat: check recipe text with WeChat"
```

### Task 6: 首次发布的事务外审核与事务内原子转换

**Files:**

- Create: `../osheeep-server/src/main/java/com/osheeep/server/dinner/recipe/DinnerRecipePublicationService.java`
- Create: `../osheeep-server/src/main/java/com/osheeep/server/dinner/recipe/DinnerRecipePublishSnapshotLoader.java`
- Create: `../osheeep-server/src/main/java/com/osheeep/server/dinner/recipe/DinnerRecipePublishTransaction.java`
- Create: `../osheeep-server/src/main/java/com/osheeep/server/dinner/recipe/dto/PublishRecipeRequest.java`
- Modify: `../osheeep-server/src/main/java/com/osheeep/server/dinner/recipe/DinnerFamilyRecipeController.java`
- Create: `../osheeep-server/src/test/java/com/osheeep/server/dinner/recipe/DinnerRecipePublicationServiceTest.java`
- Create: `../osheeep-server/src/test/java/com/osheeep/server/dinner/recipe/DinnerRecipePublishTransactionTest.java`
- Modify: `../osheeep-server/src/test/java/com/osheeep/server/dinner/recipe/DinnerFamilyRecipeControllerTest.java`

**Interfaces:**

- Produces: `RecipeDraftResponse publish(Long userId, Long recipeId, long expectedVersion)`.
- Produces: `RecipePublishSnapshot loadForModeration(Long userId, Long recipeId, long expectedVersion)`.
- HTTP: `POST /api/dinner/recipes/{id}/publish` with `{ "version": 7 }`.
- Invariant: no database transaction remains open during `msgSecCheck`.

- [ ] **Step 1: Write failing orchestration tests proving call order**

```java
@Test
void checksTextBeforeEnteringPublishTransaction() {
    RecipePublishSnapshot snapshot = completeSnapshot(101L, 7L, 70L, 4L);
    when(snapshotLoader.loadForModeration(7L, 101L, 4L)).thenReturn(snapshot);
    when(identityMapper.selectOne(any())).thenReturn(identity(7L, "openid-7"));
    when(gateway.check("openid-7", snapshot.name(), snapshot.moderationText()))
            .thenReturn(RecipeTextSafetyResult.PASS);
    when(transaction.publishChecked(7L, 101L, 4L)).thenReturn(publishedResponse());

    RecipeDraftResponse result = service.publish(7L, 101L, 4L);

    assertThat(result.status()).isEqualTo("PUBLISHED");
    InOrder order = inOrder(snapshotLoader, gateway, transaction);
    order.verify(snapshotLoader).loadForModeration(7L, 101L, 4L);
    order.verify(gateway).check("openid-7", snapshot.name(), snapshot.moderationText());
    order.verify(transaction).publishChecked(7L, 101L, 4L);
}

@Test
void rejectedContentNeverStartsPublishTransaction() {
    when(gateway.check(any(), any(), any())).thenReturn(RecipeTextSafetyResult.REJECT);

    assertThatThrownBy(() -> service.publish(7L, 101L, 4L))
            .isInstanceOfSatisfying(BusinessException.class,
                    error -> assertThat(error.errorCode())
                            .isEqualTo(ErrorCode.DINNER_RECIPE_CONTENT_REJECTED));
    verifyNoInteractions(transaction);
}
```

- [ ] **Step 2: Write failing transaction tests for revalidation and atomic state**

```java
@Test
void checkedVersionIsLockedRevalidatedAndPublished() {
    DinnerRecipeEntity locked = completeDraft(101L, 7L, 70L, 4L);
    when(recipeMapper.selectByIdForUpdate(101L)).thenReturn(locked);
    when(imageMapper.selectById(9L)).thenReturn(approvedImage(9L));

    RecipeDraftResponse response = transaction.publishChecked(7L, 101L, 4L);

    assertThat(response.status()).isEqualTo("PUBLISHED");
    verify(recipeMapper).updateById(argThat(row ->
            "PUBLISHED".equals(row.getStatus())
                    && row.getVersion() == 5L
                    && row.getPublishedAt() != null));
}

@Test
void versionChangedDuringModerationPreservesDraftAndReturnsConflict() {
    when(recipeMapper.selectByIdForUpdate(101L)).thenReturn(completeDraft(101L, 7L, 70L, 5L));

    assertThatThrownBy(() -> transaction.publishChecked(7L, 101L, 4L))
            .isInstanceOfSatisfying(BusinessException.class,
                    error -> assertThat(error.errorCode())
                            .isEqualTo(ErrorCode.DINNER_RECIPE_VERSION_CONFLICT));
    verify(recipeMapper, never()).updateById(any());
}
```

- [ ] **Step 3: Run tests and verify RED**

```bash
cd ../osheeep-server
mvn test -Dtest=DinnerRecipePublicationServiceTest,DinnerRecipePublishTransactionTest,DinnerFamilyRecipeControllerTest
```

Expected: FAIL because publication orchestration and route do not exist.

- [ ] **Step 4: Implement immutable snapshot loading outside the transaction**

`RecipePublishSnapshot` contains the complete values used for validation and moderation:

```java
public record RecipePublishSnapshot(
        Long recipeId,
        Long creatorId,
        Long householdId,
        long version,
        String name,
        String category,
        String flavor,
        Integer servings,
        Integer estimatedMinutes,
        Long imageAssetId,
        List<RecipeIngredientResponse> ingredients,
        RecipeMethodResponse defaultMethod,
        String moderationText
) { }
```

The loader checks owner, expected version, full publish completeness and text length. It does not mutate state.

- [ ] **Step 5: Implement the short publication transaction**

`DinnerRecipePublishTransaction.publishChecked` is a separate Spring bean with `@Transactional`. It locks the recipe, repeats membership/owner/version/completeness/approved-image checks, then applies:

```java
draft.setStatus("PUBLISHED");
draft.setPublishedAt(now());
draft.setLastModifiedBy(userId);
draft.setVersion(draft.getVersion() + 1L);
recipeMapper.updateById(draft);
```

Do not call the moderation gateway from this bean. Catch duplicate-key and pessimistic-lock exceptions at the transaction boundary and map them to `DINNER_RECIPE_VERSION_CONFLICT`.

- [ ] **Step 6: Add route and controller contract**

```java
public record PublishRecipeRequest(@Min(1) long version) { }

@PostMapping("/{id}/publish")
public ApiResponse<RecipeDraftResponse> publish(
        @AuthenticationPrincipal CurrentUser currentUser,
        @PathVariable Long id,
        @Valid @RequestBody PublishRecipeRequest request
) {
    return ApiResponse.ok(publicationService.publish(currentUser.id(), id, request.version()));
}
```

Controller tests cover 401, success, validation 422, content rejected 422, moderation unavailable 503 and version conflict 409.

- [ ] **Step 7: Run backend recipe regression and commit**

```bash
cd ../osheeep-server
mvn test -Dtest='*Recipe*Test,DinnerMenuServiceTest,DinnerRecordServiceTest'
git diff --check
git add src/main/java/com/osheeep/server/dinner/recipe src/test/java/com/osheeep/server/dinner/recipe
git commit -m "feat: publish household recipes safely"
```

Expected: all named tests PASS; discovery, menu and record regressions stay green.

### Task 7: 小程序 API 契约、表单校验与串行自动保存协调器

**Files:**

- Modify: `miniprogram/services/request.ts`
- Modify: `miniprogram/types/recipe.ts`
- Modify: `miniprogram/services/recipe-service.ts`
- Modify: `miniprogram/app.ts`
- Create: `miniprogram/utils/recipe-form.ts`
- Create: `miniprogram/utils/recipe-autosave.ts`
- Modify: `tests/request.test.ts`
- Modify: `tests/recipe-discovery.test.ts`
- Create: `tests/recipe-service.test.ts`
- Create: `tests/recipe-form.test.ts`
- Create: `tests/recipe-autosave.test.ts`

**Interfaces:**

- Produces app methods: `listFamilyRecipes`, `createRecipeDraft`, `getRecipeDraft`, `saveRecipeBasicInfo`, `saveRecipeIngredients`, `saveRecipeDefaultMethod`, `saveRecipeImage`, `publishRecipe`, `listRecipeImages`.
- Produces: `createRecipeAutosave<T>(options)` with `schedule`, `flush`, `retry`, `dispose`.
- Preserves: existing `getRecipes` discovery contract.

- [ ] **Step 1: Write failing service-mapping tests**

```ts
test('maps every custom recipe endpoint without changing discovery', async () => {
  const request = jest.fn().mockResolvedValue({ id: 9, version: 1 });
  const service = createRecipeService({ request });

  await service.list({ onlyCookable: true });
  await service.listFamily('DRAFT');
  await service.createDraft();
  await service.detail(9);
  await service.saveBasicInfo(9, {
    version: 1,
    name: '番茄炒蛋',
    category: '家常菜',
    flavor: '酸甜',
    servings: 2,
    estimatedMinutes: 15,
  });
  await service.saveIngredients(9, {
    version: 2,
    ingredients: [
      { ingredientId: 1, quantity: null, unit: '克', required: true },
    ],
  });
  await service.saveDefaultMethod(9, {
    version: 3,
    name: '家常炒',
    cookingStyle: '炒',
    steps: [{ instruction: '切番茄' }],
  });
  await service.saveImage(9, 4, 8);
  await service.listImages('番茄');
  await service.publish(9, 5);

  expect(request).toHaveBeenNthCalledWith(
    1,
    '/api/dinner/recipes?onlyCookable=true',
  );
  expect(request).toHaveBeenNthCalledWith(
    2,
    '/api/dinner/recipes/family?tab=DRAFT',
  );
  expect(request).toHaveBeenNthCalledWith(3, '/api/dinner/recipes/drafts', {
    method: 'POST',
  });
  expect(request).toHaveBeenNthCalledWith(4, '/api/dinner/recipes/9');
  expect(request).toHaveBeenNthCalledWith(
    5,
    '/api/dinner/recipes/9/basic-info',
    expect.objectContaining({ method: 'PUT' }),
  );
  expect(request).toHaveBeenNthCalledWith(
    6,
    '/api/dinner/recipes/9/ingredients',
    expect.objectContaining({ method: 'PUT' }),
  );
  expect(request).toHaveBeenNthCalledWith(
    7,
    '/api/dinner/recipes/9/default-method',
    expect.objectContaining({ method: 'PUT' }),
  );
  expect(request).toHaveBeenNthCalledWith(8, '/api/dinner/recipes/9/image', {
    method: 'PUT',
    data: { version: 4, imageAssetId: 8 },
  });
  expect(request).toHaveBeenNthCalledWith(
    9,
    '/api/dinner/image-assets?query=%E7%95%AA%E8%8C%84',
  );
  expect(request).toHaveBeenNthCalledWith(10, '/api/dinner/recipes/9/publish', {
    method: 'POST',
    data: { version: 5 },
  });
});
```

- [ ] **Step 2: Write failing form-validation tests**

```ts
test('quantity blank maps to null and displays as 适量', () => {
  expect(parseRecipeQuantity('')).toBeNull();
  expect(recipeQuantityLabel(null, '克')).toBe('适量');
});

test('publish issues are stable by step and field', () => {
  expect(validateRecipeForPublish(emptyDraft)).toEqual([
    { step: 'BASIC', field: 'name', message: '请填写菜名' },
    { step: 'BASIC', field: 'category', message: '请填写分类' },
    { step: 'BASIC', field: 'flavor', message: '请填写口味' },
    { step: 'BASIC', field: 'servings', message: '请填写份量' },
    { step: 'BASIC', field: 'estimatedMinutes', message: '请填写预计耗时' },
    {
      step: 'INGREDIENTS',
      field: 'ingredients',
      message: '至少添加一种必需食材',
    },
    { step: 'METHOD', field: 'defaultMethod', message: '请填写默认做法' },
    {
      step: 'IMAGE',
      field: 'imageAssetId',
      message: '请选择一张已审核真实图片',
    },
  ]);
});
```

- [ ] **Step 3: Write failing fake-timer tests for serial autosave**

```ts
test('debounces 800ms and serializes edits made during an in-flight save', async () => {
  jest.useFakeTimers();
  const first = deferred<{ version: number }>();
  const save = jest
    .fn()
    .mockReturnValueOnce(first.promise)
    .mockResolvedValueOnce({ version: 3 });
  let version = 1;
  const autosave = createRecipeAutosave<string>({
    delayMs: 800,
    getVersion: () => version,
    save: (value, expectedVersion) => save(value, expectedVersion),
    onVersion: (next) => {
      version = next;
    },
    onState: jest.fn(),
  });

  autosave.schedule('first');
  await jest.advanceTimersByTimeAsync(800);
  autosave.schedule('second');
  first.resolve({ version: 2 });
  await Promise.resolve();
  await jest.advanceTimersByTimeAsync(800);

  expect(save).toHaveBeenNthCalledWith(1, 'first', 1);
  expect(save).toHaveBeenNthCalledWith(2, 'second', 2);
});

test('conflict stops automatic retries and keeps the latest snapshot', async () => {
  const save = jest
    .fn()
    .mockRejectedValue(new ApiError('DINNER_RECIPE_VERSION_CONFLICT', '冲突'));
  let version = 1;
  const autosave = createRecipeAutosave<{ name: string }>({
    delayMs: 800,
    getVersion: () => version,
    save: (value, expectedVersion) => save(value, expectedVersion),
    onVersion: (next) => {
      version = next;
    },
    onState: jest.fn(),
  });
  autosave.schedule({ name: '本地菜名' });

  await expect(autosave.flush()).rejects.toMatchObject({
    errorCode: 'DINNER_RECIPE_VERSION_CONFLICT',
  });
  expect(autosave.snapshot()).toEqual({ name: '本地菜名' });
  expect(autosave.state()).toBe('conflict');
  expect(save).toHaveBeenCalledTimes(1);
});
```

- [ ] **Step 4: Run tests and verify RED**

```bash
npm test -- --runInBand tests/request.test.ts tests/recipe-service.test.ts tests/recipe-form.test.ts tests/recipe-autosave.test.ts tests/recipe-discovery.test.ts
```

Expected: FAIL because custom recipe contracts, structured errors, validators and autosave do not exist.

- [ ] **Step 5: Define exact frontend contracts**

```ts
export type FamilyRecipeTab = 'PUBLISHED' | 'DRAFT' | 'ARCHIVED';
export type RecipeStep =
  'BASIC' | 'INGREDIENTS' | 'METHOD' | 'IMAGE' | 'PREVIEW';

export interface FamilyRecipeListItem {
  id: number;
  status: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';
  name?: string;
  imageUrl?: string;
  category?: string;
  flavor?: string;
  servings?: number;
  estimatedMinutes?: number;
  version: number;
  creatorId: number;
  creatorName: string;
  lastModifiedBy: number;
  lastModifiedByName: string;
  completedStep: RecipeStep;
  updatedAt: string;
}

export interface RecipeImageAsset {
  id: number;
  displayName: string;
  listUrl: string;
  detailUrl: string;
  sourcePageUrl: string;
  author: string;
  licenseName: string;
  licenseUrl: string;
  acquiredOn: string;
  width: number;
  height: number;
}

export interface RecipeMethodDraft {
  id?: number;
  name?: string;
  cookingStyle?: string;
  steps: Array<{ instruction: string; sortOrder: number }>;
}

export interface RecipeDraft {
  id: number;
  status: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';
  version: number;
  name?: string;
  category?: string;
  flavor?: string;
  servings?: number;
  estimatedMinutes?: number;
  ingredients: RecipeIngredient[];
  defaultMethod?: RecipeMethodDraft;
  image?: RecipeImageAsset;
  incompleteSteps: RecipeStep[];
  updatedAt: string;
}
```

Extend `ApiError` with `public readonly details?: unknown`, populated from failed `ApiResponse.data`, so the editor can map server `RecipeValidationIssue[]` without parsing messages.

- [ ] **Step 6: Implement the serial autosave state machine**

Use exact states:

```ts
export type RecipeAutosaveState =
  'idle' | 'scheduled' | 'saving' | 'saved' | 'error' | 'conflict';

export interface RecipeAutosave<T> {
  schedule(value: T): void;
  flush(): Promise<void>;
  retry(): Promise<void>;
  dispose(): void;
  snapshot(): T | undefined;
  state(): RecipeAutosaveState;
}
```

Keep one `latest` snapshot and one in-flight promise. After success, update version from the response; if `latest` changed during the request, schedule it after 800ms. On conflict, clear timers and retain `latest`; only `retry()` can resume.

- [ ] **Step 7: Run focused checks and commit**

```bash
npm test -- --runInBand tests/request.test.ts tests/recipe-service.test.ts tests/recipe-form.test.ts tests/recipe-autosave.test.ts tests/recipe-discovery.test.ts
npm run typecheck
npm run lint
git diff --check
git add miniprogram/services miniprogram/types/recipe.ts miniprogram/app.ts miniprogram/utils/recipe-form.ts miniprogram/utils/recipe-autosave.ts tests/request.test.ts tests/recipe-discovery.test.ts tests/recipe-service.test.ts tests/recipe-form.test.ts tests/recipe-autosave.test.ts
git commit -m "feat: add custom recipe client contracts"
```

### Task 8: 自定义菜谱参考图与实现前设计检查点

**Files:**

- Read: `docs/design/formal-release/ingredient-inventory-final-direction.png`
- Read: `docs/design/formal-release/recipe-discovery-final-direction.png`
- Read: `docs/design/qa/inventory-390-comparison.png`
- Read: `docs/design/qa/recipes-390-comparison.png`
- Create: `docs/design/formal-release/family-recipes-final-direction.png`
- Create: `docs/design/formal-release/recipe-editor-final-direction.png`
- Create: `docs/design/formal-release/recipe-image-picker-final-direction.png`
- Create: `docs/design/custom-recipes-design-notes.md`

**Interfaces:**

- Produces the exact visual sources used by Tasks 9–10.
- Preserves the already selected visual system; no alternate brand/style selection.
- Uses neutral image-slot blocks or the verified CC0 photo only; no generated food photo.

- [ ] **Step 1: Invoke Product Design with the approved constraints**

Use `product-design:index` to route to the minimum focused workflow. Play back this fixed brief without reopening product decisions:

```text
目标：为微信原生小程序“小家开饭”延续已批准的库存/找菜视觉，制作家庭菜谱列表、五步编辑器、真实图片选择三个 390×844 参考屏。
结果：暖白背景、橄榄绿层级、橙色主动作、轻量分隔行、原生导航、88rpx 触控目标。
禁止：新品牌方向、卡片堆叠、生成式菜品成品照、第三方热链、用户图片上传。
状态：列表含已发布/我的草稿/已归档；编辑器显示自动保存与步骤进度；图片页显示来源与许可。
```

- [ ] **Step 2: Produce one approved continuation direction at three target screens**

Because the user has explicitly fixed the overall visual direction, generate/refine one faithful continuation rather than reopening style selection. Use the verified `tomato-with-egg` CC0 asset only where a real dish slot is needed. Save three PNGs at exactly 390×844.

- [ ] **Step 3: Record implementation measurements**

Write `custom-recipes-design-notes.md` with exact values taken from the references:

```markdown
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
```

- [ ] **Step 4: Commit the visual checkpoint**

```bash
git add docs/design/formal-release/family-recipes-final-direction.png docs/design/formal-release/recipe-editor-final-direction.png docs/design/formal-release/recipe-image-picker-final-direction.png docs/design/custom-recipes-design-notes.md
git commit -m "design: define custom recipe screens"
```

### Task 9: 家庭菜谱列表页面与找菜入口

**Files:**

- Modify: `miniprogram/app.json`
- Modify: `miniprogram/pages/recipes/index.ts`
- Create: `miniprogram/pages/family-recipes/index.json`
- Create: `miniprogram/pages/family-recipes/index.ts`
- Create: `miniprogram/pages/family-recipes/index.wxml`
- Create: `miniprogram/pages/family-recipes/index.wxss`
- Modify: `tests/project-structure.test.ts`
- Modify: `tests/recipe-discovery-page.test.ts`
- Create: `tests/family-recipes-page.test.ts`

**Interfaces:**

- Route: `/pages/family-recipes/index`.
- Consumes: `listFamilyRecipes(tab)`, `createRecipeDraft()`.
- Produces navigation to `/pages/recipe-editor/index?id={id}`.

- [ ] **Step 1: Write failing route and rendered-structure tests**

```ts
test('declares family recipe list and replaces the unavailable toast', () => {
  const app = JSON.parse(readProjectFile('miniprogram/app.json')) as {
    pages: string[];
  };
  const discoveryTs = readProjectFile('miniprogram/pages/recipes/index.ts');
  expect(app.pages).toContain('pages/family-recipes/index');
  expect(discoveryTs).toContain("'/pages/family-recipes/index'");
  expect(discoveryTs).not.toContain('家庭菜谱暂未开放');
});

test('renders tabs, explicit empty states and create action', () => {
  const wxml = readProjectFile('miniprogram/pages/family-recipes/index.wxml');
  expect(wxml).toContain('已发布');
  expect(wxml).toContain('我的草稿');
  expect(wxml).toContain('已归档');
  expect(wxml).toContain('新建菜谱');
  expect(wxml).toContain('bindtap="onRetry"');
  expect(wxml).toContain('bindtap="onCreateDraft"');
});
```

- [ ] **Step 2: Write failing behavior tests**

```ts
test('loads the selected tab and ignores stale tab responses', async () => {
  const published = deferred<FamilyRecipeListItem[]>();
  const drafts = deferred<FamilyRecipeListItem[]>();
  app.listFamilyRecipes
    .mockReturnValueOnce(published.promise)
    .mockReturnValueOnce(drafts.promise);

  const page = createPageInstance(await loadPage());
  const first = page.onShow();
  const second = page.onSelectTab(eventFor('DRAFT'));
  drafts.resolve([draftItem(2)]);
  await second;
  published.resolve([publishedItem(1)]);
  await first;

  expect(page.data.activeTab).toBe('DRAFT');
  expect(page.data.items.map((item) => item.id)).toEqual([2]);
});

test('creates a draft once and opens its editor', async () => {
  app.createRecipeDraft.mockResolvedValue(draft(9));
  await page.onCreateDraft();
  expect(wx.navigateTo).toHaveBeenCalledWith({
    url: '/pages/recipe-editor/index?id=9',
  });
});

test('accepts only a valid initial tab from the redirect query', async () => {
  const page = createPageInstance(await loadPage());
  page.onLoad({ tab: 'ARCHIVED' });
  expect(page.data.activeTab).toBe('ARCHIVED');
  page.onLoad({ tab: 'UNKNOWN' });
  expect(page.data.activeTab).toBe('PUBLISHED');
});
```

- [ ] **Step 3: Run tests and verify RED**

```bash
npm test -- --runInBand tests/project-structure.test.ts tests/recipe-discovery-page.test.ts tests/family-recipes-page.test.ts
```

Expected: FAIL because route, page and navigation do not exist.

- [ ] **Step 4: Implement list state and navigation**

Use exact page state:

```ts
data: {
  activeTab: 'PUBLISHED' as FamilyRecipeTab,
  loading: true,
  refreshing: false,
  creating: false,
  items: [] as FamilyRecipeListItem[],
  errorMessage: '',
}
```

`onLoad` accepts only `PUBLISHED`, `DRAFT` or `ARCHIVED` from the query string and otherwise selects `PUBLISHED`. Increment a module request token for every tab load; apply a response only when token and selected tab both match. Disable duplicate create taps. On create success navigate to the returned id; on failure keep the list and show a retryable local error.

- [ ] **Step 5: Implement WXML/WXSS from Task 8 source**

Use a compact tab rail, divider rows, one restrained orange “新建菜谱” action and three distinct empty states:

- Published: “还没有家庭菜谱，先从一道家常菜开始”。
- Draft: “没有未完成的草稿”。
- Archived: “归档后的菜谱会留在这里”。

Rows show recipe name/fallback “未命名菜谱”, creator/last modifier for published, completion step for drafts, and accessible navigation labels. Do not add bottom navigation to this secondary page.

- [ ] **Step 6: Run focused checks and commit**

```bash
npm test -- --runInBand tests/project-structure.test.ts tests/recipe-discovery-page.test.ts tests/family-recipes-page.test.ts
npm run typecheck
npm run lint
git diff --check
git add miniprogram/app.json miniprogram/pages/recipes/index.ts miniprogram/pages/family-recipes tests/project-structure.test.ts tests/recipe-discovery-page.test.ts tests/family-recipes-page.test.ts
git commit -m "feat: browse household recipes"
```

### Task 10: 五步编辑器、图片选择与首次发布

**Files:**

- Modify: `miniprogram/app.json`
- Create: `miniprogram/pages/recipe-editor/index.json`
- Create: `miniprogram/pages/recipe-editor/index.ts`
- Create: `miniprogram/pages/recipe-editor/index.wxml`
- Create: `miniprogram/pages/recipe-editor/index.wxss`
- Create: `miniprogram/pages/recipe-images/index.json`
- Create: `miniprogram/pages/recipe-images/index.ts`
- Create: `miniprogram/pages/recipe-images/index.wxml`
- Create: `miniprogram/pages/recipe-images/index.wxss`
- Modify: `tests/project-structure.test.ts`
- Create: `tests/recipe-editor-page.test.ts`
- Create: `tests/recipe-images-page.test.ts`

**Interfaces:**

- Route: `/pages/recipe-editor/index?id={draftId}`.
- Route: `/pages/recipe-images/index`; selection returns `RecipeImageAsset` through the opener event channel event `imageSelected`.
- Consumes: Task 7 service methods, validators and autosave coordinator.
- Produces: successful publish redirects back to `/pages/family-recipes/index` and refreshes its `PUBLISHED` tab on show.

- [ ] **Step 1: Write failing editor lifecycle and save tests**

```ts
test('loads draft and creates one autosave coordinator per editable step', async () => {
  app.getRecipeDraft.mockResolvedValue(completeDraft(9, 3));
  const page = createPageInstance(await loadEditorPage());

  await page.onLoad({ id: '9' });

  expect(page.data.recipeId).toBe(9);
  expect(page.data.version).toBe(3);
  expect(page.data.activeStep).toBe('BASIC');
  expect(page.data.saveState).toBe('saved');
});

test('next step flushes current autosave before changing step', async () => {
  const flush = deferred<void>();
  page.autosave.flush = jest.fn(() => flush.promise);
  const moving = page.onNextStep();
  expect(page.data.activeStep).toBe('BASIC');
  flush.resolve();
  await moving;
  expect(page.data.activeStep).toBe('INGREDIENTS');
});

test('version conflict keeps local values and blocks navigation', async () => {
  page.data.nameInput = '本地菜名';
  page.autosave.flush = jest
    .fn()
    .mockRejectedValue(new ApiError('DINNER_RECIPE_VERSION_CONFLICT', '冲突'));

  await page.onNextStep();

  expect(page.data.nameInput).toBe('本地菜名');
  expect(page.data.saveState).toBe('conflict');
  expect(page.data.activeStep).toBe('BASIC');
});
```

- [ ] **Step 2: Write failing ingredient, method and image tests**

```ts
test('adds catalog ingredient with default unit and keeps blank quantity as null', () => {
  page.onAddIngredient(
    eventForIngredient({
      ingredientId: 2,
      name: '盐',
      defaultUnit: '克',
    }),
  );
  page.onIngredientQuantityInput(inputEvent(2, ''));

  expect(page.currentIngredientPayload()).toEqual([
    { ingredientId: 2, quantity: null, unit: '克', required: true },
  ]);
});

test('moves method steps without losing their text', () => {
  page.data.methodSteps = ['切番茄', '炒鸡蛋'];
  page.onMoveStepUp(eventForIndex(1));
  expect(page.data.methodSteps).toEqual(['炒鸡蛋', '切番茄']);
});

test('image page exposes only API results and emits selected metadata', async () => {
  app.listRecipeImages.mockResolvedValue([approvedImage(4)]);
  await imagePage.onLoad();
  imagePage.onSelectImage(eventFor(4));
  expect(eventChannel.emit).toHaveBeenCalledWith(
    'imageSelected',
    approvedImage(4),
  );
  expect(wx.navigateBack).toHaveBeenCalledWith({ delta: 1 });
});
```

- [ ] **Step 3: Write failing preview and publication tests**

```ts
test('preview maps validation issues to exact steps before calling publish', async () => {
  page.data.draft = incompleteDraft();
  await page.onPublish();
  expect(app.publishRecipe).not.toHaveBeenCalled();
  expect(page.data.publishIssues[0]).toEqual({
    step: 'BASIC',
    field: 'name',
    message: '请填写菜名',
  });
});

test('publishes current server version once and returns to family list', async () => {
  page.data.version = 8;
  app.publishRecipe.mockResolvedValue(publishedDraft(9, 9));
  await page.onPublish();
  expect(app.publishRecipe).toHaveBeenCalledWith(9, 8);
  expect(wx.redirectTo).toHaveBeenCalledWith({
    url: '/pages/family-recipes/index?tab=PUBLISHED',
  });
});

test.each([
  ['DINNER_RECIPE_CONTENT_REJECTED', '内容没有通过安全检查，草稿已保留'],
  ['DINNER_RECIPE_MODERATION_UNAVAILABLE', '暂时无法完成安全检查，请稍后重试'],
  ['DINNER_RECIPE_IMAGE_INVALID', '这张图片已不可用，请重新选择'],
  ['DINNER_RECIPE_VERSION_CONFLICT', '草稿刚刚发生变化，请刷新后再发布'],
])('keeps the draft on publish error %s', async (code, message) => {
  app.publishRecipe.mockRejectedValue(new ApiError(code, code));
  await page.onPublish();
  expect(page.data.publishErrorMessage).toBe(message);
  expect(wx.redirectTo).not.toHaveBeenCalled();
});
```

- [ ] **Step 4: Run tests and verify RED**

```bash
npm test -- --runInBand tests/project-structure.test.ts tests/recipe-editor-page.test.ts tests/recipe-images-page.test.ts tests/recipe-autosave.test.ts tests/recipe-form.test.ts
```

Expected: FAIL because editor/image routes and page behavior do not exist.

- [ ] **Step 5: Implement editor state, step payloads and lifecycle**

Use exact step order:

```ts
const steps: RecipeStep[] = [
  'BASIC',
  'INGREDIENTS',
  'METHOD',
  'IMAGE',
  'PREVIEW',
];
```

Page state includes `loading`, `recipeId`, `version`, `activeStep`, the local fields for all five steps, `saveState`, `saveMessage`, `publishIssues`, `publishing` and `publishErrorMessage`. `onHide` calls `void autosave.flush()` and preserves failures in page data; `onUnload` flushes first when navigation is controlled by this page, then disposes timers. Disable next/publish while a flush or publication is active.

Basic, ingredients, method and image edits call their exact Task 7 service methods. Every successful response replaces the page version and server-backed draft. The preview step never sends an autosave request.

- [ ] **Step 6: Implement image selection and source disclosure**

The editor opens the image page with:

```ts
wx.navigateTo({
  url: '/pages/recipe-images/index',
  events: {
    imageSelected: (image: RecipeImageAsset) => {
      this.setData({ selectedImage: image });
      this.imageAutosave.schedule(image.id);
    },
  },
});
```

Image page supports local query filtering over returned approved assets, shows author/license/source link text, and uses `wx.navigateTo` only for the app page; it must not attempt to open arbitrary third-party URLs inside the mini program. The source URL remains copyable/displayed for attribution.

- [ ] **Step 7: Implement WXML/WXSS from Task 8 references**

Required states in WXML:

- Initial skeleton/loading.
- Load failure with retry.
- Five-step progress with text labels.
- Inline field errors.
- `保存中 / 已保存 / 保存失败 / 版本冲突` status text.
- Ingredient empty state, rows, “适量”, required toggle and remove.
- Ordered method steps with up/down/remove actions.
- Approved image selection and provenance.
- Preview issues that jump to their owning step.
- Fixed safe-area action bar with minimum `88rpx` targets.

Use reference colors and spacing exactly; do not use attribute selectors in WXSS.

- [ ] **Step 8: Run focused checks and commit**

```bash
npm test -- --runInBand tests/project-structure.test.ts tests/recipe-editor-page.test.ts tests/recipe-images-page.test.ts tests/recipe-autosave.test.ts tests/recipe-form.test.ts tests/recipe-service.test.ts
npm run typecheck
npm run lint
git diff --check
git add miniprogram/app.json miniprogram/pages/recipe-editor miniprogram/pages/recipe-images tests/project-structure.test.ts tests/recipe-editor-page.test.ts tests/recipe-images-page.test.ts
git commit -m "feat: create and publish household recipes"
```

### Task 11: 隔离 MySQL 竖切、全量回归、设计 QA 与文档收口

**Files:**

- Create: `../osheeep-server/src/test/java/com/osheeep/server/dinner/recipe/DinnerCustomRecipeMySqlIT.java`
- Modify: `../osheeep-server/docs/api-contract.md`
- Modify: `docs/superpowers/plans/2026-07-16-household-custom-recipes-vertical-slice.md`
- Modify: `docs/HANDOFF.md`
- Create: `docs/design/qa/custom-recipes/family-recipes-375.png`
- Create: `docs/design/qa/custom-recipes/family-recipes-390.png`
- Create: `docs/design/qa/custom-recipes/family-recipes-430.png`
- Create: `docs/design/qa/custom-recipes/editor-375.png`
- Create: `docs/design/qa/custom-recipes/editor-390.png`
- Create: `docs/design/qa/custom-recipes/editor-430.png`
- Create: `docs/design/qa/custom-recipes/images-390.png`
- Create: `docs/design/qa/custom-recipes/family-recipes-390-comparison.png`
- Create: `docs/design/qa/custom-recipes/editor-390-comparison.png`
- Create: `docs/design/qa/custom-recipes/custom-recipes-design-qa.md`

**Interfaces:**

- Proves: V6 executes on isolated MySQL 8 and the API can complete the full vertical slice with two household users.
- Proves: frontend full suite/static checks and 375/390/430 native simulator QA.
- Produces an accurate continuation point without claiming deployment or upload.

- [ ] **Step 1: Write the isolated MySQL integration test with two safety gates**

The test must abort unless both conditions hold: `OSHEEEP_DB_TEST_NAME` is nonblank, and the active JDBC catalog equals that exact value.

```java
@BeforeEach
void requireDedicatedTestDatabase() {
    String expected = System.getenv("OSHEEEP_DB_TEST_NAME");
    assertThat(expected).as("OSHEEEP_DB_TEST_NAME safety gate").isNotBlank();
    assertThat(jdbcTemplate.queryForObject("SELECT DATABASE()", String.class))
            .as("write tests may only use the dedicated test catalog")
            .isEqualTo(expected);
}
```

The test seeds two users, identities, one active household and two memberships; creates a draft through service/API, saves basic info, one quantity-null ingredient, one default method, selects the seeded approved asset, injects a passing `RecipeTextSafetyGateway`, publishes, and asserts both users list the same `PUBLISHED` recipe. Cleanup deletes in foreign-key order and leaves system recipes/assets intact.

- [ ] **Step 2: Run the real MySQL 8 integration test**

Use an isolated MySQL 8 container or the dedicated local test database only:

```bash
cd ../osheeep-server
export JAVA_HOME=$(/usr/libexec/java_home -v 21)
export PATH="$JAVA_HOME/bin:$PATH"
set -a
source .env.local
set +a
export OSHEEEP_DB_NAME="$OSHEEEP_DB_TEST_NAME"
mvn test -Dtest=DinnerCustomRecipeMySqlIT -Dspring.profiles.active=local
```

Expected: Flyway applies V1–V6, the integration test PASSes, and the test logs name the dedicated test catalog without printing credentials.

- [ ] **Step 3: Run complete backend and frontend verification**

Backend:

```bash
cd ../osheeep-server
export JAVA_HOME=$(/usr/libexec/java_home -v 21)
export PATH="$JAVA_HOME/bin:$PATH"
mvn test
git diff --check
```

Frontend:

```bash
cd ../osheeep-wx
npm test -- --runInBand
npm run typecheck
npm run lint
npm run format:check
git diff --check
```

Expected: all commands exit 0 with no failures or formatting warnings.

- [ ] **Step 4: Run native WeChat design and interaction QA**

Start the isolated backend/database, log in with authorized development accounts, and verify:

- create/reopen draft;
- auto-save state and page-hide flush;
- quantity-null “适量”;
- step reorder;
- approved image and source metadata;
- content-rejected, moderation-unavailable and 409 recovery using deterministic test seams;
- successful publish visible to both household accounts.

Capture 375, 390 and 430px screenshots listed above. At 390px, combine each implementation screenshot with its Task 8 source under identical state/viewport. Fix all P0/P1/P2 findings before marking QA passed.

- [ ] **Step 5: Update API, plan, handoff and QA report with measured facts**

Document exact endpoints, version semantics, structured validation data, image provenance, moderation failure codes and the fact that `openid` must represent a user active in the mini program. Record actual test counts and MySQL evidence. State explicitly:

- V6 is source/local-test validated, not production-applied.
- The new code is not uploaded as a WeChat experience version.
- One verified real photo enables the vertical slice; replacing all eight existing system recipe images remains outstanding.
- Family recipe discovery/menu integration, edit drafts, variants, copy and archive remain outside this vertical slice.

- [ ] **Step 6: Commit backend integration/contracts**

```bash
cd ../osheeep-server
git add src/test/java/com/osheeep/server/dinner/recipe/DinnerCustomRecipeMySqlIT.java docs/api-contract.md
git commit -m "test: verify custom recipe vertical slice"
```

- [ ] **Step 7: Commit frontend QA and handoff**

```bash
cd ../osheeep-wx
git add docs/superpowers/plans/2026-07-16-household-custom-recipes-vertical-slice.md docs/HANDOFF.md docs/design/qa/custom-recipes
git commit -m "docs: verify custom recipe vertical slice"
```

- [ ] **Step 8: Verify final repository state**

Run in both repositories:

```bash
git status -sb
git log -5 --oneline
git rev-list --left-right --count origin/main...main
```

Expected: worktrees clean. Local `main` may be ahead until the user explicitly requests the next push; do not infer production deployment, upload or release from Git state.
