import { describe, it, expect } from 'vitest';
import {
  estHorsPortefeuille,
  indexerClients,
  rapprocher,
  type ClientRapprochable,
} from './rapprochement';

/**
 * Le rapprochement société ↔ client.
 *
 * Ce qu'on lui demande vraiment : ne JAMAIS rattacher au hasard. Le
 * portefeuille contient des doublons — souvent une fiche archivée et une fiche
 * active portant le même SIREN — et `clients` n'a aucune contrainte d'unicité
 * pour les empêcher. Faire porter le suivi d'une société sur une autre fiche
 * serait pire que de ne rien rattacher du tout.
 */

const client = (p: Partial<ClientRapprochable>): ClientRapprochable => ({
  id: p.id ?? 'id',
  siren: p.siren ?? null,
  siret: p.siret ?? null,
  numero_dossier: p.numero_dossier ?? null,
  statut: p.statut ?? 'actif',
  nom_entreprise: p.nom_entreprise ?? 'Société',
});

describe('rapprochement par SIREN', () => {
  it('rattache sur un SIREN unique', () => {
    const index = indexerClients([client({ id: 'a', siren: '123456789', nom_entreprise: 'ALPHA' })]);
    expect(rapprocher({ siret: '12345678900017' }, index)).toEqual({
      clientId: 'a',
      clientNom: 'ALPHA',
      niveau: 'siren',
    });
  });

  it('accepte un client dont seul le SIRET est renseigne', () => {
    const index = indexerClients([client({ id: 'a', siret: '12345678900017' })]);
    expect(rapprocher({ siren: '123456789' }, index).clientId).toBe('a');
  });

  /** Le SIRET change au transfert d'etablissement, pas le SIREN. */
  it('rattache malgre un etablissement different', () => {
    const index = indexerClients([client({ id: 'a', siret: '12345678900017' })]);
    expect(rapprocher({ siret: '12345678900025' }, index).clientId).toBe('a');
  });
});

describe('doublons du portefeuille', () => {
  it('prefere la fiche vivante a la fiche archivee', () => {
    const index = indexerClients([
      client({ id: 'vieux', siren: '123456789', statut: 'archive' }),
      client({ id: 'vivant', siren: '123456789', statut: 'actif', nom_entreprise: 'ANDRIA' }),
    ]);
    const r = rapprocher({ siren: '123456789' }, index);
    expect(r.clientId).toBe('vivant');
    expect(r.niveau).toBe('siren');
  });

  /** Le point entier de ce module : refuser de choisir plutot que se tromper. */
  it('avoue l’ambiguite quand deux fiches actives partagent le SIREN', () => {
    const index = indexerClients([
      client({ id: 'un', siren: '123456789', statut: 'actif' }),
      client({ id: 'deux', siren: '123456789', statut: 'actif' }),
    ]);
    const r = rapprocher({ siren: '123456789' }, index);
    expect(r.niveau).toBe('ambigu');
    expect(r.clientId).toBeNull();
  });

  it('et ne retombe pas sur le dossier pour masquer cette ambiguite', () => {
    const index = indexerClients([
      client({ id: 'un', siren: '123456789', statut: 'actif' }),
      client({ id: 'deux', siren: '123456789', statut: 'actif' }),
      client({ id: 'trois', numero_dossier: '000333', statut: 'actif' }),
    ]);
    expect(rapprocher({ siren: '123456789', dossier: '000333' }, index).niveau).toBe('ambigu');
  });
});

describe('repli sur le numero de dossier', () => {
  it('rattache quand le SIREN ne dit rien', () => {
    const index = indexerClients([client({ id: 'a', numero_dossier: '000333' })]);
    const r = rapprocher({ dossier: '000333' }, index);
    expect(r.clientId).toBe('a');
    expect(r.niveau).toBe('dossier');
  });

  it('ignore la casse et les espaces', () => {
    const index = indexerClients([client({ id: 'a', numero_dossier: ' D-42 ' })]);
    expect(rapprocher({ dossier: 'd-42' }, index).clientId).toBe('a');
  });

  it('le SIREN garde la priorite sur le dossier', () => {
    const index = indexerClients([
      client({ id: 'parSiren', siren: '123456789' }),
      client({ id: 'parDossier', numero_dossier: '000333' }),
    ]);
    expect(rapprocher({ siren: '123456789', dossier: '000333' }, index).clientId).toBe('parSiren');
  });
});

describe('societes hors portefeuille', () => {
  it('rend « aucun » plutot que de forcer un rattachement', () => {
    const index = indexerClients([client({ id: 'a', siren: '111111111' })]);
    expect(rapprocher({ siren: '999999999' }, index)).toEqual({
      clientId: null,
      clientNom: null,
      niveau: 'aucun',
    });
  });

  /**
   * Le nom n'est JAMAIS une cle : le portefeuille reel contient des fautes de
   * frappe et des espaces terminaux (« ABRICO SERVCIES - GRANGER EDDY  »).
   */
  it('ne rapproche pas sur le nom, meme exact', () => {
    const index = indexerClients([client({ id: 'a', nom_entreprise: 'ALPHA' })]);
    expect(rapprocher({ siren: '', dossier: '' }, index).niveau).toBe('aucun');
  });

  it('un SIRET trop court ne vaut pas un SIREN', () => {
    const index = indexerClients([client({ id: 'a', siren: '123456789' })]);
    expect(rapprocher({ siret: '1234567' }, index).niveau).toBe('aucun');
  });
});

/**
 * Qui disparaît du suivi des échéances.
 *
 * La règle décide de ce que le cabinet VOIT COMME TRAVAIL À FAIRE. Une clause
 * de trop et un dossier bien vivant s'évapore de l'écran sans que personne ne
 * s'en aperçoive ; une clause de moins et le suivi se remplit de dossiers
 * partis. C'est aussi la seule partie du calcul d'échéances qui soit partagée
 * entre l'écran et l'outil MCP — la tester ici, c'est la tester pour les deux.
 */
describe('estHorsPortefeuille', () => {
  const fiche = (p: Partial<Parameters<typeof estHorsPortefeuille>[0]> = {}) => ({
    statut: 'actif',
    date_sortie_cabinet: null,
    ...p,
  });

  it('garde un dossier actif sans date de sortie', () => {
    expect(estHorsPortefeuille(fiche())).toBe(false);
  });

  it('écarte un dossier qui porte une date de sortie', () => {
    expect(estHorsPortefeuille(fiche({ date_sortie_cabinet: '2024-03-31' }))).toBe(true);
  });

  /**
   * La date n'est comparée à RIEN. Un dossier parti ne doit pas réapparaître
   * parce qu'on regarde une fenêtre antérieure à son départ, ni — comme ici —
   * parce que sa sortie est encore à venir.
   */
  it('écarte même une date de sortie future', () => {
    expect(estHorsPortefeuille(fiche({ date_sortie_cabinet: '2099-12-31' }))).toBe(true);
  });

  /**
   * Beaucoup d'archivages anciens n'ont jamais reçu de date : ne regarder que
   * `date_sortie_cabinet` laissait ces dossiers-là dans le suivi.
   */
  it('écarte une fiche archivée sans date de sortie', () => {
    expect(estHorsPortefeuille(fiche({ statut: 'archive' }))).toBe(true);
  });

  it('écarte une fiche inactive sans date de sortie', () => {
    expect(estHorsPortefeuille(fiche({ statut: 'inactif' }))).toBe(true);
  });

  /**
   * Un prospect qui télédéclare est une ANOMALIE, pas un dossier rangé : le
   * suivi doit la montrer, au même titre qu'une société non rapprochée.
   */
  it('garde un prospect', () => {
    expect(estHorsPortefeuille(fiche({ statut: 'prospect' }))).toBe(false);
  });

  it('garde une fiche dont le statut est absent', () => {
    expect(estHorsPortefeuille(fiche({ statut: null }))).toBe(false);
  });

  /**
   * `statut` vient d'une colonne texte libre côté base : une valeur inconnue ne
   * doit pas faire disparaître le dossier en silence.
   */
  it('garde une fiche au statut inconnu', () => {
    expect(estHorsPortefeuille(fiche({ statut: 'en_cours_de_reprise' }))).toBe(false);
  });

  it('écarte une chaîne vide de date comme une absence de date', () => {
    expect(estHorsPortefeuille(fiche({ date_sortie_cabinet: '' }))).toBe(false);
  });
});
