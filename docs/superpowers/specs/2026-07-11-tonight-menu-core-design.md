# 今晚菜单核心闭环设计规格

**状态：** 待用户书面复核  
**日期：** 2026-07-11  
**需求基线：** [Notion PRD v1.1](https://app.notion.com/p/399bfe9d065181698643c3fac5463c43)  
**视觉基线：** `docs/design/tonight-menu-*.png`、`docs/design/cooking-record-detail.png`

## 1. 目标

在已经完成微信登录和双人家庭绑定的基础上，打通体验版最核心的纵向链路：双方从系统示例菜中分别选择，服务端合并并标记来源，任一方确认，修改后退回草稿，完成后幂等生成一条带菜品快照的做饭记录。

## 2. 本阶段范围

### 2.1 包含

- 8 道系统示例菜及统一风格的真实菜品缩略图。
- 今日菜单空状态、单方选择、双方合并、已确认、修改后重新确认、已完成状态。
- 双方分别维护自己的完整选择集合。
- 服务端计算 `ME`、`PARTNER`、`BOTH` 来源。
- 任一成员确认、修改、完成，双方权限相同。
- 菜单版本冲突恢复、确认和完成幂等。
- 页面显示期间每 8 秒轮询一次；切后台停止，回前台立即刷新。
- 今晚、菜谱、记录、我的四个底部入口的最小可用版本。
- 完成记录列表、记录详情及菜品快照。

### 2.2 不包含

- 用户新增、编辑或删除菜谱。
- 搜索、分类管理、完整食材、步骤和图片上传。
- 手动补记、编辑或删除历史记录。
- WebSocket、订阅消息、收藏、浏览历史和 AI 配餐。

## 3. 方案选择

采用完整纵向闭环，不拆成“只选菜”或“先做菜谱后台”。服务端是菜单状态和合并结果的唯一事实源；客户端只保存当前页面草稿和最后一次服务端快照。

## 4. 系统示例菜

| 菜名 | 分类 | 口味 | 预计时间 |
| --- | --- | --- | --- |
| 番茄炒蛋 | 家常菜 | 酸甜 | 10 分钟 |
| 小炒黄牛肉 | 下饭菜 | 香辣 | 15 分钟 |
| 清炒油麦菜 | 素菜 | 清爽 | 8 分钟 |
| 黄焖鸡米饭 | 下饭菜 | 浓郁 | 25 分钟 |
| 紫菜蛋花汤 | 汤羹 | 鲜香 | 10 分钟 |
| 可乐鸡翅 | 家常菜 | 咸甜 | 30 分钟 |
| 蒜蓉西兰花 | 素菜 | 蒜香 | 12 分钟 |
| 青椒土豆丝 | 家常菜 | 清爽 | 12 分钟 |

缩略图为 1:1、无文字和水印、暖色自然光、真实家常菜摄影风格，保存到 `miniprogram/assets/recipes/`。不得从原型合成图中裁切。

## 5. 业务日与状态机

服务端按家庭 `timezone` 计算业务日；当地时间凌晨 4 点之前属于前一天。客户端只展示服务端返回的 `menuDate`。

```text
DRAFT --确认--> CONFIRMED --已做完--> COMPLETED
  ^                 |
  |----修改选择-----|
```

- 当天第一次读取时按需创建 `DRAFT` 菜单。
- `DRAFT` 至少包含一道菜才能确认。
- `CONFIRMED` 修改任一成员选择后立即回到 `DRAFT`，清空原确认人和确认时间。
- `COMPLETED` 只读，不允许修改、确认或再次推进状态。
- 合并菜单是双方选择的并集；相同菜只出现一次。
- 来源必须同时用文案和颜色表示：`ME` 暖橙、`PARTNER` 蓝色、`BOTH` 橄榄绿。

## 6. 页面与交互

### 6.1 今晚

- 顶部显示家庭名称、我的选择数、共同选择数和 TA 的选择数。
- 主体为单列合并菜单，不使用双栏完整菜品卡。
- 空状态主按钮为“去选菜”；有菜草稿态为“确认今晚菜单”。
- 已确认态展示确认人和确认时间，主按钮为“已做完，生成记录”，并提供“修改选择”。
- 修改后展示“待重新确认”和最新变更提示。
- 完成后跳转到本次记录详情。
- 页面显示期间每 8 秒刷新，隐藏或卸载时取消定时器。

### 6.2 菜谱选择

- 单列展示 8 道系统菜，卡片点击区域不小于 44px。
- 支持连续勾选，页面底部显示“保存我的选择（N）”。
- 进入页面时复制服务端当前用户选择为本地草稿。
- 保存时一次性提交完整 `recipeIds` 集合与进入页面时的 `version`。
- 成功后返回今晚页；失败保留勾选结果并允许重新保存。
- 若发生版本冲突，拉取最新菜单，保留本地草稿并要求用户再次保存。

### 6.3 记录

- 列表按完成时间倒序展示家庭做饭记录。
- 详情展示完成时间、操作人和完成时菜品快照。
- 记录详情只读；系统菜后续变化不得影响历史内容。

### 6.4 我的

- 展示家庭名称、两名成员状态和邀请码入口。
- 复用现有家庭邀请页，不在本阶段加入退出家庭、注销或隐私配置。

### 6.5 底部导航

- 提供“今晚、菜谱、记录、我的”四个入口。
- 菜谱入口打开系统示例菜列表；记录入口支持空状态和详情；我的入口承载现有家庭信息。
- 主操作区域必须避开底部导航与安全区。

## 7. 数据模型

V4 Flyway 迁移新增：

- `dinner_recipes`：`id`、`scope`、`household_id`、`name`、`image_path`、`category`、`flavor`、`estimated_minutes`、`creator_id`、`status`、时间戳。系统菜 `scope=SYSTEM` 且 `household_id/creator_id` 为空。
- `dinner_menus`：`id`、`household_id`、`menu_date`、`status`、`version`、`confirmed_by/at`、`completed_by/at`、时间戳；`(household_id, menu_date)` 唯一。
- `dinner_menu_selections`：`id`、`menu_id`、`user_id`、`recipe_id`、`selected_at`；`(menu_id, user_id, recipe_id)` 唯一。
- `dinner_menu_actions`：`id`、`menu_id`、`actor_id`、`action_type`、`idempotency_key`、时间戳；`idempotency_key` 唯一。
- `dinner_cooking_records`：`id`、`household_id`、`menu_id`、`record_date`、`completed_by/at`；`menu_id` 唯一。
- `dinner_record_dish_snapshots`：`id`、`record_id`、`recipe_id`、`name`、`image_path`、`category`、`flavor`、`estimated_minutes`、`selected_by_user_ids`、`sort_order`。`selected_by_user_ids` 使用 JSON 保存完成时实际选择该菜的成员 ID，读取时再相对当前用户计算来源。

所有外键关联现有 `users`、`dinner_households` 和新增业务表。菜单写操作在事务内校验当前用户属于该家庭。

## 8. API 契约

### 8.1 菜谱

- `GET /api/dinner/recipes`：返回所有有效系统示例菜。

### 8.2 今日菜单

- `GET /api/dinner/menus/today`
- `PUT /api/dinner/menus/today/selections`
- `POST /api/dinner/menus/today/confirm`
- `POST /api/dinner/menus/today/complete`

选择请求：

```json
{
  "recipeIds": [1, 2, 3],
  "version": 4
}
```

确认和完成请求：

```json
{
  "version": 5,
  "idempotencyKey": "uuid-v4"
}
```

今日菜单响应包含 `id`、`menuDate`、`status`、`version`、双方数量、当前用户的 `selectedRecipeIds`、合并后的 `dishes`、确认/完成信息和可选 `recordId`。每个合并菜品包含示例菜字段与相对当前用户计算的 `ME/PARTNER/BOTH`。

### 8.3 记录

- `GET /api/dinner/records`
- `GET /api/dinner/records/{id}`

完成接口直接返回 `recordId` 和最新菜单，客户端据此跳转记录详情。

## 9. 并发、幂等与恢复

- 每次选择、确认和完成都比较请求 `version` 与数据库版本；成功写入后版本加一。
- 版本不一致返回 HTTP 409 和 `DINNER_MENU_VERSION_CONFLICT`。
- 相同幂等键重复确认返回当前菜单，不重复推进版本。
- 相同幂等键或同一菜单重复完成返回同一记录。
- `dinner_cooking_records.menu_id` 唯一作为完成操作的数据库兜底。
- 客户端选择失败时不清空本地草稿；普通失败显示重新保存。
- 冲突时拉取最新菜单，保留本地草稿并明确提示用户重新保存。
- 轮询失败保留当前内容并显示弱网横幅，不用空页面覆盖已有菜单。

新增错误码：`DINNER_MENU_EMPTY`、`DINNER_MENU_VERSION_CONFLICT`、`DINNER_MENU_NOT_CONFIRMED`、`DINNER_MENU_COMPLETED`、`DINNER_RECIPE_INVALID`。

## 10. 前端模块边界

- `types/menu.ts`、`types/recipe.ts`、`types/record.ts`：接口类型。
- `services/menu-service.ts`、`recipe-service.ts`、`record-service.ts`：请求路径和数据透传。
- `utils/menu-state.ts`：按钮状态、来源文案、幂等键和冲突恢复的纯函数。
- `pages/tonight/`：服务端菜单快照、轮询和主状态机展示。
- `pages/recipes/`：系统菜列表与本地选择草稿。
- `pages/records/`、`pages/record-detail/`：记录列表与详情。
- `pages/profile/`：家庭摘要与邀请入口。

网络调用只放在 Page/service 层；展示组件不直接访问 App 或发请求。

## 11. 测试与验收

### 11.1 服务端

- 凌晨 4 点业务日边界。
- 两人选择并集和相对来源计算。
- 空菜单不能确认。
- 任一成员可确认；确认后修改回到草稿。
- 版本冲突不覆盖对方数据。
- 重复完成只生成一条记录及一组快照。
- 非家庭成员不能读取或修改菜单与记录。

### 11.2 前端

- Service 路径和请求体映射。
- 选择草稿不在失败时丢失。
- 来源文案和颜色不依赖单一视觉信号。
- 页面显示/隐藏正确启动和停止 8 秒轮询。
- 确认、完成和保存提交期间禁止重复点击。
- 冲突恢复后保留本地未提交选择。

### 11.3 双账号验收

- A、B 选择同一道菜时双方均显示“都想吃”。
- 任一方确认后，两端最多 8 秒显示相同确认结果。
- 已确认后另一方修改，两端显示待重新确认。
- 两端重复点击完成只生成一条记录。
- 记录详情包含完成时全部菜品快照。
- 375、390、430px 宽度无横向滚动、安全区遮挡或不可点击主按钮。

## 12. 完成标准

- 所有新增和原有自动化测试通过。
- 微信开发者工具完成全部关键状态视觉对比，`design-qa.md` 最终结果为 `passed`。
- 两个真实微信账号完成选择、合并、确认、修改、完成和记录链路。
- 前后端接口契约和 Flyway V4 迁移文档同步更新。
- 本阶段不包含第 2.2 节列出的扩展功能。
