// AI Model Logo Configuration
// Replace logoUrl values with actual logo image URLs when available

export interface AIModelConfig {
  name: string;
  logoUrl: string | null; // Set to actual image URL when available
  color: string; // Fallback color for text display
}

export const aiModelLogos: Record<string, AIModelConfig> = {
  Sora: {
    name: 'Sora',
    logoUrl: null, // TODO: Add Sora logo image URL here
    color: 'text-emerald-400',
  },
  Runway: {
    name: 'Runway',
    logoUrl: null, // TODO: Add Runway logo image URL here
    color: 'text-blue-400',
  },
  Kling: {
    name: 'Kling',
    logoUrl: null, // TODO: Add Kling logo image URL here
    color: 'text-purple-400',
  },
  Pika: {
    name: 'Pika',
    logoUrl: null, // TODO: Add Pika logo image URL here
    color: 'text-pink-400',
  },
  Hailuo: {
    name: 'Hailuo',
    logoUrl: null, // TODO: Add Hailuo logo image URL here
    color: 'text-orange-400',
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
