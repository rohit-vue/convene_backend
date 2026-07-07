import * as meetingsService from "./meetings.service.js";

function respond(res, result) {
  if (result.error) {
    return res.status(result.status || 400).json({ error: result.error });
  }
  if (result.status === 201) {
    return res.status(201).json(result.data);
  }
  return res.json(result.data);
}

export async function list(req, res) {
  try {
    const data = await meetingsService.listMeetings(req);
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

export async function listPending(req, res) {
  try {
    const data = await meetingsService.listPendingMeetings(req);
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

export async function assign(req, res) {
  respond(res, await meetingsService.assignMeeting(req, req.body));
}

export async function accept(req, res) {
  respond(res, await meetingsService.acceptMeeting(req, req.params.id));
}

export async function create(req, res) {
  respond(res, await meetingsService.createMeeting(req, req.body));
}

export async function getById(req, res) {
  respond(res, await meetingsService.getMeetingDetail(req, req.params.id));
}

export async function update(req, res) {
  respond(res, await meetingsService.updateMeetingParent(req, req.params.id, req.body));
}

export async function listUpdates(req, res) {
  respond(res, await meetingsService.listUpdates(req, req.params.id));
}

export async function createUpdate(req, res) {
  respond(res, await meetingsService.createUpdate(req, req.params.id, req.body));
}

export async function updateUpdate(req, res) {
  respond(
    res,
    await meetingsService.updateUpdate(req, req.params.id, req.params.updateId, req.body),
  );
}
