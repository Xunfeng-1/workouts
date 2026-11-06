import './index.css';
import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { Activity } from '@/types';
import {
  useFilteredActivities,
  getAvailableYears,
  extractCountry,
  extractProvince,
  getActivityData,
} from '@/hooks/useActivities';
import { useTheme } from '@/hooks/useTheme';
import { useLocale } from '@/hooks/useLocale';
import { Header } from '@/components/Header';
import { StatsCards } from '@/components/StatsCards';
import { ContributionHeatmap } from '@/components/ContributionHeatmap';
import { ActivityLog } from '@/components/ActivityLog';
import { RouteMap } from '@/components/RouteMap';
import { CalendarWidget } from '@/components/CalendarWidget';
import { ProfileCard } from '@/components/ProfileCard';
import { PersonalBest } from '@/components/PersonalBest';
import { ChinaMap } from '@/components/ChinaMap';

const TracksPage = lazy(() =>
  import('@/components/TracksPage').then((module) => ({
    default: module.TracksPage,
  }))
);
const SummaryPage = lazy(() =>
  import('@/components/SummaryPage').then((module) => ({
    default: module.SummaryPage,
  }))
);

type Page = 'home' | 'tracks' | 'summary';
const pageFromPath = (): Page =>
  window.location.pathname
    .slice(import.meta.env.BASE_URL.length)
    .replace(/\/$/, '') === 'summary'
    ? 'summary'
    : window.location.pathname
          .slice(import.meta.env.BASE_URL.length)
          .replace(/\/$/, '') === 'tracks'
      ? 'tracks'
      : 'home';

function Dashboard() {
  const routeSectionRef = useRef<HTMLDivElement>(null);
  const activities = getActivityData() as Activity[];
  const { dark, toggle } = useTheme();
  const { t, locale } = useLocale();
  const [filter] = useState('all' as const);
  const [year, setYear] = useState<number | null>(null);
  const [selectedActivity, setSelectedActivity] = useState<Activity | null>(
    null
  );
  const [selectedProvince, setSelectedProvince] = useState<string | null>(null);
  const [selectedCountry, setSelectedCountry] = useState<string | null>(null);
  const [page, setPage] = useState<Page>(pageFromPath);

  useEffect(() => {
    const onPopState = () => setPage(pageFromPath());
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);
  const navigate = (next: Page) => {
    window.history.pushState(
      null,
      '',
      `${import.meta.env.BASE_URL}${next === 'home' ? '' : next}`
    );
    setPage(next);
    window.scrollTo({ top: 0, behavior: 'instant' });
  };

  const selectProvince = useCallback((province: string | null) => {
    setSelectedProvince(province);
    if (province) setSelectedCountry(null);
    setSelectedActivity(null);
  }, []);
  const selectCountry = useCallback((country: string | null) => {
    setSelectedCountry(country);
    if (country) setSelectedProvince(null);
    setSelectedActivity(null);
  }, []);

  const [currentYear] = useState(() => new Date().getFullYear());
  const years = useMemo(() => getAvailableYears(activities), [activities]);
  const filtered = useFilteredActivities(activities, filter, year);
  const heatmapYear = year ?? years[0] ?? currentYear;

  // Province or country filter for the route map. A selected run wins later.
  const placeFiltered = useMemo(() => {
    if (selectedProvince) {
      return filtered.filter(
        (activity) =>
          extractProvince(activity.location_country) === selectedProvince
      );
    }
    if (selectedCountry) {
      return filtered.filter(
        (activity) => extractCountry(activity.location_country) === selectedCountry
      );
    }
    return filtered;
  }, [filtered, selectedProvince, selectedCountry]);

  const selectActivity = useCallback(
    (activity: Activity | null) => {
      setSelectedActivity(activity);
      if (activity) {
        setSelectedProvince(null);
        setSelectedCountry(null);
        if (window.matchMedia('(max-width: 1023px)').matches) {
          requestAnimationFrame(() =>
            routeSectionRef.current?.scrollIntoView({
              block: 'start',
              behavior: window.matchMedia('(prefers-reduced-motion: reduce)')
                .matches
                ? 'instant'
                : 'smooth',
            })
          );
        }
        if (
          year !== null &&
          new Date(activity.start_date_local).getFullYear() !== year
        ) {
          setYear(new Date(activity.start_date_local).getFullYear());
        }
      }
    },
    [year]
  );

  return (
    <div
      className="dashboard min-h-screen bg-[var(--color-bg)]"
      data-filter={filter}
    >
      <Header
        dark={dark}
        toggleTheme={toggle}
        activities={activities}
        page={page}
        onNavigate={navigate}
      />

      <Suspense
        fallback={
          <main
            className="mx-auto flex min-h-[60vh] max-w-[1400px] items-center justify-center p-6 text-sm text-[var(--color-muted)]"
            role="status"
          >
            {t('loading')}
          </main>
        }
      >
        {page === 'summary' ? (
          <SummaryPage
            activities={activities}
            onSelectActivity={(activity) => {
              navigate('home');
              setYear(null);
              selectActivity(activity);
            }}
          />
        ) : page === 'tracks' ? (
          <TracksPage
            activities={activities}
            dark={dark}
            filter={filter}
            onSelectActivity={selectActivity}
            onBack={() => {
              navigate('home');
              window.scrollTo({ top: 0, behavior: 'instant' });
            }}
          />
        ) : (
          <main className="mx-auto max-w-[1400px] px-4 py-5 sm:px-6 sm:py-6">
            {activities.length === 0 && (
              <p className="mb-6 rounded-xl border border-[var(--color-border)] bg-[var(--color-card)] px-4 py-3 text-sm text-[var(--color-muted)]">
                {locale === 'zh'
                  ? '还没有运动记录。配置 Garmin 国际区同步后，数据会每天自动更新。'
                  : 'No workouts yet. After Garmin Connect (garmin.com) sync is configured, data updates daily.'}
              </p>
            )}
            <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-[1fr_360px] xl:grid-cols-[1fr_380px]">
              {/* Left column */}
              <div className="min-w-0 space-y-6 overflow-hidden">
                <StatsCards
                  activities={filtered}
                  allActivities={activities}
                  year={year}
                  filter={filter}
                  onSelectActivity={selectActivity}
                />
                <ContributionHeatmap
                  activities={activities}
                  year={heatmapYear}
                  filter={filter}
                  onSelectActivity={selectActivity}
                />
                <ActivityLog
                  activities={filtered}
                  years={years}
                  year={year}
                  setYear={(value) => {
                    setYear(value);
                    setSelectedActivity(null);
                    setSelectedProvince(null);
                    setSelectedCountry(null);
                  }}
                  selectedActivity={selectedActivity}
                  onSelectActivity={selectActivity}
                  filter={filter}
                />
              </div>

              {/* Right column */}
              <div className="flex min-w-0 flex-col gap-6 overflow-hidden">
                <ProfileCard activities={activities} filter={filter} />
                <ChinaMap
                  activities={filtered}
                  filter={filter}
                  selectedProvince={selectedProvince}
                  onSelectProvince={selectProvince}
                  selectedCountry={selectedCountry}
                  onSelectCountry={selectCountry}
                  onSelectActivity={selectActivity}
                />
                <div ref={routeSectionRef} className="scroll-mt-28">
                  <RouteMap
                    activities={placeFiltered}
                    allActivities={activities}
                    selectedActivity={selectedActivity}
                    dark={dark}
                    onClearSelection={() => setSelectedActivity(null)}
                  />
                </div>
                <PersonalBest
                  activities={activities}
                  onSelectActivity={selectActivity}
                />
                <CalendarWidget
                  key={year ?? 'all'}
                  selectedActivity={selectedActivity}
                  activities={filtered}
                  onSelectActivity={selectActivity}
                />
              </div>
            </div>
          </main>
        )}
      </Suspense>

      <footer className="border-t border-[var(--color-border)] py-6 text-center text-sm text-[var(--color-muted)]">
        <p>
          &copy; {currentYear}{' '}
          <a
            href="https://xunfeng-1.github.io"
            className="underline decoration-[var(--color-border)] underline-offset-2 hover:text-[var(--color-text)]"
          >
            Xunfeng 的运动
          </a>
        </p>
        <p className="mt-1">
          基于{' '}
          <a
            href="https://github.com/yihong0618/running_page"
            className="underline decoration-[var(--color-border)] underline-offset-2 hover:text-[var(--color-text)]"
            target="_blank"
            rel="noreferrer"
          >
            running_page
          </a>
          {' 与 '}
          <a
            href="https://github.com/zhaohongxuan/workouts"
            className="underline decoration-[var(--color-border)] underline-offset-2 hover:text-[var(--color-text)]"
            target="_blank"
            rel="noreferrer"
          >
            workouts
          </a>
          （MIT）
        </p>
      </footer>
    </div>
  );
}

export default Dashboard;
