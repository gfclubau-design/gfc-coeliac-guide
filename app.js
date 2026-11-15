/* GFC Coeliac Guide - staging demo. All data local; reviews/saves in localStorage only. */
'use strict';

var SAFETY_LINE = 'Always confirm with staff - menus and practices change.';
var FORM_URL = 'https://forms.gle/b7gmN3HLygfZ3maq5';

/* tier codes in venues.js: 0=has GF options, 1=accredited, 2=100% GF, 3=GF donuts only */
var TIERS = {
  0: { cls:'has',   label:'HAS GF OPTIONS',              sub:'community added - not yet verified by reviews', color:'#4A7FB5', pin:'#4A7FB5' },
  1: { cls:'acc',   label:'COELIAC AUSTRALIA ACCREDITED',sub:'Accredited by Coeliac Australia',               color:'#7FB3D9', pin:'#8EC6E8' },
  2: { cls:'full',  label:'100% GLUTEN FREE',            sub:'Everything made gluten free',                   color:'#C88A1E', pin:'#E8A33D' },
  3: { cls:'donut', label:'GF DONUTS ONLY',              sub:'GF donuts / dedicated treats only',             color:'#8A8378', pin:'#A89F92' }
};
var STATE_NAMES = { QLD:'QLD', NSW:'NSW', VIC:'VIC', WA:'WA', SA:'SA', ACT:'ACT', TAS:'TAS', NT:'NT', NZ:'NZ' };
var FEATURED = [58, 367, 1102]; /* Eat Street Northshore, NAÏM, Gluten Free 4 U Toowoomba */
var LS_REV = 'gfc_reviews_v1', LS_SAVED = 'gfc_saved_v1', LS_EMAIL = 'gfc_scan_email_v1';

/* ---------- data prep (lowercase search strings precomputed once) ---------- */
var N = VENUES.length, SEARCH = new Array(N), STATES = {};
for (var i = 0; i < N; i++) {
  var v = VENUES[i];
  SEARCH[i] = (v[0] + ' ' + v[4]).toLowerCase();
  STATES[v[1]] = true;
}
function fmt(n){ return n.toLocaleString('en-AU'); }
document.getElementById('statcount').textContent = fmt(N) + ' venues';

/* ---------- helpers ---------- */
function $(id){ return document.getElementById(id); }
function esc(s){ return String(s).replace(/[&<>"']/g, function(c){ return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]; }); }
function store(key, val){ try { localStorage.setItem(key, JSON.stringify(val)); } catch(e){} }
function load(key, dflt){ try { var v = localStorage.getItem(key); return v ? JSON.parse(v) : dflt; } catch(e){ return dflt; } }
function getReviews(){ return load(LS_REV, {}); }
function getSaved(){ return load(LS_SAVED, []); }

function haversine(lat1, lng1, lat2, lng2){
  var R = 6371, dLat = (lat2-lat1)*Math.PI/180, dLng = (lng2-lng1)*Math.PI/180;
  var a = Math.sin(dLat/2)*Math.sin(dLat/2) + Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLng/2)*Math.sin(dLng/2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}
function distLabel(km){
  if (km < 1) return Math.round(km*1000) + ' m away';
  if (km < 20) return km.toFixed(1) + ' km away';
  return Math.round(km) + ' km away';
}

/* ---------- tab switching ---------- */
var tabs = document.querySelectorAll('.nav button[data-tab]');
for (var t = 0; t < tabs.length; t++) {
  tabs[t].addEventListener('click', function(){ showTab(this.getAttribute('data-tab')); });
}
function showTab(id){
  document.querySelectorAll('.screen').forEach(function(s){ s.classList.remove('on'); });
  $(id).classList.add('on');
  document.querySelectorAll('.nav button').forEach(function(b){ b.classList.remove('on'); });
  var btn = document.querySelector('.nav button[data-tab="' + id + '"]');
  if (btn) btn.classList.add('on');
  window.scrollTo(0,0);
  if (id === 'page-nearme') initMap();
  if (id === 'page-club') renderSaved();
  if (id === 'page-scan') { var e = load(LS_EMAIL,''); if (e) { $('scanEmail').value = e; $('emailSaved').style.display='block'; } }
}
$('go-find').addEventListener('click', function(){ showTab('page-nearme'); });
$('go-review').addEventListener('click', function(){ showTab('page-nearme'); });
$('go-scan').addEventListener('click', function(){ showTab('page-scan'); });

/* ---------- featured venues (guide) ---------- */
(function(){
  var html = '';
  FEATURED.forEach(function(idx){
    var v = VENUES[idx], t = TIERS[v[5]];
    html += '<div class="venue" data-idx="' + idx + '" style="cursor:pointer">' +
      '<div class="vh"><div class="vt"><b>' + esc(v[0]) + '</b>' +
      '<div class="meta">' + esc(v[1]) + (v[4] ? ' &middot; ' + esc(v[4].slice(0,70)) : '') + '</div></div>' +
      '<span class="tier ' + t.cls + '">' + t.label + '</span></div></div>';
  });
  $('featured').innerHTML = html;
  $('featured').querySelectorAll('.venue').forEach(function(el){
    el.addEventListener('click', function(){ openVenue(+el.getAttribute('data-idx')); });
  });
})();

/* ---------- venue list rendering ---------- */
var curList = [];
function renderList(){
  var q = $('q').value.trim().toLowerCase();
  var st = $('stateSel').value;
  var tier = window.__tierFilter;
  var idxs = [];
  for (var i = 0; i < N; i++) {
    if (st && VENUES[i][1] !== st) continue;
    if (tier !== undefined && tier !== null && VENUES[i][5] !== tier) continue;
    if (q && SEARCH[i].indexOf(q) === -1) continue;
    idxs.push(i);
  }
  /* distance sort if we have a fix */
  var geo = window.__geo;
  if (geo) idxs.sort(function(a,b){ return haversine(geo.lat, geo.lng, VENUES[a][2], VENUES[a][3]) - haversine(geo.lat, geo.lng, VENUES[b][2], VENUES[b][3]); });

  var total = idxs.length, show = idxs.slice(0, 300);
  curList = show;
  $('listmeta').textContent = 'Showing ' + show.length + ' of ' + fmt(total) + ' matching venues' + (total > show.length ? ' (refine your search to see more)' : '');
  var html = '';
  for (var k = 0; k < show.length; k++) {
    var i2 = show[k], v = VENUES[i2], t = TIERS[v[5]];
    html += '<div class="list-item" data-idx="' + i2 + '"><div class="ti">' +
      (v[5]===2 ? '&#127942;' : v[5]===1 ? '&#9989;' : v[5]===3 ? '&#127849;' : '&#127860;') + '</div>' +
      '<div class="lt"><b>' + esc(v[0]) + '</b><small>' + esc(v[1]) + (geo ? ' &middot; ' + distLabel(geoDist(i2)) : '') +
      (v[4] ? ' &middot; ' + esc(v[4].slice(0,52)) : '') + '</small></div>' +
      '<span class="tier ' + t.cls + '">' + t.label + '</span></div>';
  }
  $('venuelist').innerHTML = html || '<div class="empty">No venues match - try a different search or filter.</div>';
  $('venuelist').querySelectorAll('.list-item').forEach(function(el){
    el.addEventListener('click', function(){ openVenue(+el.getAttribute('data-idx')); });
  });
}
$('q').addEventListener('input', renderList);
$('stateSel').addEventListener('change', renderList);
(function(){
  var opts = Object.keys(STATE_NAMES).sort();
  var sel = $('stateSel');
  opts.forEach(function(s){ var o = document.createElement('option'); o.value = s; o.textContent = s; sel.appendChild(o); });
})();
/* tier chips */
(function(){
  var wrap = $('tierChips');
  var chip = document.createElement('button');
  chip.className = 'fchip on'; chip.textContent = 'All'; chip.dataset.tier = '';
  wrap.appendChild(chip);
  [2,1,0,3].forEach(function(tc){
    var b = document.createElement('button');
    b.className = 'fchip';
    b.innerHTML = '<span class="dot" style="background:' + TIERS[tc].pin + '"></span>' + TIERS[tc].label;
    b.dataset.tier = tc;
    wrap.appendChild(b);
  });
  wrap.querySelectorAll('.fchip').forEach(function(b){
    b.addEventListener('click', function(){
      wrap.querySelectorAll('.fchip').forEach(function(x){ x.classList.remove('on'); });
      b.classList.add('on');
      window.__tierFilter = b.dataset.tier === '' ? null : +b.dataset.tier;
      renderList(); applyPinFilter();
    });
  });
})();

/* ---------- map ---------- */
var map = null, markers = null, markerIdx = [];
function initMap(){
  if (map) { setTimeout(function(){ map.invalidateSize(); }, 50); return; }
  if (typeof L === 'undefined') { $('map').innerHTML = '<div style="padding:40px;text-align:center;color:#6B7A6E">Map failed to load - check your connection.</div>'; return; }
  map = L.map('map', { preferCanvas: true }).setView([-27.47, 153.03], 9);
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors' }).addTo(map);
  markers = L.layerGroup().addTo(map);
  var canvasRenderer = L.canvas({ padding: 0.3 });
  for (var i = 0; i < N; i++) {
    (function(idx){
      var v = VENUES[idx];
      var m = L.circleMarker([v[2], v[3]], {
        renderer: canvasRenderer, radius: 5, weight: 1.5,
        color: '#fff', fillColor: TIERS[v[5]].pin, fillOpacity: 0.95
      });
      m.on('click', function(){ showMapCard(idx); });
      m.addTo(markers);
      markerIdx[idx] = m;
    })(i);
  }
  renderList();
}
function showMapCard(idx){
  var v = VENUES[idx], t = TIERS[v[5]], card = $('mapcard');
  card.innerHTML = '<b>' + esc(v[0]) + '</b><div class="meta">' + esc(v[1]) + ' &middot; <span class="tier ' + t.cls + '">' + t.label + '</span></div>' +
    '<button class="btn small" id="mcOpen">View venue &#8250;</button>';
  card.style.display = 'block';
  $('mcOpen').onclick = function(){ openVenue(idx); };
}
function applyPinFilter(){
  if (!markers) return;
  var tier = window.__tierFilter, st = $('stateSel').value, q = $('q').value.trim().toLowerCase();
  for (var i = 0; i < N; i++) {
    var m = markerIdx[i]; if (!m) continue;
    var v = VENUES[i];
    var vis = (!tier || v[5] === tier) && (!st || v[1] === st) && (!q || SEARCH[i].indexOf(q) !== -1);
    if (vis) { if (!map.hasLayer(m)) m.addTo(markers); }
    else if (map.hasLayer(m)) markers.removeLayer(m);
  }
}
$('q').addEventListener('change', applyPinFilter);
$('stateSel').addEventListener('change', applyPinFilter);
document.getElementById('q').addEventListener('input', debounce(applyPinFilter, 300));
function debounce(fn, ms){ var t; return function(){ clearTimeout(t); t = setTimeout(fn, ms); }; }

/* ---------- geolocation ---------- */
$('geoBtn').addEventListener('click', function(){
  var msg = $('locmsg');
  msg.style.display = 'block';
  if (!navigator.geolocation) { msg.textContent = 'Sorry - this browser does not support location.'; return; }
  msg.textContent = 'Finding you...';
  navigator.geolocation.getCurrentPosition(function(pos){
    window.__geo = { lat: pos.coords.latitude, lng: pos.coords.longitude };
    msg.style.display = 'none';
    if (map) {
      map.setView([window.__geo.lat, window.__geo.lng], 12);
      if (window.__geoPin) map.removeLayer(window.__geoPin);
      window.__geoPin = L.circleMarker([window.__geo.lat, window.__geo.lng], { radius: 8, color: '#E2557B', fillColor: '#E2557B', fillOpacity: 1, weight: 2 }).addTo(map);
    }
    renderList();
    /* scroll to list */
    $('listmeta').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, function(err){
    msg.textContent = err.code === 1
      ? 'Location denied - no worries. Search by name or state instead.'
      : 'Could not get your location - search by name or state instead.';
  }, { timeout: 10000 });
});

/* ---------- venue page ---------- */
var curVenue = null, curStars = 0, curChecks = {}, curMenuFile = '', curFoodFile = '';
function openVenue(idx){
  curVenue = idx;
  var v = VENUES[idx], t = TIERS[v[5]];
  var saved = getSaved().indexOf(idx) !== -1;
  var revs = getReviews()[idx] || [];
  var html =
    '<div class="vhead"><button class="backbtn" id="vBack">&#8249;</button>' +
    '<div class="vtitle"><h1>' + esc(v[0]) + '</h1><div class="meta">' + esc(v[1]) + '</div></div>' +
    '<button class="heartbtn' + (saved ? ' on' : '') + '" id="vHeart" title="Save venue">' + (saved ? '&#10084;&#65039;' : '&#129505;') + '</button></div>' +
    '<div style="padding:0 16px">' +
    '<div class="badgehero"><span class="tier ' + t.cls + '">' + t.label + '</span>' +
    '<div class="tiersub">' + t.sub + '</div></div>' +
    (v[4] ? '<div class="notesbox"><b>COMMUNITY NOTES</b>' + esc(v[4]) + '</div>' : '') +
    '<div id="vmap"></div>' +
    '<div class="safety">' + SAFETY_LINE + '</div>' +
    '<div class="revsec"><h3>Leave a review (demo)</h3>' +
    '<div class="starrow" id="starRow"></div>' +
    '<div class="checks">' +
    '<label><input type="checkbox" data-c="separate prep area"> Separate prep area</label>' +
    '<label><input type="checkbox" data-c="dedicated fryer"> Dedicated fryer</label>' +
    '<label><input type="checkbox" data-c="staff trained on coeliac needs"> Staff trained on coeliac needs</label>' +
    '<label><input type="checkbox" data-c="clean pan for GF orders"> Clean pan for GF orders</label>' +
    '</div>' +
    '<div class="photogrid">' +
    '<label class="phototile" id="tileMenu">&#128220; Menu snap<br><small>tap to attach</small><input type="file" accept="image/*" hidden id="fileMenu"></label>' +
    '<label class="phototile" id="tileFood">&#127860; Food snap<br><small>tap to attach</small><input type="file" accept="image/*" hidden id="fileFood"></label>' +
    '</div>' +
    '<input class="comment" id="revComment" maxlength="200" placeholder="One line - how did it feel to eat here?">' +
    '<button class="btn" id="revSave">Save review</button>' +
    '<div style="font-size:10.5px;color:#8A948B;margin-top:6px">Demo build - your review stays on this device only.</div>' +
    '<div id="revList"></div>' +
    '</div>' +
    '<div class="stack"><a class="btn ghost center" target="_blank" rel="noopener" href="' + FORM_URL + '">Claim this venue &#8250;</a></div>' +
    '</div>';
  var pg = $('page-venue');
  pg.innerHTML = html;
  pg.classList.add('on');
  document.body.style.overflow = 'hidden';
  $('vBack').addEventListener('click', closeVenue);
  $('vHeart').addEventListener('click', function(){ toggleSaved(idx); });
  /* stars */
  var sr = $('starRow');
  for (var s = 1; s <= 5; s++) {
    (function(s2){
      var b = document.createElement('button');
      b.textContent = '\u2B50'; b.dataset.s = s2;
      b.addEventListener('click', function(){
        curStars = s2;
        sr.querySelectorAll('button').forEach(function(x){ x.classList.toggle('on', +x.dataset.s <= s2); });
      });
      sr.appendChild(b);
    })(s);
  }
  /* photo placeholders - delegated so tile re-renders keep working */
  $('revSave').addEventListener('click', function(){ saveReview(idx); });
  renderRevs(idx);
  /* mini map */
  setTimeout(function(){
    if (typeof L === 'undefined' || !$('vmap')) return;
    var vm = L.map('vmap', { scrollWheelZoom: false, dragging: true });
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '&copy; OpenStreetMap contributors' }).addTo(vm);
    L.circleMarker([v[2], v[3]], { radius: 8, color: '#fff', weight: 2, fillColor: t.pin, fillOpacity: 1 }).addTo(vm).bindPopup(esc(v[0]));
    vm.setView([v[2], v[3]], 14);
    window.__vmap = vm;
  }, 60);
  window.scrollTo(0, 0);
  pg.scrollTop = 0;
}
function tileSet(id, emoji, label, fname){
  var el = $(id), inpId = id === 'tileMenu' ? 'fileMenu' : 'fileFood';
  var inner = fname
    ? emoji + ' ' + esc(fname)
    : emoji + ' ' + label + '<br><small>tap to attach</small>';
  el.classList.toggle('has', !!fname);
  el.innerHTML = inner + '<input type="file" accept="image/*" hidden id="' + inpId + '">';
}
function closeVenue(){
  $('page-venue').classList.remove('on');
  document.body.style.overflow = '';
  if (window.__vmap) { try { window.__vmap.remove(); } catch(e){} window.__vmap = null; }
  curStars = 0; curChecks = {}; curMenuFile = ''; curFoodFile = '';
}
function toggleSaved(idx){
  var s = getSaved(), at = s.indexOf(idx);
  if (at === -1) s.push(idx); else s.splice(at, 1);
  store(LS_SAVED, s);
  var hb = $('vHeart');
  var on = s.indexOf(idx) !== -1;
  hb.classList.toggle('on', on);
  hb.innerHTML = on ? '&#10084;&#65039;' : '&#129505;';
}
function saveReview(idx){
  if (!curStars) { alert('Tap a star rating first \u2B50'); return; }
  var checks = [];
  document.querySelectorAll('#page-venue .checks input:checked').forEach(function(c){ checks.push(c.dataset.c); });
  var comment = $('revComment').value.trim();
  var all = getReviews();
  if (!all[idx]) all[idx] = [];
  all[idx].push({ stars: curStars, checks: checks, comment: comment, menu: curMenuFile, food: curFoodFile, date: new Date().toLocaleDateString('en-AU', { day:'numeric', month:'short', year:'numeric' }) });
  store(LS_REV, all);
  closeComposer(); renderRevs(idx);
}
function closeComposer(){
  curStars = 0; curChecks = {};
  $('starRow').querySelectorAll('button').forEach(function(x){ x.classList.remove('on'); });
  document.querySelectorAll('#page-venue .checks input').forEach(function(c){ c.checked = false; });
  $('revComment').value = '';
  tileSet('tileMenu', '&#128220;', 'Menu snap', ''); tileSet('tileFood', '&#127860;', 'Food snap', '');
}
function renderRevs(idx){
  var revs = getReviews()[idx] || [];
  var html = '';
  if (revs.length) {
    html += '<h3 class="sect" style="margin-top:14px">Your reviews</h3>';
    revs.forEach(function(r){
      html += '<div class="savedrev"><b>' + '\u2B50'.repeat(r.stars) + '</b>' +
        (r.comment ? '<div>' + esc(r.comment) + '</div>' : '') +
        (r.checks && r.checks.length ? '<div class="chips">' + r.checks.map(function(c){ return '<span>&#9989; ' + esc(c) + '</span>'; }).join('') + '</div>' : '') +
        '<small>' + esc(r.date || '') + (r.menu ? ' &middot; menu snap attached' : '') + (r.food ? ' &middot; food snap attached' : '') + '</small></div>';
    });
  }
  var box = $('revList');
  if (box) box.innerHTML = html;
}

/* ---------- saved list (club tab + you sheet) ---------- */
function renderSaved(){
  var s = getSaved();
  var html = '';
  if (!s.length) html = '<div class="empty">No saved venues yet - tap the heart &#129505; on any venue page.</div>';
  s.forEach(function(idx){
    var v = VENUES[idx], t = TIERS[v[5]];
    html += '<div class="list-item" data-idx="' + idx + '"><div class="ti">&#10084;&#65039;</div>' +
      '<div class="lt"><b>' + esc(v[0]) + '</b><small>' + esc(v[1]) + '</small></div>' +
      '<span class="tier ' + t.cls + '">' + t.label + '</span></div>';
  });
  $('savedList').innerHTML = html;
  $('youSaved').innerHTML = html;
  bindListItems(['savedList','youSaved']);
}
function renderYouReviews(){
  var all = getReviews(), html = '', count = 0;
  Object.keys(all).forEach(function(idx){
    all[idx].forEach(function(r){
      count++;
      var v = VENUES[idx];
      html += '<div class="savedrev"><b>' + esc(v ? v[0] : 'Venue') + '</b> ' + '\u2B50'.repeat(r.stars) +
        (r.comment ? '<div>' + esc(r.comment) + '</div>' : '') +
        '<small>' + esc(r.date || '') + '</small></div>';
    });
  });
  $('youReviews').innerHTML = html || '<div class="empty">No reviews yet - open a venue and leave the first one.</div>';
}
function bindListItems(ids){
  ids.forEach(function(id){
    $(id).querySelectorAll('.list-item').forEach(function(el){
      el.onclick = function(){ closeYou(); openVenue(+el.getAttribute('data-idx')); };
    });
  });
}

/* ---------- you sheet ---------- */
$('youBtn').addEventListener('click', function(){
  renderSaved(); renderYouReviews();
  $('you-sheet').classList.add('on');
});
$('youClose').addEventListener('click', closeYou);
$('you-sheet').addEventListener('click', function(e){ if (e.target === this) closeYou(); });
function closeYou(){ $('you-sheet').classList.remove('on'); }

/* ---------- scan email capture ---------- */
document.addEventListener('change', function(e){
  if (e.target && e.target.id === 'fileMenu') { curMenuFile = e.target.files[0] ? e.target.files[0].name : ''; tileSet('tileMenu', '&#128220;', 'Menu snap', curMenuFile); }
  if (e.target && e.target.id === 'fileFood') { curFoodFile = e.target.files[0] ? e.target.files[0].name : ''; tileSet('tileFood', '&#127860;', 'Food snap', curFoodFile); }
});
$('saveEmail').addEventListener('click', function(){
  var e = $('scanEmail').value.trim();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e)) { alert('Please enter a valid email address.'); return; }
  store(LS_EMAIL, e);
  $('emailSaved').style.display = 'block';
});

/* ---------- service worker ---------- */
if ('serviceWorker' in navigator && location.protocol === 'https:') {
  navigator.serviceWorker.register('sw.js').catch(function(){});
}

/* ---------- initial list ---------- */
renderList();
