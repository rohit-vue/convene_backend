import { Router } from "express";
import { requireAuth } from "../../middleware/auth.js";
import { asyncHandler } from "../../middleware/asyncHandler.js";
import * as profileController from "./profile.controller.js";

const router = Router();

router.get("/", requireAuth, asyncHandler(profileController.get));
router.patch("/", requireAuth, asyncHandler(profileController.patch));

export default router;
