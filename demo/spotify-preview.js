import {songs, samplePlaylists, drawIcon} from './spotify-demo-library.js';

const pageSize=3;
const now=()=>performance.now();
const clock=seconds=>Math.floor(seconds/60)+':'+String(Math.floor(seconds%60)).padStart(2,'0');
const entry=(action,label,icon,value)=>({action,label,icon,value});
const songEntry=id=>entry('song',songs[id].title,songs[id].art,id);
const view=(kind,title,value)=>({kind,title,value,row:0});
const current=s=>s.views.at(-1);
const open=(s,kind,title,value)=>s.views.push(view(kind,title,value));
const directions=['up','right','down','left'];
const directionLabels={up:'↑ Up',right:'→ Right',down:'↓ Down',left:'← Left'};
const presetStorage='eddy-spotify-demo-presets-v1';

const likedSongs={id:'liked-songs',name:'Liked Songs',art:'heart',tracks:songs.map((_,i)=>i)};
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
  notify(s,playlist?directionLabels[dir]+': '+playlist.name:'Preset cleared');
}
function presetPlaylist(s,dir) { return presetOptions(s).find(p=>p.id===s.presets[dir]); }
function presetLabel(s,dir) { return directionLabels[dir]+'   '+(presetPlaylist(s,dir)?.name ?? 'Unassigned'); }
function playPreset(s,dir) {
  const playlist=presetPlaylist(s,dir);
  if(!playlist?.tracks.length) {notify(s,'Set a preset in Playlists'); return;}
  const [first,...rest]=playlist.tracks;
  s.previous.push(s.track); s.queue=rest.map(id=>({id})); play(s,first);
  openSpotifyPlayer(s);
  notify(s,playlist.name);
}

export function openSpotifyDemo(session,{persistPresets=true}={}) {
  if(session) {
    session.views=[view('home','Spotify demo')];
    session.notice='';
    position(session);
    return session;
  }
  const playlists=samplePlaylists();
  return {page:'spotify',row:0,views:[view('home','Spotify demo')],playlists,persistPresets,
    presets:persistPresets?readPresets([likedSongs,...playlists]):{},
    track:0,queue:[{id:1},{id:2}],previous:[],playing:true,started:now(),elapsed:21,notice:'',noticeUntil:0};
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
function menu(s) {
  const v=current(s);
  switch(v.kind) {
    case 'home': return [entry('playlists','Playlists','playlist'),entry('liked','Liked Songs','heart'),entry('queue','Queue','queue'),
      entry('albums','Albums','album'),entry('presets','Presets','playlist'),entry('setup','Eddy for iPhone','tracks')];
    case 'playlists': case 'destinations': return s.playlists.map((p,i)=>entry(v.kind==='playlists'?'collection':'save',p.name,p.art,i));
    case 'collection': return [entry('browseTracks','Browse tracks','playlist'),entry('playCollection','Play playlist','tracks')];
    case 'playlist': return s.playlists[v.value].tracks.map(songEntry);
    case 'queue': return s.queue.map(item=>entry('queued',songs[item.id].title,songs[item.id].art,item));
    case 'liked': return songs.map((song,i)=>songEntry(i));
    case 'albums': return [...new Set(songs.map(song=>song.album))].map(name=>entry('album',name,songs.find(song=>song.album===name).art,name));
    case 'artist': case 'album': return songs.flatMap((song,i)=>song[v.kind]===v.value?[songEntry(i)]:[]);
    case 'presets': return directions.map(dir=>entry('presetSlot',presetLabel(s,dir),'playlist',dir));
    case 'presetSlot': return [...(presetPlaylist(s,v.value)?[entry('playPreset','Play preset','tracks')]:[]),
      entry('choosePreset','Choose playlist','playlist'),entry('assignLiked','Liked Songs','heart'),...(presetPlaylist(s,v.value)?[entry('clearPreset','Clear preset','playlist')]:[])];
    case 'choosePreset': return s.playlists.map(p=>entry('assignPlaylist',p.name,p.art,p));
    case 'song': return [entry('play','Play now','tracks'),entry('enqueue','Add to queue','queue'),entry('destinations','Add to playlist','playlist'),entry('artist',songs[v.value].artist,'artist',songs[v.value].artist)];
    default: return [];
  }
}

function lyricLine(song,at) {
  let line=0;
  while(line+1<song.cues.length && song.cues[line+1][0]<=at) ++line;
  return line;
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
    case 'browseTracks': open(s,'playlist',s.playlists[v.value].name,v.value); break;
    case 'playCollection': {
      const [first,...rest]=s.playlists[v.value].tracks;
      if(first===undefined) break;
      s.previous.push(s.track); s.queue=rest.map(id=>({id})); play(s,first);
      openSpotifyPlayer(s); break;
    }
    case 'assignLiked': setPreset(s,v.value,likedSongs); s.views.pop(); break;
    case 'choosePreset': open(s,'choosePreset','Choose playlist',v.value); break;
    case 'assignPlaylist': setPreset(s,v.value,item.value); s.views.pop(); s.views.pop(); break;
    case 'playPreset': playPreset(s,v.value); break;
    case 'clearPreset': setPreset(s,v.value,null); s.views.pop(); break;
    case 'play': {
      const list=s.views.at(-2);
      if(['playlist','album','liked'].includes(list.kind)) {
        const tracks=list.kind==='playlist'?s.playlists[list.value].tracks:
          list.kind==='liked'?likedSongs.tracks:songs.flatMap((song,id)=>song.album===list.value?[id]:[]);
        s.queue=tracks.slice(list.row+1).map(id=>({id}));
      }
      s.previous.push(s.track); play(s,v.value);
      s.views.pop(); openSpotifyPlayer(s); break;
    }
    case 'enqueue': s.queue.push({id:v.value}); s.views.pop(); notify(s,'Added to queue'); break;
    case 'queued': open(s,'queuedSong',songs[item.value.id].title,item.value); break;
    case 'destinations': open(s,item.action,item.label,v.value); break;
    case 'save': {
      const target=s.playlists[item.value];
      const duplicate=target.tracks.includes(v.value);
      if(!duplicate) target.tracks.push(v.value);
      s.views.pop(); notify(s,duplicate?'Already in playlist':'Added to '+target.name); break;
    }
    default: open(s,item.action,item.label,item.value);
  }
}

function visibleRows(s) {
  if(current(s).kind==='queuedSong') return [entry('playQueued','Play now','tracks'),entry('remove','Remove from queue','queue')];
  return menu(s);
}

function activate(s) {
  const v=current(s);
  if(v.kind==='queuedSong') {
    const index=s.queue.indexOf(v.value);
    if(index>=0) s.queue.splice(index,1);
    s.views.pop(); current(s).row=Math.max(0,Math.min(current(s).row,s.queue.length-1));
    if(index<0) { notify(s,'Song already played'); return; }
    if(v.row===0) { s.previous.push(s.track); play(s,v.value.id); openSpotifyPlayer(s); }
    else notify(s,'Removed from queue');
  } else select(s,menu(s)[v.row]);
}

function highlightedCollection(s) {
  const v=current(s);
  if(v.kind==='liked' || (v.kind==='home' && menu(s)[v.row]?.action==='liked')) return likedSongs;
  if(v.kind==='playlist' || v.kind==='collection') return s.playlists[v.value];
  if(v.kind==='playlists') return s.playlists[v.row];
}

export function spotifyKey(s,key) {
  const v=current(s);
  s.notice='';
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
    else if(!['setup','presetSlot','choosePreset','presets'].includes(v.kind)) playPreset(s,dir);
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
    else if(key==='up') open(s,'lyrics','Lyrics');
    return true;
  }
  if(v.kind==='lyrics') {
    if(key==='down') s.views.pop();
    else if(key==='left' || key==='right') changeTrack(s,key,position(s));
    return true;
  }
  if(key==='right') {openSpotifyPlayer(s); return true;}
  const count=visibleRows(s).length;
  if(count && (key==='down' || key==='up')) v.row=(v.row+(key==='down'?1:count-1))%count;
  else if(count && key==='left') v.row=Math.max(0,(Math.floor(v.row/pageSize)-1)*pageSize);
  else if(count && key==='ok') activate(s);
  return true;
}

export function spotifyHit(s,x,y) {
  const v=current(s);
  if(v.kind==='setup') return spotifyKey(s,'ok');
  if(v.kind==='assign') {
    if(y>=13 && y<61) return spotifyKey(s,directions[Math.floor((y-13)/12)]);
    return true;
  }
  if(v.kind==='player') {
    if(y>=50) return spotifyKey(s,x<64?'down':'up');
    else if(y>=39) {
      return spotifyKey(s,x<42?'left':x<86?'ok':'right');
    } else if(y>=30) {
      position(s);
      s.elapsed=Math.min(songs[s.track].seconds,Math.max(0,(x-2)/123*songs[s.track].seconds)); s.started=now();
    }
    return true;
  }
  if(v.kind==='lyrics') {
    if(y<50) return false;
    return spotifyKey(s,x<36?'left':x<92?'down':'right');
  }
  if(y>=50) { openSpotifyPlayer(s); return true; }
  if(y<12 || y>=48) return false;
  const row=Math.floor(v.row/pageSize)*pageSize+Math.floor((y-12)/12);
  if(row>=visibleRows(s).length) return false;
  v.row=row; activate(s); return true;
}

export function spotifyStatus(s) {
  const at=position(s), v=current(s), active=songs[s.track];
  if(v.kind==='setup') return 'On your Flipper, scan the QR code to open Eddy on your iPhone. This demo uses a sample library. Press OK to return.';
  const playing=(s.playing?'Playing ':'Paused on ')+active.title+' by '+active.artist;
  if(v.kind==='player') return [now()<s.noticeUntil?s.notice:'',playing,
    'OK pauses or plays. Left restarts or goes back. Right skips. Down saves to a playlist. Up opens sample lyrics.'].filter(Boolean).join('. ');
  if(v.kind==='lyrics') {
    const line=active.cues[lyricLine(active,at)][1];
    return 'Sample lyrics for '+active.title+'. '+line+'. Left restarts or goes back. Right skips. Down or Back returns to Now Playing. '+playing+'.';
  }
  if(v.kind==='assign') return 'Assign '+v.value.name+'. Press a direction. '+directions.map(dir=>presetLabel(s,dir)).join('. ');
  const rows=visibleRows(s);
  return [v.title,now()<s.noticeUntil?s.notice:'',rows[v.row]?.label ?? 'Empty',playing,
    'Up or Down selects. OK opens. Right opens Now playing.',highlightedCollection(s)?'Hold an unused arrow to save this playlist. Hold OK to replace a preset.':''].filter(Boolean).join('. ');
}

function cropped(ctx,text,x,y,width) {
  if(ctx.measureText(text).width>width) {
    while(text.length && ctx.measureText(text+'…').width>width) text=text.slice(0,-1);
    text+='…';
  }
  ctx.fillText(text,x,y);
}

function footer(ctx,s,at) {
  const song=songs[s.track];
  ctx.save();
  ctx.fillRect(1,50,126,1);
  drawIcon(ctx,song.art,3,54);
  ctx.font='bold 8px sans-serif'; cropped(ctx,song.title,15,60,78);
  ctx.font='7px monospace'; ctx.fillText(clock(at),98,60);
  if(s.playing) { ctx.fillRect(121,54,2,6); ctx.fillRect(125,54,2,6); }
  else {ctx.beginPath();ctx.moveTo(120,53);ctx.lineTo(126,57);ctx.lineTo(120,61);ctx.fill();}
  ctx.fillRect(1,63,Math.round(126*at/song.seconds),1);
  ctx.restore();
}

function drawPlayer(ctx,s,at) {
  const track=songs[s.track];
  drawIcon(ctx,track.art,3,13,2);
  ctx.font='bold 10px sans-serif'; cropped(ctx,track.title,24,21,101);
  ctx.font='8px sans-serif'; cropped(ctx,track.artist,24,30,66);
  ctx.font='7px monospace'; ctx.fillText(clock(at),104,30);
  ctx.fillRect(2,34,124,1);
  ctx.fillRect(2,33,Math.max(2,Math.round(124*at/track.seconds)),3);
  ctx.save();
  ctx.textAlign='center'; ctx.font='bold 9px sans-serif';
  ctx.fillText('‹',22,46); ctx.fillText('›',106,46);
  if(s.playing) {
    ctx.fillRect(60,39,3,9); ctx.fillRect(65,39,3,9);
  } else {
    for(let i=0;i<5;i++) ctx.fillRect(62+i,39+i,1,9-2*i);
  }
  ctx.font='8px sans-serif';
  ctx.fillText('↓',23,60);
  ctx.beginPath(); ctx.arc(34,57,5,0,2*Math.PI); ctx.strokeStyle=ctx.fillStyle; ctx.lineWidth=1; ctx.stroke();
  ctx.fillRect(32,57,5,1); ctx.fillRect(34,55,1,5);
  ctx.fillText('↑ Demo lyrics',91,60);
  ctx.restore();
}

export function drawSpotify(ctx,s) {
  const v=current(s), at=position(s);
  ctx.save(); ctx.textBaseline='alphabetic'; ctx.font='bold 9px sans-serif';
  if(v.kind==='setup') {
    ctx.fillText('Eddy for iPhone',2,9); ctx.fillRect(2,11,124,1);
    ctx.font='8px sans-serif';
    ctx.fillText('Scan the QR on your Flipper',2,28); ctx.fillText('to open Eddy on your iPhone.',2,39);
    ctx.fillText('OK  Back to demo',2,59);
    ctx.restore(); return false;
  }
  const title=v.kind==='lyrics'?songs[s.track].title:v.title;
  cropped(ctx,title,2,9,89);
  if(highlightedCollection(s)) {
    ctx.font='7px sans-serif'; ctx.fillText('Hold arrow',60,9);
  }
  ctx.fillRect(2,11,124,1);
  if(v.kind==='assign') {
    ctx.font='bold 8px sans-serif';
    directions.forEach((dir,i)=>cropped(ctx,presetLabel(s,dir),4,22+i*12,120));
  } else if(v.kind==='player') {
    drawPlayer(ctx,s,at);
  } else if(v.kind==='lyrics') {
    const song=songs[s.track], cues=song.cues;
    const lineIndex=lyricLine(song,at);
    const start=Math.max(0,Math.min(lineIndex-1,cues.length-3));
    cues.slice(start,start+3).forEach(([,line],i)=>{
      ctx.font=(start+i===lineIndex?'bold ':'')+'8px sans-serif';
      if(start+i===lineIndex) ctx.fillRect(2,15+11*i,2,8);
      cropped(ctx,line,7,22+11*i,119);
    });
    ctx.fillRect(1,50,126,1);
    ctx.font='bold 8px sans-serif';
    ctx.fillText('‹ Prev',3,60);
    ctx.fillText('↓ Player',48,60);
    ctx.fillText('Next ›',100,60);
  } else {
    const rows=visibleRows(s); v.row=Math.min(v.row,Math.max(0,rows.length-1));
    const start=Math.floor(v.row/pageSize)*pageSize;
    rows.slice(start,start+pageSize).forEach((item,i)=>{
      const y=12+i*12;
      ctx.save();
      if(start+i===v.row) {ctx.beginPath();ctx.roundRect(1,y,123,12,3);ctx.fill();ctx.globalCompositeOperation='destination-out';}
      drawIcon(ctx,item.icon,5,y+2);
      ctx.font='bold 8px sans-serif'; cropped(ctx,item.label,17,y+9,101);
      ctx.restore();
    });
    if(rows.length>pageSize) ctx.fillRect(126,13+Math.floor(v.row/pageSize)*34/Math.ceil(rows.length/pageSize),1,Math.ceil(33/Math.ceil(rows.length/pageSize)));
    if(!rows.length) {
      ctx.font='8px sans-serif'; ctx.fillText('Your queue is empty',4,37);
    }
  }
  if(!['player','assign','lyrics'].includes(v.kind)) footer(ctx,s,at);
  if(s.notice && now()<s.noticeUntil) {
    ctx.save();ctx.fillRect(1,35,125,14);ctx.globalCompositeOperation='destination-out';ctx.font='bold 8px sans-serif';cropped(ctx,s.notice,5,45,117);ctx.restore();
  }
  ctx.restore(); return s.playing || now()<s.noticeUntil;
}
