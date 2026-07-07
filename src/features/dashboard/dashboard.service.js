import { supabase } from "../../config/supabase.js";
import { scopeMeetings, scopeProjects } from "../../shared/query-scope.js";
import { applyEmployeeMeetingScope } from "../../shared/meeting-access.js";
import { applyEmployeeProjectScope } from "../../shared/project-access.js";
import * as meetingsRepo from "../meetings/meetings.repository.js";
import * as projectsRepo from "../projects/projects.repository.js";
import { enrichMeetings } from "../meetings/meetings.service.js";

const STATUS_LABELS = {
  planning: "Planning",
  active: "Active",
  on_hold: "On hold",
  completed: "Completed",
  cancelled: "Cancelled",
};

const PROJECT_STATUS_KEYS = ["planning", "active", "on_hold", "completed", "cancelled"];
const MEETING_OUTCOME_KEYS = [
  "won",
  "holding",
  "not_selected",
  "follow_up_required",
  "pending_reply",
];
const FOLLOW_UP_OUTCOMES = ["follow_up_required", "pending_reply"];

function statusLabel(status) {
  return STATUS_LABELS[status] || status || "Unknown";
}

function emptyBreakdown(keys) {
  return Object.fromEntries(keys.map((k) => [k, 0]));
}

function countByField(rows, field, keys) {
  const counts = emptyBreakdown(keys);
  for (const row of rows || []) {
    const value = row[field];
    if (value && counts[value] !== undefined) counts[value]++;
  }
  return counts;
}

async function loadRecentHistory(req, projects) {
  const projectNameById = Object.fromEntries(projects.map((p) => [p.id, p.name]));
  let historyRows = [];

  if (req.isAdmin) {
    const { data: history, error: historyError } = await supabase
      .from("project_status_history")
      .select("id, project_id, from_status, to_status, comment, created_at")
      .order("created_at", { ascending: false })
      .limit(10);
    if (historyError) throw new Error(historyError.message);
    historyRows = history || [];

    const missingIds = [...new Set(historyRows.map((r) => r.project_id))].filter(
      (id) => !projectNameById[id],
    );
    if (missingIds.length) {
      const { data: namedProjects } = await supabase
        .from("projects")
        .select("id, name")
        .in("id", missingIds);
      for (const p of namedProjects || []) {
        projectNameById[p.id] = p.name;
      }
    }
  } else {
    const projectIds = projects.map((p) => p.id);
    if (projectIds.length) {
      const { data: history, error: historyError } = await supabase
        .from("project_status_history")
        .select("id, project_id, from_status, to_status, comment, created_at")
        .in("project_id", projectIds)
        .order("created_at", { ascending: false })
        .limit(10);
      if (historyError) throw new Error(historyError.message);
      historyRows = history || [];
    }
  }

  return { historyRows, projectNameById };
}

function buildActivityItems(meetings, projects, historyRows, projectNameById) {
  const items = [];

  for (const m of meetings.slice(0, 10)) {
    items.push({
      at: m.meeting_at || m.created_at,
      text: `Meeting for ${m.project_name}${m.client_name ? ` with ${m.client_name}` : ""}`,
    });
  }

  for (const p of projects.slice(0, 10)) {
    items.push({
      at: p.created_at,
      text: `Project ${p.name} was created`,
    });
  }

  for (const h of historyRows) {
    const name = projectNameById[h.project_id] || "Project";
    items.push({
      at: h.created_at,
      text: `${name} updated to ${statusLabel(h.to_status)}`,
    });
  }

  items.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
  return items;
}

export async function getStats(req) {
  let meetingsQuery = supabase.from("meetings").select("*", { count: "exact", head: true });
  let projectsQuery = supabase.from("projects").select("*", { count: "exact", head: true });

  if (!req.isAdmin) {
    meetingsQuery = applyEmployeeMeetingScope(meetingsQuery, req.user.id).eq(
      "assignment_status",
      "accepted",
    );
    projectsQuery = applyEmployeeProjectScope(projectsQuery, req.user.id).eq(
      "assignment_status",
      "accepted",
    );
  }

  const [{ count: meetingsCount }, { count: projectsCount }] = await Promise.all([
    meetingsQuery,
    projectsQuery,
  ]);

  const payload = {
    meetings: meetingsCount ?? 0,
    projects: projectsCount ?? 0,
  };

  if (req.isAdmin) {
    const { count: employeesCount } = await supabase
      .from("profiles")
      .select("*", { count: "exact", head: true })
      .eq("role", "employee");
    payload.employees = employeesCount ?? 0;
  }

  return payload;
}

export async function getOverview(req) {
  const [
    { data: allMeetings, error: meetingsError },
    { data: allProjects, error: projectsError },
  ] = await Promise.all([
    scopeMeetings(
      req,
      "id, project_name, client_name, employee_id, meeting_at, meeting_outcome, created_at, assignment_status",
      { acceptedOnly: !req.isAdmin },
    ),
    scopeProjects(req, "id, name, client_name, status, start_date, assigned_to, created_at", {
      acceptedOnly: !req.isAdmin,
    }),
  ]);

  if (meetingsError) throw new Error(meetingsError.message);
  if (projectsError) throw new Error(projectsError.message);

  const meetings = allMeetings || [];
  const projects = allProjects || [];

  let pendingMeetings = [];
  let pendingProjects = [];
  if (!req.isAdmin) {
    const pending = await meetingsRepo.listPendingMeetingsForUser(req);
    pendingMeetings = await enrichMeetings(pending);
    pendingProjects = await projectsRepo.listPendingForUser(req.user.id);
  }

  const projectStatusBreakdown = countByField(projects, "status", PROJECT_STATUS_KEYS);
  const meetingOutcomeBreakdown = countByField(meetings, "meeting_outcome", MEETING_OUTCOME_KEYS);

  let needsAttentionCount = 0;
  for (const m of meetings) {
    if (FOLLOW_UP_OUTCOMES.includes(m.meeting_outcome)) needsAttentionCount++;
  }
  for (const p of projects) {
    if (p.status === "on_hold") needsAttentionCount++;
  }

  const stats = {
    meetings: meetings.length,
    projects: projects.length,
    needsAttention: needsAttentionCount,
  };

  if (req.isAdmin) {
    const { count: employeesCount } = await supabase
      .from("profiles")
      .select("*", { count: "exact", head: true })
      .eq("role", "employee");
    stats.employees = employeesCount ?? 0;
  }

  const { historyRows, projectNameById } = await loadRecentHistory(req, projects);
  const activity = buildActivityItems(meetings, projects, historyRows, projectNameById).slice(
    0,
    8,
  );

  return {
    stats,
    projectStatusBreakdown,
    meetingOutcomeBreakdown,
    activity,
    pendingMeetings,
    pendingProjects,
  };
}

export async function getActivity(req) {
  let meetingsQuery = supabase
    .from("meetings")
    .select("id, project_name, client_name, meeting_at, created_at")
    .order("meeting_at", { ascending: false })
    .limit(10);

  let projectsQuery = supabase
    .from("projects")
    .select("id, name, status, created_at")
    .order("created_at", { ascending: false })
    .limit(10);

  if (!req.isAdmin) {
    meetingsQuery = applyEmployeeMeetingScope(meetingsQuery, req.user.id).eq(
      "assignment_status",
      "accepted",
    );
    projectsQuery = applyEmployeeProjectScope(projectsQuery, req.user.id).eq(
      "assignment_status",
      "accepted",
    );
  }

  const [{ data: meetings }, { data: projects }] = await Promise.all([
    meetingsQuery,
    projectsQuery,
  ]);

  const { historyRows, projectNameById } = await loadRecentHistory(req, projects || []);
  return buildActivityItems(meetings || [], projects || [], historyRows, projectNameById).slice(
    0,
    8,
  );
}
