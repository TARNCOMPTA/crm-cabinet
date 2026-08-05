import { supabase } from './supabase';

export interface DirectoryCompany {
  id: string;
  name: string;
  siren: string;
  siret: string;
  legal_form: string;
  address: string;
  postal_code: string;
  city: string;
  phone: string;
  email: string;
  website: string;
  notes: string;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface DirectoryContact {
  id: string;
  first_name: string;
  last_name: string;
  role: string;
  phone: string;
  mobile: string;
  email: string;
  notes: string;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface DirectoryContactCompany {
  id: string;
  contact_id: string;
  company_id: string;
  role_in_company: string;
  is_primary_contact: boolean;
  created_at: string;
}

export interface CompanyWithContacts extends DirectoryCompany {
  directory_contact_companies: Array<
    DirectoryContactCompany & {
      directory_contacts: DirectoryContact;
    }
  >;
}

export interface ContactWithCompanies extends DirectoryContact {
  directory_contact_companies: Array<
    DirectoryContactCompany & {
      directory_companies: DirectoryCompany;
    }
  >;
}

export async function fetchCompanies(): Promise<CompanyWithContacts[]> {
  const { data, error } = await supabase
    .from('directory_companies')
    .select(`
      *,
      directory_contact_companies(
        *,
        directory_contacts(*)
      )
    `)
    .order('name');

  if (error) throw error;
  return (data || []) as CompanyWithContacts[];
}

export async function fetchContacts(): Promise<ContactWithCompanies[]> {
  const { data, error } = await supabase
    .from('directory_contacts')
    .select(`
      *,
      directory_contact_companies(
        *,
        directory_companies(*)
      )
    `)
    .order('last_name');

  if (error) throw error;
  return (data || []) as ContactWithCompanies[];
}

export async function createCompany(
  userId: string,
  data: Partial<DirectoryCompany>
): Promise<DirectoryCompany> {
  const { data: company, error } = await supabase
    .from('directory_companies')
    .insert({
      created_by: userId,
      name: data.name || '',
      siren: data.siren || '',
      siret: data.siret || '',
      legal_form: data.legal_form || '',
      address: data.address || '',
      postal_code: data.postal_code || '',
      city: data.city || '',
      phone: data.phone || '',
      email: data.email || '',
      website: data.website || '',
      notes: data.notes || '',
    })
    .select()
    .single();

  if (error) throw error;
  return company as DirectoryCompany;
}

export async function updateCompany(
  id: string,
  data: Partial<DirectoryCompany>
): Promise<void> {
  const { error } = await supabase
    .from('directory_companies')
    .update({
      name: data.name,
      siren: data.siren,
      siret: data.siret,
      legal_form: data.legal_form,
      address: data.address,
      postal_code: data.postal_code,
      city: data.city,
      phone: data.phone,
      email: data.email,
      website: data.website,
      notes: data.notes,
    })
    .eq('id', id);

  if (error) throw error;
}

export async function deleteCompany(id: string): Promise<void> {
  const { error } = await supabase
    .from('directory_companies')
    .delete()
    .eq('id', id);

  if (error) throw error;
}

export async function createContact(
  userId: string,
  data: Partial<DirectoryContact>
): Promise<DirectoryContact> {
  const { data: contact, error } = await supabase
    .from('directory_contacts')
    .insert({
      created_by: userId,
      first_name: data.first_name || '',
      last_name: data.last_name || '',
      role: data.role || '',
      phone: data.phone || '',
      mobile: data.mobile || '',
      email: data.email || '',
      notes: data.notes || '',
    })
    .select()
    .single();

  if (error) throw error;
  return contact as DirectoryContact;
}

export async function updateContact(
  id: string,
  data: Partial<DirectoryContact>
): Promise<void> {
  const { error } = await supabase
    .from('directory_contacts')
    .update({
      first_name: data.first_name,
      last_name: data.last_name,
      role: data.role,
      phone: data.phone,
      mobile: data.mobile,
      email: data.email,
      notes: data.notes,
    })
    .eq('id', id);

  if (error) throw error;
}

export async function deleteContact(id: string): Promise<void> {
  const { error } = await supabase
    .from('directory_contacts')
    .delete()
    .eq('id', id);

  if (error) throw error;
}

export async function linkContactToCompany(
  contactId: string,
  companyId: string,
  roleInCompany: string,
  isPrimary: boolean
): Promise<void> {
  if (isPrimary) {
    await supabase
      .from('directory_contact_companies')
      .update({ is_primary_contact: false })
      .eq('company_id', companyId)
      .eq('is_primary_contact', true);
  }

  const { error } = await supabase
    .from('directory_contact_companies')
    .insert({
      contact_id: contactId,
      company_id: companyId,
      role_in_company: roleInCompany,
      is_primary_contact: isPrimary,
    });

  if (error) throw error;
}

export async function unlinkContactFromCompany(linkId: string): Promise<void> {
  const { error } = await supabase
    .from('directory_contact_companies')
    .delete()
    .eq('id', linkId);

  if (error) throw error;
}

export async function setPrimaryContact(
  linkId: string,
  companyId: string
): Promise<void> {
  await supabase
    .from('directory_contact_companies')
    .update({ is_primary_contact: false })
    .eq('company_id', companyId)
    .eq('is_primary_contact', true);

  const { error } = await supabase
    .from('directory_contact_companies')
    .update({ is_primary_contact: true })
    .eq('id', linkId);

  if (error) throw error;
}

export async function removePrimaryContact(linkId: string): Promise<void> {
  const { error } = await supabase
    .from('directory_contact_companies')
    .update({ is_primary_contact: false })
    .eq('id', linkId);

  if (error) throw error;
}

export interface ClientAsCompany extends CompanyWithContacts {
  _isClient: true;
  _clientId: string;
  _contactPrincipal: string | null;
  _dirigeant: string | null;
  _numeroDossier: string | null;
}

export async function fetchClientsAsCompanies(): Promise<ClientAsCompany[]> {
  const { data, error } = await supabase
    .from('clients')
    .select('id, nom_entreprise, siren, siret, forme_juridique, adresse_ligne1, code_postal, ville, email, telephone, contact_principal, dirigeant, numero_dossier')
    .order('nom_entreprise');

  if (error) throw error;

  return (data || []).map((client) => {
    return {
      id: `client_${client.id}`,
      name: client.nom_entreprise || '',
      siren: client.siren || '',
      siret: client.siret || '',
      legal_form: client.forme_juridique || '',
      // Correspondance DIRECTE : `directory_companies` porte deja
      // `address`/`postal_code`/`city`, et `clients` les porte desormais aussi.
      // Il n'y a plus rien a redecouper.
      address: client.adresse_ligne1 || '',
      postal_code: client.code_postal || '',
      city: client.ville || '',
      phone: client.telephone || '',
      email: client.email || '',
      website: '',
      notes: '',
      created_by: null,
      created_at: '',
      updated_at: '',
      directory_contact_companies: [],
      _isClient: true as const,
      _clientId: client.id,
      _contactPrincipal: client.contact_principal || null,
      _dirigeant: client.dirigeant || null,
      _numeroDossier: client.numero_dossier || null,
    };
  });
}

/*
 * `parseAddress` a ete supprimee ici.
 *
 * Elle faisait `adresse.split(',')` : une rue contenant une virgule — « ZAC des
 * Portes, rue Lavoisier, 81000 ALBI » — produisait trois morceaux dont deux
 * faux. C'etait l'un des cinq parseurs concurrents de la meme chaine, chacun
 * avec ses angles morts.
 *
 * `clients` porte desormais les composants, et `directory_companies` les portait
 * deja : la correspondance est directe. Ce qui reste de la connaissance des cinq
 * parseurs vit dans `src/lib/adresseHeritee.ts`, teste.
 */

export function mergeCompaniesWithClients(
  companies: CompanyWithContacts[],
  clients: ClientAsCompany[]
): CompanyWithContacts[] {
  const existingSirens = new Set<string>();
  const existingSirets = new Set<string>();
  for (const c of companies) {
    if (c.siren?.trim()) existingSirens.add(c.siren.trim());
    if (c.siret?.trim()) existingSirets.add(c.siret.trim());
  }

  const newClients = clients.filter((client) => {
    if (client.siret?.trim() && existingSirets.has(client.siret.trim())) return false;
    if (client.siren?.trim() && existingSirens.has(client.siren.trim())) return false;
    return true;
  });

  return [...companies, ...newClients].sort((a, b) =>
    a.name.localeCompare(b.name, 'fr', { sensitivity: 'base' })
  );
}

/**
 * Le garde n'inspecte que `_isClient` : il n'a pas besoin des contacts de la
 * societe. L'exiger en `CompanyWithContacts` fermait la porte aux fiches nues,
 * comme celles rapportees par la jointure des liaisons contact-societe.
 */
export function isClientCompany(company: DirectoryCompany): company is ClientAsCompany {
  return '_isClient' in company && (company as ClientAsCompany)._isClient === true;
}

export async function ensureDirectoryCompanyFromClient(
  client: ClientAsCompany,
  userId: string
): Promise<string> {
  if (client.siren?.trim()) {
    const { data: existing } = await supabase
      .from('directory_companies')
      .select('id')
      .eq('siren', client.siren.trim())
      .maybeSingle();
    if (existing) return existing.id;
  }

  if (client.siret?.trim()) {
    const { data: existing } = await supabase
      .from('directory_companies')
      .select('id')
      .eq('siret', client.siret.trim())
      .maybeSingle();
    if (existing) return existing.id;
  }

  const created = await createCompany(userId, {
    name: client.name,
    siren: client.siren,
    siret: client.siret,
    legal_form: client.legal_form,
    address: client.address,
    postal_code: client.postal_code,
    city: client.city,
    phone: client.phone,
    email: client.email,
  });
  return created.id;
}

export interface ClientDirectoryContactLink {
  linkId: string;
  contactId: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  mobile: string;
  roleInCompany: string;
  isPrimary: boolean;
}

export async function fetchContactsForClient(
  siren: string | null | undefined,
  siret: string | null | undefined
): Promise<{ companyId: string | null; contacts: ClientDirectoryContactLink[] }> {
  let company: { id: string } | null = null;

  if (siret?.trim()) {
    const { data } = await supabase
      .from('directory_companies')
      .select('id')
      .eq('siret', siret.trim())
      .maybeSingle();
    if (data) company = data;
  }

  if (!company && siren?.trim()) {
    const { data } = await supabase
      .from('directory_companies')
      .select('id')
      .eq('siren', siren.trim())
      .maybeSingle();
    if (data) company = data;
  }

  if (!company) {
    return { companyId: null, contacts: [] };
  }

  const { data: links, error } = await supabase
    .from('directory_contact_companies')
    .select(`
      id,
      contact_id,
      role_in_company,
      is_primary_contact,
      directory_contacts(id, first_name, last_name, email, phone, mobile)
    `)
    .eq('company_id', company.id);

  if (error) throw error;

  const contacts: ClientDirectoryContactLink[] = (links || []).map((l: any) => ({
    linkId: l.id,
    contactId: l.contact_id,
    firstName: l.directory_contacts?.first_name || '',
    lastName: l.directory_contacts?.last_name || '',
    email: l.directory_contacts?.email || '',
    phone: l.directory_contacts?.phone || '',
    mobile: l.directory_contacts?.mobile || '',
    roleInCompany: l.role_in_company || '',
    isPrimary: l.is_primary_contact,
  }));

  contacts.sort((a, b) => {
    if (a.isPrimary && !b.isPrimary) return -1;
    if (!a.isPrimary && b.isPrimary) return 1;
    return a.lastName.localeCompare(b.lastName, 'fr');
  });

  return { companyId: company.id, contacts };
}

export async function ensureDirectoryCompanyForClientData(
  userId: string,
  clientData: {
    nom_entreprise?: string | null;
    siren?: string | null;
    siret?: string | null;
    forme_juridique?: string | null;
    adresse_ligne1?: string | null;
    code_postal?: string | null;
    ville?: string | null;
    email?: string | null;
    telephone?: string | null;
  }
): Promise<string> {
  if (clientData.siret?.trim()) {
    const { data: existing } = await supabase
      .from('directory_companies')
      .select('id')
      .eq('siret', clientData.siret.trim())
      .maybeSingle();
    if (existing) return existing.id;
  }

  if (clientData.siren?.trim()) {
    const { data: existing } = await supabase
      .from('directory_companies')
      .select('id')
      .eq('siren', clientData.siren.trim())
      .maybeSingle();
    if (existing) return existing.id;
  }

  const created = await createCompany(userId, {
    name: clientData.nom_entreprise || '',
    siren: clientData.siren || '',
    siret: clientData.siret || '',
    legal_form: clientData.forme_juridique || '',
    address: clientData.adresse_ligne1 || '',
    postal_code: clientData.code_postal || '',
    city: clientData.ville || '',
    phone: clientData.telephone || '',
    email: clientData.email || '',
  });
  return created.id;
}

export async function searchCabinetClients(
  query: string
): Promise<Array<{
  id: string;
  nom_entreprise: string;
  siren: string | null;
  siret: string | null;
  forme_juridique: string | null;
  adresse: string | null;
  email: string | null;
  telephone: string | null;
  contact_principal: string | null;
}>> {
  const term = `%${query}%`;
  const { data, error } = await supabase
    .from('clients')
    .select('id, nom_entreprise, siren, siret, forme_juridique, adresse, email, telephone, contact_principal')
    .eq('statut', 'actif')
    .or(`nom_entreprise.ilike.${term},siren.ilike.${term},siret.ilike.${term}`)
    .order('nom_entreprise')
    .limit(10);

  if (error) throw error;
  return data || [];
}
