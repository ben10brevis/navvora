/**
 * NAVVORA CINEMA — multilingual TMDB catalogue
 * Categories use each movie's original language:
 * Telugu (te), Tamil (ta), Hindi (hi), Hollywood/English (en), Malayalam (ml), Kannada (kn).
 */
const TMDB_API_KEY = "032bb4acd80291322ea323660fde75bf";
const BOT_USERNAME = "navvorabot";
  const FILE_API_BASE = "https://filebot-2wxx.onrender.com";

(() => {
  const $ = id => document.getElementById(id);
  const CATEGORIES = {
    telugu: { label: "Telugu", language: "te", title: "Latest Telugu Movies", country: "IN" },
    tamil: { label: "Tamil", language: "ta", title: "Latest Tamil Movies", country: "IN" },
    hindi: { label: "Hindi", language: "hi", title: "Latest Hindi Movies", country: "IN" },
    hollywood: { label: "Hollywood", language: "en", title: "Latest Hollywood Movies" },
    malayalam: { label: "Malayalam", language: "ml", title: "Latest Malayalam Movies", country: "IN" },
    kannada: { label: "Kannada", language: "kn", title: "Latest Kannada Movies", country: "IN" }
  };

  let heroItems = [];
  let heroIndex = 0;
  let heroTimer = null;
  let searchTimer = null;
  let lastQuery = "";
  let loadingMore = false;
  const state = { category: "telugu" };

  Object.keys(CATEGORIES).forEach(key => {
    state[key] = { items: [], page: 1, totalPages: 1, seen: new Set(), loaded: false, loading: false };
  });

  const esc = value => String(value ?? "").replace(/[&<>"']/g, c => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }[c]));

  function siteBotPayload(title) {
    const words = String(title || "").trim().toLowerCase().match(/[^\W_]+/g) || [];
    const clean = words.filter(w => /^[a-z0-9]+$/i.test(w)).slice(0, 8);
    return clean.length ? "q_" + clean.join("_") : "";
  }

  function botLink(movie) {
    return "https://t.me/" + BOT_USERNAME + "?start=" + encodeURIComponent(movie.bot_payload || "");
  }

  function filePageLink(movie) {
    const params = new URLSearchParams({ title: movie.title || "", bot: botLink(movie), poster: movie.poster || "", backdrop: movie.backdrop || "" });
    return "files.html?" + params.toString();
  }

  function siteMovieItem(row) {
    const title = row.title || row.original_title || "Untitled";
    const release = row.release_date || "";
    return {
      id: Number(row.id || 0),
      title,
      year: release.length >= 4 ? release.substring(0, 4) : "",
      release_date: release,
      language: (row.original_language || "").toLowerCase(),
      poster: row.poster_path ? "https://image.tmdb.org/t/p/w500" + row.poster_path : "",
      backdrop: row.backdrop_path ? "https://image.tmdb.org/t/p/w1280" + row.backdrop_path : "",
      overview: row.overview || "",
      rating: Number(row.vote_average || 0),
      popularity: Number(row.popularity || 0),
      bot_payload: siteBotPayload(title) || siteBotPayload(row.original_title || "")
    };
  }

  function card(movie) {
    movieCache.set(Number(movie.id), movie);
    const img = movie.poster
      ? `<img loading="lazy" src="${esc(movie.poster)}" alt="${esc(movie.title)} poster" onerror="this.outerHTML='<div class=&quot;fallback&quot;>${esc(movie.title)}</div>'">`
      : `<div class="fallback">${esc(movie.title)}</div>`;
    const saved = isSaved(movie.id);
    return `
      <article class="movie-shell" data-movie-id="${movie.id}">
        <a class="movie" href="${filePageLink(movie)}" title="Explore ${esc(movie.title)} on Navvora">
          <div class="poster">
            ${img}
            <span class="rating">★ ${Number(movie.rating || 0).toFixed(1)}</span>
            <span class="poster-hint">VIEW DETAILS</span>
          </div>
          <h3>${esc(movie.title)}</h3>
          <p class="meta">${esc(movie.year || "Year N/A")} · ${esc((movie.language || "").toUpperCase())}</p>
        </a>
        <button class="details-trigger" type="button" data-details-id="${movie.id}" aria-label="View details for ${esc(movie.title)}">ⓘ</button>
        <button class="save-movie ${saved ? "saved" : ""}" type="button" data-save-id="${movie.id}" aria-label="${saved ? "Remove from" : "Add to"} watchlist">${saved ? "♥ SAVED" : "＋ WATCHLIST"}</button>
      </article>`;
  }

  const WATCHLIST_KEY = "navvora_watchlist_v1";
  const movieCache = new Map();
  let activeModalMovie = null;
  let modalReturnFocus = null;

  function readWatchlist() {
    try { return JSON.parse(localStorage.getItem(WATCHLIST_KEY) || "[]"); }
    catch { return []; }
  }
  function isSaved(id) { return readWatchlist().some(item => Number(item.id) === Number(id)); }
  function saveMovie(movie) {
    const list = readWatchlist();
    const exists = list.some(item => Number(item.id) === Number(movie.id));
    const next = exists ? list.filter(item => Number(item.id) !== Number(movie.id)) : [movie, ...list].slice(0, 100);
    localStorage.setItem(WATCHLIST_KEY, JSON.stringify(next));
    updateWatchlistUI();
    document.querySelectorAll(`[data-save-id="${movie.id}"]`).forEach(button => {
      button.classList.toggle("saved", !exists);
      button.textContent = exists ? "＋ WATCHLIST" : "♥ SAVED";
      button.setAttribute("aria-label", exists ? "Add to watchlist" : "Remove from watchlist");
    });
    if (activeModalMovie && Number(activeModalMovie.id) === Number(movie.id)) {
      $("modalSave").textContent = exists ? "♡ Save to Watchlist" : "♥ Saved to Watchlist";
      $("modalSave").classList.toggle("saved", !exists);
    }
  }
  function updateWatchlistUI() {
    const list = readWatchlist();
    $("watchlistCount").textContent = list.length;
    $("watchlistGrid").innerHTML = list.length
      ? list.map(card).join("")
      : '<div class="empty">Your watchlist is empty. Save movies you want to remember.</div>';
  }
  function findMovie(id) {
    return movieCache.get(Number(id)) || [...Object.keys(CATEGORIES).flatMap(key => state[key].items), ...heroItems, ...readWatchlist()].find(item => Number(item.id) === Number(id));
  }
  function renderMovieFiles(items) {
    const root = $("modalFiles");
    if (!root) return;
    if (!items.length) {
      root.innerHTML = '<div class="files-empty">No matching Telegram files are indexed for this title yet.</div>';
      return;
    }
    root.innerHTML = items.map(file => {
      const url = String(file.bot_url || "");
      const safeUrl = /^https:\/\/t\.me\/[A-Za-z0-9_]+\?start=[A-Za-z0-9_-]+$/.test(url) ? url : "";
      const tags = [
        file.quality || "",
        ...(Array.isArray(file.languages) ? file.languages.slice(0, 2).map(x => String(x).toUpperCase()) : []),
        file.season ? "S" + String(file.season).padStart(2, "0") + (file.episode ? "E" + String(file.episode).padStart(2, "0") : "") : "",
        Number(file.file_count || 0) > 1 ? Number(file.file_count) + " files" : ""
      ].filter(Boolean);
      return `
        <article class="tg-file-card">
          <div class="tg-file-main">
            <h3>${esc(file.title || file.index_title || "Telegram file")}</h3>
            <p class="tg-file-index">${esc(file.index_title || "")}</p>
            <div class="tg-file-tags">${tags.map(tag => `<span>${esc(tag)}</span>`).join("")}</div>
          </div>
          <div class="tg-file-bottom">
            <span class="tg-file-size">${esc(file.size || "Size unavailable")}</span>
            ${safeUrl ? `<a class="tg-file-button" href="${esc(safeUrl)}" target="_blank" rel="noopener noreferrer">➤ &nbsp; Get on Telegram</a>` : '<span class="tg-file-unavailable">Telegram link unavailable</span>'}
          </div>
        </article>`;
    }).join("");
  }

  async function loadMovieFiles(movie) {
    const root = $("modalFiles");
    if (!root) return;
    root.innerHTML = '<div class="files-loading"><span class="spinner"></span> Finding files in Telegram…</div>';
    try {
      const url = FILE_API_BASE + "/api/files?q=" + encodeURIComponent(movie.title || "");
      const response = await fetch(url, { cache: "no-store" });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.detail || "Telegram file lookup failed.");
      if (!activeModalMovie || Number(activeModalMovie.id) !== Number(movie.id)) return;
      renderMovieFiles(Array.isArray(data.items) ? data.items : []);
      const count = Array.isArray(data.items) ? data.items.length : 0;
      $("modalFilesCount").textContent = count ? count + " AVAILABLE" : "0 AVAILABLE";
    } catch (error) {
      if (!activeModalMovie || Number(activeModalMovie.id) !== Number(movie.id)) return;
      root.innerHTML = '<div class="files-empty">Telegram file catalogue is temporarily unavailable. You can still search this title in the bot.</div>';
      $("modalFilesCount").textContent = "UNAVAILABLE";
      console.error("Navvora Telegram file lookup failed:", error);
    }
  }

  async function openMovieDetails(movie, trigger) {
    if (!movie) return;
    activeModalMovie = movie;
    modalReturnFocus = trigger || document.activeElement;
    $("movieModal").classList.add("open");
    $("movieModal").setAttribute("aria-hidden", "false");
    document.body.classList.add("modal-open");
    $("modalTitle").textContent = movie.title;
    $("modalOverview").textContent = movie.overview || "No synopsis is available yet.";
    $("modalMeta").textContent = [movie.year, movie.language?.toUpperCase(), "★ " + Number(movie.rating || 0).toFixed(1)].filter(Boolean).join("  ·  ");
    $("modalArt").style.backgroundImage = movie.backdrop ? `url("${movie.backdrop}")` : movie.poster ? `url("${movie.poster}")` : "none";
    $("modalFind").href = botLink(movie);
    $("modalGenres").textContent = "Loading movie details…";
    $("modalCast").textContent = "";
    $("modalSave").textContent = isSaved(movie.id) ? "♥ Saved to Watchlist" : "♡ Save to Watchlist";
    $("modalSave").classList.toggle("saved", isSaved(movie.id));
    $("modalFilesCount").textContent = "LOADING";
    loadMovieFiles(movie);
    try {
      const details = await fetchTmdb("/movie/" + encodeURIComponent(movie.id), { append_to_response: "credits" });
      if (!activeModalMovie || Number(activeModalMovie.id) !== Number(movie.id)) return;
      const genres = (details.genres || []).map(item => item.name).slice(0, 4);
      $("modalGenres").innerHTML = genres.map(name => `<span>${esc(name)}</span>`).join("");
      const cast = (details.credits?.cast || []).slice(0, 4).map(person => person.name);
      $("modalCast").textContent = cast.length ? "CAST  ·  " + cast.join("  ·  ") : "";
      if (details.overview) $("modalOverview").textContent = details.overview;
    } catch (error) {
      $("modalGenres").textContent = "More details are temporarily unavailable.";
    }
  }
  function closeMovieDetails() {
    $("movieModal").classList.remove("open");
    $("movieModal").setAttribute("aria-hidden", "true");
    document.body.classList.remove("modal-open");
    activeModalMovie = null;
    if (modalReturnFocus && typeof modalReturnFocus.focus === "function") modalReturnFocus.focus();
  }
  function setupMovieActions(root) {
    root.addEventListener("click", event => {
      const detailsButton = event.target.closest("[data-details-id]");
      if (detailsButton) {
        event.preventDefault();
        event.stopPropagation();
        const movie = findMovie(detailsButton.dataset.detailsId);
        if (movie) openMovieDetails(movie, detailsButton);
        return;
      }
      const saveButton = event.target.closest("[data-save-id]");
      if (saveButton) {
        event.preventDefault();
        event.stopPropagation();
        const movie = findMovie(saveButton.dataset.saveId);
        if (movie) saveMovie(movie);
        return;
      }
      const shell = event.target.closest(".movie-shell");
      if (shell && !event.target.closest("a")) {
        const movie = findMovie(shell.dataset.movieId);
        if (movie) openMovieDetails(movie, event.target);
      }
    });
    root.addEventListener("contextmenu", event => {
      const shell = event.target.closest(".movie-shell");
      if (shell) {
        event.preventDefault();
        const movie = findMovie(shell.dataset.movieId);
        if (movie) openMovieDetails(movie, event.target);
      }
    });
  }

  async function fetchTmdb(endpoint, params = {}) {
    if (!TMDB_API_KEY || TMDB_API_KEY === "YOUR_TMDB_API_KEY_HERE") {
      throw new Error("Please add your TMDB API key in app.js.");
    }
    const url = new URL("https://api.themoviedb.org/3" + endpoint);
    url.searchParams.set("api_key", TMDB_API_KEY);
    url.searchParams.set("language", "en-US");
    Object.entries(params).forEach(([key, value]) => url.searchParams.set(key, value));
    const response = await fetch(url.toString());
    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.status_message || `TMDB API error (${response.status})`);
    }
    return response.json();
  }

  function discoverParams(category, page = 1) {
    const config = CATEGORIES[category];
    const today = new Date().toISOString().split("T")[0];
    const params = {
      include_adult: "false",
      include_video: "false",
      with_original_language: config.language,
      sort_by: "primary_release_date.desc",
      "release_date.lte": today,
      "vote_count.gte": category === "telugu" || category === "tamil" || category === "hindi" ? 1 : 10,
      page
    };
    if (config.country) params.with_origin_country = config.country;
    return params;
  }

  function showHero(index) {
    if (!heroItems.length) return;
    heroIndex = (index + heroItems.length) % heroItems.length;
    const movie = heroItems[heroIndex];
    $("heroTitle").textContent = movie.title;
    $("heroOverview").textContent = movie.overview || `${movie.year || ""} · Discover this movie on Navvora.`;
    const backdrop = movie.backdrop || movie.poster;
    $("heroBg").style.backgroundImage = backdrop ? `url("${backdrop.replace(/"/g, "%22")}")` : "";
    $("heroOpen").href = filePageLink(movie);
    if (movie.poster) {
      $("heroPoster").src = movie.poster;
      $("heroPoster").alt = movie.title + " Poster";
    }
    $("heroRating").textContent = "★ " + Number(movie.rating || 0).toFixed(1);
    $("heroDub").style.display = "none";
    $("heroMeta").innerHTML = `
      <span>★ ${Number(movie.rating || 0).toFixed(1)}</span>
      <span>${esc(movie.year || "N/A")}</span>
      <span>${esc((movie.language || "").toUpperCase())}</span>`;
    $("heroThumbs").innerHTML = heroItems.map((item, i) => `
      <button class="hero-thumb ${i === heroIndex ? "active" : ""}" aria-label="Show ${esc(item.title)}" data-dot="${i}" title="${esc(item.title)}">
        <img src="${esc(item.poster)}" alt="${esc(item.title)}">
      </button>`).join("");
    $("heroThumbs").querySelectorAll("button").forEach(button => {
      button.addEventListener("click", () => {
        showHero(Number(button.dataset.dot));
        restartHero();
      });
    });
  }

  function restartHero() {
    clearInterval(heroTimer);
    if (heroItems.length > 1) heroTimer = setInterval(() => showHero(heroIndex + 1), 5200);
  }

  function renderGrid() {
    const current = state[state.category];
    $("latestGrid").innerHTML = current.items.length
      ? current.items.map(card).join("")
      : current.loading
        ? '<div class="empty">Loading movies…</div>'
        : '<div class="empty">No movies found in this section right now.</div>';
    $("movieCount").textContent = current.items.length + " MOVIES";
    const button = $("loadMore");
    const hasMore = current.page < current.totalPages;
    button.disabled = current.loading || loadingMore || !current.loaded || !hasMore;
    button.innerHTML = current.loading
      ? '<span class="spinner"></span> LOADING MOVIES'
      : hasMore ? '<span class="arrow">＋</span> LOAD 7 MORE MOVIES' : "YOU’RE ALL CAUGHT UP ✓";
  }

  function updateTabs() {
    Object.keys(CATEGORIES).forEach(category => {
      const button = $("tab" + category[0].toUpperCase() + category.slice(1));
      const active = category === state.category;
      button.classList.toggle("active", active);
      button.setAttribute("aria-pressed", String(active));
    });
    $("sectionTitle").textContent = CATEGORIES[state.category].title;
  }

  async function loadCategory(category, reset = false) {
    const current = state[category];
    if (current.loading) return;
    if (!reset && current.loaded) return;
    current.loading = true;
    if (reset) {
      current.items = [];
      current.page = 1;
      current.totalPages = 1;
      current.seen.clear();
      current.loaded = false;
    }
    if (state.category === category) renderGrid();

    try {
      const data = await fetchTmdb("/discover/movie", discoverParams(category, 1));
      const rows = (data.results || [])
        .filter(row => row.id && row.poster_path)
        .map(siteMovieItem);
      current.items = rows;
      current.page = 1;
      current.totalPages = Number(data.total_pages || 1);
      rows.forEach(movie => current.seen.add(movie.id));
      current.loaded = true;
      if (state.category === category) renderGrid();
      return rows;
    } catch (error) {
      if (state.category === category) {
        $("latestGrid").innerHTML = `<div class="empty">${esc(error.message || "Could not load movies. Please try again.")}</div>`;
        $("loadMore").disabled = true;
      }
      console.error("Navvora category load failed:", category, error);
      return [];
    } finally {
      current.loading = false;
      if (state.category === category) renderGrid();
    }
  }

  async function switchCategory(category) {
    if (!CATEGORIES[category] || state.category === category) return;
    state.category = category;
    updateTabs();
    renderGrid();
    if (!state[category].loaded) await loadCategory(category);
  }

  async function loadFeatured() {
    // Start the default catalogue immediately; do not wait for the hero request.
    loadCategory(state.category);

    // One fresh TMDB request is enough to populate the Indian-cinema hero.
    try {
      const today = new Date().toISOString().split("T")[0];
      const recent = new Date();
      recent.setMonth(recent.getMonth() - 18);
      const fromDate = recent.toISOString().split("T")[0];
      const data = await fetchTmdb("/discover/movie", {
        include_adult: "false",
        include_video: "false",
        with_origin_country: "IN",
        "release_date.gte": fromDate,
        "release_date.lte": today,
        "vote_count.gte": "5",
        sort_by: "primary_release_date.desc",
        page: 1
      });

      const unique = new Map();
      (data.results || [])
        .filter(row => row.id && row.poster_path && row.original_language !== "en")
        .map(siteMovieItem)
        .forEach(movie => unique.set(movie.id, movie));

      heroItems = [...unique.values()]
        .sort((a, b) =>
          (b.release_date || "").localeCompare(a.release_date || "") ||
          b.popularity - a.popularity
        )
        .slice(0, 6);

      if (heroItems.length) {
        showHero(0);
        restartHero();
      }
    } catch (error) {
      console.error("Navvora Indian featured movies failed:", error);
      $("heroTitle").textContent = "Discover the latest Indian movies";
      $("heroOverview").textContent = "Featured movies are temporarily unavailable. Please refresh to try again.";
    }
  }

  async function loadMore() {
    if (loadingMore) return;
    const category = state.category;
    const current = state[category];
    if (!current.loaded || current.page >= current.totalPages) return;
    loadingMore = true;
    renderGrid();
    try {
      const nextPage = current.page + 1;
      const data = await fetchTmdb("/discover/movie", discoverParams(category, nextPage));
      const rows = (data.results || [])
        .filter(row => row.id && row.poster_path)
        .map(siteMovieItem);
      const fresh = rows.filter(movie => !current.seen.has(movie.id));
      fresh.forEach(movie => current.seen.add(movie.id));
      current.items.push(...fresh);
      current.page = nextPage;
      current.totalPages = Number(data.total_pages || current.totalPages);
    } catch (error) {
      console.error("Navvora load more failed:", error);
      $("loadMore").textContent = "RETRY · LOAD 7 MORE";
    } finally {
      loadingMore = false;
      if (state.category === category) renderGrid();
    }
  }

  async function search(query, source) {
    const isTop = source === "top";
    const stateEl = isTop ? $("topSearchState") : $("searchState");
    const sectionEl = isTop ? $("topSearchSection") : $("searchSection");
    const gridEl = isTop ? $("topSearchGrid") : $("searchGrid");
    if (query.length < 2) {
      sectionEl.classList.remove("show");
      stateEl.textContent = "";
      return;
    }
    stateEl.textContent = "…";
    try {
      const data = await fetchTmdb("/search/movie", { query, include_adult: "false", page: 1 });
      const results = (data.results || [])
        .filter(row => row.id && row.poster_path)
        .map(siteMovieItem);
      if (query !== (isTop ? $("topSearch").value.trim() : $("search").value.trim())) return;
      gridEl.innerHTML = results.length
        ? results.map(card).join("")
        : '<div class="empty">No matching movie found. Try another title.</div>';
      sectionEl.classList.add("show");
      stateEl.textContent = results.length ? results.length + " FOUND" : "";
    } catch (error) {
      gridEl.innerHTML = `<div class="empty">${esc(error.message || "Search unavailable")}</div>`;
      sectionEl.classList.add("show");
      stateEl.textContent = "";
    }
  }

  function setupSearchInput(input, source) {
    input.addEventListener("input", () => {
      clearTimeout(searchTimer);
      const query = input.value.trim();
      if (source === "top") $("search").value = query;
      else $("topSearch").value = query;
      searchTimer = setTimeout(() => search(query, source), 320);
    });
  }

  Object.keys(CATEGORIES).forEach(category => {
    const button = $("tab" + category[0].toUpperCase() + category.slice(1));
    button.addEventListener("click", () => switchCategory(category));
  });
  setupMovieActions($("latestGrid"));
  setupMovieActions($("topSearchGrid"));
  setupMovieActions($("searchGrid"));
  setupMovieActions($("watchlistGrid"));
  $("watchlistBtn").addEventListener("click", () => {
    const section = $("watchlistSection");
    section.hidden = !section.hidden;
    updateWatchlistUI();
    if (!section.hidden) section.scrollIntoView({ behavior: "smooth", block: "start" });
  });
  $("closeWatchlist").addEventListener("click", () => { $("watchlistSection").hidden = true; });
  $("surpriseBtn").addEventListener("click", () => {
    const items = state[state.category].items;
    if (!items.length) { $("latest").scrollIntoView({ behavior: "smooth" }); return; }
    const choice = items[Math.floor(Math.random() * items.length)];
    openMovieDetails(choice, $("surpriseBtn"));
  });
  $("modalClose").addEventListener("click", closeMovieDetails);
  $("movieModal").addEventListener("click", event => { if (event.target === $("movieModal")) closeMovieDetails(); });
  document.addEventListener("keydown", event => { if (event.key === "Escape" && $("movieModal").classList.contains("open")) closeMovieDetails(); });
  $("modalSave").addEventListener("click", () => { if (activeModalMovie) saveMovie(activeModalMovie); });
  updateWatchlistUI();

    $("loadMore").addEventListener("click", loadMore);
  setupSearchInput($("topSearch"), "top");
  setupSearchInput($("search"), "bottom");

  updateTabs();
  renderGrid();
  loadFeatured();
})();