-- Le corps des courriels de notification cesse d'etre injectable.
-- ===========================================================================
-- `build_notification_email_html` concatenait le TITRE, le MESSAGE et le LIEN
-- d'une notification directement dans le HTML du courriel, sans echappement, le
-- lien allant tel quel dans un attribut `href`.
--
-- DEUX CHEMINS Y MENAIENT, et le plus discret ne demandait aucun outil :
--
--   · `notify_task_assigned` compose le message avec le TITRE DE LA TACHE et le
--     nom de son auteur. Nommer une tache « <img src=x onerror=...> » suffisait
--     a placer du balisage dans le courriel recu par un collegue ;
--   · `create_notification` etait par ailleurs appelable par n'importe quel
--     collaborateur via le proxy PostgREST — titre, message et lien libres,
--     courriel expedie depuis le SMTP du cabinet. Ce second chemin est ferme
--     dans `server/src/rest-droits.ts` ; celui-ci ferme le premier, et rend le
--     generateur sur quel que soit son appelant.
--
-- CE QUE CET INCREMENT NE FAIT PAS : reparer les courriels deja partis. Ils sont
-- partis. Il empeche les suivants.
--
-- ---------------------------------------------------------------------------
-- POURQUOI LE LIEN EST AUSSI RESTREINT, ET PAS SEULEMENT ECHAPPE
--
-- Echapper protege l'attribut, pas la navigation : `javascript:...` echappe
-- reste un lien vivant. Seuls http(s) et les chemins relatifs sont donc
-- acceptes. Les relatifs sont indispensables — les notifications reelles posent
-- « /tasks?id=... » — mais `//hote` est refuse : relatif au PROTOCOLE, il sort
-- du domaine et emmenerait le lecteur ailleurs.
--
-- Un lien d'un autre schema ne fait pas echouer l'envoi : le bouton disparait,
-- le courriel part sans lui. Mieux vaut un courriel amoindri qu'un courriel
-- piege, et mieux vaut un courriel qu'une notification perdue.
--
-- ---------------------------------------------------------------------------
-- LES TROIS REGLES DU DOSSIER
--
--   1. Aucun BEGIN/COMMIT : docker/entree.sh possede la transaction.
--   2. Aucun ordre non transactionnel.
--   3. Idempotence : `CREATE OR REPLACE` la porte a lui seul, le fichier peut
--      etre rejoue autant de fois qu'on veut.

CREATE OR REPLACE FUNCTION public.build_notification_email_html(p_type text, p_title text, p_message text, p_link text DEFAULT NULL::text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
-- ⚠️ TITRE, MESSAGE ET LIEN SONT DU TEXTE, PAS DU HTML.
--
-- Les trois etaient concatenes tels quels dans le corps du courriel, et le lien
-- directement dans un attribut `href`. Deux chemins y menaient :
--
--   · le plus discret : `notify_task_assigned` compose le message avec le TITRE
--     DE LA TACHE et le nom de son auteur. Nommer une tache « <img src=x
--     onerror=...> » suffisait donc a injecter du balisage dans le courriel de
--     son collegue, sans aucun outil ;
--   · le plus grave : `create_notification` etait appelable par tout
--     collaborateur via le proxy PostgREST (corrige dans rest-droits.ts), avec
--     titre, message et lien libres.
--
-- Les trois valeurs sont donc echappees. L'ordre compte : `&` EN PREMIER, sinon
-- les entites produites par les remplacements suivants seraient re-echappees.
--
-- LE LIEN EST EN OUTRE RESTREINT AUX SCHEMAS SURS. Echapper ne suffit pas pour
-- un `href` : `javascript:` ou `data:` restent des liens vivants une fois
-- echappes. Seuls sont acceptes http(s) et les chemins relatifs — ces derniers
-- parce que les notifications reelles en posent (« /tasks?id=... »). `//hote`
-- est refuse : il est relatif au protocole, donc il sort du domaine.
DECLARE
type_label text;
type_color text;
btn_html text := '';
titre_sur text;
message_sur text;
lien_sur text;
BEGIN
titre_sur := replace(replace(replace(replace(replace(coalesce(p_title, ''),'&','&amp;'),'<','&lt;'),'>','&gt;'),'"','&quot;'),'''','&#39;');
message_sur := replace(replace(replace(replace(replace(coalesce(p_message, ''),'&','&amp;'),'<','&lt;'),'>','&gt;'),'"','&quot;'),'''','&#39;');

CASE p_type
WHEN 'task_assigned' THEN type_label := 'Tache attribuee'; type_color := '#0d9488';
WHEN 'task_commented' THEN type_label := 'Nouveau commentaire'; type_color := '#0891b2';
WHEN 'task_status_changed' THEN type_label := 'Statut modifie'; type_color := '#0d9488';
WHEN 'bilan_moved' THEN type_label := 'Bilan deplace'; type_color := '#059669';
WHEN 'ticket_message' THEN type_label := 'Message support'; type_color := '#d97706';
WHEN 'user_deactivated' THEN type_label := 'Compte desactive'; type_color := '#dc2626';
WHEN 'legal_alert_critical' THEN type_label := 'Alerte juridique critique'; type_color := '#dc2626';
ELSE type_label := 'Notification'; type_color := '#0d9488';
END CASE;

IF p_link IS NOT NULL AND (p_link ~ '^https?://' OR (p_link ~ '^/' AND p_link !~ '^//')) THEN
lien_sur := replace(replace(replace(replace(replace(coalesce(p_link, ''),'&','&amp;'),'<','&lt;'),'>','&gt;'),'"','&quot;'),'''','&#39;');
btn_html := '<tr><td style="padding:24px 0 0 0;"><a href="' || lien_sur || '" style="display:inline-block;padding:12px 28px;background-color:' || type_color || ';color:#ffffff;text-decoration:none;border-radius:8px;font-weight:600;font-size:14px;">Voir le detail</a></td></tr>';
END IF;

RETURN '<!DOCTYPE html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>'
|| '<body style="margin:0;padding:0;background-color:#f3f4f6;font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,Helvetica Neue,Arial,sans-serif;">'
|| '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f3f4f6;padding:32px 16px;">'
|| '<tr><td align="center">'
|| '<table role="presentation" width="560" cellpadding="0" cellspacing="0" style="background-color:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.1);">'
|| '<tr><td style="background-color:' || type_color || ';padding:20px 32px;"><span style="color:#ffffff;font-size:13px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;">' || type_label || '</span></td></tr>'
|| '<tr><td style="padding:32px;">'
|| '<table role="presentation" width="100%" cellpadding="0" cellspacing="0">'
|| '<tr><td style="font-size:20px;font-weight:700;color:#111827;padding-bottom:12px;">' || titre_sur || '</td></tr>'
|| '<tr><td style="font-size:15px;color:#4b5563;line-height:1.6;">' || message_sur || '</td></tr>'
|| btn_html
|| '</table></td></tr>'
|| '<tr><td style="padding:20px 32px;background-color:#f9fafb;border-top:1px solid #e5e7eb;">'
|| '<span style="font-size:12px;color:#9ca3af;">Cet email a ete envoye automatiquement. Vous pouvez gerer vos preferences de notification dans les parametres.</span>'
|| '</td></tr></table>'
|| '</td></tr></table></body></html>';
END;
$function$
;
