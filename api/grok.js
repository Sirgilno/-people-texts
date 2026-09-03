// Same-origin proxy so the browser never talks to api.x.ai directly.
// Ad blockers / VPNs often block x.ai even when the page has no ads;
// Claude (api.anthropic.com) is usually left alone. This keeps Unhinged on Grok.

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: { message: 'Method not allowed' } });
  }

  var auth = req.headers.authorization || '';
  if (!auth || auth.indexOf('Bearer ') !== 0 || auth.length < 20) {
    return res.status(401).json({
      error: { message: 'Missing Grok API key. Save your xAI key in the app, then try again.' }
    });
  }

  var payload = req.body;
  if (typeof payload === 'string') {
    try { payload = JSON.parse(payload); } catch (e) {
      return res.status(400).json({ error: { message: 'Invalid JSON body' } });
    }
  }
  if (!payload || typeof payload !== 'object') {
    return res.status(400).json({ error: { message: 'Request body required' } });
  }

  try {
    var upstream = await fetch('https://api.x.ai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': auth
      },
      body: JSON.stringify(payload)
    });

    var data = await upstream.json().catch(function () { return {}; });
    return res.status(upstream.status).json(data);
  } catch (err) {
    return res.status(502).json({
      error: {
        message: 'Grok proxy could not reach xAI: ' + (err && err.message ? err.message : 'network error')
      }
    });
  }
};
