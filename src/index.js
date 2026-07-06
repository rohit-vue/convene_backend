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
  req.isAdmin = profile?.role === "admin";
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

app.get("/api/health", (req, res) => {
  res.json({ status: "ok", service: "convene-backend" });
});

app.get("/api/dashboard/stats", async (req, res) => {
  const { count: meetingsCount } = await supabase
    .from("meetings")
    .select("*", { count: "exact", head: true });

  const { count: employeesCount } = await supabase
    .from("profiles")
    .select("*", { count: "exact", head: true })
    .eq("role", "employee");

  res.json({
    meetings: meetingsCount ?? 0,
    employees: employeesCount ?? 0,
    revenue: 84200,
    tasksDone: 76,
  });
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

// Create a meeting. created_by is taken from the verified token, not the client.
app.post("/api/meetings", requireAuth, async (req, res) => {
  const {
    project_name,
    client_name,
    employee_id,
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

  if (
    !project_name ||
    !client_name ||
    !employee_id ||
    !meeting_at ||
    !meeting_outcome
  ) {
    return res.status(400).json({
      error:
        "project_name, client_name, employee_id, meeting_at and meeting_outcome are required",
    });
  }

  const employee = await resolveEmployeeForMeeting(employee_id);
  if (employee.error) return res.status(400).json({ error: employee.error });

  const { data, error } = await supabase
    .from("meetings")
    .insert({
      project_name,
      client_name,
      employee_id: employee.id,
      employee_name: employee.name,
      project_type: project_type || null,
      upwork_account: upwork_account || null,
      job_description: job_description || null,
      meeting_at,
      duration_minutes: duration_minutes ? Number(duration_minutes) : null,
      meeting_outcome,
      budget_discussed: budget_discussed || null,
      deadline: deadline || null,
      notes: notes || null,
      requirements_discussed: requirements_discussed || null,
      link_url: link_url || null,
      created_by: req.user.id,
      updated_by: req.user.id,
    })
    .select()
    .single();

  if (error) return res.status(400).json({ error: error.message });
  res.status(201).json(data);
});

// Meeting detail: only the owner or an admin may view it.
app.get("/api/meetings/:id", requireAuth, async (req, res) => {
  const { data, error } = await supabase
    .from("meetings")
    .select("*")
    .eq("id", req.params.id)
    .single();

  if (error || !data) return res.status(404).json({ error: "Meeting not found" });
  if (!req.isAdmin && data.created_by !== req.user.id) {
    return res.status(403).json({ error: "Forbidden" });
  }
  res.json(data);
});

// Update a meeting: only the owner or an admin may edit it.
app.put("/api/meetings/:id", requireAuth, async (req, res) => {
  const { data: existing, error: findError } = await supabase
    .from("meetings")
    .select("created_by")
    .eq("id", req.params.id)
    .single();

  if (findError || !existing) return res.status(404).json({ error: "Meeting not found" });
  if (!req.isAdmin && existing.created_by !== req.user.id) {
    return res.status(403).json({ error: "Forbidden" });
  }

  const {
    project_name,
    client_name,
    employee_id,
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

  if (
    !project_name ||
    !client_name ||
    !employee_id ||
    !meeting_at ||
    !meeting_outcome
  ) {
    return res.status(400).json({
      error:
        "project_name, client_name, employee_id, meeting_at and meeting_outcome are required",
    });
  }

  const employee = await resolveEmployeeForMeeting(employee_id);
  if (employee.error) return res.status(400).json({ error: employee.error });

  const { data, error } = await supabase
    .from("meetings")
    .update({
      project_name,
      client_name,
      employee_id: employee.id,
      employee_name: employee.name,
      project_type: project_type || null,
      upwork_account: upwork_account || null,
      job_description: job_description || null,
      meeting_at,
      duration_minutes: duration_minutes ? Number(duration_minutes) : null,
      meeting_outcome,
      budget_discussed: budget_discussed || null,
      deadline: deadline || null,
      notes: notes || null,
      requirements_discussed: requirements_discussed || null,
      link_url: link_url || null,
      updated_by: req.user.id,
    })
    .eq("id", req.params.id)
    .select()
    .single();

  if (error) return res.status(400).json({ error: error.message });
  res.json(data);
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
  if (!req.isAdmin && data.created_by !== req.user.id) {
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

// List projects: admins see all, everyone else sees only their own.
app.get("/api/projects", requireAuth, async (req, res) => {
  let query = supabase
    .from("projects")
    .select("*")
    .order("created_at", { ascending: false });

  if (!req.isAdmin) query = query.eq("created_by", req.user.id);

  const { data, error } = await query;
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// Create a project. created_by is taken from the verified token, not the client.
app.post("/api/projects", requireAuth, async (req, res) => {
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
app.get("/api/projects/:id", requireAuth, async (req, res) => {
  const result = await getProjectForUser(req, req.params.id);
  if (result.error) return res.status(result.status).json({ error: result.error });
  res.json(result.data);
});

// Status change history for a project.
app.get("/api/projects/:id/status-history", requireAuth, async (req, res) => {
  const result = await getProjectForUser(req, req.params.id);
  if (result.error) return res.status(result.status).json({ error: result.error });

  const { data: rows, error } = await supabase
    .from("project_status_history")
    .select("id, from_status, to_status, comment, changed_by, created_at")
    .eq("project_id", req.params.id)
    .order("created_at", { ascending: false });

  if (error) return res.status(500).json({ error: error.message });

  const userIds = [...new Set((rows || []).map((row) => row.changed_by))];
  let nameById = {};
  if (userIds.length) {
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, full_name")
      .in("id", userIds);
    nameById = Object.fromEntries((profiles || []).map((p) => [p.id, p.full_name]));
  }

  res.json(
    (rows || []).map((row) => ({
      ...row,
      changed_by_name: nameById[row.changed_by] || null,
    })),
  );
});

// Change project status (comment required). Updates project and appends timeline entry.
app.post("/api/projects/:id/status", requireAuth, async (req, res) => {
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
app.patch("/api/projects/:id", requireAuth, async (req, res) => {
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
app.delete("/api/projects/:id", requireAuth, async (req, res) => {
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

app.get("/api/employees/:id", requireAuth, async (req, res) => {
  try {
    const employee = await getEmployeeById(req.params.id);
    if (!employee) return res.status(404).json({ error: "Employee not found" });

    const { data: meetings, error: meetingsError } = await supabase
      .from("meetings")
      .select(
        "id, project_name, client_name, meeting_at, meeting_outcome, project_type",
      )
      .eq("employee_id", req.params.id)
      .order("meeting_at", { ascending: false });

    if (meetingsError) return res.status(500).json({ error: meetingsError.message });

    const { data: projects, error: projectsError } = await supabase
      .from("projects")
      .select("id, name, client_name, status, start_date, created_at")
      .eq("assigned_to", req.params.id)
      .order("created_at", { ascending: false });

    if (projectsError) return res.status(500).json({ error: projectsError.message });

    res.json({
      ...employee,
      meetings: meetings || [],
      projects: projects || [],
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get("/api/employees", requireAuth, async (req, res) => {
  try {
    const employees = await getEmployeeUsers();
    res.json(employees);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => console.log(`Convene API running on http://localhost:${PORT}`));
