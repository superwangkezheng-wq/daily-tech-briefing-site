const RELEASE_TIME_ZONE = "Asia/Shanghai";
const DEFAULT_RELEASE_CLOCK = "10:30";
const fsp = require("node:fs/promises");

const OVERRIDE_FIELDS = new Set([
  "artifact_id", "source_run_id", "publish_at", "period_start", "period_end", "visibility",
  "hold", "actor", "recorded_at",
]);

function requireDate(value, field) {
  const normalized = String(value || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) throw new Error(`Invalid ${field}`);
  const parsed = new Date(`${normalized}T00:00:00Z`);
  if (Number.isNaN(parsed.valueOf()) || parsed.toISOString().slice(0, 10) !== normalized) {
    throw new Error(`Invalid ${field}`);
  }
  return parsed;
}

function followingMonday(periodEnd) {
  const end = requireDate(periodEnd, "content.period.end");
  const day = end.getUTCDay();
  const days = day === 1 ? 7 : (8 - day) % 7;
  end.setUTCDate(end.getUTCDate() + days);
  return end.toISOString().slice(0, 10);
}

function defaultPublishAt(snapshot) {
  return `${followingMonday(snapshot.content.period.end)}T${DEFAULT_RELEASE_CLOCK}:00+08:00`;
}

function requireRecordedOverride(snapshot, override) {
  if (!override || typeof override !== "object" || Array.isArray(override)) return null;
  if (override.artifact_id !== snapshot.artifact_id || override.source_run_id !== snapshot.source_run_id) {
    throw new Error("Release override must bind the exact artifact and source run");
  }
  if (!String(override.actor || "").trim() || Number.isNaN(Date.parse(String(override.recorded_at || "")))) {
    throw new Error("Release override requires actor and recorded_at");
  }
  if (override.visibility !== undefined && override.visibility !== snapshot.publication.visibility) {
    throw new Error("Release override visibility must match the approved snapshot");
  }
  if (
    (override.period_start !== undefined && override.period_start !== snapshot.content.period.start) ||
    (override.period_end !== undefined && override.period_end !== snapshot.content.period.end)
  ) {
    throw new Error("Release override period must match the approved snapshot");
  }
  if (override.publish_at !== undefined && Number.isNaN(Date.parse(String(override.publish_at)))) {
    throw new Error("Invalid release override publish_at");
  }
  if (override.hold !== undefined && typeof override.hold !== "boolean") {
    throw new Error("Invalid release override hold");
  }
  return override;
}

async function loadWeeklyReleaseOverride(filePath, snapshot) {
  if (!filePath) return null;
  let document;
  try {
    document = JSON.parse(await fsp.readFile(filePath, "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
  if (
    !document ||
    document.schema_version !== "weekly-insight-release-overrides/v1" ||
    !Array.isArray(document.overrides)
  ) {
    throw new Error("Invalid weekly release override sidecar");
  }
  const matches = document.overrides.filter((override) => (
    override?.artifact_id === snapshot.artifact_id || override?.source_run_id === snapshot.source_run_id
  ));
  if (matches.length > 1) throw new Error("Duplicate weekly release override for artifact or source run");
  const override = matches[0];
  if (!override) return null;
  for (const key of Object.keys(override)) {
    if (!OVERRIDE_FIELDS.has(key)) throw new Error(`Unknown weekly release override field: ${key}`);
  }
  return requireRecordedOverride(snapshot, override);
}

function evaluateWeeklyRelease(snapshot, options = {}) {
  const now = options.now instanceof Date ? options.now : new Date(options.now || Date.now());
  if (Number.isNaN(now.valueOf())) throw new Error("Invalid release evaluation time");
  if (
    snapshot.schema_version === "weekly-insight-publication/v4" &&
    snapshot.content.issue_kind === "empty_preview"
  ) {
    return {
      eligible: false,
      reason: "empty_preview_not_publishable",
      time_zone: RELEASE_TIME_ZONE,
      publish_at: null,
    };
  }
  if (snapshot.publication.public_enabled !== true) {
    return {
      eligible: true,
      reason: "internal_preview",
      time_zone: RELEASE_TIME_ZONE,
      publish_at: null,
    };
  }
  const override = requireRecordedOverride(snapshot, options.override);
  const publishAt = String(override?.publish_at || defaultPublishAt(snapshot));
  if (override?.hold === true) {
    return {
      eligible: false,
      reason: "held_by_override",
      time_zone: RELEASE_TIME_ZONE,
      publish_at: publishAt,
    };
  }
  const eligible = now.valueOf() >= Date.parse(publishAt);
  return {
    eligible,
    reason: eligible ? "release_window_open" : "before_release_window",
    time_zone: RELEASE_TIME_ZONE,
    publish_at: publishAt,
  };
}

module.exports = {
  RELEASE_TIME_ZONE,
  DEFAULT_RELEASE_CLOCK,
  defaultPublishAt,
  evaluateWeeklyRelease,
  loadWeeklyReleaseOverride,
};
