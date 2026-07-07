import * as bidsService from "./bids.service.js";

function respond(res, result) {
  if (result.error) {
    return res.status(result.status || 400).json({ error: result.error });
  }
  if (result.status === 201) {
    return res.status(201).json(result.data);
  }
  if (result.status === 204) {
    return res.status(204).end();
  }
  return res.json(result.data);
}

export async function list(req, res) {
  respond(res, await bidsService.listBids(req, req.query));
}

export async function create(req, res) {
  respond(res, await bidsService.createBid(req, req.body));
}

export async function remove(req, res) {
  respond(res, await bidsService.deleteBid(req, req.params.id));
}

export async function patch(req, res) {
  respond(res, await bidsService.updateBid(req, req.params.id, req.body));
}
