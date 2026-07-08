import {
  PROJECT_STATUSES,
  PROJECT_PRIORITIES,
  PROJECT_JOB_TYPES,
  PROJECT_JOB_CATEGORIES,
} from "./projects.constants.js";

export function parseMoneyAmount(value) {
  if (value === null || value === undefined || value === "") return null;
  const digits = String(value).replace(/\D/g, "");
  if (!digits) return null;
  return Number(digits);
}

export function validateProjectFields(body, { partial = false } = {}) {
  const errors = [];
  const { status, priority, job_type, job_category } = body;

  if (!partial && !body.name) errors.push("name is required");
  if (status && !PROJECT_STATUSES.includes(status)) errors.push("Invalid status");
  if (priority && !PROJECT_PRIORITIES.includes(priority)) errors.push("Invalid priority");
  if (job_type && !PROJECT_JOB_TYPES.includes(job_type)) errors.push("Invalid job type");
  if (job_category && !PROJECT_JOB_CATEGORIES.includes(job_category)) {
    errors.push("Invalid job category");
  }
  if (body.hourly_rate !== undefined && body.hourly_rate !== null && body.hourly_rate !== "") {
    const rate = parseMoneyAmount(body.hourly_rate);
    if (rate === null || rate < 0) errors.push("hourly_rate must be a non-negative number");
  }

  return errors;
}

export function projectPayload(body, { forInsert = false } = {}) {
  const fields = {
    name: body.name,
    client_name: body.client_name || null,
    description: body.description || null,
    status: body.status || "planning",
    priority: body.priority || "medium",
    start_date: body.start_date || null,
    due_date: body.due_date || null,
    job_description: body.job_description || null,
    requirements: body.requirements || null,
    job_category: body.job_category || null,
    job_type: body.job_type || null,
    upwork_account: body.upwork_account || null,
    link_url: body.link_url || null,
    notes: body.notes || null,
    assigned_to: body.assigned_to || null,
    hourly_rate:
      body.hourly_rate === undefined || body.hourly_rate === null || body.hourly_rate === ""
        ? null
        : parseMoneyAmount(body.hourly_rate),
  };

  if (forInsert) return fields;

  const updates = {};
  for (const [key, value] of Object.entries(fields)) {
    if (key === "status") continue;
    if (body[key] !== undefined) updates[key] = value;
  }
  return updates;
}

export function dailyLogPayload(body, { jobType } = {}) {
  const trackerMinutes =
    jobType === "hourly" && body.tracker_minutes != null ? Number(body.tracker_minutes) : 0;

  return {
    log_date: body.log_date,
    tasks_done: String(body.tasks_done || "").trim(),
    tracker_minutes: trackerMinutes,
  };
}

export function validateDailyLogFields(body, { jobType } = {}) {
  const errors = [];
  const { log_date, tasks_done, tracker_minutes } = dailyLogPayload(body, { jobType });

  if (!log_date) errors.push("log_date is required");
  if (log_date && isFutureLogDate(log_date)) errors.push("log_date cannot be in the future");
  if (!tasks_done) errors.push("tasks_done is required");
  if (jobType === "hourly" && (!Number.isFinite(tracker_minutes) || tracker_minutes < 0)) {
    errors.push("tracker_minutes must be a non-negative number");
  }

  return errors;
}

export function validateMilestoneCostChange(body) {
  const errors = [];
  const milestoneCost = parseMoneyAmount(body.milestone_cost ?? body.amount);
  const comment = String(body.comment || "").trim();

  if (milestoneCost === null || milestoneCost < 0) {
    errors.push("amount must be a non-negative number");
  }
  if (!comment) errors.push("comment is required when adding a milestone");

  return { errors, milestoneCost, comment };
}

export function validateMilestoneUpdate(body) {
  const comment = String(body.comment || "").trim();
  const amount = parseMoneyAmount(body.amount ?? body.milestone_cost);

  if (!comment) return { error: "comment is required" };
  if (amount === null || amount < 0) {
    return { error: "amount must be a non-negative number" };
  }

  return { comment, amount };
}

function isFutureLogDate(logDate) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(logDate)) return false;
  const now = new Date();
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  return logDate > today;
}

/** Normalize a date-only value to a stable ISO timestamp (noon UTC). */
export function dateOnlyToTimestamp(value) {
  if (!value) return null;
  const dateKey = String(value).slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) return null;
  return `${dateKey}T12:00:00.000Z`;
}
