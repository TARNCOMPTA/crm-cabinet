-- ============================================================================
-- L'adresse de facturation electronique du client.
-- ============================================================================
--
-- La reforme francaise de la facturation electronique impose que chaque
-- entreprise soit JOIGNABLE a une adresse, par laquelle ses fournisseurs lui
-- adressent leurs factures. Le cabinet doit la connaitre pour chacun de ses
-- clients : sans elle, une facture emise pour leur compte n'arrive nulle part.
--
-- ⚠️ POURQUOI UNE COLONNE, ET NON `siret` REUTILISE. L'adresse EST le plus
-- souvent le SIRET, et c'est ce qui rend la confusion tentante. Elle ne l'est
-- pas toujours :
--
--   · elle peut porter un CODE DE ROUTAGE, qui dirige la facture vers un
--     service precis a l'interieur de l'entreprise ;
--   · elle peut designer une AUTRE entite — une filiale qui fait adresser ses
--     factures au siege, un groupe qui centralise ;
--   · elle peut etre un identifiant porte par la plateforme du client, sans
--     rapport de forme avec un SIRET.
--
-- Ecrire l'adresse dans `siret` melerait donc deux faits differents dans une
-- meme case : l'identite legale de l'entreprise, et l'endroit ou lui envoyer
-- une facture. Le jour ou les deux different — c'est-a-dire le jour ou cette
-- colonne sert vraiment — l'un des deux serait faux.
--
-- ⚠️ TEXTE LIBRE, ET AUCUNE CONTRAINTE DE FORMAT. La reforme admet plusieurs
-- formes, elles evoluent encore, et une contrainte trop stricte refuserait une
-- adresse valable en production un dimanche soir. Le controle existe, mais il
-- est CONSULTATIF et vit dans l'ecran (`src/lib/facturationElectronique.ts`) :
-- il signale une incoherence, il n'empeche jamais d'enregistrer. Une adresse
-- qu'on ne peut pas saisir est pire qu'une adresse qu'on saisit de travers —
-- la seconde se corrige, la premiere fait sortir du logiciel.
--
-- Nullable, sans valeur par defaut : « pas encore renseignee » et « vide » ne
-- doivent pas se confondre, et aucune fiche existante n'est modifiee.
-- ============================================================================

ALTER TABLE "clients"
  ADD COLUMN IF NOT EXISTS "adresse_facturation_electronique" text;

COMMENT ON COLUMN "clients"."adresse_facturation_electronique" IS
  'Adresse a laquelle le client recoit ses factures electroniques (reforme '
  'facturation electronique). Le plus souvent son SIRET, parfois avec un code '
  'de routage, parfois une autre entite. Distincte de la colonne siret : voir '
  'schema/increments/019-facturation-electronique.sql.';
