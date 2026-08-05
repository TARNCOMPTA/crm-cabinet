export const MAX_FILE_SIZE = 10 * 1024 * 1024;
export const MAX_ROWS = 2000;

async function loadXLSX() {
  const XLSX = await import('xlsx');
  return XLSX;
}

export interface ParsedClient {
  lineNumber: number;
  siret: string;
  nom_entreprise: string;
  status: 'valid' | 'duplicate' | 'error';
  errorMessage?: string;
}

export interface ParseResult {
  clients: ParsedClient[];
  totalLines: number;
  validLines: number;
  errorLines: number;
}

function cleanSIRET(value: any): string | null {
  if (!value) return null;
  const cleaned = String(value).replace(/\s+/g, '').replace(/[^0-9]/g, '');
  if (!cleaned) return null;
  if (cleaned.length === 13) return cleaned.padStart(14, '0');
  return cleaned;
}

function validateSIRET(siret: string): boolean {
  return /^\d{14}$/.test(siret);
}

export async function parseExcelFile(file: File): Promise<ParseResult> {
  if (file.size > MAX_FILE_SIZE) {
    throw new Error(`Le fichier est trop volumineux (max ${MAX_FILE_SIZE / 1024 / 1024} MB)`);
  }

  const XLSX = await loadXLSX();

  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = (e) => {
      try {
        const data = e.target?.result;
        const workbook = XLSX.read(data, { type: 'binary' });
        const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
        const jsonData = XLSX.utils.sheet_to_json(firstSheet, { header: 1 }) as any[][];

        if (jsonData.length === 0) {
          reject(new Error('Le fichier Excel est vide'));
          return;
        }

        if (jsonData.length - 1 > MAX_ROWS) {
          reject(new Error(`Le fichier contient trop de lignes (max ${MAX_ROWS}, trouvé ${jsonData.length - 1})`));
          return;
        }

        const clients: ParsedClient[] = [];
        let validCount = 0;
        let errorCount = 0;
        const seenSirets = new Set<string>();

        for (let i = 1; i < jsonData.length; i++) {
          const row = jsonData[i];

          if (!row || row.length === 0 || row.every(cell => !cell)) {
            continue;
          }

          const lineNumber = i + 1;
          const rawSiret = cleanSIRET(row[0]);
          const rawNom = row[1] ? String(row[1]).trim() : '';

          let status: 'valid' | 'duplicate' | 'error' = 'valid';
          let errorMessage: string | undefined;

          if (!rawSiret) {
            status = 'error';
            errorMessage = 'SIRET manquant en colonne A';
            errorCount++;
          } else if (!validateSIRET(rawSiret)) {
            status = 'error';
            errorMessage = `SIRET invalide : "${rawSiret}" doit contenir exactement 14 chiffres`;
            errorCount++;
          } else if (seenSirets.has(rawSiret)) {
            status = 'error';
            errorMessage = `Doublon : ${rawSiret} apparait plusieurs fois dans ce fichier`;
            errorCount++;
          } else {
            validCount++;
            seenSirets.add(rawSiret);
          }

          clients.push({
            lineNumber,
            siret: rawSiret || '',
            nom_entreprise: rawNom || 'Inconnu',
            status,
            errorMessage,
          });
        }

        resolve({
          clients,
          totalLines: clients.length,
          validLines: validCount,
          errorLines: errorCount,
        });
      } catch (error) {
        reject(new Error(`Erreur lors de la lecture du fichier : ${error instanceof Error ? error.message : 'Erreur inconnue'}`));
      }
    };

    reader.onerror = () => {
      reject(new Error('Erreur lors de la lecture du fichier'));
    };

    reader.readAsBinaryString(file);
  });
}

export async function generateExcelTemplate(): Promise<void> {
  const XLSX = await loadXLSX();
  const wb = XLSX.utils.book_new();

  const data = [
    ['SIRET', 'Nom'],
    ['12345678901234', 'Exemple Société SARL'],
    ['98765432109876', ''],
  ];

  const ws = XLSX.utils.aoa_to_sheet(data);

  ws['!cols'] = [
    { wch: 18 },
    { wch: 30 },
  ];

  XLSX.utils.book_append_sheet(wb, ws, 'Clients');
  XLSX.writeFile(wb, 'modele_import_clients.xlsx');
}

export async function exportErrorsToExcel(clients: ParsedClient[]): Promise<void> {
  const XLSX = await loadXLSX();
  const wb = XLSX.utils.book_new();

  const errorsAndDuplicates = clients.filter(
    c => c.status === 'error' || c.status === 'duplicate'
  );

  if (errorsAndDuplicates.length === 0) {
    return;
  }

  function safeCsv(val: string): string {
    if (!val) return val;
    const dangerous = ['=', '+', '-', '@', '\t', '\r'];
    if (dangerous.some(ch => val.startsWith(ch))) return `'${val}`;
    return val;
  }

  const data = [
    ['Ligne', 'Statut', 'SIRET', 'Nom', 'Erreur'],
    ...errorsAndDuplicates.map(c => [
      c.lineNumber,
      c.status === 'error' ? 'ERREUR' : 'DOUBLON',
      safeCsv(c.siret || ''),
      safeCsv(c.nom_entreprise),
      safeCsv(c.errorMessage || ''),
    ]),
  ];

  const ws = XLSX.utils.aoa_to_sheet(data);

  ws['!cols'] = [
    { wch: 8 },
    { wch: 10 },
    { wch: 18 },
    { wch: 30 },
    { wch: 50 },
  ];

  XLSX.utils.book_append_sheet(wb, ws, 'Erreurs');

  const timestamp = new Date().toISOString().split('T')[0];
  XLSX.writeFile(wb, `erreurs_import_${timestamp}.xlsx`);
}
