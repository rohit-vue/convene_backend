import { PROJECT_STATUSES, INHOUSE_UPWORK_ACCOUNT } from "./projects.constants.js";
import {
  validateProjectFields,
  projectPayload,
  dailyLogPayload,
  validateDailyLogFields,
  validateMilestoneCostChange,
  validateMilestoneUpdate,
  parseMoneyAmount,
  dateOnlyToTimestamp,
} from "./projects.validator.js";
import * as projectsRepo from "./projects.repository.js";
import { scopeProjects } from "../../shared/query-scope.js";
import { isProjectOwner } from "../../shared/project-access.js";
import { createProjectAssignedNotification } from "../notifications/notifications.service.js";
import * as notificationsRepo from "../notifications/notifications.repository.js";

async function resolveProjectAccess(req, project) {
  if (req.isAdmin) {
    return {
      role: "admin",
      can_edit_project: true,
      can_edit_logs: true,
      is_shared: false,
    };
  }
  if (isProjectOwner(req, project)) {
    return {
      role: "owner",
      can_edit_project: true,
      can_edit_logs: true,
      is_shared: false,
    };
  }
  const share = await projectsRepo.findShareForUser(project.id, req.user.id);
  if (!share) return null;
  return {
    role: share.can_edit_logs ? "shared_editor" : "shared_viewer",
    can_edit_project: false,
    can_edit_logs: share.can_edit_logs,
    is_shared: true,
    share_id: share.id,
  };
}

export async function getProjectForUser(req, projectId) {
  const data = await projectsRepo.findById(projectId);
  if (!data) return { error: "Project not found", status: 404 };
  const access = await resolveProjectAccess(req, data);
  if (!access) return { error: "Forbidden", status: 403 };
  return { data: { ...data, access } };
}

async function requireProjectAccess(req, projectId) {
  const result = await getProjectForUser(req, projectId);
  if (result.error) return result;
  return { project: result.data, access: result.data.access };
}

function requireOwnerAccess(access) {
  if (!access.can_edit_project) {
    return { error: "Only the project owner can perform this action", status: 403 };
  }
  return null;
}

function requireLogEditAccess(access) {
  if (!access.can_edit_logs) {
    return { error: "You do not have permission to edit daily logs", status: 403 };
  }
  return null;
}

function canManageDailyLog(access, log, userId) {
  if (!access.can_edit_logs) return false;
  if (access.can_edit_project || access.role === "admin") return true;
  return log.created_by === userId;
}

function effectiveTimestampForProjectStart(startDate, fallback) {
  return dateOnlyToTimestamp(startDate) || fallback;
}

async function wasProjectEverActive(projectId) {
  const history = await projectsRepo.getStatusHistory(projectId);
  return history.some((row) => row.to_status === "active");
}

async function enrichMilestones(rows) {
  const userIds = [...new Set((rows || []).map((row) => row.created_by))];
  const nameById = await projectsRepo.getProfileNames(userIds);
  return (rows || []).map((row) => ({
    ...row,
    created_by_name: nameById[row.created_by] || null,
  }));
}

async function enrichMilestoneCostHistory(rows) {
  const userIds = [...new Set((rows || []).map((row) => row.changed_by))];
  const nameById = await projectsRepo.getProfileNames(userIds);
  return (rows || []).map((row) => ({
    ...row,
    changed_by_name: nameById[row.changed_by] || null,
  }));
}

async function enrichStatusHistory(rows) {
  const userIds = [...new Set((rows || []).map((row) => row.changed_by))];
  const nameById = await projectsRepo.getProfileNames(userIds);
  return (rows || []).map((row) => ({
    ...row,
    changed_by_name: nameById[row.changed_by] || null,
  }));
}

async function enrichDailyLogs(rows) {
  const userIds = [
    ...new Set((rows || []).flatMap((row) => [row.created_by, row.updated_by].filter(Boolean))),
  ];
  const nameById = await projectsRepo.getProfileNames(userIds);
  return (rows || []).map((row) => ({
    ...row,
    logged_by_name: nameById[row.created_by] || null,
    updated_by_name: nameById[row.updated_by] || null,
  }));
}

export async function listProjects(req) {
  try {
    if (req.isAdmin) {
      const { data, error } = await scopeProjects(
        req,
        "id, name, client_name, status, start_date, due_date, job_type, job_category, assigned_to, created_by, assignment_status, created_at",
      ).order("created_at", { ascending: false });

      if (error) throw new Error(error.message);

      const assigneeIds = [...new Set((data || []).map((p) => p.assigned_to).filter(Boolean))];
      const nameById = await projectsRepo.getProfileNames(assigneeIds);

      return {
        data: (data || []).map((p) => ({
          ...p,
          assignee_name: p.assigned_to ? nameById[p.assigned_to] || null : null,
        })),
      };
    }

    const { data, error } = await scopeProjects(req, "*", { acceptedOnly: true }).order(
      "created_at",
      { ascending: false },
    );
    if (error) throw new Error(error.message);

    const owned = (data || []).map((p) => ({
      ...p,
      is_shared: false,
      can_edit_logs: true,
    }));
    const ownedIds = new Set(owned.map((p) => p.id));
    const shareRows = await projectsRepo.listSharedProjectsForUser(req.user.id);
    const shared = [];

    for (const share of shareRows) {
      if (ownedIds.has(share.project_id)) continue;
      const project = await projectsRepo.findById(share.project_id);
      if (!project || project.assignment_status !== "accepted") continue;
      shared.push({
        ...project,
        is_shared: true,
        can_edit_logs: share.can_edit_logs,
        share_id: share.id,
      });
    }

    return { data: [...owned, ...shared] };
  } catch (err) {
    return { error: err.message, status: 500 };
  }
}

export async function createProject(req, body) {
  const validationErrors = validateProjectFields(body);
  if (validationErrors.length) {
    return { error: validationErrors[0], status: 400 };
  }

  try {
    const data = await projectsRepo.insert({
      ...projectPayload(body, { forInsert: true }),
      created_by: req.user.id,
      assigned_to: body.assigned_to || req.user.id,
      assignment_status: "accepted",
      accepted_at: new Date().toISOString(),
    });

    const createdAt =
      data.status === "active"
        ? effectiveTimestampForProjectStart(data.start_date, new Date().toISOString())
        : new Date().toISOString();

    try {
      await projectsRepo.insertStatusHistory({
        project_id: data.id,
        from_status: null,
        to_status: data.status,
        comment: "Project created",
        changed_by: req.user.id,
        created_at: createdAt,
      });
    } catch (historyErr) {
      return { error: historyErr.message, status: 500 };
    }

    return { data, status: 201 };
  } catch (err) {
    return { error: err.message, status: 400 };
  }
}

export async function listPendingProjects(req) {
  if (req.isAdmin) return { data: [] };
  try {
    const data = await projectsRepo.listPendingForUser(req.user.id);
    return { data };
  } catch (err) {
    return { error: err.message, status: 500 };
  }
}

export async function assignProject(req, body) {
  if (!req.isAdmin) {
    return { error: "Admin access required", status: 403 };
  }

  const {
    employee_id,
    name,
    client_name,
    start_date,
    job_category,
    job_type,
    upwork_account,
    link_url,
  } = body;

  if (!employee_id || !name) {
    return {
      error: "employee_id and name are required",
      status: 400,
    };
  }

  const isInhouse = upwork_account === INHOUSE_UPWORK_ACCOUNT;

  const validationErrors = validateProjectFields({
    name,
    client_name,
    job_category,
    job_type,
    upwork_account,
    start_date,
    status: "planning",
  });
  if (validationErrors.length) {
    return { error: validationErrors[0], status: 400 };
  }

  const employee = await projectsRepo.findEmployeeProfile(employee_id);
  if (!employee || employee.role !== "employee") {
    return { error: "Valid employee is required", status: 400 };
  }

  let project;
  try {
    project = await projectsRepo.insert({
      name: String(name).trim(),
      client_name: isInhouse ? null : String(client_name).trim(),
      status: "planning",
      priority: "medium",
      start_date: start_date || null,
      job_category: job_category || null,
      job_type: isInhouse ? null : job_type || null,
      upwork_account: upwork_account || null,
      link_url: isInhouse ? null : link_url || null,
      assigned_to: employee_id,
      assignment_status: "pending",
      assigned_by: req.user.id,
      created_by: req.user.id,
    });
  } catch (err) {
    return { error: err.message, status: 400 };
  }

  try {
    await projectsRepo.insertStatusHistory({
      project_id: project.id,
      from_status: null,
      to_status: project.status,
      comment: "Project assigned",
      changed_by: req.user.id,
    });
  } catch (err) {
    await projectsRepo.remove(project.id);
    return { error: err.message, status: 400 };
  }

  try {
    await createProjectAssignedNotification({
      userId: employee_id,
      projectId: project.id,
      projectName: project.name,
    });
  } catch (err) {
    await projectsRepo.remove(project.id);
    return { error: err.message, status: 400 };
  }

  const nameById = await projectsRepo.getProfileNames([employee_id]);
  return {
    data: {
      ...project,
      assignee_name: nameById[employee_id] || null,
    },
    status: 201,
  };
}

export async function acceptProject(req, projectId) {
  if (req.isAdmin) {
    return { error: "Only employees can accept projects", status: 403 };
  }

  const project = await projectsRepo.findById(projectId);
  if (!project) return { error: "Project not found", status: 404 };
  if (project.assigned_to !== req.user.id) {
    return { error: "Forbidden", status: 403 };
  }
  if (project.assignment_status !== "pending") {
    return { error: "Project is not pending acceptance", status: 400 };
  }

  try {
    const data = await projectsRepo.update(projectId, {
      assignment_status: "accepted",
      accepted_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });
    await notificationsRepo.markNotificationsReadForProject(req.user.id, projectId);
    return { data };
  } catch (err) {
    return { error: err.message, status: 400 };
  }
}

export async function getProject(req, projectId) {
  return getProjectForUser(req, projectId);
}

export async function listMilestones(req, projectId) {
  const result = await getProjectForUser(req, projectId);
  if (result.error) return result;

  try {
    const rows = await projectsRepo.listMilestones(projectId);
    const data = await enrichMilestones(rows);
    return { data };
  } catch (err) {
    return { error: err.message, status: 500 };
  }
}

export async function addMilestone(req, projectId, body) {
  const result = await requireProjectAccess(req, projectId);
  if (result.error) return result;
  const ownerError = requireOwnerAccess(result.access);
  if (ownerError) return ownerError;

  if (result.project.job_type !== "contract") {
    return { error: "Milestones apply only to contract projects", status: 400 };
  }

  if (result.project.status !== "active") {
    return {
      error: "Milestones can only be added while the project status is active",
      status: 400,
    };
  }

  const { errors, milestoneCost, comment } = validateMilestoneCostChange(body);
  if (errors.length) {
    return { error: errors[0], status: 400 };
  }

  try {
    const existing = await projectsRepo.listMilestones(projectId);
    const active = existing.find((row) => row.status === "active");
    const nextNumber = existing.length
      ? Math.max(...existing.map((row) => row.milestone_number)) + 1
      : 1;
    const now = new Date().toISOString();

    if (active) {
      await projectsRepo.completeMilestone(active.id, now);
    }

    const milestoneCreatedAt =
      nextNumber === 1
        ? effectiveTimestampForProjectStart(result.project.start_date, now)
        : now;

    const milestone = await projectsRepo.insertMilestone({
      project_id: projectId,
      milestone_number: nextNumber,
      amount: milestoneCost,
      comment,
      status: "active",
      created_by: req.user.id,
      created_at: milestoneCreatedAt,
    });

    await projectsRepo.update(projectId, {
      milestone_cost: milestoneCost,
      updated_at: now,
    });

    const [enriched] = await enrichMilestones([milestone]);
    return { data: enriched, status: 201 };
  } catch (err) {
    return { error: err.message, status: 400 };
  }
}

export async function changeMilestoneCost(req, projectId, body) {
  return addMilestone(req, projectId, body);
}

async function syncProjectMilestoneCost(projectId) {
  const milestones = await projectsRepo.listMilestones(projectId);
  const active = milestones.find((row) => row.status === "active");
  await projectsRepo.update(projectId, {
    milestone_cost: active?.amount ?? null,
    updated_at: new Date().toISOString(),
  });
}

export async function updateMilestone(req, projectId, milestoneId, body) {
  const result = await requireProjectAccess(req, projectId);
  if (result.error) return result;
  const ownerError = requireOwnerAccess(result.access);
  if (ownerError) return ownerError;

  if (result.project.job_type !== "contract") {
    return { error: "Milestones apply only to contract projects", status: 400 };
  }

  const existing = await projectsRepo.findMilestone(projectId, milestoneId);
  if (!existing) return { error: "Milestone not found", status: 404 };

  const validation = validateMilestoneUpdate(body);
  if (validation.error) {
    return { error: validation.error, status: 400 };
  }

  try {
    const milestone = await projectsRepo.updateMilestone(milestoneId, {
      comment: validation.comment,
      amount: validation.amount,
    });

    if (existing.status === "active") {
      await projectsRepo.update(projectId, {
        milestone_cost: validation.amount,
        updated_at: new Date().toISOString(),
      });
    }

    const [enriched] = await enrichMilestones([milestone]);
    return { data: enriched };
  } catch (err) {
    return { error: err.message, status: 400 };
  }
}

export async function deleteMilestone(req, projectId, milestoneId) {
  const result = await requireProjectAccess(req, projectId);
  if (result.error) return result;
  const ownerError = requireOwnerAccess(result.access);
  if (ownerError) return ownerError;

  if (result.project.job_type !== "contract") {
    return { error: "Milestones apply only to contract projects", status: 400 };
  }

  const existing = await projectsRepo.findMilestone(projectId, milestoneId);
  if (!existing) return { error: "Milestone not found", status: 404 };

  const allMilestones = await projectsRepo.listMilestones(projectId);
  const latestNumber = Math.max(...allMilestones.map((row) => row.milestone_number));
  if (existing.milestone_number !== latestNumber) {
    return { error: "Only the most recent milestone can be deleted", status: 400 };
  }

  try {
    await projectsRepo.removeMilestone(milestoneId);
    await syncProjectMilestoneCost(projectId);
    return { status: 204 };
  } catch (err) {
    return { error: err.message, status: 400 };
  }
}

export async function getStatusHistory(req, projectId) {
  const result = await getProjectForUser(req, projectId);
  if (result.error) return result;

  try {
    const rows = await projectsRepo.getStatusHistory(projectId);
    const data = await enrichStatusHistory(rows);
    return { data };
  } catch (err) {
    return { error: err.message, status: 500 };
  }
}

export async function getDailyLogs(req, projectId) {
  const result = await getProjectForUser(req, projectId);
  if (result.error) return result;

  try {
    const rows = await projectsRepo.getDailyLogs(projectId);
    const data = await enrichDailyLogs(rows);
    return { data };
  } catch (err) {
    return { error: err.message, status: 500 };
  }
}

export async function listAllDailyLogs(req) {
  if (!req.isAdmin) {
    return { error: "Admin access required", status: 403 };
  }

  try {
    const rows = await projectsRepo.listAllDailyLogs();
    const projectIds = [...new Set((rows || []).map((row) => row.project_id).filter(Boolean))];
    const projects = await projectsRepo.getProjectsSummaryByIds(projectIds);
    const projectById = Object.fromEntries((projects || []).map((p) => [p.id, p]));

    const userIds = [
      ...new Set([
        ...(rows || []).flatMap((row) => [row.created_by, row.updated_by].filter(Boolean)),
        ...(projects || []).map((p) => p.assigned_to).filter(Boolean),
      ]),
    ];
    const nameById = await projectsRepo.getProfileNames(userIds);

    const data = (rows || []).map((row) => {
      const project = projectById[row.project_id] || {};
      return {
        ...row,
        logged_by_name: nameById[row.created_by] || null,
        updated_by_name: nameById[row.updated_by] || null,
        project_name: project.name || null,
        client_name: project.client_name || null,
        job_type: project.job_type || null,
        assigned_to: project.assigned_to || null,
        assignee_name: project.assigned_to ? nameById[project.assigned_to] || null : null,
      };
    });

    return { data };
  } catch (err) {
    return { error: err.message, status: 500 };
  }
}

export async function createDailyLog(req, projectId, body) {
  const result = await requireProjectAccess(req, projectId);
  if (result.error) return result;
  const logError = requireLogEditAccess(result.access);
  if (logError) return logError;

  const validationErrors = validateDailyLogFields(body, { jobType: result.project.job_type });
  if (validationErrors.length) {
    return { error: validationErrors[0], status: 400 };
  }

  const payload = dailyLogPayload(body, { jobType: result.project.job_type });

  try {
    const data = await projectsRepo.insertDailyLog({
      project_id: projectId,
      ...payload,
      created_by: req.user.id,
      updated_by: req.user.id,
    });
    return { data, status: 201 };
  } catch (err) {
    return { error: err.message, status: 400 };
  }
}

export async function updateDailyLog(req, projectId, logId, body) {
  const result = await requireProjectAccess(req, projectId);
  if (result.error) return result;
  const logError = requireLogEditAccess(result.access);
  if (logError) return logError;

  const existing = await projectsRepo.findDailyLog(projectId, logId);
  if (!existing) return { error: "Daily log not found", status: 404 };
  if (!canManageDailyLog(result.access, existing, req.user.id)) {
    return { error: "Forbidden", status: 403 };
  }

  const tasksDone = String(body.tasks_done || "").trim();
  if (!tasksDone) {
    return { error: "tasks_done is required", status: 400 };
  }

  try {
    const data = await projectsRepo.updateDailyLog(logId, {
      log_date: existing.log_date,
      tasks_done: tasksDone,
      tracker_minutes: existing.tracker_minutes ?? 0,
      updated_by: req.user.id,
      updated_at: new Date().toISOString(),
    });
    return { data };
  } catch (err) {
    return { error: err.message, status: 400 };
  }
}

export async function deleteDailyLog(req, projectId, logId) {
  const result = await requireProjectAccess(req, projectId);
  if (result.error) return result;
  const logError = requireLogEditAccess(result.access);
  if (logError) return logError;

  const existing = await projectsRepo.findDailyLog(projectId, logId);
  if (!existing) return { error: "Daily log not found", status: 404 };
  if (!canManageDailyLog(result.access, existing, req.user.id)) {
    return { error: "Forbidden", status: 403 };
  }

  try {
    await projectsRepo.removeDailyLog(projectId, logId);
    return { status: 204 };
  } catch (err) {
    return { error: err.message, status: 400 };
  }
}

export async function changeStatus(req, projectId, body) {
  const result = await requireProjectAccess(req, projectId);
  if (result.error) return result;
  const ownerError = requireOwnerAccess(result.access);
  if (ownerError) return ownerError;

  const { status, comment } = body;
  if (!status || !PROJECT_STATUSES.includes(status)) {
    return { error: "Valid status is required", status: 400 };
  }
  if (!comment || !String(comment).trim()) {
    return { error: "Comment is required to change status", status: 400 };
  }
  if (status === result.project.status) {
    return { error: "Status is already set to this value", status: 400 };
  }

  const fromStatus = result.project.status;

  try {
    const now = new Date().toISOString();
    const latestProject = await projectsRepo.findById(projectId);
    const projectStartDate = latestProject?.start_date ?? result.project.start_date;
    const isFirstActivation = status === "active" && !(await wasProjectEverActive(projectId));
    const statusHistoryAt = isFirstActivation
      ? effectiveTimestampForProjectStart(projectStartDate, now)
      : now;

    const data = await projectsRepo.update(projectId, {
      status,
      updated_at: now,
    });

    try {
      await projectsRepo.insertStatusHistory({
        project_id: projectId,
        from_status: fromStatus,
        to_status: status,
        comment: String(comment).trim(),
        changed_by: req.user.id,
        created_at: statusHistoryAt,
      });
    } catch (historyErr) {
      await projectsRepo.update(projectId, {
        status: fromStatus,
        updated_at: now,
      });
      return { error: historyErr.message, status: 500 };
    }

    if (status === "completed") {
      const active = await projectsRepo.getActiveMilestone(projectId);
      if (active) {
        await projectsRepo.completeMilestone(active.id, now);
      }
    }

    return { data };
  } catch (err) {
    return { error: err.message, status: 400 };
  }
}

export async function patchProject(req, projectId, body) {
  const existing = await projectsRepo.findById(projectId);
  if (!existing) return { error: "Project not found", status: 404 };
  if (!req.isAdmin) {
    const access = await resolveProjectAccess(req, existing);
    if (!access) return { error: "Forbidden", status: 403 };
    const ownerError = requireOwnerAccess(access);
    if (ownerError) return ownerError;
  }

  if (body.status !== undefined) {
    return {
      error: "Use POST /api/projects/:id/status to change status with a comment",
      status: 400,
    };
  }

  if (body.milestone_cost !== undefined) {
    return {
      error: "Use POST /api/projects/:id/milestones to add a milestone with a comment",
      status: 400,
    };
  }

  const mergedJobType = body.job_type ?? existing.job_type;
  const hourlyRateProvided =
    body.hourly_rate !== undefined &&
    body.hourly_rate !== null &&
    body.hourly_rate !== "";
  if (hourlyRateProvided && mergedJobType !== "hourly") {
    return { error: "hourly_rate is only allowed for hourly projects", status: 400 };
  }

  const validationErrors = validateProjectFields(body, { partial: true });
  if (validationErrors.length) {
    return { error: validationErrors[0], status: 400 };
  }

  const updates = {
    ...projectPayload(body),
    updated_at: new Date().toISOString(),
  };

  if (mergedJobType === "contract") {
    updates.hourly_rate = null;
  }

  try {
    const data = await projectsRepo.update(projectId, updates);
    return { data };
  } catch (err) {
    return { error: err.message, status: 400 };
  }
}

export async function deleteProject(req, projectId) {
  const existing = await projectsRepo.findById(projectId);
  if (!existing) return { error: "Project not found", status: 404 };
  if (!req.isAdmin) {
    const access = await resolveProjectAccess(req, existing);
    if (!access) return { error: "Forbidden", status: 403 };
    const ownerError = requireOwnerAccess(access);
    if (ownerError) return ownerError;
  }

  try {
    await projectsRepo.remove(projectId);
    return { status: 204 };
  } catch (err) {
    return { error: err.message, status: 400 };
  }
}

export async function listMilestonesForEmployeeProject(projectId) {
  const rows = await projectsRepo.listMilestones(projectId);
  return enrichMilestones(rows);
}

export async function getMilestoneCostHistoryForEmployeeProject(projectId) {
  return listMilestonesForEmployeeProject(projectId);
}

export async function getStatusHistoryForEmployeeProject(projectId) {
  const rows = await projectsRepo.getStatusHistory(projectId);
  return enrichStatusHistory(rows);
}

export async function getDailyLogsForEmployeeProject(projectId) {
  const rows = await projectsRepo.getDailyLogs(projectId);
  return enrichDailyLogs(rows);
}

async function enrichShares(rows) {
  const userIds = [
    ...new Set((rows || []).flatMap((row) => [row.shared_with, row.shared_by].filter(Boolean))),
  ];
  const nameById = await projectsRepo.getProfileNames(userIds);
  return (rows || []).map((row) => ({
    ...row,
    shared_with_name: nameById[row.shared_with] || null,
    shared_by_name: nameById[row.shared_by] || null,
  }));
}

export async function listProjectShares(req, projectId) {
  const result = await requireProjectAccess(req, projectId);
  if (result.error) return result;
  const ownerError = requireOwnerAccess(result.access);
  if (ownerError) return ownerError;

  try {
    const rows = await projectsRepo.listSharesForProject(projectId);
    const data = await enrichShares(rows);
    return { data };
  } catch (err) {
    return { error: err.message, status: 500 };
  }
}

export async function shareProject(req, projectId, body) {
  if (req.isAdmin) {
    return { error: "Only employees can share projects", status: 403 };
  }

  const result = await requireProjectAccess(req, projectId);
  if (result.error) return result;
  const ownerError = requireOwnerAccess(result.access);
  if (ownerError) return ownerError;

  const { employee_id } = body;
  if (!employee_id) {
    return { error: "employee_id is required", status: 400 };
  }
  if (employee_id === req.user.id) {
    return { error: "You cannot share a project with yourself", status: 400 };
  }

  const employee = await projectsRepo.findEmployeeProfile(employee_id);
  if (!employee || employee.role !== "employee") {
    return { error: "Valid employee is required", status: 400 };
  }

  const existingShare = await projectsRepo.findShareForUser(projectId, employee_id);
  if (existingShare) {
    if (existingShare.can_edit_logs) {
      return { error: "This employee already has access to the project", status: 400 };
    }
    try {
      const data = await projectsRepo.updateShare(existingShare.id, {
        can_edit_logs: true,
        revoked_at: null,
        shared_by: req.user.id,
      });
      const [enriched] = await enrichShares([data]);
      return { data: enriched, status: 200 };
    } catch (err) {
      return { error: err.message, status: 400 };
    }
  }

  try {
    const data = await projectsRepo.insertShare({
      project_id: projectId,
      shared_with: employee_id,
      shared_by: req.user.id,
      can_edit_logs: true,
    });
    const [enriched] = await enrichShares([data]);
    return { data: enriched, status: 201 };
  } catch (err) {
    return { error: err.message, status: 400 };
  }
}

export async function revokeProjectShare(req, projectId, shareId) {
  if (req.isAdmin) {
    return { error: "Only employees can manage project shares", status: 403 };
  }

  const result = await requireProjectAccess(req, projectId);
  if (result.error) return result;
  const ownerError = requireOwnerAccess(result.access);
  if (ownerError) return ownerError;

  const shares = await projectsRepo.listSharesForProject(projectId);
  const share = shares.find((row) => row.id === shareId);
  if (!share) return { error: "Share not found", status: 404 };
  if (!share.can_edit_logs) {
    return { error: "Share is already revoked", status: 400 };
  }

  try {
    const data = await projectsRepo.updateShare(shareId, {
      can_edit_logs: false,
      revoked_at: new Date().toISOString(),
    });
    const [enriched] = await enrichShares([data]);
    return { data: enriched };
  } catch (err) {
    return { error: err.message, status: 400 };
  }
}
