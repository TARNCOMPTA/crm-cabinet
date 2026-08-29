import { describe, it, expect } from 'vitest';
import { choisirStatuts, estStatuts, type PieceChoisissable } from './statuts.js';

/**
 * Le choix de la pièce à télécharger.
 * ---------------------------------------------------------------------------
 * Cette règle est la JUMELLE de `src/lib/statuts.ts` : l'une décide de ce que la
 * fiche client affiche, l'autre de ce que le bouton livre. Les deux fichiers
 * portent les mêmes cas, et c'est voulu — si l'un se met à répondre autrement,
 * son test le dit avant que l'utilisateur ne le découvre en ouvrant un PDF.
 *
 * Ce que ces tests ont trouvé le jour de leur écriture : `/statuts/i` appliqué
 * au libellé entier retenait « PV d'assemblee generale extraordinaire -
 * Modification des statuts », c'est-à-dire qu'un bouton « Télécharger les
 * statuts » livrait un procès-verbal.
 */

function piece(p: Partial<PieceChoisissable> & { type: string }): PieceChoisissable {
  return { id: p.type, category: 'autre', date: null, depositDate: null, ...p };
}

describe('estStatuts', () => {
  it('reconnait les trois pieces qui sont des statuts', () => {
    for (const type of ['Statuts', 'Statuts constitutifs', 'Statuts mis a jour']) {
      expect(estStatuts(type), type).toBe(true);
    }
  });

  /** Le libelle compose reste reconnu quand c'est son TYPE qui est des statuts. */
  it('accepte un libelle compose dont le type est des statuts', () => {
    expect(estStatuts('Statuts mis a jour - Transfert du siege social')).toBe(true);
  });

  /**
   * ⭐ LE DEFAUT CORRIGE. `resolveLibelle` compose « Type - description » des que
   * la piece porte une decision. Un PV qui DECIDE une modification des statuts
   * n'est pas les statuts, et le telechargement ne doit pas le servir.
   */
  it('ecarte un libelle dont seule la description parle de statuts', () => {
    expect(estStatuts("PV d'assemblee generale extraordinaire - Modification des statuts")).toBe(false);
    expect(estStatuts("Decision de l'associe unique - Refonte des statuts")).toBe(false);
    expect(estStatuts('Acte authentique - Mise a jour des statuts')).toBe(false);
  });

  it('ecarte les autres pieces du registre', () => {
    for (const type of ['Augmentation de capital', 'Comptes annuels', 'Extrait RCS', '']) {
      expect(estStatuts(type), type).toBe(false);
    }
  });
});

describe('choisirStatuts', () => {
  it('rend rien quand le registre ne porte aucune piece', () => {
    expect(choisirStatuts([])).toBeUndefined();
  });

  /**
   * ⭐ LE PLUS RECENT, et non le premier venu. La fiche annonce « derniere
   * version deposee » ; livrer les statuts d'origine sous ce libelle serait un
   * mensonge silencieux — c'est un PDF, personne n'en verifie la date avant de
   * le transmettre a une banque.
   */
  it('prend les statuts les plus recents, quel que soit l ordre de l INPI', () => {
    const choisi = choisirStatuts([
      piece({ id: 'vieux', type: 'Statuts constitutifs', category: 'creation', depositDate: '2015-06-01' }),
      piece({ id: 'recent', type: 'Statuts mis a jour', depositDate: '2022-03-14' }),
      piece({ id: 'milieu', type: 'Statuts mis a jour', depositDate: '2019-01-09' }),
    ]);
    expect(choisi?.id).toBe('recent');
  });

  it('retombe sur la date d acte quand le depot n est pas date', () => {
    const choisi = choisirStatuts([
      piece({ id: 'a', type: 'Statuts', date: '2020-01-01' }),
      piece({ id: 'b', type: 'Statuts', date: '2021-01-01' }),
    ]);
    expect(choisi?.id).toBe('b');
  });

  /** Une societe dont l'INPI n'etiquette aucune piece « statuts » a tout de meme
   *  un acte constitutif : mieux vaut le servir qu'un 404. */
  it('retombe sur l acte de creation faute de statuts nommes', () => {
    const choisi = choisirStatuts([
      piece({ id: 'pv', type: "PV d'assemblee generale ordinaire" }),
      piece({ id: 'crea', type: 'Acte authentique', category: 'creation' }),
    ]);
    expect(choisi?.id).toBe('crea');
  });

  it('ne rend rien plutot qu une piece sans rapport', () => {
    const choisi = choisirStatuts([
      piece({ id: 'ca', type: 'Comptes annuels' }),
      piece({ id: 'pv', type: "PV d'assemblee generale ordinaire - Modification des statuts" }),
    ]);
    expect(choisi).toBeUndefined();
  });
});

/**
 * Ce sur quoi s'appuie le repli du connecteur.
 * ---------------------------------------------------------------------------
 * ⚠️ `get_client_statuts` REPONDAIT « aucun statut au registre » SANS AVOIR
 * INTERROGE LE REGISTRE. Il ne l'appelait que si `legal_acts` etait VIDE ; une
 * base qui connaissait des actes, mais pas les bons, suffisait donc a produire
 * une affirmation sur le registre tiree du cache. Constate sur une SAS de 2023,
 * qui a forcement depose des statuts a sa constitution.
 *
 * Le connecteur redemande desormais au registre avant de conclure, et distingue
 * trois absences. Les deux cas ci-dessous fixent ce sur quoi cette distinction
 * repose.
 */
describe('les trois formes d une absence', () => {
  /**
   * Une piece RECONNUE mais sans identifiant est un cas a part : le document
   * existe, il n'est simplement pas telechargeable. Le connecteur doit pouvoir
   * le NOMMER a l'utilisateur au lieu de nier son existence — ce qui suppose que
   * `choisirStatuts` la rende plutot que de l'ecarter.
   */
  it('rend une piece de statuts meme privee d identifiant', () => {
    const choisi = choisirStatuts([
      piece({ id: null, type: 'Statuts constitutifs', depositDate: '2023-04-12' }),
    ]);
    expect(choisi?.type).toBe('Statuts constitutifs');
    expect(choisi?.id).toBeNull();
  });

  /**
   * Et le cas oppose : des pieces existent, aucune n'est des statuts. Le
   * connecteur en tire un message different — c'est la regle de reconnaissance
   * qui est suspecte, pas le registre — et joint les types vus pour qu'on
   * puisse trancher.
   */
  it('ne rend rien quand le registre ne porte que des depots de comptes', () => {
    const pieces = [
      piece({ id: 'c1', type: 'Depot des comptes annuels', category: 'comptes' }),
      piece({ id: 'c2', type: 'Depot des comptes annuels', category: 'comptes' }),
    ];
    expect(choisirStatuts(pieces)).toBeUndefined();
    // Ce que le message joindra : de quoi voir si les statuts s'y cachent sous
    // un libelle inattendu.
    expect([...new Set(pieces.map((p) => p.type))]).toEqual(['Depot des comptes annuels']);
  });
});
