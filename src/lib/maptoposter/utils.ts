import type { ArtisticTheme, Theme } from './types';

export function hexToRgba(color: string, alpha: number): string {
  const normalized = color.replace('#', '');
  const expanded =
    normalized.length === 3
      ? normalized
          .split('')
          .map((c) => `${c}${c}`)
          .join('')
      : normalized;
  if (!/^[0-9A-Fa-f]{6}$/.test(expanded)) {
    return `rgba(255,255,255,${alpha})`;
  }
  const r = Number.parseInt(expanded.slice(0, 2), 16);
  const g = Number.parseInt(expanded.slice(2, 4), 16);
  const b = Number.parseInt(expanded.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export function formatCoords(lat: number, lon: number): string {
  const latDir = lat >= 0 ? 'N' : 'S';
  const lonDir = lon >= 0 ? 'E' : 'W';
  return `${Math.abs(lat).toFixed(4)}° ${latDir} / ${Math.abs(lon).toFixed(4)}° ${lonDir}`;
}

export function posterScale(width: number, height: number): number {
  if (typeof window === 'undefined') {
    return 1;
  }
  const isMobile = window.innerWidth < 768;
  const pad = isMobile ? 40 : 120;
  const availableW = window.innerWidth - pad;
  const availableH = window.innerHeight - pad;
  return Math.min(availableW / width, availableH / height, 1);
}

export function themeBackground(theme: Theme | ArtisticTheme): string {
  return 'background' in theme ? theme.background : theme.bg;
}

export function palettePreview(theme: ArtisticTheme): string[] {
  return [theme.road_motorway, theme.road_primary, theme.road_secondary, theme.road_tertiary];
}
