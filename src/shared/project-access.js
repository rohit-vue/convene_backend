export function canAccessProject(req, project) {
  if (!project) return false;
  if (req.isAdmin) return true;
  return project.created_by === req.user.id || project.assigned_to === req.user.id;
}

export function applyEmployeeProjectScope(query, userId) {
  return query.or(`created_by.eq.${userId},assigned_to.eq.${userId}`);
}
