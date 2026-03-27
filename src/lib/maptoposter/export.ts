import { toPng } from 'html-to-image';

import type maplibregl from 'maplibre-gl';

import { themeBackground } from './utils';
import type { AppState, ArtisticTheme, Theme } from './types';

type ExportArgs = {
  posterElement: HTMLDivElement;
  mapElement: HTMLDivElement;
  mapLibre: maplibregl.Map | null;
  state: AppState;
  theme: Theme;
  artisticTheme: ArtisticTheme;
};

export async function exportPosterPng(args: ExportArgs): Promise<void> {
  const { posterElement, mapElement, mapLibre, state, theme, artisticTheme } = args;

  const activeTheme = state.renderMode === 'artistic' ? artisticTheme : theme;

  const overlayData = await toPng(posterElement, {
    cacheBust: true,
    backgroundColor: themeBackground(activeTheme),
    filter: (node) => {
      if (!(node instanceof HTMLElement)) {
        return true;
      }
      return node.id !== 'map-preview' && node.id !== 'artistic-map';
    },
    pixelRatio: 2,
  });

  const mapData =
    state.renderMode === 'artistic'
      ? mapLibre?.getCanvas().toDataURL('image/png')
      : await toPng(mapElement, { cacheBust: true, pixelRatio: 2 });

  const overlayImg = new Image();
  const mapImg = new Image();

  await Promise.all([
    new Promise<void>((resolve) => {
      overlayImg.onload = () => resolve();
      overlayImg.src = overlayData;
    }),
    new Promise<void>((resolve) => {
      mapImg.onload = () => resolve();
      mapImg.src = mapData ?? overlayData;
    }),
  ]);

  const canvas = document.createElement('canvas');
  canvas.width = state.width;
  canvas.height = state.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    return;
  }

  const matWidth = state.matEnabled ? state.matWidth : 0;
  const background = state.renderMode === 'artistic' ? artisticTheme.bg : theme.background;
  ctx.fillStyle = background;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.drawImage(
    mapImg,
    matWidth,
    matWidth,
    state.width - matWidth * 2,
    state.height - matWidth * 2,
  );
  ctx.drawImage(overlayImg, 0, 0, state.width, state.height);

  const link = document.createElement('a');
  link.href = canvas.toDataURL('image/png', 1);
  link.download = `Map-Craft-by-KREASAI.COM-${state.city.replace(/\s+/g, '-')}-${Date.now()}.png`;
  link.click();
}
