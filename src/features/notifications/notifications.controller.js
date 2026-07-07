import * as notificationsService from "./notifications.service.js";

function respond(res, result) {
  if (result.error) {
    return res.status(result.status || 400).json({ error: result.error });
  }
  return res.json(result.data);
}

export async function list(req, res) {
  try {
    const data = await notificationsService.listForUser(req);
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

export async function unreadCount(req, res) {
  try {
    const count = await notificationsService.unreadCount(req);
    res.json({ count });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

export async function markRead(req, res) {
  respond(res, await notificationsService.markRead(req, req.params.id));
}
