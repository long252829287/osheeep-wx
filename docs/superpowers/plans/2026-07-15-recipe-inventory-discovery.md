# 食材库存与找菜核心 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为双人家庭增加共享食材库存、确定性的菜谱匹配和新的找菜首页，让用户可以从“家里有什么”直接找到今晚能做的系统菜。

**Architecture:** `osheeep-server` 通过新的 V5 迁移保存标准食材、系统菜所需食材和家庭库存；库存项目独立使用乐观版本，纯 `RecipeMatchCalculator` 计算匹配状态，菜谱服务只编排当前家庭数据。`osheeep-wx` 增加库存 service、纯找菜视图模型和库存页面，并按已确认的方向重做现有菜谱页；本计划保持现有今晚菜单写接口兼容。

**Tech Stack:** Java 21、Spring Boot 3.5.16、MyBatis-Plus 3.5.17、MySQL 8、Flyway、JUnit 5、MockMvc；微信原生小程序、TypeScript 5.9、WXML、WXSS、Jest。

## Global Constraints

- 两个仓库继续直接使用 `main`；保留所有现有提交和用户文件。
- 不修改已经执行的 `V1` 至 `V4`；数据库变化只新增 `V5`。
- 当前仍限定一个家庭最多两名成员；服务端从登录用户的 ACTIVE 成员关系推导家庭 ID。
- 食材数量使用 `DECIMAL(12,3)`；数量允许为空，单位不能为空。
- 库存项目单独使用 `version`；过期版本返回 HTTP 409 与 `DINNER_INVENTORY_VERSION_CONFLICT`。
- “只看能做”排除 `MISSING`，但保留 `UNKNOWN_QUANTITY` 并展示“数量待确认”。
- 临时包含/排除食材只存在于当前页面状态，不写入家庭库存。
- 保持现有 `GET /api/dinner/recipes` 和今晚菜单选择接口可用；扩展响应字段，不删除现有字段。
- UI 以 `docs/design/formal-release/recipe-discovery-final-direction.png` 为结构和视觉依据，优先适配 390 × 844，并覆盖 375～430px。
- 本计划不新增或生成菜品图片；现有图片只作为开发期占位，正式版发布前由独立真实图库计划全部替换。
- 不实现自定义菜谱写入、做法版本、家庭角色管理、消息中心、订阅消息或库存扣减；它们分别进入独立实施计划。
- 每个任务先写失败测试，再做最小实现；每个任务完成后提交对应仓库。

---

### Task 1: V5 食材、菜谱食材与家庭库存持久层

**Files:**

- Create: `../osheeep-server/src/main/resources/db/migration/V5__add_recipe_ingredients_and_household_inventory.sql`
- Create: `../osheeep-server/src/main/java/com/osheeep/server/dinner/ingredient/entity/DinnerIngredientEntity.java`
- Create: `../osheeep-server/src/main/java/com/osheeep/server/dinner/ingredient/entity/DinnerHouseholdInventoryEntity.java`
- Create: `../osheeep-server/src/main/java/com/osheeep/server/dinner/ingredient/mapper/DinnerIngredientMapper.java`
- Create: `../osheeep-server/src/main/java/com/osheeep/server/dinner/ingredient/mapper/DinnerHouseholdInventoryMapper.java`
- Create: `../osheeep-server/src/main/java/com/osheeep/server/dinner/recipe/entity/DinnerRecipeIngredientEntity.java`
- Create: `../osheeep-server/src/main/java/com/osheeep/server/dinner/recipe/mapper/DinnerRecipeIngredientMapper.java`
- Test: `../osheeep-server/src/test/java/com/osheeep/server/dinner/ingredient/DinnerIngredientPersistenceContractTest.java`

**Interfaces:**

- Consumes: existing `dinner_households(id)` and `dinner_recipes(id)`.
- Produces: three mapper interfaces and entity fields matching V5; later tasks consume `selectByHouseholdAndIngredientForUpdate(Long, Long)`.

- [x] **Step 1: Write the failing persistence contract test**

```java
@Test
void inventoryExposesOptimisticVersionAndLockingLookup() throws Exception {
    DinnerHouseholdInventoryEntity item = new DinnerHouseholdInventoryEntity();
    item.setHouseholdId(11L);
    item.setIngredientId(3L);
    item.setQuantity(new BigDecimal("8.000"));
    item.setUnit("枚");
    item.setVersion(2L);

    assertThat(item.getVersion()).isEqualTo(2L);
    assertThat(DinnerHouseholdInventoryMapper.class.getMethod(
            "selectByHouseholdAndIngredientForUpdate", Long.class, Long.class)).isNotNull();
}
```

- [x] **Step 2: Run the test and verify RED**

Run: `cd ../osheeep-server && mvn -Dtest=DinnerIngredientPersistenceContractTest test`

Expected: FAIL at compilation because the ingredient and inventory types do not exist.

- [x] **Step 3: Add the exact V5 schema**

```sql
CREATE TABLE dinner_ingredients (
    id BIGINT NOT NULL AUTO_INCREMENT,
    scope VARCHAR(16) NOT NULL DEFAULT 'SYSTEM',
    household_id BIGINT NULL,
    owner_household_id BIGINT GENERATED ALWAYS AS (COALESCE(household_id, 0)) STORED,
    name VARCHAR(64) NOT NULL,
    category VARCHAR(32) NOT NULL,
    default_unit VARCHAR(16) NOT NULL,
    status VARCHAR(16) NOT NULL DEFAULT 'ACTIVE',
    created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
    PRIMARY KEY (id),
    UNIQUE KEY uk_dinner_ingredient_scope_name (scope, owner_household_id, name),
    KEY idx_dinner_ingredient_category_status (category, status),
    CONSTRAINT fk_dinner_ingredient_household
        FOREIGN KEY (household_id) REFERENCES dinner_households (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE dinner_recipe_ingredients (
    id BIGINT NOT NULL AUTO_INCREMENT,
    recipe_id BIGINT NOT NULL,
    ingredient_id BIGINT NOT NULL,
    quantity DECIMAL(12,3) NULL,
    unit VARCHAR(16) NOT NULL,
    is_required TINYINT(1) NOT NULL DEFAULT 1,
    sort_order INT NOT NULL,
    PRIMARY KEY (id),
    UNIQUE KEY uk_dinner_recipe_ingredient (recipe_id, ingredient_id),
    KEY idx_dinner_recipe_ingredients_recipe (recipe_id, sort_order),
    CONSTRAINT fk_dinner_recipe_ingredient_recipe
        FOREIGN KEY (recipe_id) REFERENCES dinner_recipes (id),
    CONSTRAINT fk_dinner_recipe_ingredient_ingredient
        FOREIGN KEY (ingredient_id) REFERENCES dinner_ingredients (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE dinner_household_inventory (
    id BIGINT NOT NULL AUTO_INCREMENT,
    household_id BIGINT NOT NULL,
    ingredient_id BIGINT NOT NULL,
    quantity DECIMAL(12,3) NULL,
    unit VARCHAR(16) NOT NULL,
    version BIGINT NOT NULL DEFAULT 0,
    updated_by BIGINT NOT NULL,
    created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
    PRIMARY KEY (id),
    UNIQUE KEY uk_dinner_household_inventory (household_id, ingredient_id),
    KEY idx_dinner_inventory_household_updated (household_id, updated_at),
    CONSTRAINT fk_dinner_inventory_household
        FOREIGN KEY (household_id) REFERENCES dinner_households (id),
    CONSTRAINT fk_dinner_inventory_ingredient
        FOREIGN KEY (ingredient_id) REFERENCES dinner_ingredients (id),
    CONSTRAINT fk_dinner_inventory_updated_by
        FOREIGN KEY (updated_by) REFERENCES users (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
```

The same migration inserts the exact initial dictionary:

```sql
INSERT INTO dinner_ingredients (scope, name, category, default_unit) VALUES
    ('SYSTEM', '番茄', '蔬菜', '个'),
    ('SYSTEM', '鸡蛋', '蛋奶', '枚'),
    ('SYSTEM', '牛肉', '肉类', '克'),
    ('SYSTEM', '油麦菜', '蔬菜', '克'),
    ('SYSTEM', '鸡肉', '肉类', '克'),
    ('SYSTEM', '大米', '主食', '克'),
    ('SYSTEM', '紫菜', '干货', '克'),
    ('SYSTEM', '鸡翅', '肉类', '只'),
    ('SYSTEM', '西兰花', '蔬菜', '克'),
    ('SYSTEM', '土豆', '蔬菜', '个'),
    ('SYSTEM', '青椒', '蔬菜', '个'),
    ('SYSTEM', '蒜', '调味料', '瓣'),
    ('SYSTEM', '葱', '调味料', '根'),
    ('SYSTEM', '姜', '调味料', '克'),
    ('SYSTEM', '食用油', '调味料', '毫升'),
    ('SYSTEM', '盐', '调味料', '克'),
    ('SYSTEM', '生抽', '调味料', '毫升'),
    ('SYSTEM', '可乐', '饮品', '毫升');

INSERT INTO dinner_recipe_ingredients
    (recipe_id, ingredient_id, quantity, unit, is_required, sort_order)
SELECT r.id, i.id, seed.quantity, seed.unit, seed.is_required, seed.sort_order
FROM (
    SELECT '番茄炒蛋' recipe_name, '番茄' ingredient_name, 2.000 quantity, '个' unit, 1 is_required, 1 sort_order
    UNION ALL SELECT '番茄炒蛋', '鸡蛋', 3.000, '枚', 1, 2
    UNION ALL SELECT '小炒黄牛肉', '牛肉', 300.000, '克', 1, 1
    UNION ALL SELECT '小炒黄牛肉', '青椒', 2.000, '个', 1, 2
    UNION ALL SELECT '清炒油麦菜', '油麦菜', 400.000, '克', 1, 1
    UNION ALL SELECT '清炒油麦菜', '蒜', 3.000, '瓣', 0, 2
    UNION ALL SELECT '黄焖鸡米饭', '鸡肉', 400.000, '克', 1, 1
    UNION ALL SELECT '黄焖鸡米饭', '大米', 200.000, '克', 1, 2
    UNION ALL SELECT '紫菜蛋花汤', '紫菜', 10.000, '克', 1, 1
    UNION ALL SELECT '紫菜蛋花汤', '鸡蛋', 2.000, '枚', 1, 2
    UNION ALL SELECT '可乐鸡翅', '鸡翅', 8.000, '只', 1, 1
    UNION ALL SELECT '可乐鸡翅', '可乐', 330.000, '毫升', 1, 2
    UNION ALL SELECT '蒜蓉西兰花', '西兰花', 400.000, '克', 1, 1
    UNION ALL SELECT '蒜蓉西兰花', '蒜', 4.000, '瓣', 1, 2
    UNION ALL SELECT '青椒土豆丝', '土豆', 2.000, '个', 1, 1
    UNION ALL SELECT '青椒土豆丝', '青椒', 1.000, '个', 1, 2
) seed
JOIN dinner_recipes r ON r.name = seed.recipe_name AND r.scope = 'SYSTEM'
JOIN dinner_ingredients i ON i.name = seed.ingredient_name AND i.scope = 'SYSTEM';
```

- [x] **Step 4: Implement entities and locking mapper**

```java
@Mapper
public interface DinnerHouseholdInventoryMapper
        extends BaseMapper<DinnerHouseholdInventoryEntity> {
    @Select("""
            SELECT * FROM dinner_household_inventory
            WHERE household_id = #{householdId} AND ingredient_id = #{ingredientId}
            FOR UPDATE
            """)
    DinnerHouseholdInventoryEntity selectByHouseholdAndIngredientForUpdate(
            Long householdId, Long ingredientId);
}
```

Each entity uses existing project conventions: `@TableName`, `@TableId(type = IdType.AUTO)`, explicit `@TableField` for snake-case names, `BigDecimal` for quantity, `LocalDateTime` for timestamps, and ordinary getters/setters.

- [x] **Step 5: Run the persistence contract test**

Run: `cd ../osheeep-server && mvn -Dtest=DinnerIngredientPersistenceContractTest test`

Expected: PASS.

- [x] **Step 6: Commit Task 1**

```bash
cd ../osheeep-server
git add src/main/resources/db/migration/V5__add_recipe_ingredients_and_household_inventory.sql src/main/java/com/osheeep/server/dinner/ingredient src/main/java/com/osheeep/server/dinner/recipe/entity/DinnerRecipeIngredientEntity.java src/main/java/com/osheeep/server/dinner/recipe/mapper/DinnerRecipeIngredientMapper.java src/test/java/com/osheeep/server/dinner/ingredient/DinnerIngredientPersistenceContractTest.java
git commit -m "feat: add dinner ingredient persistence"
```

### Task 2: 食材目录与家庭库存 API

**Files:**

- Create: `../osheeep-server/src/main/java/com/osheeep/server/dinner/ingredient/DinnerIngredientService.java`
- Create: `../osheeep-server/src/main/java/com/osheeep/server/dinner/ingredient/DinnerIngredientController.java`
- Create: `../osheeep-server/src/main/java/com/osheeep/server/dinner/ingredient/dto/IngredientResponse.java`
- Create: `../osheeep-server/src/main/java/com/osheeep/server/dinner/ingredient/dto/InventoryItemResponse.java`
- Create: `../osheeep-server/src/main/java/com/osheeep/server/dinner/ingredient/dto/UpsertInventoryItemRequest.java`
- Modify: `../osheeep-server/src/main/java/com/osheeep/server/common/error/ErrorCode.java`
- Test: `../osheeep-server/src/test/java/com/osheeep/server/dinner/ingredient/DinnerIngredientServiceTest.java`
- Test: `../osheeep-server/src/test/java/com/osheeep/server/dinner/ingredient/DinnerIngredientControllerTest.java`

**Interfaces:**

- Consumes: Task 1 mappers and existing `DinnerHouseholdMemberMapper`.
- Produces: `listIngredients(Long)`, `listInventory(Long)`, `upsertInventoryItem(Long,Long,BigDecimal,String,long)`, `removeInventoryItem(Long,Long,long)` and four HTTP routes.

- [x] **Step 1: Write failing inventory service tests**

```java
@Test
void updatingAnInventoryItemIncrementsVersion() {
    DinnerHouseholdInventoryEntity item = inventory(11L, 3L, "6.000", "枚", 2L);
    when(memberMapper.selectOne(any())).thenReturn(member(11L, 7L));
    when(inventoryMapper.selectByHouseholdAndIngredientForUpdate(11L, 3L))
            .thenReturn(item);

    InventoryItemResponse result = service.upsertInventoryItem(
            7L, 3L, new BigDecimal("8.000"), "枚", 2L);

    assertThat(result.quantity()).isEqualByComparingTo("8.000");
    assertThat(result.version()).isEqualTo(3L);
    assertThat(item.getUpdatedBy()).isEqualTo(7L);
}

@Test
void staleInventoryVersionDoesNotMutateTheItem() {
    DinnerHouseholdInventoryEntity item = inventory(11L, 3L, "6.000", "枚", 4L);
    when(memberMapper.selectOne(any())).thenReturn(member(11L, 7L));
    when(inventoryMapper.selectByHouseholdAndIngredientForUpdate(11L, 3L))
            .thenReturn(item);

    assertThatThrownBy(() -> service.upsertInventoryItem(
            7L, 3L, new BigDecimal("8.000"), "枚", 3L))
            .isInstanceOfSatisfying(BusinessException.class, error ->
                    assertThat(error.errorCode())
                            .isEqualTo(ErrorCode.DINNER_INVENTORY_VERSION_CONFLICT));
    assertThat(item.getQuantity()).isEqualByComparingTo("6.000");
}
```

- [x] **Step 2: Run focused tests and verify RED**

Run: `cd ../osheeep-server && mvn -Dtest=DinnerIngredientServiceTest,DinnerIngredientControllerTest test`

Expected: FAIL because the service, DTOs, controller and error codes do not exist.

- [x] **Step 3: Define DTO contracts and validation**

```java
public record IngredientResponse(
        Long id, String name, String category, String defaultUnit) {}

public record InventoryItemResponse(
        Long ingredientId, String name, String category,
        BigDecimal quantity, String unit, Long version,
        Long updatedBy, Instant updatedAt) {}

public record UpsertInventoryItemRequest(
        @DecimalMin(value = "0.000") BigDecimal quantity,
        @NotBlank @Size(max = 16) String unit,
        @NotNull @PositiveOrZero Long version) {}
```

Add exact errors:

```java
DINNER_INGREDIENT_INVALID(HttpStatus.BAD_REQUEST, "Dinner ingredient is invalid"),
DINNER_INVENTORY_VERSION_CONFLICT(
        HttpStatus.CONFLICT, "Dinner inventory was updated by another member"),
DINNER_INVENTORY_ITEM_NOT_FOUND(HttpStatus.NOT_FOUND, "Dinner inventory item was not found"),
```

- [x] **Step 4: Implement service transaction rules**

```java
@Transactional
public InventoryItemResponse upsertInventoryItem(
        Long userId, Long ingredientId, BigDecimal quantity, String unit, long expectedVersion) {
    DinnerHouseholdMemberEntity membership = requireMembership(userId);
    requireActiveIngredient(ingredientId, membership.getHouseholdId());
    DinnerHouseholdInventoryEntity item = inventoryMapper
            .selectByHouseholdAndIngredientForUpdate(membership.getHouseholdId(), ingredientId);
    if (item == null) {
        if (expectedVersion != 0L) {
            throw new BusinessException(ErrorCode.DINNER_INVENTORY_VERSION_CONFLICT);
        }
        item = new DinnerHouseholdInventoryEntity();
        item.setHouseholdId(membership.getHouseholdId());
        item.setIngredientId(ingredientId);
        item.setVersion(0L);
        item.setQuantity(quantity);
        item.setUnit(unit.strip());
        item.setUpdatedBy(userId);
        inventoryMapper.insert(item);
    } else {
        if (!Objects.equals(item.getVersion(), expectedVersion)) {
            throw new BusinessException(ErrorCode.DINNER_INVENTORY_VERSION_CONFLICT);
        }
        item.setQuantity(quantity);
        item.setUnit(unit.strip());
        item.setUpdatedBy(userId);
        item.setVersion(item.getVersion() + 1L);
        inventoryMapper.updateById(item);
    }
    return toInventoryResponse(item);
}
```

`removeInventoryItem` locks the item, compares the exact version, deletes only the current household row, and treats a repeated delete as `DINNER_INVENTORY_ITEM_NOT_FOUND`.

- [x] **Step 5: Expose exact HTTP routes**

```text
GET    /api/dinner/ingredients
GET    /api/dinner/inventory
PUT    /api/dinner/inventory/{ingredientId}
DELETE /api/dinner/inventory/{ingredientId}?version={version}
```

Controller methods obtain `CurrentUser` exactly as existing dinner controllers do; no request accepts `householdId` or `userId`.

- [x] **Step 6: Run focused tests**

Run: `cd ../osheeep-server && mvn -Dtest=DinnerIngredientServiceTest,DinnerIngredientControllerTest test`

Expected: PASS for list, create, update, delete, invalid ingredient, missing membership and stale version cases.

- [x] **Step 7: Commit Task 2**

```bash
git add src/main/java/com/osheeep/server/dinner/ingredient src/main/java/com/osheeep/server/common/error/ErrorCode.java src/test/java/com/osheeep/server/dinner/ingredient
git commit -m "feat: manage household ingredients"
```

### Task 3: 纯菜谱匹配计算器

**Files:**

- Create: `../osheeep-server/src/main/java/com/osheeep/server/dinner/recipe/RecipeMatchCalculator.java`
- Create: `../osheeep-server/src/main/java/com/osheeep/server/dinner/recipe/dto/RecipeIngredientResponse.java`
- Create: `../osheeep-server/src/main/java/com/osheeep/server/dinner/recipe/dto/RecipeMatchResponse.java`
- Test: `../osheeep-server/src/test/java/com/osheeep/server/dinner/recipe/RecipeMatchCalculatorTest.java`

**Interfaces:**

- Consumes: immutable recipe requirement and inventory value records.
- Produces: `RecipeMatchCalculator.calculate(List<Requirement>, Map<Long,Stock>)` with deterministic status and sorting fields.

- [x] **Step 1: Write the failing match matrix tests**

```java
@Test
void distinguishesAvailableUnknownAndMissingRequiredIngredients() {
    List<Requirement> requirements = List.of(
            new Requirement(1L, "番茄", new BigDecimal("2"), "个", true, 1),
            new Requirement(2L, "鸡蛋", new BigDecimal("3"), "枚", true, 2),
            new Requirement(3L, "葱", null, "根", false, 3));
    Map<Long, Stock> stock = Map.of(
            1L, new Stock(new BigDecimal("4"), "个"),
            2L, new Stock(null, "枚"));

    RecipeMatchResponse result = calculator.calculate(requirements, stock);

    assertThat(result.status()).isEqualTo("UNKNOWN_QUANTITY");
    assertThat(result.matchedRequired()).isEqualTo(2);
    assertThat(result.totalRequired()).isEqualTo(2);
    assertThat(result.missingIngredients()).isEmpty();
    assertThat(result.unknownQuantityIngredients()).containsExactly("鸡蛋");
}

@Test
void insufficientKnownQuantityIsMissing() {
    RecipeMatchResponse result = calculator.calculate(
            List.of(new Requirement(1L, "土豆", new BigDecimal("3"), "个", true, 1)),
            Map.of(1L, new Stock(new BigDecimal("2"), "个")));

    assertThat(result.status()).isEqualTo("MISSING");
    assertThat(result.missingIngredients()).containsExactly("土豆");
}
```

- [x] **Step 2: Run the calculator test and verify RED**

Run: `cd ../osheeep-server && mvn -Dtest=RecipeMatchCalculatorTest test`

Expected: FAIL at compilation because the calculator and records do not exist.

- [x] **Step 3: Implement the exact calculator contract**

```java
public final class RecipeMatchCalculator {
    public record Requirement(
            Long ingredientId, String name, BigDecimal quantity,
            String unit, boolean required, int sortOrder) {}
    public record Stock(BigDecimal quantity, String unit) {}

    public RecipeMatchResponse calculate(
            List<Requirement> requirements, Map<Long, Stock> inventory) {
        List<String> missing = new ArrayList<>();
        List<String> unknown = new ArrayList<>();
        int totalRequired = 0;
        int matchedRequired = 0;
        for (Requirement requirement : requirements.stream()
                .sorted(Comparator.comparingInt(Requirement::sortOrder)).toList()) {
            if (!requirement.required()) continue;
            totalRequired++;
            Stock stock = inventory.get(requirement.ingredientId());
            if (stock == null || !stock.unit().equals(requirement.unit())) {
                missing.add(requirement.name());
            } else if (stock.quantity() == null && requirement.quantity() != null) {
                matchedRequired++;
                unknown.add(requirement.name());
            } else if (stock.quantity() != null && requirement.quantity() != null
                    && stock.quantity().compareTo(requirement.quantity()) < 0) {
                missing.add(requirement.name());
            } else {
                matchedRequired++;
            }
        }
        String status = !missing.isEmpty()
                ? "MISSING"
                : (!unknown.isEmpty() ? "UNKNOWN_QUANTITY" : "AVAILABLE");
        int percent = totalRequired == 0
                ? 100
                : Math.round(matchedRequired * 100f / totalRequired);
        return new RecipeMatchResponse(
                status, matchedRequired, totalRequired, percent,
                List.copyOf(missing), List.copyOf(unknown));
    }
}
```

- [x] **Step 4: Run the full calculator matrix**

Run: `cd ../osheeep-server && mvn -Dtest=RecipeMatchCalculatorTest test`

Expected: PASS for absent, insufficient, unknown, optional-only, unit mismatch and complete inventory cases.

- [x] **Step 5: Commit Task 3**

```bash
git add src/main/java/com/osheeep/server/dinner/recipe/RecipeMatchCalculator.java src/main/java/com/osheeep/server/dinner/recipe/dto/RecipeIngredientResponse.java src/main/java/com/osheeep/server/dinner/recipe/dto/RecipeMatchResponse.java src/test/java/com/osheeep/server/dinner/recipe/RecipeMatchCalculatorTest.java
git commit -m "feat: calculate recipe ingredient matches"
```

### Task 4: 家庭上下文菜谱发现 API

**Files:**

- Modify: `../osheeep-server/src/main/java/com/osheeep/server/dinner/recipe/DinnerRecipeService.java`
- Modify: `../osheeep-server/src/main/java/com/osheeep/server/dinner/recipe/DinnerRecipeController.java`
- Modify: `../osheeep-server/src/main/java/com/osheeep/server/dinner/recipe/dto/RecipeResponse.java`
- Modify: `../osheeep-server/src/test/java/com/osheeep/server/dinner/recipe/DinnerRecipeServiceTest.java`
- Create: `../osheeep-server/src/test/java/com/osheeep/server/dinner/recipe/DinnerRecipeControllerTest.java`

**Interfaces:**

- Consumes: Task 1 recipe ingredient mapper, Task 2 inventory mapper and Task 3 calculator.
- Produces: household-aware `DinnerRecipeService.discover(Long, Set<Long>, Set<Long>, boolean)` and expanded recipe response.

- [x] **Step 1: Write failing discovery ordering tests**

```java
@Test
void discoverOrdersAvailableThenUnknownThenMissingAndFiltersWhenRequested() {
    when(memberMapper.selectOne(any())).thenReturn(member(11L, 7L));
    when(recipeMapper.selectList(any())).thenReturn(List.of(
            recipe(1L, "番茄炒蛋", 10),
            recipe(2L, "青椒土豆丝", 12),
            recipe(3L, "可乐鸡翅", 30)));
    when(recipeIngredientMapper.selectList(any())).thenReturn(requirementsForThreeRecipes());
    when(inventoryMapper.selectList(any())).thenReturn(inventoryForTomatoEggs());

    List<RecipeResponse> result = service.discover(7L, Set.of(), Set.of(), false);

    assertThat(result).extracting(item -> item.match().status())
            .containsExactly("AVAILABLE", "UNKNOWN_QUANTITY", "MISSING");
    assertThat(service.discover(7L, Set.of(), Set.of(), true))
            .noneMatch(item -> "MISSING".equals(item.match().status()));
}
```

- [x] **Step 2: Run discovery tests and verify RED**

Run: `cd ../osheeep-server && mvn -Dtest=DinnerRecipeServiceTest,DinnerRecipeControllerTest test`

Expected: FAIL because the service remains system-only and the response has no ingredients or match.

- [x] **Step 3: Expand the response without removing old fields**

```java
public record RecipeResponse(
        Long id,
        String name,
        String imagePath,
        String category,
        String flavor,
        Integer estimatedMinutes,
        List<RecipeIngredientResponse> ingredients,
        RecipeMatchResponse match) {}
```

`RecipeIngredientResponse` contains `ingredientId`, `name`, `quantity`, `unit`, `required`, and `sortOrder`.

- [x] **Step 4: Implement household discovery**

`discover` performs one query each for active system recipes, their ingredient rows and the current household inventory. It groups rows in memory, applies temporary include IDs as quantity-unknown stock, removes temporary exclude IDs, invokes `RecipeMatchCalculator`, filters when `onlyCookable` is true, and sorts by status rank, match percent descending, estimated minutes ascending, then recipe ID.

```java
private static int statusRank(String status) {
    return switch (status) {
        case "AVAILABLE" -> 0;
        case "UNKNOWN_QUANTITY" -> 1;
        default -> 2;
    };
}
```

- [x] **Step 5: Expose query parameters**

```java
@GetMapping
public ApiResponse<List<RecipeResponse>> list(
        @AuthenticationPrincipal CurrentUser currentUser,
        @RequestParam(defaultValue = "") Set<Long> includeIngredientIds,
        @RequestParam(defaultValue = "") Set<Long> excludeIngredientIds,
        @RequestParam(defaultValue = "false") boolean onlyCookable) {
    return ApiResponse.ok(recipeService.discover(
            currentUser.id(), includeIngredientIds, excludeIngredientIds, onlyCookable));
}
```

- [x] **Step 6: Run focused API tests**

Run: `cd ../osheeep-server && mvn -Dtest=DinnerRecipeServiceTest,DinnerRecipeControllerTest test`

Expected: PASS for default discovery, temporary include/exclude, only-cookable filtering and unauthenticated access.

- [x] **Step 7: Run all backend tests**

Run: `cd ../osheeep-server && mvn test`

Expected: all existing and new tests pass with 0 failures and 0 errors.

- [x] **Step 8: Commit Task 4**

```bash
git add src/main/java/com/osheeep/server/dinner/recipe src/test/java/com/osheeep/server/dinner/recipe
git commit -m "feat: discover recipes from household inventory"
```

### Task 5: 前端类型、service 与纯找菜视图模型

**Files:**

- Modify: `miniprogram/types/recipe.ts`
- Create: `miniprogram/types/ingredient.ts`
- Modify: `miniprogram/services/recipe-service.ts`
- Create: `miniprogram/services/ingredient-service.ts`
- Modify: `miniprogram/app.ts`
- Create: `miniprogram/utils/recipe-discovery.ts`
- Modify: `tests/menu-service.test.ts`
- Create: `tests/ingredient-service.test.ts`
- Create: `tests/recipe-discovery.test.ts`

**Interfaces:**

- Consumes: Task 2 and Task 4 HTTP contracts.
- Produces: frontend `InventoryItem`, expanded `RecipeSummary`, `RecipeDiscoveryQuery`, ingredient service and `toRecipeDiscoveryView`.

- [x] **Step 1: Write failing service mapping tests**

```ts
test('maps ingredient inventory reads and item writes', async () => {
  const request = jest.fn().mockResolvedValue([]);
  const service = createIngredientService({ request });

  await service.listIngredients();
  await service.listInventory();
  await service.saveInventoryItem(3, { quantity: 8, unit: '枚', version: 2 });
  await service.removeInventoryItem(3, 3);

  expect(request).toHaveBeenNthCalledWith(1, '/api/dinner/ingredients');
  expect(request).toHaveBeenNthCalledWith(2, '/api/dinner/inventory');
  expect(request).toHaveBeenNthCalledWith(3, '/api/dinner/inventory/3', {
    method: 'PUT',
    data: { quantity: 8, unit: '枚', version: 2 },
  });
  expect(request).toHaveBeenNthCalledWith(
    4,
    '/api/dinner/inventory/3?version=3',
    { method: 'DELETE' },
  );
});
```

- [x] **Step 2: Write failing pure view-model tests**

```ts
test('builds a focused first screen with one featured and two rows', () => {
  const view = toRecipeDiscoveryView(recipes, inventory, false);

  expect(view.pantrySummary).toBe('家里有 12 种食材');
  expect(view.featured?.matchLabel).toBe('食材齐全');
  expect(view.rows).toHaveLength(2);
  expect(view.rows[1].matchLabel).toBe('还缺 2 样');
});
```

- [x] **Step 3: Run frontend tests and verify RED**

Run: `npm test -- --runInBand tests/ingredient-service.test.ts tests/recipe-discovery.test.ts tests/menu-service.test.ts`

Expected: FAIL because ingredient types/service and discovery view model do not exist.

- [x] **Step 4: Define exact frontend types**

```ts
export interface InventoryItem {
  ingredientId: number;
  name: string;
  category: string;
  quantity?: number;
  unit: string;
  version: number;
  updatedBy: number;
  updatedAt: string;
}

export interface RecipeMatch {
  status: 'AVAILABLE' | 'UNKNOWN_QUANTITY' | 'MISSING';
  matchedRequired: number;
  totalRequired: number;
  matchPercent: number;
  missingIngredients: string[];
  unknownQuantityIngredients: string[];
}
```

Expand `RecipeSummary` with `ingredients` and `match`; preserve existing fields unchanged.

- [x] **Step 5: Implement query encoding and view model**

```ts
export interface RecipeDiscoveryQuery {
  includeIngredientIds?: number[];
  excludeIngredientIds?: number[];
  onlyCookable?: boolean;
}

const queryString = (query: RecipeDiscoveryQuery) => {
  const parts: string[] = [];
  if (query.includeIngredientIds?.length)
    parts.push(`includeIngredientIds=${query.includeIngredientIds.join(',')}`);
  if (query.excludeIngredientIds?.length)
    parts.push(`excludeIngredientIds=${query.excludeIngredientIds.join(',')}`);
  if (query.onlyCookable) parts.push('onlyCookable=true');
  return parts.length ? `?${parts.join('&')}` : '';
};
```

`toRecipeDiscoveryView` selects the first recipe as `featured`, the next two as `rows`, formats `食材齐全` / `数量待确认` / `还缺 N 样`, and exposes the first three inventory items plus `hasMoreIngredients`.

- [x] **Step 6: Run focused frontend tests**

Run: `npm test -- --runInBand tests/ingredient-service.test.ts tests/recipe-discovery.test.ts tests/menu-service.test.ts`

Expected: PASS.

- [x] **Step 7: Commit Task 5**

```bash
git add miniprogram/types miniprogram/services miniprogram/app.ts miniprogram/utils/recipe-discovery.ts tests/ingredient-service.test.ts tests/recipe-discovery.test.ts tests/menu-service.test.ts
git commit -m "feat: add recipe discovery client contracts"
```

### Task 6: 家庭食材库存页面

**Files:**

- Modify: `miniprogram/app.json`
- Create: `miniprogram/pages/ingredients/index.json`
- Create: `miniprogram/pages/ingredients/index.ts`
- Create: `miniprogram/pages/ingredients/index.wxml`
- Create: `miniprogram/pages/ingredients/index.wxss`
- Create: `miniprogram/utils/inventory-input.ts`
- Create: `miniprogram/utils/inventory-errors.ts`
- Modify: `tests/project-structure.test.ts`
- Create: `tests/inventory-input.test.ts`
- Create: `tests/ingredients-page.test.ts`

**Interfaces:**

- Consumes: Task 5 app-level ingredient methods and `InventoryItem`.
- Produces: `/pages/ingredients/index`, quantity validation and conflict recovery behavior.

- [x] **Step 1: Write failing route and page contract tests**

```ts
test('declares the household ingredient inventory page', () => {
  const app = JSON.parse(
    readFileSync(resolve(root, 'miniprogram/app.json'), 'utf8'),
  );
  expect(app.pages).toContain('pages/ingredients/index');
  expect(
    existsSync(resolve(root, 'miniprogram/pages/ingredients/index.ts')),
  ).toBe(true);
});

test.each([
  ['', undefined],
  ['0', 0],
  ['8.5', 8.5],
  ['-1', null],
  ['abc', null],
])('parses inventory quantity %s', (input, expected) => {
  expect(parseInventoryQuantity(input)).toBe(expected);
});
```

- [x] **Step 2: Run page tests and verify RED**

Run: `npm test -- --runInBand tests/project-structure.test.ts tests/inventory-input.test.ts tests/ingredients-page.test.ts`

Expected: FAIL because the route, page and validation utility do not exist.

- [x] **Step 3: Implement page state and optimistic saves**

```ts
interface IngredientPageItem extends InventoryItem {
  quantityInput: string;
  saving: boolean;
  errorMessage: string;
}

async onSaveItem(event: WechatMiniprogram.TouchEvent) {
  const ingredientId = Number(event.currentTarget.dataset.id);
  const item = this.data.items.find((candidate) => candidate.ingredientId === ingredientId);
  if (!item || item.saving) return;
  const quantity = parseInventoryQuantity(item.quantityInput);
  if (quantity === null) {
    this.updateItem(ingredientId, { errorMessage: '请输入 0 或更大的数量' });
    return;
  }
  this.updateItem(ingredientId, { saving: true, errorMessage: '' });
  try {
    const saved = await getApp<OsheeepApp>().saveInventoryItem(ingredientId, {
      quantity,
      unit: item.unit,
      version: item.version,
    });
    this.replaceSavedItem(saved);
  } catch (error) {
    await this.recoverInventoryError(ingredientId, error);
  }
}
```

The page groups rows by category, supports search, displays blank quantity as “数量未知”, saves one row at a time, preserves input on failure, and reloads the conflicting row when the API returns `DINNER_INVENTORY_VERSION_CONFLICT`.

- [x] **Step 4: Implement WXML/WXSS against the approved visual language**

Use a warm base surface, section headings and simple row dividers. Each row contains ingredient name, quantity input, unit, and a single save action. Do not place every row in its own elevated card. Include loading, error, empty search and no-inventory states.

- [x] **Step 5: Run page, type and lint checks**

Run: `npm test -- --runInBand tests/project-structure.test.ts tests/inventory-input.test.ts tests/ingredients-page.test.ts`

Expected: PASS.

Run: `npm run typecheck`

Expected: exit 0.

Run: `npm run lint`

Expected: exit 0.

- [x] **Step 6: Commit Task 6**

```bash
git add miniprogram/app.json miniprogram/pages/ingredients miniprogram/utils/inventory-input.ts miniprogram/utils/inventory-errors.ts tests/project-structure.test.ts tests/inventory-input.test.ts tests/ingredients-page.test.ts
git commit -m "feat: manage household ingredient inventory"
```

### Task 7: 重做找菜首页并接入今晚菜单

**Files:**

- Modify: `miniprogram/pages/recipes/index.ts`
- Modify: `miniprogram/pages/recipes/index.wxml`
- Modify: `miniprogram/pages/recipes/index.wxss`
- Modify: `miniprogram/pages/recipes/index.json`
- Modify: `tests/project-structure.test.ts`
- Modify: `tests/menu-service.test.ts`
- Create: `tests/recipe-discovery-page.test.ts`

**Interfaces:**

- Consumes: Task 5 discovery view model, app recipe service, existing menu service and Task 6 inventory route.
- Produces: approved find-dish layout, temporary filters and add-to-tonight behavior.

- [x] **Step 1: Write failing rendered-structure contracts**

```ts
test('recipe page exposes the approved discovery hierarchy', () => {
  const wxml = readFileSync(
    resolve(root, 'miniprogram/pages/recipes/index.wxml'),
    'utf8',
  );
  expect(wxml).toContain('今晚想吃什么？');
  expect(wxml).toContain('调整食材');
  expect(wxml).toContain('只看能做');
  expect(wxml).toContain('加入今晚菜单');
  expect(wxml).toContain('家庭菜谱');
  expect(wxml).toContain('食材库存');
  expect(wxml).toContain('<bottom-nav active="recipes" />');
});
```

- [x] **Step 2: Run the page test and verify RED**

Run: `npm test -- --runInBand tests/recipe-discovery-page.test.ts tests/project-structure.test.ts`

Expected: FAIL because the current page is a two-column selection grid.

- [x] **Step 3: Implement focused discovery state**

```ts
data: {
  loading: true,
  inventory: [] as InventoryItem[],
  featured: null as RecipeCardView | null,
  rows: [] as RecipeCardView[],
  pantrySummary: '',
  visibleIngredients: [] as InventoryItem[],
  hasMoreIngredients: false,
  onlyCookable: false,
  includeIngredientIds: [] as number[],
  excludeIngredientIds: [] as number[],
  menuVersion: 0,
  mySelectedRecipeIds: [] as number[],
  savingRecipeId: 0,
  errorMessage: '',
}
```

`onShow` loads inventory, discovery recipes and today's menu concurrently. `onToggleOnlyCookable` reloads recipes with the exact query. `onOpenIngredients` navigates to `/pages/ingredients/index`. “家庭菜谱” displays a clear unavailable message in this slice rather than navigating to a nonexistent page.

- [x] **Step 4: Implement add-to-tonight with existing version semantics**

```ts
async onAddToTonight(event: WechatMiniprogram.TouchEvent) {
  const recipeId = Number(event.currentTarget.dataset.id);
  if (this.data.savingRecipeId) return;
  const nextIds = [...new Set([...this.data.mySelectedRecipeIds, recipeId])]
    .sort((left, right) => left - right);
  this.setData({ savingRecipeId: recipeId, errorMessage: '' });
  try {
    const menu = await getApp<OsheeepApp>().saveSelections(nextIds, this.data.menuVersion);
    this.setData({
      menuVersion: menu.version,
      mySelectedRecipeIds: nextIds,
      savingRecipeId: 0,
    });
    wx.showToast({ title: '已加入今晚菜单', icon: 'success' });
  } catch (error) {
    await this.recoverMenuConflict(error);
  }
}
```

Do not replace the user's full selection with only the clicked recipe. On `DINNER_MENU_VERSION_CONFLICT`, reload today's menu and preserve the recipe the user attempted to add so they can retry explicitly.

- [x] **Step 5: Implement the selected visual direction**

Use the exact hierarchy from `docs/design/formal-release/recipe-discovery-final-direction.png`: compact pantry surface with at most three ingredients, one only-cookable toggle, one featured recipe, two lightweight rows, quiet household/inventory entries, and existing bottom navigation. Preserve `#FFFAF3`, `#CA5325`, `#7B823B`, `#426687` and `#282722`. Ensure fixed navigation and safe-area padding do not cover content at 375, 390 or 430px.

- [x] **Step 6: Run focused tests and static checks**

Run: `npm test -- --runInBand tests/recipe-discovery-page.test.ts tests/recipe-discovery.test.ts tests/menu-service.test.ts tests/project-structure.test.ts`

Expected: PASS.

Run: `npm run typecheck`

Expected: exit 0.

Run: `npm run lint`

Expected: exit 0.

- [x] **Step 7: Commit Task 7**

```bash
git add miniprogram/pages/recipes tests/recipe-discovery-page.test.ts tests/project-structure.test.ts tests/menu-service.test.ts
git commit -m "feat: discover recipes from household ingredients"
```

### Task 8: 跨仓库回归与阶段文档

**Files:**

- Modify: `docs/superpowers/plans/2026-07-15-recipe-inventory-discovery.md`
- Modify: `docs/HANDOFF.md`
- Modify: `../osheeep-server/docs/api-contract.md`

**Interfaces:**

- Consumes: Tasks 1–7 completed implementation.
- Produces: verified repositories and an accurate continuation point for the custom recipe plan.

- [x] **Step 1: Run the complete backend suite**

Run: `cd ../osheeep-server && mvn test`

Expected: all backend tests pass with 0 failures and 0 errors.

- [x] **Step 2: Run the complete frontend suite**

Run: `npm test -- --runInBand`

Expected: all frontend suites and tests pass.

- [x] **Step 3: Run frontend static checks**

Run: `npm run typecheck`

Expected: exit 0.

Run: `npm run lint`

Expected: exit 0.

Run: `npm run format:check`

Expected: exit 0.

Run: `git diff --check`

Expected: no output and exit 0 in both repositories.

- [x] **Step 4: Update contracts and handoff with exact delivered scope**

Document the ingredient, inventory and discovery endpoints in `osheeep-server/docs/api-contract.md`. Update `docs/HANDOFF.md` with V5, new page paths, test counts from the fresh runs, the fact that current recipe photos remain development placeholders, and the next separate plan: custom recipe drafts, methods, publishing and content safety.

- [x] **Step 5: Mark this plan complete and commit documentation**

```bash
git add docs/superpowers/plans/2026-07-15-recipe-inventory-discovery.md docs/HANDOFF.md
git commit -m "docs: record recipe discovery foundation"
```

```bash
cd ../osheeep-server
git add docs/api-contract.md
git commit -m "docs: describe ingredient inventory APIs"
```

- [x] **Step 6: Verify repository state**

Run in both repositories: `git status -sb`

Expected: clean `main` worktrees; local branches may be ahead of `origin/main` until the user requests push.

## 阶段完成说明（2026-07-15）

Tasks 1–8 的实现、自动化测试、静态检查、跨仓库回归和阶段文档均已完成。两个仓库继续遵循已批准的 direct-main 约定；本地 `main` 可以在用户要求 push 前领先 `origin/main`。

剩余验证不属于已完成勾选项：Task 6 食材库存页和 Task 7 找菜页仍需在已授权的微信开发者工具会话中补做 375、390、430px 截图/像素级视觉 QA。本轮 DevTools CLI service port 被关闭，无法安全采集模拟器截图，因此不声明新页面视觉 QA 已通过。
