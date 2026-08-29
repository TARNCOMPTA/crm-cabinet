import { describe, it, expect } from 'vitest';
import {
  adresseValide,
  construireCourriel,
  corpsEnHtml,
  nettoyerSujet,
  normaliserAdresse,
  normaliserCodeNaf,
  prefixesNaf,
  resoudreDestinataires,
  signerDesinscription,
  substituer,
  verifierSignatureDesinscription,
  type ClientDestinataire,
} from './gabarit.js';

/**
 * Les décisions d'une campagne, isolées de la base et du serveur.
 * ---------------------------------------------------------------------------
 * Trois choses peuvent mal tourner dans un envoi de masse, et toutes sont ici :
 * un client reçoit deux fois, un désinscrit reçoit quand même, ou une raison
 * sociale contenant du balisage casse le courriel de tout le monde.
 *
 * Les chiffres cités viennent de mesures sur le portefeuille réel : 23 adresses
 * partagées par 54 clients, 5 adresses invalides, 248 fiches sans adresse.
 */

function client(p: Partial<ClientDestinataire> & { id: string }): ClientDestinataire {
  return {
    nom_entreprise: null,
    dirigeant: null,
    numero_dossier: null,
    date_cloture: null,
    regime_fiscal: null,
    email: null,
    email_2: null,
    ...p,
  };
}

describe('adresses', () => {
  it('normalise la casse et les espaces', () => {
    expect(normaliserAdresse('  Jean@Exemple.FR ')).toBe('jean@exemple.fr');
    expect(normaliserAdresse(null)).toBe('');
  });

  /** Les cinq formes trouvees dans le portefeuille reel. */
  it('ecarte ce qui echouera a coup sur', () => {
    for (const mauvais of ['', '   ', 'pasdarobase.fr', 'a@b', 'a@b.f', 'a b@c.fr', 'a@ b.fr', null]) {
      expect(adresseValide(mauvais), String(mauvais)).toBe(false);
    }
  });

  it('accepte les formes ordinaires', () => {
    for (const bon of ['a@b.fr', 'prenom.nom@sous.domaine.co.uk', 'X+tag@Exemple.COM']) {
      expect(adresseValide(bon), bon).toBe(true);
    }
  });

  it('refuse une adresse absurdement longue', () => {
    expect(adresseValide(`${'a'.repeat(250)}@b.fr`)).toBe(false);
  });
});

describe('resoudreDestinataires', () => {
  it('retient un client joignable', () => {
    const s = resoudreDestinataires([client({ id: '1', email: 'a@b.fr' })], new Set());
    expect(s.retenus).toHaveLength(1);
    expect(s.exclus).toHaveLength(0);
  });

  /**
   * ⭐ LE DEDOUBLONNAGE. 23 adresses du portefeuille sont partagees par 54 clients.
   * Sans cette etape, ces personnes recoivent deux ou trois fois le meme courriel.
   */
  it('n envoie qu une fois par adresse, casse et espaces confondues', () => {
    const s = resoudreDestinataires(
      [
        client({ id: '1', nom_entreprise: 'PREMIERE', email: 'groupe@exemple.fr' }),
        client({ id: '2', nom_entreprise: 'SECONDE', email: '  Groupe@Exemple.FR ' }),
        client({ id: '3', nom_entreprise: 'TROISIEME', email: 'groupe@exemple.fr' }),
      ],
      new Set()
    );
    expect(s.retenus.map((c) => c.id)).toEqual(['1']);
    expect(s.exclus).toHaveLength(2);
    expect(s.exclus.every((e) => e.motif === 'doublon')).toBe(true);
    // Le motif dit AU PROFIT DE QUI, sinon l'utilisateur ne peut pas verifier.
    expect(s.exclus[0]?.auProfitDe).toBe('PREMIERE');
  });

  it('ecarte un desinscrit, meme avec une adresse valide', () => {
    const s = resoudreDestinataires(
      [client({ id: '1', email: 'a@b.fr' }), client({ id: '2', email: 'c@d.fr' })],
      new Set(['2'])
    );
    expect(s.retenus.map((c) => c.id)).toEqual(['1']);
    expect(s.exclus[0]).toMatchObject({ clientId: '2', motif: 'desinscrit' });
  });

  /** L'ordre des motifs est celui du diagnostic : la cause la plus en amont. */
  it('annonce « sans adresse » plutot que « desinscrit » quand les deux valent', () => {
    const s = resoudreDestinataires([client({ id: '1', email: null })], new Set(['1']));
    expect(s.exclus[0]?.motif).toBe('sans-adresse');
  });

  it('ecarte un client retire a la main, avec son propre motif', () => {
    const s = resoudreDestinataires(
      [client({ id: '1', email: 'a@b.fr' }), client({ id: '2', email: 'c@d.fr' })],
      new Set(),
      new Set(['2'])
    );
    expect(s.retenus.map((c) => c.id)).toEqual(['1']);
    expect(s.exclus[0]).toMatchObject({ clientId: '2', motif: 'retire-a-la-main' });
  });

  /**
   * ⭐ LA CASCADE, et c'est le cas qui justifie l'ordre des tests.
   *
   * Deux societes d'un meme groupe partagent une adresse ; le dedoublonnage n'en
   * garde qu'une. Si l'utilisateur retire PRECISEMENT celle-la, sa jumelle doit
   * prendre sa place — sinon un retrait cible ferait disparaitre le groupe entier,
   * ce que personne n'attend.
   */
  it('laisse la jumelle prendre la place du client retire', () => {
    const clients = [
      client({ id: '1', nom_entreprise: 'PREMIERE', email: 'groupe@exemple.fr' }),
      client({ id: '2', nom_entreprise: 'SECONDE', email: 'groupe@exemple.fr' }),
    ];
    // Sans retrait : la premiere passe, la seconde est un doublon.
    expect(resoudreDestinataires(clients, new Set()).retenus.map((c) => c.id)).toEqual(['1']);
    // En retirant la premiere : la seconde prend sa place, l'adresse reste servie.
    const s = resoudreDestinataires(clients, new Set(), new Set(['1']));
    expect(s.retenus.map((c) => c.id)).toEqual(['2']);
    expect(s.exclus.map((e) => e.motif)).toEqual(['retire-a-la-main']);
  });

  it('un retrait a la main n est pas annonce comme un desinscrit', () => {
    const s = resoudreDestinataires(
      [client({ id: '1', email: 'a@b.fr' })],
      new Set(['1']),
      new Set(['1'])
    );
    // Le desinscrit l'emporte : c'est la decision du CLIENT, pas celle du cabinet.
    expect(s.exclus[0]?.motif).toBe('desinscrit');
  });

  it('distingue une adresse absente d une adresse invalide', () => {
    const s = resoudreDestinataires(
      [client({ id: '1', email: '  ' }), client({ id: '2', email: 'pasdarobase' })],
      new Set()
    );
    expect(s.exclus.map((e) => e.motif)).toEqual(['sans-adresse', 'adresse-invalide']);
  });

  /**
   * ⭐ LA SECONDE ADRESSE. Ce qui suit fige le contrat annonce en tete de
   * `resoudreDestinataires` : les retenus se comptent EN ADRESSES, les exclus EN
   * CLIENTS QUI NE RECOIVENT RIEN.
   */
  it('sert les deux adresses d une meme fiche, la premiere d abord', () => {
    const s = resoudreDestinataires(
      [client({ id: '1', nom_entreprise: 'DEUX', email: 'a@b.fr', email_2: 'c@d.fr' })],
      new Set()
    );
    expect(s.retenus.map((c) => c.email)).toEqual(['a@b.fr', 'c@d.fr']);
    // Deux courriels, un seul client : c'est le nombre d'ADRESSES qui compte.
    expect(s.retenus).toHaveLength(2);
    expect(s.exclus).toHaveLength(0);
  });

  /**
   * Le cas le PLUS FREQUENT d'une seconde adresse : la meme, recopiee. Elle ne
   * doit produire ni second courriel, ni ligne d'exclusion — le client est
   * servi, il n'y a rien a signaler.
   */
  it('absorbe en silence une seconde adresse identique a la premiere', () => {
    const s = resoudreDestinataires(
      [client({ id: '1', email: 'a@b.fr', email_2: '  A@B.FR ' })],
      new Set()
    );
    expect(s.retenus.map((c) => c.email)).toEqual(['a@b.fr']);
    expect(s.exclus).toHaveLength(0);
  });

  it('sert une fiche qui n a QUE la seconde adresse', () => {
    const s = resoudreDestinataires(
      [client({ id: '1', email: null, email_2: 'c@d.fr' })],
      new Set()
    );
    expect(s.retenus.map((c) => c.email)).toEqual(['c@d.fr']);
    expect(s.exclus).toHaveLength(0);
  });

  /**
   * Le corollaire assume : une seconde adresse fausse n'exclut pas un client que
   * sa premiere rend joignable. L'inscrire dans `exclus` ferait mentir le
   * compteur « n ecarte(s) », qui designerait alors des clients servis.
   */
  it('n exclut pas un client dont seule la seconde adresse est invalide', () => {
    const s = resoudreDestinataires(
      [client({ id: '1', email: 'a@b.fr', email_2: 'pasdarobase' })],
      new Set()
    );
    expect(s.retenus.map((c) => c.email)).toEqual(['a@b.fr']);
    expect(s.exclus).toHaveLength(0);
  });

  it('annonce « adresse invalide » quand AUCUNE des deux ne tient', () => {
    const s = resoudreDestinataires(
      [client({ id: '1', email: 'pasdarobase', email_2: 'a@b' })],
      new Set()
    );
    expect(s.retenus).toHaveLength(0);
    expect(s.exclus).toEqual([
      { clientId: '1', nom: '(sans nom)', motif: 'adresse-invalide' },
    ]);
  });

  it('annonce « sans adresse » quand les deux champs sont vides', () => {
    const s = resoudreDestinataires(
      [client({ id: '1', email: '  ', email_2: null })],
      new Set()
    );
    expect(s.exclus.map((e) => e.motif)).toEqual(['sans-adresse']);
  });

  /**
   * ⭐ CE QUE LA SECONDE ADRESSE CHANGE AU DEDOUBLONNAGE, et le cas qui aurait
   * ete faux avec un simple « une ligne par client ».
   *
   * Deux societes d'un groupe partagent l'adresse du dirigeant ; la seconde en a
   * une AUTRE en plus. Elle etait auparavant ecartee comme doublon et ne recevait
   * rien. Elle est desormais servie sur son adresse propre — et n'apparait plus
   * dans les exclus, puisqu'elle recoit.
   */
  it('sert la jumelle sur sa seconde adresse au lieu de l ecarter', () => {
    const s = resoudreDestinataires(
      [
        client({ id: '1', nom_entreprise: 'PREMIERE', email: 'groupe@exemple.fr' }),
        client({
          id: '2',
          nom_entreprise: 'SECONDE',
          email: 'groupe@exemple.fr',
          email_2: 'propre@exemple.fr',
        }),
      ],
      new Set()
    );
    expect(s.retenus.map((c) => [c.id, c.email])).toEqual([
      ['1', 'groupe@exemple.fr'],
      ['2', 'propre@exemple.fr'],
    ]);
    expect(s.exclus).toHaveLength(0);
  });

  it('ecarte le client dont LES DEUX adresses sont deja servies', () => {
    const s = resoudreDestinataires(
      [
        client({ id: '1', nom_entreprise: 'PREMIERE', email: 'a@b.fr', email_2: 'c@d.fr' }),
        client({ id: '2', nom_entreprise: 'SECONDE', email: 'c@d.fr', email_2: 'a@b.fr' }),
      ],
      new Set()
    );
    expect(s.retenus.map((c) => c.email)).toEqual(['a@b.fr', 'c@d.fr']);
    expect(s.exclus).toEqual([
      { clientId: '2', nom: 'SECONDE', motif: 'doublon', auProfitDe: 'PREMIERE' },
    ]);
  });

  /**
   * La desinscription est celle du CLIENT, pas d'une adresse : le lien du
   * courriel signe un identifiant de client (`urlDesinscription`), et
   * `accepte_mailings` vit sur la fiche. Se desinscrire depuis l'une des deux
   * adresses coupe donc les deux — c'est la seule lecture defendable d'un « je ne
   * veux plus recevoir ».
   */
  it('coupe LES DEUX adresses d un desinscrit', () => {
    const s = resoudreDestinataires(
      [client({ id: '1', email: 'a@b.fr', email_2: 'c@d.fr' })],
      new Set(['1'])
    );
    expect(s.retenus).toHaveLength(0);
    expect(s.exclus.map((e) => e.motif)).toEqual(['desinscrit']);
  });

  it('retire LES DEUX adresses d un client retire a la main', () => {
    const s = resoudreDestinataires(
      [client({ id: '1', email: 'a@b.fr', email_2: 'c@d.fr' })],
      new Set(),
      new Set(['1'])
    );
    expect(s.retenus).toHaveLength(0);
    expect(s.exclus.map((e) => e.motif)).toEqual(['retire-a-la-main']);
  });
});

describe('substituer', () => {
  const c = client({
    id: '1',
    nom_entreprise: 'DUPONT SARL',
    dirigeant: 'Marie Dupont',
    numero_dossier: 'D-042',
  });

  it('remplace les variables connues', () => {
    expect(substituer('Bonjour {{dirigeant}} de {{nom_entreprise}}', c)).toBe(
      'Bonjour Marie Dupont de DUPONT SARL'
    );
  });

  it('tolere les espaces et la casse dans le marqueur', () => {
    expect(substituer('{{ Dirigeant }}', c)).toBe('Marie Dupont');
  });

  /**
   * ⭐ Une variable INCONNUE reste visible. La faire disparaitre donnerait un
   * courriel amputé sans que personne ne s'en aperçoive ; bien en vue dans
   * l'aperçu, elle se corrige avant l'envoi.
   */
  it('laisse une variable inconnue telle quelle', () => {
    expect(substituer('Bonjour {{dirigeant2}}', c)).toBe('Bonjour {{dirigeant2}}');
  });

  it('rend une chaine vide pour une variable connue non renseignee', () => {
    expect(substituer('Regime : {{regime_fiscal}}.', c)).toBe('Regime : .');
  });

  /**
   * ⭐ LA VALEUR VIENT D'UNE SAISIE LIBRE, parfois reprise de l'INPI. Une raison
   * sociale contenant du balisage ne doit pas atteindre le courriel.
   */
  it('echappe la valeur substituee', () => {
    const hostile = client({ id: '1', nom_entreprise: '<script>alert(1)</script> & Cie' });
    expect(substituer('{{nom_entreprise}}', hostile)).toBe(
      '&lt;script&gt;alert(1)&lt;/script&gt; &amp; Cie'
    );
  });
});

describe('corpsEnHtml', () => {
  const c = client({ id: '1', nom_entreprise: 'DUPONT SARL' });

  it('fait un paragraphe par bloc et un <br /> par saut simple', () => {
    const html = corpsEnHtml('Ligne un\nLigne deux\n\nSecond bloc', c);
    expect(html).toContain('Ligne un<br />Ligne deux');
    expect(html.match(/<p /g)).toHaveLength(2);
  });

  /**
   * ⭐ L'ORDRE : echapper le corps, PUIS substituer. Dans l'autre sens, une raison
   * sociale contenant du balisage traverserait l'echappement du corps.
   */
  it('echappe le corps saisi, y compris ses chevrons', () => {
    expect(corpsEnHtml('a < b & c', c)).toContain('a &lt; b &amp; c');
  });

  it('n emet pas de paragraphe vide', () => {
    expect(corpsEnHtml('\n\n\n  \n\n', c)).toBe('');
  });
});

describe('signature de desinscription', () => {
  const secret = 'un-secret-de-test-suffisamment-long';
  const id = '11111111-2222-3333-4444-555555555555';

  it('accepte sa propre signature', () => {
    const s = signerDesinscription(secret, id);
    expect(verifierSignatureDesinscription(secret, id, s)).toBe(true);
  });

  /**
   * ⭐ SANS CELA, N'IMPORTE QUI DESINSCRIT N'IMPORTE QUEL CLIENT en essayant des
   * identifiants — et un uuid de client se retrouve dans les URL de l'application.
   */
  it('refuse la signature d un autre client', () => {
    const autre = '99999999-2222-3333-4444-555555555555';
    expect(verifierSignatureDesinscription(secret, autre, signerDesinscription(secret, id))).toBe(
      false
    );
  });

  it('refuse une signature falsifiee, tronquee ou vide', () => {
    const s = signerDesinscription(secret, id);
    expect(verifierSignatureDesinscription(secret, id, s.slice(0, -1))).toBe(false);
    expect(verifierSignatureDesinscription(secret, id, `${s}x`)).toBe(false);
    expect(verifierSignatureDesinscription(secret, id, '')).toBe(false);
    expect(verifierSignatureDesinscription(secret, '', s)).toBe(false);
  });

  it('refuse une signature emise avec un autre secret', () => {
    expect(verifierSignatureDesinscription(secret, id, signerDesinscription('autre', id))).toBe(
      false
    );
  });
});

describe('nettoyerSujet', () => {
  /**
   * ⭐ INJECTION D'EN-TETE SMTP. Un sujet voyage dans un en-tete, et les en-tetes
   * sont separes par des retours chariot : un `\r\n` permet d'en ajouter d'autres
   * — un `Bcc:` vers un tiers, sur un serveur qui ecrit au nom du cabinet.
   *
   * Le sujet est saisi par un administrateur, mais `substituer` y insere des
   * valeurs de FICHES CLIENTS, parfois reprises de l'INPI. `echapperHtml` protege
   * le HTML, pas les en-tetes.
   */
  it('supprime les retours chariot, quelle que soit leur forme', () => {
    expect(nettoyerSujet('Facture\r\nBcc: voleur@ailleurs.fr')).toBe(
      'Facture Bcc: voleur@ailleurs.fr'
    );
    expect(nettoyerSujet('Facture\nBcc: x')).toBe('Facture Bcc: x');
    expect(nettoyerSujet('Facture\rBcc: x')).toBe('Facture Bcc: x');
  });

  it('supprime les autres caracteres de controle', () => {
    expect(nettoyerSujet('a bcd')).toBe('a b c d');
    expect(nettoyerSujet('a\tb')).toBe('a b');
  });

  it('laisse un sujet ordinaire intact, accents compris', () => {
    expect(nettoyerSujet('Votre échéance de TVA — mars')).toBe('Votre échéance de TVA — mars');
  });

  it('tronque un sujet demesure', () => {
    expect(nettoyerSujet('a'.repeat(500))).toHaveLength(300);
  });

  /** Le cas reel : une raison sociale hostile substituee dans le sujet. */
  it('neutralise une valeur de fiche client porteuse d un saut de ligne', () => {
    const hostile = client({ id: '1', nom_entreprise: 'DUPONT\r\nBcc: voleur@ailleurs.fr' });
    const sujet = nettoyerSujet(substituer('Votre TVA — {{nom_entreprise}}', hostile));
    expect(sujet).not.toMatch(/[\r\n]/);
    expect(sujet).toBe('Votre TVA — DUPONT Bcc: voleur@ailleurs.fr');
  });
});

describe('construireCourriel', () => {
  const o = {
    corps: 'Bonjour {{dirigeant}},\n\nVotre TVA est due.',
    client: client({ id: '1', dirigeant: 'Marie Dupont', nom_entreprise: 'DUPONT SARL' }),
    urlDesinscription: 'https://exemple.fr/desinscription?c=1&s=abc',
    nomCabinet: 'MON CABINET',
  };

  it('contient le corps substitue et le nom du cabinet', () => {
    const html = construireCourriel(o);
    expect(html).toContain('Bonjour Marie Dupont,');
    expect(html).toContain('MON CABINET');
  });

  /** Le pied de desinscription rend l'envoi defendable : il n'est pas optionnel. */
  it('contient toujours le lien de desinscription', () => {
    const html = construireCourriel(o);
    expect(html).toContain('Ne plus recevoir ces informations');
    // L'esperluette de l'URL doit etre echappee, sinon le lien casse.
    expect(html).toContain('s=abc');
    expect(html).toContain('&amp;s=abc');
  });

  it('est un document HTML complet', () => {
    expect(construireCourriel(o).startsWith('<!doctype html>')).toBe(true);
  });
});

describe('code NAF', () => {
  /**
   * ⭐ LES TROIS ECRITURES DU MEME CODE. Une fiche saisie a la main porte
   * `6201Z`, une fiche reprise d'un avis de situation `62.01Z`, une fiche collee
   * depuis un extrait `62.01 Z`. Une comparaison brute en manquerait deux sur
   * trois, et l'ecran annoncerait un effectif credible mais faux.
   */
  it('rapproche les ecritures d un meme code', () => {
    for (const forme of ['6201Z', '62.01Z', '62.01 Z', ' 6201z ', '62-01-z']) {
      expect(normaliserCodeNaf(forme), forme).toBe('6201Z');
    }
  });

  it('rend une chaine vide pour une saisie sans code', () => {
    expect(normaliserCodeNaf(null)).toBe('');
    expect(normaliserCodeNaf('  ')).toBe('');
    expect(normaliserCodeNaf('.')).toBe('');
  });

  /** Un code fait cinq caracteres : au-dela, ce n'est plus un code. */
  it('tronque une saisie trop longue plutot que de viser large', () => {
    expect(normaliserCodeNaf('6201Z6201Z')).toBe('6201Z');
  });

  it('dedoublonne et ignore les vides', () => {
    expect(prefixesNaf(['6201Z', '62.01 Z', '', null as unknown as string])).toEqual(['6201Z']);
    expect(prefixesNaf(undefined)).toEqual([]);
    expect(prefixesNaf([])).toEqual([]);
  });

  /**
   * ⭐ LE PLUS LARGE L'EMPORTE. `62` vise deja toute la division, `6201Z` n'y
   * ajoute rien. Garder les deux afficherait deux filtres la ou un seul agit, et
   * l'utilisateur croirait avoir restreint sa cible en ajoutant le second.
   */
  it('ecarte un code deja couvert par une division retenue', () => {
    expect(prefixesNaf(['6201Z', '62'])).toEqual(['62']);
    expect(prefixesNaf(['62', '6201Z', '6202A'])).toEqual(['62']);
  });

  it('garde des codes qui ne se recouvrent pas, tries', () => {
    expect(prefixesNaf(['43', '41', '4120A'])).toEqual(['41', '43']);
    expect(prefixesNaf(['6201Z', '6820A'])).toEqual(['6201Z', '6820A']);
  });
});
