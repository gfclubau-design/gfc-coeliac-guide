/* ---------- community chat (Gate C) ---------- */
var CHAT_API = '/api';
var CHAT_BOARDS = [
  { id: 'seq',        label: 'Coeliacs SEQ' },
  { id: 'north-qld',  label: 'North QLD' },
  { id: 'out-west',   label: 'Out West' },
  { id: 'melbourne',  label: 'Melbourne' },
  { id: 'sydney',     label: 'Sydney' }
];
var chatMe = null;           // {name, is_club}
var chatBoard = load('gfapp_board', 'seq') || 'seq';
if (!CHAT_BOARDS.some(function(b){ return b.id === chatBoard; })) chatBoard = 'seq';
var chatAuthMode = 'login';

function chatLabel(id){ var b = CHAT_BOARDS.filter(function(x){ return x.id === id; })[0]; return b ? b.label : id; }

function refreshMe(cb){
  fetch(CHAT_API + '/me', { credentials: 'include' }).then(function(r){ return r.json(); }).then(function(d){
    chatMe = d && d.ok ? d : null;
    if (cb) cb();
  }).catch(function(){ chatMe = null; if (cb) cb(); });
}

function chatPaint(){
  var auth = $('chatAuth'), comp = $('chatComposer');
  if (chatMe) {
    $('chatWhoTitle').textContent = 'Hey ' + chatMe.name + (chatMe.is_club ? ' \u{1F3AB}' : '');
    $('chatWhoSub').textContent = 'Posting in ' + chatLabel(chatBoard);
    auth.style.display = 'none';
    comp.style.display = 'block';
  } else {
    $('chatWhoTitle').textContent = 'Say g\u2019day';
    $('chatWhoSub').textContent = 'Log in or make a quick account to post';
    auth.style.display = 'block';
    comp.style.display = 'none';
  }
  $('chatBoardTitle').textContent = chatLabel(chatBoard);
  var html = '';
  CHAT_BOARDS.forEach(function(b){
    html += '<button data-b="' + b.id + '"' + (b.id === chatBoard ? ' class="on"' : '') + '>' + esc(b.label) + '</button>';
  });
  $('boardTabs').innerHTML = html;
  $('boardTabs').querySelectorAll('button').forEach(function(btn){
    btn.addEventListener('click', function(){
      chatBoard = btn.getAttribute('data-b'); save('gfapp_board', chatBoard);
      loadPosts();
    });
  });
  if (chatMe) $('authGo').textContent = 'Log out';
  else chatAuthPaint();
}

function chatAuthPaint(){
  $('authName').style.display = chatAuthMode === 'signup' ? 'block' : 'none';
  $('authTabLogin').className = 'authtab' + (chatAuthMode === 'login' ? ' on' : '');
  $('authTabSignup').className = 'authtab' + (chatAuthMode === 'signup' ? ' on' : '');
  $('authGo').textContent = chatAuthMode === 'login' ? 'Log in' : 'Create my account';
}

function timeAgo(iso){
  var d = new Date(iso + (iso.indexOf('Z') === -1 && iso.length === 19 ? 'Z' : ''));
  var s = Math.floor((Date.now() - d.getTime()) / 1000);
  if (isNaN(s)) return '';
  if (s < 60) return 'just now';
  if (s < 3600) return Math.floor(s/60) + 'm ago';
  if (s < 86400) return Math.floor(s/3600) + 'h ago';
  if (s < 172800) return 'yesterday';
  return Math.floor(s/86400) + 'd ago';
}

function avatarHtml(name, club){
  return '<div class="pavatar">' + esc((name || '?').trim().charAt(0).toUpperCase()) + '</div>' +
    '<div><span class="pname">' + esc(name) + '</span>' + (club ? ' <span class="pclub">CLUB</span>' : '') +
    '</div>';
}

function postHtml(p){
  return '<div class="postcard" data-id="' + p.id + '">' +
    '<div class="phead">' + avatarHtml(p.name, p.is_club) + '<span class="pwhen">' + timeAgo(p.created_at) + '</span></div>' +
    '<div class="ptext">' + esc(p.text) + '</div>' +
    '<div class="pfoot">' +
      '<button data-act="replies">' + p.replies + ' reply' + (p.replies === 1 ? '' : 's') + '</button>' +
      '<button data-act="report">Report</button>' +
    '</div>' +
    '<div class="replieslot" style="display:none"></div>' +
  '</div>';
}

function loadPosts(){
  chatPaint();
  fetch(CHAT_API + '/posts?board=' + chatBoard, { credentials: 'include' })
    .then(function(r){ return r.json(); })
    .then(function(d){
      if (!d.ok) { $('postList').innerHTML = '<div class="empty">' + esc(d.error || 'Could not load') + '</div>'; return; }
      if (!d.posts.length) {
        $('postList').innerHTML = '<div class="empty">No posts yet in ' + esc(chatLabel(chatBoard)) +
          '.<br>Be the first to say g\u2019day \u{1F44B}</div>';
        return;
      }
      $('postList').innerHTML = d.posts.map(postHtml).join('');
      $('postList').querySelectorAll('.postcard').forEach(function(card){
        var id = +card.getAttribute('data-id');
        card.querySelector('[data-act="replies"]').addEventListener('click', function(){ toggleReplies(card, id); });
        card.querySelector('[data-act="report"]').addEventListener('click', function(){ report('post', id); });
      });
    })
    .catch(function(){ $('postList').innerHTML = '<div class="empty">Could not load - check your connection.</div>'; });
}

function toggleReplies(card, id){
  var slot = card.querySelector('.replieslot');
  if (slot.style.display === 'block') { slot.style.display = 'none'; return; }
  slot.style.display = 'block';
  slot.innerHTML = '<div class="empty" style="padding:10px">Loading...</div>';
  fetch(CHAT_API + '/posts/' + id, { credentials: 'include' }).then(function(r){ return r.json(); }).then(function(d){
    if (!d.ok) { slot.innerHTML = '<div class="empty" style="padding:10px">' + esc(d.error) + '</div>'; return; }
    var html = d.replies.map(function(r){
      return '<div class="reply">' + avatarHtml(r.name, r.is_club) +
        '<div style="flex:1"><div class="ptext">' + esc(r.text) + '</div>' +
        '<div style="display:flex;gap:12px;margin-top:2px"><span class="pwhen">' + timeAgo(r.created_at) + '</span>' +
        '<button data-rid="' + r.id + '" style="background:none;border:none;color:var(--muted);font-size:11px;cursor:pointer;font-family:inherit">Report</button></div></div></div>';
    }).join('');
    html += chatMe
      ? '<div class="replybox"><input maxlength="1000" placeholder="Write a reply..."><button class="btn gold">Reply</button></div>'
      : '<div class="empty" style="padding:6px">Log in to reply</div>';
    slot.innerHTML = html || '<div class="empty" style="padding:10px">No replies yet</div>';
    var input = slot.querySelector('input');
    var btn = slot.querySelector('.replybox .btn');
    slot.querySelectorAll('[data-rid]').forEach(function(rb){
      rb.addEventListener('click', function(){ report('reply', rb.getAttribute('data-rid')); });
    });
    if (btn) btn.addEventListener('click', function(){ sendReply(id, input.value, card); });
    if (input) input.addEventListener('keydown', function(e){ if (e.key === 'Enter') sendReply(id, input.value, card); });
  }).catch(function(){ slot.innerHTML = '<div class="empty" style="padding:10px">Could not load replies.</div>'; });
}

function flashMsg(el, msg, ok){
  el.textContent = msg || '';
  el.className = 'authmsg' + (ok ? ' ok' : '');
  if (msg) setTimeout(function(){ if (el.textContent === msg) { el.textContent = ''; el.className = 'authmsg'; } }, 4000);
}

function sendReply(id, text, card){
  text = (text || '').trim();
  if (!text) return;
  var btn = card.querySelector('.replybox .btn');
  btn.disabled = true;
  fetch(CHAT_API + '/posts/' + id + '/replies', { method: 'POST', credentials: 'include',
    headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: text }) })
    .then(function(r){ return r.json(); })
    .then(function(d){
      btn.disabled = false;
      if (!d.ok) { flashMsg($('postMsg'), d.error); return; }
      toggleReplies(card, id); /* reload the thread */
    }).catch(function(){ btn.disabled = false; flashMsg($('postMsg'), 'Could not reply - try again.'); });
}

function report(kind, id){
  fetch(CHAT_API + '/reports', { method: 'POST', credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ kind: kind, id: id }) })
    .then(function(r){ return r.json(); })
    .then(function(d){ flashMsg($('postMsg'), d.ok ? '\u{1F6DC} Reported - the club will take a look' : (d.error || 'Could not report'), d.ok); });
}

/* auth form */
$('authTabLogin').addEventListener('click', function(){ chatAuthMode = 'login'; chatAuthPaint(); });
$('authTabSignup').addEventListener('click', function(){ chatAuthMode = 'signup'; chatAuthPaint(); });
$('authGo').addEventListener('click', function(){
  var btn = $('authGo');
  if (chatMe) { /* log out */
    fetch(CHAT_API + '/logout', { method: 'POST', credentials: 'include' }).then(function(){
      chatMe = null; chatAuthMode = 'login'; chatPaint(); loadPosts();
    });
    return;
  }
  var body = { email: $('authEmail').value, password: $('authPass').value };
  if (chatAuthMode === 'signup') body.name = $('authName').value;
  btn.disabled = true;
  fetch(CHAT_API + (chatAuthMode === 'signup' ? '/signup' : '/login'), { method: 'POST',
    credentials: 'include', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body) })
    .then(function(r){ return r.json().then(function(d){ return { status: r.status, d: d }; }); })
    .then(function(res){
      btn.disabled = false;
      if (!res.d.ok) { flashMsg($('authMsg'), res.d.error || 'Could not log in.'); return; }
      chatMe = { name: res.d.name, is_club: res.d.is_club };
      $('authEmail').value = ''; $('authPass').value = ''; $('authName').value = '';
      flashMsg($('authMsg'), 'Welcome to the tribe!', true);
      chatPaint(); loadPosts();
    })
    .catch(function(){ btn.disabled = false; flashMsg($('authMsg'), 'Could not connect - try again.'); });
});

/* posting */
$('postBtn').addEventListener('click', function(){
  var text = $('postText').value.trim();
  if (!text) return;
  var btn = $('postBtn');
  btn.disabled = true;
  fetch(CHAT_API + '/posts', { method: 'POST', credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ board: chatBoard, text: text }) })
    .then(function(r){ return r.json(); })
    .then(function(d){
      btn.disabled = false;
      if (!d.ok) { flashMsg($('postMsg'), d.error); return; }
      $('postText').value = '';
      flashMsg($('postMsg'), '\u2705 Posted! Thanks - that helps the whole tribe.', true);
      loadPosts();
    })
    .catch(function(){ btn.disabled = false; flashMsg($('postMsg'), 'Could not post - try again.'); });
});

/* open chat tab -> load; wrap the existing showTab */
var _origShowTab = showTab;
showTab = function(id){
  _origShowTab(id);
  if (id === 'page-chat') refreshMe(function(){ loadPosts(); });
};
refreshMe(function(){});