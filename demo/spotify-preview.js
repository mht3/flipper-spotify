import {songs, samplePlaylists, setupQr} from './spotify-demo-library.js';
import {text, textWidth} from './lcd.js';

const pageSize=4;
const now=()=>performance.now();
const clock=seconds=>Math.floor(seconds/60)+':'+String(Math.floor(seconds%60)).padStart(2,'0');
const entry=(action,label,value)=>({action,label,value});
const songEntry=id=>entry('song',songs[id].title,id);
const view=(kind,title,value)=>({kind,title,value,row:0});
const current=s=>s.views.at(-1);
const open=(s,kind,title,value)=>s.views.push(view(kind,title,value));
const directions=['up','down','left','right'];
const directionLabels={up:'↑ Up',right:'→ Right',down:'↓ Down',left:'← Left'};
const presetStorage='eddy-spotify-demo-presets-v1';

const likedSongs={id:'liked-songs',name:'Liked Songs',tracks:songs.map((_,i)=>i)};
function presetOptions(s) { return [likedSongs,...s.playlists]; }

function readPresets(playlists) {
  const presets={};
  try {
    const saved=JSON.parse(localStorage.getItem(presetStorage));
    for(const dir of directions) if(playlists.some(p=>p.id===saved?.[dir])) presets[dir]=saved[dir];
  } catch {}
  return presets;
}
function setPreset(s,dir,playlist) {
  if(playlist) s.presets[dir]=playlist.id;
  else delete s.presets[dir];
  if(s.persistPresets) {
    try { localStorage.setItem(presetStorage,JSON.stringify(s.presets)); } catch {}
  }
  notify(s,playlist?'Preset saved':'Preset cleared');
}
function presetPlaylist(s,dir) { return presetOptions(s).find(p=>p.id===s.presets[dir]); }
function presetLabel(s,dir) { return directionLabels[dir]+'   '+(presetPlaylist(s,dir)?.name ?? 'Unassigned'); }
function playPreset(s,dir) {
  const playlist=presetPlaylist(s,dir);
  if(!playlist?.tracks.length) {s.missingPreset=true; return;}
  const [first,...rest]=playlist.tracks;
  s.previous.push(s.track); s.queue=rest.map(id=>({id})); play(s,first);
  openSpotifyPlayer(s);
}

export function openSpotifyDemo(session,{persistPresets=true}={}) {
  if(session) {
    session.views=[view('home','Spotify')];
    session.notice=''; session.missingPreset=false; session.scrollStarted=now();
    position(session);
    return session;
  }
  const playlists=samplePlaylists();
  return {page:'spotify',row:0,views:[view('home','Spotify')],playlists,persistPresets,
    presets:persistPresets?readPresets([likedSongs,...playlists]):{},
    scrollStarted:now(),missingPreset:false,track:0,queue:[{id:1},{id:2}],previous:[],playing:true,started:now(),elapsed:21,notice:'',noticeUntil:0};
}

export function openSpotifyPlayer(s) {
  if(current(s).kind!=='player') open(s,'player','Now playing');
  return s;
}

function play(s,id,at=0) {
  s.track=id; s.elapsed=at; s.started=now(); s.playing=true;
}

function position(s) {
  let at=s.elapsed+(s.playing?(now()-s.started)/1000:0);
  while(s.playing && at>=songs[s.track].seconds) {
    at-=songs[s.track].seconds;
    if(!s.queue.length) { s.playing=false; s.elapsed=songs[s.track].seconds; return s.elapsed; }
    s.previous.push(s.track); play(s,s.queue.shift().id,at);
  }
  return at;
}

function notify(s,message) { s.notice=message; s.noticeUntil=now()+1600; }
const albumTracks=name=>songs.flatMap((song,id)=>song.album===name?[id]:[]);
function menu(s) {
  const v=current(s);
  switch(v.kind) {
    case 'home': return [entry('playlists','Playlists'),entry('liked','Liked Songs'),entry('queue','Queue'),
      entry('albums','Albums'),entry('player','Now playing'),entry('presets','Presets'),entry('setup','Sign in')];
    case 'playlists': case 'destinations': return s.playlists.map((p,i)=>entry(v.kind==='playlists'?'collection':'save',p.name,i));
    case 'collection': return [entry('browseTracks','Browse tracks'),entry('playCollection','Play playlist')];
    case 'playlist': return s.playlists[v.value].tracks.map(songEntry);
    case 'queue': return s.queue.map(item=>songEntry(item.id));
    case 'liked': return songs.map((song,i)=>songEntry(i));
    case 'albums': return [...new Set(songs.map(song=>song.album))].map(name=>entry('albumMenu',name,name));
    case 'albumMenu': return [entry('album','Browse tracks',v.value),entry('playAlbum','Play album',v.value)];
    case 'album': return albumTracks(v.value).map(songEntry);
    case 'presets': return directions.map(dir=>entry('presetSlot',presetLabel(s,dir),dir));
    case 'presetSlot': return [
      entry('choosePreset','Choose playlist'),entry('assignLiked','Liked Songs'),entry('clearPreset','Clear preset')];
    case 'choosePreset': return s.playlists.map(p=>entry('assignPlaylist',p.name,p));
    case 'song': return [entry('play','Play now'),entry('enqueue','Add to queue'),entry('destinations','Add to playlist')];
    default: return [];
  }
}

function changeTrack(s,key,at) {
  if(key==='right') {
    if(!s.queue.length) { notify(s,'Queue is empty'); return; }
    s.previous.push(s.track);
    play(s,s.queue.shift().id);
  } else if(at<3 && s.previous.length) {
    s.queue.unshift({id:s.track});
    play(s,s.previous.pop());
  } else {
    s.elapsed=0;
    s.started=now();
  }
}

function select(s,item) {
  const v=current(s);
  if(!item) return;
  switch(item.action) {
    case 'browseTracks': s.views.pop(); open(s,'playlist',s.playlists[v.value].name,v.value); break;
    case 'album': s.views.pop(); open(s,'album',item.value,item.value); break;
    case 'playAlbum': case 'playCollection': {
      const [first,...rest]=item.action==='playAlbum'?albumTracks(v.value):s.playlists[v.value].tracks;
      if(first===undefined) break;
      s.previous.push(s.track); s.queue=rest.map(id=>({id})); play(s,first);
      s.views.pop(); openSpotifyPlayer(s); break;
    }
    case 'assignLiked': setPreset(s,v.value,likedSongs); s.views.pop(); break;
    case 'choosePreset': s.views.pop(); open(s,'choosePreset','Choose playlist',v.value); break;
    case 'assignPlaylist': setPreset(s,v.value,item.value); s.views.pop(); break;
    case 'clearPreset': setPreset(s,v.value,null); s.views.pop(); break;
    case 'play': {
      const list=s.views.at(-2);
      if(['playlist','album','liked'].includes(list.kind)) {
        const tracks=list.kind==='playlist'?s.playlists[list.value].tracks:
          list.kind==='liked'?likedSongs.tracks:albumTracks(list.value);
        s.queue=tracks.slice(list.row+1).map(id=>({id}));
      }
      s.previous.push(s.track); play(s,v.value);
      s.views.pop(); openSpotifyPlayer(s); break;
    }
    case 'enqueue': s.queue.push({id:v.value}); s.views.pop(); notify(s,'Added to queue'); break;
    case 'destinations': s.views.pop(); open(s,item.action,item.label,v.value); break;
    case 'save': {
      const target=s.playlists[item.value];
      const duplicate=target.tracks.includes(v.value);
      if(!duplicate) target.tracks.push(v.value);
      s.views.pop(); notify(s,'Added to playlist'); break;
    }
    default: open(s,item.action,item.label,item.value);
  }
}

function activate(s) {
  select(s,menu(s)[current(s).row]);
}

function highlightedCollection(s) {
  const v=current(s);
  if(v.kind==='liked' || (v.kind==='home' && menu(s)[v.row]?.action==='liked')) return likedSongs;
  if(v.kind==='playlists') return s.playlists[v.row];
}

export function spotifyKey(s,key) {
  const v=current(s);
  s.scrollStarted=now();
  if(s.missingPreset) {
    if(key==='ok' || key==='back') s.missingPreset=false;
    return true;
  }
  const collection=highlightedCollection(s);
  if(key==='holdOk' && collection) {
    open(s,'assign','Press a direction',collection);
    return true;
  }
  if(key.startsWith('hold')) {
    const dir=key.slice(4).toLowerCase();
    if(!directions.includes(dir)) return true;
    if(v.kind==='assign') { setPreset(s,dir,v.value); s.views.pop(); }
    else if(collection && !s.presets[dir]) setPreset(s,dir,collection);
    else if(!['setup','presetSlot','choosePreset','destinations'].includes(v.kind)) playPreset(s,dir);
    return true;
  }
  if(key==='back' || (v.kind==='setup' && key==='ok')) {
    if(s.views.length===1) return false;
    s.views.pop(); return true;
  }
  if(v.kind==='setup') return true;
  if(v.kind==='assign') {
    if(directions.includes(key)) {setPreset(s,key,v.value); s.views.pop();}
    return true;
  }
  if(v.kind==='player') {
    const at=position(s);
    if(key==='ok') { s.elapsed=at>=songs[s.track].seconds?0:at; s.started=now(); s.playing=!s.playing; }
    else if(key==='left' || key==='right') changeTrack(s,key,at);
    else if(key==='down') open(s,'destinations','Add to playlist',s.track);
    return true;
  }
  if(key==='right') {
    if(v.kind==='destinations' && s.views.at(-2)?.kind==='player') s.views.pop();
    else if(!['choosePreset','presetSlot'].includes(v.kind)) openSpotifyPlayer(s);
    return true;
  }
  const count=menu(s).length;
  const {first,step}=rowLayout(v);
  if(count && (key==='down' || key==='up')) {
    const next=v.row+(key==='down'?1:-1);
    if(step===10 && (next<0 || next>=count)) {
      v.row=next<0?Math.min(pageSize,count)-1:first;
    } else v.row=(next+count)%count;
  } else if(key==='left' && step===10 && first>0) v.row=first-1;
  else if(count && key==='ok') activate(s);
  return true;
}

export function spotifyHit(s,x,y) {
  const v=current(s);
  if(v.kind==='setup') return spotifyKey(s,'ok');
  if(s.missingPreset) return spotifyKey(s,'ok');
  if(v.kind==='assign') {
    if(y>=10 && y<50) return spotifyKey(s,directions[Math.floor((y-10)/10)]);
    return false;
  }
  if(v.kind==='player') {
    if(y<50 || y>63) return false;
    if(x>=102) return spotifyKey(s,'down');
    if(x>=82) return spotifyKey(s,'right');
    if(x>=49 && x<=79) return spotifyKey(s,'ok');
    if(x>=21 && x<=47) return spotifyKey(s,'left');
    return false;
  }
  if(y>=51) return v.kind==='presetSlot'?spotifyKey(s,'ok'):spotifyKey(s,'right');
  const {first,top,step,limit}=rowLayout(v);
  const index=Math.floor((y-top)/step);
  if(index<0 || index>=limit || first+index>=menu(s).length) return false;
  s.scrollStarted=now(); v.row=first+index; activate(s); return true;
}

export function spotifyStatus(s) {
  position(s);
  const v=current(s), active=songs[s.track];
  if(v.kind==='setup') return 'On your Flipper, scan the QR code to open Eddy on your iPhone. This demo uses a sample library. Press OK to return.';
  if(s.missingPreset) return 'No playlist on this button. Assign one in Presets. OK: Return';
  const playing=(s.playing?'Playing ':'Paused on ')+active.title+' by '+active.artist;
  if(v.kind==='player') return [now()<s.noticeUntil?s.notice:'',playing,
    'OK pauses or plays. Left restarts or goes back. Right skips. Down opens Add to playlist.'].filter(Boolean).join('. ');
  if(v.kind==='assign') return 'Assign '+v.value.name+'. Press a direction. '+directions.map(dir=>presetLabel(s,dir)).join('. ');
  const rows=menu(s);
  return [v.title,now()<s.noticeUntil?s.notice:'',rows[v.row]?.label ?? 'Empty',playing,
    'Up or Down selects. OK opens. Right opens Now playing.',highlightedCollection(s)?'Hold an unused arrow to save this playlist. Hold OK to replace a preset.':''].filter(Boolean).join('. ');
}

function rowLayout(v) {
  if(['home','song','collection','albumMenu','presetSlot'].includes(v.kind)) {
    return {first:v.kind==='home'?Math.max(0,v.row-2):0,top:11,step:13,limit:3};
  }
  return {first:Math.floor(v.row/pageSize)*pageSize,top:10,step:10,limit:pageSize};
}

// Every coordinate here is one LCD pixel. These screens mirror spotify_screen.c.
function line(ctx,x,y,x2,y2) {
  const dx=Math.abs(x2-x), dy=Math.abs(y2-y);
  const sx=x<x2?1:-1, sy=y<y2?1:-1;
  let error=dx-dy;
  for(;;) {
    ctx.fillRect(x,y,1,1);
    if(x===x2 && y===y2) break;
    const twice=error*2;
    if(twice>-dy) {error-=dy;x+=sx;}
    if(twice<dx) {error+=dx;y+=sy;}
  }
}
function frame(ctx,x,y,w,h) {
  ctx.fillRect(x,y,w,1); ctx.fillRect(x,y+h-1,w,1);
  ctx.fillRect(x,y,1,h); ctx.fillRect(x+w-1,y,1,h);
}
function triangle(ctx,x,y,h,direction=1) {
  for(let i=0;i<Math.ceil(h/2);i++) ctx.fillRect(x+i*direction,y+i,1,h-2*i);
}
function rowIcon(ctx,action,y) {
  switch(action) {
    case 'playlists':
      for(let i=0;i<3;i++) line(ctx,3,y+2*i,10-i,y+2*i);
      ctx.fillRect(10,y+4,2,2); break;
    case 'albums': frame(ctx,3,y-1,8,8); frame(ctx,5,y+1,4,4); break;
    case 'presets': line(ctx,3,y+3,11,y+3); line(ctx,7,y-1,7,y+7); frame(ctx,5,y+1,5,5); break;
    case 'setup': text(ctx,'?',5,y+7); break;
    case 'queue':
      for(let i=0;i<3;i++) {ctx.fillRect(3,y+2*i,1,1); line(ctx,5,y+2*i,11,y+2*i);}
      break;
    case 'player': triangle(ctx,4,y,7); break;
    default: line(ctx,4,y,7,y+3); line(ctx,7,y+3,10,y); line(ctx,3,y+2,7,y+6); line(ctx,7,y+6,11,y+2);
  }
}
const tiles=[[4,14,31,14,4],[17,10,4,10,17],[0,27,31,14,4],[4,12,31,12,4],
  [4,10,17,31,0],[8,15,9,27,18],[1,3,7,15,31],[0,21,10,21,0]];
function cover(ctx,name,y) {
  let hash=5381;
  for(const char of name) hash=(hash*33+char.charCodeAt(0))&0xffff;
  frame(ctx,3,y,9,9);
  tiles[hash%8].forEach((bits,row)=>{
    for(let col=0;col<5;col++) if(bits&(1<<col)) ctx.fillRect(5+col,y+2+row,1,1);
  });
}
function scrolledText(ctx,value,x,y,width,tick,font='secondary') {
  const extra=Math.max(0,textWidth(value,font)-width);
  const offset=Math.min(extra,Math.max(0,tick%(extra+34)-16));
  text(ctx,value,x-offset,y,font);
}
function selectedRow(ctx,y,height,selected) {
  if(!selected) return;
  ctx.fillRect(1,y,126,height); ctx.fillRect(0,y+1,128,height-2);
  ctx.globalCompositeOperation='destination-out';
}
function drawFooter(ctx,s,tick) {
  ctx.fillRect(0,51,128,13);
  ctx.save();
  ctx.globalCompositeOperation='destination-out';
  if(!s.missingPreset && s.notice && now()<s.noticeUntil) {
    line(ctx,4,57,6,59); line(ctx,6,59,10,55); text(ctx,s.notice,15,61);
  } else {
    ctx.save(); ctx.beginPath(); ctx.rect(13,51,101,13); ctx.clip();
    scrolledText(ctx,trackLabel(s.track),15,61,97,tick); ctx.restore();
    if(s.playing) triangle(ctx,4,54,8);
    else {ctx.fillRect(4,55,2,6); ctx.fillRect(8,55,2,6);}
    line(ctx,118,57,123,57); line(ctx,121,54,124,57); line(ctx,121,60,124,57);
  }
  ctx.restore();
}
function drawPlayer(ctx,s,at,tick) {
  const song=songs[s.track];
  scrolledText(ctx,song.title,4,23,122,tick,'primary'); scrolledText(ctx,song.artist,4,33,122,tick);
  ctx.fillRect(4,39,120,1); ctx.fillRect(4,38,Math.floor(Math.floor(at)*120/song.seconds),3);
  text(ctx,clock(at),4,49); text(ctx,clock(song.seconds),124,49,'secondary','right');
  line(ctx,32,54,32,60); triangle(ctx,37,54,7,-1);
  if(s.playing) {ctx.fillRect(60,53,3,9); ctx.fillRect(65,53,3,9);}
  else triangle(ctx,62,53,9);
  triangle(ctx,90,54,7); line(ctx,95,54,95,60);
  line(ctx,109,54,109,60); line(ctx,106,57,109,60); line(ctx,109,60,112,57);
  for(const [x,y] of [[0,5],[1,5],[2,5],[3,4]]) {
    for(const sign of [-1,1]) for(const side of [-1,1]) {
      ctx.fillRect(120+sign*x,57+side*y,1,1); ctx.fillRect(120+sign*y,57+side*x,1,1);
    }
  }
  line(ctx,118,57,122,57); line(ctx,120,55,120,59);
}
const trackLabel=id=>songs[id].title+' - '+songs[id].artist;
const albumLabel=name=>name+' - '+songs.find(song=>song.album===name).artist;
const playlistLabel=name=>name+' - Eddy';
const dirName=dir=>dir[0].toUpperCase()+dir.slice(1);
function resultLabel(item) {
  if(item.action==='song') return trackLabel(item.value);
  if(item.action==='albumMenu') return albumLabel(item.label);
  return playlistLabel(item.label);
}
function titleFor(s,v) {
  switch(v.kind) {
    case 'playlist': return 'Playlist tracks';
    case 'album': return 'Album tracks';
    case 'song': return trackLabel(v.value);
    case 'collection': return playlistLabel(v.title);
    case 'albumMenu': return albumLabel(v.title);
    case 'presetSlot': return dirName(v.value);
    case 'assign': return 'Assign preset';
    default: return v.title;
  }
}

export function drawSpotify(ctx,s) {
  const at=position(s), v=current(s), tick=Math.floor((now()-s.scrollStarted)/70);
  if(v.kind==='setup') {
    for(let y=0;y<64;y++) for(let x=0;x<64;x++) {
      if(setupQr[y*8+(x>>3)] & (1<<(x%8))) ctx.fillRect(x,y,1,1);
    }
    text(ctx,'Eddy',66,20,'primary'); text(ctx,'Scan for the',66,33);
    text(ctx,'iPhone app',66,44); text(ctx,'OK: Close',66,60); return false;
  }
  const actions=['song','collection','albumMenu'].includes(v.kind);
  if(actions) {
    ctx.save(); ctx.beginPath(); ctx.rect(0,0,92,10); ctx.clip();
    scrolledText(ctx,titleFor(s,v),2,8,89,tick); ctx.restore();
  } else text(ctx,titleFor(s,v),2,8);
  if(v.kind==='presets') text(ctx,'Hold to play',39,8);
  if(s.missingPreset) {
    text(ctx,'No playlist on this button.',2,24); text(ctx,'Assign one in Presets.',2,36);
    text(ctx,'OK: Return',2,47); drawFooter(ctx,s,tick); return true;
  }
  const notice=s.notice && now()<s.noticeUntil;
  if(v.kind==='player') {
    drawPlayer(ctx,s,at,tick);
    if(notice) drawFooter(ctx,s,tick);
    return true;
  }
  const {first,top,step,limit}=rowLayout(v), rows=menu(s);
  if(v.kind==='assign' || v.kind==='presets') {
    directions.forEach((dir,i)=>{
      const y=10+i*10, selected=v.kind==='presets' && i===v.row;
      ctx.save(); selectedRow(ctx,y,10,selected);
      ctx.save(); ctx.beginPath(); ctx.rect(30,y,98,10); ctx.clip();
      scrolledText(ctx,presetPlaylist(s,dir)?.name??'Unassigned',31,y+8,95,selected?tick:0); ctx.restore();
      if(selected) {
        ctx.globalCompositeOperation='source-over'; ctx.fillRect(0,y,30,10);
        ctx.globalCompositeOperation='destination-out';
      }
      text(ctx,dirName(dir),3,y+8); ctx.restore();
    });
    if(v.kind==='assign') {text(ctx,'Press direction to assign',2,62); if(notice) drawFooter(ctx,s,tick); return true;}
  } else {
    const covers=['playlists','choosePreset','destinations'].includes(v.kind);
    rows.slice(first,first+limit).forEach((item,i)=>{
      const y=top+i*step, selected=first+i===v.row;
      ctx.save(); selectedRow(ctx,y,step===10?10:12,selected);
      if(v.kind==='home') {rowIcon(ctx,item.action,y+3); text(ctx,item.label,16,y+9);}
      else if(actions || v.kind==='presetSlot') text(ctx,item.label,v.kind==='presetSlot'?5:6,y+9);
      else if(covers) {
        const label=resultLabel(item);
        ctx.save(); ctx.beginPath(); ctx.rect(15,y,113,10); ctx.clip();
        scrolledText(ctx,label,16,y+8,110,selected?tick:0); ctx.restore();
        if(selected) {
          ctx.globalCompositeOperation='source-over'; ctx.fillRect(0,y,15,10);
          ctx.globalCompositeOperation='destination-out';
        }
        cover(ctx,label,y);
      } else scrolledText(ctx,resultLabel(item),4,y+8,122,selected?tick:0);
      ctx.restore();
    });
    if(v.kind==='presetSlot') {text(ctx,'OK: Select',2,62); if(notice) drawFooter(ctx,s,tick); return true;}
    if(!rows.length) text(ctx,v.kind==='destinations'?'No owned playlists found.':'No results here.',2,30);
    if(v.kind==='home' && rows[v.row]?.action==='liked') text(ctx,'Hold arrow',46,8);
    else if(v.kind==='liked' || v.kind==='playlists') text(ctx,'Hold arrow',v.kind==='liked'?49:39,8);
    else if(step===10 && (first>0 || rows.length>first+pageSize)) {
      text(ctx,first>0?(rows.length>first+pageSize?'^ v':'^'):'v',78,8);
    }
  }
  drawFooter(ctx,s,tick);
  return true;
}
