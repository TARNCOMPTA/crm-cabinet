/**
 * Analyse d'un courriel MIME.
 *
 * Les accusés de jedeclare ne sont pas des fichiers de données : ce sont des
 * e-mails `multipart/signed`, contenant un corps texte, le flux EDI d'origine
 * et un `avis.xml` — le seul qui nous intéresse. Il faut donc savoir ouvrir
 * l'enveloppe avant de pouvoir lire quoi que ce soit.
 *
 * Pas de dépendance externe : on travaille sur la chaîne `latin1`, qui préserve
 * les octets un à un, et on décode chaque partie selon son
 * `Content-Transfer-Encoding`. Décoder trop tôt en UTF-8 abîmerait les pièces
 * binaires.
 *
 * Porté depuis `ecritures-api` (`src/mime.js`), où il est en service.
 */

type Entetes = Record<string, string>;

export interface PartieMime {
  nom: string | null;
  type: string;
  jeu: BufferEncoding;
  contenu: Buffer;
}

export interface Eml {
  entetes: Entetes;
  sujet: string;
  date: string | null;
  parties: PartieMime[];
}

/**
 * Replie les en-têtes sur une ligne avant de les lire : un en-tête MIME peut
 * se poursuivre sur la ligne suivante si celle-ci commence par une espace.
 */
function deplierEntetes(brut: string): Entetes {
  const entetes: Entetes = {};
  const lignes = brut.replace(/\r?\n[ \t]+/g, ' ').split(/\r?\n/);
  for (const ligne of lignes) {
    const m = ligne.match(/^([\w-]+)\s*:\s*([\s\S]*)$/);
    if (m) entetes[m[1]!.toLowerCase()] = m[2]!.trim();
  }
  return entetes;
}

function separer(brut: string): { entetes: Entetes; corps: string } {
  const coupure = brut.search(/\r?\n\r?\n/);
  if (coupure === -1) return { entetes: deplierEntetes(brut), corps: '' };
  return {
    entetes: deplierEntetes(brut.slice(0, coupure)),
    corps: brut.slice(coupure).replace(/^\r?\n\r?\n/, ''),
  };
}

function decouper(corps: string, frontiere: string): string[] {
  const marqueur = `--${frontiere}`;
  const segments: string[] = [];
  let position = corps.indexOf(marqueur);
  while (position !== -1) {
    // « --frontiere-- » marque la fin de la série
    if (corps.slice(position + marqueur.length, position + marqueur.length + 2) === '--') break;
    const debutContenu = corps.indexOf('\n', position);
    if (debutContenu === -1) break;
    const suivant = corps.indexOf(marqueur, debutContenu);
    segments.push(
      corps.slice(debutContenu + 1, suivant === -1 ? undefined : suivant).replace(/\r?\n$/, '')
    );
    position = suivant;
  }
  return segments;
}

function decoderContenu(corps: string, encodage: string | undefined): Buffer {
  const code = String(encodage ?? '').toLowerCase();
  if (code === 'base64') return Buffer.from(corps.replace(/[^A-Za-z0-9+/=]/g, ''), 'base64');
  if (code === 'quoted-printable') {
    const texte = corps
      .replace(/=\r?\n/g, '')
      .replace(/=([0-9A-Fa-f]{2})/g, (_, hex: string) => String.fromCharCode(parseInt(hex, 16)));
    return Buffer.from(texte, 'latin1');
  }
  return Buffer.from(corps, 'latin1');
}

function jeuDeCaracteres(contentType: string | undefined): BufferEncoding {
  const jeu = String(contentType ?? '').match(/charset="?([\w-]+)"?/i)?.[1] ?? 'utf-8';
  return /^(iso-8859-1|iso-8859-15|windows-1252|latin1)$/i.test(jeu) ? 'latin1' : 'utf8';
}

/** « =?UTF-8?Q?ACS_:_Message_N=C2=B0_123?= » → « ACS : Message N° 123 ». */
export function decoderMotsEncodes(valeur: unknown): string {
  return String(valeur ?? '').replace(
    /=\?([\w-]+)\?([BbQq])\?([^?]*)\?=/g,
    (_, jeu: string, methode: string, donnees: string) => {
      const octets =
        methode.toUpperCase() === 'B'
          ? Buffer.from(donnees, 'base64')
          : decoderContenu(donnees.replace(/_/g, ' '), 'quoted-printable');
      return octets.toString(/^(iso-8859-1|windows-1252)$/i.test(jeu) ? 'latin1' : 'utf8');
    }
  );
}

/** Descente récursive : un `multipart` peut en contenir un autre. */
function parcourir(partie: { entetes: Entetes; corps: string }, feuilles: PartieMime[]): void {
  const contentType = partie.entetes['content-type'] ?? 'text/plain';
  const frontiere = contentType.match(/boundary="?([^";]+)"?/i)?.[1];
  if (/^multipart\//i.test(contentType) && frontiere) {
    for (const segment of decouper(partie.corps, frontiere)) parcourir(separer(segment), feuilles);
    return;
  }
  const disposition = partie.entetes['content-disposition'] ?? '';
  const nom =
    disposition.match(/filename="?([^";]+)"?/i)?.[1] ??
    contentType.match(/name="?([^";]+)"?/i)?.[1] ??
    null;
  feuilles.push({
    nom: nom ? decoderMotsEncodes(nom) : null,
    type: (contentType.split(';')[0] ?? '').trim().toLowerCase(),
    jeu: jeuDeCaracteres(contentType),
    contenu: decoderContenu(partie.corps, partie.entetes['content-transfer-encoding']),
  });
}

export function analyserEml(tampon: Buffer | string): Eml {
  const brut = Buffer.isBuffer(tampon) ? tampon.toString('latin1') : String(tampon);
  const racine = separer(brut);
  const parties: PartieMime[] = [];
  parcourir(racine, parties);
  return {
    entetes: racine.entetes,
    sujet: decoderMotsEncodes(racine.entetes['subject'] ?? ''),
    date: racine.entetes['date'] ?? null,
    parties,
  };
}

/** Première partie dont le nom correspond — par exemple `/^avis\.xml$/i`. */
export function trouverPiece(eml: Eml, motif: RegExp): PartieMime | null {
  return eml.parties.find((p) => p.nom && motif.test(p.nom)) ?? null;
}

export function corpsTexte(eml: Eml): string {
  const partie = eml.parties.find((p) => p.type === 'text/plain');
  return partie ? partie.contenu.toString(partie.jeu).trim() : '';
}
