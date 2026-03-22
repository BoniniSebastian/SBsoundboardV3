const OWNER = "BoniniSebastian";
const REPO = "SBsoundboardV3";

const GOAL_COMBO_DELAY_MS = 1200;
const PLAY_FADE_IN_MS = 300;
const PAUSE_FADE_OUT_MS = 900;
const STOP_FADE_OUT_MS = 340;

const STORAGE_KEYS = {
  preload: "sb_v8_preload_track",
  favorites: "sb_v8_avbrott_favorites",
  cache: "sb_v8_library_cache"
};

const MAIN_CATEGORIES = [
  {
    key: "mal",
    label: "MÅL",
    folder: "sounds/mal",
    allowRandom: true,
    allowLoad: true,
    allowFavorite: false,
    shortcut: "M"
  },
  {
    key: "utvisning",
    label: "UTVISNING",
    folder: "sounds/utvisning",
    allowRandom: true,
    allowLoad: true,
    allowFavorite: false,
    shortcut: "U"
  },
  {
    key: "avbrott",
    label: "AVBROTT",
    folder: "sounds/avbrott",
    allowRandom: true,
    allowLoad: true,
    allowFavorite: true,
    shortcut: "A"
  },
  {
    key: "tuta",
    label: "SOUNDS",
    folder: "sounds/tuta",
    allowRandom: true,
    allowLoad: true,
    allowFavorite: false,
    shortcut: "S"
  }
];

const AUDIO_EXT = ["mp3", "m4a", "wav", "ogg", "aac"];

const state = {
  library: new Map(),
  preloadTrack: null,
  avbrottFavorites: new Set(),
  musicAudio: null,
  musicTrack: null,
  musicFadeRaf: null,
  hornAudios: [],
  comboTimeout: null,
  uiInterval: null,
  goalHornCache: null,
  lastRandomByCategory: new Map()
};

const malList = document.getElementById("malList");
const utvisningList = document.getElementById("utvisningList");
const avbrottList = document.getElementById("avbrottList");
const soundsList = document.getElementById("soundsList");

const malRandomBtn = document.getElementById("malRandomBtn");
const utvisningRandomBtn = document.getElementById("utvisningRandomBtn");
const avbrottRandomBtn = document.getElementById("avbrottRandomBtn");
const soundsRandomBtn = document.getElementById("soundsRandomBtn");

const nowPlayingTitle = document.getElementById("nowPlayingTitle");
const circleTime = document.getElementById("circleTime");
const circleMeta = document.getElementById("circleMeta");
const circleIcon = document.getElementById("circleIcon");
const playerStatePill = document.getElementById("playerStatePill");
const visualizer = document.getElementById("visualizer");
const centerPlayPauseBtn = document.getElementById("centerPlayPauseBtn");
const resumeBtn = document.getElementById("resumeBtn");
const pauseBtn = document.getElementById("pauseBtn");
const stopBtn = document.getElementById("stopBtn");
const resetBtn = document.getElementById("resetBtn");
const goalHornBtn = document.getElementById("goalHornBtn");
const goalComboBtn = document.getElementById("goalComboBtn");
const clearPreloadBtn = document.getElementById("clearPreloadBtn");
const preloadTitleText = document.getElementById("preloadTitleText");
const preloadBadge = document.getElementById("preloadBadge");
const playerWheelBtn = document.getElementById("centerPlayPauseBtn");

init().catch(console.error);

async function init() {
  restoreLocalState();
  restoreLibraryCache();
  bindControls();
  renderAllSections();
  renderPreload();
  syncPlayerUI();
  startUiTicker();
  await loadAllFolders();
  renderAllSections();
}

function restoreLocalState() {
  try {
    const rawPreload = localStorage.getItem(STORAGE_KEYS.preload);
    if (rawPreload) state.preloadTrack = JSON.parse(rawPreload);
  } catch {}

  try {
    const rawFavs = localStorage.getItem(STORAGE_KEYS.favorites);
    if (rawFavs) state.avbrottFavorites = new Set(JSON.parse(rawFavs) || []);
  } catch {}
}

function persistPreload() {
  try {
    if (!state.preloadTrack) {
      localStorage.removeItem(STORAGE_KEYS.preload);
      return;
    }
    localStorage.setItem(STORAGE_KEYS.preload, JSON.stringify(state.preloadTrack));
  } catch {}
}

function persistFavorites() {
  try {
    localStorage.setItem(STORAGE_KEYS.favorites, JSON.stringify(Array.from(state.avbrottFavorites)));
  } catch {}
}

function restoreLibraryCache() {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.cache);
    if (!raw) return;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return;
    for (const [key, files] of Object.entries(parsed)) {
      if (Array.isArray(files)) {
        state.library.set(key, files);
      }
    }
  } catch {}
}

function persistLibraryCache() {
  try {
    const out = {};
    for (const [key, files] of state.library.entries()) out[key] = files;
    localStorage.setItem(STORAGE_KEYS.cache, JSON.stringify(out));
  } catch {}
}

async function loadAllFolders() {
  await Promise.all(MAIN_CATEGORIES.map(cat => loadFolder(cat)));
  await loadGoalHornCache();
  persistLibraryCache();
}

async function loadFolder(category) {
  const apiUrl = `https://api.github.com/repos/${OWNER}/${REPO}/contents/${category.folder}?t=${Date.now()}`;

  try {
    const res = await fetch(apiUrl, { cache: "no-store" });
    if (!res.ok) throw new Error(`GitHub API fel: ${res.status} (${category.folder})`);

    const items = await res.json();
    const files = (items || [])
      .filter(item => item?.type === "file" && isAudio(item.name))
      .sort((a, b) => (a.name || "").localeCompare(b.name || "", "sv"))
      .map((file, index) => ({
        id: `${category.key}:${file.name}:${index}`,
        name: pretty(file.name),
        rawName: file.name,
        url: file.download_url,
        folder: category.folder,
        categoryKey: category.key,
        categoryLabel: category.label
      }));

    if (files.length) {
      state.library.set(category.key, files);
    } else if (!state.library.has(category.key)) {
      state.library.set(category.key, []);
    }
  } catch (err) {
    console.error(err);
    if (!state.library.has(category.key)) {
      state.library.set(category.key, []);
    }
  }
}

async function loadGoalHornCache() {
  const apiFolder = "sounds/goalhorn";
  const url = `https://api.github.com/repos/${OWNER}/${REPO}/contents/${apiFolder}?t=${Date.now()}`;

  try {
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) return;
    const items = await res.json();
    const files = (items || []).filter(item => item?.type === "file" && isAudio(item.name));
    if (!files.length) return;

    state.goalHornCache = {
      name: pretty(files[0].name),
      url: files[0].download_url
    };
  } catch {}
}

function bindControls() {
  centerPlayPauseBtn.onclick = () => toggleMusicPauseResume();
  resumeBtn.onclick = () => resumeMusic();
  pauseBtn.onclick = () => pauseMusic();
  stopBtn.onclick = () => stopAll();
  resetBtn.onclick = () => resetStoredState();

  goalHornBtn.onclick = () => playGoalHorn();
  goalComboBtn.onclick = () => playGoalCombo();
  clearPreloadBtn.onclick = () => clearPreload();

  malRandomBtn.onclick = () => playRandomFromCategory("mal");
  utvisningRandomBtn.onclick = () => playRandomFromCategory("utvisning");
  avbrottRandomBtn.onclick = () => playRandomFromCategory("avbrott");
  soundsRandomBtn.onclick = () => playRandomFromCategory("tuta");

const randomMalBtn = document.getElementById("randomMalBtn");
const randomAvbrottBtn = document.getElementById("randomAvbrottBtn");
const randomUtvisningBtn = document.getElementById("randomUtvisningBtn");

if(randomMalBtn){
  randomMalBtn.onclick = () => playRandomFromCategory("mal");
}

if(randomAvbrottBtn){
  randomAvbrottBtn.onclick = () => playRandomFromCategory("avbrott");
}

if(randomUtvisningBtn){
  randomUtvisningBtn.onclick = () => playRandomFromCategory("utvisning");
}

  document.addEventListener("keydown", (e) => {
    const key = e.key.toLowerCase();

    if (key === " " || key === "spacebar") {
      e.preventDefault();
      toggleMusicPauseResume();
      return;
    }

    if (key === "escape") {
      stopAll();
      return;
    }

    if (key === "g") {
      playGoalHorn();
      return;
    }

    if (key === "c") {
      playGoalCombo();
      return;
    }

    if (key === "a") {
      playRandomFromCategory("avbrott");
      return;
    }

    if (key === "u") {
      playRandomFromCategory("utvisning");
      return;
    }

    if (key === "m") {
      playRandomFromCategory("mal");
      return;
    }

    if (key === "s") {
      playRandomFromCategory("tuta");
    }
  });
}

function renderAllSections() {
  renderCategoryToList("mal", malList, { allowLoad: true, allowFavorite: false });
  renderCategoryToList("utvisning", utvisningList, { allowLoad: true, allowFavorite: false });
  renderCategoryToList("avbrott", avbrottList, { allowLoad: true, allowFavorite: true });
  renderCategoryToList("tuta", soundsList, { allowLoad: true, allowFavorite: false });
  markPlayingCards();
}

function renderCategoryToList(categoryKey, listElement, options) {
  const files = [...(state.library.get(categoryKey) || [])];

  if (!files.length) {
    listElement.innerHTML = `<div class="emptyState">Inga ljud hittades.</div>`;
    return;
  }

  let ordered = files;
  if (categoryKey === "avbrott") {
    const favs = files.filter(file => state.avbrottFavorites.has(file.id));
    const rest = files.filter(file => !state.avbrottFavorites.has(file.id));
    ordered = [...favs, ...rest];
  }

  listElement.innerHTML = "";
  for (const file of ordered) {
    listElement.appendChild(createTrackCard(file, options.allowLoad, options.allowFavorite));
  }
}

function createTrackCard(file, allowLoad, allowFavorite) {
  const card = document.createElement("div");
  card.className = "trackCard";
  if (allowFavorite) card.classList.add("has-fav");
  card.dataset.trackId = file.id;

  const playBtn = document.createElement("button");
  playBtn.type = "button";
  playBtn.className = "trackPlayBtn";
  playBtn.onclick = () => playTrack(file, { fadeIn: true });
  playBtn.innerHTML = `<div class="trackName">${escapeHtml(file.name)}</div>`;

  const actions = document.createElement("div");
  actions.className = "trackActions";

  if (allowLoad) {
    const loadBtn = document.createElement("button");
    loadBtn.type = "button";
    loadBtn.className = "trackLoadBtn";
    loadBtn.title = "Ladda till preload";
    loadBtn.textContent = "+";
    loadBtn.onclick = (e) => {
      e.stopPropagation();
      setPreload(file);
    };
    actions.appendChild(loadBtn);
  }

  if (allowFavorite) {
    const favBtn = document.createElement("button");
    favBtn.type = "button";
    favBtn.className = "trackFavBtn";
    favBtn.title = "Favoritmarkera";
    favBtn.textContent = "★";
    if (state.avbrottFavorites.has(file.id)) favBtn.classList.add("active");
    favBtn.onclick = (e) => {
      e.stopPropagation();
      toggleFavorite(file);
    };
    actions.appendChild(favBtn);
  }

  card.appendChild(playBtn);
  if (actions.childElementCount) card.appendChild(actions);

  return card;
}

function setPreload(track) {
  state.preloadTrack = {
    id: track.id,
    name: track.name,
    url: track.url,
    folder: track.folder,
    categoryKey: track.categoryKey,
    categoryLabel: track.categoryLabel
  };
  persistPreload();
  renderPreload();
}

function clearPreload() {
  state.preloadTrack = null;
  persistPreload();
  renderPreload();
}

function renderPreload() {
  if (!state.preloadTrack) {
    preloadTitleText.textContent = "Ingen låt laddad";
    preloadBadge.textContent = "Tom";
    preloadBadge.classList.remove("ready");
    return;
  }

  preloadTitleText.textContent = state.preloadTrack.name;
  preloadBadge.textContent = "Redo";
  preloadBadge.classList.add("ready");
}

function toggleFavorite(track) {
  if (state.avbrottFavorites.has(track.id)) {
    state.avbrottFavorites.delete(track.id);
  } else {
    state.avbrottFavorites.add(track.id);
  }
  persistFavorites();
  renderCategoryToList("avbrott", avbrottList, { allowLoad: true, allowFavorite: true });
  markPlayingCards();
}

function weightedPickFromList(categoryKey, list) {
  if (!list.length) return null;

  const lastId = state.lastRandomByCategory.get(categoryKey);

  let working = list.filter(item => item.id !== lastId);
  if (!working.length) working = [...list];

  if (categoryKey === "avbrott") {
    const favs = working.filter(item => state.avbrottFavorites.has(item.id));
    const nonFavs = working.filter(item => !state.avbrottFavorites.has(item.id));

    if (favs.length && nonFavs.length) {
      const favoredChance = 0.7;
      working = Math.random() < favoredChance ? favs : nonFavs;
    } else if (favs.length) {
      working = favs;
    }
  }

  const pick = working[Math.floor(Math.random() * working.length)];
  if (pick) state.lastRandomByCategory.set(categoryKey, pick.id);
  return pick;
}

function playRandomFromCategory(categoryKey) {
  const tracks = state.library.get(categoryKey) || [];
  const pick = weightedPickFromList(categoryKey, tracks);
  if (!pick) return;
  playTrack(pick, { fadeIn: true });
}

function playGoalHorn() {
  if (!state.goalHornCache?.url) {
    alert('Ingen goalhorn-fil hittades i "sounds/goalhorn".');
    return;
  }

  const audio = new Audio(state.goalHornCache.url);
  audio.preload = "auto";
  state.hornAudios.push(audio);

  audio.play().catch(() => {});

  audio.onended = () => {
    state.hornAudios = state.hornAudios.filter(a => a !== audio);
  };
}

function playGoalCombo() {
  if (!state.preloadTrack) {
    playGoalHorn();
    return;
  }

  playGoalHorn();

  clearTimeout(state.comboTimeout);
  state.comboTimeout = setTimeout(() => {
    playTrack(state.preloadTrack, { fadeIn: false });
  }, GOAL_COMBO_DELAY_MS);
}

function playTrack(track, options = {}) {
  const { fadeIn = true } = options;
  if (!track || !track.url) return;

  clearTimeout(state.comboTimeout);

  const sameTrack =
    state.musicTrack &&
    state.musicTrack.id === track.id &&
    state.musicAudio &&
    !state.musicAudio.ended;

  if (sameTrack) {
    if (state.musicAudio.paused) {
      resumeMusic();
    } else {
      pauseMusic();
    }
    return;
  }

  const nextAudio = new Audio(track.url);
  nextAudio.preload = "auto";
  nextAudio.onended = () => {
    if (state.musicAudio === nextAudio) {
      state.musicAudio = null;
      state.musicTrack = null;
      syncPlayerUI();
      markPlayingCards();
    }
  };

  const startNext = () => {
    state.musicAudio = nextAudio;
    state.musicTrack = track;

    if (fadeIn) {
      fadeInAudio(nextAudio, PLAY_FADE_IN_MS, 1)
        .then(() => syncPlayerUI())
        .catch(() => syncPlayerUI());
    } else {
      nextAudio.volume = 1;
      nextAudio.play().catch(() => {});
      syncPlayerUI();
    }

    markPlayingCards();
  };

  if (!state.musicAudio) {
    startNext();
    return;
  }

  fadeStopAudio(state.musicAudio, STOP_FADE_OUT_MS, () => {
    startNext();
  });
}

function toggleMusicPauseResume() {
  if (!state.musicAudio) return;
  if (state.musicAudio.paused) {
    resumeMusic();
  } else {
    pauseMusic();
  }
}

function resumeMusic() {
  if (!state.musicAudio) return;
  cancelMusicFade();
  fadeInAudio(state.musicAudio, PLAY_FADE_IN_MS, 1)
    .then(() => syncPlayerUI())
    .catch(() => syncPlayerUI());
}

function pauseMusic() {
  if (!state.musicAudio || state.musicAudio.paused) return;
  fadePauseAudio(state.musicAudio, PAUSE_FADE_OUT_MS, () => {
    syncPlayerUI();
  });
  syncPlayerUI();
}

function stopMusic() {
  if (!state.musicAudio) return;
  fadeStopAudio(state.musicAudio, STOP_FADE_OUT_MS, () => {
    state.musicAudio = null;
    state.musicTrack = null;
    syncPlayerUI();
    markPlayingCards();
  });
  syncPlayerUI();
}

function stopAll() {
  clearTimeout(state.comboTimeout);
  stopAllHorns();
  stopMusic();
}

function stopAllHorns() {
  for (const audio of state.hornAudios) {
    try { audio.pause(); } catch {}
    try { audio.currentTime = 0; } catch {}
  }
  state.hornAudios = [];
}

function resetStoredState() {
  state.preloadTrack = null;
  state.avbrottFavorites.clear();
  state.lastRandomByCategory.clear();
  persistPreload();
  persistFavorites();
  renderPreload();
  renderCategoryToList("avbrott", avbrottList, { allowLoad: true, allowFavorite: true });
  markPlayingCards();
}

function cancelMusicFade() {
  if (state.musicFadeRaf) {
    cancelAnimationFrame(state.musicFadeRaf);
    state.musicFadeRaf = null;
  }
}

function safeSetVolume(audio, volume) {
  try {
    audio.volume = Math.max(0, Math.min(1, volume));
    return true;
  } catch {
    return false;
  }
}

function fadeInAudio(audio, ms, targetVolume = 1) {
  cancelMusicFade();

  return new Promise((resolve) => {
    const start = performance.now();
    safeSetVolume(audio, 0);
    audio.play().catch(() => resolve());

    function step(now) {
      const t = Math.min(1, (now - start) / ms);
      const volume = targetVolume * t;
      const ok = safeSetVolume(audio, volume);

      if (!ok) {
        state.musicFadeRaf = null;
        resolve();
        return;
      }

      if (t < 1) {
        state.musicFadeRaf = requestAnimationFrame(step);
      } else {
        state.musicFadeRaf = null;
        safeSetVolume(audio, targetVolume);
        resolve();
      }
    }

    state.musicFadeRaf = requestAnimationFrame(step);
  });
}

function fadePauseAudio(audio, ms, done) {
  if (!audio || audio.paused) {
    done?.();
    return;
  }

  const startVol = typeof audio.volume === "number" ? audio.volume : 1;
  cancelMusicFade();
  const start = performance.now();

  function step(now) {
    const t = Math.min(1, (now - start) / ms);
    const volume = startVol * (1 - t);
    const ok = safeSetVolume(audio, volume);

    if (!ok) {
      state.musicFadeRaf = null;
      try { audio.pause(); } catch {}
      safeSetVolume(audio, startVol);
      done?.();
      return;
    }

    if (t < 1) {
      state.musicFadeRaf = requestAnimationFrame(step);
    } else {
      state.musicFadeRaf = null;
      try { audio.pause(); } catch {}
      safeSetVolume(audio, startVol);
      done?.();
    }
  }

  state.musicFadeRaf = requestAnimationFrame(step);
}

function fadeStopAudio(audio, ms, done) {
  if (!audio) {
    done?.();
    return;
  }

  const finalize = () => {
    try { audio.pause(); } catch {}
    try { audio.currentTime = 0; } catch {}
    done?.();
  };

  if (audio.paused) {
    finalize();
    return;
  }

  const startVol = typeof audio.volume === "number" ? audio.volume : 1;
  cancelMusicFade();
  const start = performance.now();

  function step(now) {
    const t = Math.min(1, (now - start) / ms);
    const volume = startVol * (1 - t);
    const ok = safeSetVolume(audio, volume);

    if (!ok) {
      state.musicFadeRaf = null;
      finalize();
      safeSetVolume(audio, startVol);
      return;
    }

    if (t < 1) {
      state.musicFadeRaf = requestAnimationFrame(step);
    } else {
      state.musicFadeRaf = null;
      finalize();
      safeSetVolume(audio, startVol);
    }
  }

  state.musicFadeRaf = requestAnimationFrame(step);
}

function startUiTicker() {
  if (state.uiInterval) clearInterval(state.uiInterval);
  state.uiInterval = setInterval(syncPlayerUI, 200);
}

function syncPlayerUI() {
  const audio = state.musicAudio;
  const track = state.musicTrack;

  playerWheelBtn.classList.remove("playing", "paused");

  if (!audio || !track) {
    nowPlayingTitle.textContent = "Ingen låt vald";
    circleTime.textContent = "--:--";
    circleMeta.textContent = "Välj en låt";
    circleIcon.textContent = "▶";
    playerStatePill.textContent = "Idle";
    playerStatePill.classList.remove("playing", "paused");
    visualizer.classList.remove("playing");
    visualizer.classList.add("ambient");
    return;
  }

  nowPlayingTitle.textContent = track.name;
  circleMeta.textContent = track.categoryLabel;

  const duration = Number.isFinite(audio.duration) ? audio.duration : 0;
  const current = Number.isFinite(audio.currentTime) ? audio.currentTime : 0;
  const remaining = duration > 0 ? Math.max(0, Math.ceil(duration - current)) : 0;
  circleTime.textContent = duration > 0 ? formatTime(remaining) : "--:--";

  if (audio.paused) {
    circleIcon.textContent = "▶";
    playerStatePill.textContent = "Pausad";
    playerStatePill.classList.remove("playing");
    playerStatePill.classList.add("paused");
    visualizer.classList.remove("playing");
    visualizer.classList.add("ambient");
    playerWheelBtn.classList.add("paused");
  } else {
    circleIcon.textContent = "❚❚";
    playerStatePill.textContent = "Spelar";
    playerStatePill.classList.add("playing");
    playerStatePill.classList.remove("paused");
    visualizer.classList.remove("ambient");
    visualizer.classList.add("playing");
    playerWheelBtn.classList.add("playing");
  }
}

function markPlayingCards() {
  document.querySelectorAll(".trackCard").forEach(card => {
    card.classList.remove("playing");
  });

  if (!state.musicTrack) return;

  const all = document.querySelectorAll(`.trackCard[data-track-id="${cssEscape(state.musicTrack.id)}"]`);
  all.forEach(el => el.classList.add("playing"));
}

function isAudio(name) {
  if (!name || name === ".keep") return false;
  const ext = (name.split(".").pop() || "").toLowerCase();
  return AUDIO_EXT.includes(ext);
}

function pretty(name) {
  return (name || "").replace(/\.[^/.]+$/, "");
}

function formatTime(totalSec) {
  const mins = Math.floor(totalSec / 60);
  const secs = totalSec % 60;
  return `${mins}:${String(secs).padStart(2, "0")}`;
}

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (char) => (
    {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;"
    }[char]
  ));
}

function cssEscape(str) {
  if (window.CSS && typeof window.CSS.escape === "function") {
    return window.CSS.escape(str);
  }
  return String(str).replace(/[^a-zA-Z0-9_-]/g, "\\$&");
}
function updateClock(){
  const el = document.getElementById("digitalClock");
  if(!el) return;

  const now = new Date();
  const h = String(now.getHours()).padStart(2,"0");
  const m = String(now.getMinutes()).padStart(2,"0");

  el.textContent = `${h}:${m}`;
}

setInterval(updateClock, 1000);
updateClock();
