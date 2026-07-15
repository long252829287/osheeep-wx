# “小家开饭”微信小程序交接文档

更新日期：2026-07-15

> 这份文档是写给一个完全没有聊天上下文的新对话的。接手后先读本节和“踩坑记录”，再查看代码或继续开发。不要依赖上一段会话中的口头信息。

## 0. 新对话接手摘要（先读这一节）

### 0.1 我们在做什么任务

我们在开发微信小程序“小家开饭”。核心场景是两个人加入同一个“小家”，分别选择今晚想吃的菜，系统合并双方选择，双方确认并完成菜单，之后可以回看做饭记录。

第一版 MVP、隐私合规、生产部署、体验版上传和真机回归已经完成。2026-07-15 又完成了“食材库存与找菜核心”本地阶段：共享家庭食材库存、基于库存的确定性菜谱匹配、找菜首页和加入今晚菜单已经贯通。用户已经明确：当前实际用户很少，只要求功能稳定可用，不继续为 CAT 外部拨测投入时间或费用；后续工作应把重心放回产品功能，而不是继续扩张运维体系。

项目由两个独立仓库组成，均直接在 `main` 开发：

- 小程序：`/Users/longlonglong/Developer/Personal/Apps/osheeep/osheeep-wx`
- Java 后端：`/Users/longlonglong/Developer/Personal/Apps/osheeep/osheeep-server`

旧 Node 后端已经废弃。生产后端采用固定 JAR、systemd 和浅层目录，不使用多版本 release 目录、容器编排或复杂部署脚本。

### 0.2 已经完成了什么

- MVP 核心闭环已完成：微信登录、创建/加入双人家庭、双方选菜、合并、确认、修改后撤销确认、重新确认、幂等完成、做饭记录和详情快照。
- 隐私与注销已完成：登录前原生《用户协议》《隐私政策》、默认不勾选、隐私中心、自助注销、微信身份复核、旧 JWT 立即失效、剩余成员历史保留、最后成员注销后家庭数据清理。
- 品牌已统一为“小家开饭”；代码、开发者工具项目名、公众平台正式名称和头像均已修改。小程序简称为“开饭”，介绍为“和喜欢的人，一起决定今晚吃什么。”
- 微信公众平台已完成：主体姓名核验、服务类目“工具 → 办公”、开发者与测试成员核对、用户生成内容场景按“不包含”声明、隐私保护指引与最小化信息类型声明提交并复核为“已更新”。
- 生产后端和新体验版均已更新。管理员已用两个真实微信账号完成核心流程、完整注销生命周期、iPhone、Android 和弱网回归，反馈无异常。
- 生产运维已完成：数据库备份与临时恢复验证、日志敏感信息复扫、正式 JAR 备份、复制式回滚干跑、Nginx 登录/API 限流和每 IP 并发限制。公网 `/healthz` 可用，业务服务未因后续监控调整而变更。
- 腾讯云轻量实例的 CPU/内存/磁盘告警仍启用，继续复用邮件通知模板。平台没有测试发送入口，管理员接受首次真实主机告警时再核对邮件收件，不允许为了测试告警而停服。
- CAT 试用外部拨测已按管理员决定停止：任务 `小家开饭-生产健康检查` 为“任务暂停”，策略 `小家开饭-健康检查失败` 已停用。当前没有外部可用性探测，这是有意的成本/复杂度取舍，不是故障。
- 食材库存与找菜核心已经交付：后端新增 V5 食材/菜谱食材/家庭库存模型、4 个库存接口和家庭上下文菜谱匹配；前端新增 `/pages/ingredients/index`，并把 `/pages/recipes/index` 重做为找菜首页，支持临时包含/排除、只看能做和并集式加入今晚菜单。
- 后端本阶段实现提交依次为 `3832af8`、`e006c0b`、`76c0bda`、`5acb457`、`87f6fc6`；前端本阶段实现提交依次为 `9824822`、`c07c1ba`、`9df8cb5`、`3db70b2`、`a2c1c2c`、`73777e3`、`bc6a637`。产品规格与计划提交 `0a66b84`、`08c7eef` 保留不变。
- 2026-07-15 Task 8 新鲜回归：后端 `mvn test` 为 137 项测试、0 failure、0 error、0 skipped；前端为 24 个套件、155 项测试全部通过，TypeScript、ESLint、项目标准 `npm run format:check` 和两个仓库的 `git diff --check` 均退出 0。
- 两个仓库继续按已批准的约定直接在 `main` 工作。本阶段提交尚未 push，Task 8 文档提交完成后前端预计相对 `origin/main` ahead 10、后端 ahead 6；工作区应保持干净，直到用户明确要求 push。

### 0.3 当前卡在哪里

当前没有已知自动化回归故障。未完成或仍需人工确认的事项有：

1. **新找菜页尚未完成截图/像素级视觉 QA。** Task 6/7 行为与静态契约测试均已通过，但本轮微信开发者工具 CLI service port 被关闭，且未获准修改这一持久安全设置，无法采集 375、390、430px 新截图。不得把旧页面的真机/截图结果写成新找菜页视觉验收通过。
2. **本阶段尚未 push、部署、上传体验版或做新功能真机回归。** 两个 `main` 可暂时领先 `origin/main`；push、生产部署、体验版上传、提审和发布都等待用户明确决定。
3. **正式提审材料仍有 4 项未勾选。** `docs/review-submission-checklist.md` 的“审核材料”部分仍需补齐审核说明、审核体验步骤、来自待提交体验版的截图/版本号，以及管理员最终确认。提交审核和发布必须由管理员明确决定并亲自或监督执行，不能自动点击。
4. **菜品照片仍是开发期占位。** 当前 `imagePath` 指向的本地菜图不构成正式发行图库；正式发布前仍须执行独立、人工筛选的真实菜品照片图库迁移，并重新完成视觉与版权核对。

CAT 已暂停并不是阻塞。当前低用户量阶段保留 `/healthz` 人工检查和轻量实例基础告警即可；只有用户量或可用性要求明显上升时，才重新评估 CAT 或其他外部探测。

### 0.4 下一步计划

建议新对话按以下顺序继续：

1. 先执行下方仓库检查命令，确认两个工作区 clean，并核对本地 `main` 相对 `origin/main` 的 ahead 数；没有用户明确请求时不 push。
2. 为下一阶段另写一份“自定义菜谱”规格和实施计划，范围必须明确覆盖：草稿、食材选择、做法变体、家庭内发布、共同编辑、归档与历史版本、内容安全。先完成产品/数据/权限设计，再开始实现。
3. 在已授权的微信开发者工具会话中补做新食材页与找菜页的 375、390、430px 截图/像素 QA；若发现视觉问题，单独修复并重跑 Task 6/7 自动化验证。
4. 家庭管理、提示/消息中心/订阅消息，以及正式真实菜品照片图库仍分别属于后续正式发布工作，不能混入自定义菜谱核心计划。
5. 如果用户准备近期上架，先完成独立真实照片图库迁移和新页面视觉/真机回归，再补齐 4 项审核材料，由管理员人工提交审核。
6. 图片上传会改变当前“不包含 UGC/不使用相册”的合规事实。任何上传能力都必须先完成内容安全、存储、删除、隐私指引和平台声明设计。
7. 不主动恢复 CAT、不购买 CAT、不扩建复杂监控。继续保留轻量实例 CPU/内存/磁盘邮件告警；首次真实触发/恢复时核对邮件送达即可。

### 0.5 踩过的坑，不要再踩

- 如果后续工作区出现未提交改动，不要覆盖或清理；先看 diff，再按范围提交。2026-07-15 Task 8 文档提交后的当前基线是 clean。
- 不要自动提交审核、发布正式版或修改微信公众平台配置；这些都需要管理员明确决定。
- 不要恢复旧 Node 服务 `my-backend` 或端口 `3000`；端口 `3100` 的 `osheeep-api` 是另一项既有服务，必须保留。
- 不要把受保护 API 的 `401` 当成服务故障；健康检查使用 `/actuator/health` 或公网 `/healthz`。
- 不要擅自改变固定 JAR + systemd 的生产部署方式，也不要在未授权时连接、重启或扰动生产服务。
- 不要因为 CAT 暂停就认为功能不可用，也不要擅自恢复试用或付费；这是管理员主动选择。
- 不要把微信开发者工具上传成功等同于正式版已发布；体验版、提审和发布是三个不同阶段。
- 不要把 Task 6/7 自动化测试通过写成微信开发者工具截图或像素 QA 已通过；本阶段该人工验证仍明确未完成。
- 不要把当前本地菜品图当作正式照片资产；它们只是开发期占位，正式发布前必须独立迁移真实图库。
- 不要把代码内名称修改等同于公众平台正式名称修改；两处必须分别核对。
- 微信开发者工具曾因残留的 TDesign 文件缓存导致上传失败；项目没有 TDesign 运行时依赖，不要为了缓存错误重新安装 TDesign。
- `sitemap.json` 的 `rules` 不能是空数组，当前允许所有页面的有效规则有契约测试保护。
- Prettier 3.9.4 没有 WXML parser；不要用广域 WXML/WXSS Prettier 失败来宣称整个前端格式检查失败，也不要宣称广域 Prettier 已通过。以项目标准脚本为准。
- 不要把真实数据库密码、JWT Secret、微信 AppSecret、SSH 凭据或联系人完整邮箱写进文档、提交或回复。

更详细的历史踩坑和处理方法见本文第 15 节。

### 0.6 新对话开始时先执行

```bash
cd /Users/longlonglong/Developer/Personal/Apps/osheeep/osheeep-wx
git status --short
git log -5 --oneline
git rev-list --left-right --count origin/main...main
npm test
npm run typecheck
npm run lint
npm run format:check

cd /Users/longlonglong/Developer/Personal/Apps/osheeep/osheeep-server
git status --short
git log -5 --oneline
git rev-list --left-right --count origin/main...main
```

以下生产服务器检查也属于管理员人工运维动作；仅在管理员明确授权并亲自或监督时可使用，代理不得自行连接生产服务器：

```bash
ssh root@82.156.49.122
systemctl status osheeep-server --no-pager
curl --fail --silent http://127.0.0.1:8080/actuator/health
```

不要把 SSH、数据库、JWT 或微信 AppSecret 写进代码、文档、命令输出或聊天回复。

## 1. 当前交付状态

本次“小家开饭”第一版核心闭环已经开发、联调和验收完成。生产后端已于 2026-07-14 更新到隐私与注销版本，微信开发者工具同日确认新代码上传成功并覆盖当前体验版。这里的“开发完成”不代表已经通过微信正式版审核。

2026-07-15 本地新增的食材库存与找菜核心也已完成自动化回归，但尚未 push、部署或上传体验版。已交付范围包括 V5 标准食材/菜谱需求/家庭库存持久层，家庭库存读写与乐观版本冲突，确定性菜谱匹配，家庭食材库存页，找菜首页临时筛选，以及保留既有选择的“加入今晚菜单”。这段新增范围不能沿用下文 2026-07-13/14 的生产、真机和视觉验收结论。

2026-07-13 旧阶段的体验版发布状态（仅作历史记录，不代表当前本地隐私与注销代码已经部署）：

- 已完成：生产 JAR、systemd、日志、Nginx、HTTPS 公网 API、旧 Node 下线、体验代码上传。
- 已完成：`https://www.osheeep.com` 的 `request` 合法域名配置，开发版本 `0.1.0` 已设为体验版。
- 已完成：用户于 2026-07-13 通过体验版验证首页路径和核心功能可用。
- 2026-07-15 管理员已在 iPhone、Android 和弱网条件下完成新版本兼容性回归。
- 该旧体验版代码内产品名仍为“今晚吃什么”；2026-07-14 上传的新体验代码已改为“小家开饭”，管理员已核对正式名称和头像。

2026-07-14 当前本地代码状态：

- 登录前可访问《用户协议》和《隐私政策》两份原生页面，登录同意项默认未勾选。
- “我的”页面已提供隐私中心与自助注销入口；注销会重新获取微信临时凭证并由后端比对当前 `openid`。
- 注销使用勾选加两个顺序原生确认框；成功后清除本地会话，失败时保留可重试状态。
- 后端在事务内删除微信身份、去标识化用户并清理家庭数据；剩余成员存在时保留共享历史并撤销注销者的邀请码，最后成员注销时删除家庭关联业务数据。
- JWT 鉴权会查询用户 ACTIVE 状态，因此注销前签发的旧令牌立即失效。
- 上述更新已于 2026-07-14 部署到生产后端并上传为新体验版；管理员已于 2026-07-15 完成新版本真机回归。

已完成的用户流程：

1. 微信登录。
2. 创建双人家庭，生成邀请码。
3. 第二个微信账号通过邀请码加入家庭。
4. 两个账号分别选择想吃的菜。
5. 服务端合并双方选择，并标记“我想吃”“TA 想吃”“都想吃”。
6. 任一账号确认菜单；另一账号修改后，菜单回到待确认状态。
7. 重新确认并完成菜单。
8. 双端重复点击完成不会产生重复记录。
9. 在做饭记录列表和详情页回看完成时的菜品快照。

2026-07-13 最终验收数据：

- 两个账号合并得到 4 道菜，其中番茄炒蛋为共同选择。
- 两端完成请求最终只生成记录 ID `2`。
- 数据库中 `2026-07-13` 只有 1 条做饭记录，包含 4 条菜品快照。
- 微信开发者工具应用错误为 0；剩余提示均为开发工具平台或基础库警告。
- 375、390、430px 宽度下未发现横向溢出或安全区遮挡。

## 2. 代码仓库

| 项目       | 仓库                                                              | 本地目录                                                             | 分支   | 2026-07-15 Task 8 状态                                                                      |
| ---------- | ----------------------------------------------------------------- | -------------------------------------------------------------------- | ------ | ------------------------------------------------------------------------------------------- |
| 微信小程序 | [osheeep-wx](https://github.com/long252829287/osheeep-wx)         | `/Users/longlonglong/Developer/Personal/Apps/osheeep/osheeep-wx`     | `main` | Task 7 实现 HEAD `bc6a637`；Task 8 文档提交后预计 ahead 10，工作区 clean；未 push           |
| 后端服务   | [osheeep-server](https://github.com/long252829287/osheeep-server) | `/Users/longlonglong/Developer/Personal/Apps/osheeep/osheeep-server` | `main` | Task 4 实现 HEAD `87f6fc6`；Task 8 文档提交后预计 ahead 6，工作区 clean；未 push、未部署 V5 |

两个仓库均按用户批准的 direct-main 约定工作；“ahead”不是脏工作区，也不代表已经远端交付。继续工作前仍应重新执行 `git status --short` 和 `git rev-list --left-right --count origin/main...main`，因为用户可能在新对话开始前继续提交或 push。

## 3. 技术栈

### 小程序

- 微信原生小程序，不依赖 Taro、uni-app 或 React。
- TypeScript 5.9、WXML、WXSS。
- Jest、ts-jest、ESLint、Prettier。
- 本地 Tabler SVG 图标和本地菜品、头像图片资源。
- 当前 AppID：`wxc6dd1b0eb179379b`。

### 后端

- Java 21。
- Spring Boot 3.5.16。
- Spring Security、JWT。
- MyBatis-Plus 3.5.17。
- MySQL 8、Flyway。
- Redis、RabbitMQ 使用现有 `osheeep-server` 基础设施配置。
- Spring Boot Actuator、Springdoc OpenAPI。

## 4. 项目结构

小程序的主要目录：

```text
osheeep-wx/
├── miniprogram/
│   ├── assets/             # 菜品、头像和图标资源
│   ├── components/         # 底部导航
│   ├── config/             # API 地址等运行配置
│   ├── pages/              # 登录、家庭、今晚菜单、找菜、食材库存、记录、我的
│   ├── services/           # 登录、家庭、菜单、菜谱、食材库存、记录 API
│   ├── state/              # 本地会话状态
│   ├── types/              # API 类型
│   └── utils/              # 路由、轮询、错误和菜单纯状态函数
├── tests/                  # Jest 测试
├── docs/design/            # 原型、设计稿和验收截图
├── docs/superpowers/       # 需求规格和实施计划
└── design-qa.md            # 最终视觉验收记录
```

后端相关代码位于：

```text
osheeep-server/src/main/java/com/osheeep/server/
├── auth/wechat/            # 微信 code2session 登录
└── dinner/
    ├── household/          # 双人家庭和邀请码
    ├── ingredient/         # 食材目录与家庭库存
    ├── menu/               # 选择、合并、确认、完成
    ├── recipe/             # 系统菜、所需食材与库存匹配
    └── record/             # 做饭记录及菜品快照
```

数据库迁移：

- `V2__add_wechat_identity.sql`：微信身份。
- `V3__add_dinner_households.sql`：家庭和成员。
- `V4__add_dinner_menus_and_records.sql`：菜谱、菜单、选择、幂等动作和做饭记录。
- `V5__add_recipe_ingredients_and_household_inventory.sql`：标准食材、菜谱所需食材、家庭库存、初始字典和系统菜需求数据；库存数量可空、单位必填、每行独立 `version`。

## 5. 关键业务规则

- 同一家庭、同一业务日只有一份菜单。
- 业务日按家庭时区计算，凌晨 4 点前仍属于前一天。
- 客户端提交完整选择集合，合并结果由服务端计算。
- 菜单写操作携带 `version`，过期版本返回 `DINNER_MENU_VERSION_CONFLICT`。
- 客户端遇到版本冲突会提示并重新拉取最新菜单。
- 确认和完成使用 UUID v4 幂等键。
- 数据库对菜单记录和幂等动作设置唯一约束，避免重复完成。
- 菜单完成时保存菜品和选择人的快照，后续菜谱修改不影响历史记录。
- 菜单页面可见时每 8 秒轮询；页面隐藏或卸载时停止轮询。
- 库存数量为空表示“家里有，但数量待确认”，不等同于删除；新建库存行必须携带 `version: 0`，后续更新和删除使用每行独立乐观版本。
- 找菜临时包含/排除只存在页面状态，不写回家庭库存；排除优先于包含。“只看能做”仅排除 `MISSING`，保留 `UNKNOWN_QUANTITY`。
- 加入今晚菜单会把菜谱 ID 与当前用户完整选择求有序并集，不会覆盖已选菜；菜单版本冲突只刷新并要求显式重试，不自动重复写入。

## 6. 本地启动

### 6.1 启动后端

后端需要 JDK 21、Maven 3.9+，以及由 `.env.example` 复制并填写的 `.env.local`。不要提交 `.env.local` 或任何真实密钥。

主要环境变量：

- MySQL：`OSHEEEP_DB_HOST`、`OSHEEEP_DB_PORT`、`OSHEEEP_DB_NAME`、`OSHEEEP_DB_USERNAME`、`OSHEEEP_DB_PASSWORD`。
- Redis：`OSHEEEP_REDIS_HOST`、`OSHEEEP_REDIS_PORT`、`OSHEEEP_REDIS_PASSWORD`。
- RabbitMQ：`OSHEEEP_RABBITMQ_HOST`、`OSHEEEP_RABBITMQ_PORT`、`OSHEEEP_RABBITMQ_USERNAME`、`OSHEEEP_RABBITMQ_PASSWORD`、`OSHEEEP_RABBITMQ_VHOST`。
- JWT：`OSHEEEP_JWT_SECRET`。
- 微信：`OSHEEEP_WECHAT_APP_ID`、`OSHEEEP_WECHAT_APP_SECRET`。
- 可选邀请码签名密钥：`OSHEEEP_DINNER_INVITE_SECRET`；未配置时使用 JWT 密钥。

启动命令：

```bash
cd /Users/longlonglong/Developer/Personal/Apps/osheeep/osheeep-server
export JAVA_HOME=$(/usr/libexec/java_home -v 21)
export PATH="$JAVA_HOME/bin:$PATH"
set -a
source .env.local
set +a
mvn spring-boot:run -Dspring-boot.run.profiles=local
```

启动后检查：

- 健康检查：<http://localhost:8080/actuator/health>
- Swagger：<http://localhost:8080/swagger-ui.html>
- OpenAPI：<http://localhost:8080/v3/api-docs>

Flyway 会在启动时自动执行尚未应用的迁移。不要手工修改已经执行过的迁移文件；`V5` 已用于食材库存与菜谱需求，后续数据库变化应从 `V6` 起新增迁移。

### 6.2 启动小程序

```bash
cd /Users/longlonglong/Developer/Personal/Apps/osheeep/osheeep-wx
npm install
```

然后在微信开发者工具中导入仓库根目录。项目配置已指定：

- 小程序目录：`miniprogram/`。
- TypeScript 编译插件。
- 当前真实 AppID。

API 地址由 `miniprogram/config/environment.ts` 根据微信环境自动选择：

```ts
develop -> http://127.0.0.1:8080
trial   -> https://www.osheeep.com
release -> https://www.osheeep.com
```

在开发者工具中联调本地 HTTP 服务时，需要在“详情 → 本地设置”中临时勾选“不校验合法域名、web-view、TLS 版本以及 HTTPS 证书”。该设置只用于本地开发，不能代替正式环境配置。

## 7. 自动化验证

小程序：

```bash
cd /Users/longlonglong/Developer/Personal/Apps/osheeep/osheeep-wx
npm test
npm run typecheck
npm run lint
npm run format:check
```

2026-07-15 Task 8 新鲜完整结果：24 个测试套件、155 项测试全部通过；`npm run typecheck`、`npm run lint` 和 `npm run format:check` 均退出 0。Task 6 食材库存页最终聚焦回归为 3 个套件、47 项测试；Task 7 找菜页及后续并发状态修复最终聚焦回归为 4 个套件、39 项测试，均通过。

自动化结果不包含微信开发者工具截图/像素验证。Task 6/7 本轮无法通过 CLI 打开模拟器，因为 DevTools CLI service port 被关闭；375、390、430px 的新页面截图对比仍是明确的人工后续，不得声称已经通过。

格式验证必须精确描述：

- 项目标准 `npm run format:check` 退出 0。
- 2026-07-15 Task 8 文档 scoped 检查 `npx prettier --check docs/HANDOFF.md docs/superpowers/plans/2026-07-15-recipe-inventory-discovery.md` 退出 0。
- 简报广域命令 `npx prettier --check "docs/**/*.md" "miniprogram/**/*.{wxml,wxss,json}"` 退出 2；Prettier 3.9.4 没有配置 WXML parser，并同时提示任务前已有的旧文档/WXSS 格式问题。不得将此结果冒领为 Prettier 全量通过，也不得为追求该命令变绿而修改无关旧文件或依赖。

后端：

```bash
cd /Users/longlonglong/Developer/Personal/Apps/osheeep/osheeep-server
export JAVA_HOME=$(/usr/libexec/java_home -v 21)
export PATH="$JAVA_HOME/bin:$PATH"
mvn test
```

2026-07-15 Task 8 新鲜完整结果：137 项测试全部通过，0 failure、0 error、0 skipped。两个仓库的 `git diff --check` 也均退出 0。

## 8. 主要 API

| 方法     | 路径                                         | 用途                                                  |
| -------- | -------------------------------------------- | ----------------------------------------------------- |
| `POST`   | `/api/auth/wechat`                           | 使用 `wx.login` 返回的 code 登录                      |
| `GET`    | `/api/dinner/household`                      | 获取当前家庭                                          |
| `POST`   | `/api/dinner/households`                     | 创建家庭                                              |
| `POST`   | `/api/dinner/households/invite-code/refresh` | 生成或刷新邀请码                                      |
| `POST`   | `/api/dinner/households/join`                | 加入家庭                                              |
| `GET`    | `/api/dinner/ingredients`                    | 获取当前家庭可用的活动食材目录                        |
| `GET`    | `/api/dinner/inventory`                      | 获取当前家庭库存                                      |
| `PUT`    | `/api/dinner/inventory/{ingredientId}`       | 用行级 `version` 新建或更新库存，数量允许为空         |
| `DELETE` | `/api/dinner/inventory/{ingredientId}`       | 用查询参数 `version` 删除库存                         |
| `GET`    | `/api/dinner/recipes`                        | 按家庭库存匹配系统菜；支持临时 include/exclude/filter |
| `GET`    | `/api/dinner/menus/today`                    | 获取今日合并菜单                                      |
| `PUT`    | `/api/dinner/menus/today/selections`         | 保存当前用户的完整选择集合                            |
| `POST`   | `/api/dinner/menus/today/confirm`            | 确认菜单                                              |
| `POST`   | `/api/dinner/menus/today/complete`           | 完成菜单并生成记录                                    |
| `GET`    | `/api/dinner/records`                        | 获取做饭记录列表                                      |
| `GET`    | `/api/dinner/records/{id}`                   | 获取记录详情                                          |
| `POST`   | `/api/users/me/deletion`                     | 微信身份复核后自助注销账号                            |

除微信登录外，业务接口均通过 `Authorization: Bearer <token>` 访问。

## 9. 当前版本边界

当前版本有意保持为可验收的 MVP，尚未包含：

- 自定义菜谱草稿、食材选择、做法变体、家庭发布、共同编辑、归档、历史版本和内容安全流程。
- 菜谱搜索、分类筛选和分页。
- 正式发布用真实菜品照片图库；当前菜图仅为开发期占位，不应直接作为正式版资产。
- WebSocket 实时同步；当前使用 8 秒轮询。
- 提示、消息中心、订阅消息或晚餐提醒。
- 家庭成员退出、解散、踢出和管理员能力。
- CI/CD、业务指标和崩溃上报；外部可用性探测当前按管理员决定停用。

## 10. 生产部署与日常运维

生产入口：

- 网站和 API 域名：`https://www.osheeep.com`
- Nginx：`/api/**` 反向代理到 `127.0.0.1:8080`
- Spring Boot 服务：`osheeep-server.service`
- 旧 Node `my-backend`：已从 PM2 删除，端口 `3000` 已释放
- 既有 `osheeep-api`：继续运行在端口 `3100`，未被本次部署修改

服务器固定目录：

```text
/opt/osheeep-server/
├── osheeep-server.jar       # 当前唯一正式 JAR
├── osheeep-server.env       # 生产环境变量和密钥，禁止提交 Git
├── OPERATIONS.md            # 完整运维手册
├── backup/                  # 部署前按时间命名的旧 JAR
└── logs/                    # 应用滚动日志
```

以下命令仅作为运维参考。生产检查、备份、替换、重启、回滚和 Nginx 操作都必须由管理员明确授权并亲自或监督执行，代理不得自行运行：

```bash
systemctl status osheeep-server --no-pager
systemctl restart osheeep-server
journalctl -u osheeep-server -n 200 --no-pager
tail -f /opt/osheeep-server/logs/application.log
curl --fail --silent http://127.0.0.1:8080/actuator/health
nginx -t
systemctl reload nginx
```

管理员决定部署新 JAR 后，必须先把当前 JAR 复制到 `backup/osheeep-server-YYYYMMDD-HHmmss.jar`，再由管理员亲自或监督替换固定文件并执行 `systemctl restart osheeep-server`。完整的打包、上传、替换、验证、日志、回滚和故障排查命令见后端仓库的 `deploy/production/OPERATIONS.md`。

2026-07-15 已完成限流与监控上线验收：生产安装文件为 `/etc/nginx/conf.d/00-osheeep-rate-limit.conf` 和 `/etc/nginx/snippets/osheeep-api-locations.conf`；登录限流验证为 `400 × 6`、`429 × 2`，通用 API 为 `401 × 74`、`429 × 6`。公网 `https://www.osheeep.com/healthz` 返回 `UP`，最终活动备份为 `/opt/deploy-backups/osheeep-rate-limit-20260715-105138`，此前两次安全回滚证据目录为 `/opt/deploy-backups/osheeep-rate-limit-20260715-104127` 和 `/opt/deploy-backups/osheeep-rate-limit-20260715-104636`。

腾讯云已创建 CAT 任务 `小家开饭-生产健康检查`、CAT 策略 `小家开饭-健康检查失败`、轻量实例最小等价策略 `小家开饭-CVM基础故障` 和通知模板 `小家开饭-生产告警邮件`。管理员已在当前低使用量阶段主动暂停 CAT 任务并停用对应策略，因此当前没有外部可用性探测；公网 `/healthz` 仍保留供人工检查。固定名 `小家开饭-CVM基础故障` 不是 CVM 事件策略，只绑定 1 台生产轻量实例，对 CPU、内存、磁盘利用率分别执行 `> 95%`、连续 5 个 1 分钟数据点的告警，且仍启用。

通知模板开启触发与恢复、全天、邮件 only，并绑定 1 个已有已验证联系人；不得记录邮箱全文。腾讯云没有测试发送入口，管理员接受不做测试收件，不能写成已收到测试邮件；首次真实主机告警触发和恢复时再核对送达，也不得停服制造告警。CAT 为试用能力且未授权付费升级；用户量或可用性要求提升时，再重新启用 CAT 或配置替代外部探测。

## 11. 微信体验版后台人工操作

2026-07-14 微信开发者工具已确认新代码上传成功，上传前明确提示会覆盖当前体验版；首页为 `pages/onboarding/index`。2026-07-15 管理员已用两个真实账号完成 iPhone、Android 和弱网回归。上传成功页未显示版本标签，因此制作正式审核截图时仍须在后台核对版本。以下步骤保留为以后上传新体验版时的人工操作清单：

1. 由管理员登录 <https://mp.weixin.qq.com/> 并选择当前小程序。
2. 由管理员核对“开发管理 → 开发设置 → 服务器域名”中的 `request` 合法域名为 `https://www.osheeep.com`；不要填写 `/api` 路径。
3. 新体验代码上传后，由管理员核对版本和首页 `pages/onboarding/index`，并亲自决定是否设为体验版。
4. 已完成：管理员确认两名实际测试者并组织两个真实微信账号进入体验版。
5. 已完成：管理员在 iPhone、Android 和弱网条件下验证登录、创建/加入小家、分别选菜、合并、确认、修改后重确认、完成、记录回看、隐私中心和完整注销语义。

管理员已确认微信公众平台正式名称为“小家开饭”，头像也已完成修改。后续上传新体验代码时，仍需在微信客户端核对名称、头像和首页品牌文案是否一致。

## 12. 正式上架前清单

以下事项必须由管理员人工完成并在 `docs/review-submission-checklist.md` 留存结果：

1. 已完成：管理员确认代码中的运营主体“刘彦龙”与微信实名认证的个人主体姓名逐字一致；隐私联系邮箱保持 `15203700590@163.com`；两份法律页已于 2026-07-14 完成逐字复核。
2. 已完成：管理员提交并重新打开复核《用户隐私保护指引》和最小化信息类型声明，平台显示“已更新”，本地法律文案已按最终平台内容对齐。
3. 已完成：管理员确认正式名称、生产 API 域名、AppID、服务类目、主体、开发者和测试成员配置；两名测试者分别为管理员和已具备开发者权限的项目成员，无需另加体验成员。不得在文档或输出中暴露 AppSecret。
4. 已完成：管理员检查敏感权限。当前版本不获取手机号、头像昵称、相册或定位，只声明真实使用的微信登录与用户主动剪贴板读取。
5. 已完成：管理员已在 iPhone、Android 真机上完成双账号、注销生命周期和弱网回归。
6. 已完成：生产环境数据库备份恢复、日志脱敏、限流、告警、故障联系人、JAR 备份和回滚均已验证或按平台边界确认；外部探测恢复决策和首次真实主机告警收件核对须继续跟踪。
7. 只有清单全部 22 项完成、主体姓名逐字核验、平台/设备/运维项全部完成后，才由管理员决定并亲自或监督提交审核和发布；任何代理不得自动提审或发布。

## 13. 建议的下一阶段

推荐按以下顺序继续：

1. 另起规格和实施计划建设自定义菜谱，必须同时设计草稿、食材选择、做法变体、家庭发布、共同编辑、归档、历史版本和内容安全；不要把这些能力直接续写进本计划。
2. 在已授权的微信开发者工具中完成食材库存页与找菜页的 375、390、430px 截图/像素 QA，再决定是否需要视觉修复。
3. 家庭管理，提示/消息中心/订阅消息，以及经人工筛选和版权确认的真实菜品照片图库，继续作为彼此独立的正式发布工作。
4. 若准备上架，先完成真实照片图库迁移、新页面真机/视觉回归和提审清单中剩余的 4 项审核材料，再由管理员人工提交审核。
5. 两个仓库保持 direct-main 约定；本地分支可领先远端，只有用户明确要求时才 push、部署或上传体验版。
6. 监控维持轻量策略即可；用户量或可用性要求上升后再评估外部探测、CI、业务指标和崩溃上报。

## 14. 相关文档

- [产品与界面规格](superpowers/specs/2026-07-11-osheeep-wx-design.md)
- [今晚菜单核心规格](superpowers/specs/2026-07-11-tonight-menu-core-design.md)
- [今晚菜单实施计划](superpowers/plans/2026-07-11-tonight-menu-core.md)
- [正式发布产品设计](superpowers/specs/2026-07-15-formal-release-product-design.md)
- [食材库存与找菜核心实施计划](superpowers/plans/2026-07-15-recipe-inventory-discovery.md)
- [体验版部署规格](superpowers/specs/2026-07-13-experience-release-deployment-design.md)
- [体验版部署实施计划](superpowers/plans/2026-07-13-experience-release-deployment.md)
- [微信用户隐私保护指引填写材料](wechat-privacy-guide-materials.md)
- [后端生产运维手册](https://github.com/long252829287/osheeep-server/blob/main/deploy/production/OPERATIONS.md)
- [最终设计验收](../design-qa.md)
- [最终四道菜截图](design/qa/record-detail-four-dishes-implemented.jpeg)

## 15. 踩坑记录：不要再踩

### 15.1 区分历史体验版与 2026-07-14 上传

微信公众平台曾同时显示旧版本 `1.0.1.1` 和 `0.1.0`。旧体验版名称为“幻昼测试体验版”，首页路径是 `pages/index/main`，这不属于当前项目。2026-07-14 微信开发者工具已上传并覆盖当前体验版，但成功页未显示版本标签；正式截图和提交审核前，须由管理员在“管理 → 版本管理”中人工核对版本号与上传时间。

当前项目的正确首页路径是：

```text
pages/onboarding/index
```

更换体验版只能在管理员明确授权并亲自或监督时操作。管理员应核对目标版本和首页路径后再决定是否“选为体验版”；任何代理不得借此点击“提交审核”或发布。登录并完成家庭绑定后，代码会按状态进入 `pages/tonight/index`。

### 15.2 微信开发者工具可能残留不存在的 TDesign 文件缓存

上传时曾出现不存在的文件错误：

```text
miniprogram/miniprogram_npm/tdesign-miniprogram/action-sheet/action-sheet.js
```

仓库实际没有依赖这套 TDesign 文件，错误来自微信开发者工具的项目文件列表缓存。工具里的“清除项目文件列表缓存”当时没有真正清掉磁盘文件。最终处理方式是：完全退出微信开发者工具，先备份再移走对应项目的 `WeappCache/dirCache/.../fileCache.cfg`，重新打开项目让工具重建缓存。

不要为了这个错误把 TDesign 安装回来，也不要在项目中伪造缺失文件。操作缓存前先备份，且缓存目录哈希可能随机器或项目变化，不能照抄固定哈希路径。

### 15.3 `sitemap.json` 的 `rules` 不能是空数组

上传曾因以下错误失败：

```text
Invalid SiteMap, sitemap错误，缺少rules字段
```

即使存在 `"rules": []`，平台仍认为无有效规则。当前已经改为：

```json
{
  "rules": [
    {
      "action": "allow",
      "page": "*"
    }
  ]
}
```

`tests/project-structure.test.ts` 已增加契约测试，后续不要再改回空数组。

### 15.4 开发版和体验/正式版的 API 地址不同

环境映射已经固定：

```text
develop -> http://127.0.0.1:8080
trial   -> https://www.osheeep.com
release -> https://www.osheeep.com
```

开发者工具使用本地后端时可临时关闭合法域名校验，但这不能替代微信公众平台的 `request` 合法域名配置。不要让体验版或正式版请求 `127.0.0.1`。

### 15.5 不要恢复旧 Node 后端或改错 Nginx

`/api/**` 的唯一正式后端是 `osheeep-server` 的 Spring Boot `8080`。旧 `my-backend` 已明确废弃并从 PM2 删除，不需要保留，也不要重新启动端口 `3000`。

`osheeep-api` 在 `3100` 上运行，是服务器上的另一项既有服务，本次没有修改它。改 Nginx 前必须备份配置，执行 `nginx -t` 通过后才能 reload。

### 15.6 公网 API 返回 401 不代表后端故障

业务接口需要 Bearer Token。未登录访问：

```text
https://www.osheeep.com/api/dinner/recipes
```

返回 Spring Security 的 `401 UNAUTHORIZED` 是预期行为，也能证明请求已经到达 Java 后端。判断服务健康应使用服务器本机的 `/actuator/health`，不要把未授权 401 当成 502 或宕机。

### 15.7 服务器目录和部署方式已经定型

用户明确拒绝每次部署一个独立版本目录，也不希望维护复杂部署脚本。正式服务器只保留固定路径：

```text
/opt/osheeep-server/osheeep-server.jar
```

只有管理员明确授权并亲自或监督生产部署时，才可先把旧 JAR 复制为带时间戳的备份，再替换固定 JAR 并执行：

```bash
systemctl restart osheeep-server
```

不要擅自改成多层 `releases/current`、容器编排或复杂脚本方案。完整命令以 `osheeep-server/deploy/production/OPERATIONS.md` 为准。

### 15.8 微信公众平台操作可能无法自动化

本次自动化访问 `mp.weixin.qq.com` 被平台安全策略拒绝，旧阶段的合法域名和体验版设置最终由管理员手工完成。不要绕过平台限制。隐私保护指引、隐私接口声明、服务类目、主体、开发者、体验成员、扫码、二次验证、名称申请、体验版设置、提交审核和发布全部属于管理员人工动作；只有管理员明确授权并亲自或监督时才可进行，任何代理不得自动操作。

### 15.9 正式名称和代码内名称需要分别核对

代码内已经显示“小家开饭”，管理员也已确认微信公众平台正式名称为“小家开饭”。仍不要把本地代码修改等同于平台操作；以后再次改名时，必须分别核对代码、平台设置和微信客户端实际展示。

### 15.10 不要泄露或提交密钥

生产环境变量位于服务器 `/opt/osheeep-server/osheeep-server.env`，文件权限已限制。仓库中只能保留变量名和示例，不得写入真实数据库密码、JWT Secret、微信 AppSecret 或 SSH 凭据。新的对话即使能从历史聊天中看到凭据，也不能把它们复制到 `HANDOFF.md`、Git 提交或最终回复中。

## 16. 隐私与注销开发状态（2026-07-13）

- 隐私与注销本地代码已完成：登录同意默认未勾选、两份登录前原生法律页、隐私中心、自助注销、微信身份复核、旧 JWT 失效、剩余成员历史保留与最后成员家庭数据清理均已实现。
- 请求层只有收到语义错误码 `UNAUTHORIZED` 才全局清除 session；注销复核返回 `WECHAT_LOGIN_FAILED` 时保留登录态并允许重新获取 fresh code 重试。
- 注销 cleanup 与刷新邀请码统一使用 membership→household 锁序；加入家庭会在 household 锁后以 locking current read 复核同一邀请码，已撤销的邀请码不能被并发消费。
- 注销确认采用用户批准的勾选加两个顺序原生确认框；只有两个确认均通过才会请求注销。
- Task 3 的真实测试库 IT 具有命令双重保护和 Spring pre-connect 安全门，并已证明真实 cleanup 写入后发生异常时，身份、用户与家庭业务数据全部回滚。
- 验证结果为：后端 102 项测试、前端 19 个套件/92 项测试、TypeScript、ESLint 和项目标准 `npm run format:check` 通过；Task 8 两份文档 scoped Prettier 检查通过。简报广域 WXML/WXSS Prettier 命令因 Prettier 3.9.4 无 WXML parser 退出 2，不能声称 Prettier 全量通过。
- 生产后端和体验版已于 2026-07-14 更新；管理员于 2026-07-15 确认双账号核心流程、完整注销生命周期、iPhone、Android 和弱网回归均无问题。
- 2026-07-15 后端再次部署安全日志修复：正式 JAR SHA-256 为 `fe22784704ee3817b867062aa426599dbd84db55cb0198749f9d386d26da8739`，部署前 JAR 备份为 `/opt/osheeep-server/backup/osheeep-server-20260715-093649.jar`。服务为 `active`，健康检查为 `UP`，网站返回 `200`，未登录受保护接口返回预期 `401`。新启动日志未再输出默认安全密码，微信 code、openid、JWT、邀请码、密钥、`ERROR` 和 `Exception` 扫描结果均为 0。
- 同日已完成历史 JAR 的哈希、ZIP 完整性和复制式回滚干跑，未替换正在运行的正式 JAR。管理员明确授权后已创建权限为 `600 root:root` 的压缩数据库备份；恢复到一次性临时库后，17 张表、43 行数据和 4 条 Flyway 记录逐项一致，临时数据库残留为 0。备份位于 `/opt/osheeep-server/backup/db/osheeep-20260715-094455.sql.gz`，SHA-256 为 `fd5eb7b313ad9d09bfc8caa2ebd7f825d95efdea24fdc3d93331d9193ec46410`。Nginx 限流和公网健康检查随后已部署，登录/通用 API 均验证返回 429。管理员随后暂停腾讯云 CAT 任务并停用对应告警策略；生产轻量实例 CPU/内存/磁盘告警及触发/恢复邮件模板继续启用。平台没有测试发送入口，管理员接受首次真实主机告警再核对收件；不得停服造告警。
- **运营主体“刘彦龙”已由管理员确认与微信公众平台实名认证姓名逐字一致；隐私联系邮箱为 `15203700590@163.com`；两份法律页已于 2026-07-14 完成逐字复核。**
- 隐私保护指引和最小化信息类型声明已由管理员提交并重新打开复核，平台显示“已更新”；本地法律文案已按平台最终内容对齐，无需再次修改或提交。服务类目、主体、开发者和测试成员配置已确认，设备/弱网回归与生产运维已完成；外部探测恢复决策、首次真实主机告警收件核对、最终提审和发布仍是管理员人工动作。
- 只有 `docs/review-submission-checklist.md` 全部 22 项完成、主体姓名已替换并逐字核验、平台/设备/运维项全部完成后，才由管理员决定并亲自或监督提交审核和发布；任何代理不得自动提审或发布。
