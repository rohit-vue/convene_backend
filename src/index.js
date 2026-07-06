import "dotenv/config";
import express from "express";
import cors from "cors";
import { createClient } from "@supabase/supabase-js";

const app = express();

app.use(cors());
app.use(express.json());

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
);

// Verifies the Supabase JWT sent by the frontend and resolves the user's role.
async function requireAuth(req, res, next) {
  const token = req.headers.authorization?.replace("Bearer ", "");
  if (!token) return res.status(401).json({ error: "Missing authorization token" });

  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data?.user) return res.status(401).json({ error: "Unauthorized" });

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", data.user.id)
    .single();

  req.user = data.user;
  req.role = profile?.role ?? null;
  req.isAdmin = profile?.role === "admin";
  next();
}

function requireAdmin(req, res, next) {
  if (!req.isAdmin) return res.status(403).json({ error: "Admin access required" });
  next();
}

function requireEmployee(req, res, next) {
  if (req.role !== "employee") return res.status(403).json({ error: "Employee access required" });
  next();
}

async function getEmployeeUsers() {
  const { data: profiles, error } = await supabase
    .from("profiles")
    .select("id, full_name, role")
    .eq("role", "employee")
    .order("full_name", { ascending: true });

  if (error) throw new Error(error.message);

  const { data: authData, error: authError } = await supabase.auth.admin.listUsers({
    perPage: 1000,
  });
  if (authError) throw new Error(authError.message);

  const emailById = Object.fromEntries(
    (authData.users || []).map((u) => [u.id, u.email]),
  );

  return (profiles || []).map((p) => ({
    id: p.id,
    name: p.full_name || emailById[p.id] || "Unknown",
    email: emailById[p.id] || null,
    role: p.role,
  }));
}

async function getEmployeeById(employeeId) {
  const { data: profile, error } = await supabase
    .from("profiles")
    .select("id, full_name, role")
    .eq("id", employeeId)
    .eq("role", "employee")
    .single();

  if (error || !profile) return null;

  const { data: authData, error: authError } = await supabase.auth.admin.getUserById(employeeId);
  if (authError) throw new Error(authError.message);

  return {
    id: profile.id,
    name: profile.full_name || authData.user?.email || "Unknown",
    email: authData.user?.email || null,
    role: profile.role,
  };
}

async function resolveEmployeeForMeeting(employeeId) {
  const { data, error } = await supabase
    .from("profiles")
    .select("id, full_name, role")
    .eq("id", employeeId)
    .single();

  if (error || !data) return { error: "Employee not found" };
  if (data.role !== "employee") return { error: "Invalid employee" };
  return { id: data.id, name: data.full_name || "Unknown" };
}

async function getMeetingForUser(req, meetingId) {
  const { data, error } = await supabase
    .from("meetings")
    .select("*")
    .eq("id", meetingId)
    .single();

  if (error || !data) return { error: "Meeting not found", status: 404 };
  if (!req.isAdmin && data.created_by !== req.user.id) {
    return { error: "Forbidden", status: 403 };
  }
  return { data };
}

async function getLatestUpdatesByMeetingIds(meetingIds) {
  if (!meetingIds.length) return {};

  const { data, error } = await supabase
    .from("meeting_updates")
    .select("*")
    .in("meeting_id", meetingIds)
    .order("meeting_at", { ascending: false });

  if (error) throw new Error(error.message);

  const latestByMeetingId = {};
  for (const row of data || []) {
    if (!latestByMeetingId[row.meeting_id]) latestByMeetingId[row.meeting_id] = row;
  }
  return latestByMeetingId;
}

function enrichMeetingWithLatest(meeting, latestUpdate) {
  return {
    ...meeting,
    meeting_at: latestUpdate?.meeting_at ?? meeting.meeting_at ?? null,
    meeting_outcome: latestUpdate?.meeting_outcome ?? meeting.meeting_outcome ?? null,
    latest_update_id: latestUpdate?.id ?? null,
  };
}

async function getEmployeeNamesByIds(employeeIds) {
  const ids = [...new Set(employeeIds.filter(Boolean))];
  if (!ids.length) return {};

  const { data, error } = await supabase
    .from("profiles")
    .select("id, full_name")
    .in("id", ids);

  if (error) throw new Error(error.message);
  return Object.fromEntries((data || []).map((p) => [p.id, p.full_name || "Unknown"]));
}

function enrichMeetingWithEmployee(meeting, nameById) {
  if (!meeting) return meeting;
  return {
    ...meeting,
    employee_name: meeting.employee_id ? nameById[meeting.employee_id] || null : null,
  };
}

async function enrichMeetings(meetings, { withLatest = false } = {}) {
  const rows = meetings || [];
  const nameById = await getEmployeeNamesByIds(rows.map((m) => m.employee_id));

  if (!withLatest) {
    return rows.map((m) => enrichMeetingWithEmployee(m, nameById));
  }

  const latestById = await getLatestUpdatesByMeetingIds(rows.map((m) => m.id));
  return rows.map((m) =>
    enrichMeetingWithEmployee(enrichMeetingWithLatest(m, latestById[m.id]), nameById),
  );
}

function meetingUpdatePayload(body) {
  return {
    meeting_at: body.meeting_at,
    duration_minutes: body.duration_minutes ? Number(body.duration_minutes) : null,
    meeting_outcome: body.meeting_outcome,
    budget_discussed: body.budget_discussed || null,
    deadline: body.deadline || null,
    notes: body.notes || null,
    requirements_discussed: body.requirements_discussed || null,
  };
}

async function syncParentMeetingFromLatestUpdate(meetingId, updatedBy) {
  const latestById = await getLatestUpdatesByMeetingIds([meetingId]);
  const latest = latestById[meetingId];
  if (!latest) return;

  await supabase
    .from("meetings")
    .update({
      meeting_at: latest.meeting_at,
      duration_minutes: latest.duration_minutes,
      meeting_outcome: latest.meeting_outcome,
      budget_discussed: latest.budget_discussed,
      deadline: latest.deadline,
      notes: latest.notes,
      requirements_discussed: latest.requirements_discussed,
      updated_by: updatedBy,
    })
    .eq("id", meetingId);
}

app.get("/api/health", (req, res) => {
  res.json({ status: "ok", service: "convene-backend" });
});

app.get("/api/dashboard/stats", requireAuth, async (req, res) => {
  let meetingsQuery = supabase.from("meetings").select("*", { count: "exact", head: true });
  let projectsQuery = supabase.from("projects").select("*", { count: "exact", head: true });

  if (!req.isAdmin) {
    meetingsQuery = meetingsQuery.eq("created_by", req.user.id);
    projectsQuery = projectsQuery.eq("created_by", req.user.id);
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

  res.json(payload);
});

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

function scopeMeetings(req, columns) {
  let q = supabase.from("meetings").select(columns);
  if (!req.isAdmin) q = q.eq("created_by", req.user.id);
  return q;
}

function scopeProjects(req, columns) {
  let q = supabase.from("projects").select(columns);
  if (!req.isAdmin) q = q.eq("created_by", req.user.id);
  return q;
}

app.get("/api/dashboard/overview", requireAuth, async (req, res) => {
  try {
    const [
      { data: allMeetings, error: meetingsError },
      { data: allProjects, error: projectsError },
    ] = await Promise.all([
      scopeMeetings(
        req,
        "id, project_name, client_name, employee_id, meeting_at, meeting_outcome, created_at",
      ),
      scopeProjects(req, "id, name, client_name, status, start_date, assigned_to, created_at"),
    ]);

    if (meetingsError) throw new Error(meetingsError.message);
    if (projectsError) throw new Error(projectsError.message);

    const meetings = allMeetings || [];
    const projects = allProjects || [];

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

    const activityItems = [];

    for (const m of meetings.slice(0, 10)) {
      activityItems.push({
        at: m.meeting_at || m.created_at,
        text: `Meeting for ${m.project_name}${m.client_name ? ` with ${m.client_name}` : ""}`,
      });
    }

    for (const p of projects.slice(0, 10)) {
      activityItems.push({
        at: p.created_at,
        text: `Project ${p.name} was created`,
      });
    }

    for (const h of historyRows) {
      const name = projectNameById[h.project_id] || "Project";
      activityItems.push({
        at: h.created_at,
        text: `${name} updated to ${statusLabel(h.to_status)}`,
      });
    }

    activityItems.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());

    res.json({
      stats,
      projectStatusBreakdown,
      meetingOutcomeBreakdown,
      activity: activityItems.slice(0, 8),
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get("/api/dashboard/activity", requireAuth, async (req, res) => {
  try {
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
      meetingsQuery = meetingsQuery.eq("created_by", req.user.id);
      projectsQuery = projectsQuery.eq("created_by", req.user.id);
    }

    const [{ data: meetings }, { data: projects }] = await Promise.all([
      meetingsQuery,
      projectsQuery,
    ]);

    const projectNameById = Object.fromEntries((projects || []).map((p) => [p.id, p.name]));

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
      const projectIds = (projects || []).map((p) => p.id);
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

    const items = [];

    for (const m of meetings || []) {
      items.push({
        at: m.meeting_at || m.created_at,
        text: `Meeting for ${m.project_name}${m.client_name ? ` with ${m.client_name}` : ""}`,
      });
    }

    for (const p of projects || []) {
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

    res.json(items.slice(0, 8));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// List meetings: admins see all, everyone else sees only their own.
app.get("/api/meetings", requireAuth, async (req, res) => {
  let query = supabase
    .from("meetings")
    .select(
      "id, project_name, client_name, employee_id, employee_name, project_type, upwork_account, meeting_at, meeting_outcome",
    )
    .order("meeting_at", { ascending: false });

  if (!req.isAdmin) query = query.eq("created_by", req.user.id);

  const { data, error } = await query;
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// Create a parent meeting + its first logistics update.
app.post("/api/meetings", requireAuth, requireEmployee, async (req, res) => {
  const {
    project_name,
    client_name,
    project_type,
    upwork_account,
    job_description,
    meeting_at,
    duration_minutes,
    meeting_outcome,
    budget_discussed,
    deadline,
    notes,
    requirements_discussed,
    link_url,
  } = req.body;

  if (!project_name || !client_name || !meeting_at || !meeting_outcome) {
    return res.status(400).json({
      error: "project_name, client_name, meeting_at and meeting_outcome are required",
    });
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("id")
    .eq("id", req.user.id)
    .single();

  if (profileError || !profile) {
    return res.status(400).json({ error: "User profile not found" });
  }

  const { data: meeting, error: meetingError } = await supabase
    .from("meetings")
    .insert({
      project_name,
      client_name,
      employee_id: profile.id,
      project_type: project_type || null,
      upwork_account: upwork_account || null,
      job_description: job_description || null,
      link_url: link_url || null,
      meeting_at,
      duration_minutes: duration_minutes ? Number(duration_minutes) : null,
      meeting_outcome,
      budget_discussed: budget_discussed || null,
      deadline: deadline || null,
      notes: notes || null,
      requirements_discussed: requirements_discussed || null,
      created_by: req.user.id,
      updated_by: req.user.id,
    })
    .select()
    .single();

  if (meetingError) return res.status(400).json({ error: meetingError.message });

  const { data: update, error: updateError } = await supabase
    .from("meeting_updates")
    .insert({
      meeting_id: meeting.id,
      ...meetingUpdatePayload({
        meeting_at,
        duration_minutes,
        meeting_outcome,
        budget_discussed,
        deadline,
        notes,
        requirements_discussed,
      }),
      created_by: req.user.id,
      updated_by: req.user.id,
    })
    .select()
    .single();

  if (updateError) {
    await supabase.from("meetings").delete().eq("id", meeting.id);
    return res.status(400).json({ error: updateError.message });
  }

  await syncParentMeetingFromLatestUpdate(meeting.id, req.user.id);

  const [enriched] = await enrichMeetings([enrichMeetingWithLatest(meeting, update)], {
    withLatest: false,
  });
  res.status(201).json(enriched);
});

// Timeline: all logistics updates for a meeting.
app.get("/api/meetings/:id/updates", requireAuth, async (req, res) => {
  const result = await getMeetingForUser(req, req.params.id);
  if (result.error) return res.status(result.status).json({ error: result.error });

  const { data, error } = await supabase
    .from("meeting_updates")
    .select("*")
    .eq("meeting_id", req.params.id)
    .order("meeting_at", { ascending: false });

  if (error) return res.status(500).json({ error: error.message });
  res.json(data || []);
});

// Create a new logistics update (follow-up) for an existing meeting.
app.post("/api/meetings/:id/updates", requireAuth, async (req, res) => {
  const result = await getMeetingForUser(req, req.params.id);
  if (result.error) return res.status(result.status).json({ error: result.error });

  const { meeting_at, meeting_outcome } = req.body;
  if (!meeting_at || !meeting_outcome) {
    return res.status(400).json({ error: "meeting_at and meeting_outcome are required" });
  }

  const { data, error } = await supabase
    .from("meeting_updates")
    .insert({
      meeting_id: req.params.id,
      ...meetingUpdatePayload(req.body),
      created_by: req.user.id,
      updated_by: req.user.id,
    })
    .select()
    .single();

  if (error) return res.status(400).json({ error: error.message });

  await syncParentMeetingFromLatestUpdate(req.params.id, req.user.id);

  res.status(201).json(data);
});

// Update a single logistics entry.
app.put("/api/meetings/:id/updates/:updateId", requireAuth, async (req, res) => {
  const result = await getMeetingForUser(req, req.params.id);
  if (result.error) return res.status(result.status).json({ error: result.error });

  const { data: existing, error: findError } = await supabase
    .from("meeting_updates")
    .select("id, meeting_id")
    .eq("id", req.params.updateId)
    .eq("meeting_id", req.params.id)
    .single();

  if (findError || !existing) return res.status(404).json({ error: "Meeting update not found" });

  const { meeting_at, meeting_outcome } = req.body;
  if (!meeting_at) return res.status(400).json({ error: "meeting_at is required" });
  if (!meeting_outcome) return res.status(400).json({ error: "meeting_outcome is required" });

  const { data, error } = await supabase
    .from("meeting_updates")
    .update({
      ...meetingUpdatePayload(req.body),
      updated_by: req.user.id,
      updated_at: new Date().toISOString(),
    })
    .eq("id", req.params.updateId)
    .select()
    .single();

  if (error) return res.status(400).json({ error: error.message });

  await syncParentMeetingFromLatestUpdate(req.params.id, req.user.id);

  res.json(data);
});

// Meeting detail: parent meeting with latest update snapshot.
app.get("/api/meetings/:id", requireAuth, async (req, res) => {
  const result = await getMeetingForUser(req, req.params.id);
  if (result.error) return res.status(result.status).json({ error: result.error });

  const latestById = await getLatestUpdatesByMeetingIds([req.params.id]);
  const [enriched] = await enrichMeetings(
    [enrichMeetingWithLatest(result.data, latestById[req.params.id])],
    { withLatest: false },
  );
  res.json(enriched);
});

// Update parent meeting project/account fields only.
app.put("/api/meetings/:id", requireAuth, async (req, res) => {
  const result = await getMeetingForUser(req, req.params.id);
  if (result.error) return res.status(result.status).json({ error: result.error });

  const {
    project_name,
    client_name,
    project_type,
    upwork_account,
    job_description,
    link_url,
  } = req.body;

  if (!project_name || !client_name) {
    return res.status(400).json({ error: "project_name and client_name are required" });
  }

  const { data, error } = await supabase
    .from("meetings")
    .update({
      project_name,
      client_name,
      project_type: project_type || null,
      upwork_account: upwork_account || null,
      job_description: job_description || null,
      link_url: link_url || null,
      updated_by: req.user.id,
    })
    .eq("id", req.params.id)
    .select()
    .single();

  if (error) return res.status(400).json({ error: error.message });

  const latestById = await getLatestUpdatesByMeetingIds([req.params.id]);
  const [enriched] = await enrichMeetings(
    [enrichMeetingWithLatest(data, latestById[req.params.id])],
    { withLatest: false },
  );
  res.json(enriched);
});

const PROJECT_STATUSES = ["planning", "active", "on_hold", "completed", "cancelled"];
const PROJECT_PRIORITIES = ["low", "medium", "high"];
const PROJECT_JOB_TYPES = ["hourly", "contract"];
const PROJECT_JOB_CATEGORIES = [
  "web_development",
  "mobile_development",
  "ui_ux_design",
  "wordpress",
  "ecommerce",
  "devops",
  "data_ai",
  "qa_testing",
  "other",
];

function validateProjectFields(body, { partial = false } = {}) {
  const errors = [];
  const { status, priority, job_type, job_category } = body;

  if (!partial && !body.name) errors.push("name is required");
  if (status && !PROJECT_STATUSES.includes(status)) errors.push("Invalid status");
  if (priority && !PROJECT_PRIORITIES.includes(priority)) errors.push("Invalid priority");
  if (job_type && !PROJECT_JOB_TYPES.includes(job_type)) errors.push("Invalid job type");
  if (job_category && !PROJECT_JOB_CATEGORIES.includes(job_category)) errors.push("Invalid job category");

  return errors;
}

function projectPayload(body, { forInsert = false } = {}) {
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
  };

  if (forInsert) return fields;

  const updates = {};
  for (const [key, value] of Object.entries(fields)) {
    if (key === "status") continue;
    if (body[key] !== undefined) updates[key] = value;
  }
  return updates;
}

async function getProjectForUser(req, projectId) {
  const { data, error } = await supabase
    .from("projects")
    .select("*")
    .eq("id", projectId)
    .single();

  if (error || !data) return { error: "Project not found", status: 404 };
  if (data.created_by !== req.user.id) {
    return { error: "Forbidden", status: 403 };
  }
  return { data };
}

async function insertStatusHistory({ projectId, fromStatus, toStatus, comment, changedBy }) {
  const { error } = await supabase.from("project_status_history").insert({
    project_id: projectId,
    from_status: fromStatus,
    to_status: toStatus,
    comment,
    changed_by: changedBy,
  });
  if (error) throw new Error(error.message);
}

async function getProjectStatusHistory(projectId) {
  const { data: rows, error } = await supabase
    .from("project_status_history")
    .select("id, from_status, to_status, comment, changed_by, created_at")
    .eq("project_id", projectId)
    .order("created_at", { ascending: false });

  if (error) throw new Error(error.message);

  const userIds = [...new Set((rows || []).map((row) => row.changed_by))];
  let nameById = {};
  if (userIds.length) {
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, full_name")
      .in("id", userIds);
    nameById = Object.fromEntries((profiles || []).map((p) => [p.id, p.full_name]));
  }

  return (rows || []).map((row) => ({
    ...row,
    changed_by_name: nameById[row.changed_by] || null,
  }));
}

function dailyLogPayload(body, { jobType } = {}) {
  const trackerMinutes =
    jobType === "hourly" && body.tracker_minutes != null ? Number(body.tracker_minutes) : 0;

  return {
    log_date: body.log_date,
    tasks_done: String(body.tasks_done || "").trim(),
    tracker_minutes: trackerMinutes,
  };
}

function validateDailyLogFields(body, { jobType } = {}) {
  const errors = [];
  const { log_date, tasks_done, tracker_minutes } = dailyLogPayload(body, { jobType });

  if (!log_date) errors.push("log_date is required");
  if (!tasks_done) errors.push("tasks_done is required");
  if (jobType === "hourly" && (!Number.isFinite(tracker_minutes) || tracker_minutes < 0)) {
    errors.push("tracker_minutes must be a non-negative number");
  }

  return errors;
}

async function getProjectDailyLogs(projectId) {
  const { data: rows, error } = await supabase
    .from("project_daily_logs")
    .select("id, project_id, log_date, tasks_done, tracker_minutes, created_by, updated_by, created_at, updated_at")
    .eq("project_id", projectId)
    .order("log_date", { ascending: false })
    .order("created_at", { ascending: false });

  if (error) throw new Error(error.message);

  const userIds = [
    ...new Set(
      (rows || []).flatMap((row) => [row.created_by, row.updated_by].filter(Boolean)),
    ),
  ];
  let nameById = {};
  if (userIds.length) {
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, full_name")
      .in("id", userIds);
    nameById = Object.fromEntries((profiles || []).map((p) => [p.id, p.full_name]));
  }

  return (rows || []).map((row) => ({
    ...row,
    logged_by_name: nameById[row.created_by] || null,
    updated_by_name: nameById[row.updated_by] || null,
  }));
}

// List projects: employees see only their own.
app.get("/api/projects", requireAuth, requireEmployee, async (req, res) => {
  const { data, error } = await supabase
    .from("projects")
    .select("*")
    .eq("created_by", req.user.id)
    .order("created_at", { ascending: false });
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// Create a project. created_by is taken from the verified token, not the client.
app.post("/api/projects", requireAuth, requireEmployee, async (req, res) => {
  const validationErrors = validateProjectFields(req.body);
  if (validationErrors.length) {
    return res.status(400).json({ error: validationErrors[0] });
  }

  const { data, error } = await supabase
    .from("projects")
    .insert({
      ...projectPayload(req.body, { forInsert: true }),
      created_by: req.user.id,
      assigned_to: req.body.assigned_to || req.user.id,
    })
    .select()
    .single();

  if (error) return res.status(400).json({ error: error.message });

  try {
    await insertStatusHistory({
      projectId: data.id,
      fromStatus: null,
      toStatus: data.status,
      comment: "Project created",
      changedBy: req.user.id,
    });
  } catch (historyErr) {
    return res.status(500).json({ error: historyErr.message });
  }

  res.status(201).json(data);
});

// Fetch a single project. Only the owner or an admin may view it.
app.get("/api/projects/:id", requireAuth, requireEmployee, async (req, res) => {
  const result = await getProjectForUser(req, req.params.id);
  if (result.error) return res.status(result.status).json({ error: result.error });
  res.json(result.data);
});

// Status change history for a project.
app.get("/api/projects/:id/status-history", requireAuth, requireEmployee, async (req, res) => {
  const result = await getProjectForUser(req, req.params.id);
  if (result.error) return res.status(result.status).json({ error: result.error });

  try {
    const history = await getProjectStatusHistory(req.params.id);
    res.json(history);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Daily work logs for a project.
app.get("/api/projects/:id/daily-logs", requireAuth, requireEmployee, async (req, res) => {
  const result = await getProjectForUser(req, req.params.id);
  if (result.error) return res.status(result.status).json({ error: result.error });

  try {
    const logs = await getProjectDailyLogs(req.params.id);
    res.json(logs);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post("/api/projects/:id/daily-logs", requireAuth, requireEmployee, async (req, res) => {
  const result = await getProjectForUser(req, req.params.id);
  if (result.error) return res.status(result.status).json({ error: result.error });

  const validationErrors = validateDailyLogFields(req.body, { jobType: result.data.job_type });
  if (validationErrors.length) {
    return res.status(400).json({ error: validationErrors[0] });
  }

  const payload = dailyLogPayload(req.body, { jobType: result.data.job_type });

  const { data, error } = await supabase
    .from("project_daily_logs")
    .insert({
      project_id: req.params.id,
      ...payload,
      created_by: req.user.id,
      updated_by: req.user.id,
    })
    .select()
    .single();

  if (error) return res.status(400).json({ error: error.message });
  res.status(201).json(data);
});

app.put("/api/projects/:id/daily-logs/:logId", requireAuth, requireEmployee, async (req, res) => {
  const result = await getProjectForUser(req, req.params.id);
  if (result.error) return res.status(result.status).json({ error: result.error });

  const { data: existing, error: findError } = await supabase
    .from("project_daily_logs")
    .select("id, project_id, created_by")
    .eq("id", req.params.logId)
    .eq("project_id", req.params.id)
    .single();

  if (findError || !existing) return res.status(404).json({ error: "Daily log not found" });
  if (existing.created_by !== req.user.id) {
    return res.status(403).json({ error: "Forbidden" });
  }

  const validationErrors = validateDailyLogFields(req.body, { jobType: result.data.job_type });
  if (validationErrors.length) {
    return res.status(400).json({ error: validationErrors[0] });
  }

  const payload = dailyLogPayload(req.body, { jobType: result.data.job_type });

  const { data, error } = await supabase
    .from("project_daily_logs")
    .update({
      ...payload,
      updated_by: req.user.id,
      updated_at: new Date().toISOString(),
    })
    .eq("id", req.params.logId)
    .select()
    .single();

  if (error) return res.status(400).json({ error: error.message });
  res.json(data);
});

// Change project status (comment required). Updates project and appends timeline entry.
app.post("/api/projects/:id/status", requireAuth, requireEmployee, async (req, res) => {
  const result = await getProjectForUser(req, req.params.id);
  if (result.error) return res.status(result.status).json({ error: result.error });

  const { status, comment } = req.body;
  if (!status || !PROJECT_STATUSES.includes(status)) {
    return res.status(400).json({ error: "Valid status is required" });
  }
  if (!comment || !String(comment).trim()) {
    return res.status(400).json({ error: "Comment is required to change status" });
  }
  if (status === result.data.status) {
    return res.status(400).json({ error: "Status is already set to this value" });
  }

  const fromStatus = result.data.status;

  const { data, error } = await supabase
    .from("projects")
    .update({ status, updated_at: new Date().toISOString() })
    .eq("id", req.params.id)
    .select()
    .single();

  if (error) return res.status(400).json({ error: error.message });

  try {
    await insertStatusHistory({
      projectId: req.params.id,
      fromStatus,
      toStatus: status,
      comment: String(comment).trim(),
      changedBy: req.user.id,
    });
  } catch (historyErr) {
    await supabase
      .from("projects")
      .update({ status: fromStatus, updated_at: new Date().toISOString() })
      .eq("id", req.params.id);
    return res.status(500).json({ error: historyErr.message });
  }

  res.json(data);
});

// Update a project details (not status). Only the owner or an admin may edit.
app.patch("/api/projects/:id", requireAuth, requireEmployee, async (req, res) => {
  const { data: existing, error: findErr } = await supabase
    .from("projects")
    .select("created_by")
    .eq("id", req.params.id)
    .single();

  if (findErr || !existing) return res.status(404).json({ error: "Project not found" });
  if (!req.isAdmin && existing.created_by !== req.user.id) {
    return res.status(403).json({ error: "Forbidden" });
  }

  if (req.body.status !== undefined) {
    return res.status(400).json({
      error: "Use POST /api/projects/:id/status to change status with a comment",
    });
  }

  const validationErrors = validateProjectFields(req.body, { partial: true });
  if (validationErrors.length) {
    return res.status(400).json({ error: validationErrors[0] });
  }

  const updates = {
    ...projectPayload(req.body),
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await supabase
    .from("projects")
    .update(updates)
    .eq("id", req.params.id)
    .select()
    .single();

  if (error) return res.status(400).json({ error: error.message });
  res.json(data);
});

// Delete a project. Only the owner or an admin may delete.
app.delete("/api/projects/:id", requireAuth, requireEmployee, async (req, res) => {
  const { data: existing, error: findErr } = await supabase
    .from("projects")
    .select("created_by")
    .eq("id", req.params.id)
    .single();

  if (findErr || !existing) return res.status(404).json({ error: "Project not found" });
  if (!req.isAdmin && existing.created_by !== req.user.id) {
    return res.status(403).json({ error: "Forbidden" });
  }

  const { error } = await supabase.from("projects").delete().eq("id", req.params.id);
  if (error) return res.status(400).json({ error: error.message });
  res.status(204).end();
});

app.get("/api/employees/options", requireAuth, requireEmployee, async (req, res) => {
  try {
    const employees = await getEmployeeUsers();
    res.json(employees.map(({ id, name }) => ({ id, name })));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Admin: view a meeting assigned to an employee (read-only context).
app.get("/api/employees/:employeeId/meetings/:meetingId", requireAuth, requireAdmin, async (req, res) => {
  const employee = await getEmployeeById(req.params.employeeId);
  if (!employee) return res.status(404).json({ error: "Employee not found" });

  const { data, error } = await supabase
    .from("meetings")
    .select("*")
    .eq("id", req.params.meetingId)
    .eq("employee_id", req.params.employeeId)
    .single();

  if (error || !data) return res.status(404).json({ error: "Meeting not found" });
  res.json(data);
});

// Admin: view a project assigned to an employee (read-only context).
app.get("/api/employees/:employeeId/projects/:projectId", requireAuth, requireAdmin, async (req, res) => {
  const employee = await getEmployeeById(req.params.employeeId);
  if (!employee) return res.status(404).json({ error: "Employee not found" });

  const { data, error } = await supabase
    .from("projects")
    .select("*")
    .eq("id", req.params.projectId)
    .eq("assigned_to", req.params.employeeId)
    .single();

  if (error || !data) return res.status(404).json({ error: "Project not found" });
  res.json(data);
});

// Admin: status history for a project in employee context.
app.get(
  "/api/employees/:employeeId/projects/:projectId/status-history",
  requireAuth,
  requireAdmin,
  async (req, res) => {
    const employee = await getEmployeeById(req.params.employeeId);
    if (!employee) return res.status(404).json({ error: "Employee not found" });

    const { data: project, error: projectError } = await supabase
      .from("projects")
      .select("id")
      .eq("id", req.params.projectId)
      .eq("assigned_to", req.params.employeeId)
      .single();

    if (projectError || !project) return res.status(404).json({ error: "Project not found" });

    try {
      const history = await getProjectStatusHistory(req.params.projectId);
      res.json(history);
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  },
);

// Admin: daily logs for a project in employee context.
app.get(
  "/api/employees/:employeeId/projects/:projectId/daily-logs",
  requireAuth,
  requireAdmin,
  async (req, res) => {
    const employee = await getEmployeeById(req.params.employeeId);
    if (!employee) return res.status(404).json({ error: "Employee not found" });

    const { data: project, error: projectError } = await supabase
      .from("projects")
      .select("id")
      .eq("id", req.params.projectId)
      .eq("assigned_to", req.params.employeeId)
      .single();

    if (projectError || !project) return res.status(404).json({ error: "Project not found" });

    try {
      const logs = await getProjectDailyLogs(req.params.projectId);
      res.json(logs);
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  },
);

app.get("/api/employees/:id", requireAuth, requireAdmin, async (req, res) => {
  try {
    const employee = await getEmployeeById(req.params.id);
    if (!employee) return res.status(404).json({ error: "Employee not found" });

    const { data: meetings, error: meetingsError } = await supabase
      .from("meetings")
      .select("id, project_name, client_name, project_type, upwork_account, duration_minutes, budget_discussed, deadline, created_at")
      .eq("employee_id", req.params.id)
      .order("created_at", { ascending: false });

    if (meetingsError) return res.status(500).json({ error: meetingsError.message });

    const enrichedMeetings = await enrichMeetings(meetings, { withLatest: true });
    enrichedMeetings.sort(
      (a, b) => new Date(b.meeting_at || b.created_at) - new Date(a.meeting_at || a.created_at),
    );

    const { data: projects, error: projectsError } = await supabase
      .from("projects")
      .select(
        "id, name, client_name, status, start_date, job_type, job_category, upwork_account, created_at",
      )
      .eq("assigned_to", req.params.id)
      .order("created_at", { ascending: false });

    if (projectsError) return res.status(500).json({ error: projectsError.message });

    res.json({
      ...employee,
      meetings: enrichedMeetings,
      projects: projects || [],
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get("/api/employees", requireAuth, requireAdmin, async (req, res) => {
  try {
    const employees = await getEmployeeUsers();
    res.json(employees);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

function textMatches(term, ...fields) {
  const lower = term.toLowerCase();
  return fields.some((f) => f && String(f).toLowerCase().includes(lower));
}

app.get("/api/search", requireAuth, async (req, res) => {
  try {
    const term = String(req.query.q || "").trim();
    if (term.length < 2) {
      return res.json({ meetings: [], projects: [], employees: [] });
    }

    const [meetingsResult, projectsResult] = await Promise.all([
      scopeMeetings(
        req,
        "id, project_name, client_name, employee_id, employee_name, meeting_at, created_by",
      )
        .order("meeting_at", { ascending: false })
        .limit(300),
      scopeProjects(req, "id, name, client_name, status, assigned_to, created_by, created_at")
        .order("created_at", { ascending: false })
        .limit(300),
    ]);

    if (meetingsResult.error) throw new Error(meetingsResult.error.message);
    if (projectsResult.error) throw new Error(projectsResult.error.message);

    const meetings = (meetingsResult.data || [])
      .filter((m) => textMatches(term, m.project_name, m.client_name, m.employee_name))
      .slice(0, 8);

    const projects = (projectsResult.data || [])
      .filter((p) => textMatches(term, p.name, p.client_name))
      .slice(0, 8);

    let employees = [];
    if (req.isAdmin) {
      const allEmployees = await getEmployeeUsers();
      employees = allEmployees
        .filter((e) => textMatches(term, e.name, e.email))
        .slice(0, 8)
        .map(({ id, name, email }) => ({ id, name, email }));
    }

    res.json({ meetings, projects, employees });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get("/api/profile", requireAuth, async (req, res) => {
  try {
    const { data: profile, error } = await supabase
      .from("profiles")
      .select("full_name, role, employee_code, job_title")
      .eq("id", req.user.id)
      .single();

    if (error) throw new Error(error.message);

    const { data: authData, error: authError } = await supabase.auth.admin.getUserById(req.user.id);
    if (authError) throw new Error(authError.message);

    res.json({
      full_name: profile?.full_name ?? null,
      role: profile?.role ?? "employee",
      employee_code: profile?.employee_code ?? null,
      job_title: profile?.job_title ?? null,
      email: authData.user?.email ?? null,
      created_at: authData.user?.created_at ?? null,
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.patch("/api/profile", requireAuth, async (req, res) => {
  try {
    const { full_name, employee_code, job_title } = req.body ?? {};
    const updates = {};

    if (full_name !== undefined) {
      updates.full_name = String(full_name).trim() || null;
    }
    if (employee_code !== undefined) {
      updates.employee_code = String(employee_code).trim() || null;
    }
    if (job_title !== undefined) {
      updates.job_title = String(job_title).trim() || null;
    }

    if (!Object.keys(updates).length) {
      return res.status(400).json({ error: "No fields to update" });
    }

    const { data, error } = await supabase
      .from("profiles")
      .update(updates)
      .eq("id", req.user.id)
      .select("full_name, role, employee_code, job_title")
      .single();

    if (error) throw new Error(error.message);

    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => console.log(`Convene API running on http://localhost:${PORT}`));
