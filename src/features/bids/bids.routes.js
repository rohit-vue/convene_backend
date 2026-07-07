import { Router } from "express";
import { requireAuth, requireAdmin } from "../../middleware/auth.js";
import { asyncHandler } from "../../middleware/asyncHandler.js";
import * as bidsController from "./bids.controller.js";

const router = Router();

router.get("/", requireAuth, requireAdmin, asyncHandler(bidsController.list));
router.post("/", requireAuth, requireAdmin, asyncHandler(bidsController.create));

export default router;
