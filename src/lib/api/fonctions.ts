/**
 * Appels aux routes de l'instance qui remplacent les Edge Functions.
 * ---------------------------------------------------------------------------
 * Avant : `fetch(`${VITE_SUPABASE_URL}/functions/v1/<fn>`, { Authorization:
 * `Bearer ${jeton}` })`, ce qui obligeait à récupérer et rafraîchir un jeton
 * d'accès avant chaque appel — une centaine de lignes de plomberie dans
 * inpiService à elle seule.
 *
 * Maintenant : même origine que le front, et le cookie de session httpOnly
 * accompagne la requête. Plus de jeton à manipuler, donc plus de jeton à laisser
 * fuir. Le serveur refuse simplement l'appel sans session valide.
 */

export interface ReponseFonction<T = unknown> {
  ok: boolean;
  status: number;
  data: T | null;
  message: string | null;
}

/**
 * Appelle une route de l'instance. Le nom reste celui de l'ancienne Edge
 * Function, ce qui garde les appelants lisibles et la correspondance évidente.
 */
export async function appelerFonction<T = unknown>(
  nom: string,
  corps?: unknown,
  options: { methode?: string } = {}
): Promise<ReponseFonction<T>> {
  try {
    const rep = await fetch(`/api/${nom}`, {
      method: options.methode ?? 'POST',
      credentials: 'same-origin',
      headers: corps === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: corps === undefined ? undefined : JSON.stringify(corps),
    });

    const texte = await rep.text();
    let data: T | null = null;
    let message: string | null = null;
    if (texte) {
      try {
        data = JSON.parse(texte) as T;
        const asObj = data as { message?: string; error?: string } | null;
        message = asObj?.message ?? asObj?.error ?? null;
      } catch {
        message = texte.slice(0, 200);
      }
    }

    if (rep.status === 401) {
      message = 'Session expiree. Reconnecte-toi.';
    }

    return { ok: rep.ok, status: rep.status, data, message };
  } catch (e) {
    return {
      ok: false,
      status: 0,
      data: null,
      message: e instanceof Error ? e.message : 'Reseau injoignable',
    };
  }
}
