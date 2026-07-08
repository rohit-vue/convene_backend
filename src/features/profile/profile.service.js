import { supabase } from "../../config/supabase.js";
import { env } from "../../config/env.js";

const AVATAR_BUCKET = "avatars";

function normalizeMemberSince(value) {
  if (value === undefined) return undefined;
  if (value === null || value === "") return null;
  const date = String(value).trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return { error: "member_since must be a valid date (YYYY-MM-DD)", status: 400 };
  }
  return date;
}

function isValidAvatarUrl(userId, value) {
  if (value === null || value === "") return true;
  const url = String(value).trim();
  if (!url) return true;

  const prefix = `${env.supabaseUrl}/storage/v1/object/public/${AVATAR_BUCKET}/${userId}/`;
  return url.startsWith(prefix);
}

export async function getProfile(userId) {
  const { data: profile, error } = await supabase
    .from("profiles")
    .select("full_name, role, employee_code, job_title, member_since, avatar_url")
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
    member_since: profile?.member_since ?? null,
    avatar_url: profile?.avatar_url ?? null,
    email: authData.user?.email ?? null,
    created_at: authData.user?.created_at ?? null,
  };
}

export async function updateProfile(userId, body) {
  const { full_name, employee_code, job_title, member_since, avatar_url } = body ?? {};
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
  if (member_since !== undefined) {
    const normalized = normalizeMemberSince(member_since);
    if (normalized?.error) return normalized;
    updates.member_since = normalized;
  }
  if (avatar_url !== undefined) {
    const normalized = avatar_url === null || avatar_url === ""
      ? null
      : String(avatar_url).trim() || null;
    if (normalized && !isValidAvatarUrl(userId, normalized)) {
      return { error: "Invalid avatar URL", status: 400 };
    }
    updates.avatar_url = normalized;
  }

  if (!Object.keys(updates).length) {
    return { error: "No fields to update", status: 400 };
  }

  const { data, error } = await supabase
    .from("profiles")
    .update(updates)
    .eq("id", userId)
    .select("full_name, role, employee_code, job_title, member_since, avatar_url")
    .single();

  if (error) throw new Error(error.message);
  return { data };
}
