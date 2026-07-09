import { env } from "../config/env.js";
import { UnauthorizedError } from "../shared/errors/AppError.js";

export function requireExtensionKey(req, res, next) {
  if (!env.extensionApiKey) {
    return next(new UnauthorizedError("Extension API is not configured"));
  }

  const key = req.headers["x-extension-key"];
  if (!key || key !== env.extensionApiKey) {
    return next(new UnauthorizedError("Invalid extension API key"));
  }

  next();
}
