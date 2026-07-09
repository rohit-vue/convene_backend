import * as projectsService from "./projects.service.js";

function respond(res, result) {
  if (result.error) {
    return res.status(result.status || 400).json({ error: result.error });
  }
  if (result.status === 201) {
    return res.status(201).json(result.data);
  }
  if (result.status === 204) {
    return res.status(204).end();
  }
  return res.json(result.data);
}

export async function list(req, res) {
  respond(res, await projectsService.listProjects(req));
}

export async function listPending(req, res) {
  respond(res, await projectsService.listPendingProjects(req));
}

export async function assign(req, res) {
  respond(res, await projectsService.assignProject(req, req.body));
}

export async function accept(req, res) {
  respond(res, await projectsService.acceptProject(req, req.params.id));
}

export async function create(req, res) {
  respond(res, await projectsService.createProject(req, req.body));
}

export async function getById(req, res) {
  respond(res, await projectsService.getProject(req, req.params.id));
}

export async function getStatusHistory(req, res) {
  respond(res, await projectsService.getStatusHistory(req, req.params.id));
}

export async function listMilestones(req, res) {
  respond(res, await projectsService.listMilestones(req, req.params.id));
}

export async function addMilestone(req, res) {
  respond(res, await projectsService.addMilestone(req, req.params.id, req.body));
}

export async function updateMilestone(req, res) {
  respond(
    res,
    await projectsService.updateMilestone(req, req.params.id, req.params.milestoneId, req.body),
  );
}

export async function deleteMilestone(req, res) {
  respond(
    res,
    await projectsService.deleteMilestone(req, req.params.id, req.params.milestoneId),
  );
}

export async function getMilestoneCostHistory(req, res) {
  respond(res, await projectsService.listMilestones(req, req.params.id));
}

export async function changeMilestoneCost(req, res) {
  respond(res, await projectsService.addMilestone(req, req.params.id, req.body));
}

export async function getDailyLogs(req, res) {
  respond(res, await projectsService.getDailyLogs(req, req.params.id));
}

export async function createDailyLog(req, res) {
  respond(res, await projectsService.createDailyLog(req, req.params.id, req.body));
}

export async function updateDailyLog(req, res) {
  respond(
    res,
    await projectsService.updateDailyLog(req, req.params.id, req.params.logId, req.body),
  );
}

export async function deleteDailyLog(req, res) {
  respond(
    res,
    await projectsService.deleteDailyLog(req, req.params.id, req.params.logId),
  );
}

export async function changeStatus(req, res) {
  respond(res, await projectsService.changeStatus(req, req.params.id, req.body));
}

export async function patch(req, res) {
  respond(res, await projectsService.patchProject(req, req.params.id, req.body));
}

export async function remove(req, res) {
  respond(res, await projectsService.deleteProject(req, req.params.id));
}

export async function listShares(req, res) {
  respond(res, await projectsService.listProjectShares(req, req.params.id));
}

export async function share(req, res) {
  respond(res, await projectsService.shareProject(req, req.params.id, req.body));
}

export async function revokeShare(req, res) {
  respond(res, await projectsService.revokeProjectShare(req, req.params.id, req.params.shareId));
}
