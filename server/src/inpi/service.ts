/**
 * Opérations INPI.
 * ---------------------------------------------------------------------------
 * Reprend le cœur métier de `inpi-api` et `inpi-sync` : chercher une entreprise,
 * lister ses actes, télécharger une pièce. Le client (client.ts) s'occupe du
 * jeton et des erreurs réseau ; ici on ne fait plus que traduire les réponses.
 *
 * Les deux Edge Functions appelaient la même route `/api/companies/{siren}/
 * attachments` sous deux noms — `listDocuments` d'un côté, `fetchLegalActsINPI`
 * de l'autre — avec des transformations légèrement divergentes. Une seule
 * fonction ici, `listerPieces`, avec la catégorisation en option : c'est la
 * seule chose qui différait réellement.
 */

/* eslint-disable @typescript-eslint/no-explicit-any -- réponses INPI non typées. */

import { appeler, appelerBrut, ErreurInpi, urlPortail } from './client.js';
import { resolveLibelle } from './libelles.js';
import {
  extractCompanySummary,
  extractPersonneMoraleData,
  extractPersonnePhysiqueData,
  extractExploitationData,
} from './extraction.js';

export interface Piece {
  id: string | null;
  type: string;
  /** Catégorie applicative, utilisée par le suivi des actes juridiques. */
  category: string;
  date: string | null;
  depositDate: string | null;
  reference: string | null;
  documentUrl: string | null;
  description: string;
}

/**
 * Catégorise un acte d'après son libellé.
 *
 * Repris de `inpi-sync`. Le classement est volontairement grossier : il alimente
 * un filtre d'affichage, pas une décision juridique. « autre » est un résultat
 * acceptable, pas un échec.
 */
function categoriser(libelle: string): string {
  const t = libelle
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');

  if (/creation|immatriculation|constitutif/.test(t)) return 'creation';
  if (/nomination|dirigeant|gerant/.test(t)) return 'nomination';
  if (/demission|cessation|revocation/.test(t)) return 'demission';
  if (/siege|transfert/.test(t)) return 'transfert_siege';
  if (/dissolution|liquidation|radiation/.test(t)) return 'dissolution';
  if (/statuts|modification|fusion|apport|scission|capital|augmentation|reduction/.test(t)) {
    return 'modification_statuts';
  }
  return 'autre';
}

/**
 * Pièces déposées au registre pour un SIREN.
 *
 * L'INPI place la liste sous `attachments`, `actes` ou `documents` selon les
 * enregistrements, et rend parfois un tableau nu. Les quatre cas sont traités :
 * ils ont tous été rencontrés en production.
 */
export async function listerPieces(siren: string): Promise<Piece[]> {
  const brut = await appeler<any>(`/api/companies/${siren}/attachments`, { delaiMs: 45_000 });

  const liste: any[] = Array.isArray(brut)
    ? brut
    : (brut?.attachments ?? brut?.actes ?? brut?.documents ?? []);

  return liste.map((p: any): Piece => {
    const { label, description } = resolveLibelle(p);
    const id = p.id ?? p.numero ?? p.reference ?? null;
    return {
      id: id === null ? null : String(id),
      type: label,
      category: categoriser(label),
      date: p.date ?? p.dateActe ?? p.dateDepot ?? null,
      depositDate: p.dateDepot ?? p.dateDepose ?? null,
      reference: p.reference ?? p.id ?? p.numero ?? null,
      documentUrl: p.url ?? p.lien ?? p.documentUrl ?? null,
      description,
    };
  });
}

export interface ResultatRecherche {
  ok: boolean;
  message: string;
  donnees?: Record<string, unknown>;
}

/**
 * Fiche d'entreprise, normalisée pour la table `clients`.
 *
 * Les quatre emplacements possibles de `content` viennent de l'original : selon
 * l'ancienneté de l'enregistrement, l'INPI répond à plat, sous `content`, sous
 * `formality.content`, ou dans un tableau. Ce n'est pas de la programmation
 * défensive gratuite — chaque branche correspond à des clients réels.
 */
export async function chercherParSiren(siretOuSiren: string): Promise<ResultatRecherche> {
  const siren = siretOuSiren.length === 9 ? siretOuSiren : siretOuSiren.slice(0, 9);

  let brut: any;
  try {
    brut = await appeler<any>(`/api/companies/${siren}`);
  } catch (e) {
    if (e instanceof ErreurInpi) return { ok: false, message: e.message };
    throw e;
  }

  const sirenReponse: string = brut?.siren ?? siren;

  let contenu = brut?.content;
  let natureCreation = contenu?.natureCreation ?? brut?.natureCreation;

  if (!contenu && (brut?.personneMorale || brut?.personnePhysique || brut?.exploitation)) {
    contenu = {
      personneMorale: brut.personneMorale,
      personnePhysique: brut.personnePhysique,
      exploitation: brut.exploitation,
    };
    natureCreation = brut.natureCreation;
  }

  if (!contenu && brut?.formality?.content) {
    contenu = brut.formality.content;
    natureCreation = contenu.natureCreation ?? brut.formality.natureCreation;
  }

  if (!contenu && Array.isArray(brut) && brut.length > 0) {
    const premier = brut[0];
    contenu =
      premier.content ?? {
        personneMorale: premier.personneMorale,
        personnePhysique: premier.personnePhysique,
        exploitation: premier.exploitation,
      };
    natureCreation = contenu?.natureCreation ?? premier.natureCreation;
  }

  if (!contenu) {
    return {
      ok: false,
      message: "Structure de reponse INPI non reconnue pour ce SIREN.",
    };
  }

  if (contenu.personneMorale) {
    return {
      ok: true,
      message: 'Donnees recuperees.',
      donnees: extractPersonneMoraleData(contenu.personneMorale, sirenReponse, siretOuSiren, natureCreation),
    };
  }
  if (contenu.personnePhysique) {
    return {
      ok: true,
      message: 'Donnees recuperees.',
      donnees: extractPersonnePhysiqueData(contenu.personnePhysique, sirenReponse, siretOuSiren, natureCreation),
    };
  }
  if (contenu.exploitation) {
    return {
      ok: true,
      message: 'Donnees recuperees.',
      donnees: extractExploitationData(contenu.exploitation, sirenReponse, siretOuSiren, natureCreation),
    };
  }

  return {
    ok: false,
    message: "Aucun type d'entite reconnu dans la reponse INPI.",
  };
}

/** Recherche par dénomination. Sert à l'ajout de client sans SIREN connu. */
export async function chercherParNom(
  requete: string
): Promise<{ ok: boolean; message: string; entreprises: unknown[] }> {
  const q = requete.trim();
  if (q.length < 3) {
    return { ok: false, message: 'Saisis au moins 3 caracteres.', entreprises: [] };
  }

  try {
    const brut = await appeler<any>(
      `/api/companies?companyName=${encodeURIComponent(q)}&pageSize=20&page=1`,
      { delaiMs: 45_000 }
    );
    const liste: any[] = Array.isArray(brut) ? brut : (brut?.results ?? brut?.companies ?? []);
    const entreprises = liste.map(extractCompanySummary).filter((e: any) => e.siren);
    return {
      ok: true,
      message: `${entreprises.length} entreprise(s) trouvee(s).`,
      entreprises,
    };
  } catch (e) {
    if (e instanceof ErreurInpi) return { ok: false, message: e.message, entreprises: [] };
    throw e;
  }
}

export interface ResultatTelechargement {
  ok: boolean;
  message: string;
  contenu?: Buffer;
  typeMime?: string;
  /** Fiche publique, proposée quand aucun chemin de téléchargement ne répond. */
  urlPortail?: string;
}

/**
 * Télécharge une pièce déposée.
 *
 * L'INPI n'expose pas un chemin de téléchargement unique : selon l'ancienneté du
 * dépôt, le PDF est derrière `/attachments/{id}/download`, `/attachments/{id}`,
 * `/actes/download?ids=`, `/actes/{id}/download` ou `/actes/{id}` — et parfois
 * derrière une URL absolue portée par l'enregistrement lui-même. Les six pistes
 * viennent de l'Edge Function d'origine, où elles ont été trouvées à l'usage.
 * Les réduire à une seule casserait le téléchargement d'une partie des actes.
 *
 * Le contrôle du contenu importe autant que le statut : l'INPI répond parfois
 * 200 avec un JSON d'erreur. On n'accepte donc que ce qui ressemble à un PDF, ou
 * ce qui est assez volumineux pour ne pas être un message d'erreur.
 */
export async function telechargerPiece(
  siren: string,
  pieceId: string,
  budgetMs = 60_000
): Promise<ResultatTelechargement> {
  const echeance = Date.now() + budgetMs;
  const reste = () => echeance - Date.now();

  // La pièce doit d'abord être retrouvée dans la liste : c'est elle qui porte
  // l'éventuelle URL directe, et cela vérifie au passage que l'identifiant
  // appartient bien à ce SIREN.
  let pieces: Piece[];
  try {
    pieces = await listerPieces(siren);
  } catch (e) {
    if (e instanceof ErreurInpi) return { ok: false, message: e.message };
    throw e;
  }

  const cible = pieces.find((p) => p.id === pieceId || p.reference === pieceId);
  if (!cible) {
    return {
      ok: false,
      message: "Cette piece n'apparait pas dans les depots de l'entreprise.",
      urlPortail: urlPortail(siren),
    };
  }

  const chemins = [
    ...(cible.documentUrl ? [cible.documentUrl] : []),
    ...(cible.id
      ? [
          `/api/companies/${siren}/attachments/${cible.id}/download`,
          `/api/companies/${siren}/attachments/${cible.id}`,
          `/api/actes/download?ids=${cible.id}`,
          `/api/actes/${cible.id}/download`,
          `/api/actes/${cible.id}`,
        ]
      : []),
  ];

  for (const chemin of [...new Set(chemins)]) {
    // En dessous de 5 s il ne reste pas de quoi terminer un téléchargement :
    // mieux vaut rendre le lien du portail que d'expirer côté client.
    if (reste() <= 5_000) break;

    const rep = await appelerBrut(chemin, { delaiMs: Math.min(25_000, reste()) });
    if (!rep?.ok) continue;

    const typeMime = rep.headers.get('Content-Type') ?? '';
    const estPdf = typeMime.includes('pdf') || typeMime.includes('octet-stream');
    const taille = Number.parseInt(rep.headers.get('Content-Length') ?? '0', 10);

    if (estPdf || taille > 100) {
      return {
        ok: true,
        message: 'Document recupere.',
        contenu: Buffer.from(await rep.arrayBuffer()),
        typeMime: typeMime || 'application/pdf',
      };
    }

    // Ni PDF annoncé, ni taille connue : on regarde le corps. Du texte long qui
    // ne commence pas par { ou [ est un binaire mal étiqueté, pas une erreur.
    const corps = Buffer.from(await rep.arrayBuffer());
    const debut = corps.subarray(0, 16).toString('utf8').trimStart();
    if (corps.length > 1000 && !debut.startsWith('{') && !debut.startsWith('[')) {
      return {
        ok: true,
        message: 'Document recupere.',
        contenu: corps,
        typeMime: 'application/pdf',
      };
    }
  }

  return {
    ok: false,
    message:
      "Le telechargement direct n'est pas disponible pour cette piece. Elle reste consultable sur le portail INPI.",
    urlPortail: urlPortail(siren),
  };
}
