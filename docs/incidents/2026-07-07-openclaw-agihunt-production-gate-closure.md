# 2026-07-07 OpenClaw AGI HUNT Production Gate Closure

Date: 2026-07-07

## Summary

The reference OpenClaw production pipeline now has a sealed AGI HUNT integration boundary. AGI HUNT is wired as a read-only upstream signal provider, but remains disabled by default so the existing daily collection behavior is unchanged until an operator explicitly enables it.

This closure also fixed a Lark skill refresh noise source in AssetSync. The issue was not Feishu delivery. Feishu and Weixin upgrade notifications were delivered successfully. The noise came from a global PromptScript skill installation path that is not supported by the skills installer.

## Scope

This is an upstream OpenClaw operations change documented by the public daily-tech package because the website publishing and feedback-health receipts depend on those upstream gates.

The public package does not include private AGI HUNT credentials, private OpenClaw runtime state, or source archives.

## Changes

- Added an AGI HUNT provider seam to the upstream collector design:
  - canary status
  - 10-minute cache
  - API key lookup boundary
  - error classification
  - normalized daily-news candidates
- Kept AGI HUNT disabled by default through `agihuntSource.enabled=false`.
- Added `agihunt` status compatibility to the OpenClaw status schema.
- Added AGI HUNT canary coverage to BusinessSmoke and ProductionGuard.
- Added AssetSync manifest and contract coverage for:
  - AGI HUNT provider
  - AGI HUNT provider tests
  - `daily_news_v10.py`
  - the daily-news source manifest
- Added a contract check that prevents the Lark skill refresh hook from reintroducing PromptScript global installation.

## Lark Skill Refresh Noise

The noisy path was:

```text
npx skills add larksuite/cli -y -g
```

The `-g` flag attempted global installation of PromptScript skills across agent clients. The installed skills were copied, but the global PromptScript installation step reported unsupported installation failures.

The fixed path refreshes the local skill source without global PromptScript installation:

```text
(cd "$HOME" && npx skills add larksuite/cli -y)
```

AssetSync still mirrors the managed Lark skills into the default and work OpenClaw workspaces.

## Verification

Final local verification on 2026-07-07:

- AGI HUNT canary: `result=skipped`, `errors=0`, `warnings=0`.
- AGI HUNT candidates while disabled: empty list, `errors=0`, `warnings=0`.
- AGI HUNT provider tests: default/work both passed.
- AssetSync contract audit: `43` checks, `errors=0`, `warnings=0`.
- ProductionGuard: `result=ok`, `errors=0`, `warnings=0`.
- BusinessSmoke: `result=ok`.
- DailyAcceptance: `result=ok`, `errors=0`, `warnings=0`.
- Unified AssetSync upgrade: `result=成功`, `notifyOk=true`.
- Lark skill refresh without `-g`: returned `0`, installed 27 skills, and produced no `PromptScript does not support global skill installation` failures.

## Operator Notes

AGI HUNT should stay disabled until credentials and quota expectations are explicitly configured. When enabling it, operators should run:

```bash
openclaw_agihunt_provider.py --canary --json
openclaw_business_smoke.sh
openclaw_production_guard.sh --repair --json
openclaw_daily_acceptance.py --json
```

AGI HUNT candidates must remain marked as aggregated signals that require primary-source verification.

