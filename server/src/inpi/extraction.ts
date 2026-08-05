/**
 * Normalisation des réponses de l'INPI.
 * ---------------------------------------------------------------------------
 * L'API du RNE renvoie une structure profondément différente selon que
 * l'entreprise est une personne morale, une personne physique ou une
 * exploitation agricole — et, à l'intérieur de chaque cas, les mêmes
 * informations changent de nom d'un enregistrement à l'autre. Ces fonctions
 * ramènent tout cela à la forme attendue par la table `clients`.
 *
 * Repris presque tel quel des Edge Functions `inpi-api` et `inpi-sync` : c'est
 * du code éprouvé sur des données réelles, et le réécrire pour le plaisir de le
 * réécrire ne ferait que perdre les cas particuliers qu'il traite déjà.
 */

/* eslint-disable @typescript-eslint/no-explicit-any -- les réponses de l'INPI
   sont hétérogènes et non typées ; c'est ce que ce module absorbe. */

export function pickFirstString(...values: any[]): string {
  for (const v of values) {
    if (typeof v === "string" && v.trim().length > 0) return v.trim();
  }
  return "";
}

export function buildAddress(adresse: any): {
  ligne1: string;
  complement: string;
  codePostal: string;
  ville: string;
  pays: string;
  codeInsee: string;
} {
  if (!adresse || typeof adresse !== "object") {
    return { ligne1: "", complement: "", codePostal: "", ville: "", pays: "", codeInsee: "" };
  }
  const numero = pickFirstString(adresse.numVoie, adresse.numero);
  const indice = pickFirstString(adresse.indiceRepetition);
  const typeVoie = pickFirstString(adresse.typeVoie);
  const voie = pickFirstString(adresse.voie, adresse.libelleVoie, adresse.nomVoie);
  const complement = pickFirstString(adresse.complementLocalisation, adresse.complement);
  const ligne1Parts = [numero, indice, typeVoie, voie].filter(Boolean);
  // Le complement est desormais un CHAMP PROPRE, plus replie dans `ligne1` avec
  // un « - ». `clients.adresse_complement` existe : l'aplatir ici obligerait a le
  // redecouper ailleurs, ce qui est exactement le travers dont on sort.
  //
  // Le repli reste pour les charges qui ne donnent qu'une `ligne1` deja composee.
  const ligne1 = pickFirstString(adresse.ligne1, adresse.adresseLigne1, ligne1Parts.join(" "));
  return {
    ligne1,
    complement,
    codePostal: pickFirstString(adresse.codePostal, adresse.cp),
    ville: pickFirstString(adresse.commune, adresse.ville, adresse.libelleCommune),
    pays: pickFirstString(adresse.pays, adresse.libellePays) || "France",
    codeInsee: pickFirstString(
      adresse.codeInseeCommune,
      adresse.codeCommune,
      adresse.codeInsee,
      adresse.codeInseeVille
    ),
  };
}

export function buildPersonName(descPersonne: any): string {
  if (!descPersonne || typeof descPersonne !== "object") return "";
  const prenom = Array.isArray(descPersonne.prenoms) && descPersonne.prenoms.length
    ? pickFirstString(descPersonne.prenoms[0])
    : pickFirstString(descPersonne.prenom, descPersonne.prenomUsuel);
  const nom = pickFirstString(descPersonne.nomUsage, descPersonne.nom);
  const full = [prenom, nom].filter(Boolean).join(" ").trim();
  return full || pickFirstString(descPersonne.pseudonyme);
}

export function extractCompanySummary(item: any): {
  siren: string;
  siret: string;
  denomination: string;
  formeJuridique: string;
  codeNaf: string;
  libelleNaf: string;
  adresse: { ligne1: string; codePostal: string; ville: string; pays: string; codeInsee: string };
  dateCreation: string;
  statut: string;
  isPersonnePhysique: boolean;
} {
  const formality = item?.formality || item;
  const content = formality?.content || {};
  const personneMorale = content.personneMorale || content.personne_morale || {};
  const personnePhysique = content.personnePhysique || content.personne_physique || {};
  const exploitation = content.exploitation || {};
  const isPersonnePhysique = !!(content.personnePhysique || content.personne_physique);
  const identite = personneMorale.identite || personnePhysique.identite || {};
  const entreprise = identite.entreprise || {};
  const description = identite.description || {};
  const entrepreneur = personnePhysique.identite?.entrepreneur
    || identite.entrepreneur
    || {};
  const descPersonne = entrepreneur.descriptionPersonne
    || identite.descriptionPersonne
    || {};

  const siren = pickFirstString(
    formality?.siren,
    item?.siren,
    entreprise.siren,
    content.siren
  );

  const etabPrincipal =
    personneMorale.etablissementPrincipal ||
    personnePhysique.etablissementPrincipal ||
    exploitation.etablissementPrincipal ||
    {};
  const etabDescriptif = etabPrincipal.descriptionEtablissement || {};
  const etabAdresse = etabPrincipal.adresse || identite.adresse || {};

  const siret = pickFirstString(
    etabDescriptif.siret,
    etabPrincipal.siret,
    siren && etabDescriptif.nic ? `${siren}${etabDescriptif.nic}` : ""
  );

  const personName = buildPersonName(descPersonne);
  const enseigne = pickFirstString(
    etabDescriptif.enseigne,
    etabDescriptif.nomCommercial
  );

  let denomination = pickFirstString(
    entreprise.denomination,
    entreprise.nomCommercial,
    enseigne,
    entreprise.sigle,
    personName,
    [identite.prenoms?.[0], identite.nom].filter(Boolean).join(" "),
    formality?.companyName,
    item?.companyName,
    item?.denomination,
    descPersonne.pseudonyme
  );

  if (isPersonnePhysique && personName && !entreprise.denomination && !entreprise.nomCommercial) {
    denomination = `EI ${personName}`;
  }

  const formeJuridique = pickFirstString(
    entreprise.formeJuridique,
    entreprise.libelleFormeJuridique,
    description.formeJuridique
  );

  const codeNaf = pickFirstString(
    etabDescriptif.codeApe,
    etabDescriptif.codeNaf,
    description.codeApe,
    description.codeNaf,
    entreprise.codeApe
  );

  const libelleNaf = pickFirstString(
    etabDescriptif.libelleApe,
    description.libelleApe,
    entreprise.libelleApe
  );

  const dateCreation = pickFirstString(
    entreprise.dateCreation,
    description.dateCreation,
    formality?.creationDate
  );

  const statutLabel = pickFirstString(
    entreprise.libelleEtatAdministratif,
    description.libelleEtatAdministratif,
    entreprise.etatAdministratif === "C" ? "Cessee" : "",
    entreprise.etatAdministratif === "A" ? "Active" : ""
  ) || "Active";

  return {
    siren,
    siret,
    denomination,
    formeJuridique,
    codeNaf,
    libelleNaf,
    adresse: buildAddress(etabAdresse),
    dateCreation,
    statut: statutLabel,
    isPersonnePhysique,
  };
}


/*
 * `extractAddressLine` a ete supprimee.
 *
 * Elle ne lisait que `numVoie`, `typeVoie` et `voie`, et c'etait ELLE qui servait
 * sur le chemin qui ECRIT en base — `buildAddress`, bien plus complete, n'etait
 * utilisee que par le resume d'entreprise. Tout ce que le second sait extraire
 * etait donc perdu a l'ecriture : indice de repetition, complement de
 * localisation, pays, code INSEE, et toutes les variantes de nommage que l'INPI
 * emploie selon le type de personne.
 */

export function extractAllOfficers(pouvoirs: any[]): any[] {
  if (!pouvoirs || !Array.isArray(pouvoirs)) return [];

  return pouvoirs.map((pouvoir: any) => {
    const typePersonne = pouvoir.typeDePersonne || "physique";
    const isMorale = typePersonne.toLowerCase().includes("morale");

    if (isMorale) {
      const entreprise = pouvoir.entreprise || pouvoir.personneMorale || {};
      const denomination = entreprise.denomination || entreprise.nom || entreprise.raisonSociale || "";
      const siren = entreprise.siren || "";
      const role = pouvoir.role?.roleEnFrancais || pouvoir.role?.descriptionRole || pouvoir.descriptionRole || pouvoir.qualite || "Dirigeant";
      return {
        personType: "morale",
        firstName: "",
        lastName: denomination,
        denomination: denomination,
        role,
        birthDate: null,
        nationality: null,
        siren: siren,
        isActive: true,
      };
    }

    const desc = pouvoir.individu?.descriptionPersonne || {};
    const prenoms = desc.prenoms?.[0] || desc.prenom || "";
    const nom = desc.nom || "";
    const dateNaissance = desc.dateDeNaissance || desc.dateNaissance || null;
    const nationalite = desc.nationalite || null;
    const role = pouvoir.role?.roleEnFrancais || pouvoir.role?.descriptionRole || pouvoir.descriptionRole || pouvoir.qualite || "Dirigeant";

    return {
      personType: "physique",
      firstName: prenoms,
      lastName: nom,
      denomination: null,
      role,
      birthDate: dateNaissance,
      nationality: nationalite,
      siren: null,
      isActive: true,
    };
  }).filter((o: any) => o.lastName || o.firstName || o.denomination);
}

/**
 * SIRET reconstitue : `siren` + `nic` quand la charge ne porte pas le SIRET.
 *
 * `nic` etait deja extrait par `extractCompanySummary` et ignore partout
 * ailleurs. Le reconstituer ici remplit `clients.siret` sur des charges qui ne
 * le donnent qu'en morceaux — gain concret, zero colonne nouvelle.
 */
function siretDepuisNic(etab: any, siren: string, repli: string): string {
  const direct = pickFirstString(etab?.descriptionEtablissement?.siret);
  if (direct) return direct;
  const nic = pickFirstString(etab?.descriptionEtablissement?.nic, etab?.nic);
  if (siren && /^\d{9}$/.test(siren) && /^\d{5}$/.test(nic)) return siren + nic;
  return repli;
}

/**
 * Etat administratif : « A » actif, « C » cesse.
 *
 * Le plus utile des champs supplementaires : un cabinet qui ne sait pas qu'un
 * client est radie continue de preparer ses declarations.
 */
function etatAdministratifDe(etab: any): string {
  const brut = pickFirstString(
    etab?.descriptionEtablissement?.etatAdministratif,
    etab?.etatAdministratif
  ).toUpperCase();
  return brut === "A" || brut === "C" ? brut : "";
}

/**
 * Nom commercial : le nom sous lequel le client repond au telephone et signe ses
 * cheques — indispensable pour rapprocher un reglement.
 *
 * Une SEULE colonne pour trois champs INPI : `enseigne` est par etablissement, on
 * la replie. Une troisieme colonne d'appellation rendrait « comment s'appelle ce
 * client » ambigu.
 */
function nomCommercialDe(etab: any): string {
  return pickFirstString(
    etab?.descriptionEtablissement?.nomCommercial,
    etab?.nomCommercial,
    etab?.descriptionEtablissement?.enseigne,
    etab?.enseigne,
    etab?.descriptionEtablissement?.pseudonyme
  );
}

export function extractPersonneMoraleData(pm: any, siren: string, siret: string, natureCreation: any): any {
  const etab = pm.etablissementPrincipal || pm.autresEtablissements?.[0];

  const officers = extractAllOfficers(pm.composition?.pouvoirs || []);

  let dirigeant = "";
  if (officers.length > 0) {
    const first = officers[0];
    dirigeant = first.personType === "morale"
      ? first.denomination
      : `${first.firstName} ${first.lastName}`.trim();
  }

  const adresse = pm.adresseEntreprise?.adresse;

  const dateCloture = pm.identite?.description?.dateCloture ||
                      pm.identite?.description?.dateClotureExerciceSocial ||
                      null;

  const dateClotureExerciceSocial = pm.identite?.description?.dateClotureExerciceSocial || null;
  const datePremiereCloture = pm.identite?.description?.datePremiereCloture || null;
  const descriptionActivite = etab?.activites?.[0]?.descriptionDetaillee || "";

  return {
    siren,
    // `nic` reconstitue le SIRET quand la charge ne le porte pas : siret = siren
    // + nic. Il etait extrait par le resume d'entreprise et ignore par le chemin
    // qui ecrit. Pas de colonne pour lui — deux colonnes qui peuvent se
    // contredire valent moins qu'une.
    siret: siretDepuisNic(etab, siren, siret),
    denomination: pm.identite?.entreprise?.denomination || "",
    formeJuridique: pm.identite?.entreprise?.formeJuridique || "",
    dateCreation: natureCreation?.dateCreation || "",
    dateCloture,
    dateClotureExerciceSocial,
    datePremiereCloture,
    descriptionActivite,
    capitalSocial: pm.identite?.description?.montantCapital || 0,
    dirigeant,
    officers,
    // `buildAddress` et non `extractAddressLine` : le second ne lisait que
    // numVoie/typeVoie/voie et JETAIT l'indice de repetition, le complement, le
    // pays et le code INSEE — que le premier sait pourtant extraire, et que
    // `clients` sait desormais stocker.
    adresse: buildAddress(adresse),
    etatAdministratif: etatAdministratifDe(etab),
    nomCommercial: nomCommercialDe(etab),
    codeAPE: etab?.activites?.[0]?.codeApe || "",
    /*
     * `libelleAPE` recevait la MEME expression que `descriptionActivite` : ce
     * n'est pas un libelle NAF, et personne ne le lit. Un code APE determine son
     * libelle — le repeter sur 649 lignes garantirait des divergences. Le champ
     * reste dans le contrat pour ne casser aucun appelant, mais il est vide et
     * dit pourquoi.
     */
    libelleAPE: "",
  };
}

export function extractPersonnePhysiqueData(pp: any, siren: string, siret: string, natureCreation: any): any {
  const etab = pp.etablissementPrincipal || pp.autresEtablissements?.[0];
  const entrepreneur = pp.identite?.entrepreneur;

  const desc = entrepreneur?.descriptionPersonne;
  // `nomUsage` D'ABORD : c'est le nom sous lequel le cabinet ecrit au client.
  // `buildPersonName` le preferait deja, mais le chemin qui ECRIT ne le voyait
  // jamais — il passait par la concatenation ci-dessous.
  const nom = pickFirstString(desc?.nomUsage, desc?.nom);
  const tousPrenoms: string[] = Array.isArray(desc?.prenoms) ? desc.prenoms.filter(Boolean) : [];
  const prenom = tousPrenoms[0] || "";
  // L'etat civil complet : seul endroit du produit ou les prenoms secondaires
  // existent.
  const prenoms = tousPrenoms.join(" ");
  const nomComplet = [nom, prenom].filter(Boolean).join(" ");

  const adresse = pp.adresseEntreprise?.adresse;

  const officers = nomComplet ? [{
    personType: "physique" as const,
    firstName: prenom,
    lastName: nom,
    denomination: null,
    role: "Entrepreneur individuel",
    birthDate: entrepreneur?.descriptionPersonne?.dateDeNaissance || null,
    nationality: entrepreneur?.descriptionPersonne?.nationalite || null,
    siren: null,
    isActive: true,
  }] : [];

  return {
    siren,
    // `nic` reconstitue le SIRET quand la charge ne le porte pas : siret = siren
    // + nic. Il etait extrait par le resume d'entreprise et ignore par le chemin
    // qui ecrit. Pas de colonne pour lui — deux colonnes qui peuvent se
    // contredire valent moins qu'une.
    siret: siretDepuisNic(etab, siren, siret),
    /*
     * ⚠️ PLUS DE `denomination` POUR UNE PERSONNE PHYSIQUE.
     *
     * Elle valait « prenom nom » aplati, et `nom_entreprise` figure dans
     * CHAMPS_SYNCHRONISABLES : la synchronisation ecrivait donc un libelle, puis
     * le declencheur `clients_composer_nom_entreprise` en recomposait un autre a
     * partir de `nom`/`prenom` — deux libelles differents selon l'ordre des
     * affectations. La composition redevient l'affaire du declencheur, a un seul
     * endroit.
     */
    typePersonne: "physique" as const,
    isPersonnePhysique: true,
    nom,
    prenom,
    prenoms,
    formeJuridique: natureCreation?.formeJuridique || "1000",
    dateCreation: natureCreation?.dateCreation || "",
    capitalSocial: 0,
    dirigeant: nomComplet,
    officers,
    // `buildAddress` et non `extractAddressLine` : le second ne lisait que
    // numVoie/typeVoie/voie et JETAIT l'indice de repetition, le complement, le
    // pays et le code INSEE — que le premier sait pourtant extraire, et que
    // `clients` sait desormais stocker.
    adresse: buildAddress(adresse),
    etatAdministratif: etatAdministratifDe(etab),
    nomCommercial: nomCommercialDe(etab),
    codeAPE: etab?.activites?.[0]?.codeApe || "",
    /*
     * `libelleAPE` recevait la MEME expression que `descriptionActivite` : ce
     * n'est pas un libelle NAF, et personne ne le lit. Un code APE determine son
     * libelle — le repeter sur 649 lignes garantirait des divergences. Le champ
     * reste dans le contrat pour ne casser aucun appelant, mais il est vide et
     * dit pourquoi.
     */
    libelleAPE: "",
  };
}

export function extractExploitationData(expl: any, siren: string, siret: string, natureCreation: any): any {
  const etab = expl.etablissementPrincipal || expl.autresEtablissements?.[0];
  const adresse = expl.adresseEntreprise?.adresse;

  return {
    siren,
    // `nic` reconstitue le SIRET quand la charge ne le porte pas : siret = siren
    // + nic. Il etait extrait par le resume d'entreprise et ignore par le chemin
    // qui ecrit. Pas de colonne pour lui — deux colonnes qui peuvent se
    // contredire valent moins qu'une.
    siret: siretDepuisNic(etab, siren, siret),
    denomination: expl.identite?.entreprise?.denomination || "",
    formeJuridique: natureCreation?.formeJuridique || "",
    dateCreation: natureCreation?.dateCreation || "",
    capitalSocial: 0,
    dirigeant: "",
    officers: [],
    // `buildAddress` et non `extractAddressLine` : le second ne lisait que
    // numVoie/typeVoie/voie et JETAIT l'indice de repetition, le complement, le
    // pays et le code INSEE — que le premier sait pourtant extraire, et que
    // `clients` sait desormais stocker.
    adresse: buildAddress(adresse),
    etatAdministratif: etatAdministratifDe(etab),
    nomCommercial: nomCommercialDe(etab),
    codeAPE: etab?.activites?.[0]?.codeApe || "",
    /*
     * `libelleAPE` recevait la MEME expression que `descriptionActivite` : ce
     * n'est pas un libelle NAF, et personne ne le lit. Un code APE determine son
     * libelle — le repeter sur 649 lignes garantirait des divergences. Le champ
     * reste dans le contrat pour ne casser aucun appelant, mais il est vide et
     * dit pourquoi.
     */
    libelleAPE: "",
  };
}

