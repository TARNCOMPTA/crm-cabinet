import { describe, it, expect } from 'vitest';
import { messageEchecAffectation } from './erreursAffectations';

/**
 * Chaque cas correspond à une conduite différente pour l'utilisateur : rouvrir
 * la fenêtre, se reconnecter, appeler un administrateur, ou réessayer. C'est
 * cette distinction qui est gardée ici — pas la formulation.
 */
describe('messageEchecAffectation', () => {
  const defaut = 'erreur inconnue';

  it('nomme le doublon plutot que de le taire', () => {
    const m = messageEchecAffectation({ code: '23505', message: 'duplicate key' }, defaut);
    expect(m).toMatch(/existe déjà/);
    // Le texte brut de PostgreSQL ne remonte pas a l'ecran.
    expect(m).not.toMatch(/duplicate key/);
  });

  it('distingue la cle etrangere du doublon', () => {
    expect(messageEchecAffectation({ code: '23503' }, defaut)).toMatch(/supprimé entre-temps/);
  });

  it('dit « refus » et non « panne » quand le droit manque', () => {
    expect(messageEchecAffectation({ code: '42501' }, defaut)).toMatch(/Droits insuffisants/);
    expect(messageEchecAffectation({ status: 403 }, defaut)).toMatch(/Droits insuffisants/);
  });

  it('renvoie a la reconnexion sur un 401, en disant que rien n a bouge', () => {
    const m = messageEchecAffectation({ status: 401 }, defaut);
    expect(m).toBe('Session expirée : reconnectez-vous');
    // Rien ici ne se prononce sur ce qui a ete ecrit : c'est l'appelant qui le
    // sait, et qui le prefixe. Le dire des deux cotes se contredirait.
    expect(m).not.toMatch(/enregistré/);
  });

  it('lit aussi le statut a la mode axios', () => {
    expect(messageEchecAffectation({ response: { status: 403 } }, defaut)).toMatch(/Droits insuffisants/);
  });

  /**
   * ⚠️ L'ORDRE COMPTE. PostgREST renvoie une violation d'unicite dans une
   * reponse 409, et une erreur de contrainte dans un 400 : lire le statut avant
   * le code remplacerait le diagnostic precis par un generique.
   */
  it('prefere le code PostgreSQL au statut HTTP quand les deux sont la', () => {
    const m = messageEchecAffectation({ code: '23505', status: 409 }, defaut);
    expect(m).toMatch(/existe déjà/);
  });

  /**
   * ⚠️ VU DANS CHROMIUM, sur le harnais : le bandeau affichait « Ajout
   * impossible — TypeError: Failed to fetch ». Un message du navigateur, en
   * anglais, devant un expert-comptable.
   */
  it('traduit l absence de reponse plutot que d afficher « Failed to fetch »', () => {
    // La forme exacte que rend `postgrest-js` quand la requete n'obtient aucune
    // reponse : statut zero, code vide, message du navigateur.
    const m = messageEchecAffectation(
      { message: 'TypeError: Failed to fetch', code: '', details: '', hint: '', status: 0 },
      defaut
    );
    expect(m).toBe('Serveur injoignable : vérifiez votre connexion');
    expect(m).not.toMatch(/fetch/i);
  });

  it('couvre aussi le TypeError nu, hors postgrest-js', () => {
    expect(messageEchecAffectation(new TypeError('Failed to fetch'), defaut))
      .toBe('Serveur injoignable : vérifiez votre connexion');
  });

  /**
   * ⚠️ CE CAS NE PASSAIT PAS AVANT `lever()`. `postgrest-js` rend le statut a
   * COTE de l'erreur, et le composant ne levait que l'erreur : le 401 n'arrivait
   * jamais jusqu'ici, et l'ecran affichait « JWT expired ».
   */
  it('reconnait la session expiree sur la forme reelle de postgrest-js', () => {
    const m = messageEchecAffectation(
      { message: 'JWT expired', code: '', details: null, hint: null, status: 401 },
      defaut
    );
    expect(m).toMatch(/Session expirée/);
    expect(m).not.toMatch(/JWT/);
  });

  it('garde le message porte par une erreur ordinaire', () => {
    expect(messageEchecAffectation(new Error('Contrainte metier refusee'), defaut))
      .toBe('Contrainte metier refusee');
  });

  it('se rabat sur le defaut, jamais sur « undefined »', () => {
    expect(messageEchecAffectation(undefined, defaut)).toBe(defaut);
    expect(messageEchecAffectation({}, defaut)).toBe(defaut);
    expect(messageEchecAffectation({ message: '' }, defaut)).toBe(defaut);
    expect(messageEchecAffectation('une chaine nue', defaut)).toBe(defaut);
  });

  it('ignore un code inconnu et retombe sur le message', () => {
    expect(messageEchecAffectation({ code: '40001', message: 'serialization failure' }, defaut))
      .toBe('serialization failure');
  });
});
