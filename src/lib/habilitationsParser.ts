export interface HabilitationRow {
  siren: string;
  service: string;
  dateCreation: string | null;
  role: string | null;
  etat: string | null;
}

export function normalizeQuotes(str: string): string {
  return str.replace(/[\u2018\u2019\u201B`\u2032\u2019]/g, "'").replace(/[\u201C\u201D]/g, '"');
}

export function normalizeSiren(raw: string | number | null | undefined): string {
  if (raw === null || raw === undefined) return '';
  const str = String(raw).trim();
  if (/^\d{8}$/.test(str)) return '0' + str;
  if (/^\d{9}$/.test(str)) return str;
  return str;
}

function isCSVFile(file: File): boolean {
  return file.name.toLowerCase().endsWith('.csv') || file.type === 'text/csv';
}

function parseCSVContent(text: string): HabilitationRow[] {
  const lines = text.split(/\r?\n/);
  if (lines.length < 2) return [];

  let headerIndex = -1;
  for (let i = 0; i < Math.min(lines.length, 5); i++) {
    const lower = lines[i].toLowerCase();
    if (lower.includes('siren') || lower.includes('siret')) {
      headerIndex = i;
      break;
    }
  }
  if (headerIndex === -1) headerIndex = 0;

  const rows: HabilitationRow[] = [];
  for (let i = headerIndex + 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    const cells = line.split(';');
    if (cells.length < 2) continue;

    const rawSiren = cells[0];
    const rawService = cells[1];
    if (!rawSiren || !rawService) continue;

    const siren = normalizeSiren(rawSiren);
    const service = normalizeQuotes(rawService.trim());
    if (!siren || !service) continue;

    rows.push({
      siren,
      service,
      dateCreation: cells[2]?.trim() || null,
      role: cells[4]?.trim() || null,
      etat: cells[5]?.trim() || null,
    });
  }

  return rows;
}

function parseExcelContent(data: Uint8Array, XLSX: any): HabilitationRow[] {
  const workbook = XLSX.read(data, { type: 'array' });
  const sheetName = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[sheetName];

  // `XLSX` arrive en `any` (import dynamique) : un appel non typé n'accepte pas
  // d'argument de type. L'annotation se pose donc sur la variable.
  const jsonData: (string | number | null)[][] = XLSX.utils.sheet_to_json(worksheet, {
    header: 1,
    defval: null,
  });

  let headerRowIndex = -1;
  for (let i = 0; i < Math.min(jsonData.length, 5); i++) {
    const row = jsonData[i];
    if (row && row.length > 0) {
      const firstCell = String(row[0] ?? '').toLowerCase();
      if (firstCell.includes('siren') || firstCell.includes('siret')) {
        headerRowIndex = i;
        break;
      }
    }
  }

  if (headerRowIndex === -1) {
    headerRowIndex = 0;
  }

  const rows: HabilitationRow[] = [];
  for (let i = headerRowIndex + 1; i < jsonData.length; i++) {
    const row = jsonData[i];
    if (!row || row.length < 2) continue;

    const rawSiren = row[0];
    const rawService = row[1];
    if (!rawSiren || !rawService) continue;

    const siren = normalizeSiren(rawSiren);
    const service = normalizeQuotes(String(rawService).trim());
    if (!siren || !service) continue;

    rows.push({
      siren,
      service,
      dateCreation: row[2] != null ? String(row[2]).trim() : null,
      role: row[4] != null ? String(row[4]).trim() : null,
      etat: row[5] != null ? String(row[5]).trim() : null,
    });
  }

  return rows;
}

export async function parseHabilitationsFile(file: File): Promise<HabilitationRow[]> {
  if (isCSVFile(file)) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const text = e.target?.result as string;
          const rows = parseCSVContent(text);
          resolve(rows);
        } catch {
          reject(new Error('Impossible de lire le fichier CSV.'));
        }
      };
      reader.onerror = () => reject(new Error('Erreur de lecture du fichier.'));
      reader.readAsText(file, 'UTF-8');
    });
  }

  const XLSX = await import('xlsx');

  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target?.result as ArrayBuffer);
        const rows = parseExcelContent(data, XLSX);
        resolve(rows);
      } catch {
        reject(new Error('Impossible de lire le fichier. Verifiez le format (Excel ou CSV).'));
      }
    };

    reader.onerror = () => reject(new Error('Erreur de lecture du fichier.'));
    reader.readAsArrayBuffer(file);
  });
}
