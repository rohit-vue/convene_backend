import * as notificationsRepo from "./notifications.repository.js";

export async function createMeetingAssignedNotification({ userId, meetingId, projectName }) {
  return notificationsRepo.insertNotification({
    user_id: userId,
    type: "meeting_assigned",
    title: "New meeting assigned",
    body: `You have been assigned a meeting for "${projectName}". Please accept to confirm.`,
    meeting_id: meetingId,
  });
}

export async function createProjectAssignedNotification({ userId, projectId, projectName }) {
  return notificationsRepo.insertNotification({
    user_id: userId,
    type: "project_assigned",
    title: "New project assigned",
    body: `You have been assigned the project "${projectName}". Please accept to confirm.`,
    project_id: projectId,
  });
}

export async function listForUser(req) {
  return notificationsRepo.listNotificationsForUser(req.user.id);
}

export async function unreadCount(req) {
  return notificationsRepo.countUnreadForUser(req.user.id);
}

export async function markRead(req, notificationId) {
  try {
    const data = await notificationsRepo.markNotificationRead(req.user.id, notificationId);
    if (!data) return { error: "Notification not found", status: 404 };
    return { data };
  } catch (err) {
    return { error: err.message, status: 400 };
  }
}
