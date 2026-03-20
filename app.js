/* =========================
   SB SOUNDBOARD V3
   - Premium glass layout
   - Goal horn separat
   - Goal combo = horn + preload efter fast delay
   - Musikkanal med fade in/out
   - Favoriter för avbrott
   - Random per kategori
   - Spotify som separat embed
   ========================= */

const OWNER = "BoniniSebastian";
const REPO = "SBsoundboardV3";

const GOAL_COMBO_DELAY_MS = 1200;
const PLAY_FADE_IN_MS = 150;
const PAUSE_FADE_OUT_MS = 340;
const STOP_FADE_OUT_MS = 340;

const STORAGE_KEYS = {
  preload: "sb_v3_preload_track",
  favorites: "sb_v3_avbrott_favorites"
};

const CATEGORIES = [
  {
    key: "goalhorn",
    label: "GOAL HORN",
    folder: "sounds/goalhorn",
    type: "effect",
    allowRandom: false,
    allowLoad: false,
    allowFavorite: false,
    shortcut: "G"
  },
  {
    key: "mal",
    label: "MÅL",
    folder: "sounds/mal",
    type: "music",
    allowRandom: true,
    allowLoad: true,
    allowFavorite: false,
    shortcut: "M"
  },
  {
    key: "avbrott",
    label: "AVBROTT",
    folder: "sounds/avbrott",
    type: "music",
    allowRandom: true,
    allowLoad: true,
    allowFavorite: true,
    shortcut: "A"
  },
  {
    key: "utvisning",
    label: "UTVISNING",
    folder: "sounds/utvisning",
    type: "music",
    allowRandom: true,
    allowLoad: true,
    allowFavorite: false,
    shortcut: "U"
  },
  {
    key: "tuta",
    label: "SOUNDS",
    folder: "sounds/tuta",
    type: "music",
    allowRandom: true,
    allowLoad: true,
    allowFavorite: false,
    shortcut: "S"
  },
  {
    key: "random",
    label: "RANDOM",
    folder: "sounds/random",
    type: "music",
    allowRandom: true,
    allowLoad: true,
    allowFavorite: false,
    shortcut: "R"
  }
];

const AUDIO_EXT = ["mp3", "m4a", "wav", "ogg", "aac"];

const state = {
  library: new Map(),
  sections: new Map(),
  preloadTrack: null,
  avbrottFavorites: new Set(),
  musicAudio: null,
  musicTrack: null,
  musicFadeRaf: null,
  hornAudios: [],
  comboTimeout: null,
  uiInterval: null
};

/* =========================
   DOM
   ========================= */
const libraryGrid = document.getElementById("libraryGrid");
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
const goalHornBtn = document.getElementById("goalHornBtn");
const goalComboBtn = document.getElementById("goalComboBtn");
const resetBtn = document.getElementById("resetBtn");

const preloadTitle = document.getElementById("preloadTitle");
const preloadBadge = document.getElementById("preloadBadge");

/* =========================
   Start
   ========================= */
init().catch(console.error);

async function init() {
  restoreLocalState();
  bindControls();
  buildSkeletonSections();
  await loadAllFolders();
  renderAllSections();
  renderPreload();
  syncPlayerUI();
  startUiTicker();
}

/* =========================
   Init helpers
   ========================= */
function restoreLocalState() {
  try {
    const rawPreload = localStorage.getItem(STORAGE_KEYS.preload);
    if (rawPreload) state.preloadTrack = JSON.parse(rawPreload);
  } catch {}

  try {
    const rawFavs = localStorage.getItem(STORAGE_KEYS.favorites);
    if (rawFavs) {
      const parsed = JSON.parse(rawFavs);
      state.avbrottFavorites = new Set(Array.isArray(parsed) ? parsed : []);
    }
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
    localStorage.setItem(
      STORAGE_KEYS.favorites,
      JSON.stringify(Array.from(state.avbrottFavorites))
    );
  } catch {}
}

function buildSkeletonSections() {
  libraryGrid.innerHTML = "";

  for (const cat of CATEGORIES) {
    const section = document.createElement("section");
    section.className = "librarySection glass";
    section.dataset.key = cat.key;

    section.innerHTML = `
      <div class="sectionHeader">
        <div>
          <div class="sectionMiniTitle">${escapeHtml(cat.folder.replace("sounds/", ""))}</div>
          <div class="sectionTitle">${escapeHtml(cat.label)}</div>
          <div class="sectionSubtitle">Klicka på en låt för att spela direkt.</div>
        </div>
        <div class="sectionActions" data-actions="${escapeHtml(cat.key)}"></div>
      </div>
      <div class="trackList" data-list="${escapeHtml(cat.key)}">
        <div class="emptyState">Laddar ${escapeHtml(cat.label.toLowerCase())}...</div>
      </div>
    `;

    libraryGrid.appendChild(section);
    state.sections.set(cat.key, section);
  }
}

async function loadAllFolders() {
  const tasks = CATEGORIES.map(cat => loadFolder(cat));
  await Promise.all(tasks);
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

    state.library.set(category.key, files);
  } catch (err) {
    console.error(err);
    state.library.set(category.key, []);
  }
}

/* =========================
   Render
   ========================= */
function renderAllSections() {
  for (const category of CATEGORIES) {
    renderSection(category);
  }
  markPlayingCards();
}

function renderSection(category) {
  const section = state.sections.get(category.key);
  if (!section) return;

  const actionWrap = section.querySelector(`[data-actions="${category.key}"]`);
  const listWrap = section.querySelector(`[data-list="${category.key}"]`);
  const files = [...(state.library.get(category.key) || [])];

  actionWrap.innerHTML = "";

  if (category.allowRandom && files.length) {
    const randomBtn = document.createElement("button");
    randomBtn.className = "sectionActionBtn primary";
    randomBtn.type = "button";
    randomBtn.textContent = `▶ Random (${category.shortcut})`;
    randomBtn.onclick = () => playRandomFromCategory(category.key);
    actionWrap.appendChild(randomBtn);
  }

  if (category.key === "goalhorn") {
    const hornInfo = document.createElement("button");
    hornInfo.className = "sectionActionBtn";
    hornInfo.type = "button";
    hornInfo.textContent = "▶ Spela horn";
    hornInfo.onclick = () => playGoalHorn();
    actionWrap.appendChild(hornInfo);
  }

  if (!files.length) {
    listWrap.innerHTML = `<div class="emptyState">Inga ljud hittades i ${escapeHtml(category.folder)}.</div>`;
    return;
  }

  let ordered = files;
  if (category.key === "avbrott") {
    const favs = files.filter(file => state.avbrottFavorites.has(file.id));
    const rest = files.filter(file => !state.avbrottFavorites.has(file.id));
    ordered = [...favs, ...rest];
  }

  listWrap.innerHTML = "";

  for (const file of ordered) {
    const card = document.createElement("div");
    card.className = "trackCard";
    card.dataset.trackId = file.id;

    const mainBtn = document.createElement("button");
    mainBtn.type = "button";
    mainBtn.className = "trackMain";
    mainBtn.onclick = () => {
      if (file.categoryKey === "goalhorn") {
        playGoalHorn();
        return;
      }
      playTrack(file, { fadeIn: true });
    };

    const metaLabel =
      file.categoryKey === "goalhorn"
        ? "Horn / direkt"
        : file.categoryKey === "avbrott"
          ? "Pausa / spela vidare via cirkeln"
          : "Klick = spela direkt";

    mainBtn.innerHTML = `
      <div class="trackName">${escapeHtml(file.name)}</div>
      <div class="trackMeta">${escapeHtml(metaLabel)}</div>
    `;

    const actions = document.createElement("div");
    actions.className = "trackActions";

    if (category.allowLoad) {
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

    if (category.allowFavorite) {
      const favBtn = document.createElement("button");
      favBtn.type = "button";
      favBtn.className = "trackFavBtn";
      favBtn.title = "Favoritmarkera";
      favBtn.textContent = "★";
      if (state.avbrottFavorites.has(file.id)) {
        favBtn.classList.add("active");
      }
      favBtn.onclick = (e) => {
        e.stopPropagation();
        toggleFavorite(file);
      };
      actions.appendChild(favBtn);
    }

    card.appendChild(mainBtn);
    if (actions.childElementCount) {
      card.appendChild(actions);
    } else {
      const spacer = document.createElement("div");
      spacer.style.width = "1px";
      card.appendChild(spacer);
    }

    listWrap.appendChild(card);
  }
}

function markPlayingCards() {
  document.querySelectorAll(".trackCard").forEach(card => {
    card.classList.remove("playing");
  });

  if (!state.musicTrack) return;

  const active = document.querySelector(`.trackCard[data-track-id="${cssEscape(state.musicTrack.id)}"]`);
  if (active) active.classList.add("playing");
}

function renderPreload() {
  if (!state.preloadTrack) {
    preloadTitle.textContent = "Ingen låt laddad";
    preloadBadge.textContent = "Tom";
    preloadBadge.classList.remove("ready");
    return;
  }

  preloadTitle.textContent = state.preloadTrack.name;
  preloadBadge.textContent = "Redo";
  preloadBadge.classList.add("ready");
}

/* =========================
   Controls
   ========================= */
function bindControls() {
  centerPlayPauseBtn.onclick = () => toggleMusicPauseResume();
  resumeBtn.onclick = () => resumeMusic();
  pauseBtn.onclick = () => pauseMusic();
  stopBtn.onclick = () => stopAll();
  goalHornBtn.onclick = () => playGoalHorn();
  goalComboBtn.onclick = () => playGoalCombo();
  resetBtn.onclick = () => resetStoredState();

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

    if (key === "s") {
      playRandomFromCategory("tuta");
      return;
    }

    if (key === "m") {
      playRandomFromCategory("mal");
    }
  });
}

/* =========================
   Audio core
   ========================= */
function playGoalHorn() {
  const horns = state.library.get("goalhorn") || [];
  const track = horns[0];
  if (!track) {
    alert('Ingen goalhorn-fil hittades i "sounds/goalhorn".');
    return;
  }

  const audio = new Audio(track.url);
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

function toggleFavorite(track) {
  if (state.avbrottFavorites.has(track.id)) {
    state.avbrottFavorites.delete(track.id);
  } else {
    state.avbrottFavorites.add(track.id);
  }
  persistFavorites();
  renderSection(CATEGORIES.find(cat => cat.key === "avbrott"));
  markPlayingCards();
}

function playRandomFromCategory(categoryKey) {
  const tracks = state.library.get(categoryKey) || [];
  if (!tracks.length) return;

  const pick = tracks[Math.floor(Math.random() * tracks.length)];

  if (categoryKey === "goalhorn") {
    playGoalHorn();
    return;
  }

  playTrack(pick, { fadeIn: true });
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
  persistPreload();
  persistFavorites();
  renderPreload();
  renderSection(CATEGORIES.find(cat => cat.key === "avbrott"));
  markPlayingCards();
}

/* =========================
   Fade utils
   ========================= */
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

/* =========================
   UI sync
   ========================= */
function startUiTicker() {
  if (state.uiInterval) clearInterval(state.uiInterval);
  state.uiInterval = setInterval(syncPlayerUI, 200);
}

function syncPlayerUI() {
  const audio = state.musicAudio;
  const track = state.musicTrack;

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
  } else {
    circleIcon.textContent = "❚❚";
    playerStatePill.textContent = "Spelar";
    playerStatePill.classList.add("playing");
    playerStatePill.classList.remove("paused");
    visualizer.classList.remove("ambient");
    visualizer.classList.add("playing");
  }
}

/* =========================
   Utils
   ========================= */
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
