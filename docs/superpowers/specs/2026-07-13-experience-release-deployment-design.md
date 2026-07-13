# “今晚吃什么”体验版与后端部署设计

日期：2026-07-13

## 1. 目标

将微信小程序的产品名称统一为“今晚吃什么”，把已经重构完成的 `osheeep-server` 作为唯一正式后端部署到现有服务器，并通过 `https://www.osheeep.com/api/**` 为开发版、体验版和后续正式版提供接口。

本次交付终点是：后端公网可用、现有 Node 后端退出正式流量、小程序可在真机体验版完成微信登录和今晚菜单核心闭环。

## 2. 已确认的决策

- `osheeep-server` 是唯一正式后端，现有 Node 后端已经废弃。
- Nginx 的全部 `/api/**` 流量一次性切换到 Spring Boot，不采用长期路径拆分。
- `www.osheeep.com/` 继续提供现有静态网站。
- 旧 Node 进程在首次体验版观察期内暂时保持运行，但不再接收 Nginx 流量，只作为紧急回滚入口；确认稳定后再停止。
- 服务器只保留一个固定名称的正式 JAR，不使用多层 release 目录。
- 每次替换 JAR 前，把上一个正式 JAR 按日期时间备份。
- 不创建 `deploy.sh` 和 `rollback.sh`；日常服务管理直接使用 `systemctl`。
- 保留详细的 `OPERATIONS.md`，让后续维护者能够独立完成打包、上传、替换、重启、验证和回滚。

## 3. 整体架构

```text
微信小程序“今晚吃什么”
        │
        │ HTTPS
        ▼
https://www.osheeep.com/api/**
        │
        ▼
Nginx :443
        │
        ▼
osheeep-server :8080
        │
        ├── MySQL
        ├── Redis
        └── RabbitMQ
```

Nginx 路由：

- `/`：继续读取 `/var/www/my_project/frontend`。
- `/api/`：统一反向代理到 `http://127.0.0.1:8080`。
- `/actuator/health` 不对公网暴露，运维人员在服务器本机访问 `127.0.0.1:8080/actuator/health`。

## 4. 服务器目录

应用相关文件集中在一个浅层目录中：

```text
/opt/osheeep-server/
├── osheeep-server.jar
├── osheeep-server.env
├── OPERATIONS.md
├── backup/
│   └── osheeep-server-YYYYMMDD-HHmmss.jar
└── logs/
    ├── application.log
    └── application.YYYY-MM-DD.N.log.gz
```

系统文件保留在各自标准位置：

```text
/opt/java/jre-21/                              # Java 21 运行时
/etc/systemd/system/osheeep-server.service    # systemd 服务
/etc/nginx/conf.d/osheeep.com.conf            # Nginx 配置
/opt/deploy-backups/                           # Nginx 配置备份
```

### 4.1 文件用途

- `osheeep-server.jar`：当前唯一正式后端程序。systemd 始终启动这个固定路径。
- `osheeep-server.env`：生产环境变量，包括数据库、Redis、RabbitMQ、JWT 和微信 AppSecret。权限为 `640`，归属 `root:osheeep`，不进入 Git。
- `OPERATIONS.md`：完整运维手册，包括打包、上传、替换、重启、健康检查、日志和回滚。
- `backup/`：保存替换前的历史 JAR，文件名包含备份时间。默认保留最近 10 个版本。
- `logs/`：应用业务日志和滚动压缩文件。
- `osheeep-server.service`：定义运行账号、启动命令、自动重启、内存限制和环境变量文件。

## 5. 服务账号与权限

- 创建不可登录的系统账号 `osheeep`。
- JAR 归属 `osheeep:osheeep`，权限 `644`。
- `logs/` 归属 `osheeep:osheeep`，权限 `750`。
- `backup/` 归属 `root:osheeep`，权限 `750`。
- 环境变量文件归属 `root:osheeep`，权限 `640`。
- Spring Boot 不使用 root 运行。
- 部署和替换 JAR 由 root 执行，运行过程由 `osheeep` 账号执行。

## 6. Java 与 systemd

服务器没有预装 Java。本次在 `/opt/java/jre-21` 安装 x86_64 Java 21 JRE，不修改系统其他应用的 Java 配置。

systemd 服务固定使用：

```text
/opt/java/jre-21/bin/java
```

JVM 初始参数：

```text
-Xms64m -Xmx256m -XX:MaxMetaspaceSize=128m
```

服务行为：

- 开机自动启动。
- 异常退出后自动重启。
- 正常停止使用 Spring Boot 优雅关闭。
- 工作目录为 `/opt/osheeep-server`。
- 环境变量读取 `/opt/osheeep-server/osheeep-server.env`。
- 启动固定 JAR `/opt/osheeep-server/osheeep-server.jar`。

常用命令：

```bash
systemctl restart osheeep-server
systemctl stop osheeep-server
systemctl start osheeep-server
systemctl status osheeep-server
journalctl -u osheeep-server -f
```

## 7. 日志设计

Spring Boot 同时输出控制台日志和文件日志：

- 文件：`/opt/osheeep-server/logs/application.log`。
- 按日期和大小滚动。
- 单文件上限：20MB。
- 保留天数：14 天。
- 总容量上限：300MB。
- 历史日志使用 gzip 压缩。
- systemd 启动、退出和崩溃信息可通过 `journalctl -u osheeep-server` 查看。

日志不得输出以下内容：

- 数据库、Redis、RabbitMQ 密码。
- JWT 密钥或完整 JWT。
- 微信 AppSecret、登录 code、session key。
- 用户敏感信息。

## 8. 生产配置

后端新增独立 `prod` profile，不使用 `local` profile 启动正式服务。

`osheeep-server.env` 至少包含：

`SPRING_PROFILES_ACTIVE` 的固定值为 `prod`。其余必须配置的变量名称如下，真实值只写入服务器配置文件：

```text
OSHEEEP_DB_HOST
OSHEEEP_DB_PORT
OSHEEEP_DB_NAME
OSHEEEP_DB_USERNAME
OSHEEEP_DB_PASSWORD
OSHEEEP_REDIS_HOST
OSHEEEP_REDIS_PORT
OSHEEEP_REDIS_PASSWORD
OSHEEEP_RABBITMQ_HOST
OSHEEEP_RABBITMQ_PORT
OSHEEEP_RABBITMQ_USERNAME
OSHEEEP_RABBITMQ_PASSWORD
OSHEEEP_RABBITMQ_VHOST
OSHEEEP_JWT_SECRET
OSHEEEP_WECHAT_APP_ID
OSHEEEP_WECHAT_APP_SECRET
OSHEEEP_DINNER_INVITE_SECRET
```

真实值不写入规格、运维文档、日志或 Git。

## 9. 后端打包流程

在本地 `osheeep-server` 仓库执行：

```bash
cd /Users/longlonglong/Developer/Personal/Apps/osheeep/osheeep-server
export JAVA_HOME=$(/usr/libexec/java_home -v 21)
export PATH="$JAVA_HOME/bin:$PATH"

mvn test
mvn clean package -DskipTests
```

说明：

- 必须先执行 `mvn test`；测试失败不得部署。
- 第二条命令只负责生成部署包，不重复执行测试。
- 生成文件位于 `target/osheeep-server-0.0.1-SNAPSHOT.jar`。
- 上传时统一改名为 `/tmp/osheeep-server.jar.new`，避免覆盖正在运行的正式 JAR。

上传命令：

```bash
scp target/osheeep-server-0.0.1-SNAPSHOT.jar \
  root@82.156.49.122:/tmp/osheeep-server.jar.new
```

## 10. 新版本替换流程

登录服务器后执行：

```bash
cd /opt/osheeep-server

# 1. 备份当前正式版本
cp -a osheeep-server.jar \
  "backup/osheeep-server-$(date +%Y%m%d-%H%M%S).jar"

# 2. 准备新版本的权限
chown osheeep:osheeep /tmp/osheeep-server.jar.new
chmod 644 /tmp/osheeep-server.jar.new

# 3. 原子替换正式 JAR
mv /tmp/osheeep-server.jar.new osheeep-server.jar

# 4. 重启
systemctl restart osheeep-server

# 5. 查看状态
systemctl status osheeep-server --no-pager

# 6. 健康检查
curl --fail --silent http://127.0.0.1:8080/actuator/health
```

这里使用 `mv` 完成同一文件系统内的原子替换。`systemctl restart osheeep-server` 只负责重新启动当前固定路径的 JAR，不负责上传、备份或替换文件。

部署完成后清理旧备份，只保留最近 10 个：

```bash
cd /opt/osheeep-server/backup
ls -1t osheeep-server-*.jar | tail -n +11 | xargs -r rm -f
```

## 11. 回滚流程

如果重启失败或公网验证不通过：

```bash
cd /opt/osheeep-server

# 保存失败版本，便于排查
mv osheeep-server.jar \
  "backup/osheeep-server-failed-$(date +%Y%m%d-%H%M%S).jar"

# 查看备份并选择最近一个正常版本
ls -lt backup/osheeep-server-*.jar

# 恢复指定版本
cp -a backup/osheeep-server-YYYYMMDD-HHmmss.jar osheeep-server.jar
chown osheeep:osheeep osheeep-server.jar
chmod 644 osheeep-server.jar

systemctl restart osheeep-server
curl --fail --silent http://127.0.0.1:8080/actuator/health
```

如果问题来自 Nginx，则恢复 `/opt/deploy-backups/` 中的 Nginx 配置，执行 `nginx -t` 后平滑重载。

## 12. Nginx 切换

实施时先备份：

```bash
cp -a /etc/nginx/conf.d/osheeep.com.conf \
  "/opt/deploy-backups/osheeep.com.conf.$(date +%Y%m%d-%H%M%S)"
```

将现有 `/api/` 的 upstream 从 Node `127.0.0.1:3000` 改为 Spring Boot `127.0.0.1:8080`，保留 Host、真实 IP 和协议头。

切换前必须满足：

1. systemd 服务为 `active`。
2. 本机健康检查返回 `UP`。
3. 本机 `/api` 接口能够返回 Spring Boot 标准响应。
4. `nginx -t` 通过。

切换使用 `systemctl reload nginx`，不停止静态网站。

## 13. 小程序名称与环境配置

代码内统一名称：

- 产品名：“今晚吃什么”。
- 微信导航栏标题：“今晚吃什么”。
- 首屏品牌文案：“今晚吃什么”。
- 微信开发者工具项目名：“今晚吃什么”。

小程序 API 地址按微信运行环境自动选择：

- `develop`：`http://127.0.0.1:8080`。
- `trial`：`https://www.osheeep.com`。
- `release`：`https://www.osheeep.com`。

这样本地开发不需要反复改配置，上传的体验版也不会访问本机地址。

微信公众平台中的正式小程序名称由平台控制。实施时将尝试修改为“今晚吃什么”；如平台要求管理员扫码、名称审核或主体证明，由用户在最终确认步骤接管。

## 14. 体验版发布流程

1. 在微信公众平台把 `https://www.osheeep.com` 配置为 request 合法域名。
2. 确认域名备案和 TLS 证书有效。
3. 在微信开发者工具重新编译，确认体验环境 API 配置正确。
4. 使用当前真实 AppID 上传版本 `0.1.0`。
5. 上传备注写明“今晚菜单核心闭环体验版”。
6. 在微信公众平台把该开发版本选为体验版。
7. 使用两个微信账号真机验证登录、家庭、选菜、确认、完成和记录。

上传代码、设置合法域名或选为体验版若触发管理员扫码或平台二次验证，由用户完成该验证步骤，其余操作由实施者完成。

## 15. `OPERATIONS.md` 内容要求

服务器上的 `/opt/osheeep-server/OPERATIONS.md` 必须包含：

1. 架构和端口说明。
2. `/opt/osheeep-server` 各文件和目录用途。
3. 本地打包前置条件和完整 Maven 命令。
4. JAR 的生成位置和 SCP 上传命令。
5. 部署前检查清单。
6. 按日期备份旧 JAR 的命令。
7. 新 JAR 权限、原子替换和 systemd 重启命令。
8. 本机和公网健康检查方法。
9. 日志位置、实时查看、按时间筛选和错误检索命令。
10. systemd 常用命令。
11. Nginx 配置位置、检查和重载命令。
12. 手工回滚完整流程。
13. 备份保留和清理方法。
14. 环境变量更新流程及权限要求。
15. 常见故障：端口占用、数据库连接失败、微信登录失败、内存不足、Nginx 502。
16. 明确禁止事项：不得提交密钥、不得编辑已执行的 Flyway 迁移、不得直接删除唯一备份、不得跳过测试部署。

文档中的命令必须可直接复制，密码和密钥只能写变量名或占位符。

## 16. 验证与验收标准

后端：

- `mvn test` 全部通过。
- `mvn clean package -DskipTests` 成功生成 JAR。
- systemd 状态为 `active (running)`。
- 本机健康检查返回 `UP`。
- `https://www.osheeep.com/api/dinner/recipes` 不再返回旧 Node 的路径不存在响应；未登录时应返回 Spring Security 的认证响应。
- Flyway 成功迁移到 V4，已有数据不丢失。

小程序：

- 自动化测试、类型检查、Lint、格式检查全部通过。
- 代码内不再出现旧品牌“双人协商桌”。
- 开发版仍可访问本地后端。
- 体验版访问 `https://www.osheeep.com`。
- 真机能够完成微信登录及今晚菜单核心闭环。

运维：

- `OPERATIONS.md` 位于约定位置且命令与实际路径一致。
- 至少保留一个可回滚 JAR。
- 配置文件权限正确且未进入 Git。
- Nginx 原配置已有时间戳备份。

## 17. 实施顺序

1. 修改并验证后端生产配置和日志滚动策略。
2. 修改并验证小程序品牌与环境 API 选择。
3. 本地完整测试并打包后端 JAR。
4. 提交并推送前后端代码，确保部署包能够追溯到 Git 提交。
5. 准备服务器目录、Java 21、服务账号、环境变量、systemd 和运维文档。
6. 启动 Spring Boot，完成本机健康检查。
7. 备份并切换 Nginx 的全部 `/api/` 流量。
8. 完成公网 API 和微信登录验证。
9. 配置微信合法域名并上传 `0.1.0` 体验版。
10. 双账号真机回归；稳定后停止旧 Node 后端。
