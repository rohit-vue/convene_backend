import { Router } from "express";
import { requireAuth } from "../../middleware/auth.js";
import { asyncHandler } from "../../middleware/asyncHandler.js";
import * as notificationsController from "./notifications.controller.js";

const router = Router();

router.get("/", requireAuth, asyncHandler(notificationsController.list));
router.get("/unread-count", requireAuth, asyncHandler(notificationsController.unreadCount));
router.patch("/:id/read", requireAuth, asyncHandler(notificationsController.markRead));

export default router;
