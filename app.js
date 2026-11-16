/* GFC Coeliac Guide - staging demo. All data local; reviews/saves in localStorage only. */
'use strict';

var SAFETY_LINE = 'Always confirm with staff - menus and practices change.';
var FORM_URL = 'https://forms.gle/b7gmN3HLygfZ3maq5';
var REVIEW_FORM_URL = 'https://docs.google.com/forms/d/e/1FAIpQLScWlEvB8h3NZWcua5FvgaJ-vg34cZy8GdhIREa4SSzZjHrVAQ/viewform';

/* tier codes in venues.js: 0=has GF options, 1=accredited, 2=100% GF, 3=GF donuts only */
var TIERS = {
  0: { cls:'has',   label:'HAS GF OPTIONS',              sub:'community added - not yet verified by reviews', color:'#E8720C', pin:'#F97316' },
  1: { cls:'acc',   label:'COELIAC AUSTRALIA ACCREDITED',sub:'Accredited by Coeliac Australia',               color:'#2E7D46', pin:'#2E7D46' },
  2: { cls:'full',  label:'100% GLUTEN FREE',            sub:'Everything made gluten free',                   color:'#C88A1E', pin:'#E8A33D' },
  3: { cls:'donut', label:'GF DONUTS ONLY',              sub:'GF donuts / dedicated treats only',             color:'#8A8378', pin:'#A89F92' }
};
var STATE_NAMES = { QLD:'QLD', NSW:'NSW', VIC:'VIC', WA:'WA', SA:'SA', ACT:'ACT', TAS:'TAS', NT:'NT', NZ:'NZ' };
/* Featured venues for the guide home, resolved by NAME (not index) so a
   dataset rebuild can never re-point these cards at the wrong venue. */
var FEATURED = (function () {
  var names = ['Eat Street Northshore', 'NAÏM', 'Gluten Free 4 U - Toowoomba'];
  var out = [];
  names.forEach(function (n) {
    for (var i = 0; i < VENUES.length; i++) {
      if (VENUES[i][0].indexOf(n) === 0) { out.push(i); break; }
    }
  });
  return out;
})();
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
/* community voices from the Facebook mining (seeded, attributed, linked) */
var SEED = [];
fetch('reviews-seed.json').then(function(r){ return r.json(); }).then(function(d){ SEED = d; if (curVenue !== null) { renderSeed(); renderRevList(); } }).catch(function(){});
window.addEventListener('load', function(){ if (SEED.length && curVenue !== null) renderSeed(); });

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
/* WikiCamps-style tag filters: bitfield TAGS from the community map notes */
var TAG_META = {
  1:  { icon: '&#127839;', label: 'Separate fryer' },
  2:  { icon: '&#128220;', label: 'Dedicated GF menu' },
  4:  { icon: '&#9989;',  label: 'Coeliac accredited' },
  8:  { icon: '&#127849;', label: 'GF donuts' },
  16: { icon: '&#127838;', label: 'GF bread available' }
};
/* ---------- bread tag derivation (bit 16) - MUST run before the chip bar
   builds, or the Bread chip counts zero venues and hides itself ---------- */
(function(){
  for (var i = 0; i < N; i++) {
    var t = (VENUES[i][0] + ' ' + (VENUES[i][4] || '')).toLowerCase();
    if (t.indexOf('bread') !== -1 || t.indexOf('bakery') !== -1 || t.indexOf('bakehouse') !== -1) TAGS[i] = (TAGS[i] || 0) | 16;
  }
})();

/* WikiCamps-style three-state matching: chip states are 'must' (venue must
   have it), 'hide' (exclude venues that have it) or null (don't care).
   Must-tiers combine as OR (show any of them); must-tags combine as AND. */
function matchVenue(i){
  var S = window.__chipState || {};
  var mustT = [], hideT = [], mustG = 0, hideG = 0;
  for (var k in S) {
    if (!S[k]) continue;
    var kind = k.split('-')[0], val = +k.split('-')[1];
    if (S[k] === 'must') { if (kind === 'tier') mustT.push(val); else mustG |= val; }
    else { if (kind === 'tier') hideT.push(val); else hideG |= val; }
  }
  if (mustT.length && mustT.indexOf(VENUES[i][5]) === -1) return false;
  if (hideT.indexOf(VENUES[i][5]) !== -1) return false;
  if (mustG && ((TAGS[i] || 0) & mustG) !== mustG) return false;
  if (hideG && ((TAGS[i] || 0) & hideG)) return false;
  return true;
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
  if (id === 'page-nearme') { initMap(); autoLocate(); }
  if (id === 'page-club') renderSaved();
  if (id === 'page-scan') { var e = load(LS_EMAIL,''); if (e) { $('scanEmail').value = e; $('emailSaved').style.display='block'; } }
}
$('go-find').addEventListener('click', function(){ showTab('page-nearme'); });
$('go-scan').addEventListener('click', function(){ showTab('page-scan'); });

/* ---------- featured venues (guide) ---------- */
(function(){
  var html = '';
  FEATURED.forEach(function(idx){
    var v = VENUES[idx], t = TIERS[v[5]];
    html += '<div class="venue" data-idx="' + idx + '" style="cursor:pointer">' +
      '<div class="vh"><div class="vt"><b>' + esc(v[0]) + '</b>' +
      '<div class="meta">' + esc(v[1]) + (v[4] ? ' &middot; ' + esc(v[4].slice(0,70)) : '') + '</div>' +
      '<div class="ftag">Community pick</div></div>' +
      '<span class="tier ' + t.cls + '">' + t.label + '</span></div></div>';
  });
  /* paid featured slot demo - venues buy a top-5 slot; until one is sold,
     show an availability card that opens the venue application form */
  html += '<div class="venue paidslot" style="cursor:pointer" id="featuredSlot">' +
    '<div class="vh"><div class="vt"><b>&#9733; Feature your venue here</b>' +
    '<div class="meta">Paid placement for local venues - ask about a founding spot</div></div></div></div>';
  $('featured').innerHTML = html;
  $('featured').querySelectorAll('.venue[data-idx]').forEach(function(el){
    el.addEventListener('click', function(){ openVenue(+el.getAttribute('data-idx')); });
  });
  var slot = document.getElementById('featuredSlot');
  if (slot) slot.addEventListener('click', function(){ window.open(FORM_URL, '_blank'); });
})();

/* ---------- venue list rendering ---------- */
var curList = [];
function renderList(){
  var q = $('q').value.trim().toLowerCase();
  var st = $('stateSel').value;
  var idxs = [];
  for (var i = 0; i < N; i++) {
    if (st && VENUES[i][1] !== st) continue;
    if (!matchVenue(i)) continue;
    if (q && SEARCH[i].indexOf(q) === -1) continue;
    idxs.push(i);
  }
  /* distance sort if we have a fix */
  var geo = window.__geo;
  if (geo) idxs.sort(function(a,b){
    var va = (VENUES[a][2] === 0 && VENUES[a][3] === 0) ? 1e12 : haversine(geo.lat, geo.lng, VENUES[a][2], VENUES[a][3]);
    var vb = (VENUES[b][2] === 0 && VENUES[b][3] === 0) ? 1e12 : haversine(geo.lat, geo.lng, VENUES[b][2], VENUES[b][3]);
    return va - vb;
  });

  /* Tee rule: searching a suburb flies the map there (e.g. type Chermside ->
     the map zooms to Chermside). Only refit when the search text CHANGES, so
     tapping filter chips never makes the map jump around. */
  if (q && map && idxs.length) {
    if (q !== renderList.__lastFit) {
      renderList.__lastFit = q;
      var pts = [];
      for (var pf = 0; pf < idxs.length && pts.length < 200; pf++) {
        var vv = VENUES[idxs[pf]];
        if (vv[2] !== 0 || vv[3] !== 0) pts.push([vv[2], vv[3]]);
      }
      if (pts.length === 1) map.setView(pts[0], 15);
      else if (pts.length) map.fitBounds(L.latLngBounds(pts), { padding: [40, 40], maxZoom: 14 });
    }
  } else if (!q) {
    renderList.__lastFit = '';
  }

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
$('stateSel').addEventListener('change', function(){
  renderList();
  var STC = {QLD:[-23.2,146.5], NSW:[-32.5,148.5], VIC:[-37.2,144.5], SA:[-30.5,136.5], WA:[-27.5,121.5], TAS:[-42.1,146.8], NT:[-19.5,133.5], ACT:[-35.28,149.13]};
  var stv = $('stateSel').value;
  if (map && stv && STC[stv]) { map.setView(STC[stv], 8); if (window.__geo === undefined || !window.__geo) {} }
  else if (map && !stv) { map.setView([-27.47, 153.03], 9); }
  renderPins();
});
(function(){
  var opts = Object.keys(STATE_NAMES).sort();
  var sel = $('stateSel');
  opts.forEach(function(s){ var o = document.createElement('option'); o.value = s; o.textContent = s; sel.appendChild(o); });
})();
/* WikiCamps-style icon filter bar */
(function(){
  var wrap = $('tierChips');
  var defs = [
    { k:'all',        icon: '&#128204;', label: 'All' },
    { k:'tier', val:2, icon: '&#127942;', label: '100% GF' },
    { k:'tier', val:1, icon: '&#9989;',  label: 'Accredited' },
    { k:'tier', val:0, icon: '&#127860;', label: 'GF options' },
    { k:'tier', val:3, icon: '&#127849;', label: 'Donuts' },
    { k:'tag',  val:1, icon: '&#127839;', label: 'Fryer' },
    { k:'tag',  val:16, icon: '&#127838;', label: 'Bread' }
  ];
  defs.forEach(function(d, i){
    if (d.k !== 'all' && d.k !== 'tier') {
      var hit = 0;
      for (var z = 0; z < N; z++) { if ((TAGS[z] || 0) & d.val) hit++; }
      if (hit === 0) return; /* no venues carry this tag yet - hide the chip */
    }
    var b = document.createElement('button');
    b.className = 'wchip' + (i === 0 ? ' on' : '');
    b.title = 'Tap once: must have. Tap twice: hide. Tap again: off.';
    b.innerHTML = '<span class="wicon">' + d.icon + '</span><small>' + d.label + '</small>';
    if (i === 0) {
      /* All resets every chip to don't-care */
      b.addEventListener('click', function(){
        window.__chipState = {};
        wrap.querySelectorAll('.wchip').forEach(function(x){ x.classList.remove('on','avoid'); });
        b.classList.add('on');
        renderList(); applyPinFilter();
      });
    } else {
      b.addEventListener('click', function(){
        window.__chipState = window.__chipState || {};
        var key = d.k + '-' + d.val;
        var cur = window.__chipState[key] || null;
        window.__chipState[key] = cur === null ? 'must' : cur === 'must' ? 'hide' : null;
        b.classList.toggle('on', window.__chipState[key] === 'must');
        b.classList.toggle('avoid', window.__chipState[key] === 'hide');
        renderList(); applyPinFilter();
      });
    }
    wrap.appendChild(b);
  });
})();

/* ---------- map ---------- */
var map = null, markers = null, markerIdx = [];
function initMap(){
  if (map) { setTimeout(function(){ map.invalidateSize(); }, 50); return; }
  if (typeof L === 'undefined') { $('map').innerHTML = '<div style="padding:40px;text-align:center;color:#6B7A6E">Map failed to load - check your connection.</div>'; return; }
  map = L.map('map', { preferCanvas: true }).setView([-27.47, 153.03], 9);
  L.tileLayer('https://a.tile.openstreetmap.fr/hot/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> style &copy; <a href="https://www.hotosm.org/">Humanitarian OSM Team</a>' }).addTo(map);
  markers = L.layerGroup().addTo(map);
  var cnt = document.createElement('div');
  cnt.id = 'mapcount';
  document.getElementById('mapwrap').appendChild(cnt);
  map.on('moveend zoomend', renderPins);
  renderPins();
  renderList();
}
/* WikiCamps-style rendering: draw matching venues in view; when the viewport
   is crowded, grid-cluster them into numbered circles that split on zoom. */
function addSinglePin(idx){
  if (!markerIdx[idx]) {
    (function(ix){
      var vv = VENUES[ix];
      var m = L.circleMarker([vv[2], vv[3]], {
        radius: 8, weight: 2, color: '#fff', fillColor: TIERS[vv[5]].pin, fillOpacity: 0.95
      });
      m.on('click', function(){ showMapCard(ix); });
      markerIdx[ix] = m;
    })(idx);
  }
  if (!map.hasLayer(markerIdx[idx])) markerIdx[idx].addTo(markers);
}
function renderPins(){
  if (!map || !markers) return;
  var b = map.getBounds(), st = $('stateSel').value, q = $('q').value.trim().toLowerCase();
  markers.clearLayers();
  var pts = [];
  for (var i = 0; i < N; i++) {
    var v = VENUES[i];
    if (v[2] === 0 && v[3] === 0) continue;
    if (v[2] < b.getSouth() || v[2] > b.getNorth() || v[3] < b.getWest() || v[3] > b.getEast()) continue;
    if (st && v[1] !== st) continue;
    if (q && SEARCH[i].indexOf(q) === -1) continue;
    if (!matchVenue(i)) continue;
    pts.push(i);
  }
  var cnt = document.getElementById('mapcount');
  if (cnt) cnt.textContent = fmt(pts.length) + ' venues in view';
  if (pts.length <= 350) { pts.forEach(addSinglePin); return; }
  /* grid clustering at the current zoom: 64px cells */
  var CELL = 64, cells = {}, z = map.getZoom();
  pts.forEach(function(i){
    var p = map.project([VENUES[i][2], VENUES[i][3]], z);
    var key = Math.floor(p.x / CELL) + ':' + Math.floor(p.y / CELL);
    (cells[key] = cells[key] || []).push(i);
  });
  Object.keys(cells).forEach(function(k){
    var g = cells[k];
    if (g.length === 1) { addSinglePin(g[0]); return; }
    var lat = 0, lng = 0, tiers = {};
    g.forEach(function(i){
      lat += VENUES[i][2]; lng += VENUES[i][3];
      tiers[VENUES[i][5]] = (tiers[VENUES[i][5]] || 0) + 1;
    });
    lat /= g.length; lng /= g.length;
    var domTier = +Object.keys(tiers).sort(function(a,b){ return tiers[b] - tiers[a]; })[0];
    var c = L.marker([lat, lng], { icon: L.divIcon({
      className: '',
      html: '<div class="pcluster" style="background:' + TIERS[domTier].pin + '">' + g.length + '</div>',
      iconSize: [36, 36], iconAnchor: [18, 18]
    })});
    c.on('click', function(){ map.setView([lat, lng], Math.min(z + 2, 16)); });
    c.addTo(markers);
  });
}
function showMapCard(idx){
  var v = VENUES[idx], t = TIERS[v[5]], card = $('mapcard');
  card.innerHTML = '<b>' + esc(v[0]) + '</b><div class="meta">' + esc(v[1]) + ' &middot; <span class="tier ' + t.cls + '">' + t.label + '</span></div>' +
    '<div class="actrow">' +
    /* Tee rule (16 Nov): pin tap = one-tap Navigate straight from the map card */
    '<a class="btn small dirbtn" href="https://www.google.com/maps/dir/?api=1&destination=' + v[2] + ',' + v[3] + '" target="_blank" rel="noopener">&#129686; Navigate</a>' +
    '<button class="btn small" id="mcOpen">View venue &#8250;</button></div>';
  card.style.display = 'block';
  $('mcOpen').onclick = function(){ openVenue(idx); };
}
function applyPinFilter(){
  if (!markers) return;
  renderPins();
}
$('q').addEventListener('change', applyPinFilter);
$('stateSel').addEventListener('change', applyPinFilter);
document.getElementById('q').addEventListener('input', debounce(applyPinFilter, 300));
function debounce(fn, ms){ var t; return function(){ clearTimeout(t); t = setTimeout(fn, ms); }; }

/* ---------- map toggle ---------- */
$('mapToggle').addEventListener('click', function(){
  var w = document.getElementById('mapwrap');
  var showing = !w.hidden;
  w.hidden = showing;
  this.innerHTML = showing ? '&#128196; Hide map' : '&#128506;&#65039; Show map';
  if (!showing) { initMap(); setTimeout(function(){ map.invalidateSize(); renderPins(); }, 80); }
  else { window.scrollTo(0, document.getElementById('listmeta').offsetTop - 60); }
});

/* ---------- geolocation ---------- */
window.__autoLocated = false;
function autoLocate(){
  if (window.__autoLocated || window.__geo || !navigator.geolocation) return;
  window.__autoLocated = true;
  requestGeo();
}
$('geoBtn').addEventListener('click', function(){
  requestGeo();
});
function requestGeo(){
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
}

/* ---------- suburb enrichment (search by suburb) ---------- */
var SUBURBS = {};
fetch('./suburbs.json').then(function(r){ return r.ok ? r.json() : null; }).then(function(d){
  if (!d) return;
  SUBURBS = d;
  for (var k in d) {
    var i = parseInt(k, 10);
    if (SEARCH[i] && d[k]) SEARCH[i] += ' ' + String(d[k]).toLowerCase();
  }
  if ($('page-nearme').classList.contains('on')) { renderList(); if (window.map) renderPins(); }
}).catch(function(){});

/* ---------- share the app ---------- */
var SHARE = { title: 'GFC Coeliac Guide', text: 'Gluten-free places near you, verified by real club members', url: 'https://gfclubau-design.github.io/gfc-coeliac-guide/' };
if ($('shareBtn')) $('shareBtn').addEventListener('click', function(){
  if (navigator.share) { navigator.share(SHARE).catch(function(){}); return; }
  if (navigator.clipboard) {
    navigator.clipboard.writeText(SHARE.url).then(function(){ $('shareBtn').textContent = 'LINK COPIED'; setTimeout(function(){ $('shareBtn').textContent = 'SHARE'; }, 1800); }, function(){});
  }
});

/* ---------- venue page ---------- */
var curVenue = null, curStars = 0, curChecks = {}, curMenuFile = '', curFoodFile = '';
function openVenue(idx){
  curVenue = idx;
  var v = VENUES[idx], t = TIERS[v[5]];
  setTimeout(function(){ renderSeed(); renderRevList(); }, 0);
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
    '<div class="iconrow">' +
      (function(){ var t = TAGS[idx] || 0, h = '';
        for (var bit in TAG_META) { if (t & +bit) h += '<span class="vic">' + TAG_META[bit].icon + '<small>' + TAG_META[bit].label + '</small></span>'; }
        return h || '<span class="vic none"><small>No practice tags yet - add one in your review</small></span>';
      })() +
    '</div>' +
    '<div class="actrow">' +
      '<a class="btn dirbtn" href="https://www.google.com/maps/dir/?api=1&destination=' + v[2] + ',' + v[3] + '" target="_blank" rel="noopener">&#129686; Directions</a>' +
      /* Tee rule: never scrape or store Google reviews - link out to the
         venue's own Google listing (fresh reviews, $0, Google-terms-safe) */
      '<a class="btn ghost" href="https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(v[0] + ' ' + (SUBURBS[String(idx)] || v[1])) + '" target="_blank" rel="noopener">&#11088; Google reviews</a>' +
      (WEBSITES[idx] ? '<a class="btn dirbtn web" href="' + esc(WEBSITES[idx]) + '" target="_blank" rel="noopener">&#127760; Website</a>' : '') +
    '</div>' +
    ((v[2] !== 0 || v[3] !== 0) ? '<div id="vmap"></div>' : '') +
    '<div class="safety">' + SAFETY_LINE + '</div>' +
    '<div id="seedBox"></div>' +
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
    '<button class="btn" id="revSave">Save to my device</button>' +
    '<button class="btn dirbtn" id="revPost" style="margin-left:6px">&#128075; Post it to the community</button>' +
    '<div style="font-size:10.5px;color:#8A948B;margin-top:6px">Save keeps it on this device. Post sends it to Gluten Free Club - after a quick check, it shows for everyone.</div>' +
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
  $('revPost').addEventListener('click', function(){
    var v = VENUES[idx];
    var url = REVIEW_FORM_URL + '?usp=pp_url' +
      '&entry.41758106=' + encodeURIComponent(v[0]);
    window.open(url, '_blank', 'noopener');
  });
  renderRevs(idx);
  /* mini map */
  setTimeout(function(){
    if (typeof L === 'undefined' || !$('vmap')) return;
    var vm = L.map('vmap', { scrollWheelZoom: false, dragging: true });
    L.tileLayer('https://a.tile.openstreetmap.fr/hot/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '&copy; OpenStreetMap contributors' }).addTo(vm);
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
/* ---------- community voices (seeded) ---------- */
function renderSeed(){
  var box = $('seedBox');
  if (!box) return;
  var list = SEED.filter(function(r){ return r.idx === curVenue; });
  if (!list.length) { box.innerHTML = ''; return; }
  var h = '<div class="seedsec"><h3>Community voices <span class="seedtag">' + list.length + '</span></h3>';
  for (var i = 0; i < list.length; i++) {
    var r = list[i];
    var neg = r.sent === 'negative' || r.sent === 'mixed';
    h += '<div class="seedq' + (neg ? ' warn' : '') + '">' +
      '<div class="sq">' + esc(r.text) + '</div>' +
      '<div class="smeta">' + esc(r.author) + ' &middot; ' + esc(r.src) + (r.date ? ' &middot; ' + esc(r.date) : '') +
      (r.link ? ' &middot; <a href="' + esc(r.link) + '" target="_blank" rel="noopener">original post</a>' : '') + '</div>';
    if (r.practices && r.practices.length) {
      h += '<div class="sprac">' + r.practices.map(function(p){ return '<span>' + esc(p) + '</span>'; }).join('') + '</div>';
    }
    h += '</div>';
  }
  h += '<div class="snote">Community voices are quotes from public gluten-free Facebook groups, attributed and linked.</div></div>';
  box.innerHTML = h;
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
  navigator.serviceWorker.register('sw.js?build=26').catch(function(){});
}

/* ---------- initial list ---------- */
renderList();
