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

export function getVisibleSongs({ songs, selectedChords, query, playlistFilter, playlists, favoritesOnly, favoriteSongs, sort, songOrder }) {
  const normalizedQuery = query.trim().toLocaleLowerCase("pt-BR");
  const result = songs.filter((song) => {
    const hasEveryChord = [...selectedChords].every((chord) => song.chords.some((songChord) => normalizeChordFamily(songChord) === normalizeChordFamily(chord)));
    const matchesQuery = !normalizedQuery || [song.title, song.artist, song.style, ...song.chords]
      .some((value) => value.toLocaleLowerCase("pt-BR").includes(normalizedQuery));
    const matchesPlaylist = playlistFilter === "all" || playlists.find((playlist) => playlist.id === playlistFilter)?.songIds.includes(song.id);
    return hasEveryChord && matchesQuery && matchesPlaylist && (!favoritesOnly || favoriteSongs.has(song.id));
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

export function normalizeImportedSong(song, fallbackTitle) {
  if (!song || typeof song !== "object" || Array.isArray(song)) return null;
  const title = song.title || song.titulo || song.name || fallbackTitle;
  const lyrics = song.lyrics || song.letter || song.letra || song.lyricsText || song.cifra || song.text || "";
  if (typeof title !== "string" || typeof lyrics !== "string") return null;
  const artist = song.artist || song.author || song.autor || song.artista || "";
  return {
    id: typeof song.id === "string" ? song.id : crypto.randomUUID(),
    title,
    artist: typeof artist === "string" ? artist : "",
    key: song.key || song.tom || "C",
    tempo: Number(song.tempo || song.bpm) || 90,
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
