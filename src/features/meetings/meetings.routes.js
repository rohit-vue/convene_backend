import { Router } from "express";
import { requireAuth, requireAdmin, requireEmployee } from "../../middleware/auth.js";
import { asyncHandler } from "../../middleware/asyncHandler.js";
import * as meetingsController from "./meetings.controller.js";

const router = Router();

router.get("/pending", requireAuth, asyncHandler(meetingsController.listPending));
router.post("/assign", requireAuth, requireAdmin, asyncHandler(meetingsController.assign));
router.patch("/:id/accept", requireAuth, requireEmployee, asyncHandler(meetingsController.accept));
router.get("/", requireAuth, asyncHandler(meetingsController.list));
router.post("/", requireAuth, requireEmployee, asyncHandler(meetingsController.create));
router.get("/:id/updates", requireAuth, asyncHandler(meetingsController.listUpdates));
router.post("/:id/updates", requireAuth, asyncHandler(meetingsController.createUpdate));
router.put("/:id/updates/:updateId", requireAuth, asyncHandler(meetingsController.updateUpdate));
router.get("/:id", requireAuth, asyncHandler(meetingsController.getById));
router.put("/:id", requireAuth, asyncHandler(meetingsController.update));

export default router;
