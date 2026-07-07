import * as employeesService from "./employees.service.js";

function respond(res, result) {
  if (result.error) {
    return res.status(result.status || 400).json({ error: result.error });
  }
  return res.json(result.data);
}

export async function options(req, res) {
  try {
    const data = await employeesService.listEmployeeOptions();
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

export async function list(req, res) {
  try {
    const data = await employeesService.listEmployees();
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

export async function getById(req, res) {
  respond(res, await employeesService.getEmployeeDetail(req.params.id));
}

export async function getMeetingUpdates(req, res) {
  respond(
    res,
    await employeesService.getEmployeeMeetingUpdates(
      req.params.employeeId,
      req.params.meetingId,
    ),
  );
}

export async function getMeeting(req, res) {
  respond(
    res,
    await employeesService.getEmployeeMeeting(req.params.employeeId, req.params.meetingId),
  );
}

export async function getProject(req, res) {
  respond(
    res,
    await employeesService.getEmployeeProject(req.params.employeeId, req.params.projectId),
  );
}

export async function getProjectStatusHistory(req, res) {
  respond(
    res,
    await employeesService.getEmployeeProjectStatusHistory(
      req.params.employeeId,
      req.params.projectId,
    ),
  );
}

export async function getProjectMilestoneCostHistory(req, res) {
  respond(
    res,
    await employeesService.getEmployeeProjectMilestones(
      req.params.employeeId,
      req.params.projectId,
    ),
  );
}

export async function getProjectMilestones(req, res) {
  respond(
    res,
    await employeesService.getEmployeeProjectMilestones(
      req.params.employeeId,
      req.params.projectId,
    ),
  );
}

export async function getProjectDailyLogs(req, res) {
  respond(
    res,
    await employeesService.getEmployeeProjectDailyLogs(
      req.params.employeeId,
      req.params.projectId,
    ),
  );
}
