import { Router } from "express";
import { requireAuth } from "../../middleware/auth.js";
import { asyncHandler } from "../../middleware/asyncHandler.js";
import * as dashboardController from "./dashboard.controller.js";

const router = Router();

router.get("/stats", requireAuth, asyncHandler(dashboardController.stats));
router.get("/overview", requireAuth, asyncHandler(dashboardController.overview));
router.get("/activity", requireAuth, asyncHandler(dashboardController.activity));

export default router;
