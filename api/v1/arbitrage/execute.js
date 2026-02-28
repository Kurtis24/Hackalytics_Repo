/**
 * Vercel serverless function: proxy to backend POST /api/v1/arbitrage/execute.
 * Used by the monthly cron (and can be called manually). Set BACKEND_URL in Vercel env.
 * Backend must be deployed and reachable from the internet (e.g. Railway, Render); cron cannot call localhost.
 */
const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:9000';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const url = `${BACKEND_URL.replace(/\/$/, '')}/api/v1/arbitrage/execute`;
  try {
    const response = await fetch(url, { method: 'POST' });
    const data = await response.json().catch(() => ({}));
    res.setHeader('Content-Type', 'application/json');
    res.status(response.status).json(data);
  } catch (err) {
    console.error('Arbitrage execute proxy error:', err.message);
    res.status(502).json({ error: 'Backend unreachable', detail: err.message });
  }
}
