export function canAccessMeeting(req, meeting) {
  if (!meeting) return false;
  if (req.isAdmin) return true;
  return meeting.created_by === req.user.id || meeting.employee_id === req.user.id;
}

export function applyEmployeeMeetingScope(query, userId) {
  return query.or(`created_by.eq.${userId},employee_id.eq.${userId}`);
}
