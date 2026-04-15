export async function GET(
  request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || new URL(request.url).origin;

  // Self-contained widget JS — vanilla JS, no dependencies
  const js = `
(function() {
  if (window.__staipler_widget) return;
  window.__staipler_widget = true;

  var TOKEN = ${JSON.stringify(token)};
  var BASE = ${JSON.stringify(baseUrl)};
  var config = { displayName: 'AI Assistant', accentColor: '#7c3aed', welcomeMessage: 'Hi! How can I help you today?' };
  var messages = [];
  var isOpen = false;
  var isStreaming = false;

  // Fetch config
  fetch(BASE + '/api/widget/config?token=' + TOKEN)
    .then(function(r) { return r.json(); })
    .then(function(c) { config = Object.assign(config, c); updateUI(); })
    .catch(function() { /* Widget config fetch failed — uses defaults */ });

  // Create container
  var container = document.createElement('div');
  container.id = 'staipler-widget';
  document.body.appendChild(container);

  // Styles
  var style = document.createElement('style');
  style.textContent = \`
    #staipler-widget { position: fixed; bottom: 20px; right: 20px; z-index: 999999; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; }
    #staipler-widget * { box-sizing: border-box; margin: 0; padding: 0; }
    .stw-bubble { width: 56px; height: 56px; border-radius: 28px; cursor: pointer; display: flex; align-items: center; justify-content: center; box-shadow: 0 4px 24px rgba(0,0,0,0.3); transition: transform 0.2s, box-shadow 0.2s; }
    .stw-bubble:hover { transform: scale(1.08); box-shadow: 0 6px 32px rgba(0,0,0,0.4); }
    .stw-bubble svg { width: 24px; height: 24px; fill: #fff; }
    .stw-panel { display: none; width: 380px; height: 520px; border-radius: 16px; overflow: hidden; box-shadow: 0 8px 40px rgba(0,0,0,0.4); flex-direction: column; background: #0a0a14; border: 1px solid rgba(255,255,255,0.06); }
    .stw-panel.open { display: flex; }
    .stw-header { padding: 14px 16px; display: flex; align-items: center; gap: 10px; border-bottom: 1px solid rgba(255,255,255,0.06); }
    .stw-header-dot { width: 8px; height: 8px; border-radius: 50%; }
    .stw-header-name { font-size: 14px; font-weight: 600; color: #e2e8f0; flex: 1; }
    .stw-close { background: none; border: none; color: #64748b; cursor: pointer; padding: 4px; font-size: 18px; line-height: 1; }
    .stw-close:hover { color: #94a3b8; }
    .stw-messages { flex: 1; overflow-y: auto; padding: 16px; display: flex; flex-direction: column; gap: 10px; }
    .stw-msg { max-width: 85%; padding: 10px 14px; border-radius: 12px; font-size: 13px; line-height: 1.5; word-wrap: break-word; white-space: pre-wrap; }
    .stw-msg.user { align-self: flex-end; background: rgba(124,58,237,0.2); color: #e2e8f0; }
    .stw-msg.assistant { align-self: flex-start; background: rgba(255,255,255,0.03); color: #cbd5e1; border: 1px solid rgba(255,255,255,0.04); }
    .stw-welcome { text-align: center; padding: 40px 20px; color: #64748b; font-size: 13px; }
    .stw-input-area { padding: 12px; border-top: 1px solid rgba(255,255,255,0.06); display: flex; gap: 8px; }
    .stw-input { flex: 1; padding: 10px 14px; border-radius: 10px; background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1); color: #e2e8f0; font-size: 13px; outline: none; resize: none; font-family: inherit; }
    .stw-input:focus { border-color: rgba(124,58,237,0.5); }
    .stw-input::placeholder { color: #475569; }
    .stw-send { padding: 10px 16px; border-radius: 10px; border: none; font-size: 13px; font-weight: 500; color: #fff; cursor: pointer; transition: opacity 0.2s; }
    .stw-send:hover { opacity: 0.9; }
    .stw-send:disabled { opacity: 0.4; cursor: not-allowed; }
    .stw-powered { text-align: center; padding: 6px; font-size: 10px; color: #334155; }
    .stw-powered a { color: #475569; text-decoration: none; }
    .stw-powered a:hover { color: #64748b; }
  \`;
  document.head.appendChild(style);

  function render() {
    container.innerHTML = \`
      <div class="stw-panel \${isOpen ? 'open' : ''}">
        <div class="stw-header">
          <div class="stw-header-dot" style="background:\${config.accentColor}"></div>
          <div class="stw-header-name">\${esc(config.displayName)}</div>
          <button class="stw-close" onclick="window.__staipler_toggle()">&times;</button>
        </div>
        <div class="stw-messages" id="stw-msgs">
          \${messages.length === 0 ? '<div class="stw-welcome">' + esc(config.welcomeMessage) + '</div>' : ''}
          \${messages.map(function(m) { return '<div class="stw-msg ' + m.role + '">' + esc(m.content) + '</div>'; }).join('')}
        </div>
        <div class="stw-input-area">
          <textarea class="stw-input" id="stw-input" rows="1" placeholder="Type a message..." \${isStreaming ? 'disabled' : ''}></textarea>
          <button class="stw-send" id="stw-send" style="background:\${config.accentColor}" \${isStreaming || !messages ? '' : ''}>\${isStreaming ? '...' : 'Send'}</button>
        </div>
        <div class="stw-powered">Powered by <a href="https://staipler.com" target="_blank">stAIpler</a></div>
      </div>
      <div class="stw-bubble" style="background:\${config.accentColor}" onclick="window.__staipler_toggle()">
        \${isOpen ?
          '<svg viewBox="0 0 24 24"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>' :
          '<svg viewBox="0 0 24 24"><path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 14H6l-2 2V4h16v12z"/></svg>'
        }
      </div>
    \`;

    // Scroll to bottom
    var msgsEl = document.getElementById('stw-msgs');
    if (msgsEl) msgsEl.scrollTop = msgsEl.scrollHeight;

    // Attach input handlers
    var inputEl = document.getElementById('stw-input');
    var sendEl = document.getElementById('stw-send');
    if (inputEl) {
      inputEl.addEventListener('keydown', function(e) {
        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
      });
    }
    if (sendEl) {
      sendEl.addEventListener('click', sendMessage);
    }
  }

  function esc(s) {
    var d = document.createElement('div');
    d.textContent = s || '';
    return d.innerHTML;
  }

  function updateUI() { render(); }

  window.__staipler_toggle = function() {
    isOpen = !isOpen;
    render();
    if (isOpen) {
      var inputEl = document.getElementById('stw-input');
      if (inputEl) setTimeout(function() { inputEl.focus(); }, 100);
    }
  };

  function sendMessage() {
    var inputEl = document.getElementById('stw-input');
    if (!inputEl || isStreaming) return;
    var text = inputEl.value.trim();
    if (!text) return;

    messages.push({ role: 'user', content: text });
    isStreaming = true;
    render();

    fetch(BASE + '/api/widget/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: TOKEN, messages: messages }),
    }).then(function(res) {
      if (!res.ok) throw new Error('Chat failed');
      var reader = res.body.getReader();
      var decoder = new TextDecoder();
      var assistantText = '';
      messages.push({ role: 'assistant', content: '' });

      function read() {
        reader.read().then(function(result) {
          if (result.done) {
            isStreaming = false;
            render();
            return;
          }
          var chunk = decoder.decode(result.value);
          var lines = chunk.split('\\n');
          for (var i = 0; i < lines.length; i++) {
            if (!lines[i].startsWith('data: ')) continue;
            var data = lines[i].slice(6);
            if (data === '[DONE]') continue;
            try {
              var parsed = JSON.parse(data);
              if (parsed.text) {
                assistantText += parsed.text;
                messages[messages.length - 1].content = assistantText;
                render();
              }
            } catch(e) { /* Partial SSE chunk during streaming */ }
          }
          read();
        });
      }
      read();
    }).catch(function(err) {
      messages.push({ role: 'assistant', content: 'Sorry, something went wrong. Please try again.' });
      isStreaming = false;
      render();
    });
  }

  render();
})();
`;

  return new Response(js, {
    headers: {
      'Content-Type': 'application/javascript',
      'Cache-Control': 'public, max-age=3600',
      'Access-Control-Allow-Origin': '*',
    },
  });
}
