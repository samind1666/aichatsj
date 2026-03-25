// ═══════════════════════════════════════════════
// STATE
// ═══════════════════════════════════════════════
const S = {
  user: null,
  messages: [],
  streaming: false,
  model: 'openai/gpt-4o-mini',
  modelName: 'GPT-4o Mini',
  isPremium: false,
  balance: 4750000,
  maxTokens: 5000000,
  convId: null,
  history: [],
  lightMode: false,
};

const MODELS = {
  OpenAI: [
    {id:'openai/gpt-4o-mini', name:'GPT-4o Mini', premium:false},
    {id:'openai/gpt-4o', name:'GPT-4o', premium:true},
    {id:'openai/gpt-4.1', name:'GPT-4.1', premium:true},
    {id:'openai/o1-mini', name:'o1 Mini', premium:false},
  ],
  Claude: [
    {id:'anthropic/claude-3-haiku', name:'Claude 3 Haiku', premium:false},
    {id:'anthropic/claude-3.5-sonnet', name:'Claude 3.5 Sonnet', premium:true},
    {id:'anthropic/claude-opus-4', name:'Claude Opus 4', premium:true},
  ],
  Google: [
    {id:'google/gemini-flash-1.5', name:'Gemini Flash 1.5', premium:false},
    {id:'google/gemini-pro-1.5', name:'Gemini Pro 1.5', premium:true},
    {id:'google/gemini-2.5-pro', name:'Gemini 2.5 Pro', premium:true},
  ],
  DeepSeek: [
    {id:'deepseek/deepseek-chat', name:'DeepSeek V3', premium:false},
    {id:'deepseek/deepseek-r1', name:'DeepSeek R1', premium:true},
  ],
  Mistral: [
    {id:'mistralai/mistral-7b-instruct', name:'Mistral 7B', premium:false},
    {id:'mistralai/mistral-large', name:'Mistral Large', premium:true},
  ],
};

const DUMMY_USERS = [
  {name:'Rahul Sharma', email:'rahul@ex.com', plan:'pro', tokens:'16.2M', reqs:247, joined:'Jan 2025', status:'active'},
  {name:'Priya Singh', email:'priya@ex.com', plan:'basic', tokens:'3.8M', reqs:89, joined:'Feb 2025', status:'active'},
  {name:'Amit Kumar', email:'amit@ex.com', plan:'enterprise', tokens:'87M', reqs:1203, joined:'Nov 2024', status:'active'},
  {name:'Deepa Patel', email:'deepa@ex.com', plan:'basic', tokens:'1.2M', reqs:34, joined:'Mar 2025', status:'active'},
  {name:'Vikram Rao', email:'vikram@ex.com', plan:'pro', tokens:'11M', reqs:512, joined:'Dec 2024', status:'active'},
];

const DEMO_REPLIES = {
  'code': `Main tumhare liye Python code likh sakta hoon! Yahan ek simple example hai:\n\n\`\`\`python\ndef greet(name):\n    return f"Namaste, {name}!"\n\nprint(greet("Dost"))\n\`\`\`\n\nYeh function ek naam leta hai aur greeting return karta hai. Kya specific kuch chahiye?`,
  'email': `Bilkul! Yahan ek professional email template hai:\n\n**Subject:** Meeting Request — [Date]\n\nDear [Name],\n\nUmeed hai aap theek hain. Main [topic] ke baare mein baat karna chahta tha.\n\nKya aap [date] ko available hain?\n\nRegards,\n[Your Name]`,
  'ai': `**Artificial Intelligence (AI)** ek computer system hai jo insaan jaisi soch aur decisions le sakta hai.\n\n**Main types:**\n- Machine Learning — data se seekhna\n- Deep Learning — neural networks use karna\n- NLP — language samajhna\n\nAaj AI ka use har jagah ho raha hai — phones, hospitals, cars mein!`,
  'fact': `🌟 **Interesting fact:** \n\nOctopus ke 3 hearts hote hain! Do hearts blood ko gills mein pump karte hain, aur ek heart baaki body mein. Jab octopus swim karta hai toh ek heart temporarily band ho jaata hai — isliye wo swimming se thak jaate hain aur crawling prefer karte hain! 🐙`,
  default: `Bilkul samajh gaya! Main is question ka jawab de raha hoon...\n\n**Yeh ek demo response hai** — actual deployment mein yeh OpenRouter API ke through real AI model se aayega.\n\n**Cloudflare setup mein:**\n- Worker tumhara message lega\n- OpenRouter API call karega\n- Streaming response wapas bhejega\n- D1 mein token usage save karega\n\nKoi specific sawal? 😊`,
};

// ═══════════════════════════════════════════════
// AUTH
// ═══════════════════════════════════════════════
function oauthLogin(provider) {
  showApp({name: provider === 'google' ? 'Rahul Sharma' : 'rahul_dev', plan:'pro'});
}
function doLogin() {
  const email = document.getElementById('login-email').value || 'demo@example.com';
  showApp({name: email.split('@')[0], plan:'pro'});
}
function showApp(user) {
  S.user = user;
  document.getElementById('login-screen').style.display = 'none';
  document.getElementById('app').style.display = 'flex';
  const n = user.name.charAt(0).toUpperCase();
  document.getElementById('user-av').textContent = n;
  document.getElementById('sp-av').textContent = n;
  document.getElementById('user-name').textContent = user.name;
  document.getElementById('sp-name').textContent = user.name;
  document.getElementById('user-plan').textContent = user.plan.charAt(0).toUpperCase()+user.plan.slice(1)+' Plan';
  loadHistory();
  updateTokenUI();
  initCharts();
}
function doLogout() {
  document.getElementById('app').style.display = 'none';
  document.getElementById('login-screen').style.display = 'flex';
}

// ═══════════════════════════════════════════════
// CHAT
// ═══════════════════════════════════════════════
function newChat() {
  S.messages = [];
  S.convId = 'conv_'+Date.now();
  document.getElementById('messages').innerHTML = `
    <div class="welcome" id="welcome">
      <div class="welcome-icon">✦</div>
      <h2>Kya help chahiye aaj?</h2>
      <p>Multiple AI models available — ChatGPT, Claude, Gemini aur aur bhi</p>
      <div class="suggestions">
        <button class="suggestion" onclick="sendSuggestion(this)">💻 Code help karo</button>
        <button class="suggestion" onclick="sendSuggestion(this)">✉️ Email draft karo</button>
        <button class="suggestion" onclick="sendSuggestion(this)">🤖 AI explain karo</button>
        <button class="suggestion" onclick="sendSuggestion(this)">💡 Koi fun fact batao</button>
      </div>
    </div>`;
}

function sendSuggestion(btn) {
  const text = btn.textContent.replace(/^[^\s]+\s/,'').trim();
  document.getElementById('chat-input').value = text;
  sendMessage();
}

const input = document.getElementById('chat-input');
const sendBtn = document.getElementById('send-btn');

input.addEventListener('input', function() {
  sendBtn.disabled = !this.value.trim();
  this.style.height = 'auto';
  this.style.height = Math.min(this.scrollHeight, 160) + 'px';
});
input.addEventListener('keydown', function(e) {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    if (!sendBtn.disabled) sendMessage();
  }
});

function sendMessage() {
  const text = input.value.trim();
  if (!text || S.streaming) return;
  input.value = '';
  input.style.height = 'auto';
  sendBtn.disabled = true;

  const welcome = document.getElementById('welcome');
  if (welcome) welcome.style.display = 'none';

  S.messages.push({role:'user', content:text});
  appendMsg('user', text);

  S.streaming = true;
  sendBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="6" width="12" height="12" rx="1"/></svg>`;
  sendBtn.classList.add('stop');
  sendBtn.disabled = false;

  const aiWrap = appendMsg('assistant', null);
  simulateStream(aiWrap, text);
}

function appendMsg(role, content) {
  const msgs = document.getElementById('messages');
  let inner = msgs.querySelector('.msgs-inner');
  if (!inner) {
    inner = document.createElement('div');
    inner.className = 'msgs-inner';
    msgs.appendChild(inner);
  }
  const wrap = document.createElement('div');
  wrap.className = 'msg msg-'+role;
  const bubble = document.createElement('div');
  bubble.className = 'bubble';

  if (role === 'user') {
    bubble.textContent = content;
    wrap.appendChild(bubble);
  } else {
    if (content) {
      bubble.innerHTML = parseMarkdown(content);
    } else {
      bubble.innerHTML = '<div class="thinking"><span></span><span></span><span></span></div>';
    }
    const actions = document.createElement('div');
    actions.className = 'msg-actions';
    actions.innerHTML = `
      <button class="action-btn" title="Copy" onclick="copyMsg(this)"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg></button>
      <button class="action-btn" title="Like" onclick="this.classList.toggle('active')"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3H14z"/><path d="M7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3"/></svg></button>
      <button class="action-btn" title="Dislike" onclick="this.classList.toggle('active')"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10 15v4a3 3 0 0 0 3 3l4-9V2H5.72a2 2 0 0 0-2 1.7l-1.38 9a2 2 0 0 0 2 2.3H10z"/><path d="M17 2h2.67A2.31 2.31 0 0 1 22 4v7a2.31 2.31 0 0 1-2.33 2H17"/></svg></button>`;
    wrap.appendChild(bubble);
    wrap.appendChild(actions);
  }
  inner.appendChild(wrap);
  msgs.scrollTop = msgs.scrollHeight;
  return wrap;
}

function simulateStream(wrap, userText) {
  const lower = userText.toLowerCase();
  let reply = DEMO_REPLIES.default;
  if (lower.includes('code') || lower.includes('python') || lower.includes('js')) reply = DEMO_REPLIES.code;
  else if (lower.includes('email')) reply = DEMO_REPLIES.email;
  else if (lower.includes('ai') || lower.includes('machine')) reply = DEMO_REPLIES.ai;
  else if (lower.includes('fact')) reply = DEMO_REPLIES.fact;

  const bubble = wrap.querySelector('.bubble');
  bubble.innerHTML = '';
  const span = document.createElement('span');
  const cursor = document.createElement('span');
  cursor.className = 'cursor';
  bubble.appendChild(span);
  bubble.appendChild(cursor);

  let i = 0, accum = '';
  const words = reply.split(/(\s+)/);

  function tick() {
    if (!S.streaming) return;
    const chunk = words.slice(i, i+3).join('');
    accum += chunk;
    i += 3;
    span.innerHTML = parseMarkdown(accum);
    bubble.appendChild(cursor);
    document.getElementById('messages').scrollTop = 9999;

    if (i < words.length) {
      setTimeout(tick, 25);
    } else {
      cursor.remove();
      S.streaming = false;
      sendBtn.innerHTML = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>`;
      sendBtn.classList.remove('stop');
      sendBtn.disabled = true;
      S.messages.push({role:'assistant', content:reply});
      S.balance -= Math.floor(Math.random()*2000 + 500);
      updateTokenUI();
      saveToHistory(userText.slice(0,40));
    }
  }
  setTimeout(tick, 300);
}

function copyMsg(btn) {
  const bubble = btn.closest('.msg').querySelector('.bubble');
  navigator.clipboard?.writeText(bubble.innerText).then(() => {
    btn.innerHTML = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>';
    setTimeout(() => { btn.innerHTML = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>'; }, 1500);
  });
}

// ═══════════════════════════════════════════════
// HISTORY
// ═══════════════════════════════════════════════
function saveToHistory(title) {
  S.history.unshift({id: S.convId || 'c'+Date.now(), title, time: Date.now()});
  renderHistory();
}

function loadHistory() {
  S.history = [
    {id:'h1', title:'Python script help karo', time:Date.now()-86400000},
    {id:'h2', title:'Email draft karo', time:Date.now()-172800000},
    {id:'h3', title:'Explain machine learning', time:Date.now()-259200000},
  ];
  renderHistory();
}

function renderHistory() {
  const el = document.getElementById('sb-history');
  if (!el) return;
  el.innerHTML = S.history.slice(0,20).map(h => `
    <div class="hist-item ${h.id === S.convId ? 'active' : ''}" onclick="loadConv('${h.id}')">
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
      ${h.title}
    </div>`).join('');
}

function loadConv(id) {
  S.convId = id;
  renderHistory();
  newChat();
}

// ═══════════════════════════════════════════════
// TOKEN UI
// ═══════════════════════════════════════════════
function fmt(n) {
  n = parseInt(n)||0;
  if(n>=1000000) return (n/1000000).toFixed(1)+'M';
  if(n>=1000) return (n/1000).toFixed(1)+'K';
  return n.toLocaleString();
}
function updateTokenUI() {
  const used = S.maxTokens - S.balance;
  const pct = Math.min(100, Math.round(used/S.maxTokens*100));
  const color = pct>=90 ? '#ef4444' : pct>=70 ? '#f59e0b' : '#ff7c5c';
  const fill = document.getElementById('sb-fill');
  if(fill){ fill.style.width=pct+'%'; fill.style.background=color; }
  const elPct = document.getElementById('sb-pct'); if(elPct) elPct.textContent=pct+'%';
  const elUsed = document.getElementById('sb-used'); if(elUsed) elUsed.textContent=fmt(used)+' used';
  const elLeft = document.getElementById('sb-left'); if(elLeft) elLeft.textContent=fmt(S.balance)+' left';
  const elBal = document.getElementById('hdr-balance'); if(elBal) elBal.textContent=fmt(S.balance)+' tokens';
}

// ═══════════════════════════════════════════════
// MODEL SHEET
// ═══════════════════════════════════════════════
function openModelSheet() {
  document.getElementById('model-sheet').classList.add('open');
  renderModelSheet('');
  document.getElementById('sheet-search').focus();
}
function closeModelSheet() {
  document.getElementById('model-sheet').classList.remove('open');
}
function renderModelSheet(query) {
  const list = document.getElementById('sheet-list');
  let html = '';
  for(const [prov, models] of Object.entries(MODELS)) {
    const filtered = models.filter(m => !query || m.name.toLowerCase().includes(query.toLowerCase()) || prov.toLowerCase().includes(query.toLowerCase()));
    if(!filtered.length) continue;
    html += `<div class="provider-group"><div class="provider-label">${prov}</div>`;
    filtered.forEach(m => {
      html += `<div class="model-item ${m.id===S.model?'selected':''}" onclick="selectModel('${m.id}','${m.name}',${m.premium})">
        <span class="model-dot-sm" style="background:${m.premium?'#ff7c5c':'#22c55e'}"></span>
        <span class="model-name">${m.name}</span>
        ${m.premium ? '<span class="model-badge">4x</span>' : ''}
      </div>`;
    });
    html += '</div>';
  }
  list.innerHTML = html;
}
function filterModels(q) { renderModelSheet(q); }
function selectModel(id, name, premium) {
  S.model = id; S.modelName = name; S.isPremium = premium;
  document.getElementById('model-label').textContent = name;
  document.getElementById('input-model-name').textContent = name;
  document.getElementById('sp-current-model').textContent = name;
  const cls = premium ? 'premium' : 'free';
  document.getElementById('model-dot').className = 'model-dot '+cls;
  document.getElementById('input-dot').className = 'model-dot '+cls;
  closeModelSheet();
}

// ═══════════════════════════════════════════════
// SETTINGS
// ═══════════════════════════════════════════════
let settingsChartsInit = false;
function openSettings() {
  document.getElementById('settings').classList.add('open');
  if(!settingsChartsInit){ initSettingsCharts(); settingsChartsInit=true; }
}
function closeSettings() { document.getElementById('settings').classList.remove('open'); }
document.getElementById('settings').addEventListener('click', function(e) {
  if(e.target === this) closeSettings();
});
function switchPane(btn, pane) {
  document.querySelectorAll('.sp-tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.sp-pane').forEach(p => p.classList.remove('active'));
  btn.classList.add('active');
  document.getElementById('pane-'+pane).classList.add('active');
}
function saveProfile() {
  const n = document.getElementById('sp-display-name').value;
  document.getElementById('user-name').textContent = n;
  document.getElementById('sp-name').textContent = n;
  document.getElementById('user-av').textContent = n.charAt(0).toUpperCase();
  document.getElementById('sp-av').textContent = n.charAt(0).toUpperCase();
  alert('Profile saved!');
}

// ═══════════════════════════════════════════════
// ADMIN
// ═══════════════════════════════════════════════
let adminChartsInit = false;
function openAdmin() {
  document.getElementById('admin').classList.add('open');
  renderUsersTable();
  if(!adminChartsInit){ initAdminChart(); adminChartsInit=true; }
}
function closeAdmin() { document.getElementById('admin').classList.remove('open'); }
function switchAdminPane(el, pane) {
  document.querySelectorAll('.admin-nav-item').forEach(n => n.classList.remove('active'));
  document.querySelectorAll('.admin-pane').forEach(p => p.classList.remove('active'));
  el.classList.add('active');
  document.getElementById('apane-'+pane).classList.add('active');
  const titles = {dashboard:'Overview', users:'Users', asettings:'Settings'};
  document.getElementById('admin-title').textContent = titles[pane]||pane;
}
function renderUsersTable() {
  const tbody = document.getElementById('users-tbody');
  tbody.innerHTML = DUMMY_USERS.map(u => `<tr>
    <td><div style="font-weight:600">${u.name}</div><div style="font-size:11px;color:var(--text2)">${u.email}</div></td>
    <td><span class="user-tag tag-${u.plan}">${u.plan}</span></td>
    <td style="font-family:var(--mono);font-size:12px">${u.tokens}</td>
    <td>${u.reqs}</td>
    <td style="color:var(--text2);font-size:12px">${u.joined}</td>
    <td><span class="user-tag tag-active">${u.status}</span></td>
  </tr>`).join('');
}

// ═══════════════════════════════════════════════
// CHARTS
// ═══════════════════════════════════════════════
const chartDefaults = () => ({
  plugins: { legend: { display: false }, tooltip: { enabled: false } },
  scales: { x: { display: false }, y: { display: false } },
  animation: false,
  responsive: true,
  maintainAspectRatio: false,
});

function initCharts() {
  setTimeout(() => {
    new Chart(document.getElementById('req-chart'), {
      type:'line', data:{ labels:['M','T','W','T','F','S','S'],
        datasets:[{data:[45,62,38,71,55,89,47], borderColor:'#ff7c5c', backgroundColor:'rgba(255,124,92,.1)', tension:.4, fill:true, pointRadius:0, borderWidth:1.5}]},
      options: chartDefaults()
    });
    new Chart(document.getElementById('tok-chart'), {
      type:'bar', data:{ labels:['M','T','W','T','F','S','S'],
        datasets:[{data:[280,410,190,560,340,780,240], backgroundColor:'rgba(124,92,255,.5)', borderRadius:3}]},
      options: chartDefaults()
    });
  }, 100);
}
function initSettingsCharts() {
  const labels = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
  new Chart(document.getElementById('usage-chart'), {
    type:'bar',
    data:{ labels, datasets:[{data:[42000,67000,38000,95000,71000,128000,53000], backgroundColor:'rgba(255,124,92,.6)', borderRadius:4, borderSkipped:false}]},
    options:{...chartDefaults(), plugins:{legend:{display:false}}, scales:{
      x:{display:true,ticks:{color:'#555',font:{size:10}}},
      y:{display:true,ticks:{color:'#555',font:{size:10},callback:v=>fmt(v)}},
    }}
  });
  new Chart(document.getElementById('model-chart'), {
    type:'doughnut',
    data:{
      labels:['GPT-4o Mini','Claude Haiku','Gemini Flash','DeepSeek V3'],
      datasets:[{data:[45,28,18,9], backgroundColor:['#ff7c5c','#7c5cff','#22c55e','#f59e0b'], borderWidth:0, hoverOffset:4}]
    },
    options:{plugins:{legend:{display:true,position:'right',labels:{color:'#888',font:{size:11},boxWidth:10}}},animation:false,responsive:true,maintainAspectRatio:false}
  });
}
function initAdminChart() {
  const days = [];
  for(let i=13;i>=0;i--) {
    const d = new Date(); d.setDate(d.getDate()-i);
    days.push(d.toLocaleDateString('en',{day:'numeric',month:'short'}));
  }
  new Chart(document.getElementById('admin-chart'), {
    type:'line',
    data:{labels:days, datasets:[
      {label:'Requests',data:[2100,2400,1900,2800,3200,2700,3800,3100,4200,3700,4800,4100,5200,4700],
        borderColor:'#7c5cff',backgroundColor:'rgba(124,92,255,.08)',tension:.4,fill:true,pointRadius:0,borderWidth:2},
    ]},
    options:{plugins:{legend:{display:false}},scales:{
      x:{display:true,ticks:{color:'#555',font:{size:10}}},
      y:{display:true,ticks:{color:'#555',font:{size:10}}},
    },animation:false,responsive:true,maintainAspectRatio:false}
  });
}

// ═══════════════════════════════════════════════
// MISC UI
// ═══════════════════════════════════════════════
function toggleSidebar() {
  document.getElementById('sidebar').classList.toggle('collapsed');
}
function toggleTheme() {
  S.lightMode = !S.lightMode;
  document.getElementById('app').classList.toggle('light', S.lightMode);
  document.getElementById('theme-btn').textContent = S.lightMode ? '☀️' : '🌙';
}

// ═══════════════════════════════════════════════
// MARKDOWN PARSER
// ═══════════════════════════════════════════════
function parseMarkdown(text) {
  if(!text) return '';
  const blocks = [];
  text = text.replace(/```(\w*)?\n?([\s\S]*?)```/g, (_,lang,code) => {
    const i = blocks.length;
    blocks.push('<pre><code>'+code.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')+'</code></pre>');
    return '\x00BLK'+i+'\x00';
  });
  text = text.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  text = text.replace(/`([^`\n]+)`/g,'<code>$1</code>');
  text = text.replace(/\*\*\*([^*\n]+)\*\*\*/g,'<strong><em>$1</em></strong>');
  text = text.replace(/\*\*([^*\n]+)\*\*/g,'<strong>$1</strong>');
  text = text.replace(/\*([^*\n]+)\*/g,'<em>$1</em>');
  const lines = text.split('\n'), out = [];
  let inUl=false, inOl=false;
  for(const raw of lines) {
    const line = raw.trim();
    if(/^### /.test(line)){ out.push('<h3>'+line.slice(4)+'</h3>'); continue; }
    if(/^## /.test(line)){ out.push('<h2>'+line.slice(3)+'</h2>'); continue; }
    if(/^# /.test(line)){ out.push('<h1>'+line.slice(2)+'</h1>'); continue; }
    const ulM = line.match(/^[-*] (.+)/);
    const olM = line.match(/^\d+[.)]\s(.+)/);
    if(ulM){ if(!inUl){out.push('<ul>');inUl=true;} out.push('<li>'+ulM[1]+'</li>'); }
    else if(olM){ if(!inOl){out.push('<ol>');inOl=true;} out.push('<li>'+olM[1]+'</li>'); }
    else{
      if(inUl){out.push('</ul>');inUl=false;}
      if(inOl){out.push('</ol>');inOl=false;}
      if(line===''){out.push('<br>');}
      else if(/^\x00BLK/.test(line)){out.push(line);}
      else{out.push('<p>'+raw+'</p>');}
    }
  }
  if(inUl)out.push('</ul>'); if(inOl)out.push('</ol>');
  let r = out.join('');
  r = r.replace(/\x00BLK(\d+)\x00/g,(_,i)=>blocks[+i]);
  return r;
}