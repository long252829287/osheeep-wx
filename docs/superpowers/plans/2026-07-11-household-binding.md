# 双人家庭创建与加入 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 登录用户可以创建一个最多两人的家庭、获得 24 小时邀请码，另一位登录用户可凭邀请码加入，并从登录页正确进入家庭绑定或今晚菜单占位页。

**Architecture:** `osheeep-server` 新增独立 `dinner.household` 模块，数据库保存家庭、成员关系和邀请码摘要；加入操作在事务中锁定家庭行，保证并发时最多两名成员。`osheeep-wx` 新增 household service、创建页、加入页和最小 tonight 落地页，页面只持有表单状态，令牌和家庭概要留在 App/session 层。

**Tech Stack:** Java 21、Spring Boot 3.5、MyBatis-Plus、MySQL/Flyway、JUnit 5、MockMvc；微信原生小程序、TypeScript、WXML、WXSS、Jest。

## Global Constraints

- 继续在两个仓库的 `main` 分支直接开发，不创建 worktree。
- 本阶段只实现家庭查询、创建、邀请码刷新和加入；不实现菜谱、菜单选择、家庭退出或家庭改名。
- 每个用户最多属于一个家庭，每个家庭最多 2 名成员，双方权限相同。
- 默认家庭名为“我们的小家”，默认时区为 `Asia/Shanghai`。
- 邀请码格式为 `DINNER 1234`；服务端输入规范化为 `DINNER1234`，24 小时有效。
- 数据库和日志不保存邀请码明文；使用服务端密钥做 HMAC-SHA256 摘要。
- 客户端不自动重试创建、刷新和加入写操作，并在提交期间禁用按钮。
- 所有接口继续使用现有 `ApiResponse<T>`、JWT `CurrentUser` 和统一错误处理。
- 视觉遵循方案 2 与 `docs/design/household-created.png`、`household-join-error.png`，不引入新的 UI 框架。

---

### Task 1: 家庭数据模型与邀请码摘要

**Files:**
- Create: `../osheeep-server/src/main/resources/db/migration/V3__add_dinner_households.sql`
- Create: `../osheeep-server/src/main/java/com/osheeep/server/dinner/household/entity/DinnerHouseholdEntity.java`
- Create: `../osheeep-server/src/main/java/com/osheeep/server/dinner/household/entity/DinnerHouseholdMemberEntity.java`
- Create: `../osheeep-server/src/main/java/com/osheeep/server/dinner/household/entity/DinnerInviteCodeEntity.java`
- Create: `../osheeep-server/src/main/java/com/osheeep/server/dinner/household/mapper/DinnerHouseholdMapper.java`
- Create: `../osheeep-server/src/main/java/com/osheeep/server/dinner/household/mapper/DinnerHouseholdMemberMapper.java`
- Create: `../osheeep-server/src/main/java/com/osheeep/server/dinner/household/mapper/DinnerInviteCodeMapper.java`
- Create: `../osheeep-server/src/main/java/com/osheeep/server/dinner/household/InviteCodeHasher.java`
- Create: `../osheeep-server/src/test/java/com/osheeep/server/dinner/household/InviteCodeHasherTest.java`
- Modify: `../osheeep-server/src/main/resources/application-local.yml`
- Modify: `../osheeep-server/src/main/resources/application-test.yml`

**Interfaces:**
- Consumes: `OSHEEEP_DINNER_INVITE_SECRET`, local profile 默认回退到已存在的 `OSHEEEP_JWT_SECRET`。
- Produces: `InviteCodeHasher.hash(String normalizedCode): String`，以及三个 MyBatis Mapper。

- [x] **Step 1: 写邀请码摘要失败测试**

```java
@Test
void normalizesAndHashesWithoutReturningPlaintext() {
    InviteCodeHasher hasher = new InviteCodeHasher("test-secret-at-least-32-characters");

    String hash = hasher.hash("dinner 5268");

    assertThat(hash).isEqualTo(hasher.hash("DINNER5268"));
    assertThat(hash).hasSize(64).doesNotContain("DINNER", "5268");
}
```

- [x] **Step 2: 运行测试确认类型缺失**

Run: `cd ../osheeep-server && mvn -Dtest=InviteCodeHasherTest test`

Expected: FAIL，`InviteCodeHasher` 尚不存在。

- [x] **Step 3: 创建 V3 迁移**

迁移创建 `dinner_households`、`dinner_household_members`、`dinner_invite_codes`。关键约束：成员表 `user_id` 唯一；邀请码 `code_hash` 唯一；成员和邀请码均外键关联家庭；所有时间使用 `DATETIME(3)`；不创建明文邀请码列。

```sql
CREATE TABLE dinner_households (
    id BIGINT NOT NULL AUTO_INCREMENT,
    name VARCHAR(100) NOT NULL,
    timezone VARCHAR(64) NOT NULL DEFAULT 'Asia/Shanghai',
    status VARCHAR(32) NOT NULL DEFAULT 'ACTIVE',
    created_by BIGINT NOT NULL,
    created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
    PRIMARY KEY (id),
    CONSTRAINT fk_dinner_households_created_by FOREIGN KEY (created_by) REFERENCES users (id)
);

CREATE TABLE dinner_household_members (
    id BIGINT NOT NULL AUTO_INCREMENT,
    household_id BIGINT NOT NULL,
    user_id BIGINT NOT NULL,
    joined_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    PRIMARY KEY (id),
    UNIQUE KEY uk_dinner_household_members_user_id (user_id),
    UNIQUE KEY uk_dinner_household_members_household_user (household_id, user_id),
    KEY idx_dinner_household_members_household_id (household_id),
    CONSTRAINT fk_dinner_members_household FOREIGN KEY (household_id) REFERENCES dinner_households (id),
    CONSTRAINT fk_dinner_members_user FOREIGN KEY (user_id) REFERENCES users (id)
);

CREATE TABLE dinner_invite_codes (
    id BIGINT NOT NULL AUTO_INCREMENT,
    household_id BIGINT NOT NULL,
    code_hash CHAR(64) NOT NULL,
    expires_at DATETIME(3) NOT NULL,
    revoked_at DATETIME(3) NULL,
    created_by BIGINT NOT NULL,
    created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    PRIMARY KEY (id),
    UNIQUE KEY uk_dinner_invite_codes_hash (code_hash),
    KEY idx_dinner_invites_household_active (household_id, revoked_at, expires_at),
    CONSTRAINT fk_dinner_invites_household FOREIGN KEY (household_id) REFERENCES dinner_households (id),
    CONSTRAINT fk_dinner_invites_created_by FOREIGN KEY (created_by) REFERENCES users (id)
);
```

- [x] **Step 4: 实现实体、Mapper 和 HMAC 摘要**

`DinnerHouseholdMapper` 增加 `selectByIdForUpdate(Long id)`，SQL 使用 `FOR UPDATE`。`InviteCodeHasher` 去空格、转大写后使用 `HmacSHA256`，输出 64 位小写十六进制；异常转换为 `IllegalStateException`，不得打印密钥或邀请码。

- [x] **Step 5: 配置邀请码密钥并验证**

`application-local.yml`：

```yaml
osheeep:
  dinner:
    invite-secret: ${OSHEEEP_DINNER_INVITE_SECRET:${OSHEEEP_JWT_SECRET}}
```

测试 profile 使用固定的 32 字符以上测试密钥。运行：`cd ../osheeep-server && mvn -Dtest=InviteCodeHasherTest test`。

Expected: PASS。

- [x] **Step 6: 提交数据模型**

```bash
cd ../osheeep-server
git add src/main/resources src/main/java/com/osheeep/server/dinner src/test/java/com/osheeep/server/dinner
git commit -m "feat: add dinner household persistence"
```

### Task 2: 家庭服务与受保护 API

**Files:**
- Create: `../osheeep-server/src/main/java/com/osheeep/server/dinner/household/DinnerHouseholdService.java`
- Create: `../osheeep-server/src/main/java/com/osheeep/server/dinner/household/DinnerHouseholdController.java`
- Create: `../osheeep-server/src/main/java/com/osheeep/server/dinner/household/dto/CreateHouseholdRequest.java`
- Create: `../osheeep-server/src/main/java/com/osheeep/server/dinner/household/dto/JoinHouseholdRequest.java`
- Create: `../osheeep-server/src/main/java/com/osheeep/server/dinner/household/dto/HouseholdResponse.java`
- Create: `../osheeep-server/src/main/java/com/osheeep/server/dinner/household/dto/HouseholdCreatedResponse.java`
- Create: `../osheeep-server/src/test/java/com/osheeep/server/dinner/household/DinnerHouseholdServiceTest.java`
- Create: `../osheeep-server/src/test/java/com/osheeep/server/dinner/household/DinnerHouseholdControllerTest.java`
- Modify: `../osheeep-server/src/main/java/com/osheeep/server/common/error/ErrorCode.java`
- Modify: `../osheeep-server/src/test/java/com/osheeep/server/TestUserMapperConfig.java`
- Modify: `../osheeep-server/docs/api-contract.md`

**Interfaces:**
- Consumes: `CurrentUser.id()`，Task 1 的 Mapper 与 `InviteCodeHasher`。
- Produces: `GET /api/dinner/household`、`POST /api/dinner/households`、`POST /api/dinner/households/invite-code/refresh`、`POST /api/dinner/households/join`。

- [x] **Step 1: 写家庭服务失败测试**

覆盖四个行为：创建时写入家庭和创建者成员并返回邀请码；已绑定用户不能重复创建；有效邀请码加入后成员数为 2；并发锁内成员数达到 2 时返回 `DINNER_HOUSEHOLD_FULL`。测试固定 `Clock`，断言过期时间为创建时间加 24 小时。

```java
assertThat(service.create(7L, "我们的小家").inviteExpiresAt())
        .isEqualTo(Instant.parse("2026-07-12T06:00:00Z"));
assertThatThrownBy(() -> service.join(8L, "DINNER 5268"))
        .isInstanceOfSatisfying(BusinessException.class, error ->
                assertThat(error.errorCode()).isEqualTo(ErrorCode.DINNER_HOUSEHOLD_FULL));
```

- [x] **Step 2: 运行服务测试确认失败**

Run: `cd ../osheeep-server && mvn -Dtest=DinnerHouseholdServiceTest test`

Expected: FAIL，服务和业务错误码尚不存在。

- [x] **Step 3: 实现最小服务**

`create` 使用默认名兜底、写家庭和成员、生成 `DINNER%04d` 邀请码并最多重试 5 次哈希冲突。`refreshInvite` 校验当前用户是成员，撤销未过期邀请码后创建新码。`join` 先查邀请码摘要和有效期，再锁家庭行、复查当前用户未绑定、统计成员数，最后插入成员。所有写方法使用 `@Transactional`。

- [x] **Step 4: 增加精确业务错误码**

```java
DINNER_INVITE_INVALID(HttpStatus.BAD_REQUEST, "Invite code is invalid"),
DINNER_INVITE_EXPIRED(HttpStatus.BAD_REQUEST, "Invite code has expired"),
DINNER_HOUSEHOLD_FULL(HttpStatus.CONFLICT, "Household already has two members"),
DINNER_ALREADY_IN_HOUSEHOLD(HttpStatus.CONFLICT, "User already belongs to a household")
```

- [x] **Step 5: 写并运行 Controller 失败测试**

使用 `@SpringBootTest`、MockMvc 和测试 JWT，断言：无 JWT 返回 401；未绑定 GET 成功且按现有 `NON_NULL` 契约省略 `data`；创建返回 201 和 `inviteCode`；加入成功返回 200、`memberCount: 2`；无效/过期/满员分别映射精确错误码。

Run: `cd ../osheeep-server && mvn -Dtest=DinnerHouseholdControllerTest test`

Expected: 首次 FAIL，控制器尚未注册；实现控制器后 PASS。

- [x] **Step 6: 更新 API 契约并跑完整后端测试**

记录请求与响应字段：`HouseholdResponse(id,name,timezone,memberCount)`；创建/刷新额外返回 `inviteCode` 与 ISO-8601 `inviteExpiresAt`；加入请求 `{ "inviteCode": "DINNER 5268" }`。

Run: `cd ../osheeep-server && mvn test`

Expected: BUILD SUCCESS，原有 40 个测试和新增测试全部通过。

- [x] **Step 7: 提交家庭 API**

```bash
cd ../osheeep-server
git add src/main/java src/test/java docs/api-contract.md
git commit -m "feat: add dinner household APIs"
```

### Task 3: 小程序家庭服务与登录后路由

**Files:**
- Create: `miniprogram/types/household.ts`
- Create: `miniprogram/services/household-service.ts`
- Create: `tests/household-service.test.ts`
- Modify: `miniprogram/app.ts`
- Modify: `miniprogram/pages/onboarding/index.ts`
- Modify: `tests/auth-service.test.ts`

**Interfaces:**
- Consumes: 现有 `requestClient.request` 和 `sessionStore`。
- Produces: App 方法 `getHousehold()`、`createHousehold()`、`refreshInviteCode()`、`joinHousehold(inviteCode)`，以及登录后路由跳转。

- [x] **Step 1: 写 household service 失败测试**

```ts
expect(await service.getCurrent()).toBeNull();
expect(request).toHaveBeenCalledWith('/api/dinner/household');

await service.join(' dinner 5268 ');
expect(request).toHaveBeenCalledWith('/api/dinner/households/join', {
  method: 'POST',
  data: { inviteCode: 'DINNER 5268' },
});
```

- [x] **Step 2: 运行测试确认 service 缺失**

Run: `npm test -- household-service.test.ts`

Expected: FAIL，模块尚不存在。

- [x] **Step 3: 实现类型和 service**

类型包含 `HouseholdSummary`、`HouseholdCreatedResult`。service 只做路径映射、邀请码去首尾空格/转大写和错误透传，不在 service 中展示 Toast 或跳转。

- [x] **Step 4: 登录成功后查询家庭并跳转**

`onboarding.onContinue` 登录后调用 `getHousehold()`；有家庭使用 `wx.reLaunch({url:'/pages/tonight/index'})`，无家庭使用 `wx.reLaunch({url:'/pages/household-create/index'})`。查询失败停留当前页并展示错误，不伪造无家庭状态。

- [x] **Step 5: 运行前端逻辑验证并提交**

Run: `npm test && npm run typecheck && npm run lint && npm run format:check`

Expected: 全部通过。

```bash
git add miniprogram tests
git commit -m "feat: add household client service"
```

### Task 4: 创建家庭、加入家庭与落地页

**Files:**
- Create: `miniprogram/pages/household-create/index.{ts,json,wxml,wxss}`
- Create: `miniprogram/pages/household-join/index.{ts,json,wxml,wxss}`
- Create: `miniprogram/pages/tonight/index.{ts,json,wxml,wxss}`
- Create: `miniprogram/utils/household-errors.ts`
- Create: `tests/household-errors.test.ts`
- Modify: `miniprogram/app.json`
- Modify: `miniprogram/app.wxss`

**Interfaces:**
- Consumes: Task 3 的 App 家庭方法和 `ApiError.errorCode`。
- Produces: 可在微信开发者工具完成创建、复制/分享邀请码、粘贴并加入、进入 tonight 占位页的页面流。

- [x] **Step 1: 写错误文案失败测试**

```ts
expect(toHouseholdErrorMessage('DINNER_INVITE_INVALID')).toBe('邀请码无效，请检查后重试');
expect(toHouseholdErrorMessage('DINNER_INVITE_EXPIRED')).toBe('邀请码已过期，请让 TA 重新生成');
expect(toHouseholdErrorMessage('DINNER_HOUSEHOLD_FULL')).toBe('这个小家已经有两个人了');
```

- [x] **Step 2: 运行测试确认失败并实现映射**

Run: `npm test -- household-errors.test.ts`

Expected: 首次 FAIL；实现纯函数后 PASS。未知错误显示“操作失败，请稍后重试”。

- [x] **Step 3: 实现创建页**

初始态展示“创建我们的小家”和“我有邀请码”；点击创建后请求一次，成功态按原型显示家庭名、邀请码、24 小时提示、“复制邀请码”“微信邀请 TA”和“进入今晚菜单”。复制使用 `wx.setClipboardData`；分享使用页面 `onShareAppMessage`，path 携带 URL 编码邀请码；页面不记录或输出邀请码日志。

- [x] **Step 4: 实现加入页**

支持手输和 `wx.getClipboardData` 粘贴；提交时禁用按钮；错误保留输入值并按错误码显示；成功后 `wx.reLaunch('/pages/tonight/index')`。通过分享 path 进入时，从 `options.inviteCode` 预填但不自动提交。

- [x] **Step 5: 实现最小 tonight 落地页并注册路由**

tonight 页只展示家庭名称、“家庭已绑定”和“今晚菜单将在下一阶段接入”，提供返回家庭邀请页的入口；不得伪造菜谱或菜单数据。`app.json` 注册 onboarding、household-create、household-join、tonight 四个页面。

- [x] **Step 6: 前端完整验证与视觉检查**

Run: `npm test && npm run typecheck && npm run lint && npm run format:check`

在微信开发者工具检查 375、390、430px：无横向滚动，按钮触控高度不小于 44px，邀请码可复制，错误态不跳页，创建/加入按钮不会重复提交。

- [x] **Step 7: 提交页面流**

```bash
git add miniprogram tests docs/superpowers/plans/2026-07-11-household-binding.md
git commit -m "feat: add household binding flow"
```

### Task 5: 双账号真实联调与交付

**Files:**
- Modify: `docs/superpowers/plans/2026-07-11-household-binding.md`

**Interfaces:**
- Consumes: 两个微信测试账号、真实 AppID/AppSecret、local 后端和开发数据库。
- Produces: 已验证的“账号 A 创建 → 账号 B 加入 → 双方查询同一家庭”链路。

- [x] **Step 1: 启动 local 后端并执行 V3**

Run: `cd ../osheeep-server && set -a; source .env.local; set +a; mvn org.springframework.boot:spring-boot-maven-plugin:3.5.16:run -Dspring-boot.run.profiles=local`

Expected: Flyway schema 迁移到 v3，`/actuator/health` 返回 `UP`。

- [x] **Step 2: 微信开发者工具完成账号 A 创建**

登录后进入创建页，创建默认家庭，复制邀请码。确认页面显示 24 小时有效且后端日志不出现邀请码明文。

- [ ] **Step 3: 第二测试账号完成加入**

粘贴邀请码加入，确认双方 `GET /api/dinner/household` 返回相同家庭 id 和 `memberCount=2`。再次使用该邀请码的第三用户必须得到 `DINNER_HOUSEHOLD_FULL`。

- [x] **Step 4: 最终验证**

Run backend: `cd ../osheeep-server && mvn test`

Run frontend: `npm test && npm run typecheck && npm run lint && npm run format:check`

Expected: 全部通过，两个仓库 `git status --short` 为空。

- [x] **Step 5: 推送两个 main 分支**

只有在用户明确要求推送时执行：

```bash
git push origin main
cd ../osheeep-server && git push origin main
```
