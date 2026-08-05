/**
 * Client de stockage de l'instance.
 * ---------------------------------------------------------------------------
 * Remplace `supabase.storage`. La forme est calquée sur celle de Supabase
 * Storage — `.from(bucket).upload(...)`, `{ data, error }` — pour que les
 * appels existants du front ne soient pas à réécrire.
 *
 * Deux différences à connaître :
 *   - les chemins n'ont plus de préfixe cabinet (`${taskId}/...` et non
 *     `${taskId}/...`), puisqu'une instance ne sert qu'un cabinet ;
 *   - `getPublicUrl` ne vaut que pour `cabinet-logos`, seul bucket lisible sans
 *     session. Pour les autres, il faut une URL signée.
 */

interface Erreur {
  message: string;
}

type Reponse<T> = { data: T; error: null } | { data: null; error: Erreur };

async function appeler<T>(chemin: string, options: RequestInit = {}): Promise<Reponse<T>> {
  try {
    const rep = await fetch(chemin, { credentials: 'same-origin', ...options });
    if (!rep.ok) {
      let message = `Erreur ${rep.status}`;
      try {
        const corps = (await rep.json()) as { message?: string };
        if (corps.message) message = corps.message;
      } catch {
        /* corps non JSON */
      }
      return { data: null, error: { message } };
    }
    const texte = await rep.text();
    return { data: (texte ? JSON.parse(texte) : null) as T, error: null };
  } catch (e) {
    return { data: null, error: { message: e instanceof Error ? e.message : 'Reseau injoignable' } };
  }
}

function encoderChemin(chemin: string): string {
  // Chaque segment est encodé séparément : les « / » structurent le chemin et
  // doivent rester tels quels.
  return chemin.split('/').map(encodeURIComponent).join('/');
}

class Bucket {
  constructor(private readonly nom: string) {}

  async upload(
    chemin: string,
    fichier: File | Blob,
    _options?: { upsert?: boolean; contentType?: string }
  ): Promise<Reponse<{ path: string }>> {
    const form = new FormData();
    form.append('file', fichier);
    const r = await appeler<{ chemin: string }>(
      `/api/storage/${this.nom}/${encoderChemin(chemin)}`,
      { method: 'POST', body: form }
    );
    if (r.error) return { data: null, error: r.error };
    return { data: { path: r.data.chemin }, error: null };
  }

  async download(chemin: string): Promise<Reponse<Blob>> {
    try {
      const rep = await fetch(`/api/storage/${this.nom}/${encoderChemin(chemin)}`, {
        credentials: 'same-origin',
      });
      if (!rep.ok) return { data: null, error: { message: `Erreur ${rep.status}` } };
      return { data: await rep.blob(), error: null };
    } catch (e) {
      return {
        data: null,
        error: { message: e instanceof Error ? e.message : 'Reseau injoignable' },
      };
    }
  }

  /** Idempotent : supprimer un fichier absent ne remonte pas d'erreur. */
  async remove(chemins: string[]): Promise<Reponse<null>> {
    for (const chemin of chemins) {
      const r = await appeler(`/api/storage/${this.nom}/${encoderChemin(chemin)}`, {
        method: 'DELETE',
      });
      if (r.error) return { data: null, error: r.error };
    }
    return { data: null, error: null };
  }

  async createSignedUrl(
    chemin: string,
    dureeSecondes: number
  ): Promise<Reponse<{ signedUrl: string }>> {
    const r = await appeler<{ url: string }>(
      `/api/storage/signer/${this.nom}/${encoderChemin(chemin)}`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ dureeSecondes }),
      }
    );
    if (r.error) return { data: null, error: r.error };
    return { data: { signedUrl: r.data.url }, error: null };
  }

  /**
   * URL directe. N'est réellement publique que pour `cabinet-logos` : les autres
   * buckets exigent une session ou une URL signée, et rendront 401.
   */
  getPublicUrl(chemin: string): { data: { publicUrl: string } } {
    return { data: { publicUrl: `/api/storage/${this.nom}/${encoderChemin(chemin)}` } };
  }
}

export const storage = {
  from(bucket: string): Bucket {
    return new Bucket(bucket);
  },
};
