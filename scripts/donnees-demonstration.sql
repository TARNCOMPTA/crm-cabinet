-- ============================================================================
-- Un portefeuille de DEMONSTRATION, entierement fictif.
--
-- A quoi il sert, et pourquoi il est versionne :
--
--   · il rend executables les 110 tests qui s'ignorent d'eux-memes sur un poste
--     de travail (`tests/e2e.test.ts` a besoin d'une instance PEUPLEE) ;
--   · il permet de montrer le produit — capture, video, demonstration a un
--     confrere — sans jamais ouvrir un dossier client reel ;
--   · il donne a qui reprend le depot de quoi voir l'application vivante en une
--     commande, au lieu d'un ecran vide qui n'apprend rien.
--
-- ⚠️ RIEN ICI N'EXISTE. Les societes, les dirigeants et les collaborateurs sont
-- inventes. Les SIREN sont hors des plages attribuees et ne passent pas la cle
-- de Luhn : ils ne designent personne, et ne le pourront jamais. Les adresses
-- sont des lieux publics d'Albi et du Tarn, pas des domiciles.
--
-- ⚠️ IL NE S'APPLIQUE PAS SUR UNE BASE QUI PORTE DEJA DES CLIENTS. La garde
-- ci-dessous leve plutot que d'ecrire. Un fichier de donnees d'essai lance par
-- erreur sur une instance de production melerait des societes inventees a de
-- vraies, et c'est le genre de melange qu'on ne demele pas : rien ne distingue
-- ensuite une fiche semee d'une fiche saisie, sinon le SIREN, que personne ne
-- verifie.
--
-- Applique par `scripts/harnais.sh`. Pour le poser a la main :
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f scripts/donnees-demonstration.sql
-- ============================================================================

DO $$
BEGIN
  IF (SELECT count(*) FROM clients) > 0 THEN
    RAISE EXCEPTION
      'Cette base porte deja % client(s) : les donnees de demonstration ne '
      'seront pas appliquees. Elles ne s''ajoutent qu''a une base vide.',
      (SELECT count(*) FROM clients);
  END IF;
END $$;

-- ---------------------------------------------------------------- le cabinet
INSERT INTO cabinets (nom, adresse, email, telephone)
VALUES ('Cabinet Démonstration', '12 rue des Lices, 81000 Albi',
        'contact@cabinet-demo.invalid', '05 63 00 00 00');

-- ------------------------------------------------------------- le vocabulaire
-- Aucun de ces referentiels n'est seme par le schema : chaque cabinet definit
-- les siens dans Reglages. Sans eux, les selecteurs de la fiche client sont
-- vides et les tests qui les exercent ne prouvent rien.
INSERT INTO regimes_fiscaux (value, label, description, position, is_active) VALUES
  ('IS_REEL',  'IS réel normal',    'Impôt sur les sociétés, régime réel normal',   1, true),
  ('IS_SIMPL', 'IS réel simplifié', 'Impôt sur les sociétés, régime simplifié',     2, true),
  ('BIC_REEL', 'BIC réel',          'Bénéfices industriels et commerciaux',         3, true),
  ('BNC_DECL', 'BNC déclaratif',    'Bénéfices non commerciaux',                    4, true),
  ('SCI_IR',   'SCI à l''IR',       'Société civile immobilière, revenus fonciers',  5, true);

INSERT INTO legal_forms (code, label, level) VALUES
  ('5499', 'SARL', 1), ('5710', 'SAS', 1), ('5720', 'SASU', 1),
  ('6540', 'SCI', 1),  ('5498', 'EURL', 1), ('1000', 'Entrepreneur individuel', 1)
ON CONFLICT DO NOTHING;

INSERT INTO task_categories (nom, couleur, position, is_active) VALUES
  ('Bilan', '#7c3aed', 1, true), ('TVA', '#0891b2', 2, true),
  ('Juridique', '#b45309', 3, true), ('Social', '#059669', 4, true),
  ('Fiscal', '#be123c', 5, true);

INSERT INTO opportunity_columns (name, color, position) VALUES
  ('À contacter', '#94a3b8', 1), ('Rendez-vous', '#0ea5e9', 2),
  ('Proposition', '#f59e0b', 3), ('Gagné', '#10b981', 4);

-- `category` est contraint : comptabilite|paie|facturation|gestion|crm|autre.
INSERT INTO software (name, category, description, is_active) VALUES
  ('MyUnisoft', 'comptabilite', 'Production comptable',          true),
  ('Pennylane', 'comptabilite', 'Pré-comptabilité client',       true),
  ('Silae',     'paie',         'Production des bulletins',      true),
  ('Tiime',     'facturation',  'Facturation et notes de frais', true),
  ('Sage 100',  'comptabilite', 'Comptabilité installée',        true);

INSERT INTO cabinet_collaborator_roles (key, label, color, description, position, is_default) VALUES
  ('principal',   'Dossier principal', '#7c3aed', 'Collaborateur en charge du dossier', 1, true),
  ('superviseur', 'Supervision',       '#0891b2', 'Revue et signature',                 2, false),
  ('paie',        'Paie',              '#059669', 'Production des bulletins',           3, false)
ON CONFLICT DO NOTHING;

-- --------------------------------------------------------------- le portefeuille
-- `SANS EMAIL SARL` est une fiche VIDE DE TOUT, et elle n'est pas un oubli :
-- c'est la condition d'existence des cases de saisie que `tests/e2e.test.ts`
-- exerce (« permet de completer les champs manquants sans ouvrir la fiche »).
-- Ne pas la completer.
INSERT INTO clients
  (nom_entreprise, siren, siret, forme_juridique, statut, numero_dossier, regime_fiscal,
   code_ape, capital_social, dirigeant, date_cloture, email, telephone, ville, code_postal,
   adresse_ligne1, date_entree_cabinet, description_activite, type_personne, parts_totales)
VALUES
 ('BOULANGERIE DU PONT VIEUX','000000101','00000010100011','SARL','actif','A-001','IS_SIMPL','1071C',10000,'Camille FOURNIER','2026-12-31','contact@pontvieux.invalid','05 63 11 11 11','Albi','81000','3 place du Vigan','2019-03-01','Boulangerie-pâtisserie artisanale','morale',1000),
 ('SCI LES TROIS CHÊNES','000000102','00000010200013','SCI','actif','A-002','SCI_IR','6820A',1500,'Camille FOURNIER','2026-12-31','sci3chenes@demo.invalid','05 63 22 22 22','Albi','81000','3 place du Vigan','2019-03-01','Location de locaux commerciaux','morale',150),
 ('GARAGE MARSSAC AUTOMOBILES','000000103','00000010300015','SAS','actif','A-003','IS_REEL','4520A',50000,'Dominique BAYLE','2026-09-30','garage@marssac.invalid','05 63 33 33 33','Marssac-sur-Tarn','81150','ZA de la Rivière','2021-06-15','Réparation automobile','morale',5000),
 ('ATELIER BOIS & MATIÈRE','000000104','00000010400017','EURL','actif','A-004','IS_SIMPL','1623Z',5000,'Sacha REYNÈS','2026-12-31','atelier@boismatiere.invalid','05 63 44 44 44','Gaillac','81600','17 chemin des Vignes','2022-01-10','Menuiserie et agencement','morale',500),
 ('CABINET INFIRMIER LES TILLEULS','000000105','00000010500019','SARL','actif','A-005','BNC_DECL','8690D',2000,'Alix MERCADIER','2026-12-31','tilleuls@demo.invalid','05 63 55 55 55','Castres','81100','8 avenue des Tilleuls','2020-09-01','Soins infirmiers à domicile','morale',200),
 ('TRANSPORTS VALLÉE DU TARN','000000106','00000010600011','SAS','actif','A-006','IS_REEL','4941A',75000,'Noé CAZALS','2026-06-30','transports@valleetarn.invalid','05 63 66 66 66','Albi','81000','ZI de Jarlard','2018-04-01','Transport routier de marchandises','morale',7500),
 ('LE COMPTOIR DES SAVEURS','000000107','00000010700013','SARL','actif','A-007','IS_SIMPL','5610A',15000,'Charlie DELPECH','2026-12-31','comptoir@saveurs.invalid','05 63 77 77 77','Cordes-sur-Ciel','81170','2 grand rue Raimond VII','2023-02-01','Restauration traditionnelle','morale',1500),
 ('SCI DU MOULIN BLANC','000000108','00000010800015','SCI','actif','A-008','SCI_IR','6820A',1000,'Noé CAZALS','2026-12-31','moulinblanc@demo.invalid','05 63 88 88 88','Albi','81000','ZI de Jarlard','2018-04-01','Détention de l''entrepôt logistique','morale',100),
 ('COIFFURE ET CARACTÈRE','000000109','00000010900017','SASU','actif','A-009','IS_SIMPL','9602A',1000,'Ines TEISSIER','2026-12-31','coiffure@caractere.invalid','05 63 99 99 99','Albi','81000','21 rue Timbal','2024-05-02','Salon de coiffure','morale',100),
 ('MAÇONNERIE DU SÉGALA','000000110','00000011000019','SARL','actif','A-010','IS_REEL','4399C',30000,'Gabriel ROQUES','2026-09-30','maconnerie@segala.invalid','05 63 10 10 10','Carmaux','81400','5 route de Rodez','2017-11-01','Gros œuvre et maçonnerie générale','morale',3000),
 ('PÉPINIÈRES DU CAUSSE','000000111','00000011100011','SARL','inactif','A-011','IS_SIMPL','0130Z',8000,'Solène VIDAL','2025-12-31','pepinieres@causse.invalid','05 63 12 12 12','Cordes-sur-Ciel','81170','Lieu-dit Le Causse','2016-01-01','Production horticole','morale',800),
 ('STUDIO GRAPHIQUE OCRE','000000112',NULL,'SASU','prospect',NULL,NULL,'7311Z',NULL,'Théo LACOMBE',NULL,'studio@ocre.invalid','05 63 13 13 13','Albi','81000','9 rue Saunal',NULL,'Communication et design graphique','morale',NULL),
 ('SANS EMAIL SARL',NULL,NULL,NULL,'actif',NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,'Fiche volontairement incomplète','morale',NULL);

-- ------------------------------------------------------------- les personnes
-- `full_name` est une colonne GENEREE de `company_officers` : ne pas l'ecrire.
INSERT INTO company_officers (first_name, last_name, person_type, source, nationality) VALUES
 ('Camille','FOURNIER','physique','manual','Française'),
 ('Dominique','BAYLE','physique','manual','Française'),
 ('Léa','FOURNIER','physique','manual','Française'),
 ('Noé','CAZALS','physique','manual','Française'),
 ('Sacha','REYNÈS','physique','manual','Française'),
 ('Gabriel','ROQUES','physique','manual','Française'),
 ('Alix','MERCADIER','physique','manual','Française');

INSERT INTO officer_companies (officer_id, client_id, role, role_type, start_date, is_active, source)
SELECT o.id, c.id, r.role, r.rt, r.d::date, true, 'manual'
FROM (VALUES
 ('Camille FOURNIER','BOULANGERIE DU PONT VIEUX','Gérante','dirigeant','2019-03-01'),
 ('Camille FOURNIER','SCI LES TROIS CHÊNES','Gérante','dirigeant','2019-03-01'),
 ('Léa FOURNIER','SCI LES TROIS CHÊNES','Associée','associe','2023-07-01'),
 ('Dominique BAYLE','GARAGE MARSSAC AUTOMOBILES','Président','dirigeant','2021-06-15'),
 ('Noé CAZALS','TRANSPORTS VALLÉE DU TARN','Président','dirigeant','2018-04-01'),
 ('Noé CAZALS','SCI DU MOULIN BLANC','Gérant','dirigeant','2018-04-01'),
 ('Sacha REYNÈS','ATELIER BOIS & MATIÈRE','Gérant','dirigeant','2022-01-10'),
 ('Gabriel ROQUES','MAÇONNERIE DU SÉGALA','Gérant','dirigeant','2017-11-01'),
 ('Alix MERCADIER','CABINET INFIRMIER LES TILLEULS','Gérante','dirigeant','2020-09-01')
) AS r(nom, ent, role, rt, d)
JOIN company_officers o ON o.full_name = r.nom
JOIN clients c ON c.nom_entreprise = r.ent;

-- ------------------------------------------------- la repartition des parts
-- Deux cas volontairement differents, parce que ce sont les deux que l'ecran
-- doit savoir distinguer :
--
--   · LES TROIS CHENES : 150 parts sur 150, AVEC demembrement. L'usufruit ne
--     s'additionne pas a la pleine propriete — sinon le total depasserait le
--     capital. C'est le cas ordinaire d'une SCI familiale apres donation.
--   · LE MOULIN BLANC : 60 parts saisies sur 100 declarees. L'ecran doit dire
--     « incomplete », et surtout PAS sommer les lignes pour rendre un total
--     plausible et des pourcentages faux.
INSERT INTO client_associes (client_id, officer_id, nb_parts, demembrement, date_effet, acte_source, source, notes)
SELECT c.id, o.id, r.n, r.dem, r.d::date, r.acte, 'manual', r.notes
FROM (VALUES
 ('SCI LES TROIS CHÊNES','Camille FOURNIER',90,'pleine-propriete','2019-03-01','Statuts constitutifs du 01/03/2019',NULL),
 ('SCI LES TROIS CHÊNES','Camille FOURNIER',60,'usufruit','2023-07-04','Donation-partage du 04/07/2023','Usufruit réservé au donateur'),
 ('SCI LES TROIS CHÊNES','Léa FOURNIER',60,'nue-propriete','2023-07-04','Donation-partage du 04/07/2023',NULL),
 ('SCI DU MOULIN BLANC','Noé CAZALS',60,'pleine-propriete','2018-04-01','Statuts constitutifs du 01/04/2018','Cession de 40 parts en cours de saisie')
) AS r(ent, nom, n, dem, d, acte, notes)
JOIN clients c ON c.nom_entreprise = r.ent
JOIN company_officers o ON o.full_name = r.nom;

INSERT INTO client_software (client_id, software_id, start_date)
SELECT c.id, s.id, '2024-01-01'
FROM clients c JOIN software s ON s.name = CASE
  WHEN c.nom_entreprise IN ('BOULANGERIE DU PONT VIEUX','LE COMPTOIR DES SAVEURS','COIFFURE ET CARACTÈRE') THEN 'Pennylane'
  WHEN c.nom_entreprise IN ('TRANSPORTS VALLÉE DU TARN','MAÇONNERIE DU SÉGALA','GARAGE MARSSAC AUTOMOBILES') THEN 'MyUnisoft'
  ELSE 'Tiime' END
WHERE c.statut = 'actif';

-- ---------------------------------------------------------- les collaborateurs
-- Le compte ADMINISTRATEUR n'est pas seme ici : il se cree par la ligne de
-- commande d'enrolement, qui delivre le code de la premiere passkey. Le semer
-- donnerait un compte sans appareil enrole, donc sans moyen de se connecter.
INSERT INTO profiles (email, prenom, nom, role, is_active, job_role, avatar_color) VALUES
 ('lou.andrieu@cabinet-demo.invalid','Lou','ANDRIEU','user',true,'Collaboratrice comptable','#0891b2'),
 ('remi.pujol@cabinet-demo.invalid','Rémi','PUJOL','user',true,'Collaborateur comptable','#b45309'),
 ('sasha.bories@cabinet-demo.invalid','Sasha','BORIES','user',true,'Assistante juridique','#7c3aed');

INSERT INTO client_collaborators (client_id, user_id, role)
SELECT c.id, p.id, 'principal' FROM clients c
JOIN profiles p ON p.email = CASE
  WHEN c.nom_entreprise IN ('BOULANGERIE DU PONT VIEUX','SCI LES TROIS CHÊNES','LE COMPTOIR DES SAVEURS','COIFFURE ET CARACTÈRE') THEN 'lou.andrieu@cabinet-demo.invalid'
  WHEN c.nom_entreprise IN ('TRANSPORTS VALLÉE DU TARN','MAÇONNERIE DU SÉGALA','GARAGE MARSSAC AUTOMOBILES','SCI DU MOULIN BLANC') THEN 'remi.pujol@cabinet-demo.invalid'
  ELSE 'sasha.bories@cabinet-demo.invalid' END
WHERE c.statut = 'actif';

-- Un dossier est rarement tenu par une seule personne : celui qui le suit,
-- celui qui supervise, celui qui fait la paie. Sans une deuxieme et une
-- troisieme ligne ici, l'ecran des bilans montrerait une seule vignette par
-- carte et la demonstration passerait a cote de ce qu'elle doit montrer.
-- `ON CONFLICT` : la personne peut deja etre le collaborateur principal du
-- dossier, et l'unicite porte sur (client_id, user_id).
INSERT INTO client_collaborators (client_id, user_id, role)
SELECT c.id, p.id, 'superviseur' FROM clients c
JOIN profiles p ON p.email = 'sasha.bories@cabinet-demo.invalid'
WHERE c.statut = 'actif'
ON CONFLICT (client_id, user_id) DO NOTHING;

INSERT INTO client_collaborators (client_id, user_id, role)
SELECT c.id, p.id, 'paie' FROM clients c
JOIN profiles p ON p.email = 'remi.pujol@cabinet-demo.invalid'
WHERE c.statut = 'actif'
  AND c.nom_entreprise IN ('BOULANGERIE DU PONT VIEUX','LE COMPTOIR DES SAVEURS',
                           'MAÇONNERIE DU SÉGALA','GARAGE MARSSAC AUTOMOBILES')
ON CONFLICT (client_id, user_id) DO NOTHING;

-- ----------------------------------------------------------------- les taches
-- ⚠️ `created_by` EST OBLIGATOIRE ICI, MEME S'IL EST NULLABLE EN BASE. Le
-- declencheur `notify_task_assigned()` compose son message avec le nom de
-- l'auteur : auteur nul, message nul, et l'INSERT tombe sur la contrainte
-- NOT NULL de `notifications.message`. L'interface renseigne toujours l'auteur,
-- donc le defaut ne se voit qu'a l'import ou a la reprise de donnees — comme
-- ici. Constate le 2026-08-29.
INSERT INTO tasks (client_id, titre, description, assignee_id, statut, priorite, date_echeance, category_id, progress, created_by)
SELECT c.id, t.titre, t.descr, p.id, t.st, t.pr, (CURRENT_DATE + t.j)::date, cat.id, t.prog,
       (SELECT id FROM profiles ORDER BY created_at LIMIT 1)
FROM (VALUES
 ('BOULANGERIE DU PONT VIEUX','Bilan 2025 — révision des stocks','Rapprocher l''inventaire au 31/12 et justifier la variation.','lou.andrieu@cabinet-demo.invalid','in_progress','haute',7,'Bilan',60),
 ('TRANSPORTS VALLÉE DU TARN','TVA août — télétransmission','Contrôler les acquisitions intracommunautaires avant envoi.','remi.pujol@cabinet-demo.invalid','todo','urgente',2,'TVA',0),
 ('SCI LES TROIS CHÊNES','Assemblée générale ordinaire','Convocation, PV et feuille de présence.','sasha.bories@cabinet-demo.invalid','todo','moyenne',21,'Juridique',0),
 ('GARAGE MARSSAC AUTOMOBILES','Clôture au 30/09 — dossier de révision','Cycles achats et immobilisations.','remi.pujol@cabinet-demo.invalid','todo','haute',30,'Bilan',0),
 ('MAÇONNERIE DU SÉGALA','DSN de juillet — contrôle','Vérifier les régularisations d''heures supplémentaires.','remi.pujol@cabinet-demo.invalid','review','moyenne',-1,'Social',90),
 ('CABINET INFIRMIER LES TILLEULS','Déclaration 2035','Rapprochement recettes / relevés.','sasha.bories@cabinet-demo.invalid','done','basse',-10,'Fiscal',100),
 ('LE COMPTOIR DES SAVEURS','Relance pièces manquantes','Notes de frais du 2e trimestre.','lou.andrieu@cabinet-demo.invalid','in_progress','moyenne',5,'Bilan',30),
 ('ATELIER BOIS & MATIÈRE','Option IS — lettre au SIE','Rédiger et faire signer la notification.','sasha.bories@cabinet-demo.invalid','todo','haute',10,'Juridique',0),
 ('COIFFURE ET CARACTÈRE','Premier bilan — rendez-vous bilan','Préparer la plaquette et les ratios.','lou.andrieu@cabinet-demo.invalid','todo','moyenne',14,'Bilan',0),
 ('SCI DU MOULIN BLANC','Compléter la répartition des parts','40 parts non saisies : réclamer l''acte de cession.','sasha.bories@cabinet-demo.invalid','todo','haute',3,'Juridique',0)
) AS t(ent, titre, descr, mail, st, pr, j, cat, prog)
JOIN clients c ON c.nom_entreprise = t.ent
JOIN profiles p ON p.email = t.mail
JOIN task_categories cat ON cat.nom = t.cat;

-- ------------------------------------------------------------ les opportunites
INSERT INTO opportunity_cards (prospect_name, column_id, assignee_id, montant_estime, notes, source, position, date_relance, created_by)
SELECT o.prospect, col.id, p.id, o.montant, o.notes, o.src, o.pos, (CURRENT_DATE + o.j)::date,
       (SELECT id FROM profiles ORDER BY created_at LIMIT 1)
FROM (VALUES
 ('STUDIO GRAPHIQUE OCRE','À contacter','sasha.bories@cabinet-demo.invalid',2400,'Création en cours, recommandé par la boulangerie.','Recommandation',1,3),
 ('DOMAINE DE PECH-REDON','Rendez-vous','lou.andrieu@cabinet-demo.invalid',5200,'Viticulteur, 2 salariés. Rendez-vous fixé au cabinet.','Site web',1,7),
 ('ÉLECTRICITÉ GÉNÉRALE SAUVAGE','Proposition','remi.pujol@cabinet-demo.invalid',3800,'Lettre de mission envoyée, en attente de retour.','Recommandation',1,10),
 ('AMBULANCES DU SÉGALA','Gagné','remi.pujol@cabinet-demo.invalid',6500,'Signé. Reprise du dossier au 01/10.','Prospection',1,-2)
) AS o(prospect, colonne, mail, montant, notes, src, pos, j)
JOIN opportunity_columns col ON col.name = o.colonne
JOIN profiles p ON p.email = o.mail;

-- --------------------------------------------------- les comptes-rendus de RDV
INSERT INTO client_meeting_notes (client_id, objet, contenu, date_rdv, created_by, type_rdv)
SELECT c.id, n.objet, n.contenu, (CURRENT_DATE + n.j)::date, p.id, 'bilan'
FROM (VALUES
 ('BOULANGERIE DU PONT VIEUX','Point de gestion semestriel','Marge en hausse de 3 points après la révision des tarifs. Projet de second point de vente évoqué : chiffrage à prévoir pour la rentrée.',-45,'lou.andrieu@cabinet-demo.invalid'),
 ('TRANSPORTS VALLÉE DU TARN','Renouvellement du parc','Trois véhicules à remplacer. Comparaison crédit-bail / emprunt demandée avant le 30/09.',-20,'remi.pujol@cabinet-demo.invalid'),
 ('SCI LES TROIS CHÊNES','Suites de la donation-partage','Démembrement effectif depuis juillet 2023. Répartition mise à jour dans le CRM à partir de l''acte notarié.',-15,'sasha.bories@cabinet-demo.invalid')
) AS n(ent, objet, contenu, j, mail)
JOIN clients c ON c.nom_entreprise = n.ent
JOIN profiles p ON p.email = n.mail;
