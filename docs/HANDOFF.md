# “今晚吃什么”微信小程序交接文档

更新日期：2026-07-14

> 这份文档是写给一个完全没有聊天上下文的新对话的。接手后先读本节和“踩坑记录”，再查看代码或继续开发。不要依赖上一段会话中的口头信息。

## 0. 新对话接手摘要

### 0.1 我们在做什么

项目目标是把原有需求实现成一个名为“今晚吃什么”的微信小程序：两个人加入同一个“小家”，各自选择今晚想吃的菜，系统合并双方选择，双方可以确认、修改、完成晚餐菜单，并在历史记录中回看做过的菜。

前端是独立仓库 `osheeep-wx`，后端继续使用已有的 Java 仓库 `osheeep-server`。用户已经明确决定不再使用旧 Node 后端，并要求两个仓库直接在 `main` 分支开发。服务器采用固定正式 JAR、systemd 和浅层目录，不使用每次部署一个 release 目录的方案。

本轮工作的直接目标原本是：完成 MVP、部署 Java 后端、接入 `www.osheeep.com`、生成微信体验版并验证可用。这个目标已经达成。当前应进入“正式提审准备”，不是重新开发第一版，也不是立刻点击“提交审核”。

### 0.2 已经完成了什么

- MVP 核心流程已经开发：微信登录、创建/加入双人家庭、选菜、合并、确认、修改后撤销确认、重新确认、幂等完成、做饭记录和详情快照。
- 小程序采用微信原生 TypeScript、WXML、WXSS；没有使用 Taro、uni-app、React 或 TDesign 运行时依赖。
- 后端采用 `osheeep-server` 的 Java 21、Spring Boot 3.5.16、MySQL、Flyway、Redis、RabbitMQ、JWT。
- 生产后端已经部署到 `82.156.49.122`，由 `osheeep-server.service` 管理，监听 `8080`。
- Nginx 已把 `https://www.osheeep.com/api/**` 转发到 Spring Boot `8080`。
- 旧 PM2 服务 `my-backend` 已删除，端口 `3000` 已释放；端口 `3100` 的 `osheeep-api` 是另一项既有服务，必须保留。
- 小程序代码内名称、导航栏标题和开发者工具项目名已改为“今晚吃什么”。
- 2026-07-13 的旧阶段中，微信体验代码 `0.1.0` 已上传并设为体验版，`request` 合法域名已配置为 `https://www.osheeep.com`；该历史体验版不包含本轮尚未部署的隐私与注销更新。
- 本地代码已经实现：登录前两份原生法律页、默认未勾选的显式同意、隐私中心、自助注销、当前微信身份复核、旧 JWT 立即失效、剩余成员共享历史保留与最后成员注销后家庭数据清理。
- 注销确认采用用户批准的“勾选后依次显示两个原生确认框”；只有两个确认均通过才会请求注销。
- Task 3 已有专用测试库双重命令保护、Spring pre-connect 安全门，以及真实 cleanup 写入后发生异常时完整回滚的集成证据。
- 最新完整验证为：前端 19 个测试套件、92 项测试通过，TypeScript、ESLint、项目标准 `npm run format:check` 通过；后端 100 项测试通过、0 failure、0 error。Task 8 两份文档的 scoped Prettier 检查通过，但简报的广域 WXML/WXSS 命令因 Prettier 3.9.4 未配置 WXML parser 而退出 2，不能表述为 Prettier 全量通过。
- 两个仓库均在 `main` 且工作区干净，但本地提交尚未 push；前端 `main` 为本文件所在提交并领先 `origin/main` 11 个提交，后端为 `80b7a21` 并领先 7 个提交。

### 0.3 当前卡在哪里

本地实现没有已知业务测试失败，但生产后端和微信体验版尚未更新到隐私与注销代码。正式上架仍有以下人工阻塞：

1. **硬阻塞：代码中的运营主体仍为字面 `个人主体姓名`。管理员必须用微信公众平台实名认证的个人主体真实姓名替换，并在《用户协议》《隐私政策》和平台中逐字核验。**隐私联系邮箱必须保持为 `15203700590@163.com`。
2. 两份原生法律页已经实现；管理员仍须人工核对法律文案与真实功能，并在微信公众平台人工完成《用户隐私保护指引》和最小化隐私接口声明。
3. 管理员须人工确认正式名称、服务类目、主体、开发者、体验成员和审核材料。
4. 管理员须明确授权并亲自或监督完成新后端部署、新体验代码上传，以及两个真实账号在至少一台 iPhone、一台 Android 和弱网下的完整回归。
5. 管理员须人工确认数据库备份恢复、日志脱敏、限流、告警、故障联系人、JAR 备份和回滚流程。

在 `docs/review-submission-checklist.md` 全部 22 项完成、主体姓名已经替换并逐字核验、平台/设备/运维项全部完成之前，禁止提交审核或发布。满足这些条件后，也只能由管理员决定并亲自或监督提交；任何代理不得自动提审或发布。

### 0.4 下一步计划

建议新对话按以下顺序继续：

1. 先检查两个仓库工作区、最新提交和远端同步状态，不要覆盖用户可能新增的修改。
2. 由管理员提供微信实名认证的个人主体真实姓名；替换代码中的 `个人主体姓名` 后，由管理员对两份法律页和平台内容逐字核验，同时确认隐私邮箱仍为 `15203700590@163.com`。
3. 只有在管理员明确授权并亲自或监督时，才可登录微信公众平台核对正式名称、隐私保护指引、最小化隐私接口声明、服务类目、开发者和体验成员；代理不得自行操作平台。
4. 只有在管理员明确授权并亲自或监督时，才可部署新后端和上传新体验代码；不得把本地完成误写成生产或体验版已更新。
5. 由管理员使用两个真实微信账号，在 iPhone、Android 和弱网下走完整闭环并记录结果。
6. 由管理员完成生产运维检查：systemd、健康检查、Nginx、日志、数据库备份恢复、限流、告警和回滚流程。
7. 只有 `docs/review-submission-checklist.md` 全部 22 项完成且主体姓名逐字核验后，才由管理员决定是否提交审核；任何代理不得自动提审或发布。
8. 正式版准备完成后，再进入自定义菜谱、图片上传、家庭成员管理、订阅提醒、监控和 CI/CD 等第二阶段功能。

### 0.5 新对话开始时先执行

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

本次“今晚吃什么”第一版核心闭环已经开发、联调和验收完成，生产后端已经部署，微信体验代码 `0.1.0` 已于 2026-07-13 上传成功。这里的“开发完成”指当前约定的 MVP 功能完成，不代表已经通过微信正式版审核。

2026-07-13 旧阶段的体验版发布状态（仅作历史记录，不代表当前本地隐私与注销代码已经部署）：

- 已完成：生产 JAR、systemd、日志、Nginx、HTTPS 公网 API、旧 Node 下线、体验代码上传。
- 已完成：`https://www.osheeep.com` 的 `request` 合法域名配置，开发版本 `0.1.0` 已设为体验版。
- 已完成：用户于 2026-07-13 通过体验版验证首页路径和核心功能可用。
- 新版本正式提审前，须由管理员在至少一台 iPhone 和一台 Android 上补充兼容性回归。
- 代码内产品名和开发者工具项目名已统一为“今晚吃什么”；微信公众平台显示的小程序正式名称仍需在平台按名称规则单独确认或申请。

2026-07-14 当前本地代码状态：

- 登录前可访问《用户协议》和《隐私政策》两份原生页面，登录同意项默认未勾选。
- “我的”页面已提供隐私中心与自助注销入口；注销会重新获取微信临时凭证并由后端比对当前 `openid`。
- 注销使用勾选加两个顺序原生确认框；成功后清除本地会话，失败时保留可重试状态。
- 后端在事务内删除微信身份、去标识化用户并清理家庭数据；剩余成员存在时保留共享历史并撤销注销者的邀请码，最后成员注销时删除家庭关联业务数据。
- JWT 鉴权会查询用户 ACTIVE 状态，因此注销前签发的旧令牌立即失效。
- 上述更新尚未部署到生产后端或上传为新体验版，不能用旧体验版验收记录替代新版本回归。

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

| 项目       | 仓库                                                              | 本地目录                                                             | 分支   | 当前本地状态                               |
| ---------- | ----------------------------------------------------------------- | -------------------------------------------------------------------- | ------ | ------------------------------------------ |
| 微信小程序 | [osheeep-wx](https://github.com/long252829287/osheeep-wx)         | `/Users/longlonglong/Developer/Personal/Apps/osheeep/osheeep-wx`     | `main` | 本文件所在 HEAD，工作区 clean，领先远端 11 |
| 后端服务   | [osheeep-server](https://github.com/long252829287/osheeep-server) | `/Users/longlonglong/Developer/Personal/Apps/osheeep/osheeep-server` | `main` | `80b7a21`，工作区 clean，领先远端 7        |

以上状态基于 2026-07-14 的只读命令复核。两个仓库的本地 `main` 都尚未 push，不能写成与 `origin/main` 同步；继续工作前仍应重新执行 `git status --short` 和 `git rev-list --left-right --count origin/main...main`。

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
│   ├── pages/              # 登录、家庭、今晚菜单、菜谱、记录、我的
│   ├── services/           # 登录、家庭、菜单、菜谱、记录 API
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
    ├── menu/               # 选择、合并、确认、完成
    ├── recipe/             # 系统示例菜
    └── record/             # 做饭记录及菜品快照
```

数据库迁移：

- `V2__add_wechat_identity.sql`：微信身份。
- `V3__add_dinner_households.sql`：家庭和成员。
- `V4__add_dinner_menus_and_records.sql`：菜谱、菜单、选择、幂等动作和做饭记录。

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

Flyway 会在启动时自动执行尚未应用的迁移。不要手工修改已经执行过的迁移文件；后续数据库变化应新增 `V5`、`V6` 等迁移。

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

2026-07-14 最新完整结果：19 个测试套件、92 项测试全部通过，TypeScript 和 ESLint 退出 0。格式验证必须精确描述：

- 项目标准 `npm run format:check` 退出 0。
- `npx prettier --check docs/review-submission-checklist.md docs/HANDOFF.md` 退出 0。
- 简报广域命令 `npx prettier --check "docs/**/*.md" "miniprogram/**/*.{wxml,wxss,json}"` 退出 2；Prettier 3.9.4 没有配置 WXML parser，并同时提示任务前已有的旧文档/WXSS 格式问题。不得将此结果冒领为 Prettier 全量通过，也不得为追求该命令变绿而修改无关旧文件或依赖。

后端：

```bash
cd /Users/longlonglong/Developer/Personal/Apps/osheeep/osheeep-server
export JAVA_HOME=$(/usr/libexec/java_home -v 21)
export PATH="$JAVA_HOME/bin:$PATH"
mvn test
```

2026-07-14 最新完整结果：100 项测试全部通过，0 failure、0 error、0 skipped。

## 8. 主要 API

| 方法   | 路径                                         | 用途                             |
| ------ | -------------------------------------------- | -------------------------------- |
| `POST` | `/api/auth/wechat`                           | 使用 `wx.login` 返回的 code 登录 |
| `GET`  | `/api/dinner/household`                      | 获取当前家庭                     |
| `POST` | `/api/dinner/households`                     | 创建家庭                         |
| `POST` | `/api/dinner/households/invite-code/refresh` | 生成或刷新邀请码                 |
| `POST` | `/api/dinner/households/join`                | 加入家庭                         |
| `GET`  | `/api/dinner/recipes`                        | 获取 8 道系统示例菜              |
| `GET`  | `/api/dinner/menus/today`                    | 获取今日合并菜单                 |
| `PUT`  | `/api/dinner/menus/today/selections`         | 保存当前用户的完整选择集合       |
| `POST` | `/api/dinner/menus/today/confirm`            | 确认菜单                         |
| `POST` | `/api/dinner/menus/today/complete`           | 完成菜单并生成记录               |
| `GET`  | `/api/dinner/records`                        | 获取做饭记录列表                 |
| `GET`  | `/api/dinner/records/{id}`                   | 获取记录详情                     |
| `POST` | `/api/users/me/deletion`                     | 微信身份复核后自助注销账号       |

除微信登录外，业务接口均通过 `Authorization: Bearer <token>` 访问。

## 9. 当前版本边界

当前版本有意保持为可验收的 MVP，尚未包含：

- 自定义菜谱新增、编辑、删除和图片上传。
- 菜谱搜索、分类筛选和分页。
- WebSocket 实时同步；当前使用 8 秒轮询。
- 订阅消息或晚餐提醒。
- 家庭成员退出、解散、踢出和管理员能力。
- CI/CD、生产告警、业务指标和崩溃上报。

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

## 11. 微信体验版后台人工操作

旧阶段体验代码 `0.1.0` 已由管理员上传并设为体验版，但不包含当前本地隐私与注销更新。以下步骤全部属于管理员人工动作；只有在管理员明确授权并亲自或监督时才可执行，任何代理不得自行登录或操作微信公众平台：

1. 由管理员登录 <https://mp.weixin.qq.com/> 并选择当前小程序。
2. 由管理员核对“开发管理 → 开发设置 → 服务器域名”中的 `request` 合法域名为 `https://www.osheeep.com`；不要填写 `/api` 路径。
3. 新体验代码上传后，由管理员核对版本和首页 `pages/onboarding/index`，并亲自决定是否设为体验版。
4. 由管理员确认体验成员，并组织两个真实微信账号分别扫码进入体验版。
5. 由管理员在 iPhone、Android 和弱网条件下验证登录、创建/加入小家、分别选菜、合并、确认、修改后重确认、完成、记录回看、隐私中心和完整注销语义。

如果正式名称尚不是“今晚吃什么”，只能由管理员在小程序设置中按平台规则申请改名；代码内名称已经完成修改，但不能替代平台名称确认。

## 12. 正式上架前清单

以下事项必须由管理员人工完成并在 `docs/review-submission-checklist.md` 留存结果：

1. 用微信实名认证的个人主体真实姓名替换代码中的 `个人主体姓名`，并由管理员在两份法律页和平台中逐字核验；隐私联系邮箱保持 `15203700590@163.com`。
2. 核对两份已实现的原生法律页与真实功能，并由管理员在微信公众平台完成《用户隐私保护指引》和最小化隐私接口声明。
3. 由管理员确认正式名称、生产 API 域名、AppID、服务类目、主体、开发者和体验成员配置；不得在文档或输出中暴露 AppSecret。
4. 由管理员检查敏感权限。当前版本不获取手机号、头像昵称、相册或定位，只声明真实使用的微信登录与用户主动剪贴板读取。
5. 由管理员在至少一台 iPhone 和一台 Android 真机上完成双账号、注销生命周期和弱网回归。
6. 由管理员验证生产环境数据库备份恢复、日志脱敏、限流、告警、故障联系人、JAR 备份和回滚。
7. 只有清单全部 22 项完成、主体姓名逐字核验、平台/设备/运维项全部完成后，才由管理员决定并亲自或监督提交审核和发布；任何代理不得自动提审或发布。

## 13. 建议的下一阶段

推荐按以下顺序继续：

1. 由管理员补充 iPhone、Android 兼容性回归和弱网测试。
2. 由管理员核对已实现的用户协议和隐私政策，并完成人工平台隐私指引、类目、成员和审核材料。
3. 自定义菜谱和图片上传。
4. 家庭成员管理、提醒和订阅消息。
5. CI、监控、日志和数据备份。

## 14. 相关文档

- [产品与界面规格](superpowers/specs/2026-07-11-osheeep-wx-design.md)
- [今晚菜单核心规格](superpowers/specs/2026-07-11-tonight-menu-core-design.md)
- [今晚菜单实施计划](superpowers/plans/2026-07-11-tonight-menu-core.md)
- [体验版部署规格](superpowers/specs/2026-07-13-experience-release-deployment-design.md)
- [体验版部署实施计划](superpowers/plans/2026-07-13-experience-release-deployment.md)
- [后端生产运维手册](https://github.com/long252829287/osheeep-server/blob/main/deploy/production/OPERATIONS.md)
- [最终设计验收](../design-qa.md)
- [最终四道菜截图](design/qa/record-detail-four-dishes-implemented.jpeg)

## 15. 踩坑记录：不要再踩

### 15.1 不要把旧体验版当成当前版本

微信公众平台曾同时显示旧版本 `1.0.1.1` 和当前版本 `0.1.0`。旧体验版名称为“幻昼测试体验版”，首页路径是 `pages/index/main`，这不属于当前项目。

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

### 15.9 正式名称和代码内名称是两件事

代码内已经显示“今晚吃什么”，但微信客户端最终展示的正式小程序名称由微信公众平台账号设置决定。不要因为开发者工具标题已经改变，就断言平台名称也已完成修改。

### 15.10 不要泄露或提交密钥

生产环境变量位于服务器 `/opt/osheeep-server/osheeep-server.env`，文件权限已限制。仓库中只能保留变量名和示例，不得写入真实数据库密码、JWT Secret、微信 AppSecret 或 SSH 凭据。新的对话即使能从历史聊天中看到凭据，也不能把它们复制到 `HANDOFF.md`、Git 提交或最终回复中。

## 16. 隐私与注销开发状态（2026-07-13）

- 隐私与注销本地代码已完成：登录同意默认未勾选、两份登录前原生法律页、隐私中心、自助注销、微信身份复核、旧 JWT 失效、剩余成员历史保留与最后成员家庭数据清理均已实现。
- 请求层只有收到语义错误码 `UNAUTHORIZED` 才全局清除 session；注销复核返回 `WECHAT_LOGIN_FAILED` 时保留登录态并允许重新获取 fresh code 重试。
- 注销 cleanup 与刷新邀请码统一使用 membership→household 锁序；加入家庭会在 household 锁后以 locking current read 复核同一邀请码，已撤销的邀请码不能被并发消费。
- 注销确认采用用户批准的勾选加两个顺序原生确认框；只有两个确认均通过才会请求注销。
- Task 3 的真实测试库 IT 具有命令双重保护和 Spring pre-connect 安全门，并已证明真实 cleanup 写入后发生异常时，身份、用户与家庭业务数据全部回滚。
- 验证结果为：后端 100 项测试、前端 19 个套件/92 项测试、TypeScript、ESLint 和项目标准 `npm run format:check` 通过；Task 8 两份文档 scoped Prettier 检查通过。简报广域 WXML/WXSS Prettier 命令因 Prettier 3.9.4 无 WXML parser 退出 2，不能声称 Prettier 全量通过。
- 代码已完成但生产后端和体验版尚未更新；当前线上体验版仍以本文件前文记录的状态为准。
- **运营主体目前仍显示字面 `个人主体姓名`。管理员必须用微信公众平台实名认证的个人主体真实姓名替换并逐字核验；隐私联系邮箱为 `15203700590@163.com`。**
- 隐私保护指引、最小化隐私接口声明、服务类目、体验成员、设备/弱网回归、生产运维、最终提审和发布全部是管理员人工动作。
- 只有 `docs/review-submission-checklist.md` 全部 22 项完成、主体姓名已替换并逐字核验、平台/设备/运维项全部完成后，才由管理员决定并亲自或监督提交审核和发布；任何代理不得自动提审或发布。
