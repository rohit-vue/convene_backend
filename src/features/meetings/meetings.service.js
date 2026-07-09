import { supabase } from "../../config/supabase.js";
import * as meetingsRepo from "./meetings.repository.js";
import { meetingUpdatePayload } from "./meetings.validator.js";
import { canAccessMeeting } from "../../shared/meeting-access.js";
import { createMeetingAssignedNotification } from "../notifications/notifications.service.js";
import * as notificationsRepo from "../notifications/notifications.repository.js";

export function enrichMeetingWithLatest(meeting, latestUpdate) {
  return {
    ...meeting,
    meeting_at: latestUpdate?.meeting_at ?? meeting.meeting_at ?? null,
    meeting_outcome: latestUpdate?.meeting_outcome ?? meeting.meeting_outcome ?? null,
    latest_update_id: latestUpdate?.id ?? null,
  };
}

function enrichMeetingWithEmployee(meeting, nameById) {
  if (!meeting) return meeting;
  return {
    ...meeting,
    employee_name: meeting.employee_id ? nameById[meeting.employee_id] || null : null,
  };
}

export async function enrichMeetings(meetings, { withLatest = false } = {}) {
  const rows = meetings || [];
  const nameById = await meetingsRepo.getEmployeeNamesByIds(rows.map((m) => m.employee_id));

  if (!withLatest) {
    return rows.map((m) => enrichMeetingWithEmployee(m, nameById));
  }

  const latestById = await meetingsRepo.getLatestUpdatesByMeetingIds(rows.map((m) => m.id));
  return rows.map((m) =>
    enrichMeetingWithEmployee(enrichMeetingWithLatest(m, latestById[m.id]), nameById),
  );
}

export async function getMeetingForUser(req, meetingId) {
  const data = await meetingsRepo.findMeetingById(meetingId);
  if (!data) return { error: "Meeting not found", status: 404 };
  if (!canAccessMeeting(req, data)) {
    return { error: "Forbidden", status: 403 };
  }
  return { data };
}

export async function syncParentMeetingFromLatestUpdate(meetingId, updatedBy) {
  const latestById = await meetingsRepo.getLatestUpdatesByMeetingIds([meetingId]);
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

export async function listMeetings(req) {
  const acceptedOnly = !req.isAdmin;
  const data = await meetingsRepo.listMeetingsForUser(req, { acceptedOnly });
  return enrichMeetings(data);
}

export async function listPendingMeetings(req) {
  if (req.isAdmin) return [];
  const data = await meetingsRepo.listPendingMeetingsForUser(req);
  return enrichMeetings(data);
}

export async function getMeetingDetail(req, meetingId) {
  const result = await getMeetingForUser(req, meetingId);
  if (result.error) return result;

  const latestById = await meetingsRepo.getLatestUpdatesByMeetingIds([meetingId]);
  const [enriched] = await enrichMeetings(
    [enrichMeetingWithLatest(result.data, latestById[meetingId])],
    { withLatest: false },
  );
  return { data: enriched };
}

export async function createMeeting(req, body) {
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
  } = body;

  if (!project_name || !client_name || !meeting_at || !meeting_outcome) {
    return {
      error: "project_name, client_name, meeting_at and meeting_outcome are required",
      status: 400,
    };
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("id")
    .eq("id", req.user.id)
    .single();

  if (profileError || !profile) {
    return { error: "User profile not found", status: 400 };
  }

  let meeting;
  try {
    meeting = await meetingsRepo.insertMeeting({
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
      assignment_status: "accepted",
      accepted_at: new Date().toISOString(),
      created_by: req.user.id,
      updated_by: req.user.id,
    });
  } catch (err) {
    return { error: err.message, status: 400 };
  }

  let update;
  try {
    update = await meetingsRepo.insertMeetingUpdate({
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
    });
  } catch (err) {
    await meetingsRepo.deleteMeeting(meeting.id);
    return { error: err.message, status: 400 };
  }

  await syncParentMeetingFromLatestUpdate(meeting.id, req.user.id);

  const [enriched] = await enrichMeetings([enrichMeetingWithLatest(meeting, update)], {
    withLatest: false,
  });
  return { data: enriched, status: 201 };
}

export async function assignMeeting(req, body) {
  if (!req.isAdmin) {
    return { error: "Admin access required", status: 403 };
  }

  const { employee_id, project_name, client_name, upwork_account, link_url, meeting_at } = body;

  if (!employee_id || !project_name || !client_name || !meeting_at) {
    return {
      error: "employee_id, project_name, client_name and meeting_at are required",
      status: 400,
    };
  }

  const employee = await meetingsRepo.findEmployeeProfile(employee_id);
  if (!employee || employee.role !== "employee") {
    return { error: "Valid employee is required", status: 400 };
  }

  let meeting;
  try {
    meeting = await meetingsRepo.insertMeeting({
      project_name,
      client_name,
      employee_id,
      upwork_account: upwork_account || null,
      link_url: link_url || null,
      meeting_at,
      assignment_status: "pending",
      assigned_by: req.user.id,
      created_by: req.user.id,
      updated_by: req.user.id,
    });
  } catch (err) {
    return { error: err.message, status: 400 };
  }

  try {
    await createMeetingAssignedNotification({
      userId: employee_id,
      meetingId: meeting.id,
      projectName: project_name,
    });
  } catch (err) {
    await meetingsRepo.deleteMeeting(meeting.id);
    return { error: err.message, status: 400 };
  }

  const [enriched] = await enrichMeetings([meeting], { withLatest: false });
  return { data: enriched, status: 201 };
}

export async function acceptMeeting(req, meetingId) {
  if (req.isAdmin) {
    return { error: "Only employees can accept meetings", status: 403 };
  }

  const meeting = await meetingsRepo.findMeetingById(meetingId);
  if (!meeting) return { error: "Meeting not found", status: 404 };
  if (meeting.employee_id !== req.user.id) {
    return { error: "Forbidden", status: 403 };
  }
  if (meeting.assignment_status !== "pending") {
    return { error: "Meeting is not pending acceptance", status: 400 };
  }

  try {
    const data = await meetingsRepo.updateMeeting(meetingId, {
      assignment_status: "accepted",
      accepted_at: new Date().toISOString(),
      updated_by: req.user.id,
    });
    await notificationsRepo.markNotificationsReadForMeeting(req.user.id, meetingId);
    const [enriched] = await enrichMeetings([data], { withLatest: false });
    return { data: enriched };
  } catch (err) {
    return { error: err.message, status: 400 };
  }
}

export async function updateMeetingParent(req, meetingId, body) {
  const result = await getMeetingForUser(req, meetingId);
  if (result.error) return result;

  const { project_name, client_name, project_type, upwork_account, job_description, link_url } =
    body;

  if (!project_name || !client_name) {
    return { error: "project_name and client_name are required", status: 400 };
  }

  try {
    const data = await meetingsRepo.updateMeeting(meetingId, {
      project_name,
      client_name,
      project_type: project_type || null,
      upwork_account: upwork_account || null,
      job_description: job_description || null,
      link_url: link_url || null,
      updated_by: req.user.id,
    });

    const latestById = await meetingsRepo.getLatestUpdatesByMeetingIds([meetingId]);
    const [enriched] = await enrichMeetings(
      [enrichMeetingWithLatest(data, latestById[meetingId])],
      { withLatest: false },
    );
    return { data: enriched };
  } catch (err) {
    return { error: err.message, status: 400 };
  }
}

export async function listUpdates(req, meetingId) {
  const result = await getMeetingForUser(req, meetingId);
  if (result.error) return result;

  try {
    const data = await meetingsRepo.listMeetingUpdates(meetingId);
    return { data };
  } catch (err) {
    return { error: err.message, status: 500 };
  }
}

export async function createUpdate(req, meetingId, body) {
  const result = await getMeetingForUser(req, meetingId);
  if (result.error) return result;

  const { meeting_at, meeting_outcome } = body;
  if (!meeting_at || !meeting_outcome) {
    return { error: "meeting_at and meeting_outcome are required", status: 400 };
  }

  try {
    const data = await meetingsRepo.insertMeetingUpdate({
      meeting_id: meetingId,
      ...meetingUpdatePayload(body),
      created_by: req.user.id,
      updated_by: req.user.id,
    });
    await syncParentMeetingFromLatestUpdate(meetingId, req.user.id);
    return { data, status: 201 };
  } catch (err) {
    return { error: err.message, status: 400 };
  }
}

export async function deleteMeetingById(req, meetingId) {
  const result = await getMeetingForUser(req, meetingId);
  if (result.error) return result;

  if (!req.isAdmin && result.data.employee_id !== req.user.id && result.data.created_by !== req.user.id) {
    return { error: "Forbidden", status: 403 };
  }

  try {
    await notificationsRepo.deleteNotificationsForMeeting(meetingId);
    await meetingsRepo.deleteMeetingUpdates(meetingId);
    await meetingsRepo.deleteMeeting(meetingId);
    return { status: 204 };
  } catch (err) {
    return { error: err.message, status: 400 };
  }
}

export async function updateUpdate(req, meetingId, updateId, body) {
  const result = await getMeetingForUser(req, meetingId);
  if (result.error) return result;

  const existing = await meetingsRepo.findMeetingUpdate(meetingId, updateId);
  if (!existing) return { error: "Meeting update not found", status: 404 };

  const { meeting_at, meeting_outcome } = body;
  if (!meeting_at) return { error: "meeting_at is required", status: 400 };
  if (!meeting_outcome) return { error: "meeting_outcome is required", status: 400 };

  try {
    const data = await meetingsRepo.updateMeetingUpdate(updateId, {
      ...meetingUpdatePayload(body),
      updated_by: req.user.id,
      updated_at: new Date().toISOString(),
    });
    await syncParentMeetingFromLatestUpdate(meetingId, req.user.id);
    return { data };
  } catch (err) {
    return { error: err.message, status: 400 };
  }
}
