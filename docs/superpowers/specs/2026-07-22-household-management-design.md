# 两人家庭管理设计

更新日期：2026-07-22

## 1. 目标与范围

本阶段为“小家开饭”补齐可上线所需的两人家庭管理闭环：家庭名称、成员和角色、邀请码状态、成员退出、管理员移除成员、管理权转让、家庭解散，以及账号注销与这些能力的统一数据语义。

本设计同时修复一个授权边界：V8 开始保留普通退出/移除产生的已结束成员关系，因此服务端不能再把“查到任意 membership 行”视为当前家庭权限。库存、菜谱、菜单、历史和家庭接口都必须只接受 `ACTIVE` membership 与 `ACTIVE` household。账号注销仍沿用既有隐私设计的更严格规则：硬删除注销者的全部 membership 事件行，不把注销保留为成员生命周期记录。

本阶段继续限定最多两个活跃成员，不扩展多人家庭、家庭成员昵称头像、公开家庭主页、消息中心或微信订阅消息。生产部署、体验版上传、提审和发布不属于本阶段自动执行范围。

## 2. 设计依据与现状

本文细化以下既有设计，不修改它们已经确认的产品方向：

- [正式版产品设计](2026-07-15-formal-release-product-design.md)
- [家庭创建与加入计划](../plans/2026-07-11-household-binding.md)
- [隐私合规与账号注销设计](2026-07-13-privacy-and-account-deletion-design.md)
- [家庭自定义菜谱设计](2026-07-16-household-custom-recipes-design.md)
- [家庭菜谱接入晚饭链路设计](2026-07-21-household-recipes-discovery-menu-design.md)
- [当前交接文档](../../HANDOFF.md)

当前实现只有家庭查询、创建、刷新邀请码和加入；成员表没有角色或状态，家庭没有版本。多数业务服务只按 `user_id` 查询任意 membership。V4–V7 又已经让成员关系影响菜单、记录、库存、家庭菜谱、个人草稿和完整历史快照，因此家庭管理必须作为跨聚合事务实现，不能只删除一行 membership。

## 3. 产品原则与角色权限

### 3.1 家庭范围

- 一个账号同时最多有一条 `ACTIVE` membership。
- 一个家庭同时最多有两条 `ACTIVE` membership，并且恰有一个 `OWNER`。
- 创建家庭的人初始为 `OWNER`；通过邀请码加入的人为 `MEMBER`。
- `dinner_households.created_by` 是不可变的创建审计字段，不代表当前管理员，也不随转让变化。
- 日常功能继续双方平等：库存、找菜、家庭共享菜谱、今晚菜单和记录不按角色区分。

### 3.2 权限矩阵

| 能力                       | OWNER                | MEMBER |
| -------------------------- | -------------------- | ------ |
| 查看家庭与活跃成员         | 是                   | 是     |
| 修改家庭名称               | 是                   | 是     |
| 生成、查看状态和撤销邀请码 | 是                   | 是     |
| 主动退出                   | 否；必须先转让或解散 | 是     |
| 移除另一成员               | 是                   | 否     |
| 转让管理权                 | 是                   | 否     |
| 解散家庭                   | 是                   | 否     |

单人家庭的 `OWNER` 也不能用普通退出绕过解散影响说明；其离开家庭的唯一产品路径是解散。客户端只按角色调整展示，所有权限仍由服务端在事务内重新计算。

## 4. 成员生命周期

### 4.1 事件行而非覆盖历史

membership 使用生命周期事件行。一个用户离开后，原行保留结束状态；以后加入其他家庭或重新加入原家庭时创建新行，不复活或覆盖旧行。

状态：

- `ACTIVE`：当前有效成员。
- `LEFT`：成员主动退出。
- `REMOVED`：被当前 `OWNER` 移除。

结束原因：

- `SELF_LEFT`
- `OWNER_REMOVED`

普通历史界面不向成员暴露“主动退出”或“被移除”的管理原因，两者统一显示“已退出成员”。账号注销会删除该用户全部 membership 事件行；“已注销成员”由不可变快照中的内部 user ID 与去标识化 `users.status=DELETED` 在响应层推导，不依赖保留 membership。

### 4.2 加入、创建和重新绑定

- 创建或加入前必须重新确认用户账号仍为 `ACTIVE`，且不存在其他 `ACTIVE` membership。
- 创建者占用第一个可用 seat 并成为 `OWNER`；加入者占用另一个空 seat 并成为 `MEMBER`。
- 加入成功在同一事务内消费邀请码；同一邀请码不能再次加入。
- 用户创建或加入新家庭后，把其 `household_id IS NULL` 的个人 `DRAFT` 菜谱绑定到新家庭。绑定在同一事务中按 recipe ID 锁定草稿，把 `household_id` 设为新家庭、`last_modified_by` 设为 actor，并使每个实际变更的草稿 `version + 1`；与并发自动保存共享 actor user → household → recipe 的锁序。任一草稿绑定失败时，家庭创建/加入、邀请码消费和全部草稿绑定一起回滚。服务端仍需在发布时重新验证食材、图片、内容和版本，不能因重新绑定自动发布。

## 5. 跨动作数据语义

| 动作                   | 账号                        | membership / 家庭版本                               | 邀请码           | 未完成菜单                                                      | 已完成历史                                       | 共享数据                                                   | 个人草稿                      |
| ---------------------- | --------------------------- | --------------------------------------------------- | ---------------- | --------------------------------------------------------------- | ------------------------------------------------ | ---------------------------------------------------------- | ----------------------------- |
| MEMBER 主动退出        | 保留登录账号                | 原行 `LEFT`；家庭 `version + 1`                     | 全部未使用码失效 | 清除该成员选择和确认；所有非完成菜单 `version + 1` 并回 `DRAFT` | 快照不变；本人失去访问；留守成员看到“已退出成员” | 库存、家庭食材、发布/归档菜谱留在原家庭                    | 解绑并保留                    |
| OWNER 移除 MEMBER      | 双方账号保留                | 目标行 `REMOVED`；家庭 `version + 1`                | 同退出           | 同退出                                                          | 同退出                                           | 同退出                                                     | 同退出                        |
| OWNER 转让             | 双方账号保留                | 两人角色原子互换；两条成员版本和家庭版本递增        | 不变             | 不变                                                            | 不变                                             | 不变                                                       | 不变                          |
| OWNER 解散             | 双方账号保留                | 删除家庭及其全部 membership；操作结果留幂等记录     | 删除             | 删除                                                            | 删除                                             | 删除库存、家庭食材、共享菜谱、菜单和记录；全局图片资产保留 | 双方草稿解绑并保留            |
| MEMBER 注销账号        | 注销、去标识化、旧 JWT 失效 | 删除注销者全部 membership 事件；家庭 `version + 1`  | 全部未使用码失效 | 同退出                                                          | 留守成员看到“已注销成员”                         | 留原家庭                                                   | 删除注销者全部私人草稿/编辑稿 |
| OWNER 注销且另一成员在 | 注销者同上                  | 同一事务删除旧 OWNER membership，再提升唯一剩余成员 | 同上             | 同上                                                            | 同上                                             | 留原家庭                                                   | 删除注销者全部私人草稿/编辑稿 |
| 最后一名成员注销       | 注销、去标识化、旧 JWT 失效 | 硬删除家庭与 membership                             | 删除             | 删除                                                            | 删除                                             | 删除全部家庭业务数据                                       | 删除注销者全部私人草稿/编辑稿 |

### 5.1 未完成菜单

成员关系终止事务处理该家庭所有 `status != COMPLETED` 的菜单：

1. 删除离开者的全部 `dinner_menu_selections`。
2. 将菜单状态设为 `DRAFT`。
3. 清空 `confirmed_by` 与 `confirmed_at`。
4. 每个菜单只递增一次版本。

已完成菜单、做饭记录和 V7 菜品快照禁止改写。旧菜单动作可保留为审计事实，但不能被解释为当前确认状态。

### 5.2 家庭菜谱与个人草稿

- `PUBLISHED` 和 `ARCHIVED` 家庭菜谱继续属于原家庭，不随创建者或最后修改者迁移。
- 离开者的个人新建草稿设为 `household_id = NULL`。
- 个人编辑稿转成独立新建草稿，同时清空 `revision_of_recipe_id` 与 `base_published_version`。
- 若 `source_recipe_id` 指向原家庭菜谱，则清空该来源关系；系统菜来源可以保留。
- 草稿中引用原家庭自定义食材的行必须移除；完整性继续由现有草稿预览/发布校验从剩余食材与步骤派生，不新增或伪造持久化“完整”标记。不得复制原家庭库存或家庭私有食材到新家庭。
- 解散先按以上规则保留双方个人草稿，再删除共享 `PUBLISHED/ARCHIVED` 聚合及家庭食材。
- 账号注销不保留该账号的私人草稿或编辑稿，避免形成永久不可访问的个人内容。

### 5.3 历史可见性与成员标签

为落实“退出者失去原家庭历史访问”并避免替代成员看到上一段两人关系的历史，本阶段采用 membership 周期内最小可见窗口；这是家庭管理数据隔离的一部分，不改变 V7 已完成快照本身。

- 活跃成员只可查看 `completed_at >= 当前 ACTIVE membership.history_visible_from` 的记录。新 membership 的该字段由同一 `Clock` 按 UTC 显式写入；V8 前成员使用迁移回填的早期 UTC 下界，因此访问控制不依赖旧 `joined_at` 的不确定时区解释。
- 留守成员可以继续查看自己加入以来的旧记录；后来加入的替代成员不能查看其加入前的家庭历史。
- 已退出者重新加入时产生新 membership，不自动恢复上一个成员周期的历史访问。
- 该可见窗口必须统一应用于记录列表、记录详情/深链和 `/menus/today`。`TodayMenuResponse` 增加 `historyVisible`；若今天已完成的菜单早于当前 membership 的可见下界，只返回 `{ menuDate, status: PRE_MEMBERSHIP, historyVisible: false }`，其余 menu/record/recipe ID、版本、计数、菜品、选择人、确认人和完成人字段均省略；客户端提示“这顿饭完成于你加入小家之前”。正常响应为 `historyVisible=true`。
- 记录 API 不再只靠 `ME/PARTNER/BOTH` 猜测旧成员。`completedBy` 返回一个无用户 ID actor；每道菜的 `selectedBy` 返回 1–2 个 actor 数组，actor kind 为 `ME / PARTNER / EXITED_MEMBER / DELETED_MEMBER`，因此可以准确表达 `[ME, EXITED_MEMBER]`。
- actor 判定优先级固定为：当前请求用户 `ME` → 当前另一名 ACTIVE 成员 `PARTNER` → `users.status=DELETED` 的历史用户 `DELETED_MEMBER` → 其他历史用户 `EXITED_MEMBER`。先按快照中不同 user ID 去重，再按 `ME, PARTNER, EXITED_MEMBER, DELETED_MEMBER` 排序；不向客户端返回用于打破同类排序的 ID。
- 菜品快照中的 `selected_by_user_ids` 保持字节不变；响应层结合 membership 历史和用户状态生成参与者标签。
- 兼容期保留可空的旧 `source`：只有参与者全部属于当前 ACTIVE pair 时才产生 `ME/PARTNER/BOTH`；出现 former/deleted actor 时为 `null`，新客户端读取 `selectedBy`，不得伪造 `BOTH`。
- 家庭菜谱创建者和最后修改者、today 菜单的确认人/完成人也使用上述固定关系标签，不得把匿名化用户名 `deleted_user_*` 或内部用户 ID 显示给客户端。

## 6. 家庭名称与邀请码

### 6.1 家庭名称

- 创建、改名和解散确认共用同一规范化函数：先按 Unicode NFC 规范化，再按 `Character.isWhitespace || Character.isSpaceChar` 去除首尾 Unicode 空白；结果按 Unicode code point 计数必须为 1–30 个字符，不能用 Java `String.length()` 误算代理对。拒绝控制字符、零宽/双向等 Unicode `FORMAT` 字符、行/段分隔符和孤立代理项；不使用 NFKC 改写用户可见文字。
- 改名请求携带精确家庭 `expectedVersion`，成功后 `version + 1`。
- 家庭名称是双方可见的用户输入。创建自定义名称或改名时复用并泛化现有微信文本内容安全网关；外部检查在数据库事务外完成，事务内重新校验 membership、版本和待写名称。
- 内容拒绝或内容安全服务不可用时保留旧名称，不写部分状态。
- 解散页输入值经同一函数规范化后，与当前规范化家庭名做区分大小写的完整匹配；不接受模糊匹配或仅客户端判断。

### 6.2 邀请码

- 新生成格式升级为 `DINNER XXXX XXXX`，随机部分使用字母表 `0123456789ABCDEFGHJKMNPQRSTVWXYZ` 的 8 位 Crockford Base32，提供 40 bit 随机空间；有效期继续是已确认的 24 小时。
- 输入规范化只接受大小写不敏感的 ASCII `DINNER` 前缀和随机部分；忽略随机部分组间的 ASCII 空格或连字符，统一输出新码 `DINNER XXXX XXXX` 或旧码 `DINNER 1234`。生成器不会产生且校验器拒绝 `I/L/O/U`、非 ASCII 空白和其他字符，不做可能掩盖输错的字符替换。
- V8 前仍未过期的旧 `DINNER 1234` 码可按原规则验证，直到被消费、撤销或过期；新接口不再生成四位数字码。本节明确取代 2026-07-11 计划中的“四位数字生成格式”，不改变 24 小时有效期。
- 数据库继续只保存 HMAC 摘要，不保存或记录明文。
- 同一家庭最多一条未消费且未撤销的邀请码；刷新前撤销该家庭所有旧 open 行，包括已经过期但尚未标记撤销的行。
- 加入成功后同事务写 `consumed_at` 和 `consumed_by`。
- MEMBER 退出、OWNER 移除、账号注销或解散均使当前家庭所有 open 邀请码失效；改名和转让不使邀请码失效。生成、撤销、消费或成员拓扑导致的失效都会使家庭 `invite_revision + 1`。
- 家庭已有两名活跃成员时不允许生成新邀请码。
- 服务端无法从摘要恢复明文；管理页只能读取邀请码状态、`inviteRevision` 和真实过期时间。明文仅在创建/主动生成的成功响应中显示一次，丢失后必须由用户主动重新生成，客户端不得自动重放。
- 客户端只把明文保存在当前页面内存。创建成功页可直接展示本次响应；跨到邀请页只能通过一次性页面事件/导航参数内存传递，禁止写 storage、App 全局状态、URL query 或日志。创建成功页与邀请页都在 `onShow` 刷新状态，并在复制/分享前确认当前 revision 未变化；进程回收、`onUnload`、到期、撤销、满员、失去家庭，或远端 `inviteRevision` 变化时立即清空明文并禁用复制/分享。

## 7. V8 数据模型

V1–V7 保持不可变。新增 `V8__add_household_management.sql`。

### 7.1 `dinner_households`

新增：

- `version BIGINT NOT NULL DEFAULT 1`
- `invite_revision BIGINT NOT NULL DEFAULT 0`
- `admin_changed_at DATETIME(3) NULL`

家庭继续只保存 `ACTIVE` 状态；显式解散和最后成员注销采用物理删除，不保留带原家庭名称的墓碑行。约束为 `version >= 1`、`invite_revision >= 0`。迁移时，一人家庭若保留 legacy open invite 则回填 `invite_revision=1`，否则为 0；两人家庭撤销全部 legacy open invite。V8 起 `admin_changed_at` 由应用统一使用注入的 `Clock` 写 UTC `DATETIME(3)`。

### 7.2 `dinner_household_members`

新增：

- `role VARCHAR(16) NOT NULL`
- `status VARCHAR(16) NOT NULL DEFAULT 'ACTIVE'`
- `seat_no TINYINT NOT NULL`
- `history_visible_from DATETIME(3) NOT NULL`
- `version BIGINT NOT NULL DEFAULT 1`
- `ended_at DATETIME(3) NULL`
- `ended_by BIGINT NULL`
- `end_reason VARCHAR(24) NULL`
- `updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3)`
- 仅 ACTIVE 时有值的生成列：`active_user_id`、`active_owner_household_id`、`active_seat_no`

删除原有永久唯一索引 `user_id` 和 `(household_id, user_id)`，改为：

- `UNIQUE(active_user_id)`：一个用户最多一个活跃家庭。
- `UNIQUE(active_owner_household_id)`：一个家庭最多一个活跃 OWNER。
- `UNIQUE(household_id, active_seat_no)`：一个家庭最多占用 seat 1 和 seat 2。
- `INDEX(household_id, status, role, id)` 与 `INDEX(user_id, joined_at, id)`。

检查约束精确定义为：role 只能是 `OWNER/MEMBER`；status 只能是 `ACTIVE/LEFT/REMOVED`；seat 只能是 1/2；version 至少为 1；ACTIVE 行的 `ended_at/ended_by/end_reason` 必须全空，结束行三者必须全非空；end reason 只能是 `SELF_LEFT/OWNER_REMOVED`。生成列若映射到 MyBatis 实体，必须用 never-write 策略禁止 insert/update 写入。“活跃家庭至少一个 OWNER”由家庭锁内的事务保证。账号注销在同一事务中硬删除该用户全部 membership 行，因此不增加持久化 `ACCOUNT_DELETED` reason。V8 新写的 `joined_at/history_visible_from/ended_at` 全部由同一个注入 `Clock` 显式写 UTC；不再依赖数据库 session 时区生成成员生命周期时间。

结束字段使用一个分组约束，不允许半结束状态：

```sql
CHECK (
  (status = 'ACTIVE' AND ended_at IS NULL AND ended_by IS NULL AND end_reason IS NULL)
  OR
  (status <> 'ACTIVE' AND ended_at IS NOT NULL AND ended_by IS NOT NULL AND end_reason IS NOT NULL)
)
```

迁移回填规则：

1. 若 `created_by` 仍在家庭成员中，该成员为 OWNER。
2. 否则选择 `joined_at, id` 最早的现存成员为 OWNER。
3. OWNER 优先 seat 1，另一成员 seat 2。
4. 旧 ACTIVE 行的 `history_visible_from` 固定回填为 UTC `1970-01-01 00:00:00.000`，使当前成员继续看到升级前已经可见的历史；不把来源不明的旧 `joined_at` 静默平移八小时。
5. 零成员家庭、超过两个成员或其他无法安全回填的数据必须使迁移明确失败，不静默修复成未知状态。

### 7.3 `dinner_invite_codes`

新增 `consumed_at`、`consumed_by`、`revocation_reason`，以及仅在未消费且未撤销时有值的 `open_household_id` 生成列和唯一索引。`consumed_at/consumed_by` 必须同时为空或同时有值；一行不能同时 consumed 和 revoked；`revoked_at/revocation_reason` 必须成对，reason 限定为 `LEGACY_REVOKED/MIGRATION_SUPERSEDED/REFRESHED/MEMBER_REVOKED/MEMBERSHIP_CHANGED`，旧 revoked 行回填 `LEGACY_REVOKED`。迁移时，两名成员家庭撤销全部 open 行；一名成员家庭按“未过期优先、再按 `created_at DESC, id DESC`”保留至多一条，其他行写 `MIGRATION_SUPERSEDED`；若全已过期，可保留最新一条供管理页显示 EXPIRED，再建立约束。

### 7.4 `dinner_household_operations`

新增危险操作幂等记录：

```sql
id                       BIGINT AUTO_INCREMENT PRIMARY KEY
household_id             BIGINT NOT NULL
actor_id                 BIGINT NOT NULL
actor_membership_id      BIGINT NOT NULL
target_member_id         BIGINT NULL
operation_type           VARCHAR(32) NOT NULL
idempotency_key          CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL
request_fingerprint      CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL
result_schema_version    SMALLINT UNSIGNED NOT NULL DEFAULT 1
result_household_version BIGINT NULL
result_payload           JSON NOT NULL
created_at               DATETIME(3) NOT NULL
expires_at               DATETIME(3) NOT NULL
```

- `actor_id` 通过 `fk_dinner_household_operations_actor` 引用 `users(id)`；账号行注销后仍以去标识化形式保留。`household_id`、`actor_membership_id` 和 `target_member_id` 都是无外键标量，使退出/解散/注销删除 membership 或 household 后仍能重放。
- `operation_type` CHECK 只允许 `MEMBER_LEAVE/OWNER_REMOVE/OWNERSHIP_TRANSFER/HOUSEHOLD_DISSOLUTION`。`OWNER_REMOVE/OWNERSHIP_TRANSFER` 必须有 target，另外两类必须无 target。
- `result_schema_version` CHECK 固定为 1；`result_household_version` 为空或至少为 1。v1 `result_payload` 精确为 `{ "actorHasHousehold": boolean }`，与 operation type/version 一起重建 `{ operationType, replayed, actorHasHousehold, householdVersion }`，不保存名称、成员 ID、微信信息或 token。
- UUID v4 `idempotency_key` 与 HMAC-SHA256 hex `request_fingerprint` 都由应用严格验证；fingerprint 使用现有 dinner invite secret 和 `household-operation:v1:` 域分隔前缀，不另添生产密钥，也不包含微信 code、openid、邀请码明文或访问令牌。
- `created_at` 由注入 `Clock` 写 UTC；`expires_at` 必须精确等于 `created_at + 14 days`。数据库 CHECK 至少要求 `expires_at > created_at`，服务测试与真实 MySQL IT 断言精确 14 天边界。
- `uk_dinner_household_operations_actor_key(actor_id, idempotency_key)` 唯一；`idx_dinner_household_operations_expiry(expires_at, id)` 用于稳定分批清理。

相同 actor/key 只有在操作类型、actor membership context、目标和请求指纹完全一致时才返回原成功结果；不同请求复用同一 key 返回 409。危险请求携带不可信但稳定的 `actorMembershipId` 并纳入指纹，首次执行仍必须在锁内证明它是 actor 当前 ACTIVE membership；这使退出/解散后的重放不依赖仍存在的家庭关系。只记录已成功提交的操作，重放窗口固定为 14 天。定时清理到期记录，并在新操作时做机会式清理；actor 注销时删除其操作，同时删除以该用户任一历史 membership 为 target 的记录。解散先删除该家庭旧操作，只保留本次 dissolution 结果至到期，不把操作表变成永久用户画像。

客户端只为四个家庭管理动作 `MEMBER_LEAVE/OWNER_REMOVE/OWNERSHIP_TRANSFER/HOUSEHOLD_DISSOLUTION` 的一次用户确认生成幂等键。在超时、断网或响应是否到达未知时，用户显式重试同一逻辑动作必须复用原 payload/key；需要微信复核的动作同时获取新的微信 code。收到明确的业务拒绝并刷新/修改目标后，下一次确认才生成新 key。页面重新进入时先刷新服务端状态，绝不盲目补发。账号注销继续是明确的幂等例外：依赖 fresh code、单事务和旧 JWT 立即失效；若成功响应丢失，旧 token 的 `UNAUTHORIZED` 使客户端清 token 并回到登录，不新增会在注销时自我删除的 operation 契约。

## 8. 服务端授权与统一锁顺序

### 8.1 单一授权边界

抽出统一家庭访问组件，至少提供：

- `findActiveMembership(userId)`
- `requireActiveHousehold(userId)`
- `lockActiveHouseholdContext(userId)`
- `requireOwner(context)`

读取同时验证 `membership.status = ACTIVE` 和 `household.status = ACTIVE`。写入在锁内再次验证。必须迁移：家庭与邀请码、库存与食材、统一找菜、家庭菜谱查询/草稿/发布、菜单查询/选择/确认/完成、记录列表与详情、账号注销清理。

### 8.2 全局写锁顺序

所有家庭写事务采用两阶段 operation 查询和统一锁定阶段：

1. JWT 鉴权已确认 actor 账号 ACTIVE 后，危险操作先在事务外按 `(actor_id, idempotency_key)` 查询已提交结果；命中时校验完整 fingerprint 并直接重建原成功响应，不要求 membership、角色或 household 仍存在，也不再交换微信 code。
2. 未命中时，在数据库事务外完成微信 code 交换、文本安全等外部调用。
3. 进入事务，锁当前 actor 的 `users` 行并再次确认账号仍为 ACTIVE。
4. 危险操作在 actor user 锁内立即再次查询 `(actor_id, idempotency_key)`；匹配则返回原结果，不匹配则 409，仍不存在才继续。相同 actor 的请求被 user 行串行化，因此退出/解散后不需要先找到已删除的 household 才能重放。
5. 需要身份复核/注销时，在 user 之后锁 `wechat_user_identities`；普通家庭写跳过此步。
6. 非锁定查询只用于获得候选 household ID；随后锁 `dinner_households`。
7. 按 membership `id ASC` 一次性锁该家庭全部 ACTIVE 成员，并重新验证 actor membership context、target、角色、seat 和版本。
8. 按顺序锁业务子资源：invite → menu 聚合（id ASC）→ recipe 聚合（id ASC）→ inventory（id ASC）→ household ingredient（id ASC）。
9. 写幂等操作记录并提交。

任何事务都不能先锁 menu、recipe 或 inventory，再回头锁 household。对解散/最后成员注销，必须先完成上述确定性锁定阶段，再按外键从子到父执行删除；“删除顺序”不改变“锁顺序”。现有菜谱发布、菜单写入、库存写入、完成记录和账号注销必须统一到该顺序。锁等待、死锁和已识别的 active user/owner/seat、open invite、operation actor/key 约束竞争映射为对应的可恢复 409；operation 唯一键竞争必须先重查并判断 replay/fingerprint conflict。其他未知 `DuplicateKeyException/DataIntegrityViolationException` 保持内部错误并整体回滚，不得伪装成可重试冲突，也不得泄漏 SQL 信息。

## 9. 危险操作事务

### 9.1 MEMBER 退出 / OWNER 移除

两个动作复用同一“结束成员关系”领域事务，只改变 actor、权限校验、最终 status 与 reason：

1. 锁 actor 前查找相同幂等结果；命中即可重放。
2. 锁 actor user，并立即再次查询幂等记录，处理并发首次预查均为空的请求。
3. 仍未命中时再锁 household 和全部活跃成员。
4. 校验 actor membership context 和家庭版本；退出者必须是 MEMBER；移除 actor 必须是 OWNER，target 必须是同家庭 ACTIVE MEMBER 且不能是自己。
5. 撤销该家庭所有 open 邀请码并使 `invite_revision + 1`。
6. 重置所有未完成菜单。
7. 按第 5.2 节处理 target 的个人草稿。
8. 结束 target membership 并递增其版本。
9. 家庭版本递增，记录幂等结果。

任一步骤失败整体回滚。成功后退出者账号登录态保留，但所有旧家庭读写立即失权。

### 9.2 转让管理权

- 只有当前 OWNER 且恰有另一名 ACTIVE MEMBER 时可执行。
- 在同一事务内先把旧 OWNER 降为 MEMBER，再把 target 升为 OWNER，避免唯一约束瞬时双 OWNER。
- 两条 membership version、household version 递增，`admin_changed_at` 更新。
- 不修改 `created_by`，不撤销邀请码，不修改菜单、历史、库存、菜谱或草稿。

### 9.3 解散家庭

解散首次执行必须同时满足：OWNER、精确家庭版本、actor membership context、完整名称匹配、新鲜微信身份与当前账号 openid 一致、UUID 幂等键合法。已提交重放在 actor 用户校验后直接校验 operation fingerprint，不再要求家庭或身份绑定仍存在。

事务先按第 8.2 节锁定：actor user → identity → household → ACTIVE memberships → 全部 invite → menu/selection/action/record/snapshot → recipe/method/step/ingredient → inventory → household ingredient，所有集合都按稳定主键顺序。锁定完成后再按以下外键安全顺序修改/删除：

1. 先把所有属于该家庭的私人草稿解绑，并移除其中的原家庭自定义食材引用。
2. 删除记录快照与记录。
3. 删除菜单动作、选择与菜单；selection 必须先于其引用的 recipe/method 删除。
4. 删除邀请码与库存。
5. 对所有 `source_recipe_id/revision_of_recipe_id IN deletingRecipeIds` 的菜谱做全局置空，不只处理预期保留的草稿。
6. 按 method step → method → recipe ingredient → shared/private-by-policy recipe 的顺序删除菜谱聚合。
7. 删除家庭自定义食材、全部家庭 membership 和 household。
8. 删除该 household 的旧 operation，写无家庭外键、带最小成功 payload 且 14 天到期的本次幂等结果。

全局 `dinner_image_assets` 不随家庭删除。解散成功不清除账号 token，双方下次读取家庭均得到无家庭状态并进入创建/加入页。

### 9.4 账号注销整合

账号注销不能绕过角色和数据归属规则：

- 微信身份交换仍在事务外；事务内验证当前身份。
- 事务内固定锁序为 actor user → identity → household → ACTIVE memberships → child aggregates；当前没有 ACTIVE membership 时仍允许继续注销。
- 有其他活跃成员时，复用成员终止的业务数据清理，但最终硬删除注销者全部 ACTIVE/LEFT/REMOVED membership 事件行。注销者若为 OWNER，必须先删除旧 OWNER membership，使 ACTIVE OWNER 生成列变空，再把唯一剩余 ACTIVE MEMBER 提升为 OWNER；继任 membership 与 household 各只递增一次，更新 `admin_changed_at`，提交前验证恰有一个 ACTIVE OWNER。
- 注销者的全部私有 DRAFT/编辑稿删除，不走普通退出的保留策略。
- 没有剩余成员时复用整户数据清理，但同时删除注销者私人草稿。
- 从未入家、已退出、已被移除或多次加入的注销者同样删除全部空家庭私人草稿/编辑稿、全部 membership 历史、actor operation 和以其历史 membership 为 target 的 operation。其他 membership 行若 `ended_by` 指向该用户，继续只引用已去标识化且状态为 DELETED 的 user 行，不保留原身份信息。
- 最后再删除微信绑定、去标识化用户并使旧 JWT 失效。
- 任一步骤失败时身份、家庭数据和用户状态全部回滚。

## 10. API 契约

保留现有创建、加入和邀请码刷新路径，不做无收益的 URL 迁移。

| 方法与路径                                                  | 用途                                             |
| ----------------------------------------------------------- | ------------------------------------------------ |
| `GET /api/dinner/household`                                 | 现有摘要，新增家庭版本与当前角色                 |
| `GET /api/dinner/household/members`                         | 单一管理快照：家庭、成员、角色、版本和邀请码状态 |
| `PUT /api/dinner/household`                                 | 双方改名                                         |
| `GET /api/dinner/household/invite-code`                     | 只返回状态和过期时间，不返回旧明文               |
| `POST /api/dinner/households/invite-code/refresh`           | 撤销旧码并生成新明文一次                         |
| `POST /api/dinner/household/invite-code/revocation`         | 主动撤销当前 open 邀请码                         |
| `POST /api/dinner/household/members/me/leave`               | MEMBER 主动退出                                  |
| `POST /api/dinner/household/members/{membershipId}/removal` | OWNER 移除另一成员                               |
| `POST /api/dinner/household/ownership-transfer`             | OWNER 转让给另一活跃成员                         |
| `POST /api/dinner/household/dissolution`                    | 名称确认和微信复核后解散                         |

`GET /api/dinner/household` 继续保持 onboarding 兼容：无 ACTIVE 家庭时成功返回 `data:null`；其他要求家庭的接口返回 `DINNER_HOUSEHOLD_REQUIRED`。`HouseholdResponse` 兼容扩展：`version`、`inviteRevision`、`myRole`、`myMembershipId`、`myMembershipVersion`。

`GET /api/dinner/household/members` 在一个 read-only snapshot 中返回单一 `HouseholdManagementResponse`：

```text
household: HouseholdResponse
members: [{ membershipId, version, role, relation(ME|PARTNER), joinedAt }]
invite: { state(NONE|ACTIVE|EXPIRED), inviteRevision, expiresAt, createdByMe }
```

创建/刷新邀请码成功响应返回 `{ household, inviteCode, inviteRevision, inviteExpiresAt }`；`inviteCode` 是一次性明文。状态查询与生成响应使用同一个 revision，客户端发现 revision 不一致时立即丢弃旧明文。

当前版本不收集微信昵称头像，因此不返回或伪造 `displayName/avatarUrl`，也不暴露内部 `userId`。

所有 API 时间均为 ISO-8601 UTC Instant。客户端固定按 `Asia/Shanghai` 展示 `joinedAt/expiresAt`；解析失败时显示“时间暂不可用”，不能显示 `Invalid Date` 或猜测本地时区。

请求：

- 改名：`{ name, expectedVersion }`
- 退出：`{ actorMembershipId, expectedVersion, idempotencyKey }`
- 移除：`{ actorMembershipId, expectedVersion, targetMembershipVersion, idempotencyKey }`
- 转让：`{ actorMembershipId, expectedVersion, targetMembershipId, targetMembershipVersion, idempotencyKey }`
- 解散：`{ actorMembershipId, expectedVersion, householdName, code, idempotencyKey }`

客户端永远不提交可信 household ID、actor ID、actor role、owner ID、recipe creator 或成员状态。

记录响应同步移除原来的裸 `completedBy` 用户 ID，改为 `completedBy: { kind }`；菜品增加 `selectedBy: [{ kind }, ...]`。today 菜单把裸 `confirmedBy/completedBy` 改为 actor；家庭菜谱把 `creatorId/lastModifiedBy` 改为 actor。旧 `source` 仅为兼容字段并允许为 `null`，规则见 5.3。

## 11. 错误、重试和恢复

新增稳定业务码：

- `DINNER_HOUSEHOLD_REQUIRED`：当前没有活跃家庭，客户端进入创建/加入页。
- `DINNER_HOUSEHOLD_VERSION_CONFLICT`：刷新管理详情，保留改名输入，危险动作要求重新确认。
- `DINNER_HOUSEHOLD_OWNER_REQUIRED`
- `DINNER_HOUSEHOLD_OWNER_CANNOT_LEAVE`
- `DINNER_HOUSEHOLD_MEMBER_NOT_FOUND`
- `DINNER_HOUSEHOLD_MEMBER_STATE_CONFLICT`
- `DINNER_HOUSEHOLD_NAME_MISMATCH`
- `DINNER_HOUSEHOLD_NAME_REJECTED`
- `DINNER_HOUSEHOLD_MODERATION_UNAVAILABLE`
- `DINNER_HOUSEHOLD_IDENTITY_MISMATCH`
- `DINNER_HOUSEHOLD_OPERATION_CONFLICT`

HTTP 状态固定为：`REQUIRED/VERSION_CONFLICT/OWNER_CANNOT_LEAVE/MEMBER_STATE_CONFLICT/OPERATION_CONFLICT` 返回 409；`OWNER_REQUIRED/IDENTITY_MISMATCH` 返回 403；`MEMBER_NOT_FOUND` 返回 404；`NAME_MISMATCH/NAME_REJECTED` 返回 422；`MODERATION_UNAVAILABLE` 返回 503；名称字符、UUID 或请求格式非法返回 400。

跨家庭或不可见 target 不回显成员是否真实存在。客户端错误恢复值固定为 `RETRY_LOCAL / REFRESH_RECONFIRM / RELAUNCH_BINDING / RELAUNCH_ONBOARDING / EDIT_INPUT / STAY`；`IDENTITY_MISMATCH` 使用 `STAY` 并明确要求用户重新发起，不循环自动获取 code。危险动作、邀请码生成和解散不自动重放。

## 12. 小程序信息架构与交互

新增：

```text
pages/household-manage/index
pages/household-invite/index
pages/household-dissolve/index
```

### 12.1 家庭管理页

- 从“我的”进入；`onShow` 每次重新读取单一管理快照，并使用递增的请求 generation 丢弃较早请求的迟到响应，避免旧角色、旧 invite revision 或旧家庭状态覆盖新结果。
- 展示家庭名、我的角色、`我/TA` 两个文字成员槽位和真实加入时间；不使用虚构头像。
- 家庭名支持原地编辑，覆盖保存中、成功、内容失败、网络失败和版本冲突；冲突保留输入。
- OWNER 双人态显示移除、转让、解散；MEMBER 显示退出；OWNER 单人态只显示解散。
- 加载失败有明确重试；发现已无家庭时 `reLaunch` 到家庭创建页。

### 12.2 邀请码页

- 单人家庭展示 open 邀请状态、`inviteRevision` 和真实过期时间；因只存摘要，旧码不能再次显示。
- 用户主动生成后展示一次明文，支持复制和微信分享。
- 刷新明确说明会让旧码立即失效；支持主动撤销。
- 双人家庭显示“小家已满，无需邀请码”，不调用刷新接口。

### 12.3 退出、移除和转让

- 退出和移除先在页面展示影响摘要，再用危险色原生 modal 二次确认。
- 转让明确展示“TA 成为管理员，我成为普通成员”，成功后完整刷新角色。
- 四个家庭危险动作在最终确认时才创建 UUID；取消前不创建。提交期间防重复；网络/超时/未知 5xx 保留原 payload/key 供用户显式重试，明确业务拒绝则刷新并要求重新确认后创建新 key。页面重进只刷新状态，不盲目重发。
- 成功退出或被动失权后保留账号登录态并进入家庭创建页。

### 12.4 解散页

- 展示将删除的库存、共享菜谱、菜单和历史，以及将保留的账号和个人草稿。
- 必须勾选“我已了解以上数据会被删除”，并输入完整家庭名；两者未满足时按钮禁用且不调用 API。
- 最终确认后每次调用 `wx.login` 获取新 code；失败或下一次显式重试都获取新 code，不复用旧 code。
- 成功后不清账号 token，`reLaunch` 到家庭创建页。

### 12.5 视觉与原生约束

- 延续现有暖白、橄榄、橙色正式方向；危险动作使用账号注销页的 `#B83B2F`。
- 实现 UI 前必须先基于现有家庭创建、正式版列表和注销确认模式制作恰好三套 OWNER 管理页方向，展示给用户并等待选定；再从选定方向派生 MEMBER、邀请、解散和错误状态参考图。没有用户选定的参考图不得直接进入页面实现。
- 主要触控目标至少 `88rpx`；重要状态同时使用文字，不能只靠颜色。
- 使用 `aria-role`/`aria-live`，不新增裸 `role=`；不使用微信 WXSS 不兼容的 `[disabled]` 属性选择器。
- 原生 `<button>` 明确设置 width、min-width、flex-basis、margin 和 justify-content，避免 430px 收缩或横向溢出。
- 同状态在 375、390、430px 微信原生模拟器验证；390px 参考图与实现图必须合并比较，P0/P1/P2 清零后才收口。

## 13. 隐私、法律与发布材料

- 家庭管理实现后，更新用户协议、隐私政策、微信隐私保护指引材料和注销影响文案，覆盖角色、退出/移除、草稿、V5–V8 数据和幂等操作记录。
- 旧材料中的“无用户生成内容”已不符合家庭菜名、做法、步骤和家庭名称事实，正式候选不得继续使用。
- 普通退出和移除保留账号；账号注销仍是删除微信绑定和去标识化账号的独立权利入口。
- 日志不得记录家庭名称、微信 code、openid、JWT、邀请码明文或内容安全原始响应。
- 当前旧体验版清单和已勾选项不能继承给新候选；发布阶段必须绑定明确 commit、小程序版本和日期重新取证。

## 14. 测试与验收

### 14.1 V8 与真实 MySQL

- fresh、V4 生产形态和当前 V7 三条路径迁移到 V8；V1–V7 checksum 不变。
- 创建者仍在与创建者已不在两种 OWNER 回填。
- ACTIVE user、owner、seat 唯一约束和所有检查约束。
- 结束关系后可加入新家庭、重新加入原家庭且保留历史行。
- 邀请码 open 唯一、24 小时到期、消费、刷新、撤销、`invite_revision`、两人家庭迁移撤销和旧码兼容。
- operation 14 天到期、定时/机会式清理、最小成功 payload、actor 注销与 target 记录删除。
- 坏数据必须明确阻止迁移。

### 14.2 服务与权限

- 创建者 OWNER、加入者 MEMBER；并发创建同一用户无孤儿家庭，并发加入最多成功一人。
- 两角色改名和管理邀请码；家庭已满不能生成。
- MEMBER 退出，OWNER 退出稳定拒绝。
- OWNER 移除、不能移除自己、不能操作跨家庭或已结束成员。
- 转让后恰有一个 OWNER，旧 OWNER 可以再退出。
- 解散名称、身份、角色、版本、幂等和回滚。
- LEFT/REMOVED 用户对家庭、邀请、库存、发现、家庭菜谱、草稿保存/发布、菜单和记录全部失权。
- 用户加入新家庭后仍不能用旧 recipe/menu/record/inventory ID 访问旧家庭。

### 14.3 数据归属与账号注销

- 退出/移除不改共享库存、发布/归档菜谱和已完成快照。
- 所有未完成菜单清除离开者状态、回 DRAFT 且只递增一次版本。
- 私人新建草稿、个人编辑稿、原家庭 lineage 和家庭食材引用符合第 5.2 节。
- 新成员看不到加入前记录；UTC 可见下界覆盖加入前、相等、后一毫秒和跨零点，today 菜单也不能泄漏加入前的 menu/record/recipe/actor 数据；留守成员看到“已退出成员”，注销账号显示“已注销成员”，响应不出现匿名化用户名。
- 参与者数组覆盖 `[ME, PARTNER]`、`[ME, EXITED_MEMBER]`、`[EXITED_MEMBER]` 和 `[EXITED_MEMBER, DELETED_MEMBER]`；旧 source 不把后两类伪装成 BOTH。
- 从未入家、已退出、已被移除、多次加入、当前 MEMBER、当前 OWNER 和最后成员注销均覆盖；注销后该用户全部 membership 事件、私人草稿和 operation 清除，OWNER 场景先删除旧 OWNER membership 再提升继任者。

### 14.4 并发与锁序

在一次性回环 MySQL 8 中至少覆盖：

- 退出 × 菜单更新
- 移除 × 完成菜单
- 转让 × 刷新邀请码
- 注销 × 发布菜谱
- 解散 × 库存更新
- 同一幂等键双提交（两请求同时初查为空，第二个取得 actor user 锁后重放）

断言两个请求可同时首次预查 operation 为空，第二个在获得锁后仍返回第一次成功结果。不存在半状态；数据库死锁或已知约束竞争只产生约定的可恢复 409，另一个无关唯一键错误必须保留为内部错误。

### 14.5 小程序

- service 路径、请求体、版本、UUID、稳定 actor membership context 和无隐式重试。
- OWNER/MEMBER/单人/双人权限矩阵。
- 新旧邀请码的手输、粘贴、分享预填与 16 字符布局；创建页展示真实 expiry。
- 改名输入保留、邀请 revision 导致旧明文清除、危险确认取消/失败复位、四个动作的模糊失败同 key 重试，以及解散每次获取新 code。
- 失权后回家庭绑定，未认证回 onboarding。
- 创建/加入等无家庭状态保留可见的“隐私与账户”入口，账号注销不依赖 ACTIVE 家庭。
- profile 不再固定显示两张头像，不再让满员家庭“查看邀请码”却生成新码。
- 创建/加入页把“双方权限相同”修正为“日常功能双方可用，家庭管理按角色区分”。
- record/today/family-recipe wire 不再暴露内部 user ID，并正确渲染 actor 数组。
- Jest、TypeScript、ESLint、格式、`git diff --check` 和 375/390/430px 原生 QA 全部通过；原生证据包含 PNG 尺寸、Errors=0、Problems=0 和确定性本地假邀请码声明。

## 15. 非目标与发布边界

本阶段不包含：

- 三人及以上家庭、多管理员或自定义角色。
- 获取微信昵称头像、手机号或通讯录。
- 小程序消息中心和微信订阅通知。
- 菜谱共同编辑、变体、复制、归档恢复或库存完成后扣减。
- 自动连接生产、执行生产 Flyway、部署服务、上传体验版、提审或正式发布。

未获得用户针对对应外部动作的明确授权前，只完成本地代码、隔离数据库验证、设计 QA、文档和提交。
