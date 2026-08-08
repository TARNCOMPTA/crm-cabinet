-- Les liens des courriels pointaient vers un domaine qui n'est pas le notre.
-- ===========================================================================
-- `process_email_digest()` fabrique le HTML des digests et y insere des liens
-- ABSOLUS — un courriel n'a pas d'origine, un lien relatif n'y veut rien dire.
-- La base de ces liens etait ecrite en dur : « https://crmcabinet.com ».
--
-- Ce domaine est celui de l'ancienne plateforme. Chaque digest envoye aux
-- collaborateurs partait donc avec des liens morts vers /dashboard et
-- /settings, sans que rien ne le signale : le courriel s'envoie, il est lu, et
-- c'est le clic qui echoue — chez le destinataire, hors de toute trace.
--
-- L'adresse ne se devine pas depuis la base : PostgreSQL ne connait pas l'URL
-- publique de l'instance. Elle devient donc un PARAMETRE, que le planificateur
-- passe depuis `config.publicUrl`, lui-meme lu dans `PUBLIC_URL`. Une seule
-- source de verite, celle qui sert deja de RP ID aux passkeys : si elle est
-- fausse, la connexion ne marche pas non plus, donc l'erreur se voit tout de
-- suite au lieu de se cacher dans un courriel.
--
-- La signature change, donc l'ancienne version sans argument est retiree :
-- `CREATE OR REPLACE` ne remplace pas une fonction d'arite differente, il en
-- ajoute une surcharge — et le planificateur aurait pu continuer d'appeler
-- l'ancienne sans que personne ne s'en apercoive.

DROP FUNCTION IF EXISTS public.process_email_digest();

CREATE OR REPLACE FUNCTION public.process_email_digest(p_base_url text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
digest_record RECORD;
notif_record RECORD;
notif_count integer;
digest_html text;
notif_rows text;
next_send timestamptz;
type_label text;
type_color text;
base_url text := p_base_url;
BEGIN
FOR digest_record IN
SELECT ed.id, ed.user_id, ed.digest_type, ed.last_sent_at,
p.email as user_email, COALESCE(p.prenom, '') as prenom
FROM email_digests ed
JOIN profiles p ON p.id = ed.user_id
WHERE ed.is_active = true
AND ed.next_send_at <= now()
AND p.is_active = true
LOOP
notif_rows := '';
notif_count := 0;

FOR notif_record IN
SELECT n.type, n.title, n.message, n.link, n.created_at
FROM notifications n
WHERE n.user_id = digest_record.user_id
AND n.created_at > COALESCE(digest_record.last_sent_at, now() - interval '7 days')
ORDER BY n.created_at DESC
LIMIT 50
LOOP
notif_count := notif_count + 1;

CASE notif_record.type
WHEN 'task_assigned'       THEN type_color := '#0d9488'; type_label := 'Tache';
WHEN 'task_commented'      THEN type_color := '#0891b2'; type_label := 'Commentaire';
WHEN 'task_status_changed' THEN type_color := '#0d9488'; type_label := 'Statut';
WHEN 'bilan_moved'         THEN type_color := '#059669'; type_label := 'Bilan';
WHEN 'ticket_message'      THEN type_color := '#d97706'; type_label := 'Support';
WHEN 'user_deactivated'    THEN type_color := '#dc2626'; type_label := 'Compte';
ELSE                            type_color := '#6b7280'; type_label := 'Info';
END CASE;

notif_rows := notif_rows
|| '<tr><td style="padding:14px 16px;border-bottom:1px solid #f3f4f6;">'
|| '<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>'
|| '<td width="8" valign="top" style="padding-top:4px;"><div style="width:8px;height:8px;border-radius:50%;background-color:' || type_color || ';"></div></td>'
|| '<td style="padding-left:12px;">'
|| '<div style="font-size:11px;font-weight:600;color:' || type_color || ';text-transform:uppercase;letter-spacing:0.5px;margin-bottom:2px;">' || type_label || '</div>'
|| '<div style="font-size:14px;font-weight:600;color:#111827;line-height:1.4;">' || notif_record.title || '</div>'
|| '<div style="font-size:13px;color:#6b7280;margin-top:2px;line-height:1.4;">'
|| left(notif_record.message, 200)
|| CASE WHEN length(notif_record.message) > 200 THEN '...' ELSE '' END
|| '</div>'
|| '</td></tr></table></td></tr>';
END LOOP;

IF notif_count = 0 THEN
CONTINUE;
END IF;

digest_html := '<!DOCTYPE html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>'
|| '<body style="margin:0;padding:0;background-color:#f3f4f6;font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,Helvetica Neue,Arial,sans-serif;">'
|| '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f3f4f6;padding:40px 16px;">'
|| '<tr><td align="center">'

|| '<table role="presentation" width="580" cellpadding="0" cellspacing="0" style="background-color:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">'

-- Header: brand
|| '<tr><td style="background-color:#111827;padding:24px 32px;">'
|| '<table role="presentation" width="100%" cellpadding="0" cellspacing="0">'
|| '<tr>'
|| '<td style="font-size:20px;font-weight:700;color:#ffffff;letter-spacing:0.5px;">CRM CABINET</td>'
|| '<td align="right" style="font-size:12px;color:#9ca3af;font-weight:500;text-transform:uppercase;letter-spacing:0.8px;">Resume</td>'
|| '</tr></table>'
|| '</td></tr>'

-- Accent bar
|| '<tr><td style="height:4px;background-color:#0d9488;font-size:0;line-height:0;">&nbsp;</td></tr>'

-- Greeting
|| '<tr><td style="padding:28px 32px 8px 32px;"><span style="font-size:20px;font-weight:700;color:#111827;">Bonjour ' || digest_record.prenom || ',</span></td></tr>'
|| '<tr><td style="padding:4px 32px 20px 32px;"><span style="font-size:15px;color:#6b7280;">Vous avez ' || notif_count || ' notification'
|| CASE WHEN notif_count > 1 THEN 's' ELSE '' END
|| ' depuis votre dernier resume.</span></td></tr>'

-- Notification list
|| '<tr><td style="padding:0 16px 28px 16px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e5e7eb;border-radius:10px;overflow:hidden;">'
|| notif_rows
|| '</table></td></tr>'

-- CTA button
|| '<tr><td align="center" style="padding:0 32px 28px 32px;"><a href="' || base_url || '/dashboard" style="display:inline-block;padding:14px 32px;background-color:#0d9488;color:#ffffff;text-decoration:none;border-radius:8px;font-weight:600;font-size:14px;letter-spacing:0.2px;">Acceder a mon espace</a></td></tr>'

-- Footer
|| '<tr><td style="padding:20px 32px;background-color:#f9fafb;border-top:1px solid #e5e7eb;">'
|| '<table role="presentation" width="100%" cellpadding="0" cellspacing="0">'
|| '<tr><td style="font-size:12px;color:#9ca3af;line-height:1.5;">'
|| '<span style="font-weight:600;color:#6b7280;">CRM CABINET</span><br>'
|| 'Email automatique &mdash; <a href="' || base_url || '/settings" style="color:#0d9488;text-decoration:underline;">Gerer mes preferences</a>'
|| '</td></tr></table>'
|| '</td></tr>'

|| '</table>'
|| '</td></tr></table></body></html>';

INSERT INTO email_queue (user_id, to_email, subject, html_body, status)
VALUES (
digest_record.user_id,
digest_record.user_email,
'Resume de vos notifications (' || notif_count || ')',
digest_html,
'pending'
);

IF digest_record.digest_type = 'daily' THEN
next_send := (now() AT TIME ZONE 'Europe/Paris' + interval '1 day')::date + time '07:00:00';
next_send := next_send AT TIME ZONE 'Europe/Paris';
ELSE
next_send := (now() AT TIME ZONE 'Europe/Paris' + interval '7 days')::date + time '07:00:00';
next_send := next_send AT TIME ZONE 'Europe/Paris';
END IF;

UPDATE email_digests
SET last_sent_at = now(), next_send_at = next_send, updated_at = now()
WHERE id = digest_record.id;
END LOOP;
END;
$function$
;
