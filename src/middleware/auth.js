import { supabase } from "../config/supabase.js";
import { UnauthorizedError, ForbiddenError } from "../shared/errors/AppError.js";

export async function requireAuth(req, res, next) {
  try {
    const token = req.headers.authorization?.replace("Bearer ", "");
    if (!token) throw new UnauthorizedError("Missing authorization token");

    const { data, error } = await supabase.auth.getUser(token);
    if (error || !data?.user) throw new UnauthorizedError("Unauthorized");

    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", data.user.id)
      .single();

    req.user = data.user;
    req.role = profile?.role ?? null;
    req.isAdmin = profile?.role === "admin";
    next();
  } catch (err) {
    next(err);
  }
}

export function requireAdmin(req, res, next) {
  if (!req.isAdmin) return next(new ForbiddenError("Admin access required"));
  next();
}

export function requireEmployee(req, res, next) {
  if (req.role !== "employee") return next(new ForbiddenError("Employee access required"));
  next();
}
