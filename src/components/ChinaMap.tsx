import { memo, useEffect, useMemo, useState } from 'react';
import type { Activity, SportFilter } from '../types';
import { useLocale } from '../hooks/useLocale';
import { extractCountry, extractProvince } from '../hooks/useActivities';

interface ChinaMapProps {
  activities: Activity[];
  filter: SportFilter;
  onSelectProvince?: (province: string | null) => void;
  selectedProvince?: string | null;
  onSelectCountry?: (country: string | null) => void;
  selectedCountry?: string | null;
  onSelectActivity?: (activity: Activity) => void;
}

type GeoFeature = {
  type: 'Feature';
  properties: { name: string; adcode: number };
  geometry: {
    type: 'Polygon' | 'MultiPolygon';
    coordinates: number[][][][];
  };
};

// Simple equirectangular projection bounded to China
const BOUNDS = { minLng: 73, maxLng: 136, minLat: 15, maxLat: 54 };

function project(
  lng: number,
  lat: number,
  w: number,
  h: number
): [number, number] {
  const x = ((lng - BOUNDS.minLng) / (BOUNDS.maxLng - BOUNDS.minLng)) * w;
  const y = h - ((lat - BOUNDS.minLat) / (BOUNDS.maxLat - BOUNDS.minLat)) * h;
  return [x, y];
}

function ringToPath(ring: number[][], w: number, h: number): string {
  return (
    ring
      .map(([lng, lat], i) => {
        const [x, y] = project(lng, lat, w, h);
        return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(' ') + ' Z'
  );
}

function featureToPath(feature: GeoFeature, w: number, h: number): string {
  const { type, coordinates } = feature.geometry;
  if (type === 'Polygon') {
    return (coordinates as unknown as number[][][])
      .map((r) => ringToPath(r, w, h))
      .join(' ');
  }
  // MultiPolygon
  return (coordinates as unknown as number[][][][])
    .flatMap((poly) => poly.map((r) => ringToPath(r, w, h)))
    .join(' ');
}

export const ChinaMap = memo(function ChinaMap({
  activities,
  filter,
  onSelectProvince,
  selectedProvince,
  onSelectCountry,
  selectedCountry,
  onSelectActivity,
}: ChinaMapProps) {
  const { locale } = useLocale();
  const [hoveredProvince, setHoveredProvince] = useState<string | null>(null);
  const [features, setFeatures] = useState<GeoFeature[]>([]);

  const SVG_W = 260;
  const SVG_H = 190;

  // Lazy-load GeoJSON to keep initial bundle small
  useEffect(() => {
    import('../assets/china-provinces.json').then((mod) => {
      setFeatures((mod.default as { features: GeoFeature[] }).features);
    });
  }, []);

  const paths = useMemo(
    () =>
      features.map((feature) => ({
        ...feature.properties,
        path: featureToPath(feature, SVG_W, SVG_H),
      })),
    [features]
  );

  // Build province → activity count map
  const provinceCount = useMemo(() => {
    const map = new Map<string, number>();
    for (const a of activities) {
      const p = extractProvince(a.location_country);
      if (p) map.set(p, (map.get(p) ?? 0) + 1);
    }
    return map;
  }, [activities]);

  const countryCount = useMemo(() => {
    const map = new Map<string, number>();
    for (const activity of activities) {
      const country = extractCountry(activity.location_country);
      if (!country) continue;
      map.set(country, (map.get(country) ?? 0) + 1);
    }
    return [...map.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'zh'));
  }, [activities]);

  const countryActivities = useMemo(() => {
    if (!selectedCountry) return [];
    return activities
      .filter((activity) => extractCountry(activity.location_country) === selectedCountry)
      .sort(
        (a, b) =>
          new Date(b.start_date_local).getTime() -
          new Date(a.start_date_local).getTime()
      );
  }, [activities, selectedCountry]);

  const visitedCount = provinceCount.size;
  const displayProvince = hoveredProvince ?? selectedProvince;
  const displayCount = displayProvince
    ? (provinceCount.get(displayProvince) ?? 0)
    : 0;

  function handleClick(name: string) {
    if (!onSelectProvince) return;
    const visited = (provinceCount.get(name) ?? 0) > 0;
    if (!visited) return;
    onSelectProvince(selectedProvince === name ? null : name);
  }

  return (
    <div
      role="region"
      aria-label={locale === 'zh' ? '足迹地图' : 'Footprint map'}
      className="rounded-xl border border-[var(--color-border)] bg-[var(--color-card)] p-5"
    >
      {/* Header */}
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-base font-semibold">
          {locale === 'zh' ? '足迹' : 'Footprint'}
        </h2>
        <div className="flex items-center gap-2 text-xs text-[var(--color-muted)]">
          {selectedProvince ? (
            <button
              onClick={() => onSelectProvince?.(null)}
              className="flex items-center gap-1 text-[var(--color-accent)] transition-opacity hover:opacity-70"
            >
              <svg
                className="h-3 w-3"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2.5}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
              {locale === 'zh' ? '清除筛选' : 'Clear'}
            </button>
          ) : (
            <>
              <span className="font-mono font-bold text-[var(--color-accent)]">
                {visitedCount}
              </span>
              <span>
                / {features.length || 35}{' '}
                {locale === 'zh' ? '省份' : 'provinces'}
              </span>
            </>
          )}
        </div>
      </div>

      {countryCount.length > 0 && (
        <div className="mb-3">
          <p className="mb-1.5 text-xs text-[var(--color-muted)]">
            {locale === 'zh' ? '国家与地区' : 'Countries'}
          </p>
          <div className="flex flex-wrap gap-1.5">
            {countryCount.map(([country, count]) => {
              const selected = selectedCountry === country;
              return (
                <button
                  key={country}
                  type="button"
                  aria-pressed={selected}
                  onClick={() =>
                    onSelectCountry?.(selected ? null : country)
                  }
                  className={`rounded-full px-2.5 py-1 text-xs ${
                    selected
                      ? 'bg-[var(--color-accent)] text-[var(--color-on-accent)]'
                      : 'bg-[var(--color-border)] text-[var(--color-text)] hover:bg-[var(--color-accent)]/20'
                  }`}
                >
                  {country} {count}
                </button>
              );
            })}
          </div>
          {selectedCountry && (
            <ul className="mt-2 max-h-36 space-y-1 overflow-y-auto">
              {countryActivities.map((activity) => (
                <li key={activity.run_id}>
                  <button
                    type="button"
                    onClick={() => onSelectActivity?.(activity)}
                    className="w-full truncate rounded px-1 py-0.5 text-left text-xs text-[var(--color-muted)] hover:bg-[var(--color-border)] hover:text-[var(--color-text)]"
                  >
                    {activity.start_date_local.slice(0, 10)} · {activity.name}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <p className="mb-1.5 text-xs text-[var(--color-muted)]">
        {locale === 'zh' ? '中国省份' : 'China provinces'}
      </p>

      {/* SVG Map — aspect-ratio wrapper prevents stretching */}
      <div className="relative" style={{ aspectRatio: `${SVG_W} / ${SVG_H}` }}>
        <svg
          key={filter}
          role="group"
          aria-label={
            locale === 'zh' ? '按省份筛选路线' : 'Filter routes by province'
          }
          viewBox={`0 0 ${SVG_W} ${SVG_H}`}
          preserveAspectRatio="xMidYMid meet"
          width="100%"
          height="100%"
          style={{ display: 'block', position: 'absolute', inset: 0 }}
        >
          {paths.map((feature) => {
            const name = feature.name;
            const count = provinceCount.get(name) ?? 0;
            const visited = count > 0;
            const isHovered = hoveredProvince === name;
            const isSelected = selectedProvince === name;

            let fill: string;
            if (visited) {
              if (isSelected) {
                fill = 'var(--color-accent)';
              } else if (isHovered) {
                fill =
                  'color-mix(in srgb, var(--color-accent) 80%, transparent)';
              } else if (selectedProvince) {
                // dim other provinces when one is selected
                fill =
                  'color-mix(in srgb, var(--color-accent) 25%, transparent)';
              } else {
                fill =
                  'color-mix(in srgb, var(--color-accent) 55%, transparent)';
              }
            } else {
              fill = 'var(--color-border)';
            }

            return (
              <path
                key={feature.adcode}
                d={feature.path}
                fill={fill}
                stroke="var(--color-bg)"
                strokeWidth="0.5"
                className={`transition-all duration-150 ${visited ? 'cursor-pointer focus:outline-2 focus:outline-[var(--color-accent)]' : 'cursor-default'}`}
                onMouseEnter={() => setHoveredProvince(name)}
                onMouseLeave={() => setHoveredProvince(null)}
                role={visited && onSelectProvince ? 'button' : undefined}
                tabIndex={visited && onSelectProvince ? 0 : undefined}
                aria-label={`${name} · ${count} ${locale === 'zh' ? '次活动' : 'activities'}`}
                aria-pressed={
                  visited && onSelectProvince ? isSelected : undefined
                }
                onFocus={() => setHoveredProvince(name)}
                onBlur={() => setHoveredProvince(null)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    handleClick(name);
                  }
                }}
                onClick={() => handleClick(name)}
              />
            );
          })}
        </svg>
      </div>

      {/* Tooltip */}
      <div className="mt-1.5 h-4 text-xs text-[var(--color-muted)]">
        {displayProvince && (
          <>
            <span className="font-medium text-[var(--color-text)]">
              {displayProvince}
            </span>
            {displayCount > 0 && (
              <span className="ml-1.5">
                {displayCount} {locale === 'zh' ? '次' : 'activities'}
              </span>
            )}
            {selectedProvince === displayProvince && !hoveredProvince && (
              <span className="ml-1.5 text-[var(--color-accent)]">
                {locale === 'zh' ? '（已筛选）' : '(filtered)'}
              </span>
            )}
          </>
        )}
      </div>
    </div>
  );
});
