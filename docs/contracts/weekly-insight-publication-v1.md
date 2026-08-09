# Weekly Insight Publication Snapshot v1

Status: Gate 5 website consumer contract. The WBR producer is not implemented in this repository.

The website accepts one already approved, presentation-ready snapshot. It never invokes the WBR analysis executor, interprets raw research, or derives public authorization from content approval.

## Envelope

```json
{
  "schema_version": "weekly-insight-publication/v1",
  "artifact_id": "wsi-2026-w30",
  "source_run_id": "weekly-run-2026-w30",
  "version": "1.0",
  "approved_candidate_sha256": "<64 lowercase hex>",
  "content_sha256": "<sha256 of canonical content object>",
  "approval": {
    "status": "approved",
    "approval_id": "approval-2026-w30",
    "approved_at": "2026-07-30T10:00:00+08:00"
  },
  "publication": {
    "public_enabled": false,
    "visibility": "internal_preview",
    "authorization_id": null
  },
  "content": {}
}
```

`public_enabled` defaults to `false` when absent. Public publication additionally requires `visibility=public` and a non-empty `authorization_id`. Approval alone is never public authorization.

Unknown envelope keys are rejected. In particular, `internal_strategic_appendix`, raw evidence payloads, credentials, private paths, and internal-only notes are not accepted by the public website seam.

## Content

`content` contains:

- `title`, optional `dek`, and `period` (`start`, `end`, `label`, `as_of`)
- `status`: `complete`, `partial`, or `no_selection`
- `selected_theses`: integer `0..4`
- `sections`: ordered presentation sections with stable anchors
- `evidence`: public-safe evidence cards
- `media`: optional image, architecture, and benchmark figures

Section anchors use `[a-z][a-z0-9_]{2,63}` and are the shared HTML ids and DOCX bookmark names. Supported section kinds are `core_insight`, `verified_facts`, `evidence`, `mechanism`, `industry_impact`, `trend_assessment`, `lenovo_china_implications`, `strategic_recommendations`, and `counterevidence_scope`. Strategic recommendations are optional.

The canonical `content_sha256` is SHA-256 over recursively key-sorted JSON with no insignificant whitespace. HTML, DOCX, and the publication manifest all carry the same `artifact_id`, `source_run_id`, `version`, `content_sha256`, and section anchors.

## Commit protocol

The consumer renders HTML, DOCX, normalized content JSON, and a manifest in a same-filesystem staging directory. It validates all four artifacts, writes the manifest last, and atomically renames the staging directory. Any failure removes staging and leaves no visible artifact. The manifest is the commit receipt.

## Feedback

Feedback is accepted only for an exact published manifest and binds `artifact_id`, `source_run_id`, `version`, `draft_content_sha256`, and `final_content_sha256`. When an edited DOCX is supplied, section-level diffs are computed from the shared bookmarks. The website records feedback; it never edits the WBR Skill.
