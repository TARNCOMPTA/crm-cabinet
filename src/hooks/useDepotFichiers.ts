import { useRef, useState, type DragEvent } from 'react';

/**
 * Déposer des fichiers — le geste, puis la zone qui l'affiche.
 * ---------------------------------------------------------------------------
 * ⚠️ LE CLIC RESTE PARTOUT, ET CE N'EST PAS UNE HÉSITATION. Une cible de dépôt
 * est inatteignable au clavier : on ne « glisse » pas au clavier, et aucun
 * lecteur d'écran n'annonce une zone de `drop`. Un bouton porte donc toujours
 * le même geste, et c'est lui qui est annoncé ; le dépôt est un raccourci à la
 * souris par-dessus, jamais le seul chemin.
 *
 * ⚠️ LE COMPTEUR D'ENTRÉES, ET NON UN SIMPLE BOOLÉEN. `dragleave` se déclenche
 * aussi quand le pointeur passe sur un ENFANT de la zone — un libellé, une
 * icône — et un booléen éteignait la surbrillance à chaque traversée : la zone
 * clignotait tout le long du survol. Compter les entrées et les sorties donne
 * l'état réel.
 *
 * ⚠️ `dragover` DOIT APPELER `preventDefault()` À CHAQUE ÉVÉNEMENT. Sans cela
 * le navigateur refuse le dépôt et se contente d'ouvrir le fichier dans un
 * onglet — l'utilisateur perd sa page et son travail en cours.
 */

/** Le geste seul, à poser sur n'importe quel élément. */
export function useDepotFichiers(
  onFichiers: (fichiers: File[]) => void,
  disabled = false
) {
  const [survol, setSurvol] = useState(false);
  const entrees = useRef(0);

  function reinitialiser() {
    entrees.current = 0;
    setSurvol(false);
  }

  return {
    survol,
    gestionnaires: {
      onDragEnter: (e: DragEvent) => {
        e.preventDefault();
        if (disabled) return;
        entrees.current += 1;
        setSurvol(true);
      },
      onDragOver: (e: DragEvent) => e.preventDefault(),
      onDragLeave: (e: DragEvent) => {
        e.preventDefault();
        entrees.current -= 1;
        if (entrees.current <= 0) reinitialiser();
      },
      onDrop: (e: DragEvent) => {
        e.preventDefault();
        reinitialiser();
        if (disabled) return;
        const fichiers = Array.from(e.dataTransfer.files);
        if (fichiers.length > 0) onFichiers(fichiers);
      },
    },
  };
}
