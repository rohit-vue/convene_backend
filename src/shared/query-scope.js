import { supabase } from "../config/supabase.js";
import { applyEmployeeMeetingScope } from "./meeting-access.js";

export function scopeMeetings(req, columns, { acceptedOnly = false } = {}) {
  let q = supabase.from("meetings").select(columns);
  if (!req.isAdmin) {
    q = applyEmployeeMeetingScope(q, req.user.id);
    if (acceptedOnly) q = q.eq("assignment_status", "accepted");
  }
  return q;
}

export function scopeProjects(req, columns) {
  let q = supabase.from("projects").select(columns);
  if (!req.isAdmin) q = q.eq("created_by", req.user.id);
  return q;
}
