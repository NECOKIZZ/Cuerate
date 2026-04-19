// AI Model Logo Configuration
// Put model logo files in: /public/model-logos/
// Then set logoUrl to values like: /model-logos/sora.png

export interface AIModelConfig {
  name: string;
  logoUrl: string | null; // Set to actual image URL when available
  color: string; // Fallback color for text display
}

export const aiModelLogos: Record<string, AIModelConfig> = {
  Sora: {
    name: 'Sora',
    logoUrl: '/model-logos/sora.svg',
    color: 'text-emerald-400',
  },
  Runway: {
    name: 'Runway',
    logoUrl: '/model-logos/runway.svg',
    color: 'text-blue-400',
  },
  Kling: {
    name: 'Kling',
    logoUrl: '/model-logos/kling.svg',
    color: 'text-purple-400',
  },
  Pika: {
    name: 'Pika',
    logoUrl: null,
    color: 'text-pink-400',
  },
  Hailuo: {
    name: 'Hailuo',
    logoUrl: '/model-logos/hailuo.svg',
    color: 'text-orange-400',
  },
  Grok: {
    name: 'Grok',
    logoUrl: '/model-logos/grok.svg',
    color: 'text-cyan-300',
  },
  Krea: {
    name: 'Krea',
    logoUrl: '/model-logos/krea.svg',
    color: 'text-amber-300',
  },
  Midjourney: {
    name: 'Midjourney',
    logoUrl: '/model-logos/midjourney.svg',
    color: 'text-indigo-300',
  },
  NanoBanana: {
    name: 'NanoBanana',
    logoUrl: '/model-logos/nanobanana.svg',
    color: 'text-lime-300',
  },
  OpenAI: {
    name: 'OpenAI',
    logoUrl: '/model-logos/openai.svg',
    color: 'text-emerald-300',
  },
  Qwen: {
    name: 'Qwen',
    logoUrl: '/model-logos/qwen.svg',
    color: 'text-sky-300',
  },
  Seedance: {
    name: 'Seedance',
    logoUrl: '/model-logos/seedance.svg',
    color: 'text-violet-300',
  },
  Other: {
    name: 'Other',
    logoUrl: null,
    color: 'text-gray-400',
  },
};

export function getAIModelConfig(modelName: string): AIModelConfig {
  return aiModelLogos[modelName] || aiModelLogos.Other;
}
