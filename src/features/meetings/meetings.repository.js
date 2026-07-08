import { supabase } from "../../config/supabase.js";
import { applyEmployeeMeetingScope } from "../../shared/meeting-access.js";

const LIST_COLUMNS =
  "id, project_name, client_name, employee_id, employee_name, project_type, upwork_account, meeting_at, meeting_outcome, assignment_status, accepted_at, created_at";

export async function findMeetingById(meetingId) {
  const { data, error } = await supabase
    .from("meetings")
    .select("*")
    .eq("id", meetingId)
    .single();

  if (error || !data) return null;
  return data;
}

export async function listMeetingsForUser(req, { acceptedOnly = false } = {}) {
  let query = supabase.from("meetings").select(LIST_COLUMNS).order("meeting_at", { ascending: false });

  if (!req.isAdmin) {
    query = applyEmployeeMeetingScope(query, req.user.id);
    if (acceptedOnly) query = query.eq("assignment_status", "accepted");
  }

  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return data;
}

export async function listPendingMeetingsForUser(req) {
  const { data, error } = await supabase
    .from("meetings")
    .select(LIST_COLUMNS)
    .eq("employee_id", req.user.id)
    .eq("assignment_status", "pending")
    .order("meeting_at", { ascending: true });

  if (error) throw new Error(error.message);
  return data || [];
}

export async function insertMeeting(row) {
  const { data, error } = await supabase.from("meetings").insert(row).select().single();
  if (error) throw new Error(error.message);
  return data;
}


export async function updateMeeting(id, updates) {
  const { data, error } = await supabase
    .from("meetings")
    .update(updates)
    .eq("id", id)
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data;
}

export async function findEmployeeProfile(employeeId) {
  const { data, error } = await supabase
    .from("profiles")
    .select("id, full_name, role")
    .eq("id", employeeId)
    .single();
  if (error || !data) return null;
  return data;
}

export async function deleteMeetingUpdates(meetingId) {
  const { error } = await supabase.from("meeting_updates").delete().eq("meeting_id", meetingId);
  if (error) throw new Error(error.message);
}

export async function deleteMeeting(id) {
  const { error } = await supabase.from("meetings").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

export async function listMeetingUpdates(meetingId) {
  const { data, error } = await supabase
    .from("meeting_updates")
    .select("*")
    .eq("meeting_id", meetingId)
    .order("meeting_at", { ascending: false });
  if (error) throw new Error(error.message);
  return data || [];
}

export async function findMeetingUpdate(meetingId, updateId) {
  const { data, error } = await supabase
    .from("meeting_updates")
    .select("id, meeting_id")
    .eq("id", updateId)
    .eq("meeting_id", meetingId)
    .single();
  if (error || !data) return null;
  return data;
}

export async function insertMeetingUpdate(row) {
  const { data, error } = await supabase.from("meeting_updates").insert(row).select().single();
  if (error) throw new Error(error.message);
  return data;
}

export async function updateMeetingUpdate(updateId, updates) {
  const { data, error } = await supabase
    .from("meeting_updates")
    .update(updates)
    .eq("id", updateId)
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data;
}

export async function getLatestUpdatesByMeetingIds(meetingIds) {
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

export async function getEmployeeNamesByIds(employeeIds) {
  const ids = [...new Set(employeeIds.filter(Boolean))];
  if (!ids.length) return {};

  const { data, error } = await supabase
    .from("profiles")
    .select("id, full_name")
    .in("id", ids);

  if (error) throw new Error(error.message);
  return Object.fromEntries((data || []).map((p) => [p.id, p.full_name || "Unknown"]));
}

export async function findMeetingForEmployee(employeeId, meetingId) {
  const { data, error } = await supabase
    .from("meetings")
    .select("*")
    .eq("id", meetingId)
    .eq("employee_id", employeeId)
    .single();
  if (error || !data) return null;
  return data;
}

export async function listAllMeetingsForExport() {
  const { data, error } = await supabase
    .from("meetings")
    .select("*")
    .order("meeting_at", { ascending: false });

  if (error) throw new Error(error.message);
  return data || [];
}

export async function listMeetingUpdatesByMeetingIds(meetingIds) {
  if (!meetingIds.length) return [];

  const { data, error } = await supabase
    .from("meeting_updates")
    .select("*")
    .in("meeting_id", meetingIds)
    .order("meeting_at", { ascending: false });

  if (error) throw new Error(error.message);
  return data || [];
}

export async function listMeetingsByEmployeeId(employeeId) {
  const { data, error } = await supabase
    .from("meetings")
    .select(
      "id, project_name, client_name, project_type, upwork_account, duration_minutes, budget_discussed, deadline, meeting_at, assignment_status, accepted_at, created_at",
    )
    .eq("employee_id", employeeId)
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return data || [];
}
