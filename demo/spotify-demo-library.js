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

// Each row is a scanline of the 8-pixel monochrome icon.
const icons = {
  sun:[0x10,0x54,0x38,0x7c,0x38,0x00,0xff,0x66],
  wave:[0x00,0x0e,0x19,0x31,0x62,0xc4,0xf9,0x8e],
  moon:[0x1a,0x30,0x60,0x61,0x72,0x3c,0x1e,0x00],
  dolphin:[0x04,0x1e,0x39,0x7f,0x68,0xc0,0x60,0x90],
  heart:[0x00,0x66,0xff,0xff,0x7e,0x3c,0x18,0x00],
  search:[0x38,0x44,0x82,0x82,0x44,0x3c,0x06,0x03],
  tracks:[0x1f,0x11,0x1f,0x11,0x11,0x73,0x77,0x20],
  queue:[0x00,0xfa,0x02,0xfe,0x00,0xf0,0x04,0x06],
  album:[0x3c,0x7e,0xff,0xe7,0xe7,0xff,0x7e,0x3c],
  artist:[0x18,0x3c,0x3c,0x18,0x00,0x3c,0x7e,0x7e],
  playlist:[0x00,0xfe,0x00,0xfe,0x00,0xe6,0x06,0x1c],
};

export function drawIcon(ctx, name, x, y, scale=1) {
  const rows=icons[name] ?? icons.tracks;
  rows.forEach((bits,i)=>{
    for(let j=0;j<8;j++) if(bits & (128>>j)) ctx.fillRect(x+j*scale,y+i*scale,scale,scale);
  });
}
