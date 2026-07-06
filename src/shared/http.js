export function sendServiceResult(res, result) {
  if (result.error) {
    return res.status(result.status || 400).json({ error: result.error });
  }
  return result.data;
}
