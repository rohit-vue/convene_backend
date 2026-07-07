import { Router } from "express";
import { requireAuth, requireEmployee } from "../../middleware/auth.js";
import { asyncHandler } from "../../middleware/asyncHandler.js";
import * as projectsController from "./projects.controller.js";

const router = Router();

router.get("/", requireAuth, asyncHandler(projectsController.list));
router.post("/", requireAuth, requireEmployee, asyncHandler(projectsController.create));
router.get("/:id/status-history", requireAuth, requireEmployee, asyncHandler(projectsController.getStatusHistory));
router.get(
  "/:id/milestone-cost-history",
  requireAuth,
  requireEmployee,
  asyncHandler(projectsController.listMilestones),
);
router.get("/:id/milestones", requireAuth, requireEmployee, asyncHandler(projectsController.listMilestones));
router.get("/:id/daily-logs", requireAuth, requireEmployee, asyncHandler(projectsController.getDailyLogs));
router.post("/:id/daily-logs", requireAuth, requireEmployee, asyncHandler(projectsController.createDailyLog));
router.put("/:id/daily-logs/:logId", requireAuth, requireEmployee, asyncHandler(projectsController.updateDailyLog));
router.post("/:id/status", requireAuth, requireEmployee, asyncHandler(projectsController.changeStatus));
router.post(
  "/:id/milestone-cost",
  requireAuth,
  requireEmployee,
  asyncHandler(projectsController.addMilestone),
);
router.post("/:id/milestones", requireAuth, requireEmployee, asyncHandler(projectsController.addMilestone));
router.get("/:id", requireAuth, requireEmployee, asyncHandler(projectsController.getById));
router.patch("/:id", requireAuth, requireEmployee, asyncHandler(projectsController.patch));
router.delete("/:id", requireAuth, requireEmployee, asyncHandler(projectsController.remove));

export default router;
