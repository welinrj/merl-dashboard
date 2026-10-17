// Labels use the supplied council geometry, never a replacement boundary.
// Choose an interior point on the widest horizontal span of the largest part.
export function mapLabelPoint(feature) {
  const polygons=feature.geometry.type==='Polygon'?[feature.geometry.coordinates]:feature.geometry.coordinates;
  const area=ring=>Math.abs(ring.reduce((sum,p,i)=>{const q=ring[(i+1)%ring.length];return sum+p[0]*q[1]-q[0]*p[1];},0));
  const polygon=polygons.reduce((a,b)=>area(a[0])>area(b[0])?a:b);
  const ys=polygon[0].map(p=>p[1]);
  const lat=(Math.min(...ys)+Math.max(...ys))/2;
  const cuts=[];
  for(const ring of polygon)for(let i=0,j=ring.length-1;i<ring.length;j=i++){
    const [x,y]=ring[i], [px,py]=ring[j];
    if((y>lat)!==(py>lat))cuts.push(x+(lat-y)*(px-x)/(py-y));
  }
  cuts.sort((a,b)=>a-b);
  let best=0,lng=polygon[0][0][0];
  for(let i=0;i+1<cuts.length;i+=2)if(cuts[i+1]-cuts[i]>best){best=cuts[i+1]-cuts[i];lng=(cuts[i+1]+cuts[i])/2;}
  return [lat,lng];
}

// Names are geographic display labels. Anchors are calculated from the
// matching councils; these points are not project sites or surveyed locations.
export const ISLAND_GROUPS=[
  ['Torres',/torres/i],['Gaua',/gaua/i],['Vanua Lava',/vanua\s*lava/i],
  ['Espiritu Santo',/santo|big bay|west coast/i],['Ambae',/ambae/i],
  ['Maewo',/maewo/i],['Pentecost',/pentecost/i],['Malekula',/malekula/i],
  ['Ambrym',/ambrym/i],['Paama',/^paama$/i],['Epi',/\bepi\b/i],
  ['Efate',/efate/i],['Erromango',/erromango/i],['Tanna',/tanna/i],['Aneityum',/aneityum/i],
];
