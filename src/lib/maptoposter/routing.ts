import type { MarkerPoint } from './types';

type OsrmResponse = {
  code?: string;
  routes?: Array<{
    geometry?: {
      coordinates?: [number, number][];
    };
  }>;
};

export async function fetchOsrmRoute(
  routeStartLat: number,
  routeStartLon: number,
  routeEndLat: number,
  routeEndLon: number,
  viaPoints: MarkerPoint[],
): Promise<[number, number][]> {
  const points = [
    [routeStartLat, routeStartLon],
    ...viaPoints.map((p) => [p.lat, p.lon] as [number, number]),
    [routeEndLat, routeEndLon],
  ];

  try {
    const coords = points.map((p) => `${p[1]},${p[0]}`).join(';');
    const url = `https://router.project-osrm.org/route/v1/driving/${coords}?overview=full&geometries=geojson`;
    const response = await fetch(url);
    const data = (await response.json()) as OsrmResponse;
    if (data.code === 'Ok' && data.routes?.[0]?.geometry?.coordinates) {
      return data.routes[0].geometry.coordinates;
    }
  } catch {
    return points.map((p) => [p[1], p[0]]);
  }

  return points.map((p) => [p[1], p[0]]);
}

function sqDistance(aLat: number, aLon: number, bLat: number, bLon: number): number {
  const dLat = aLat - bLat;
  const dLon = aLon - bLon;
  return dLat * dLat + dLon * dLon;
}

function pointToSegmentDistanceSq(
  pLat: number,
  pLon: number,
  aLat: number,
  aLon: number,
  bLat: number,
  bLon: number,
): number {
  const abLat = bLat - aLat;
  const abLon = bLon - aLon;
  const abLenSq = abLat * abLat + abLon * abLon;
  if (abLenSq === 0) {
    return sqDistance(pLat, pLon, aLat, aLon);
  }
  const apLat = pLat - aLat;
  const apLon = pLon - aLon;
  const t = Math.max(0, Math.min(1, (apLat * abLat + apLon * abLon) / abLenSq));
  const projLat = aLat + abLat * t;
  const projLon = aLon + abLon * t;
  return sqDistance(pLat, pLon, projLat, projLon);
}

export function bestViaInsertIndex(
  start: MarkerPoint,
  end: MarkerPoint,
  existingVia: MarkerPoint[],
  candidate: MarkerPoint,
): number {
  const chain = [start, ...existingVia, end];
  if (chain.length < 2) {
    return existingVia.length;
  }

  let bestSegment = 0;
  let bestDistance = Number.POSITIVE_INFINITY;

  for (let index = 0; index < chain.length - 1; index += 1) {
    const a = chain[index];
    const b = chain[index + 1];
    const distance = pointToSegmentDistanceSq(
      candidate.lat,
      candidate.lon,
      a.lat,
      a.lon,
      b.lat,
      b.lon,
    );
    if (distance < bestDistance) {
      bestDistance = distance;
      bestSegment = index;
    }
  }

  return Math.max(0, Math.min(existingVia.length, bestSegment));
}
