import { PROJECT_STATUSES } from "./projects.constants.js";
import {
  validateProjectFields,
  projectPayload,
  dailyLogPayload,
  validateDailyLogFields,
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
    const data = await projectsRepo.update(projectId, {
      status,
      updated_at: new Date().toISOString(),
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
        updated_at: new Date().toISOString(),
      });
      return { error: historyErr.message, status: 500 };
    }

    return { data };
  } catch (err) {
    return { error: err.message, status: 400 };
  }
}

export async function patchProject(req, projectId, body) {
  const existing = await projectsRepo.findCreatedBy(projectId);
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

  const validationErrors = validateProjectFields(body, { partial: true });
  if (validationErrors.length) {
    return { error: validationErrors[0], status: 400 };
  }

  try {
    const data = await projectsRepo.update(projectId, {
      ...projectPayload(body),
      updated_at: new Date().toISOString(),
    });
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

export async function getStatusHistoryForEmployeeProject(projectId) {
  const rows = await projectsRepo.getStatusHistory(projectId);
  return enrichStatusHistory(rows);
}

export async function getDailyLogsForEmployeeProject(projectId) {
  const rows = await projectsRepo.getDailyLogs(projectId);
  return enrichDailyLogs(rows);
}
