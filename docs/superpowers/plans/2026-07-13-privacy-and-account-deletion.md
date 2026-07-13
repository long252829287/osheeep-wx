# Privacy and Account Deletion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add review-ready native legal pages, explicit login consent, a privacy center, and a WeChat-verified account deletion flow that invalidates old JWTs and safely deletes or anonymizes dinner data.

**Architecture:** The Java backend keeps the existing schema and separates account deletion into an orchestration service, a transactional identity/user worker, and a dinner-household cleanup service. The mini program shares one `wx.login` code helper between login and deletion, renders legal copy from typed local content, and exposes privacy/deletion pages through the existing native navigation model.

**Tech Stack:** Java 21, Spring Boot 3.5.16, Spring Security, MyBatis-Plus 3.5.17, JUnit 5, Mockito, native WeChat Mini Program TypeScript/WXML/WXSS, Jest 29, TypeScript 5.9.

## Global Constraints

- Work directly on each repository's `main` branch as requested; do not create release directories or replace the deployment model.
- Preserve the production API base URL `https://www.osheeep.com` and the login route `pages/onboarding/index`.
- Do not add Taro, uni-app, React, TDesign, a third-party SDK, or a `web-view` legal site.
- Do not request phone number, WeChat nickname/avatar, album, camera, location, contacts, or advertising identifiers.
- `wx.getClipboardData` must remain user-triggered by the existing “粘贴邀请码” button.
- The legal operator display value is `个人主体姓名`; the review checklist must block submission until the administrator confirms it exactly matches the WeChat verified personal name.
- The privacy contact email is `15203700590@163.com`.
- A remaining household member keeps shared history with the deleted member represented only as `已注销成员`.
- When the final household member deletes their account, delete the household and all household dinner data in foreign-key-safe order.
- Never log WeChat login codes, `openid`, JWTs, plaintext invite codes, database credentials, AppSecret, or personal household names during deletion.
- Do not add a Flyway migration: V1-V4 already support nullable profile fields, `status`, `deleted_at`, identity deletion, and dinner-data cleanup.
- Do not click “提交审核”; platform name, privacy guide, categories, experience members, and final review submission remain administrator actions.

---

### Task 1: Reject JWTs for inactive or deleted users

**Repository:** `osheeep-server`

**Files:**

- Modify: `src/main/java/com/osheeep/server/user/UserService.java`
- Modify: `src/main/java/com/osheeep/server/common/security/JwtAuthenticationFilter.java`
- Modify: `src/test/java/com/osheeep/server/TestUserMapperConfig.java`
- Modify: `src/test/java/com/osheeep/server/common/security/SecurityConfigTest.java`

**Interfaces:**

- Consumes: `JwtService.parseToken(String): CurrentUser`, `UserMapper.selectById(Serializable)`.
- Produces: `UserService.isActiveUserId(Long): boolean`; every protected request authenticates only when this method returns `true`.

- [ ] **Step 1: Add a failing security test for a deleted account**

In `SecurityConfigTest`, autowire `UserMapper`, reset it before each test, and add this test:

```java
@Autowired
private UserMapper userMapper;

@BeforeEach
void setUp() {
    reset(userMapper);
}

@Test
void protectedApiRejectsTokenWhenUserWasDeleted() throws Exception {
    UserEntity deleted = new UserEntity();
    deleted.setId(42L);
    deleted.setUsername("deleted_user_42");
    deleted.setStatus("DELETED");
    deleted.setDeletedAt(LocalDateTime.parse("2026-07-13T12:00:00"));
    when(userMapper.selectById(42L)).thenReturn(deleted);
    String token = jwtService.generateToken(new CurrentUser(42L, "long"));

    mockMvc.perform(get("/api/protected")
                    .header(HttpHeaders.AUTHORIZATION, "Bearer " + token))
            .andExpect(status().isUnauthorized())
            .andExpect(jsonPath("$.errorCode").value("UNAUTHORIZED"));
}
```

Add the required imports for `UserMapper`, `UserEntity`, `LocalDateTime`, `BeforeEach`, `reset`, and `when`.

- [ ] **Step 2: Run the focused test and verify the red state**

Run:

```bash
cd /Users/longlonglong/Developer/Personal/Apps/osheeep/osheeep-server
mvn test -Dtest=SecurityConfigTest#protectedApiRejectsTokenWhenUserWasDeleted
```

Expected: FAIL because the current filter trusts any correctly signed, unexpired JWT.

- [ ] **Step 3: Add the active-user lookup and enforce it in the filter**

Add to `UserService`:

```java
public boolean isActiveUserId(Long id) {
    return isActive(userMapper.selectById(id));
}
```

Change `JwtAuthenticationFilter` to inject `UserService` and validate after parsing:

```java
private final JwtService jwtService;
private final UserService userService;

public JwtAuthenticationFilter(JwtService jwtService, UserService userService) {
    this.jwtService = jwtService;
    this.userService = userService;
}

private void authenticate(String token) {
    try {
        CurrentUser currentUser = jwtService.parseToken(token);
        if (!userService.isActiveUserId(currentUser.id())) {
            SecurityContextHolder.clearContext();
            return;
        }
        UsernamePasswordAuthenticationToken authentication =
                new UsernamePasswordAuthenticationToken(
                        currentUser,
                        token,
                        List.of(new SimpleGrantedAuthority("ROLE_USER"))
                );
        SecurityContextHolder.getContext().setAuthentication(authentication);
    } catch (JwtException | IllegalArgumentException exception) {
        SecurityContextHolder.clearContext();
    }
}
```

Import `com.osheeep.server.user.UserService`.

Update `TestUserMapperConfig.userMapper()` so its default answer returns an active user for `selectById`; this keeps existing authenticated controller tests focused on their own behavior while still allowing explicit deleted-user stubbing:

```java
@Bean
public UserMapper userMapper() {
    return Mockito.mock(UserMapper.class, invocation -> {
        if ("selectById".equals(invocation.getMethod().getName())) {
            Object id = invocation.getArgument(0);
            UserEntity user = new UserEntity();
            user.setId(Long.valueOf(id.toString()));
            user.setUsername("test_user_" + id);
            user.setStatus("ACTIVE");
            return user;
        }
        return Answers.RETURNS_DEFAULTS.answer(invocation);
    });
}
```

Import `org.mockito.Answers` and `com.osheeep.server.user.entity.UserEntity`.

- [ ] **Step 4: Run security and controller regression tests**

Run:

```bash
mvn test -Dtest=SecurityConfigTest,AuthControllerTest,DinnerHouseholdControllerTest,DinnerMenuControllerTest
```

Expected: all selected tests PASS; the deleted-user test returns 401 and existing active-user tests remain green.

- [ ] **Step 5: Commit the active-account security gate**

```bash
git add src/main/java/com/osheeep/server/user/UserService.java \
  src/main/java/com/osheeep/server/common/security/JwtAuthenticationFilter.java \
  src/test/java/com/osheeep/server/TestUserMapperConfig.java \
  src/test/java/com/osheeep/server/common/security/SecurityConfigTest.java
git commit -m "feat: reject tokens for inactive users"
```

---

### Task 2: Isolate dinner-household cleanup behavior

**Repository:** `osheeep-server`

**Files:**

- Create: `src/main/java/com/osheeep/server/dinner/household/DinnerAccountCleanupService.java`
- Modify: `src/main/java/com/osheeep/server/dinner/household/mapper/DinnerHouseholdMemberMapper.java`
- Create: `src/test/java/com/osheeep/server/dinner/household/DinnerAccountCleanupServiceTest.java`

**Interfaces:**

- Consumes: existing dinner household, invite, menu, selection, action, recipe, record, and snapshot mappers.
- Produces: `DinnerAccountCleanupService.removeUser(Long userId, LocalDateTime deletedAt): void`; callers run it inside their transaction.

- [ ] **Step 1: Write failing tests for remaining-member and last-member cleanup**

Create `DinnerAccountCleanupServiceTest` using Mockito. The two core tests must contain these assertions:

```java
@Test
void remainingMemberKeepsHouseholdHistoryAndOnlyRemovesDeletingMember() {
    DinnerHouseholdMemberEntity membership = membership(31L, 11L, 7L);
    when(memberMapper.selectByUserIdForUpdate(7L)).thenReturn(membership);
    when(householdMapper.selectByIdForUpdate(11L)).thenReturn(household(11L));
    when(memberMapper.selectCount(any())).thenReturn(2L);

    service.removeUser(7L, LocalDateTime.parse("2026-07-13T12:00:00"));

    verify(inviteMapper).update(isNull(), any());
    verify(memberMapper).deleteById(31L);
    verify(householdMapper, never()).deleteById(anyLong());
    verify(menuMapper, never()).delete(any());
}

@Test
void lastMemberDeletesHouseholdDataInForeignKeySafeOrder() {
    DinnerHouseholdMemberEntity membership = membership(31L, 11L, 7L);
    DinnerMenuEntity menu = new DinnerMenuEntity();
    menu.setId(21L);
    DinnerCookingRecordEntity record = new DinnerCookingRecordEntity();
    record.setId(41L);
    when(memberMapper.selectByUserIdForUpdate(7L)).thenReturn(membership);
    when(householdMapper.selectByIdForUpdate(11L)).thenReturn(household(11L));
    when(memberMapper.selectCount(any())).thenReturn(1L);
    when(menuMapper.selectList(any())).thenReturn(List.of(menu));
    when(recordMapper.selectList(any())).thenReturn(List.of(record));

    service.removeUser(7L, LocalDateTime.parse("2026-07-13T12:00:00"));

    InOrder order = inOrder(snapshotMapper, recordMapper, actionMapper,
            selectionMapper, menuMapper, inviteMapper, memberMapper,
            recipeMapper, householdMapper);
    order.verify(snapshotMapper).delete(any());
    order.verify(recordMapper).delete(any());
    order.verify(actionMapper).delete(any());
    order.verify(selectionMapper).delete(any());
    order.verify(menuMapper).delete(any());
    order.verify(inviteMapper).delete(any());
    order.verify(memberMapper).delete(any());
    order.verify(recipeMapper).delete(any());
    order.verify(householdMapper).deleteById(11L);
}
```

Add a third test proving `removeUser` is a no-op when no membership exists.

- [ ] **Step 2: Run the cleanup test and verify it fails to compile**

Run:

```bash
mvn test -Dtest=DinnerAccountCleanupServiceTest
```

Expected: compilation FAIL because `DinnerAccountCleanupService` and `selectByUserIdForUpdate` do not exist.

- [ ] **Step 3: Add the membership row lock**

Add to `DinnerHouseholdMemberMapper`:

```java
@Select("SELECT * FROM dinner_household_members WHERE user_id = #{userId} FOR UPDATE")
DinnerHouseholdMemberEntity selectByUserIdForUpdate(Long userId);
```

Import `org.apache.ibatis.annotations.Select`.

- [ ] **Step 4: Implement the cleanup service**

Create `DinnerAccountCleanupService` with constructor-injected mappers and this behavior:

```java
@Service
public class DinnerAccountCleanupService {
    private final DinnerHouseholdMapper householdMapper;
    private final DinnerHouseholdMemberMapper memberMapper;
    private final DinnerInviteCodeMapper inviteMapper;
    private final DinnerMenuMapper menuMapper;
    private final DinnerMenuSelectionMapper selectionMapper;
    private final DinnerMenuActionMapper actionMapper;
    private final DinnerRecipeMapper recipeMapper;
    private final DinnerCookingRecordMapper recordMapper;
    private final DinnerRecordDishSnapshotMapper snapshotMapper;

    public DinnerAccountCleanupService(
            DinnerHouseholdMapper householdMapper,
            DinnerHouseholdMemberMapper memberMapper,
            DinnerInviteCodeMapper inviteMapper,
            DinnerMenuMapper menuMapper,
            DinnerMenuSelectionMapper selectionMapper,
            DinnerMenuActionMapper actionMapper,
            DinnerRecipeMapper recipeMapper,
            DinnerCookingRecordMapper recordMapper,
            DinnerRecordDishSnapshotMapper snapshotMapper
    ) {
        this.householdMapper = householdMapper;
        this.memberMapper = memberMapper;
        this.inviteMapper = inviteMapper;
        this.menuMapper = menuMapper;
        this.selectionMapper = selectionMapper;
        this.actionMapper = actionMapper;
        this.recipeMapper = recipeMapper;
        this.recordMapper = recordMapper;
        this.snapshotMapper = snapshotMapper;
    }

    public void removeUser(Long userId, LocalDateTime deletedAt) {
        DinnerHouseholdMemberEntity membership = memberMapper.selectByUserIdForUpdate(userId);
        if (membership == null) {
            return;
        }
        Long householdId = membership.getHouseholdId();
        DinnerHouseholdEntity household = householdMapper.selectByIdForUpdate(householdId);
        if (household == null) {
            memberMapper.deleteById(membership.getId());
            return;
        }
        long memberCount = memberMapper.selectCount(
                Wrappers.<DinnerHouseholdMemberEntity>lambdaQuery()
                        .eq(DinnerHouseholdMemberEntity::getHouseholdId, householdId));
        if (memberCount > 1) {
            inviteMapper.update(null,
                    Wrappers.<DinnerInviteCodeEntity>lambdaUpdate()
                            .eq(DinnerInviteCodeEntity::getCreatedBy, userId)
                            .isNull(DinnerInviteCodeEntity::getRevokedAt)
                            .set(DinnerInviteCodeEntity::getRevokedAt, deletedAt));
            memberMapper.deleteById(membership.getId());
            return;
        }
        deleteHousehold(householdId);
    }

    private void deleteHousehold(Long householdId) {
        List<Long> menuIds = menuMapper.selectList(
                        Wrappers.<DinnerMenuEntity>lambdaQuery()
                                .eq(DinnerMenuEntity::getHouseholdId, householdId))
                .stream().map(DinnerMenuEntity::getId).toList();
        List<Long> recordIds = recordMapper.selectList(
                        Wrappers.<DinnerCookingRecordEntity>lambdaQuery()
                                .eq(DinnerCookingRecordEntity::getHouseholdId, householdId))
                .stream().map(DinnerCookingRecordEntity::getId).toList();

        if (!recordIds.isEmpty()) {
            snapshotMapper.delete(Wrappers.<DinnerRecordDishSnapshotEntity>lambdaQuery()
                    .in(DinnerRecordDishSnapshotEntity::getRecordId, recordIds));
        }
        recordMapper.delete(Wrappers.<DinnerCookingRecordEntity>lambdaQuery()
                .eq(DinnerCookingRecordEntity::getHouseholdId, householdId));
        if (!menuIds.isEmpty()) {
            actionMapper.delete(Wrappers.<DinnerMenuActionEntity>lambdaQuery()
                    .in(DinnerMenuActionEntity::getMenuId, menuIds));
            selectionMapper.delete(Wrappers.<DinnerMenuSelectionEntity>lambdaQuery()
                    .in(DinnerMenuSelectionEntity::getMenuId, menuIds));
        }
        menuMapper.delete(Wrappers.<DinnerMenuEntity>lambdaQuery()
                .eq(DinnerMenuEntity::getHouseholdId, householdId));
        inviteMapper.delete(Wrappers.<DinnerInviteCodeEntity>lambdaQuery()
                .eq(DinnerInviteCodeEntity::getHouseholdId, householdId));
        memberMapper.delete(Wrappers.<DinnerHouseholdMemberEntity>lambdaQuery()
                .eq(DinnerHouseholdMemberEntity::getHouseholdId, householdId));
        recipeMapper.delete(Wrappers.<DinnerRecipeEntity>lambdaQuery()
                .eq(DinnerRecipeEntity::getHouseholdId, householdId));
        householdMapper.deleteById(householdId);
    }
}
```

Use the exact entity mapper types already present in the repository. Do not log any IDs or household values from this method.

- [ ] **Step 5: Run focused cleanup and household tests**

Run:

```bash
mvn test -Dtest=DinnerAccountCleanupServiceTest,DinnerHouseholdServiceTest,DinnerRecordServiceTest
```

Expected: all selected tests PASS.

- [ ] **Step 6: Commit household cleanup**

```bash
git add src/main/java/com/osheeep/server/dinner/household/DinnerAccountCleanupService.java \
  src/main/java/com/osheeep/server/dinner/household/mapper/DinnerHouseholdMemberMapper.java \
  src/test/java/com/osheeep/server/dinner/household/DinnerAccountCleanupServiceTest.java
git commit -m "feat: clean dinner data during account deletion"
```

---

### Task 3: Verify WeChat identity and anonymize the user transactionally

**Repository:** `osheeep-server`

**Files:**

- Modify: `src/main/java/com/osheeep/server/user/UserMapper.java`
- Modify: `src/main/java/com/osheeep/server/common/error/ErrorCode.java`
- Create: `src/main/java/com/osheeep/server/user/AccountDeletionService.java`
- Create: `src/main/java/com/osheeep/server/user/AccountDeletionTransaction.java`
- Create: `src/test/java/com/osheeep/server/user/AccountDeletionServiceTest.java`
- Create: `src/test/java/com/osheeep/server/user/AccountDeletionTransactionTest.java`
- Create: `src/test/java/com/osheeep/server/user/AccountDeletionRollbackIT.java`

**Interfaces:**

- Consumes: `WechatCode2SessionClient.exchange(String): WechatSession`, `DinnerAccountCleanupService.removeUser(Long, LocalDateTime)`.
- Produces: `AccountDeletionService.deleteAccount(Long userId, String code): void`; `AccountDeletionTransaction.deleteVerified(Long userId, String openid): void`.

- [ ] **Step 1: Write the failing orchestration test**

Create `AccountDeletionServiceTest`:

```java
@ExtendWith(MockitoExtension.class)
class AccountDeletionServiceTest {
    @Mock WechatCode2SessionClient sessionClient;
    @Mock AccountDeletionTransaction deletionTransaction;

    @Test
    void exchangesFreshCodeBeforeStartingDeletionTransaction() {
        when(sessionClient.exchange("fresh-code"))
                .thenReturn(new WechatSession("openid-7"));
        AccountDeletionService service =
                new AccountDeletionService(sessionClient, deletionTransaction);

        service.deleteAccount(7L, "fresh-code");

        verify(deletionTransaction).deleteVerified(7L, "openid-7");
    }

    @Test
    void failedWechatExchangeNeverStartsDeletionTransaction() {
        when(sessionClient.exchange("used-code"))
                .thenThrow(new BusinessException(ErrorCode.WECHAT_LOGIN_FAILED));
        AccountDeletionService service =
                new AccountDeletionService(sessionClient, deletionTransaction);

        assertThatThrownBy(() -> service.deleteAccount(7L, "used-code"))
                .isInstanceOfSatisfying(BusinessException.class, error ->
                        assertThat(error.errorCode()).isEqualTo(ErrorCode.WECHAT_LOGIN_FAILED));
        verifyNoInteractions(deletionTransaction);
    }
}
```

- [ ] **Step 2: Write failing transaction tests**

Create `AccountDeletionTransactionTest` with these cases:

```java
@Test
void rejectsDifferentWechatIdentityWithoutChangingData() {
    UserEntity user = activeUser(7L);
    WechatUserIdentityEntity identity = identity(71L, 7L, "openid-7");
    when(userMapper.selectByIdForUpdate(7L)).thenReturn(user);
    when(identityMapper.selectOne(any())).thenReturn(identity);

    assertThatThrownBy(() -> transaction.deleteVerified(7L, "openid-other"))
            .isInstanceOfSatisfying(BusinessException.class, error ->
                    assertThat(error.errorCode())
                            .isEqualTo(ErrorCode.ACCOUNT_DELETION_IDENTITY_MISMATCH));

    verify(dinnerCleanup, never()).removeUser(anyLong(), any());
    verify(identityMapper, never()).deleteById(anyLong());
    verify(userMapper, never()).updateById(any());
}

@Test
void deletesIdentityCleansDinnerDataAndAnonymizesUser() {
    UserEntity user = activeUser(7L);
    user.setEmail("private@example.com");
    user.setPasswordHash("hash");
    user.setDisplayName("Private Name");
    user.setAvatarUrl("https://example.com/avatar.jpg");
    WechatUserIdentityEntity identity = identity(71L, 7L, "openid-7");
    when(userMapper.selectByIdForUpdate(7L)).thenReturn(user);
    when(identityMapper.selectOne(any())).thenReturn(identity);

    transaction.deleteVerified(7L, "openid-7");

    verify(identityMapper).deleteById(71L);
    verify(dinnerCleanup).removeUser(7L, LocalDateTime.parse("2026-07-13T12:00:00"));
    assertThat(user.getUsername()).isEqualTo("deleted_user_7");
    assertThat(user.getEmail()).isNull();
    assertThat(user.getPasswordHash()).isNull();
    assertThat(user.getDisplayName()).isNull();
    assertThat(user.getAvatarUrl()).isNull();
    assertThat(user.getStatus()).isEqualTo("DELETED");
    assertThat(user.getDeletedAt()).isEqualTo(LocalDateTime.parse("2026-07-13T12:00:00"));
    verify(userMapper).updateById(user);
}

@Test
void repeatedDeletionIsRejectedAsUnauthorized() {
    UserEntity deleted = activeUser(7L);
    deleted.setStatus("DELETED");
    deleted.setDeletedAt(LocalDateTime.parse("2026-07-13T11:00:00"));
    when(userMapper.selectByIdForUpdate(7L)).thenReturn(deleted);

    assertThatThrownBy(() -> transaction.deleteVerified(7L, "openid-7"))
            .isInstanceOfSatisfying(BusinessException.class, error ->
                    assertThat(error.errorCode()).isEqualTo(ErrorCode.UNAUTHORIZED));
    verifyNoInteractions(identityMapper, dinnerCleanup);
    verify(userMapper, never()).updateById(any());
}
```

Use a fixed `Clock` of `2026-07-13T12:00:00Z`.

- [ ] **Step 3: Run both tests and verify the red state**

Run:

```bash
mvn test -Dtest=AccountDeletionServiceTest,AccountDeletionTransactionTest
```

Expected: compilation FAIL because the account-deletion classes, error code, and row-lock mapper method do not exist.

- [ ] **Step 4: Add a user row lock**

Add to `UserMapper`:

```java
@Select("SELECT * FROM users WHERE id = #{id} FOR UPDATE")
UserEntity selectByIdForUpdate(Long id);
```

Import `org.apache.ibatis.annotations.Select`.

- [ ] **Step 5: Implement the non-transactional WeChat code exchange**

Create `AccountDeletionService`:

```java
@Service
public class AccountDeletionService {
    private final WechatCode2SessionClient sessionClient;
    private final AccountDeletionTransaction deletionTransaction;

    public AccountDeletionService(
            WechatCode2SessionClient sessionClient,
            AccountDeletionTransaction deletionTransaction
    ) {
        this.sessionClient = sessionClient;
        this.deletionTransaction = deletionTransaction;
    }

    public void deleteAccount(Long userId, String code) {
        WechatSession session = sessionClient.exchange(code);
        deletionTransaction.deleteVerified(userId, session.openid());
    }
}
```

This keeps the remote `code2session` call outside the database transaction.

- [ ] **Step 6: Implement the transactional identity match and anonymization**

Add the stable identity-mismatch code to `ErrorCode`:

```java
ACCOUNT_DELETION_IDENTITY_MISMATCH(HttpStatus.FORBIDDEN, "WeChat identity does not match current account"),
```

Create `AccountDeletionTransaction`:

```java
@Service
public class AccountDeletionTransaction {
    private final UserMapper userMapper;
    private final UserService userService;
    private final WechatUserIdentityMapper identityMapper;
    private final DinnerAccountCleanupService dinnerCleanup;
    private final Clock clock;

    @Autowired
    public AccountDeletionTransaction(
            UserMapper userMapper,
            UserService userService,
            WechatUserIdentityMapper identityMapper,
            DinnerAccountCleanupService dinnerCleanup
    ) {
        this(userMapper, userService, identityMapper, dinnerCleanup, Clock.systemUTC());
    }

    AccountDeletionTransaction(
            UserMapper userMapper,
            UserService userService,
            WechatUserIdentityMapper identityMapper,
            DinnerAccountCleanupService dinnerCleanup,
            Clock clock
    ) {
        this.userMapper = userMapper;
        this.userService = userService;
        this.identityMapper = identityMapper;
        this.dinnerCleanup = dinnerCleanup;
        this.clock = clock;
    }

    @Transactional
    public void deleteVerified(Long userId, String openid) {
        UserEntity user = userMapper.selectByIdForUpdate(userId);
        if (!userService.isActive(user)) {
            throw new BusinessException(ErrorCode.UNAUTHORIZED, "User is not available");
        }
        WechatUserIdentityEntity identity = identityMapper.selectOne(
                Wrappers.<WechatUserIdentityEntity>lambdaQuery()
                        .eq(WechatUserIdentityEntity::getUserId, userId)
                        .last("LIMIT 1"));
        if (identity == null || !Objects.equals(identity.getOpenid(), openid)) {
            throw new BusinessException(ErrorCode.ACCOUNT_DELETION_IDENTITY_MISMATCH);
        }

        LocalDateTime deletedAt =
                LocalDateTime.ofInstant(clock.instant(), ZoneOffset.UTC);
        identityMapper.deleteById(identity.getId());
        dinnerCleanup.removeUser(userId, deletedAt);
        user.setUsername("deleted_user_" + userId);
        user.setEmail(null);
        user.setPasswordHash(null);
        user.setDisplayName(null);
        user.setAvatarUrl(null);
        user.setStatus("DELETED");
        user.setDeletedAt(deletedAt);
        userMapper.updateById(user);
    }
}
```

Import `Wrappers`, `BusinessException`, `ErrorCode`, the WeChat identity types, `DinnerAccountCleanupService`, `Clock`, `LocalDateTime`, `ZoneOffset`, `Objects`, `Autowired`, `Service`, and `Transactional`.

- [ ] **Step 7: Run transaction and existing WeChat-login tests**

Run:

```bash
mvn test -Dtest=AccountDeletionServiceTest,AccountDeletionTransactionTest,WechatAuthServiceTest
```

Expected: all selected tests PASS.

- [ ] **Step 8: Add and run a real transaction rollback integration test**

Create `AccountDeletionRollbackIT` with a real test database and a mocked dinner cleanup failure:

```java
@ActiveProfiles("local")
@SpringBootTest
class AccountDeletionRollbackIT {
    @Autowired JdbcTemplate jdbcTemplate;
    @Autowired AccountDeletionTransaction transaction;
    @MockitoBean DinnerAccountCleanupService dinnerCleanup;

    private Long userId;

    @BeforeEach
    void setUp() {
        String username = "rollback_" + UUID.randomUUID().toString().replace("-", "");
        jdbcTemplate.update(
                "INSERT INTO users (username, status) VALUES (?, 'ACTIVE')", username);
        userId = jdbcTemplate.queryForObject(
                "SELECT id FROM users WHERE username = ?", Long.class, username);
        jdbcTemplate.update(
                "INSERT INTO wechat_user_identities (user_id, openid) VALUES (?, ?)",
                userId, "rollback-openid");
        doThrow(new IllegalStateException("forced cleanup failure"))
                .when(dinnerCleanup).removeUser(eq(userId), any(LocalDateTime.class));
    }

    @AfterEach
    void cleanUp() {
        jdbcTemplate.update("DELETE FROM wechat_user_identities WHERE user_id = ?", userId);
        jdbcTemplate.update("DELETE FROM users WHERE id = ?", userId);
    }

    @Test
    void cleanupFailureRollsBackIdentityAndUserChanges() {
        assertThatThrownBy(() -> transaction.deleteVerified(userId, "rollback-openid"))
                .isInstanceOf(IllegalStateException.class);

        Integer identities = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM wechat_user_identities WHERE user_id = ?",
                Integer.class, userId);
        String status = jdbcTemplate.queryForObject(
                "SELECT status FROM users WHERE id = ?", String.class, userId);
        assertThat(identities).isEqualTo(1);
        assertThat(status).isEqualTo("ACTIVE");
    }
}
```

Run against the configured test database without printing environment values:

```bash
export JAVA_HOME=$(/usr/libexec/java_home -v 21)
export PATH="$JAVA_HOME/bin:$PATH"
set -a
source .env.local
set +a
export OSHEEEP_DB_NAME="$OSHEEEP_DB_TEST_NAME"
mvn test -Dtest=AccountDeletionRollbackIT -Dspring.profiles.active=local
```

Expected: PASS, proving the deleted identity row is restored and the user remains `ACTIVE` when cleanup throws.

- [ ] **Step 9: Commit the verified deletion transaction**

```bash
git add src/main/java/com/osheeep/server/user/UserMapper.java \
  src/main/java/com/osheeep/server/user/AccountDeletionService.java \
  src/main/java/com/osheeep/server/user/AccountDeletionTransaction.java \
  src/main/java/com/osheeep/server/common/error/ErrorCode.java \
  src/test/java/com/osheeep/server/user/AccountDeletionServiceTest.java \
  src/test/java/com/osheeep/server/user/AccountDeletionTransactionTest.java \
  src/test/java/com/osheeep/server/user/AccountDeletionRollbackIT.java
git commit -m "feat: delete accounts with WeChat revalidation"
```

---

### Task 4: Expose the authenticated deletion API contract

**Repository:** `osheeep-server`

**Files:**

- Create: `src/main/java/com/osheeep/server/user/dto/AccountDeletionRequest.java`
- Modify: `src/main/java/com/osheeep/server/user/UserController.java`
- Create: `src/test/java/com/osheeep/server/user/UserControllerTest.java`

**Interfaces:**

- Consumes: `AccountDeletionService.deleteAccount(Long, String)` from Task 3.
- Produces: `POST /api/users/me/deletion` with `{ "code": string }`, returning `ApiResponse<Void>`.

- [ ] **Step 1: Write failing MVC tests**

Create `UserControllerTest` with `@SpringBootTest`, `@AutoConfigureMockMvc`, `@ActiveProfiles("test")`, `@Import(TestUserMapperConfig.class)`, and `@MockitoBean AccountDeletionService`. Add:

```java
@Test
void deletionRequiresAuthentication() throws Exception {
    mockMvc.perform(post("/api/users/me/deletion")
                    .contentType(MediaType.APPLICATION_JSON)
                    .content("{\"code\":\"fresh-code\"}"))
            .andExpect(status().isUnauthorized())
            .andExpect(jsonPath("$.errorCode").value("UNAUTHORIZED"));
}

@Test
void deletionRejectsBlankWechatCode() throws Exception {
    mockMvc.perform(post("/api/users/me/deletion")
                    .header(HttpHeaders.AUTHORIZATION, "Bearer " + token())
                    .contentType(MediaType.APPLICATION_JSON)
                    .content("{\"code\":\" \"}"))
            .andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.errorCode").value("VALIDATION_ERROR"));
}

@Test
void deletionUsesCurrentUserAndReturnsSuccess() throws Exception {
    mockMvc.perform(post("/api/users/me/deletion")
                    .header(HttpHeaders.AUTHORIZATION, "Bearer " + token())
                    .contentType(MediaType.APPLICATION_JSON)
                    .content("{\"code\":\"fresh-code\"}"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.success").value(true))
            .andExpect(jsonPath("$.data").doesNotExist());

    verify(accountDeletionService).deleteAccount(7L, "fresh-code");
}

@Test
void deletionMapsWechatIdentityMismatch() throws Exception {
    doThrow(new BusinessException(ErrorCode.ACCOUNT_DELETION_IDENTITY_MISMATCH))
            .when(accountDeletionService).deleteAccount(7L, "other-account-code");

    mockMvc.perform(post("/api/users/me/deletion")
                    .header(HttpHeaders.AUTHORIZATION, "Bearer " + token())
                    .contentType(MediaType.APPLICATION_JSON)
                    .content("{\"code\":\"other-account-code\"}"))
            .andExpect(status().isForbidden())
            .andExpect(jsonPath("$.errorCode")
                    .value("ACCOUNT_DELETION_IDENTITY_MISMATCH"));
}
```

The `token()` helper generates a JWT for `new CurrentUser(7L, "wx_user")`.

- [ ] **Step 2: Run the MVC test and verify the red state**

Run:

```bash
mvn test -Dtest=UserControllerTest
```

Expected: FAIL because the endpoint and request DTO do not exist.

- [ ] **Step 3: Add the validated request DTO and controller method**

Create `AccountDeletionRequest`:

```java
package com.osheeep.server.user.dto;

import jakarta.validation.constraints.NotBlank;

public record AccountDeletionRequest(@NotBlank String code) {
}
```

Update `UserController` constructor to receive `AccountDeletionService`, then add:

```java
@PostMapping("/me/deletion")
public ApiResponse<Void> deleteMe(
        @AuthenticationPrincipal CurrentUser currentUser,
        @Valid @RequestBody AccountDeletionRequest request
) {
    accountDeletionService.deleteAccount(currentUser.id(), request.code());
    return ApiResponse.ok(null);
}
```

Import `AccountDeletionRequest`, `Valid`, `PostMapping`, and `RequestBody`.

- [ ] **Step 4: Run the complete backend suite**

Run:

```bash
mvn test
```

Expected: all backend tests PASS with 0 failures and 0 errors. Record the actual test count in the implementation notes rather than assuming it remains 77.

- [ ] **Step 5: Commit the deletion endpoint**

```bash
git add src/main/java/com/osheeep/server/user/dto/AccountDeletionRequest.java \
  src/main/java/com/osheeep/server/user/UserController.java \
  src/test/java/com/osheeep/server/user/UserControllerTest.java
git commit -m "feat: expose account deletion endpoint"
```

---

### Task 5: Share fresh WeChat-code acquisition and add the mini-program account service

**Repository:** `osheeep-wx`

**Files:**

- Create: `miniprogram/services/wechat-login.ts`
- Modify: `miniprogram/services/auth-service.ts`
- Create: `miniprogram/services/account-service.ts`
- Modify: `miniprogram/app.ts`
- Create: `tests/wechat-login.test.ts`
- Create: `tests/account-service.test.ts`

**Interfaces:**

- Consumes: existing `RequestInit` and request client.
- Produces: `requestWechatCode(login): Promise<string>` and `createAccountService(...).deleteAccount(): Promise<void>`.

- [ ] **Step 1: Write failing tests for fresh-code acquisition and clear-after-success**

Create `tests/wechat-login.test.ts`:

```ts
import { requestWechatCode } from '../miniprogram/services/wechat-login';

test('resolves a non-empty code returned by wx.login', async () => {
  await expect(
    requestWechatCode((options) => options.success?.({ code: 'fresh-code' })),
  ).resolves.toBe('fresh-code');
});

test('rejects empty codes and wx.login failures', async () => {
  await expect(
    requestWechatCode((options) => options.success?.({ code: '' })),
  ).rejects.toThrow('微信登录未返回 code');
  await expect(
    requestWechatCode((options) =>
      options.fail?.({ errMsg: 'login:fail denied' }),
    ),
  ).rejects.toThrow('login:fail denied');
});
```

Create `tests/account-service.test.ts`:

```ts
import { createAccountService } from '../miniprogram/services/account-service';

test('uses a fresh code and clears session only after deletion succeeds', async () => {
  const clearSession = jest.fn();
  const request = jest.fn().mockResolvedValue(undefined);
  const service = createAccountService({
    login: (options) => options.success?.({ code: 'fresh-code' }),
    request,
    clearSession,
  });

  await service.deleteAccount();

  expect(request).toHaveBeenCalledWith('/api/users/me/deletion', {
    method: 'POST',
    data: { code: 'fresh-code' },
  });
  expect(clearSession).toHaveBeenCalledTimes(1);
});

test('keeps the session when deletion fails', async () => {
  const clearSession = jest.fn();
  const service = createAccountService({
    login: (options) => options.success?.({ code: 'fresh-code' }),
    request: jest.fn().mockRejectedValue(new Error('server failed')),
    clearSession,
  });

  await expect(service.deleteAccount()).rejects.toThrow('server failed');
  expect(clearSession).not.toHaveBeenCalled();
});
```

- [ ] **Step 2: Run the new tests and verify the red state**

Run:

```bash
cd /Users/longlonglong/Developer/Personal/Apps/osheeep/osheeep-wx
npm test -- --runInBand tests/wechat-login.test.ts tests/account-service.test.ts
```

Expected: FAIL because both service modules are missing.

- [ ] **Step 3: Extract the shared WeChat login-code helper**

Create `miniprogram/services/wechat-login.ts`:

```ts
export interface LoginOptions {
  success?: (result: { code: string }) => void;
  fail?: (error: { errMsg: string }) => void;
}

export type LoginPort = (options: LoginOptions) => void;

export const requestWechatCode = (login: LoginPort) =>
  new Promise<string>((resolve, reject) => {
    login({
      success: (result) =>
        result.code
          ? resolve(result.code)
          : reject(new Error('微信登录未返回 code')),
      fail: (error) => reject(new Error(error.errMsg)),
    });
  });
```

Change `auth-service.ts` to import `LoginPort` and `requestWechatCode`, remove its duplicate interfaces, and replace its local promise with:

```ts
const code = await requestWechatCode(options.login);
```

Keep exporting `LoginPort` from `auth-service.ts` for current imports:

```ts
export type { LoginPort } from './wechat-login';
```

- [ ] **Step 4: Implement the account service and wire it into `App`**

Create `miniprogram/services/account-service.ts`:

```ts
import type { RequestInit } from '../types/api';
import { requestWechatCode, type LoginPort } from './wechat-login';

type RequestFunction = <T>(path: string, init?: RequestInit) => Promise<T>;

export const createAccountService = (options: {
  login: LoginPort;
  request: RequestFunction;
  clearSession: () => void;
}) => ({
  deleteAccount: async () => {
    const code = await requestWechatCode(options.login);
    await options.request<void>('/api/users/me/deletion', {
      method: 'POST',
      data: { code },
    });
    options.clearSession();
  },
});
```

In `app.ts`, import and construct `accountService` with the existing `loginPort.login`, `requestClient.request`, and `session.clear`, then expose:

```ts
deleteAccount: accountService.deleteAccount,
```

- [ ] **Step 5: Run service tests, typecheck, and lint**

Run:

```bash
npm test -- --runInBand tests/wechat-login.test.ts tests/account-service.test.ts tests/auth-service.test.ts
npm run typecheck
npm run lint
```

Expected: all selected Jest tests PASS; TypeScript and ESLint exit 0.

- [ ] **Step 6: Commit the account client service**

```bash
git add miniprogram/services/wechat-login.ts miniprogram/services/auth-service.ts \
  miniprogram/services/account-service.ts miniprogram/app.ts \
  tests/wechat-login.test.ts tests/account-service.test.ts
git commit -m "feat: add mini program account deletion service"
```

---

### Task 6: Add explicit login consent and native legal documents

**Repository:** `osheeep-wx`

**Files:**

- Create: `miniprogram/content/legal.ts`
- Create: `miniprogram/utils/onboarding-consent.ts`
- Modify: `miniprogram/pages/onboarding/index.ts`
- Modify: `miniprogram/pages/onboarding/index.wxml`
- Modify: `miniprogram/pages/onboarding/index.wxss`
- Create: `miniprogram/pages/legal/user-agreement/index.ts`
- Create: `miniprogram/pages/legal/user-agreement/index.wxml`
- Create: `miniprogram/pages/legal/user-agreement/index.wxss`
- Create: `miniprogram/pages/legal/user-agreement/index.json`
- Create: `miniprogram/pages/legal/privacy-policy/index.ts`
- Create: `miniprogram/pages/legal/privacy-policy/index.wxml`
- Create: `miniprogram/pages/legal/privacy-policy/index.wxss`
- Create: `miniprogram/pages/legal/privacy-policy/index.json`
- Modify: `miniprogram/app.json`
- Create: `tests/onboarding-consent.test.ts`
- Create: `tests/legal-pages.test.ts`

**Interfaces:**

- Produces: `hasAcceptedLegalTerms(values: string[]): boolean`; `USER_AGREEMENT` and `PRIVACY_POLICY` typed content objects; two public native routes.

- [ ] **Step 1: Write failing consent and route contract tests**

Create `tests/onboarding-consent.test.ts`:

```ts
import { hasAcceptedLegalTerms } from '../miniprogram/utils/onboarding-consent';

test('accepts only the explicit accepted checkbox value', () => {
  expect(hasAcceptedLegalTerms([])).toBe(false);
  expect(hasAcceptedLegalTerms(['other'])).toBe(false);
  expect(hasAcceptedLegalTerms(['accepted'])).toBe(true);
});
```

Create `tests/legal-pages.test.ts` to read `app.json`, onboarding WXML/TS, and legal content:

```ts
test('declares public legal routes and explicit onboarding consent', () => {
  expect(appConfig.pages).toEqual(
    expect.arrayContaining([
      'pages/legal/user-agreement/index',
      'pages/legal/privacy-policy/index',
    ]),
  );
  expect(onboardingWxml).toContain('checkbox-group');
  expect(onboardingWxml).toContain('value="accepted"');
  expect(onboardingWxml).toContain(
    'disabled="{{loading || !agreementAccepted}}"',
  );
  expect(onboardingTs).toContain('if (!this.data.agreementAccepted) return;');
  expect(legalContent).toContain("export const OPERATOR_NAME = '个人主体姓名'");
  expect(legalContent).toContain(
    "export const PRIVACY_EMAIL = '15203700590@163.com'",
  );
});
```

- [ ] **Step 2: Run both tests and verify the red state**

Run:

```bash
npm test -- --runInBand tests/onboarding-consent.test.ts tests/legal-pages.test.ts
```

Expected: FAIL because the helper, legal content, routes, and consent controls do not exist.

- [ ] **Step 3: Add typed legal copy with exact operator and contact values**

Create `miniprogram/content/legal.ts`:

```ts
export interface LegalSection {
  heading: string;
  paragraphs: string[];
}

export interface LegalDocument {
  title: string;
  updatedAt: string;
  effectiveAt: string;
  sections: LegalSection[];
}

export const OPERATOR_NAME = '个人主体姓名';
export const PRIVACY_EMAIL = '15203700590@163.com';

export const USER_AGREEMENT: LegalDocument = {
  title: '用户协议',
  updatedAt: '2026年7月13日',
  effectiveAt: '2026年7月13日',
  sections: [
    {
      heading: '一、协议范围',
      paragraphs: [
        '本协议由你与“今晚吃什么”的运营者个人主体姓名共同订立。使用本小程序前，请完整阅读并理解本协议。',
        '当你主动勾选同意并使用微信登录，即表示你同意遵守本协议和《隐私政策》。',
      ],
    },
    {
      heading: '二、服务内容',
      paragraphs: [
        '本小程序帮助两名用户创建同一个小家，分别选择菜品，合并并确认今晚菜单，以及回看做饭记录。',
        '当前服务不提供交易、配送、营养诊断或医疗建议。菜品名称、口味和预计时间仅供日常决策参考。',
      ],
    },
    {
      heading: '三、账号与小家',
      paragraphs: [
        '账号通过微信临时登录凭证识别。你应使用本人有权使用的微信账号，不得冒用他人身份。',
        '每个账号同一时间只能加入一个小家，每个小家最多两名成员。邀请码仅用于邀请你信任的人，并在生成后24小时内有效。',
        '同一小家的成员权限相同。任一成员都能修改、确认和完成共同菜单；修改已确认菜单会使菜单重新进入待确认状态。',
      ],
    },
    {
      heading: '四、使用规则',
      paragraphs: [
        '你不得利用本服务实施违法活动、攻击系统、批量试探邀请码、干扰其他用户，或上传和传播侵犯他人权益的内容。',
        '因网络、微信平台维护、设备故障或不可抗力造成的短暂中断，我们会在合理范围内恢复服务。',
      ],
    },
    {
      heading: '五、账号注销',
      paragraphs: [
        '你可以在“我的—隐私与账户—注销账号”中发起注销。注销前需要使用当前微信身份重新验证。',
        '注销后，微信身份绑定和个人资料会被删除或去标识化，你会退出当前小家。仍有另一名成员时，共同历史会以“已注销成员”身份保留；最后一名成员注销时，小家及其关联业务数据会被删除。',
      ],
    },
    {
      heading: '六、协议更新与联系',
      paragraphs: [
        '我们可能因功能或规则变化更新本协议。发生重大变化时，会通过小程序内显著方式提示，并在需要时重新取得你的同意。',
        `运营主体：${OPERATOR_NAME}。联系邮箱：${PRIVACY_EMAIL}。`,
      ],
    },
  ],
};

export const PRIVACY_POLICY: LegalDocument = {
  title: '隐私政策',
  updatedAt: '2026年7月13日',
  effectiveAt: '2026年7月13日',
  sections: [
    {
      heading: '一、我们是谁',
      paragraphs: [
        `“今晚吃什么”的个人信息处理者为${OPERATOR_NAME}。如需咨询、查阅、更正、删除个人信息或投诉，请联系${PRIVACY_EMAIL}。`,
      ],
    },
    {
      heading: '二、我们处理的信息',
      paragraphs: [
        '微信登录时，我们通过微信提供的临时登录凭证获取openid，用于创建和识别你的账号。我们不会因此获取你的手机号、微信昵称或头像。',
        '为提供双人家庭功能，我们处理家庭名称、成员关系和邀请码哈希。邀请码明文只在生成时返回，有效期为24小时。',
        '为提供选菜和历史回看功能，我们处理菜品选择、菜单状态、确认和完成动作、做饭记录及菜品快照。',
        '访问令牌保存在微信本地存储中，用于维持登录状态；令牌到期、接口返回未认证或账号注销时会被清除。',
        '只有当你点击“粘贴邀请码”时，小程序才读取剪贴板，并只把整理后的邀请码提交给服务端验证，不把剪贴板内容作为独立资料保存。',
        '我们保留必要的运行日志用于安全、排障和运维，当前最长保存14天；日志不得记录微信登录凭证、openid、访问令牌、邀请码明文或密钥。',
      ],
    },
    {
      heading: '三、我们不收集的信息',
      paragraphs: [
        '当前版本不收集手机号、真实姓名、微信昵称头像、相册内容、摄像头内容、精确位置、通讯录、广告标识或用户画像。',
      ],
    },
    {
      heading: '四、使用、共享和委托处理',
      paragraphs: [
        '我们只在实现登录、家庭、菜单和记录功能所必需的范围内使用信息，不出售个人信息，也不用于广告画像。',
        '微信登录需要向微信服务提交一次性登录凭证。服务器和数据库运行所需的基础设施服务商可能在受托范围内处理必要数据，我们要求其采取安全保护措施，不得用于其他目的。',
        '除法律法规要求、保护重大合法权益或取得你的另行同意外，我们不会向其他第三方提供可识别个人的信息。',
      ],
    },
    {
      heading: '五、保存和删除',
      paragraphs: [
        '账号存续期间，我们在实现服务所需的最短期限内保存相关数据。邀请码24小时后失效，运行日志当前最长保存14天。',
        '一方注销且小家仍有另一名成员时，微信身份和个人资料会被删除或去标识化，共同历史仅以“已注销成员”显示。最后一名成员注销时，小家及其关联业务数据会被删除。',
      ],
    },
    {
      heading: '六、你的权利',
      paragraphs: [
        `你可以通过${PRIVACY_EMAIL}申请查阅、更正、复制或删除相关个人信息，也可以提出隐私咨询或投诉。我们可能需要验证你的身份后处理请求。`,
        '你可以停止使用本服务并在“我的—隐私与账户—注销账号”完成自助注销。注销成功后，旧访问令牌立即失效。',
      ],
    },
    {
      heading: '七、未成年人',
      paragraphs: [
        '本服务面向具备相应民事行为能力的用户。未满十四周岁的未成年人应在监护人同意和指导下使用；如监护人发现未成年人信息被不当处理，请通过联系邮箱通知我们。',
      ],
    },
    {
      heading: '八、政策更新',
      paragraphs: [
        '功能、信息种类或处理目的发生重大变化时，我们会更新本政策，通过小程序内显著方式提示，并在法律要求时重新取得同意。',
      ],
    },
  ],
};
```

- [ ] **Step 4: Implement the consent state and navigation**

Create `miniprogram/utils/onboarding-consent.ts`:

```ts
export const hasAcceptedLegalTerms = (values: string[]) =>
  values.includes('accepted');
```

Update onboarding page data and handlers:

```ts
data: {
  loading: false,
  agreementAccepted: false,
  errorMessage: '',
},

onAgreementChange(event: WechatMiniprogram.CheckboxGroupChange) {
  this.setData({
    agreementAccepted: hasAcceptedLegalTerms(event.detail.value),
    errorMessage: '',
  });
},

onOpenUserAgreement() {
  wx.navigateTo({ url: '/pages/legal/user-agreement/index' });
},

onOpenPrivacyPolicy() {
  wx.navigateTo({ url: '/pages/legal/privacy-policy/index' });
},

async onContinue() {
  if (!this.data.agreementAccepted) return;
  this.setData({ loading: true, errorMessage: '' });
  try {
    const app = getApp<OsheeepApp>();
    await app.loginWithWechat();
    const url = await resolvePostLoginRoute(app.getHousehold);
    wx.reLaunch({ url });
  } catch (error) {
    this.setData({
      errorMessage:
        error instanceof Error ? error.message : '登录失败，请稍后重试',
    });
  } finally {
    this.setData({ loading: false });
  }
}
```

Replace the existing static privacy text in WXML with:

```xml
<checkbox-group class="agreement" bindchange="onAgreementChange">
  <label class="agreement-row">
    <checkbox value="accepted" checked="{{agreementAccepted}}" color="#CE5928" />
    <text>我已阅读并同意</text>
  </label>
</checkbox-group>
<view class="legal-links">
  <text class="legal-link" catchtap="onOpenUserAgreement">《用户协议》</text>
  <text>和</text>
  <text class="legal-link" catchtap="onOpenPrivacyPolicy">《隐私政策》</text>
</view>
<text class="permission-note">首次登录不会自动获取手机号、头像、相册或定位权限</text>
```

Set the login button to:

```xml
disabled="{{loading || !agreementAccepted}}"
```

Add exact styles:

```css
.agreement {
  margin-top: 28rpx;
}
.agreement-row {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10rpx;
  color: #66625b;
  font-size: 24rpx;
}
.legal-links {
  display: flex;
  justify-content: center;
  margin-top: 8rpx;
  color: #77746c;
  font-size: 23rpx;
  line-height: 1.6;
}
.legal-link {
  color: #b94b22;
  text-decoration: underline;
}
```

- [ ] **Step 5: Create both legal document pages**

Each page TS sets its matching document:

```ts
import { USER_AGREEMENT } from '../../../content/legal';

Page({ data: { document: USER_AGREEMENT } });
```

and:

```ts
import { PRIVACY_POLICY } from '../../../content/legal';

Page({ data: { document: PRIVACY_POLICY } });
```

Use this WXML in both pages:

```xml
<view class="legal-page">
  <text class="legal-title">{{document.title}}</text>
  <text class="legal-date">更新日期：{{document.updatedAt}}</text>
  <text class="legal-date">生效日期：{{document.effectiveAt}}</text>
  <view wx:for="{{document.sections}}" wx:key="heading" class="legal-section">
    <text class="legal-heading">{{item.heading}}</text>
    <text wx:for="{{item.paragraphs}}" wx:for-item="paragraph" wx:key="*this" class="legal-paragraph">{{paragraph}}</text>
  </view>
</view>
```

Use this WXSS in both pages:

```css
.legal-page {
  box-sizing: border-box;
  min-height: 100vh;
  padding: 48rpx 40rpx calc(64rpx + env(safe-area-inset-bottom));
}
.legal-title,
.legal-date,
.legal-heading,
.legal-paragraph {
  display: block;
}
.legal-title {
  font-size: 46rpx;
  font-weight: 750;
}
.legal-date {
  margin-top: 12rpx;
  color: #8b877f;
  font-size: 23rpx;
}
.legal-section {
  margin-top: 42rpx;
}
.legal-heading {
  color: #5f6935;
  font-size: 31rpx;
  font-weight: 700;
}
.legal-paragraph {
  margin-top: 18rpx;
  color: #4f4c46;
  font-size: 27rpx;
  line-height: 1.85;
}
```

Create `user-agreement/index.json`:

```json
{
  "navigationBarTitleText": "用户协议",
  "navigationBarBackgroundColor": "#FFFAF3",
  "navigationBarTextStyle": "black"
}
```

Create `privacy-policy/index.json`:

```json
{
  "navigationBarTitleText": "隐私政策",
  "navigationBarBackgroundColor": "#FFFAF3",
  "navigationBarTextStyle": "black"
}
```

Add both routes to `app.json` immediately after `pages/onboarding/index`:

```json
"pages/onboarding/index",
"pages/legal/user-agreement/index",
"pages/legal/privacy-policy/index",
```

- [ ] **Step 6: Run focused tests and static checks**

Run:

```bash
npm test -- --runInBand tests/onboarding-consent.test.ts tests/legal-pages.test.ts tests/project-structure.test.ts
npm run typecheck
npm run lint
npx prettier --check "miniprogram/content/**/*.ts" "miniprogram/pages/legal/**/*.{ts,wxml,wxss,json}"
```

Expected: tests PASS; TypeScript, ESLint, and Prettier exit 0.

- [ ] **Step 7: Commit consent and legal pages**

```bash
git add miniprogram/content/legal.ts miniprogram/utils/onboarding-consent.ts \
  miniprogram/pages/onboarding miniprogram/pages/legal miniprogram/app.json \
  tests/onboarding-consent.test.ts tests/legal-pages.test.ts
git commit -m "feat: add legal pages and explicit login consent"
```

---

### Task 7: Add the privacy center and double-confirmed deletion UI

**Repository:** `osheeep-wx`

**Files:**

- Create: `miniprogram/utils/account-errors.ts`
- Create: `miniprogram/pages/privacy-center/index.ts`
- Create: `miniprogram/pages/privacy-center/index.wxml`
- Create: `miniprogram/pages/privacy-center/index.wxss`
- Create: `miniprogram/pages/privacy-center/index.json`
- Create: `miniprogram/pages/account-deletion/index.ts`
- Create: `miniprogram/pages/account-deletion/index.wxml`
- Create: `miniprogram/pages/account-deletion/index.wxss`
- Create: `miniprogram/pages/account-deletion/index.json`
- Modify: `miniprogram/pages/profile/index.ts`
- Modify: `miniprogram/pages/profile/index.wxml`
- Modify: `miniprogram/pages/profile/index.wxss`
- Modify: `miniprogram/app.json`
- Create: `tests/account-errors.test.ts`
- Create: `tests/account-pages.test.ts`

**Interfaces:**

- Consumes: `getApp().deleteAccount(): Promise<void>` from Task 5, legal routes from Task 6.
- Produces: `toAccountDeletionErrorMessage(errorCode): string`, `/pages/privacy-center/index`, `/pages/account-deletion/index`.

- [ ] **Step 1: Write failing error-mapping and page contract tests**

Create `tests/account-errors.test.ts`:

```ts
import { toAccountDeletionErrorMessage } from '../miniprogram/utils/account-errors';

test.each([
  [
    'ACCOUNT_DELETION_IDENTITY_MISMATCH',
    '当前微信身份与登录账号不一致，无法注销',
  ],
  ['WECHAT_LOGIN_FAILED', '微信身份验证失败，请重新尝试'],
  ['NETWORK_ERROR', '网络连接失败，请稍后重试'],
])('maps %s', (code, message) => {
  expect(toAccountDeletionErrorMessage(code)).toBe(message);
});
```

Create `tests/account-pages.test.ts` and assert:

```ts
expect(appConfig.pages).toEqual(
  expect.arrayContaining([
    'pages/privacy-center/index',
    'pages/account-deletion/index',
  ]),
);
expect(profileWxml).toContain('隐私与账户');
expect(deletionWxml).toContain('共同历史会以“已注销成员”保留');
expect(deletionWxml).toContain('最后一名成员注销时，小家及其记录会被删除');
expect(deletionWxml).toContain('checkbox');
expect(deletionTs).toContain('wx.showModal');
expect(deletionTs).toContain('await getApp<OsheeepApp>().deleteAccount()');
expect(deletionTs).toContain("wx.reLaunch({ url: '/pages/onboarding/index' })");
```

- [ ] **Step 2: Run both tests and verify the red state**

Run:

```bash
npm test -- --runInBand tests/account-errors.test.ts tests/account-pages.test.ts
```

Expected: FAIL because the routes, pages, and error mapper do not exist.

- [ ] **Step 3: Add the privacy center and profile entry**

Create a privacy center page whose handlers navigate to the legal and deletion routes:

```ts
import { OPERATOR_NAME, PRIVACY_EMAIL } from '../../content/legal';

Page({
  data: { operatorName: OPERATOR_NAME, privacyEmail: PRIVACY_EMAIL },
  onOpenUserAgreement() {
    wx.navigateTo({ url: '/pages/legal/user-agreement/index' });
  },
  onOpenPrivacyPolicy() {
    wx.navigateTo({ url: '/pages/legal/privacy-policy/index' });
  },
  onOpenDeletion() {
    wx.navigateTo({ url: '/pages/account-deletion/index' });
  },
});
```

Its WXML must show the operator, contact email, actual data summary, legal links, and a visually separated destructive action:

```xml
<view class="privacy-page">
  <text class="page-title">隐私与账户</text>
  <view class="privacy-card">
    <text class="section-title">我们处理的信息</text>
    <text class="section-copy">微信身份标识、家庭成员关系、邀请码、选菜与做饭记录，以及必要的运行日志。</text>
    <text class="section-copy">不获取手机号、微信昵称头像、相册、定位或通讯录。</text>
  </view>
  <view class="privacy-card">
    <text class="section-title">运营与联系</text>
    <text class="section-copy">运营主体：{{operatorName}}</text>
    <text class="section-copy">隐私联系邮箱：{{privacyEmail}}</text>
  </view>
  <button class="link-button" bindtap="onOpenUserAgreement">用户协议</button>
  <button class="link-button" bindtap="onOpenPrivacyPolicy">隐私政策</button>
  <button class="danger-link" bindtap="onOpenDeletion">注销账号</button>
</view>
```

Add to the profile page outside the household conditional so it is always reachable:

```xml
<button class="privacy-entry" bindtap="onOpenPrivacyCenter">隐私与账户</button>
```

and in `profile/index.ts`:

```ts
onOpenPrivacyCenter() {
  wx.navigateTo({ url: '/pages/privacy-center/index' });
},
```

Create `privacy-center/index.wxss` with:

```css
.privacy-page {
  box-sizing: border-box;
  min-height: 100vh;
  padding: 54rpx 40rpx calc(72rpx + env(safe-area-inset-bottom));
}
.page-title,
.section-title,
.section-copy {
  display: block;
}
.page-title {
  font-size: 48rpx;
  font-weight: 750;
}
.privacy-card {
  margin-top: 28rpx;
  padding: 32rpx;
  border: 1rpx solid #e6dbc9;
  border-radius: 28rpx;
  background: #fffdf9;
}
.section-title {
  color: #5f6935;
  font-size: 30rpx;
  font-weight: 700;
}
.section-copy {
  margin-top: 14rpx;
  color: #625f58;
  font-size: 26rpx;
  line-height: 1.7;
}
.link-button,
.danger-link {
  display: flex;
  min-height: 92rpx;
  align-items: center;
  margin-top: 20rpx;
  border-radius: 22rpx;
  background: #fffdf9;
  font-size: 29rpx;
  line-height: 92rpx;
}
.link-button {
  color: #b94b22;
}
.danger-link {
  margin-top: 42rpx;
  border: 1rpx solid #e2b4aa;
  color: #b83b2f;
}
```

Append to `profile/index.wxss`:

```css
.privacy-entry {
  display: flex;
  min-height: 92rpx;
  align-items: center;
  justify-content: center;
  margin-top: 28rpx;
  border: 1rpx solid #e6dbc9;
  border-radius: 22rpx;
  background: #fffdf9;
  color: #5e5a53;
  font-size: 29rpx;
  line-height: 92rpx;
}
```

Create `privacy-center/index.json` with:

```json
{
  "navigationBarTitleText": "隐私与账户",
  "navigationBarBackgroundColor": "#FFFAF3",
  "navigationBarTextStyle": "black"
}
```

Do not add images, icons, or a new dependency.

- [ ] **Step 4: Add stable deletion error messages**

Create `miniprogram/utils/account-errors.ts`:

```ts
const messages: Record<string, string> = {
  ACCOUNT_DELETION_IDENTITY_MISMATCH: '当前微信身份与登录账号不一致，无法注销',
  WECHAT_LOGIN_FAILED: '微信身份验证失败，请重新尝试',
  NETWORK_ERROR: '网络连接失败，请稍后重试',
  UNAUTHORIZED: '登录状态已失效，请重新登录',
};

export const toAccountDeletionErrorMessage = (errorCode: string) =>
  messages[errorCode] ?? '注销失败，请稍后重试';
```

- [ ] **Step 5: Implement checkbox plus modal double confirmation**

Create `account-deletion/index.ts`:

```ts
import { ApiError } from '../../services/request';
import { toAccountDeletionErrorMessage } from '../../utils/account-errors';

interface OsheeepApp {
  deleteAccount: () => Promise<void>;
}

Page({
  data: {
    understood: false,
    submitting: false,
    errorMessage: '',
  },

  onUnderstandingChange(event: WechatMiniprogram.CheckboxGroupChange) {
    this.setData({
      understood: event.detail.value.includes('understood'),
      errorMessage: '',
    });
  },

  onRequestDeletion() {
    if (!this.data.understood || this.data.submitting) return;
    wx.showModal({
      title: '确认注销账号？',
      content: '注销后原账号和历史关联无法恢复。',
      confirmText: '确认注销',
      confirmColor: '#B83B2F',
      success: (result) => {
        if (result.confirm) void this.performDeletion();
      },
    });
  },

  async performDeletion() {
    this.setData({ submitting: true, errorMessage: '' });
    try {
      await getApp<OsheeepApp>().deleteAccount();
      wx.reLaunch({ url: '/pages/onboarding/index' });
    } catch (error) {
      this.setData({
        errorMessage:
          error instanceof ApiError
            ? toAccountDeletionErrorMessage(error.errorCode)
            : '注销失败，请稍后重试',
      });
    } finally {
      this.setData({ submitting: false });
    }
  },
});
```

Use this required WXML content:

```xml
<view class="deletion-page">
  <text class="page-title">注销账号</text>
  <text class="warning">此操作无法撤销</text>
  <view class="impact-card">
    <text>• 当前微信身份绑定会被删除</text>
    <text>• 你会退出当前小家，未使用的邀请码会失效</text>
    <text>• 共同历史会以“已注销成员”保留</text>
    <text>• 最后一名成员注销时，小家及其记录会被删除</text>
    <text>• 同一微信再次登录会创建全新账号</text>
  </view>
  <checkbox-group bindchange="onUnderstandingChange">
    <label class="understanding-row">
      <checkbox value="understood" checked="{{understood}}" color="#B83B2F" />
      <text>我已理解上述影响</text>
    </label>
  </checkbox-group>
  <text wx:if="{{errorMessage}}" class="error" role="alert">{{errorMessage}}</text>
  <button class="delete-button" loading="{{submitting}}" disabled="{{!understood || submitting}}" bindtap="onRequestDeletion">注销账号</button>
</view>
```

Create `account-deletion/index.wxss` with:

```css
.deletion-page {
  box-sizing: border-box;
  min-height: 100vh;
  padding: 54rpx 40rpx calc(72rpx + env(safe-area-inset-bottom));
}
.page-title,
.warning,
.impact-card text,
.error {
  display: block;
}
.page-title {
  font-size: 48rpx;
  font-weight: 750;
}
.warning {
  margin-top: 16rpx;
  color: #b83b2f;
  font-size: 27rpx;
  font-weight: 700;
}
.impact-card {
  margin-top: 32rpx;
  padding: 32rpx;
  border: 1rpx solid #e5b7ae;
  border-radius: 28rpx;
  background: #fff2ef;
}
.impact-card text {
  margin-top: 12rpx;
  color: #674943;
  font-size: 27rpx;
  line-height: 1.65;
}
.impact-card text:first-child {
  margin-top: 0;
}
.understanding-row {
  display: flex;
  align-items: center;
  gap: 12rpx;
  margin-top: 34rpx;
  color: #57534d;
  font-size: 26rpx;
}
.error {
  margin-top: 24rpx;
  color: #b83b2f;
  font-size: 25rpx;
  line-height: 1.5;
}
.delete-button {
  min-height: 100rpx;
  margin-top: 36rpx;
  border-radius: 24rpx;
  background: #b83b2f;
  color: #fff;
  font-size: 31rpx;
  font-weight: 700;
  line-height: 100rpx;
}
.delete-button[disabled] {
  background: #d7aaa3;
  color: rgba(255, 255, 255, 0.9);
}
```

Create `account-deletion/index.json` with:

```json
{
  "navigationBarTitleText": "注销账号",
  "navigationBarBackgroundColor": "#FFFAF3",
  "navigationBarTextStyle": "black"
}
```

Add both new routes to `app.json` after the profile route:

```json
"pages/profile/index",
"pages/privacy-center/index",
"pages/account-deletion/index"
```

- [ ] **Step 6: Run focused and full frontend verification**

Run:

```bash
npm test -- --runInBand tests/account-errors.test.ts tests/account-pages.test.ts tests/account-service.test.ts tests/project-structure.test.ts
npm test
npm run typecheck
npm run lint
npm run format:check
npx prettier --check "miniprogram/pages/privacy-center/**/*.{ts,wxml,wxss,json}" \
  "miniprogram/pages/account-deletion/**/*.{ts,wxml,wxss,json}"
```

Expected: all Jest suites and tests PASS; TypeScript, ESLint, and both Prettier checks exit 0. Record actual suite and test counts.

- [ ] **Step 7: Commit privacy and deletion pages**

```bash
git add miniprogram/utils/account-errors.ts miniprogram/pages/privacy-center \
  miniprogram/pages/account-deletion miniprogram/pages/profile miniprogram/app.json \
  tests/account-errors.test.ts tests/account-pages.test.ts
git commit -m "feat: add privacy center and account deletion UI"
```

---

### Task 8: Add the review checklist, cross-repository verification, and handoff update

**Repository:** `osheeep-wx` for documentation; verify both repositories.

**Files:**

- Create: `docs/review-submission-checklist.md`
- Modify: `docs/HANDOFF.md`

**Interfaces:**

- Consumes: completed backend endpoint and mini-program routes.
- Produces: a manual administrator checklist that prevents accidental review submission before identity, privacy, device, and production checks are complete.

- [ ] **Step 1: Create the exact review checklist**

Create `docs/review-submission-checklist.md`:

```markdown
# “今晚吃什么”微信正式提审清单

更新日期：2026-07-13

## 阻塞项

- [ ] 微信公众平台正式名称确认或申请为“今晚吃什么”。
- [ ] 将代码中的运营主体“个人主体姓名”核对并替换为公众平台实名认证姓名。
- [ ] 《用户协议》《隐私政策》中的主体、邮箱和真实功能逐字核对。
- [ ] 微信《用户隐私保护指引》与代码实际处理的数据完全一致。
- [ ] 隐私接口仅声明真实使用的微信登录和用户主动触发的剪贴板读取；不声明手机号、头像昵称、相册或定位。
- [ ] 服务类目、主体、开发者和体验成员配置正确。

## 体验版回归

- [ ] 新后端已部署，`/actuator/health` 返回 `UP`。
- [ ] 新体验代码已上传，首页为 `pages/onboarding/index`。
- [ ] 未勾选协议不能登录，登录前可以打开两份协议。
- [ ] 两个真实微信账号完成创建/加入、分别选菜、合并、确认、修改、重新确认、完成和历史回看。
- [ ] 注销一方后，旧令牌失效，另一方仍能查看匿名共享历史。
- [ ] 最后一方注销后，同一微信重新登录得到全新账号和空家庭状态。
- [ ] 至少一台 iPhone 和一台 Android 完成完整回归。
- [ ] 弱网下登录、保存选择、完成菜单和注销均有明确结果，不出现重复记录。

## 生产运维

- [ ] 数据库备份和恢复流程已实测。
- [ ] 日志不包含微信 code、openid、JWT、邀请码明文或密钥。
- [ ] 限流、告警和故障联系人已确认。
- [ ] 当前 JAR 已按运维手册备份，回滚命令可执行。

## 审核材料

- [ ] 审核说明包含登录、创建/加入小家、选菜、完成、记录、隐私中心和注销路径。
- [ ] 审核账号或体验步骤不会要求审核员提供不必要的个人信息。
- [ ] 所有截图和版本号来自本次准备提交的体验版。
- [ ] 账号管理员明确确认后，才点击“提交审核”。
```

- [ ] **Step 2: Run fresh backend verification**

Run:

```bash
cd /Users/longlonglong/Developer/Personal/Apps/osheeep/osheeep-server
git status --short
mvn test
```

Expected: empty pre-test status; Maven reports 0 failures and 0 errors. Keep the fresh output available for the handoff update.

- [ ] **Step 3: Run fresh frontend verification**

Run:

```bash
cd /Users/longlonglong/Developer/Personal/Apps/osheeep/osheeep-wx
git status --short
npm test
npm run typecheck
npm run lint
npm run format:check
npx prettier --check "docs/**/*.md" "miniprogram/**/*.{wxml,wxss,json}"
```

Expected: status contains only the planned uncommitted `docs/review-submission-checklist.md`; all Jest suites/tests PASS; TypeScript, ESLint, and Prettier exit 0. Keep the fresh output available for the handoff update.

- [ ] **Step 4: Update `HANDOFF.md` without claiming deployment**

After Steps 2-3 have passed, append this exact dated section:

```markdown
## 16. 隐私与注销开发状态（2026-07-13）

- 隐私与注销本地代码已完成，并通过后端完整测试、小程序完整测试、TypeScript、ESLint 和 Prettier 检查。
- 代码已完成但生产后端和体验版尚未更新；当前线上体验版仍以本文件前文记录的状态为准。
- 运营主体目前显示“个人主体姓名”，正式提审前必须替换并核对为微信公众平台实名认证姓名。
- 正式提审以 `docs/review-submission-checklist.md` 全部勾选为前提。
```

If either verification command failed, do not add the first bullet; fix the failure and rerun the full command first.

- [ ] **Step 5: Inspect the complete implementation diff against the approved spec**

Run in each repository:

```bash
git log --oneline --decorate -8
git diff origin/main...main --check
git diff origin/main...main --stat
```

Expected: no whitespace errors; only privacy, account deletion, tests, and review documentation are in scope. Verify every acceptance criterion in `docs/superpowers/specs/2026-07-13-privacy-and-account-deletion-design.md` has a corresponding code path and test.

- [ ] **Step 6: Commit the review documentation**

```bash
git add docs/review-submission-checklist.md docs/HANDOFF.md
git commit -m "docs: add formal review readiness checklist"
```

- [ ] **Step 7: Stop before production and platform mutations**

Report the exact commits and verification results. Request explicit confirmation before replacing the production JAR, restarting `osheeep-server`, uploading a new experience build, changing WeChat platform privacy declarations, or submitting for review.

Do not push either repository until the user requests publishing the completed commits.
