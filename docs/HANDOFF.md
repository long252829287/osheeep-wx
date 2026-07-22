# “小家开饭”正式版演进交接文档

更新日期：2026-07-22（Asia/Shanghai）

> 这是写给一个完全没有聊天上下文的新对话的唯一交接入口。先读第 0、5、7 节，再继续开发。不要把旧体验版的部署或真机结论套用到当前候选代码。

## 0. 一分钟接手结论

### 我们在做什么

项目是微信小程序“小家开饭”：两个人加入同一个家庭，分别选择想吃的菜，合并、确认并完成今晚菜单，再回看做饭记录。

当前任务不是立即提审，而是把已可用的 MVP 补成用户心中的正式版。家庭已发布菜谱接入找菜、今晚菜单和不可变做饭记录已经在本地候选完成；两人家庭管理的独立规格和 14 项实施计划也已完成独立后端/产品/小程序复核，但尚未编码。仍需收口的核心缺口是：

1. 家庭自定义菜谱的外部发布证据、共同编辑、版本修订、归档、复制和多做法变体。
2. 可管理的两人家庭：名称、成员、退出、移除、转让和解散。
3. 完整一致的加载、成功、失败、冲突、空状态、消息与可选订阅提醒。
4. 用授权可追溯的真实菜品成品照替换开发期生成式占位图。
5. 菜谱详情/做法选择、库存删除/单位/自定义食材、完成后库存扣减等收口能力。

### 现在处于什么状态

- 没有已知的编译、单测或静态检查故障。2026-07-22 当前实现的后端默认测试 438/438、V7 迁移 MySQL 1/1、家庭菜谱端到端 MySQL 6/6；小程序 34 个套件、343/343 通过，typecheck、lint、format check 和 diff check 全绿。
- 食材库存、家庭自定义菜谱首个竖切，以及“家庭已发布菜谱 → 找菜 → 今晚菜单 → 完成时不可变记录”的完整本地链路均已在 `main` 实现；代码尚未部署或上传。
- 自定义菜谱已经覆盖个人草稿、自动保存、食材、默认做法、已审核图片、预览和发布恢复。真实微信内容安全联调返回 503，草稿正确保留，但尚无原生发布成功证据。
- 当前候选仍然不能上架；剩余卡点包括 8 张系统菜真实照片、真实内容安全发布、第二授权账号、家庭管理实现、统一反馈/消息、库存与菜谱变体/扣减、生产 V7/V8 迁移与部署、体验版上传，以及真实设备、弱网、合规和提审验收。
- 不要再把“已发布家庭菜谱接入找菜/今晚菜单”或“编写家庭管理规格”列为下一任务。下一段安全本地开发从 [家庭管理实施计划](superpowers/plans/2026-07-22-household-management.md) Task 1 的 V8 持久化契约开始。

### 用户的协作要求

- 安全的本地代码、测试、文档和设计 QA 直接做，不要每一步都询问。
- 页面设计和实现继续使用 `product-design` skill；已选定的方向不要无故重做选型。
- 菜品图片禁止再用生成图。只能使用授权来源和存档链路清楚的真实照片。
- 只有遇到生产部署、微信公众平台、上传体验版、提审/发布、付费、凭据/二次验证或需要用户承担的最终合规确认时，才暂停并明确告诉用户要做什么。

## 1. 仓库与实时基线

项目包含两个独立仓库，用户已批准直接在 `main` 工作。

| 项目       | 本地路径                                                             | 当前实现 HEAD | 2026-07-22 文档提交前检查快照                                                           |
| ---------- | -------------------------------------------------------------------- | ------------- | --------------------------------------------------------------------------------------- |
| 微信小程序 | `/Users/longlonglong/Developer/Personal/Apps/osheeep/osheeep-wx`     | `a707482`     | `main`；本文提交前实现与 `origin/main` 同步，只有本轮家庭管理规格/计划/HANDOFF 文档改动 |
| Java 后端  | `/Users/longlonglong/Developer/Personal/Apps/osheeep/osheeep-server` | `b56a882`     | `main`，工作区 clean，本文提交前与 `origin/main` 同步                                   |

说明：

- 前端是微信原生小程序（TypeScript + WXML + WXSS），不是 React/Taro/uni-app；后端是 Java 21 + Spring Boot 3.5.16 + MyBatis-Plus + Flyway + MySQL 8。
- `a707482` 是家庭管理文档工作开始前的小程序实现 HEAD；它已包含家庭菜谱菜单链路的失效恢复、轮询、长文案、库存摘要和最终 QA 文档。
- `b56a882` 是家庭管理文档工作开始前的后端 HEAD；它已包含 V7、统一发现、菜单身份、完成快照、损坏聚合防护、事务前验证与一次性 MySQL 证据文档。
- 上述 ahead 数只相对当前本地 tracking ref；新对话必须重新检查。需要确认 GitHub 新变化时先执行 `git fetch`，然后检查 divergence 和本地 diff；不要在未知工作区上直接 `git pull`。
- 本轮一次性 MySQL 8 容器和测试进程已清理；没有执行生产部署、生产 Flyway、小程序上传、提审或发布。
- 小程序仓库已忽略 `.superpowers/` 本地临时证据；不要将其中的调试脚本或空白截图误提交。

新对话的第一组命令：

```bash
cd /Users/longlonglong/Developer/Personal/Apps/osheeep/osheeep-wx
git status --short
git log -5 --oneline
git rev-list --left-right --count origin/main...main

cd /Users/longlonglong/Developer/Personal/Apps/osheeep/osheeep-server
git status --short
git log -5 --oneline
git rev-list --left-right --count origin/main...main
```

如果看到未知改动，先读 diff，不要覆盖、删除或 reset；它们可能是用户或其他对话的工作。

## 2. 已经确认的产品决策（不要重新问一遍）

### 2.1 产品范围

- 继续聚焦两人家庭，不扩展为公开菜谱社区、多人投票平台或仓储系统。
- 家庭食材库存共享，记录数量和单位；数量可以留空，表示“家里有，但数量未知”。
- 找菜默认展示所有结果，排序优先级为无缺失、匹配比例、双方偏好、预计耗时和稳定菜谱 ID；家庭库存之外可临时包含/排除食材，但不回写库存；“只看能做”仍保留数量未知的结果。当前实现还没有把双方偏好完整接入排序，这是明确待办。

### 2.2 自定义菜谱

- 创建流程采用分步编辑和自动保存：基本信息 → 食材 → 默认做法 → 其他做法 → 内部真实图库选图 → 预览发布。
- 草稿只有创建者可见；发布后成为家庭共享菜谱，两人都可编辑。
- 删除采用归档，已有菜单和做饭记录的快照不受影响。
- 系统菜保持只读，可复制为家庭菜后修改。
- 每道菜有一个默认做法，可增加“少油版”“空气炸锅版”等做法变体。
- 加入今晚菜单时保存做法选择；双方选中同菜但做法不同时，需要在确认菜单时明确决定最终做法。
- 共享菜名、做法和步骤在发布/更新前做服务端文本内容安全检查；失败时保留草稿。

### 2.3 家庭管理

已确认的权限方向是“日常操作平等，危险操作分级”：

- 创建者为 `OWNER`，另一人为 `MEMBER`。
- 双方都能修改家庭名称、查看成员和管理邀请码。
- `OWNER` 负责移除成员、转让管理权和解散家庭。
- `MEMBER` 可主动退出；两人家庭中 `OWNER` 不能直接退出，必须先转让或解散。
- 退出者失去原家庭共享库存、菜谱和历史的访问权；已发布菜谱留在原家庭，个人草稿归创建者。
- 退出/移除必须显示影响并二次确认；解散需输入家庭名称并重新做微信身份校验。

### 2.4 图片、消息和库存扣减

- 首个正式版不开放用户上传图片，只允许从已审核的真实照片库选择。
- 图片主来源可使用 Pexels，Pixabay 和许可清晰的 Wikimedia Commons 作补充；禁止搜索结果页直接拿图、无来源转载、水印图和第三方热链。
- 入库必须记录原页面、作者、许可、获取日期、哈希、尺寸和内部对象键；客户端使用自有域名下的稳定派生图。
- “我的”增加消息入口；小程序内消息是基础，微信订阅提醒是可选增强，用户拒绝不影响业务，也不能反复索取。
- 菜单完成与库存扣减是两个独立幂等动作；扣减失败不能回滚或重复生成做饭记录。

## 3. 已经完成的内容

### 3.1 旧候选版已完成的基线

以下内容早于当前库存/找菜候选，历史文档记录其曾部署到生产或上传为体验版，但本次交接没有联网重新验证外部状态：

- 微信登录，创建/加入双人家庭，邀请码。
- 双方选菜、服务端合并、确认，修改后撤销确认，幂等完成。
- 做饭记录列表和完成时菜品/选择人快照。
- 登录前《用户协议》《隐私政策》，默认不勾选，隐私中心和自助注销。
- 注销时微信身份复核、旧 JWT 失效、剩余成员历史保留和最后成员数据清理。
- 品牌文案统一为“小家开饭”。

旧候选曾完成双账号、iPhone、Android 和弱网回归。这只是历史记录，不是当前 V7 + `b80d6f8` 候选的真机结论。

### 3.2 库存与找菜后端基线（已被 3.6 扩展）

`osheeep-server` 的历史基线 `584ecd5` 已实现并推送：

- Flyway `V5__add_recipe_ingredients_and_household_inventory.sql`：标准食材、菜谱食材关系、家庭库存和初始字典数据。
- 食材目录和家庭库存查询、新建、更新、删除 API。
- 行级乐观版本，并发创建重复键、锁等待和死锁统一转为 409 库存冲突。
- `AVAILABLE / UNKNOWN_QUANTITY / MISSING` 菜谱必需食材匹配。
- 家庭库存上下文的 include/exclude 临时筛选和 `onlyCookable`。
- 库存时间按 `Asia/Shanghai` 显式转换，数量未知语义和创建版本语义已加固。

注意：V5 已进入源码仓库候选，但没有生产 Flyway 执行证据，不得写成“已部署”。

本会话曾用一次性 MySQL 8 QA 容器启动后端，运行 V5 并支撑库存/找菜页交互验收；容器和后端进程已清理。这是隔离环境的交互证据，不是持久化的迁移报告、真实双事务并发测试或生产部署证据。

### 3.3 库存/找菜小程序基线（已被 3.6 扩展）

`osheeep-wx` 的历史基线 `b13350a` 已实现并推送：

- `pages/ingredients/index`：库存列表、搜索、分类快捷跳转、数量保存、数量未知、保存防重、冲突刷新并保留本地输入。
- `pages/recipes/index`：家庭库存摘要、展开/收起、临时包含/排除、只看能做、重点推荐和轻量菜谱行。
- “加入今晚菜单”与当前用户已选菜做有序并集，不会覆盖旧选择。
- 菜单版本按 `id + menuDate` 隔离，凌晨 4 点业务日切换时可接受新菜单版本 `0`。
- 库存搜索状态下点击分类，先清空搜索并恢复完整分组，再在 `setData` 回调后滚动，避免跳转不存在的锚点。

家庭菜谱入口在后续本地提交中已经替换为真实列表与编辑器；不要再按旧“暂未开放”状态判断当前工作区。

### 3.4 方案 3 产品设计收口

- 用户选定了库存页方案 3：暖白背景、轻量分类导航、紧凑库存行、素色橙色“保存”动作，保留微信原生导航。
- 找菜页延续既定方向，并补齐库存展开、全宽轻量行和明确“加入”动作。
- 已在授权的微信开发者工具会话中完成 375、390、430px 原生模拟器 QA，并保存 390px 参考/实现同输入对比。
- 证据位于 `docs/design/qa/`，范围结论见根 [design-qa.md](../design-qa.md)。该 `passed` 只表示库存和找菜设计范围通过，不表示正式版可上架。

### 3.5 已有验证证据

微信端 `b13350a` 提交前在本会话实际运行过：

- 24/24 测试套件通过。
- 165/165 测试通过；食材库存与找菜两个聚焦套件共 51 项。
- `npm run typecheck`、`npm run lint`、`npm run format:check`、`git diff --check` 全部退出 0。

库存/找菜基线曾只有 145 项默认测试证据；该旧数字先被 3.6 的 273 项后端全量与显式 MySQL 竖切复验取代，再被 3.7 当前 HEAD 的 438 项默认测试、迁移 1/1 和端到端 6/6 证据取代。默认 `mvn test` 仍不能单独证明真实数据库迁移或生产部署，必须把它与专用 MySQL 集成测试分开陈述。

### 3.6 家庭自定义菜谱首个竖切（V6 历史候选）

后端 V6 竖切已实现并提交：

- Flyway V6：家庭菜谱 `DRAFT/PUBLISHED/ARCHIVED`、聚合版本、默认做法/步骤和可追溯图片资产。
- 个人草稿创建、分步整组保存、图片选择、发布快照、微信文本安全检查和短事务状态转换。
- 草稿仅创建者可见；已发布/归档按家庭可见；服务端不信任客户端家庭 ID 或创建者 ID。
- 结构化字段校验、稳定错误码、图片资产仅返回已审核内部派生图与许可元数据。
- 一个 Wikimedia Commons CC0 番茄炒鸡蛋资产已入库并供本竖切使用；原始第三方文件 URL 和内部对象键不暴露给客户端。

小程序 V6 竖切已实现并提交：

- 家庭菜谱列表：已发布、我的草稿、已归档，新建/继续编辑和可恢复错误状态。
- 五步编辑器：基本信息、食材、默认做法、已审核图片、发布预览；串行自动保存、页面隐藏 flush、版本冲突与发布恢复。
- 图片选择页：本地筛选服务端批准资产，展示作者、许可、来源和获取日期，不打开任意第三方页面。
- 原生 375/390/430px QA 已完成；期间发现并修复家庭菜谱原生 `<button>` 行在 430px 收缩成窄列的问题。

2026-07-20 的实际验证如下；这些数字是历史里程碑，当前 HEAD 的新证据见 3.7：

- 后端默认全量 273/273 通过。
- 显式 `DinnerCustomRecipeMySqlIT` 在专用 MySQL 8 测试库 1/1 通过；该库运行时已在 Flyway V6，本轮最后一次复验是“V6 current/up-to-date”，不能写成从空库重新执行 V1–V6。
- 小程序 31 个套件、307/307 通过；typecheck、lint、format check 和 diff check 全部通过。
- 原生交互证明新建/重开草稿、自动保存、页面隐藏 flush、数量空值“适量”、步骤排序和已审核图片元数据。
- 真实点击发布返回 HTTP 503，并显示“暂时无法完成安全检查，请稍后重试”；草稿保留。这证明审核不可用恢复路径，不证明真实发布成功。
- 双用户发布后可见由 MySQL 集成测试覆盖；本轮只有一个授权开发账号，没有原生双账号证据。

设计与交互证据见 [家庭自定义菜谱 QA](design/qa/custom-recipes/custom-recipes-design-qa.md)。其中视觉结果通过；真实发布仍受内容安全 503 和第二授权账号缺失阻塞。

### 3.7 家庭已发布菜谱接入找菜、今晚菜单与不可变记录（当前本地候选）

后端实现 HEAD `437768c` 已完成：

- 只新增 Flyway `V7__connect_household_recipes_to_menus.sql`，为菜单选择保存服务端解析出的 `recipe_version` 与默认做法身份，并为做饭记录增加菜谱范围、版本、份数、做法、步骤和食材 JSON 快照字段；V1–V6 未修改。
- `GET /api/dinner/recipes` 现在把系统菜和当前家庭 `PUBLISHED` 菜谱放进同一个库存匹配、临时包含/排除、“只看能做”和稳定排序管线；草稿、归档、其他家庭和损坏聚合不会泄漏到结果。
- `PUT /api/dinner/menus/today/selections` 的客户端请求仍只提交 `recipeIds + version`。服务端解析并保存菜谱范围、菜谱版本和唯一活动默认做法；读取菜单时返回这些身份与做法摘要，失效菜谱返回稳定的 `DINNER_RECIPE_INVALID`。
- 完成菜单前，服务端批量复验家庭、菜谱版本、做法归属、图片、食材、步骤及同菜多选择行的一致性；所有 JSON 在创建记录前验证并编码，记录与完整菜品快照在同一事务写入。历史详情只读快照，不回查当前菜谱、做法或图片资产。
- 旧记录保持兼容：输出 `scope=SYSTEM`、`recipeVersion=1`、`servings=null`、`method=null`、`ingredients=[]`，不会伪造旧记录没有保存过的细节。

小程序实现 HEAD `b80d6f8` 已完成：

- 找菜页沿用统一结果顺序和现有“加入”交互，并以文字标签标识“自家菜谱”；发送菜单选择时仍不信任客户端菜谱版本或做法身份。
- 今晚菜单展示自家菜谱、默认做法和来源上下文；409 保留用户待加入项且不自动重放，`DINNER_RECIPE_INVALID` 会给出明确恢复提示，并刷新发现结果和菜单。
- 做饭记录详情展示完成时保存的家庭菜谱版本、做法、步骤、食材与“适量”；旧系统菜没有快照内容时不显示空标题或空区块。
- 微信开发者工具原生模拟器已覆盖 375/390/430px 的找菜、今晚菜单和记录详情。期间发现并修复两个 P2：长家庭菜名被截断，以及明明有 5 种库存却显示空库存文案；复验时 Errors 0、Problems 0。

2026-07-22 的实际验证：

- 后端默认 `mvn test`：438/438 通过。
- 一次性、仅回环地址的 MySQL 8 中，`DinnerHouseholdRecipeMenuMigrationMySqlIT` 1/1 通过，覆盖 fresh、V4 和 V6 三种起点升级到 V7；`DinnerCustomRecipeMySqlIT` 6/6 通过，覆盖发布家庭菜进入发现/菜单/完成记录以及历史快照不受后续菜谱变化影响。
- 小程序 34 个套件、343/343 通过；`npm run typecheck`、`npm run lint`、`npm run format:check`、`git diff --check` 全部退出 0。
- 原生截图与对比位于 [家庭菜谱菜单链路 QA](design/qa/household-recipe-menu/household-recipe-menu-qa.md)。参考图和实现图的数据状态不同，只能证明既定视觉方向和三尺寸布局，不应写成像素级同状态对比；记录页的旧数据兼容还由展示模型与 WXML 条件测试补证。

证据边界：上述发布家庭菜来自隔离 MySQL 测试夹具或微信开发者工具本地视觉夹具，不是微信真实内容安全发布成功、第二授权账号、体验版、真机、生产 V7 迁移或线上部署证据。

## 4. 当前真正的阻塞与缺口

### 4.1 正式发布阻断项

1. **真实照片库未完整交付。** 自定义菜谱竖切已有 1 张核验过的 CC0 照片；`miniprogram/assets/recipes/` 中 8 张系统菜图仍是开发期生成式占位，没有正式发行许可证据。
2. **自定义菜谱真实发布未完成外部联调。** 本地原生发布到微信内容安全返回 503，且本轮只有一个授权开发账号；需要在可用的真实审核环境中补成功发布与双账号可见证据。
3. **家庭管理已设计、未实现。** [产品/技术设计](superpowers/specs/2026-07-22-household-management-design.md) 和 [实施计划](superpowers/plans/2026-07-22-household-management.md) 已完成并消除独立复核的 P0/P1 歧义；代码仍只有创建/加入/邀请码，没有 V8、普通退出、移除、转让、解散和新管理 UI。
4. **统一反馈和消息系统未实现。** 现有页面有局部提示，但没有统一错误码映射、消息中心和可选微信订阅提醒。
5. **产品链路仍有缺口。** 已发布家庭菜谱接入找菜、今晚菜单和完成记录已经完成；剩余的是家庭菜谱详情/共同编辑、版本修订、归档、复制与多做法变体，库存删除 UI、单位选择、家庭自定义食材、双方偏好排序，以及菜单完成后的可编辑、幂等库存扣减。
6. **当前候选没有部署/上传。** V7 后端源码只在本地和一次性 MySQL 8 中验证，未应用到生产数据库；不得复用旧 `target` JAR。当前小程序代码未上传、未提审、未发布。
7. **当前候选没有真实环境回归。** 尚未重做第二授权账号、iPhone、Android、弱网、真实发布内容安全、生产迁移、线上联调和回滚演练。开发者工具的 375/390/430px 模拟器验证不能替代这些项目。
8. **合规与提审材料必须更新。** 自定义文本会改变旧的“不包含 UGC”事实；图片资产、内容安全、隐私声明和微信订阅模板都需要对应复核。

### 4.2 不是阻塞的事

- CAT 外部拨测被暂停是用户针对当前低用户量的主动决定，不是产品故障，也不要擅自恢复试用或付费。
- 旧体验版的核心闭环和隐私/注销能力已有历史验收，不需要从头重写；只需在新候选上做回归。

## 5. 下一步实施计划

### 阶段 0：接手校验

1. 重新检查两个仓库的 status/log/ahead-behind，不覆盖未知改动。
2. 读 [正式版产品设计](superpowers/specs/2026-07-15-formal-release-product-design.md)、[库存/找菜实施计划](superpowers/plans/2026-07-15-recipe-inventory-discovery.md) 和 [设计 QA](../design-qa.md)。
3. 如果要修改页面，按用户要求使用 `product-design` skill，建立参考图、实现图和同视口对比，不要只看一张截图就宣称通过。

### 阶段 1：自定义菜谱及晚饭链路（本地已完成，外部验收未完成）

1. V6、草稿/发布模型、默认做法、已审核图片、自动保存和家庭菜谱列表已经按独立计划完成。
2. V7、统一发现、今晚菜单菜谱身份、默认做法和完成时不可变快照已按 [家庭菜谱菜单链路计划](superpowers/plans/2026-07-21-household-recipes-discovery-menu.md) 完成本地实现和隔离 MySQL 验证；不要重复实现或把它写成待办。
3. 不要修改 V1–V7 的已提交语义；后续数据库演进从 V8 开始。
4. 仍需外部条件：可用的真实微信内容安全调用、第二授权账号、体验版/真机环境。补证时不得用测试夹具冒充真实发布。
5. 已发布菜谱共同编辑、修订、变体、复制与归档仍需独立规格和版本语义；继续全程 TDD，每一个共享写操作都带版本或幂等保护，历史快照不受后续菜谱修改影响。

### 阶段 2：真实照片库（可与阶段 1 并行）

1. 建立图片资产元数据和审核流程，然后再接菜谱选图。
2. 通过授权清晰的源站搜索真实成品照；保存原页和许可证据，不得只保存搜索结果图或 CDN 临时地址。
3. 用自有服务托管列表/详情派生图，不热链，不把大量原图打进小程序主包。
4. 正式候选前替换 8 道系统菜的全部生成式占位图，做逐图许可、裁切、性能和来源展示验收。

### 阶段 3：菜谱、库存与完成后扣减

- 库存删除 UI、单位选择、家庭自定义食材。
- 菜谱详情、双方偏好排序和做法冲突决策。
- 完成菜单后可跳过、可编辑、幂等的库存扣减；扣减失败不影响已完成记录。

### 阶段 4：家庭管理

规格和计划已完成：

- [两人家庭管理设计](superpowers/specs/2026-07-22-household-management-design.md)
- [两人家庭管理实施计划](superpowers/plans/2026-07-22-household-management.md)

下一项是计划 Task 1：新增只向前的 V8 持久化契约和早期一次性 MySQL smoke。随后按计划依次完成 ACTIVE 授权、统一锁序、角色/邀请码、退出移除、转让、解散/注销、历史 actor、完整 MySQL 证据、Product Design 选型、小程序实现和原生 QA。Task 10 必须生成恰好三套 OWNER 方向并暂停等待用户选定，不能由实施者自行挑选。

现有 membership 没有可用于退出/移除的状态字段，库存、找菜等服务当前主要以“能查到 membership”作为授权前提。家庭管理迁移必须同时改造所有家庭业务的服务端授权检查，只允许活跃成员访问，并用回归测试证明已退出/被移除成员不能继续读写库存、菜谱、菜单和历史。

### 阶段 5：统一提示、消息与订阅

1. 建立统一错误码→文案/操作映射，统一局部加载、防重、字段错误、冲突、断网、超时和空状态。
2. 增加小程序内消息中心，支持已读、全部已读和业务跳转。
3. 只在相关业务动作成功后申请微信订阅；模板 ID 通过生产环境注入，不写死在仓库。

### 阶段 6：新候选发布

1. 产生一个由 HEAD 构建的新 JAR，先在隔离 MySQL 中验证 V5+ 迁移和双事务边界。
2. 在用户明确授权下，按固定 JAR + systemd 方式备份、部署、验证和保留回滚点。
3. 上传新小程序体验版，由用户确认覆盖和版本。
4. 对该候选重做双账号、iPhone、Android、弱网、隐私、内容安全、真实图片许可和数据迁移回归。
5. 重新准备审核说明、操作步骤、截图和 [提审清单](review-submission-checklist.md)；旧清单的已勾选项不能直接继承。
6. 提审和发布由用户亲自或在用户明确监督下执行。

## 6. 关键业务与技术不变式

- 同一家庭、同一业务日只有一份菜单；家庭时区中凌晨 4 点前仍归前一天。
- 客户端提交当前用户的完整选择集合，合并结果由服务端计算。
- 菜单写操作带 `version`；确认和完成使用 UUID v4 幂等键。冲突后刷新并要求用户显式重试，不自动重放写请求。
- 做饭记录使用完成时快照，后续菜谱、做法、图片或成员变更不得改写历史。
- 菜单选择请求仍只接受当前用户的完整 `recipeIds` 集合和菜单 `version`；菜谱范围、菜谱版本、默认做法与家庭归属由服务端解析并保存，不能信任客户端补充这些身份。
- 家庭菜完成时必须在创建记录前复验菜谱版本、唯一活动默认做法、已审核不可变图片、食材与步骤 JSON；任何不一致整体失败，不能留下半条记录。
- 库存请求的 `version: 0` 只是“缺失时创建”哨兵；持久化新行从版本 `1` 开始，已有行收到 `0` 必须冲突。
- 库存数量为 `null` 是合法状态，不是删除。必需食材单位一致且库存存在时，任一方数量未知应是 `UNKNOWN_QUANTITY`，不是 `MISSING`。
- 并发创建重复键、锁等待和死锁要转为可恢复的 409 版本冲突，不能泄漏 SQL 错误。
- 库存时间字段与 `Asia/Shanghai` 的转换已显式定义，不要恢复为依赖 JVM/数据库默认时区。
- 家庭、成员、菜谱、库存和菜单权限必须由服务端根据当前身份计算，不信任客户端传入的家庭 ID、角色或创建者 ID。

当前主要 API 边界：

- `/api/auth/wechat`：微信登录。
- `/api/dinner/household*`：家庭、邀请码和加入。
- `/api/dinner/ingredients` 和 `/api/dinner/inventory*`：食材目录和家庭库存。
- `GET /api/dinner/recipes`：把系统菜与当前家庭已发布且聚合完整的家庭菜统一做库存匹配、临时 include/exclude、`onlyCookable` 和稳定排序；返回 `scope`、`version`、无步骤的 `defaultMethod` 摘要、食材和匹配结果。
- `/api/dinner/recipes/drafts`、`/api/dinner/recipes/family`、`/api/dinner/recipes/{id}*`：家庭菜谱草稿、列表、分步保存、详情和发布。
- `/api/dinner/image-assets` 与 `/media/recipes/**`：已审核图片元数据和自有来源派生图。
- `/api/dinner/menus/today*`：选择、合并、确认和完成；菜单菜品响应包含 `scope`、`recipeVersion` 和默认做法摘要，写选择仍只提交 `recipeIds + version`。
- `/api/dinner/records*`：做饭记录；当前详情从完成时快照输出家庭菜谱版本、做法步骤和食材，旧记录按兼容默认值输出，不回查当前菜谱聚合。
- `/api/users/me/deletion`：账号注销；源码和后端 API 契约均已记录。

## 7. 踩过的坑，不要再踩

### 7.1 产品、设计和图片

- 不要把根 `design-qa.md` 的局部 `passed` 写成“正式版可上架”。
- 不要再用图像生成工具创建菜品成品照，也不要把当前 8 张占位图称为真实授权摄影。
- 不要从 Google/百度图片或无来源文章直接复制图片，不要热链第三方临时 URL。
- 使用 `product-design` 时，参考图和实现截图必须使用同视口并放进同一比较输入；可以复现时应使用同状态。历史参考无法复现同状态时，只能判断设计方向，并在 QA 中明确数据差异与证据限制。修完 P0/P1/P2 后才可收口。
- 微信开发者工具的 375/390/430px 是原生模拟器 QA，不是 iPhone/Android 真机回归。

### 7.2 微信原生前端

- 原生 `<button>` 有固有宽度、居中和边框行为；曾造成 430px 库存行横向溢出和轻量菜谱行内容收窄。需要明确 `width/min-width/flex-basis/justify-content`，不要假设 Web 默认行为。
- 家庭菜谱行也踩过同一问题：只有 `width: 100%` 仍会在原生 430px 模拟器收缩；`a513df5` 用 `min-width: 100%` 和 `justify-content: flex-start` 加固，并有契约测试。
- 不要在 WXSS 使用 `.button[disabled]` 一类属性选择器；微信编译器会警告。用明确状态 class。
- 重要操作的触控高度至少 88rpx。不能只靠颜色表示保存中/已加入/失败。
- 搜索后 DOM 可能只剩匹配分组；分类跳转必须先清除搜索并恢复分组，再滚动到锚点。已有回归测试，不要退化。
- Prettier 3.9.4 没有 WXML parser。项目标准 `npm run format:check` 只检查 TypeScript/JSON/Markdown；不要用广域 WXML/WXSS Prettier 失败宣称整个项目格式失败，也不要为了追绿去改无关旧文件。
- `sitemap.json` 的 `rules` 不能是空数组；当前允许全页面的有效规则有契约测试保护。
- 微信开发者工具曾因残留 TDesign 文件列表缓存而上传失败。项目没有 TDesign 运行时依赖；应重建工具缓存，不要为了缓存错误重新安装 TDesign 或伪造文件。

### 7.3 后端、数据库和测试

- 从现在开始把 V1–V7 当作不可变迁移；后续模型使用 V8+，不要重写已提交迁移的语义。
- 不要把默认 `mvn test` 的 438 项写成“真实 MySQL 集成已通过”。`*IT` 不在默认 Surefire 范围内，真实数据库验证必须显式选择测试，并通过原始进程环境、JDBC 实际 catalog 和 Flyway 实际 data source/schema 安全门。
- 不要在共享开发/生产库上跑写入型集成测试，也不要为了所谓“双事务覆盖”擅自修改真实数据。
- 版本冲突处理必须保留用户输入，避免自动重放非幂等写入。

### 7.4 候选版、运维与安全

- 代码 push、微信开发者工具上传、选为体验版、提交审核和正式发布是五个不同状态，不要混写。
- 不要假设当前 `target/osheeep-server-0.0.1-SNAPSHOT.jar` 来自 HEAD 或包含 V7；部署前必须从已验证提交重新构建并核对制品。
- 生产部署方式已定为固定 `/opt/osheeep-server/osheeep-server.jar` + systemd + 浅层备份目录。不要擅自改成多 release 目录、容器编排或复杂 CI/CD。
- 不要恢复旧 Node `my-backend` 或端口 3000；服务器上端口 3100 的 `osheeep-api` 是另一项既有服务，不得扰动。
- 未登录访问受保护 API 得到 401 是预期的；健康判断使用服务器本机 `/actuator/health` 或公网 `/healthz`。
- 未经用户明确授权，不连接生产、不重启服务、不修改 Nginx/公众平台、不上传、不提审、不发布。
- 不要把数据库密码、JWT Secret、微信 AppSecret、SSH 凭据或完整联系信息写入文档、提交、命令输出或聊天回复。

## 8. 本地启动与验证

### 8.1 小程序

```bash
cd /Users/longlonglong/Developer/Personal/Apps/osheeep/osheeep-wx
npm install
npm test -- --runInBand
npm run typecheck
npm run lint
npm run format:check
git diff --check
```

用微信开发者工具导入仓库根目录，小程序目录是 `miniprogram/`。API 环境映射：

```text
develop -> http://127.0.0.1:8080
trial   -> https://www.osheeep.com
release -> https://www.osheeep.com
```

本地 HTTP 联调时可在开发者工具临时关闭合法域名校验，但这不能代替体验/正式环境的平台配置。

### 8.2 后端

```bash
cd /Users/longlonglong/Developer/Personal/Apps/osheeep/osheeep-server
export JAVA_HOME=$(/usr/libexec/java_home -v 21)
export PATH="$JAVA_HOME/bin:$PATH"
mvn test
```

本地启动需要用 `.env.example` 为模板的 `.env.local`。只读变量名，不要在工具输出中打印真实值。Flyway 启动时自动迁移；对专用本地库也先备份/确认，不要对共享库盲目运行未验证迁移。

使用专用本地环境时的启动命令：

```bash
set -a
source .env.local
set +a
mvn spring-boot:run -Dspring-boot.run.profiles=local
```

当前没有经过用户批准的可部署 HEAD JAR。必须重新从 HEAD 构建并验证，不得复用现有旧 `target` JAR。

写入型 MySQL 集成测试必须显式选择一次性、仅回环地址的 MySQL 8 测试实例，设置安全门，并让 `OSHEEEP_DB_NAME` 与 `OSHEEEP_DB_TEST_NAME` 的原始进程环境值完全相同。不要为这些测试 `source .env.local`，以免误连共享或生产数据库：

```bash
export OSHEEEP_DB_HOST=127.0.0.1
export OSHEEEP_DB_PORT=33307
export OSHEEEP_DB_NAME=osheeep_it_v7
export OSHEEEP_DB_TEST_NAME="$OSHEEEP_DB_NAME"
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
mvn test -Dtest=DinnerHouseholdRecipeMenuMigrationMySqlIT -Dspring.profiles.active=local
mvn test -Dtest=DinnerCustomRecipeMySqlIT -Dspring.profiles.active=local
```

后半组 JWT、Redis、RabbitMQ 和微信变量只是让 `local` profile 完整绑定的非生产占位配置；专项测试不会以它们冒充真实外部联调。迁移测试会为 fresh、V4、V6 起点创建带随机后缀的临时 catalog，端到端测试也只操作同一受控实例；测试会在 Flyway 前和 API 写入前再次检查实际 catalog。任何安全门或 catalog 不一致都应直接失败。不要用 Spring/JVM 参数覆盖原始环境变量，也不要把命令指向共享或生产库；完成后删除一次性实例。2026-07-22 的证据分别是迁移 1/1、端到端 6/6。

## 9. 什么时候必须暂停找用户

以下事情不得默认执行：

1. 连接、备份、迁移、替换、重启或回滚生产服务/数据库/Nginx。
2. 登录或修改微信公众平台，上传代码，选为体验版，提交审核或正式发布。
3. 启用付费服务、恢复 CAT、购买图片/存储/内容安全服务。
4. 需要用户提供凭据、扫码、短信/二次验证或开放网络/平台权限。
5. 图片许可、UGC/内容安全、隐私声明或订阅模板存在不能由公开证据消除的最终合规选择。
6. 产品规格发现与本文已确认决策有实质冲突，且不同选择会改变数据所有权或用户可见行为。

除上述情况外，继续在本地自主实现、测试、设计 QA、修文档和按范围提交。直接在 `main` 工作是已确认流程，但过去一次的 push 要求不等于永久推送授权；新对话应以当前用户指令为准。

## 10. 关键文档索引

- [正式版产品设计](superpowers/specs/2026-07-15-formal-release-product-design.md)：产品决策的完整权威来源。
- [食材库存与找菜实施计划](superpowers/plans/2026-07-15-recipe-inventory-discovery.md)：V5 与当前找菜基础的实施历史。
- [当前库存/找菜设计 QA](../design-qa.md)：参考图、实现截图、修复史和范围结论。
- [家庭自定义菜谱实施计划](superpowers/plans/2026-07-16-household-custom-recipes-vertical-slice.md)：V6 到五步编辑器及 Task 11 收口的逐任务证据。
- [家庭自定义菜谱设计与原生交互 QA](design/qa/custom-recipes/custom-recipes-design-qa.md)：三尺寸截图、390px 同状态对照、交互证据和真实发布限制。
- [家庭菜谱菜单链路产品设计](superpowers/specs/2026-07-21-household-recipes-discovery-menu-design.md)：统一发现、菜单身份、失效恢复与不可变历史的权威行为边界。
- [家庭菜谱菜单链路实施计划](superpowers/plans/2026-07-21-household-recipes-discovery-menu.md)：V7、后端批量组装/快照、小程序展示与验证任务的逐项记录。
- [家庭菜谱菜单链路原生 QA](design/qa/household-recipe-menu/household-recipe-menu-qa.md)：找菜、今晚菜单和记录详情的 375/390/430px 证据、两个 P2 修复与证据边界。
- [两人家庭管理设计](superpowers/specs/2026-07-22-household-management-design.md)：V8 生命周期、权限、锁序、邀请码、危险事务、注销、历史可见性、API 和小程序行为的真相来源。
- [两人家庭管理实施计划](superpowers/plans/2026-07-22-household-management.md)：从 V8 到三视口 QA 的 14 项可执行任务；当前下一步是 Task 1。
- [库存页方案 3 参考](design/formal-release/ingredient-inventory-final-direction.png)。
- [找菜页方向](design/formal-release/recipe-discovery-final-direction.png)。
- [微信提审清单](review-submission-checklist.md)：当前勾选状态属于旧候选，新候选必须重做。
- [微信隐私指引材料](wechat-privacy-guide-materials.md)。
- [后端 API 契约](../../osheeep-server/docs/api-contract.md)：已同步 V7 的统一发现、菜单选择身份、不可变记录、旧记录兼容和 2026-07-22 隔离 MySQL 证据；仍需以实时后端 HEAD 为准。
- [后端生产运维手册](../../osheeep-server/deploy/production/OPERATIONS.md)：只在用户明确授权的生产操作中使用。

## 11. 新对话的建议开场

完成第 1 节实时检查后，直接从下面的目标开始，不需要用户重复产品选择：

> 先复核 `osheeep-server@b56a882` 与 `osheeep-wx@a707482` 之后的实时 Git 状态，阅读家庭管理设计与实施计划，不要重复家庭菜谱菜单链路或重新编写规格。若工作区无未知改动，直接执行家庭管理计划 Task 1：V8 持久化契约与早期一次性 MySQL smoke。任何时候都不要把本地 MySQL/视觉夹具写成真实发布、生产迁移、真机或上线证据；push 仍需当次明确授权。

一个阶段只在代码、测试、设计 QA、文档和 Git 状态均可追溯时结束。不要因为“页面能打开”就把正式版开发写成已完成。
