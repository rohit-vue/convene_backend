import { getEmployeeUsers, getEmployeeById } from "./employees.repository.js";
import * as meetingsRepo from "../meetings/meetings.repository.js";
import * as projectsRepo from "../projects/projects.repository.js";
import {
  enrichMeetingWithLatest,
  enrichMeetings,
} from "../meetings/meetings.service.js";
import * as projectsService from "../projects/projects.service.js";

export async function listEmployeeOptions() {
  const employees = await getEmployeeUsers();
  return employees.map(({ id, name }) => ({ id, name }));
}

export async function listEmployees() {
  return getEmployeeUsers();
}

export async function getEmployeeDetail(employeeId) {
  const employee = await getEmployeeById(employeeId);
  if (!employee) return { error: "Employee not found", status: 404 };

  const meetings = await meetingsRepo.listMeetingsByEmployeeId(employeeId);
  const enrichedMeetings = await enrichMeetings(meetings, { withLatest: true });
  enrichedMeetings.sort(
    (a, b) => new Date(b.meeting_at || b.created_at) - new Date(a.meeting_at || a.created_at),
  );

  const projects = await projectsRepo.listByAssignee(employeeId);

  return {
    data: {
      ...employee,
      meetings: enrichedMeetings,
      projects,
    },
  };
}

export async function getEmployeeMeeting(employeeId, meetingId) {
  const employee = await getEmployeeById(employeeId);
  if (!employee) return { error: "Employee not found", status: 404 };

  const data = await meetingsRepo.findMeetingForEmployee(employeeId, meetingId);
  if (!data) return { error: "Meeting not found", status: 404 };

  const latestById = await meetingsRepo.getLatestUpdatesByMeetingIds([meetingId]);
  const [enriched] = await enrichMeetings(
    [enrichMeetingWithLatest(data, latestById[meetingId])],
    { withLatest: false },
  );
  return { data: enriched };
}

export async function getEmployeeMeetingUpdates(employeeId, meetingId) {
  const employee = await getEmployeeById(employeeId);
  if (!employee) return { error: "Employee not found", status: 404 };

  const meeting = await meetingsRepo.findMeetingForEmployee(employeeId, meetingId);
  if (!meeting) return { error: "Meeting not found", status: 404 };

  try {
    const data = await meetingsRepo.listMeetingUpdates(meetingId);
    return { data };
  } catch (err) {
    return { error: err.message, status: 500 };
  }
}

export async function getEmployeeProject(employeeId, projectId) {
  const employee = await getEmployeeById(employeeId);
  if (!employee) return { error: "Employee not found", status: 404 };

  const data = await projectsRepo.findForEmployee(employeeId, projectId);
  if (!data) return { error: "Project not found", status: 404 };
  return { data };
}

export async function getEmployeeProjectStatusHistory(employeeId, projectId) {
  const employee = await getEmployeeById(employeeId);
  if (!employee) return { error: "Employee not found", status: 404 };

  const project = await projectsRepo.findIdForEmployee(employeeId, projectId);
  if (!project) return { error: "Project not found", status: 404 };

  try {
    const data = await projectsService.getStatusHistoryForEmployeeProject(projectId);
    return { data };
  } catch (err) {
    return { error: err.message, status: 500 };
  }
}

export async function getEmployeeProjectDailyLogs(employeeId, projectId) {
  const employee = await getEmployeeById(employeeId);
  if (!employee) return { error: "Employee not found", status: 404 };

  const project = await projectsRepo.findIdForEmployee(employeeId, projectId);
  if (!project) return { error: "Project not found", status: 404 };

  try {
    const data = await projectsService.getDailyLogsForEmployeeProject(projectId);
    return { data };
  } catch (err) {
    return { error: err.message, status: 500 };
  }
}
