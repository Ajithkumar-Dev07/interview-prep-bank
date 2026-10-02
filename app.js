/* ============================================================
   Production Support Interview Bank — read-only front end.

   Content is NOT embedded in this file. On load, the app fetches
   data/index.json (a manifest of topics) and then fetches each
   topic's JSON file listed there, merging everything into one
   in-memory array. This repo is the source of truth: to add a
   topic, add a JSON file under data/topics/ and register it in
   data/index.json, then push -- the next page load (and the next
   GitHub Pages deploy) picks it up automatically. See README.md.

   There is no in-app editor. Removing the earlier admin/version-
   history/edit features was an explicit request, since all edits
   now happen as commits to this repo instead.
   ============================================================ */

/* ============ data loading ============ */
let ALL_ENTRIES = [];     // merged, flattened entries from every topic file
let LOAD_ERROR = null;

async function loadData(){
  const indexResp = await fetch('data/index.json', { cache: 'no-cache' });
  if(!indexResp.ok){
    throw new Error(`Could not load data/index.json (HTTP ${indexResp.status})`);
  }
  const manifest = await indexResp.json();
  if(!manifest || !Array.isArray(manifest.topics)){
    throw new Error('data/index.json is missing a "topics" array');
  }

  const entries = [];
  // Fetch all topic files in parallel; a single bad/missing file
  // shouldn't take down the whole app, so failures are logged and
  // skipped rather than thrown.
  await Promise.all(manifest.topics.map(async (topicMeta) => {
    if(!topicMeta || !topicMeta.file || !topicMeta.id){
      console.warn('Skipping malformed topic entry in index.json:', topicMeta);
      return;
    }
    try{
      const resp = await fetch(`data/${topicMeta.file}`, { cache: 'no-cache' });
      if(!resp.ok){
        console.warn(`Skipping topic "${topicMeta.id}" -- HTTP ${resp.status} loading ${topicMeta.file}`);
        return;
      }
      const list = await resp.json();
      if(!Array.isArray(list)){
        console.warn(`Skipping topic "${topicMeta.id}" -- ${topicMeta.file} is not a JSON array`);
        return;
      }
      list.forEach(item => {
        if(!item || !item.heading || !item.content) return; // basic validation -- skip incomplete entries
        entries.push({
          // Namespaced with the topic id so two topic files can both
          // use simple local ids ("q1", "q2", ...) without colliding.
          id: `${topicMeta.id}:${item.id || entries.length}`,
          topic: topicMeta.label || topicMeta.id,
          heading: item.heading,
          parentHeading: item.parentHeading || null,
          content: item.content
        });
      });
    }catch(err){
      console.warn(`Skipping topic "${topicMeta.id}" -- failed to load/parse ${topicMeta.file}:`, err);
    }
  }));

  return entries;
}

/* ============ favorites (view-only preference, kept in the browser) ============
   This is the one piece of client-side persistence left in a
   read-only app: which questions a visitor has starred. It's
   personal and disposable, so plain localStorage is appropriate
   here -- unlike the old admin content, nothing here needs to be
   shared or treated as a source of truth. */
const FAV_KEY = 'ps-interview-bank:v1:favorites';
let favorites = [];
function loadFavorites(){
  try{
    const raw = window.localStorage.getItem(FAV_KEY);
    favorites = raw ? JSON.parse(raw) : [];
  }catch(e){
    favorites = []; // private browsing / storage disabled -- favorites just won't persist
  }
}
function saveFavorites(){
  try{ window.localStorage.setItem(FAV_KEY, JSON.stringify(favorites)); }
  catch(e){ console.warn('Could not save favorites (storage unavailable or full):', e); }
}
function toggleFavorite(id){
  if(favorites.includes(id)) favorites = favorites.filter(x => x !== id);
  else favorites.push(id);
  saveFavorites();
  render();
}

/* ============ state ============ */
let state = {
  query:'',
  activeTopics: new Set(),
  favoritesOnly:false,
  openIds: new Set()
};

/* ============ derived data ============ */
function allTopics(){
  const set = new Set();
  ALL_ENTRIES.forEach(e => set.add(e.topic));
  return Array.from(set).sort((a,b)=>a.localeCompare(b));
}
function topicCounts(){
  const counts = {};
  ALL_ENTRIES.forEach(e => counts[e.topic] = (counts[e.topic]||0)+1);
  return counts;
}

/* ============ search ============ */
function normalize(s){ return (s||'').toLowerCase(); }
function matches(entry, q){
  if(!q) return true;
  const nq = normalize(q);
  return normalize(entry.heading).includes(nq) ||
         normalize(entry.content).includes(nq) ||
         normalize(entry.topic).includes(nq) ||
         normalize(entry.parentHeading||'').includes(nq);
}
function filteredEntries(){
  let list = ALL_ENTRIES;
  if(state.activeTopics.size) list = list.filter(e => state.activeTopics.has(e.topic));
  if(state.favoritesOnly) list = list.filter(e => favorites.includes(e.id));
  if(state.query) list = list.filter(e => matches(e, state.query));
  return list;
}

const STOP = new Set(['the','a','an','of','to','in','and','or','is','are','you','your','what','how','do','does','on','for','with','it','be','as','can','we','i','my','was','were','will','would','this','that']);
function keywordSet(text){
  return new Set(normalize(text).replace(/[^a-z0-9 ]/g,' ').split(/\s+/).filter(w=>w.length>2 && !STOP.has(w)));
}
function relatedTo(entry, pool){
  const kws = keywordSet(entry.heading);
  const scored = [];
  pool.forEach(other => {
    if(other.id === entry.id) return;
    let score = 0;
    if(other.topic === entry.topic) score += 1;
    if(other.parentHeading && other.parentHeading === entry.parentHeading) score += 3;
    const okws = keywordSet(other.heading);
    okws.forEach(w => { if(kws.has(w)) score += 2; });
    if(score>0) scored.push([score, other]);
  });
  scored.sort((a,b)=>b[0]-a[0]);
  return scored.slice(0,4).map(x=>x[1]);
}

/* ============ rendering ============ */
const $ = sel => document.querySelector(sel);
const $$ = sel => Array.from(document.querySelectorAll(sel));

function esc(s){
  return (s||'').replace(/[&<>]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]));
}
function highlight(text, q){
  const e = esc(text);
  if(!q) return e;
  try{
    const re = new RegExp('(' + q.replace(/[.*+?^${}()|[\]\\]/g,'\\$&') + ')', 'ig');
    return e.replace(re, '<mark>$1</mark>');
  }catch(err){ return e; }
}

function renderSidebar(){
  const counts = topicCounts();
  const topics = allTopics();
  const totalCount = ALL_ENTRIES.length;
  let html = `<li><button class="topic-btn ${state.activeTopics.size===0?'active':''}" data-topic="__all__"><span>All topics</span><span class="count">${totalCount}</span></button></li>`;
  topics.forEach(t => {
    const active = state.activeTopics.has(t);
    html += `<li><button class="topic-btn ${active?'active':''}" data-topic="${esc(t)}"><span>${esc(t)}</span><span class="count">${counts[t]||0}</span></button></li>`;
  });
  $('#topicList').innerHTML = html;
  $$('#topicList .topic-btn').forEach(btn => btn.addEventListener('click', () => {
    const t = btn.dataset.topic;
    if(t === '__all__'){ state.activeTopics.clear(); }
    else{
      if(state.activeTopics.has(t)) state.activeTopics.delete(t);
      else state.activeTopics.add(t);
    }
    render();
  }));
}

function renderActiveBar(){
  let html = '';
  state.activeTopics.forEach(t => {
    html += `<span class="chip">${esc(t)}<button data-remove-topic="${esc(t)}">✕</button></span>`;
  });
  if(state.favoritesOnly) html += `<span class="chip amber">★ Favorites<button id="clearFav">✕</button></span>`;
  if(state.query) html += `<span class="chip">"${esc(state.query)}"<button id="clearQuery">✕</button></span>`;
  const n = filteredEntries().length;
  html += `<span id="resultcount">${n} result${n===1?'':'s'}</span>`;
  $('#activebar').innerHTML = html;
  $$('#activebar [data-remove-topic]').forEach(b => b.addEventListener('click', () => {
    state.activeTopics.delete(b.dataset.removeTopic); render();
  }));
  const cf = $('#clearFav'); if(cf) cf.addEventListener('click', () => { state.favoritesOnly=false; render(); });
  const cq = $('#clearQuery'); if(cq) cq.addEventListener('click', () => { state.query=''; $('#searchbox').value=''; render(); });
}

function cardHtml(entry, pool){
  const isOpen = state.openIds.has(entry.id);
  const isFav = favorites.includes(entry.id);
  let body = '';
  if(isOpen){
    const rel = relatedTo(entry, pool);
    let relHtml = '';
    if(rel.length){
      relHtml = `<div class="related-row"><span class="lbl">RELATED</span>` +
        rel.map(r => `<button class="related-chip" data-open-related="${r.id}">${esc(r.heading)}</button>`).join('') +
        `</div>`;
    }
    body = `<div class="card-body">
      <div class="answer">${highlight(entry.content, state.query)}</div>
      ${relHtml}
    </div>`;
  }
  const parentBadge = entry.parentHeading ? `<span class="badge parent">${esc(entry.parentHeading)}</span>` : '';
  return `<div class="card ${isOpen?'open':''}" data-id="${entry.id}">
    <div class="card-head" data-toggle="${entry.id}">
      <span class="qmark">Q</span>
      <div class="htext">
        <h3>${highlight(entry.heading, state.query)}</h3>
        <div class="meta"><span class="badge">${esc(entry.topic)}</span>${parentBadge}</div>
      </div>
      <div class="card-actions">
        <button class="icon-btn star ${isFav?'active':''}" data-fav="${entry.id}" title="Favorite">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="${isFav?'currentColor':'none'}" stroke="currentColor" stroke-width="1.8"><polygon points="12 2 15.1 8.6 22 9.6 17 14.6 18.2 21.5 12 18.2 5.8 21.5 7 14.6 2 9.6 8.9 8.6 12 2"/></svg>
        </button>
        <svg class="chevron" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m9 6 6 6-6 6"/></svg>
      </div>
    </div>
    ${body}
  </div>`;
}

function renderList(){
  const pool = ALL_ENTRIES;
  const list = filteredEntries();
  if(!list.length){
    $('#content').innerHTML = `<div id="emptystate"><h3>No matches</h3><p>Try a different search term or clear filters.</p></div>`;
    return;
  }
  $('#content').innerHTML = list.map(e => cardHtml(e, pool)).join('');
  $$('[data-toggle]').forEach(el => el.addEventListener('click', (ev) => {
    if(ev.target.closest('[data-fav]')) return;
    const id = el.dataset.toggle;
    if(state.openIds.has(id)) state.openIds.delete(id); else state.openIds.add(id);
    render();
  }));
  $$('[data-fav]').forEach(el => el.addEventListener('click', (ev) => {
    ev.stopPropagation();
    toggleFavorite(el.dataset.fav);
  }));
  $$('[data-open-related]').forEach(el => el.addEventListener('click', (ev) => {
    ev.stopPropagation();
    const id = el.dataset.openRelated;
    state.openIds.add(id);
    state.query=''; state.activeTopics.clear(); state.favoritesOnly=false;
    $('#searchbox').value='';
    render();
    const card = document.querySelector(`.card[data-id="${id}"]`);
    if(card) card.scrollIntoView({behavior:'smooth', block:'center'});
  }));
}

function render(){
  renderSidebar();
  renderActiveBar();
  renderList();
  $('#favSwitch').classList.toggle('on', state.favoritesOnly);
}

/* ============ autocomplete ============ */
function updateAutocomplete(q){
  const box = $('#autocomplete');
  if(!q){ box.style.display='none'; return; }
  const nq = normalize(q);
  const matchesHead = ALL_ENTRIES.filter(e => normalize(e.heading).includes(nq)).slice(0,8);
  if(!matchesHead.length){ box.style.display='none'; return; }
  box.innerHTML = matchesHead.map(e => `<div class="ac-item" data-id="${e.id}">
      <span>${highlight(e.heading, q)}</span><span class="ac-topic">${esc(e.topic)}</span>
    </div>`).join('');
  box.style.display='block';
  $$('#autocomplete .ac-item').forEach(el => el.addEventListener('click', () => {
    const id = el.dataset.id;
    const entry = ALL_ENTRIES.find(e=>e.id===id);
    state.query = entry.heading;
    $('#searchbox').value = state.query;
    box.style.display='none';
    state.openIds.add(id);
    render();
    const card = document.querySelector(`.card[data-id="${id}"]`);
    if(card) card.scrollIntoView({behavior:'smooth', block:'center'});
  }));
}

/* ============ wiring ============ */
function wireControls(){
  let searchDebounce;
  $('#searchbox').addEventListener('input', (e) => {
    const v = e.target.value;
    $('#searchclear').style.display = v ? 'block' : 'none';
    clearTimeout(searchDebounce);
    searchDebounce = setTimeout(() => { state.query = v; render(); updateAutocomplete(v); }, 120);
  });
  $('#searchbox').addEventListener('focus', (e) => updateAutocomplete(e.target.value));
  document.addEventListener('click', (e) => {
    if(!e.target.closest('#searchwrap')) $('#autocomplete').style.display='none';
  });
  $('#searchclear').addEventListener('click', () => {
    $('#searchbox').value=''; state.query=''; $('#searchclear').style.display='none'; render();
  });
  $('#favSwitch').addEventListener('click', () => { state.favoritesOnly = !state.favoritesOnly; render(); });
  $('#btnDrawer').addEventListener('click', () => { $('#sidebar').classList.add('open'); $('#drawer-scrim').classList.add('show'); });
  $('#drawer-scrim').addEventListener('click', () => { $('#sidebar').classList.remove('open'); $('#drawer-scrim').classList.remove('show'); });
}

/* ============ init ============ */
function renderErrorState(err){
  $('#content').innerHTML = `<div id="errorstate">
    <h3>Couldn't load the question bank</h3>
    <p>${esc(err.message || String(err))}</p>
    <p class="hint">If you're testing this locally by double-clicking index.html, the browser blocks fetch() on file:// URLs.
    Run a local server instead, e.g.:</p>
    <code>npx serve .</code>
    <p class="hint">On GitHub Pages this works automatically over https:// -- no server setup needed.</p>
  </div>`;
}

async function init(){
  loadFavorites();
  wireControls();
  try{
    ALL_ENTRIES = await loadData();
    if(!ALL_ENTRIES.length){
      throw new Error('data/index.json loaded, but no valid Q&A entries were found in the referenced topic files.');
    }
    $('#searchbox').disabled = false;
    render();
  }catch(err){
    LOAD_ERROR = err;
    console.error('Failed to load question bank:', err);
    renderErrorState(err);
  }
}
init();
