import * as dashboardService from "./dashboard.service.js";

export async function stats(req, res) {
  try {
    const data = await dashboardService.getStats(req);
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

export async function overview(req, res) {
  try {
    const data = await dashboardService.getOverview(req);
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

export async function activity(req, res) {
  try {
    const data = await dashboardService.getActivity(req);
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
