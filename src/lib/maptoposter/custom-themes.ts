import type { ArtisticTheme } from './types';

const COLOR_KEYS: Array<keyof ArtisticTheme> = [
  'bg',
  'text',
  'water',
  'parks',
  'road_motorway',
  'road_primary',
  'road_secondary',
  'road_tertiary',
  'road_residential',
  'road_default',
  'route',
];

function isHexColor(value: string): boolean {
  return /^#[0-9A-Fa-f]{6}$/.test(value);
}

function normalizeTheme(input: unknown): ArtisticTheme | null {
  if (typeof input !== 'object' || input === null) {
    return null;
  }
  const candidate = input as Record<string, unknown>;
  if (typeof candidate.name !== 'string' || !candidate.name.trim()) {
    return null;
  }

  const theme: ArtisticTheme = {
    name: candidate.name,
    description: typeof candidate.description === 'string' ? candidate.description : '',
    bg: '#000000',
    text: '#ffffff',
    water: '#000000',
    parks: '#000000',
    road_motorway: '#000000',
    road_primary: '#000000',
    road_secondary: '#000000',
    road_tertiary: '#000000',
    road_residential: '#000000',
    road_default: '#000000',
    route: '#000000',
  };

  for (const key of COLOR_KEYS) {
    const value = candidate[key];
    if (typeof value !== 'string' || !isHexColor(value)) {
      return null;
    }
    theme[key] = value;
  }

  return theme;
}

export function parseCustomThemeRecord(
  input: unknown,
): Record<string, ArtisticTheme> {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) {
    return {};
  }

  const value = input as Record<string, unknown>;
  const themes: Record<string, ArtisticTheme> = {};

  for (const [key, rawTheme] of Object.entries(value)) {
    const normalized = normalizeTheme(rawTheme);
    if (normalized) {
      themes[key] = normalized;
    }
  }

  return themes;
}
