import express from "express";
import cors from "cors";

const app = express();

app.use(cors());
app.use(express.json());

// In-memory mock data (swap for a real database later)
const meetings = [
  { id: 1, name: "Website Redesign", status: "In Progress", progress: 62, lead: "Aarav Shah" },
  { id: 2, name: "Mobile App", status: "Planning", progress: 20, lead: "Priya Nair" },
  { id: 3, name: "API Platform", status: "Completed", progress: 100, lead: "Rohan Das" },
  { id: 4, name: "Design System", status: "In Progress", progress: 45, lead: "Meera Iyer" },
];

const employees = [
  { id: 1, name: "Aarav Shah", role: "Frontend Developer", email: "aarav@convene.io", status: "Active" },
  { id: 2, name: "Priya Nair", role: "Product Manager", email: "priya@convene.io", status: "Active" },
  { id: 3, name: "Rohan Das", role: "Backend Developer", email: "rohan@convene.io", status: "Away" },
  { id: 4, name: "Meera Iyer", role: "UX Designer", email: "meera@convene.io", status: "Active" },
  { id: 5, name: "Kabir Menon", role: "QA Engineer", email: "kabir@convene.io", status: "Away" },
  { id: 6, name: "Sara Khan", role: "DevOps Engineer", email: "sara@convene.io", status: "Active" },
];

app.get("/api/health", (req, res) => {
  res.json({ status: "ok", service: "convene-backend" });
});

app.get("/api/dashboard/stats", (req, res) => {
  res.json({
    meetings: meetings.length,
    employees: employees.length,
    revenue: 84200,
    tasksDone: 76,
  });
});

app.get("/api/meetings", (req, res) => {
  res.json(meetings);
});

app.get("/api/employees", (req, res) => {
  res.json(employees);
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => console.log(`Convene API running on http://localhost:${PORT}`));
