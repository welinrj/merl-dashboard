import React, { useState, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Lightbulb, Plus, Search, BookOpen, AlertCircle, Star, MessageSquare, Tag, Eye } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { format, parseISO } from 'date-fns';
import axios from 'axios';
import LearningForm from '../components/DataEntryForm/LearningForm';

const ENTRY_TYPES = ['All', 'lesson_learned', 'best_practice', 'challenge', 'recommendation'];

const DOMAINS = [
  'All',
  'Climate Resilience',
  'Disaster Risk Reduction',
  'Community Engagement',
  'Gender & Social Inclusion',
  'Financial Management',
  'Governance',
  'Knowledge Management',
  'Other',
];

const TYPE_CONFIG = {
  lesson_learned:  { label: 'Lesson Learned',  cls: 'badge-blue',   icon: BookOpen },
  best_practice:   { label: 'Best Practice',   cls: 'badge-green',  icon: Star },
  challenge:       { label: 'Challenge',        cls: 'badge-yellow', icon: AlertCircle },
  recommendation:  { label: 'Recommendation',  cls: 'badge-purple', icon: MessageSquare },
};

function TypeBadge({ type }) {
  const config = TYPE_CONFIG[type] ?? { label: type, cls: 'badge-gray', icon: BookOpen };
  const Icon = config.icon;
  return (
    <span className={`badge ${config.cls} inline-flex items-center gap-1`}>
      <Icon size={12} />
      {config.label}
    </span>
  );
}

function DetailModal({ entry, onClose }) {
  const { t } = useTranslation();
  if (!entry) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 animate-fade-in">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl overflow-y-auto max-h-[90vh]">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <Lightbulb size={20} className="text-amber-500" />
            <h2 className="text-lg font-bold text-gray-900">{entry.title}</h2>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100">
            &times;
          </button>
        </div>
        <div className="px-6 py-5 space-y-4">
          <div className="flex flex-wrap gap-2">
            <TypeBadge type={entry.entry_type} />
            {entry.domain && <span className="badge badge-gray">{entry.domain}</span>}
            {entry.published && <span className="badge badge-green">Published</span>}
          </div>

          <div>
            <h4 className="text-sm font-semibold text-gray-600 mb-1">Description</h4>
            <p className="text-sm text-gray-800 whitespace-pre-wrap">{entry.description}</p>
          </div>

          {entry.context && (
            <div>
              <h4 className="text-sm font-semibold text-gray-600 mb-1">Context</h4>
              <p className="text-sm text-gray-700 whitespace-pre-wrap">{entry.context}</p>
            </div>
          )}

          {entry.recommendations && (
            <div>
              <h4 className="text-sm font-semibold text-gray-600 mb-1">Recommendations</h4>
              <p className="text-sm text-gray-700 whitespace-pre-wrap">{entry.recommendations}</p>
            </div>
          )}

          {entry.tags?.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              <Tag size={14} className="text-gray-400" />
              {entry.tags.map((tag) => (
                <span key={tag} className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">
                  {tag}
                </span>
              ))}
            </div>
          )}

          <div className="flex flex-wrap gap-4 text-xs text-gray-400 pt-2 border-t border-gray-100">
            {entry.author && <span>Author: {entry.author}</span>}
            {entry.activity_code && <span>Activity: {entry.activity_code}</span>}
            {entry.created_at && <span>Created: {format(parseISO(entry.created_at), 'd MMM yyyy')}</span>}
            {entry.reviewed_by && <span>Reviewed by: {entry.reviewed_by}</span>}
          </div>
        </div>
        <div className="flex justify-end px-6 py-4 border-t border-gray-100">
          <button onClick={onClose} className="btn-secondary">
            {t('common.close')}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function Learning() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();

  const [showForm, setShowForm] = useState(false);
  const [typeFilter, setTypeFilter] = useState('All');
  const [domainFilter, setDomainFilter] = useState('All');
  const [search, setSearch] = useState('');
  const [selectedEntry, setSelectedEntry] = useState(null);

  const { data, isLoading, error } = useQuery({
    queryKey: ['learning-entries'],
    queryFn: () => axios.get('/api/learning?sort=created_at:desc').then((r) => r.data),
  });

  const entries = useMemo(() => {
    let items = data?.items ?? data ?? [];
    if (typeFilter !== 'All') items = items.filter((e) => e.entry_type === typeFilter);
    if (domainFilter !== 'All') items = items.filter((e) => e.domain === domainFilter);
    if (search.trim()) {
      const q = search.toLowerCase();
      items = items.filter(
        (e) =>
          e.title?.toLowerCase().includes(q) ||
          e.description?.toLowerCase().includes(q) ||
          e.tags?.some((tag) => tag.toLowerCase().includes(q))
      );
    }
    return items;
  }, [data, typeFilter, domainFilter, search]);

  const stats = useMemo(() => {
    const items = data?.items ?? data ?? [];
    return {
      total: items.length,
      lessons: items.filter((e) => e.entry_type === 'lesson_learned').length,
      practices: items.filter((e) => e.entry_type === 'best_practice').length,
      challenges: items.filter((e) => e.entry_type === 'challenge').length,
      recommendations: items.filter((e) => e.entry_type === 'recommendation').length,
      published: items.filter((e) => e.published).length,
    };
  }, [data]);

  const handleAdded = () => {
    queryClient.invalidateQueries({ queryKey: ['learning-entries'] });
    setShowForm(false);
  };

  return (
    <div className="p-4 lg:p-6 space-y-5 animate-fade-in">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">{t('learning.title')}</h2>
          <p className="text-sm text-gray-500">
            {stats.total} entries &middot; {stats.published} published
          </p>
        </div>
        <button onClick={() => setShowForm(true)} className="btn-primary">
          <Plus size={16} /> {t('form.addRecord')}
        </button>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Lessons Learned', value: stats.lessons, colour: 'text-blue-700 bg-blue-50' },
          { label: 'Best Practices',  value: stats.practices, colour: 'text-green-700 bg-green-50' },
          { label: 'Challenges',      value: stats.challenges, colour: 'text-yellow-700 bg-yellow-50' },
          { label: 'Recommendations', value: stats.recommendations, colour: 'text-purple-700 bg-purple-50' },
        ].map(({ label, value, colour }) => (
          <div key={label} className={`card text-center ${colour}`}>
            <p className="text-2xl font-bold">{value}</p>
            <p className="text-xs opacity-70">{label}</p>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <div className="relative">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder={`${t('common.search')}...`}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="field-input pl-9 max-w-xs"
          />
        </div>
        <select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
          className="field-input w-auto"
        >
          {ENTRY_TYPES.map((et) => (
            <option key={et} value={et}>
              {et === 'All' ? t('common.all') + ' Types' : TYPE_CONFIG[et]?.label ?? et}
            </option>
          ))}
        </select>
        <select
          value={domainFilter}
          onChange={(e) => setDomainFilter(e.target.value)}
          className="field-input w-auto"
        >
          {DOMAINS.map((d) => (
            <option key={d} value={d}>{d === 'All' ? t('common.all') + ' Domains' : d}</option>
          ))}
        </select>
      </div>

      {/* Error */}
      {error && (
        <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
          {t('common.error')}: {error.message}
        </div>
      )}

      {/* Entries grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {isLoading
          ? Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="card space-y-3">
                <div className="h-4 bg-gray-100 rounded animate-pulse w-3/4" />
                <div className="h-3 bg-gray-100 rounded animate-pulse" />
                <div className="h-3 bg-gray-100 rounded animate-pulse w-1/2" />
              </div>
            ))
          : entries.length === 0
          ? (
              <div className="col-span-full text-center text-gray-400 py-12">
                {t('common.noData')}
              </div>
            )
          : entries.map((entry) => (
              <div
                key={entry.id}
                className="card hover:shadow-md transition-shadow cursor-pointer group"
                onClick={() => setSelectedEntry(entry)}
              >
                <div className="flex items-start justify-between gap-2 mb-2">
                  <TypeBadge type={entry.entry_type} />
                  <button
                    className="opacity-0 group-hover:opacity-100 transition-opacity text-gray-400 hover:text-blue-600"
                    title="View details"
                  >
                    <Eye size={16} />
                  </button>
                </div>
                <h3 className="font-semibold text-gray-900 text-sm mb-1 line-clamp-2">{entry.title}</h3>
                <p className="text-xs text-gray-500 line-clamp-3 mb-3">{entry.description}</p>

                {entry.tags?.length > 0 && (
                  <div className="flex flex-wrap gap-1 mb-2">
                    {entry.tags.slice(0, 4).map((tag) => (
                      <span key={tag} className="text-xs bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded">
                        {tag}
                      </span>
                    ))}
                    {entry.tags.length > 4 && (
                      <span className="text-xs text-gray-400">+{entry.tags.length - 4}</span>
                    )}
                  </div>
                )}

                <div className="flex items-center justify-between text-xs text-gray-400 pt-2 border-t border-gray-50">
                  <span>{entry.author ?? 'Unknown'}</span>
                  <div className="flex items-center gap-2">
                    {entry.domain && <span className="text-gray-500">{entry.domain}</span>}
                    {entry.created_at && (
                      <span>{format(parseISO(entry.created_at), 'd MMM yyyy')}</span>
                    )}
                  </div>
                </div>
              </div>
            ))}
      </div>

      {/* Detail modal */}
      {selectedEntry && (
        <DetailModal entry={selectedEntry} onClose={() => setSelectedEntry(null)} />
      )}

      {/* Add entry form */}
      {showForm && (
        <LearningForm onSuccess={handleAdded} onClose={() => setShowForm(false)} />
      )}
    </div>
  );
}
