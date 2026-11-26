// Use the overview's target counts, never an average of project percentages.
const colours={'23A398':'#2563b9','24B298':'#b17517','CBIT-VU':'#7956ad','VCCRP-001':'#007f8b'};
export function contributionColour(project) {
  let hash=0;for(const c of String(project.code||project.id||''))hash=(hash*31+c.charCodeAt(0))>>>0;
  return colours[project.code]||`hsl(${hash%360} 50% 38%)`;
}
export function targetContributions(summary) {
  const all=summary?.rows||[],targets=summary?.targets,count=n=>Number.isInteger(n)&&n>=0;
  const valid=!!targets&&count(targets.achieved)&&count(targets.total)
    &&new Set(all.map(r=>r.project.id)).size===all.length
    &&all.every(r=>count(r.achieved)&&count(r.total)&&r.achieved<=r.total)
    &&all.reduce((sum,r)=>sum+r.achieved,0)===targets.achieved
    &&all.reduce((sum,r)=>sum+r.total,0)===targets.total;
  if(!valid)return {valid:false,rows:[],others:[],totalAchieved:null,totalTargets:null};
  const rows=all.filter(r=>r.achieved>0).map(r=>({...r,
    share:r.achieved/targets.achieved*100,
    projectPercentage:Math.round(r.achieved/r.total*1000)/10,
    points:targets.total?r.achieved/targets.total*100:null,
    colour:contributionColour(r.project),
  })).sort((a,b)=>b.achieved-a.achieved||String(a.project.code).localeCompare(String(b.project.code)));
  return {valid:true,rows,others:all.filter(r=>r.achieved===0),totalAchieved:targets.achieved,totalTargets:targets.total};
}
