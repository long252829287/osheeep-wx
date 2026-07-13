# “今晚吃什么”微信小程序交接文档

更新日期：2026-07-13

## 1. 当前交付状态

本次“今晚吃什么”第一版核心闭环已经开发、联调和验收完成，生产后端已经部署，微信体验代码 `0.1.0` 已于 2026-07-13 上传成功。这里的“开发完成”指当前约定的 MVP 功能完成，不代表已经通过微信正式版审核。

体验版发布状态：

- 已完成：生产 JAR、systemd、日志、Nginx、HTTPS 公网 API、旧 Node 下线、体验代码上传。
- 已完成：`https://www.osheeep.com` 的 `request` 合法域名配置，开发版本 `0.1.0` 已设为体验版。
- 已完成：用户于 2026-07-13 通过体验版验证首页路径和核心功能可用。
- 建议正式提审前再补充至少一台 iPhone 和一台 Android 的兼容性回归。
- 代码内产品名和开发者工具项目名已统一为“今晚吃什么”；微信公众平台显示的小程序正式名称仍需在平台按名称规则单独确认或申请。

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

| 项目       | 仓库                                                              | 本地目录                                                             | 分支   | 交付提交  |
| ---------- | ----------------------------------------------------------------- | -------------------------------------------------------------------- | ------ | --------- |
| 微信小程序 | [osheeep-wx](https://github.com/long252829287/osheeep-wx)         | `/Users/longlonglong/Developer/Personal/Apps/osheeep/osheeep-wx`     | `main` | 以 `origin/main` 最新提交为准 |
| 后端服务   | [osheeep-server](https://github.com/long252829287/osheeep-server) | `/Users/longlonglong/Developer/Personal/Apps/osheeep/osheeep-server` | `main` | `6307058` |

两个仓库的 `main` 已推送并与 `origin/main` 同步。

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

交付时结果：12 个测试套件、44 项测试全部通过，类型、Lint 和格式检查通过。

后端：

```bash
cd /Users/longlonglong/Developer/Personal/Apps/osheeep/osheeep-server
export JAVA_HOME=$(/usr/libexec/java_home -v 21)
export PATH="$JAVA_HOME/bin:$PATH"
mvn test
```

交付时结果：77 项测试全部通过，0 failure、0 error。

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

最常用命令：

```bash
systemctl status osheeep-server --no-pager
systemctl restart osheeep-server
journalctl -u osheeep-server -n 200 --no-pager
tail -f /opt/osheeep-server/logs/application.log
curl --fail --silent http://127.0.0.1:8080/actuator/health
nginx -t
systemctl reload nginx
```

部署新 JAR 前必须先把当前 JAR 复制到 `backup/osheeep-server-YYYYMMDD-HHmmss.jar`，再替换固定文件并执行 `systemctl restart osheeep-server`。完整的打包、上传、替换、验证、日志、回滚和故障排查命令见后端仓库的 `deploy/production/OPERATIONS.md`。

## 11. 微信体验版后台操作

体验代码已上传，版本号为 `0.1.0`，并已由管理员设为体验版。后续重新上传版本时可参考以下步骤：

1. 登录 <https://mp.weixin.qq.com/>，选择当前小程序。
2. 进入“开发管理 → 开发设置 → 服务器域名”，在 `request` 合法域名中加入 `https://www.osheeep.com`；不要填写 `/api` 路径。
3. 进入“管理 → 版本管理 → 开发版本”，找到 `0.1.0`，点击“选为体验版”。
4. 确认体验成员；让两个微信账号分别扫码进入体验版。
5. 真机验证登录、创建/加入小家、分别选菜、合并、确认、修改后重确认、完成和记录回看。

如果正式名称尚不是“今晚吃什么”，到小程序设置中按平台规则申请改名；代码内名称已经完成修改。

## 12. 正式上架前清单

以下事项不属于本次代码闭环，但正式提交微信审核前必须完成：

1. 确认生产 API 域名已加入微信公众平台“小程序 → 开发管理 → 开发设置 → 服务器域名 → request 合法域名”。
2. 在微信公众平台确认 AppID、AppSecret、服务类目、开发者和体验成员配置。
3. 补齐可实际访问的用户协议、隐私保护指引和隐私接口声明；当前页面只展示说明文字。
4. 检查敏感权限。当前版本不获取手机号、相册或定位，后续新增能力时应按最小权限原则申请。
5. 在至少一台 iPhone 和一台 Android 真机上完成双账号体验版回归。
6. 验证生产环境数据库备份、恢复、日志脱敏、限流和告警。
7. 当前 `0.1.0` 已上传；真机回归后提交审核并发布。

## 13. 建议的下一阶段

推荐按以下顺序继续：

1. 补充 iPhone、Android 兼容性回归和弱网测试。
2. 用户协议、隐私政策及审核材料。
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
