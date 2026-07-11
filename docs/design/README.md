# 微信小程序视觉基线

## 已选方向

- 基线文件：`tonight-menu-draft-baseline.png`
- 选择结果：三套探索方案中的方案 2
- 目标尺寸：390 × 844（保存文件为同等比例高清图）
- 当前状态：今晚菜单 `DRAFT` 草稿态

## 核心设计约束

- 顶部突出“我、共同、TA”的协商关系。
- 菜单使用单列结构，不恢复原型中的双栏完整菜品卡。
- 橙色表示“我想吃”，蓝色表示“TA 想吃”，橄榄绿表示“都想吃”。
- 状态不能只依赖颜色，必须同时使用图标和文字。
- 主按钮为“确认今晚菜单”，固定区域需要避开 TabBar 与安全区。
- 实际开发时压缩顶部进度区，并吸收方案 3 的简洁留白。

## 后续必须补齐

- [x] 首次进入与微信身份说明：`onboarding-first-entry.png`。
- [x] 创建家庭成功：`household-created.png`。
- [x] 加入家庭与邀请码错误：`household-join-error.png`。
- [x] 邀请码失效和家庭已满：复用 `household-join-error.png` 布局，按错误码替换提示文案。
- [x] 今晚菜单空状态：`tonight-menu-empty.png`。
- [x] 单方已选、另一方未选：`tonight-menu-partner-pending.png`。
- [x] 菜单已确认状态：`tonight-menu-confirmed.png`。
- [x] 修改后退回草稿：`tonight-menu-reconfirm.png`。
- [x] 已完成记录详情：`cooking-record-detail.png`。
- [x] 弱网、提交失败和版本冲突：`tonight-menu-sync-conflict.png`。

在上述状态评审通过前，本文件只作为视觉方向基线，不代表最终实现已经冻结。
