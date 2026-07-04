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

// Employees remain mock data for now.
const employees = [
  { id: 1, name: "Aarav Shah", role: "Frontend Developer", email: "aarav@convene.io", status: "Active" },
  { id: 2, name: "Priya Nair", role: "Product Manager", email: "priya@convene.io", status: "Active" },
  { id: 3, name: "Rohan Das", role: "Backend Developer", email: "rohan@convene.io", status: "Away" },
  { id: 4, name: "Meera Iyer", role: "UX Designer", email: "meera@convene.io", status: "Active" },
  { id: 5, name: "Kabir Menon", role: "QA Engineer", email: "kabir@convene.io", status: "Away" },
  { id: 6, name: "Sara Khan", role: "DevOps Engineer", email: "sara@convene.io", status: "Active" },
];

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

app.get("/api/health", (req, res) => {
  res.json({ status: "ok", service: "convene-backend" });
});

app.get("/api/dashboard/stats", async (req, res) => {
  const { count } = await supabase
    .from("meetings")
    .select("*", { count: "exact", head: true });
  res.json({
    meetings: count ?? 0,
    employees: employees.length,
    revenue: 84200,
    tasksDone: 76,
  });
});

// List meetings: admins see all, everyone else sees only their own.
app.get("/api/meetings", requireAuth, async (req, res) => {
  let query = supabase
    .from("meetings")
    .select(
      "id, project_name, client_name, employee_name, project_type, meeting_at, meeting_status, meeting_outcome",
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
    employee_name,
    project_type,
    job_description,
    meeting_at,
    duration_minutes,
    meeting_status,
    meeting_outcome,
    budget_discussed,
    deadline,
    notes,
    requirements_discussed,
  } = req.body;

  if (
    !project_name ||
    !client_name ||
    !employee_name ||
    !meeting_at ||
    !meeting_status ||
    !meeting_outcome
  ) {
    return res.status(400).json({
      error:
        "project_name, client_name, employee_name, meeting_at, meeting_status and meeting_outcome are required",
    });
  }

  const { data, error } = await supabase
    .from("meetings")
    .insert({
      project_name,
      client_name,
      employee_name,
      project_type: project_type || null,
      job_description: job_description || null,
      meeting_at,
      duration_minutes: duration_minutes ? Number(duration_minutes) : null,
      meeting_status,
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

const PROJECT_STATUSES = ["planning", "active", "on_hold", "completed", "cancelled"];
const PROJECT_PRIORITIES = ["low", "medium", "high"];

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
  const { name, client_name, description, status, priority, start_date, due_date } = req.body;

  if (!name) return res.status(400).json({ error: "name is required" });
  if (status && !PROJECT_STATUSES.includes(status)) {
    return res.status(400).json({ error: "Invalid status" });
  }
  if (priority && !PROJECT_PRIORITIES.includes(priority)) {
    return res.status(400).json({ error: "Invalid priority" });
  }

  const { data, error } = await supabase
    .from("projects")
    .insert({
      name,
      client_name: client_name || null,
      description: description || null,
      status: status || "planning",
      priority: priority || "medium",
      start_date: start_date || null,
      due_date: due_date || null,
      created_by: req.user.id,
    })
    .select()
    .single();

  if (error) return res.status(400).json({ error: error.message });
  res.status(201).json(data);
});

// Update a project (status and/or details). Only the owner or an admin may edit.
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

  const { name, client_name, description, status, priority, start_date, due_date } = req.body;

  if (status && !PROJECT_STATUSES.includes(status)) {
    return res.status(400).json({ error: "Invalid status" });
  }
  if (priority && !PROJECT_PRIORITIES.includes(priority)) {
    return res.status(400).json({ error: "Invalid priority" });
  }

  const updates = { updated_at: new Date().toISOString() };
  if (name !== undefined) updates.name = name;
  if (client_name !== undefined) updates.client_name = client_name || null;
  if (description !== undefined) updates.description = description || null;
  if (status !== undefined) updates.status = status;
  if (priority !== undefined) updates.priority = priority;
  if (start_date !== undefined) updates.start_date = start_date || null;
  if (due_date !== undefined) updates.due_date = due_date || null;

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

app.get("/api/employees", (req, res) => {
  res.json(employees);
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => console.log(`Convene API running on http://localhost:${PORT}`));
