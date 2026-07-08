# 2026-07-08 OpenClaw Summary Model Output Contract And Matrix Closure

Date: 2026-07-08

## Summary

The reference OpenClaw daily-news pipeline now treats summary and industry-impact generation as a publishing-boundary contract. Model output is no longer trusted just because the HTTP request succeeded. It must pass a deterministic quality gate before it can enter Markdown reports, wiki sources, or website cache snapshots.

The fix was driven by contaminated summaries that included prompt-analysis scaffolding such as key-fact extraction, task restatement, character-count notes, and partial reasoning text. The prevention strategy is model-agnostic: any provider can either produce clean article text or be rejected and replaced by fallback text.

## Scope

This is an upstream OpenClaw collector and operations change documented by the public daily-tech package because the website reads OpenClaw reports and can otherwise publish upstream contamination.

The public package does not include private provider credentials, raw source archives, local runtime state, or API keys.

## Contract

- Generated summary and impact fields must not contain prompt analysis, task or constraint restatement, key-fact extraction scaffolding, implementation plans, `Final answer` wrappers, character-count self-checks, or truncated sentence fragments.
- The final persistence gate must check the summary segment and the impact segment separately.
- Bad model output must fail closed to deterministic fallback instead of being written to reports or website cache.
- Summary wrapper trace metadata must be bounded and secret-free. It may include provider, requested model, returned response model, status, rejection reason, candidate index, and fallback usage.
- Trace metadata must not include prompt text, article text, source payloads, API keys, or private credentials.

## Live Matrix

The final reference matrix was:

| Route | Observed response model or role | Result |
| --- | --- | --- |
| Volcano alias -> DS Flash | `deepseek-v4-flash` | Preferred production summary model; accepted without fallback. |
| Volcano alias -> Doubao Seed 2.0 Pro | `doubao-seed-2.0-pro` | Strongest backup; accepted in default and adversarial modes. |
| Volcano alias -> MiniMax3 | `minimax-m3` | Usable with quality gates; earlier malformed prefix/truncation cases were added to regression fixtures. |
| Volcano alias -> Kimi 2.7 | `kimi-k2.7-code` | Usable with gates; earlier truncation and count-self-check cases were added to regression fixtures. |
| Volcano alias -> GLM5.2 | `glm-5.2` | Not recommended as primary summary route; quality gate rejects contaminated candidates and falls back. |
| Volcano alias -> DS Pro | `deepseek-v4-pro` | Not recommended as primary summary route; quality gate rejects contaminated candidates and falls back. |
| LongCat | `LongCat-2.0` | API-compatible, but not recommended as primary summary route after live canary. |
| CodePlan/GPT-5.5 | agent route | Valid for planning/coding, not an HTTP summary wrapper. |

Operators must treat an alias such as `ark-code-latest` as a routing handle, not a model identity. The returned response model or the backend mapping used during the canary is the audit evidence.

## Fixes

- Added summary-model audit events and a digest for safe model-route diagnosis.
- Added wrapper trace output for response, accepted, rejected, failed, empty, and fallback events.
- Expanded leak detection for English and Chinese reasoning scaffolds, count checks, task restatements, implementation plans, malformed prefixes, and incomplete trailing fragments.
- Enforced separate summary and impact quality gates before persistence.
- Extended the regression matrix with fixtures representing DS, GLM, LongCat, DS Flash, CodePlan/GPT-5.5, DS Pro, MiniMax3, and Kimi output failures.
- Restored the reference Volcano alias mapping to DS Flash after the matrix run.

## Verification

Final local verification:

- Current Volcano alias canary returned `response_model=deepseek-v4-flash` and `accepted` with `fallback_used=false`.
- Default OpenClaw tests: `19 passed` under `/opt/homebrew/bin/python3.11`.
- Work OpenClaw tests: `19 passed` under `/opt/homebrew/bin/python3.11`.
- Python compile passed for default, work, AssetSync, and AGI HUNT provider files.
- `summarize-openclaw.sh` shell syntax passed for default, work, and AssetSync copies.
- Current 2026-07-08 raw report, wiki source, and website snapshot pollution scan returned no active publishing hits.
- Secret scan over changed scripts, AssetSync overlays, and documentation returned no provider key hits.
- AGI HUNT provider remains disabled by default; disabled canary returned `skipped`, `ok=true`, and version endpoint `1.2.2`.

## Operator Notes

When testing a new summary model:

1. Add an offline fixture for the model's worst observed output shape.
2. Run the live canary with summary trace enabled.
3. Record the returned response model when the provider exposes it.
4. Accept the model only if clean output passes or contaminated output is rejected before persistence.
5. Keep CodePlan-style agent routes separate from direct HTTP summary wrappers.

