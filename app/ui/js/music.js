// 音乐：本地曲库扫描 / 播放联动唱歌状态 / 每日一曲。

import { invoke, assetUrl } from './env.js';
import { on } from './bus.js';

let tracks = [];
let playlist = { songs: [] };
let audio = null;
let ctx = null; // { sm, fire, addSong, say }
let current = null;

export function initMusic(context) {
  ctx = context;
  audio = document.getElementById('player');
  audio.addEventListener('play', () => {
    ctx.sm.force('sing', { priority: 3 });
    ctx.fire(['event:sing_start'], { important: true });
  });
  audio.addEventListener('pause', () => {
    if (ctx.sm.get() === 'sing') ctx.sm.force('idle', { priority: 1 });
  });
  audio.addEventListener('ended', () => {
    if (ctx.sm.get() === 'sing') ctx.sm.force('idle', { priority: 1 });
    ctx.fire(['event:song_like']);
  });
  on('user:interact', () => { /* 播放不受互动影响 */ });
}

export function hasTracks() {
  return tracks.length > 0;
}

export function nowPlaying() {
  return !audio?.paused && !!current;
}

export async function setDir(dir) {
  try {
    await invoke('allow_music_dir', { dir });
    tracks = await invoke('scan_music', { dir });
  } catch (e) {
    console.error('[music]', e);
    tracks = [];
  }
  return tracks.length;
}

export async function loadPlaylist() {
  try {
    const r = await fetch('assets/playlist.json');
    playlist = await r.json();
  } catch { /* ignore */ }
}

function pickDailySong() {
  const songs = playlist.songs || [];
  if (!songs.length) return null;
  const day = Math.floor(Date.now() / 86400_000);
  return songs[day % songs.length];
}

/** 每日一曲：本地有则播放，没有则口头推荐。 */
export function playDaily() {
  const song = pickDailySong();
  if (!song) return;
  const hit = tracks.find(
    (t) => t.title.includes(song.title) || song.title.includes(t.title),
  );
  if (hit) {
    playTrack(hit);
  } else {
    ctx.say(`今天推荐《${song.title}》！${song.note || ''}`);
    ctx.sm.set('happy', { duration: 4000, priority: 5 });
  }
}

export function playRandom() {
  if (!tracks.length) return;
  playTrack(tracks[Math.floor(Math.random() * tracks.length)]);
}

export function playTrack(t) {
  current = t;
  audio.src = assetUrl(t.path);
  audio.play().catch((e) => console.error('[music] play failed', e));
  ctx.addSong();
}

export function stopMusic() {
  audio.pause();
  audio.currentTime = 0;
}

export function trackList() {
  return tracks;
}
