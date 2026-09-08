// Implementation performance, adapted from the supplied visx / react-spring example.
// The outer ring counts projects; the inner ring counts latest indicator statuses.
import { useEffect, useMemo, useState } from 'react';
import { Pie } from '@visx/shape';
import { Group } from '@visx/group';
import { scaleOrdinal } from '@visx/scale';
import { animated, useTransition, to } from '@react-spring/web';
import './implementation-performance.css';

const PROJECT_COLORS = ['#229b69', '#e0a12a', '#dc5d52', '#7c3aed'];
const INDICATOR_COLORS = ['#205fc8', '#e0a12a', '#dc5d52', '#a8b4c5'];
const sum = (rows) => rows.reduce((n, row) => n + (Number(row.value) || 0), 0);
const fmt = (n) => new Intl.NumberFormat().format(n);

function useReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setReduced(query.matches);
    update();
    query.addEventListener?.('change', update);
    return () => query.removeEventListener?.('change', update);
  }, []);
  return reduced;
}

function AnimatedArcs({ arcs, path, colors, onSelect, selected, animate }) {
  const transitions = useTransition(arcs, {
    keys: (arc) => arc.data.key,
    from: (arc) => ({ startAngle: arc.endAngle > Math.PI ? 2 * Math.PI : 0, endAngle: arc.endAngle > Math.PI ? 2 * Math.PI : 0, opacity: 0 }),
    enter: (arc) => ({ startAngle: arc.startAngle, endAngle: arc.endAngle, opacity: 1 }),
    update: (arc) => ({ startAngle: arc.startAngle, endAngle: arc.endAngle, opacity: 1 }),
    leave: (arc) => ({ startAngle: arc.endAngle > Math.PI ? 2 * Math.PI : 0, endAngle: arc.endAngle > Math.PI ? 2 * Math.PI : 0, opacity: 0 }),
    immediate: !animate,
  });
  return transitions((styles, arc) => (
    <animated.path
      key={arc.data.key}
      d={to([styles.startAngle, styles.endAngle], (startAngle, endAngle) => path({ ...arc, startAngle, endAngle }))}
      fill={colors(arc.data.key)}
      opacity={styles.opacity}
      stroke="white"
      strokeWidth={2}
      role="button"
      tabIndex={0}
      aria-label={`${arc.data.name}: ${fmt(arc.data.value)}`}
      aria-pressed={selected === arc.data.key}
      onClick={() => onSelect(arc.data.key)}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onSelect(arc.data.key);
        }
      }}
      style={{ cursor: 'pointer' }}
    />
  ));
}

function Ring({ data, outerRadius, innerRadius, colors, onSelect, selected, animate }) {
  return (
    <Pie data={data.filter((row) => Number(row.value) > 0)} pieValue={(row) => row.value}
      outerRadius={outerRadius} innerRadius={innerRadius} cornerRadius={3} padAngle={0.008}>
      {(pie) => <AnimatedArcs {...pie} colors={colors} onSelect={onSelect} selected={selected} animate={animate} />}
    </Pie>
  );
}

export default function ImplementationPerformanceChart({
  projects, indicators, onProjectSelect, selectedProject = null,
  projectLabel = 'Projects', indicatorLabel = 'Indicators',
  outerLabel = 'Outer ring', innerLabel = 'Inner ring · latest results',
  noDataLabel = 'No indicator records', clearLabel = 'Show all indicator statuses',
  selectHint = 'Select a segment or status to explore the results.',
}) {
  const [selectedIndicator, setSelectedIndicator] = useState(null);
  const reducedMotion = useReducedMotion();
  const projectTotal = sum(projects);
  const indicatorTotal = sum(indicators);
  const projectColors = useMemo(() => scaleOrdinal({ domain: projects.map((row) => row.key), range: PROJECT_COLORS }), [projects]);
  const indicatorColors = useMemo(() => scaleOrdinal({ domain: indicators.map((row) => row.key), range: INDICATOR_COLORS }), [indicators]);
  const visibleIndicators = selectedIndicator ? indicators.filter((row) => row.key === selectedIndicator) : indicators;
  const selectedRow = indicators.find((row) => row.key === selectedIndicator);
  const selectIndicator = (key) => setSelectedIndicator((current) => current === key ? null : key);

  return (
    <div className="merl-implementation-chart">
      <div className="merl-implementation-visual">
        <svg viewBox="0 0 320 320" role="group" aria-label={`${projectLabel}: ${fmt(projectTotal)}. ${indicatorLabel}: ${fmt(indicatorTotal)}.`}>
          <Group top={160} left={160}>
            <Ring data={projects} outerRadius={145} innerRadius={108} colors={projectColors}
              selected={selectedProject} onSelect={onProjectSelect} animate={!reducedMotion} />
            {indicatorTotal > 0 && <Ring data={visibleIndicators} outerRadius={95} innerRadius={63} colors={indicatorColors}
              selected={selectedIndicator} onSelect={selectIndicator} animate={!reducedMotion} />}
          </Group>
          <text x="160" y="151" textAnchor="middle" className="merl-implementation-total">{fmt(projectTotal)}</text>
          <text x="160" y="171" textAnchor="middle" className="merl-implementation-total-label">{projectLabel}</text>
        </svg>
        <p className="merl-implementation-hint">{selectHint}</p>
      </div>
      <div className="merl-implementation-details">
        <div className="merl-implementation-group-title">{projectLabel} <span>{outerLabel}</span></div>
        {projects.map((row) => (
          <button key={row.key} type="button" className="merl-implementation-row"
            aria-pressed={selectedProject === row.key} onClick={() => onProjectSelect(row.key)}>
            <span className="merl-implementation-dot" style={{ background: projectColors(row.key) }} />
            <span className="merl-implementation-name">{row.name}</span>
            <b>{fmt(row.value)}</b><span>{projectTotal ? Math.round(row.value / projectTotal * 100) : 0}%</span>
          </button>
        ))}
        <div className="merl-implementation-group-title">{indicatorLabel} <span>{innerLabel}</span></div>
        {indicatorTotal === 0 ? <p className="merl-implementation-empty">{noDataLabel}</p> : indicators.map((row) => (
          <button key={row.key} type="button" className="merl-implementation-row"
            aria-pressed={selectedIndicator === row.key} onClick={() => selectIndicator(row.key)}>
            <span className="merl-implementation-dot" style={{ background: indicatorColors(row.key) }} />
            <span className="merl-implementation-name">{row.name}</span>
            <b>{fmt(row.value)}</b><span>{indicatorTotal ? Math.round(row.value / indicatorTotal * 100) : 0}%</span>
          </button>
        ))}
        {selectedRow && <button type="button" className="merl-implementation-clear" onClick={() => setSelectedIndicator(null)}>{clearLabel}</button>}
        <span className="sr-only" aria-live="polite">{selectedRow ? `${selectedRow.name}: ${fmt(selectedRow.value)}` : ''}</span>
      </div>
    </div>
  );
}
