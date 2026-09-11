/**
 * L'adresse de facturation électronique d'un client.
 * ---------------------------------------------------------------------------
 * La réforme impose que chaque entreprise soit joignable à une adresse, par
 * laquelle ses fournisseurs lui adressent leurs factures. Le cabinet doit la
 * connaître pour chacun de ses clients : sans elle, une facture émise pour leur
 * compte n'arrive nulle part.
 *
 * ⚠️ CE MODULE NE REFUSE JAMAIS RIEN, et c'est sa règle principale. Les formes
 * admises évoluent encore, et une adresse qu'on ne peut pas saisir est pire
 * qu'une adresse saisie de travers : la seconde se corrige à l'écran, la
 * première fait sortir du logiciel et finir dans un tableur. Le contrôle
 * SIGNALE, il n'empêche pas — même modèle que `controlerSaisieTva`, le champ
 * juste au-dessus dans la fiche.
 */

/** Ce qu'on affiche sous le champ, ou rien. */
export interface ControleFacturation {
  niveau: 'valid' | 'warning' | 'invalid';
  message: string;
}

/**
 * L'adresse, débarrassée de ce qui n'en fait pas partie.
 *
 * Les espaces disparaissent SEULEMENT quand ce qui reste est entièrement
 * numérique : « 123 456 789 00012 » est un SIRET recopié depuis un courrier, et
 * les espaces y sont une commodité de lecture. Ailleurs — un identifiant de
 * plateforme, une adresse avec code de routage — une espace peut être
 * signifiante, et la retirer changerait la valeur.
 */
export function normaliserAdresseFacturation(valeur: string | null | undefined): string {
  const brut = (valeur ?? '').trim();
  if (!brut) return '';
  const sansEspaces = brut.replace(/\s+/g, '');
  return /^\d+$/.test(sansEspaces) ? sansEspaces : brut;
}

/** Les quatorze chiffres d'un SIRET, ou `null`. */
function siretDe(valeur: string): string | null {
  return /^\d{14}$/.test(valeur) ? valeur : null;
}

/**
 * Ce que l'écran dit de la saisie — jamais un refus.
 *
 * `siretDuClient` sert au seul contrôle qui vaille vraiment quelque chose :
 * une adresse en forme de SIRET qui n'est PAS celui de la fiche. C'est
 * parfaitement légitime — une filiale fait souvent adresser ses factures au
 * siège — mais c'est aussi la trace d'une ligne recopiée depuis le mauvais
 * dossier. On le montre, on laisse décider.
 */
export function controlerAdresseFacturation(
  valeur: string | null | undefined,
  siretDuClient?: string | null
): ControleFacturation | null {
  const a = normaliserAdresseFacturation(valeur);
  if (!a) return null;

  const siret = siretDe(a);

  if (siret) {
    const duClient = (siretDuClient ?? '').replace(/\s+/g, '');
    if (duClient && siret !== duClient) {
      return {
        niveau: 'warning',
        message:
          "Ce SIRET n'est pas celui de la fiche. C'est possible — une filiale fait adresser " +
          'ses factures au siège — mais vérifiez que ce n’est pas une erreur de dossier.',
      };
    }
    return { niveau: 'valid', message: 'SIRET à quatorze chiffres.' };
  }

  // Une suite de chiffres qui n'en fait pas quatorze est presque toujours un
  // SIRET amputé ou un SIREN pris pour un SIRET. On le dit, sans refuser :
  // certaines plateformes attribuent des identifiants purement numériques.
  if (/^\d+$/.test(a)) {
    if (a.length === 9) {
      return {
        niveau: 'warning',
        message: 'Neuf chiffres : c’est un SIREN. L’adresse attend en général le SIRET (14 chiffres).',
      };
    }
    return {
      niveau: 'warning',
      message: `${a.length} chiffres : un SIRET en fait 14. Vérifiez, ou ignorez s’il s’agit d’un identifiant de plateforme.`,
    };
  }

  // Tout le reste — identifiant de plateforme, SIRET suivi d'un code de
  // routage — est admis sans commentaire : on n'a rien d'utile à en dire, et
  // inventer un avertissement apprendrait à les ignorer tous.
  return null;
}
