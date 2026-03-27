'use client';

import type * as Leaflet from 'leaflet';
import type {
  Map as MapLibreMap,
  Marker as MapLibreMarker,
} from 'maplibre-gl';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import {
  CITY_FONTS,
  COORDS_FONTS,
  COUNTRY_FONTS,
  CUSTOM_THEMES_KEY,
  DEFAULT_STATE,
  SETTINGS_KEY,
} from '@/lib/maptoposter/constants';
import { parseCustomThemeRecord } from '@/lib/maptoposter/custom-themes';
import { exportPosterPng } from '@/lib/maptoposter/export';
import { generateMapLibreStyle } from '@/lib/maptoposter/map-style';
import { MARKER_ICONS } from '@/lib/maptoposter/marker-icons';
import {
  OUTPUT_PRESETS,
  QUICK_PRESETS,
} from '@/lib/maptoposter/output-presets';
import {
  bestViaInsertIndex,
  fetchOsrmRoute,
} from '@/lib/maptoposter/routing';
import { searchLocation, type SearchResult } from '@/lib/maptoposter/search';
import { BASE_ARTISTIC, THEMES, newCustomTheme } from '@/lib/maptoposter/themes';
import type { AppState, ArtisticTheme } from '@/lib/maptoposter/types';
import {
  formatCoords,
  hexToRgba,
  posterScale,
} from '@/lib/maptoposter/utils';

type LeafletLib = typeof import('leaflet');
type MapLibreLib = typeof import('maplibre-gl');

function cityFontValue(font: string): string {
  if (font === 'sans-serif' || font === 'serif') {
    return font;
  }
  if (font === 'Caveat' || font === 'Dancing Script') {
    return `'${font}', cursive`;
  }
  const serifFonts = new Set([
    'Playfair Display',
    'Cormorant Garamond',
    'Lora',
    'Merriweather',
  ]);
  return `'${font}', ${serifFonts.has(font) ? 'serif' : 'sans-serif'}`;
}

function normalizeHexInput(value: string): string {
  const cleaned = value.trim().replace(/[^0-9a-fA-F]/g, '').slice(0, 6);
  if (cleaned.length === 6) {
    return `#${cleaned.toUpperCase()}`;
  }
  return value;
}

function parseCoordinateInput(value: string): number | null {
  const sanitized = value
    .replace(',', '.')
    .replace(/[^0-9.+-]/g, '')
    .replace(/(\..*)\./g, '$1');
  const parsed = Number.parseFloat(sanitized);
  if (!Number.isFinite(parsed)) {
    return null;
  }
  return parsed;
}

type ArtisticColorKey = Exclude<
  keyof ArtisticTheme,
  'name' | 'description' | 'gradient_color'
>;

const CUSTOM_THEME_FIELDS: Array<{
  key: ArtisticColorKey;
  label: string;
  colorId: string;
  hexId: string;
}> = [
  { key: 'bg', label: 'Background', colorId: 'ct-bg', hexId: 'ct-bg-hex' },
  { key: 'text', label: 'Text', colorId: 'ct-text', hexId: 'ct-text-hex' },
  { key: 'water', label: 'Water', colorId: 'ct-water', hexId: 'ct-water-hex' },
  { key: 'parks', label: 'Parks', colorId: 'ct-parks', hexId: 'ct-parks-hex' },
  {
    key: 'road_motorway',
    label: 'Road Motorway',
    colorId: 'ct-road-motorway',
    hexId: 'ct-road-motorway-hex',
  },
  {
    key: 'road_primary',
    label: 'Road Primary',
    colorId: 'ct-road-primary',
    hexId: 'ct-road-primary-hex',
  },
  {
    key: 'road_secondary',
    label: 'Road Secondary',
    colorId: 'ct-road-secondary',
    hexId: 'ct-road-secondary-hex',
  },
  {
    key: 'road_tertiary',
    label: 'Road Tertiary',
    colorId: 'ct-road-tertiary',
    hexId: 'ct-road-tertiary-hex',
  },
  {
    key: 'road_residential',
    label: 'Road Residential',
    colorId: 'ct-road-residential',
    hexId: 'ct-road-residential-hex',
  },
  {
    key: 'road_default',
    label: 'Road Default',
    colorId: 'ct-road-default',
    hexId: 'ct-road-default-hex',
  },
  { key: 'route', label: 'Route', colorId: 'ct-route', hexId: 'ct-route-hex' },
];

export default function Home() {
  const [app, setApp] = useState<AppState>(DEFAULT_STATE);
  const [customThemes, setCustomThemes] = useState<Record<string, ArtisticTheme>>(
    {},
  );
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [exportStage, setExportStage] = useState<'idle' | 'loading' | 'processing'>('idle');
  const [activeMobile, setActiveMobile] = useState<'a' | 'b' | 'c' | null>(null);
  const [showArtisticModal, setShowArtisticModal] = useState(false);
  const [showPresetModal, setShowPresetModal] = useState(false);
  const [showAboutModal, setShowAboutModal] = useState(false);
  const [editingThemeKey, setEditingThemeKey] = useState<string | null>(null);
  const [editTheme, setEditTheme] = useState<ArtisticTheme>(newCustomTheme());
  const [showThemeEditor, setShowThemeEditor] = useState(false);
  const [scale, setScale] = useState(1);
  const [presetSearch, setPresetSearch] = useState('');
  const [themeSearch, setThemeSearch] = useState('');
  const [libsReady, setLibsReady] = useState(false);

  const mapPreviewRef = useRef<HTMLDivElement | null>(null);
  const artisticRef = useRef<HTMLDivElement | null>(null);
  const posterRef = useRef<HTMLDivElement | null>(null);
  const overlayRef = useRef<HTMLDivElement | null>(null);

  const leafletLibRef = useRef<LeafletLib | null>(null);
  const mapLibreLibRef = useRef<MapLibreLib | null>(null);
  const leafletMapRef = useRef<Leaflet.Map | null>(null);
  const leafletTileRef = useRef<Leaflet.TileLayer | null>(null);
  const mapLibreRef = useRef<MapLibreMap | null>(null);
  const mapSyncRef = useRef(false);
  const markerLayersRef = useRef<Leaflet.Marker[]>([]);
  const routeLayersRef = useRef<{
    route?: Leaflet.Polyline;
    casing?: Leaflet.Polyline;
    visible?: Leaflet.Polyline;
    start?: Leaflet.Marker;
    end?: Leaflet.Marker;
    via: Leaflet.Marker[];
  }>({ via: [] });
  const artisticMarkersRef = useRef<MapLibreMarker[]>([]);
  const artisticRouteMarkersRef = useRef<{
    start?: MapLibreMarker;
    end?: MapLibreMarker;
    via: MapLibreMarker[];
  }>({ via: [] });
  const searchAbortRef = useRef<AbortController | null>(null);

  const themes = useMemo(() => THEMES, []);
  const artisticThemes = useMemo(
    () => ({ ...BASE_ARTISTIC, ...customThemes }),
    [customThemes],
  );
  const currentTheme = themes[app.theme] ?? themes.minimal;
  const currentArt = artisticThemes[app.artisticTheme] ?? BASE_ARTISTIC.cyber_noir;
  const exporting = exportStage !== 'idle';

  const mutate = useCallback((partial: Partial<AppState>) => {
    setApp((prev) => ({ ...prev, ...partial }));
  }, []);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(SETTINGS_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<AppState>;
        setApp((prev) => ({ ...prev, ...parsed }));
      }
      const rawCustom = localStorage.getItem(CUSTOM_THEMES_KEY);
      if (rawCustom) {
        const parsedCustom = parseCustomThemeRecord(JSON.parse(rawCustom) as unknown);
        setCustomThemes(parsedCustom);
      }
    } catch {
      setApp(DEFAULT_STATE);
      setCustomThemes({});
    }
  }, []);

  useEffect(() => {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(app));
  }, [app]);

  useEffect(() => {
    localStorage.setItem(CUSTOM_THEMES_KEY, JSON.stringify(customThemes));
  }, [customThemes]);

  useEffect(() => {
    const updateScale = () => setScale(posterScale(app.width, app.height));
    updateScale();
    window.addEventListener('resize', updateScale);
    return () => window.removeEventListener('resize', updateScale);
  }, [app.width, app.height]);

  const insertViaPoint = useCallback((lat: number, lon: number) => {
    setApp((prev) => {
      const nextVia = [...prev.routeViaPoints];
      const insertIndex = bestViaInsertIndex(
        { lat: prev.routeStartLat, lon: prev.routeStartLon },
        { lat: prev.routeEndLat, lon: prev.routeEndLon },
        prev.routeViaPoints,
        { lat, lon },
      );
      nextVia.splice(insertIndex, 0, { lat, lon });
      return { ...prev, routeViaPoints: nextVia };
    });
  }, []);

  useEffect(() => {
    if (leafletLibRef.current && mapLibreLibRef.current) {
      return;
    }
    let mounted = true;
    const load = async () => {
      const [leafletMod, mapLibreMod] = await Promise.all([
        import('leaflet'),
        import('maplibre-gl'),
      ]);
      if (!mounted) {
        return;
      }
      leafletLibRef.current = leafletMod;
      mapLibreLibRef.current = mapLibreMod;
      setLibsReady(true);
    };
    void load();
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (!libsReady) {
      return;
    }
    const L = leafletLibRef.current;
    if (!L || !mapPreviewRef.current || leafletMapRef.current) {
      return;
    }

    const map = L.map(mapPreviewRef.current, {
      zoomControl: false,
      attributionControl: false,
      scrollWheelZoom: 'center',
      touchZoom: 'center',
    }).setView([app.lat, app.lon], app.zoom);

    const tile = L.tileLayer(currentTheme.tileUrl, {
      maxZoom: 19,
      crossOrigin: true,
    }).addTo(map);

    map.on('moveend', () => {
      if (mapSyncRef.current) {
        return;
      }
      mapSyncRef.current = true;
      const center = map.getCenter();
      const zoom = map.getZoom();
      setApp((prev) => ({ ...prev, lat: center.lat, lon: center.lng, zoom }));
      const artistic = mapLibreRef.current;
      if (artistic) {
        artistic.jumpTo({ center: [center.lng, center.lat], zoom: zoom - 1 });
      }
      mapSyncRef.current = false;
    });

    leafletMapRef.current = map;
    leafletTileRef.current = tile;

    return () => {
      map.remove();
      leafletMapRef.current = null;
      leafletTileRef.current = null;
    };
  }, [app.lat, app.lon, app.zoom, currentTheme.tileUrl, libsReady]);

  useEffect(() => {
    if (!libsReady) {
      return;
    }
    const maplibregl = mapLibreLibRef.current;
    if (!maplibregl || !artisticRef.current || mapLibreRef.current) {
      return;
    }

    const map = new maplibregl.Map({
      container: artisticRef.current,
      style: generateMapLibreStyle(
        currentArt,
        app.showRoute,
        app.routeGeometry,
        app.routeStartLon,
        app.routeStartLat,
        app.routeEndLon,
        app.routeEndLat,
      ),
      center: [app.lon, app.lat],
      zoom: app.zoom - 1,
      canvasContextAttributes: { preserveDrawingBuffer: true },
      attributionControl: false,
    });

    map.on('moveend', () => {
      if (mapSyncRef.current) {
        return;
      }
      mapSyncRef.current = true;
      const center = map.getCenter();
      const zoom = map.getZoom();
      setApp((prev) => ({ ...prev, lat: center.lat, lon: center.lng, zoom: zoom + 1 }));
      const leafletMap = leafletMapRef.current;
      if (leafletMap) {
        leafletMap.setView([center.lat, center.lng], zoom + 1, { animate: false });
      }
      mapSyncRef.current = false;
    });

    map.on('click', 'route-line', (e) => {
      if (!app.showRoute) {
        return;
      }
      insertViaPoint(e.lngLat.lat, e.lngLat.lng);
    });

    mapLibreRef.current = map;

    return () => {
      map.remove();
      mapLibreRef.current = null;
    };
  }, [
    app.lat,
    app.lon,
    app.routeEndLat,
    app.routeEndLon,
    app.routeGeometry,
    app.routeStartLat,
    app.routeStartLon,
    app.showRoute,
    app.zoom,
    currentArt,
    libsReady,
    insertViaPoint,
  ]);

  useEffect(() => {
    const map = leafletMapRef.current;
    const tile = leafletTileRef.current;
    if (!map || !tile) {
      return;
    }
    tile.setUrl(app.showLabels ? currentTheme.tileUrl : currentTheme.tileUrlNoLabels);
    map.setView([app.lat, app.lon], app.zoom, { animate: false });
  }, [
    app.lat,
    app.lon,
    app.showLabels,
    app.zoom,
    currentTheme.tileUrl,
    currentTheme.tileUrlNoLabels,
  ]);

  useEffect(() => {
    const artisticMap = mapLibreRef.current;
    if (!artisticMap) {
      return;
    }
    artisticMap.setStyle(
      generateMapLibreStyle(
        currentArt,
        app.showRoute,
        app.routeGeometry,
        app.routeStartLon,
        app.routeStartLat,
        app.routeEndLon,
        app.routeEndLat,
      ),
    );
  }, [
    app.routeEndLat,
    app.routeEndLon,
    app.routeGeometry,
    app.routeStartLat,
    app.routeStartLon,
    app.showRoute,
    currentArt,
  ]);

  useEffect(() => {
    const L = leafletLibRef.current;
    const map = leafletMapRef.current;
    if (!L || !map) {
      return;
    }

    markerLayersRef.current.forEach((marker) => {
      marker.remove();
    });
    markerLayersRef.current = [];

    if (!app.showMarker) {
      return;
    }

    const size = Math.round(40 * app.markerSize);
    const color = app.renderMode === 'artistic' ? currentArt.route : currentTheme.route;
    const iconSvg = MARKER_ICONS[app.markerIcon].replace('currentColor', color);
    const html = `<div style="width:${size}px;height:${size}px;color:${color}">${iconSvg}</div>`;

    for (const [index, markerData] of app.markers.entries()) {
      const marker = L.marker([markerData.lat, markerData.lon], {
        icon: L.divIcon({
          className: 'custom-marker',
          html,
          iconSize: [size, size],
          iconAnchor: [size / 2, app.markerIcon === 'pin' ? size : size / 2],
        }),
        draggable: true,
      }).addTo(map);

      marker.on('dragend', () => {
        const point = marker.getLatLng();
        setApp((prev) => {
          const nextMarkers = [...prev.markers];
          nextMarkers[index] = { lat: point.lat, lon: point.lng };
          return { ...prev, markers: nextMarkers };
        });
      });

      marker.on('dblclick', () => {
        setApp((prev) => ({
          ...prev,
          markers: prev.markers.filter((_, markerIndex) => markerIndex !== index),
        }));
      });

      markerLayersRef.current.push(marker);
    }
  }, [
    app.markerIcon,
    app.markerSize,
    app.markers,
    app.renderMode,
    app.showMarker,
    currentArt.route,
    currentTheme.route,
  ]);

  useEffect(() => {
    const maplibregl = mapLibreLibRef.current;
    const map = mapLibreRef.current;

    artisticMarkersRef.current.forEach((marker) => {
      marker.remove();
    });
    artisticMarkersRef.current = [];

    if (!maplibregl || !map || !app.showMarker) {
      return;
    }

    const size = Math.round(40 * app.markerSize);
    const color = app.renderMode === 'artistic' ? currentArt.route : currentTheme.route;
    const iconSvg = MARKER_ICONS[app.markerIcon].replace('currentColor', color);

    for (const [index, markerData] of app.markers.entries()) {
      const el = document.createElement('div');
      el.style.width = `${size}px`;
      el.style.height = `${size}px`;
      el.innerHTML = iconSvg;

      const marker = new maplibregl.Marker({
        element: el,
        draggable: true,
        anchor: app.markerIcon === 'pin' ? 'bottom' : 'center',
      })
        .setLngLat([markerData.lon, markerData.lat])
        .addTo(map);

      marker.on('dragend', () => {
        const point = marker.getLngLat();
        setApp((prev) => {
          const nextMarkers = [...prev.markers];
          nextMarkers[index] = { lat: point.lat, lon: point.lng };
          return { ...prev, markers: nextMarkers };
        });
      });

      el.ondblclick = () => {
        setApp((prev) => ({
          ...prev,
          markers: prev.markers.filter((_, markerIndex) => markerIndex !== index),
        }));
      };

      artisticMarkersRef.current.push(marker);
    }
  }, [
    app.markerIcon,
    app.markerSize,
    app.markers,
    app.renderMode,
    app.showMarker,
    currentArt.route,
    currentTheme.route,
  ]);

  useEffect(() => {
    const L = leafletLibRef.current;
    const map = leafletMapRef.current;
    if (!L || !map) {
      return;
    }

    const route = routeLayersRef.current;
    route.casing?.remove();
    route.route?.remove();
    route.visible?.remove();
    route.start?.remove();
    route.end?.remove();
    route.via.forEach((marker) => {
      marker.remove();
    });
    route.via = [];

    if (!app.showRoute) {
      return;
    }

    const color = app.renderMode === 'artistic' ? currentArt.route : currentTheme.route;
    const casing =
      app.renderMode === 'artistic' ? currentArt.bg : currentTheme.background;

    const points: Array<[number, number]> =
      app.routeGeometry.length > 0
        ? app.routeGeometry.map((coords) => [coords[1], coords[0]] as [number, number])
        : [
            [app.routeStartLat, app.routeStartLon],
            ...app.routeViaPoints.map((point) => [point.lat, point.lon] as [number, number]),
            [app.routeEndLat, app.routeEndLon],
          ];

    route.casing = L.polyline(points, {
      color: casing,
      weight: 9,
      opacity: 1,
      lineCap: 'round',
    }).addTo(map);

    route.route = L.polyline(points, {
      color,
      weight: 20,
      opacity: 0,
      interactive: true,
    }).addTo(map);

    route.visible = L.polyline(points, {
      color,
      weight: 4,
      opacity: 1,
      lineCap: 'round',
    }).addTo(map);

    route.route.on('click', (e) => {
      insertViaPoint(e.latlng.lat, e.latlng.lng);
    });

    const pointIcon = (label: string) =>
      L.divIcon({
        className: 'route-node',
        html: `<div class="route-node-inner">${label}</div>`,
        iconSize: [24, 24],
        iconAnchor: [12, 12],
      });

    route.start = L.marker([app.routeStartLat, app.routeStartLon], {
      draggable: true,
      icon: pointIcon('A'),
    }).addTo(map);

    route.end = L.marker([app.routeEndLat, app.routeEndLon], {
      draggable: true,
      icon: pointIcon('B'),
    }).addTo(map);

    route.start.on('dragend', () => {
      const point = route.start?.getLatLng();
      if (point) {
        mutate({ routeStartLat: point.lat, routeStartLon: point.lng });
      }
    });

    route.end.on('dragend', () => {
      const point = route.end?.getLatLng();
      if (point) {
        mutate({ routeEndLat: point.lat, routeEndLon: point.lng });
      }
    });

    for (const [index, viaPoint] of app.routeViaPoints.entries()) {
      const marker = L.marker([viaPoint.lat, viaPoint.lon], {
        draggable: true,
        icon: L.divIcon({
          className: 'via-node',
          html: '<div class="via-node-inner"></div>',
          iconSize: [14, 14],
          iconAnchor: [7, 7],
        }),
      }).addTo(map);

      marker.on('dragend', () => {
        const point = marker.getLatLng();
        setApp((prev) => {
          const nextVia = [...prev.routeViaPoints];
          nextVia[index] = { lat: point.lat, lon: point.lng };
          return { ...prev, routeViaPoints: nextVia };
        });
      });

      marker.on('dblclick', () => {
        setApp((prev) => ({
          ...prev,
          routeViaPoints: prev.routeViaPoints.filter(
            (_, viaIndex) => viaIndex !== index,
          ),
        }));
      });

      route.via.push(marker);
    }
  }, [
    app.renderMode,
    app.routeEndLat,
    app.routeEndLon,
    app.routeGeometry,
    app.routeStartLat,
    app.routeStartLon,
    app.routeViaPoints,
    app.showRoute,
    currentArt.bg,
    currentArt.route,
    currentTheme.background,
    currentTheme.route,
    insertViaPoint,
    mutate,
  ]);

  useEffect(() => {
    const maplibregl = mapLibreLibRef.current;
    const map = mapLibreRef.current;

    artisticRouteMarkersRef.current.start?.remove();
    artisticRouteMarkersRef.current.end?.remove();
    artisticRouteMarkersRef.current.via.forEach((marker) => {
      marker.remove();
    });
    artisticRouteMarkersRef.current.via = [];

    if (!maplibregl || !map || !app.showRoute) {
      return;
    }

    const makeDot = (label?: string) => {
      const el = document.createElement('div');
      el.className = label ? 'route-node-inner' : 'via-node-inner';
      el.textContent = label ?? '';
      return el;
    };

    const start = new maplibregl.Marker({ element: makeDot('A'), draggable: true })
      .setLngLat([app.routeStartLon, app.routeStartLat])
      .addTo(map);

    const end = new maplibregl.Marker({ element: makeDot('B'), draggable: true })
      .setLngLat([app.routeEndLon, app.routeEndLat])
      .addTo(map);

    start.on('dragend', () => {
      const point = start.getLngLat();
      mutate({ routeStartLat: point.lat, routeStartLon: point.lng });
    });

    end.on('dragend', () => {
      const point = end.getLngLat();
      mutate({ routeEndLat: point.lat, routeEndLon: point.lng });
    });

    const via = app.routeViaPoints.map((viaPoint, index) => {
      const el = makeDot();
      const marker = new maplibregl.Marker({ element: el, draggable: true })
        .setLngLat([viaPoint.lon, viaPoint.lat])
        .addTo(map);

      marker.on('dragend', () => {
        const point = marker.getLngLat();
        setApp((prev) => {
          const nextVia = [...prev.routeViaPoints];
          nextVia[index] = { lat: point.lat, lon: point.lng };
          return { ...prev, routeViaPoints: nextVia };
        });
      });

      el.ondblclick = () => {
        setApp((prev) => ({
          ...prev,
          routeViaPoints: prev.routeViaPoints.filter(
            (_, viaIndex) => viaIndex !== index,
          ),
        }));
      };

      return marker;
    });

    artisticRouteMarkersRef.current = { start, end, via };
  }, [
    app.routeEndLat,
    app.routeEndLon,
    app.routeStartLat,
    app.routeStartLon,
    app.routeViaPoints,
    app.showRoute,
    mutate,
  ]);

  useEffect(() => {
    if (!app.showRoute) {
      return;
    }
    const loadRoute = async () => {
      const geometry = await fetchOsrmRoute(
        app.routeStartLat,
        app.routeStartLon,
        app.routeEndLat,
        app.routeEndLon,
        app.routeViaPoints,
      );
      mutate({ routeGeometry: geometry });
    };
    void loadRoute();
  }, [
    app.routeEndLat,
    app.routeEndLon,
    app.routeStartLat,
    app.routeStartLon,
    app.routeViaPoints,
    app.showRoute,
    mutate,
  ]);

  useEffect(() => {
    if (searchQuery.trim().length < 2) {
      setSearchResults([]);
      setSearching(false);
      if (searchAbortRef.current) {
        searchAbortRef.current.abort();
        searchAbortRef.current = null;
      }
      return;
    }

    const ctrl = new AbortController();
    searchAbortRef.current = ctrl;
    setSearching(true);

    const timer = window.setTimeout(async () => {
      const results = await searchLocation(searchQuery, ctrl.signal);
      setSearchResults(results);
      setSearching(false);
    }, 400);

    return () => {
      window.clearTimeout(timer);
      ctrl.abort();
    };
  }, [searchQuery]);

  const selectLocation = useCallback(
    (lat: number, lon: number, city: string, country: string) => {
      mutate({
        city: city.toUpperCase(),
        country: country.toUpperCase(),
        lat,
        lon,
        markers: [{ lat, lon }],
        routeStartLat: lat,
        routeStartLon: lon,
        routeEndLat: lat - 0.005,
        routeEndLon: lon + 0.005,
        routeViaPoints: [],
        routeGeometry: [],
      });
      setSearchQuery(city);
      setSearchResults([]);
    },
    [mutate],
  );

  const startOverlayDrag = useCallback(
    (clientX: number, clientY: number) => {
      if (!overlayRef.current || !posterRef.current || app.overlaySize === 'none') {
        return;
      }
      const startX = app.overlayX;
      const startY = app.overlayY;
      const rect = posterRef.current.getBoundingClientRect();

      const move = (x: number, y: number) => {
        const dx = (x - clientX) / rect.width;
        const dy = (y - clientY) / rect.height;
        const nextX = Math.max(0.05, Math.min(0.95, startX + dx));
        const nextY = Math.max(0.05, Math.min(0.95, startY + dy));
        mutate({ overlayX: nextX, overlayY: nextY });
      };

      const onMouseMove = (e: MouseEvent) => move(e.clientX, e.clientY);
      const onTouchMove = (e: TouchEvent) => {
        if (e.touches[0]) {
          move(e.touches[0].clientX, e.touches[0].clientY);
        }
      };
      const stop = () => {
        document.removeEventListener('mousemove', onMouseMove);
        document.removeEventListener('mouseup', stop);
        document.removeEventListener('touchmove', onTouchMove);
        document.removeEventListener('touchend', stop);
      };

      document.addEventListener('mousemove', onMouseMove);
      document.addEventListener('mouseup', stop);
      document.addEventListener('touchmove', onTouchMove);
      document.addEventListener('touchend', stop);
    },
    [app.overlaySize, app.overlayX, app.overlayY, mutate],
  );

  const exportPng = useCallback(async () => {
    if (!posterRef.current || !mapPreviewRef.current) {
      return;
    }

    const waitForMapReady = async () => {
      await new Promise<void>((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
      });

      const tileLayer = leafletTileRef.current;
      if (tileLayer) {
        await new Promise<void>((resolve) => {
          let done = false;
          const finish = () => {
            if (done) {
              return;
            }
            done = true;
            tileLayer.off('load', finish);
            resolve();
          };

          tileLayer.once('load', finish);
          window.setTimeout(finish, 1400);
        });
      }

      const mapLibre = mapLibreRef.current;
      if (mapLibre) {
        await new Promise<void>((resolve) => {
          let done = false;
          const finish = () => {
            if (done) {
              return;
            }
            done = true;
            mapLibre.off('idle', finish);
            resolve();
          };

          if (mapLibre.isStyleLoaded() && !mapLibre.isMoving()) {
            resolve();
            return;
          }

          mapLibre.once('idle', finish);
          window.setTimeout(finish, 1800);
        });
      }
    };

    setExportStage('loading');
    try {
      await waitForMapReady();
      setExportStage('processing');
      await exportPosterPng({
        posterElement: posterRef.current,
        mapElement: mapPreviewRef.current,
        mapLibre: mapLibreRef.current,
        state: app,
        theme: currentTheme,
        artisticTheme: currentArt,
      });
    } finally {
      setExportStage('idle');
    }
  }, [app, currentArt, currentTheme]);

  const saveCustomTheme = useCallback(() => {
    if (!editTheme.name.trim()) {
      return;
    }
    const key = editingThemeKey ?? `custom_${Date.now()}`;
    setCustomThemes((prev) => ({ ...prev, [key]: editTheme }));
    mutate({ artisticTheme: key });
    setShowThemeEditor(false);
    setShowArtisticModal(true);
  }, [editTheme, editingThemeKey, mutate]);

  const deleteCustomTheme = useCallback(() => {
    if (!editingThemeKey) {
      return;
    }
    setCustomThemes((prev) => {
      const next = { ...prev };
      delete next[editingThemeKey];
      return next;
    });
    mutate({ artisticTheme: 'cyber_noir' });
    setShowThemeEditor(false);
    setShowArtisticModal(true);
  }, [editingThemeKey, mutate]);

  const exportCustomThemes = useCallback(() => {
    const blob = new Blob([JSON.stringify(customThemes, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'map-to-poster-custom-themes.json';
    link.click();
    URL.revokeObjectURL(url);
  }, [customThemes]);

  const importCustomThemes = useCallback(async (file: File) => {
    const text = await file.text();
    const parsedUnknown = JSON.parse(text) as unknown;
    const parsed = parseCustomThemeRecord(parsedUnknown);
    setCustomThemes((prev) => ({ ...prev, ...parsed }));
  }, []);

  const clearCustomThemes = useCallback(() => {
    setCustomThemes({});
    mutate({ artisticTheme: 'cyber_noir' });
  }, [mutate]);

  const updateThemeColor = useCallback((key: ArtisticColorKey, color: string) => {
    setEditTheme((prev) => ({ ...prev, [key]: color }));
  }, []);

  const updateThemeHex = useCallback(
    (key: ArtisticColorKey, rawValue: string) => {
      const normalized = normalizeHexInput(rawValue);
      if (/^#[0-9A-F]{6}$/.test(normalized)) {
        updateThemeColor(key, normalized);
      }
    },
    [updateThemeColor],
  );

  const resetAll = useCallback(() => {
    mutate(DEFAULT_STATE);
    setSearchResults([]);
    setSearchQuery('');
  }, [mutate]);

  const filteredPresets = useMemo(() => {
    const q = presetSearch.trim().toLowerCase();
    if (!q) {
      return OUTPUT_PRESETS;
    }

    const filtered: Record<string, typeof OUTPUT_PRESETS.social_media> = {};
    for (const [group, items] of Object.entries(OUTPUT_PRESETS)) {
      const nextItems = items.filter((item) => {
        const haystack = `${item.name} ${item.width} ${item.height}`.toLowerCase();
        return haystack.includes(q);
      });
      if (nextItems.length > 0) {
        filtered[group] = nextItems;
      }
    }
    return filtered;
  }, [presetSearch]);

  const filteredThemes = useMemo(() => {
    const q = themeSearch.trim().toLowerCase();
    if (!q) {
      return Object.entries(artisticThemes);
    }
    return Object.entries(artisticThemes).filter(([key, theme]) =>
      `${key} ${theme.name} ${theme.description}`.toLowerCase().includes(q),
    );
  }, [artisticThemes, themeSearch]);

  const sectionLocation = (
    <section className="neo-section" id="section-location">
      <h3 className="section-title">
        <span className="section-icon" aria-hidden="true">
          🧭
        </span>
        1. Define Location
      </h3>
      <p className="label-text">Search City</p>
      <input
        id="search-input"
        placeholder="Search world cities..."
        value={searchQuery}
        onChange={(e) => setSearchQuery(e.target.value)}
      />
      {searching && (
        <p className="hint" id="search-loading">
          Searching...
        </p>
      )}
      {searchResults.length > 0 && (
        <div className="search-list" id="search-results">
          {searchResults.map((result) => (
            <button
              type="button"
              key={`${result.lat}-${result.lon}-${result.name}`}
              onClick={() =>
                selectLocation(
                  result.lat,
                  result.lon,
                  result.shortName,
                  result.country,
                )
              }
            >
              {result.name}
            </button>
          ))}
        </div>
      )}

      <p className="label-text">Override City Name</p>
      <input
        id="city-override-input"
        value={app.cityOverride}
        onChange={(e) => mutate({ cityOverride: e.target.value.toUpperCase() })}
      />

      <div className="row-between">
        <p className="label-text">Override Country Name</p>
        <button
          type="button"
          id="toggle-country-btn"
          className="icon-btn"
          onClick={() => mutate({ showCountry: !app.showCountry })}
        >
          <span id="country-eye-icon">{app.showCountry ? '👁' : '🙈'}</span>
        </button>
      </div>
      <input
        id="country-override-input"
        value={app.countryOverride}
        onChange={(e) => mutate({ countryOverride: e.target.value.toUpperCase() })}
      />

      <div className="row-between">
        <p className="label-text">Coordinates</p>
        <button
          type="button"
          id="toggle-coords-btn"
          className="icon-btn"
          onClick={() => mutate({ showCoords: !app.showCoords })}
        >
          <span id="coords-eye-icon">{app.showCoords ? '👁' : '🙈'}</span>
        </button>
      </div>
      <div className="grid2">
        <input
          id="lat-input"
          value={app.lat}
          onChange={(e) => {
            const nextLat = parseCoordinateInput(e.target.value);
            if (nextLat === null) {
              return;
            }
            setApp((prev) => {
              const nextMarkers = [...prev.markers];
              if (nextMarkers[0]) {
                nextMarkers[0] = { ...nextMarkers[0], lat: nextLat };
              }
              return {
                ...prev,
                lat: nextLat,
                markers: nextMarkers,
                routeStartLat: nextLat,
                routeGeometry: prev.showRoute ? [] : prev.routeGeometry,
              };
            });
          }}
        />
        <input
          id="lon-input"
          value={app.lon}
          onChange={(e) => {
            const nextLon = parseCoordinateInput(e.target.value);
            if (nextLon === null) {
              return;
            }
            setApp((prev) => {
              const nextMarkers = [...prev.markers];
              if (nextMarkers[0]) {
                nextMarkers[0] = { ...nextMarkers[0], lon: nextLon };
              }
              return {
                ...prev,
                lon: nextLon,
                markers: nextMarkers,
                routeStartLon: nextLon,
                routeGeometry: prev.showRoute ? [] : prev.routeGeometry,
              };
            });
          }}
        />
      </div>
    </section>
  );

  const sectionMarkerRoute = (
    <section className="neo-section" id="section-marker">
      <h3 className="section-title">
        <span className="section-icon" aria-hidden="true">
          📍
        </span>
        2. Marker & Route
      </h3>

      <div className="row-between">
        <span>Show Location Marker</span>
        <input
          id="show-marker-toggle"
          type="checkbox"
          checked={app.showMarker}
          onChange={(e) => mutate({ showMarker: e.target.checked })}
        />
      </div>

      {app.showMarker && (
        <div id="marker-settings">
          <p className="hint" id="marker-count">
            {app.markers.length} marker{app.markers.length === 1 ? '' : 's'}
          </p>
          <div className="grid2">
            <select
              id="marker-icon-select"
              value={app.markerIcon}
              onChange={(e) =>
                mutate({ markerIcon: e.target.value as AppState['markerIcon'] })
              }
            >
              <option value="pin">Default Pin</option>
              <option value="circle">Modern Dot</option>
              <option value="heart">Heart</option>
              <option value="star">Star</option>
              <option value="none">Ghost Point</option>
            </select>
            <input
              id="marker-size-slider"
              type="range"
              min={10}
              max={120}
              step={2}
              value={Math.round(app.markerSize * 40)}
              onChange={(e) =>
                mutate({ markerSize: Number.parseInt(e.target.value, 10) / 40 })
              }
            />
          </div>
          <p className="hint" id="marker-size-value">
            {Math.round(app.markerSize * 40)} px
          </p>
          <div className="grid2">
            <button
              id="add-marker-btn"
              type="button"
              onClick={() =>
                mutate({ markers: [...app.markers, { lat: app.lat, lon: app.lon }] })
              }
            >
              Add Point
            </button>
            <button
              id="remove-marker-btn"
              type="button"
              onClick={() => mutate({ markers: app.markers.slice(0, -1) })}
            >
              Remove Last
            </button>
          </div>
          <button
            id="clear-markers-btn"
            type="button"
            onClick={() => mutate({ markers: [], showMarker: false })}
          >
            Clear All
          </button>
        </div>
      )}

      <div className="row-between">
        <span>Custom Route (A to B)</span>
        <input
          id="show-route-toggle"
          type="checkbox"
          checked={app.showRoute}
          onChange={(e) => {
            if (e.target.checked) {
              mutate({
                showRoute: true,
                routeStartLat: app.lat,
                routeStartLon: app.lon,
                routeEndLat: app.lat - 0.005,
                routeEndLon: app.lon + 0.005,
                routeViaPoints: [],
                routeGeometry: [],
              });
              return;
            }
            mutate({
              showRoute: false,
              routeViaPoints: [],
              routeGeometry: [],
            });
          }}
        />
      </div>

      {app.showRoute && (
        <div id="route-settings">
          <p className="hint" id="route-count">
            {app.routeViaPoints.length + 2} route points
          </p>
          <button
            id="reset-route-btn"
            type="button"
            onClick={() => mutate({ routeViaPoints: [], routeGeometry: [] })}
          >
            Reset Route
          </button>
        </div>
      )}
    </section>
  );

  const sectionStyle = (
    <section className="neo-section" id="section-style">
      <h3 className="section-title">
        <span className="section-icon" aria-hidden="true">
          🎨
        </span>
        3. Map Style
      </h3>
      <div className="segmented">
        <button
          id="mode-tile"
          type="button"
          className={app.renderMode === 'tile' ? 'active' : ''}
          onClick={() => mutate({ renderMode: 'tile' })}
        >
          Standard
        </button>
        <button
          id="mode-artistic"
          type="button"
          className={app.renderMode === 'artistic' ? 'active' : ''}
          onClick={() => mutate({ renderMode: 'artistic' })}
        >
          Artistic
        </button>
      </div>

      {app.renderMode === 'tile' ? (
        <div id="standard-theme-config">
          <select
            id="theme-select"
            value={app.theme}
            onChange={(e) => mutate({ theme: e.target.value })}
          >
            {Object.entries(themes).map(([key, value]) => (
              <option key={key} value={key}>
                {value.name}
              </option>
            ))}
          </select>
          <div className="row-between">
            <span>Show Place Labels</span>
            <input
              id="show-labels-toggle"
              type="checkbox"
              checked={app.showLabels}
              onChange={(e) => mutate({ showLabels: e.target.checked })}
            />
          </div>
        </div>
      ) : (
        <div id="artistic-theme-config">
          <div className="grid2" id="artistic-main-grid">
            {['cyber_noir', 'golden_era', 'mangrove_maze'].map((key) => (
              <button
                type="button"
                key={key}
                className={app.artisticTheme === key ? 'active' : ''}
                onClick={() => mutate({ artisticTheme: key })}
              >
                {artisticThemes[key].name}
              </button>
            ))}
            <button type="button" onClick={() => setShowArtisticModal(true)}>
              Other Themes
            </button>
          </div>
          <p className="hint" id="artistic-desc">
            {currentArt.description}
          </p>
        </div>
      )}
    </section>
  );

  const sectionComposition = (
    <section className="neo-section" id="section-composition">
      <h3 className="section-title">
        <span className="section-icon" aria-hidden="true">
          🧱
        </span>
        4. Composition
      </h3>
      <p className="label-text" id="zoom-value">
        Perspective Zoom: {app.zoom}
      </p>
      <input
        id="zoom-slider"
        type="range"
        min={1}
        max={18}
        value={app.zoom}
        onChange={(e) => mutate({ zoom: Number.parseInt(e.target.value, 10) })}
      />

      <p className="label-text">Overlay Effect</p>
      <div className="grid3" id="overlay-bg-group">
        {(['none', 'vignette', 'radial'] as const).map((style) => (
          <button
            type="button"
            key={style}
            className={`overlay-bg-btn ${app.overlayBgType === style ? 'active' : ''}`}
            onClick={() => mutate({ overlayBgType: style })}
          >
            {style}
          </button>
        ))}
      </div>

      <p className="label-text">Overlay Size</p>
      <div className="grid4" id="overlay-size-group">
        {(['none', 'small', 'medium', 'large'] as const).map((size) => (
          <button
            type="button"
            key={size}
            className={`overlay-size-btn ${app.overlaySize === size ? 'active' : ''}`}
            onClick={() => mutate({ overlaySize: size })}
          >
            {size}
          </button>
        ))}
      </div>

      <p className="label-text">Overlay Position</p>
      <div className="grid3" id="overlay-position-group">
        {[0.15, 0.5, 0.85]
          .flatMap((y) => [0.15, 0.5, 0.85].map((x) => ({ x, y })))
          .map((position) => (
            <button
              type="button"
              key={`${position.x}-${position.y}`}
              className={`overlay-pos-btn ${
                Math.abs(app.overlayX - position.x) < 0.02 &&
                Math.abs(app.overlayY - position.y) < 0.02
                  ? 'active'
                  : ''
              }`}
              data-overlay-x={position.x}
              data-overlay-y={position.y}
              onClick={() => mutate({ overlayX: position.x, overlayY: position.y })}
            >
              •
            </button>
          ))}
      </div>

      <button
        id="reset-overlay-pos-btn"
        type="button"
        onClick={() => mutate({ overlayX: 0.5, overlayY: 0.85 })}
      >
        Reset Overlay Position
      </button>
    </section>
  );

  const sectionTypography = (
    <section className="neo-section" id="section-typography">
      <h3 className="section-title">
        <span className="section-icon" aria-hidden="true">
          🔤
        </span>
        5. Typography
      </h3>
      <p className="label-text">City Font</p>
      <select
        id="city-font-select"
        value={app.cityFont}
        onChange={(e) => mutate({ cityFont: e.target.value })}
      >
        {CITY_FONTS.map((font) => (
          <option key={font} value={cityFontValue(font)}>
            {font}
          </option>
        ))}
      </select>

      <p className="label-text">Country Font</p>
      <select
        id="country-font-select"
        value={app.countryFont}
        onChange={(e) => mutate({ countryFont: e.target.value })}
      >
        {COUNTRY_FONTS.map((font) => (
          <option key={font} value={font}>
            {font}
          </option>
        ))}
      </select>

      <p className="label-text">Coordinates Font</p>
      <select
        id="coords-font-select"
        value={app.coordsFont}
        onChange={(e) => mutate({ coordsFont: e.target.value })}
      >
        {COORDS_FONTS.map((font) => (
          <option key={font} value={font}>
            {font}
          </option>
        ))}
      </select>
    </section>
  );

  const sectionMat = (
    <section className="neo-section" id="section-mat">
      <h3 className="section-title">
        <span className="section-icon" aria-hidden="true">
          🖼️
        </span>
        6. Mat / Passepartout
      </h3>
      <div className="row-between">
        <span>Enable Mat</span>
        <input
          id="mat-toggle"
          type="checkbox"
          checked={app.matEnabled}
          onChange={(e) => mutate({ matEnabled: e.target.checked })}
        />
      </div>

      {app.matEnabled && (
        <div id="mat-settings">
          <p className="label-text" id="mat-width-value">
            Mat Width ({app.matWidth}px)
          </p>
          <input
            id="mat-width-slider"
            type="range"
            min={10}
            max={200}
            step={5}
            value={app.matWidth}
            onChange={(e) => mutate({ matWidth: Number.parseInt(e.target.value, 10) })}
          />

          <div className="row-between">
            <span>Show Inner Border</span>
            <input
              id="mat-border-toggle"
              type="checkbox"
              checked={app.matShowBorder}
              onChange={(e) => mutate({ matShowBorder: e.target.checked })}
            />
          </div>

          {app.matShowBorder && (
            <div id="mat-border-settings">
              <p className="label-text" id="mat-border-width-value">
                Border Thickness ({app.matBorderWidth}px)
              </p>
              <input
                id="mat-border-width-slider"
                type="range"
                min={1}
                max={10}
                value={app.matBorderWidth}
                onChange={(e) =>
                  mutate({ matBorderWidth: Number.parseInt(e.target.value, 10) })
                }
              />

              <p className="label-text" id="mat-border-opacity-value">
                Border Opacity ({Math.round(app.matBorderOpacity * 100)}%)
              </p>
              <input
                id="mat-border-opacity-slider"
                type="range"
                min={0}
                max={1}
                step={0.1}
                value={app.matBorderOpacity}
                onChange={(e) =>
                  mutate({ matBorderOpacity: Number.parseFloat(e.target.value) })
                }
              />
            </div>
          )}
        </div>
      )}
    </section>
  );

  const sectionOutput = (
    <section className="neo-section" id="section-output">
      <h3 className="section-title">
        <span className="section-icon" aria-hidden="true">
          📐
        </span>
        7. Output Size
      </h3>

      <div className="grid2">
        {QUICK_PRESETS.map((preset) => (
          <button
            type="button"
            key={preset.name}
            data-width={preset.width}
            data-height={preset.height}
            className={`preset-btn ${
              app.width === preset.width && app.height === preset.height ? 'active' : ''
            }`}
            onClick={() => mutate({ width: preset.width, height: preset.height })}
          >
            {preset.name}
          </button>
        ))}
        <button id="other-presets-btn" type="button" onClick={() => setShowPresetModal(true)}>
          Other
        </button>
      </div>

      <div className="grid2">
        <input
          id="custom-w"
          type="number"
          min={100}
          max={50000}
          value={app.width}
          onChange={(e) =>
            mutate({ width: Number.parseInt(e.target.value, 10) || app.width })
          }
        />
        <input
          id="custom-h"
          type="number"
          min={100}
          max={50000}
          value={app.height}
          onChange={(e) =>
            mutate({ height: Number.parseInt(e.target.value, 10) || app.height })
          }
        />
      </div>

      <button id="reset-settings-btn" type="button" onClick={resetAll}>
        Reset to Defaults
      </button>
    </section>
  );

  return (
    <div className="app-shell">
      <nav className="mobile-nav">
        <button
          id="nav-btn-a"
          type="button"
          data-target="mobile-sheet-a"
          className={activeMobile === 'a' ? 'active' : ''}
          aria-label="Location"
          title="Location"
          onClick={() => setActiveMobile(activeMobile === 'a' ? null : 'a')}
        >
          <span className="mobile-nav-icon" aria-hidden="true">
            🧭
          </span>
        </button>
        <button
          id="nav-btn-b"
          type="button"
          data-target="mobile-sheet-b"
          className={activeMobile === 'b' ? 'active' : ''}
          aria-label="Style"
          title="Style"
          onClick={() => setActiveMobile(activeMobile === 'b' ? null : 'b')}
        >
          <span className="mobile-nav-icon" aria-hidden="true">
            🎨
          </span>
        </button>
        <button
          id="nav-btn-c"
          type="button"
          data-target="mobile-sheet-c"
          className={activeMobile === 'c' ? 'active' : ''}
          aria-label="Output"
          title="Output"
          onClick={() => setActiveMobile(activeMobile === 'c' ? null : 'c')}
        >
          <span className="mobile-nav-icon" aria-hidden="true">
            📐
          </span>
        </button>
        <button
          id="nav-btn-d"
          type="button"
          aria-label="About"
          title="About"
          onClick={() => setShowAboutModal(true)}
        >
          <span className="mobile-nav-icon" aria-hidden="true">
            ℹ️
          </span>
        </button>
        <button
          id="mobile-export-btn"
          type="button"
          className="export-fab"
          aria-label="Export"
          title="Export"
          disabled={exporting}
          onClick={() => void exportPng()}
        >
          <span className="mobile-nav-icon" aria-hidden="true">
            {exportStage === 'loading' ? '⏳' : exportStage === 'processing' ? '⚙️' : '⬇️'}
          </span>
        </button>
      </nav>

      <aside className="desktop-sidebar">
        <div className="brand">
          <button
            type="button"
            className="brand-btn"
            onClick={() => setShowAboutModal(true)}
          >
            <strong>
              <span aria-hidden="true">🗺️</span> Map Craft by KREASAI.COM
            </strong>
            <span>Neobrutal Map Artist</span>
          </button>
        </div>
        <div className="controls-scroll">
          {sectionLocation}
          {sectionMarkerRoute}
          {sectionStyle}
          {sectionComposition}
          {sectionTypography}
          {sectionMat}
          {sectionOutput}
        </div>
        <button
          id="export-btn"
          type="button"
          className="export-btn"
          disabled={exporting}
          onClick={() => void exportPng()}
        >
          <span aria-hidden="true">⬇️ </span>
          {exportStage === 'loading'
            ? 'Loading map...'
            : exportStage === 'processing'
              ? 'Processing...'
              : 'Generate Export'}
        </button>
        <p className="hint" id="export-status">
          {exportStage === 'idle' ? 'Ready to export' : exportStage}
        </p>
      </aside>

      <main className="preview-main">
        <div id="poster-scaler" className="poster-scaler" style={{ transform: `scale(${scale})` }}>
          <div
            id="poster-container"
            ref={posterRef}
            className="poster"
            style={{
              width: app.width,
              height: app.height,
              background:
                app.renderMode === 'artistic' ? currentArt.bg : currentTheme.background,
            }}
          >
            <div
              id="map-preview"
              ref={mapPreviewRef}
              className="map-layer"
              style={{
                top: app.matEnabled ? app.matWidth : 0,
                left: app.matEnabled ? app.matWidth : 0,
                right: app.matEnabled ? app.matWidth : 0,
                bottom: app.matEnabled ? app.matWidth : 0,
                visibility: app.renderMode === 'tile' ? 'visible' : 'hidden',
              }}
            />
            <div
              id="artistic-map"
              ref={artisticRef}
              className="map-layer"
              style={{
                top: app.matEnabled ? app.matWidth : 0,
                left: app.matEnabled ? app.matWidth : 0,
                right: app.matEnabled ? app.matWidth : 0,
                bottom: app.matEnabled ? app.matWidth : 0,
                visibility: app.renderMode === 'artistic' ? 'visible' : 'hidden',
              }}
            />

            {app.matEnabled && app.matShowBorder && (
              <div
                id="mat-border"
                className="mat-border"
                style={{
                  top: app.matWidth,
                  left: app.matWidth,
                  right: app.matWidth,
                  bottom: app.matWidth,
                  borderWidth: app.matBorderWidth,
                  borderColor:
                    app.renderMode === 'artistic'
                      ? currentArt.text
                      : currentTheme.textColor,
                  opacity: app.matBorderOpacity,
                }}
              />
            )}

            <div
              id="vignette-overlay"
              className="vignette"
              style={{
                display: app.overlayBgType === 'none' ? 'none' : 'block',
                top: app.matEnabled ? app.matWidth : 0,
                left: app.matEnabled ? app.matWidth : 0,
                right: app.matEnabled ? app.matWidth : 0,
                bottom: app.matEnabled ? app.matWidth : 0,
                background:
                  app.overlayBgType === 'radial'
                    ? `radial-gradient(circle, ${hexToRgba(
                        app.renderMode === 'artistic'
                          ? currentArt.bg
                          : currentTheme.background,
                        0,
                      )} 0%, ${hexToRgba(
                        app.renderMode === 'artistic'
                          ? currentArt.bg
                          : currentTheme.background,
                        0.4,
                      )} 72%, ${hexToRgba(
                        app.renderMode === 'artistic'
                          ? currentArt.bg
                          : currentTheme.background,
                        1,
                      )} 100%)`
                    : `linear-gradient(to bottom, ${hexToRgba(
                        app.renderMode === 'artistic'
                          ? currentArt.bg
                          : currentTheme.background,
                        1,
                      )} 0%, ${hexToRgba(
                        app.renderMode === 'artistic'
                          ? currentArt.bg
                          : currentTheme.background,
                        1,
                      )} 3%, ${hexToRgba(
                        app.renderMode === 'artistic'
                          ? currentArt.bg
                          : currentTheme.background,
                        0,
                      )} 20%, ${hexToRgba(
                        app.renderMode === 'artistic'
                          ? currentArt.bg
                          : currentTheme.background,
                        0,
                      )} 80%, ${hexToRgba(
                        app.renderMode === 'artistic'
                          ? currentArt.bg
                          : currentTheme.background,
                        1,
                      )} 97%, ${hexToRgba(
                        app.renderMode === 'artistic'
                          ? currentArt.bg
                          : currentTheme.background,
                        1,
                      )} 100%)`,
              }}
            />

            {app.overlaySize !== 'none' && (
              <div
                id="poster-overlay"
                ref={overlayRef}
                className="poster-overlay"
                style={{
                  left: `${app.overlayX * 100}%`,
                  top: `${app.overlayY * 100}%`,
                  padding:
                    app.overlaySize === 'small'
                      ? 24
                      : app.overlaySize === 'large'
                        ? 80
                        : 48,
                }}
              >
                <button
                  type="button"
                  aria-label="Drag overlay"
                  className="overlay-drag-hit"
                  onMouseDown={(e) => startOverlayDrag(e.clientX, e.clientY)}
                  onTouchStart={(e) => {
                    const touch = e.touches[0];
                    if (touch) {
                      startOverlayDrag(touch.clientX, touch.clientY);
                    }
                  }}
                />

                <h2
                  id="display-city"
                  style={{
                    color:
                      app.renderMode === 'artistic'
                        ? currentArt.text
                        : currentTheme.textColor,
                    fontFamily: app.cityFont,
                  }}
                >
                  {app.cityOverride || app.city}
                </h2>

                <div
                  id="poster-divider"
                  className="divider"
                  style={{
                    display: app.showCountry || app.showCoords ? 'block' : 'none',
                    background:
                      app.renderMode === 'artistic'
                        ? currentArt.text
                        : currentTheme.textColor,
                  }}
                />

                <p
                  id="display-country"
                  style={{
                    display: app.showCountry ? 'block' : 'none',
                    color:
                      app.renderMode === 'artistic'
                        ? currentArt.text
                        : currentTheme.textColor,
                    fontFamily: app.countryFont,
                  }}
                >
                  {app.countryOverride || app.country}
                </p>

                <p
                  id="display-coords"
                  style={{
                    display: app.showCoords ? 'block' : 'none',
                    color:
                      app.renderMode === 'artistic'
                        ? currentArt.text
                        : currentTheme.textColor,
                    fontFamily: app.coordsFont,
                  }}
                >
                  {formatCoords(app.lat, app.lon)}
                </p>
              </div>
            )}

            <div id="poster-attribution" className="attribution">
              © OpenStreetMap Contributors
            </div>
          </div>
        </div>
      </main>

      {(['a', 'b', 'c'] as const).map((mobileSheet) => {
        const isOpen = activeMobile === mobileSheet;
        const title =
          mobileSheet === 'a'
            ? 'Location & Markers'
            : mobileSheet === 'b'
              ? 'Map Style'
              : 'Output';

        return (
          <div
            key={mobileSheet}
            className="mobile-sheet"
            id={`mobile-sheet-${mobileSheet}`}
            style={{ display: isOpen ? 'flex' : 'none' }}
          >
            <button
              type="button"
              className="modal-backdrop close-sheet-btn"
              aria-label="Close mobile sheet"
              onClick={() => setActiveMobile(null)}
            />
            <div className="mobile-sheet-panel">
              <header>
                <h2>{title}</h2>
                <button
                  type="button"
                  className="close-sheet-btn"
                  onClick={() => setActiveMobile(null)}
                >
                  ✕
                </button>
              </header>
              <div
                className="mobile-sheet-content"
                id={`mobile-sheet-${mobileSheet}-content`}
              >
                {mobileSheet === 'a' && (
                  <>
                    {sectionLocation}
                    {sectionMarkerRoute}
                  </>
                )}
                {mobileSheet === 'b' && (
                  <>
                    {sectionStyle}
                    {sectionComposition}
                    {sectionTypography}
                  </>
                )}
                {mobileSheet === 'c' && (
                  <>
                    {sectionMat}
                    {sectionOutput}
                  </>
                )}
              </div>
              <button id={`mobile-reset-${mobileSheet}-btn`} type="button" onClick={resetAll}>
                Reset to Defaults
              </button>
            </div>
          </div>
        );
      })}

      {showAboutModal && (
        <div className="modal" id="credits-modal">
          <button
            type="button"
            id="credits-overlay"
            className="modal-backdrop"
            aria-label="Close about modal"
            onClick={() => setShowAboutModal(false)}
          />
          <div className="modal-panel">
            <header>
              <h3>About Map Craft by KREASAI.COM</h3>
              <button id="close-credits" type="button" onClick={() => setShowAboutModal(false)}>
                ✕
              </button>
            </header>

            <div className="about-content">
              <p>
                Map Craft by KREASAI.COM is a map art studio built with Next.js App Router, Leaflet,
                MapLibre GL, OSRM routing, and html-to-image export.
              </p>
              <div className="chip-wrap">
                <span className="chip">html-to-image</span>
                <span className="chip">leaflet</span>
                <span className="chip">maplibre-gl</span>
                <span className="chip">OpenStreetMap</span>
                <span className="chip">OSRM</span>
                <span className="chip">Next.js</span>
              </div>
              <button id="close-credits-btn" type="button" onClick={() => setShowAboutModal(false)}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {showPresetModal && (
        <div className="modal" id="presets-modal">
          <button
            type="button"
            id="modal-overlay"
            className="modal-backdrop"
            aria-label="Close preset modal"
            onClick={() => setShowPresetModal(false)}
          />
          <div className="modal-panel" id="modal-content">
            <header>
              <h3>Output Presets</h3>
              <button id="close-modal" type="button" onClick={() => setShowPresetModal(false)}>
                ✕
              </button>
            </header>

            <input
              placeholder="Search sizes or names..."
              value={presetSearch}
              onChange={(e) => setPresetSearch(e.target.value)}
            />

            <div className="preset-groups">
              {Object.entries(filteredPresets).map(([group, presets]) => (
                <section className="preset-group" key={group}>
                  <h4>{group.replace('_', ' ')}</h4>
                  <div className="preset-grid">
                    {presets.map((preset) => (
                      <button
                        type="button"
                        key={`${group}-${preset.name}`}
                        onClick={() => {
                          mutate({ width: preset.width, height: preset.height });
                          setShowPresetModal(false);
                        }}
                      >
                        {preset.name}
                        <small>
                          {preset.width} × {preset.height}
                        </small>
                      </button>
                    ))}
                  </div>
                </section>
              ))}
            </div>
            <button id="close-modal-btn" type="button" onClick={() => setShowPresetModal(false)}>
              Close
            </button>
          </div>
        </div>
      )}

      {showArtisticModal && (
        <div className="modal" id="artistic-modal">
          <button
            type="button"
            className="modal-backdrop"
            aria-label="Close artistic modal"
            onClick={() => setShowArtisticModal(false)}
          />
          <div className="modal-panel" id="artistic-modal-content">
            <header>
              <h3>Artistic Themes</h3>
              <button id="close-artistic-modal" type="button" onClick={() => setShowArtisticModal(false)}>
                ✕
              </button>
            </header>

            <div className="modal-actions">
              <button
                type="button"
                onClick={() => {
                  setEditTheme(newCustomTheme());
                  setEditingThemeKey(null);
                  setShowThemeEditor(true);
                  setShowArtisticModal(false);
                }}
              >
                Create Theme
              </button>
              <button type="button" onClick={exportCustomThemes}>
                Export
              </button>
              <button type="button" onClick={clearCustomThemes}>
                Delete All Custom
              </button>
              <label className="file-btn" htmlFor="custom-theme-import-file">
                Import
                <input
                  id="custom-theme-import-file"
                  type="file"
                  accept="application/json"
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    if (!file) {
                      return;
                    }
                    await importCustomThemes(file);
                    e.currentTarget.value = '';
                  }}
                />
              </label>
            </div>

            <input
              placeholder="Search themes..."
              value={themeSearch}
              onChange={(e) => setThemeSearch(e.target.value)}
            />

            <div className="theme-list">
              {filteredThemes.map(([key, value]) => (
                <div key={key} className="theme-row">
                  <button
                    type="button"
                    className={app.artisticTheme === key ? 'active' : ''}
                    onClick={() => {
                      mutate({ artisticTheme: key });
                      setShowArtisticModal(false);
                    }}
                  >
                    <div className="swatches">
                      {[
                        { id: 'motorway', color: value.road_motorway },
                        { id: 'primary', color: value.road_primary },
                        { id: 'secondary', color: value.road_secondary },
                        { id: 'tertiary', color: value.road_tertiary },
                      ].map((swatch) => (
                        <span
                          key={`${key}-${swatch.id}-${swatch.color}`}
                          style={{ background: swatch.color }}
                          aria-hidden="true"
                        />
                      ))}
                    </div>
                    <div className="theme-meta">
                      {value.name}
                      <small>{value.description}</small>
                    </div>
                  </button>
                  {key.startsWith('custom_') && (
                    <button
                      type="button"
                      className="icon-btn"
                      onClick={() => {
                        setEditingThemeKey(key);
                        setEditTheme(value);
                        setShowThemeEditor(true);
                        setShowArtisticModal(false);
                      }}
                    >
                      Edit
                    </button>
                  )}
                </div>
              ))}
            </div>
            <button
              id="close-artistic-modal-btn"
              type="button"
              onClick={() => setShowArtisticModal(false)}
            >
              Close
            </button>
          </div>
        </div>
      )}

      {showThemeEditor && (
        <div className="modal" id="custom-theme-modal">
          <button
            type="button"
            className="modal-backdrop"
            aria-label="Close theme editor"
            onClick={() => setShowThemeEditor(false)}
          />
          <div className="modal-panel">
            <header>
              <h3 id="custom-theme-modal-title">
                {editingThemeKey ? 'Edit Custom Theme' : 'Create Custom Theme'}
              </h3>
              <button id="close-custom-theme-modal" type="button" onClick={() => setShowThemeEditor(false)}>
                ✕
              </button>
            </header>

            <div className="editor-grid">
              <input
                id="ct-name"
                placeholder="Theme name"
                value={editTheme.name}
                onChange={(e) =>
                  setEditTheme((prev) => ({ ...prev, name: e.target.value }))
                }
              />
              <input
                id="ct-desc"
                placeholder="Description"
                value={editTheme.description}
                onChange={(e) =>
                  setEditTheme((prev) => ({ ...prev, description: e.target.value }))
                }
              />

              {CUSTOM_THEME_FIELDS.map((field) => (
                <div key={field.key}>
                  <label htmlFor={field.colorId}>{field.label}</label>
                  <div className="grid2">
                    <input
                      id={field.colorId}
                      type="color"
                      value={editTheme[field.key]}
                      onChange={(e) => updateThemeColor(field.key, e.target.value)}
                    />
                    <input
                      id={field.hexId}
                      value={editTheme[field.key]}
                      onChange={(e) => updateThemeHex(field.key, e.target.value)}
                    />
                  </div>
                </div>
              ))}
            </div>

            <div className="modal-actions">
              {editingThemeKey && (
                <button
                  id="custom-theme-delete-btn"
                  type="button"
                  className="danger"
                  onClick={deleteCustomTheme}
                >
                  Delete
                </button>
              )}
              <button id="custom-theme-cancel-btn" type="button" onClick={() => setShowThemeEditor(false)}>
                Cancel
              </button>
              <button id="custom-theme-save-btn" type="button" onClick={saveCustomTheme}>
                Save Theme
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
