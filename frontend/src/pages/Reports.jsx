import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  FileText, Download, Calendar, Filter, FileSpreadsheet,
  BarChart2, Users, AlertTriangle, DollarSign, CheckSquare, Lightbulb,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { format } from 'date-fns';
import axios from 'axios';
import toast from 'react-hot-toast';

const PROVINCES = ['All', 'Malampa', 'Penama', 'Sanma', 'Shefa', 'Tafea', 'Torba'];

const REPORT_TYPES = [
  {
    id: 'indicator_progress',
    label: 'Indicator Progress Summary',
    description: 'Actual vs target values for all indicators by reporting period',
    icon: BarChart2,
    colour: 'blue',
    endpoint: '/api/reports/indicators',
  },
  {
    id: 'activity_log',
    label: 'Activity Log',
    description: 'All activities filtered by period with status and milestones',
    icon: CheckSquare,
    colour: 'green',
    endpoint: '/api/reports/activities',
  },
  {
    id: 'ld_events',
    label: 'Loss & Damage Event Register',
    description: 'Complete record of L&D events with economic loss, affected populations',
    icon: AlertTriangle,
    colour: 'orange',
    endpoint: '/api/reports/events',
  },
  {
    id: 'community_engagement',
    label: 'Community Engagement Summary',
    description: 'Aggregated engagement statistics with GEDSI breakdowns',
    icon: Users,
    colour: 'purple',
    endpoint: '/api/reports/community',
  },
  {
    id: 'participation_disaggregated',
    label: 'Disaggregated Participation',
    description: 'Gender, youth, elderly and disability breakdown across all engagements',
    icon: Users,
    colour: 'pink',
    endpoint: '/api/reports/participation',
  },
  {
    id: 'provincial_comparison',
    label: 'Provincial Comparison',
    description: 'Side-by-side comparison of indicators and activities by province',
    icon: Filter,
    colour: 'teal',
    endpoint: '/api/reports/provinces',
  },
  {
    id: 'financial_summary',
    label: 'Financial Summary Report',
    description: 'Disbursements, expenditures, and budget utilisation summary',
    icon: DollarSign,
    colour: 'red',
    endpoint: '/api/reports/financials',
  },
  {
    id: 'learning_summary',
    label: 'Learning & Knowledge Summary',
    description: 'Lessons learned, best practices, challenges, and recommendations',
    icon: Lightbulb,
    colour: 'amber',
    endpoint: '/api/reports/learning',
  },
];

const COLOUR_MAP = {
  blue:   'bg-blue-50 text-blue-700 border-blue-200',
  green:  'bg-green-50 text-green-700 border-green-200',
  orange: 'bg-orange-50 text-orange-700 border-orange-200',
  purple: 'bg-purple-50 text-purple-700 border-purple-200',
  pink:   'bg-pink-50 text-pink-700 border-pink-200',
  teal:   'bg-teal-50 text-teal-700 border-teal-200',
  red:    'bg-red-50 text-red-700 border-red-200',
  amber:  'bg-amber-50 text-amber-700 border-amber-200',
};

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function convertToCSV(data) {
  if (!data || data.length === 0) return '';
  const headers = Object.keys(data[0]);
  const rows = data.map((row) =>
    headers.map((h) => {
      const val = row[h] ?? '';
      const str = String(val);
      return str.includes(',') || str.includes('"') || str.includes('\n')
        ? `"${str.replace(/"/g, '""')}"`
        : str;
    }).join(',')
  );
  return [headers.join(','), ...rows].join('\n');
}

export default function Reports() {
  const { t } = useTranslation();

  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [province, setProvince] = useState('All');
  const [generating, setGenerating] = useState(null);

  const handleExport = async (report, exportFormat) => {
    setGenerating(`${report.id}-${exportFormat}`);
    try {
      const params = {};
      if (dateFrom) params.date_from = dateFrom;
      if (dateTo) params.date_to = dateTo;
      if (province !== 'All') params.province = province;
      params.format = exportFormat;

      const response = await axios.get(report.endpoint, {
        params,
        responseType: exportFormat === 'csv' ? 'text' : 'blob',
      });

      const now = format(new Date(), 'yyyy-MM-dd');

      if (exportFormat === 'csv') {
        const csvData = typeof response.data === 'string'
          ? response.data
          : convertToCSV(response.data?.items ?? response.data ?? []);
        const blob = new Blob([csvData], { type: 'text/csv;charset=utf-8;' });
        downloadBlob(blob, `${report.id}_${now}.csv`);
      } else {
        const blob = response.data instanceof Blob
          ? response.data
          : new Blob([JSON.stringify(response.data, null, 2)], { type: 'application/json' });
        downloadBlob(blob, `${report.id}_${now}.pdf`);
      }

      toast.success(`${report.label} exported as ${exportFormat.toUpperCase()}`);
    } catch (err) {
      // Fallback: try to generate CSV from existing data endpoints
      try {
        const fallbackEndpoints = {
          indicator_progress: '/api/indicators',
          activity_log: '/api/activities',
          ld_events: '/api/events',
          community_engagement: '/api/community/engagements',
          financial_summary: '/api/financials/transactions',
          learning_summary: '/api/learning',
        };

        const fallbackUrl = fallbackEndpoints[report.id];
        if (fallbackUrl && exportFormat === 'csv') {
          const params = {};
          if (dateFrom) params.date_from = dateFrom;
          if (dateTo) params.date_to = dateTo;
          if (province !== 'All') params.province = province;

          const res = await axios.get(fallbackUrl, { params });
          const items = res.data?.items ?? res.data ?? [];
          if (items.length > 0) {
            const csv = convertToCSV(items);
            const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
            const now = format(new Date(), 'yyyy-MM-dd');
            downloadBlob(blob, `${report.id}_${now}.csv`);
            toast.success(`${report.label} exported as CSV`);
          } else {
            toast.error('No data available for the selected filters');
          }
        } else {
          toast.error(err.response?.data?.detail ?? `Export failed: ${err.message}`);
        }
      } catch {
        toast.error(err.response?.data?.detail ?? `Export failed: ${err.message}`);
      }
    } finally {
      setGenerating(null);
    }
  };

  return (
    <div className="p-4 lg:p-6 space-y-5 animate-fade-in">
      {/* Header */}
      <div>
        <h2 className="text-2xl font-bold text-gray-900">{t('reports.title')}</h2>
        <p className="text-sm text-gray-500">{t('reports.subtitle')}</p>
      </div>

      {/* Global filters */}
      <div className="card">
        <h3 className="font-semibold text-gray-800 text-sm mb-3">Report Filters</h3>
        <div className="flex flex-wrap gap-3">
          <div>
            <label className="field-label text-xs">Date From</label>
            <div className="relative">
              <Calendar size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                className="field-input pl-9 w-44"
              />
            </div>
          </div>
          <div>
            <label className="field-label text-xs">Date To</label>
            <div className="relative">
              <Calendar size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                className="field-input pl-9 w-44"
              />
            </div>
          </div>
          <div>
            <label className="field-label text-xs">Province</label>
            <select
              value={province}
              onChange={(e) => setProvince(e.target.value)}
              className="field-input w-auto"
            >
              {PROVINCES.map((p) => <option key={p}>{p}</option>)}
            </select>
          </div>
          {(dateFrom || dateTo || province !== 'All') && (
            <div className="flex items-end">
              <button
                onClick={() => { setDateFrom(''); setDateTo(''); setProvince('All'); }}
                className="btn-secondary text-xs"
              >
                Clear Filters
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Report cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {REPORT_TYPES.map((report) => {
          const Icon = report.icon;
          const colours = COLOUR_MAP[report.colour] ?? COLOUR_MAP.blue;
          const isGeneratingCSV = generating === `${report.id}-csv`;
          const isGeneratingPDF = generating === `${report.id}-pdf`;

          return (
            <div key={report.id} className={`card border ${colours.split(' ')[2]} hover:shadow-md transition-shadow`}>
              <div className="flex items-start gap-3">
                <div className={`p-2 rounded-lg ${colours.split(' ').slice(0, 2).join(' ')}`}>
                  <Icon size={20} />
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="font-semibold text-gray-900 text-sm">{report.label}</h3>
                  <p className="text-xs text-gray-500 mt-0.5">{report.description}</p>
                </div>
              </div>
              <div className="flex gap-2 mt-3 pt-3 border-t border-gray-100">
                <button
                  onClick={() => handleExport(report, 'csv')}
                  disabled={!!generating}
                  className="btn-secondary text-xs flex items-center gap-1.5"
                >
                  <FileSpreadsheet size={14} />
                  {isGeneratingCSV ? 'Generating...' : 'Export CSV'}
                </button>
                <button
                  onClick={() => handleExport(report, 'pdf')}
                  disabled={!!generating}
                  className="btn-secondary text-xs flex items-center gap-1.5"
                >
                  <Download size={14} />
                  {isGeneratingPDF ? 'Generating...' : 'Export PDF'}
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
