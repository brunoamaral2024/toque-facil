export const APP_STORAGE_KEY = "toque-facil-app-data";

const pitchClasses = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
const pitchIndexes = { C: 0, "B#": 0, "C#": 1, Db: 1, D: 2, "D#": 3, Eb: 3, E: 4, Fb: 4, "E#": 5, F: 5, "F#": 6, Gb: 6, G: 7, "G#": 8, Ab: 8, A: 9, "A#": 10, Bb: 10, B: 11, Cb: 11 };

export function readAppState(storage) {
  const contents = storage.getItem(APP_STORAGE_KEY);
  if (contents === null) return null;
  const state = JSON.parse(contents);
  if (!state || state.format !== "toque-facil-app-data" || state.version !== 1
    || !Array.isArray(state.songs) || !Array.isArray(state.playlists)
    || !Array.isArray(state.songOrder) || !Array.isArray(state.favorites)
    || !state.preferences || typeof state.preferences !== "object") {
    throw new Error("Os dados salvos têm um formato inválido. Exporte um backup antes de continuar.");
  }
  return state;
}

export function writeAppState(storage, state) {
  const contents = JSON.stringify({
    format: "toque-facil-app-data",
    version: 1,
    songs: state.songs,
    playlists: state.playlists,
    songOrder: state.songOrder,
    favorites: state.favorites,
    preferences: state.preferences
  });
  storage.setItem(APP_STORAGE_KEY, contents);
}

export function transposePitch(pitch, steps) {
  const index = pitchIndexes[pitch];
  return index === undefined ? pitch : pitchClasses[(index + steps % 12 + 12) % 12];
}

export function transposeChord(chord, steps) {
  if (!steps) return chord;
  const match = chord.match(/^([A-G](?:#|b)?)(.*?)(?:\/([A-G](?:#|b)?)(.*))?$/);
  if (!match) return chord;
  return `${transposePitch(match[1], steps)}${match[2]}${match[3] ? `/${transposePitch(match[3], steps)}${match[4]}` : ""}`;
}

export function normalizeChordFamily(chord) {
  const match = chord.match(/^([A-G](?:#|b)?)(.*)$/);
  if (!match) return chord;
  const suffix = match[2].replace(/\/.*$/, "");
  const isMinor = /^(?:m(?!aj)|min)/i.test(suffix);
  return `${transposePitch(match[1], 0)}${isMinor ? "m" : ""}`;
}

export function getChordsFromLyrics(lyrics) {
  return [...new Set([...lyrics.matchAll(/\[([A-G](?:#|b)?(?:maj|min|m|dim|aug|sus|add|[0-9+#b]*)?(?:\/[A-G](?:#|b)?)?)\]/g)].map((match) => match[1]))];
}

export function getSongChordCount(song) {
  return new Set(Array.isArray(song?.chords) ? song.chords : []).size;
}

export function getChordGroupCounts(songs) {
  const counts = { all: songs.length, 3: 0, 4: 0, "5+": 0 };
  for (const song of songs) {
    const count = getSongChordCount(song);
    if (count === 3) counts[3]++;
    else if (count === 4) counts[4]++;
    else if (count >= 5) counts["5+"]++;
  }
  return counts;
}

function normalizeStrictChord(chord) {
  const match = chord.match(/^([A-G](?:#|b)?)(.*)$/);
  return match ? `${transposePitch(match[1], 0)}${match[2]}` : chord;
}

export function getVisibleSongs({
  songs,
  selectedChords,
  query,
  playlistFilter,
  playlists,
  favoritesOnly,
  favoriteSongs,
  sort,
  songOrder,
  strictChordsOnly = false,
  chordGroup = "all"
}) {
  const normalizedQuery = query.trim().toLocaleLowerCase("pt-BR");
  const knownChords = new Set([...selectedChords].map(normalizeStrictChord));
  const result = songs.filter((song) => {
    const songChords = Array.isArray(song.chords) ? song.chords : [];
    const hasEveryChord = [...selectedChords].every((chord) => songChords.some((songChord) => normalizeChordFamily(songChord) === normalizeChordFamily(chord)));
    const hasOnlyKnownChords = !strictChordsOnly
      || (knownChords.size > 0 && songChords.length > 0 && songChords.every((chord) => knownChords.has(normalizeStrictChord(chord))));
    const chordCount = getSongChordCount(song);
    const matchesChordGroup = chordGroup === "all" || (chordGroup === "5+" ? chordCount >= 5 : chordCount === Number(chordGroup));
    const matchesQuery = !normalizedQuery || [song.title, song.artist, song.style, ...songChords]
      .some((value) => value.toLocaleLowerCase("pt-BR").includes(normalizedQuery));
    const matchesPlaylist = playlistFilter === "all" || playlists.find((playlist) => playlist.id === playlistFilter)?.songIds.includes(song.id);
    return hasEveryChord && hasOnlyKnownChords && matchesChordGroup && matchesQuery && matchesPlaylist
      && (!favoritesOnly || favoriteSongs.has(song.id));
  });

  if (sort === "name") result.sort((a, b) => a.title.localeCompare(b.title, "pt-BR"));
  else if (sort === "favorites") {
    result.sort((a, b) => Number(favoriteSongs.has(b.id)) - Number(favoriteSongs.has(a.id)) || a.difficulty - b.difficulty);
  } else if (sort === "easy") {
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

function getStudioProLyrics(project) {
  const sections = Array.isArray(project.bancoDePartes) ? project.bancoDePartes : [];
  const sectionById = new Map(sections.filter((section) => section && typeof section.id === "string")
    .map((section) => [section.id, section]));
  const orderedSections = Array.isArray(project.mapaAtual) && project.mapaAtual.length
    ? project.mapaAtual
    : sections;

  return orderedSections.map((instance) => {
    if (!instance || typeof instance !== "object") return "";
    const section = typeof instance.id === "string" ? sectionById.get(instance.id) : undefined;
    const rawTitle = [instance.t, instance.title, section?.t, section?.title]
      .find((value) => typeof value === "string");
    const title = rawTitle?.trim() || "";
    const rawContents = [instance.c, instance.lyrics, section?.c, section?.lyrics]
      .find((value) => typeof value === "string" && value.trim());
    const contents = rawContents?.trim() || "";
    const note = typeof instance.com === "string" ? instance.com.trim() : "";
    if (!contents) return "";
    const heading = title.toLocaleLowerCase("pt-BR") === "cifra"
      ? note
      : [title, note].filter(Boolean).join(" — ");
    return heading ? `${heading}\n${contents}` : contents;
  }).filter(Boolean).join("\n\n");
}

export function createStudioProProject(song) {
  const title = typeof song?.title === "string" ? song.title.trim() : "";
  const lyrics = typeof song?.lyrics === "string" ? song.lyrics.trim() : "";
  if (!title || !lyrics) throw new Error("Informe o título e o conteúdo da cifra.");
  const section = { id: "C1", t: "Cifra", c: lyrics, cor: "#8a0000" };
  const tempo = Number(song.tempo);
  return {
    titulo: title,
    autor: typeof song.artist === "string" ? song.artist.trim() : "",
    tom: typeof song.key === "string" && song.key ? song.key : "C",
    bpm: String(Number.isFinite(tempo) && tempo > 0 ? tempo : 90),
    compasso: typeof song.compasso === "string" ? song.compasso.trim() : "",
    bancoDePartes: [section],
    mapaAtual: [{ ...section, com: "", mesclar: false, ocultar: false }]
  };
}

export function normalizeImportedSong(song, fallbackTitle) {
  if (!song || typeof song !== "object" || Array.isArray(song)) return null;
  const title = song.title || song.titulo || song.name || fallbackTitle;
  const lyrics = song.lyrics || song.letter || song.letra || song.lyricsText || song.cifra || song.text
    || getStudioProLyrics(song);
  if (typeof title !== "string" || typeof lyrics !== "string") return null;
  const artist = song.artist || song.author || song.autor || song.artista || "";
  return {
    id: typeof song.id === "string" ? song.id : crypto.randomUUID(),
    title,
    artist: typeof artist === "string" ? artist : "",
    key: song.key || song.tom || "C",
    tempo: Number(song.tempo || song.bpm) || 90,
    compasso: typeof song.compasso === "string" ? song.compasso : "",
    lyrics,
    style: "Minha cifra",
    chords: getChordsFromLyrics(lyrics),
    difficulty: 2,
    custom: true
  };
}

export function validateBackup(backup) {
  if (!backup || typeof backup !== "object" || !Array.isArray(backup.songs) || !Array.isArray(backup.playlists)
    || (backup.favorites !== undefined && !Array.isArray(backup.favorites))) {
    throw new Error("Backup incompleto ou inválido.");
  }
}

export function mergeBackupData(backup, current) {
  validateBackup(backup);
  const songs = [...current.songs];
  const playlists = current.playlists.map((playlist) => ({ ...playlist, songIds: [...playlist.songIds] }));
  const songOrder = [...current.songOrder];
  const favorites = new Set(current.favorites);
  const idMap = new Map();

  for (const source of backup.songs) {
    const imported = normalizeImportedSong(source, "Cifra importada");
    if (!imported) continue;
    const existing = songs.find((song) => song.title.toLocaleLowerCase("pt-BR") === imported.title.toLocaleLowerCase("pt-BR")
      && song.artist.toLocaleLowerCase("pt-BR") === imported.artist.toLocaleLowerCase("pt-BR"));
    const sourceId = typeof source?.id === "string" ? source.id : imported.id;
    if (existing) idMap.set(sourceId, existing.id);
    else {
      songs.push(imported);
      songOrder.push(imported.id);
      idMap.set(sourceId, imported.id);
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
  for (const id of backup.favorites || []) {
    const mapped = idMap.get(id);
    if (mapped) favorites.add(mapped);
  }

  const validIds = new Set(songs.map((song) => song.id));
  return {
    songs,
    playlists: playlists.map((playlist) => ({ ...playlist, songIds: playlist.songIds.filter((id) => validIds.has(id)) })),
    songOrder: [...songOrder.filter((id) => validIds.has(id)), ...songs.map((song) => song.id).filter((id) => !songOrder.includes(id))],
    favorites: [...favorites].filter((id) => validIds.has(id))
  };
}

export function createBackup(state, exportedAt = new Date().toISOString()) {
  return {
    format: "toque-facil-backup",
    version: 1,
    exportedAt,
    songs: state.songs,
    playlists: state.playlists,
    songOrder: state.songOrder,
    favorites: state.favorites,
    preferences: state.preferences
  };
}
