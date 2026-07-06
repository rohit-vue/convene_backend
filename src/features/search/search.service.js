import { supabase } from "../../config/supabase.js";
import { scopeMeetings, scopeProjects } from "../../shared/query-scope.js";
import { getEmployeeUsers } from "../employees/employees.repository.js";

function textMatches(term, ...fields) {
  const lower = term.toLowerCase();
  return fields.some((f) => f && String(f).toLowerCase().includes(lower));
}

export async function search(req, query) {
  const term = String(query || "").trim();
  if (term.length < 2) {
    return { meetings: [], projects: [], employees: [] };
  }

  const [meetingsResult, projectsResult] = await Promise.all([
    scopeMeetings(
      req,
      "id, project_name, client_name, employee_id, employee_name, meeting_at, created_by",
    )
      .order("meeting_at", { ascending: false })
      .limit(300),
    scopeProjects(req, "id, name, client_name, status, assigned_to, created_by, created_at")
      .order("created_at", { ascending: false })
      .limit(300),
  ]);

  if (meetingsResult.error) throw new Error(meetingsResult.error.message);
  if (projectsResult.error) throw new Error(projectsResult.error.message);

  const meetings = (meetingsResult.data || [])
    .filter((m) => textMatches(term, m.project_name, m.client_name, m.employee_name))
    .slice(0, 8);

  const projects = (projectsResult.data || [])
    .filter((p) => textMatches(term, p.name, p.client_name))
    .slice(0, 8);

  let employees = [];
  if (req.isAdmin) {
    const allEmployees = await getEmployeeUsers();
    employees = allEmployees
      .filter((e) => textMatches(term, e.name, e.email))
      .slice(0, 8)
      .map(({ id, name, email }) => ({ id, name, email }));
  }

  return { meetings, projects, employees };
}
