import { useState, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import { Card, CardContent } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Modal } from '../../components/ui/Modal';
import {
  Plug,
  Plus,
  Copy,
  Check,
  Trash2,
  Key,
  AlertTriangle,
  ExternalLink,
  Loader2,
  Clock,
  ShieldCheck,
  Eye,
  EyeOff,
} from 'lucide-react';

interface MCPKey {
  id: string;
  name: string;
  client_id: string;
  is_active: boolean;
  last_used_at: string | null;
  created_at: string;
  revoked_at: string | null;
}

interface NewKeyData {
  id: string;
  name: string;
  client_id: string;
  client_secret: string;
  created_at: string;
}


export function SettingsMCPConnector() {
  const { profile, isAdmin } = useAuth();
  const { showToast } = useToast();
  const [keys, setKeys] = useState<MCPKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showSecretModal, setShowSecretModal] = useState(false);
  const [showRevokeModal, setShowRevokeModal] = useState(false);
  const [revokeTarget, setRevokeTarget] = useState<MCPKey | null>(null);
  const [newKeyName, setNewKeyName] = useState('');
  const [newKeyData, setNewKeyData] = useState<NewKeyData | null>(null);
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [showSecret, setShowSecret] = useState(false);

  interface Autorisation {
    clientId: string;
    nom: string;
    creeLe: string;
    dernierAcces: string | null;
    jetonsActifs: number;
  }
  const [autorisations, setAutorisations] = useState<Autorisation[]>([]);
  const [revocationEnCours, setRevocationEnCours] = useState<string | null>(null);

  /**
   * L'adresse du connecteur se DEDUIT, elle ne se demande pas.
   *
   * Elle etait ecrite en dur sur « https://crmcabinet.com », le domaine de
   * l'ancienne plateforme : l'ecran affichait donc, en invitant a la copier, une
   * adresse qui ne repond pas — et chaque cabinet qui installe le produit aurait
   * lu la meme.
   *
   * `window.location.origin` est la bonne source, et pas un pis-aller : le
   * serveur sert le front ET l'API sur une seule origine, precisement pour qu'il
   * n'y ait ni CORS ni configuration a tenir a jour (voir server/src/index.ts).
   * Le MCP est monte sur `/mcp` de ce meme serveur, donc l'origine du navigateur
   * EST celle du connecteur, par construction.
   */
  const mcpEndpoint = `${window.location.origin}/mcp`;

  useEffect(() => {
    loadKeys();
    void chargerAutorisations();
  }, [profile]);

  /**
   * La session ne se lit plus depuis le JavaScript.
   *
   * Cette fonction construisait `Authorization: Bearer ${session.access_token}`,
   * heritage de Supabase Auth. Depuis la refonte, la session est un cookie
   * httpOnly — precisement pour qu'une XSS ne puisse pas la lire — et
   * `getSession()` ne rend plus qu'un profil : `access_token` n'existe pas, si
   * bien que l'en-tete partait litteralement en « Bearer undefined ».
   *
   * Les trois routes appelees ici s'authentifient par ce cookie
   * (`exigerAdmin` cote serveur) : il suffit de le laisser accompagner la
   * requete avec `credentials: 'same-origin'`.
   */
  const OPTIONS_API: RequestInit = {
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
  };

  /**
   * Les autorisations OAuth accordees.
   *
   * Passe par `/api/mcp/autorisations` et non par PostgREST : les tables OAuth
   * sont volontairement hors de portee du navigateur, le serveur choisit donc
   * ligne par ligne ce qui sort — jamais un hache, jamais un jeton.
   */
  async function chargerAutorisations() {
    try {
      const r = await fetch('/api/mcp/autorisations', { method: 'GET', ...OPTIONS_API });
      if (!r.ok) throw new Error('Chargement des autorisations impossible');
      const d = await r.json();
      setAutorisations(d.autorisations ?? []);
    } catch {
      // Silence volontaire : l'absence de cette liste ne doit pas masquer le
      // reste de l'ecran, qui reste utilisable pour creer une cle.
      setAutorisations([]);
    }
  }

  async function revoquerAutorisation(clientId: string, nom: string) {
    setRevocationEnCours(clientId);
    try {
      const r = await fetch(`/api/mcp/autorisations/${encodeURIComponent(clientId)}`, {
        method: 'DELETE',
        ...OPTIONS_API,
      });
      if (!r.ok) throw new Error('Revocation impossible');
      const d = await r.json();
      showToast(
        `Autorisation « ${nom} » revoquee${d.jetonsRevoques ? `, ${d.jetonsRevoques} jeton(s) coupe(s)` : ''}.`,
        'success'
      );
      await chargerAutorisations();
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Revocation impossible', 'error');
    } finally {
      setRevocationEnCours(null);
    }
  }

  async function loadKeys() {
    if (!profile) {
      setLoading(false);
      return;
    }

    try {
      const response = await fetch(`/api/mcp-keys/list`, {
        method: 'GET',
        ...OPTIONS_API,
      });

      if (!response.ok) throw new Error('Erreur lors du chargement des cles');
      const data = await response.json();
      setKeys(data.keys || []);
    } catch (err: any) {
      showToast(err.message || 'Erreur de chargement', 'error');
    } finally {
      setLoading(false);
    }
  }

  async function handleGenerate() {
    if (!newKeyName.trim()) {
      showToast('Veuillez donner un nom a la cle', 'error');
      return;
    }

    setGenerating(true);
    try {
      const response = await fetch(`/api/mcp-keys/generate`, {
        method: 'POST',
        ...OPTIONS_API,
        body: JSON.stringify({ name: newKeyName.trim() }),
      });

      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || 'Erreur lors de la generation');
      }

      const data = await response.json();
      setNewKeyData(data.key);
      setShowCreateModal(false);
      setShowSecretModal(true);
      setNewKeyName('');
      loadKeys();
    } catch (err: any) {
      showToast(err.message || 'Erreur de generation', 'error');
    } finally {
      setGenerating(false);
    }
  }

  async function handleRevoke() {
    if (!revokeTarget) return;

    try {
      const response = await fetch(`/api/mcp-keys/revoke`, {
        method: 'POST',
        ...OPTIONS_API,
        body: JSON.stringify({ key_id: revokeTarget.id }),
      });

      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || 'Erreur lors de la revocation');
      }

      showToast('Cle revoquee avec succes', 'success');
      setShowRevokeModal(false);
      setRevokeTarget(null);
      loadKeys();
    } catch (err: any) {
      showToast(err.message || 'Erreur', 'error');
    }
  }

  function copyToClipboard(text: string, field: string) {
    navigator.clipboard.writeText(text);
    setCopiedField(field);
    setTimeout(() => setCopiedField(null), 2000);
  }

  function formatDate(dateStr: string | null) {
    if (!dateStr) return '-';
    return new Date(dateStr).toLocaleDateString('fr-FR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  /**
   * La commande de Claude Code, avec la cle si l'on vient d'en creer une.
   *
   * Les valeurs reelles plutot que des marqueurs quand elles existent : une
   * commande a recopier en remplacant deux champs se recopie de travers.
   */
  const commandeClaudeCode = [
    'claude mcp add --transport http mon-cabinet',
    mcpEndpoint,
    `--header "Authorization: Bearer ${
      newKeyData ? `${newKeyData.client_id}:${newKeyData.client_secret}` : '<client_id>:<client_secret>'
    }"`,
  ].join(' \\\n  ');

  const mcpConfigDirect = newKeyData
    ? JSON.stringify({
        mcpServers: {
          'mon-cabinet': {
            url: mcpEndpoint,
            headers: {
              Authorization: `Bearer ${newKeyData.client_id}:${newKeyData.client_secret}`,
            },
          },
        },
      }, null, 2)
    : JSON.stringify({
        mcpServers: {
          'mon-cabinet': {
            url: mcpEndpoint,
            headers: {
              Authorization: 'Bearer <client_id>:<client_secret>',
            },
          },
        },
      }, null, 2);

  if (!isAdmin) {
    return (
      <div className="flex items-center gap-3 p-4 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg">
        <AlertTriangle className="w-5 h-5 text-amber-600" />
        <p className="text-sm text-amber-800 dark:text-amber-200">
          Cette fonctionnalite est reservee aux administrateurs du cabinet.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
          <Plug className="w-5 h-5 text-teal-600" />
          Connecteur IA (MCP)
        </h2>
        <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
          Connectez un assistant IA (Claude Desktop, Cursor, VS Code) a vos donnees en lecture seule
          via le protocole MCP (Model Context Protocol).
        </p>
      </div>

      {/* Explanation card */}
      <Card>
        <CardContent className="p-4">
          <div className="flex items-start gap-3">
            <ShieldCheck className="w-5 h-5 text-teal-600 mt-0.5 shrink-0" />
            <div className="text-sm text-gray-700 dark:text-gray-300 space-y-2">
              <p className="font-medium text-gray-900 dark:text-white">Comment ca fonctionne</p>
              <ul className="list-disc list-inside space-y-1 text-gray-600 dark:text-gray-400">
                <li>Generez une paire de cles (ID + Secret) ci-dessous</li>
                <li>Configurez votre client IA avec l'URL et les identifiants</li>
                <li>L'IA pourra <strong>uniquement consulter</strong> les donnees de votre cabinet</li>
                <li>Aucune modification n'est possible via ce connecteur</li>
              </ul>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Keys section */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-medium text-gray-900 dark:text-white">Vos cles d'acces</h3>
          <Button size="sm" onClick={() => setShowCreateModal(true)}>
            <Plus className="w-4 h-4 mr-1" />
            Nouvelle cle
          </Button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
          </div>
        ) : keys.length === 0 ? (
          <Card>
            <CardContent className="p-8 text-center">
              <Key className="w-10 h-10 text-gray-300 dark:text-gray-600 mx-auto mb-3" />
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Aucune cle generee. Creez votre premiere cle pour connecter un LLM.
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 dark:bg-gray-800/50">
                <tr>
                  <th className="text-left px-4 py-2.5 font-medium text-gray-600 dark:text-gray-400">Nom</th>
                  <th className="text-left px-4 py-2.5 font-medium text-gray-600 dark:text-gray-400">Client ID</th>
                  <th className="text-left px-4 py-2.5 font-medium text-gray-600 dark:text-gray-400 hidden sm:table-cell">Creee le</th>
                  <th className="text-left px-4 py-2.5 font-medium text-gray-600 dark:text-gray-400 hidden md:table-cell">Derniere utilisation</th>
                  <th className="text-left px-4 py-2.5 font-medium text-gray-600 dark:text-gray-400">Statut</th>
                  <th className="text-right px-4 py-2.5 font-medium text-gray-600 dark:text-gray-400">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                {keys.map((key) => (
                  <tr key={key.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/30 transition-colors">
                    <td className="px-4 py-3 font-medium text-gray-900 dark:text-white">{key.name}</td>
                    <td className="px-4 py-3">
                      <code className="text-xs bg-gray-100 dark:bg-gray-800 px-2 py-0.5 rounded text-gray-700 dark:text-gray-300">
                        {key.client_id.slice(0, 16)}...
                      </code>
                    </td>
                    <td className="px-4 py-3 text-gray-600 dark:text-gray-400 hidden sm:table-cell">
                      {formatDate(key.created_at)}
                    </td>
                    <td className="px-4 py-3 text-gray-600 dark:text-gray-400 hidden md:table-cell">
                      {key.last_used_at ? (
                        <span className="flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          {formatDate(key.last_used_at)}
                        </span>
                      ) : (
                        <span className="text-gray-400">Jamais</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {key.is_active ? (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400">
                          Actif
                        </span>
                      ) : (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400">
                          Revoque
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {key.is_active && (
                        <button
                          onClick={() => { setRevokeTarget(key); setShowRevokeModal(true); }}
                          className="text-red-500 hover:text-red-700 dark:hover:text-red-400 p-1 rounded hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                          title="Revoquer cette cle"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Configuration section */}
      {/* Les autorisations OAuth. Absente si personne n'a encore connecte
          claude.ai : une carte vide n'apprendrait rien. */}
      {autorisations.length > 0 && (
        <Card>
          <CardContent className="p-4 space-y-3">
            <h3 className="text-sm font-medium text-gray-900 dark:text-white flex items-center gap-2">
              <Plug className="w-4 h-4 text-teal-600" />
              Autorisations accordees
            </h3>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Les assistants qui se sont connectes par OAuth. Revoquer coupe l'acces
              immediatement — les jetons en cours sont invalides, pas seulement les prochains.
            </p>
            <div className="divide-y divide-gray-200 dark:divide-gray-700">
              {autorisations.map((a) => (
                <div
                  key={a.clientId}
                  className="py-3 flex flex-wrap items-center justify-between gap-3"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                      {a.nom}
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      Autorise le {formatDate(a.creeLe)}
                      {a.dernierAcces ? ` — dernier appel le ${formatDate(a.dernierAcces)}` : ' — jamais utilise'}
                    </p>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <span
                      className={`text-xs px-2 py-1 rounded-full ${
                        a.jetonsActifs > 0
                          ? 'bg-green-50 text-green-700 dark:bg-green-900/30 dark:text-green-300'
                          : 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400'
                      }`}
                    >
                      {a.jetonsActifs > 0 ? 'actif' : 'en sommeil'}
                    </span>
                    <Button
                      variant="outline"
                      onClick={() => void revoquerAutorisation(a.clientId, a.nom)}
                      disabled={revocationEnCours === a.clientId}
                    >
                      {revocationEnCours === a.clientId ? 'Revocation...' : 'Revoquer'}
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="p-4 space-y-3">
          <h3 className="text-sm font-medium text-gray-900 dark:text-white flex items-center gap-2">
            <ExternalLink className="w-4 h-4 text-teal-600" />
            Configuration pour votre client IA
          </h3>
          <div className="space-y-4">
            <div>
              <label className="text-xs font-medium text-gray-500 dark:text-gray-400">URL du serveur MCP</label>
              <div className="flex items-center gap-2 mt-1">
                <code className="flex-1 text-xs bg-gray-100 dark:bg-gray-800 px-3 py-2 rounded border border-gray-200 dark:border-gray-700 text-gray-800 dark:text-gray-200 break-all">
                  {mcpEndpoint}
                </code>
                <button
                  onClick={() => copyToClipboard(mcpEndpoint, 'endpoint')}
                  className="shrink-0 p-2 rounded hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                  title="Copier"
                >
                  {copiedField === 'endpoint' ? <Check className="w-4 h-4 text-green-600" /> : <Copy className="w-4 h-4 text-gray-500" />}
                </button>
              </div>
            </div>

            {/* Deux voies, et le critère qui les sépare n'est pas le confort :
                c'est que certains clients n'offrent aucun champ pour un en-tête. */}
            <div className="rounded-lg border border-gray-200 dark:border-gray-700 p-3 space-y-2">
              <p className="text-xs font-semibold text-gray-900 dark:text-white">
                Voie 1 — claude.ai (OAuth), sans aucune cle a copier
              </p>
              <ol className="text-xs text-gray-600 dark:text-gray-400 space-y-1 list-decimal pl-4">
                <li>
                  Restez connecte au CRM <strong>dans ce navigateur</strong> : c'est votre session qui
                  autorise l'acces.
                </li>
                <li>Dans claude.ai, ajoutez un connecteur avec l'URL ci-dessus.</li>
                <li>
                  <strong>Laissez les champs « Client ID » et « Client Secret » vides.</strong> Claude
                  s'enregistre tout seul ; y coller une cle du tableau ci-dessous ferait echouer la
                  connexion.
                </li>
                <li>Un ecran « Autoriser Claude ? » s'affiche. Vous acceptez, et c'est fini.</li>
              </ol>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                L'autorisation se renouvelle d'elle-meme tant qu'elle sert. Inutilisee trente jours,
                elle se referme et un clic la retablit. Elle apparait plus bas, revocable a tout moment.
              </p>
            </div>

            <div className="rounded-lg border border-gray-200 dark:border-gray-700 p-3 space-y-2">
              <p className="text-xs font-semibold text-gray-900 dark:text-white">
                Voie 2 — Claude Code, Cursor, VS Code : une cle dans un en-tete
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Ces clients acceptent un en-tete fixe. Creez une cle ci-dessous, puis :
              </p>
              <div className="relative">
                <pre className="text-xs bg-gray-900 dark:bg-gray-950 text-green-400 p-3 rounded-lg overflow-x-auto border border-gray-700">
                  {commandeClaudeCode}
                </pre>
                <button
                  onClick={() => copyToClipboard(commandeClaudeCode, 'cmd-code')}
                  className="absolute top-2 right-2 p-1.5 rounded bg-gray-700 hover:bg-gray-600 transition-colors"
                  title="Copier"
                >
                  {copiedField === 'cmd-code' ? <Check className="w-3.5 h-3.5 text-green-400" /> : <Copy className="w-3.5 h-3.5 text-gray-300" />}
                </button>
              </div>
              <p className="text-xs text-gray-500 dark:text-gray-400">Ou, par fichier de configuration :</p>
              <div className="relative">
                <pre className="text-xs bg-gray-900 dark:bg-gray-950 text-green-400 p-3 rounded-lg overflow-x-auto border border-gray-700">
                  {mcpConfigDirect}
                </pre>
                <button
                  onClick={() => copyToClipboard(mcpConfigDirect, 'config-direct')}
                  className="absolute top-2 right-2 p-1.5 rounded bg-gray-700 hover:bg-gray-600 transition-colors"
                  title="Copier"
                >
                  {copiedField === 'config-direct' ? <Check className="w-3.5 h-3.5 text-green-400" /> : <Copy className="w-3.5 h-3.5 text-gray-300" />}
                </button>
              </div>
            </div>
          </div>

          <div className="pt-2 border-t border-gray-200 dark:border-gray-700">
            <p className="text-xs text-gray-500 dark:text-gray-400 font-medium mb-2">Outils disponibles :</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-1">
              {[
                { name: 'list_clients', desc: 'Lister les clients' },
                { name: 'get_client', desc: 'Detail d\'un client' },
                { name: 'list_tasks', desc: 'Lister les tâches' },
                { name: 'get_task', desc: 'Détail d\'une tâche' },
                { name: 'list_fiscal_deadlines', desc: 'Échéances fiscales' },
                { name: 'list_balance_sheets', desc: 'Bilans comptables' },
                { name: 'list_opportunities', desc: 'Opportunités' },
                { name: 'list_collaborators', desc: 'Collaborateurs' },
                { name: 'list_software', desc: 'Logiciels' },
                { name: 'list_meeting_notes', desc: 'Notes de RDV' },
                { name: 'search', desc: 'Recherche globale' },
              ].map((tool) => (
                <div key={tool.name} className="flex items-center gap-2 text-xs text-gray-600 dark:text-gray-400">
                  <code className="bg-gray-100 dark:bg-gray-800 px-1.5 py-0.5 rounded text-teal-700 dark:text-teal-400">{tool.name}</code>
                  <span>{tool.desc}</span>
                </div>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Create key modal */}
      <Modal
        isOpen={showCreateModal}
        onClose={() => { setShowCreateModal(false); setNewKeyName(''); }}
        title="Generer une nouvelle cle MCP"
      >
        <div className="space-y-4">
          <p className="text-sm text-gray-600 dark:text-gray-400">
            Donnez un nom a cette cle pour l'identifier facilement (ex: "Claude Desktop", "Cursor IDE").
          </p>
          <Input
            label="Nom de la cle"
            value={newKeyName}
            onChange={(e) => setNewKeyName(e.target.value)}
            placeholder="Ex: Claude Desktop bureau"
            autoFocus
          />
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => { setShowCreateModal(false); setNewKeyName(''); }}>
              Annuler
            </Button>
            <Button onClick={handleGenerate} disabled={generating || !newKeyName.trim()}>
              {generating ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Key className="w-4 h-4 mr-1" />}
              Generer
            </Button>
          </div>
        </div>
      </Modal>

      {/* Secret display modal */}
      <Modal
        isOpen={showSecretModal}
        onClose={() => { setShowSecretModal(false); setNewKeyData(null); setShowSecret(false); }}
        title="Cle generee avec succes"
      >
        {newKeyData && (
          <div className="space-y-4">
            <div className="flex items-start gap-2 p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg">
              <AlertTriangle className="w-4 h-4 text-amber-600 mt-0.5 shrink-0" />
              <p className="text-xs text-amber-800 dark:text-amber-200">
                Le secret ne sera plus jamais affiche apres la fermeture de cette fenetre. Copiez-le maintenant.
              </p>
            </div>

            <div className="space-y-3">
              <div>
                <label className="text-xs font-medium text-gray-500 dark:text-gray-400">Client ID</label>
                <div className="flex items-center gap-2 mt-1">
                  <code className="flex-1 text-xs bg-gray-100 dark:bg-gray-800 px-3 py-2 rounded border border-gray-200 dark:border-gray-700 text-gray-800 dark:text-gray-200 break-all">
                    {newKeyData.client_id}
                  </code>
                  <button
                    onClick={() => copyToClipboard(newKeyData.client_id, 'new-id')}
                    className="shrink-0 p-2 rounded hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                  >
                    {copiedField === 'new-id' ? <Check className="w-4 h-4 text-green-600" /> : <Copy className="w-4 h-4 text-gray-500" />}
                  </button>
                </div>
              </div>

              <div>
                <label className="text-xs font-medium text-gray-500 dark:text-gray-400">Client Secret</label>
                <div className="flex items-center gap-2 mt-1">
                  <code className="flex-1 text-xs bg-gray-100 dark:bg-gray-800 px-3 py-2 rounded border border-gray-200 dark:border-gray-700 text-gray-800 dark:text-gray-200 break-all">
                    {showSecret ? newKeyData.client_secret : '••••••••••••••••••••••••••••••••••••••••••••••••'}
                  </code>
                  <button
                    onClick={() => setShowSecret(!showSecret)}
                    className="shrink-0 p-2 rounded hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                  >
                    {showSecret ? <EyeOff className="w-4 h-4 text-gray-500" /> : <Eye className="w-4 h-4 text-gray-500" />}
                  </button>
                  <button
                    onClick={() => copyToClipboard(newKeyData.client_secret, 'new-secret')}
                    className="shrink-0 p-2 rounded hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                  >
                    {copiedField === 'new-secret' ? <Check className="w-4 h-4 text-green-600" /> : <Copy className="w-4 h-4 text-gray-500" />}
                  </button>
                </div>
              </div>

              <div>
                <label className="text-xs font-medium text-gray-500 dark:text-gray-400">Configuration complete</label>
                <div className="relative mt-1">
                  <pre className="text-xs bg-gray-900 dark:bg-gray-950 text-green-400 p-3 rounded-lg overflow-x-auto border border-gray-700">
                    {JSON.stringify({
                      mcpServers: {
                        'mon-cabinet': {
                          url: mcpEndpoint,
                          headers: {
                            Authorization: `Bearer ${newKeyData.client_id}:${newKeyData.client_secret}`,
                          },
                        },
                      },
                    }, null, 2)}
                  </pre>
                  <button
                    onClick={() => copyToClipboard(JSON.stringify({
                      mcpServers: {
                        'mon-cabinet': {
                          url: mcpEndpoint,
                          headers: {
                            Authorization: `Bearer ${newKeyData.client_id}:${newKeyData.client_secret}`,
                          },
                        },
                      },
                    }, null, 2), 'new-config')}
                    className="absolute top-2 right-2 p-1.5 rounded bg-gray-700 hover:bg-gray-600 transition-colors"
                  >
                    {copiedField === 'new-config' ? <Check className="w-3.5 h-3.5 text-green-400" /> : <Copy className="w-3.5 h-3.5 text-gray-300" />}
                  </button>
                </div>
              </div>
            </div>

            <div className="flex justify-end">
              <Button onClick={() => { setShowSecretModal(false); setNewKeyData(null); setShowSecret(false); }}>
                J'ai copie mes identifiants
              </Button>
            </div>
          </div>
        )}
      </Modal>

      {/* Revoke confirmation modal */}
      <Modal
        isOpen={showRevokeModal}
        onClose={() => { setShowRevokeModal(false); setRevokeTarget(null); }}
        title="Revoquer cette cle ?"
      >
        <div className="space-y-4">
          <p className="text-sm text-gray-600 dark:text-gray-400">
            La cle <strong>"{revokeTarget?.name}"</strong> sera immediatement desactivee.
            Tout LLM utilisant cette cle ne pourra plus acceder a vos donnees.
          </p>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => { setShowRevokeModal(false); setRevokeTarget(null); }}>
              Annuler
            </Button>
            <Button variant="danger" onClick={handleRevoke}>
              <Trash2 className="w-4 h-4 mr-1" />
              Revoquer
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
