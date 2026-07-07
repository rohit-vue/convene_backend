import { Router } from "express";
import { requireAuth, requireAdmin, requireEmployee } from "../../middleware/auth.js";
import { asyncHandler } from "../../middleware/asyncHandler.js";
import * as employeesController from "./employees.controller.js";

const router = Router();

router.get("/options", requireAuth, asyncHandler(employeesController.options));
router.get("/", requireAuth, requireAdmin, asyncHandler(employeesController.list));
router.get(
  "/:employeeId/meetings/:meetingId/updates",
  requireAuth,
  requireAdmin,
  asyncHandler(employeesController.getMeetingUpdates),
);
router.get(
  "/:employeeId/meetings/:meetingId",
  requireAuth,
  requireAdmin,
  asyncHandler(employeesController.getMeeting),
);
router.get(
  "/:employeeId/projects/:projectId/status-history",
  requireAuth,
  requireAdmin,
  asyncHandler(employeesController.getProjectStatusHistory),
);
router.get(
  "/:employeeId/projects/:projectId/milestone-cost-history",
  requireAuth,
  requireAdmin,
  asyncHandler(employeesController.getProjectMilestones),
);
router.get(
  "/:employeeId/projects/:projectId/milestones",
  requireAuth,
  requireAdmin,
  asyncHandler(employeesController.getProjectMilestones),
);
router.get(
  "/:employeeId/projects/:projectId/daily-logs",
  requireAuth,
  requireAdmin,
  asyncHandler(employeesController.getProjectDailyLogs),
);
router.get(
  "/:employeeId/projects/:projectId",
  requireAuth,
  requireAdmin,
  asyncHandler(employeesController.getProject),
);
router.get("/:id", requireAuth, requireAdmin, asyncHandler(employeesController.getById));

export default router;
