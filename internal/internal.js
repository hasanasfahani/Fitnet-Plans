const SESSION_KEY = "fitnet_internal_admin_key";
const state = { events: [], filter: "all", key: "" };

const loginView = document.querySelector("#login-view");
const dashboardView = document.querySelector("#dashboard-view");
const loginForm = document.querySelector("#login-form");
const keyInput = document.querySelector("#admin-key");
const loginError = document.querySelector("#login-error");
const loadingState = document.querySelector("#loading-state");
const dashboardError = document.querySelector("#dashboard-error");
const emptyState = document.querySelector("#empty-state");
const activityContent = document.querySelector("#activity-content");

loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const key = keyInput.value.trim();
  if (!key) return;
  state.key = key;
  keyInput.value = "";
  await loadDashboard(true);
});

document.querySelector("#refresh-button").addEventListener("click", () => loadDashboard(false));
document.querySelector("#logout-button").addEventListener("click", logout);
document.querySelectorAll("[data-filter]").forEach((button) => {
  button.addEventListener("click", () => {
    state.filter = button.dataset.filter;
    document.querySelectorAll("[data-filter]").forEach((item) => item.classList.toggle("active", item === button));
    renderActivity();
  });
});

const savedKey = sessionStorage.getItem(SESSION_KEY);
if (savedKey) {
  state.key = savedKey;
  loadDashboard(false);
}

async function loadDashboard(fromLogin) {
  setLoading(true);
  hide(loginError);
  hide(dashboardError);
  try {
    const response = await fetch("/api/internal-logs?limit=100", {
      method: "GET",
      headers: { Authorization: `Bearer ${state.key}` },
      cache: "no-store"
    });
    const payload = await response.json().catch(() => ({}));
    if (response.status === 401) {
      sessionStorage.removeItem(SESSION_KEY);
      state.key = "";
      showLoginError("The admin key is incorrect.");
      return;
    }
    if (response.status === 503 && payload.error === "internal_dashboard_not_configured") {
      showLoginError("The internal dashboard has not been configured in Vercel yet.");
      return;
    }
    if (!response.ok) throw new Error("The internal logs are temporarily unavailable.");

    state.events = Array.isArray(payload.events) ? payload.events : [];
    sessionStorage.setItem(SESSION_KEY, state.key);
    loginView.hidden = true;
    dashboardView.hidden = false;
    updateSummary(payload.summary || {});
    document.querySelector("#last-updated").textContent = `Updated ${formatTime(payload.generated_at)}`;
    renderActivity();
  } catch (error) {
    if (fromLogin || dashboardView.hidden) showLoginError(error.message);
    else showDashboardError(error.message);
  } finally {
    setLoading(false);
  }
}

function updateSummary(summary) {
  document.querySelector("#total-count").textContent = number(summary.total);
  document.querySelector("#success-count").textContent = number(summary.success);
  document.querySelector("#failed-count").textContent = number(Number(summary.failed || 0) + Number(summary.partial || 0));
  document.querySelector("#blocked-count").textContent = number(summary.blocked);
}

function renderActivity() {
  const events = state.events.filter(matchesFilter);
  emptyState.hidden = events.length > 0;
  activityContent.hidden = events.length === 0;
  document.querySelector("#activity-rows").innerHTML = events.map(tableRow).join("");
  document.querySelector("#activity-cards").innerHTML = events.map(eventCard).join("");
}

function tableRow(event) {
  return `<tr>
    <td>${escapeHtml(formatTime(event.timestamp))}</td>
    <td>${statusBadge(event.status)}</td>
    <td>${escapeHtml(event.plan_type || "Unknown")}</td>
    <td>${escapeHtml(readable(event.stage))}</td>
    <td class="${event.error_code ? "" : "subtle"}">${escapeHtml(event.error_code ? readable(event.error_code) : "—")}</td>
    <td>${escapeHtml(formatDuration(event.duration_ms))}</td>
    <td class="reference">${escapeHtml(event.request_id || "—")}</td>
  </tr>`;
}

function eventCard(event) {
  return `<article class="event-card">
    <div class="event-card-head"><strong>${escapeHtml(formatTime(event.timestamp))}</strong>${statusBadge(event.status)}</div>
    <div class="event-grid">
      ${eventField("Plan", event.plan_type || "Unknown")}
      ${eventField("Duration", formatDuration(event.duration_ms))}
      ${eventField("Stage", readable(event.stage))}
      ${eventField("Error", event.error_code ? readable(event.error_code) : "—")}
      ${eventField("Reference", event.request_id || "—", "reference")}
    </div>
  </article>`;
}

function eventField(label, value, className = "") {
  return `<div class="event-field"><span>${escapeHtml(label)}</span><strong class="${className}">${escapeHtml(value)}</strong></div>`;
}

function matchesFilter(event) {
  if (state.filter === "all") return true;
  if (state.filter === "failed") return ["failed", "partial"].includes(event.status);
  return event.status === state.filter;
}

function statusBadge(status) {
  const safeStatus = ["success", "partial", "failed", "blocked"].includes(status) ? status : "failed";
  return `<span class="status-badge ${safeStatus}">${escapeHtml(safeStatus)}</span>`;
}

function readable(value) {
  const text = String(value || "unknown").replace(/[_:.-]+/g, " ").trim();
  return text ? text.charAt(0).toUpperCase() + text.slice(1) : "Unknown";
}

function formatTime(value) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "Unknown";
  return new Intl.DateTimeFormat("en-AE", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  }).format(date);
}

function formatDuration(milliseconds) {
  const value = Number(milliseconds || 0);
  if (value < 1000) return `${Math.max(0, Math.round(value))} ms`;
  if (value < 60000) return `${(value / 1000).toFixed(1)} sec`;
  return `${Math.floor(value / 60000)}m ${Math.round((value % 60000) / 1000)}s`;
}

function number(value) {
  return Number(value || 0).toLocaleString("en-AE");
}

function logout() {
  sessionStorage.removeItem(SESSION_KEY);
  state.key = "";
  state.events = [];
  dashboardView.hidden = true;
  loginView.hidden = false;
  keyInput.focus();
}

function setLoading(loading) {
  loadingState.hidden = !loading || dashboardView.hidden;
  document.querySelector("#refresh-button").disabled = loading;
}

function showLoginError(message) {
  loginView.hidden = false;
  dashboardView.hidden = true;
  loginError.textContent = message;
  loginError.hidden = false;
}

function showDashboardError(message) {
  dashboardError.textContent = message;
  dashboardError.hidden = false;
}

function hide(element) {
  element.hidden = true;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
