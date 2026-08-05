import { describe, it, expect } from 'vitest';
import { sanitizeHtml } from './sanitize';

// sanitizeHtml est la SEULE défense contre le XSS du CRM : c'est elle qui filtre
// tout ce qui part dans un dangerouslySetInnerHTML. Un assouplissement accidentel
// de sa liste blanche ne casserait rien de visible — d'où ces tests.
//
// Ce module survit à la refonte des pages « documents » et « gabarits », contrairement
// à documentVariables et templateIconMap : c'est ici que le filet de sécurité a sa place.

describe('sanitizeHtml — ce qui doit être supprimé', () => {
  it('retire les balises script', () => {
    const out = sanitizeHtml('<p>Bonjour</p><script>alert(1)</script>');
    expect(out).not.toContain('script');
    expect(out).not.toContain('alert');
    expect(out).toContain('Bonjour');
  });

  it('retire les gestionnaires d evenements inline', () => {
    const out = sanitizeHtml('<img src="x" onerror="alert(1)">');
    expect(out).not.toContain('onerror');
    expect(out).not.toContain('alert');
  });

  it('retire onclick sur une balise autorisee', () => {
    const out = sanitizeHtml('<div onclick="voler()">texte</div>');
    expect(out).not.toContain('onclick');
    expect(out).toContain('texte');
  });

  it('neutralise une URL javascript: dans un lien', () => {
    const out = sanitizeHtml('<a href="javascript:alert(1)">clic</a>');
    expect(out).not.toContain('javascript:');
  });

  it('retire iframe, object et embed', () => {
    for (const balise of ['iframe', 'object', 'embed']) {
      const out = sanitizeHtml(`<${balise} src="https://exemple.fr"></${balise}>`);
      expect(out, balise).not.toContain(balise);
    }
  });

  it('retire les balises form et input', () => {
    const out = sanitizeHtml('<form action="/vol"><input name="mdp"></form>');
    expect(out).not.toContain('<form');
    expect(out).not.toContain('<input');
  });

  it('retire les attributs data-* (ALLOW_DATA_ATTR est a false)', () => {
    const out = sanitizeHtml('<div data-secret="x">texte</div>');
    expect(out).not.toContain('data-secret');
    expect(out).toContain('texte');
  });

  it('retire une balise interdite mais conserve son texte', () => {
    const out = sanitizeHtml('<marquee>contenu important</marquee>');
    expect(out).not.toContain('marquee');
    expect(out).toContain('contenu important');
  });

  it('resiste a une balise script imbriquee et malformee', () => {
    const out = sanitizeHtml('<div><scr<script>ipt>alert(1)</script></div>');
    expect(out).not.toContain('alert(1)</scr');
    expect(out.toLowerCase()).not.toContain('<script');
  });
});

describe('sanitizeHtml — ce qui doit être conservé', () => {
  it('conserve la mise en forme de base', () => {
    const html = '<h1>Titre</h1><p><strong>gras</strong> et <em>italique</em></p>';
    expect(sanitizeHtml(html)).toBe(html);
  });

  it('conserve les tableaux avec colspan et rowspan', () => {
    const html = '<table><tbody><tr><td colspan="2" rowspan="1">cellule</td></tr></tbody></table>';
    expect(sanitizeHtml(html)).toContain('colspan="2"');
    expect(sanitizeHtml(html)).toContain('rowspan="1"');
  });

  it('conserve les listes', () => {
    const html = '<ul><li>un</li><li>deux</li></ul>';
    expect(sanitizeHtml(html)).toBe(html);
  });

  it('conserve un lien http avec target et rel', () => {
    const out = sanitizeHtml('<a href="https://exemple.fr" target="_blank" rel="noopener">lien</a>');
    expect(out).toContain('href="https://exemple.fr"');
    expect(out).toContain('target="_blank"');
  });

  it('conserve une image avec ses dimensions', () => {
    const out = sanitizeHtml('<img src="https://exemple.fr/logo.png" alt="logo" width="80">');
    expect(out).toContain('src="https://exemple.fr/logo.png"');
    expect(out).toContain('alt="logo"');
  });

  it('conserve class mais retire style', () => {
    // Ce test affirmait l'inverse jusqu'au 31/07 : `style` etait autorise, et le
    // commentaire disait « si on decidait un jour de le retirer, ce test
    // echouerait et signalerait que le changement est intentionnel plutot que
    // subi ». C'est exactement ce qui s'est passe — `style` a ete retire de la
    // liste blanche, et le test a signale le changement au moment de rapprocher
    // les deux branches. Il est mis a jour dans le sens du durcissement.
    //
    // Pourquoi le durcissement est le bon choix : un attribut `style` accepte
    // ouvre `position:fixed`, `opacity:0` et les fonds arbitraires, donc la
    // superposition d'un faux ecran par-dessus le vrai. La mise en forme d'un
    // document n'a pas besoin de style en ligne, les classes suffisent.
    const out = sanitizeHtml('<span class="titre" style="color:#7c2d5e">texte</span>');
    expect(out).toContain('class="titre"');
    expect(out).not.toContain('style=');
  });

  it('neutralise un href en javascript: et impose rel sur target=_blank', () => {
    // Second garde-fou ajoute en meme temps que le retrait de `style`.
    // `javascript:` dans un href execute du code au clic ; `target="_blank"`
    // sans `rel="noopener"` donne a la page ouverte une reference vers la
    // fenetre d'origine, donc la possibilite de la rediriger.
    expect(sanitizeHtml('<a href="javascript:alert(1)">clic</a>')).not.toContain('javascript:');
    const lien = sanitizeHtml('<a href="https://exemple.fr" target="_blank">clic</a>');
    expect(lien).toContain('rel="noopener noreferrer"');
  });

  it('laisse le texte simple intact', () => {
    expect(sanitizeHtml('Bonjour, ceci est un test.')).toBe('Bonjour, ceci est un test.');
  });

  it('ne casse pas sur une chaine vide', () => {
    expect(sanitizeHtml('')).toBe('');
  });
});
