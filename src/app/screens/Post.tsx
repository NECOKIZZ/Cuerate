import { useState } from 'react';
import { X, Upload, Sparkles, Loader2 } from 'lucide-react';
import { useNavigate } from 'react-router';
import { authApi, metaApi, promptsApi, uploadsApi } from '../../lib/backend';
import { useAuth } from '../../lib/auth-context';
import { useBackendQuery } from '../../lib/useBackendQuery';
import type { PromptContentType } from '../../lib/types';

function detectImageDimensions(url: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve({ width: image.naturalWidth, height: image.naturalHeight });
    image.onerror = () => reject(new Error('Could not load the thumbnail URL. Please use a valid public image link.'));
    image.src = url;
  });
}

function detectVideoFileDimensions(file: File): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const video = document.createElement('video');
    video.preload = 'metadata';
    video.onloadedmetadata = () => {
      resolve({ width: video.videoWidth, height: video.videoHeight });
      URL.revokeObjectURL(objectUrl);
    };
    video.onerror = () => {
      reject(new Error('Could not read the uploaded video metadata.'));
      URL.revokeObjectURL(objectUrl);
    };
    video.src = objectUrl;
  });
}

export function Post() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [promptText, setPromptText] = useState('');
  const [selectedModel, setSelectedModel] = useState('');
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [cameraNotes, setCameraNotes] = useState('');
  const [selectedMood, setSelectedMood] = useState('');
  const [selectedDifficulty, setSelectedDifficulty] = useState('');
  const [isAutoFilling, setIsAutoFilling] = useState(false);
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [thumbnailUrl, setThumbnailUrl] = useState('');
  const [contentType, setContentType] = useState<PromptContentType>('image');
  const [isPublishing, setIsPublishing] = useState(false);
  const [publishError, setPublishError] = useState<string | null>(null);
  const { data: availableModels } = useBackendQuery(() => metaApi.getAvailableModels(), [], []);
  const { data: availableStyleTags } = useBackendQuery(() => metaApi.getAvailableStyleTags(), [], []);
  const { data: availableMoodLabels } = useBackendQuery(() => metaApi.getAvailableMoodLabels(), [], []);
  const { data: difficultyLevels } = useBackendQuery(() => metaApi.getDifficultyLevels(), [], []);
  const { data: currentUser } = useBackendQuery(() => authApi.getCurrentUser(), null, []);
  const activeUser = user ?? currentUser;

  if (!activeUser) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4">
        <div className="max-w-md w-full glass-surface rounded-[var(--cuerate-r-xl)] border border-[var(--cuerate-text-3)] p-8 text-center">
          <h1 className="font-primary font-bold text-2xl text-[var(--cuerate-text-1)] mb-3">Log in to post</h1>
          <p className="font-accent text-sm text-[var(--cuerate-text-2)] mb-6">
            Publishing prompts and uploading media now runs through the auth-backed Firebase layer.
          </p>
          <button
            onClick={() => navigate('/auth')}
            className="w-full rounded-[var(--cuerate-r-pill)] bg-[var(--cuerate-indigo)] px-4 py-3 font-accent text-sm font-medium text-white indigo-glow"
          >
            Go to Login
          </button>
        </div>
      </div>
    );
  }

  const handleAutoFill = async () => {
    setIsAutoFilling(true);
    setTimeout(() => {
      setSelectedTags(['cinematic', 'aerial', 'nature']);
      setCameraNotes('anamorphic lens, slow dolly forward, shallow depth of field');
      setSelectedMood('Cinematic');
      setSelectedDifficulty('Intermediate');
      setSelectedModel('Sora');
      setIsAutoFilling(false);
    }, 1500);
  };

  const handlePublish = async () => {
    if (!activeUser) {
      return;
    }

    setIsPublishing(true);
    setPublishError(null);

    try {
      let uploadResult;
      let mediaWidth: number | undefined;
      let mediaHeight: number | undefined;

      if (videoFile) {
        const videoDimensions = await detectVideoFileDimensions(videoFile);
        mediaWidth = videoDimensions.width;
        mediaHeight = videoDimensions.height;
        uploadResult = await uploadsApi.uploadPromptMedia(videoFile, activeUser.uid);
      } else if (thumbnailUrl.trim()) {
        const imageDimensions = await detectImageDimensions(thumbnailUrl.trim());
        mediaWidth = imageDimensions.width;
        mediaHeight = imageDimensions.height;
      }

      const finalContentType: PromptContentType = videoFile ? 'video' : contentType;
      const finalThumbnailUrl = thumbnailUrl.trim() || uploadResult?.downloadUrl || '';
      const finalAspectRatio =
        mediaWidth && mediaHeight
          ? mediaHeight > mediaWidth
            ? 'portrait'
            : 'landscape'
          : 'landscape';

      await promptsApi.createPrompt({
        authorUid: activeUser.uid,
        promptText: promptText.trim(),
        model: selectedModel,
        styleTags: selectedTags,
        cameraNotes,
        moodLabel: selectedMood || 'Cinematic',
        difficulty: selectedDifficulty || 'Beginner',
        contentType: finalContentType,
        aspectRatio: finalAspectRatio,
        videoUrl: uploadResult?.downloadUrl ?? '',
        thumbnailUrl: finalThumbnailUrl,
        mediaWidth,
        mediaHeight,
      });

      navigate('/');
    } catch (error) {
      setPublishError(error instanceof Error ? error.message : 'Could not publish your prompt.');
    } finally {
      setIsPublishing(false);
    }
  };

  const toggleTag = (tag: string) => {
    setSelectedTags((prev) =>
      prev.includes(tag) ? prev.filter((entry) => entry !== tag) : [...prev, tag],
    );
  };

  return (
    <div className="min-h-screen pb-8">
      <div className="sticky top-0 z-40 glass-nav border-b border-[var(--cuerate-text-3)]">
        <div className="flex items-center justify-between px-4 md:px-8 py-4 md:py-6">
          <h1 className="font-primary font-semibold text-lg md:text-2xl text-[var(--cuerate-text-1)]">
            New Post
          </h1>
          <button
            onClick={() => navigate('/')}
            className="p-2 rounded-full hover:bg-[var(--cuerate-surface)] transition-colors"
          >
            <X className="w-5 h-5 text-[var(--cuerate-text-1)]" />
          </button>
        </div>
      </div>

      <div className="px-4 md:px-8 py-6 max-w-3xl md:mx-auto space-y-6">
        <div>
          <label className="font-accent text-sm text-[var(--cuerate-text-1)] mb-2 block">
            Post Type
          </label>
          <div className="flex flex-wrap gap-2">
            {(['image', 'video'] as const).map((entry) => (
              <button
                key={entry}
                onClick={() => setContentType(entry)}
                className={`px-4 py-2 rounded-[var(--cuerate-r-pill)] font-accent text-sm transition-all ${
                  contentType === entry
                    ? 'bg-[var(--cuerate-indigo)] text-white indigo-glow'
                    : 'glass-surface text-[var(--cuerate-text-2)] hover:text-[var(--cuerate-text-1)]'
                }`}
              >
                {entry === 'image' ? 'Image / Text Prompt' : 'Video Prompt'}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="font-accent text-sm text-[var(--cuerate-text-1)] mb-2 block">
            Video Upload
          </label>
          <label className="border-2 border-dashed border-[var(--cuerate-indigo)]/30 rounded-[var(--cuerate-r-xl)] glass-surface p-8 flex flex-col items-center justify-center gap-3 hover:border-[var(--cuerate-indigo)]/50 transition-colors cursor-pointer">
            <input
              type="file"
              accept="video/mp4,video/quicktime,video/webm"
              className="hidden"
              onChange={(event) => setVideoFile(event.target.files?.[0] ?? null)}
            />
            <Upload className="w-8 h-8 text-[var(--cuerate-indigo)]" />
            <div className="text-center">
              <p className="font-accent text-sm text-[var(--cuerate-text-1)] mb-1">
                {videoFile ? videoFile.name : 'Upload Video (Optional)'}
              </p>
              <p className="font-accent text-xs text-[var(--cuerate-text-2)]">
                Leave this empty for text/image-style posts until Storage is ready.
              </p>
            </div>
          </label>
        </div>

        <div>
          <label className="font-accent text-sm text-[var(--cuerate-text-1)] mb-2 block">
            Thumbnail Image URL
          </label>
          <input
            type="url"
            value={thumbnailUrl}
            onChange={(event) => setThumbnailUrl(event.target.value)}
            placeholder="https://example.com/thumbnail.jpg"
            className="w-full px-4 py-3 rounded-[var(--cuerate-r-md)] glass-surface border border-[var(--cuerate-text-3)] focus:border-[var(--cuerate-indigo)] focus:indigo-glow outline-none font-accent text-sm text-[var(--cuerate-text-1)] placeholder:text-[var(--cuerate-text-2)] transition-all"
          />
        </div>

        <div>
          <label className="font-accent text-sm text-[var(--cuerate-text-1)] mb-2 block">
            Your Prompt
          </label>
          <textarea
            value={promptText}
            onChange={(event) => setPromptText(event.target.value)}
            placeholder="Describe your AI video prompt in detail..."
            className="w-full h-32 px-4 py-3 rounded-[var(--cuerate-r-md)] glass-surface border border-[var(--cuerate-text-3)] focus:border-[var(--cuerate-indigo)] focus:indigo-glow outline-none font-accent text-sm text-[var(--cuerate-text-1)] placeholder:text-[var(--cuerate-text-2)] resize-none transition-all"
          />
        </div>

        {publishError && (
          <div className="rounded-[var(--cuerate-r-md)] border border-red-500/30 bg-red-500/10 px-4 py-3 font-accent text-sm text-red-200">
            {publishError}
          </div>
        )}

        <button
          onClick={handleAutoFill}
          disabled={isAutoFilling || !promptText}
          className="w-full flex items-center justify-center gap-2 px-6 py-4 rounded-[var(--cuerate-r-pill)] bg-gradient-to-r from-[var(--cuerate-indigo)] to-[var(--cuerate-blue)] text-white font-accent font-medium indigo-glow hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isAutoFilling ? (
            <>
              <Loader2 className="w-5 h-5 animate-spin" />
              Auto-filling with AI...
            </>
          ) : (
            <>
              <Sparkles className="w-5 h-5" />
              Auto-fill with AI
            </>
          )}
        </button>

        <div>
          <label className="font-accent text-sm text-[var(--cuerate-text-1)] mb-2 block">
            Model
          </label>
          <div className="flex flex-wrap gap-2">
            {availableModels.map((model) => (
              <button
                key={model}
                onClick={() => setSelectedModel(model)}
                className={`px-4 py-2 rounded-[var(--cuerate-r-pill)] font-accent text-sm transition-all ${
                  selectedModel === model
                    ? 'bg-[var(--cuerate-indigo)] text-white indigo-glow'
                    : 'glass-surface text-[var(--cuerate-text-2)] hover:text-[var(--cuerate-text-1)]'
                }`}
              >
                {model}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="font-accent text-sm text-[var(--cuerate-text-1)] mb-2 block">
            Style Tags
          </label>
          <div className="flex flex-wrap gap-2">
            {availableStyleTags.map((tag) => (
              <button
                key={tag}
                onClick={() => toggleTag(tag)}
                className={`px-4 py-2 rounded-[var(--cuerate-r-pill)] font-accent text-sm transition-all ${
                  selectedTags.includes(tag)
                    ? 'bg-[var(--cuerate-indigo)] text-white indigo-glow'
                    : 'glass-surface text-[var(--cuerate-text-2)] hover:text-[var(--cuerate-text-1)]'
                }`}
              >
                #{tag}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="font-accent text-sm text-[var(--cuerate-text-1)] mb-2 block">
            Camera Notes
          </label>
          <input
            type="text"
            value={cameraNotes}
            onChange={(event) => setCameraNotes(event.target.value)}
            placeholder="anamorphic, wide angle, slow push-in..."
            className="w-full px-4 py-3 rounded-[var(--cuerate-r-md)] glass-surface border border-[var(--cuerate-text-3)] focus:border-[var(--cuerate-indigo)] focus:indigo-glow outline-none font-accent text-sm text-[var(--cuerate-text-1)] placeholder:text-[var(--cuerate-text-2)] transition-all"
          />
        </div>

        <div>
          <label className="font-accent text-sm text-[var(--cuerate-text-1)] mb-2 block">
            Mood
          </label>
          <div className="flex flex-wrap gap-2">
            {availableMoodLabels.map((mood) => (
              <button
                key={mood}
                onClick={() => setSelectedMood(mood)}
                className={`px-4 py-2 rounded-[var(--cuerate-r-pill)] font-accent text-sm transition-all ${
                  selectedMood === mood
                    ? 'bg-[var(--cuerate-indigo)] text-white indigo-glow'
                    : 'glass-surface text-[var(--cuerate-text-2)] hover:text-[var(--cuerate-text-1)]'
                }`}
              >
                {mood}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="font-accent text-sm text-[var(--cuerate-text-1)] mb-2 block">
            Difficulty
          </label>
          <div className="flex flex-wrap gap-2">
            {difficultyLevels.map((level) => (
              <button
                key={level}
                onClick={() => setSelectedDifficulty(level)}
                className={`px-4 py-2 rounded-[var(--cuerate-r-pill)] font-accent text-sm transition-all ${
                  selectedDifficulty === level
                    ? 'bg-[var(--cuerate-indigo)] text-white indigo-glow'
                    : 'glass-surface text-[var(--cuerate-text-2)] hover:text-[var(--cuerate-text-1)]'
                }`}
              >
                {level}
              </button>
            ))}
          </div>
        </div>

        <button
          onClick={() => void handlePublish()}
          disabled={!promptText.trim() || !selectedModel || isPublishing}
          className="w-full py-4 rounded-[var(--cuerate-r-pill)] bg-gradient-to-r from-[#5500cc] to-[var(--cuerate-blue)] text-white font-accent font-medium text-lg indigo-glow hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isPublishing ? (
            <span className="inline-flex items-center gap-2">
              <Loader2 className="w-5 h-5 animate-spin" />
              Publishing...
            </span>
          ) : (
            'Publish to Cuerate'
          )}
        </button>
      </div>
    </div>
  );
}
