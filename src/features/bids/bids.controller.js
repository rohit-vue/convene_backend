import * as bidsService from "./bids.service.js";

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
  respond(res, await bidsService.listBids(req, req.query));
}

export async function create(req, res) {
  respond(res, await bidsService.createBid(req, req.body));
}
