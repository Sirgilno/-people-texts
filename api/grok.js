// Same-origin proxy so the browser never talks to api.x.ai directly.
// Ad blockers / VPNs often block x.ai even when the page has no ads;
// Claude (api.anthropic.com) is usually left alone. This keeps Unhinged on Grok.

var XAI_CHAT_URL = process.env.XAI_CHAT_URL || 'https://api.x.ai/v1/chat/completions';
var UPSTREAM_TIMEOUT_MS = parseInt(process.env.GROK_UPSTREAM_TIMEOUT_MS || '55000', 10);

function isAbortError(err) {
  if (!err) return false;
  if (err.name === 'AbortError') return true;
  return /aborted|abort/i.test(String(err.message || ''));
}

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

  // Chat generation does not need high reasoning. 4.6/4.5 default to "high"
  // and can think past Vercel's 60s function cap, which looks like "typing forever".
  if (payload.model === 'grok-4.6' || payload.model === 'grok-4.5') {
    payload.reasoning_effort = 'low';
  }

  var controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
  var timer = null;
  if (controller && UPSTREAM_TIMEOUT_MS > 0) {
    timer = setTimeout(function () { controller.abort(); }, UPSTREAM_TIMEOUT_MS);
  }

  try {
    var fetchOpts = {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': auth
      },
      body: JSON.stringify(payload)
    };
    if (controller) fetchOpts.signal = controller.signal;

    var upstream = await fetch(XAI_CHAT_URL, fetchOpts);
    var data = await upstream.json().catch(function () { return {}; });
    return res.status(upstream.status).json(data);
  } catch (err) {
    if (isAbortError(err)) {
      return res.status(504).json({
        error: {
          message: 'Grok timed out while thinking. Switch to grok-4.3 and Generate again.'
        }
      });
    }
    return res.status(502).json({
      error: {
        message: 'Grok proxy could not reach xAI: ' + (err && err.message ? err.message : 'network error')
      }
    });
  } finally {
    if (timer) clearTimeout(timer);
  }
};
