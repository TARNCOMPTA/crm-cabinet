# Transformation mono-cabinet — 2026-07-31

De `schema/actuel.sql` vers `schema/cible.sql`. Liste validée le 2026-07-31.

## Chiffres

| | Actuel | Cible |
|---|---|---|
| Tables | 96 | **74** |
| Policies RLS | 420 | **0** |
| Fonctions | 53 | **24** |
| Colonnes `cabinet_id` | 40 | **0** |
| Contraintes retirées | — | 55 |
| Index retirés | — | 43 |
| Triggers retirés | — | 6 |

## Tables retirées

### multi-cabinet

- `cabinet_lifecycle_warnings`

### brique IA (déjà retirée du code)

- `chat_conversations`
- `chat_messages`
- `chat_rate_limits`
- `gov_chat_conversations`
- `gov_chat_messages`
- `gov_chat_rate_limits`
- `llm_generations`
- `llm_prompt_templates`

### modules gelés, à réécrire

- `fiscal_deadline_cards`
- `fiscal_deadline_columns`
- `fiscal_tax_types`
- `client_fiscal_tax_types`
- `document_templates`
- `generated_documents`
- `support_tickets`
- `ticket_messages`
- `ticket_attachments`
- `changelog_entries`
- `changelog_read_status`

### OAuth du connecteur MCP, remplacé par une clé API locale

- `mcp_oauth_codes`
- `mcp_oauth_tokens`

### table morte, supprimée en migration mais toujours présente

- `inpi_credentials` — *absente de la base, sans effet*

## Fonctions retirées

Helpers multi-cabinet et synchronisation des métadonnées d'authentification.

- `admin_reassign_user_cabinet`
- `build_cabinet_warning_email_html`
- `debug_jwt` — *absente, sans effet*
- `get_cabinets_last_sign_in`
- `get_current_user_metadata` — *absente, sans effet*
- `get_user_cabinet_id`
- `get_user_role`
- `get_user_role_debug` — *absente, sans effet*
- `is_super_admin`
- `is_super_admin_debug` — *absente, sans effet*
- `process_cabinet_lifecycle`
- `seed_default_collaborator_roles`
- `seed_web_directory_for_cabinet`
- `sync_profile_to_auth_metadata`
- `sync_role_to_auth_metadata` — *absente, sans effet*
- `sync_user_metadata_manually`
- `sync_users_with_cabinet_status`
- `update_cabinet_collaborator_roles_updated_at`
- `complete_signup`
- `ensure_profile_exists`
- `handle_new_user`
- `sync_all_users_metadata`
- `get_unanswered_ticket_count`
- `notify_ticket_message`
- `update_support_ticket_updated_at`
- `ensure_profile_exists_for`
- `initialize_fiscal_defaults`
- `get_dashboard_stats`
- `notify_legal_alert`
- `seed_default_regimes`
- `set_email_queue_cabinet_id`
- `trigger_inpi_auto_sync`
- `trigger_legal_acts_sync`
- `trigger_legal_full_sync`

## Listées mais absentes de la base

- `inpi_credentials`
