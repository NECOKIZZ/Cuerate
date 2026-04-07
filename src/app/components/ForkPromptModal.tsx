import { useState } from 'react';
import { X, Sparkles, Tag } from 'lucide-react';
import { Prompt } from '../../lib/types';

interface ForkPromptModalProps {
  prompt: Prompt;
  onClose: () => void;
  onSave: (forkedPrompt: Partial<Prompt>) => void;
}

export function ForkPromptModal({ prompt, onClose, onSave }: ForkPromptModalProps) {
  const [promptText, setPromptText] = useState(prompt.promptText);
  const [tags, setTags] = useState(prompt.styleTags.join(', '));
  const [aiModel, setAiModel] = useState(prompt.model);
  const [moodLabel, setMoodLabel] = useState(prompt.moodLabel);

  const handleSave = () => {
    onSave({
      promptText,
      styleTags: tags.split(',').map(tag => tag.trim()).filter(Boolean),
      model: aiModel,
      moodLabel,
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-lg max-h-[85vh] overflow-y-auto glass-surface rounded-[var(--cuerate-r-xl)] border border-[var(--cuerate-text-3)]">
        {/* Header */}
        <div className="sticky top-0 glass-nav border-b border-[var(--cuerate-text-3)] px-5 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-[#4cce8a]/20 flex items-center justify-center">
              <Sparkles className="w-4 h-4 text-[#4cce8a]" />
            </div>
            <div>
              <h2 className="font-primary font-bold text-base text-white">Fork Prompt</h2>
              <p className="font-accent text-xs text-[var(--cuerate-text-2)]">
                Edit and save your own version
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-full hover:bg-[var(--cuerate-surface)] transition-colors"
          >
            <X className="w-5 h-5 text-[var(--cuerate-text-2)]" />
          </button>
        </div>

        {/* Content */}
        <div className="p-5 space-y-4">
          {/* Original Author Info */}
          <div className="glass-surface rounded-[var(--cuerate-r-lg)] p-3 border border-[var(--cuerate-text-3)]">
            <p className="font-accent text-xs text-[var(--cuerate-text-2)] mb-2">Forked from</p>
            <div className="flex items-center gap-3">
              <img
                src={prompt.authorAvatar}
                alt={prompt.authorHandle}
                className="w-8 h-8 rounded-full"
              />
              <div>
                <p className="font-accent text-xs text-[var(--cuerate-text-2)]">@{prompt.authorHandle}</p>
              </div>
            </div>
          </div>

          {/* Media Upload Area */}
          <div>
            <label className="block font-accent text-sm font-medium text-[var(--cuerate-text-1)] mb-2">
              Upload Media
            </label>
            <div className="relative aspect-video rounded-[var(--cuerate-r-lg)] overflow-hidden border-2 border-dashed border-[var(--cuerate-text-3)] glass-surface flex items-center justify-center cursor-pointer hover:border-[var(--cuerate-indigo)] transition-all">
              <div className="text-center">
                <div className="w-12 h-12 rounded-full bg-[var(--cuerate-indigo)]/20 flex items-center justify-center mx-auto mb-2">
                  <svg className="w-6 h-6 text-[var(--cuerate-indigo)]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                  </svg>
                </div>
                <p className="font-accent text-sm text-[var(--cuerate-text-1)]">Click to upload</p>
                <p className="font-accent text-xs text-[var(--cuerate-text-2)] mt-1">Image or Video</p>
              </div>
            </div>
          </div>

          {/* Prompt Text Input */}
          <div>
            <label className="block font-accent text-sm font-medium text-[var(--cuerate-text-1)] mb-2">
              Prompt Text
            </label>
            <textarea
              value={promptText}
              onChange={(e) => setPromptText(e.target.value)}
              rows={3}
              className="w-full px-4 py-2.5 glass-surface rounded-[var(--cuerate-r-lg)] border border-[var(--cuerate-text-3)] text-white font-accent text-sm focus:outline-none focus:ring-2 focus:ring-[var(--cuerate-indigo)] transition-all resize-none"
              placeholder="Enter your prompt..."
            />
          </div>

          {/* Mood Label Input */}
          <div>
            <label className="block font-accent text-sm font-medium text-[var(--cuerate-text-1)] mb-2">
              Mood Label
            </label>
            <input
              type="text"
              value={moodLabel}
              onChange={(e) => setMoodLabel(e.target.value)}
              className="w-full px-4 py-2.5 glass-surface rounded-[var(--cuerate-r-lg)] border border-[var(--cuerate-text-3)] text-white font-accent text-sm focus:outline-none focus:ring-2 focus:ring-[var(--cuerate-indigo)] transition-all"
              placeholder="e.g., Dreamy, Epic, Moody..."
            />
          </div>

          {/* AI Model Input */}
          <div>
            <label className="block font-accent text-sm font-medium text-[var(--cuerate-text-1)] mb-2">
              AI Model
            </label>
            <input
              type="text"
              value={aiModel}
              onChange={(e) => setAiModel(e.target.value)}
              className="w-full px-4 py-2.5 glass-surface rounded-[var(--cuerate-r-lg)] border border-[var(--cuerate-text-3)] text-white font-accent text-sm focus:outline-none focus:ring-2 focus:ring-[var(--cuerate-indigo)] transition-all"
              placeholder="e.g., Midjourney, DALL-E, Stable Diffusion..."
            />
          </div>

          {/* Tags Input */}
          <div>
            <label className="block font-accent text-sm font-medium text-[var(--cuerate-text-1)] mb-2 flex items-center gap-2">
              <Tag className="w-4 h-4" />
              Tags
            </label>
            <input
              type="text"
              value={tags}
              onChange={(e) => setTags(e.target.value)}
              className="w-full px-4 py-2.5 glass-surface rounded-[var(--cuerate-r-lg)] border border-[var(--cuerate-text-3)] text-white font-accent text-sm focus:outline-none focus:ring-2 focus:ring-[var(--cuerate-indigo)] transition-all"
              placeholder="Add tags separated by commas..."
            />
            <p className="font-accent text-xs text-[var(--cuerate-text-2)] mt-1.5">
              Separate tags with commas (e.g., cyberpunk, neon, futuristic)
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="sticky bottom-0 glass-nav border-t border-[var(--cuerate-text-3)] px-5 py-3 flex items-center justify-end gap-3">
          <button
            onClick={onClose}
            className="px-5 py-2 rounded-[var(--cuerate-r-pill)] glass-surface text-[var(--cuerate-text-1)] font-accent text-sm font-medium hover:text-white transition-all"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            className="px-5 py-2 rounded-[var(--cuerate-r-pill)] bg-[#4cce8a] text-white font-accent text-sm font-medium hover:opacity-90 transition-all shadow-lg shadow-[#4cce8a]/20"
          >
            Save Fork
          </button>
        </div>
      </div>
    </div>
  );
}
