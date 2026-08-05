-- Normaliser les adresses clients restees au format JSON.
-- ===========================================================================
-- `clients.adresse` est une colonne `text` qui contient une adresse lisible :
-- « 12 RUE de l Exemple, 81120 Villeneuve ». C'est ce qu'ecrivent aujourd'hui la
-- synchronisation INPI (src/lib/inpiService.ts) et la creation de client
-- (src/components/clients/ClientCreateModal.tsx).
--
-- Mais 88 des 649 clients portaient encore la forme JSON produite par une
-- version anterieure de l'application :
--
--     {"ligne1":"12 RUE de l Exemple","codePostal":"81120","ville":"Villeneuve"}
--
-- La migration les a repris tels quels — fidelement, puisqu'ils etaient deja
-- ainsi dans la base d'origine. L'ecran de fiche client les affichait donc
-- bruts, accolades comprises.
--
-- Ces 88 lignes ont toutes exactement les trois memes cles, toutes renseignees :
-- la conversion est sans perte. Elle est aussi idempotente — le filtre ne
-- retient que ce qui commence par une accolade, et le resultat n'en a plus.
--
-- Verifie le 2026-08-01 : 88 lignes converties, aucune adresse texte touchee.
--
--   sh -c 'psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f scripts/normaliser-adresses.sql'

BEGIN;

-- Trace de l'avant : conserver de quoi revenir en arriere sans dependre d'une
-- sauvegarde complete.
CREATE TABLE IF NOT EXISTS _adresses_avant_normalisation (
  client_id uuid PRIMARY KEY,
  adresse   text NOT NULL,
  copie_le  timestamptz NOT NULL DEFAULT now()
);

INSERT INTO _adresses_avant_normalisation (client_id, adresse)
SELECT id, adresse FROM clients WHERE adresse LIKE '{%'
ON CONFLICT (client_id) DO NOTHING;

UPDATE clients
SET adresse = concat_ws(
      ', ',
      nullif(adresse::jsonb ->> 'ligne1', ''),
      nullif(
        concat_ws(' ',
          nullif(adresse::jsonb ->> 'codePostal', ''),
          nullif(adresse::jsonb ->> 'ville', '')
        ),
        ''
      )
    )
WHERE adresse LIKE '{%'
  AND adresse::jsonb ?& array['ligne1', 'codePostal', 'ville'];

-- Filet : si une adresse JSON subsiste, c'est qu'elle avait d'autres cles et
-- qu'elle est passee au travers. Mieux vaut le savoir tout de suite.
DO $$
DECLARE restantes integer;
BEGIN
  SELECT count(*) INTO restantes FROM clients WHERE adresse LIKE '{%';
  IF restantes > 0 THEN
    RAISE EXCEPTION '% adresse(s) encore au format JSON : cles inattendues.', restantes;
  END IF;
END $$;

COMMIT;
