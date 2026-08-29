import { useEffect, useMemo, useState } from 'react';
import { Eye, Mail, Send, Users, X } from 'lucide-react';
import { useToast } from '../contexts/ToastContext';
import { Card, CardContent } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Select } from '../components/ui/Select';
import { SearchableSelect } from '../components/ui/SearchableSelect';
import { libelleSection, optionsNaf, type CodeNafPresent } from '../lib/naf';

/**
 * Campagnes — écrire à une liste de clients.
 * ---------------------------------------------------------------------------
 * Trois temps sur un seul écran, dans l'ordre où l'on pense : à qui, quoi, puis
 * vérifier avant d'envoyer.
 *
 * ⚠️ CE QUE CET ÉCRAN DOIT MONTRER SANS LE MAQUILLER. Sur 589 clients actifs, 341
 * ont une adresse. Un écran qui annoncerait « 589 destinataires » mentirait, et
 * l'utilisateur ne découvrirait le trou qu'en comparant les compteurs après coup.
 * L'aperçu affiche donc les visés, les retenus, et chaque exclu avec son motif.
 *
 * L'aperçu vient du SERVEUR et non d'un calcul local : c'est le même code qui
 * décide de la liste à l'aperçu et à l'envoi (server/src/campagnes/gabarit.ts).
 * Deux implémentations divergeraient, et c'est l'aperçu qu'on croirait.
 */

const MOTIFS: Record<string, string> = {
  'sans-adresse': 'aucune adresse renseignee',
  'adresse-invalide': 'adresse invalide',
  desinscrit: 'desinscrit',
  'retire-a-la-main': 'retire a la main',
  doublon: 'adresse deja visee',
};

interface Exclu {
  clientId: string;
  nom: string;
  motif: string;
  auProfitDe?: string;
}

interface Destinataire {
  id: string;
  nom: string | null;
  email: string | null;
}

interface Apercu {
  vises: number;
  retenus: number;
  destinataires: Destinataire[];
  exclus: Exclu[];
  variables: string[];
  apercu: { client: string | null; email: string | null; html: string } | null;
}

interface Campagne {
  id: string;
  sujet: string;
  envoyeLe: string | null;
  auteur: string | null;
  destinataires: number;
  exclus: number;
  envoyes: number;
  erreurs: number;
  enAttente: number;
}

const OPTIONS_API: RequestInit = {
  credentials: 'same-origin',
  headers: { 'Content-Type': 'application/json' },
};

export function Campagnes() {
  const { showToast } = useToast();

  const [statut, setStatut] = useState('actif');
  const [regime, setRegime] = useState('all');
  const [cloture, setCloture] = useState('all');
  const [recherche, setRecherche] = useState('');
  /** Les prefixes de code NAF retenus : `6201Z` une classe, `62` toute sa division. */
  const [codesNaf, setCodesNaf] = useState<string[]>([]);
  /** Les codes du portefeuille, avec leur effectif — la liste vient du serveur. */
  const [nafPresents, setNafPresents] = useState<CodeNafPresent[]>([]);
  /** Les fiches sans code NAF : filtrer par metier les ecarte, il faut le dire. */
  const [nafSansCode, setNafSansCode] = useState(0);

  const [sujet, setSujet] = useState('');
  const [corps, setCorps] = useState('');

  const [apercu, setApercu] = useState<Apercu | null>(null);
  const [chargement, setChargement] = useState(false);
  const [envoi, setEnvoi] = useState(false);
  const [confirme, setConfirme] = useState(false);
  const [historique, setHistorique] = useState<Campagne[]>([]);
  /** Les clients retires a la main. Envoyes au serveur, jamais appliques ici. */
  const [retires, setRetires] = useState<Set<string>>(new Set());

  const filtres = useMemo(
    () => ({ statut, regime, cloture, recherche, codesNaf }),
    [statut, regime, cloture, recherche, codesNaf]
  );

  /**
   * Les entrees proposees, moins celles que la selection vise DEJA.
   *
   * Une division retenue emporte ses classes : proposer encore `6201Z` quand
   * `62` est retenu ferait ajouter une pastille sans effet — le serveur ecarte
   * de toute facon un code couvert par un autre (`prefixesNaf`). L'ecran doit
   * donc rendre cette pastille impossible plutot que de l'afficher inerte.
   */
  const optionsDisponibles = useMemo(
    () => optionsNaf(nafPresents).filter((o) => !codesNaf.some((p) => o.valeur.startsWith(p))),
    [nafPresents, codesNaf]
  );

  /** Ajoute un prefixe et retire ceux qu'il englobe, pour la meme raison. */
  function viserCodeNaf(prefixe: string) {
    setCodesNaf((p) => [...p.filter((c) => !c.startsWith(prefixe)), prefixe].sort());
  }

  async function chargerHistorique() {
    try {
      const r = await fetch('/api/campagnes', { method: 'GET', ...OPTIONS_API });
      if (!r.ok) return;
      const d = await r.json();
      setHistorique(d.campagnes ?? []);
    } catch {
      // L'historique est un confort : son absence ne doit pas bloquer un envoi.
    }
  }

  async function chargerCodesNaf() {
    try {
      const r = await fetch('/api/campagnes/codes-naf', { method: 'GET', ...OPTIONS_API });
      if (!r.ok) return;
      const d = await r.json();
      setNafPresents(d.codes ?? []);
      setNafSansCode(d.sansCode ?? 0);
    } catch {
      // Le filtre par metier est un confort : les autres filtres restent entiers.
    }
  }

  useEffect(() => {
    void chargerHistorique();
    void chargerCodesNaf();
  }, []);

  /**
   * Un apercu ne survit pas a un changement de cible ni de message.
   *
   * ⚠️ L'ENVOI RELIT LES FILTRES COURANTS, pas ceux de l'apercu. Sans cette
   * remise a zero, ajouter un code NAF apres avoir verifie laisserait a l'ecran
   * une liste nominative et une case « je confirme l'envoi a 43 destinataires »
   * qui ne decrivent plus l'envoi que le bouton declenche. C'est exactement le
   * mensonge que le reste de cet ecran s'applique a eviter.
   *
   * Les retraits a la main ne sont volontairement PAS dans les dependances :
   * chacun relance deja `verifier()`, qui repose un apercu frais.
   */
  useEffect(() => {
    setApercu(null);
    setConfirme(false);
  }, [filtres, sujet, corps]);

  /**
   * Recalcule l'aperçu, retraits compris.
   *
   * Le recalcul est fait par le SERVEUR à chaque retrait, et non en filtrant la
   * liste localement. C'est un aller-retour de plus, mais il est nécessaire : le
   * dédoublonnage cascade. Retirer une société d'un groupe rend son adresse
   * disponible pour sa jumelle, qui doit alors réapparaître dans la liste. Un
   * filtrage local ne le verrait pas, et l'écran mentirait sur ce qui sera envoyé.
   */
  async function verifier(retraits: Set<string> = retires) {
    setChargement(true);
    setConfirme(false);
    try {
      const r = await fetch('/api/campagnes/apercu', {
        method: 'POST',
        ...OPTIONS_API,
        body: JSON.stringify({ filtres, corps, retires: [...retraits] }),
      });
      if (!r.ok) throw new Error('Apercu impossible');
      setApercu(await r.json());
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Apercu impossible', 'error');
      setApercu(null);
    } finally {
      setChargement(false);
    }
  }

  async function retirer(id: string) {
    const suivants = new Set(retires).add(id);
    setRetires(suivants);
    await verifier(suivants);
  }

  async function toutRemettre() {
    const vide = new Set<string>();
    setRetires(vide);
    await verifier(vide);
  }

  async function envoyer() {
    setEnvoi(true);
    try {
      const r = await fetch('/api/campagnes', {
        method: 'POST',
        ...OPTIONS_API,
        body: JSON.stringify({ filtres, sujet, corps, retires: [...retires] }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.message ?? 'Envoi impossible');
      showToast(
        `${d.misEnFile} courriel(s) en file. Depart etale sur environ ${d.minutesEstimees} minute(s).`,
        'success'
      );
      setApercu(null);
      setConfirme(false);
      setRetires(new Set());
      setSujet('');
      setCorps('');
      await chargerHistorique();
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Envoi impossible', 'error');
    } finally {
      setEnvoi(false);
    }
  }

  const pret = sujet.trim().length > 0 && corps.trim().length > 0;
  const exclusParMotif = (apercu?.exclus ?? []).reduce<Record<string, Exclu[]>>((acc, e) => {
    (acc[e.motif] ??= []).push(e);
    return acc;
  }, {});

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
          <Mail className="w-6 h-6 text-teal-600" />
          Campagnes
        </h1>
        <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
          Un courriel a un groupe de clients, personnalise, avec un lien de desinscription.
          Chaque envoi est trace.
        </p>
      </div>

      {/* 1 — a qui */}
      <Card>
        <CardContent className="p-4 space-y-3">
          <h2 className="text-sm font-medium text-gray-900 dark:text-white flex items-center gap-2">
            <Users className="w-4 h-4 text-teal-600" />
            1. A qui
          </h2>
          <div className="flex flex-wrap items-end gap-3">
            <div className="w-40">
              <Select label="Statut" value={statut} onChange={(e) => setStatut(e.target.value)}>
                <option value="actif">Actifs</option>
                <option value="inactif">Inactifs</option>
                <option value="all">Tous (hors archives)</option>
              </Select>
            </div>
            <div className="w-44">
              <Select label="Regime fiscal" value={regime} onChange={(e) => setRegime(e.target.value)}>
                <option value="all">Tous</option>
                <option value="IS">IS</option>
                <option value="BIC">BIC</option>
                <option value="BNC">BNC</option>
                <option value="BA">BA</option>
              </Select>
            </div>
            <div className="w-40">
              <Select label="Mois de cloture" value={cloture} onChange={(e) => setCloture(e.target.value)}>
                <option value="all">Tous</option>
                {Array.from({ length: 12 }, (_, i) => (
                  <option key={i + 1} value={String(i + 1)}>
                    {new Date(2000, i, 1).toLocaleDateString('fr-FR', { month: 'long' })}
                  </option>
                ))}
              </Select>
            </div>
            <div className="w-56">
              <Input
                label="Recherche"
                value={recherche}
                onChange={(e) => setRecherche(e.target.value)}
                placeholder="Nom, dirigeant, dossier"
              />
            </div>
            {/* Le code NAF ne se recite pas de memoire : la liste ne propose que
                les codes du portefeuille, et la recherche porte aussi sur le nom
                de la section — « construction » trouve 41, 42 et 43. */}
            <div className="w-72">
              <SearchableSelect
                label="Code NAF"
                options={optionsDisponibles.map((o) => ({
                  value: o.valeur,
                  label: o.libelle,
                  subtitle: o.detail,
                }))}
                value=""
                onChange={(v) => {
                  if (v) viserCodeNaf(v);
                }}
                placeholder={
                  nafPresents.length === 0
                    ? 'Aucun code NAF renseigne'
                    : codesNaf.length > 0
                      ? 'Ajouter un code'
                      : 'Toutes activites'
                }
                disabled={nafPresents.length === 0}
              />
            </div>
          </div>

          {codesNaf.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5">
              {codesNaf.map((prefixe) => (
                <span
                  key={prefixe}
                  className="inline-flex items-center gap-1.5 pl-2 pr-1 py-1 rounded-lg text-xs bg-teal-50 dark:bg-teal-900/30 text-teal-800 dark:text-teal-200 border border-teal-200 dark:border-teal-800"
                >
                  <span className="font-mono font-medium">{prefixe}</span>
                  {libelleSection(prefixe) && (
                    <span className="text-teal-700/70 dark:text-teal-300/70">
                      {libelleSection(prefixe)}
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={() => setCodesNaf((p) => p.filter((c) => c !== prefixe))}
                    className="p-0.5 rounded hover:bg-teal-100 dark:hover:bg-teal-800/60 transition-colors"
                    title={`Ne plus viser ${prefixe}`}
                  >
                    <X className="w-3 h-3" />
                  </button>
                </span>
              ))}
              <button
                type="button"
                onClick={() => setCodesNaf([])}
                className="text-xs text-gray-500 dark:text-gray-400 hover:underline px-1"
              >
                Tout enlever
              </button>
            </div>
          )}

          <p className="text-xs text-gray-500 dark:text-gray-400">
            Sans code NAF, toutes les activites sont visees. Plusieurs codes s additionnent :
            <span className="font-mono"> 6201Z</span> vise une activite precise,
            <span className="font-mono"> 62</span> toute sa division. Les effectifs annonces
            portent sur le portefeuille hors archives — seul l apercu compte les destinataires.
          </p>

          {/* Le trou du filtre, annonce avant l'envoi et non decouvert apres :
              une fiche sans code NAF ne peut etre visee par aucun code. */}
          {codesNaf.length > 0 && nafSansCode > 0 && (
            <p className="text-xs text-orange-600 dark:text-orange-400">
              {nafSansCode} fiche(s) du portefeuille n ont aucun code NAF : ce filtre les
              ecarte, quel que soit leur metier reel.
            </p>
          )}
        </CardContent>
      </Card>

      {/* 2 — quoi */}
      <Card>
        <CardContent className="p-4 space-y-3">
          <h2 className="text-sm font-medium text-gray-900 dark:text-white">2. Le message</h2>
          <Input label="Sujet" value={sujet} onChange={(e) => setSujet(e.target.value)} />
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Corps
            </label>
            <textarea
              value={corps}
              onChange={(e) => setCorps(e.target.value)}
              rows={10}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-teal-500 focus:border-transparent outline-none font-mono"
              placeholder={'Bonjour {{dirigeant}},\n\nVotre declaration de TVA...'}
            />
            <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
              Texte simple : les sauts de ligne sont respectes, la mise en forme est celle du
              cabinet. Variables disponibles, a cliquer pour inserer :
            </p>
            <div className="mt-1 flex flex-wrap gap-1.5">
              {['nom_entreprise', 'dirigeant', 'numero_dossier', 'date_cloture', 'regime_fiscal'].map(
                (v) => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => setCorps((c) => `${c}{{${v}}}`)}
                    className="text-xs px-2 py-1 rounded bg-gray-100 dark:bg-gray-800 text-teal-700 dark:text-teal-400 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors font-mono"
                  >
                    {`{{${v}}}`}
                  </button>
                )
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 3 — verifier puis envoyer */}
      <Card>
        <CardContent className="p-4 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-sm font-medium text-gray-900 dark:text-white">3. Verifier</h2>
            <Button variant="outline" onClick={() => void verifier()} disabled={chargement || !pret}>
              <Eye className="w-4 h-4 mr-2" />
              {chargement ? 'Calcul...' : 'Voir la liste et l apercu'}
            </Button>
          </div>

          {!pret && (
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Renseignez un sujet et un corps pour verifier.
            </p>
          )}

          {apercu && (
            <div className="space-y-4">
              <div className="flex flex-wrap gap-4 text-sm">
                <span className="text-gray-600 dark:text-gray-400">
                  <strong className="text-gray-900 dark:text-white">{apercu.vises}</strong> client(s)
                  dans la selection
                </span>
                <span className="text-gray-600 dark:text-gray-400">
                  <strong className="text-green-700 dark:text-green-400">{apercu.retenus}</strong>{' '}
                  destinataire(s) joignable(s)
                </span>
                {apercu.exclus.length > 0 && (
                  <span className="text-orange-600 dark:text-orange-400">
                    {apercu.exclus.length} ecarte(s)
                  </span>
                )}
              </div>

              {/* La liste nominative, retirable ligne par ligne.
                  Chaque retrait relance le calcul cote serveur : le dedoublonnage
                  cascade, et retirer une societe d'un groupe peut faire reapparaitre
                  sa jumelle. Un filtrage local ne le montrerait pas. */}
              {apercu.destinataires.length > 0 && (
                <details
                  open
                  className="rounded-lg border border-gray-200 dark:border-gray-700 p-3"
                >
                  <summary className="text-xs text-gray-700 dark:text-gray-300 cursor-pointer flex items-center justify-between gap-2">
                    {/* Des ADRESSES, donc des courriels : c'est le nombre qui part.
                        Un client a deux adresses y compte pour deux, et apparait
                        deux fois dans la liste. */}
                    <span>{apercu.destinataires.length} destinataire(s) — cliquez pour retirer</span>
                    {retires.size > 0 && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.preventDefault();
                          void toutRemettre();
                        }}
                        className="text-teal-700 dark:text-teal-400 hover:underline"
                      >
                        Remettre les {retires.size} retire(s)
                      </button>
                    )}
                  </summary>
                  <ul className="mt-2 max-h-64 overflow-y-auto divide-y divide-gray-100 dark:divide-gray-800">
                    {/* ⚠️ LA CLE PORTE L'ADRESSE, ET NON LE SEUL IDENTIFIANT DE
                        CLIENT. Une fiche a deux adresses produit DEUX lignes, du
                        meme client : `key={d.id}` seul se repeterait, et React
                        recycle alors les lignes de travers — une adresse affichee
                        en face du mauvais nom, sur un ecran dont l'unique role est
                        de montrer qui recevra quoi avant un envoi irreversible.
                        Le retrait, lui, reste par CLIENT : il coupe ses deux
                        adresses, ce qu'on attend de « retirer untel de l'envoi ». */}
                    {apercu.destinataires.map((d) => (
                      <li
                        key={`${d.id}:${d.email}`}
                        className="py-1.5 flex items-center justify-between gap-3"
                      >
                        <span className="min-w-0 text-xs">
                          <span className="text-gray-900 dark:text-gray-100">{d.nom}</span>
                          <span className="text-gray-500 dark:text-gray-400"> — {d.email}</span>
                        </span>
                        <button
                          type="button"
                          onClick={() => void retirer(d.id)}
                          disabled={chargement}
                          className="shrink-0 text-xs px-2 py-1 rounded text-gray-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 disabled:opacity-50 transition-colors"
                          title={`Retirer ${d.nom ?? ''} de cet envoi`}
                        >
                          Retirer
                        </button>
                      </li>
                    ))}
                  </ul>
                </details>
              )}

              {/* Les exclus, groupes par motif : c'est actionnable, une liste plate ne
                  l'est pas. */}
              {Object.entries(exclusParMotif).map(([motif, liste]) => (
                <details
                  key={motif}
                  className="rounded-lg border border-gray-200 dark:border-gray-700 p-3"
                >
                  <summary className="text-xs text-gray-700 dark:text-gray-300 cursor-pointer">
                    {liste.length} — {MOTIFS[motif] ?? motif}
                  </summary>
                  <ul className="mt-2 text-xs text-gray-500 dark:text-gray-400 space-y-0.5 max-h-40 overflow-y-auto">
                    {liste.map((e) => (
                      <li key={e.clientId}>
                        {e.nom}
                        {e.auProfitDe ? ` — au profit de ${e.auProfitDe}` : ''}
                      </li>
                    ))}
                  </ul>
                </details>
              ))}

              {apercu.apercu && (
                <div>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">
                    Apercu reel, tel que <strong>{apercu.apercu.client}</strong> le recevra sur{' '}
                    {apercu.apercu.email} :
                  </p>
                  {/* `sandbox` sans `allow-scripts` : le HTML vient de notre serveur, mais
                      il porte des valeurs de fiches clients. On ne lui donne pas les
                      moyens d'executer quoi que ce soit dans l'application. */}
                  <iframe
                    title="Apercu du courriel"
                    sandbox=""
                    srcDoc={apercu.apercu.html}
                    className="w-full h-80 rounded-lg border border-gray-200 dark:border-gray-700 bg-white"
                  />
                </div>
              )}

              {apercu.retenus > 0 && (
                <div className="rounded-lg border border-teal-200 dark:border-teal-800 bg-teal-50 dark:bg-teal-900/20 p-3 space-y-2">
                  <label className="flex items-start gap-2 text-sm text-gray-800 dark:text-gray-200">
                    <input
                      type="checkbox"
                      checked={confirme}
                      onChange={(e) => setConfirme(e.target.checked)}
                      className="mt-0.5 h-4 w-4 text-teal-600 focus:ring-teal-500 border-gray-300 rounded"
                    />
                    <span>
                      J'ai relu l'apercu et je confirme l'envoi a {apercu.retenus} destinataire(s).
                    </span>
                  </label>
                  <Button onClick={() => void envoyer()} disabled={!confirme || envoi}>
                    <Send className="w-4 h-4 mr-2" />
                    {envoi ? 'Mise en file...' : `Envoyer a ${apercu.retenus} client(s)`}
                  </Button>
                  <p className="text-xs text-gray-600 dark:text-gray-400">
                    Les courriels partent par lots, environ 25 par minute — la limite du
                    fournisseur. Rien n'est envoye en un bloc.
                  </p>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {historique.length > 0 && (
        <Card>
          <CardContent className="p-4 space-y-2">
            <h2 className="text-sm font-medium text-gray-900 dark:text-white">Envois precedents</h2>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-gray-500 dark:text-gray-400 border-b border-gray-200 dark:border-gray-700">
                    <th className="py-2 pr-4">Sujet</th>
                    <th className="py-2 pr-4">Date</th>
                    <th className="py-2 pr-4">Par</th>
                    <th className="py-2 pr-4">Destinataires</th>
                    <th className="py-2">Etat</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                  {historique.map((c) => (
                    <tr key={c.id}>
                      <td className="py-2 pr-4 text-gray-900 dark:text-gray-100">{c.sujet}</td>
                      <td className="py-2 pr-4 text-gray-500 dark:text-gray-400 whitespace-nowrap">
                        {c.envoyeLe ? new Date(c.envoyeLe).toLocaleString('fr-FR') : '-'}
                      </td>
                      <td className="py-2 pr-4 text-gray-500 dark:text-gray-400">{c.auteur ?? '-'}</td>
                      <td className="py-2 pr-4 text-gray-900 dark:text-gray-100">{c.destinataires}</td>
                      <td className="py-2 text-xs">
                        <span className="text-green-700 dark:text-green-400">{c.envoyes} envoye(s)</span>
                        {c.enAttente > 0 && (
                          <span className="text-gray-500 dark:text-gray-400"> — {c.enAttente} en attente</span>
                        )}
                        {c.erreurs > 0 && (
                          <span className="text-red-600 dark:text-red-400"> — {c.erreurs} en echec</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Les compteurs d etat proviennent de la file d envoi, purgee au bout de 30 jours :
              ils retombent a zero pour les campagnes plus anciennes.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
