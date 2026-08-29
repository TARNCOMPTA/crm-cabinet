import { describe, it, expect } from 'vitest';

// `routes/mcp.ts` importe la configuration au chargement. Ce test ne touche ni
// la base ni le reseau — meme preambule que `mcp/outils.test.ts`.
process.env.DATABASE_URL ??= 'postgres://test-sans-connexion-reelle/test';
process.env.SESSION_SECRET ??= 'secret-de-test-jamais-utilise-pour-signer-32c';

const { enveloppeMcp } = await import('./mcp.js');

/**
 * L'enveloppe des reponses d'outil.
 * ---------------------------------------------------------------------------
 * Elle a longtemps ete une constante : un bloc de texte, toujours. L'ouverture
 * aux images — pour qu'un modele puisse LIRE un statut scanne — en fait une
 * decision, et une decision se teste.
 *
 * Le risque qu'on ferme ici est celui d'un outil qui deborderait : si n'importe
 * quel objet pouvait composer l'enveloppe, un outil rendrait un jour un contenu
 * que le client refuse, et la conversation s'arreterait sans explication.
 */
describe('enveloppeMcp', () => {
  it('serialise un objet ordinaire en un unique bloc de texte', () => {
    const blocs = enveloppeMcp({ etat: 'extrait', pages: 12 });
    expect(blocs).toHaveLength(1);
    expect(blocs[0]!.type).toBe('text');
    expect(JSON.parse(String(blocs[0]!.text))).toEqual({ etat: 'extrait', pages: 12 });
  });

  it('serialise aussi un tableau, une chaine ou null', () => {
    expect(enveloppeMcp([1, 2])[0]!.text).toBe('[\n  1,\n  2\n]');
    expect(enveloppeMcp(null)[0]!.text).toBe('null');
    expect(enveloppeMcp('bonjour')[0]!.text).toBe('"bonjour"');
  });

  /** Le seul cas ou un outil compose lui-meme : les pages d'un scan. */
  it('laisse passer les blocs d’un outil qui en fournit', () => {
    const blocs = enveloppeMcp({
      blocsMcp: [
        { type: 'text', text: '{"etat":"scanne-image"}' },
        { type: 'image', mimeType: 'image/png', data: 'iVBORw0KGgo=' },
      ],
    });
    expect(blocs).toHaveLength(2);
    expect(blocs[1]!.type).toBe('image');
    expect(blocs[1]!.mimeType).toBe('image/png');
  });

  /**
   * ⚠️ UN TABLEAU VIDE RENDRAIT UNE REPONSE SANS CONTENU, que le client affiche
   * comme un silence — l'outil aurait l'air de n'avoir rien trouve alors qu'il a
   * repondu. On retombe sur le texte.
   */
  it('ne rend jamais une reponse vide', () => {
    const blocs = enveloppeMcp({ blocsMcp: [] });
    expect(blocs).toHaveLength(1);
    expect(blocs[0]!.type).toBe('text');
  });

  /** `blocsMcp` qui n'est pas un tableau ne prend pas la main. */
  it('ignore un blocsMcp qui n’en est pas un', () => {
    expect(enveloppeMcp({ blocsMcp: 'pas un tableau' })[0]!.type).toBe('text');
    expect(enveloppeMcp({ blocsMcp: null })[0]!.type).toBe('text');
  });
});
