/**
 * AI Chat Pro — Cloudflare Worker
 * Routes: /api/auth, /api/chat, /api/models, /api/user, /api/admin
 */

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

// ─── JWT helpers (simple, no library needed) ───────────────
async function signJWT(payload, secret) {
  const header  = btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const body    = btoa(JSON.stringify(payload));
  const data    = `${header}.${body}`;
  const key     = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(data));
  const sigB64 = btoa(String.fromCharCode(...new Uint8Array(sig)))
    .replace(/\+/g,'-').replace(/\//g,'_').replace(/=/g,'');
  return `${data}.${sigB64}`;
}

async function verifyJWT(token, secret) {
  try {
    const [header, body, sig] = token.split('.');
    const data = `${header}.${body}`;
    const key  = await crypto.subtle.importKey(
      'raw', new TextEncoder().encode(secret),
      { name: 'HMAC', hash: 'SHA-256' }, false, ['verify']
    );
    const sigBytes = Uint8Array.from(atob(sig.replace(/-/g,'+').replace(/_/g,'/')), c => c.charCodeAt(0));
    const valid = await crypto.subtle.verify('HMAC', key, sigBytes, new TextEncoder().encode(data));
    if (!valid) return null;
    const payload = JSON.parse(atob(body));
    if (payload.exp && Date.now() > payload.exp) return null;
    return payload;
  } catch { return null; }
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' }
  });
}

function err(msg, status = 400) {
  return json({ error: msg }, status);
}

async function getUser(req, env) {
  const auth = req.headers.get('Authorization') || '';
  const token = auth.replace('Bearer ', '');
  if (!token) return null;
  return await verifyJWT(token, env.JWT_SECRET || 'aichat_secret_2025');
}

// ─── Password hash (simple SHA-256) ───────────────────────
async function hashPass(pass) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(pass));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2,'0')).join('');
}

// ═══════════════════════════════════════════════════════════
// MAIN ROUTER
// ═══════════════════════════════════════════════════════════
export default {
  async fetch(req, env, ctx) {
    const url  = new URL(req.url);
    const path = url.pathname;

    // Preflight
    if (req.method === 'OPTIONS') {
      return new Response(null, { headers: CORS });
    }

    // ── Auth routes ─────────────────────────────────────
    if (path === '/api/auth/signup' && req.method === 'POST') {
      return handleSignup(req, env);
    }
    if (path === '/api/auth/login' && req.method === 'POST') {
      return handleLogin(req, env);
    }
    if (path === '/api/auth/me' && req.method === 'GET') {
      return handleMe(req, env);
    }

    // ── Chat route ──────────────────────────────────────
    if (path === '/api/chat' && req.method === 'POST') {
      return handleChat(req, env);
    }

    // ── Models route ────────────────────────────────────
    if (path === '/api/models' && req.method === 'GET') {
      return handleModels(req, env);
    }

    // ── User routes ─────────────────────────────────────
    if (path === '/api/user/usage' && req.method === 'GET') {
      return handleUsage(req, env);
    }
    if (path === '/api/user/profile' && req.method === 'POST') {
      return handleUpdateProfile(req, env);
    }

    // ── Admin routes ────────────────────────────────────
    if (path.startsWith('/api/admin/')) {
      return handleAdmin(req, env, path);
    }

    return err('Not found', 404);
  }
};

// ═══════════════════════════════════════════════════════════
// AUTH HANDLERS
// ═══════════════════════════════════════════════════════════
async function handleSignup(req, env) {
  const { name, email, password } = await req.json();
  if (!name || !email || !password) return err('Sab fields zaroori hain');
  if (password.length < 6) return err('Password min 6 chars ka hona chahiye');

  const existing = await env.DB.prepare(
    'SELECT id FROM users WHERE email = ?'
  ).bind(email.toLowerCase()).first();

  if (existing) return err('Yeh email pehle se registered hai');

  const id   = crypto.randomUUID();
  const hash = await hashPass(password);
  const plan = 'basic';
  const maxT = 5000000;

  await env.DB.prepare(`
    INSERT INTO users (id, name, email, password, plan, tokens, max_tokens, role, status, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, 'user', 'active', datetime('now'))
  `).bind(id, name, email.toLowerCase(), hash, plan, maxT, maxT).run();

  const token = await signJWT(
    { id, email: email.toLowerCase(), name, plan, role: 'user', exp: Date.now() + 30*24*60*60*1000 },
    env.JWT_SECRET || 'aichat_secret_2025'
  );

  return json({ token, user: { id, name, email, plan, role: 'user', tokens: maxT, maxTokens: maxT } });
}

async function handleLogin(req, env) {
  const { email, password } = await req.json();
  if (!email || !password) return err('Email aur password zaroori hain');

  const user = await env.DB.prepare(
    'SELECT * FROM users WHERE email = ?'
  ).bind(email.toLowerCase()).first();

  if (!user) return err('Email ya password galat hai');
  if (user.status === 'suspended') return err('Account suspended hai. Admin se contact karo.');

  const hash = await hashPass(password);
  if (hash !== user.password) return err('Email ya password galat hai');

  // Update last login
  await env.DB.prepare(
    'UPDATE users SET last_login = datetime("now") WHERE id = ?'
  ).bind(user.id).run();

  const token = await signJWT(
    { id: user.id, email: user.email, name: user.name, plan: user.plan, role: user.role,
      exp: Date.now() + 30*24*60*60*1000 },
    env.JWT_SECRET || 'aichat_secret_2025'
  );

  return json({
    token,
    user: { id: user.id, name: user.name, email: user.email, plan: user.plan,
            role: user.role, tokens: user.tokens, maxTokens: user.max_tokens }
  });
}

async function handleMe(req, env) {
  const payload = await getUser(req, env);
  if (!payload) return err('Unauthorized', 401);

  const user = await env.DB.prepare(
    'SELECT id, name, email, plan, role, tokens, max_tokens, status FROM users WHERE id = ?'
  ).bind(payload.id).first();

  if (!user) return err('User not found', 404);
  return json({ ...user, maxTokens: user.max_tokens });
}

// ═══════════════════════════════════════════════════════════
// CHAT HANDLER — Real Streaming
// ═══════════════════════════════════════════════════════════
async function handleChat(req, env) {
  const payload = await getUser(req, env);
  if (!payload) return err('Login karo pehle', 401);

  // Check balance
  const user = await env.DB.prepare(
    'SELECT tokens, max_tokens, plan FROM users WHERE id = ?'
  ).bind(payload.id).first();

  if (!user || user.tokens <= 0) {
    return err('Token balance khatam ho gaya. Plan upgrade karo.');
  }

  const { messages, model = 'openai/gpt-4o-mini', conv_id } = await req.json();
  if (!messages || !messages.length) return err('Messages required');

  // Premium model multiplier
  const PREMIUM_MODELS = ['gpt-4o', 'claude-opus', 'gemini-2.5-pro', 'gpt-4.1', 'claude-opus-4', 'deepseek-r1'];
  const isPremium = PREMIUM_MODELS.some(p => model.toLowerCase().includes(p));
  const multiplier = isPremium ? 4 : 1;

  // Get system prompt from DB
  const sysRow = await env.DB.prepare(
    "SELECT value FROM settings WHERE key = 'system_prompt'"
  ).first();
  const systemPrompt = sysRow?.value || 'You are a helpful AI assistant.';

  // ── Cloudflare AI (model starts with @cf/) ──────────────
  const isCfModel = model.startsWith('@cf/');
  if (isCfModel) {
    if (!env.AI) return err('Cloudflare AI binding not configured. Add [ai] binding in wrangler.toml');
    const cfMessages = [
      { role: 'system', content: systemPrompt },
      ...messages.slice(-20)
    ];
    let cfResp;
    try {
      cfResp = await env.AI.run(model, { messages: cfMessages, stream: true });
    } catch (e) {
      return err(`Cloudflare AI error: ${e.message}`);
    }
    // Stream CF AI response in same SSE format
    const { readable, writable } = new TransformStream();
    const writer = writable.getWriter();
    const encoder = new TextEncoder();
    ctx.waitUntil((async () => {
      const reader = cfResp.getReader();
      let fullContent = '';
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          const chunk = new TextDecoder().decode(value);
          const lines = chunk.split('\n').filter(l => l.startsWith('data: '));
          for (const line of lines) {
            const data = line.slice(6);
            if (data === '[DONE]') continue;
            try {
              const parsed = JSON.parse(data);
              const content = parsed.response || parsed.choices?.[0]?.delta?.content || '';
              if (content) {
                fullContent += content;
                await writer.write(encoder.encode(`data: ${JSON.stringify({ content })}\n\n`));
              }
            } catch {}
          }
        }
      } finally {
        const totalTokens = Math.ceil(fullContent.length / 4) + 100;
        const deduct = totalTokens * multiplier;
        await env.DB.prepare('UPDATE users SET tokens = MAX(0, tokens - ?) WHERE id = ?').bind(deduct, userId).run();
        await env.DB.prepare('INSERT INTO usage (id, user_id, model, tokens_used, multiplier, conv_id, created_at) VALUES (?, ?, ?, ?, ?, ?, datetime(\'now\'))').bind(crypto.randomUUID(), userId, model, deduct, multiplier, conv_id || '').run();
        const updated = await env.DB.prepare('SELECT tokens FROM users WHERE id = ?').bind(userId).first();
        await writer.write(encoder.encode(`data: ${JSON.stringify({ done: true, stats: { tokens: totalTokens, balance: updated?.tokens || 0, model } })}\n\n`));
        await writer.close();
      }
    })());
    return new Response(readable, {
      headers: { ...CORS, 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', 'X-Accel-Buffering': 'no' }
    });
  }

  // ── OpenRouter (all other models) ───────────────────────
  const apiKey = env.OPENROUTER_KEY;
  if (!apiKey) return err('API key configure nahi hai');

  // Call OpenRouter — Streaming
  const resp = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'https://aichat.pages.dev',
      'X-Title': 'AI Chat Pro',
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: systemPrompt },
        ...messages.slice(-20)
      ],
      stream: true,
      max_tokens: 4096,
    })
  });

  if (!resp.ok) {
    const e = await resp.json().catch(() => ({}));
    return err(e.error?.message || `API error: ${resp.status}`);
  }

  // Track tokens in background after stream completes
  let totalTokens = 0;
  const userId = payload.id;

  // Transform stream
  const { readable, writable } = new TransformStream();
  const writer = writable.getWriter();
  const encoder = new TextEncoder();

  ctx.waitUntil((async () => {
    const reader = resp.body.getReader();
    let fullContent = '';
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = new TextDecoder().decode(value);
        const lines = chunk.split('\n').filter(l => l.startsWith('data: '));
        for (const line of lines) {
          const data = line.slice(6);
          if (data === '[DONE]') continue;
          try {
            const parsed = JSON.parse(data);
            const content = parsed.choices?.[0]?.delta?.content || '';
            if (content) {
              fullContent += content;
              await writer.write(encoder.encode(`data: ${JSON.stringify({ content })}\n\n`));
            }
            // Capture usage if available
            if (parsed.usage) {
              totalTokens = parsed.usage.total_tokens || 0;
            }
          } catch {}
        }
      }
    } finally {
      // Estimate tokens if not provided
      if (!totalTokens) {
        totalTokens = Math.ceil(fullContent.length / 4) + 100;
      }
      const deduct = totalTokens * multiplier;

      // Save to DB
      await env.DB.prepare(`
        UPDATE users SET tokens = MAX(0, tokens - ?) WHERE id = ?
      `).bind(deduct, userId).run();

      await env.DB.prepare(`
        INSERT INTO usage (id, user_id, model, tokens_used, multiplier, conv_id, created_at)
        VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
      `).bind(crypto.randomUUID(), userId, model, deduct, multiplier, conv_id || '').run();

      // Get new balance
      const updated = await env.DB.prepare(
        'SELECT tokens FROM users WHERE id = ?'
      ).bind(userId).first();

      await writer.write(encoder.encode(`data: ${JSON.stringify({
        done: true,
        stats: { tokens: totalTokens, balance: updated?.tokens || 0, model }
      })}\n\n`));

      await writer.close();
    }
  })());

  return new Response(readable, {
    headers: {
      ...CORS,
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'X-Accel-Buffering': 'no',
    }
  });
}

// ═══════════════════════════════════════════════════════════
// MODELS
// ═══════════════════════════════════════════════════════════
const CF_AI_MODELS = [
  { id: '@cf/meta/llama-3.1-8b-instruct', name: 'Llama 3.1 8B' },
  { id: '@cf/meta/llama-3.3-70b-instruct-fp8-fast', name: 'Llama 3.3 70B (Fast)' },
  { id: '@cf/google/gemma-3-12b-it', name: 'Gemma 3 12B' },
  { id: '@cf/mistral/mistral-7b-instruct-v0.2', name: 'Mistral 7B' },
  { id: '@cf/qwen/qwen2.5-coder-32b-instruct', name: 'Qwen 2.5 Coder 32B' },
  { id: '@cf/deepseek-ai/deepseek-r1-distill-qwen-32b', name: 'DeepSeek R1 Distill 32B' },
  { id: '@cf/microsoft/phi-4-multimodal-instruct', name: 'Phi-4 Multimodal' },
];

async function handleModels(req, env) {
  // Return cached models or fetch from OpenRouter
  const cached = await env.DB.prepare(
    "SELECT value, updated_at FROM settings WHERE key = 'models_cache'"
  ).first();

  // Cache valid for 1 hour
  if (cached && cached.value) {
    const age = Date.now() - new Date(cached.updated_at).getTime();
    if (age < 3600000) {
      const parsed = JSON.parse(cached.value);
      parsed['Cloudflare AI'] = CF_AI_MODELS;
      return json(parsed);
    }
  }

  const apiKey = env.OPENROUTER_KEY;
  if (!apiKey) return json({ 'Cloudflare AI': CF_AI_MODELS });

  try {
    const resp = await fetch('https://openrouter.ai/api/v1/models', {
      headers: { 'Authorization': `Bearer ${apiKey}` }
    });
    const data = await resp.json();
    const models = data.data || [];

    // Group by provider
    const grouped = {};
    const prefixes = {
      'openai': 'OpenAI', 'anthropic': 'Claude', 'google': 'Google',
      'deepseek': 'DeepSeek', 'meta-llama': 'Meta', 'mistralai': 'Mistral',
      'mistral': 'Mistral', 'x-ai': 'xAI', 'qwen': 'Qwen',
    };
    for (const m of models) {
      const id = m.id || '';
      let provider = 'Other';
      for (const [prefix, name] of Object.entries(prefixes)) {
        if (id.toLowerCase().startsWith(prefix)) { provider = name; break; }
      }
      if (!grouped[provider]) grouped[provider] = [];
      grouped[provider].push({ id, name: m.name || id });
    }

    // Cache it (without CF AI — added at serve time)
    await env.DB.prepare(
      "INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES ('models_cache', ?, datetime('now'))"
    ).bind(JSON.stringify(grouped)).run();

    grouped['Cloudflare AI'] = CF_AI_MODELS;
    return json(grouped);
  } catch (e) {
    return json({ OpenAI: [{id:'openai/gpt-4o-mini', name:'GPT-4o Mini'}] });
  }
}

// ═══════════════════════════════════════════════════════════
// USER ROUTES
// ═══════════════════════════════════════════════════════════
async function handleUsage(req, env) {
  const payload = await getUser(req, env);
  if (!payload) return err('Unauthorized', 401);

  const url   = new URL(req.url);
  const days  = parseInt(url.searchParams.get('days') || '7');

  const daily = await env.DB.prepare(`
    SELECT DATE(created_at) as date, SUM(tokens_used) as total, COUNT(*) as messages
    FROM usage WHERE user_id = ? AND created_at >= datetime('now', '-${days} days')
    GROUP BY DATE(created_at) ORDER BY date ASC
  `).bind(payload.id).all();

  const byModel = await env.DB.prepare(`
    SELECT model, SUM(tokens_used) as total, COUNT(*) as messages
    FROM usage WHERE user_id = ?
    GROUP BY model ORDER BY total DESC LIMIT 10
  `).bind(payload.id).all();

  const totals = await env.DB.prepare(`
    SELECT SUM(tokens_used) as total, COUNT(*) as requests,
           SUM(CASE WHEN DATE(created_at) = DATE('now') THEN tokens_used ELSE 0 END) as today
    FROM usage WHERE user_id = ?
  `).bind(payload.id).first();

  const user = await env.DB.prepare(
    'SELECT tokens, max_tokens FROM users WHERE id = ?'
  ).bind(payload.id).first();

  return json({
    daily: daily.results,
    byModel: byModel.results,
    total: totals?.total || 0,
    today: totals?.today || 0,
    requests: totals?.requests || 0,
    balance: user?.tokens || 0,
    maxTokens: user?.max_tokens || 5000000,
  });
}

async function handleUpdateProfile(req, env) {
  const payload = await getUser(req, env);
  if (!payload) return err('Unauthorized', 401);

  const { name, password } = await req.json();
  if (!name) return err('Name required');

  if (password) {
    if (password.length < 6) return err('Password min 6 chars');
    const hash = await hashPass(password);
    await env.DB.prepare(
      'UPDATE users SET name = ?, password = ? WHERE id = ?'
    ).bind(name, hash, payload.id).run();
  } else {
    await env.DB.prepare(
      'UPDATE users SET name = ? WHERE id = ?'
    ).bind(name, payload.id).run();
  }

  return json({ success: true });
}

// ═══════════════════════════════════════════════════════════
// ADMIN ROUTES
// ═══════════════════════════════════════════════════════════
async function handleAdmin(req, env, path) {
  const payload = await getUser(req, env);
  if (!payload || payload.role !== 'admin') return err('Admin only', 403);

  // GET /api/admin/users
  if (path === '/api/admin/users' && req.method === 'GET') {
    const users = await env.DB.prepare(
      'SELECT id, name, email, plan, tokens, max_tokens, role, status, created_at, last_login FROM users ORDER BY created_at DESC'
    ).all();
    return json(users.results);
  }

  // POST /api/admin/users — add user
  if (path === '/api/admin/users' && req.method === 'POST') {
    const { name, email, password, plan, tokens, status } = await req.json();
    if (!name || !email || !password) return err('Name, email, password zaroori hain');
    const existing = await env.DB.prepare('SELECT id FROM users WHERE email=?').bind(email.toLowerCase()).first();
    if (existing) return err('Email already exists');
    const maxMap = { basic: 5000000, pro: 20000000, enterprise: 100000000 };
    const maxT   = maxMap[plan] || 5000000;
    const hash   = await hashPass(password);
    const id     = crypto.randomUUID();
    await env.DB.prepare(`
      INSERT INTO users (id, name, email, password, plan, tokens, max_tokens, role, status, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'user', ?, datetime('now'))
    `).bind(id, name, email.toLowerCase(), hash, plan || 'basic', tokens || maxT, maxT, status || 'active').run();
    return json({ success: true, id });
  }

  // PUT /api/admin/users/:id — edit user
  if (path.match(/^\/api\/admin\/users\/[\w-]+$/) && req.method === 'PUT') {
    const id = path.split('/').pop();
    const { name, email, plan, tokens, status, password } = await req.json();
    const maxMap = { basic: 5000000, pro: 20000000, enterprise: 100000000 };
    const maxT = maxMap[plan] || 5000000;
    if (password) {
      const hash = await hashPass(password);
      await env.DB.prepare(
        'UPDATE users SET name=?, email=?, plan=?, tokens=?, max_tokens=?, status=?, password=? WHERE id=?'
      ).bind(name, email, plan, tokens, maxT, status, hash, id).run();
    } else {
      await env.DB.prepare(
        'UPDATE users SET name=?, email=?, plan=?, tokens=?, max_tokens=?, status=? WHERE id=?'
      ).bind(name, email, plan, tokens, maxT, status, id).run();
    }
    return json({ success: true });
  }

  // DELETE /api/admin/users/:id
  if (path.match(/^\/api\/admin\/users\/[\w-]+$/) && req.method === 'DELETE') {
    const id = path.split('/').pop();
    await env.DB.prepare('DELETE FROM users WHERE id = ?').bind(id).run();
    await env.DB.prepare('DELETE FROM usage WHERE user_id = ?').bind(id).run();
    return json({ success: true });
  }

  // GET /api/admin/stats
  if (path === '/api/admin/stats' && req.method === 'GET') {
    const users   = await env.DB.prepare('SELECT COUNT(*) as count FROM users').first();
    const reqs    = await env.DB.prepare('SELECT COUNT(*) as count, SUM(tokens_used) as tokens FROM usage').first();
    const today   = await env.DB.prepare("SELECT COUNT(*) as count FROM usage WHERE DATE(created_at)=DATE('now')").first();
    const plans   = await env.DB.prepare('SELECT plan, COUNT(*) as count FROM users GROUP BY plan').all();
    const daily   = await env.DB.prepare(`
      SELECT DATE(created_at) as date, COUNT(*) as requests, SUM(tokens_used) as tokens
      FROM usage WHERE created_at >= datetime('now','-14 days')
      GROUP BY DATE(created_at) ORDER BY date ASC
    `).all();
    return json({
      totalUsers: users?.count || 0,
      totalRequests: reqs?.count || 0,
      totalTokens: reqs?.tokens || 0,
      todayRequests: today?.count || 0,
      plans: plans.results,
      daily: daily.results,
    });
  }

  // GET/POST /api/admin/settings
  if (path === '/api/admin/settings') {
    if (req.method === 'GET') {
      const rows = await env.DB.prepare('SELECT key, value FROM settings').all();
      const s = {};
      for (const r of rows.results) s[r.key] = r.value;
      return json(s);
    }
    if (req.method === 'POST') {
      const data = await req.json();
      for (const [key, value] of Object.entries(data)) {
        await env.DB.prepare(
          "INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES (?, ?, datetime('now'))"
        ).bind(key, String(value)).run();
      }
      return json({ success: true });
    }
  }

  return err('Not found', 404);
}
