// 虚构业务：活动报名资格校验（示例素材，非真实代码）
// c4：补一段文件头说明，制造行号漂移（示例素材）
// 规则来源：docs/specdev/activity-registration/submit-review/details.md 的 check_eligibility 条目
// 判定顺序：先验账户，再查重复；两者都过才受理。
// 修改本文件头部会整体下移函数位置，用来验证证据行号跟随固定提交。
// （本行起为 c1 原有内容）

export function accountLabel(account) {
  return account.verified ? 'verified' : 'unverified';
}

export function checkEligibility(account, existing) {
  if (!account.verified) return { ok: false, reason: 'account-unverified' };
  if (existing.some((row) => row.account === account.id)) return { ok: false, reason: 'duplicate-entry' };
  return { ok: true, reason: 'eligible' };
}

export function nextStep(result) {
  return result.ok ? 'create_record' : 'reject_registration';
}
