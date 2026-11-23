// Original songs and playlists for the local Flipper preview.
export const songs = [
  {title:'Dolphin Days', artist:'Mara Cove', album:'Open Water', seconds:208},
  {title:'Low Tide', artist:'Tidepool Club', album:'Breakwater', seconds:174},
  {title:'High Tide', artist:'Tidepool Club', album:'Breakwater', seconds:195},
  {title:'Night Ferry', artist:'June Harbor', album:'Blue Hour', seconds:221},
  {title:'Sea Glass', artist:'Mara Cove', album:'Open Water', seconds:168},
  {title:'First Light', artist:'June Harbor', album:'Blue Hour', seconds:189},
];

export function samplePlaylists() {
  return [
    {id:'morning-swim',name:'Morning Swim', tracks:[0,2,5]},
    {id:'on-the-coast',name:'On the Coast', tracks:[1,4]},
    {id:'after-hours',name:'After Hours', tracks:[3,1]},
    {id:'harbor-lights',name:'Harbor Lights', tracks:[4,3,0]},
  ];
}

// Same 64 × 64, low-bit-first XBM used by the physical Sign in screen.
export const setupQr=Uint8Array.from(atob(
  'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAIA/cGf+AAAAgCD8WoIAAACALlcCugAAAIAu/Su6AAAAgC4kT7oAAACAoPMnggAAAIC/qqr+AAAAAADqUwAAAACAtLfSBQAAAIDTugnHAAAAgDG3Pq8AAACAmNlSGwAAAICq5T7XAAAAAI1gitsAAAAAd+1kbwAAAABSvbtGAAAAALhAeVoAAAAACDppFQAAAIBoC4niAAAAgALg1EQAAAAAdVT5wAAAAADVe7XTAAAAgPmyJIwAAAAAV0Xe2gAAAIAuM9mPAAAAAIAavZgAAACAP56regAAAICg97/IAAAAgC4Fjt8AAACArtkGGgAAAIAu2yy4AAAAgCA/vRMAAACAv+XcWwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA='
),c=>c.charCodeAt(0));
