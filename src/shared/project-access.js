export function isProjectOwner(req, project) {
  if (!project || req.isAdmin) return false;
  if (project.assigned_to === req.user.id) return true;
  if (project.created_by === req.user.id && !project.assigned_to) return true;
  return false;
}

export function canAccessProjectSync(req, project) {
  if (!project) return false;
  if (req.isAdmin) return true;
  if (isProjectOwner(req, project)) return true;
  return false;
}

export function applyEmployeeProjectScope(query, userId) {
  return query.or(`created_by.eq.${userId},assigned_to.eq.${userId}`);
}
