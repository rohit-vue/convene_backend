import * as bidsRepo from "./bids.repository.js";
import { validateBidFields } from "./bids.validator.js";
import { mapExtensionPayloadToBid } from "./bids.extension-mapper.js";

export async function listBids(req, query = {}) {
  if (!req.isAdmin) {
    return { error: "Admin access required", status: 403 };
  }

  try {
    const data = await bidsRepo.listAll({
      upworkAccount: query.upwork_account || null,
    });
    return { data };
  } catch (err) {
    return { error: err.message, status: 500 };
  }
}

export async function createBid(req, body) {
  if (!req.isAdmin) {
    return { error: "Admin access required", status: 403 };
  }

  const { errors, payload } = validateBidFields(body);
  if (errors.length) {
    return { error: errors[0], status: 400 };
  }

  try {
    const data = await bidsRepo.insert({
      ...payload,
      created_by: req.user.id,
    });
    return { data, status: 201 };
  } catch (err) {
    return { error: err.message, status: 400 };
  }
}

export async function createBidFromExtension(body) {
  const mapped = mapExtensionPayloadToBid(body);
  const { errors, payload } = validateBidFields(mapped);

  if (errors.length) {
    return { error: errors[0], status: 400 };
  }

  try {
    const existing = await bidsRepo.findByJobLinkAndAccount(
      payload.job_link,
      payload.upwork_account,
    );

    if (existing) {
      const data = await bidsRepo.update(existing.id, payload);
      return { data, status: 200 };
    }

    const data = await bidsRepo.insert({
      ...payload,
      created_by: null,
    });
    return { data, status: 201 };
  } catch (err) {
    return { error: err.message, status: 400 };
  }
}

export async function deleteBid(req, bidId) {
  if (!req.isAdmin) {
    return { error: "Admin access required", status: 403 };
  }

  const existing = await bidsRepo.findById(bidId);
  if (!existing) {
    return { error: "Bid not found", status: 404 };
  }

  try {
    await bidsRepo.remove(bidId);
    return { status: 204 };
  } catch (err) {
    return { error: err.message, status: 400 };
  }
}

export async function updateBid(req, bidId, body) {
  if (!req.isAdmin) {
    return { error: "Admin access required", status: 403 };
  }

  const existing = await bidsRepo.findById(bidId);
  if (!existing) {
    return { error: "Bid not found", status: 404 };
  }

  const { errors, payload } = validateBidFields(body);
  if (errors.length) {
    return { error: errors[0], status: 400 };
  }

  try {
    const data = await bidsRepo.update(bidId, payload);
    return { data };
  } catch (err) {
    return { error: err.message, status: 400 };
  }
}
