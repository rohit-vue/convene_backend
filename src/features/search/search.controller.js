import * as searchService from "./search.service.js";

export async function search(req, res) {
  try {
    const data = await searchService.search(req, req.query.q);
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
