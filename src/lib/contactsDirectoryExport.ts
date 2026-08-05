import type { CompanyWithContacts, ContactWithCompanies } from './contactsDirectoryService';

async function loadXLSX() {
  const XLSX = await import('xlsx');
  return XLSX;
}

function sanitizeCellValue(value: string): string {
  if (!value) return value;
  const dangerous = ['=', '+', '-', '@', '\t', '\r'];
  if (dangerous.some(ch => value.startsWith(ch))) {
    return `'${value}`;
  }
  return value;
}

function getPrimaryContactName(company: CompanyWithContacts): string {
  const primary = company.directory_contact_companies?.find((l) => l.is_primary_contact);
  if (!primary) return '';
  const c = primary.directory_contacts;
  return `${c.first_name} ${c.last_name}`.trim();
}

export async function exportCompaniesToExcel(companies: CompanyWithContacts[]): Promise<void> {
  const XLSX = await loadXLSX();
  const wb = XLSX.utils.book_new();

  const header = [
    'Denomination',
    'Forme juridique',
    'SIREN',
    'SIRET',
    'Adresse',
    'Code postal',
    'Ville',
    'Telephone',
    'Email',
    'Site web',
    'Contact principal',
    'Notes',
  ];

  const rows = companies.map((c) => [
    sanitizeCellValue(c.name || ''),
    sanitizeCellValue(c.legal_form || ''),
    sanitizeCellValue(c.siren || ''),
    sanitizeCellValue(c.siret || ''),
    sanitizeCellValue(c.address || ''),
    sanitizeCellValue(c.postal_code || ''),
    sanitizeCellValue(c.city || ''),
    sanitizeCellValue(c.phone || ''),
    sanitizeCellValue(c.email || ''),
    sanitizeCellValue(c.website || ''),
    sanitizeCellValue(getPrimaryContactName(c)),
    sanitizeCellValue(c.notes || ''),
  ]);

  const ws = XLSX.utils.aoa_to_sheet([header, ...rows]);

  ws['!cols'] = [
    { wch: 30 },
    { wch: 15 },
    { wch: 12 },
    { wch: 16 },
    { wch: 30 },
    { wch: 8 },
    { wch: 18 },
    { wch: 16 },
    { wch: 25 },
    { wch: 25 },
    { wch: 25 },
    { wch: 30 },
  ];

  XLSX.utils.book_append_sheet(wb, ws, 'Societes');

  const timestamp = new Date().toISOString().split('T')[0];
  XLSX.writeFile(wb, `annuaire_societes_${timestamp}.xlsx`);
}

export async function exportContactsToExcel(contacts: ContactWithCompanies[]): Promise<void> {
  const XLSX = await loadXLSX();
  const wb = XLSX.utils.book_new();

  const header = [
    'Nom',
    'Prenom',
    'Fonction',
    'Telephone fixe',
    'Mobile',
    'Email',
    'Societes',
    'Notes',
  ];

  const rows = contacts.map((c) => {
    const companiesList = (c.directory_contact_companies || [])
      .map((link) => {
        const name = link.directory_companies?.name || '';
        const role = link.role_in_company ? ` (${link.role_in_company})` : '';
        return `${name}${role}`;
      })
      .join(', ');

    return [
      sanitizeCellValue(c.last_name || ''),
      sanitizeCellValue(c.first_name || ''),
      sanitizeCellValue(c.role || ''),
      sanitizeCellValue(c.phone || ''),
      sanitizeCellValue(c.mobile || ''),
      sanitizeCellValue(c.email || ''),
      sanitizeCellValue(companiesList),
      sanitizeCellValue(c.notes || ''),
    ];
  });

  const ws = XLSX.utils.aoa_to_sheet([header, ...rows]);

  ws['!cols'] = [
    { wch: 20 },
    { wch: 20 },
    { wch: 18 },
    { wch: 16 },
    { wch: 16 },
    { wch: 25 },
    { wch: 40 },
    { wch: 30 },
  ];

  XLSX.utils.book_append_sheet(wb, ws, 'Contacts');

  const timestamp = new Date().toISOString().split('T')[0];
  XLSX.writeFile(wb, `annuaire_contacts_${timestamp}.xlsx`);
}
