function parseMoneyValue(value) {
  if (value === null || value === undefined || value === "") return null;
  const match = String(value).replace(/,/g, "").match(/(\d+(?:\.\d{1,2})?)/);
  if (!match) return null;
  const amount = Number(match[1]);
  return Number.isFinite(amount) ? Math.round(amount) : null;
}

export function parseHourlyRate(value) {
  if (!value) return null;

  const range = String(value).match(
    /\$?\s*([\d,]+(?:\.\d{1,2})?)\s*-\s*\$?\s*([\d,]+(?:\.\d{1,2})?)/,
  );

  if (range) {
    const low = parseMoneyValue(range[1]);
    const high = parseMoneyValue(range[2]);
    if (low != null && high != null) return Math.round((low + high) / 2);
    return low ?? high;
  }

  return parseMoneyValue(value);
}

export function parseFixedAmount(value) {
  return parseMoneyValue(value);
}

export function mapJobType(value) {
  const normalized = String(value || "").trim().toLowerCase();
  if (normalized.includes("fixed")) return "fixed";
  if (normalized.includes("hourly")) return "hourly";
  return "";
}

function stripJobUrl(url) {
  try {
    const parsed = new URL(url);
    return `${parsed.origin}${parsed.pathname}`;
  } catch {
    return String(url).split("?")[0];
  }
}

export function mapExtensionPayloadToBid(body) {
  const jobType = mapJobType(body.jobType ?? body.job_type);
  const hourlyOverride = body.hourly_rate ?? body.hourly_rate_override;
  const fixedOverride = body.fixed_amount ?? body.fixed_amount_override;

  return {
    upwork_account: body.upwork_account ? String(body.upwork_account).trim() : "",
    job_link: body.url || body.job_link ? stripJobUrl(body.url || body.job_link) : "",
    job_type: jobType,
    hourly_rate:
      hourlyOverride != null && hourlyOverride !== ""
        ? parseHourlyRate(hourlyOverride) ?? parseMoneyValue(hourlyOverride)
        : parseHourlyRate(body.hourlyRate ?? body.hourly_rate),
    fixed_amount:
      fixedOverride != null && fixedOverride !== ""
        ? parseFixedAmount(fixedOverride) ?? parseMoneyValue(fixedOverride)
        : parseFixedAmount(body.budget ?? body.fixed_amount),
    status: body.status ? String(body.status).trim() : "applied",
    bid_date: body.bid_date ? String(body.bid_date).trim() : null,
    notes:
      body.notes != null && body.notes !== ""
        ? String(body.notes).trim()
        : body.title
          ? String(body.title).trim()
          : null,
  };
}
