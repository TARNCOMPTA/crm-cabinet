import { Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import { ToastProvider } from './contexts/ToastContext';
import { ThemeProvider } from './contexts/ThemeContext';
import { UserPreferencesProvider } from './contexts/UserPreferencesContext';
import { SyncJobsProvider } from './contexts/SyncJobsContext';
import { ToastContainer } from './components/ui/Toast';
import { ErrorBoundary } from './components/ErrorBoundary';
import { ThemeSync } from './components/ThemeSync';
import { ProtectedRoute } from './components/ProtectedRoute';
import { DashboardLayout } from './components/layout/DashboardLayout';
import { PageSkeleton } from './components/ui/Skeleton';
import { lazyRetryNamed } from './lib/lazyRetry';

const LandingPage = lazyRetryNamed(() => import('./pages/landing/LandingPage'), 'LandingPage');

const Dashboard = lazyRetryNamed(() => import('./pages/Dashboard'), 'Dashboard');
const Clients = lazyRetryNamed(() => import('./pages/Clients'), 'Clients');
const ClientDetail = lazyRetryNamed(() => import('./pages/ClientDetail'), 'ClientDetail');
const Legal = lazyRetryNamed(() => import('./pages/Legal'), 'Legal');
const Tasks = lazyRetryNamed(() => import('./pages/Tasks'), 'Tasks');
const Software = lazyRetryNamed(() => import('./pages/Software'), 'Software');
const Settings = lazyRetryNamed(() => import('./pages/Settings'), 'Settings');
const TaxAuthorizations = lazyRetryNamed(() => import('./pages/TaxAuthorizations'), 'TaxAuthorizations');
const Exonerations = lazyRetryNamed(() => import('./pages/Exonerations'), 'Exonerations');
const WebDirectory = lazyRetryNamed(() => import('./pages/WebDirectory'), 'WebDirectory');
const BalanceSheets = lazyRetryNamed(() => import('./pages/BalanceSheets'), 'BalanceSheets');
const Outils = lazyRetryNamed(() => import('./pages/Outils'), 'Outils');
const ContactsDirectory = lazyRetryNamed(() => import('./pages/ContactsDirectory'), 'ContactsDirectory');
const Opportunities = lazyRetryNamed(() => import('./pages/Opportunities'), 'Opportunities');
const Relances = lazyRetryNamed(() => import('./pages/Relances'), 'Relances');
const Campagnes = lazyRetryNamed(() => import('./pages/Campagnes'), 'Campagnes');
const RevenueDeclarations = lazyRetryNamed(() => import('./pages/RevenueDeclarations'), 'RevenueDeclarations');
const SuiviEcheances = lazyRetryNamed(() => import('./pages/SuiviEcheances'), 'SuiviEcheances');
const Checklists = lazyRetryNamed(() => import('./pages/Checklists'), 'Checklists');
const NotFound = lazyRetryNamed(() => import('./pages/NotFound'), 'NotFound');


function App() {
  return (
    <ErrorBoundary>
    <ThemeProvider>
    <BrowserRouter>
      <AuthProvider>
      <UserPreferencesProvider>
        <ToastProvider>
          <SyncJobsProvider>
          <ThemeSync />
          <ToastContainer />
          <Suspense fallback={<PageSkeleton />}>
            <Routes>
              <Route path="/" element={<LandingPage />} />
              <Route path="/login" element={<Navigate to="/" replace />} />

              <Route element={<ProtectedRoute><DashboardLayout /></ProtectedRoute>}>
                <Route path="dashboard" element={<Dashboard />} />
                <Route path="clients" element={<Clients />} />
                <Route path="clients/:id" element={<ClientDetail />} />
                <Route path="opportunities" element={<Opportunities />} />
                <Route path="legal" element={<Legal />} />
                <Route path="tasks" element={<Tasks />} />
                <Route path="balance-sheets" element={<BalanceSheets />} />
                <Route path="relances" element={<Relances />} />
                <Route path="campagnes" element={<Campagnes />} />
                <Route path="revenue-declarations" element={<RevenueDeclarations />} />
                <Route path="suivi-echeances" element={<SuiviEcheances />} />
                <Route path="tax-authorizations" element={<TaxAuthorizations />} />
                <Route path="software" element={<Software />} />
                <Route path="exemptions" element={<Exonerations />} />
                <Route path="directory" element={<WebDirectory />} />
                <Route path="annuaire" element={<ContactsDirectory />} />
                <Route path="outils" element={<Outils />} />
                <Route path="checklists" element={<Checklists />} />
                <Route path="settings" element={<Settings />} />

                {/* French URL redirects */}
                <Route path="bilans" element={<Navigate to="/balance-sheets" replace />} />
                <Route path="mailings" element={<Navigate to="/campagnes" replace />} />
                <Route path="declarations-ca" element={<Navigate to="/revenue-declarations" replace />} />
                <Route path="autorisations-fiscales" element={<Navigate to="/tax-authorizations" replace />} />
                <Route path="exonerations" element={<Navigate to="/exemptions" replace />} />
                <Route path="logiciels" element={<Navigate to="/software" replace />} />
                <Route path="taches" element={<Navigate to="/tasks" replace />} />

                <Route path="*" element={<NotFound />} />
              </Route>
            </Routes>
          </Suspense>
          </SyncJobsProvider>
        </ToastProvider>
      </UserPreferencesProvider>
      </AuthProvider>
    </BrowserRouter>
    </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
