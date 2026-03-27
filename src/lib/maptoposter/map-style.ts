import type maplibregl from 'maplibre-gl';
import type { ArtisticTheme } from './types';

export function generateMapLibreStyle(
  theme: ArtisticTheme,
  showRoute: boolean,
  routeGeometry: [number, number][],
  routeStartLon: number,
  routeStartLat: number,
  routeEndLon: number,
  routeEndLat: number,
): maplibregl.StyleSpecification {
  return {
    version: 8,
    sources: {
      openfreemap: { type: 'vector', url: 'https://tiles.openfreemap.org/planet' },
      route: {
        type: 'geojson',
        data: {
          type: 'Feature',
          properties: {},
          geometry: {
            type: 'LineString',
            coordinates:
              routeGeometry.length > 0
                ? routeGeometry
                : [
                    [routeStartLon, routeStartLat],
                    [routeEndLon, routeEndLat],
                  ],
          },
        },
      },
    },
    layers: [
      { id: 'background', type: 'background', paint: { 'background-color': theme.bg } },
      {
        id: 'water',
        source: 'openfreemap',
        'source-layer': 'water',
        type: 'fill',
        paint: { 'fill-color': theme.water },
      },
      {
        id: 'park',
        source: 'openfreemap',
        'source-layer': 'park',
        type: 'fill',
        paint: { 'fill-color': theme.parks },
      },
      {
        id: 'road-default',
        source: 'openfreemap',
        'source-layer': 'transportation',
        type: 'line',
        filter: [
          '!',
          [
            'match',
            ['get', 'class'],
            ['motorway', 'primary', 'secondary', 'tertiary', 'residential'],
            true,
            false,
          ],
        ],
        paint: { 'line-color': theme.road_default, 'line-width': 0.5 },
      },
      {
        id: 'road-residential',
        source: 'openfreemap',
        'source-layer': 'transportation',
        type: 'line',
        filter: ['==', ['get', 'class'], 'residential'],
        paint: { 'line-color': theme.road_residential, 'line-width': 0.5 },
      },
      {
        id: 'road-tertiary',
        source: 'openfreemap',
        'source-layer': 'transportation',
        type: 'line',
        filter: ['==', ['get', 'class'], 'tertiary'],
        paint: { 'line-color': theme.road_tertiary, 'line-width': 0.8 },
      },
      {
        id: 'road-secondary',
        source: 'openfreemap',
        'source-layer': 'transportation',
        type: 'line',
        filter: ['==', ['get', 'class'], 'secondary'],
        paint: { 'line-color': theme.road_secondary, 'line-width': 1 },
      },
      {
        id: 'road-primary',
        source: 'openfreemap',
        'source-layer': 'transportation',
        type: 'line',
        filter: ['==', ['get', 'class'], 'primary'],
        paint: { 'line-color': theme.road_primary, 'line-width': 1.5 },
      },
      {
        id: 'road-motorway',
        source: 'openfreemap',
        'source-layer': 'transportation',
        type: 'line',
        filter: ['==', ['get', 'class'], 'motorway'],
        paint: { 'line-color': theme.road_motorway, 'line-width': 2 },
      },
      {
        id: 'route-casing',
        source: 'route',
        type: 'line',
        layout: {
          'line-cap': 'round',
          'line-join': 'round',
          visibility: showRoute ? 'visible' : 'none',
        },
        paint: { 'line-color': theme.bg, 'line-width': 9 },
      },
      {
        id: 'route-line',
        source: 'route',
        type: 'line',
        layout: {
          'line-cap': 'round',
          'line-join': 'round',
          visibility: showRoute ? 'visible' : 'none',
        },
        paint: { 'line-color': theme.route, 'line-width': 4 },
      },
    ],
    name: theme.name,
  };
}
