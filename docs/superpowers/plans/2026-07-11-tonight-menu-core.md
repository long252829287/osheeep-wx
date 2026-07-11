# 今晚菜单核心闭环 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让同一家庭的两名微信用户使用系统示例菜完成分别选菜、自动合并、确认、修改回草稿、幂等完成和做饭记录回看。

**Architecture:** `osheeep-server` 在独立 `dinner.menu`、`dinner.recipe`、`dinner.record` 包中保存菜单主数据并计算相对当前用户的来源；所有写操作使用版本号和事务，确认/完成额外使用幂等键。`osheeep-wx` 使用原生页面、service 和纯状态函数，选择页批量保存完整集合，今晚页只展示服务端快照并在可见期间每 8 秒轮询。

**Tech Stack:** Java 21、Spring Boot 3.5.16、MyBatis-Plus、MySQL 8/Flyway、JUnit 5、MockMvc；微信原生小程序、TypeScript 5.9、WXML、WXSS、Jest。

## Global Constraints

- 两个仓库继续直接使用 `main`；不创建 worktree，不引入 WebSocket 或新的前端框架。
- 服务端按家庭 `timezone` 计算业务日，凌晨 4 点之前属于前一天。
- 客户端不自行合并双方选择，不自行推导业务日期。
- 选择、确认和完成携带 `version`；冲突返回 HTTP 409 与 `DINNER_MENU_VERSION_CONFLICT`。
- 确认和完成携带 UUID v4 幂等键；同一菜单只生成一条完成记录。
- 菜谱只包含 8 道系统示例菜；不实现新增、编辑、删除、搜索和图片上传。
- 记录保存完成时菜品与选择人快照，后续菜谱变化不得影响历史。
- 页面显示期间每 8 秒轮询；隐藏和卸载时停止，回前台立即刷新。
- UI 以 `docs/design/tonight-menu-*.png` 和 `cooking-record-detail.png` 为视觉真相，优先适配 390 × 844，并覆盖 375～430px。
- 不从原型截图裁切菜品图；使用 imagegen 生成 8 张统一风格的 1:1 真实菜品缩略图。
- 所有业务能力先写失败测试，再做最小实现；每完成一个 Task 立即刷新本计划复选框并提交。

---

### Task 1: V4 菜谱、菜单与记录持久层

**Files:**
- Create: `../osheeep-server/src/main/resources/db/migration/V4__add_dinner_menus_and_records.sql`
- Create: `../osheeep-server/src/main/java/com/osheeep/server/dinner/recipe/entity/DinnerRecipeEntity.java`
- Create: `../osheeep-server/src/main/java/com/osheeep/server/dinner/recipe/mapper/DinnerRecipeMapper.java`
- Create: `../osheeep-server/src/main/java/com/osheeep/server/dinner/menu/entity/DinnerMenuEntity.java`
- Create: `../osheeep-server/src/main/java/com/osheeep/server/dinner/menu/entity/DinnerMenuSelectionEntity.java`
- Create: `../osheeep-server/src/main/java/com/osheeep/server/dinner/menu/entity/DinnerMenuActionEntity.java`
- Create: `../osheeep-server/src/main/java/com/osheeep/server/dinner/menu/mapper/DinnerMenuMapper.java`
- Create: `../osheeep-server/src/main/java/com/osheeep/server/dinner/menu/mapper/DinnerMenuSelectionMapper.java`
- Create: `../osheeep-server/src/main/java/com/osheeep/server/dinner/menu/mapper/DinnerMenuActionMapper.java`
- Create: `../osheeep-server/src/main/java/com/osheeep/server/dinner/record/entity/DinnerCookingRecordEntity.java`
- Create: `../osheeep-server/src/main/java/com/osheeep/server/dinner/record/entity/DinnerRecordDishSnapshotEntity.java`
- Create: `../osheeep-server/src/main/java/com/osheeep/server/dinner/record/mapper/DinnerCookingRecordMapper.java`
- Create: `../osheeep-server/src/main/java/com/osheeep/server/dinner/record/mapper/DinnerRecordDishSnapshotMapper.java`
- Test: `../osheeep-server/src/test/java/com/osheeep/server/dinner/menu/DinnerMenuPersistenceContractTest.java`

**Interfaces:**
- Consumes: existing `users(id)`, `dinner_households(id)`, `dinner_household_members(user_id, household_id)`.
- Produces: Mapper interfaces plus `DinnerMenuMapper.selectByHouseholdAndDateForUpdate(Long, LocalDate)`.

- [x] **Step 1: Write the failing persistence contract test**

```java
@Test
void menuEntitiesExposeVersionAndUniqueBusinessIdentity() {
    DinnerMenuEntity menu = new DinnerMenuEntity();
    menu.setHouseholdId(11L);
    menu.setMenuDate(LocalDate.of(2026, 7, 11));
    menu.setStatus("DRAFT");
    menu.setVersion(0L);

    assertThat(menu.getVersion()).isZero();
    assertThat(DinnerMenuMapper.class.getMethod(
            "selectByHouseholdAndDateForUpdate", Long.class, LocalDate.class)).isNotNull();
}
```

- [x] **Step 2: Run the test and confirm missing types**

Run: `cd ../osheeep-server && mvn -Dtest=DinnerMenuPersistenceContractTest test`

Expected: FAIL because `DinnerMenuEntity` and `DinnerMenuMapper` do not exist.

- [x] **Step 3: Create V4 migration with exact constraints and seeds**

```sql
CREATE TABLE dinner_recipes (
    id BIGINT NOT NULL AUTO_INCREMENT,
    scope VARCHAR(16) NOT NULL,
    household_id BIGINT NULL,
    name VARCHAR(100) NOT NULL,
    image_path VARCHAR(255) NULL,
    category VARCHAR(32) NOT NULL,
    flavor VARCHAR(32) NOT NULL,
    estimated_minutes INT NOT NULL,
    creator_id BIGINT NULL,
    status VARCHAR(16) NOT NULL DEFAULT 'ACTIVE',
    created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
    PRIMARY KEY (id),
    CONSTRAINT fk_dinner_recipes_household FOREIGN KEY (household_id) REFERENCES dinner_households (id),
    CONSTRAINT fk_dinner_recipes_creator FOREIGN KEY (creator_id) REFERENCES users (id)
);

CREATE TABLE dinner_menus (
    id BIGINT NOT NULL AUTO_INCREMENT,
    household_id BIGINT NOT NULL,
    menu_date DATE NOT NULL,
    status VARCHAR(16) NOT NULL DEFAULT 'DRAFT',
    version BIGINT NOT NULL DEFAULT 0,
    confirmed_by BIGINT NULL,
    confirmed_at DATETIME(3) NULL,
    completed_by BIGINT NULL,
    completed_at DATETIME(3) NULL,
    created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
    PRIMARY KEY (id),
    UNIQUE KEY uk_dinner_menu_business_date (household_id, menu_date),
    CONSTRAINT fk_dinner_menus_household FOREIGN KEY (household_id) REFERENCES dinner_households (id),
    CONSTRAINT fk_dinner_menus_confirmed_by FOREIGN KEY (confirmed_by) REFERENCES users (id),
    CONSTRAINT fk_dinner_menus_completed_by FOREIGN KEY (completed_by) REFERENCES users (id)
);
```

```sql
CREATE TABLE dinner_menu_selections (
    id BIGINT NOT NULL AUTO_INCREMENT,
    menu_id BIGINT NOT NULL,
    user_id BIGINT NOT NULL,
    recipe_id BIGINT NOT NULL,
    selected_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    PRIMARY KEY (id),
    UNIQUE KEY uk_dinner_selection (menu_id, user_id, recipe_id),
    CONSTRAINT fk_dinner_selections_menu FOREIGN KEY (menu_id) REFERENCES dinner_menus (id),
    CONSTRAINT fk_dinner_selections_user FOREIGN KEY (user_id) REFERENCES users (id),
    CONSTRAINT fk_dinner_selections_recipe FOREIGN KEY (recipe_id) REFERENCES dinner_recipes (id)
);

CREATE TABLE dinner_menu_actions (
    id BIGINT NOT NULL AUTO_INCREMENT,
    menu_id BIGINT NOT NULL,
    actor_id BIGINT NOT NULL,
    action_type VARCHAR(16) NOT NULL,
    idempotency_key CHAR(36) NOT NULL,
    created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    PRIMARY KEY (id),
    UNIQUE KEY uk_dinner_menu_action_key (idempotency_key),
    CONSTRAINT fk_dinner_actions_menu FOREIGN KEY (menu_id) REFERENCES dinner_menus (id),
    CONSTRAINT fk_dinner_actions_actor FOREIGN KEY (actor_id) REFERENCES users (id)
);

CREATE TABLE dinner_cooking_records (
    id BIGINT NOT NULL AUTO_INCREMENT,
    household_id BIGINT NOT NULL,
    menu_id BIGINT NOT NULL,
    record_date DATE NOT NULL,
    completed_by BIGINT NOT NULL,
    completed_at DATETIME(3) NOT NULL,
    PRIMARY KEY (id),
    UNIQUE KEY uk_dinner_record_menu (menu_id),
    CONSTRAINT fk_dinner_records_household FOREIGN KEY (household_id) REFERENCES dinner_households (id),
    CONSTRAINT fk_dinner_records_menu FOREIGN KEY (menu_id) REFERENCES dinner_menus (id),
    CONSTRAINT fk_dinner_records_completed_by FOREIGN KEY (completed_by) REFERENCES users (id)
);

CREATE TABLE dinner_record_dish_snapshots (
    id BIGINT NOT NULL AUTO_INCREMENT,
    record_id BIGINT NOT NULL,
    recipe_id BIGINT NOT NULL,
    name VARCHAR(100) NOT NULL,
    image_path VARCHAR(255) NULL,
    category VARCHAR(32) NOT NULL,
    flavor VARCHAR(32) NOT NULL,
    estimated_minutes INT NOT NULL,
    selected_by_user_ids JSON NOT NULL,
    sort_order INT NOT NULL,
    PRIMARY KEY (id),
    UNIQUE KEY uk_dinner_record_snapshot_order (record_id, sort_order),
    CONSTRAINT fk_dinner_snapshots_record FOREIGN KEY (record_id) REFERENCES dinner_cooking_records (id)
);

INSERT INTO dinner_recipes
    (scope, name, image_path, category, flavor, estimated_minutes)
VALUES
    ('SYSTEM', '番茄炒蛋', '/assets/recipes/tomato-eggs.jpg', '家常菜', '酸甜', 10),
    ('SYSTEM', '小炒黄牛肉', '/assets/recipes/stir-fried-beef.jpg', '下饭菜', '香辣', 15),
    ('SYSTEM', '清炒油麦菜', '/assets/recipes/sauteed-lettuce.jpg', '素菜', '清爽', 8),
    ('SYSTEM', '黄焖鸡米饭', '/assets/recipes/braised-chicken-rice.jpg', '下饭菜', '浓郁', 25),
    ('SYSTEM', '紫菜蛋花汤', '/assets/recipes/seaweed-egg-soup.jpg', '汤羹', '鲜香', 10),
    ('SYSTEM', '可乐鸡翅', '/assets/recipes/cola-chicken-wings.jpg', '家常菜', '咸甜', 30),
    ('SYSTEM', '蒜蓉西兰花', '/assets/recipes/garlic-broccoli.jpg', '素菜', '蒜香', 12),
    ('SYSTEM', '青椒土豆丝', '/assets/recipes/pepper-potato.jpg', '家常菜', '清爽', 12);
```

- [x] **Step 4: Implement entities and mappers**

```java
@Mapper
public interface DinnerMenuMapper extends BaseMapper<DinnerMenuEntity> {
    @Select("""
            SELECT * FROM dinner_menus
            WHERE household_id = #{householdId} AND menu_date = #{menuDate}
            FOR UPDATE
            """)
    DinnerMenuEntity selectByHouseholdAndDateForUpdate(Long householdId, LocalDate menuDate);
}
```

All entities use `@TableName`, `@TableId(type = IdType.AUTO)`, Java `LocalDate`/`LocalDateTime`, and ordinary getters/setters matching existing entities.

- [x] **Step 5: Verify the persistence layer**

Run: `cd ../osheeep-server && mvn -Dtest=DinnerMenuPersistenceContractTest test`

Expected: PASS.

- [x] **Step 6: Commit Task 1**

```bash
cd ../osheeep-server
git add src/main/resources/db/migration/V4__add_dinner_menus_and_records.sql src/main/java/com/osheeep/server/dinner src/test/java/com/osheeep/server/dinner/menu/DinnerMenuPersistenceContractTest.java
git commit -m "feat: add dinner menu persistence"
```

### Task 2: 业务日、示例菜与今日菜单读取

**Files:**
- Create: `../osheeep-server/src/main/java/com/osheeep/server/dinner/menu/BusinessDateResolver.java`
- Create: `../osheeep-server/src/main/java/com/osheeep/server/dinner/recipe/DinnerRecipeService.java`
- Create: `../osheeep-server/src/main/java/com/osheeep/server/dinner/recipe/dto/RecipeResponse.java`
- Create: `../osheeep-server/src/main/java/com/osheeep/server/dinner/menu/DinnerMenuService.java`
- Create: `../osheeep-server/src/main/java/com/osheeep/server/dinner/menu/dto/MenuDishResponse.java`
- Create: `../osheeep-server/src/main/java/com/osheeep/server/dinner/menu/dto/TodayMenuResponse.java`
- Test: `../osheeep-server/src/test/java/com/osheeep/server/dinner/menu/BusinessDateResolverTest.java`
- Test: `../osheeep-server/src/test/java/com/osheeep/server/dinner/menu/DinnerMenuServiceTest.java`

**Interfaces:**
- Consumes: Task 1 mappers and existing household/member mappers.
- Produces: `BusinessDateResolver.resolve(String timezone, Instant now)`, `DinnerRecipeService.listSystemRecipes()`, `DinnerMenuService.today(Long userId)`.

- [x] **Step 1: Write failing business-date tests**

```java
@ParameterizedTest
@CsvSource({
        "2026-07-10T19:59:59Z,2026-07-10",
        "2026-07-10T20:00:00Z,2026-07-11"
})
void shanghaiBusinessDayChangesAtFourAm(String instant, String expected) {
    assertThat(resolver.resolve("Asia/Shanghai", Instant.parse(instant)))
            .isEqualTo(LocalDate.parse(expected));
}
```

- [x] **Step 2: Run the test and confirm resolver is missing**

Run: `cd ../osheeep-server && mvn -Dtest=BusinessDateResolverTest test`

Expected: FAIL because `BusinessDateResolver` does not exist.

- [x] **Step 3: Implement the resolver**

```java
public LocalDate resolve(String timezone, Instant now) {
    ZonedDateTime local = now.atZone(ZoneId.of(timezone));
    LocalDate date = local.toLocalDate();
    return local.toLocalTime().isBefore(LocalTime.of(4, 0)) ? date.minusDays(1) : date;
}
```

- [x] **Step 4: Write failing menu merge tests**

```java
@Test
void todayMergesSelectionsRelativeToCurrentUser() {
    when(selectionMapper.selectList(any())).thenReturn(List.of(
            selection(31L, 7L, 1L), selection(31L, 7L, 2L),
            selection(31L, 8L, 2L), selection(31L, 8L, 3L)));

    TodayMenuResponse result = service.today(7L);

    assertThat(result.dishes()).extracting(MenuDishResponse::source)
            .containsExactly("ME", "BOTH", "PARTNER");
    assertThat(result.mySelectionCount()).isEqualTo(2);
    assertThat(result.partnerSelectionCount()).isEqualTo(2);
}
```

- [x] **Step 5: Implement recipe listing and today response**

`today` must find the authenticated user's membership, load the household timezone, resolve the business date, create a `DRAFT` menu if the unique business row is absent, and map selections relative to the current user. A concurrent create catches `DuplicateKeyException` and reloads the existing row.

```java
public record TodayMenuResponse(
        Long id, LocalDate menuDate, String status, Long version,
        int mySelectionCount, int partnerSelectionCount, int consensusCount,
        List<Long> selectedRecipeIds, List<MenuDishResponse> dishes,
        Long confirmedBy, Instant confirmedAt, Long completedBy,
        Instant completedAt, Long recordId) {}
```

- [x] **Step 6: Run focused tests**

Run: `cd ../osheeep-server && mvn -Dtest=BusinessDateResolverTest,DinnerMenuServiceTest test`

Expected: PASS.

- [x] **Step 7: Commit Task 2**

```bash
git add src/main/java/com/osheeep/server/dinner src/test/java/com/osheeep/server/dinner/menu
git commit -m "feat: read merged dinner menu"
```

### Task 3: 批量选择、版本冲突与确认状态机

**Files:**
- Modify: `../osheeep-server/src/main/java/com/osheeep/server/dinner/menu/DinnerMenuService.java`
- Modify: `../osheeep-server/src/main/java/com/osheeep/server/common/error/ErrorCode.java`
- Test: `../osheeep-server/src/test/java/com/osheeep/server/dinner/menu/DinnerMenuServiceTest.java`

**Interfaces:**
- Consumes: Task 2 `today` response and Task 1 `selectByHouseholdAndDateForUpdate`.
- Produces: `updateSelections(Long,List<Long>,long)` and `confirm(Long,long,String)`.

- [x] **Step 1: Add failing selection/state tests**

```java
@Test
void confirmedMenuReturnsToDraftWhenSelectionsChange() {
    DinnerMenuEntity menu = menu("CONFIRMED", 4L);
    when(menuMapper.selectByHouseholdAndDateForUpdate(11L, DATE)).thenReturn(menu);

    service.updateSelections(7L, List.of(1L, 2L), 4L);

    assertThat(menu.getStatus()).isEqualTo("DRAFT");
    assertThat(menu.getVersion()).isEqualTo(5L);
    assertThat(menu.getConfirmedBy()).isNull();
}

@Test
void staleVersionDoesNotReplaceSelections() {
    when(menuMapper.selectByHouseholdAndDateForUpdate(11L, DATE)).thenReturn(menu("DRAFT", 6L));

    assertThatThrownBy(() -> service.updateSelections(7L, List.of(1L), 5L))
            .isInstanceOfSatisfying(BusinessException.class, error ->
                    assertThat(error.errorCode()).isEqualTo(ErrorCode.DINNER_MENU_VERSION_CONFLICT));
    verify(selectionMapper, never()).delete(any());
}
```

- [x] **Step 2: Run tests and observe missing methods/error codes**

Run: `cd ../osheeep-server && mvn -Dtest=DinnerMenuServiceTest test`

Expected: FAIL at compilation.

- [x] **Step 3: Implement transactional replacement**

Inside one transaction: lock today's menu, compare versions, validate every ID is an active system recipe, delete only the current user's old selections, insert the requested unique IDs, reset confirmed fields when the set changed, and increment version once.

```java
if (!Objects.equals(menu.getVersion(), expectedVersion)) {
    throw new BusinessException(ErrorCode.DINNER_MENU_VERSION_CONFLICT);
}
if ("COMPLETED".equals(menu.getStatus())) {
    throw new BusinessException(ErrorCode.DINNER_MENU_COMPLETED);
}
```

- [x] **Step 4: Implement idempotent confirmation**

Confirmation locks the menu, returns without mutation when `idempotency_key` already exists, rejects empty merged selections, compares version, sets `CONFIRMED`, actor/time, increments version, and inserts a `CONFIRM` action row.

- [x] **Step 5: Run state tests**

Run: `cd ../osheeep-server && mvn -Dtest=DinnerMenuServiceTest test`

Expected: PASS for empty menu, version conflict, confirmation, duplicate key and confirmed-to-draft cases.

- [x] **Step 6: Commit Task 3**

```bash
git add src/main/java/com/osheeep/server/dinner/menu src/main/java/com/osheeep/server/common/error/ErrorCode.java src/test/java/com/osheeep/server/dinner/menu/DinnerMenuServiceTest.java
git commit -m "feat: update and confirm dinner menu"
```

### Task 4: 幂等完成、记录与 API 控制器

**Files:**
- Create: `../osheeep-server/src/main/java/com/osheeep/server/dinner/record/DinnerRecordService.java`
- Create: `../osheeep-server/src/main/java/com/osheeep/server/dinner/menu/dto/UpdateSelectionsRequest.java`
- Create: `../osheeep-server/src/main/java/com/osheeep/server/dinner/menu/dto/MenuActionRequest.java`
- Create: `../osheeep-server/src/main/java/com/osheeep/server/dinner/record/dto/RecordSummaryResponse.java`
- Create: `../osheeep-server/src/main/java/com/osheeep/server/dinner/record/dto/RecordDetailResponse.java`
- Create: `../osheeep-server/src/main/java/com/osheeep/server/dinner/menu/DinnerMenuController.java`
- Create: `../osheeep-server/src/main/java/com/osheeep/server/dinner/recipe/DinnerRecipeController.java`
- Create: `../osheeep-server/src/main/java/com/osheeep/server/dinner/record/DinnerRecordController.java`
- Modify: `../osheeep-server/src/main/java/com/osheeep/server/dinner/menu/DinnerMenuService.java`
- Modify: `../osheeep-server/docs/api-contract.md`
- Test: `../osheeep-server/src/test/java/com/osheeep/server/dinner/menu/DinnerMenuControllerTest.java`
- Test: `../osheeep-server/src/test/java/com/osheeep/server/dinner/record/DinnerRecordServiceTest.java`

**Interfaces:**
- Consumes: confirmed menu and snapshot mappers.
- Produces: the seven approved HTTP endpoints and `complete(Long,long,String)` returning `recordId` plus latest menu.

- [x] **Step 1: Write failing completion idempotency test**

```java
@Test
void repeatedCompleteReturnsTheExistingRecord() {
    when(recordMapper.selectOne(any())).thenReturn(record(91L, 31L));

    var result = service.complete(7L, 5L, "action-1");

    assertThat(result.recordId()).isEqualTo(91L);
    verify(recordMapper, never()).insert(any());
    verify(snapshotMapper, never()).insert(any());
}
```

- [x] **Step 2: Run focused tests and confirm missing record service**

Run: `cd ../osheeep-server && mvn -Dtest=DinnerRecordServiceTest test`

Expected: FAIL at compilation.

- [x] **Step 3: Implement completion and snapshot transaction**

Require `CONFIRMED`, lock the menu, check version, reuse an existing record by unique `menu_id`, otherwise insert the record and one snapshot per merged dish, update menu to `COMPLETED`, increment version and insert a `COMPLETE` action. Catch concurrent record `DuplicateKeyException` and reload the winner.

- [x] **Step 4: Write failing controller contract tests**

```java
mockMvc.perform(authenticated(put("/api/dinner/menus/today/selections"))
        .contentType(MediaType.APPLICATION_JSON)
        .content("{\"recipeIds\":[1,2],\"version\":4}"))
    .andExpect(status().isOk())
    .andExpect(jsonPath("$.data.version").value(5));

mockMvc.perform(authenticated(post("/api/dinner/menus/today/complete"))
        .contentType(MediaType.APPLICATION_JSON)
        .content("{\"version\":5,\"idempotencyKey\":\"action-1\"}"))
    .andExpect(status().isOk())
    .andExpect(jsonPath("$.data.recordId").value(91));
```

- [x] **Step 5: Implement controllers and API contract**

Controllers read `CurrentUser.id()` exclusively, validate nonnegative version and nonblank idempotency key, and wrap results in `ApiResponse.ok`. Record service validates the requesting user still belongs to the record's household.

- [x] **Step 6: Run the full backend suite**

Run: `cd ../osheeep-server && mvn test`

Expected: BUILD SUCCESS, existing 55 tests plus all new tests pass.

- [x] **Step 7: Commit Task 4**

```bash
git add src/main/java src/test/java docs/api-contract.md
git commit -m "feat: complete dinner menu and records"
```

### Task 5: 前端类型、Service 与纯状态逻辑

**Files:**
- Create: `miniprogram/types/recipe.ts`
- Create: `miniprogram/types/menu.ts`
- Create: `miniprogram/types/record.ts`
- Create: `miniprogram/services/recipe-service.ts`
- Create: `miniprogram/services/menu-service.ts`
- Create: `miniprogram/services/record-service.ts`
- Create: `miniprogram/utils/menu-state.ts`
- Create: `tests/menu-service.test.ts`
- Create: `tests/menu-state.test.ts`
- Modify: `miniprogram/app.ts`

**Interfaces:**
- Consumes: existing request client.
- Produces: App methods `getRecipes`, `getTodayMenu`, `saveSelections`, `confirmTodayMenu`, `completeTodayMenu`, `getRecords`, `getRecord`; pure `createIdempotencyKey()` and action-state helpers.

- [x] **Step 1: Write failing service tests**

```ts
await service.saveSelections([1, 2], 4);
expect(request).toHaveBeenCalledWith('/api/dinner/menus/today/selections', {
  method: 'PUT',
  data: { recipeIds: [1, 2], version: 4 },
});

await service.confirm(5, 'action-1');
expect(request).toHaveBeenCalledWith('/api/dinner/menus/today/confirm', {
  method: 'POST',
  data: { version: 5, idempotencyKey: 'action-1' },
});
```

- [x] **Step 2: Run tests and confirm modules are missing**

Run: `npm test -- menu-service.test.ts menu-state.test.ts`

Expected: FAIL because the modules do not exist.

- [x] **Step 3: Implement exact client types and services**

```ts
export interface TodayMenu {
  id: number;
  menuDate: string;
  status: 'DRAFT' | 'CONFIRMED' | 'COMPLETED';
  version: number;
  mySelectionCount: number;
  partnerSelectionCount: number;
  consensusCount: number;
  selectedRecipeIds: number[];
  dishes: MenuDish[];
  confirmedBy?: number;
  confirmedAt?: string;
  completedBy?: number;
  completedAt?: string;
  recordId?: number;
}
```

`createIdempotencyKey` uses `wx.getRandomValues` when available and a timestamp/random fallback that still returns UUID-v4 shape; the key is created once per button attempt and retained until that request resolves or fails definitively.

- [x] **Step 4: Register App methods and verify**

Run: `npm test -- menu-service.test.ts menu-state.test.ts && npm run typecheck`

Expected: PASS.

- [ ] **Step 5: Commit Task 5**

```bash
git add miniprogram/types miniprogram/services miniprogram/utils miniprogram/app.ts tests
git commit -m "feat: add dinner menu client services"
```

### Task 6: 真实菜品资产与四入口页面骨架

**Files:**
- Create: `miniprogram/assets/recipes/*.jpg` (8 files)
- Create: `miniprogram/pages/recipes/index.{ts,json,wxml,wxss}`
- Create: `miniprogram/pages/records/index.{ts,json,wxml,wxss}`
- Create: `miniprogram/pages/record-detail/index.{ts,json,wxml,wxss}`
- Create: `miniprogram/pages/profile/index.{ts,json,wxml,wxss}`
- Modify: `miniprogram/pages/tonight/index.{ts,wxml,wxss}`
- Modify: `miniprogram/app.json`
- Modify: `tests/project-structure.test.ts`

**Interfaces:**
- Consumes: Task 5 App methods and local `/assets/recipes/*.jpg` paths returned by the API.
- Produces: navigable tonight, recipe selection, record list/detail and profile pages.

- [ ] **Step 1: Add failing route/asset structure assertions**

```ts
expect(appConfig.pages).toEqual(expect.arrayContaining([
  'pages/tonight/index', 'pages/recipes/index',
  'pages/records/index', 'pages/record-detail/index', 'pages/profile/index',
]));
for (const slug of recipeSlugs) {
  expect(existsSync(join(root, `miniprogram/assets/recipes/${slug}.jpg`))).toBe(true);
}
```

- [ ] **Step 2: Run structure test and confirm missing routes/assets**

Run: `npm test -- project-structure.test.ts`

Expected: FAIL.

- [ ] **Step 3: Generate eight recipe thumbnails using imagegen**

Generate one isolated 1:1 image per approved dish: realistic Chinese home cooking, warm natural window light, three-quarter tabletop view, neutral ceramic plate, clean off-white background, no people, text, logo or watermark. Inspect each image, then place the final JPEGs under `miniprogram/assets/recipes/` using the exact slugs seeded by V4.

- [ ] **Step 4: Implement route skeletons and bottom navigation**

Use a consistent bottom navigation component or native tab configuration for “今晚、菜谱、记录、我的”. Every visible entry must navigate to a working page; no dead controls. Profile reuses `getHousehold` and links to the existing invite page.

- [ ] **Step 5: Verify routes, types and assets**

Run: `npm test -- project-structure.test.ts && npm run typecheck && npm run lint`

Expected: PASS.

- [ ] **Step 6: Commit Task 6**

```bash
git add miniprogram/assets miniprogram/pages miniprogram/app.json tests/project-structure.test.ts
git commit -m "feat: add dinner navigation and recipe assets"
```

### Task 7: 今晚菜单交互、轮询与冲突恢复

**Files:**
- Modify: `miniprogram/pages/tonight/index.{ts,wxml,wxss}`
- Modify: `miniprogram/pages/recipes/index.{ts,wxml,wxss}`
- Modify: `miniprogram/pages/records/index.{ts,wxml,wxss}`
- Modify: `miniprogram/pages/record-detail/index.{ts,wxml,wxss}`
- Create: `miniprogram/utils/menu-errors.ts`
- Create: `tests/menu-polling.test.ts`
- Create: `tests/menu-errors.test.ts`
- Modify: `design-qa.md`

**Interfaces:**
- Consumes: Task 5 services and Task 6 pages/assets.
- Produces: complete visual states and `startMenuPolling(load, scheduler, 8000)` returning a stop function.

- [ ] **Step 1: Write failing polling and error tests**

```ts
const stop = startMenuPolling(load, scheduler, 8000);
expect(load).toHaveBeenCalledTimes(1);
scheduler.tick(8000);
expect(load).toHaveBeenCalledTimes(2);
stop();
scheduler.tick(8000);
expect(load).toHaveBeenCalledTimes(2);

expect(toMenuErrorMessage('DINNER_MENU_VERSION_CONFLICT'))
  .toBe('菜单已被对方更新，请确认最新内容后重新保存');
```

- [ ] **Step 2: Run tests and confirm helpers are missing**

Run: `npm test -- menu-polling.test.ts menu-errors.test.ts`

Expected: FAIL.

- [ ] **Step 3: Implement tonight states and actions**

`onShow` loads immediately and starts polling; `onHide/onUnload` stop it. Empty and draft states link to recipes. Confirm/complete create one idempotency key per attempt, disable the button while pending, replace the page snapshot on success, and retain content on network failure.

- [ ] **Step 4: Implement batch selection and conflict recovery**

Recipes page copies `selectedRecipeIds` into a local `Set<number>`. Save sends the full sorted array and original version. On `DINNER_MENU_VERSION_CONFLICT`, fetch latest, retain the local set, update the base version, display the conflict banner and require an explicit second save.

- [ ] **Step 5: Implement records and visual matching**

Use the approved single-column menu, visible source labels, confirmed/reconfirm banners, fixed safe-area actions, record snapshots and empty record state. Compare source and simulator screenshots in the same visual input and record iterations in `design-qa.md`.

- [ ] **Step 6: Run full frontend verification**

Run: `npm test && npm run typecheck && npm run lint && npm run format:check`

Expected: all suites PASS with zero type, lint or formatting errors.

- [ ] **Step 7: Commit Task 7**

```bash
git add miniprogram tests design-qa.md
git commit -m "feat: implement collaborative dinner menu"
```

### Task 8: V4 真实迁移、双账号验收与交付

**Files:**
- Modify: `docs/superpowers/plans/2026-07-11-tonight-menu-core.md`
- Modify: `design-qa.md`

**Interfaces:**
- Consumes: both completed repositories, two WeChat developer accounts and local profile.
- Produces: verified A/B menu flow and synchronized pushed `main` branches.

- [ ] **Step 1: Run fresh automated verification**

Run backend: `cd ../osheeep-server && mvn test`

Run frontend: `npm test && npm run typecheck && npm run lint && npm run format:check`

Expected: both commands exit 0.

- [ ] **Step 2: Start local backend and apply V4**

Run: `cd ../osheeep-server && set -a; source .env.local; set +a; mvn org.springframework.boot:spring-boot-maven-plugin:3.5.16:run -Dspring-boot.run.profiles=local`

Expected: Flyway reports schema version 4 and `/actuator/health` returns `UP`.

- [ ] **Step 3: Complete two-account behavioral acceptance**

Use A to select 番茄炒蛋 and 小炒黄牛肉; use B to select 番茄炒蛋 and 紫菜蛋花汤. Verify both clients show three merged dishes and 番茄炒蛋 as “都想吃”. Confirm as either account, modify as the other, reconfirm, then tap complete from both clients and verify only one record ID exists.

- [ ] **Step 4: Complete visual acceptance**

Capture 390px empty, single-user, merged draft, confirmed, reconfirm, completed record and conflict states. Check 375 and 430px for horizontal overflow, fixed action overlap and safe-area problems. `design-qa.md` must end with `final result: passed` and contain no unresolved P0/P1/P2 finding.

- [ ] **Step 5: Commit acceptance records**

```bash
git add docs/superpowers/plans/2026-07-11-tonight-menu-core.md design-qa.md
git commit -m "docs: complete dinner menu acceptance"
```

- [ ] **Step 6: Push only after explicit user authorization**

```bash
git push origin main
cd ../osheeep-server && git push origin main
```
