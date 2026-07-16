// Photo Gallery — an auto-advancing slideshow of every photograph attached to
// Strategic Results Framework activities: both manually uploaded photos and
// photos automatically extracted from uploaded activity reports.
import { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { ChevronLeft, ChevronRight, Play, Pause, Images, ImageOff } from 'lucide-react';
import { supabase } from '../supabaseClient';

const PHOTO_BUCKET = 'activity-photos';
const photoUrl = (path) => supabase.storage.from(PHOTO_BUCKET).getPublicUrl(path).data?.publicUrl || '';
const AUTO_MS = 5000;

export default function Gallery() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [i, setI] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [fSource, setFSource] = useState('all'); // all | manual | report
  const timer = useRef(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [ph, ac] = await Promise.all([
        supabase.from('v_srf_activity_photos').select('*').order('created_at', { ascending: false }),
        supabase.from('v_srf_activities').select('id,name,theme,code'),
      ]);
      if (cancelled) return;
      const byId = {};
      (ac.data ?? []).forEach(a => { byId[a.id] = a; });
      const list = (ph.data ?? []).map(p => {
        const a = byId[p.activity_id] || {};
        return {
          id: p.id, url: photoUrl(p.storage_path), caption: p.caption || '',
          activity: a.name || '', theme: a.theme || '', code: a.code || '',
          source: p.source || 'manual',
        };
      }).filter(p => p.url);
      setItems(list);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, []);

  const filtered = useMemo(
    () => (fSource === 'all' ? items : items.filter(p => p.source === fSource)),
    [items, fSource],
  );

  // Keep the index in range whenever the filtered set changes.
  useEffect(() => { setI(0); }, [fSource]);
  const n = filtered.length;
  const cur = n ? filtered[Math.min(i, n - 1)] : null;

  const go = useCallback((d) => { setI(prev => (n ? (prev + d + n) % n : 0)); }, [n]);

  // Auto-advance.
  useEffect(() => {
    if (!playing || n <= 1) return undefined;
    timer.current = setInterval(() => setI(prev => (prev + 1) % n), AUTO_MS);
    return () => clearInterval(timer.current);
  }, [playing, n]);

  // Keyboard navigation.
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'ArrowRight') go(1);
      else if (e.key === 'ArrowLeft') go(-1);
      else if (e.key === ' ') { e.preventDefault(); setPlaying(p => !p); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [go]);

  const counts = useMemo(() => ({
    all: items.length,
    manual: items.filter(p => p.source === 'manual').length,
    report: items.filter(p => p.source === 'report').length,
  }), [items]);

  return (
    <div style={{ maxWidth:1100 }} className="animate-fade-up page-pad">
      <h1 style={{ fontFamily:'var(--font-display)', fontSize:'1.6rem', fontWeight:800, letterSpacing:'-0.02em', color:'var(--text-1)', margin:'0 0 0.25rem' }}>
        Photo Gallery
      </h1>
      <div style={{ fontSize:'0.85rem', color:'var(--text-2)', margin:'0 0 1.25rem' }}>
        Photographs from Strategic Results Framework activities · {items.length} image{items.length === 1 ? '' : 's'}
      </div>

      <div style={{ display:'flex', gap:'0.5rem', flexWrap:'wrap', marginBottom:'1rem' }}>
        {[['all', 'All'], ['manual', 'Uploaded'], ['report', 'From reports']].map(([k, label]) => (
          <button key={k} onClick={() => setFSource(k)}
            style={{
              padding:'0.35rem 0.8rem', borderRadius:9999, cursor:'pointer', fontSize:'0.78rem', fontWeight:700,
              border:'1px solid', borderColor: fSource === k ? 'var(--green-600)' : 'var(--border)',
              background: fSource === k ? 'var(--green-50, #dcece2)' : 'var(--white)',
              color: fSource === k ? 'var(--green-700, #155e34)' : 'var(--text-2)',
            }}>
            {label} <span style={{ opacity:0.7 }}>({counts[k]})</span>
          </button>
        ))}
      </div>

      <div className="card" style={{ padding:0, overflow:'hidden' }}>
        {loading ? (
          <div style={{ padding:'4rem 1rem', textAlign:'center', color:'var(--text-3)' }}>Loading…</div>
        ) : !cur ? (
          <div style={{ padding:'4rem 1rem', textAlign:'center', color:'var(--text-3)' }}>
            <ImageOff size={28} style={{ margin:'0 auto 0.6rem', display:'block' }} />
            No photos yet. Upload photos or reports on the Framework tab and they will appear here.
          </div>
        ) : (
          <>
            <div style={{ position:'relative', background:'#120d0a', aspectRatio:'16 / 9', display:'flex', alignItems:'center', justifyContent:'center', overflow:'hidden' }}>
              <img key={cur.id} src={cur.url} alt={cur.caption || cur.activity}
                style={{ maxWidth:'100%', maxHeight:'100%', objectFit:'contain', display:'block' }} className="animate-fade" />

              {n > 1 && (
                <>
                  <button onClick={() => go(-1)} aria-label="Previous"
                    style={{ position:'absolute', left:10, top:'50%', transform:'translateY(-50%)', background:'rgba(18,13,10,0.55)', border:'none', borderRadius:9999, color:'#fff', width:38, height:38, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center' }}>
                    <ChevronLeft size={20} />
                  </button>
                  <button onClick={() => go(1)} aria-label="Next"
                    style={{ position:'absolute', right:10, top:'50%', transform:'translateY(-50%)', background:'rgba(18,13,10,0.55)', border:'none', borderRadius:9999, color:'#fff', width:38, height:38, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center' }}>
                    <ChevronRight size={20} />
                  </button>
                </>
              )}

              <div style={{ position:'absolute', top:10, right:10, display:'flex', gap:'0.4rem', alignItems:'center' }}>
                <span style={{ background:'rgba(18,13,10,0.55)', color:'#fff', fontSize:'0.68rem', fontWeight:700, borderRadius:9999, padding:'0.2rem 0.6rem' }}>
                  {Math.min(i, n - 1) + 1} / {n}
                </span>
                {n > 1 && (
                  <button onClick={() => setPlaying(p => !p)} aria-label={playing ? 'Pause' : 'Play'}
                    style={{ background:'rgba(18,13,10,0.55)', border:'none', borderRadius:9999, color:'#fff', width:30, height:30, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center' }}>
                    {playing ? <Pause size={15} /> : <Play size={15} />}
                  </button>
                )}
              </div>

              <div style={{ position:'absolute', left:0, right:0, bottom:0, padding:'1.5rem 1rem 0.8rem', background:'linear-gradient(transparent, rgba(18,13,10,0.8))', color:'#fff' }}>
                <div style={{ display:'flex', gap:'0.4rem', alignItems:'center', flexWrap:'wrap', marginBottom:'0.15rem' }}>
                  {cur.theme && <span style={{ fontSize:'0.62rem', fontWeight:700, textTransform:'uppercase', letterSpacing:'0.05em', background:'rgba(255,255,255,0.2)', borderRadius:4, padding:'0.1rem 0.4rem' }}>{cur.theme}</span>}
                  {cur.source === 'report' && <span style={{ fontSize:'0.62rem', fontWeight:700, textTransform:'uppercase', letterSpacing:'0.05em', background:'rgba(214,158,43,0.85)', borderRadius:4, padding:'0.1rem 0.4rem' }}>From report</span>}
                </div>
                {cur.activity && <div style={{ fontSize:'0.9rem', fontWeight:700, lineHeight:1.3 }}>{cur.activity}</div>}
                {cur.caption && cur.caption !== cur.activity && <div style={{ fontSize:'0.76rem', opacity:0.85, marginTop:'0.15rem' }}>{cur.caption}</div>}
              </div>
            </div>

            {/* Thumbnail strip */}
            {n > 1 && (
              <div style={{ display:'flex', gap:'0.4rem', overflowX:'auto', padding:'0.6rem 0.7rem', borderTop:'1px solid var(--border)' }} className="scrollbar-thin">
                {filtered.map((p, idx) => (
                  <button key={p.id} onClick={() => { setI(idx); }} title={p.activity}
                    style={{ flex:'0 0 auto', width:76, height:52, borderRadius:6, overflow:'hidden', cursor:'pointer', padding:0,
                      border:'2px solid', borderColor: idx === Math.min(i, n - 1) ? 'var(--green-600)' : 'transparent', background:'#ece9e3' }}>
                    <img src={p.url} alt="" loading="lazy" style={{ width:'100%', height:'100%', objectFit:'cover', display:'block' }} />
                  </button>
                ))}
              </div>
            )}
          </>
        )}
      </div>

      <div style={{ display:'flex', gap:'0.4rem', alignItems:'center', marginTop:'0.9rem', fontSize:'0.78rem', color:'var(--text-3)' }}>
        <Images size={14} /> Use the arrows or ← → keys to navigate; space bar to pause. Photos come from the Framework tab (uploaded directly or pulled from activity reports).
      </div>
    </div>
  );
}
