import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { chromium, type Browser, type BrowserContext, type Page } from 'playwright';

/**
 * L'application, pilotée dans un vrai navigateur.
 * ---------------------------------------------------------------------------
 * Ce que cette suite couvre et qu'aucune autre ne peut atteindre : le parcours
 * d'authentification. La connexion se fait par passkey — empreinte, visage ou
 * code de l'appareil — et rien de tout cela ne se script. Chromium expose
 * cependant un authentificateur VIRTUEL par le protocole DevTools
 * (`WebAuthn.enable` puis `addVirtualAuthenticator`) qui répond aux appels de
 * `navigator.credentials` exactement comme le ferait le vrai. C'est le seul
 * angle depuis lequel l'enrôlement et la connexion sont observables.
 *
 * Elle a payé son écriture le premier jour, en trouvant deux défauts que ni le
 * compilateur, ni les tests unitaires, ni la CI ne pouvaient voir :
 *
 *   · aucun `<label>` du produit n'était lié à son champ. Playwright cherche
 *     les champs par leur nom accessible — comme une aide technique — et n'en
 *     trouvait aucun. 255 `<Input>` et 101 `<Select>` étaient concernés ;
 *
 *   · la limitation de débit comptait les enrôlements RÉUSSIS. Un cabinet
 *     accueillant plusieurs collaborateurs le même matin, tous derrière la même
 *     adresse publique, voyait le sixième refusé un quart d'heure durant.
 *
 * Sans instance en face, la suite est ignorée plutôt qu'en échec — même parti
 * pris que schema.test.ts. Il lui faut deux variables :
 *
 *   E2E_BASE_URL          l'adresse d'une instance qui tourne
 *   E2E_CODE_ENROLEMENT   un code frais, obtenu par `npm run enrolement`
 *
 * Le code est à usage unique : une exécution le consomme.
 */

const BASE = process.env.E2E_BASE_URL;
const CODE = process.env.E2E_CODE_ENROLEMENT;

const suite = BASE && CODE ? describe : describe.skip;

suite('parcours de bout en bout', () => {
  let navigateur: Browser;
  let contexte: BrowserContext;
  let page: Page;

  /** Ressources réellement téléchargées, pour vérifier le découpage du bundle. */
  let recus: string[] = [];
  const erreursConsole: string[] = [];

  beforeAll(async () => {
    navigateur = await chromium.launch();
    contexte = await navigateur.newContext({ viewport: { width: 1440, height: 900 } });
    page = await contexte.newPage();

    page.on('console', (m) => {
      if (m.type() === 'error') erreursConsole.push(m.text());
    });
    page.on('pageerror', (e) => erreursConsole.push('pageerror: ' + e.message));
    page.on('response', (r) => {
      const u = r.url();
      if (u.includes('/assets/')) recus.push(u.split('/assets/')[1]);
    });

    const cdp = await contexte.newCDPSession(page);
    await cdp.send('WebAuthn.enable');
    await cdp.send('WebAuthn.addVirtualAuthenticator', {
      options: {
        protocol: 'ctap2',
        transport: 'internal',
        hasResidentKey: true,
        hasUserVerification: true,
        isUserVerified: true,
        automaticPresenceSimulation: true,
      },
    });
  }, 60_000);

  afterAll(async () => {
    await navigateur?.close();
  });

  it('sert la page de connexion', async () => {
    await page.goto(BASE!, { waitUntil: 'networkidle' });
    expect(await page.title()).toContain('CRM Cabinet');
    await expect
      .poll(() => page.getByRole('button', { name: /Se connecter/i }).isVisible())
      .toBe(true);
  });

  /**
   * jsPDF pèse 448 ko et ne sert qu'à l'export d'une fiche client. Il a déjà été
   * tiré au premier chargement une fois — un morceau nommé dans `manualChunks`
   * s'était retrouvé en `modulepreload` dans index.html. Rien ne le signalait
   * hors du navigateur.
   */
  it('ne charge aucun morceau PDF au premier écran', () => {
    expect(recus.length).toBeGreaterThan(0);
    expect(recus.filter((u) => /jspdf|clientPdfExport|vendor-pdf/i.test(u))).toEqual([]);
  });

  it('enrôle une passkey depuis un code, et ouvre la session', async () => {
    await page.getByRole('button', { name: /Premier appareil ou nouvel appareil/i }).click();
    // Recherche par NOM ACCESSIBLE : c'est ce qui exige que le libellé soit lié
    // au champ, et c'est par là que le défaut d'accessibilité s'est révélé.
    await page.getByLabel(/Code d.enr/i).fill(CODE!);
    await page.getByRole('button', { name: /Enr/i }).first().click();

    await page.waitForURL(/\/dashboard/, { timeout: 30_000 });
    expect(page.url()).toContain('/dashboard');
  }, 60_000);

  it('affiche le tableau de bord', async () => {
    // Attendre le TITRE, pas la fin du réseau : React rend après, et une
    // vérification posée sur `networkidle` ne voit qu'une page vide.
    const salut = page.getByRole('heading', { name: /Bonjour/i }).first();
    await salut.waitFor({ timeout: 30_000 });
    expect(await salut.isVisible()).toBe(true);
  }, 45_000);

  it('reconnecte par la seule passkey, sans code', async () => {
    await contexte.clearCookies();
    await page.goto(BASE!, { waitUntil: 'networkidle' });
    await page.getByRole('button', { name: /Se connecter/i }).click();
    await page.waitForURL(/\/dashboard/, { timeout: 30_000 });
    expect(page.url()).toContain('/dashboard');
  }, 60_000);

  it('ne charge pas les 18 sections de paramètres d’un coup', async () => {
    recus = [];
    await page.goto(BASE + '/settings', { waitUntil: 'networkidle' });
    // Le champ de recherche plutot qu'un libelle : l'ecran porte aussi un
    // `<select>` masque — le selecteur de section en affichage etroit — dont les
    // `<option>` repondent aux recherches par texte et ne sont jamais visibles.
    await page.getByPlaceholder(/Rechercher un param/i).waitFor({ timeout: 30_000 });

    expect(recus.some((u) => /^Settings-/.test(u))).toBe(true);
    // Les deux plus gros écrans du produit n'ont aucune raison d'arriver tant
    // qu'on ne les ouvre pas.
    expect(recus.filter((u) => /^SettingsIncompleteClients-|^SettingsUsers-/.test(u))).toEqual([]);
  }, 45_000);

  it('charge la section « Utilisateurs » au moment où on l’ouvre', async () => {
    recus = [];
    const recherche = page.getByPlaceholder(/Rechercher un param/i);
    await recherche.waitFor({ timeout: 15_000 });
    await recherche.fill('Utilisateurs');

    // Par ROLE : `getByText` resolvait sur l'`<option>` masque du selecteur
    // etroit, jamais sur l'entree de menu.
    const entree = page.getByRole('button', { name: /Utilisateurs/ }).first();
    await entree.waitFor({ timeout: 15_000 });
    await entree.click();

    await page
      .waitForResponse((r) => /\/assets\/SettingsUsers-/.test(r.url()), { timeout: 20_000 })
      .catch(() => {});
    expect(recus.some((u) => /^SettingsUsers-/.test(u))).toBe(true);
  }, 60_000);

  /**
   * `profiles` est réservée aux administrateurs en écriture — elle porte `role`
   * et `is_active`. L'exception qui ouvre les colonnes personnelles sur SA
   * propre ligne se vérifie ici, de bout en bout : sans elle, cet écran
   * répondait « Erreur lors de la mise à jour du profil » à tout collaborateur.
   */
  it('enregistre son propre profil', async () => {
    await page.goto(BASE + '/settings', { waitUntil: 'networkidle' });
    const champ = page.getByLabel(/^Pr[ée]nom$/i).first();
    await champ.waitFor({ timeout: 30_000 });
    await champ.fill('Prenom-Verifie');

    await page.getByRole('button', { name: /Enregistrer|Sauvegarder/i }).first().click();

    await expect
      .poll(
        () => page.getByText(/Erreur lors de la mise à jour/i).first().isVisible().catch(() => false),
        { timeout: 10_000 }
      )
      .toBe(false);
    await expect
      .poll(() => page.getByText(/succès/i).first().isVisible().catch(() => false), { timeout: 10_000 })
      .toBe(true);
  }, 60_000);

  it('ouvre l’écran des tâches sans planter', async () => {
    await page.goto(BASE + '/tasks', { waitUntil: 'networkidle' });
    const plantage = await page
      .getByText(/Une erreur est survenue|Something went wrong/i)
      .first()
      .isVisible()
      .catch(() => false);
    expect(plantage).toBe(false);
  }, 45_000);

  /**
   * Le suivi des échéances, sans identifiants jedeclare — l'état dans lequel la
   * CI, et toute instance fraîchement installée, le rencontrent.
   *
   * Ce seul cas attrape trois choses qu'aucun test hors navigateur ne voit :
   * un import paresseux cassé, une route absente, et un plantage sur données
   * vides. C'est précisément l'état « rien en cache », celui où un tableau mal
   * écrit lit un `undefined` et fait tomber l'écran.
   */
  it('ouvre le suivi des échéances et annonce qu’il n’est pas configuré', async () => {
    await page.goto(BASE + '/suivi-echeances', { waitUntil: 'networkidle' });

    const titre = page.getByRole('heading', { name: /Suivi .ch.ances/i }).first();
    await titre.waitFor({ timeout: 30_000 });

    await expect
      .poll(() => page.getByText(/Suivi jedeclare non configur/i).first().isVisible(), {
        timeout: 15_000,
      })
      .toBe(true);

    // Le bouton d'analyse n'a rien à faire là tant qu'aucun compte n'est
    // renseigné : il appellerait une route qui répond 503.
    expect(await page.getByRole('button', { name: /^Analyser$/ }).isVisible().catch(() => false))
      .toBe(false);
  }, 45_000);

  /**
   * Les quatre colonnes completees DIRECTEMENT DANS LA LISTE, pour une fiche
   * qui n'a rien.
   *
   * Trois choses qu'aucun test hors navigateur ne verrait : que la case
   * apparaisse bien à la place du tiret, que quitter le champ enregistre, et
   * surtout QUE LA VALEUR TIENNE APRÈS RECHARGEMENT — une mise à jour d'état
   * réussie sur un écrit raté aurait exactement la même apparence.
   *
   * Le client « SANS EMAIL SARL » est semé par le job `navigateur` de la CI,
   * comme le cabinet : la liste doit contenir une fiche sans email pour que la
   * case existe.
   */
  it('permet de completer les champs manquants sans ouvrir la fiche', async () => {
    await page.goto(BASE + '/clients', { waitUntil: 'networkidle' });

    // « Mes dossiers » est coche PAR DEFAUT (`profiles.show_my_dossiers`), et la
    // fiche semee n'est assignee a personne : sans ce decochage la liste est
    // vide et le test chercherait une ligne qui ne peut pas exister.
    const mesDossiers = page.getByRole('checkbox', { name: /Mes dossiers/i }).first();
    await mesDossiers.waitFor({ timeout: 30_000 });
    if (await mesDossiers.isChecked()) await mesDossiers.uncheck();

    // La ligne est reperee par son TEXTE et non par le role « row » : dnd-kit
    // pose `role="button"` sur le <tr> pour le glisser-deposer au clavier, ce
    // qui efface le role implicite de ligne de tableau.
    const ligne = page.locator('tbody tr', { hasText: 'SANS EMAIL SARL' }).first();
    await ligne.waitFor({ timeout: 30_000 });

    const champ = ligne.getByLabel(/Email du client/i);
    await expect.poll(() => champ.isVisible(), { timeout: 15_000 }).toBe(true);

    // Un format invalide se dit sur place, et n'enregistre rien.
    await champ.fill('pas-un-email');
    await champ.blur();
    await expect
      .poll(() => page.getByText(/Format email invalide/i).first().isVisible(), { timeout: 5_000 })
      .toBe(true);

    // Puis une adresse valable : la cellule doit basculer en lien mailto.
    await champ.fill('contact@sans-email.invalid');
    await champ.blur();
    await expect
      .poll(
        () =>
          ligne
            .getByRole('link', { name: /contact@sans-email\.invalid/i })
            .first()
            .isVisible()
            .catch(() => false),
        { timeout: 15_000 }
      )
      .toBe(true);

    // --- le numéro de dossier : même geste, autre colonne ---
    const dossier = ligne.getByLabel(/Numero de dossier du client/i);
    await dossier.fill('D-2026-001');
    await dossier.blur();
    await expect
      .poll(() => ligne.getByText('D-2026-001').first().isVisible().catch(() => false), {
        timeout: 15_000,
      })
      .toBe(true);

    // --- le régime : un choix, pas une frappe. LA CELLULE DOIT AFFICHER LE
    //     LIBELLÉ (« IS reel »), pas le code stocké (« IS_REEL ») ---
    await ligne.getByLabel(/Regime fiscal du client/i).selectOption('IS_REEL');
    await expect
      .poll(() => ligne.getByText('IS reel', { exact: true }).first().isVisible().catch(() => false), {
        timeout: 15_000,
      })
      .toBe(true);

    // --- la clôture : un mois, affiché en toutes lettres ---
    await ligne.getByLabel(/Mois de cloture du client/i).selectOption('06');
    await expect
      .poll(() => ligne.getByText('juin', { exact: true }).first().isVisible().catch(() => false), {
        timeout: 15_000,
      })
      .toBe(true);

    // LE POINT QUI COMPTE : après rechargement, les valeurs viennent de la base
    // et non d'un état local optimiste. Une mise à jour d'état réussie sur un
    // écrit raté aurait exactement la même apparence.
    await page.reload({ waitUntil: 'networkidle' });
    const relue = page.locator('tbody tr', { hasText: 'SANS EMAIL SARL' }).first();
    await relue.waitFor({ timeout: 30_000 });
    for (const attendu of ['contact@sans-email.invalid', 'D-2026-001', 'IS reel', 'juin']) {
      await expect
        .poll(() => relue.getByText(attendu, { exact: true }).first().isVisible().catch(() => false), {
          timeout: 15_000,
        })
        .toBe(true);
    }
  }, 120_000);

  /**
   * L'onglet « Parts » de la fiche client, sur une fiche vierge.
   *
   * ⚠️ CE QUE CE CAS PROTEGE N'EST PAS L'AFFICHAGE, C'EST LE REFUS DE DEVINER.
   * L'onglet lit `client_associes` et divise par `clients.parts_totales`. Sur
   * une fiche qui ne porte ni l'un ni l'autre, deux erreurs seraient faciles et
   * indolores : annoncer « aucun associe » la ou il faut dire « aucune
   * REPARTITION SAISIE » — une societe a toujours des associes — et afficher
   * « 0 % » la ou le total est inconnu. Un zero se lit comme un fait ; le
   * chiffre finirait dans une attestation.
   *
   * C'est aussi le PREMIER parcours de cette suite sur la fiche client. Il reste
   * volontairement modeste : ouvrir, lire, verifier ce qui est dit. Un parcours
   * de saisie complet y serait fragile — il faudrait semer une personne dans
   * `company_officers` — et il est couvert ailleurs, sur le harnais local.
   */
  it('dit « aucune répartition saisie » sans jamais afficher 0 %', async () => {
    await page.goto(BASE + '/clients', { waitUntil: 'networkidle' });

    const mesDossiers = page.getByRole('checkbox', { name: /Mes dossiers/i }).first();
    await mesDossiers.waitFor({ timeout: 30_000 });
    if (await mesDossiers.isChecked()) await mesDossiers.uncheck();

    const ligne = page.locator('tbody tr', { hasText: 'SANS EMAIL SARL' }).first();
    await ligne.waitFor({ timeout: 30_000 });
    await ligne.getByRole('link').first().click();
    await page.waitForURL(/\/clients\/[0-9a-f-]{36}/, { timeout: 30_000 });

    // `role: 'tab'` depuis que `TabsTrigger` porte le motif ARIA complet. Ce
    // selecteur EST une assertion : avant, l'onglet se cherchait comme un
    // `button` faute de mieux, et le commentaire d'alors le disait.
    const onglet = page.getByRole('tab', { name: 'Parts', exact: true });
    await onglet.click();
    // Ce que le lecteur d'ecran annonce apres le clic, et que rien ne disait :
    // l'onglet est selectionne, et le panneau visible est le sien.
    await expect.poll(() => onglet.getAttribute('aria-selected'), { timeout: 15_000 }).toBe('true');
    expect(await page.getByRole('tabpanel').count()).toBe(1);

    // L'etat vide nomme ce qui manque : la SAISIE, et non les associes.
    //
    // ⚠️ L'ACCENT DE « répartition » EST DANS LE MOTIF, ET C'EST VOLONTAIRE.
    // `getByText` est insensible a la casse quand on le lui demande, JAMAIS aux
    // accents : `/repartition/i` ne trouve pas « répartition ». Ce test a casse
    // exactement comme ca, le 2026-08-29, quand l'onglet est passe d'un texte
    // sans accents a du francais correct — et il a casse EN CI, pas avant,
    // parce que `npm test` saute cette suite faute de `E2E_BASE_URL`.
    //
    // Le motif reste donc strict sur la forme accentuee : il ne se contente pas
    // de suivre le produit, il retient la correction. Un retour a
    // « Aucune repartition saisie » le ferait echouer, ce qui est le but.
    await expect
      .poll(
        () => page.getByText(/Aucune répartition saisie/i).first().isVisible().catch(() => false),
        { timeout: 20_000 }
      )
      .toBe(true);

    // Et nulle part un pourcentage : sans total declare, il n'y a rien a diviser.
    const zero = await page
      .getByText(/0[.,]00\s*%/)
      .first()
      .isVisible()
      .catch(() => false);
    expect(zero, 'un « 0 % » est affiche la ou le total de parts est inconnu').toBe(false);
  }, 120_000);

  /**
   * L'ascenseur horizontal de la liste clients.
   *
   * ⚠️ CE CAS NE SE VOIT QUE DANS UN NAVIGATEUR, et il ne se voyait pas du tout
   * avant qu'on le signale : le `overflow-x-auto` d'origine posait sa barre au
   * BAS DE SON CONTENU. Avec cinquante lignes, elle se retrouvait des milliers
   * de pixels sous la fenetre et les colonnes de droite etaient inatteignables
   * — sauf en filtrant, ce qui raccourcissait la liste et ramenait la barre a
   * l'ecran. D'ou un defaut qui avait l'air intermittent.
   *
   * Le test verifie ce qui compte : que l'ascenseur soit DANS LA FENETRE, et
   * qu'en le poussant on amene reellement la derniere colonne sous les yeux.
   */
  it('donne un ascenseur atteignable pour les colonnes de droite', async () => {
    await page.goto(BASE + '/clients', { waitUntil: 'networkidle' });

    const mesDossiers = page.getByRole('checkbox', { name: /Mes dossiers/i }).first();
    await mesDossiers.waitFor({ timeout: 30_000 });
    if (await mesDossiers.isChecked()) await mesDossiers.uncheck();
    await page.locator('tbody tr').first().waitFor({ timeout: 30_000 });

    // Le tableau doit deborder, sinon il n'y a rien a prouver ici.
    const deborde = await page.evaluate(() => {
      const c = document.querySelector('table')?.closest('div');
      return c ? c.scrollWidth - c.clientWidth : 0;
    });
    expect(deborde).toBeGreaterThan(0);

    const rail = page.locator('[data-ascenseur]').first();
    await rail.waitFor({ timeout: 15_000 });

    // Le point du test : la barre est visible SANS defiler la page.
    const dansLaFenetre = await page.evaluate(() => {
      const r = document.querySelector('[data-ascenseur]')?.getBoundingClientRect();
      return !!r && r.top >= 0 && r.bottom <= window.innerHeight + 1;
    });
    expect(dansLaFenetre).toBe(true);

    // Et en le poussant a droite, la derniere colonne entre dans le champ.
    const r = await rail.boundingBox();
    const curseur = await rail.locator('> div').first().boundingBox();
    if (!r || !curseur) throw new Error('Ascenseur introuvable.');
    await page.mouse.move(curseur.x + curseur.width / 2, curseur.y + curseur.height / 2);
    await page.mouse.down();
    await page.mouse.move(r.x + r.width, curseur.y + curseur.height / 2, { steps: 10 });
    await page.mouse.up();

    await expect
      .poll(
        () =>
          page.evaluate(() => {
            const c = document.querySelector('table')?.closest('div');
            return c ? c.scrollLeft : 0;
          }),
        { timeout: 10_000 }
      )
      .toBeGreaterThan(0);

    const derniereVisible = await page.evaluate(() => {
      const th = document.querySelector('thead tr')?.lastElementChild?.getBoundingClientRect();
      return !!th && th.right <= window.innerWidth + 1;
    });
    expect(derniereVisible).toBe(true);
  }, 120_000);

  /**
   * Aucune page ne doit defiler HORIZONTALEMENT sur un telephone.
   *
   * ⚠️ CE N'EST PAS UN DETAIL D'ESTHETIQUE. Un `flex` de boutons qui ne se
   * replie pas pousse la page entiere vers la droite : mesure a 157 px sur la
   * liste clients et 37 px sur les taches, a 390 px de large. C'est TOUTE la
   * mise en page qui se decale — en-tete et menu compris — et le tableau, lui,
   * a deja son propre defilement, si bien que le geste de rattrapage ne fait
   * pas ce qu'on attend.
   *
   * Le test regarde le DOCUMENT, jamais les conteneurs internes : un tableau
   * plus large que l'ecran est normal et voulu, c'est meme ce que l'ascenseur
   * de la liste clients sert a parcourir.
   *
   * 320 px est la largeur retenue parce que c'est le plus petit telephone
   * courant : ce qui passe la passe partout.
   */
  it('ne fait defiler aucune page horizontalement sur un telephone', async () => {
    const avant = page.viewportSize();
    try {
      for (const largeur of [320, 390]) {
        await page.setViewportSize({ width: largeur, height: 780 });
        for (const chemin of ['/clients', '/taches', '/dashboard', '/suivi-echeances']) {
          await page.goto(BASE + chemin, { waitUntil: 'networkidle' });
          /**
           * ⚠️ VERIFIER QU'ON N'EST PAS RETOMBE SUR LA CONNEXION. Sans session,
           * l'application renvoie a la racine — une page courte et etroite, qui
           * ne deborde jamais. Le test passait alors sans rien mesurer, et il a
           * fallu une sonde pour s'en apercevoir : le controle qui remettait le
           * defaut restait vert.
           *
           * On ne compare PAS au chemin demande : `/taches` redirige vers
           * `/tasks`, et l'exiger identique ferait echouer le test sur un alias
           * de route parfaitement legitime.
           */
          expect(new URL(page.url()).pathname, 'renvoye a la connexion depuis ' + chemin).not.toBe(
            '/'
          );
          // ⚠️ PAS DE `expect.poll` ICI, ET C'EST LE POINT. `poll` REESSAIE
          // JUSQU'A REUSSIR : pendant le chargement, la largeur du document
          // passe par zero avant que l'en-tete ne soit peint, et le test
          // passait alors meme avec le defaut remis — verifie, il ne detectait
          // rien. On laisse la mise en page se poser, puis on lit UNE fois.
          await page.waitForTimeout(1_200);
          const deborde = await page.evaluate(
            () => document.documentElement.scrollWidth - window.innerWidth
          );
          expect(deborde, `${chemin} a ${largeur} px`).toBeLessThanOrEqual(0);
        }
      }
    } finally {
      // Les cas suivants comptent sur la fenetre d'origine.
      if (avant) await page.setViewportSize(avant);
    }
  }, 120_000);

  /**
   * La liste clients est servie par LA BASE, page par page.
   *
   * ⚠️ CE CAS EXISTE PARCE QUE LA PANNE SERAIT SILENCIEUSE. Si
   * `/api/clients/liste` echouait, l'ecran attraperait l'erreur et afficherait
   * une liste VIDE — c'est-a-dire, pour un cabinet, « je n'ai plus aucun
   * client ». Rien ne planterait, aucune erreur ne paraitrait en console, et le
   * test des erreurs JS juste en dessous resterait vert.
   *
   * On verifie donc trois choses d'un coup : que la route repond, qu'elle sert
   * bien la liste (et non PostgREST), et que le compte annonce vient d'elle.
   */
  it('sert la liste clients par la route paginee, et compte juste', async () => {
    const appels: string[] = [];
    const surReponse = (r: { url(): string }) => {
      const u = r.url();
      if (u.includes('/api/clients/liste') || /\/rest\/v1\/clients\?/.test(u)) appels.push(u);
    };
    page.on('response', surReponse);
    try {
      await page.goto(BASE + '/clients', { waitUntil: 'networkidle' });

      // ⚠️ CETTE ATTENTE VIENT EN PREMIER, pour que l'echec DESIGNE la cause.
      // Sans elle, une route en panne fait tomber le test sur une case a cocher
      // introuvable — parce que l'ecran bascule sur « Ajoutez votre premier
      // client » — et le journal accuse la case au lieu de la route.
      await expect
        .poll(() => appels.some((u) => u.includes('/api/clients/liste')), { timeout: 30_000 })
        .toBe(true);

      const mesDossiers = page.getByRole('checkbox', { name: /Mes dossiers/i }).first();
      await mesDossiers.waitFor({ timeout: 30_000 });
      if (await mesDossiers.isChecked()) await mesDossiers.uncheck();
      await page.locator('tbody tr').first().waitFor({ timeout: 30_000 });

      // Et le compte affiche correspond aux lignes rendues, le cabinet de
      // recette tenant sur une seule page.
      const lignes = await page.locator('tbody tr').count();
      expect(lignes).toBeGreaterThan(0);
      const entete = await page.locator('main p').filter({ hasText: /client/ }).first().innerText();
      expect(entete).toMatch(new RegExp(`^${lignes} client`));
    } finally {
      page.off('response', surReponse);
    }
  }, 120_000);

  it('ne laisse aucune erreur JavaScript en console', () => {
    /**
     * `frame-ancestors` est écarté : le navigateur avertit qu'il l'ignore dans
     * une CSP délivrée par `<meta>`, ce qui est exactement le défaut corrigé par
     * l'en-tête servi par Caddy. Derrière Caddy l'avertissement disparaît ;
     * quand on attaque le serveur Node directement, il est attendu.
     */
    const graves = erreursConsole.filter(
      (e) =>
        !/favicon|manifest|sw\.js|frame-ancestors|Failed to load resource: the server responded with a status of 40/i.test(
          e
        )
    );
    expect(graves).toEqual([]);
  });
});
