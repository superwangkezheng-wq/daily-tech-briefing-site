# 2026-06-07 OpenClaw Ops Policy Pause Contract

## Summary

Reference OpenClaw operators paused all default daily AI / ICT collection slots. Website publishing refresh, feedback-health receipts, and qmd refresh had to pause with collection while the existing web service and tunnel kept serving the last good page.

## Root Cause

Collection pause state, publishing pause state, feedback-health expectations, and qmd refresh expectations can drift if they are changed as separate cron or launchd toggles. The model-route contract had already been separated, but the operational pause/resume path needed the same single-source treatment.

## Fix

- Use an upstream OpenClaw ops override/policy as the single source of truth for daily collection, publishing refresh, feedback-health, qmd refresh, and inspection expectations.
- Treat `daily-tech-publishing`, `feedback-health`, `daily-tech-site-refresh`, and `qmd-refresh` as policy-derived pauses when daily collection is paused.
- Keep the serving layer online while disabling new refresh/publish and feedback-health cycles.
- Keep model routing in the separate upstream OpenClaw model-route contract.

## Verification

- OpenClaw release gate: `ok` on 2026-06-07 11:53:57 +0800.
- Cron contract audit: paused collection and publishing expected, zero errors.
- State drift audit: disabled publishing/qmd/feedback LaunchAgents accepted while paused.
- Production guard and post-reboot recovery: qmd and refresh pauses accepted as healthy.
- Business smoke: existing local site and public tunnel returned 200 while publishing remained paused.

## Prevention

Future changes to collection schedules, publishing refresh, feedback-health, qmd refresh, or inspection expectations should update the upstream ops policy first, then rerun release gate. Do not encode operator pause state directly in this public website package.
