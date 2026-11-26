export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'GET') return res.status(405).end();
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) return res.status(503).json({ connected: false });
  const options = { headers: { apikey: key }, signal: AbortSignal.timeout(7000), redirect: 'error' };
  try {
    const auth = await fetch(new URL('/auth/v1/settings', url), options);
    if (!auth.ok) return res.status(502).json({ connected: false, upstream: auth.status });
    const tables = await Promise.all(['atenda_agents', 'atenda_conversations'].map(async table => {
      const response = await fetch(new URL('/rest/v1/' + table + '?select=id&limit=0', url), options);
      if (response.ok) return [table, 'available'];
      const error = await response.json().catch(() => ({}));
      return [table, error.code === 'PGRST205' ? 'missing' : 'unverified'];
    }));
    return res.status(200).json({ connected: true, tables: Object.fromEntries(tables) });
  } catch {
    return res.status(503).json({ connected: false });
  }
}
