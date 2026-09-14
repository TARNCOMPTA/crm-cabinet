import { describe, it, expect } from 'vitest';

// `mail.ts` importe `config.js`, qui exige DATABASE_URL et SESSION_SECRET au
// chargement. Ce test ne touche ni la base ni le reseau — il n'eprouve qu'une
// fonction pure — mais l'import doit tout de meme les trouver. Meme preambule
// que `tests/outils-mcp.test.ts`.
process.env.DATABASE_URL ??= 'postgres://test-sans-connexion-reelle/test';
process.env.SESSION_SECRET ??= 'secret-de-test-jamais-utilise-pour-signer-32c';

const { estRefusAuthentification, resoudrePieces, nettoyerNomPiece } = await import('./mail.js');

/**
 * Ce que cette garde protege : la boite du cabinet.
 *
 * Un refus d'identifiants ne se repare pas en reessayant. Chaque tentative est
 * un echec d'authentification de plus, et Microsoft 365 verrouille le compte au
 * bout de quelques-uns. Constate en production le 2026-09-08 :
 * « 535 5.7.139 Authentication unsuccessful, account locked. »
 *
 * On lit le CODE et non le texte : le message change avec le fournisseur, sa
 * langue et sa version.
 */
describe('estRefusAuthentification', () => {
  it('reconnait le code que nodemailer pose sur un refus', () => {
    expect(estRefusAuthentification({ code: 'EAUTH' })).toBe(true);
  });

  it('reconnait les trois codes SMTP d authentification', () => {
    for (const responseCode of [530, 534, 535]) {
      expect(estRefusAuthentification({ responseCode }), String(responseCode)).toBe(true);
    }
  });

  it('reconnait le refus reel de Microsoft 365', () => {
    const e = Object.assign(
      new Error('Invalid login: 535 5.7.139 Authentication unsuccessful, the user credentials were incorrect.'),
      { code: 'EAUTH', responseCode: 535 }
    );
    expect(estRefusAuthentification(e)).toBe(true);
  });

  it('NE prend PAS un refus de destinataire pour un refus d identifiants', () => {
    // 550 est un 5xx : definitif, donc pas de reprise pour CE message. Mais la
    // connexion, elle, est bonne — interrompre le lot priverait d'envoi tous
    // les courriels suivants a cause d'une seule adresse invalide.
    expect(estRefusAuthentification({ responseCode: 550 })).toBe(false);
    expect(estRefusAuthentification({ responseCode: 553 })).toBe(false);
  });

  it('NE prend PAS une panne reseau pour un refus d identifiants', () => {
    expect(estRefusAuthentification({ code: 'ETIMEDOUT' })).toBe(false);
    expect(estRefusAuthentification({ code: 'ECONNECTION' })).toBe(false);
    expect(estRefusAuthentification({ responseCode: 451 })).toBe(false);
    expect(estRefusAuthentification(new Error('boom'))).toBe(false);
    expect(estRefusAuthentification(null)).toBe(false);
    expect(estRefusAuthentification(undefined)).toBe(false);
  });
});


/**
 * La traduction des references de la file en pieces jointes.
 *
 * Ce qui se joue ici n'est pas un confort d'affichage : `resoudrePieces` est la
 * derniere barriere avant qu'un fichier du serveur ne parte par courriel vers
 * toute la clientele du cabinet. Chaque refus est donc eprouve pour lui-meme.
 */
describe('resoudrePieces', () => {
  const RACINE = '/var/crm/storage';
  const bonne = {
    nom: 'lettre-de-mission.pdf',
    bucket: 'campagne-attachments',
    chemin: '2026/09/ab12.pdf',
    type: 'application/pdf',
    taille: 1024,
  };

  it('traduit une piece valide en attachement nodemailer', () => {
    const r = resoudrePieces(RACINE, [bonne]);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.attachments).toHaveLength(1);
    expect(r.attachments[0].filename).toBe('lettre-de-mission.pdf');
    expect(r.attachments[0].path).toBe('/var/crm/storage/campagne-attachments/2026/09/ab12.pdf');
    expect(r.attachments[0].contentType).toBe('application/pdf');
  });

  it('rend une liste vide sans rien refuser quand il n y a aucune piece', () => {
    const r = resoudrePieces(RACINE, []);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.attachments).toEqual([]);
  });

  /*
    LE cas. Une colonne `jsonb` est de la donnee : la validation faite au depot
    portait sur une autre valeur, des jours plus tot. Si celle-ci remonte hors
    du bucket, le fichier pointe partirait en piece jointe a chaque destinataire.
  */
  it('REFUSE un chemin qui remonte hors du bucket', () => {
    const r = resoudrePieces(RACINE, [{ ...bonne, chemin: '../../../etc/passwd' }]);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.raison).toContain('hors perimetre');
  });

  it('REFUSE un chemin absolu, qui ne contient pourtant aucun « .. »', () => {
    const r = resoudrePieces(RACINE, [{ ...bonne, chemin: '/etc/shadow' }]);
    expect(r.ok).toBe(false);
  });

  it('REFUSE un bucket etranger au stockage', () => {
    const r = resoudrePieces(RACINE, [{ ...bonne, bucket: 'inconnu' }]);
    expect(r.ok).toBe(false);
  });

  it('REFUSE une entree mal formee plutot que de la contourner', () => {
    const r = resoudrePieces(RACINE, [{ nom: 'x' } as never]);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.raison).toContain('mal formee');
  });

  /*
    ⚠️ UN SEUL REFUS FAIT ECHOUER L'ENSEMBLE, et c'est voulu. Envoyer le courriel
    avec la seule piece valide donnerait un message qui annonce deux documents et
    n'en porte qu'un — faux, et invisible pour le destinataire.
  */
  it('refuse TOUT le courriel des qu une seule piece est refusee', () => {
    const r = resoudrePieces(RACINE, [bonne, { ...bonne, chemin: '../../etc/passwd' }]);
    expect(r.ok).toBe(false);
  });

  it('ne laisse pas le nom de la piece refusee divulguer le chemin tente', () => {
    const r = resoudrePieces(RACINE, [
      { ...bonne, nom: 'innocent.pdf', chemin: '../../../etc/passwd' },
    ]);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.raison).toContain('innocent.pdf');
    expect(r.raison).not.toContain('etc/passwd');
  });
});

/**
 * Le nom d'une piece jointe atterrit dans un en-tete MIME. Un retour chariot y
 * couperait l'en-tete et laisserait ecrire les suivants : meme classe de faille
 * que l'injection d'en-tete SMTP que `nettoyerSujet` ferme sur le sujet.
 */
describe('nettoyerNomPiece', () => {
  it('laisse un nom ordinaire intact', () => {
    expect(nettoyerNomPiece('lettre de mission 2026.pdf')).toBe('lettre de mission 2026.pdf');
  });

  it('neutralise un retour chariot, donc l injection d en-tete', () => {
    const sale = 'facture.pdf\r\nContent-Type: text/html';
    expect(nettoyerNomPiece(sale)).not.toContain('\r');
    expect(nettoyerNomPiece(sale)).not.toContain('\n');
  });

  it('neutralise le guillemet, qui refermerait filename en avance', () => {
    expect(nettoyerNomPiece('a".exe')).toBe('a_.exe');
  });

  it('ne garde que le dernier segment d un chemin', () => {
    expect(nettoyerNomPiece('2026/09/note.pdf')).toBe('note.pdf');
  });

  it('rend un nom utilisable meme quand il ne reste rien', () => {
    expect(nettoyerNomPiece('   ')).toBe('piece');
    expect(nettoyerNomPiece('')).toBe('piece');
  });
});
