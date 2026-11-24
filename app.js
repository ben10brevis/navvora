/**
 * NAVVORA CINEMA — multilingual TMDB catalogue
 * Categories use each movie's original language:
 * Telugu (te), Tamil (ta), Hindi (hi), Hollywood/English (en).
 */
const TMDB_API_KEY = "032bb4acd80291322ea323660fde75bf";
const BOT_USERNAME = "navvorabot";

(() => {
  const $ = id => document.getElementById(id);
  const CATEGORIES = {
    telugu: { label: "Telugu", language: "te", title: "Latest Telugu Movies", country: "IN" },
    tamil: { label: "Tamil", language: "ta", title: "Latest Tamil Movies", country: "IN" },
    hindi: { label: "Hindi", language: "hi", title: "Latest Hindi Movies", country: "IN" },
    hollywood: { label: "Hollywood", language: "en", title: "Latest Hollywood Movies" }
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
    const img = movie.poster
      ? `<img loading="lazy" src="${esc(movie.poster)}" alt="${esc(movie.title)} poster" onerror="this.outerHTML='<div class=&quot;fallback&quot;>${esc(movie.title)}</div>'">`
      : `<div class="fallback">${esc(movie.title)}</div>`;
    return `
      <a class="movie" href="${botLink(movie)}" target="_blank" rel="noopener noreferrer" title="Find ${esc(movie.title)} in Navvora">
        <div class="poster">
          ${img}
          <span class="rating">★ ${Number(movie.rating || 0).toFixed(1)}</span>
        </div>
        <h3>${esc(movie.title)}</h3>
        <p class="meta">${esc(movie.year || "Year N/A")} · ${esc((movie.language || "").toUpperCase())}</p>
      </a>`;
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
    $("heroOpen").href = botLink(movie);
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
    // Keep the hero focused on Indian cinema only (never Hollywood/US titles).
    // This query refreshes from TMDB whenever the page is opened.
    try {
      const today = new Date().toISOString().split("T")[0];
      const recent = new Date();
      recent.setMonth(recent.getMonth() - 18);
      const fromDate = recent.toISOString().split("T")[0];
      const pages = await Promise.all([1, 2, 3].map(page =>
        fetchTmdb("/discover/movie", {
          include_adult: "false",
          include_video: "false",
          with_origin_country: "IN",
          "release_date.gte": fromDate,
          "release_date.lte": today,
          "vote_count.gte": "5",
          sort_by: "primary_release_date.desc",
          page
        })
      ));
      const unique = new Map();
      pages.flatMap(data => data.results || [])
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

    // Load all four catalogue sections independently of the Indian-only hero.
    Object.keys(CATEGORIES).forEach(category => loadCategory(category));
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
  $("loadMore").addEventListener("click", loadMore);
  setupSearchInput($("topSearch"), "top");
  setupSearchInput($("search"), "bottom");

  updateTabs();
  renderGrid();
  loadFeatured();
})();