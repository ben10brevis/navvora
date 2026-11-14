/**
 * =======================================================================
 * 🔑 NAVVORA TELUGU - GITHUB PAGES CLIENT-SIDE APPLICATION
 * =======================================================================
 * 
 * 👉 HOW TO ADD YOUR TMDB API KEY:
 * 1. Open this file (app.js).
 * 2. In line 15 below, replace "YOUR_TMDB_API_KEY_HERE" with your TMDB v3 API Key.
 *    Example: const TMDB_API_KEY = "a1b2c3d4e5f6g7h8i9j0...";
 * 3. In line 16, update BOT_USERNAME if your Telegram bot username is different.
 * =======================================================================
 */

// -----------------------------------------------------------------------
// ⚙️ CONFIGURATION (EDIT HERE)
// -----------------------------------------------------------------------
const TMDB_API_KEY = "032bb4acd80291322ea323660fde75bf"; // <-- PASTE YOUR TMDB API KEY HERE
const BOT_USERNAME = "navvorabot";             // <-- YOUR TELEGRAM BOT USERNAME (WITHOUT @)
// -----------------------------------------------------------------------

(() => {
  const $ = id => document.getElementById(id);
  
  let heroItems = [];
  let heroIndex = 0;
  let heroTimer = null;
  let searchTimer = null;
  let lastQuery = '';
  let loadingMore = false;

  const state = {
    category: 'telugu',
    telugu: {
      items: [],
      page: 1,
      totalPages: 1,
      seen: new Set()
    },
    hollywood: {
      items: [],
      page: 1,
      totalPages: 1,
      seen: new Set()
    }
  };

  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));

  function siteBotPayload(title) {
    title = (title || "").trim().toLowerCase();
    const words = title.match(/[^\W_]+/g) || [];
    const cleanWords = words.filter(w => /^[a-z0-9]+$/i.test(w)).slice(0, 8);
    return cleanWords.length ? "q_" + cleanWords.join("_") : "";
  }

  function botLink(m) {
    return 'https://t.me/' + BOT_USERNAME + '?start=' + encodeURIComponent(m.bot_payload || '');
  }

  function siteMovieItem(row, verifiedDub = false) {
    const title = row.title || row.original_title || "Untitled";
    const release = row.release_date || "";
    const year = release.length >= 4 ? release.substring(0, 4) : "";
    const payload = siteBotPayload(title) || siteBotPayload(row.original_title || "");
    return {
      id: Number(row.id || 0),
      title: title,
      year: year,
      release_date: release,
      language: (row.original_language || "").toLowerCase(),
      poster: row.poster_path ? ("https://image.tmdb.org/t/p/w500" + row.poster_path) : "",
      backdrop: row.backdrop_path ? ("https://image.tmdb.org/t/p/w1280" + row.backdrop_path) : "",
      overview: row.overview || "",
      rating: Number(row.vote_average || 0),
      popularity: Number(row.popularity || 0),
      verified_dub: Boolean(verifiedDub),
      bot_payload: payload
    };
  }

  function card(m) {
    const img = m.poster
      ? `<img loading="lazy" src="${esc(m.poster)}" alt="${esc(m.title)} poster" onerror="this.outerHTML='<div class=&quot;fallback&quot;>${esc(m.title)}</div>'">`
      : `<div class="fallback">${esc(m.title)}</div>`;
    return `
      <a class="movie" href="${botLink(m)}" target="_blank" rel="noopener noreferrer" title="Find ${esc(m.title)} in Navvora">
        <div class="poster">
          ${img}
          <span class="rating">★ ${Number(m.rating || 0).toFixed(1)}</span>
          ${m.verified_dub ? '<span class="dub">TELUGU DUB</span>' : ''}
        </div>
        <h3>${esc(m.title)}</h3>
        <p class="meta">${esc(m.year || 'Year N/A')} · ${esc((m.language || '').toUpperCase())}</p>
      </a>
    `;
  }

  async function fetchTmdb(endpoint, params = {}) {
    if (!TMDB_API_KEY || TMDB_API_KEY === "YOUR_TMDB_API_KEY_HERE") {
      throw new Error("Please add your TMDB API Key in app.js (line 15).");
    }
    const url = new URL("https://api.themoviedb.org/3" + endpoint);
    url.searchParams.set("api_key", TMDB_API_KEY);
    url.searchParams.set("language", "en-US");
    for (const [k, v] of Object.entries(params)) {
      url.searchParams.set(k, v);
    }
    const res = await fetch(url.toString());
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.status_message || `TMDB API error (${res.status})`);
    }
    return await res.json();
  }

  function showHero(i) {
    if (!heroItems.length) return;
    heroIndex = (i + heroItems.length) % heroItems.length;
    const m = heroItems[heroIndex];
    
    $('heroTitle').textContent = m.title;
    $('heroOverview').textContent = m.overview || `${m.year || ''} · Find this title on Navvora Telugu.`;
    
    const bgImg = m.backdrop || m.poster;
    $('heroBg').style.backgroundImage = bgImg ? `url("${bgImg.replace(/"/g, '%22')}")` : '';
    $('heroOpen').href = botLink(m);
    
    // Accurate 2:3 poster showcase
    if (m.poster) {
      $('heroPoster').src = m.poster;
      $('heroPoster').alt = m.title + ' Poster';
    }
    $('heroRating').textContent = '★ ' + Number(m.rating || 0).toFixed(1);
    $('heroDub').style.display = m.verified_dub ? 'block' : 'none';
    
    $('heroMeta').innerHTML = `
      <span>★ ${Number(m.rating || 0).toFixed(1)}</span>
      <span>${esc(m.year || 'N/A')}</span>
      <span>${esc((m.language || '').toUpperCase())}</span>
      ${m.verified_dub ? '<span style="color:#ff6874">TELUGU DUB</span>' : ''}
    `;
    
    // Accurately fitted 6 top posters thumbnails
    $('heroThumbs').innerHTML = heroItems.map((item, n) => `
      <button class="hero-thumb ${n === heroIndex ? 'active' : ''}" 
              aria-label="Show ${esc(item.title)}" 
              data-dot="${n}" 
              title="${esc(item.title)}">
        <img src="${esc(item.poster)}" alt="${esc(item.title)}">
      </button>
    `).join('');
    
    $('heroThumbs').querySelectorAll('button').forEach(b => {
      b.addEventListener('click', () => {
        showHero(Number(b.dataset.dot));
        restartHero();
      });
    });
  }

  function restartHero() {
    clearInterval(heroTimer);
    if (heroItems.length > 1) {
      heroTimer = setInterval(() => showHero(heroIndex + 1), 5200);
    }
  }

  function renderGrid() {
    const cur = state[state.category];
    $('latestGrid').innerHTML = cur.items.length
      ? cur.items.map(card).join('')
      : '<div class="empty">No movies found right now.</div>';
    $('movieCount').textContent = cur.items.length + ' MOVIES';
    
    const b = $('loadMore');
    const hasMore = cur.page < cur.totalPages;
    b.disabled = !hasMore;
    b.innerHTML = hasMore ? '<span class="arrow">＋</span> LOAD 7 MORE MOVIES' : 'YOU’RE ALL CAUGHT UP ✓';
  }

  function switchCategory(cat) {
    if (state.category === cat) return;
    state.category = cat;
    if (cat === 'telugu') {
      $('tabTelugu').classList.add('active');
      $('tabHollywood').classList.remove('active');
      $('sectionTitle').textContent = 'Latest Telugu Movies';
    } else {
      $('tabHollywood').classList.add('active');
      $('tabTelugu').classList.remove('active');
      $('sectionTitle').textContent = 'Latest Telugu Dubbed Hollywood Movies';
    }
    renderGrid();
  }

  async function loadHome() {
    const today = new Date().toISOString().split('T')[0];
    try {
      // 1. Fetch Telugu Movies (Page 1)
      const dataTe = await fetchTmdb("/discover/movie", {
        include_adult: "false",
        include_video: "false",
        with_origin_country: "IN",
        with_original_language: "te",
        sort_by: "primary_release_date.desc",
        "release_date.lte": today,
        "vote_count.gte": 1,
        page: 1
      });
      const teRows = (dataTe.results || [])
        .filter(x => x.id && x.poster_path)
        .map(x => siteMovieItem(x, false));
      
      state.telugu.items = teRows;
      state.telugu.page = 1;
      state.telugu.totalPages = Number(dataTe.total_pages || 1);
      teRows.forEach(x => state.telugu.seen.add(x.id));

      // 2. Fetch Hollywood Movies Dubbed in Telugu (Page 1)
      const dataHw = await fetchTmdb("/discover/movie", {
        include_adult: "false",
        include_video: "false",
        with_original_language: "en",
        sort_by: "primary_release_date.desc",
        "release_date.lte": today,
        "vote_count.gte": 10,
        page: 1
      });
      const hwRows = (dataHw.results || [])
        .filter(x => x.id && x.poster_path)
        .map(x => siteMovieItem(x, true));
      
      state.hollywood.items = hwRows;
      state.hollywood.page = 1;
      state.hollywood.totalPages = Number(dataHw.total_pages || 1);
      hwRows.forEach(x => state.hollywood.seen.add(x.id));

      // 3. Top 6 Featured Hero Movies
      const pool = [...teRows, ...hwRows];
      const uniqueHero = {};
      pool.forEach(x => { uniqueHero[x.id] = x; });
      heroItems = Object.values(uniqueHero)
        .sort((a, b) => b.popularity - a.popularity)
        .slice(0, 6);

      showHero(0);
      restartHero();
      renderGrid();
    } catch (e) {
      $('latestGrid').innerHTML = `<div class="empty">${esc(e.message || 'Could not load movies. Please check your TMDB API Key.')}</div>`;
      $('loadMore').disabled = true;
    }
  }

  async function loadMore() {
    if (loadingMore) return;
    const cur = state[state.category];
    if (cur.page >= cur.totalPages) return;
    
    loadingMore = true;
    const b = $('loadMore');
    b.disabled = true;
    b.innerHTML = '<span class="spinner"></span> LOADING MOVIES';
    
    const today = new Date().toISOString().split('T')[0];
    const isHw = (state.category === 'hollywood');
    const nextPage = cur.page + 1;

    try {
      const params = isHw ? {
        include_adult: "false",
        include_video: "false",
        with_original_language: "en",
        sort_by: "primary_release_date.desc",
        "release_date.lte": today,
        "vote_count.gte": 10,
        page: nextPage
      } : {
        include_adult: "false",
        include_video: "false",
        with_origin_country: "IN",
        with_original_language: "te",
        sort_by: "primary_release_date.desc",
        "release_date.lte": today,
        "vote_count.gte": 1,
        page: nextPage
      };

      const data = await fetchTmdb("/discover/movie", params);
      const rows = (data.results || [])
        .filter(x => x.id && x.poster_path)
        .map(x => siteMovieItem(x, isHw));
      
      const fresh = rows.filter(x => !cur.seen.has(x.id));
      fresh.forEach(x => cur.seen.add(x.id));

      if (fresh.length) {
        cur.items.push(...fresh);
        $('latestGrid').insertAdjacentHTML('beforeend', fresh.map(card).join(''));
      }
      cur.page = nextPage;
      cur.totalPages = Number(data.total_pages || cur.totalPages);
      renderGrid();
    } catch (e) {
      b.textContent = 'RETRY · LOAD 7 MORE';
      b.disabled = false;
      console.error(e);
    } finally {
      loadingMore = false;
    }
  }

  async function search(q, source) {
    const isTop = (source === 'top');
    const stateEl = isTop ? $('topSearchState') : $('searchState');
    const sectionEl = isTop ? $('topSearchSection') : $('searchSection');
    const gridEl = isTop ? $('topSearchGrid') : $('searchGrid');

    if (q.length < 2) {
      sectionEl.classList.remove('show');
      stateEl.textContent = '';
      return;
    }
    if (q === lastQuery) return;
    lastQuery = q;
    stateEl.textContent = '…';

    try {
      const data = await fetchTmdb("/search/movie", {
        query: q,
        include_adult: "false",
        page: 1
      });
      const results = (data.results || [])
        .filter(x => x.id && x.poster_path)
        .map(x => siteMovieItem(x, false));

      gridEl.innerHTML = results.length
        ? results.map(card).join('')
        : '<div class="empty">No matching movie found. Try another title.</div>';
      
      sectionEl.classList.add('show');
      stateEl.textContent = results.length ? results.length + ' FOUND' : '';
    } catch (e) {
      gridEl.innerHTML = `<div class="empty">${esc(e.message || 'Search unavailable')}</div>`;
      sectionEl.classList.add('show');
      stateEl.textContent = '';
    }
  }

  function setupSearchInput(inputEl, source) {
    inputEl.addEventListener('input', () => {
      clearTimeout(searchTimer);
      lastQuery = '';
      const q = inputEl.value.trim();
      // Keep both search inputs in sync
      if (source === 'top') {
        $('search').value = q;
      } else {
        $('topSearch').value = q;
      }
      searchTimer = setTimeout(() => search(q, source), 320);
    });
  }

  // Event Listeners
  $('tabTelugu').addEventListener('click', () => switchCategory('telugu'));
  $('tabHollywood').addEventListener('click', () => switchCategory('hollywood'));
  $('loadMore').addEventListener('click', loadMore);
  setupSearchInput($('topSearch'), 'top');
  setupSearchInput($('search'), 'bottom');
// Example: Track when a user clicks on a movie
  window.va('event', { 
    name: 'movie_click', 
    data: { title: movie.title, category: 'telugu' } 
});
  // Initialize
  loadHome();
})();
