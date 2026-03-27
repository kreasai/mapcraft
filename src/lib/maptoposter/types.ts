export type MarkerPoint = { lat: number; lon: number };

export type Theme = {
  name: string;
  tileUrl: string;
  tileUrlNoLabels: string;
  background: string;
  textColor: string;
  route: string;
};

export type ArtisticTheme = {
  name: string;
  description: string;
  bg: string;
  text: string;
  water: string;
  parks: string;
  road_motorway: string;
  road_primary: string;
  road_secondary: string;
  road_tertiary: string;
  road_residential: string;
  road_default: string;
  route: string;
  gradient_color?: string;
};

export type AppState = {
  city: string;
  cityOverride: string;
  country: string;
  countryOverride: string;
  cityFont: string;
  countryFont: string;
  coordsFont: string;
  lat: number;
  lon: number;
  zoom: number;
  theme: string;
  width: number;
  height: number;
  overlayBgType: 'none' | 'vignette' | 'radial';
  overlaySize: 'none' | 'small' | 'medium' | 'large';
  showLabels: boolean;
  renderMode: 'tile' | 'artistic';
  artisticTheme: string;
  matEnabled: boolean;
  matWidth: number;
  matShowBorder: boolean;
  matBorderWidth: number;
  matBorderOpacity: number;
  showMarker: boolean;
  markers: MarkerPoint[];
  markerIcon: 'pin' | 'circle' | 'heart' | 'star' | 'none';
  markerSize: number;
  showRoute: boolean;
  routeStartLat: number;
  routeStartLon: number;
  routeEndLat: number;
  routeEndLon: number;
  routeGeometry: [number, number][];
  routeViaPoints: MarkerPoint[];
  overlayX: number;
  overlayY: number;
  showCountry: boolean;
  showCoords: boolean;
};

export type OutputPreset = {
  name: string;
  width: number;
  height: number;
};
