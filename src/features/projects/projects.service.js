import { PROJECT_STATUSES } from "./projects.constants.js";
import {
  validateProjectFields,
  projectPayload,
  dailyLogPayload,
  validateDailyLogFields,
  validateMilestoneCostChange,
} from "./projects.validator.js";
import * as projectsRepo from "./projects.repository.js";
import { scopeProjects } from "../../shared/query-scope.js";

export async function getProjectForUser(req, projectId) {
  const data = await projectsRepo.findById(projectId);
  if (!data) return { error: "Project not found", status: 404 };
  if (data.created_by !== req.user.id) {
    return { error: "Forbidden", status: 403 };
  }
  return { data };
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

export async function exportProjects(req) {
  if (!req.isAdmin) {
    return { error: "Admin access required", status: 403 };
  }

  const projects = await projectsRepo.listAllProjectsForExport();
  const assigneeIds = [...new Set(projects.map((p) => p.assigned_to).filter(Boolean))];
  const nameById = await projectsRepo.getProfileNames(assigneeIds);

  const rows = projects.map((project) => ({
    employee_name: project.assigned_to ? nameById[project.assigned_to] || null : null,
    project_name: project.name,
    client_name: project.client_name,
    upwork_account: project.upwork_account,
    job_type: project.job_type,
    job_category: project.job_category,
    link_url: project.link_url,
    status: project.status,
    start_date: project.start_date,
    due_date: project.due_date,
  }));

  return { data: rows };
}

export async function listProjects(req) {
  try {
    if (req.isAdmin) {
      const { data, error } = await scopeProjects(
        req,
        "id, name, client_name, status, start_date, due_date, job_type, job_category, assigned_to, created_by, created_at",
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

    const data = await projectsRepo.listByCreator(req.user.id);
    return { data };
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
    });

    try {
      await projectsRepo.insertStatusHistory({
        project_id: data.id,
        from_status: null,
        to_status: data.status,
        comment: "Project created",
        changed_by: req.user.id,
      });
    } catch (historyErr) {
      return { error: historyErr.message, status: 500 };
    }

    return { data, status: 201 };
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
  const result = await getProjectForUser(req, projectId);
  if (result.error) return result;

  if (result.data.job_type !== "contract") {
    return { error: "Milestones apply only to contract projects", status: 400 };
  }

  if (result.data.status !== "active") {
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

    const milestone = await projectsRepo.insertMilestone({
      project_id: projectId,
      milestone_number: nextNumber,
      amount: milestoneCost,
      comment,
      status: "active",
      created_by: req.user.id,
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

export async function createDailyLog(req, projectId, body) {
  const result = await getProjectForUser(req, projectId);
  if (result.error) return result;

  const validationErrors = validateDailyLogFields(body, { jobType: result.data.job_type });
  if (validationErrors.length) {
    return { error: validationErrors[0], status: 400 };
  }

  const payload = dailyLogPayload(body, { jobType: result.data.job_type });

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
  const result = await getProjectForUser(req, projectId);
  if (result.error) return result;

  const existing = await projectsRepo.findDailyLog(projectId, logId);
  if (!existing) return { error: "Daily log not found", status: 404 };
  if (existing.created_by !== req.user.id) {
    return { error: "Forbidden", status: 403 };
  }

  const validationErrors = validateDailyLogFields(body, { jobType: result.data.job_type });
  if (validationErrors.length) {
    return { error: validationErrors[0], status: 400 };
  }

  const payload = dailyLogPayload(body, { jobType: result.data.job_type });

  try {
    const data = await projectsRepo.updateDailyLog(logId, {
      ...payload,
      updated_by: req.user.id,
      updated_at: new Date().toISOString(),
    });
    return { data };
  } catch (err) {
    return { error: err.message, status: 400 };
  }
}

export async function changeStatus(req, projectId, body) {
  const result = await getProjectForUser(req, projectId);
  if (result.error) return result;

  const { status, comment } = body;
  if (!status || !PROJECT_STATUSES.includes(status)) {
    return { error: "Valid status is required", status: 400 };
  }
  if (!comment || !String(comment).trim()) {
    return { error: "Comment is required to change status", status: 400 };
  }
  if (status === result.data.status) {
    return { error: "Status is already set to this value", status: 400 };
  }

  const fromStatus = result.data.status;

  try {
    const now = new Date().toISOString();
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
  if (!req.isAdmin && existing.created_by !== req.user.id) {
    return { error: "Forbidden", status: 403 };
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
  const existing = await projectsRepo.findCreatedBy(projectId);
  if (!existing) return { error: "Project not found", status: 404 };
  if (!req.isAdmin && existing.created_by !== req.user.id) {
    return { error: "Forbidden", status: 403 };
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
