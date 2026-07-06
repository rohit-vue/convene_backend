import { supabase } from "../../config/supabase.js";

export async function getEmployeeUsers() {
  const { data: profiles, error } = await supabase
    .from("profiles")
    .select("id, full_name, role")
    .eq("role", "employee")
    .order("full_name", { ascending: true });

  if (error) throw new Error(error.message);

  const { data: authData, error: authError } = await supabase.auth.admin.listUsers({
    perPage: 1000,
  });
  if (authError) throw new Error(authError.message);

  const emailById = Object.fromEntries(
    (authData.users || []).map((u) => [u.id, u.email]),
  );

  return (profiles || []).map((p) => ({
    id: p.id,
    name: p.full_name || emailById[p.id] || "Unknown",
    email: emailById[p.id] || null,
    role: p.role,
  }));
}

export async function getEmployeeById(employeeId) {
  const { data: profile, error } = await supabase
    .from("profiles")
    .select("id, full_name, role")
    .eq("id", employeeId)
    .eq("role", "employee")
    .single();

  if (error || !profile) return null;

  const { data: authData, error: authError } = await supabase.auth.admin.getUserById(employeeId);
  if (authError) throw new Error(authError.message);

  return {
    id: profile.id,
    name: profile.full_name || authData.user?.email || "Unknown",
    email: authData.user?.email || null,
    role: profile.role,
  };
}
