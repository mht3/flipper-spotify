import {openSpotifyDemo,spotifyKey} from './spotify-preview.js';
import {songs} from './spotify-demo-library.js';

const seaGlass=songs.findIndex(song=>song.title==='Sea Glass');

function snapshot(s) {
  const v=s.views.at(-1);
  return {
    inMorningSwim:s.playlists[0].tracks.includes(seaGlass),
    kind:v.kind, row:v.row, track:s.track, elapsed:s.elapsed, started:s.started,
    song:v.kind==='playlist'?s.playlists[v.value].tracks[v.row]:v.kind==='song'?v.value:null,
    queue:s.queue.map(item=>item.id), playing:s.playing, left:s.presets.left,
    leftTracks:s.playlists.find(p=>p.id===s.presets.left)?.tracks.slice() ?? [],
    playlist:v.kind==='playlists'?s.playlists[v.row]?.id:['playlist','collection'].includes(v.kind)?s.playlists[v.value]?.id:null,
  };
}

const coast='on-the-coast';
const lesson=(id,title,instruction,key,changed,prepare)=>({
  id,title,instruction,key,hold:key.startsWith('hold'),changed,prepare,
});

export const spotifyTourSteps=[
  lesson('library','Open your playlists','Press OK on Playlists.','ok',
    (a,b)=>a.kind==='home' && a.row===0 && b.kind==='playlists'),
  lesson('choose','Find On the Coast','Press Down once to highlight On the Coast.','down',
    (a,b)=>a.kind==='playlists' && a.row===0 && b.kind==='playlists' && b.playlist===coast),
  lesson('open','Open On the Coast','Press OK on the highlighted playlist.','ok',
    (a,b)=>a.kind==='playlists' && a.playlist===coast && b.kind==='collection' && b.playlist===coast),
  lesson('browse','Browse the tracks','Press OK on Browse tracks.','ok',
    (a,b)=>a.kind==='collection' && b.kind==='playlist' && b.playlist===coast),
  lesson('choose-song','Find Sea Glass','Press Down to highlight Sea Glass. Dolphin Days is still playing.','down',
    (a,b)=>a.kind==='playlist' && a.playlist===coast && a.song!==seaGlass && b.song===seaGlass),
  lesson('song','Open the song actions','Press OK on Sea Glass.','ok',
    (a,b)=>a.kind==='playlist' && a.song===seaGlass && b.kind==='song' && b.song===seaGlass),
  lesson('choose-queue','Choose Add to queue','Press Down to highlight Add to queue.','down',
    (a,b)=>a.kind==='song' && a.song===seaGlass && a.row===0 && b.kind==='song' && b.row===1),
  lesson('enqueue','Play Sea Glass next','Press OK to queue Sea Glass while Dolphin Days keeps playing.','ok',
    (a,b)=>a.kind==='song' && a.song===seaGlass && a.row===1 && a.track!==seaGlass && a.queue.length===0 &&
      b.queue.length===1 && b.queue[0]===seaGlass && a.track===b.track && a.playing && b.playing &&
      a.started===b.started && a.elapsed===b.elapsed),
  lesson('player','Open Now playing','Press Right to see the current track, Dolphin Days.','right',
    (a,b)=>a.kind==='playlist' && b.kind==='player' && a.track===b.track && a.queue[0]===seaGlass),
  lesson('skip','Play the queued song','Press Right to skip to Sea Glass.','right',
    (a,b)=>a.kind==='player' && b.kind==='player' && a.track!==seaGlass && a.queue[0]===seaGlass &&
      b.track===seaGlass && b.playing && b.queue.length===a.queue.length-1),
  lesson('add','Choose a playlist','Press Down on Now playing to open Add to playlist.','down',
    (a,b)=>a.kind==='player' && b.kind==='destinations' && b.track===seaGlass),
  lesson('save','Add Sea Glass to Morning Swim','Press OK to add the playing song to Morning Swim.','ok',
    (a,b)=>a.kind==='destinations' && a.row===0 && b.kind==='player' && b.track===seaGlass &&
      !a.inMorningSwim && b.inMorningSwim),
  lesson('assign','Save a playlist shortcut','On the Coast is highlighted again. Hold Left to save it to that arrow.','holdLeft',
    (a,b)=>a.kind==='playlists' && a.playlist===coast && !a.left && b.kind==='playlists' && b.left===coast,
    s=>{openSpotifyDemo(s); spotifyKey(s,'ok'); spotifyKey(s,'down');}),
  lesson('recall','Play your shortcut','From the library, hold Left again to play On the Coast.','holdLeft',
    (a,b)=>a.kind==='home' && a.left===coast && b.kind==='player' && b.playing &&
      b.track===a.leftTracks[0] && b.queue.length===a.leftTracks.length-1 &&
      b.queue.every((id,i)=>id===a.leftTracks[i+1]), s=>openSpotifyDemo(s)),
];

export function startSpotifyTour() {
  function fresh() {
    const s=openSpotifyDemo(null,{persistPresets:false});
    s.queue=[];
    return s;
  }
  const state=fresh();
  let index=0, exited=false, before=snapshot(state);

  // Replay the same controls a visitor uses. Retrying also resets elapsed playback time.
  function retry() {
    if(exited || index>=spotifyTourSteps.length) return state;
    Object.assign(state,fresh());
    for(let i=0;i<=index;i++) {
      const step=spotifyTourSteps[i];
      step.prepare?.(state);
      if(i<index) spotifyKey(state,step.key);
    }
    before=snapshot(state);
    return state;
  }
  return {
    state,
    get index() { return index; },
    get step() { return exited?undefined:spotifyTourSteps[index]; },
    get complete() { return index===spotifyTourSteps.length; },
    observe(key) {
      const step=spotifyTourSteps[index];
      if(exited || !step) return false;
      const after=snapshot(state);
      const passed=key===step.key && step.changed(before,after);
      if(passed) {
        index++;
        spotifyTourSteps[index]?.prepare?.(state);
      }
      before=snapshot(state);
      return passed;
    },
    retry,
    restart() {index=0; exited=false; return retry();},
    exit() {exited=true;},
  };
}
