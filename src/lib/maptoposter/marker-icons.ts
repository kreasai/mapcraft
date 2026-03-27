import type { AppState } from './types';

export const MARKER_ICONS: Record<AppState['markerIcon'], string> = {
  pin: '<svg width="100" height="100" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5A2.5 2.5 0 1 1 12 6.5a2.5 2.5 0 0 1 0 5z"/></svg>',
  circle:
    '<svg width="100" height="100" viewBox="0 0 24 24" fill="currentColor"><path d="M12 4a8 8 0 1 0 0 16 8 8 0 0 0 0-16zm0 5a3 3 0 1 1 0 6 3 3 0 0 1 0-6z"/></svg>',
  heart:
    '<svg width="100" height="100" viewBox="0 0 24 24" fill="currentColor"><path d="M12 21.35 10.55 20C5.4 15.36 2 12.28 2 8.5A5.5 5.5 0 0 1 7.5 3c1.74 0 3.41.81 4.5 2.08A5.98 5.98 0 0 1 16.5 3 5.5 5.5 0 0 1 22 8.5c0 3.78-3.4 6.86-8.55 11.5z"/></svg>',
  star: '<svg width="100" height="100" viewBox="0 0 24 24" fill="currentColor"><path d="m12 2 2.81 6.63 7.19.61-5.46 4.73L18.18 21 12 17.27 5.82 21l1.64-7.03L2 9.24l7.19-.61z"/></svg>',
  none: '<svg width="100" height="100" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="12" r="2"/></svg>',
};
