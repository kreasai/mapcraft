export type SearchResult = {
  name: string;
  shortName: string;
  country: string;
  lat: number;
  lon: number;
};

type NominatimResult = {
  display_name: string;
  name?: string;
  lat: string;
  lon: string;
  address?: {
    country?: string;
  };
};

export async function searchLocation(
  query: string,
  signal?: AbortSignal,
): Promise<SearchResult[]> {
  if (query.length < 2) {
    return [];
  }

  try {
    const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(
      query,
    )}&limit=15&addressdetails=1`;
    const res = await fetch(url, {
      signal,
      headers: { Accept: 'application/json' },
    });
    const data = (await res.json()) as NominatimResult[];

    return data.map((d) => ({
      name: d.display_name,
      shortName: d.name || d.display_name.split(',')[0] || d.display_name,
      country: d.address?.country ?? '',
      lat: Number.parseFloat(d.lat),
      lon: Number.parseFloat(d.lon),
    }));
  } catch {
    return [];
  }
}
