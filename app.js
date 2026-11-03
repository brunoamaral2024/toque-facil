const chords = ["A", "Am", "A#", "A#m", "B", "Bm", "C", "Cm", "C#", "C#m", "D", "Dm", "D#", "D#m", "E", "Em", "F", "Fm", "F#", "F#m", "G", "Gm", "G#", "G#m"];
const pitchClasses = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

function readStoredSongs() {
  try {
    const stored = JSON.parse(localStorage.getItem("toca-leve-songs") || "[]");
    return Array.isArray(stored) ? stored.filter((song) => song && typeof song.id === "string" && typeof song.title === "string") : [];
  } catch (error) {
    console.warn("Não foi possível carregar as cifras salvas.", error);
    return [];
  }
}

document.querySelector("#playlist-filter").addEventListener("change", () => {
  document.querySelector("#delete-playlist").disabled = document.querySelector("#playlist-filter").value === "all";
  render();
});
document.querySelector("#create-playlist").addEventListener("click", () => {
  const name = window.prompt("Nome da nova lista:");
  if (!name?.trim()) return;
  const playlist = { id: crypto.randomUUID(), name: name.trim(), songIds: [] };
  playlists.push(playlist);
  savePlaylists();
  render();
  document.querySelector("#playlist-filter").value = playlist.id;
  render();
});
document.querySelector("#delete-playlist").addEventListener("click", () => {
  const select = document.querySelector("#playlist-filter");
  const playlist = playlists.find((item) => item.id === select.value);
  if (!playlist || !window.confirm(`Excluir a lista "${playlist.name}"? As cifras serão mantidas no repertório.`)) return;
  playlists = playlists.filter((item) => item.id !== playlist.id);
  savePlaylists();
  select.value = "all";
  document.querySelector("#delete-playlist").disabled = true;
  render();
});

function readStoredPlaylists() {
  try {
    const stored = JSON.parse(localStorage.getItem("toque-facil-playlists") || "[]");
    return Array.isArray(stored)
      ? stored.filter((playlist) => playlist && typeof playlist.id === "string" && typeof playlist.name === "string" && Array.isArray(playlist.songIds))
      : [];
  } catch (error) {
    console.warn("Não foi possível carregar as listas.", error);
    return [];
  }
}

function readStoredOrder() {
  try {
    const stored = JSON.parse(localStorage.getItem("toque-facil-song-order") || "[]");
    return Array.isArray(stored) ? stored.filter((id) => typeof id === "string") : [];
  } catch (error) {
    console.warn("Não foi possível carregar a ordem do repertório.", error);
    return [];
  }
}

function readPreferences() {
  try {
    const stored = JSON.parse(localStorage.getItem("toca-leve-preferences") || "{}");
    return stored && typeof stored === "object" ? stored : {};
  } catch (error) {
    console.warn("Não foi possível carregar as preferências.", error);
    return {};
  }
}

let songs = readStoredSongs();
let playlists = readStoredPlaylists();
let songOrder = readStoredOrder();
songOrder = [...songOrder.filter((id) => songs.some((song) => song.id === id)), ...songs.map((song) => song.id).filter((id) => !songOrder.includes(id))];
const preferences = readPreferences();
const chordList = document.querySelector("#chord-list");
const songGrid = document.querySelector("#song-grid");
const songCount = document.querySelector("#song-count");
const activeFilters = document.querySelector("#active-filters");
const emptyState = document.querySelector("#empty-state");
const searchInput = document.querySelector("#song-search");
const sortSelect = document.querySelector("#sort-songs");
const favoritesOnly = document.querySelector("#favorites-only");
const selectedChords = new Set(Array.isArray(preferences.chords) ? preferences.chords.filter((chord) => chords.includes(chord)) : []);
const favoriteSongs = new Set(readStoredFavorites());
let currentTranspose = 0;
let currentSongId = null;
let audioFile;
let audioUrl;
let metronomeContext;
let metronomeTimer;
let metronomeBeat = 0;
let metronomeBeatsPerBar = 4;
let installPrompt;
let pendingImport;
let readerFrame;
let readerLastTime = 0;
let readerTarget;

function readStoredFavorites() {
  try {
    const stored = JSON.parse(localStorage.getItem("toca-leve-favorites") || "[]");
    return Array.isArray(stored) ? stored.filter((id) => songs.some((song) => song.id === id)) : [];
  } catch (error) {
    console.warn("Não foi possível carregar as músicas favoritas.", error);
    return [];
  }
}

function saveFavorites() {
  try {
    localStorage.setItem("toca-leve-favorites", JSON.stringify([...favoriteSongs]));
  } catch (error) {
    console.warn("Não foi possível salvar as músicas favoritas.", error);
  }
}

function savePreferences() {
  const referenceA = Number(document.querySelector("#reference-a").value);
  const safeReferenceA = Number.isFinite(referenceA) ? Math.min(446, Math.max(432, referenceA)) : 440;
  document.querySelector("#reference-a").value = safeReferenceA;
  try {
    localStorage.setItem("toca-leve-preferences", JSON.stringify({
      chords: [...selectedChords],
      referenceA: safeReferenceA,
      metronomeBpm: Number(document.querySelector("#metronome-bpm").value)
    }));
  } catch (error) {
    console.warn("Não foi possível salvar as preferências.", error);
  }
}

function savePlaylists() {
  try {
    localStorage.setItem("toque-facil-playlists", JSON.stringify(playlists));
    localStorage.setItem("toque-facil-song-order", JSON.stringify(songOrder));
  } catch (error) {
    console.error("Não foi possível salvar listas e ordem do repertório.", error);
    saveStatus.textContent = "Não foi possível salvar listas. Faça um backup.";
    saveStatus.classList.add("save-error");
  }
}

function renderChords() {
  chordList.innerHTML = "";
  for (const chord of chords) {
    const button = document.createElement("button");
    button.className = "chord-chip";
    button.type = "button";
    button.textContent = chord;
    button.setAttribute("aria-pressed", String(selectedChords.has(chord)));
    button.setAttribute("aria-label", `${chord}${selectedChords.has(chord) ? ", selecionado" : ""}`);
    button.addEventListener("click", () => {
      if (selectedChords.has(chord)) selectedChords.delete(chord);
      else selectedChords.add(chord);
      savePreferences();
      render();
    });
    chordList.append(button);
  }
}

function getVisibleSongs() {
  const query = searchInput.value.trim().toLocaleLowerCase("pt-BR");
  const playlistFilter = document.querySelector("#playlist-filter").value;
  const result = songs.filter((song) => {
    const hasEveryChord = [...selectedChords].every((chord) => song.chords.some((songChord) => normalizeChordFamily(songChord) === normalizeChordFamily(chord)));
    const matchesQuery = !query || [song.title, song.artist, song.style, ...song.chords]
      .some((value) => value.toLocaleLowerCase("pt-BR").includes(query));
    const matchesPlaylist = playlistFilter === "all" || playlists.find((playlist) => playlist.id === playlistFilter)?.songIds.includes(song.id);
    return hasEveryChord && matchesQuery && matchesPlaylist && (!favoritesOnly.checked || favoriteSongs.has(song.id));
  });

  if (sortSelect.value === "name") result.sort((a, b) => a.title.localeCompare(b.title, "pt-BR"));
  else if (sortSelect.value === "favorites") {
    result.sort((a, b) => Number(favoriteSongs.has(b.id)) - Number(favoriteSongs.has(a.id)) || a.difficulty - b.difficulty);
  } else if (sortSelect.value === "easy") {
    result.sort((a, b) => a.difficulty - b.difficulty || a.chords.length - b.chords.length);
  } else {
    result.sort((a, b) => {
      const aIndex = songOrder.indexOf(a.id);
      const bIndex = songOrder.indexOf(b.id);
      return (aIndex < 0 ? Number.MAX_SAFE_INTEGER : aIndex) - (bIndex < 0 ? Number.MAX_SAFE_INTEGER : bIndex);
    });
  }
  return result;
}

function createSongCard(song) {
  const card = document.createElement("article");
  card.className = "song-card";

  const top = document.createElement("div");
  top.className = "song-card-top";
  const category = document.createElement("span");
  category.className = "song-category";
  category.textContent = song.style;
  const favorite = document.createElement("button");
  const isFavorite = favoriteSongs.has(song.id);
  favorite.className = "favorite-button";
  favorite.type = "button";
  favorite.textContent = isFavorite ? "♥" : "♡";
  favorite.setAttribute("aria-pressed", String(isFavorite));
  favorite.setAttribute("aria-label", `${isFavorite ? "Remover" : "Adicionar"} ${song.title} ${isFavorite ? "das" : "às"} favoritas`);
  favorite.addEventListener("click", () => {
    if (favoriteSongs.has(song.id)) favoriteSongs.delete(song.id);
    else favoriteSongs.add(song.id);
    saveFavorites();
    render();
  });
  top.append(category, favorite);

  const title = document.createElement("h3");
  title.textContent = song.title;
  const artist = document.createElement("p");
  artist.className = "song-artist";
  artist.textContent = song.artist;
  const progression = document.createElement("div");
  progression.className = "song-progression";
  progression.setAttribute("aria-label", `Acordes: ${song.chords.join(", ")}`);
  for (const chord of song.chords) {
    const chordBadge = document.createElement("span");
    chordBadge.textContent = chord;
    progression.append(chordBadge);
  }
  const bottom = document.createElement("div");
  bottom.className = "song-card-bottom";
  const tempo = document.createElement("span");
  tempo.textContent = `${song.tempo} BPM · ${song.chords.length} acordes`;
  const difficulty = document.createElement("span");
  difficulty.className = "difficulty";
  difficulty.innerHTML = `<span class="difficulty-dots" aria-hidden="true">${"●".repeat(song.difficulty)}${"○".repeat(4 - song.difficulty)}</span> ${["", "Tranquila", "De boa", "Desafio"][song.difficulty]}`;
  bottom.append(tempo, difficulty);
  const edit = document.createElement("button");
  edit.className = "song-edit-button";
  edit.type = "button";
  edit.textContent = "Abrir cifra e editar →";
  edit.addEventListener("click", () => openSong(song));
  const actions = document.createElement("div");
  actions.className = "song-card-actions";
  const playlistSelect = document.createElement("select");
  playlistSelect.className = "song-playlist-select";
  playlistSelect.setAttribute("aria-label", `Lista da cifra ${song.title}`);
  const noPlaylist = document.createElement("option");
  noPlaylist.value = "";
  noPlaylist.textContent = "Sem lista";
  playlistSelect.append(noPlaylist, ...playlists.map((playlist) => {
    const option = document.createElement("option");
    option.value = playlist.id;
    option.textContent = playlist.name;
    option.selected = playlist.songIds.includes(song.id);
    return option;
  }));
  playlistSelect.addEventListener("change", () => {
    for (const playlist of playlists) playlist.songIds = playlist.songIds.filter((id) => id !== song.id);
    if (playlistSelect.value) playlists.find((playlist) => playlist.id === playlistSelect.value)?.songIds.push(song.id);
    savePlaylists();
    render();
  });
  const moveUp = document.createElement("button");
  moveUp.className = "song-order-button";
  moveUp.type = "button";
  moveUp.textContent = "↑";
  moveUp.setAttribute("aria-label", `Mover ${song.title} para cima`);
  moveUp.disabled = songOrder.indexOf(song.id) <= 0;
  moveUp.addEventListener("click", () => moveSong(song.id, -1));
  const moveDown = document.createElement("button");
  moveDown.className = "song-order-button";
  moveDown.type = "button";
  moveDown.textContent = "↓";
  moveDown.setAttribute("aria-label", `Mover ${song.title} para baixo`);
  moveDown.disabled = songOrder.indexOf(song.id) === songOrder.length - 1;
  moveDown.addEventListener("click", () => moveSong(song.id, 1));
  actions.append(playlistSelect, moveUp, moveDown);
  card.append(top, title, artist, progression, bottom, edit, actions);
  return card;
}

function renderPlaylists() {
  const select = document.querySelector("#playlist-filter");
  const currentValue = select.value || "all";
  select.replaceChildren(new Option("Todas as cifras", "all"));
  for (const playlist of playlists) select.add(new Option(playlist.name, playlist.id));
  select.value = playlists.some((playlist) => playlist.id === currentValue) ? currentValue : "all";
  document.querySelector("#delete-playlist").disabled = select.value === "all";
  document.querySelector("#playlist-count").textContent = playlists.length
    ? `${playlists.length} lista${playlists.length === 1 ? "" : "s"}`
    : "Crie listas para organizar seu repertório";
}

function moveSong(id, direction) {
  const index = songOrder.indexOf(id);
  const targetIndex = index + direction;
  if (index < 0 || targetIndex < 0 || targetIndex >= songOrder.length) return;
  [songOrder[index], songOrder[targetIndex]] = [songOrder[targetIndex], songOrder[index]];
  sortSelect.value = "manual";
  savePlaylists();
  render();
}

function render() {
  renderChords();
  renderPlaylists();
  const visible = getVisibleSongs();
  songGrid.replaceChildren(...visible.map(createSongCard));
  songCount.textContent = visible.length;
  emptyState.hidden = visible.length > 0;
  songGrid.hidden = visible.length === 0;
  document.querySelector("#empty-title").textContent = songs.length ? "Ainda não encontramos essa combinação" : "Seu repertório está vazio";
  document.querySelector("#empty-message").textContent = songs.length
    ? "Tente tirar um acorde da seleção ou buscar por outro termo."
    : "Importe uma cifra ou crie uma nova para começar seu repertório.";
  document.querySelector("#reset-filters").textContent = songs.length ? "Ver todas as músicas" : "Criar ou importar cifra";
  activeFilters.replaceChildren();
  for (const chord of selectedChords) {
    const badge = document.createElement("span");
    badge.className = "active-filter";
    badge.textContent = chord;
    activeFilters.append(badge);
  }
}

document.querySelector("#clear-chords").addEventListener("click", () => {
  selectedChords.clear();
  render();
});
document.querySelector("#reset-filters").addEventListener("click", () => {
  if (!songs.length) {
    document.querySelector("#editor").scrollIntoView({ behavior: "smooth", block: "start" });
    document.querySelector("#new-song").focus({ preventScroll: true });
    return;
  }
  selectedChords.clear();
  searchInput.value = "";
  favoritesOnly.checked = false;
  savePreferences();
  render();
});
searchInput.addEventListener("input", render);
sortSelect.addEventListener("change", render);
favoritesOnly.addEventListener("change", render);

const songTitleInput = document.querySelector("#song-title");
const songAuthorInput = document.querySelector("#song-author");
const songKeyInput = document.querySelector("#song-key");
const songBpmInput = document.querySelector("#song-bpm");
const lyricsInput = document.querySelector("#song-lyrics");
const lyricsPreview = document.querySelector("#lyrics-preview");
const saveStatus = document.querySelector("#save-status");
let saveTimeout;

function transposePitch(pitch, steps) {
  const pitchIndexes = { C: 0, "B#": 0, "C#": 1, Db: 1, D: 2, "D#": 3, Eb: 3, E: 4, Fb: 4, "E#": 5, F: 5, "F#": 6, Gb: 6, G: 7, "G#": 8, Ab: 8, A: 9, "A#": 10, Bb: 10, B: 11, Cb: 11 };
  const index = pitchIndexes[pitch];
  return index === undefined ? pitch : pitchClasses[(index + steps % 12 + 12) % 12];
}

function normalizeChordFamily(chord) {
  const match = chord.match(/^([A-G](?:#|b)?)(.*)$/);
  if (!match) return chord;
  const suffix = match[2].replace(/\/.*$/, "");
  const isMinor = /^(?:m(?!aj)|min)/i.test(suffix);
  return `${transposePitch(match[1], 0)}${isMinor ? "m" : ""}`;
}

function transposeChord(chord, steps) {
  if (!steps) return chord;
  const match = chord.match(/^([A-G](?:#|b)?)(.*?)(?:\/([A-G](?:#|b)?)(.*))?$/);
  if (!match) return chord;
  return `${transposePitch(match[1], steps)}${match[2]}${match[3] ? `/${transposePitch(match[3], steps)}${match[4]}` : ""}`;
}

function getChordsFromLyrics(lyrics) {
  return [...new Set([...lyrics.matchAll(/\[([A-G](?:#|b)?(?:maj|min|m|dim|aug|sus|add|[0-9+#b]*)?(?:\/[A-G](?:#|b)?)?)\]/g)].map((match) => match[1]))];
}

const readerPreview = document.querySelector("#reader-preview");
const readerOverlay = document.querySelector("#reader-overlay");
const readerSpeed = document.querySelector("#reader-speed");
const readerFontSize = document.querySelector("#reader-font-size");

function renderLyricsPreview(target = lyricsPreview) {
  const lines = lyricsInput.value.split(/\r?\n/);
  target.replaceChildren();
  for (const line of lines) {
    const row = document.createElement("div");
    row.className = "preview-line";
    const parts = line.split(/(\[[A-G](?:#|b)?[^\]]*\])/g);
    for (const part of parts) {
      const chord = part.match(/^\[([A-G](?:#|b)?[^\]]*)\]$/);
      if (chord) {
        const chordPart = document.createElement("span");
        chordPart.className = "preview-chord-part";
        const chordName = document.createElement("strong");
        chordName.textContent = transposeChord(chord[1], currentTranspose);
        chordPart.append(chordName);
        row.append(chordPart);
      } else if (part) {
        const textPart = document.createElement("span");
        textPart.className = "preview-lyric-part";
        textPart.textContent = part;
        const previous = row.lastElementChild;
        if (previous?.classList.contains("preview-chord-part")) previous.append(textPart);
        else row.append(textPart);
      }
    }
    if (!line) row.innerHTML = "&nbsp;";
    target.append(row);
  }
  readerPreview.style.setProperty("--reader-font-size", `${readerOverlay.hidden ? readerFontSize.value : document.querySelector("#reader-overlay-font").value}px`);
}

function stopReaderScroll() {
  cancelAnimationFrame(readerFrame);
  readerFrame = undefined;
  document.querySelector("#reader-scroll-toggle").textContent = "▶ Rolar cifra";
  document.querySelector("#reader-overlay-scroll").textContent = "▶ Rolar";
}

function startReaderScroll() {
  const speed = Number(readerSpeed.value);
  if (!speed) return;
  readerTarget = readerOverlay.hidden ? lyricsPreview : readerPreview;
  readerLastTime = 0;
  const tick = (timestamp) => {
    if (!readerTarget || readerTarget.scrollTop + readerTarget.clientHeight >= readerTarget.scrollHeight) {
      stopReaderScroll();
      return;
    }
    if (readerLastTime) readerTarget.scrollTop += (timestamp - readerLastTime) * speed / 1000;
    readerLastTime = timestamp;
    readerFrame = requestAnimationFrame(tick);
  };
  document.querySelector("#reader-scroll-toggle").textContent = "Ⅱ Pausar rolagem";
  document.querySelector("#reader-overlay-scroll").textContent = "Ⅱ Pausar";
  readerFrame = requestAnimationFrame(tick);
}

function toggleReaderScroll() {
  if (readerFrame) stopReaderScroll();
  else startReaderScroll();
}

function openReader() {
  document.querySelector("#reader-title").textContent = songTitleInput.value.trim() || "Modo de leitura";
  const fontSize = document.querySelector("#reader-overlay-font");
  fontSize.value = String(Math.max(14, Math.min(48, Number(readerFontSize.value) + 6)));
  readerOverlay.hidden = false;
  document.body.classList.add("reader-open");
  renderLyricsPreview(readerPreview);
  readerPreview.scrollTop = 0;
  document.querySelector("#close-reader").focus();
}

function closeReader() {
  readerOverlay.hidden = true;
  document.body.classList.remove("reader-open");
  stopReaderScroll();
  document.querySelector("#open-reader").focus({ preventScroll: true });
}

function updateTransposeLabel() {
  const label = currentTranspose === 0
    ? "Original"
    : `${transposePitch(songKeyInput.value, currentTranspose)} · ${currentTranspose > 0 ? "+" : ""}${currentTranspose} semitom${Math.abs(currentTranspose) === 1 ? "" : "s"}`;
  document.querySelector("#transpose-label").textContent = label;
}

function storeCustomSongs() {
  const customSongs = songs.filter((song) => song.custom);
  try {
    localStorage.setItem("toca-leve-songs", JSON.stringify(customSongs));
    saveStatus.textContent = "Salvo neste dispositivo";
    saveStatus.classList.remove("save-error");
    return true;
  } catch (error) {
    console.error("Não foi possível salvar as cifras neste dispositivo.", error);
    saveStatus.textContent = "Não foi possível salvar. Exporte o projeto como cópia.";
    saveStatus.classList.add("save-error");
    return false;
  }
}

function saveCurrentSong() {
  if (!currentSongId || !songTitleInput.value.trim()) return;
  const title = songTitleInput.value.trim();
  const customSong = {
    id: currentSongId,
    title,
    artist: songAuthorInput.value.trim() || "Cifra pessoal",
    style: "Minha cifra",
    chords: getChordsFromLyrics(lyricsInput.value),
    difficulty: 2,
    tempo: Math.min(240, Math.max(40, Number(songBpmInput.value) || 90)),
    key: songKeyInput.value,
    lyrics: lyricsInput.value,
    custom: true
  };
  const existingIndex = songs.findIndex((song) => song.id === currentSongId);
  if (existingIndex >= 0) songs[existingIndex] = customSong;
  else {
    songs.push(customSong);
    songOrder.push(customSong.id);
  }
  for (const playlist of playlists) {
    playlist.songIds = playlist.songIds.filter((id) => songs.some((song) => song.id === id));
  }
  savePlaylists();
  storeCustomSongs();
  render();
}

function openSong(song) {
  currentSongId = song.custom ? song.id : crypto.randomUUID();
  currentTranspose = 0;
  songTitleInput.value = song.title || "";
  songAuthorInput.value = song.artist === "Cifra pessoal" ? "" : song.artist || "";
  songKeyInput.value = song.key || song.chords?.[0]?.replace(/m$/, "") || "C";
  songBpmInput.value = String(song.tempo || 90);
  lyricsInput.value = song.lyrics || "";
  renderLyricsPreview();
  renderLyricsPreview(readerPreview);
  updateTransposeLabel();
  document.querySelector("#editor").scrollIntoView({ behavior: "smooth", block: "start" });
}

function newSong() {
  currentSongId = crypto.randomUUID();
  currentTranspose = 0;
  songTitleInput.value = "";
  songAuthorInput.value = "";
  songKeyInput.value = "C";
  songBpmInput.value = "90";
  lyricsInput.value = "";
  renderLyricsPreview();
  renderLyricsPreview(readerPreview);
  updateTransposeLabel();
  songTitleInput.focus();
}

function scheduleSongSave() {
  renderLyricsPreview();
  renderLyricsPreview(readerPreview);
  document.querySelector("#reader-title").textContent = songTitleInput.value.trim() || "Modo de leitura";
  updateTransposeLabel();
  saveStatus.textContent = "Salvando…";
  clearTimeout(saveTimeout);
  saveTimeout = setTimeout(saveCurrentSong, 250);
}

function downloadFile(filename, contents, type) {
  const url = URL.createObjectURL(new Blob([contents], { type }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function escapeHtml(value) {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[character]);
}

document.querySelector("#new-song").addEventListener("click", newSong);
document.querySelector("#open-reader").addEventListener("click", openReader);
document.querySelector("#close-reader").addEventListener("click", closeReader);
document.querySelector("#reader-scroll-toggle").addEventListener("click", toggleReaderScroll);
document.querySelector("#reader-overlay-scroll").addEventListener("click", toggleReaderScroll);
document.querySelector("#reader-speed").addEventListener("input", () => {
  const speed = Number(readerSpeed.value);
  document.querySelector("#reader-speed-label").textContent = speed ? `${speed} px/s` : "Desligada";
  if (readerFrame) {
    stopReaderScroll();
    startReaderScroll();
  }
});
document.querySelector("#reader-font-size").addEventListener("input", () => {
  document.querySelector("#reader-font-label").textContent = `${readerFontSize.value} px`;
  lyricsPreview.style.setProperty("--reader-font-size", `${readerFontSize.value}px`);
  readerPreview.style.setProperty("--reader-font-size", `${readerFontSize.value}px`);
});
document.querySelector("#reader-overlay-font").addEventListener("input", (event) => {
  readerPreview.style.setProperty("--reader-font-size", `${event.target.value}px`);
});
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && !readerOverlay.hidden) closeReader();
});
document.querySelector("#transpose-up").addEventListener("click", () => { currentTranspose++; renderLyricsPreview(); renderLyricsPreview(readerPreview); updateTransposeLabel(); });
document.querySelector("#transpose-down").addEventListener("click", () => { currentTranspose--; renderLyricsPreview(); renderLyricsPreview(readerPreview); updateTransposeLabel(); });
document.querySelector("#transpose-reset").addEventListener("click", () => { currentTranspose = 0; renderLyricsPreview(); renderLyricsPreview(readerPreview); updateTransposeLabel(); });
for (const input of [songTitleInput, songAuthorInput, songKeyInput, songBpmInput, lyricsInput]) input.addEventListener("input", scheduleSongSave);
songKeyInput.addEventListener("change", scheduleSongSave);

document.querySelector("#export-project").addEventListener("click", () => {
  const project = {
    format: "toque-facil-project",
    version: 1,
    exportedAt: new Date().toISOString(),
    songs: songs.filter((song) => song.custom)
  };
  downloadFile("meu-repertorio-toque-facil.json", JSON.stringify(project, null, 2), "application/json");
});

function isChordToken(token) {
  return /^(?:[A-G](?:#|b)?)(?:(?:maj|min|m|dim|aug|sus|add|°|ø)?(?:[0-9]+|[#b][0-9]+)?)*(?:\/[A-G](?:#|b)?)?$/.test(token);
}

function convertTraditionalChords(text) {
  const lines = text.replace(/\r/g, "").split("\n");
  const output = [];
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index];
    const tokens = [...line.matchAll(/\S+/g)];
    const chordLine = tokens.length > 0 && tokens.every((token) => isChordToken(token[0]));
    if (chordLine && lines[index + 1] && !/^\s*\[/.test(lines[index + 1])) {
      let lyricLine = lines[++index];
      for (const token of [...tokens].reverse()) {
        const position = Math.min(token.index, lyricLine.length);
        lyricLine = `${lyricLine.slice(0, position)}[${token[0]}]${lyricLine.slice(position)}`;
      }
      output.push(lyricLine);
    } else {
      output.push(line);
    }
  }
  return output.join("\n");
}

function parseChordText(text, fallbackTitle) {
  const metadata = {};
  const withoutMetadata = text.replace(/^\s*\{(title|t|artist|subtitle|key|tempo|bpm):\s*([^}]+)\}\s*$/gim, (_, key, value) => {
    const normalized = key.toLowerCase();
    if (normalized === "title" || normalized === "t") metadata.title = value.trim();
    else if (normalized === "artist" || normalized === "subtitle") metadata.artist = value.trim();
    else if (normalized === "key") metadata.key = value.trim();
    else if (normalized === "tempo" || normalized === "bpm") metadata.tempo = Number(value.trim()) || 90;
    return "";
  }).trim();
  const lyrics = /\[[A-G](?:#|b)?[^\]]*\]/.test(withoutMetadata) ? withoutMetadata : convertTraditionalChords(withoutMetadata);
  return {
    id: crypto.randomUUID(),
    title: metadata.title || fallbackTitle || "Cifra importada",
    artist: metadata.artist || "",
    key: metadata.key || "C",
    tempo: metadata.tempo || 90,
    lyrics
  };
}

document.querySelector("#convert-pasted-lyrics").addEventListener("click", () => {
  const pasted = document.querySelector("#paste-lyrics").value.trim();
  if (!pasted) {
    saveStatus.textContent = "Cole uma cifra antes de formatar.";
    return;
  }
  const parsed = parseChordText(pasted, "");
  const pastedTitle = document.querySelector("#song-title");
  if (!pastedTitle.value.trim() && parsed.title !== "Cifra importada") pastedTitle.value = parsed.title;
  if (parsed.artist) document.querySelector("#song-author").value = parsed.artist;
  document.querySelector("#song-key").value = parsed.key;
  document.querySelector("#song-bpm").value = String(Math.min(240, Math.max(40, parsed.tempo)));
  document.querySelector("#song-lyrics").value = parsed.lyrics;
  scheduleSongSave();
  saveStatus.textContent = "Cifra formatada. Revise e salve no editor.";
});
document.querySelector("#clear-pasted-lyrics").addEventListener("click", () => {
  document.querySelector("#paste-lyrics").value = "";
});

const importPreview = document.querySelector("#import-preview");
const importPreviewList = document.querySelector("#import-preview-list");
const importPreviewSummary = document.querySelector("#import-preview-summary");
const replaceBackupInput = document.querySelector("#replace-backup");
const importProjectInput = document.querySelector("#import-project");

function addPreviewSong(song, index, readOnly = false) {
  const item = document.createElement("article");
  item.className = "import-preview-song";
  const heading = document.createElement("strong");
  heading.textContent = `Cifra ${index + 1}`;
  const fields = document.createElement("div");
  fields.className = "import-preview-fields";
  const title = document.createElement("input");
  title.className = "import-title";
  title.value = song.title || "";
  title.maxLength = 100;
  title.readOnly = readOnly;
  title.setAttribute("aria-label", `Título da cifra ${index + 1}`);
  const artist = document.createElement("input");
  artist.className = "import-artist";
  artist.value = song.artist || "";
  artist.maxLength = 100;
  artist.readOnly = readOnly;
  artist.placeholder = "Artista ou autor";
  artist.setAttribute("aria-label", `Artista da cifra ${index + 1}`);
  const key = document.createElement("select");
  key.className = "import-key";
  for (const value of ["C", "C#", "D", "Eb", "E", "F", "F#", "G", "Ab", "A", "Bb", "B"]) {
    key.add(new Option(value, value, false, value === (song.key || "C")));
  }
  key.setAttribute("aria-label", `Tom da cifra ${index + 1}`);
  key.disabled = readOnly;
  const lyrics = document.createElement("textarea");
  lyrics.className = "import-lyrics";
  lyrics.value = song.lyrics || "";
  lyrics.readOnly = readOnly;
  lyrics.rows = 6;
  lyrics.setAttribute("aria-label", `Conteúdo da cifra ${index + 1}`);
  fields.append(title, artist, key);
  item.append(heading, fields, lyrics);
  importPreviewList.append(item);
}

function showImportPreview(songsToImport, backup = null) {
  pendingImport = { songs: songsToImport, backup };
  importPreviewList.replaceChildren();
  replaceBackupInput.checked = false;
  const backupMode = Boolean(backup);
  replaceBackupInput.hidden = !backupMode;
  replaceBackupInput.parentElement.hidden = !backupMode;
  if (backupMode) {
    importPreviewSummary.textContent = `Backup contém ${songsToImport.length} cifras, ${backup.playlists?.length || 0} listas e preferências.`;
    songsToImport.forEach((song, index) => addPreviewSong(song, index, true));
  } else {
    importPreviewSummary.textContent = `${songsToImport.length} cifra${songsToImport.length === 1 ? "" : "s"} pronta${songsToImport.length === 1 ? "" : "s"} para revisão.`;
    songsToImport.forEach((song, index) => addPreviewSong(song, index));
  }
  importPreview.hidden = false;
  importPreview.scrollIntoView({ behavior: "smooth", block: "start" });
}

function parseImportedSong(song, fallbackTitle) {
  const title = song.title || song.titulo || song.name || fallbackTitle;
  const lyrics = song.lyrics || song.letter || song.letra || song.lyricsText || song.cifra || song.text || "";
  if (typeof title !== "string" || typeof lyrics !== "string") return null;
  return {
    id: typeof song.id === "string" ? song.id : crypto.randomUUID(),
    title,
    artist: song.artist || song.author || song.autor || song.artista || "",
    key: song.key || song.tom || "C",
    tempo: Number(song.tempo || song.bpm) || 90,
    lyrics,
    style: "Minha cifra",
    chords: getChordsFromLyrics(lyrics),
    difficulty: 2,
    custom: true
  };
}

async function handleImportFile(file) {
  if (!file) return;
  try {
    const contents = await file.text();
    if (file.size > 10 * 1024 * 1024) throw new Error("O arquivo de cifra deve ter até 10 MB.");
    if (/\.(txt|cho|pro|chordpro)$/i.test(file.name)) {
      showImportPreview([parseChordText(contents, file.name.replace(/\.[^.]+$/, ""))]);
      return;
    }
    const data = JSON.parse(contents);
    if (data.format === "toque-facil-backup" && Array.isArray(data.songs)) {
      const imported = data.songs.map((song) => parseImportedSong(song, "Cifra importada")).filter(Boolean);
      if (!imported.length && data.songs.length) throw new Error("O backup não contém cifras válidas.");
      showImportPreview(imported, data);
      return;
    }
    const candidates = Array.isArray(data) ? data : Array.isArray(data.songs) ? data.songs : data.song ? [data.song] : [data];
    const imported = candidates.map((song) => parseImportedSong(song, file.name.replace(/\.[^.]+$/, ""))).filter(Boolean);
    if (!imported.length) throw new Error("O arquivo não contém cifras compatíveis.");
    showImportPreview(imported);
  } catch (error) {
    console.error("Falha ao preparar a importação.", error);
    saveStatus.textContent = `Não foi possível abrir o arquivo: ${error.message}`;
    saveStatus.classList.add("save-error");
  }
}

importProjectInput.addEventListener("change", async (event) => {
  const file = event.target.files?.[0];
  event.target.value = "";
  await handleImportFile(file);
});

document.querySelector("#cancel-import").addEventListener("click", () => {
  pendingImport = undefined;
  importPreview.hidden = true;
  importPreviewList.replaceChildren();
});

function persistAppData() {
  savePlaylists();
  saveFavorites();
  savePreferences();
  storeCustomSongs();
}

function restoreBackup(backup, replace) {
  if (!Array.isArray(backup.songs) || !Array.isArray(backup.playlists)
    || (backup.favorites !== undefined && !Array.isArray(backup.favorites))) {
    throw new Error("Backup incompleto ou inválido.");
  }
  const backupFavorites = Array.isArray(backup.favorites) ? backup.favorites : [];
  if (replace) {
    songs = backup.songs.map((song) => parseImportedSong(song, "Cifra importada")).filter(Boolean);
    playlists = backup.playlists
      .filter((playlist) => playlist && typeof playlist.name === "string" && Array.isArray(playlist.songIds))
      .map((playlist) => ({
        id: typeof playlist.id === "string" ? playlist.id : crypto.randomUUID(),
        name: playlist.name.slice(0, 60),
        songIds: playlist.songIds.filter((id) => typeof id === "string")
      }));
    songOrder = Array.isArray(backup.songOrder) ? backup.songOrder.filter((id) => typeof id === "string") : songs.map((song) => song.id);
    favoriteSongs.clear();
    for (const id of backupFavorites) if (typeof id === "string") favoriteSongs.add(id);
    if (backup.preferences && typeof backup.preferences === "object") {
      if (Array.isArray(backup.preferences.chords)) {
        preferences.chords = backup.preferences.chords.filter((chord) => chords.includes(chord));
      }
      if (Number.isFinite(Number(backup.preferences.referenceA))) {
        preferences.referenceA = Math.min(446, Math.max(432, Number(backup.preferences.referenceA)));
      }
      if (Number.isFinite(Number(backup.preferences.metronomeBpm))) {
        preferences.metronomeBpm = Math.min(220, Math.max(40, Number(backup.preferences.metronomeBpm)));
      }
      selectedChords.clear();
      for (const chord of preferences.chords || []) selectedChords.add(chord);
      document.querySelector("#reference-a").value = String(preferences.referenceA || 440);
      metronomeSlider.value = String(preferences.metronomeBpm || 90);
      metronomeValue.textContent = metronomeSlider.value;
    } else {
      selectedChords.clear();
    }
  } else {
    const idMap = new Map();
    for (const source of backup.songs) {
      const existing = songs.find((song) => song.title.toLocaleLowerCase("pt-BR") === String(source.title || "").toLocaleLowerCase("pt-BR")
        && song.artist.toLocaleLowerCase("pt-BR") === String(source.artist || "").toLocaleLowerCase("pt-BR"));
      const imported = parseImportedSong(source, "Cifra importada");
      if (!imported) continue;
      if (existing) idMap.set(source.id, existing.id);
      else {
        songs.push(imported);
        songOrder.push(imported.id);
        idMap.set(source.id, imported.id);
      }
    }
    for (const source of backup.playlists) {
      if (!source || typeof source.name !== "string" || !Array.isArray(source.songIds)) continue;
      let target = playlists.find((playlist) => playlist.name.toLocaleLowerCase("pt-BR") === source.name.toLocaleLowerCase("pt-BR"));
      if (!target) {
        target = { id: crypto.randomUUID(), name: source.name, songIds: [] };
        playlists.push(target);
      }
      target.songIds = [...new Set([...target.songIds, ...source.songIds.map((id) => idMap.get(id)).filter(Boolean)])];
    }
    for (const id of backupFavorites) {
      const mapped = idMap.get(id);
      if (mapped) favoriteSongs.add(mapped);
    }
  }
  playlists = playlists.map((playlist) => ({
    ...playlist,
    songIds: playlist.songIds.filter((id) => songs.some((song) => song.id === id))
  }));
  songOrder = [...songOrder.filter((id) => songs.some((song) => song.id === id)), ...songs.map((song) => song.id).filter((id) => !songOrder.includes(id))];
  persistAppData();
  searchInput.value = "";
  favoritesOnly.checked = false;
  document.querySelector("#playlist-filter").value = "all";
  render();
}

document.querySelector("#confirm-import").addEventListener("click", () => {
  if (!pendingImport) return;
  try {
    if (pendingImport.backup) {
      restoreBackup(pendingImport.backup, replaceBackupInput.checked);
    } else {
      const items = [...importPreviewList.querySelectorAll(".import-preview-song")];
      const imported = pendingImport.songs.map((song, index) => {
        const item = items[index];
        const title = item.querySelector(".import-title").value.trim();
        if (!title) throw new Error(`Informe o título da cifra ${index + 1}.`);
        const lyrics = item.querySelector(".import-lyrics").value;
        return {
          ...song,
          id: crypto.randomUUID(),
          title,
          artist: item.querySelector(".import-artist").value.trim(),
          key: item.querySelector(".import-key").value,
          lyrics,
          chords: getChordsFromLyrics(lyrics),
          style: "Minha cifra",
          difficulty: 2,
          custom: true
        };
      });
      songs.push(...imported);
      songOrder.push(...imported.map((song) => song.id));
      persistAppData();
      selectedChords.clear();
      searchInput.value = "";
      favoritesOnly.checked = false;
      render();
      if (imported[0]) openSong(imported[0]);
    }
    saveStatus.textContent = "Importação concluída.";
    pendingImport = undefined;
    importPreview.hidden = true;
    importPreviewList.replaceChildren();
  } catch (error) {
    console.error("Falha ao concluir a importação.", error);
    importPreviewSummary.textContent = error.message;
  }
});

document.querySelector("#backup-data").addEventListener("click", () => {
  const backup = {
    format: "toque-facil-backup",
    version: 1,
    exportedAt: new Date().toISOString(),
    songs,
    playlists,
    songOrder,
    favorites: [...favoriteSongs],
    preferences: {
      chords: [...selectedChords],
      referenceA: Number(document.querySelector("#reference-a").value),
      metronomeBpm: Number(metronomeSlider.value)
    }
  };
  downloadFile("backup-completo-toque-facil.json", JSON.stringify(backup, null, 2), "application/json");
});

const importDropZone = document.querySelector(".import-drop-zone");
for (const eventName of ["dragenter", "dragover"]) {
  importDropZone.addEventListener(eventName, (event) => {
    event.preventDefault();
    importDropZone.classList.add("is-dragging");
  });
}
for (const eventName of ["dragleave", "drop"]) {
  importDropZone.addEventListener(eventName, (event) => {
    event.preventDefault();
    importDropZone.classList.remove("is-dragging");
    if (eventName === "drop" && event.dataTransfer.files[0]) void handleImportFile(event.dataTransfer.files[0]);
  });
}

document.querySelector("#print-song").addEventListener("click", () => {
  const title = escapeHtml(songTitleInput.value.trim() || "Cifra sem título");
  const author = escapeHtml(songAuthorInput.value.trim());
  const lines = lyricsInput.value.split(/\r?\n/).map((line) => {
    const transposed = line.replace(/\[([A-G](?:#|b)?[^\]]*)\]/g, (_, chord) => `[${transposeChord(chord, currentTranspose)}]`);
    return `<div>${escapeHtml(transposed) || "&nbsp;"}</div>`;
  }).join("");
  const printWindow = window.open("", "_blank");
  if (!printWindow) {
    saveStatus.textContent = "Permita pop-ups para gerar o PDF.";
    return;
  }
  printWindow.document.write(`<!doctype html><html lang="pt-BR"><meta charset="utf-8"><title>${title}</title><style>body{font:16px/1.65 Arial,sans-serif;max-width:760px;margin:40px auto;padding:0 24px;color:#222}h1{font-size:28px;margin-bottom:4px}p{color:#666;margin:0 0 30px}.lyrics{white-space:pre-wrap}@media print{body{margin:0 auto}}</style><h1>${title}</h1><p>${author} · Tom ${escapeHtml(transposePitch(songKeyInput.value, currentTranspose))} · ${escapeHtml(songBpmInput.value)} BPM</p><main class="lyrics">${lines}</main><script>window.onload=()=>window.print()<\/script></html>`);
  printWindow.document.close();
});

document.querySelector("#search-cifraclub").addEventListener("click", () => {
  const query = [songTitleInput.value.trim(), songAuthorInput.value.trim()].filter(Boolean).join(" ");
  if (!query) {
    saveStatus.textContent = "Informe o título ou artista para pesquisar.";
    return;
  }
  const search = new URL("https://www.google.com/search");
  search.searchParams.set("q", `site:cifraclub.com.br ${query}`);
  if (!window.open(search.href, "_blank", "noopener,noreferrer")) {
    saveStatus.textContent = "Permita pop-ups para abrir a busca.";
  }
});

const audioFileInput = document.querySelector("#audio-file");
const audioPlayer = document.querySelector("#audio-player");
const audioStatus = document.querySelector("#audio-status");
const analyzeAudioButton = document.querySelector("#analyze-audio");
const exportAudioButton = document.querySelector("#export-audio");
const audioStartInput = document.querySelector("#audio-start");
const audioEndInput = document.querySelector("#audio-end");
const exportAudioSectionButton = document.querySelector("#export-audio-section");
const detectionsContainer = document.querySelector("#chord-detections");
let detectedChords = [];

function selectedAudioRange() {
  const duration = audioPlayer.duration;
  const start = Number(audioStartInput.value);
  const end = Number(audioEndInput.value);
  if (!Number.isFinite(duration) || duration <= 0 || !Number.isFinite(start) || !Number.isFinite(end)
    || start < 0 || end <= start || end > duration) {
    throw new Error("Informe um trecho válido dentro da duração do áudio.");
  }
  return { start, end };
}

function updateAudioRangeControls() {
  const duration = Number.isFinite(audioPlayer.duration) ? audioPlayer.duration : 0;
  audioStartInput.max = String(duration);
  audioEndInput.max = String(duration);
  let start = Math.min(duration, Math.max(0, Number(audioStartInput.value) || 0));
  let end = Number(audioEndInput.value);
  if (!Number.isFinite(end) || end <= 0 || end > duration) end = duration;
  if (end <= start) start = Math.max(0, end - 0.1);
  audioStartInput.value = start.toFixed(1);
  audioEndInput.value = end.toFixed(1);
  document.querySelector("#audio-start-label").textContent = formatTrimTime(start);
  document.querySelector("#audio-end-label").textContent = formatTrimTime(end);
  exportAudioSectionButton.disabled = !audioFile || end - start < 0.1;
}

audioFileInput.addEventListener("change", () => {
  const file = audioFileInput.files?.[0];
  if (!file) return;
  if (file.size > 50 * 1024 * 1024) {
    audioStatus.textContent = "O arquivo excede o limite de 50 MB.";
    audioFileInput.value = "";
    return;
  }
  if (!file.type.startsWith("audio/")) {
    audioStatus.textContent = "Escolha um arquivo de áudio válido.";
    audioFileInput.value = "";
    return;
  }
  if (audioUrl) URL.revokeObjectURL(audioUrl);
  audioFile = file;
  audioUrl = URL.createObjectURL(file);
  audioPlayer.src = audioUrl;
  audioPlayer.hidden = false;
  analyzeAudioButton.disabled = false;
  exportAudioButton.disabled = false;
  audioPlayer.onloadedmetadata = updateAudioRangeControls;
  updateAudioRangeControls();
  detectionsContainer.replaceChildren();
  detectedChords = [];
  document.querySelector("#insert-detected-chords").hidden = true;
  audioStatus.textContent = `${file.name} carregado. Use o botão abaixo para analisar os acordes sugeridos.`;
});

audioPlayer.addEventListener("timeupdate", () => {
  if (!audioPlayer.paused && Number(audioEndInput.value) > 0 && audioPlayer.currentTime >= Number(audioEndInput.value)) {
    audioPlayer.pause();
    audioPlayer.currentTime = Number(audioStartInput.value);
  }
});
audioPlayer.addEventListener("play", () => {
  if (audioPlayer.currentTime < Number(audioStartInput.value) || audioPlayer.currentTime >= Number(audioEndInput.value)) {
    audioPlayer.currentTime = Number(audioStartInput.value);
  }
});

for (const input of [audioStartInput, audioEndInput]) {
  input.addEventListener("change", () => {
    updateAudioRangeControls();
    try {
      selectedAudioRange();
      if (audioPlayer.currentTime < Number(audioStartInput.value) || audioPlayer.currentTime > Number(audioEndInput.value)) {
        audioPlayer.currentTime = Number(audioStartInput.value);
      }
    } catch (error) {
      audioStatus.textContent = error.message;
    }
  });
}

function fft(real, imaginary) {
  const length = real.length;
  for (let i = 1, j = 0; i < length; i++) {
    let bit = length >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      [real[i], real[j]] = [real[j], real[i]];
      [imaginary[i], imaginary[j]] = [imaginary[j], imaginary[i]];
    }
  }
  for (let size = 2; size <= length; size <<= 1) {
    const angle = -2 * Math.PI / size;
    const stepReal = Math.cos(angle);
    const stepImaginary = Math.sin(angle);
    for (let start = 0; start < length; start += size) {
      let factorReal = 1;
      let factorImaginary = 0;
      for (let offset = 0; offset < size / 2; offset++) {
        const even = start + offset;
        const odd = even + size / 2;
        const oddReal = real[odd] * factorReal - imaginary[odd] * factorImaginary;
        const oddImaginary = real[odd] * factorImaginary + imaginary[odd] * factorReal;
        real[odd] = real[even] - oddReal;
        imaginary[odd] = imaginary[even] - oddImaginary;
        real[even] += oddReal;
        imaginary[even] += oddImaginary;
        const nextReal = factorReal * stepReal - factorImaginary * stepImaginary;
        factorImaginary = factorReal * stepImaginary + factorImaginary * stepReal;
        factorReal = nextReal;
      }
    }
  }
}

function estimateChord(samples, sampleRate) {
  const size = 4096;
  const real = new Float64Array(size);
  const imaginary = new Float64Array(size);
  for (let i = 0; i < size; i++) {
    real[i] = samples[i] * (0.5 - 0.5 * Math.cos(2 * Math.PI * i / (size - 1)));
  }
  fft(real, imaginary);
  const chromaEnergy = Array(12).fill(0);
  for (let bin = 4; bin < size / 2; bin++) {
    const frequency = bin * sampleRate / size;
    if (frequency < 68 || frequency > 1200) continue;
    const midi = Math.round(69 + 12 * Math.log2(frequency / 440));
    const magnitude = Math.hypot(real[bin], imaginary[bin]);
    chromaEnergy[(midi % 12 + 12) % 12] += magnitude / Math.sqrt(frequency / 100);
  }
  const total = chromaEnergy.reduce((sum, value) => sum + value, 0);
  if (total < 1e-8) return null;
  const triads = [
    { suffix: "", intervals: [0, 4, 7] },
    { suffix: "m", intervals: [0, 3, 7] }
  ];
  let best = null;
  for (let root = 0; root < 12; root++) {
    for (const triad of triads) {
      const score = triad.intervals.reduce((sum, interval) => sum + chromaEnergy[(root + interval) % 12], 0) / total;
      if (!best || score > best.score) best = { chord: `${pitchClasses[root]}${triad.suffix}`, score };
    }
  }
  return best.score >= 0.34 ? best : null;
}

function formatTime(seconds) {
  return `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, "0")}`;
}

function formatTrimTime(seconds) {
  return `${formatTime(seconds)}.${Math.floor((seconds % 1) * 10)}`;
}

analyzeAudioButton.addEventListener("click", async () => {
  if (!audioFile) return;
  analyzeAudioButton.disabled = true;
  audioStatus.textContent = "Analisando o áudio localmente…";
  detectionsContainer.replaceChildren();
  detectedChords = [];
  try {
    const { start: rangeStart, end: rangeEnd } = selectedAudioRange();
    if (rangeEnd - rangeStart > 600) throw new Error("Para análise, selecione um trecho de até 10 minutos.");
    const context = new AudioContext();
    let decoded;
    try {
      decoded = await context.decodeAudioData(await audioFile.arrayBuffer());
    } finally {
      if (context.state !== "closed") await context.close();
    }
    const firstSample = Math.floor(rangeStart * decoded.sampleRate);
    const lastSample = Math.min(decoded.length, Math.floor(rangeEnd * decoded.sampleRate));
    const input = decoded.getChannelData(0).subarray(firstSample, lastSample);
    const stride = Math.max(1, Math.floor(decoded.sampleRate / 11025));
    const sampleRate = decoded.sampleRate / stride;
    const samples = new Float32Array(Math.floor(input.length / stride));
    for (let i = 0; i < samples.length; i++) samples[i] = input[i * stride];
    const frameSize = 4096;
    const hopSize = Math.floor(sampleRate);
    let analyzedFrames = 0;
    for (let start = 0; start + frameSize <= samples.length; start += hopSize) {
      const estimate = estimateChord(samples.subarray(start, start + frameSize), sampleRate);
      const time = rangeStart + start / sampleRate;
      analyzedFrames++;
      if (estimate && detectedChords.at(-1)?.chord !== estimate.chord) {
        detectedChords.push({ chord: estimate.chord, time, confidence: Math.round(estimate.score * 100) });
      }
      if (detectedChords.length >= 100) break;
      if (analyzedFrames % 8 === 0) {
        audioStatus.textContent = `Analisando… ${formatTime(time)} de ${formatTime(rangeEnd)}`;
        await new Promise((resolve) => setTimeout(resolve, 0));
      }
    }
    if (!detectedChords.length) {
      audioStatus.textContent = "Não foi possível identificar acordes claros. Tente outro trecho ou um áudio com menos ruído.";
      return;
    }
    detectionsContainer.replaceChildren(...detectedChords.map((item) => {
      const badge = document.createElement("span");
      badge.className = "detected-chord";
      badge.textContent = `${formatTime(item.time)} · ${item.chord}`;
      badge.title = `Confiança relativa: ${item.confidence}% (estimativa)`;
      badge.tabIndex = 0;
      badge.setAttribute("role", "button");
      badge.setAttribute("aria-label", `Ir para ${formatTime(item.time)}, acorde ${item.chord}`);
      const seek = () => {
        audioPlayer.currentTime = item.time;
        audioPlayer.play().catch((error) => console.warn("Não foi possível reproduzir o trecho selecionado.", error));
      };
      badge.addEventListener("click", seek);
      badge.addEventListener("keydown", (event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          seek();
        }
      });
      return badge;
    }));
    document.querySelector("#insert-detected-chords").hidden = false;
    audioStatus.textContent = `${detectedChords.length} sugestões encontradas. Confira os acordes antes de usar; a estimativa pode confundir notas e harmônicos.`;
  } catch (error) {
    console.error("Falha ao analisar o áudio importado.", error);
    audioStatus.textContent = `Não foi possível analisar este áudio: ${error.message}`;
  } finally {
    analyzeAudioButton.disabled = false;
  }
});

document.querySelector("#insert-detected-chords").addEventListener("click", () => {
  if (!detectedChords.length) return;
  if (!currentSongId) newSong();
  const progression = detectedChords.map((item) => `[${item.chord}]`).join(" ");
  lyricsInput.value = `${lyricsInput.value.trim()}${lyricsInput.value.trim() ? "\n\n" : ""}Sugestões detectadas do áudio:\n${progression}`;
  scheduleSongSave();
  document.querySelector("#editor").scrollIntoView({ behavior: "smooth", block: "start" });
});

exportAudioButton.addEventListener("click", () => {
  if (!audioFile || !audioUrl) return;
  const link = document.createElement("a");
  link.href = audioUrl;
  link.download = audioFile.name;
  link.click();
});

function encodeWav(audioBuffer, start, end) {
  const sampleRate = audioBuffer.sampleRate;
  const firstFrame = Math.floor(start * sampleRate);
  const lastFrame = Math.min(audioBuffer.length, Math.floor(end * sampleRate));
  const frameCount = lastFrame - firstFrame;
  const channelCount = audioBuffer.numberOfChannels;
  const bytesPerSample = 2;
  const dataSize = frameCount * channelCount * bytesPerSample;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);
  const writeText = (offset, value) => [...value].forEach((character, index) => view.setUint8(offset + index, character.charCodeAt(0)));
  writeText(0, "RIFF");
  view.setUint32(4, 36 + dataSize, true);
  writeText(8, "WAVE");
  writeText(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, channelCount, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * channelCount * bytesPerSample, true);
  view.setUint16(32, channelCount * bytesPerSample, true);
  view.setUint16(34, bytesPerSample * 8, true);
  writeText(36, "data");
  view.setUint32(40, dataSize, true);
  let offset = 44;
  const channels = Array.from({ length: channelCount }, (_, channel) => audioBuffer.getChannelData(channel));
  for (let frame = firstFrame; frame < lastFrame; frame++) {
    for (const channel of channels) {
      const sample = Math.max(-1, Math.min(1, channel[frame]));
      view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
      offset += bytesPerSample;
    }
  }
  return new Blob([buffer], { type: "audio/wav" });
}

exportAudioSectionButton.addEventListener("click", async () => {
  if (!audioFile) return;
  let context;
  try {
    const { start, end } = selectedAudioRange();
    audioStatus.textContent = "Preparando o trecho WAV…";
    context = new AudioContext();
    const decoded = await context.decodeAudioData(await audioFile.arrayBuffer());
    const wav = encodeWav(decoded, start, end);
    const baseName = audioFile.name.replace(/\.[^.]+$/, "") || "audio";
    const url = URL.createObjectURL(wav);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${baseName}-${formatTrimTime(start).replace(":", "-")}-${formatTrimTime(end).replace(":", "-")}.wav`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    audioStatus.textContent = `Trecho de ${formatTrimTime(start)} a ${formatTrimTime(end)} exportado como WAV.`;
  } catch (error) {
    console.error("Falha ao exportar o trecho de áudio.", error);
    audioStatus.textContent = `Não foi possível exportar o trecho: ${error.message}`;
  } finally {
    if (context && context.state !== "closed") await context.close();
  }
});

const metronomeSlider = document.querySelector("#metronome-bpm");
const metronomeValue = document.querySelector("#metronome-value");
const beatIndicator = document.querySelector("#beat-indicator");
const metronomeToggle = document.querySelector("#metronome-toggle");
metronomeSlider.value = String(Math.min(220, Math.max(40, Number(preferences.metronomeBpm) || 90)));
metronomeValue.textContent = metronomeSlider.value;
metronomeSlider.addEventListener("input", () => {
  metronomeValue.textContent = metronomeSlider.value;
  songBpmInput.value = metronomeSlider.value;
  savePreferences();
});
for (const button of document.querySelectorAll(".beat-options button")) {
  button.addEventListener("click", () => {
    metronomeBeatsPerBar = Number(button.dataset.beats);
    for (const option of document.querySelectorAll(".beat-options button")) option.classList.toggle("selected", option === button);
    beatIndicator.replaceChildren(...Array.from({ length: metronomeBeatsPerBar }, () => document.createElement("span")));
  });
}

function playMetronomeBeat() {
  const rhythmId = document.querySelector("#rhythm-pattern").value;
  const patterns = {
    basic: Array(metronomeBeatsPerBar).fill("down"),
    pop: ["down", "", "down", "up", "", "up", "down", "up"].slice(0, metronomeBeatsPerBar * 2),
    ballad: ["down", "", "", "down", "up", "", "", "up", "down", "up"].slice(0, metronomeBeatsPerBar * 2)
  };
  const pattern = patterns[rhythmId];
  const step = metronomeBeat % pattern.length;
  const stroke = pattern[step];
  const beat = Math.floor(step * metronomeBeatsPerBar / pattern.length);
  if (stroke) {
    const oscillator = metronomeContext.createOscillator();
    const gain = metronomeContext.createGain();
    oscillator.type = "triangle";
    oscillator.frequency.value = stroke === "down" ? (beat === 0 ? 520 : 390) : 300;
    gain.gain.setValueAtTime(0.09, metronomeContext.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, metronomeContext.currentTime + 0.07);
    oscillator.connect(gain);
    gain.connect(metronomeContext.destination);
    oscillator.start();
    oscillator.stop(metronomeContext.currentTime + 0.075);
  }
  const indicators = [...beatIndicator.children];
  indicators.forEach((item, index) => {
    item.classList.toggle("active", index === beat);
    item.textContent = index === beat ? (stroke === "down" ? "↓" : stroke === "up" ? "↑" : "·") : "";
  });
  metronomeBeat++;
}

function startMetronome() {
  const patternId = document.querySelector("#rhythm-pattern").value;
  const totalSteps = patternId === "basic" ? metronomeBeatsPerBar : metronomeBeatsPerBar * 2;
  const interval = 60000 / Number(metronomeSlider.value) * metronomeBeatsPerBar / totalSteps;
  metronomeTimer = setInterval(playMetronomeBeat, interval);
}

metronomeToggle.addEventListener("click", async () => {
  if (metronomeTimer) {
    clearInterval(metronomeTimer);
    metronomeTimer = undefined;
    if (metronomeContext && metronomeContext.state !== "closed") await metronomeContext.close();
    metronomeToggle.textContent = "▶ Iniciar exercício";
    beatIndicator.querySelectorAll("span").forEach((item) => item.classList.remove("active"));
    return;
  }
  metronomeContext = new AudioContext();
  await metronomeContext.resume();
  metronomeBeat = 0;
  playMetronomeBeat();
  startMetronome();
  metronomeToggle.textContent = "■ Parar exercício";
});
document.querySelector("#rhythm-pattern").addEventListener("change", () => {
  if (metronomeTimer) {
    clearInterval(metronomeTimer);
    metronomeBeat = 0;
    playMetronomeBeat();
    startMetronome();
  }
});
metronomeSlider.addEventListener("change", () => {
  if (metronomeTimer) {
    clearInterval(metronomeTimer);
    startMetronome();
  }
});

const referenceAInput = document.querySelector("#reference-a");
referenceAInput.value = String(Math.min(446, Math.max(432, Number(preferences.referenceA) || 440)));
referenceAInput.addEventListener("change", savePreferences);
document.querySelector("#install-app").addEventListener("click", async () => {
  if (!installPrompt) return;
  installPrompt.prompt();
  await installPrompt.userChoice;
  installPrompt = undefined;
  document.querySelector("#install-app").hidden = true;
});

window.addEventListener("beforeinstallprompt", (event) => {
  event.preventDefault();
  installPrompt = event;
  document.querySelector("#install-app").hidden = false;
});
if ("serviceWorker" in navigator && location.protocol.startsWith("http")) {
  navigator.serviceWorker.register("./service-worker.js").catch((error) => console.error("Não foi possível ativar o modo offline.", error));
}

const noteNames = ["Dó", "Dó♯", "Ré", "Ré♯", "Mi", "Fá", "Fá♯", "Sol", "Sol♯", "Lá", "Lá♯", "Si"];
const tunerButton = document.querySelector("#tuner-toggle");
const tunerStatus = document.querySelector("#tuner-status");
const tunerNote = document.querySelector("#tuner-note");
const tunerOctave = document.querySelector("#tuner-octave");
const tunerGuidance = document.querySelector("#tuner-guidance");
const meterNeedle = document.querySelector("#meter-needle");
const liveDot = document.querySelector("#live-dot");
let audioContext;
let mediaStream;
let animationFrame;

function estimatePitch(buffer, sampleRate) {
  let rms = 0;
  for (let i = 0; i < buffer.length; i++) rms += buffer[i] * buffer[i];
  rms = Math.sqrt(rms / buffer.length);
  if (rms < 0.012) return null;

  const minOffset = Math.floor(sampleRate / 1000);
  const maxOffset = Math.min(Math.floor(sampleRate / 65), Math.floor(buffer.length / 2));
  const correlations = new Float32Array(maxOffset + 1);
  for (let offset = minOffset; offset <= maxOffset; offset++) {
    let product = 0;
    let firstEnergy = 0;
    let secondEnergy = 0;
    for (let i = 0; i < buffer.length - offset; i++) {
      const first = buffer[i];
      const second = buffer[i + offset];
      product += first * second;
      firstEnergy += first * first;
      secondEnergy += second * second;
    }
    correlations[offset] = product / Math.sqrt(firstEnergy * secondEnergy);
  }

  for (let offset = minOffset + 1; offset < maxOffset; offset++) {
    const previous = correlations[offset - 1];
    const correlation = correlations[offset];
    const next = correlations[offset + 1];
    if (correlation > 0.6 && correlation >= previous && correlation > next) {
      const curvature = previous - 2 * correlation + next;
      const refinedOffset = offset + 0.5 * (previous - next) / curvature;
      const frequency = sampleRate / refinedOffset;
      return Number.isFinite(frequency) ? frequency : null;
    }
  }
  return null;
}

function drawTuner() {
  const analyser = audioContext.createAnalyser();
  analyser.fftSize = 4096;
  const source = audioContext.createMediaStreamSource(mediaStream);
  const buffer = new Float32Array(analyser.fftSize);
  source.connect(analyser);
  tunerStatus.textContent = "OUVINDO O AMBIENTE";
  liveDot.classList.add("is-live");
  tunerButton.innerHTML = '<span aria-hidden="true">■</span> Parar afinador';

  let lastAnalysisTime = 0;
  const update = (timestamp) => {
    if (timestamp - lastAnalysisTime >= 100) {
      lastAnalysisTime = timestamp;
      analyser.getFloatTimeDomainData(buffer);
      const frequency = estimatePitch(buffer, audioContext.sampleRate);
      if (frequency) {
        const referenceA = Number(referenceAInput.value);
        const midi = Math.round(69 + 12 * Math.log2(frequency / referenceA));
        const exactFrequency = referenceA * 2 ** ((midi - 69) / 12);
        const cents = Math.round(1200 * Math.log2(frequency / exactFrequency));
        const noteIndex = ((midi % 12) + 12) % 12;
        const octave = Math.floor(midi / 12) - 1;
        tunerNote.textContent = noteNames[noteIndex];
        tunerOctave.textContent = `${frequency.toFixed(1)} Hz · Oitava ${octave}`;
        tunerGuidance.textContent = Math.abs(cents) <= 5 ? "Afinada! Pode tocar 🎶" : cents < 0 ? `${Math.abs(cents)} cents abaixo · aperte um pouco` : `${cents} cents acima · afrouxe um pouco`;
        meterNeedle.style.left = `${50 + Math.max(-48, Math.min(48, cents))}%`;
        meterNeedle.style.background = Math.abs(cents) <= 5 ? "#a9d8a2" : "#f0bd87";
      } else {
        tunerNote.textContent = "—";
        tunerOctave.textContent = "Toque uma corda";
        tunerGuidance.textContent = "Sua nota aparecerá aqui";
        meterNeedle.style.left = "50%";
        meterNeedle.style.background = "#f0bd87";
      }
    }
    animationFrame = requestAnimationFrame(update);
  };
  animationFrame = requestAnimationFrame(update);
}

async function stopTuner() {
  cancelAnimationFrame(animationFrame);
  if (mediaStream) {
    for (const track of mediaStream.getTracks()) track.stop();
    mediaStream = undefined;
  }
  if (audioContext && audioContext.state !== "closed") await audioContext.close();
  audioContext = undefined;
  tunerButton.disabled = false;
  tunerButton.innerHTML = '<span aria-hidden="true">🎙</span> Começar a afinar';
  tunerStatus.textContent = "PRONTO PARA AFINAR";
  liveDot.classList.remove("is-live");
  tunerNote.textContent = "—";
  tunerOctave.textContent = "Toque uma corda";
  tunerGuidance.textContent = "Sua nota aparecerá aqui";
  meterNeedle.style.left = "50%";
}

tunerButton.addEventListener("click", async () => {
  if (mediaStream) {
    await stopTuner();
    return;
  }
  if (!navigator.mediaDevices?.getUserMedia) {
    tunerGuidance.textContent = "Este navegador não oferece acesso ao microfone. Abra em um navegador atualizado via HTTPS ou localhost.";
    return;
  }
  tunerButton.disabled = true;
  tunerStatus.textContent = "AGUARDANDO MICROFONE";
  try {
    mediaStream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, autoGainControl: false, noiseSuppression: false } });
    audioContext = new AudioContext();
    await audioContext.resume();
    drawTuner();
  } catch (error) {
    console.error("Não foi possível iniciar o afinador.", error);
    tunerStatus.textContent = "MICROFONE INDISPONÍVEL";
    tunerGuidance.textContent = error.name === "NotAllowedError"
      ? "Permita o acesso ao microfone nas configurações do navegador e tente novamente."
      : "Não foi possível iniciar o microfone. Verifique a conexão e as permissões do dispositivo.";
    if (mediaStream) {
      for (const track of mediaStream.getTracks()) track.stop();
      mediaStream = undefined;
    }
    if (audioContext && audioContext.state !== "closed") await audioContext.close();
    audioContext = undefined;
  } finally {
    tunerButton.disabled = false;
  }
});

window.addEventListener("pagehide", () => {
  cancelAnimationFrame(animationFrame);
  if (mediaStream) for (const track of mediaStream.getTracks()) track.stop();
  if (audioContext && audioContext.state !== "closed") void audioContext.close();
  if (metronomeTimer) clearInterval(metronomeTimer);
  if (metronomeContext && metronomeContext.state !== "closed") void metronomeContext.close();
  if (audioUrl) URL.revokeObjectURL(audioUrl);
});

newSong();
render();
