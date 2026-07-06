export function healthCheck(_req, res) {
  res.json({ status: "ok", service: "convene-backend" });
}
