import { useEffect, useState, useMemo } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { PageSkeleton } from '../components/ui/PageSkeleton';
import { PageError } from '../components/ui/PageError';
import { NoCabinetState } from '../components/ui/NoCabinetState';
import { Building, ClipboardList } from 'lucide-react';
import { loadDashboardData, type DashboardData } from '../lib/dashboardService';
import { DashboardKPIStrip } from '../components/dashboard/DashboardKPIStrip';
import { DashboardAlerts } from '../components/dashboard/DashboardAlerts';
import { DashboardBilanProgress } from '../components/dashboard/DashboardBilanProgress';
import { DashboardDeadlines } from '../components/dashboard/DashboardDeadlines';
import { DashboardClientOverview } from '../components/dashboard/DashboardClientOverview';
import { DashboardActivityFeed } from '../components/dashboard/DashboardActivityFeed';
import { DashboardSearch } from '../components/dashboard/DashboardSearch';
import { DashboardTopCities } from '../components/dashboard/DashboardTopCities';
import { DashboardRecentCompanies } from '../components/dashboard/DashboardRecentCompanies';
import { SpeedDialFAB } from '../components/ui/SpeedDialFAB';
import { ClientCreateModal } from '../components/clients/ClientCreateModal';
import { DashboardMeetingNoteModal } from '../components/clients/DashboardMeetingNoteModal';

function formatTodayFR(): string {
  const now = new Date();
  return now.toLocaleDateString('fr-FR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

function buildSummary(data: DashboardData | null): string {
  if (!data) return '';
  const parts: string[] = [];
  const deadlinesThisWeek = data.deadlines.filter(d => {
    const diff = Math.ceil((d.date.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
    return diff >= 0 && diff <= 7;
  }).length;
  if (deadlinesThisWeek > 0) {
    parts.push(`${deadlinesThisWeek} echeance${deadlinesThisWeek > 1 ? 's' : ''} cette semaine`);
  }
  const totalBilans = data.bilanProgress.reduce((sum, b) => sum + b.total, 0);
  if (totalBilans > 0) {
    parts.push(`${totalBilans} bilan${totalBilans > 1 ? 's' : ''} en cours`);
  }
  if (data.alerts.length > 0) {
    parts.push(`${data.alerts.length} alerte${data.alerts.length > 1 ? 's' : ''}`);
  }
  if (parts.length === 0) {
    parts.push('Tout est en ordre');
  }
  return parts.join(' -- ');
}

export function Dashboard() {
  const { profile, user } = useAuth();
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [showClientModal, setShowClientModal] = useState(false);
  const [showMeetingNoteModal, setShowMeetingNoteModal] = useState(false);

  const speedDialActions = useMemo(() => [
    {
      id: 'new-client',
      label: 'Nouveau client',
      icon: Building,
      onClick: () => setShowClientModal(true),
    },
    {
      id: 'new-meeting-note',
      label: 'Nouveau compte-rendu',
      icon: ClipboardList,
      onClick: () => setShowMeetingNoteModal(true),
    },
  ], []);

  useEffect(() => {
    if (profile && user?.id) {
      setLoading(true);
      loadDashboardData(user.id)
        .then(setData)
        .catch(() => setData(null))
        .finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, [profile, user?.id]);

  if (loading) {
    return <PageSkeleton variant="dashboard" />;
  }

  if (!profile) {
    return (
      <div>
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
            {/* Cette branche est celle du profil ABSENT : `profile?.prenom` y
                vaut toujours undefined, et TypeScript le disait en reduisant le
                type a `never`. Le salut est donc rendu tel qu'il s'affichait. */}
            Bonjour Utilisateur !
          </h1>
        </div>
        <NoCabinetState />
      </div>
    );
  }

  if (!data) {
    return (
      <PageError
        onRetry={() => {
          if (profile && user?.id) {
            setLoading(true);
            loadDashboardData(user.id)
              .then(setData)
              .catch(() => setData(null))
              .finally(() => setLoading(false));
          }
        }}
      />
    );
  }

  const todayStr = formatTodayFR();
  const summary = buildSummary(data);

  return (
    <div className="space-y-6 relative">
      <div className="absolute inset-0 -m-6 pointer-events-none overflow-hidden">
        <div
          className="absolute inset-0 bg-cover bg-center bg-no-repeat opacity-[0.07] dark:opacity-[0.05]"
          style={{ backgroundImage: "url('/background.webp')" }}
        />
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-gray-50/80 to-gray-50 dark:via-gray-950/80 dark:to-gray-950" />
      </div>
      <div className="relative">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
          Bonjour {profile?.prenom} !
        </h1>
        <div className="flex flex-col sm:flex-row sm:items-center sm:gap-3 mt-1">
          <p className="text-sm text-gray-500 dark:text-gray-400 capitalize">
            {todayStr}
          </p>
          {!loading && summary && (
            <>
              <span className="hidden sm:inline text-gray-300 dark:text-gray-600">|</span>
              <p className="text-sm font-medium text-gray-600 dark:text-gray-300">
                {summary}
              </p>
            </>
          )}
        </div>
      </div>

      <div className="relative">
        {profile && (
          <DashboardSearch />
        )}
      </div>

      <div className="relative">
        <DashboardKPIStrip
          loading={loading}
          userId={user?.id || ''}
          data={{
            clientsActifs: data?.clientStatusCounts.actif || 0,
            bilansEnCours: data?.bilanProgress.reduce((s, b) => s + b.total, 0) || 0,
            assemblesPlanifiees: data?.assemblesPlanifiees || 0,
            echeancesProches: data?.deadlines.filter(d => {
              const diff = Math.ceil((d.date.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
              return diff >= 0 && diff <= 30;
            }).length || 0,
            habilitationsActives: data?.habilitationsActives || 0,
            legalActsRecent: data?.legalActsRecent || 0,
            tasksEnCours: data?.tasksEnCours || 0,
            opportunitesEnCours: data?.opportunitesEnCours || 0,
          }}
        />
      </div>


      <div className="relative">
        <DashboardAlerts alerts={data?.alerts || []} loading={loading} />
      </div>

      <div className="relative grid grid-cols-1 lg:grid-cols-2 gap-6">
        <DashboardTopCities cities={data?.topCities || []} loading={loading} />
        <DashboardRecentCompanies companies={data?.recentCompanies || []} loading={loading} />
      </div>

      <div className="relative grid grid-cols-1 lg:grid-cols-5 gap-6">
        <div className="lg:col-span-3 space-y-6">
          <DashboardBilanProgress data={data?.bilanProgress || []} loading={loading} />
          <DashboardDeadlines deadlines={data?.deadlines || []} loading={loading} />
        </div>

        <div className="lg:col-span-2 space-y-6">
          <DashboardClientOverview
            statusCounts={data?.clientStatusCounts || { actif: 0, inactif: 0, prospect: 0, archive: 0 }}
            regimeFiscalCounts={data?.regimeFiscalCounts || []}
            formeJuridiqueCounts={data?.formeJuridiqueCounts || []}
            loading={loading}
          />
          <DashboardActivityFeed activities={data?.recentActivity || []} loading={loading} />
        </div>
      </div>

      {profile && (
        <>
          <SpeedDialFAB actions={speedDialActions} />

          <ClientCreateModal
            isOpen={showClientModal}
            onClose={() => setShowClientModal(false)}
            onCreated={() => {
              if (profile && user?.id) {
                loadDashboardData(user.id)
                  .then(setData)
                  .catch(() => {});
              }
            }}
          />

          <DashboardMeetingNoteModal
            isOpen={showMeetingNoteModal}
            onClose={() => setShowMeetingNoteModal(false)}
            onCreated={() => {}}
          />
        </>
      )}
    </div>
  );
}
