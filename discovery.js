(() => {
  "use strict";
  const KEY = "032bb4acd80291322ea323660fde75bf";
  const RECENT_KEY = "navvora_recent_v1";
  const $ = id => document.getElementById(id);
  const esc = v => String(v ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  async function api(path, params = {}) {
    const url = new URL("https://api.themoviedb.org/3" + path);
    url.searchParams.set("api_key", KEY); url.searchParams.set("language", "en-US");
    Object.entries(params).forEach(([k,v]) => { if (v !== "" && v != null) url.searchParams.set(k, String(v)); });
    const res = await fetch(url, {headers:{Accept:"application/json"}});
    if (!res.ok) throw new Error("TMDB request failed (" + res.status + ")");
    return res.json();
  }
  const normalize = x => ({id:Number(x.id),title:x.title || x.name || "Untitled",year:String(x.release_date || x.first_air_date || "").slice(0,4),language:String(x.original_language || "").toLowerCase(),rating:Number(x.vote_average || 0),poster:x.poster || (x.poster_path ? "https://image.tmdb.org/t/p/w500" + x.poster_path : ""),backdrop:x.backdrop || (x.backdrop_path ? "https://image.tmdb.org/t/p/w1280" + x.backdrop_path : "")});
  const href = m => "files.html?" + new URLSearchParams({title:m.title || ""});
  function card(m) {
    m = normalize(m);
    return '<article class="movie-shell discovery-card" data-movie-id="' + m.id + '"><a class="movie" href="' + esc(href(m)) + '"><div class="poster">' +
      (m.poster ? '<img loading="lazy" decoding="async" src="' + esc(m.poster) + '" alt="' + esc(m.title) + ' poster" onerror="this.hidden=true">' : '<div class="fallback">' + esc(m.title) + '</div>') +
      (m.rating ? '<span class="rating">★ ' + m.rating.toFixed(1) + '</span>' : '') + '<span class="poster-hint">EXPLORE</span></div><h3>' + esc(m.title) + '</h3><p class="meta">' + esc(m.year || "Year N/A") + ' · ' + esc(m.language.toUpperCase()) + '</p></a></article>';
  }
  function render(id, rows, empty) {
    const root = $(id); if (!root) return [];
    const seen = new Set(); const items = (rows || []).filter(x => x && x.id && !seen.has(Number(x.id)) && seen.add(Number(x.id))).slice(0,8);
    root.innerHTML = items.length ? items.map(card).join("") : '<div class="empty">' + esc(empty || "No titles found.") + '</div>';
    return items;
  }
  async function rail(id,path,params,empty) {
    try { const data = await api(path,params); render(id,data.results,empty); }
    catch (e) { render(id,[], "This collection is temporarily unavailable."); console.warn("Navvora discovery rail",id,e); }
  }
  function getRecent() { try { return JSON.parse(localStorage.getItem(RECENT_KEY) || "[]"); } catch { return []; } }
  function showRecent() {
    const items = getRecent(); const section = $("recentSection");
    if (!section) return;
    section.hidden = !items.length;
    $("recentGrid").innerHTML = items.map(card).join("");
  }
  function trackRecent() {
    document.addEventListener("click", e => {
      const link = e.target.closest(".movie-shell a.movie"); if (!link) return;
      const shell = link.closest(".movie-shell"), id = Number(shell?.dataset.movieId || 0);
      const title = link.querySelector("h3")?.textContent?.trim(); if (!id || !title) return;
      const poster = link.querySelector(".poster img")?.src || "";
      const meta = link.querySelector(".meta")?.textContent || "";
      const item = {id,title,poster,year:meta.split("·")[0]?.trim() || "",language:meta.split("·")[1]?.trim().toLowerCase() || ""};
      localStorage.setItem(RECENT_KEY,JSON.stringify([item,...getRecent().filter(x => Number(x.id) !== id)].slice(0,10)));
    },true);
  }
  async function recommendations() {
    const recent = getRecent(); const root = $("recommendedGrid"); const section = $("recommendedSection");
    if (!recent.length || !root) { if (section) section.hidden = true; return; }
    if (section) section.hidden = false;
    try {
      const data = await api("/movie/" + Number(recent[0].id) + "/recommendations");
      render("recommendedGrid",data.results.filter(x => x.poster_path),"No recommendations are available yet.");
    } catch { render("recommendedGrid",[],"Recommendations are temporarily unavailable."); }
  }
  async function filters(e) {
    e.preventDefault(); const root = $("filterResults");
    root.innerHTML = '<div class="empty">Searching the catalogue…</div>';
    const year = $("filterYear").value.trim();
    if (year && (!/^\\d{4}$/.test(year) || Number(year) < 1900 || Number(year) > 2100)) { root.innerHTML = '<div class="empty">Enter a valid four-digit year.</div>'; return; }
    const p = {include_adult:"false",sort_by:$("filterSort").value,page:1};
    if ($("filterLanguage").value) p.with_original_language = $("filterLanguage").value;
    if ($("filterGenre").value) p.with_genres = $("filterGenre").value;
    if (year) p.primary_release_year = year;
    try { const data = await api("/discover/movie",p); render("filterResults",data.results,"No movies match these filters."); }
    catch { root.innerHTML = '<div class="empty">Search is temporarily unavailable. Please try again.</div>'; }
  }
  async function modalExtras() {
    const modal = $("movieModal"), extras = $("modalExtras");
    if (!modal || !extras || !window.MutationObserver) return;
    let active = 0;
    document.addEventListener("click",e => { const b = e.target.closest("[data-details-id]"); if (b) active = Number(b.dataset.detailsId || 0); },true);
    new MutationObserver(() => {
      if (!modal.classList.contains("open") || !active || Number(extras.dataset.id) === active) return;
      extras.dataset.id = String(active); extras.innerHTML = '<p class="extras-note">Loading cast, trailer and similar movies…</p>';
      api("/movie/" + active,{append_to_response:"credits,videos,recommendations,watch/providers"}).then(d => {
        const director = (d.credits?.crew || []).find(p => p.job === "Director");
        const cast = (d.credits?.cast || []).slice(0,6);
        const trailer = (d.videos?.results || []).find(v => v.site === "YouTube" && v.type === "Trailer" && v.key);
        const similar = (d.recommendations?.results || []).filter(x => x.poster_path).slice(0,4);
        const providers = d["watch/providers"]?.results?.IN;
        const providerNames = [...(providers?.flatrate || []),...(providers?.rent || []),...(providers?.buy || [])].filter((p,i,a) => a.findIndex(x => x.provider_id === p.provider_id) === i).map(p => p.provider_name);
        extras.innerHTML = (director ? '<p class="extras-note"><b>DIRECTOR</b> · ' + esc(director.name) + '</p>' : '') +
          (cast.length ? '<h3 class="extras-title">Cast</h3><div class="cast-rail">' + cast.map(p => '<div class="cast-person">' + (p.profile_path ? '<img loading="lazy" src="https://image.tmdb.org/t/p/w185' + esc(p.profile_path) + '" alt="' + esc(p.name) + '">' : '<span class="cast-placeholder">NV</span>') + '<b>' + esc(p.name) + '</b><small>' + esc(p.character || "Cast") + '</small></div>').join("") + '</div>' : '') +
          (trailer ? '<p class="trailer-row"><a class="cta secondary" href="https://www.youtube.com/watch?v=' + encodeURIComponent(trailer.key) + '" target="_blank" rel="noopener noreferrer">▶ WATCH TRAILER</a></p>' : '<p class="extras-note">No official trailer is listed.</p>') +
          (providerNames.length ? '<p class="provider-line"><b>WHERE TO WATCH IN INDIA</b><br>' + providerNames.map(esc).join(" · ") + '</p>' : '<p class="extras-note">Streaming provider data is not listed for India.</p>') +
          (similar.length ? '<h3 class="extras-title">You May Also Like</h3><div class="grid discovery-grid modal-recommendations">' + similar.map(card).join("") + '</div>' : '');
      }).catch(() => { extras.innerHTML = '<p class="extras-note">Extra movie details are temporarily unavailable.</p>'; });
    }).observe(modal,{attributes:true,attributeFilter:["class"]});
  }
  function backupControls() {
    const head = $("watchlistSection")?.querySelector(".section-head");
    if (!head || $("watchlistBackupTools")) return;
    const tools = document.createElement("div"); tools.id = "watchlistBackupTools"; tools.className = "watchlist-tools";
    tools.innerHTML = '<button class="text-action" id="exportWatchlist" type="button">EXPORT BACKUP</button><label class="text-action import-watchlist" for="importWatchlist">IMPORT BACKUP</label><input id="importWatchlist" type="file" accept="application/json,.json" hidden>';
    head.appendChild(tools);
    $("exportWatchlist").addEventListener("click",() => {
      let items=[]; try { items=JSON.parse(localStorage.getItem("navvora_watchlist_v1") || "[]"); } catch {}
      const url=URL.createObjectURL(new Blob([JSON.stringify({version:1,items},null,2)],{type:"application/json"}));
      const a=document.createElement("a"); a.href=url; a.download="navvora-watchlist-backup.json"; a.click(); URL.revokeObjectURL(url);
    });
    $("importWatchlist").addEventListener("change",async () => {
      const file=$("importWatchlist").files?.[0]; if(!file) return;
      try { const data=JSON.parse(await file.text()), items=Array.isArray(data)?data:data.items;
        if(!Array.isArray(items)) throw new Error("Invalid backup");
        const clean=items.filter(x=>x && Number(x.id)>0 && typeof x.title==="string").slice(0,100);
        localStorage.setItem("navvora_watchlist_v1",JSON.stringify(clean)); location.reload();
      } catch { alert("Could not import this watchlist backup."); }
    });
  }
  function init() {
    showRecent(); trackRecent(); modalExtras(); backupControls();
    $("clearRecent")?.addEventListener("click",() => { localStorage.removeItem(RECENT_KEY); showRecent(); $("recommendedGrid").innerHTML=""; });
    $("movieFilterForm")?.addEventListener("submit",filters);
    rail("trendingGrid","/trending/movie/week",{page:1});
    rail("actionGrid","/discover/movie",{include_adult:"false",with_origin_country:"IN",with_genres:28,sort_by:"popularity.desc",vote_count_gte:20,page:1});
    rail("familyGrid","/discover/movie",{include_adult:"false",with_origin_country:"IN",with_genres:10751,sort_by:"popularity.desc",vote_count_gte:10,page:1});
    rail("topRatedIndiaGrid","/discover/movie",{include_adult:"false",with_origin_country:"IN",sort_by:"vote_average.desc",vote_average_gte:7,vote_count_gte:100,page:1});
    rail("upcomingGrid","/movie/upcoming",{region:"IN",page:1});
    recommendations();
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded",init,{once:true}); else init();
})();