import type { AppState } from './types';

export const SETTINGS_KEY = 'map-to-poster:settings';
export const CUSTOM_THEMES_KEY = 'map-to-poster:custom-themes';

export const DEFAULT_STATE: AppState = {
  city: 'JAKARTA',
  cityOverride: '',
  country: 'INDONESIA',
  countryOverride: '',
  cityFont: "'Playfair Display', serif",
  countryFont: "'Outfit', sans-serif",
  coordsFont: "'Outfit', sans-serif",
  lat: -6.2088,
  lon: 106.8456,
  zoom: 12,
  theme: 'minimal',
  width: 1080,
  height: 1080,
  overlayBgType: 'vignette',
  overlaySize: 'medium',
  showLabels: true,
  renderMode: 'tile',
  artisticTheme: 'cyber_noir',
  matEnabled: false,
  matWidth: 40,
  matShowBorder: true,
  matBorderWidth: 1,
  matBorderOpacity: 1,
  showMarker: false,
  markers: [{ lat: -6.2088, lon: 106.8456 }],
  markerIcon: 'pin',
  markerSize: 1,
  showRoute: false,
  routeStartLat: -6.2088,
  routeStartLon: 106.8456,
  routeEndLat: -6.215,
  routeEndLon: 106.855,
  routeGeometry: [],
  routeViaPoints: [],
  overlayX: 0.5,
  overlayY: 0.85,
  showCountry: true,
  showCoords: true,
};

export const CITY_FONTS = [
  'Bebas Neue',
  'Caveat',
  'Cormorant Garamond',
  'Dancing Script',
  'Inter',
  'Lora',
  'Merriweather',
  'Montserrat',
  'Outfit',
  'Playfair Display',
  'Raleway',
  'sans-serif',
  'serif',
];

export const COUNTRY_FONTS = [
  "'Outfit', sans-serif",
  "'Inter', sans-serif",
  "'Playfair Display', serif",
  "'Montserrat', sans-serif",
  "'Open Sans', sans-serif",
  'sans-serif',
];

export const COORDS_FONTS = [
  "'Outfit', sans-serif",
  "'Source Code Pro', monospace",
  "'Roboto', sans-serif",
  'monospace',
  'sans-serif',
];
