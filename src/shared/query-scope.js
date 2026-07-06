import { supabase } from "../config/supabase.js";

export function scopeMeetings(req, columns) {
  let q = supabase.from("meetings").select(columns);
  if (!req.isAdmin) q = q.eq("created_by", req.user.id);
  return q;
}

export function scopeProjects(req, columns) {
  let q = supabase.from("projects").select(columns);
  if (!req.isAdmin) q = q.eq("created_by", req.user.id);
  return q;
}
