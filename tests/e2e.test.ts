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

  it('ne charge pas les seize sections de paramètres d’un coup', async () => {
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
