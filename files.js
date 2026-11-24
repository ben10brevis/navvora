(() => {
  const API = "https://filebot-2wxx.onrender.com/api/files";
  const params = new URLSearchParams(location.search);
  const title = (params.get("title") || "").trim().slice(0, 120);
  const fallback = params.get("bot") || "https://t.me/navvorabot";
  const $ = id => document.getElementById(id);
  const safeBotUrl = value => {
    try {
      const url = new URL(value || fallback);
      return url.protocol === "https:" && url.hostname === "t.me" ? url.href : fallback;
    } catch { return fallback; }
  };
  const esc = value => String(value ?? "").replace(/[&<>"']/g, ch => ({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"
  }[ch]));
  const status = (message, mode = "loading") => {
    $("fileStatus").className = "file-status " + mode;
    $("fileStatus").innerHTML = (mode === "loading" ? '<span class="file-pulse"></span>' : "") + esc(message);
  };
  const formatSize = bytes => {
    const value = Number(bytes);
    if (!Number.isFinite(value) || value <= 0) return "Size unavailable";
    const units = ["B","KB","MB","GB","TB"];
    const index = Math.min(Math.floor(Math.log(value) / Math.log(1024)), units.length - 1);
    return (value / Math.pow(1024,index)).toFixed(index > 1 ? 2 : 1) + " " + units[index];
  };
  const render = items => {
    $("editionCount").textContent = items.length + (items.length === 1 ? " EDITION" : " EDITIONS");
    $("fileIntro").textContent = "We found these indexed editions. Pick the quality or version you want to open in Telegram.";
    status("CATALOGUE MATCHES FOUND","success");
    $("editionList").innerHTML = items.map((item,index) => {
      const tags = [
        item.quality || "QUALITY NOT LABELLED",
        ...(Array.isArray(item.languages) ? item.languages.slice(0,3).map(x => String(x).toUpperCase()) : []),
        item.season ? "S" + String(item.season).padStart(2,"0") + (item.episode ? " · E" + String(item.episode).padStart(2,"0") : "") : "",
        Number(item.file_count || 0) > 1 ? item.file_count + " FILES" : ""
      ].filter(Boolean);
      const link = safeBotUrl(item.bot_url);
      const count = Math.max(1, Number(item.file_count || 1));
      return `
        <article class="edition-card" style="--card-order:${index}">
          <div class="edition-index">${String(index + 1).padStart(2,"0")}</div>
          <div class="edition-info">
            <h3>${esc(item.title || item.index_title || title)}</h3>
            <p>${esc(item.index_title || "Navvora indexed edition")}</p>
            <div class="edition-tags">${tags.map(tag => `<span>${esc(tag)}</span>`).join("")}</div>
          </div>
          <div class="edition-facts">
            <strong>${esc(item.size || formatSize(item.size_bytes))}</strong>
            <span>${count} ${count === 1 ? "ITEM" : "ITEMS"}</span>
            <a href="${esc(link)}" target="_blank" rel="noopener noreferrer">OPEN IN TELEGRAM <span>↗</span></a>
          </div>
        </article>`;
    }).join("");
  };
  async function loadArtwork(query) {
    try {
      const res = await fetch("https://api.themoviedb.org/3/search/movie?api_key=032bb4acd80291322ea323660fde75bf&query=" + encodeURIComponent(query));
      if (!res.ok) return;
      const data = await res.json();
      const match = (data.results || []).find(x => x.poster_path) || (data.results || [])[0];
      if (!match) return;
      if (match.poster_path) {
        $("filePoster").src = "https://image.tmdb.org/t/p/w500" + match.poster_path;
        $("filePoster").style.display = "block";
      }
      if (match.backdrop_path) $("fileBackdrop").style.backgroundImage = 'url("https://image.tmdb.org/t/p/w1280' + match.backdrop_path + '")';
      if (match.release_date) $("fileIntro").textContent = "Movie editions · " + match.release_date.slice(0,4) + " · Choose an edition to continue to Telegram.";
    } catch (_) {}
  }
  const openBot = () => { location.replace(safeBotUrl(fallback)); };
  async function init() {
    if (!title) { $("movieTitle").textContent = "Movie not specified"; $("fileIntro").textContent = "Go back and choose a title from the catalogue."; status("NO TITLE SELECTED","error"); $("editionCount").textContent = "0"; $("editionList").innerHTML = ""; return; }
    $("movieTitle").textContent = title;
    document.title = title + " · Navvora";
    loadArtwork(title);
    try {
      const response = await fetch(API + "?q=" + encodeURIComponent(title), { cache: "no-store" });
      if (!response.ok) throw new Error("Catalogue temporarily unavailable");
      const data = await response.json();
      const items = Array.isArray(data.items) ? data.items : [];
      if (!items.length) { status("NO EDITION IN CATALOGUE · OPENING BOT SEARCH","empty"); openBot(); return; }
      render(items);
    } catch (error) {
      status("CATALOGUE UNAVAILABLE · OPENING BOT SEARCH","error");
      openBot();
    }
  }
  init();
})();