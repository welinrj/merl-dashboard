import * as OPT from '../constants/formOptions';

const TARGET_TYPES = ['baseline','mid_term','final','monthly','quarterly','six_monthly','annual','milestone','custom'];
const title = key => key.replaceAll('_',' ').replace(/^./, c => c.toUpperCase());
export default function FrameworkRowForm({ editor, setEditor, nodes, saving, onSubmit, onCancel }) {
  const section = editor.section || 'indicator';
  const change = (section,key,value) => setEditor(s=>({...s,[section]:{...s[section],[key]:value}}));
  const field = (section,key,label=title(key),type='text',options=null) => <label key={`${section}-${key}`} className={type==='textarea'?'full':''}>{label}
    {options ? <select className="field-input" aria-label={label} value={editor[section][key]} onChange={e=>change(section,key,e.target.value)}><option value="">Select</option>{editor[section][key] && !options.some(o=>(o.value ?? o)===editor[section][key]) && <option value={editor[section][key]}>{editor[section][key]}</option>}{options.map(o=><option value={o.value ?? o} key={o.value ?? o}>{o.label ?? title(o)}</option>)}</select>
      : type==='textarea' ? <textarea className="field-input" aria-label={label} rows={3} value={editor[section][key]} onChange={e=>change(section,key,e.target.value)}/>
      : type==='checkbox' ? <input type="checkbox" aria-label={label} checked={editor[section][key]} onChange={e=>change(section,key,e.target.checked)}/>
      : <input className="field-input" aria-label={label} type={type} step={type==='number'?'any':undefined} value={editor[section][key]} onChange={e=>change(section,key,e.target.value)}/>}</label>;
  const targetChange = (index,key,value) => setEditor(s=>({...s,targets:s.targets.map((t,i)=>i===index?{...t,[key]:value}:t)}));
  const targetField = (target,index,key,label,type='text') => <label key={key}>{label}{type==='textarea'
    ? <textarea className="field-input" aria-label={`${target.period_label} ${label}`} rows={2} value={target[key]} onChange={e=>targetChange(index,key,e.target.value)}/>
    : <input className="field-input" aria-label={`${target.period_label} ${label}`} type={type} step={type==='number'?'any':undefined} value={target[key]} onChange={e=>targetChange(index,key,e.target.value)}/>}</label>;
  return <form className="rf2-form" onSubmit={onSubmit}>
    <h3>Edit indicator, targets and reported results</h3>
    <div className="rf2-form-grid rf2-row-fields">
      <fieldset className="full" hidden={section!=='indicator'}><legend>Indicator and reporting</legend><div className="rf2-fields-grid">
        {field('indicator','code','Indicator code')}{field('indicator','name','Indicator name','textarea')}
        {field('indicator','framework_node_id','Result node','text',nodes.map(n=>({value:n.id,label:`${n.node_code || n.node_type} — ${n.title}`})))}
        {field('indicator','unit')}{field('indicator','definition','Indicator definition','textarea')}
        {field('indicator','official_reporting_frequency','Official reporting frequency','text',OPT.REPORTING_FREQUENCY)}
        {field('indicator','responsible_officer','Responsible officer')}
        {field('indicator','direction','Direction','text',['increase','decrease','maintain','milestone','qualitative'])}
        {field('indicator','aggregation_method','Aggregation method','text',['latest','sum','average','minimum','maximum','weighted_average','percentage','milestone','qualitative'])}
        {field('indicator','progress_method','Progress calculation','text',['auto','increase','decrease','manual','milestone','qualitative'])}
        {field('indicator','baseline_year','Baseline year','number')}{field('indicator','target_date','Target date','date')}
        {field('indicator','means_of_verification','Means of verification','textarea')}{field('indicator','data_source','Data source')}
        {field('indicator','collection_method','Collection method')}{field('indicator','disaggregation','Disaggregation','textarea')}
        {field('indicator','assumptions','Assumptions / notes','textarea')}
        {field('indicator','is_qualitative','Qualitative indicator','checkbox')}{field('indicator','higher_is_better','Higher is better','checkbox')}
      </div></fieldset>
      <fieldset className="full" hidden={! ['targets','baseline','mid_term','final'].includes(section)}><legend>Baseline, mid-term and final targets</legend>
        {editor.targets.map((target,index)=><fieldset className="rf2-target-fields" hidden={section!=='targets' && section!==target.target_type} key={target.id || index}><legend>{title(target.target_type)} · {target.period_label}</legend><div className="rf2-fields-grid">
          <label>Target type<select className="field-input" aria-label={`Target ${index+1} type`} value={target.target_type} onChange={e=>targetChange(index,'target_type',e.target.value)}>{TARGET_TYPES.map(t=><option key={t} value={t}>{title(t)}</option>)}</select></label>
          {targetField(target,index,'period_label','Period label')}
          <label>Value format<select className="field-input" aria-label={`${target.period_label} value format`} value={target.valueFormat || 'numeric'} onChange={e=>setEditor(s=>({...s,targets:s.targets.map((t,i)=>i===index?{...t,valueFormat:e.target.value,numeric_value:e.target.value==='numeric'?t.numeric_value:'',ordinal_value:e.target.value==='ordinal'?t.ordinal_value:'',text_value:e.target.value==='text'?t.text_value:''}:t)}))}><option value="numeric">Numeric value</option><option value="text">Text / milestone</option><option value="ordinal">Ordinal / scale</option></select></label>
          {target.valueFormat==='text'?targetField(target,index,'text_value','Text value','textarea'):target.valueFormat==='ordinal'?targetField(target,index,'ordinal_value','Scale value','number'):targetField(target,index,'numeric_value','Numeric value','number')}
          {targetField(target,index,'female_value','Female target','number')}{targetField(target,index,'male_value','Male target','number')}
          {targetField(target,index,'period_start','Start date','date')}{targetField(target,index,'period_end','End date','date')}
          {targetField(target,index,'notes','Target notes','textarea')}
        </div></fieldset>)}
        <button type="button" className="btn btn-secondary" hidden={section!=='targets'} onClick={()=>setEditor(s=>({...s,targets:[...s.targets,{id:null,valueFormat:'numeric',target_type:'custom',period_label:'',period_start:'',period_end:'',numeric_value:'',text_value:'',ordinal_value:'',female_value:'',male_value:'',notes:''}]}))}>Add target period</button>
      </fieldset>
      <fieldset className="full" hidden={section!=='progress'}><legend>Latest actual, progress and status</legend>
        <p className="rf2-note">Select the period these results belong to. Edited results return to draft for review.</p>
        <div className="rf2-fields-grid">
        {field('progress','reporting_period','Reporting period','text',[...new Set([...editor.periods.map(p=>p.period_label),editor.progress.reporting_period].filter(Boolean))])}
        {field('progress','date_reported','Date reported','date')}{field('progress','period_target','Period target','number')}
        {field('progress','actual_this_period','Actual this period','number')}{field('progress','cumulative_actual','Cumulative actual','number')}
        {field('progress','previous_value','Previous value','number')}{field('progress','achievement_pct','Progress (%)','number')}
        {field('progress','variance','Variance','number')}
        {field('progress','performance_status','Performance status','text',['on_track','attention_required','at_risk','target_achieved','no_data'])}
        {field('progress','schedule_status','Schedule status','text',['on_schedule','delayed'])}
        {field('progress','area_council_name','Area council')}
        {field('progress','variance_reason','Variance reason','textarea')}{field('progress','corrective_action','Corrective action','textarea')}
        </div>
      </fieldset>
      <fieldset className="full" hidden={section!=='narrative'}><legend>Narrative</legend><div className="rf2-fields-grid">
        {field('narrative','progress_summary','Progress summary','textarea')}{field('narrative','key_achievements','Key achievements','textarea')}
        {field('narrative','variance_explanation','Variance explanation','textarea')}{field('narrative','challenges','Challenges','textarea')}
        {field('narrative','corrective_actions','Corrective actions','textarea')}{field('narrative','next_period_priorities','Next period priorities','textarea')}
        {field('narrative','public_summary','Public summary','textarea')}
      </div></fieldset>
      <a className="btn btn-secondary full" href={`#/merl-reporting?module=evidence&project=${encodeURIComponent(editor.projectId)}`}>Edit evidence documents</a>
    </div>
    <div className="rf2-form-actions"><button type="button" className="btn btn-secondary" disabled={saving} onClick={onCancel}>Cancel</button><button type="submit" className="btn btn-primary" disabled={saving}>{saving?'Saving…':'Save'}</button></div>
  </form>;
}
