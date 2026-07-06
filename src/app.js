import "dotenv/config";
import express from "express";
import cors from "cors";
import { env } from "./config/env.js";
import { errorHandler } from "./middleware/errorHandler.js";
import healthRoutes from "./features/health/health.routes.js";
import dashboardRoutes from "./features/dashboard/dashboard.routes.js";
import meetingsRoutes from "./features/meetings/meetings.routes.js";
import projectsRoutes from "./features/projects/projects.routes.js";
import employeesRoutes from "./features/employees/employees.routes.js";
import searchRoutes from "./features/search/search.routes.js";
import profileRoutes from "./features/profile/profile.routes.js";

const app = express();

app.use(
  cors({
    origin: env.corsOrigin === "*" ? true : env.corsOrigin,
  }),
);
app.use(express.json({ limit: "1mb" }));

app.use("/api", healthRoutes);
app.use("/api/dashboard", dashboardRoutes);
app.use("/api/meetings", meetingsRoutes);
app.use("/api/projects", projectsRoutes);
app.use("/api/employees", employeesRoutes);
app.use("/api/search", searchRoutes);
app.use("/api/profile", profileRoutes);

app.use(errorHandler);

export default app;
