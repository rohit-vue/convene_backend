import { Router } from "express";
import { requireAuth } from "../../middleware/auth.js";
import { asyncHandler } from "../../middleware/asyncHandler.js";
import * as searchController from "./search.controller.js";

const router = Router();

router.get("/", requireAuth, asyncHandler(searchController.search));

export default router;
