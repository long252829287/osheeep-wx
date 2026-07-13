# “今晚吃什么”体验版部署 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将产品品牌统一为“今晚吃什么”，把 `osheeep-server` 作为 `www.osheeep.com/api/**` 的唯一后端部署，并上传可真机访问的微信体验版 `0.1.0`。

**Architecture:** 小程序按 `envVersion` 在本地 API 和 `https://www.osheeep.com` 之间选择；Nginx 保留静态网站并把全部 `/api/**` 反向代理到由 systemd 管理的 Spring Boot `8080`。服务器固定使用 `/opt/osheeep-server/osheeep-server.jar`，部署前把旧 JAR 按时间备份，旧 Node `my-backend` 在公网验证通过后从 PM2 删除。

**Tech Stack:** 微信原生小程序、TypeScript 5.9、Jest；Java 21、Spring Boot 3.5.16、Maven、MySQL、Redis、RabbitMQ、Flyway；OpenCloudOS 9.4、Nginx 1.26、systemd、PM2。

## Global Constraints

- 两个仓库直接使用 `main`，不创建 worktree。
- 产品名统一为“今晚吃什么”，不修改已归档的历史规格和设计图片。
- `develop` 使用 `http://127.0.0.1:8080`，`trial` 和 `release` 使用 `https://www.osheeep.com`。
- `/api/**` 全部切换到 Spring Boot，不保留 Node 路由。
- 旧 Node 只删除 PM2 中的 `my-backend`，不得修改端口 `3100` 的 `osheeep-api`。
- 服务器只有一个正式 JAR；替换前按 `YYYYMMDD-HHmmss` 备份，保留最近 10 个。
- 不创建部署或回滚脚本；运维命令写入 `OPERATIONS.md`。
- 真实密码和密钥不得出现在 Git、计划、日志或最终回复中。
- 修改 Nginx 前必须备份，重载前必须通过 `nginx -t`。
- 停止旧 Node 前必须完成 Spring Boot 本机健康检查和公网 API 验证。
- 微信平台出现管理员扫码、名称审核或二次验证时交给用户完成，验证前的准备由实施者完成。

---

### Task 1: 后端生产配置与运维资产

**Files:**

- Create: `../osheeep-server/src/main/resources/application-prod.yml`
- Create: `../osheeep-server/src/test/java/com/osheeep/server/ProductionDeploymentContractTest.java`
- Create: `../osheeep-server/deploy/production/osheeep-server.service`
- Create: `../osheeep-server/deploy/production/OPERATIONS.md`

**Interfaces:**

- Consumes: `application.yml` 中的端口、Actuator 和 Springdoc 配置；`.env.example` 中的环境变量名称。
- Produces: `prod` profile、滚动文件日志、可复制到服务器的 systemd 单元和运维说明。

- [x] **Step 1: 写失败的生产部署契约测试**

创建 `ProductionDeploymentContractTest.java`，读取四个部署文件并断言：

```java
package com.osheeep.server;

import static org.assertj.core.api.Assertions.assertThat;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import org.junit.jupiter.api.Test;

class ProductionDeploymentContractTest {
    private final Path root = Path.of("").toAbsolutePath();

    @Test
    void productionProfileWritesBoundedRollingLogs() throws IOException {
        String yaml = Files.readString(root.resolve("src/main/resources/application-prod.yml"));
        assertThat(yaml).contains("/opt/osheeep-server/logs/application.log");
        assertThat(yaml).contains("max-file-size: 20MB");
        assertThat(yaml).contains("max-history: 14");
        assertThat(yaml).contains("total-size-cap: 300MB");
    }

    @Test
    void systemdAlwaysRunsTheFixedJarAsOsheeep() throws IOException {
        String unit = Files.readString(root.resolve("deploy/production/osheeep-server.service"));
        assertThat(unit).contains("User=osheeep");
        assertThat(unit).contains("EnvironmentFile=/opt/osheeep-server/osheeep-server.env");
        assertThat(unit).contains("/opt/osheeep-server/osheeep-server.jar");
        assertThat(unit).contains("-Xms64m -Xmx256m -XX:MaxMetaspaceSize=128m");
    }

    @Test
    void operationsManualDocumentsManualDeployAndRollback() throws IOException {
        String manual = Files.readString(root.resolve("deploy/production/OPERATIONS.md"));
        assertThat(manual).contains("mvn clean package -DskipTests");
        assertThat(manual).contains("systemctl restart osheeep-server");
        assertThat(manual).contains("backup/osheeep-server-$(date +%Y%m%d-%H%M%S).jar");
        assertThat(manual).contains("curl --fail --silent http://127.0.0.1:8080/actuator/health");
        assertThat(manual).doesNotContain("OSHEEEP_WECHAT_APP_SECRET=");
        assertThat(manual).doesNotContain("OSHEEEP_DB_PASSWORD=");
    }
}
```

- [x] **Step 2: 运行测试并确认部署文件缺失**

Run:

```bash
cd ../osheeep-server
mvn -Dtest=ProductionDeploymentContractTest test
```

Expected: FAIL，提示 `application-prod.yml` 或 `deploy/production` 文件不存在。

- [x] **Step 3: 创建生产 Profile**

`application-prod.yml` 使用与 `local` 相同的外部基础设施变量，并添加优雅关闭、代理头和滚动日志：

```yaml
server:
  forward-headers-strategy: framework
  shutdown: graceful

spring:
  lifecycle:
    timeout-per-shutdown-phase: 20s
  datasource:
    url: jdbc:mysql://${OSHEEEP_DB_HOST}:${OSHEEEP_DB_PORT}/${OSHEEEP_DB_NAME}?useUnicode=true&characterEncoding=utf8&useSSL=false&serverTimezone=Asia/Shanghai
    username: ${OSHEEEP_DB_USERNAME}
    password: ${OSHEEEP_DB_PASSWORD}
  data:
    redis:
      host: ${OSHEEEP_REDIS_HOST}
      port: ${OSHEEEP_REDIS_PORT}
      password: ${OSHEEEP_REDIS_PASSWORD}
  rabbitmq:
    host: ${OSHEEEP_RABBITMQ_HOST}
    port: ${OSHEEEP_RABBITMQ_PORT}
    username: ${OSHEEEP_RABBITMQ_USERNAME}
    password: ${OSHEEEP_RABBITMQ_PASSWORD}
    virtual-host: ${OSHEEEP_RABBITMQ_VHOST}
  flyway:
    enabled: true
    locations: classpath:db/migration

osheeep:
  jwt:
    issuer: osheeep
    secret: ${OSHEEEP_JWT_SECRET}
    access-token-ttl-minutes: 120
  wechat:
    app-id: ${OSHEEEP_WECHAT_APP_ID}
    app-secret: ${OSHEEEP_WECHAT_APP_SECRET}
  dinner:
    invite-secret: ${OSHEEEP_DINNER_INVITE_SECRET:${OSHEEEP_JWT_SECRET}}

logging:
  file:
    name: /opt/osheeep-server/logs/application.log
  logback:
    rollingpolicy:
      file-name-pattern: /opt/osheeep-server/logs/application.%d{yyyy-MM-dd}.%i.log.gz
      max-file-size: 20MB
      max-history: 14
      total-size-cap: 300MB
      clean-history-on-start: true
```

- [x] **Step 4: 创建 systemd 单元模板**

`deploy/production/osheeep-server.service`：

```ini
[Unit]
Description=Osheeep Spring Boot Server
After=network-online.target mysql.service redis.service rabbitmq-server.service
Wants=network-online.target

[Service]
Type=simple
User=osheeep
Group=osheeep
WorkingDirectory=/opt/osheeep-server
EnvironmentFile=/opt/osheeep-server/osheeep-server.env
ExecStart=/opt/java/jre-21/bin/java -Xms64m -Xmx256m -XX:MaxMetaspaceSize=128m -jar /opt/osheeep-server/osheeep-server.jar
SuccessExitStatus=143
Restart=on-failure
RestartSec=5
TimeoutStopSec=30
NoNewPrivileges=true
PrivateTmp=true
UMask=0027

[Install]
WantedBy=multi-user.target
```

- [x] **Step 5: 创建完整运维手册**

`deploy/production/OPERATIONS.md` 必须逐条给出可复制命令：架构与端口、目录用途、Maven 测试和打包、SCP 上传、备份、原子替换、systemd、健康检查、日志查询、Nginx、环境变量权限、手工回滚、备份清理，以及端口占用、数据库失败、微信登录失败、内存不足和 Nginx 502 排查。

部署章节必须包含：

```bash
cd /opt/osheeep-server
cp -a osheeep-server.jar "backup/osheeep-server-$(date +%Y%m%d-%H%M%S).jar"
chown osheeep:osheeep /tmp/osheeep-server.jar.new
chmod 644 /tmp/osheeep-server.jar.new
mv /tmp/osheeep-server.jar.new osheeep-server.jar
systemctl restart osheeep-server
systemctl status osheeep-server --no-pager
curl --fail --silent http://127.0.0.1:8080/actuator/health
```

- [x] **Step 6: 运行后端契约测试和全量测试**

Run:

```bash
cd ../osheeep-server
mvn -Dtest=ProductionDeploymentContractTest test
mvn test
```

Expected: 契约测试 PASS；全量测试 0 failure、0 error。

- [x] **Step 7: 提交后端生产部署资产**

```bash
cd ../osheeep-server
git add src/main/resources/application-prod.yml src/test/java/com/osheeep/server/ProductionDeploymentContractTest.java deploy/production
git commit -m "ops: add production deployment assets"
```

### Task 2: 小程序品牌与运行环境

**Files:**

- Modify: `miniprogram/config/environment.ts`
- Modify: `miniprogram/app.ts`
- Modify: `miniprogram/pages/onboarding/index.json`
- Modify: `miniprogram/pages/onboarding/index.wxml`
- Modify: `miniprogram/pages/household-create/index.wxml`
- Modify: `project.config.json`
- Modify: `docs/HANDOFF.md`
- Create: `tests/environment.test.ts`
- Modify: `tests/project-structure.test.ts`

**Interfaces:**

- Consumes: `wx.getAccountInfoSync().miniProgram.envVersion`，值为 `develop | trial | release`。
- Produces: `resolveApiBaseUrl(envVersion)`、`createRuntimeConfig(envVersion)`；统一品牌“今晚吃什么”。

- [x] **Step 1: 写失败的环境和品牌测试**

`tests/environment.test.ts`：

```ts
import { resolveApiBaseUrl } from '../miniprogram/config/environment';

test.each([
  ['develop', 'http://127.0.0.1:8080'],
  ['trial', 'https://www.osheeep.com'],
  ['release', 'https://www.osheeep.com'],
] as const)('maps %s to %s', (envVersion, expected) => {
  expect(resolveApiBaseUrl(envVersion)).toBe(expected);
});
```

在 `project-structure.test.ts` 增加：

```ts
test('uses the approved product name in runtime surfaces', () => {
  const project = readFileSync(resolve(root, 'project.config.json'), 'utf8');
  const onboarding = readFileSync(
    resolve(root, 'miniprogram/pages/onboarding/index.wxml'),
    'utf8',
  );
  const household = readFileSync(
    resolve(root, 'miniprogram/pages/household-create/index.wxml'),
    'utf8',
  );
  expect(project).toContain('"projectname": "今晚吃什么"');
  expect(onboarding).toContain('今晚吃什么');
  expect(onboarding).not.toContain('双人协商桌');
  expect(household).not.toContain('双人协商桌');
});
```

- [x] **Step 2: 运行测试并确认失败**

Run: `npm test -- --runInBand tests/environment.test.ts tests/project-structure.test.ts`

Expected: FAIL，因为 `resolveApiBaseUrl` 不存在且旧品牌仍存在。

- [x] **Step 3: 实现环境解析并接入 App**

`environment.ts`：

```ts
export type MiniProgramEnvVersion = 'develop' | 'trial' | 'release';

export const resolveApiBaseUrl = (envVersion: MiniProgramEnvVersion) =>
  envVersion === 'develop'
    ? 'http://127.0.0.1:8080'
    : 'https://www.osheeep.com';

export const createRuntimeConfig = (envVersion: MiniProgramEnvVersion) => ({
  apiBaseUrl: resolveApiBaseUrl(envVersion),
});
```

`app.ts` 在微信运行时创建配置，避免 Jest 导入模块时依赖全局 `wx`：

```ts
import { createRuntimeConfig } from './config/environment';

const runtimeConfig = createRuntimeConfig(
  wx.getAccountInfoSync().miniProgram.envVersion,
);
```

页面继续消费 App 中已经配置好的服务，不重复判断环境。

- [x] **Step 4: 统一代码内品牌**

- `project.config.json` 的 `projectname` 改为 `今晚吃什么`。
- onboarding JSON 标题和 WXML brand 改为 `今晚吃什么`。
- household-create eyebrow 改为 `今晚吃什么`。
- `docs/HANDOFF.md` 更新环境选择、生产域名和部署手册链接。
- 不修改历史设计规格中的“产品工作名”。

- [x] **Step 5: 运行前端完整验证**

Run:

```bash
npm test
npm run typecheck
npm run lint
npm run format:check
```

Expected: 所有 Jest 测试 PASS，TypeScript、ESLint、Prettier 全部退出 0。

- [ ] **Step 6: 提交小程序改名和环境配置**

```bash
git add miniprogram project.config.json tests docs/HANDOFF.md
git commit -m "feat: prepare tonight dinner trial release"
```

### Task 3: 构建、同步和生产部署

**Files:**

- Build: `../osheeep-server/target/osheeep-server-0.0.1-SNAPSHOT.jar`
- Deploy: `/opt/osheeep-server/osheeep-server.jar`
- Deploy: `/opt/osheeep-server/osheeep-server.env`
- Deploy: `/opt/osheeep-server/OPERATIONS.md`
- Deploy: `/etc/systemd/system/osheeep-server.service`
- Install: `/opt/java/jre-21/`

**Interfaces:**

- Consumes: Task 1 的部署资产、Task 2 的已验证代码、服务器现有 MySQL/Redis/RabbitMQ 和本地 `.env.local` 中的真实密钥。
- Produces: systemd 管理的生产后端和可追溯的 Git/JAR 版本。

- [ ] **Step 1: 推送两个仓库的 main**

```bash
git push origin main
cd ../osheeep-server && git push origin main
```

Expected: 两个本地 `main` 与 `origin/main` 的 ahead/behind 都为 `0/0`。

- [ ] **Step 2: 打包正式 JAR**

```bash
cd ../osheeep-server
mvn clean package -DskipTests
test -s target/osheeep-server-0.0.1-SNAPSHOT.jar
```

Expected: Maven `BUILD SUCCESS`，JAR 非空。

- [ ] **Step 3: 安装 Java 21 和创建浅层目录**

在服务器执行：

```bash
id osheeep || useradd --system --home-dir /opt/osheeep-server --shell /sbin/nologin osheeep
mkdir -p /opt/osheeep-server/{backup,logs} /opt/java /opt/deploy-backups
curl -L --fail --output /tmp/jre-21.tar.gz \
  'https://api.adoptium.net/v3/binary/latest/21/ga/linux/x64/jre/hotspot/normal/eclipse'
mkdir -p /opt/java/jre-21
tar -xzf /tmp/jre-21.tar.gz --strip-components=1 -C /opt/java/jre-21
/opt/java/jre-21/bin/java -version
```

Expected: Java 输出 21；目录层级与规格一致。

- [ ] **Step 4: 上传 JAR、生产环境和运维资产**

从本机上传：

```bash
scp target/osheeep-server-0.0.1-SNAPSHOT.jar root@82.156.49.122:/tmp/osheeep-server.jar.new
scp .env.local root@82.156.49.122:/tmp/osheeep-server.env
scp deploy/production/osheeep-server.service root@82.156.49.122:/tmp/osheeep-server.service
scp deploy/production/OPERATIONS.md root@82.156.49.122:/tmp/OPERATIONS.md
```

服务器上将基础设施 host 改为 `127.0.0.1`，增加 `SPRING_PROFILES_ACTIVE=prod` 和独立邀请码密钥，然后以 `root:osheeep 640` 安装环境文件。命令不得打印环境文件内容。

```bash
sed -i 's/^OSHEEEP_DB_HOST=.*/OSHEEEP_DB_HOST=127.0.0.1/' /tmp/osheeep-server.env
sed -i 's/^OSHEEEP_REDIS_HOST=.*/OSHEEEP_REDIS_HOST=127.0.0.1/' /tmp/osheeep-server.env
sed -i 's/^OSHEEEP_RABBITMQ_HOST=.*/OSHEEEP_RABBITMQ_HOST=127.0.0.1/' /tmp/osheeep-server.env
grep -q '^SPRING_PROFILES_ACTIVE=' /tmp/osheeep-server.env \
  && sed -i 's/^SPRING_PROFILES_ACTIVE=.*/SPRING_PROFILES_ACTIVE=prod/' /tmp/osheeep-server.env \
  || printf '\nSPRING_PROFILES_ACTIVE=prod\n' >> /tmp/osheeep-server.env
if ! grep -q '^OSHEEEP_DINNER_INVITE_SECRET=' /tmp/osheeep-server.env; then
  invite_secret=$(openssl rand -hex 32)
  printf 'OSHEEEP_DINNER_INVITE_SECRET=%s\n' "$invite_secret" >> /tmp/osheeep-server.env
  unset invite_secret
fi
```

- [ ] **Step 5: 安装并启动 systemd 服务**

服务器执行：

```bash
install -o osheeep -g osheeep -m 0644 /tmp/osheeep-server.jar.new /opt/osheeep-server/osheeep-server.jar
install -o root -g osheeep -m 0640 /tmp/osheeep-server.env /opt/osheeep-server/osheeep-server.env
install -o root -g root -m 0644 /tmp/OPERATIONS.md /opt/osheeep-server/OPERATIONS.md
install -o root -g root -m 0644 /tmp/osheeep-server.service /etc/systemd/system/osheeep-server.service
chown -R osheeep:osheeep /opt/osheeep-server/logs
chmod 750 /opt/osheeep-server/logs /opt/osheeep-server/backup
systemctl daemon-reload
systemctl enable --now osheeep-server
systemctl status osheeep-server --no-pager
curl --fail --silent http://127.0.0.1:8080/actuator/health
```

Expected: 服务 `active (running)`，健康检查返回 `UP`，Flyway schema 为 V4。

### Task 4: Nginx 全量切换与旧 Node 下线

**Files:**

- Modify remote: `/etc/nginx/conf.d/osheeep.com.conf`
- Backup remote: `/opt/deploy-backups/osheeep.com.conf.YYYYMMDD-HHmmss`

**Interfaces:**

- Consumes: Task 3 的本机健康 Spring Boot `8080`。
- Produces: `https://www.osheeep.com/api/**` 的 Spring Boot 公网入口；释放旧 Node 端口 `3000`。

- [ ] **Step 1: 备份并修改 Nginx upstream**

服务器执行：

```bash
cp -a /etc/nginx/conf.d/osheeep.com.conf \
  "/opt/deploy-backups/osheeep.com.conf.$(date +%Y%m%d-%H%M%S)"
sed -i 's#proxy_pass http://127.0.0.1:3000;#proxy_pass http://127.0.0.1:8080;#' \
  /etc/nginx/conf.d/osheeep.com.conf
nginx -t
systemctl reload nginx
```

Expected: `nginx -t` successful；静态网站不重启。

- [ ] **Step 2: 验证公网已由 Spring Boot 响应**

Run:

```bash
curl -sS -D - https://www.osheeep.com/api/dinner/recipes
curl -sS https://www.osheeep.com/
```

Expected: `/api/dinner/recipes` 不再返回旧 Node 的 `requestedPath` JSON；根页面仍返回现有网站。

- [ ] **Step 3: 下线旧 my-backend**

服务器执行：

```bash
pm2 delete my-backend
pm2 save
ss -ltnp | grep ':3000 ' && exit 1 || true
pm2 list
```

Expected: `my-backend` 不再出现在 PM2，端口 `3000` 未监听；`osheeep-api` 仍在线且端口 `3100` 不受影响。

- [ ] **Step 4: 重新验证 Spring 和 Nginx**

```bash
systemctl is-active osheeep-server
systemctl is-active nginx
curl --fail --silent http://127.0.0.1:8080/actuator/health
curl -sS -D - https://www.osheeep.com/api/dinner/recipes
```

Expected: 两个 systemd 服务 active，健康检查 UP，公网 API 继续由 Spring Boot 响应。

### Task 5: 微信平台与体验版上传

**Files:**

- Upload from: `osheeep-wx/`
- Platform configuration: request 合法域名 `https://www.osheeep.com`
- Experience version: `0.1.0`

**Interfaces:**

- Consumes: Task 2 的 trial 配置、Task 4 的公网 API、真实 AppID。
- Produces: 可由体验成员打开的微信体验版。

- [ ] **Step 1: 用微信开发者工具验证 trial 构建前状态**

重新编译，确认控制台 0 application error、项目名显示“今晚吃什么”，开发版仍请求本地后端。

- [ ] **Step 2: 配置 request 合法域名**

在微信公众平台“开发管理 → 开发设置 → 服务器域名”把 `https://www.osheeep.com` 加入 request 合法域名。若出现管理员扫码或平台二次验证，停在确认界面并交给用户。

- [ ] **Step 3: 上传体验代码**

在微信开发者工具点击“上传”：

- 版本号：`0.1.0`
- 项目备注：`今晚菜单核心闭环体验版`

上传属于用户已明确授权的体验版发布范围。

- [ ] **Step 4: 选为体验版并生成体验入口**

在微信公众平台把 `0.1.0` 开发版本选为体验版；若出现管理员扫码或确认，交给用户完成最后一步。

- [ ] **Step 5: 真机验收与交付记录**

用两个体验账号验证微信登录、家庭创建/加入、分别选菜、自动合并、确认、修改、重新确认、完成和记录回看。更新 `docs/HANDOFF.md` 的部署状态、版本号、服务器路径和常用命令，提交并推送最终交付记录。
