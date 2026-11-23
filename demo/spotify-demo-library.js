// Original songs and artwork for the local Flipper preview.
export const songs = [
  {title:'Dolphin Days', artist:'Mara Cove', album:'Open Water', art:'dolphin', seconds:208},
  {title:'Low Tide', artist:'Tidepool Club', album:'Breakwater', art:'wave', seconds:174},
  {title:'High Tide', artist:'Tidepool Club', album:'Breakwater', art:'wave', seconds:195},
  {title:'Night Ferry', artist:'June Harbor', album:'Blue Hour', art:'moon', seconds:221},
  {title:'Sea Glass', artist:'Mara Cove', album:'Open Water', art:'dolphin', seconds:168},
  {title:'First Light', artist:'June Harbor', album:'Blue Hour', art:'sun', seconds:189},
];

export function samplePlaylists() {
  return [
    {id:'morning-swim',name:'Morning Swim', art:'sun', tracks:[0,2,5]},
    {id:'on-the-coast',name:'On the Coast', art:'wave', tracks:[1,4]},
    {id:'after-hours',name:'After Hours', art:'moon', tracks:[3,1]},
    {id:'harbor-lights',name:'Harbor Lights', art:'dolphin', tracks:[4,3,0]},
  ];
}

// Same 64 × 64, low-bit-first XBM used by the physical Sign in screen.
export const setupQr=Uint8Array.from(atob(
  'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAIA/cGf+AAAAgCD8WoIAAACALlcCugAAAIAu/Su6AAAAgC4kT7oAAACAoPMnggAAAIC/qqr+AAAAAADqUwAAAACAtLfSBQAAAIDTugnHAAAAgDG3Pq8AAACAmNlSGwAAAICq5T7XAAAAAI1gitsAAAAAd+1kbwAAAABSvbtGAAAAALhAeVoAAAAACDppFQAAAIBoC4niAAAAgALg1EQAAAAAdVT5wAAAAADVe7XTAAAAgPmyJIwAAAAAV0Xe2gAAAIAuM9mPAAAAAIAavZgAAACAP56regAAAICg97/IAAAAgC4Fjt8AAACArtkGGgAAAIAu2yy4AAAAgCA/vRMAAACAv+XcWwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA='
),c=>c.charCodeAt(0));
