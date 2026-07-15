# “小家开饭”品牌同步 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将当前运行代码、法律文案和正式提审材料中的产品品牌统一为“小家开饭”，同时保留表达产品用途的“今晚吃什么”功能文案。

**Architecture:** 品牌名称只在应用标题、品牌标识、法律主体说明和当前提审文档中替换；菜单页标题、邀请分享语和“今晚吃什么，一起决定”等功能性表达保持不变。历史规格、历史实施计划和已归档设计记录不追溯修改。

**Tech Stack:** 微信原生小程序（JSON、WXML、TypeScript）、Jest、Markdown。

## Global Constraints

- 正式品牌名必须使用“小家开饭”。
- “今晚吃什么”作为问题、功能说明或分享语时继续保留。
- 不修改 `docs/superpowers/specs/`、既有 `docs/superpowers/plans/` 或历史设计图片。
- 用户已确认微信公众平台正式名称和头像均已完成修改。

---

### Task 1: 同步运行代码和法律文案

**Files:**
- Modify: `tests/project-structure.test.ts`
- Modify: `tests/fixtures/legal-documents.ts`
- Modify: `project.config.json`
- Modify: `miniprogram/app.json`
- Modify: `miniprogram/pages/onboarding/index.json`
- Modify: `miniprogram/pages/onboarding/index.wxml`
- Modify: `miniprogram/pages/household-create/index.wxml`
- Modify: `miniprogram/content/legal.ts`
- Test: `tests/project-structure.test.ts`
- Test: `tests/legal-pages.test.ts`

**Interfaces:**
- Consumes: 微信公众平台已确认的正式名称“小家开饭”。
- Produces: 开发者工具项目名、导航栏、品牌标识、法律文案与正式名称一致的运行包。

- [x] **Step 1: 先把结构测试和法律文案夹具改为期望“小家开饭”**

  `tests/project-structure.test.ts` 必须精确断言 `project.config.json`、全局导航标题、onboarding 导航标题、onboarding 品牌节点和 household eyebrow 使用“小家开饭”，并继续断言 onboarding 的功能标题包含“今晚吃什么”。`tests/fixtures/legal-documents.ts` 的协议主体名称改为“小家开饭”。

- [x] **Step 2: 运行目标测试并验证 RED**

  Run: `npm test -- --runInBand tests/project-structure.test.ts tests/legal-pages.test.ts`

  Expected: 因运行代码仍使用“今晚吃什么”而失败。

- [x] **Step 3: 最小化修改运行代码**

  将 `project.config.json` 的 `projectname`、全局及 onboarding 导航标题、onboarding 品牌节点、household eyebrow 和两处法律主体名称改为“小家开饭”。保留 onboarding 功能标题、今晚菜单页标题和邀请分享语中的“今晚吃什么”。

- [x] **Step 4: 运行目标测试并验证 GREEN**

  Run: `npm test -- --runInBand tests/project-structure.test.ts tests/legal-pages.test.ts`

  Expected: 两个测试文件全部通过。

### Task 2: 同步当前提审与交接材料

**Files:**
- Modify: `docs/review-submission-checklist.md`
- Modify: `docs/wechat-privacy-guide-materials.md`
- Modify: `docs/HANDOFF.md`

**Interfaces:**
- Consumes: 已同步的运行代码品牌名称与用户对平台改名完成的确认。
- Produces: 可供管理员继续配置隐私指引和提审检查的当前文档。

- [x] **Step 1: 更新提审清单**

  将标题改为“‘小家开饭’微信正式提审清单”，并把正式名称确认项改为已完成：`- [x] 微信公众平台正式名称已确认为“小家开饭”。`

- [x] **Step 2: 更新隐私指引材料**

  将文档标题和“已核验主体信息”中的小程序名称改为“小家开饭”，其他隐私事实保持不变。

- [x] **Step 3: 更新当前交接状态**

  将 `docs/HANDOFF.md` 的当前品牌叙述改为“小家开饭”，记录微信公众平台名称已由管理员完成修改；保留描述用户需求时作为问题的“今晚吃什么”。

- [x] **Step 4: 检查品牌残留**

  Run: `rg -n "今晚吃什么" project.config.json miniprogram tests/fixtures docs/review-submission-checklist.md docs/wechat-privacy-guide-materials.md docs/HANDOFF.md`

  Expected: 只剩功能问题、功能标题、分享语或对历史阶段的必要描述；不得剩余旧品牌主体名称。

### Task 3: 全量验证

**Files:**
- Verify only.

**Interfaces:**
- Consumes: Task 1 和 Task 2 的全部变更。
- Produces: 可交给下一步体验版上传流程的已验证工作区。

- [x] **Step 1: 运行完整测试**

  Run: `npm test -- --runInBand`

  Expected: 全部测试通过。

- [x] **Step 2: 运行静态检查**

  Run: `npm run typecheck`

  Expected: exit 0。

  Run: `npm run lint`

  Expected: exit 0。

  Run: `npm run format:check`

  Expected: exit 0。

- [x] **Step 3: 审阅最终差异**

  Run: `git diff --check && git diff -- project.config.json miniprogram tests docs/review-submission-checklist.md docs/wechat-privacy-guide-materials.md docs/HANDOFF.md`

  Expected: 无空白错误；差异仅包含品牌同步、提审材料更新和本实施计划。
