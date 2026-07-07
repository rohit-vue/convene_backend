import { Router } from "express";
import { requireAuth, requireAdmin } from "../../middleware/auth.js";
import { asyncHandler } from "../../middleware/asyncHandler.js";
import * as bidsController from "./bids.controller.js";

const router = Router();

router.get("/", requireAuth, requireAdmin, asyncHandler(bidsController.list));
router.post("/", requireAuth, requireAdmin, asyncHandler(bidsController.create));
router.patch("/:id", requireAuth, requireAdmin, asyncHandler(bidsController.patch));
router.delete("/:id", requireAuth, requireAdmin, asyncHandler(bidsController.remove));

export default router;
