# 两人家庭管理 Implementation Plan

> **For agentic workers:** 按任务顺序执行；每项生产代码先观察聚焦测试 RED，再做最小 GREEN。页面实现必须先完成 Task 10 的 Product Design 视觉目标，不得从文字规格直接猜 UI。

**Goal:** 在不扩展两人家庭范围的前提下，交付家庭名称、成员与角色、邀请码、退出、移除、转让、解散和账号注销整合，并证明任何已退出或被移除成员都不能继续访问旧家庭数据。

**Architecture:** `osheeep-server` 以只向前的 V8 把普通退出/移除 membership 演进为带 role/status/seat/version 的生命周期事件行，用生成列约束一个活跃家庭、一个活跃 OWNER 和两个活跃 seat；账号注销仍硬删除注销者全部 membership。所有家庭写事务统一为 actor user → optional identity → household → active memberships → invite/menu/recipe/inventory/household ingredient 的锁定顺序，再按外键安全顺序删除。成员终止复用单一领域事务；四个家庭危险操作通过无 household/target-membership 外键、14 天到期的操作表幂等。`osheeep-wx` 新增家庭管理、邀请码和解散原生页面，角色只控制展示，服务端始终重新授权。

**Tech Stack:** Java 21、Spring Boot 3.5.16、MyBatis-Plus 3.5.17、MySQL 8、Flyway、JUnit 5、Mockito、MockMvc；微信原生小程序、TypeScript 5.9、WXML、WXSS、Jest；微信开发者工具原生模拟器。

## Global Constraints

- 设计真相来源是 [家庭管理设计](../specs/2026-07-22-household-management-design.md)。发现语义缺口时先更新规格，不在代码中临时猜测。
- 两个仓库继续使用当前 `main`；每个任务只暂存列出的文件，操作前后检查未知改动，不覆盖用户工作。
- V1–V7 不可变；数据库变化只新增 `V8__add_household_management.sql`。
- 产品仍最多两个 ACTIVE 成员，恰有一个 ACTIVE OWNER；`created_by` 永远不是当前权限来源。
- 所有家庭读写只接受 `membership.status=ACTIVE` 且 `household.status=ACTIVE`。
- 客户端不得提交可信 household ID、actor ID、actor role 或 owner ID；target 也必须在锁内按当前家庭复验。
- 只有四个家庭危险动作 `MEMBER_LEAVE/OWNER_REMOVE/OWNERSHIP_TRANSFER/HOUSEHOLD_DISSOLUTION` 使用 UUID v4 幂等键；模糊失败由用户显式同 key 重试，明确冲突后刷新并重新确认。账号注销维持 fresh code + 单事务 + 旧 JWT 失效的明确例外。
- 微信 code 交换与内容安全调用在事务外；数据库事务内不得发网络请求。
- 现有 V7 历史快照不可改写；新历史展示只在响应层解释参与者。
- 每项生产代码先写聚焦失败测试并观察预期 RED。测试意外先绿时先修正测试。
- 真实 MySQL 写入测试只连接一次性、回环地址数据库，并同时通过进程环境、实际 JDBC catalog 和 Flyway data source/schema 安全门。
- 页面实现前必须使用 Product Design 工作流生成恰好三套 OWNER 方向并暂停等待用户选定，再派生完整参考图；实现后在 375、390、430px 原生模拟器做同状态 QA。
- 本计划不连接生产、不执行生产 Flyway、不部署、不上传体验版、不提审或发布。
- commit 是任务内本地收口；push 只在执行时获得当前明确授权后进行，历史授权不自动继承。

---

### Task 1: V8 家庭、成员、邀请码与幂等持久化契约

**Files:**

- Create: `../osheeep-server/src/main/resources/db/migration/V8__add_household_management.sql`
- Modify: `../osheeep-server/src/main/java/com/osheeep/server/dinner/household/entity/DinnerHouseholdEntity.java`
- Modify: `../osheeep-server/src/main/java/com/osheeep/server/dinner/household/entity/DinnerHouseholdMemberEntity.java`
- Modify: `../osheeep-server/src/main/java/com/osheeep/server/dinner/household/entity/DinnerInviteCodeEntity.java`
- Create: `../osheeep-server/src/main/java/com/osheeep/server/dinner/household/entity/DinnerHouseholdOperationEntity.java`
- Modify: `../osheeep-server/src/main/java/com/osheeep/server/dinner/household/mapper/DinnerHouseholdMemberMapper.java`
- Modify: `../osheeep-server/src/main/java/com/osheeep/server/dinner/household/mapper/DinnerInviteCodeMapper.java`
- Create: `../osheeep-server/src/main/java/com/osheeep/server/dinner/household/mapper/DinnerHouseholdOperationMapper.java`
- Create: `../osheeep-server/src/test/java/com/osheeep/server/dinner/household/DinnerHouseholdManagementPersistenceContractTest.java`
- Create: `../osheeep-server/src/test/java/com/osheeep/server/dinner/household/DinnerHouseholdManagementMigrationSmokeMySqlIT.java`

**Interfaces:**

- Produces household `version/inviteRevision/adminChangedAt`.
- Produces membership `role/status/seatNo/historyVisibleFrom/version/endedAt/endedBy/endReason`.
- Produces invitation consume/revoke state.
- Produces schema-v1 operation lookup by `(actor_id, idempotency_key)` with scalar actor/target membership contexts and minimal success payload.

- [ ] **Step 1: Write the failing V8 contract**

Assert that V8 exists, does not edit V1–V7, drops the two permanent membership unique indexes, adds generated ACTIVE keys and their unique indexes, backfills OWNER/seat deterministically, adds household invite revision plus invite consumption/open uniqueness, and creates an operation table without household or target-membership foreign keys. Reflect every new entity property and exact `@TableField` name.

- [ ] **Step 2: Run the focused contract and verify RED**

```bash
cd ../osheeep-server
mvn test -Dtest=DinnerHouseholdManagementPersistenceContractTest
```

Expected: FAIL because V8 and the fields do not exist.

- [ ] **Step 3: Add the complete V8 migration**

Implement the exact model from the design:

- household `version >= 1`, `invite_revision >= 0` and nullable `admin_changed_at`;
- membership lifecycle fields, application-Clock UTC `joined_at/history_visible_from/ended_at`, `ended_by → users` FK, `updated_at` default/on-update and exact grouped check constraints;
- `active_user_id`, `active_owner_household_id`, `active_seat_no` generated columns;
- unique ACTIVE user/owner/seat keys;
- deterministic OWNER/seat backfill with explicit precondition failure for zero or more-than-two-member legacy households;
- invitation `consumed_at/consumed_by/revocation_reason/open_household_id` with `consumed_by → users` FK;
- deterministic pre-index cleanup that revokes every two-member legacy open invite, keeps at most the newest eligible one-member invite and marks the rest `MIGRATION_SUPERSEDED`;
- consumed/revoked paired-state checks and legacy revoke-reason backfill;
- exact `dinner_household_operations` columns/checks from the design: users FK only on actor, scalar household/actor-membership/target IDs, four operation types, UUID/HMAC widths, schema version 1, `{actorHasHousehold}` JSON payload, Clock-written UTC timestamps with exact 14-day expiry, actor/key uniqueness and `(expires_at,id)` cleanup index.

Do not add a `DISSOLVED` household tombstone or store operation request plaintext.

- [ ] **Step 4: Map entities and deterministic locking queries**

Add mapper methods for:

```text
selectActiveByUserId(userId)
selectActiveByHouseholdIdForUpdate(householdId) ORDER BY id FOR UPDATE
selectHistoryByHouseholdAndUserIds(...)
selectOpenByHouseholdIdForUpdate(householdId)
selectByActorAndIdempotencyKey(actorId, key)
```

All single-row queries must include state predicates and deterministic `ORDER BY`; remove every ambiguous `WHERE user_id=? LIMIT 1` from new code. Generated entity fields use a never-write MyBatis strategy.

- [ ] **Step 5: Run contract and existing household tests**

```bash
mvn test -Dtest=DinnerHouseholdManagementPersistenceContractTest,DinnerHouseholdServiceTest,DinnerAccountCleanupServiceTest
git diff --check
```

- [ ] **Step 6: Run an early disposable MySQL smoke**

Before later services depend on V8, run a guarded loopback-only MySQL 8 smoke for fresh V1→V8 and minimal current V7→V8. Prove the generated columns and CHECK constraints are accepted and OWNER/MEMBER/history rows can be inserted. Destroy the instance after the run. Task 9 still owns production-shaped fixtures, bad-data gates and the full concurrency matrix.

- [ ] **Step 7: Commit Task 1 only**

```bash
git add src/main/resources/db/migration/V8__add_household_management.sql src/main/java/com/osheeep/server/dinner/household/entity/DinnerHouseholdEntity.java src/main/java/com/osheeep/server/dinner/household/entity/DinnerHouseholdMemberEntity.java src/main/java/com/osheeep/server/dinner/household/entity/DinnerInviteCodeEntity.java src/main/java/com/osheeep/server/dinner/household/entity/DinnerHouseholdOperationEntity.java src/main/java/com/osheeep/server/dinner/household/mapper/DinnerHouseholdMemberMapper.java src/main/java/com/osheeep/server/dinner/household/mapper/DinnerInviteCodeMapper.java src/main/java/com/osheeep/server/dinner/household/mapper/DinnerHouseholdOperationMapper.java src/test/java/com/osheeep/server/dinner/household/DinnerHouseholdManagementPersistenceContractTest.java src/test/java/com/osheeep/server/dinner/household/DinnerHouseholdManagementMigrationSmokeMySqlIT.java
git commit -m "feat: add household management persistence"
```

---

### Task 2: 单一 ACTIVE 家庭授权边界

**Files:**

- Create: `../osheeep-server/src/main/java/com/osheeep/server/dinner/household/DinnerHouseholdAccessService.java`
- Modify: `../osheeep-server/src/main/java/com/osheeep/server/dinner/household/DinnerHouseholdService.java`
- Modify: `../osheeep-server/src/main/java/com/osheeep/server/dinner/ingredient/DinnerIngredientService.java`
- Modify: `../osheeep-server/src/main/java/com/osheeep/server/dinner/menu/DinnerMenuService.java`
- Modify: `../osheeep-server/src/main/java/com/osheeep/server/dinner/record/DinnerRecordService.java`
- Modify: `../osheeep-server/src/main/java/com/osheeep/server/dinner/recipe/DinnerRecipeAuthorizer.java`
- Modify: `../osheeep-server/src/main/java/com/osheeep/server/dinner/recipe/DinnerRecipeService.java`
- Modify: `../osheeep-server/src/main/java/com/osheeep/server/dinner/recipe/DinnerRecipeQueryService.java`
- Modify: relevant existing service tests above
- Create: `../osheeep-server/src/test/java/com/osheeep/server/dinner/household/DinnerHouseholdAccessServiceTest.java`

**Interfaces:**

```text
findActiveMembership(userId): membership | null
requireActiveHousehold(userId): ActiveHouseholdAccess
requireOwner(access): ActiveHouseholdAccess
```

- [ ] **Step 1: Write failing inactive-membership authorization tests**

For `LEFT` and `REMOVED`, assert:

- `GET household` returns no current household;
- inventory/ingredient, discovery/family recipe/detail, menu today and record list/detail cannot read the old household;
- an ACTIVE membership whose household is missing or inactive is rejected.

Also prove that a new ACTIVE membership wins deterministically over any older history row.

- [ ] **Step 2: Verify RED on at least inventory and records**

```bash
mvn test -Dtest=DinnerHouseholdAccessServiceTest,DinnerIngredientServiceTest,DinnerRecordServiceTest,DinnerRecipeQueryServiceTest,DinnerMenuServiceTest
```

Expected: existing services still authorize by membership existence.

- [ ] **Step 3: Implement the shared read boundary**

Return an immutable access value containing only current user ID, household ID, membership ID/version/role/historyVisibleFrom and household version/timezone. Validate both states. Map no-active-family cases to `DINNER_HOUSEHOLD_REQUIRED`; only `DinnerHouseholdService.current()` keeps onboarding-compatible `data:null`. Keep cross-household object access as non-enumerating `FORBIDDEN`/not-found behavior.

- [ ] **Step 4: Replace every read-side local membership query**

Delete duplicate `requireMembership/findMembership` helpers from ingredient, menu and record services. Route recipe visibility through the same access service. Apply `historyVisibleFrom` to record list/detail/deep links and mask a pre-membership completed `/menus/today` response so it contains no menu/record/recipe IDs, dishes or actors.

- [ ] **Step 5: Run the whole read authorization slice**

```bash
mvn test -Dtest=DinnerHouseholdAccessServiceTest,DinnerHouseholdServiceTest,DinnerIngredientServiceTest,DinnerRecipeServiceTest,DinnerRecipeQueryServiceTest,DinnerMenuServiceTest,DinnerRecordServiceTest
```

- [ ] **Step 6: Commit Task 2 only**

```bash
git add src/main/java/com/osheeep/server/dinner src/test/java/com/osheeep/server/dinner src/main/java/com/osheeep/server/common/error/ErrorCode.java
git commit -m "fix: require active household membership"
```

---

### Task 3: 统一家庭写锁顺序

**Files:**

- Modify: `../osheeep-server/src/main/java/com/osheeep/server/dinner/household/DinnerHouseholdAccessService.java`
- Modify: `../osheeep-server/src/main/java/com/osheeep/server/user/UserMapper.java`
- Modify: `../osheeep-server/src/main/java/com/osheeep/server/dinner/ingredient/DinnerIngredientService.java`
- Modify: `../osheeep-server/src/main/java/com/osheeep/server/dinner/menu/DinnerMenuService.java`
- Modify: `../osheeep-server/src/main/java/com/osheeep/server/dinner/record/DinnerRecordService.java`
- Modify: `../osheeep-server/src/main/java/com/osheeep/server/dinner/recipe/DinnerRecipeAuthorizer.java`
- Modify: `../osheeep-server/src/main/java/com/osheeep/server/dinner/recipe/DinnerRecipeDraftService.java`
- Modify: `../osheeep-server/src/main/java/com/osheeep/server/dinner/recipe/DinnerRecipePublishSnapshotLoader.java`
- Modify: `../osheeep-server/src/main/java/com/osheeep/server/dinner/recipe/DinnerRecipePublishTransaction.java`
- Modify: corresponding existing tests
- Create: `../osheeep-server/src/test/java/com/osheeep/server/dinner/household/DinnerHouseholdWriteLockOrderTest.java`

**Interfaces:**

```text
lockActiveHouseholdContext(actorUserId): LockedHouseholdContext
```

- [ ] **Step 1: Write failing lock-order and stale-membership tests**

Use Mockito `InOrder` at the orchestration boundary to prove actor user → household → all ACTIVE memberships → domain aggregate. Add behavioral tests where membership changes between candidate lookup and lock acquisition; writes must fail before touching inventory/menu/recipe.

- [ ] **Step 2: Observe current recipe-first and menu-first RED**

```bash
mvn test -Dtest=DinnerHouseholdWriteLockOrderTest,DinnerRecipePublishTransactionTest,DinnerMenuServiceTest,DinnerRecordServiceTest,DinnerIngredientServiceTest
```

- [ ] **Step 3: Implement locked context**

Lock the actor user and require an active account; lock identity next only for identity-sensitive flows; resolve the candidate household, lock household, then lock all ACTIVE membership rows ordered by ID and revalidate. The returned context owns the locked household and members; callers must not query a different membership later.

- [ ] **Step 4: Reorder every existing family write**

- inventory upsert/remove: context before inventory row;
- menu selection/confirm and record complete: context before menu row;
- draft create/save and publish: context before recipe row;
- account deletion: user → identity → household → members before child aggregates;
- never call external content safety inside the locked transaction.

Preserve existing version, idempotency and snapshot semantics.

- [ ] **Step 5: Run all affected domain tests**

```bash
mvn test -Dtest=DinnerHouseholdWriteLockOrderTest,DinnerIngredientServiceTest,DinnerMenuServiceTest,DinnerRecordServiceTest,DinnerRecipeDraftServiceTest,DinnerRecipePublicationServiceTest,DinnerRecipePublishTransactionTest
```

- [ ] **Step 6: Commit Task 3 only**

```bash
git add src/main/java/com/osheeep/server/dinner src/main/java/com/osheeep/server/user/UserMapper.java src/test/java/com/osheeep/server/dinner
git commit -m "refactor: unify household write locking"
```

---

### Task 4: 角色化创建/加入、家庭查询、改名与邀请码生命周期

**Files:**

- Create: `../osheeep-server/src/main/java/com/osheeep/server/dinner/household/InviteCodeGenerator.java`
- Create: `../osheeep-server/src/main/java/com/osheeep/server/dinner/household/DinnerHouseholdDraftLifecycleService.java`
- Create: `../osheeep-server/src/main/java/com/osheeep/server/dinner/household/DinnerHouseholdNameService.java`
- Modify: `../osheeep-server/src/main/java/com/osheeep/server/dinner/household/InviteCodeHasher.java`
- Modify: `../osheeep-server/src/main/java/com/osheeep/server/dinner/household/DinnerHouseholdService.java`
- Modify: `../osheeep-server/src/main/java/com/osheeep/server/dinner/household/DinnerHouseholdController.java`
- Modify/Create: `../osheeep-server/src/main/java/com/osheeep/server/dinner/household/dto/*`
- Generalize: `../osheeep-server/src/main/java/com/osheeep/server/dinner/recipe/moderation/*` into a dinner-wide text-safety boundary
- Rename: `../osheeep-server/src/test/java/com/osheeep/server/dinner/recipe/moderation/WechatRecipeTextSafetyClientTest.java` to the dinner-wide client test
- Modify: `../osheeep-server/src/main/java/com/osheeep/server/dinner/recipe/DinnerRecipePublicationService.java`
- Modify: `../osheeep-server/src/main/java/com/osheeep/server/common/error/ErrorCode.java`
- Create: `../osheeep-server/src/test/java/com/osheeep/server/dinner/household/InviteCodeGeneratorTest.java`
- Create: `../osheeep-server/src/test/java/com/osheeep/server/dinner/household/DinnerHouseholdNameServiceTest.java`
- Modify: existing household, moderation and recipe-publication tests

**Interfaces:**

- `HouseholdResponse` adds version, my role and membership version.
- `GET /api/dinner/household/members` returns one snapshot-consistent `HouseholdManagementResponse` containing household, ACTIVE member relationship labels and invite status/revision.
- `PUT /api/dinner/household` renames with expected version.
- Invitation query/refresh/revocation never recovers old plaintext.

- [ ] **Step 1: Write failing role, name and invite tests**

Cover:

- creator OWNER/seat 1/version 1; joiner MEMBER/free seat;
- current/management response has no internal user ID, nickname or fake avatar;
- NFC custom name 1–30 Unicode code points, emoji/surrogate-pair boundary, `isWhitespace/isSpaceChar` edge trimming, control/format/bidi/zero-width rejection, content pass/reject/unavailable and version conflict;
- new 24-hour `DINNER XXXX XXXX` entropy plus exact alphabet/input normalization, and legacy-code validation;
- refresh revokes every old open code, increments invite revision and returns matching revision/plaintext/expiry; full household rejects generation;
- join consumes code, increments household and invite revisions, and a consumed code cannot be reused;
- concurrent create for the same user returns a business conflict and leaves no orphan household.

- [ ] **Step 2: Verify RED**

```bash
mvn test -Dtest=InviteCodeGeneratorTest,DinnerHouseholdNameServiceTest,DinnerHouseholdServiceTest,DinnerHouseholdControllerTest
```

- [ ] **Step 3: Generalize text safety without changing recipe wire errors**

Create a dinner-wide gateway/result/unavailable exception. Recipe publication continues mapping reject/unavailable to its existing error codes; household name maps to `DINNER_HOUSEHOLD_NAME_REJECTED` and `DINNER_HOUSEHOLD_MODERATION_UNAVAILABLE`. Keep network calls outside transactions and redact request `toString()`.

- [ ] **Step 4: Implement create/join and draft rebind**

Both actions lock actor user first. Create inserts OWNER/seat 1. Join locks household and members, allocates the free seat, locks and consumes the invite, increments household/invite revisions, then locks the actor's unbound DRAFT rows by ID. Rebinding sets household and last modifier and increments each changed draft version; an autosave/rebind failure rolls back membership, invite and every draft. Only the named ACTIVE/open constraint violations map to stable 409 codes; unrelated integrity failures remain internal errors.

- [ ] **Step 5: Implement management query, rename and invitation endpoints**

Return member relationship as `ME/PARTNER`. Build household, members and invite in one read-only snapshot. Invite query returns only `NONE/ACTIVE/EXPIRED`, `inviteRevision`, expiry and whether current user created it. Refresh returns plaintext once; revocation is naturally idempotent and increments revision only when applying a new state. Do not hardcode memberCount in invitation responses.

- [ ] **Step 6: Run household plus recipe moderation regression**

```bash
mvn test -Dtest=DinnerHouseholdServiceTest,DinnerHouseholdControllerTest,InviteCodeGeneratorTest,DinnerHouseholdNameServiceTest,DinnerRecipePublicationServiceTest,WechatDinnerTextSafetyClientTest
```

- [ ] **Step 7: Commit Task 4 only**

```bash
git add src/main/java/com/osheeep/server/dinner src/main/java/com/osheeep/server/common/error/ErrorCode.java src/test/java/com/osheeep/server/dinner
git commit -m "feat: add household roles and invite lifecycle"
```

---

### Task 5: MEMBER 退出、OWNER 移除与跨聚合终止事务

**Files:**

- Create: `../osheeep-server/src/main/java/com/osheeep/server/dinner/household/DinnerHouseholdOperationService.java`
- Create: `../osheeep-server/src/main/java/com/osheeep/server/dinner/household/HouseholdOperationFingerprinter.java`
- Create: `../osheeep-server/src/main/java/com/osheeep/server/dinner/household/DinnerHouseholdOperationRetentionService.java`
- Create: `../osheeep-server/src/main/java/com/osheeep/server/dinner/household/DinnerHouseholdOperationRetentionScheduler.java`
- Create: `../osheeep-server/src/main/java/com/osheeep/server/dinner/household/DinnerMembershipTerminationService.java`
- Modify: `../osheeep-server/src/main/java/com/osheeep/server/OsheeepServerApplication.java`
- Modify: `../osheeep-server/src/main/java/com/osheeep/server/dinner/household/DinnerHouseholdDraftLifecycleService.java`
- Modify: `../osheeep-server/src/main/java/com/osheeep/server/dinner/household/DinnerHouseholdController.java`
- Create: leave/removal request and mutation response DTOs
- Modify: invite/menu/recipe mappers needed for deterministic bulk locks and updates
- Create: `../osheeep-server/src/test/java/com/osheeep/server/dinner/household/DinnerHouseholdOperationServiceTest.java`
- Create: `../osheeep-server/src/test/java/com/osheeep/server/dinner/household/DinnerHouseholdOperationRetentionServiceTest.java`
- Create: `../osheeep-server/src/test/java/com/osheeep/server/dinner/household/DinnerMembershipTerminationServiceTest.java`
- Modify: `../osheeep-server/src/test/java/com/osheeep/server/dinner/household/DinnerHouseholdControllerTest.java`

**Interfaces:**

- `POST /api/dinner/household/members/me/leave`
- `POST /api/dinner/household/members/{membershipId}/removal`

- [ ] **Step 1: Write failing permission and idempotency tests**

Cover MEMBER leave, OWNER leave rejection in one- and two-person homes, OWNER-only removal, self/foreign/inactive target rejection, actor membership/household version conflict, malformed UUID, same-key same-request replay and same-key different-request conflict. Force two requests to both complete the initial operation lookup before either obtains the actor user lock; the second must recheck immediately after that lock and return the first stored success payload even though the actor/target membership has ended.

- [ ] **Step 2: Write failing data-transition tests**

Assert in one transaction:

- every open household invite revoked and household invite revision incremented;
- all non-COMPLETED menus lose target selections, return DRAFT, clear confirmation and increment exactly once;
- completed menu/record/snapshot bytes unchanged;
- personal drafts detach, edit drafts become standalone, old household lineage clears, household-ingredient rows are removed;
- shared inventory and PUBLISHED/ARCHIVED recipes remain;
- target membership ends with the exact status/reason/time/actor/version;
- household version increments once.

- [ ] **Step 3: Verify RED**

```bash
mvn test -Dtest=DinnerHouseholdOperationServiceTest,DinnerMembershipTerminationServiceTest,DinnerHouseholdControllerTest
```

- [ ] **Step 4: Implement operation fingerprints and replay**

Validate UUID v4. Build an HMAC fingerprint from the normalized semantic inputs—operation type, untrusted actor membership context, expected household version, target identity/version and the normalized confirmation name where applicable—using the existing dinner invite secret with the `household-operation:v1:` domain prefix. Never persist clear household name, WeChat code or tokens. After JWT actor validation, precheck an existing successful operation before external work/current membership. On a miss, lock actor user and immediately query again before identity/household lookup; store a schema-versioned minimal success payload so replay does not depend on current role or surviving rows.

- [ ] **Step 5: Implement the shared termination transaction**

Use one policy object for `SELF_LEFT` and `OWNER_REMOVED`. Follow the global lock order and the fixed child-resource order. Insert the successful operation result in the same transaction.

Operation results expire after 14 days. Enable a scheduled component plus opportunity cleanup on new writes; delete in bounded `(expires_at,id)` batches. Tests use a fixed Clock and verify the exact boundary. The job must not log actor, household or target IDs.

- [ ] **Step 6: Add controller contracts and run regression**

```bash
mvn test -Dtest=DinnerHouseholdOperationServiceTest,DinnerMembershipTerminationServiceTest,DinnerHouseholdControllerTest,DinnerMenuServiceTest,DinnerRecipeQueryServiceTest,DinnerIngredientServiceTest
```

- [ ] **Step 7: Commit Task 5 only**

```bash
git add src/main/java/com/osheeep/server/OsheeepServerApplication.java src/main/java/com/osheeep/server/dinner/household src/main/java/com/osheeep/server/dinner/menu src/main/java/com/osheeep/server/dinner/recipe src/test/java/com/osheeep/server/dinner
git commit -m "feat: add household leave and removal"
```

---

### Task 6: 管理权转让

**Files:**

- Create: `../osheeep-server/src/main/java/com/osheeep/server/dinner/household/DinnerHouseholdOwnershipService.java`
- Modify: `../osheeep-server/src/main/java/com/osheeep/server/dinner/household/DinnerHouseholdController.java`
- Create: ownership request/response DTOs
- Create: `../osheeep-server/src/test/java/com/osheeep/server/dinner/household/DinnerHouseholdOwnershipServiceTest.java`
- Modify: `../osheeep-server/src/test/java/com/osheeep/server/dinner/household/DinnerHouseholdControllerTest.java`

**Interfaces:**

- `POST /api/dinner/household/ownership-transfer`

- [ ] **Step 1: Write failing ownership tests**

Cover OWNER-only, actor membership context, target must be the other ACTIVE member, no target in single-member home, foreign/inactive target, household/target membership version conflict, idempotent replay after actor is no longer OWNER and concurrent transfer attempts.

- [ ] **Step 2: Verify RED**

```bash
mvn test -Dtest=DinnerHouseholdOwnershipServiceTest,DinnerHouseholdControllerTest
```

- [ ] **Step 3: Implement atomic role exchange**

Precheck/recheck operation around the actor user lock as in Task 5. Under locked context, demote old OWNER first and promote target second; increment both membership versions and household version, update `admin_changed_at`, then write the operation result. Do not change `created_by`, invitations, menus, recipes, drafts, history or inventory.

- [ ] **Step 4: Prove the post-transfer path**

Add a service test: A transfers to B; response has exactly one OWNER; A can then use MEMBER leave; B remains OWNER and retains all shared data.

- [ ] **Step 5: Run and commit**

```bash
mvn test -Dtest=DinnerHouseholdOwnershipServiceTest,DinnerMembershipTerminationServiceTest,DinnerHouseholdControllerTest
git diff --check
git add src/main/java/com/osheeep/server/dinner/household src/test/java/com/osheeep/server/dinner/household
git commit -m "feat: add household ownership transfer"
```

---

### Task 7: 解散家庭与账号注销整合

**Files:**

- Create: `../osheeep-server/src/main/java/com/osheeep/server/dinner/household/DinnerHouseholdDataPurger.java`
- Create: `../osheeep-server/src/main/java/com/osheeep/server/dinner/household/DinnerHouseholdDissolutionService.java`
- Modify: `../osheeep-server/src/main/java/com/osheeep/server/dinner/household/DinnerAccountCleanupService.java`
- Modify: `../osheeep-server/src/main/java/com/osheeep/server/user/AccountDeletionService.java`
- Modify: `../osheeep-server/src/main/java/com/osheeep/server/user/AccountDeletionTransaction.java`
- Modify: `../osheeep-server/src/main/java/com/osheeep/server/auth/wechat/WechatUserIdentityMapper.java`
- Modify: `../osheeep-server/src/main/java/com/osheeep/server/dinner/household/DinnerHouseholdController.java`
- Create: dissolution request/response DTOs
- Create: `../osheeep-server/src/test/java/com/osheeep/server/dinner/household/DinnerHouseholdDissolutionServiceTest.java`
- Modify: account deletion unit, rollback and controller tests

**Interfaces:**

- `POST /api/dinner/household/dissolution`
- Account deletion remains `POST /api/users/me/deletion`.

- [ ] **Step 1: Write failing dissolution boundary tests**

Cover non-OWNER, actor membership context, name mismatch, stale version, mismatched openid, invalid/used code, successful hard delete, same-key successful replay after household deletion without another code exchange, and injected failure rollback. Verify the operation fingerprint excludes the one-time code but includes the normalized name and actor membership context.

- [ ] **Step 2: Write failing account deletion matrix**

Cover:

- current MEMBER deletion uses termination data transitions, then deletes all that user's ACTIVE/LEFT/REMOVED membership events and private drafts, revokes all invites, increments invite/household revisions once and preserves shared data;
- current OWNER deletion with another ACTIVE member deletes the old OWNER membership first, promotes the only remaining ACTIVE MEMBER, revokes invites and increments invite/household revisions once in the same transaction;
- last member deletion purges V5–V8 family data and private drafts;
- never-member, previously LEFT, previously REMOVED and multi-membership-history users delete all unbound drafts, edit drafts, membership history, actor operations and operations targeting any of their historical membership IDs;
- identity deletion and user anonymization happen only after family work and roll back together.

- [ ] **Step 3: Verify RED**

```bash
mvn test -Dtest=DinnerHouseholdDissolutionServiceTest,DinnerAccountCleanupServiceTest,AccountDeletionServiceTest,AccountDeletionTransactionTest,AccountDeletionRollbackIT
```

- [ ] **Step 4: Extract a single FK-safe data purger**

First lock every affected aggregate in the global order: invite → menu/selection/action/record/snapshot → recipe/method/step/ingredient → inventory → household ingredient, each by stable primary key. Only then detach preserved personal drafts and clear their custom-ingredient references. Delete snapshot → record → menu action → menu selection → menu → invite → inventory; globally clear every `source_recipe_id/revision_of_recipe_id` that points into the deleting recipe set, then delete method step → method → recipe ingredient → shared/private-by-policy recipe → household ingredient → membership → household. Delete older operations for that household before inserting the expiring dissolution result. Keep global image assets.

- [ ] **Step 5: Implement fresh identity verification and idempotent dissolution**

Check an existing matching operation after JWT actor validation and before exchanging a new code. For a new operation, exchange the code outside the transaction, then lock actor user and immediately recheck operation; on a miss lock identity → household → members → child aggregates. Verify openid, name, actor membership context and version, purge, record the minimal result payload and commit. Success keeps the account token.

- [ ] **Step 6: Refactor account deletion to the global lock order**

After external code exchange, lock actor user → identity → current household/members if present. If the actor is OWNER with one other member, perform membership-dependent data transitions, delete the old OWNER membership so the generated ACTIVE-owner key becomes null, then promote the only remaining ACTIVE MEMBER; increment successor and household once, update `admin_changed_at`, and verify exactly one OWNER before commit. Delete every membership event for the user, operations where the user is actor, and operations targeting any historical membership ID before anonymization. The same path must work with no ACTIVE household. Account deletion intentionally does not use household-operation idempotency; preserve immediate old-JWT invalidation and document that a lost success response becomes `UNAUTHORIZED` on the old token.

- [ ] **Step 7: Run rollback and full account regression**

```bash
mvn test -Dtest=DinnerHouseholdDissolutionServiceTest,DinnerAccountCleanupServiceTest,AccountDeletionServiceTest,AccountDeletionTransactionTest,AccountDeletionRollbackIT,UserControllerTest,JwtServiceTest,SecurityConfigTest
```

- [ ] **Step 8: Commit Task 7 only**

```bash
git add src/main/java/com/osheeep/server/dinner/household src/main/java/com/osheeep/server/user src/main/java/com/osheeep/server/auth/wechat src/test/java/com/osheeep/server
git commit -m "feat: add household dissolution lifecycle"
```

---

### Task 8: 历史可见窗口与匿名成员标签

**Files:**

- Create: `../osheeep-server/src/main/java/com/osheeep/server/dinner/household/DinnerHouseholdActorLabelService.java`
- Create: `../osheeep-server/src/main/java/com/osheeep/server/dinner/household/dto/HouseholdActorResponse.java`
- Modify: `../osheeep-server/src/main/java/com/osheeep/server/dinner/record/DinnerRecordService.java`
- Modify: record response DTOs
- Modify: `../osheeep-server/src/main/java/com/osheeep/server/dinner/menu/DinnerMenuService.java`
- Modify: `../osheeep-server/src/main/java/com/osheeep/server/dinner/menu/dto/TodayMenuResponse.java`
- Modify: `../osheeep-server/src/main/java/com/osheeep/server/dinner/recipe/DinnerRecipeQueryService.java`
- Modify: family recipe list response DTO
- Create: `../osheeep-server/src/test/java/com/osheeep/server/dinner/household/DinnerHouseholdActorLabelServiceTest.java`
- Modify: record and recipe query tests

**Interfaces:**

- Actor kinds: `ME`, `PARTNER`, `EXITED_MEMBER`, `DELETED_MEMBER`.
- Record visibility starts at current membership `historyVisibleFrom`.
- `completedBy/confirmedBy/creator/lastModifier` are actor objects; dish `selectedBy` is a 1–2 actor array.

- [ ] **Step 1: Write failing privacy and history tests**

Prove:

- a replacement member cannot list/detail a record completed before their current `history_visible_from`;
- a rejoined former member does not regain their prior membership-period records;
- a continuous留守 member still sees old records;
- a pre-membership completed today menu returns only `historyVisible=false` with no menu/record/recipe IDs, dishes or actors;
- selected-by arrays cover `[ME, PARTNER]`, `[ME, EXITED_MEMBER]`, `[EXITED_MEMBER]` and `[EXITED_MEMBER, DELETED_MEMBER]` in stable relation order;
- selected-by/completed-by/confirmed-by labels distinguish exited vs deleted without returning internal IDs;
- family recipe creator/last modifier never returns `creatorId/lastModifiedBy`, `deleted_user_*`, username or internal ID.

- [ ] **Step 2: Verify RED on the current `ME/PARTNER/BOTH` inference**

```bash
mvn test -Dtest=DinnerHouseholdActorLabelServiceTest,DinnerRecordServiceTest,DinnerMenuServiceTest,DinnerRecipeQueryServiceTest
```

- [ ] **Step 3: Implement batched actor resolution**

Batch-load membership history and user status; do not issue one query per record or recipe. Resolve relation priority as ME → current PARTNER → DELETED_MEMBER → EXITED_MEMBER, dedupe by internal user ID before mapping, then sort by the documented relation order. Keep V7 stored JSON unchanged and derive response labels only. For current unfinished menus retain existing `ME/PARTNER/BOTH`, because termination already removes inactive selections.

- [ ] **Step 4: Remove unsafe member-name fallback**

Family recipe and today-menu responses use relationship labels. Remove raw user-ID wire fields; do not expose username merely because display name is absent—the product currently collects neither nickname nor avatar. Apply the UTC boundary with stable `(completed_at,id)` ordering to list, detail and today-menu paths.

- [ ] **Step 5: Run and commit**

```bash
mvn test -Dtest=DinnerHouseholdActorLabelServiceTest,DinnerRecordServiceTest,DinnerMenuServiceTest,DinnerRecipeQueryServiceTest,DinnerFamilyRecipeControllerTest
git diff --check
git add src/main/java/com/osheeep/server/dinner src/test/java/com/osheeep/server/dinner
git commit -m "fix: anonymize former household members"
```

---

### Task 9: V8 MySQL 迁移、并发矩阵与 API 契约

**Files:**

- Create: `../osheeep-server/src/test/java/com/osheeep/server/dinner/household/DinnerHouseholdManagementFlywayMigrationStrategy.java`
- Create: `../osheeep-server/src/test/java/com/osheeep/server/dinner/household/DinnerHouseholdManagementFlywayMigrationStrategyTest.java`
- Create: `../osheeep-server/src/test/java/com/osheeep/server/dinner/household/DinnerHouseholdManagementTestDatabaseSafetyInitializer.java`
- Create: `../osheeep-server/src/test/java/com/osheeep/server/dinner/household/DinnerHouseholdManagementTestDatabaseSafetyInitializerTest.java`
- Create: `../osheeep-server/src/test/java/com/osheeep/server/dinner/household/DinnerHouseholdManagementMySqlIT.java`
- Create: `../osheeep-server/src/test/java/com/osheeep/server/dinner/household/DinnerHouseholdManagementConcurrencyMySqlIT.java`
- Modify: `../osheeep-server/docs/api-contract.md`

- [ ] **Step 1: Write failing migration-strategy unit tests**

Require exactly three disposable paths: empty schema V1→V8, production-shaped V4→V8, current V7→V8. Assert safety rejects missing/mismatched database names, non-loopback hosts and Flyway/data-source catalog mismatch.

- [ ] **Step 2: Add V8 end-to-end MySQL scenarios**

Include role backfill with and without original creator, explicit bad-data migration rejection, active uniqueness, leave/rejoin history window and UTC boundary, invite consume/revoke/revision and two-member legacy revoke, exit data transitions, transfer, dissolution, and never-member/LEFT/REMOVED/multi-history/current MEMBER/current OWNER/last-user account deletion.

- [ ] **Step 3: Add real two-thread concurrency tests**

Cover exit × menu update, remove × complete, transfer × invite refresh, deletion × publish, dissolution × inventory update and identical idempotency submissions. The identical-key barrier makes both initial reads miss; request two must block on actor user, then replay before household lookup even if request one deleted membership/household. Inject an unrelated unique/integrity violation and prove it remains an internal rollback, not a recoverable 409. Use bounded futures/latches; fail on timeout or unclassified SQL exceptions.

- [ ] **Step 4: Update API contract**

Document exact requests/responses, additive household/invite-revision fields, the single management snapshot, member privacy, invite one-time plaintext, 24-hour new/legacy normalization, all new error codes, record/today visibility window and actor arrays. Explicitly say actor membership context is untrusted and no client-supplied role/household/user ID is trusted.

- [ ] **Step 5: Run server unit suite**

```bash
mvn test
git diff --check
```

- [ ] **Step 6: Run disposable MySQL 8 evidence**

Use a new loopback-only instance and a unique database name. Do not `source .env.local`. Run the migration and concurrency IT classes explicitly, then destroy the instance and confirm no temporary resources remain.

- [ ] **Step 7: Commit Task 9 only**

```bash
git add src/test/java/com/osheeep/server/dinner/household docs/api-contract.md
git commit -m "test: verify household management lifecycle"
```

---

### Task 10: Product Design 家庭管理视觉目标

**Files:**

- Create: `docs/design/formal-release/household-manage-owner-option-a.png`
- Create: `docs/design/formal-release/household-manage-owner-option-b.png`
- Create: `docs/design/formal-release/household-manage-owner-option-c.png`
- Create: `docs/design/formal-release/household-manage-owner-final-direction.png`
- Create: `docs/design/formal-release/household-manage-member-final-direction.png`
- Create: `docs/design/formal-release/household-invite-final-direction.png`
- Create: `docs/design/formal-release/household-invite-hash-only-direction.png`
- Create: `docs/design/formal-release/household-dissolve-final-direction.png`
- Create: `docs/design/household-management-design-notes.md`

- [ ] **Step 1: Re-read the Product Design skill and existing sources**

Use the implemented household-created capture, household join error source, formal family-recipes direction, profile code and account-deletion code as grounding. Do not introduce a new palette, card language, icon system or web-style chrome.

- [ ] **Step 2: Generate exactly three OWNER directions**

At 390×844 generate exactly three distinct but source-grounded OWNER two-member management-page directions. Each must include long-name handling, rename idle/conflict, transfer/remove/dissolve hierarchy, `我/TA` text slots and native safe-area/button geometry. Do not derive MEMBER/invite/dissolve pages yet.

- [ ] **Step 3: Show all three to the user and pause for selection**

Present the three images together with concise tradeoffs and wait for an explicit A/B/C choice. This is a required Product Design decision gate; do not pick on the user's behalf and do not start Task 11 while it is unresolved.

- [ ] **Step 4: Derive the complete selected state set**

From the selected OWNER direction create:

- OWNER with two members, rename idle, transfer/remove/dissolve actions;
- MEMBER with two members and leave action;
- single-member invite generated-code result with real expiry;
- ACTIVE hash-only invite state where old plaintext cannot be recovered;
- rename version conflict with retained input;
- dissolution impact list, acknowledgement checkbox, exact-name field and disabled/ready action states.

Use `我/TA` text slots, not fake avatars or unsupported profile data. Visible controls in the core path must have coherent interactions in the design notes.

- [ ] **Step 5: Senior-design audit**

Check typography, density, safe area, field errors, long household names, destructive hierarchy, 88rpx targets and native button geometry. Fix all P0/P1/P2 reference issues before accepting the images.

- [ ] **Step 6: Record implementation tokens and state matrix**

The notes define exact colors, spacing, radii, copy, loading/error/conflict states and which existing pattern each element extends. Images are visual truth; hexadecimal tokens in notes are implementation truth.

- [ ] **Step 7: Commit visual targets**

```bash
git add docs/design/formal-release/household-manage-owner-option-a.png docs/design/formal-release/household-manage-owner-option-b.png docs/design/formal-release/household-manage-owner-option-c.png docs/design/formal-release/household-manage-owner-final-direction.png docs/design/formal-release/household-manage-member-final-direction.png docs/design/formal-release/household-invite-final-direction.png docs/design/formal-release/household-invite-hash-only-direction.png docs/design/formal-release/household-dissolve-final-direction.png docs/design/household-management-design-notes.md
git commit -m "docs: add household management visual direction"
```

---

### Task 11: 小程序 wire、绑定页、actor 展示与幂等基础

**Files:**

- Modify: `miniprogram/types/household.ts`
- Modify: `miniprogram/types/record.ts`
- Modify: `miniprogram/types/recipe.ts`
- Modify: `miniprogram/types/menu.ts`
- Modify: `miniprogram/services/household-service.ts`
- Modify: `miniprogram/utils/household-errors.ts`
- Create: `miniprogram/utils/idempotency.ts`
- Modify: `miniprogram/utils/menu-state.ts`
- Modify: `miniprogram/pages/household-create/index.{ts,wxml,wxss}`
- Modify: `miniprogram/pages/household-join/index.{ts,wxml,wxss}`
- Modify: `miniprogram/pages/records/index.{ts,wxml}`
- Modify: `miniprogram/pages/record-detail/index.{ts,wxml}`
- Modify: `miniprogram/pages/family-recipes/index.{ts,wxml}`
- Modify: `miniprogram/pages/tonight/index.{ts,wxml}`
- Modify: `miniprogram/components/bottom-nav/index.wxss`
- Create: `tests/household-wire-contract.test.ts`
- Modify: `tests/household-service.test.ts`
- Modify: `tests/household-errors.test.ts`
- Create: `tests/household-binding-page.test.ts`
- Create: `tests/idempotency.test.ts`
- Modify: `tests/menu-state.test.ts`
- Modify: `tests/recipe-wire-contract.test.ts`
- Modify: `tests/family-recipes-page.test.ts`
- Modify: `tests/record-detail.test.ts`
- Modify: `tests/record-detail-page.test.ts`
- Modify: `tests/tonight-page.test.ts`

**Interfaces:**

- Types mirror the single management response, invite revision and actor arrays without raw user IDs.
- Error mapper returns `{message, recovery}` with the exact recovery union from the design.

- [ ] **Step 1: Write failing wire and service tests**

Assert every path/body and prove no request submits household ID, actor role or internal user ID. Cover actor membership context, household/target versions, UUID, single management response, invite revision/states, UTC timestamps and actor arrays. Service must not retry mutations.

- [ ] **Step 2: Write failing binding, actor and idempotency tests**

Cover manual input, paste and share-query prefill for old/new invite codes, `maxlength=16`, overlong/invalid characters, lowercase/hyphen normalization, 16-character 375px layout and real `inviteExpiresAt`. Creation success keeps plaintext only in page memory, refreshes revision on `onShow`/before copy or share, and never puts the code in storage/global state/query/logs. Both no-family pages keep a visible privacy/account entry. Prove records, today menu and family recipes render actor labels/arrays and never raw IDs. Extract UUID v4 creation from menu state into a shared utility.

- [ ] **Step 3: Verify RED**

```bash
npm test -- household-wire-contract.test.ts household-service.test.ts household-errors.test.ts household-binding-page.test.ts idempotency.test.ts menu-state.test.ts recipe-wire-contract.test.ts family-recipes-page.test.ts record-detail.test.ts record-detail-page.test.ts tonight-page.test.ts --runInBand
```

- [ ] **Step 4: Implement wire, normalization and error recovery**

Keep services free of toast/navigation. Format legacy `DINNER 1234` and new `DINNER XXXX XXXX` exactly; never truncate the latter. Map errors only to `RETRY_LOCAL / REFRESH_RECONFIRM / RELAUNCH_BINDING / RELAUNCH_ONBOARDING / EDIT_INPUT / STAY`, including non-looping identity mismatch behavior.

- [ ] **Step 5: Land binding/actor UI compatibility**

Creation keeps its one-time plaintext on the success page, shows the real expiry and can hand it to the invite page only through page memory. Join accepts old/new code from typing, paste or share. Replace“双方权限相同” with the approved daily-equality/management-role copy. Render API UTC times in `Asia/Shanghai` with“时间暂不可用” fallback. Update records/today/family recipes to actor labels. Raise every bottom-nav target to at least 88rpx without changing the safe-area layout.

- [ ] **Step 6: Run and commit**

```bash
npm test -- household-wire-contract.test.ts household-service.test.ts household-errors.test.ts household-binding-page.test.ts idempotency.test.ts menu-state.test.ts recipe-wire-contract.test.ts family-recipes-page.test.ts record-detail.test.ts record-detail-page.test.ts tonight-page.test.ts --runInBand
npm run typecheck
npm run lint
git diff --check
git add miniprogram/types/household.ts miniprogram/types/record.ts miniprogram/types/recipe.ts miniprogram/types/menu.ts miniprogram/services/household-service.ts miniprogram/utils/household-errors.ts miniprogram/utils/idempotency.ts miniprogram/utils/menu-state.ts miniprogram/pages/household-create miniprogram/pages/household-join miniprogram/pages/records/index.ts miniprogram/pages/records/index.wxml miniprogram/pages/record-detail/index.ts miniprogram/pages/record-detail/index.wxml miniprogram/pages/family-recipes/index.ts miniprogram/pages/family-recipes/index.wxml miniprogram/pages/tonight/index.ts miniprogram/pages/tonight/index.wxml miniprogram/components/bottom-nav/index.wxss tests/household-wire-contract.test.ts tests/household-service.test.ts tests/household-errors.test.ts tests/household-binding-page.test.ts tests/idempotency.test.ts tests/menu-state.test.ts tests/recipe-wire-contract.test.ts tests/family-recipes-page.test.ts tests/record-detail.test.ts tests/record-detail-page.test.ts tests/tonight-page.test.ts
git commit -m "feat: add household management client contracts"
```

---

### Task 12: 家庭管理页与邀请码页

**Files:**

- Create: `miniprogram/pages/household-manage/index.{ts,json,wxml,wxss}`
- Create: `miniprogram/pages/household-invite/index.{ts,json,wxml,wxss}`
- Modify: `miniprogram/pages/profile/index.{ts,wxml,wxss}`
- Modify: `miniprogram/app.ts`
- Modify: `miniprogram/app.json`
- Create: `tests/household-manage-page.test.ts`
- Create: `tests/household-invite-page.test.ts`
- Create: `tests/profile-page.test.ts`
- Modify: `tests/project-structure.test.ts`

- [ ] **Step 1: Write failing management state tests**

Cover OWNER single, OWNER double, MEMBER double, profile loading/retry/no-family/management navigation, long name, inline edit/save, validation, moderation failure, version conflict with retained input, load retry and no-household reroute. Every `onShow` refresh gets a generation token; a slower old response cannot overwrite a newer role/version or no-household transition.

For leave/remove/transfer, prove modal cancel creates no key; final confirmation creates one; network/timeout/unknown 5xx retains the exact payload/key for explicit retry; definitive business rejection refreshes and requires reconfirmation/new key; page re-entry refreshes only and never blindly resends. All submit/cancel/modal-failure paths reset guards.

- [ ] **Step 2: Write failing invite state tests**

Cover none/active/expired/generated/copied/full/loading/error; active hash-only state must never pretend the old plaintext is visible. Refresh explains old-code invalidation, revoke refreshes state, share contains only the currently displayed generated code. Invite `onShow` also uses a generation token so a stale request cannot restore an old revision. A partner refresh/revoke or any newer remote `inviteRevision`, local expiry, `onUnload`, full household or lost household clears page-memory plaintext and disables copy/share. Generation-response loss, clipboard failure and share failure remain recoverable without persisting plaintext.

- [ ] **Step 3: Verify RED**

```bash
npm test -- household-manage-page.test.ts household-invite-page.test.ts profile-page.test.ts project-structure.test.ts --runInBand
```

- [ ] **Step 4: Implement from Task 10 visual sources**

Register routes only now that the real pages exist. Profile primary entry becomes“家庭管理”, renders real slots/count and never routes a full home to code generation. Use the user-selected Task 10 hierarchy/tokens and real `ME/PARTNER` labels. Leave/remove show impact then second modal; transfer names the role swap. Success refreshes the complete management snapshot. No optimistic member removal.

- [ ] **Step 5: Harden native WXML/WXSS**

All primary targets at least 88rpx. Use `aria-role/aria-live`. Set button width/min-width/flex-basis/margin/justify-content explicitly. Keep invite plaintext only in page memory and compare every refresh revision before copy/share. Add automated source assertions for these known WeChat regressions.

- [ ] **Step 6: Run and commit**

```bash
npm test -- household-manage-page.test.ts household-invite-page.test.ts profile-page.test.ts project-structure.test.ts --runInBand
npm run typecheck
npm run lint
git diff --check
git add miniprogram/pages/household-manage miniprogram/pages/household-invite miniprogram/pages/profile miniprogram/app.ts miniprogram/app.json tests/household-manage-page.test.ts tests/household-invite-page.test.ts tests/profile-page.test.ts tests/project-structure.test.ts
git commit -m "feat: add household management pages"
```

---

### Task 13: 解散页、微信复核、法律文案与完整客户端回归

**Files:**

- Create: `miniprogram/pages/household-dissolve/index.{ts,json,wxml,wxss}`
- Modify: `miniprogram/services/household-service.ts`
- Modify: `miniprogram/app.ts`
- Modify: `miniprogram/pages/account-deletion/index.{ts,wxml}`
- Modify: `miniprogram/content/legal.ts`
- Modify: `miniprogram/pages/privacy-center/index.wxml`
- Modify: `miniprogram/app.json`
- Create: `tests/household-dissolve-page.test.ts`
- Modify: `tests/household-service.test.ts`
- Modify: `tests/account-pages.test.ts`
- Modify: `tests/fixtures/legal-documents.ts`
- Modify: `tests/legal-pages.test.ts`
- Modify: `tests/project-structure.test.ts`
- Modify: `docs/wechat-privacy-guide-materials.md`

- [ ] **Step 1: Write failing dissolution flow tests**

Assert exact-name mismatch does not call login/API; impact checkbox and final modal are required; modal cancel creates no key and final confirmation creates one. Every explicit attempt obtains a fresh `wx.login` code. Login/network/timeout/unknown 5xx preserves the same payload/key; after `wx.login` failure the next explicit retry uses a fresh code plus that same key. A definitive version/name/role rejection refreshes state and only a new confirmation creates a new key. Same action cannot double-submit; success keeps token and reLaunches family creation.

- [ ] **Step 2: Write failing legal/account consistency tests**

Replace outdated “only my invites” and V4-only deletion text with the final V5–V8 matrix. State role, ordinary exit vs account deletion, hard deletion of all注销者 membership events, shared history labels, personal drafts, household name processing, user-generated text moderation, four-action operation purpose/14-day retention and the account-deletion idempotency exception. Prove account deletion remains reachable with no ACTIVE family; a lost deletion success followed by old-token `UNAUTHORIZED` clears local session. Do not claim production content safety is configured.

- [ ] **Step 3: Verify RED**

```bash
npm test -- household-dissolve-page.test.ts household-service.test.ts account-pages.test.ts legal-pages.test.ts project-structure.test.ts --runInBand
```

- [ ] **Step 4: Implement fresh-code dissolution composition**

The service/app boundary owns `wx.login` just as account deletion does. Check local acknowledgement/name first and create one UUID per confirmed logical action. If login, timeout, network or unknown 5xx leaves the result unknown, an explicit retry reuses that UUID but obtains a new WeChat code; only a definitive business rejection followed by refreshed/changed input and reconfirmation starts a new UUID. Page re-entry refreshes state and never blindly resends. Never log or persist code, operation payload or invite plaintext.

- [ ] **Step 5: Update legal and privacy surfaces**

Keep login-before-access and contact rights unchanged. Update the code-level data inventory and platform materials, but mark actual WeChat platform configuration as a later manual release gate.

- [ ] **Step 6: Run the complete client suite**

```bash
npm test -- --runInBand
npm run typecheck
npm run lint
npm run format:check
git diff --check
```

- [ ] **Step 7: Commit Task 13 only**

```bash
git add miniprogram/pages/household-dissolve miniprogram/services/household-service.ts miniprogram/app.ts miniprogram/pages/account-deletion/index.ts miniprogram/pages/account-deletion/index.wxml miniprogram/content/legal.ts miniprogram/pages/privacy-center/index.wxml miniprogram/app.json tests/household-dissolve-page.test.ts tests/household-service.test.ts tests/account-pages.test.ts tests/fixtures/legal-documents.ts tests/legal-pages.test.ts tests/project-structure.test.ts docs/wechat-privacy-guide-materials.md
git commit -m "feat: add household dissolution flow"
```

---

### Task 14: 原生三视口 QA、独立复核与交接收口

**Files:**

- Create: `docs/design/qa/household-management/household-management-qa.md`
- Create: `docs/design/qa/household-management/*.png`
- Modify: `docs/HANDOFF.md`
- Modify: `docs/review-submission-checklist.md` only to reset/clarify new-candidate evidence; do not mark external checks complete

- [ ] **Step 1: Prepare deterministic local states**

Create reversible local fixtures for profile no-family/OWNER single/OWNER double/MEMBER double/error, long name, active hash-only/expired/generated invite, old/new join code, name conflict, actor history and each dangerous confirmation. Screenshot invite codes are deterministic local fake values and the report must state they cannot join a real household. Do not use shared/production data.

- [ ] **Step 2: Capture native 375/390/430 evidence**

For management, invite and dissolution, verify loading/error/recovery plus core success states. Also cover profile states, creation with the 16-character code/real expiry, join old/new/error states, expanded account deletion, records/family-recipe actor labels, and bottom-nav safe areas on今晚/菜谱/记录/我的. Use 375/390/430 for long-copy/overflow surfaces; at 390px combine each Task 10 reference with the same-state implementation screenshot and judge the combined comparison. Screenshot existence alone is not QA.

- [ ] **Step 3: Fix every P0/P1/P2**

Re-run affected Jest/type/lint checks after each fix. Validate every PNG's actual dimensions. Capture the WeChat developer tool's raw `Errors=0` and `Problems=0` result in the report. Record P3 consciously rather than silently.

- [ ] **Step 4: Independent backend/product/frontend review**

Reviewers check permission coverage, lock order, data matrix, account deletion, native interaction and copy independently. Resolve all actionable P0–P2 before final evidence.

- [ ] **Step 5: Re-run final evidence**

Server:

```bash
cd ../osheeep-server
mvn test
git diff --check
```

Then explicitly rerun the disposable MySQL migration and concurrency ITs from Task 9.

Client:

```bash
cd ../osheeep-wx
npm test -- --runInBand
npm run typecheck
npm run lint
npm run format:check
git diff --check
```

- [ ] **Step 6: Update HANDOFF with exact evidence and boundary**

Record both HEADs, exact test counts, MySQL paths, native viewports and unresolved external gates. State explicitly: V8 not production-applied, server not deployed, mini program not uploaded/submitted/released, no second real account or real-device evidence unless actually performed.

- [ ] **Step 7: Reset candidate checklist truthfully**

Old checked deployment/platform/device items cannot carry forward. Keep new-candidate external items unchecked until bound to the new commit and version.

- [ ] **Step 8: Commit documentation**

```bash
git add docs/HANDOFF.md docs/review-submission-checklist.md docs/design/qa/household-management
git commit -m "docs: verify household management flow"
```

- [ ] **Step 9: Push only with current explicit authorization**

If authorized at execution time, verify both repos are clean and exactly ahead by expected commits, then push `osheeep-server/main` and `osheeep-wx/main`. Do not combine push status with deployment, upload, review submission or release status.

## Plan Self-Review Checklist

- [ ] Every confirmed rule in the design maps to a task and test.
- [ ] V1–V7 remain byte-unchanged; all schema work is V8.
- [ ] ACTIVE authorization covers every family read and write entry.
- [ ] Global lock order is applied before adding dangerous operations.
- [ ] Exit/removal, dissolution and account deletion have distinct draft policies.
- [ ] New/rejoined members cannot regain pre-join history.
- [ ] Invitation entropy, consume and all-family invalidation are covered.
- [ ] No response or page invents nickname/avatar data or leaks internal IDs.
- [ ] UI implementation is blocked on Product Design references.
- [ ] Native QA compares identical viewport and state.
- [ ] Production, upload, review and release remain explicit external gates.
