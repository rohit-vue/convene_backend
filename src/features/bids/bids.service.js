import * as bidsRepo from "./bids.repository.js";
import { validateBidFields } from "./bids.validator.js";

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
