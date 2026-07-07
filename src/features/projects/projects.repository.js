import { supabase } from "../../config/supabase.js";

export async function listByCreator(userId) {
  const { data, error } = await supabase
    .from("projects")
    .select("*")
    .eq("created_by", userId)
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return data;
}

export async function findById(projectId) {
  const { data, error } = await supabase
    .from("projects")
    .select("*")
    .eq("id", projectId)
    .single();
  if (error || !data) return null;
  return data;
}

export async function findCreatedBy(projectId) {
  const { data, error } = await supabase
    .from("projects")
    .select("created_by")
    .eq("id", projectId)
    .single();
  if (error || !data) return null;
  return data;
}

export async function insert(row) {
  const { data, error } = await supabase.from("projects").insert(row).select().single();
  if (error) throw new Error(error.message);
  return data;
}

export async function update(projectId, updates) {
  const { data, error } = await supabase
    .from("projects")
    .update(updates)
    .eq("id", projectId)
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data;
}

export async function remove(projectId) {
  const { error } = await supabase.from("projects").delete().eq("id", projectId);
  if (error) throw new Error(error.message);
}

export async function insertStatusHistory(row) {
  const { error } = await supabase.from("project_status_history").insert(row);
  if (error) throw new Error(error.message);
}

export async function getStatusHistory(projectId) {
  const { data: rows, error } = await supabase
    .from("project_status_history")
    .select("id, from_status, to_status, comment, changed_by, created_at")
    .eq("project_id", projectId)
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return rows || [];
}

export async function insertMilestoneCostHistory(row) {
  const { error } = await supabase.from("project_milestone_cost_history").insert(row);
  if (error) throw new Error(error.message);
}

export async function getMilestoneCostHistory(projectId) {
  const { data: rows, error } = await supabase
    .from("project_milestone_cost_history")
    .select("id, from_cost, to_cost, comment, changed_by, created_at")
    .eq("project_id", projectId)
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return rows || [];
}

export async function listMilestones(projectId) {
  const { data: rows, error } = await supabase
    .from("project_milestones")
    .select(
      "id, project_id, milestone_number, amount, comment, status, created_by, created_at, completed_at",
    )
    .eq("project_id", projectId)
    .order("milestone_number", { ascending: true });
  if (error) throw new Error(error.message);
  return rows || [];
}

export async function getActiveMilestone(projectId) {
  const { data, error } = await supabase
    .from("project_milestones")
    .select("id, milestone_number, amount")
    .eq("project_id", projectId)
    .eq("status", "active")
    .order("milestone_number", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data;
}

export async function insertMilestone(row) {
  const { data, error } = await supabase.from("project_milestones").insert(row).select().single();
  if (error) throw new Error(error.message);
  return data;
}

export async function completeMilestone(milestoneId, completedAt) {
  const { error } = await supabase
    .from("project_milestones")
    .update({ status: "completed", completed_at: completedAt })
    .eq("id", milestoneId);
  if (error) throw new Error(error.message);
}

export async function getDailyLogs(projectId) {
  const { data: rows, error } = await supabase
    .from("project_daily_logs")
    .select(
      "id, project_id, log_date, tasks_done, tracker_minutes, created_by, updated_by, created_at, updated_at",
    )
    .eq("project_id", projectId)
    .order("log_date", { ascending: false })
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return rows || [];
}

export async function findDailyLog(projectId, logId) {
  const { data, error } = await supabase
    .from("project_daily_logs")
    .select("id, project_id, created_by")
    .eq("id", logId)
    .eq("project_id", projectId)
    .single();
  if (error || !data) return null;
  return data;
}

export async function insertDailyLog(row) {
  const { data, error } = await supabase.from("project_daily_logs").insert(row).select().single();
  if (error) throw new Error(error.message);
  return data;
}

export async function updateDailyLog(logId, updates) {
  const { data, error } = await supabase
    .from("project_daily_logs")
    .update(updates)
    .eq("id", logId)
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data;
}

export async function findForEmployee(employeeId, projectId) {
  const { data, error } = await supabase
    .from("projects")
    .select("*")
    .eq("id", projectId)
    .eq("assigned_to", employeeId)
    .single();
  if (error || !data) return null;
  return data;
}

export async function findIdForEmployee(employeeId, projectId) {
  const { data, error } = await supabase
    .from("projects")
    .select("id")
    .eq("id", projectId)
    .eq("assigned_to", employeeId)
    .single();
  if (error || !data) return null;
  return data;
}

export async function listByAssignee(employeeId) {
  const { data, error } = await supabase
    .from("projects")
    .select(
      "id, name, client_name, status, start_date, job_type, job_category, upwork_account, created_at",
    )
    .eq("assigned_to", employeeId)
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return data || [];
}

export async function getLatestMilestonesByProjectIds(projectIds) {
  if (!projectIds.length) return {};

  const { data, error } = await supabase
    .from("project_milestones")
    .select("project_id, milestone_number, amount")
    .in("project_id", projectIds)
    .order("milestone_number", { ascending: false });

  if (error) throw new Error(error.message);

  const latestByProjectId = {};
  for (const row of data || []) {
    if (!latestByProjectId[row.project_id]) {
      latestByProjectId[row.project_id] = row.amount;
    }
  }
  return latestByProjectId;
}

export async function listAllProjectsForExport() {
  const { data, error } = await supabase
    .from("projects")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) throw new Error(error.message);
  return data || [];
}

export async function getProfileNames(userIds) {
  if (!userIds.length) return {};

  const { data, error } = await supabase
    .from("profiles")
    .select("id, full_name")
    .in("id", userIds);
  if (error) throw new Error(error.message);
  return Object.fromEntries((data || []).map((p) => [p.id, p.full_name]));
}
