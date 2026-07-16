// In-app preview of the DoCC Quarterly Progress Report, matching the official
// template layout. Consumes the object from buildQuarterlyReport().
import { fmtVUV, STATUS_KEY_LABEL } from '../quarterlyReport';
import { renderFigureSvg } from '../reportCharts';

// Subtle zebra striping so tables read as human-authored rather than a raw dump.
const zebra = i => (i % 2 ? { background:'var(--green-50)' } : undefined);

// A figure: inline chart + caption + one-line interpretation.
function Figure({ fig }) {
  return (
    <figure style={{ margin:'0.75rem 0 1rem', border:'1px solid var(--border)', borderRadius:8, overflow:'hidden', background:'var(--white)' }}>
      <div style={{ padding:'0.75rem 0.9rem 0.25rem', overflowX:'auto' }} className="scrollbar-thin"
        dangerouslySetInnerHTML={{ __html: renderFigureSvg(fig) }} />
      <figcaption style={{ padding:'0.4rem 0.9rem 0.75rem' }}>
        <div style={{ fontSize:'0.7rem', fontWeight:700, color:'var(--text-2)' }}>{fig.caption}</div>
        <div style={{ fontSize:'0.72rem', color:'var(--text-3)', marginTop:'0.2rem', lineHeight:1.5 }}>{fig.summary}</div>
      </figcaption>
    </figure>
  );
}

// Interpretive callout placed under each data table.
function Summary({ children }) {
  return (
    <div style={{ display:'flex', gap:'0.5rem', marginTop:'0.6rem', padding:'0.55rem 0.75rem', background:'var(--green-50)', borderLeft:'3px solid var(--green-600)', borderRadius:'0 6px 6px 0' }}>
      <span style={{ fontSize:'0.62rem', fontWeight:800, letterSpacing:'0.04em', textTransform:'uppercase', color:'var(--green-700)', flexShrink:0, paddingTop:'0.05rem' }}>Summary</span>
      <span style={{ fontSize:'0.74rem', color:'var(--text-2)', lineHeight:1.5 }}>{children}</span>
    </div>
  );
}

const STATUS_COL = { green:'#1a8c4e', amber:'#d99a2b', red:'#b3402f', none:'#9a9186' };
const STATUS_BG  = { green:'#dcece2', amber:'#f7ead0', red:'#f6ded8', none:'#ece9e3' };
const STATUS_TXT = { green:'#155e34', amber:'#8a6416', red:'#8a2e21', none:'#5b5349' };

function StatusPill({ k }) {
  return (
    <span style={{ display:'inline-flex', alignItems:'center', gap:'0.3rem', background:STATUS_BG[k], color:STATUS_TXT[k], borderRadius:9999, padding:'0.1rem 0.5rem', fontSize:'0.625rem', fontWeight:700, textTransform:'uppercase', whiteSpace:'nowrap' }}>
      <span style={{ width:4, height:4, borderRadius:'50%', background:STATUS_COL[k] }}/>{STATUS_KEY_LABEL[k]}
    </span>
  );
}

const th = { padding:'0.4rem 0.6rem', textAlign:'left', color:'var(--green-700)', fontWeight:700, fontSize:'0.625rem', letterSpacing:'0.05em', textTransform:'uppercase', background:'var(--green-50)', borderBottom:'1px solid var(--border)' };
const td = { padding:'0.4rem 0.6rem', color:'var(--text-1)', fontSize:'0.72rem', verticalAlign:'top', borderBottom:'1px solid var(--border)' };
const numTd = { ...td, fontFamily:'var(--font-mono)', textAlign:'right', whiteSpace:'nowrap' };

function Section({ n, title, children }) {
  return (
    <div style={{ marginBottom:'1.6rem' }}>
      <div style={{ fontSize:'0.7rem', fontWeight:700, letterSpacing:'0.08em', textTransform:'uppercase', color:'var(--green-700)', marginBottom:'0.6rem', paddingBottom:'0.35rem', borderBottom:'1.5px solid var(--green-100)' }}>
        {n}. {title}
      </div>
      {children}
    </div>
  );
}

const TableWrap = ({ children }) => (
  <div style={{ overflowX:'auto' }} className="scrollbar-thin">
    <table style={{ width:'100%', minWidth:560, borderCollapse:'collapse' }}>{children}</table>
  </div>
);

export default function QuarterlyReportPreview({ report }) {
  const { meta, stats } = report;
  const figFor = section => (report.figures || []).filter(f => f.section === section);
  const hasReports = report.reports?.length > 0;
  const hasPhotos = report.photos?.length > 0;
  const reportsN = 11;
  const photosN = 11 + (hasReports ? 1 : 0);
  const attachN = 11 + (hasReports ? 1 : 0) + (hasPhotos ? 1 : 0);
  return (
    <div className="report-print-area" style={{ fontFamily:'var(--font-ui)', background:'var(--white)', border:'1px solid var(--border)', borderRadius:8, overflow:'hidden' }}>
      {/* Cover header */}
      <div style={{ background:'var(--green-900)', color:'#fff', padding:'1.5rem 2rem' }}>
        <div style={{ fontSize:'0.625rem', letterSpacing:'0.12em', textTransform:'uppercase', color:'rgba(255,255,255,0.5)', marginBottom:'0.375rem' }}>
          Republic of Vanuatu · {meta.subtitle}
        </div>
        <div style={{ fontFamily:'var(--font-display)', fontSize:'1.4rem', fontWeight:700, marginBottom:'0.25rem', letterSpacing:'-0.01em' }}>
          {meta.title}
        </div>
        <div style={{ fontSize:'0.85rem', fontWeight:600, color:'rgba(255,255,255,0.85)' }}>{meta.months}</div>
        <div style={{ fontSize:'0.72rem', color:'rgba(255,255,255,0.45)', marginTop:'0.35rem' }}>
          Prepared by {meta.preparedBy} · Generated {meta.dateGenerated} · DRAFT
        </div>
      </div>

      {/* Snapshot band */}
      <div style={{ display:'flex', flexWrap:'wrap', gap:'1.25rem', padding:'1rem 2rem', background:'var(--green-50)', borderBottom:'1px solid var(--border)' }}>
        {[
          ['Activities', stats.total],
          ['On Track', `${stats.onTrackPct}%`],
          ['Completed', stats.green],
          ['Ongoing', stats.amber],
          ['Delayed', stats.red],
          ['Planned Budget', fmtVUV(stats.totalBudget)],
        ].map(([l, v]) => (
          <div key={l}>
            <div style={{ fontSize:'0.6rem', fontWeight:700, letterSpacing:'0.05em', textTransform:'uppercase', color:'var(--text-3)' }}>{l}</div>
            <div style={{ fontFamily:'var(--font-display)', fontSize:'1.1rem', fontWeight:800, color:'var(--green-700)' }}>{v}</div>
          </div>
        ))}
      </div>

      <div style={{ maxHeight:480, overflowY:'auto', padding:'1.5rem 2rem' }} className="scrollbar-thin">

        <Section n={1} title="Executive Summary">
          {report.executiveSummary.map((t, i) => (
            <p key={i} style={{ margin:'0 0 0.6rem', fontSize:'0.78rem', color:'var(--text-2)', lineHeight:1.55 }}>{t}</p>
          ))}
        </Section>

        <Section n={2} title="Key Achievements">
          <ul style={{ margin:0, paddingLeft:'1.1rem' }}>
            {report.keyAchievements.map((a, i) => (
              <li key={i} style={{ fontSize:'0.78rem', color:'var(--text-2)', marginBottom:'0.35rem', lineHeight:1.5 }}>
                <strong style={{ color:'var(--text-1)' }}>{a.title}</strong> — {a.detail}
              </li>
            ))}
          </ul>
        </Section>

        <Section n={3} title="Introduction">
          {report.introduction.map((t, i) => (
            <p key={i} style={{ margin:'0 0 0.6rem', fontSize:'0.78rem', color:'var(--text-2)', lineHeight:1.55 }}>{t}</p>
          ))}
        </Section>

        <Section n={4} title="Activity Overview">
          <TableWrap>
            <thead><tr>{['Strategic Theme','Activities','On Track','Ongoing','Delayed','Budget (VUV)'].map(h => <th key={h} style={th}>{h}</th>)}</tr></thead>
            <tbody>
              {report.activityOverview.map((t, i) => (
                <tr key={t.theme} style={zebra(i)}>
                  <td style={td}>{t.theme}</td>
                  <td style={numTd}>{t.total}</td>
                  <td style={numTd}>{t.green}</td>
                  <td style={numTd}>{t.amber}</td>
                  <td style={numTd}>{t.red}</td>
                  <td style={numTd}>{t.budget.toLocaleString('en-US')}</td>
                </tr>
              ))}
            </tbody>
          </TableWrap>
          <Summary>{report.summaries.activityOverview}</Summary>
          {figFor('overview').map(f => <Figure key={f.id} fig={f} />)}
        </Section>

        <Section n={5} title={`${meta.period} — Progress Towards Quarterly Accomplishment`}>
          <TableWrap>
            <thead><tr>{['Strategic Priority','Activity / Programme','Building Block','Partner','Output Status'].map(h => <th key={h} style={th}>{h}</th>)}</tr></thead>
            <tbody>
              {report.accomplishments.map((a, i) => (
                <tr key={i} style={zebra(i)}>
                  <td style={{ ...td, whiteSpace:'nowrap' }}>{a.priority}</td>
                  <td style={td}>{a.activity}</td>
                  <td style={td}>{a.buildingBlock}</td>
                  <td style={td}>{a.partner}</td>
                  <td style={td}><StatusPill k={a.statusKey}/></td>
                </tr>
              ))}
            </tbody>
          </TableWrap>
          <div style={{ fontSize:'0.68rem', color:'var(--text-3)', marginTop:'0.4rem' }}>Progress Status: 🟢 Completed / On track · 🟡 Ongoing · 🔴 Delayed</div>
          <Summary>{report.summaries.accomplishments}</Summary>
        </Section>

        <Section n={6} title="💰 Budget Utilisation">
          <TableWrap>
            <thead><tr>{['Component','Planned (VUV)','Actual (VUV)','Variance','% Utilised','Status'].map(h => <th key={h} style={th}>{h}</th>)}</tr></thead>
            <tbody>
              {report.budget.rows.map((r, i) => (
                <tr key={i} style={zebra(i)}>
                  <td style={td}>{r.component}</td>
                  <td style={numTd}>{r.planned.toLocaleString('en-US')}</td>
                  <td style={numTd}>{r.actual.toLocaleString('en-US')}</td>
                  <td style={numTd}>{r.variance.toLocaleString('en-US')}</td>
                  <td style={numTd}>{r.pctUtil}%</td>
                  <td style={td}><StatusPill k={r.statusKey}/></td>
                </tr>
              ))}
              <tr style={{ fontWeight:700, background:'var(--green-50)' }}>
                <td style={{ ...td, fontWeight:700 }}>TOTAL</td>
                <td style={{ ...numTd, fontWeight:700 }}>{report.budget.totals.planned.toLocaleString('en-US')}</td>
                <td style={{ ...numTd, fontWeight:700 }}>{report.budget.totals.actual.toLocaleString('en-US')}</td>
                <td style={{ ...numTd, fontWeight:700 }}>{report.budget.totals.variance.toLocaleString('en-US')}</td>
                <td style={{ ...numTd, fontWeight:700 }}>{report.budget.totals.pctUtil}%</td>
                <td style={td}/>
              </tr>
            </tbody>
          </TableWrap>
          {!report.budget.live && (
            <div style={{ fontSize:'0.68rem', color:'var(--text-3)', marginTop:'0.4rem', fontStyle:'italic' }}>
              Planned budgets shown by theme; actual expenditure populates from the finance data source when connected.
            </div>
          )}
          <Summary>{report.summaries.budget}</Summary>
          {figFor('budget').map(f => <Figure key={f.id} fig={f} />)}
        </Section>

        <Section n={7} title="Challenges and Limitations">
          {report.challenges.narrative.map((t, i) => (
            <p key={i} style={{ margin:'0 0 0.6rem', fontSize:'0.78rem', color:'var(--text-2)', lineHeight:1.55 }}>{t}</p>
          ))}
          {report.challenges.rows.length > 0 && (
            <TableWrap>
              <thead><tr>{['Category','Description','Impact','Mitigation Action','Quantitative Impact'].map(h => <th key={h} style={th}>{h}</th>)}</tr></thead>
              <tbody>
                {report.challenges.rows.map((c, i) => (
                  <tr key={i} style={zebra(i)}>
                    <td style={{ ...td, whiteSpace:'nowrap' }}>{c.category}</td>
                    <td style={td}>{c.description}</td>
                    <td style={td}>{c.impact}</td>
                    <td style={td}>{c.mitigation}</td>
                    <td style={td}>{c.quantitative}</td>
                  </tr>
                ))}
              </tbody>
            </TableWrap>
          )}
          <Summary>{report.summaries.challenges}</Summary>
        </Section>

        <Section n={8} title="📌 Activities Conducted [BTOR]">
          <TableWrap>
            <thead><tr>{['Period','Activity','Location','Responsible Officer','Output / Result'].map(h => <th key={h} style={th}>{h}</th>)}</tr></thead>
            <tbody>
              {report.btor.map((b, i) => (
                <tr key={i} style={zebra(i)}>
                  <td style={{ ...td, whiteSpace:'nowrap' }}>{b.date}</td>
                  <td style={td}>{b.activity}</td>
                  <td style={td}>{b.location}</td>
                  <td style={td}>{b.officer}</td>
                  <td style={td}>{b.output}</td>
                </tr>
              ))}
            </tbody>
          </TableWrap>
          <Summary>{report.summaries.btor}</Summary>
        </Section>

        <Section n={9} title="💡 Lessons Learned">
          <TableWrap>
            <thead><tr>{['Lesson','Improvement Action','Responsible Unit','Quantitative Measure'].map(h => <th key={h} style={th}>{h}</th>)}</tr></thead>
            <tbody>
              {report.lessons.map((l, i) => (
                <tr key={i} style={zebra(i)}>
                  <td style={td}>{l.lesson}</td>
                  <td style={td}>{l.improvement}</td>
                  <td style={td}>{l.unit}</td>
                  <td style={td}>{l.measure}</td>
                </tr>
              ))}
            </tbody>
          </TableWrap>
        </Section>

        <Section n={10} title="🚀 Next Steps">
          <TableWrap>
            <thead><tr>{['Plan Activity','Expected Outcome','Timeline','Lead Officer','Target / Metric'].map(h => <th key={h} style={th}>{h}</th>)}</tr></thead>
            <tbody>
              {report.nextSteps.map((n, i) => (
                <tr key={i} style={zebra(i)}>
                  <td style={td}>{n.activity}</td>
                  <td style={td}>{n.outcome}</td>
                  <td style={{ ...td, whiteSpace:'nowrap' }}>{n.timeline}</td>
                  <td style={td}>{n.lead}</td>
                  <td style={td}>{n.target}</td>
                </tr>
              ))}
            </tbody>
          </TableWrap>
          <Summary>{report.summaries.nextSteps}</Summary>
        </Section>

        {hasReports && (
          <Section n={reportsN} title="📄 Activity Reports">
            <p style={{ margin:'0 0 0.7rem', fontSize:'0.78rem', color:'var(--text-2)', lineHeight:1.55 }}>
              Automatic summaries of narrative reports uploaded against activities this period.
            </p>
            <div style={{ display:'flex', flexDirection:'column', gap:'0.6rem' }}>
              {report.reports.map((r, idx) => (
                <div key={r.id ?? idx} style={{ border:'1px solid var(--border)', borderRadius:8, padding:'0.6rem 0.75rem', background:'var(--white)' }}>
                  <div style={{ fontSize:'0.75rem', fontWeight:700, color:'var(--text-1)' }}>{r.fileName}</div>
                  {r.activity && <div style={{ fontSize:'0.68rem', color:'var(--text-3)', marginBottom:'0.25rem' }}>{r.activity}</div>}
                  <div style={{ fontSize:'0.73rem', color:'var(--text-2)', lineHeight:1.5, whiteSpace:'pre-line' }}>{r.summary}</div>
                </div>
              ))}
            </div>
            <Summary>{report.summaries.reports}</Summary>
          </Section>
        )}

        {hasPhotos && (
          <Section n={photosN} title="📷 Photo Documentation">
            <p style={{ margin:'0 0 0.7rem', fontSize:'0.78rem', color:'var(--text-2)', lineHeight:1.55 }}>
              Field photographs uploaded against Strategic Results Framework activities during this reporting period.
            </p>
            <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(200px, 1fr))', gap:'0.9rem' }}>
              {report.photos.map((ph, i) => (
                <figure key={ph.id ?? i} style={{ margin:0, border:'1px solid var(--border)', borderRadius:8, overflow:'hidden', background:'var(--white)' }}>
                  <div style={{ aspectRatio:'4 / 3', background:'#ece9e3' }}>
                    <img src={ph.url} alt={ph.caption} loading="lazy" style={{ width:'100%', height:'100%', objectFit:'cover', display:'block' }} />
                  </div>
                  <figcaption style={{ padding:'0.45rem 0.6rem' }}>
                    <div style={{ fontSize:'0.72rem', color:'var(--text-1)', lineHeight:1.4 }}>{ph.caption}</div>
                    {ph.activity && ph.activity !== ph.caption && (
                      <div style={{ fontSize:'0.66rem', color:'var(--text-3)', marginTop:'0.15rem' }}>{ph.activity}</div>
                    )}
                  </figcaption>
                </figure>
              ))}
            </div>
            <Summary>{report.summaries.photos}</Summary>
          </Section>
        )}

        <Section n={attachN} title="📎 Supporting Attachments">
          <p style={{ margin:'0 0 0.6rem', fontSize:'0.78rem', color:'var(--text-2)', lineHeight:1.55 }}>
            The following annexes and figures support the findings in this report. Figures 1–4 appear inline in the relevant sections above.
          </p>
          <TableWrap>
            <thead><tr>{['Reference','Attachment','Description'].map(h => <th key={h} style={th}>{h}</th>)}</tr></thead>
            <tbody>
              {report.attachments.map((att, i) => (
                <tr key={att.ref} style={zebra(i)}>
                  <td style={{ ...td, whiteSpace:'nowrap', fontWeight:700 }}>{att.ref}</td>
                  <td style={td}>{att.title}</td>
                  <td style={td}>{att.note}</td>
                </tr>
              ))}
              {(report.figures || []).map((f, i) => (
                <tr key={f.id} style={zebra(report.attachments.length + i)}>
                  <td style={{ ...td, whiteSpace:'nowrap', fontWeight:700 }}>Figure {f.num}</td>
                  <td style={td}>{f.title}</td>
                  <td style={td}>{f.summary}</td>
                </tr>
              ))}
            </tbody>
          </TableWrap>
        </Section>

        <div style={{ borderTop:'1px solid var(--border)', paddingTop:'0.75rem', fontSize:'0.68rem', color:'var(--text-3)', textAlign:'center' }}>
          Department of Climate Change · Government of Vanuatu · www.docc.gov.vu · Confidential — For official use only
        </div>
      </div>
    </div>
  );
}
