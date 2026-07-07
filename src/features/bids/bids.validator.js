import { UPWORK_ACCOUNTS, BID_STATUSES, BID_JOB_TYPES } from "./bids.constants.js";

const DATE_KEY_RE = /^\d{4}-\d{2}-\d{2}$/;

function isValidUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function parseMoneyAmount(value) {
  if (value === null || value === undefined || value === "") return null;
  const digits = String(value).replace(/\D/g, "");
  if (!digits) return null;
  return Number(digits);
}

export function validateBidFields(body) {
  const errors = [];
  const upwork_account = body.upwork_account ? String(body.upwork_account).trim() : "";
  const job_link = body.job_link ? String(body.job_link).trim() : "";
  const notes = body.notes != null && body.notes !== "" ? String(body.notes).trim() : null;
  let bid_date = body.bid_date ? String(body.bid_date).trim() : null;
  const status = body.status ? String(body.status).trim() : "applied";
  const job_type = body.job_type ? String(body.job_type).trim() : "";

  if (!upwork_account) {
    errors.push("upwork_account is required");
  } else if (!UPWORK_ACCOUNTS.includes(upwork_account)) {
    errors.push("Valid upwork_account is required");
  }

  if (!job_link) {
    errors.push("job_link is required");
  } else if (!isValidUrl(job_link)) {
    errors.push("job_link must be a valid URL");
  }

  if (!BID_STATUSES.includes(status)) {
    errors.push("Valid status is required");
  }

  if (!job_type) {
    errors.push("job_type is required");
  } else if (!BID_JOB_TYPES.includes(job_type)) {
    errors.push("Valid job_type is required");
  }

  let hourly_rate = null;
  let fixed_amount = null;

  if (job_type === "hourly") {
    hourly_rate = parseMoneyAmount(body.hourly_rate);
    if (hourly_rate === null || hourly_rate < 0) {
      errors.push("hourly_rate is required for hourly bids");
    }
  }

  if (job_type === "fixed") {
    fixed_amount = parseMoneyAmount(body.fixed_amount);
    if (fixed_amount === null || fixed_amount < 0) {
      errors.push("fixed_amount is required for fixed bids");
    }
  }

  if (bid_date && !DATE_KEY_RE.test(bid_date)) {
    errors.push("bid_date must be YYYY-MM-DD");
  }

  if (!bid_date) {
    bid_date = new Date().toISOString().slice(0, 10);
  }

  if (errors.length) {
    return { errors };
  }

  return {
    errors: [],
    payload: {
      upwork_account,
      job_link,
      bid_date,
      status,
      job_type,
      hourly_rate: job_type === "hourly" ? hourly_rate : null,
      fixed_amount: job_type === "fixed" ? fixed_amount : null,
      notes,
    },
  };
}
