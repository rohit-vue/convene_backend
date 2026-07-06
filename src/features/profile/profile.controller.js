import * as profileService from "./profile.service.js";

function respond(res, result) {
  if (result.error) {
    return res.status(result.status || 400).json({ error: result.error });
  }
  return res.json(result.data);
}

export async function get(req, res) {
  try {
    const data = await profileService.getProfile(req.user.id);
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

export async function patch(req, res) {
  try {
    respond(res, await profileService.updateProfile(req.user.id, req.body));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
