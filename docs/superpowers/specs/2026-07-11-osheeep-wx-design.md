# Osheeep 微信小程序体验版设计规格

> 状态：待用户审阅
> 日期：2026-07-11
> 产品工作名：双人协商桌
> 需求基线：[Notion PRD v1.1](https://app.notion.com/p/399bfe9d065181698643c3fac5463c43)

## 1. 目标

为情侣或夫妻提供一条轻量闭环：进入同一个双人家庭，分别选择今晚想吃的菜，系统合并选择，任一方确认，做完后生成唯一做饭记录。

体验版成功标准：两台微信真机可以完成“登录 → 绑定家庭 → 双方选菜 → 合并 → 确认 → 修改后重新确认 → 已做完 → 查看记录”的完整流程。

## 2. 已确认决策

- 前端独立仓库：`osheeep-wx`。
- 后端复用 `osheeep-server`，新增独立 `dinner` 业务模块。
- 前端使用微信原生小程序、TypeScript、WXML、WXSS、JSON。
- 仅选择性使用 TDesign MiniProgram 的 Toast、Dialog、Picker 等基础组件。
- 体验版不包含收藏、浏览历史、分类编辑和完整菜谱步骤编辑。
- “提醒 TA”只使用微信分享卡片，不接订阅消息。
- 每个家庭最多 2 名有效成员，双方权限完全相同。
- 菜单业务日按家庭时区凌晨 4 点切换。
- 菜单页以前台 10 秒短轮询和页面恢复刷新同步，不使用 WebSocket。
- 方案 2 是视觉基线，并吸收方案 3 的简洁留白。

## 3. 非目标

- 三人以上家庭、多家庭、多群组或角色审批。
- 购物清单、库存、营养、热量、支付或外卖。
- AI 配餐、聊天、复杂消息中心和运营后台。
- Taro、uni-app、React、Vue 或 Web 页面转译。
- 体验版中的完整菜谱编辑、复杂分类管理和订阅消息。

## 4. 页面与视觉基线

视觉文件位于 `docs/design/`：

| 页面/状态 | 文件 |
|---|---|
| 首次进入 | `onboarding-first-entry.png` |
| 创建家庭成功 | `household-created.png` |
| 加入家庭与邀请码错误 | `household-join-error.png` |
| 今晚菜单草稿基线 | `tonight-menu-draft-baseline.png` |
| 今晚菜单空状态 | `tonight-menu-empty.png` |
| 我已选、TA 未选 | `tonight-menu-partner-pending.png` |
| 菜单已确认 | `tonight-menu-confirmed.png` |
| 修改后重新确认 | `tonight-menu-reconfirm.png` |
| 完成记录详情 | `cooking-record-detail.png` |
| 弱网与版本冲突 | `tonight-menu-sync-conflict.png` |

实现约束：生成图是视觉方向而不是像素尺寸来源。开发时使用 390 × 844 逻辑基准，正文不小于 14px，关键点击区域不小于约 44px，并适配 375～430px 宽度、安全区和系统大字体。

## 5. 前端架构

### 5.1 项目结构

```text
osheeep-wx/
├── miniprogram/
│   ├── app.ts
│   ├── app.json
│   ├── app.wxss
│   ├── assets/
│   ├── components/
│   │   ├── household-header/
│   │   ├── couple-progress/
│   │   ├── dish-row/
│   │   ├── menu-action-bar/
│   │   ├── state-banner/
│   │   └── empty-state/
│   ├── config/
│   ├── pages/
│   │   ├── onboarding/
│   │   ├── household-create/
│   │   ├── household-join/
│   │   ├── tonight/
│   │   ├── recipes/
│   │   ├── record-list/
│   │   ├── record-detail/
│   │   └── profile/
│   ├── services/
│   │   ├── auth-service.ts
│   │   ├── household-service.ts
│   │   ├── menu-service.ts
│   │   ├── recipe-service.ts
│   │   └── record-service.ts
│   ├── state/
│   ├── types/
│   └── utils/
├── tests/
├── docs/
├── project.config.json
├── tsconfig.json
└── package.json
```

### 5.2 状态边界

- App 层只保存访问令牌、当前用户和家庭概要，不保存页面临时表单。
- Tonight Page 持有当前菜单视图状态、同步状态和轮询生命周期。
- 跨页面共享逻辑放在小型 service/state 模块，不引入 MobX。
- 令牌保存在 `wx` 本地存储中；退出和鉴权失败必须清除。
- 页面切前台时立即刷新今日菜单；前台停留期间每 10 秒轮询一次；页面隐藏时停止轮询。

### 5.3 请求层

统一封装 `wx.request`：

- 从环境配置读取 API 根地址。
- 自动添加 `Authorization: Bearer <token>` 和 `X-Request-Id`。
- 解析现有服务端 `ApiResponse<T>`：`success`、`errorCode`、`message`、`data`、`requestId`。
- 401 时清理会话并回到首次进入页。
- GET 可做一次短退避重试；确认、完成、加入家庭等写操作不由请求层自动重放。
- 写操作使用显式幂等键和页面级防重复点击。

## 6. 微信登录

1. 用户点击“微信登录并继续”。
2. 小程序调用 `wx.login` 获取临时 `code`。
3. 调用 `POST /api/auth/wechat`，请求体为 `{ code }`。
4. `osheeep-server` 使用服务端 AppID/AppSecret 调用微信登录接口换取 openid。
5. 服务端按 openid 创建或读取微信用户，签发当前项目的 JWT。
6. 客户端保存令牌并调用 `GET /api/dinner/household` 判断进入家庭绑定页还是今晚菜单。

AppSecret、session_key、数据库凭据和对象存储密钥不得进入小程序包、日志或响应体。

## 7. 家庭绑定

- 未绑定用户只能创建或加入家庭。
- 创建家庭默认名称为“我们的小家”，返回 24 小时有效邀请码。
- 邀请码服务端仅保存哈希；刷新邀请码会让旧邀请码立即失效。
- 一个有效家庭最多 2 名成员。
- 已在有效家庭中的用户不能加入第二个家庭。
- 邀请码无效、过期和家庭已满复用相同页面结构，通过错误码显示不同文案。

## 8. 菜单业务日与状态机

### 8.1 业务日

服务端根据家庭 `timezone` 计算业务日期：本地时间凌晨 4 点之前归属前一天，凌晨 4 点及以后归属当天。客户端只展示服务端返回的 `menuDate`，不自行推导业务日期。

### 8.2 状态机

```text
DRAFT --确认--> CONFIRMED --已做完--> COMPLETED
  ^                 |
  |----修改选择-----|
```

- `DRAFT`：双方可修改自己的选择；至少一道菜才能确认。
- `CONFIRMED`：任一方可以完成；任一方修改选择后立即退回 `DRAFT`。
- `COMPLETED`：菜单只读，不再允许修改或再次完成。
- 合并菜单取双方选择并集，同一道菜不能重复。
- 来源值为 `ME`、`PARTNER`、`BOTH`，UI 同时使用文字、图标和颜色。

### 8.3 并发与幂等

- `dinner_menu.version` 每次写操作递增。
- 更新选择、确认和完成都携带当前 `version`。
- 版本不匹配返回 HTTP 409 和 `DINNER_MENU_VERSION_CONFLICT`，客户端保留可见选择并提示加载最新菜单。
- 确认和完成接口都携带 `idempotencyKey`；相同用户对相同菜单重复确认返回当前菜单，不重复推进版本。
- `dinner_cooking_record.menu_id` 唯一。
- 重复完成返回同一条记录，不创建第二条数据。

## 9. API 契约

### 9.1 认证与家庭

- `POST /api/auth/wechat`
- `GET /api/dinner/household`
- `POST /api/dinner/households`
- `POST /api/dinner/households/join`
- `POST /api/dinner/households/invite-code/refresh`
- `POST /api/dinner/households/leave`

### 9.2 今日菜单

- `GET /api/dinner/menus/today`
- `PUT /api/dinner/menus/today/selections`
- `POST /api/dinner/menus/today/confirm`
- `POST /api/dinner/menus/today/complete`

选择更新请求：

```json
{
  "recipeIds": [101, 102, 103],
  "version": 4
}
```

确认/完成请求：

```json
{
  "version": 5,
  "idempotencyKey": "uuid-v4"
}
```

### 9.3 菜谱、上传与记录

- `GET /api/dinner/recipes`
- `GET /api/dinner/recipes/{id}`
- `POST /api/dinner/recipes`
- `POST /api/dinner/uploads/presign`
- `GET /api/dinner/records`
- `GET /api/dinner/records/{id}`
- `POST /api/dinner/records/{id}/reuse`

体验版轻量菜谱字段：菜名必填；图片、系统分类、口味标签和预计时间可选。图片使用短期上传凭证直传对象存储。

## 10. 错误码与恢复

在现有 `ErrorCode` 中增加以下业务码，并继续使用统一 `ApiResponse`：

- `DINNER_INVITE_INVALID`
- `DINNER_INVITE_EXPIRED`
- `DINNER_HOUSEHOLD_FULL`
- `DINNER_ALREADY_IN_HOUSEHOLD`
- `DINNER_MENU_EMPTY`
- `DINNER_MENU_VERSION_CONFLICT`
- `DINNER_MENU_NOT_CONFIRMED`
- `DINNER_MENU_COMPLETED`
- `DINNER_RECORD_EXISTS`

恢复规则：

- 弱网不清空当前页面内容；失败选择回滚或标记“待同步”。
- 版本冲突保留用户可见选择，加载最新菜单后由用户重新操作。
- 图片失败显示固定占位图，不阻塞选菜。
- 邀请码错误保留输入值，允许修正或粘贴新邀请码。
- 确认和完成失败恢复按钮可点击状态，并展示可追踪的 `requestId`。

## 11. 组件责任

- `household-header`：家庭名称和双方成员头像；体验版不展示家庭切换入口。
- `couple-progress`：我、共同、TA 的数量和状态，不负责拉取数据。
- `dish-row`：菜品快照、元数据、来源、同步状态和点击事件。
- `menu-action-bar`：草稿确认、已确认完成、冲突禁用等主按钮状态。
- `state-banner`：成功、警告、弱网和版本冲突信息。
- `empty-state`：可配置图标、标题、说明和操作，不内置业务请求。

组件只接收明确属性并发送事件；网络调用留在 Page/service 层。

## 12. 测试策略

### 12.1 前端自动化

- Jest：业务日展示、来源合并、API 映射、错误码文案、轮询生命周期和幂等键生成。
- `miniprogram-simulate`：进度条、菜品行、空状态、状态横幅和主操作栏。
- TypeScript：严格模式和 `noImplicitAny`。

### 12.2 服务端自动化

- Controller 测试：微信登录、家庭绑定、菜单、记录和统一错误响应。
- Service 测试：凌晨 4 点业务日、双人上限、选择并集、确认后修改、乐观锁和完成幂等。
- 数据库迁移测试：唯一约束、软删除和历史快照。

### 12.3 真机验收

- 两台微信真机分别登录并加入同一家庭。
- 同时选择或取消同一道菜，最终来源和数量一致。
- 弱网、切后台、重复确认和重复完成不产生重复数据。
- 375、390、430px 宽度无横向滚动或安全区遮挡。

## 13. 安全与隐私

- 服务端从 JWT 识别用户，不能信任客户端传入的 userId。
- 每次家庭数据访问都校验有效成员关系。
- 日志不记录微信 code、AppSecret、session_key、完整 JWT、邀请码明文或图片临时凭证。
- 图片限制 MIME、大小、数量和对象路径。
- 上架前提供隐私保护指引、用户协议、退出家庭和账号注销路径。
- 首次进入不集中索取头像、手机号和相册权限。

## 14. 分阶段交付

1. 工程基础与登录。
2. 家庭创建、邀请和加入。
3. 菜谱列表与轻量新增。
4. 双方选菜、合并、确认和重新确认。
5. 完成菜单、记录详情和再次做这顿。
6. 弱网、并发、隐私、真机适配和体验版发布。

每个阶段必须有失败测试、最小实现、验证命令和独立审查点。实施阶段不得把收藏、分类管理、完整菜谱步骤或订阅消息顺带加入。

## 15. 设计自检

- 无 `TBD`、`TODO` 或未定义的核心流程。
- 页面结构与 10 张视觉状态一一对应。
- 前端接口命名与服务端 `ApiResponse`、JWT 和统一错误机制一致。
- 菜单状态机、凌晨 4 点业务日、轮询、乐观锁和幂等没有互相矛盾。
- 体验版范围不包含已明确延后的功能。
