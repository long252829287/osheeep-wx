# Legal Copy Compliance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Update “小家开饭” legal copy so it matches the no-UGC product, completes personal-information rights, adopts the WeChat standard minors clause, and matches the platform's approved 14-day operation-log statement.

**Architecture:** Keep legal content in the existing `LegalDocument` constants and use the existing fixture equality tests as the public copy contract. No new page, permission, SDK, API, or runtime dependency is introduced.

**Tech Stack:** Native WeChat Mini Program, TypeScript, Jest, Prettier.

## Global Constraints

- Do not add age collection, a custom guardian-consent flow, UGC, device information, phone, avatar, album, or location capabilities.
- Do not modify or resubmit the WeChat admin platform privacy guide, which is already shown as updated.
- Do not deploy, upload, submit for review, publish, commit, or push; the worktree already contains user-owned changes.
- Operation logs remain capped at 14 days and use the same terminology as the updated platform guide.

---

### Task 1: Lock and implement the approved legal copy

**Files:**

- Modify: `tests/fixtures/legal-documents.ts`
- Modify: `miniprogram/content/legal.ts`
- Test: `tests/legal-pages.test.ts`

**Interfaces:**

- Consumes: existing `LegalDocument`, `USER_AGREEMENT`, and `PRIVACY_POLICY` exports.
- Produces: the same exports with updated dates and approved paragraphs; no signature change.

- [x] **Step 1: Update the expected fixture first**

Set both documents' `updatedAt` and `effectiveAt` to `2026年7月14日`. Replace the use-rule paragraph with:

```ts
'你不得利用本服务实施违法活动、攻击系统、批量试探邀请码、干扰其他用户或侵犯他人合法权益。';
```

Replace the operation-log paragraph with:

```ts
'我们收集必要的操作日志，用于保障服务安全、故障排查和运行维护，当前最长保存14天；操作日志不得记录微信登录凭证、openid、访问令牌、邀请码明文或密钥。';
```

Replace the save-period paragraph with:

```ts
'账号存续期间，我们在实现服务所需的最短期限内保存相关数据。邀请码24小时后失效，操作日志当前最长保存14天。';
```

Replace the rights paragraphs with:

```ts
`你可以通过${PRIVACY_EMAIL}申请查阅、复制、更正、补充、删除或限制处理相关个人信息；符合规定条件时，也可以申请将个人信息转移至你指定的个人信息处理者。我们可能需要验证你的身份后处理请求。`,
`你可以通过${PRIVACY_EMAIL}撤回基于同意的个人信息处理，也可以在“我的—隐私与账户—注销账号”完成自助注销。撤回同意不影响撤回前处理活动的效力；注销成功后，旧访问令牌立即失效。`,
`如需隐私咨询、投诉或要求解释本政策，也可以通过${PRIVACY_EMAIL}联系我们。`,
```

Replace the minors paragraph with:

```ts
'若你是14周岁以下的未成年人，你需要和你的监护人共同仔细阅读本政策，并在征得监护人明示同意后继续使用本服务。我们将根据相关法律法规和本政策处理经监护人同意而收集的未成年人个人信息，并通过“六、你的权利”披露的方式保障未成年人在个人信息处理活动中的各项权利。';
```

- [x] **Step 2: Verify the fixture is red**

Run: `npm test -- --runInBand tests/legal-pages.test.ts`

Expected: FAIL because `USER_AGREEMENT` and `PRIVACY_POLICY` still contain the old dates and paragraphs.

- [x] **Step 3: Apply the same approved text to production content**

Make `miniprogram/content/legal.ts` exactly match the fixture strings from Step 1 while preserving the existing document structure and exported names.

- [x] **Step 4: Verify the focused test is green**

Run: `npm test -- --runInBand tests/legal-pages.test.ts`

Expected: the legal-page suite passes with zero failures.

### Task 2: Verify and record review status

**Files:**

- Modify: `docs/review-submission-checklist.md`
- Modify: `docs/HANDOFF.md`
- Modify: `docs/wechat-privacy-guide-materials.md`

**Interfaces:**

- Consumes: the verified final legal copy from Task 1.
- Produces: accurate review state and a completed platform-guide consistency item; production operations checks remain separate unchecked items.

- [x] **Step 1: Run the complete frontend verification**

Run, one command at a time:

```bash
npm test -- --runInBand
npm run typecheck
npm run lint
npm run format:check
git diff --check
```

Expected: all commands exit 0; Jest reports all suites and tests passing.

- [x] **Step 2: Record the legal-copy review**

Mark `《用户协议》《隐私政策》中的主体、邮箱和真实功能逐字核对` and the platform-guide consistency item complete in `docs/review-submission-checklist.md`. Add a dated HANDOFF note recording the approved copy corrections and that the administrator reopened the updated platform guide. Update the privacy-guide materials to use the platform's 14-day operation-log terminology.

- [x] **Step 3: Re-run documentation checks**

Run:

```bash
npm exec prettier -- --check docs/review-submission-checklist.md docs/HANDOFF.md docs/wechat-privacy-guide-materials.md docs/superpowers/specs/2026-07-14-legal-copy-compliance-design.md docs/superpowers/plans/2026-07-14-legal-copy-compliance.md
git diff --check
```

Expected: both commands exit 0.
