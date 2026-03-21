import React, { useState } from 'react';
import { useForm } from 'react-hook-form';
import { useMutation } from '@tanstack/react-query';
import { X, Lightbulb } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import axios from 'axios';

const ENTRY_TYPES = [
  { value: 'lesson_learned',  label: 'Lesson Learned' },
  { value: 'best_practice',   label: 'Best Practice' },
  { value: 'challenge',       label: 'Challenge' },
  { value: 'recommendation',  label: 'Recommendation' },
];

const DOMAINS = [
  'Climate Resilience',
  'Disaster Risk Reduction',
  'Community Engagement',
  'Gender & Social Inclusion',
  'Financial Management',
  'Governance',
  'Knowledge Management',
  'Other',
];

export default function LearningForm({ onSuccess, onClose }) {
  const { t } = useTranslation();
  const [tagInput, setTagInput] = useState('');

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors },
  } = useForm({
    defaultValues: {
      title: '',
      entry_type: '',
      domain: '',
      activity_code: '',
      description: '',
      context: '',
      recommendations: '',
      tags: [],
      author: '',
      published: false,
    },
  });

  const tags = watch('tags') ?? [];

  const addTag = () => {
    const trimmed = tagInput.trim();
    if (trimmed && !tags.includes(trimmed)) {
      setValue('tags', [...tags, trimmed]);
    }
    setTagInput('');
  };

  const removeTag = (tag) => {
    setValue('tags', tags.filter((t) => t !== tag));
  };

  const handleTagKeyDown = (e) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      addTag();
    }
  };

  const mutation = useMutation({
    mutationFn: (formData) => axios.post('/api/learning', formData),
    onSuccess: () => {
      toast.success('Knowledge entry created successfully');
      onSuccess?.();
    },
    onError: (err) => {
      toast.error(err.response?.data?.detail ?? err.message ?? t('common.error'));
    },
  });

  const onSubmit = (data) => mutation.mutate(data);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 animate-fade-in">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-xl overflow-y-auto max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <Lightbulb size={20} className="text-amber-500" />
            <h2 className="text-lg font-bold text-gray-900">{t('learning.addEntry')}</h2>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100">
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="px-6 py-5 space-y-4">
          {/* Title */}
          <div>
            <label className="field-label">
              Title <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              {...register('title', { required: t('common.required') })}
              className="field-input"
              placeholder="e.g. Community-led DRR planning improves response times"
            />
            {errors.title && <p className="field-error">{errors.title.message}</p>}
          </div>

          {/* Type + Domain */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="field-label">
                Type <span className="text-red-500">*</span>
              </label>
              <select
                {...register('entry_type', { required: t('common.required') })}
                className="field-input"
              >
                <option value="">{t('form.selectOption')}</option>
                {ENTRY_TYPES.map((et) => (
                  <option key={et.value} value={et.value}>{et.label}</option>
                ))}
              </select>
              {errors.entry_type && <p className="field-error">{errors.entry_type.message}</p>}
            </div>
            <div>
              <label className="field-label">Domain {t('common.optional')}</label>
              <select {...register('domain')} className="field-input">
                <option value="">{t('form.selectOption')}</option>
                {DOMAINS.map((d) => (
                  <option key={d} value={d}>{d}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Activity Code + Author */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="field-label">Activity Code {t('common.optional')}</label>
              <input
                type="text"
                {...register('activity_code')}
                className="field-input"
                placeholder="e.g. ACT-001"
              />
            </div>
            <div>
              <label className="field-label">
                Author <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                {...register('author', { required: t('common.required') })}
                className="field-input"
                placeholder="Full name"
              />
              {errors.author && <p className="field-error">{errors.author.message}</p>}
            </div>
          </div>

          {/* Description */}
          <div>
            <label className="field-label">
              Description <span className="text-red-500">*</span>
            </label>
            <textarea
              {...register('description', {
                required: t('common.required'),
                minLength: { value: 20, message: 'Please provide at least 20 characters' },
              })}
              rows={4}
              className="field-input resize-y"
              placeholder="Describe the learning, practice, challenge, or recommendation in detail..."
            />
            {errors.description && <p className="field-error">{errors.description.message}</p>}
          </div>

          {/* Context */}
          <div>
            <label className="field-label">Context / Background {t('common.optional')}</label>
            <textarea
              {...register('context')}
              rows={3}
              className="field-input resize-y"
              placeholder="Provide any relevant background or context..."
            />
          </div>

          {/* Recommendations */}
          <div>
            <label className="field-label">Recommendations {t('common.optional')}</label>
            <textarea
              {...register('recommendations')}
              rows={3}
              className="field-input resize-y"
              placeholder="What actions or changes are recommended based on this entry?"
            />
          </div>

          {/* Tags */}
          <div>
            <label className="field-label">Tags {t('common.optional')}</label>
            <div className="flex flex-wrap gap-1.5 mb-2">
              {tags.map((tag) => (
                <span key={tag} className="inline-flex items-center gap-1 text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">
                  {tag}
                  <button type="button" onClick={() => removeTag(tag)} className="hover:text-red-500">&times;</button>
                </span>
              ))}
            </div>
            <div className="flex gap-2">
              <input
                type="text"
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyDown={handleTagKeyDown}
                className="field-input flex-1"
                placeholder="Type a tag and press Enter"
              />
              <button type="button" onClick={addTag} className="btn-secondary text-sm">
                Add
              </button>
            </div>
          </div>

          {/* Published */}
          <label className="flex items-start gap-3 cursor-pointer">
            <input
              type="checkbox"
              {...register('published')}
              className="mt-0.5 rounded border-gray-300 text-blue-600 w-4 h-4"
            />
            <span className="text-sm text-gray-700">
              Publish this entry (visible to all users)
            </span>
          </label>

          {/* Actions */}
          <div className="flex justify-end gap-3 pt-2 border-t border-gray-100">
            <button type="button" onClick={onClose} className="btn-secondary">
              {t('form.cancel')}
            </button>
            <button
              type="submit"
              disabled={mutation.isPending}
              className="btn-primary"
            >
              {mutation.isPending ? t('form.submitting') : t('form.submit')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
