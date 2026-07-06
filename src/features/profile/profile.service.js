import { supabase } from "../../config/supabase.js";

export async function getProfile(userId) {
  const { data: profile, error } = await supabase
    .from("profiles")
    .select("full_name, role, employee_code, job_title")
    .eq("id", userId)
    .single();

  if (error) throw new Error(error.message);

  const { data: authData, error: authError } = await supabase.auth.admin.getUserById(userId);
  if (authError) throw new Error(authError.message);

  return {
    full_name: profile?.full_name ?? null,
    role: profile?.role ?? "employee",
    employee_code: profile?.employee_code ?? null,
    job_title: profile?.job_title ?? null,
    email: authData.user?.email ?? null,
    created_at: authData.user?.created_at ?? null,
  };
}

export async function updateProfile(userId, body) {
  const { full_name, employee_code, job_title } = body ?? {};
  const updates = {};

  if (full_name !== undefined) {
    updates.full_name = String(full_name).trim() || null;
  }
  if (employee_code !== undefined) {
    updates.employee_code = String(employee_code).trim() || null;
  }
  if (job_title !== undefined) {
    updates.job_title = String(job_title).trim() || null;
  }

  if (!Object.keys(updates).length) {
    return { error: "No fields to update", status: 400 };
  }

  const { data, error } = await supabase
    .from("profiles")
    .update(updates)
    .eq("id", userId)
    .select("full_name, role, employee_code, job_title")
    .single();

  if (error) throw new Error(error.message);
  return { data };
}
