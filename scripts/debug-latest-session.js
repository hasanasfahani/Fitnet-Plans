const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const sessionsDir = path.join(root, "output", "api", "sessions");

if (!fs.existsSync(sessionsDir)) {
  console.log("No sessions folder found yet.");
  process.exit(0);
}

const files = fs
  .readdirSync(sessionsDir)
  .filter((file) => file.endsWith(".json"))
  .map((file) => path.join(sessionsDir, file))
  .sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs);

if (!files.length) {
  console.log("No generation sessions found yet.");
  process.exit(0);
}

const session = JSON.parse(fs.readFileSync(files[0], "utf8"));
const events = session.generation_attempts || [];

console.log(
  JSON.stringify(
    {
      session_id: session.session_id,
      status: session.status,
      loading_state: session.loading_state,
      error: session.error || null,
      plan_type: session.choices?.plan_type || null,
      job_started_at: session.job_started_at || null,
      job_timeout_at: session.job_timeout_at || null,
      updated_at: session.updated_at,
      pdf_ready: Boolean(session.pdfs || session.pdf_path),
      download_kinds: Object.keys(session.pdfs || {}),
      event_timeline: events.map((event, index) => ({
        index: index + 1,
        status: event.status,
        reason: event.reason,
        message: event.message || null,
        created_at: event.created_at,
        seconds_since_previous:
          index === 0
            ? 0
            : Math.round((Date.parse(event.created_at) - Date.parse(events[index - 1].created_at)) / 100) / 10
      }))
    },
    null,
    2
  )
);
