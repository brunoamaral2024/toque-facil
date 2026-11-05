import assert from "node:assert/strict";
import test from "node:test";
import {
  APP_STORAGE_KEY,
  createStudioProProject,
  createBackup,
  getChordsFromLyrics,
  getVisibleSongs,
  mergeBackupData,
  normalizeImportedSong,
  normalizeChordFamily,
  readAppState,
  transposeChord,
  validateBackup,
  writeAppState
} from "../app-core.mjs";

function createStorage(initial = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem(key) {
      return values.has(key) ? values.get(key) : null;
    },
    setItem(key, value) {
      values.set(key, String(value));
    },
    values
  };
}

test("saves all app data atomically under one storage key", () => {
  const storage = createStorage();
  const state = {
    songs: [{ id: "s1", title: "Canção" }],
    playlists: [{ id: "p1", name: "Favoritas", songIds: ["s1"] }],
    songOrder: ["s1"],
    favorites: ["s1"],
    preferences: { referenceA: 442 }
  };

  writeAppState(storage, state);

  assert.deepEqual(readAppState(storage), {
    format: "toque-facil-app-data",
    version: 1,
    ...state
  });
  assert.deepEqual([...storage.values.keys()], [APP_STORAGE_KEY]);
});

test("does not report success when the browser refuses a save", () => {
  const storage = {
    getItem: () => null,
    setItem: () => {
      throw new DOMException("Quota exceeded", "QuotaExceededError");
    }
  };

  assert.throws(() => writeAppState(storage, {
    songs: [],
    playlists: [],
    songOrder: [],
    favorites: [],
    preferences: {}
  }), { name: "QuotaExceededError" });
});

test("rejects malformed saved app data and backups", () => {
  assert.throws(() => readAppState(createStorage({
    [APP_STORAGE_KEY]: JSON.stringify({ format: "toque-facil-app-data", version: 1, songs: [] })
  })), /formato inválido/);
  assert.throws(() => validateBackup({ songs: [], playlists: "invalid" }), /Backup incompleto/);
  assert.doesNotThrow(() => validateBackup({ songs: [], playlists: [], favorites: [] }));
});

test("exports and merges backups while retaining existing songs and mapping lists", () => {
  const state = {
    songs: [{ id: "local", title: "Existing", artist: "Ana", lyrics: "[C]a", chords: ["C"], custom: true }],
    playlists: [{ id: "local-list", name: "Repertório", songIds: ["local"] }],
    songOrder: ["local"],
    favorites: ["local"],
    preferences: { referenceA: 442 }
  };
  const backup = createBackup({
    songs: [
      { id: "backup-existing", title: "Existing", artist: "Ana", lyrics: "[G]b" },
      { id: "backup-new", title: "New", artist: "Bia", lyrics: "[Am]c" }
    ],
    playlists: [{ id: "backup-list", name: "Repertório", songIds: ["backup-existing", "backup-new"] }],
    songOrder: ["backup-existing", "backup-new"],
    favorites: ["backup-new"],
    preferences: { referenceA: 440 }
  }, "2026-01-01T00:00:00.000Z");
  const merged = mergeBackupData(backup, state);

  assert.equal(backup.format, "toque-facil-backup");
  assert.equal(backup.exportedAt, "2026-01-01T00:00:00.000Z");
  assert.deepEqual(merged.songs.map((song) => song.id), ["local", "backup-new"]);
  assert.deepEqual(merged.playlists[0].songIds, ["local", "backup-new"]);
  assert.deepEqual(merged.favorites, ["local", "backup-new"]);
  assert.deepEqual(merged.songOrder, ["local", "backup-new"]);
});

test("normalizes imported ChordPro songs and ignores invalid entries", () => {
  const song = normalizeImportedSong({ title: "Teste", lyrics: "[C]Verso [Am]fim" }, "Importada");

  assert.equal(song.title, "Teste");
  assert.deepEqual(song.chords, ["C", "Am"]);
  assert.equal(song.custom, true);
  assert.equal(normalizeImportedSong(null, "Importada"), null);
  assert.deepEqual(getChordsFromLyrics("[C] [C] [G7]"), ["C", "G7"]);
});

test("imports Cifras Studio Pro projects preserving metadata and performance order", () => {
  const song = normalizeImportedSong({
    titulo: "Canção teste",
    autor: "Grupo",
    tom: "D",
    bpm: "120",
    compasso: "4/4",
    bancoDePartes: [
      { id: "V1", t: "Verso", c: "[D]linha do verso" },
      { id: "R", t: "Refrão", c: "[G]linha do refrão" }
    ],
    mapaAtual: [
      { id: "R", t: "Refrão", c: "[G]linha do refrão" },
      { id: "V1", t: "Verso", c: "[D]linha do verso", com: "Todos juntos" },
      { id: "R", t: "Refrão", c: "[G]linha do refrão" }
    ]
  }, "projeto");

  assert.equal(song.title, "Canção teste");
  assert.equal(song.artist, "Grupo");
  assert.equal(song.key, "D");
  assert.equal(song.tempo, 120);
  assert.equal(song.compasso, "4/4");
  assert.equal(song.lyrics, "Refrão\n[G]linha do refrão\n\nVerso — Todos juntos\n[D]linha do verso\n\nRefrão\n[G]linha do refrão");
  assert.deepEqual(song.chords, ["G", "D"]);
});

test("exports an editable Toque Fácil song in the Cifras Studio Pro project format", () => {
  const project = createStudioProProject({
    title: "Canção teste",
    artist: "Grupo",
    key: "D",
    tempo: 120,
    compasso: "3/4",
    lyrics: "[D]linha\n\nRefrão\n[G]fim"
  });
  const imported = normalizeImportedSong(project, "arquivo");

  assert.equal(project.titulo, "Canção teste");
  assert.equal(project.autor, "Grupo");
  assert.equal(project.tom, "D");
  assert.equal(project.bpm, "120");
  assert.equal(project.compasso, "3/4");
  assert.equal(project.bancoDePartes[0].c, "[D]linha\n\nRefrão\n[G]fim");
  assert.deepEqual(project.mapaAtual.map((section) => section.id), ["C1"]);
  assert.equal(imported.lyrics, "[D]linha\n\nRefrão\n[G]fim");
  assert.throws(() => createStudioProProject({ title: "Sem conteúdo", lyrics: "" }), /título e o conteúdo/);
});

test("transposes chord roots and slash bass notes without changing chord quality", () => {
  assert.equal(transposeChord("Cmaj7/G", 2), "Dmaj7/A");
  assert.equal(transposeChord("F#m", -1), "Fm");
  assert.equal(transposeChord("N.C.", 3), "N.C.");
  assert.equal(normalizeChordFamily("Am/G"), "Am");
});

test("filters and sorts the catalog by chords, search, playlists, and favorites", () => {
  const songs = [
    { id: "one", title: "Bossa", artist: "Ana", style: "MPB", chords: ["C", "Am"], difficulty: 2 },
    { id: "two", title: "Rock", artist: "Beto", style: "Rock", chords: ["G", "D"], difficulty: 1 }
  ];
  const common = {
    songs,
    selectedChords: new Set(["Am"]),
    query: "",
    playlistFilter: "all",
    playlists: [],
    favoritesOnly: false,
    favoriteSongs: new Set(["two"]),
    sort: "manual",
    songOrder: ["two", "one"]
  };

  assert.deepEqual(getVisibleSongs(common).map((song) => song.id), ["one"]);
  assert.deepEqual(getVisibleSongs({ ...common, selectedChords: new Set(), sort: "favorites" }).map((song) => song.id), ["two", "one"]);
  assert.deepEqual(getVisibleSongs({ ...common, selectedChords: new Set(), playlistFilter: "mpb", playlists: [{ id: "mpb", songIds: ["one"] }] }).map((song) => song.id), ["one"]);
  assert.deepEqual(getVisibleSongs({ ...common, selectedChords: new Set(), query: "ROCK", favoritesOnly: true }).map((song) => song.id), ["two"]);
});
