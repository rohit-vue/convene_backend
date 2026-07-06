import { Router } from "express";
import { requireAuth, requireEmployee } from "../../middleware/auth.js";
import { asyncHandler } from "../../middleware/asyncHandler.js";
import * as projectsController from "./projects.controller.js";

const router = Router();

router.get("/", requireAuth, requireEmployee, asyncHandler(projectsController.list));
router.post("/", requireAuth, requireEmployee, asyncHandler(projectsController.create));
router.get("/:id/status-history", requireAuth, requireEmployee, asyncHandler(projectsController.getStatusHistory));
router.get("/:id/daily-logs", requireAuth, requireEmployee, asyncHandler(projectsController.getDailyLogs));
router.post("/:id/daily-logs", requireAuth, requireEmployee, asyncHandler(projectsController.createDailyLog));
router.put("/:id/daily-logs/:logId", requireAuth, requireEmployee, asyncHandler(projectsController.updateDailyLog));
router.post("/:id/status", requireAuth, requireEmployee, asyncHandler(projectsController.changeStatus));
router.get("/:id", requireAuth, requireEmployee, asyncHandler(projectsController.getById));
router.patch("/:id", requireAuth, requireEmployee, asyncHandler(projectsController.patch));
router.delete("/:id", requireAuth, requireEmployee, asyncHandler(projectsController.remove));

export default router;
