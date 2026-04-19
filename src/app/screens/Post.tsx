import { useState } from 'react';
import { Loader2, Sparkles, Upload, X } from 'lucide-react';
import { useNavigate } from 'react-router';
import { metaApi, promptsApi, uploadsApi, workflowsApi } from '../../lib/backend';
import { useAuth } from '../../lib/auth-context';
import {
  createVideoThumbnailFile,
  detectImageFileDimensions,
  detectVideoFileDimensions,
} from '../../lib/media';
import { useBackendQuery } from '../../lib/useBackendQuery';
import type {
  PromptContentType,
  WorkflowGenerationType,
  WorkflowStepCreateInput,
} from '../../lib/types';

type PostMode = 'prompt' | 'workflow';

interface WorkflowDraftStep {
  id: string;
  label: string;
  model: string;
  generationType: WorkflowGenerationType;
  ingredientOutputType: PromptContentType;
  promptText: string;
  note: string;
  inputImageFile: File | null;
  ingredientFiles: File[];
  startFrameFile: File | null;
  endFrameFile: File | null;
  resultMediaFile: File | null;
}

const generationTypeOptions: Array<{ value: WorkflowGenerationType; label: string }> = [
  { value: 'prompt_to_video', label: 'Prompt to video' },
  { value: 'image_to_video', label: 'Image to video' },
  { value: 'frames_to_video', label: 'Two frames to video' },
  { value: 'prompt_to_image', label: 'Prompt to image' },
  { value: 'ingredients', label: 'Ingredients' },
];
const IMAGE_ONLY_MODEL = 'NanoBanana';
const MAX_INGREDIENTS = 5;

function createWorkflowStep(index: number, model = ''): WorkflowDraftStep {
  return {
    id: `step-${index + 1}`,
    label: `Step ${index + 1}`,
    model,
    generationType: 'prompt_to_video',
    ingredientOutputType: 'video',
    promptText: '',
    note: '',
    inputImageFile: null,
    ingredientFiles: [],
    startFrameFile: null,
    endFrameFile: null,
    resultMediaFile: null,
  };
}

function getExpectedResultType(step: Pick<WorkflowDraftStep, 'generationType' | 'ingredientOutputType'>): PromptContentType {
  if (step.generationType === 'prompt_to_image') {
    return 'image';
  }

  if (step.generationType === 'ingredients') {
    return step.ingredientOutputType;
  }

  return 'video';
}

function ensureNanoBananaOption(models: string[]) {
  if (models.includes(IMAGE_ONLY_MODEL)) {
    return models;
  }
  return [IMAGE_ONLY_MODEL, ...models];
}

export function Post() {
  const navigate = useNavigate();
  const { user: activeUser, isLoading: authIsLoading } = useAuth();
  const [postMode, setPostMode] = useState<PostMode>('prompt');
  const [isPublishing, setIsPublishing] = useState(false);
  const [publishError, setPublishError] = useState<string | null>(null);

  const [promptText, setPromptText] = useState('');
  const [selectedModel, setSelectedModel] = useState('');
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [cameraNotes, setCameraNotes] = useState('');
  const [selectedMood, setSelectedMood] = useState('');
  const [selectedDifficulty, setSelectedDifficulty] = useState('');
  const [isAutoFilling, setIsAutoFilling] = useState(false);
  const [mediaFile, setMediaFile] = useState<File | null>(null);
  const [contentType, setContentType] = useState<PromptContentType>('image');

  const [workflowTitle, setWorkflowTitle] = useState('');
  const [workflowDescription, setWorkflowDescription] = useState('');
  const [workflowTags, setWorkflowTags] = useState<string[]>([]);
  const [workflowCoverFile, setWorkflowCoverFile] = useState<File | null>(null);
  const [workflowSteps, setWorkflowSteps] = useState<WorkflowDraftStep[]>([
    createWorkflowStep(0),
  ]);

  const { data: availableModels } = useBackendQuery(() => metaApi.getAvailableModels(), [], []);
  const { data: availableStyleTags } = useBackendQuery(() => metaApi.getAvailableStyleTags(), [], []);
  const { data: availableMoodLabels } = useBackendQuery(() => metaApi.getAvailableMoodLabels(), [], []);
  const { data: difficultyLevels } = useBackendQuery(() => metaApi.getDifficultyLevels(), [], []);
  const allModelOptions = ensureNanoBananaOption([...availableModels]);

  const handleAutoFill = async () => {
    setIsAutoFilling(true);
    window.setTimeout(() => {
      setSelectedTags(['cinematic', 'aerial', 'nature']);
      setCameraNotes('anamorphic lens, slow dolly forward, shallow depth of field');
      setSelectedMood('Cinematic');
      setSelectedDifficulty('Intermediate');
      setSelectedModel(contentType === 'image' ? IMAGE_ONLY_MODEL : 'Sora');
      setIsAutoFilling(false);
    }, 1200);
  };

  const toggleTag = (tag: string) => {
    setSelectedTags((prev) =>
      prev.includes(tag) ? prev.filter((entry) => entry !== tag) : [...prev, tag],
    );
  };

  const toggleWorkflowTag = (tag: string) => {
    setWorkflowTags((prev) =>
      prev.includes(tag) ? prev.filter((entry) => entry !== tag) : [...prev, tag],
    );
  };

  const updateWorkflowStep = (stepId: string, patch: Partial<WorkflowDraftStep>) => {
    setWorkflowSteps((prev) =>
      prev.map((step) => (step.id === stepId ? { ...step, ...patch } : step)),
    );
  };

  const handleWorkflowGenerationType = (stepId: string, value: WorkflowGenerationType) => {
    const expectedType = getExpectedResultType({
      generationType: value,
      ingredientOutputType: value === 'ingredients' ? 'video' : 'video',
    });
    updateWorkflowStep(stepId, {
      generationType: value,
      ingredientOutputType: value === 'ingredients' ? 'video' : 'video',
      model: expectedType === 'image' && value !== 'ingredients' ? IMAGE_ONLY_MODEL : '',
      inputImageFile: null,
      ingredientFiles: [],
      startFrameFile: null,
      endFrameFile: null,
      resultMediaFile: null,
    });
  };

  const handleIngredientOutputType = (stepId: string, value: PromptContentType) => {
    updateWorkflowStep(stepId, {
      ingredientOutputType: value,
      resultMediaFile: null,
    });
  };

  const addWorkflowStep = () => {
    setWorkflowSteps((prev) => {
      if (prev.length >= 8) {
        return prev;
      }
      const previousStep = prev[prev.length - 1];
      const previousStepExpectedType = previousStep
        ? getExpectedResultType(previousStep)
        : 'video';
      const previousStepModel =
        previousStepExpectedType === 'video' && previousStep?.model?.trim() && previousStep.model !== IMAGE_ONLY_MODEL
          ? previousStep.model
          : '';
      return [...prev, createWorkflowStep(prev.length, previousStepModel)];
    });
  };

  const removeWorkflowStep = (stepId: string) => {
    setWorkflowSteps((prev) => {
      if (prev.length <= 1) {
        return prev;
      }
      return prev
        .filter((entry) => entry.id !== stepId)
        .map((entry, index) => ({
          ...entry,
          id: `step-${index + 1}`,
          label: entry.label.trim() || `Step ${index + 1}`,
        }));
    });
  };

  const publishPrompt = async () => {
    if (!activeUser) {
      return;
    }
    if (!mediaFile) {
      throw new Error('Please upload an image or video before publishing.');
    }
    if (contentType === 'image' && selectedModel !== IMAGE_ONLY_MODEL) {
      throw new Error('Image prompts must use NanoBanana.');
    }
    if (contentType === 'video' && selectedModel === IMAGE_ONLY_MODEL) {
      throw new Error('NanoBanana is only available for image generation.');
    }

    let videoUrl = '';
    let thumbnailUrl = '';
    let mediaWidth: number | undefined;
    let mediaHeight: number | undefined;

    if (contentType === 'video') {
      if (!mediaFile.type.startsWith('video/')) {
        throw new Error('Selected file is not a video.');
      }
      const dims = await detectVideoFileDimensions(mediaFile);
      mediaWidth = dims.width;
      mediaHeight = dims.height;
      const videoUpload = await uploadsApi.uploadPromptMedia(mediaFile, activeUser.uid);
      const thumbnailUpload = await uploadsApi.uploadPromptMedia(
        await createVideoThumbnailFile(mediaFile),
        activeUser.uid,
      );
      videoUrl = videoUpload.downloadUrl;
      thumbnailUrl = thumbnailUpload.downloadUrl;
    } else {
      if (!mediaFile.type.startsWith('image/')) {
        throw new Error('Selected file is not an image.');
      }
      const dims = await detectImageFileDimensions(mediaFile);
      mediaWidth = dims.width;
      mediaHeight = dims.height;
      const imageUpload = await uploadsApi.uploadPromptMedia(mediaFile, activeUser.uid);
      thumbnailUrl = imageUpload.downloadUrl;
    }

    await promptsApi.createPrompt({
      authorUid: activeUser.uid,
      promptText: promptText.trim(),
      model: selectedModel,
      styleTags: selectedTags,
      cameraNotes,
      moodLabel: selectedMood || 'Cinematic',
      difficulty: selectedDifficulty || 'Beginner',
      contentType,
      aspectRatio: mediaWidth && mediaHeight ? (mediaHeight > mediaWidth ? 'portrait' : 'landscape') : 'landscape',
      videoUrl,
      thumbnailUrl,
      mediaWidth,
      mediaHeight,
    });
  };

  const publishWorkflow = async () => {
    if (!activeUser) {
      return;
    }
    if (!workflowTitle.trim()) {
      throw new Error('Workflow title is required.');
    }
    if (!workflowCoverFile) {
      throw new Error('Please upload a workflow cover video.');
    }
    if (!workflowCoverFile.type.startsWith('video/')) {
      throw new Error('Workflow cover must be a video file.');
    }

    const coverDims = await detectVideoFileDimensions(workflowCoverFile);
    const coverVideoUpload = await uploadsApi.uploadPromptMedia(workflowCoverFile, activeUser.uid);
    const coverThumbnailUpload = await uploadsApi.uploadPromptMedia(
      await createVideoThumbnailFile(workflowCoverFile),
      activeUser.uid,
    );

    const steps: WorkflowStepCreateInput[] = [];

    for (let i = 0; i < workflowSteps.length; i += 1) {
      const step = workflowSteps[i];
      const stepIndex = i + 1;
      if (!step.model.trim()) {
        throw new Error(`Step ${stepIndex}: select a model.`);
      }
      if (!step.promptText.trim()) {
        throw new Error(`Step ${stepIndex}: prompt text is required.`);
      }

      const expectedType = getExpectedResultType(step);
      if (step.generationType !== 'ingredients' && expectedType === 'image' && step.model.trim() !== IMAGE_ONLY_MODEL) {
        throw new Error(`Step ${stepIndex}: image output steps must use NanoBanana.`);
      }
      if (step.generationType !== 'ingredients' && expectedType === 'video' && step.model.trim() === IMAGE_ONLY_MODEL) {
        throw new Error(`Step ${stepIndex}: NanoBanana can only be used for image output steps.`);
      }
      if (!step.resultMediaFile) {
        throw new Error(`Step ${stepIndex}: result file is required.`);
      }
      if (expectedType === 'video' && !step.resultMediaFile.type.startsWith('video/')) {
        throw new Error(`Step ${stepIndex}: result must be a video.`);
      }
      if (expectedType === 'image' && !step.resultMediaFile.type.startsWith('image/')) {
        throw new Error(`Step ${stepIndex}: result must be an image.`);
      }

      let inputImageUrl: string | undefined;
      let ingredientsImageUrls: string[] | undefined;
      let startFrameUrl: string | undefined;
      let endFrameUrl: string | undefined;

      if (step.generationType === 'image_to_video') {
        if (!step.inputImageFile || !step.inputImageFile.type.startsWith('image/')) {
          throw new Error(`Step ${stepIndex}: source image is required.`);
        }
        inputImageUrl = (await uploadsApi.uploadPromptMedia(step.inputImageFile, activeUser.uid)).downloadUrl;
      }

      if (step.generationType === 'frames_to_video') {
        if (!step.startFrameFile || !step.startFrameFile.type.startsWith('image/')) {
          throw new Error(`Step ${stepIndex}: start frame image is required.`);
        }
        if (!step.endFrameFile || !step.endFrameFile.type.startsWith('image/')) {
          throw new Error(`Step ${stepIndex}: end frame image is required.`);
        }
        startFrameUrl = (await uploadsApi.uploadPromptMedia(step.startFrameFile, activeUser.uid)).downloadUrl;
        endFrameUrl = (await uploadsApi.uploadPromptMedia(step.endFrameFile, activeUser.uid)).downloadUrl;
      }

      if (step.generationType === 'ingredients') {
        if (step.ingredientFiles.length === 0) {
          throw new Error(`Step ${stepIndex}: add at least 1 ingredient image.`);
        }
        if (step.ingredientFiles.length > MAX_INGREDIENTS) {
          throw new Error(`Step ${stepIndex}: you can add up to ${MAX_INGREDIENTS} ingredient images.`);
        }
        for (const ingredient of step.ingredientFiles) {
          if (!ingredient.type.startsWith('image/')) {
            throw new Error(`Step ${stepIndex}: ingredients must be image files.`);
          }
        }
        ingredientsImageUrls = [];
        for (const ingredient of step.ingredientFiles) {
          const ingredientUpload = await uploadsApi.uploadPromptMedia(ingredient, activeUser.uid);
          ingredientsImageUrls.push(ingredientUpload.downloadUrl);
        }
      }

      const resultUpload = await uploadsApi.uploadPromptMedia(step.resultMediaFile, activeUser.uid);
      let resultThumbnailUrl = resultUpload.downloadUrl;
      if (expectedType === 'video') {
        resultThumbnailUrl = (
          await uploadsApi.uploadPromptMedia(
            await createVideoThumbnailFile(step.resultMediaFile),
            activeUser.uid,
          )
        ).downloadUrl;
      }

      steps.push({
        label: step.label.trim() || `Step ${stepIndex}`,
        model: step.model.trim(),
        generationType: step.generationType,
        promptText: step.promptText.trim(),
        note: step.note.trim() || undefined,
        inputImageUrl,
        ingredientsImageUrls,
        startFrameUrl,
        endFrameUrl,
        resultMediaUrl: resultUpload.downloadUrl,
        resultThumbnailUrl,
        resultContentType: expectedType,
      });
    }

    const selectedModels = Array.from(new Set(steps.map((step) => step.model)));
    const workflowToolLabel = selectedModels.length === 1 ? selectedModels[0] : 'Mixed';

    const created = await workflowsApi.createWorkflow({
      authorUid: activeUser.uid,
      title: workflowTitle.trim(),
      tool: workflowToolLabel,
      description: workflowDescription.trim(),
      coverVideoUrl: coverVideoUpload.downloadUrl,
      coverThumbnailUrl: coverThumbnailUpload.downloadUrl,
      tags: workflowTags,
      mediaAspectRatio: coverDims.height > coverDims.width ? 'portrait' : 'landscape',
      steps,
    });

    navigate(`/workflow/${created.id}`);
  };

  const handlePublish = async () => {
    if (!activeUser) {
      return;
    }

    setIsPublishing(true);
    setPublishError(null);
    try {
      if (postMode === 'workflow') {
        await publishWorkflow();
      } else {
        await publishPrompt();
        navigate('/');
      }
    } catch (error) {
      setPublishError(error instanceof Error ? error.message : 'Could not publish.');
    } finally {
      setIsPublishing(false);
    }
  };

  const workflowCanPublish = workflowTitle.trim() && workflowCoverFile;
  const promptCanPublish = promptText.trim() && selectedModel && mediaFile;
  const promptModelOptions =
    contentType === 'image'
      ? [IMAGE_ONLY_MODEL]
      : availableModels.filter((model) => model !== IMAGE_ONLY_MODEL);

  if (authIsLoading && !activeUser) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4">
        <div className="max-w-md w-full glass-surface rounded-[var(--cuerate-r-xl)] border border-[var(--cuerate-text-3)] p-8 text-center">
          <span className="inline-flex items-center gap-2 font-accent text-sm text-[var(--cuerate-text-2)]">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading your account...
          </span>
        </div>
      </div>
    );
  }

  if (!activeUser) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4">
        <div className="max-w-md w-full glass-surface rounded-[var(--cuerate-r-xl)] border border-[var(--cuerate-text-3)] p-8 text-center">
          <h1 className="font-primary font-bold text-2xl text-[var(--cuerate-text-1)] mb-3">Log in to post</h1>
          <p className="font-accent text-sm text-[var(--cuerate-text-2)] mb-6">
            Publishing prompts and workflows needs an authenticated session.
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
          <div className="flex flex-wrap gap-2">
            {(['prompt', 'workflow'] as const).map((entry) => (
              <button
                key={entry}
                onClick={() => {
                  setPostMode(entry);
                  setPublishError(null);
                }}
                className={`px-4 py-2 rounded-[var(--cuerate-r-pill)] font-accent text-sm transition-all ${
                  postMode === entry
                    ? entry === 'workflow'
                      ? 'bg-[#f5a623] text-[#1b1205] shadow-[0_0_24px_rgba(245,166,35,0.28)]'
                      : 'bg-[var(--cuerate-indigo)] text-white indigo-glow'
                    : 'glass-surface text-[var(--cuerate-text-2)] hover:text-[var(--cuerate-text-1)]'
                }`}
              >
                {entry === 'prompt' ? 'Single Prompt' : 'Workflow'}
              </button>
            ))}
          </div>
        </div>

        {postMode === 'prompt' ? (
          <>
            <div>
              <label className="font-accent text-sm text-[var(--cuerate-text-1)] mb-2 block">Post Type</label>
              <div className="flex flex-wrap gap-2">
                {(['image', 'video'] as const).map((entry) => (
                  <button
                    key={entry}
                    onClick={() => {
                      setContentType(entry);
                      setMediaFile(null);
                      setSelectedModel(entry === 'image' ? IMAGE_ONLY_MODEL : '');
                      setPublishError(null);
                    }}
                    className={`px-4 py-2 rounded-[var(--cuerate-r-pill)] font-accent text-sm transition-all ${
                      contentType === entry
                        ? 'bg-[var(--cuerate-indigo)] text-white indigo-glow'
                        : 'glass-surface text-[var(--cuerate-text-2)] hover:text-[var(--cuerate-text-1)]'
                    }`}
                  >
                    {entry === 'image' ? 'Image Prompt' : 'Video Prompt'}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="font-accent text-sm text-[var(--cuerate-text-1)] mb-2 block">
                {contentType === 'video' ? 'Video Upload' : 'Image Upload'}
              </label>
              <label className="border-2 border-dashed border-[var(--cuerate-indigo)]/30 rounded-[var(--cuerate-r-xl)] glass-surface p-8 flex flex-col items-center justify-center gap-3 hover:border-[var(--cuerate-indigo)]/50 transition-colors cursor-pointer">
                <input
                  type="file"
                  accept={contentType === 'video' ? 'video/mp4,video/quicktime,video/webm' : 'image/*'}
                  className="hidden"
                  onChange={(event) => {
                    setMediaFile(event.target.files?.[0] ?? null);
                    setPublishError(null);
                  }}
                />
                <Upload className="w-8 h-8 text-[var(--cuerate-indigo)]" />
                <p className="font-accent text-sm text-[var(--cuerate-text-1)]">
                  {mediaFile ? mediaFile.name : contentType === 'video' ? 'Upload Video' : 'Upload Image'}
                </p>
              </label>
            </div>

            <div>
              <label className="font-accent text-sm text-[var(--cuerate-text-1)] mb-2 block">Your Prompt</label>
              <textarea
                value={promptText}
                onChange={(event) => setPromptText(event.target.value)}
                placeholder="Describe your AI prompt in detail..."
                className="w-full h-32 px-4 py-3 rounded-[var(--cuerate-r-md)] glass-surface border border-[var(--cuerate-text-3)] focus:border-[var(--cuerate-indigo)] focus:indigo-glow outline-none font-accent text-sm text-[var(--cuerate-text-1)] placeholder:text-[var(--cuerate-text-2)] resize-none transition-all"
              />
            </div>

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
              <label className="font-accent text-sm text-[var(--cuerate-text-1)] mb-2 block">Model</label>
              <div className="flex flex-wrap gap-2">
                {promptModelOptions.map((model) => (
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
              <label className="font-accent text-sm text-[var(--cuerate-text-1)] mb-2 block">Style Tags</label>
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
              <label className="font-accent text-sm text-[var(--cuerate-text-1)] mb-2 block">Camera Notes</label>
              <input
                type="text"
                value={cameraNotes}
                onChange={(event) => setCameraNotes(event.target.value)}
                placeholder="anamorphic, wide angle, slow push-in..."
                className="w-full px-4 py-3 rounded-[var(--cuerate-r-md)] glass-surface border border-[var(--cuerate-text-3)] focus:border-[var(--cuerate-indigo)] focus:indigo-glow outline-none font-accent text-sm text-[var(--cuerate-text-1)] placeholder:text-[var(--cuerate-text-2)] transition-all"
              />
            </div>

            <div>
              <label className="font-accent text-sm text-[var(--cuerate-text-1)] mb-2 block">Mood</label>
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
              <label className="font-accent text-sm text-[var(--cuerate-text-1)] mb-2 block">Difficulty</label>
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
          </>
        ) : (
          <div className="space-y-6 rounded-[var(--cuerate-r-xl)] border border-[#f5a623]/25 bg-[linear-gradient(180deg,rgba(245,166,35,0.12),rgba(245,166,35,0.04))] p-5">
            <div>
              <label className="font-accent text-sm text-[var(--cuerate-text-1)] mb-2 block">
                Final Result (Video)
              </label>
              <label className="flex cursor-pointer flex-col items-center justify-center gap-3 rounded-[var(--cuerate-r-xl)] border-2 border-dashed border-[#f5a623]/30 bg-black/10 p-6 transition-colors hover:border-[#f5a623]/55">
                <input
                  type="file"
                  accept="video/mp4,video/quicktime,video/webm"
                  className="hidden"
                  onChange={(event) => {
                    setWorkflowCoverFile(event.target.files?.[0] ?? null);
                    setPublishError(null);
                  }}
                />
                <Upload className="h-8 w-8 text-[#f5a623]" />
                <p className="font-accent text-sm text-[var(--cuerate-text-1)]">
                  {workflowCoverFile ? workflowCoverFile.name : 'Upload final result video'}
                </p>
              </label>
            </div>

            <input
              type="text"
              value={workflowTitle}
              onChange={(event) => setWorkflowTitle(event.target.value)}
              placeholder="Workflow title"
              className="w-full rounded-[var(--cuerate-r-md)] border border-[#f5a623]/20 bg-black/15 px-4 py-3 font-accent text-sm text-[var(--cuerate-text-1)] outline-none transition-all focus:border-[#f5a623]"
            />

            <textarea
              value={workflowDescription}
              onChange={(event) => setWorkflowDescription(event.target.value)}
              placeholder="Workflow description"
              className="h-24 w-full rounded-[var(--cuerate-r-md)] border border-[#f5a623]/20 bg-black/15 px-4 py-3 font-accent text-sm text-[var(--cuerate-text-1)] outline-none transition-all focus:border-[#f5a623]"
            />

            <div className="space-y-3">
              <label className="font-accent text-sm text-[var(--cuerate-text-1)] block">Tags</label>
              <div className="flex flex-wrap gap-2">
                {availableStyleTags.map((tag) => (
                  <button
                    key={`workflow-tag-${tag}`}
                    onClick={() => toggleWorkflowTag(tag)}
                    className={`rounded-[var(--cuerate-r-pill)] px-4 py-2 font-accent text-sm transition-all ${
                      workflowTags.includes(tag)
                        ? 'bg-[#f5a623] text-[#1b1205] shadow-[0_0_24px_rgba(245,166,35,0.28)]'
                        : 'glass-surface text-[var(--cuerate-text-2)] hover:text-[var(--cuerate-text-1)]'
                    }`}
                  >
                    #{tag}
                  </button>
                ))}
              </div>

              <p className="font-accent text-xs text-[var(--cuerate-text-2)]">
                Choose model per step below.
              </p>
            </div>

            <div className="space-y-4">
              {workflowSteps.map((step, index) => {
                const expectedType = getExpectedResultType(step);
                const stepModelOptions =
                  step.generationType === 'ingredients'
                    ? allModelOptions
                    : expectedType === 'image'
                      ? [IMAGE_ONLY_MODEL]
                      : availableModels.filter((model) => model !== IMAGE_ONLY_MODEL);
                return (
                  <div
                    key={step.id}
                    className={`rounded-[var(--cuerate-r-lg)] border border-[#f5a623]/18 bg-black/12 p-4 space-y-3 ${
                      index > 0 ? 'mt-6 pt-6 border-t-2 border-t-[#f5a623]/28' : ''
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="rounded-full bg-[#f5a623]/12 px-3 py-1 font-accent text-xs font-medium text-[#ffd27c]">
                        Step {index + 1}
                      </span>
                      {workflowSteps.length > 1 && (
                        <button
                          onClick={() => removeWorkflowStep(step.id)}
                          className="rounded-[var(--cuerate-r-pill)] border border-red-400/30 px-3 py-1 font-accent text-xs text-red-300 hover:bg-red-500/10"
                        >
                          Remove
                        </button>
                      )}
                    </div>

                    <input
                      type="text"
                      value={step.label}
                      onChange={(event) => updateWorkflowStep(step.id, { label: event.target.value })}
                      placeholder="Step label"
                      className="w-full rounded-[var(--cuerate-r-md)] border border-[var(--cuerate-text-3)] bg-black/15 px-3 py-2 font-accent text-sm text-[var(--cuerate-text-1)]"
                    />

                    <div>
                      <label className="mb-2 block font-accent text-xs text-[var(--cuerate-text-2)]">Model</label>
                      <div className="flex flex-wrap gap-2">
                        {stepModelOptions.map((model) => (
                          <button
                            key={`${step.id}-model-${model}`}
                            onClick={() => updateWorkflowStep(step.id, { model })}
                            className={`rounded-[var(--cuerate-r-pill)] px-3 py-1.5 font-accent text-xs transition-all ${
                              step.model === model
                                ? 'bg-[#f5a623] text-[#1b1205]'
                                : 'glass-surface text-[var(--cuerate-text-2)]'
                            }`}
                          >
                            {model}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      {generationTypeOptions.map((option) => (
                        <button
                          key={`${step.id}-${option.value}`}
                          onClick={() => handleWorkflowGenerationType(step.id, option.value)}
                          className={`rounded-[var(--cuerate-r-pill)] px-3 py-1.5 font-accent text-xs transition-all ${
                            step.generationType === option.value
                              ? 'bg-[#f5a623] text-[#1b1205]'
                              : 'glass-surface text-[var(--cuerate-text-2)]'
                          }`}
                        >
                          {option.label}
                        </button>
                      ))}
                    </div>

                    {step.generationType === 'ingredients' && (
                      <div>
                        <label className="mb-2 block font-accent text-xs text-[var(--cuerate-text-2)]">Ingredients Output</label>
                        <div className="flex flex-wrap gap-2">
                          {(['video', 'image'] as const).map((option) => (
                            <button
                              key={`${step.id}-ingredient-output-${option}`}
                              onClick={() => handleIngredientOutputType(step.id, option)}
                              className={`rounded-[var(--cuerate-r-pill)] px-3 py-1.5 font-accent text-xs transition-all ${
                                step.ingredientOutputType === option
                                  ? 'bg-[#f5a623] text-[#1b1205]'
                                  : 'glass-surface text-[var(--cuerate-text-2)]'
                              }`}
                            >
                              {option === 'video' ? 'Video Output' : 'Image Output'}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}

                    <textarea
                      value={step.promptText}
                      onChange={(event) => updateWorkflowStep(step.id, { promptText: event.target.value })}
                      placeholder="Prompt text"
                      className="h-20 w-full rounded-[var(--cuerate-r-md)] border border-[var(--cuerate-text-3)] bg-black/15 px-3 py-2 font-accent text-sm text-[var(--cuerate-text-1)]"
                    />

                    {step.generationType === 'image_to_video' && (
                      <label className="flex cursor-pointer items-center justify-between rounded-[var(--cuerate-r-md)] border border-[#f5a623]/20 bg-black/20 px-3 py-2.5 hover:border-[#f5a623]/45 transition-colors">
                        <span className="font-accent text-sm text-[var(--cuerate-text-2)]">
                          {step.inputImageFile ? step.inputImageFile.name : 'Upload source image'}
                        </span>
                        <Upload className="h-4 w-4 text-[#ffd27c]" />
                        <input
                          type="file"
                          accept="image/*"
                          className="hidden"
                          onChange={(event) => updateWorkflowStep(step.id, { inputImageFile: event.target.files?.[0] ?? null })}
                        />
                      </label>
                    )}

                    {step.generationType === 'frames_to_video' && (
                      <div className="grid md:grid-cols-2 gap-2">
                        <label className="flex cursor-pointer items-center justify-between rounded-[var(--cuerate-r-md)] border border-[#f5a623]/20 bg-black/20 px-3 py-2.5 hover:border-[#f5a623]/45 transition-colors">
                          <span className="font-accent text-sm text-[var(--cuerate-text-2)]">
                            {step.startFrameFile ? step.startFrameFile.name : 'Upload start frame'}
                          </span>
                          <Upload className="h-4 w-4 text-[#ffd27c]" />
                          <input
                            type="file"
                            accept="image/*"
                            className="hidden"
                            onChange={(event) => updateWorkflowStep(step.id, { startFrameFile: event.target.files?.[0] ?? null })}
                          />
                        </label>
                        <label className="flex cursor-pointer items-center justify-between rounded-[var(--cuerate-r-md)] border border-[#f5a623]/20 bg-black/20 px-3 py-2.5 hover:border-[#f5a623]/45 transition-colors">
                          <span className="font-accent text-sm text-[var(--cuerate-text-2)]">
                            {step.endFrameFile ? step.endFrameFile.name : 'Upload end frame'}
                          </span>
                          <Upload className="h-4 w-4 text-[#ffd27c]" />
                          <input
                            type="file"
                            accept="image/*"
                            className="hidden"
                            onChange={(event) => updateWorkflowStep(step.id, { endFrameFile: event.target.files?.[0] ?? null })}
                          />
                        </label>
                      </div>
                    )}

                    {step.generationType === 'ingredients' && (
                      <div className="space-y-2">
                        <label className="mb-1 block font-accent text-xs text-[var(--cuerate-text-2)]">
                          Ingredients (up to {MAX_INGREDIENTS} images)
                        </label>
                        <label className="flex cursor-pointer items-center justify-between rounded-[var(--cuerate-r-md)] border border-[#f5a623]/20 bg-black/20 px-3 py-2.5 hover:border-[#f5a623]/45 transition-colors">
                          <span className="font-accent text-sm text-[var(--cuerate-text-2)]">
                            {step.ingredientFiles.length > 0
                              ? `${step.ingredientFiles.length} ingredient image${step.ingredientFiles.length > 1 ? 's' : ''} selected`
                              : 'Upload ingredient images'}
                          </span>
                          <Upload className="h-4 w-4 text-[#ffd27c]" />
                          <input
                            type="file"
                            accept="image/*"
                            multiple
                            className="hidden"
                            onChange={(event) => {
                              const chosen = Array.from(event.target.files ?? []);
                              const nextFiles = [...step.ingredientFiles, ...chosen].slice(0, MAX_INGREDIENTS);
                              updateWorkflowStep(step.id, { ingredientFiles: nextFiles });
                            }}
                          />
                        </label>
                        {step.ingredientFiles.length > 0 && (
                          <div className="space-y-1">
                            {step.ingredientFiles.map((file, ingredientIndex) => (
                              <div
                                key={`${step.id}-ingredient-${ingredientIndex}-${file.name}`}
                                className="flex items-center justify-between rounded-[var(--cuerate-r-md)] border border-[var(--cuerate-text-3)] bg-black/15 px-3 py-2"
                              >
                                <span className="truncate font-accent text-xs text-[var(--cuerate-text-2)]">{file.name}</span>
                                <button
                                  onClick={() =>
                                    updateWorkflowStep(step.id, {
                                      ingredientFiles: step.ingredientFiles.filter((_, fileIndex) => fileIndex !== ingredientIndex),
                                    })
                                  }
                                  className="rounded-[var(--cuerate-r-pill)] border border-red-400/25 px-2 py-0.5 font-accent text-[10px] text-red-300 hover:bg-red-500/10"
                                >
                                  Remove
                                </button>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}

                    <label className="flex cursor-pointer items-center justify-between rounded-[var(--cuerate-r-md)] border border-[#f5a623]/20 bg-black/20 px-3 py-2.5 hover:border-[#f5a623]/45 transition-colors">
                      <span className="font-accent text-sm text-[var(--cuerate-text-2)]">
                        {step.resultMediaFile
                          ? step.resultMediaFile.name
                          : expectedType === 'video'
                            ? 'Upload Video Results'
                            : 'Upload Image Results'}
                      </span>
                      <Upload className="h-4 w-4 text-[#ffd27c]" />
                      <input
                        type="file"
                        accept={expectedType === 'video' ? 'video/mp4,video/quicktime,video/webm' : 'image/*'}
                        className="hidden"
                        onChange={(event) => updateWorkflowStep(step.id, { resultMediaFile: event.target.files?.[0] ?? null })}
                      />
                    </label>

                    <textarea
                      value={step.note}
                      onChange={(event) => updateWorkflowStep(step.id, { note: event.target.value })}
                      placeholder="Side note (optional)"
                      className="h-16 w-full rounded-[var(--cuerate-r-md)] border border-[var(--cuerate-text-3)] bg-black/15 px-3 py-2 font-accent text-sm text-[var(--cuerate-text-1)]"
                    />
                  </div>
                );
              })}
              <button
                onClick={addWorkflowStep}
                className="h-10 w-10 rounded-full border border-[#f5a623]/30 text-[#ffd27c] text-xl leading-none hover:bg-[#f5a623]/10"
                aria-label="Add step"
              >
                +
              </button>
            </div>
          </div>
        )}

        {publishError && (
          <div className="rounded-[var(--cuerate-r-md)] border border-red-500/30 bg-red-500/10 px-4 py-3 font-accent text-sm text-red-200">
            {publishError}
          </div>
        )}

        <button
          onClick={() => void handlePublish()}
          disabled={isPublishing || (postMode === 'workflow' ? !workflowCanPublish : !promptCanPublish)}
          className="w-full py-4 rounded-[var(--cuerate-r-pill)] bg-gradient-to-r from-[#5500cc] to-[var(--cuerate-blue)] text-white font-accent font-medium text-lg indigo-glow hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isPublishing ? (
            <span className="inline-flex items-center gap-2">
              <Loader2 className="w-5 h-5 animate-spin" />
              Publishing...
            </span>
          ) : postMode === 'workflow' ? (
            'Publish Workflow'
          ) : (
            'Publish Prompt'
          )}
        </button>
      </div>
    </div>
  );
}
