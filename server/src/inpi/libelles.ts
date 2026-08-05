/**
 * Libellés des documents INPI.
 * ---------------------------------------------------------------------------
 * Ce bloc était dupliqué à l'identique dans `inpi-api` et `inpi-sync` : mêmes
 * 40 codes, mêmes fonctions, au nom du paramètre près (`doc` d'un côté, `act` de
 * l'autre). Une seule copie ici.
 *
 * Le problème que résout `resolveLibelle` : l'INPI renvoie le type de document
 * dans une demi-douzaine de champs selon l'acte, tantôt en clair, tantôt sous
 * forme de code, tantôt dans le nom du fichier. Sans cette normalisation
 * l'interface afficherait « PVAGE » ou une chaîne vide.
 */

/* eslint-disable @typescript-eslint/no-explicit-any -- les réponses de l'INPI
   sont hétérogènes et non typées ; c'est précisément ce que ce module absorbe. */

export const INPI_TYPE_LABELS: Record<string, string> = {
  "SSP": "Acte sous seing prive",
  "AA": "Acte authentique",
  "PV": "Proces-verbal",
  "PVAGO": "PV d'assemblee generale ordinaire",
  "PVAGE": "PV d'assemblee generale extraordinaire",
  "DEC": "Decision",
  "DAU": "Decision de l'associe unique",
  "STA": "Statuts",
  "STAC": "Statuts constitutifs",
  "STAM": "Statuts mis a jour",
  "RAP": "Rapport",
  "BIL": "Bilan",
  "CA": "Comptes annuels",
  "RCS": "Extrait RCS",
  "LET": "Lettre",
  "ATT": "Attestation",
  "CER": "Certificat",
  "ORD": "Ordonnance",
  "JUG": "Jugement",
  "REQ": "Requete",
  "AVI": "Avis",
  "NOT": "Notification",
  "REC": "Recepisse",
  "DEL": "Deliberation",
  "RES": "Resolution",
  "CON": "Contrat",
  "MAN": "Mandat",
  "PRO": "Procuration",
  "REG": "Reglement",
  "TRA": "Traite",
  "FUS": "Traite de fusion",
  "AUG": "Augmentation de capital",
  "RED": "Reduction de capital",
  "TUP": "Transmission universelle de patrimoine",
};

export function isCodedReference(str: string): boolean {
  if (!str || str.length < 5) return false;
  if (/C\d{4}A\d{4}L/.test(str)) return true;
  if (/TPIJTES/.test(str)) return true;
  if (/^[A-Za-z0-9]{8,}\s+C\d{4}/.test(str)) return true;
  const alphaNumRatio = (str.replace(/[^A-Z0-9]/g, "").length) / str.length;
  if (alphaNumRatio > 0.85 && str.length > 20) return true;
  return false;
}

export function extractText(val: any): string {
  if (!val) return "";
  if (typeof val === "string") return val;
  if (typeof val !== "object") return String(val);
  if (Array.isArray(val)) {
    const parts = val.map((v: any) => extractText(v)).filter(Boolean);
    return parts.join(", ");
  }
  const textKeys = ["libelle", "label", "description", "value", "nom", "intitule", "objet", "texte", "name", "titre"];
  for (const key of textKeys) {
    if (val[key] && typeof val[key] === "string") return val[key];
  }
  const firstStringVal = Object.values(val).find((v) => typeof v === "string" && v.length > 2);
  if (firstStringVal) return firstStringVal as string;
  return "";
}

export function cleanFieldValue(val: any): string {
  if (!val) return "";
  const str = extractText(val).trim();
  if (!str) return "";
  if (isCodedReference(str)) return "";
  return str;
}

export function resolveLibelle(doc: any): { label: string; description: string } {
  const rawType = cleanFieldValue(doc.type || doc.typeActe || "");
  const nature = cleanFieldValue(doc.nature || "");
  const decision = cleanFieldValue(doc.decision || doc.objet || "");
  const libelle = cleanFieldValue(doc.libelle || doc.description || "");
  const nomDoc = doc.nomDocument || doc.nom_document || "";
  const typeRdd = cleanFieldValue(doc.typeRdd || doc.type_rdd || "");
  const nomActe = cleanFieldValue(doc.nomActe || doc.nom_acte || "");

  const typeLabel = rawType ? (INPI_TYPE_LABELS[rawType.toUpperCase()] || "") : "";

  const displayType = typeLabel
    || typeRdd
    || (rawType.length > 4 && !isCodedReference(rawType) ? rawType : "")
    || nature
    || nomActe
    || "Document";

  let description = "";
  if (decision) {
    description = decision;
  } else if (libelle && libelle.toLowerCase() !== displayType.toLowerCase()) {
    description = libelle;
  } else if (nomActe && nomActe.toLowerCase() !== displayType.toLowerCase()) {
    description = nomActe;
  } else if (nomDoc && !isCodedReference(nomDoc)) {
    const cleaned = nomDoc
      .replace(/\.[^/.]+$/, "")
      .replace(/[_-]/g, " ")
      .replace(/\b\d{8,}\b/g, "")
      .trim();
    if (cleaned.length > 3 && !isCodedReference(cleaned)) {
      description = cleaned;
    }
  }

  const label = description
    ? `${displayType} - ${description}`
    : displayType;

  return { label, description: description || displayType };
}
