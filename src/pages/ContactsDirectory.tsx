import { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '../components/ui/Tabs';
import { CompaniesTab } from '../components/annuaire/CompaniesTab';
import { ContactsTab } from '../components/annuaire/ContactsTab';
import {
  fetchCompanies,
  fetchContacts,
  fetchClientsAsCompanies,
  mergeCompaniesWithClients,
  type CompanyWithContacts,
  type ContactWithCompanies,
} from '../lib/contactsDirectoryService';
import { Building2, Users, BookUser } from 'lucide-react';

export function ContactsDirectory() {
  const { profile } = useAuth();
  const { showToast } = useToast();
  const [searchParams, setSearchParams] = useSearchParams();
  const [companies, setCompanies] = useState<CompanyWithContacts[]>([]);
  const [contacts, setContacts] = useState<ContactWithCompanies[]>([]);
  const [loading, setLoading] = useState(true);

  const activeTab = searchParams.get('tab') === 'contacts' ? 'contacts' : 'companies';
  const highlightId = searchParams.get('highlight') || undefined;

  const handleTabChange = (value: string) => {
    const next = new URLSearchParams(searchParams);
    next.set('tab', value);
    next.delete('highlight');
    setSearchParams(next, { replace: true });
  };

  const loadData = useCallback(async () => {
    if (!profile) return;
    try {
      setLoading(true);
      const [companiesData, contactsData, clientsData] = await Promise.all([
        fetchCompanies(),
        fetchContacts(),
        fetchClientsAsCompanies(),
      ]);
      setCompanies(mergeCompaniesWithClients(companiesData, clientsData));
      setContacts(contactsData);
    } catch {
      showToast('Erreur lors du chargement de l\'annuaire', 'error');
    } finally {
      setLoading(false);
    }
  }, [profile, showToast]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-teal-50 dark:bg-teal-950">
          <BookUser className="w-5 h-5 text-teal-600 dark:text-teal-400" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
            Annuaire
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            {companies.length} societe{companies.length !== 1 ? 's' : ''} &middot; {contacts.length} contact{contacts.length !== 1 ? 's' : ''}
          </p>
        </div>
      </div>

      <Tabs defaultValue="companies" value={activeTab} onValueChange={handleTabChange}>
        <TabsList aria-label="Type de contacts">
          <TabsTrigger value="companies">
            <span className="flex items-center gap-2">
              <Building2 className="w-4 h-4" />
              Societes
              <span className="ml-1 px-2 py-0.5 text-xs rounded-full bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400">
                {companies.length}
              </span>
            </span>
          </TabsTrigger>
          <TabsTrigger value="contacts">
            <span className="flex items-center gap-2">
              <Users className="w-4 h-4" />
              Contacts
              <span className="ml-1 px-2 py-0.5 text-xs rounded-full bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400">
                {contacts.length}
              </span>
            </span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="companies" className="mt-6">
          <CompaniesTab
            companies={companies}
            contacts={contacts}
            loading={loading}
            onRefresh={loadData}
            highlightId={highlightId}
          />
        </TabsContent>

        <TabsContent value="contacts" className="mt-6">
          <ContactsTab
            contacts={contacts}
            companies={companies}
            loading={loading}
            onRefresh={loadData}
            highlightId={highlightId}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}

export default ContactsDirectory;
