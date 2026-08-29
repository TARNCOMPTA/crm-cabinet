// Genere par scripts/generer-types.mjs, DEPUIS LA BASE EN PLACE.
// NE PAS MODIFIER A LA MAIN au-dessus de la fin du bloc Database :
// ce fichier etait maintenu manuellement et avait derive du schema reel,
// ce qui produisait des erreurs SelectQueryError sur des requetes valides.
// Les alias de domaine sous le bloc Database, eux, sont ecrits a la main.

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type UserRole = 'admin' | 'user'

export interface Database {
  public: {
    Tables: {
      ago_avancement_statuses: {
        Row: {
          id: string
          label: string
          color: string
          position: number
          is_default: boolean
          created_at: string | null
        }
        Insert: {
          id?: string
          label: string
          color?: string
          position?: number
          is_default?: boolean
          created_at?: string | null
        }
        Update: {
          id?: string
          label?: string
          color?: string
          position?: number
          is_default?: boolean
          created_at?: string | null
        }
        Relationships: []
      }
      app_config: {
        Row: {
          key: string
          value: string
          created_at: string | null
        }
        Insert: {
          key: string
          value: string
          created_at?: string | null
        }
        Update: {
          key?: string
          value?: string
          created_at?: string | null
        }
        Relationships: []
      }
      audit_logs: {
        Row: {
          id: string
          user_id: string
          action: string
          entity_type: string
          entity_id: string | null
          details: Json | null
          created_at: string | null
        }
        Insert: {
          id?: string
          user_id: string
          action: string
          entity_type: string
          entity_id?: string | null
          details?: Json | null
          created_at?: string | null
        }
        Update: {
          id?: string
          user_id?: string
          action?: string
          entity_type?: string
          entity_id?: string | null
          details?: Json | null
          created_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_logs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      balance_sheets: {
        Row: {
          id: string
          client_id: string
          exercice: string
          statut: string | null
          assignee_id: string | null
          date_echeance: string | null
          notes: string | null
          created_at: string | null
          updated_at: string | null
        }
        Insert: {
          id?: string
          client_id: string
          exercice: string
          statut?: string | null
          assignee_id?: string | null
          date_echeance?: string | null
          notes?: string | null
          created_at?: string | null
          updated_at?: string | null
        }
        Update: {
          id?: string
          client_id?: string
          exercice?: string
          statut?: string | null
          assignee_id?: string | null
          date_echeance?: string | null
          notes?: string | null
          created_at?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "balance_sheets_assignee_id_fkey"
            columns: ["assignee_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "balance_sheets_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      bilan_cabinet_options: {
        Row: {
          ligne_unique: boolean
          das2_inpi_enabled: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          ligne_unique?: boolean
          das2_inpi_enabled?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          ligne_unique?: boolean
          das2_inpi_enabled?: boolean
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      bilan_cards: {
        Row: {
          id: string
          client_id: string
          regime_fiscal: string
          year: number
          column_id: string
          assignee_id: string | null
          notes: string | null
          position: number
          created_at: string | null
          updated_at: string | null
          mois_traites: number[]
          das2_checked: boolean
          das2_company_name: string | null
          das2_company_siren: string | null
        }
        Insert: {
          id?: string
          client_id: string
          regime_fiscal: string
          year: number
          column_id: string
          assignee_id?: string | null
          notes?: string | null
          position?: number
          created_at?: string | null
          updated_at?: string | null
          mois_traites?: number[]
          das2_checked?: boolean
          das2_company_name?: string | null
          das2_company_siren?: string | null
        }
        Update: {
          id?: string
          client_id?: string
          regime_fiscal?: string
          year?: number
          column_id?: string
          assignee_id?: string | null
          notes?: string | null
          position?: number
          created_at?: string | null
          updated_at?: string | null
          mois_traites?: number[]
          das2_checked?: boolean
          das2_company_name?: string | null
          das2_company_siren?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "bilan_cards_assignee_id_fkey"
            columns: ["assignee_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bilan_cards_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bilan_cards_column_id_fkey"
            columns: ["column_id"]
            isOneToOne: false
            referencedRelation: "bilan_columns"
            referencedColumns: ["id"]
          },
        ]
      }
      bilan_checklist_attachments: {
        Row: {
          id: string
          checklist_item_id: string
          file_name: string
          file_size: number
          mime_type: string
          storage_path: string
          uploaded_by: string | null
          created_at: string
        }
        Insert: {
          id?: string
          checklist_item_id: string
          file_name: string
          file_size?: number
          mime_type: string
          storage_path: string
          uploaded_by?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          checklist_item_id?: string
          file_name?: string
          file_size?: number
          mime_type?: string
          storage_path?: string
          uploaded_by?: string | null
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "bilan_checklist_attachments_checklist_item_id_fkey"
            columns: ["checklist_item_id"]
            isOneToOne: false
            referencedRelation: "bilan_checklist_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bilan_checklist_attachments_uploaded_by_fkey"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      bilan_checklist_items: {
        Row: {
          id: string
          card_id: string
          template_id: string
          is_checked: boolean
          checked_by: string | null
          checked_at: string | null
          created_at: string | null
        }
        Insert: {
          id?: string
          card_id: string
          template_id: string
          is_checked?: boolean
          checked_by?: string | null
          checked_at?: string | null
          created_at?: string | null
        }
        Update: {
          id?: string
          card_id?: string
          template_id?: string
          is_checked?: boolean
          checked_by?: string | null
          checked_at?: string | null
          created_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "bilan_checklist_items_card_id_fkey"
            columns: ["card_id"]
            isOneToOne: false
            referencedRelation: "bilan_cards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bilan_checklist_items_checked_by_fkey"
            columns: ["checked_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bilan_checklist_items_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "bilan_checklist_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      bilan_checklist_templates: {
        Row: {
          id: string
          regime_fiscal: string
          name: string
          position: number
          created_at: string | null
          updated_at: string | null
        }
        Insert: {
          id?: string
          regime_fiscal: string
          name: string
          position?: number
          created_at?: string | null
          updated_at?: string | null
        }
        Update: {
          id?: string
          regime_fiscal?: string
          name?: string
          position?: number
          created_at?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      bilan_columns: {
        Row: {
          id: string
          regime_fiscal: string
          name: string
          color: string
          position: number
          created_at: string | null
          updated_at: string | null
        }
        Insert: {
          id?: string
          regime_fiscal: string
          name: string
          color?: string
          position?: number
          created_at?: string | null
          updated_at?: string | null
        }
        Update: {
          id?: string
          regime_fiscal?: string
          name?: string
          color?: string
          position?: number
          created_at?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      bilan_das2_entries: {
        Row: {
          id: string
          card_id: string
          company_name: string
          company_siren: string
          created_at: string
          address_line: string | null
          address_postal_code: string | null
          address_city: string | null
          code_ape: string | null
          libelle_ape: string | null
          company_siret: string | null
        }
        Insert: {
          id?: string
          card_id: string
          company_name: string
          company_siren: string
          created_at?: string
          address_line?: string | null
          address_postal_code?: string | null
          address_city?: string | null
          code_ape?: string | null
          libelle_ape?: string | null
          company_siret?: string | null
        }
        Update: {
          id?: string
          card_id?: string
          company_name?: string
          company_siren?: string
          created_at?: string
          address_line?: string | null
          address_postal_code?: string | null
          address_city?: string | null
          code_ape?: string | null
          libelle_ape?: string | null
          company_siret?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "bilan_das2_entries_card_id_fkey"
            columns: ["card_id"]
            isOneToOne: false
            referencedRelation: "bilan_cards"
            referencedColumns: ["id"]
          },
        ]
      }
      bodacc_depot_comptes: {
        Row: {
          id: string
          client_id: string
          siren: string
          date_cloture: string | null
          date_parution: string | null
          type_depot: string | null
          tribunal: string | null
          numero_annonce: number | null
          bodacc_id: string
          commercant: string | null
          raw_data: Json | null
          created_at: string | null
        }
        Insert: {
          id?: string
          client_id: string
          siren: string
          date_cloture?: string | null
          date_parution?: string | null
          type_depot?: string | null
          tribunal?: string | null
          numero_annonce?: number | null
          bodacc_id: string
          commercant?: string | null
          raw_data?: Json | null
          created_at?: string | null
        }
        Update: {
          id?: string
          client_id?: string
          siren?: string
          date_cloture?: string | null
          date_parution?: string | null
          type_depot?: string | null
          tribunal?: string | null
          numero_annonce?: number | null
          bodacc_id?: string
          commercant?: string | null
          raw_data?: Json | null
          created_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "bodacc_depot_comptes_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      cabinet_collaborator_roles: {
        Row: {
          id: string
          key: string
          label: string
          color: string
          description: string | null
          position: number
          is_default: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          key: string
          label: string
          color?: string
          description?: string | null
          position?: number
          is_default?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          key?: string
          label?: string
          color?: string
          description?: string | null
          position?: number
          is_default?: boolean
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      cabinet_smtp_config: {
        Row: {
          id: string
          smtp_host: string
          smtp_port: number
          smtp_user: string
          smtp_password: string
          smtp_from_email: string
          smtp_from_name: string | null
          use_tls: boolean
          is_enabled: boolean
          last_test_at: string | null
          last_test_status: string | null
          created_at: string | null
          updated_at: string | null
        }
        Insert: {
          id?: string
          smtp_host?: string
          smtp_port?: number
          smtp_user?: string
          smtp_password?: string
          smtp_from_email?: string
          smtp_from_name?: string | null
          use_tls?: boolean
          is_enabled?: boolean
          last_test_at?: string | null
          last_test_status?: string | null
          created_at?: string | null
          updated_at?: string | null
        }
        Update: {
          id?: string
          smtp_host?: string
          smtp_port?: number
          smtp_user?: string
          smtp_password?: string
          smtp_from_email?: string
          smtp_from_name?: string | null
          use_tls?: boolean
          is_enabled?: boolean
          last_test_at?: string | null
          last_test_status?: string | null
          created_at?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      cabinets: {
        Row: {
          id: string
          nom: string
          adresse: string | null
          siret: string | null
          email: string | null
          telephone: string | null
          logo_url: string | null
          created_at: string | null
          updated_at: string | null
          is_active: boolean
          chat_enabled: boolean
        }
        Insert: {
          id?: string
          nom: string
          adresse?: string | null
          siret?: string | null
          email?: string | null
          telephone?: string | null
          logo_url?: string | null
          created_at?: string | null
          updated_at?: string | null
          is_active?: boolean
          chat_enabled?: boolean
        }
        Update: {
          id?: string
          nom?: string
          adresse?: string | null
          siret?: string | null
          email?: string | null
          telephone?: string | null
          logo_url?: string | null
          created_at?: string | null
          updated_at?: string | null
          is_active?: boolean
          chat_enabled?: boolean
        }
        Relationships: []
      }
      checklist_item_attachments: {
        Row: {
          id: string
          item_id: string
          file_name: string
          file_size: number
          mime_type: string
          storage_path: string
          uploaded_by: string | null
          created_at: string
        }
        Insert: {
          id?: string
          item_id: string
          file_name: string
          file_size?: number
          mime_type: string
          storage_path: string
          uploaded_by?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          item_id?: string
          file_name?: string
          file_size?: number
          mime_type?: string
          storage_path?: string
          uploaded_by?: string | null
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "checklist_item_attachments_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "checklist_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "checklist_item_attachments_uploaded_by_fkey"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      checklist_item_comments: {
        Row: {
          id: string
          item_id: string
          user_id: string
          content: string
          created_at: string
        }
        Insert: {
          id?: string
          item_id: string
          user_id: string
          content: string
          created_at?: string
        }
        Update: {
          id?: string
          item_id?: string
          user_id?: string
          content?: string
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "checklist_item_comments_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "checklist_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "checklist_item_comments_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      checklist_items: {
        Row: {
          id: string
          checklist_id: string
          label: string
          is_checked: boolean
          position: number
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          checklist_id: string
          label: string
          is_checked?: boolean
          position?: number
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          checklist_id?: string
          label?: string
          is_checked?: boolean
          position?: number
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "checklist_items_checklist_id_fkey"
            columns: ["checklist_id"]
            isOneToOne: false
            referencedRelation: "checklists"
            referencedColumns: ["id"]
          },
        ]
      }
      checklist_template_items: {
        Row: {
          id: string
          template_id: string
          label: string
          position: number
          created_at: string
        }
        Insert: {
          id?: string
          template_id: string
          label: string
          position?: number
          created_at?: string
        }
        Update: {
          id?: string
          template_id?: string
          label?: string
          position?: number
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "checklist_template_items_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "checklist_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      checklist_templates: {
        Row: {
          id: string
          user_id: string
          title: string
          is_shared: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          title: string
          is_shared?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          title?: string
          is_shared?: boolean
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      checklists: {
        Row: {
          id: string
          user_id: string
          title: string
          is_shared: boolean
          created_at: string
          updated_at: string
          client_id: string | null
          opportunity_card_id: string | null
          task_id: string | null
        }
        Insert: {
          id?: string
          user_id: string
          title: string
          is_shared?: boolean
          created_at?: string
          updated_at?: string
          client_id?: string | null
          opportunity_card_id?: string | null
          task_id?: string | null
        }
        Update: {
          id?: string
          user_id?: string
          title?: string
          is_shared?: boolean
          created_at?: string
          updated_at?: string
          client_id?: string | null
          opportunity_card_id?: string | null
          task_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "checklists_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "checklists_opportunity_card_id_fkey"
            columns: ["opportunity_card_id"]
            isOneToOne: false
            referencedRelation: "opportunity_cards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "checklists_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      client_ago_avancements: {
        Row: {
          id: string
          client_id: string
          exercice_year: number
          status_id: string | null
          updated_by: string | null
          updated_at: string | null
        }
        Insert: {
          id?: string
          client_id: string
          exercice_year: number
          status_id?: string | null
          updated_by?: string | null
          updated_at?: string | null
        }
        Update: {
          id?: string
          client_id?: string
          exercice_year?: number
          status_id?: string | null
          updated_by?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "client_ago_avancements_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_ago_avancements_status_id_fkey"
            columns: ["status_id"]
            isOneToOne: false
            referencedRelation: "ago_avancement_statuses"
            referencedColumns: ["id"]
          },
        ]
      }
      client_ard_calculations: {
        Row: {
          id: string
          client_id: string
          annee: number
          ca: number
          charges_totales: number
          frais_compta: number
          adhesion_cga: number
          cfe: number
          autres_charges: number
          amort_immeuble: number
          amort_mobilier: number
          amort_derogatoires: number
          amort_reintegres: number | null
          created_at: string | null
          updated_at: string | null
          deficit_anterieur: number | null
        }
        Insert: {
          id?: string
          client_id: string
          annee: number
          ca?: number
          charges_totales?: number
          frais_compta?: number
          adhesion_cga?: number
          cfe?: number
          autres_charges?: number
          amort_immeuble?: number
          amort_mobilier?: number
          amort_derogatoires?: number
          amort_reintegres?: number | null
          created_at?: string | null
          updated_at?: string | null
          deficit_anterieur?: number | null
        }
        Update: {
          id?: string
          client_id?: string
          annee?: number
          ca?: number
          charges_totales?: number
          frais_compta?: number
          adhesion_cga?: number
          cfe?: number
          autres_charges?: number
          amort_immeuble?: number
          amort_mobilier?: number
          amort_derogatoires?: number
          amort_reintegres?: number | null
          created_at?: string | null
          updated_at?: string | null
          deficit_anterieur?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "client_ard_calculations_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      client_associes: {
        Row: {
          id: string
          client_id: string
          officer_id: string
          nb_parts: number
          demembrement: string
          date_effet: string | null
          legal_act_id: string | null
          acte_source: string | null
          notes: string | null
          created_at: string
          updated_at: string
          source: string
        }
        Insert: {
          id?: string
          client_id: string
          officer_id: string
          nb_parts: number
          demembrement?: string
          date_effet?: string | null
          legal_act_id?: string | null
          acte_source?: string | null
          notes?: string | null
          created_at?: string
          updated_at?: string
          source?: string
        }
        Update: {
          id?: string
          client_id?: string
          officer_id?: string
          nb_parts?: number
          demembrement?: string
          date_effet?: string | null
          legal_act_id?: string | null
          acte_source?: string | null
          notes?: string | null
          created_at?: string
          updated_at?: string
          source?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_associes_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_associes_legal_act_id_fkey"
            columns: ["legal_act_id"]
            isOneToOne: false
            referencedRelation: "legal_acts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_associes_officer_id_fkey"
            columns: ["officer_id"]
            isOneToOne: false
            referencedRelation: "company_officers"
            referencedColumns: ["id"]
          },
        ]
      }
      client_collaborators: {
        Row: {
          id: string
          client_id: string
          user_id: string
          role: string | null
          created_at: string | null
          updated_at: string | null
        }
        Insert: {
          id?: string
          client_id: string
          user_id: string
          role?: string | null
          created_at?: string | null
          updated_at?: string | null
        }
        Update: {
          id?: string
          client_id?: string
          user_id?: string
          role?: string | null
          created_at?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "client_collaborators_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_collaborators_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      client_meeting_notes: {
        Row: {
          id: string
          client_id: string
          created_by: string | null
          date_rdv: string
          objet: string
          participants: string | null
          contenu: string
          actions_a_suivre: string | null
          created_at: string
          updated_at: string
          type_rdv: string | null
        }
        Insert: {
          id?: string
          client_id: string
          created_by?: string | null
          date_rdv?: string
          objet: string
          participants?: string | null
          contenu: string
          actions_a_suivre?: string | null
          created_at?: string
          updated_at?: string
          type_rdv?: string | null
        }
        Update: {
          id?: string
          client_id?: string
          created_by?: string | null
          date_rdv?: string
          objet?: string
          participants?: string | null
          contenu?: string
          actions_a_suivre?: string | null
          created_at?: string
          updated_at?: string
          type_rdv?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "client_meeting_notes_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_meeting_notes_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      client_software: {
        Row: {
          id: string
          client_id: string
          software_id: string
          start_date: string | null
          end_date: string | null
          notes: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          client_id: string
          software_id: string
          start_date?: string | null
          end_date?: string | null
          notes?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          client_id?: string
          software_id?: string
          start_date?: string | null
          end_date?: string | null
          notes?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_software_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_software_software_id_fkey"
            columns: ["software_id"]
            isOneToOne: false
            referencedRelation: "software"
            referencedColumns: ["id"]
          },
        ]
      }
      clients: {
        Row: {
          id: string
          nom_entreprise: string
          siret: string | null
          forme_juridique: string | null
          adresse: string | null
          email: string | null
          telephone: string | null
          contact_principal: string | null
          statut: string | null
          created_at: string | null
          updated_at: string | null
          numero_dossier: string | null
          date_cloture: string | null
          regime_fiscal: string | null
          date_creation_entreprise: string | null
          code_ape: string | null
          capital_social: number | null
          dirigeant: string | null
          last_inpi_sync: string | null
          siren: string | null
          last_legal_sync: string | null
          date_cloture_exercice_social: string | null
          date_premiere_cloture: string | null
          description_activite: string | null
          last_bodacc_sync: string | null
          date_entree_cabinet: string | null
          date_sortie_cabinet: string | null
          habilitation_non_concerne: boolean
          habilitation_avancement: string | null
          habilitation_commentaire: string | null
          resume_ia: string | null
          resume_ia_generated_at: string | null
          resume_ia_generated_by: string | null
          is_lmnp: boolean
          telephone_2: string | null
          type_personne: string | null
          civilite: string | null
          nom: string | null
          prenom: string | null
          prenoms: string | null
          adresse_ligne1: string | null
          adresse_complement: string | null
          code_postal: string | null
          ville: string | null
          pays: string | null
          code_insee: string | null
          tva_intracom: string | null
          tva_intracom_source: string
          tva_verif_statut: string
          tva_verif_le: string | null
          tva_verif_code: string | null
          tva_verif_nom: string | null
          tva_verif_adresse: string | null
          etat_administratif: string | null
          date_radiation: string | null
          nom_commercial: string | null
          date_immatriculation: string | null
          greffe: string | null
          /** Surcharge du jour d'echeance TVA. `null` = applique la regle CA3. */
          tva_jour_echeance: number | null
          email_2: string | null
          parts_totales: number | null
          accepte_mailings: boolean
        }
        Insert: {
          id?: string
          nom_entreprise: string
          siret?: string | null
          forme_juridique?: string | null
          adresse?: string | null
          email?: string | null
          telephone?: string | null
          contact_principal?: string | null
          statut?: string | null
          created_at?: string | null
          updated_at?: string | null
          numero_dossier?: string | null
          date_cloture?: string | null
          regime_fiscal?: string | null
          date_creation_entreprise?: string | null
          code_ape?: string | null
          capital_social?: number | null
          dirigeant?: string | null
          last_inpi_sync?: string | null
          siren?: string | null
          last_legal_sync?: string | null
          date_cloture_exercice_social?: string | null
          date_premiere_cloture?: string | null
          description_activite?: string | null
          last_bodacc_sync?: string | null
          date_entree_cabinet?: string | null
          date_sortie_cabinet?: string | null
          habilitation_non_concerne?: boolean
          habilitation_avancement?: string | null
          habilitation_commentaire?: string | null
          resume_ia?: string | null
          resume_ia_generated_at?: string | null
          resume_ia_generated_by?: string | null
          is_lmnp?: boolean
          telephone_2?: string | null
          type_personne?: string | null
          civilite?: string | null
          nom?: string | null
          prenom?: string | null
          prenoms?: string | null
          adresse_ligne1?: string | null
          adresse_complement?: string | null
          code_postal?: string | null
          ville?: string | null
          pays?: string | null
          code_insee?: string | null
          tva_intracom?: string | null
          tva_intracom_source?: string
          tva_verif_statut?: string
          tva_verif_le?: string | null
          tva_verif_code?: string | null
          tva_verif_nom?: string | null
          tva_verif_adresse?: string | null
          etat_administratif?: string | null
          date_radiation?: string | null
          nom_commercial?: string | null
          date_immatriculation?: string | null
          greffe?: string | null
          tva_jour_echeance?: number | null
          email_2?: string | null
          parts_totales?: number | null
          accepte_mailings?: boolean
        }
        Update: {
          id?: string
          nom_entreprise?: string
          siret?: string | null
          forme_juridique?: string | null
          adresse?: string | null
          email?: string | null
          telephone?: string | null
          contact_principal?: string | null
          statut?: string | null
          created_at?: string | null
          updated_at?: string | null
          numero_dossier?: string | null
          date_cloture?: string | null
          regime_fiscal?: string | null
          date_creation_entreprise?: string | null
          code_ape?: string | null
          capital_social?: number | null
          dirigeant?: string | null
          last_inpi_sync?: string | null
          siren?: string | null
          last_legal_sync?: string | null
          date_cloture_exercice_social?: string | null
          date_premiere_cloture?: string | null
          description_activite?: string | null
          last_bodacc_sync?: string | null
          date_entree_cabinet?: string | null
          date_sortie_cabinet?: string | null
          habilitation_non_concerne?: boolean
          habilitation_avancement?: string | null
          habilitation_commentaire?: string | null
          resume_ia?: string | null
          resume_ia_generated_at?: string | null
          resume_ia_generated_by?: string | null
          is_lmnp?: boolean
          telephone_2?: string | null
          type_personne?: string | null
          civilite?: string | null
          nom?: string | null
          prenom?: string | null
          prenoms?: string | null
          adresse_ligne1?: string | null
          adresse_complement?: string | null
          code_postal?: string | null
          ville?: string | null
          pays?: string | null
          code_insee?: string | null
          tva_intracom?: string | null
          tva_intracom_source?: string
          tva_verif_statut?: string
          tva_verif_le?: string | null
          tva_verif_code?: string | null
          tva_verif_nom?: string | null
          tva_verif_adresse?: string | null
          etat_administratif?: string | null
          date_radiation?: string | null
          nom_commercial?: string | null
          date_immatriculation?: string | null
          greffe?: string | null
          tva_jour_echeance?: number | null
          email_2?: string | null
          parts_totales?: number | null
          accepte_mailings?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "clients_resume_ia_generated_by_fkey"
            columns: ["resume_ia_generated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      company_officers: {
        Row: {
          id: string
          first_name: string
          last_name: string
          full_name: string | null
          birth_date: string | null
          nationality: string | null
          address: string | null
          source: string | null
          inpi_reference: string | null
          created_at: string | null
          updated_at: string | null
          person_type: string | null
          denomination: string | null
        }
        Insert: {
          id?: string
          first_name: string
          last_name: string
          birth_date?: string | null
          nationality?: string | null
          address?: string | null
          source?: string | null
          inpi_reference?: string | null
          created_at?: string | null
          updated_at?: string | null
          person_type?: string | null
          denomination?: string | null
        }
        Update: {
          id?: string
          first_name?: string
          last_name?: string
          birth_date?: string | null
          nationality?: string | null
          address?: string | null
          source?: string | null
          inpi_reference?: string | null
          created_at?: string | null
          updated_at?: string | null
          person_type?: string | null
          denomination?: string | null
        }
        Relationships: []
      }
      directory_companies: {
        Row: {
          id: string
          name: string
          siren: string | null
          siret: string | null
          legal_form: string | null
          address: string | null
          postal_code: string | null
          city: string | null
          phone: string | null
          email: string | null
          website: string | null
          notes: string | null
          created_by: string | null
          created_at: string | null
          updated_at: string | null
        }
        Insert: {
          id?: string
          name: string
          siren?: string | null
          siret?: string | null
          legal_form?: string | null
          address?: string | null
          postal_code?: string | null
          city?: string | null
          phone?: string | null
          email?: string | null
          website?: string | null
          notes?: string | null
          created_by?: string | null
          created_at?: string | null
          updated_at?: string | null
        }
        Update: {
          id?: string
          name?: string
          siren?: string | null
          siret?: string | null
          legal_form?: string | null
          address?: string | null
          postal_code?: string | null
          city?: string | null
          phone?: string | null
          email?: string | null
          website?: string | null
          notes?: string | null
          created_by?: string | null
          created_at?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      directory_contact_companies: {
        Row: {
          id: string
          contact_id: string
          company_id: string
          role_in_company: string | null
          created_at: string | null
          is_primary_contact: boolean
        }
        Insert: {
          id?: string
          contact_id: string
          company_id: string
          role_in_company?: string | null
          created_at?: string | null
          is_primary_contact?: boolean
        }
        Update: {
          id?: string
          contact_id?: string
          company_id?: string
          role_in_company?: string | null
          created_at?: string | null
          is_primary_contact?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "directory_contact_companies_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "directory_companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "directory_contact_companies_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "directory_contacts"
            referencedColumns: ["id"]
          },
        ]
      }
      directory_contacts: {
        Row: {
          id: string
          first_name: string
          last_name: string
          role: string | null
          phone: string | null
          mobile: string | null
          email: string | null
          notes: string | null
          created_by: string | null
          created_at: string | null
          updated_at: string | null
        }
        Insert: {
          id?: string
          first_name: string
          last_name: string
          role?: string | null
          phone?: string | null
          mobile?: string | null
          email?: string | null
          notes?: string | null
          created_by?: string | null
          created_at?: string | null
          updated_at?: string | null
        }
        Update: {
          id?: string
          first_name?: string
          last_name?: string
          role?: string | null
          phone?: string | null
          mobile?: string | null
          email?: string | null
          notes?: string | null
          created_by?: string | null
          created_at?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      email_digests: {
        Row: {
          id: string
          user_id: string
          digest_type: string
          last_sent_at: string | null
          next_send_at: string
          is_active: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          digest_type?: string
          last_sent_at?: string | null
          next_send_at?: string
          is_active?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          digest_type?: string
          last_sent_at?: string | null
          next_send_at?: string
          is_active?: boolean
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "email_digests_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      email_queue: {
        Row: {
          id: string
          user_id: string
          notification_id: string | null
          to_email: string
          subject: string
          html_body: string
          status: string
          retry_count: number
          error_message: string | null
          created_at: string
          sent_at: string | null
        }
        Insert: {
          id?: string
          user_id: string
          notification_id?: string | null
          to_email: string
          subject: string
          html_body: string
          status?: string
          retry_count?: number
          error_message?: string | null
          created_at?: string
          sent_at?: string | null
        }
        Update: {
          id?: string
          user_id?: string
          notification_id?: string | null
          to_email?: string
          subject?: string
          html_body?: string
          status?: string
          retry_count?: number
          error_message?: string | null
          created_at?: string
          sent_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "email_queue_notification_id_fkey"
            columns: ["notification_id"]
            isOneToOne: false
            referencedRelation: "notifications"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_queue_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      enrolment_codes: {
        Row: {
          id: string
          user_id: string
          code_hash: string
          expires_at: string
          used_at: string | null
          created_at: string
        }
        Insert: {
          id?: string
          user_id: string
          code_hash: string
          expires_at: string
          used_at?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          code_hash?: string
          expires_at?: string
          used_at?: string | null
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "enrolment_codes_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      general_assemblies: {
        Row: {
          id: string
          client_id: string
          type_ag: string
          date_prevue: string
          date_realisee: string | null
          lieu: string | null
          statut: string | null
          notes: string | null
          document_url: string | null
          created_at: string | null
          updated_at: string | null
        }
        Insert: {
          id?: string
          client_id: string
          type_ag: string
          date_prevue: string
          date_realisee?: string | null
          lieu?: string | null
          statut?: string | null
          notes?: string | null
          document_url?: string | null
          created_at?: string | null
          updated_at?: string | null
        }
        Update: {
          id?: string
          client_id?: string
          type_ag?: string
          date_prevue?: string
          date_realisee?: string | null
          lieu?: string | null
          statut?: string | null
          notes?: string | null
          document_url?: string | null
          created_at?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "general_assemblies_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      habilitations: {
        Row: {
          id: string
          siren: string
          service: string
          client_id: string | null
          date_creation_habilitation: string | null
          role: string | null
          etat: string | null
          created_at: string | null
        }
        Insert: {
          id?: string
          siren: string
          service: string
          client_id?: string | null
          date_creation_habilitation?: string | null
          role?: string | null
          etat?: string | null
          created_at?: string | null
        }
        Update: {
          id?: string
          siren?: string
          service?: string
          client_id?: string | null
          date_creation_habilitation?: string | null
          role?: string | null
          etat?: string | null
          created_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "habilitations_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      inpi_search_history: {
        Row: {
          id: string
          user_id: string
          query: string
          results_count: number
          created_at: string
        }
        Insert: {
          id?: string
          user_id: string
          query: string
          results_count?: number
          created_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          query?: string
          results_count?: number
          created_at?: string
        }
        Relationships: []
      }
      inpi_sync_history: {
        Row: {
          id: string
          client_id: string
          sync_date: string | null
          status: string
          data_received: Json | null
          error_message: string | null
          created_at: string | null
        }
        Insert: {
          id?: string
          client_id: string
          sync_date?: string | null
          status: string
          data_received?: Json | null
          error_message?: string | null
          created_at?: string | null
        }
        Update: {
          id?: string
          client_id?: string
          sync_date?: string | null
          status?: string
          data_received?: Json | null
          error_message?: string | null
          created_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "inpi_sync_history_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      jedeclare_suivi_interne: {
        Row: {
          id: string
          siren: string
          type_declaration: string
          mois: string
          axe: string
          societe: string
          siret: string | null
          dossier: string | null
          client_id: string | null
          rapprochement_manuel: boolean
          statut: string
          commentaire: string
          assignee_id: string | null
          updated_by: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          siren: string
          type_declaration: string
          mois: string
          axe?: string
          societe?: string
          siret?: string | null
          dossier?: string | null
          client_id?: string | null
          rapprochement_manuel?: boolean
          statut?: string
          commentaire?: string
          assignee_id?: string | null
          updated_by?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          siren?: string
          type_declaration?: string
          mois?: string
          axe?: string
          societe?: string
          siret?: string | null
          dossier?: string | null
          client_id?: string | null
          rapprochement_manuel?: boolean
          statut?: string
          commentaire?: string
          assignee_id?: string | null
          updated_by?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "jedeclare_suivi_interne_assignee_id_fkey"
            columns: ["assignee_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "jedeclare_suivi_interne_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "jedeclare_suivi_interne_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      jedeclare_teletransmissions: {
        Row: {
          id: string
          compte: number
          numero: string
          type_piece: string
          ligne: number
          procedure: string
          nature: string
          numero_ads: string
          date_avis: string
          siret: string
          siren: string
          societe: string
          dossier: string
          type_declaration: string
          type_libelle: string
          destinataire: string
          periode_debut: string
          periode_fin: string
          resultat: string
          bloquee: boolean
          montant: number | null
          rof: string
          lien: string
          analyse_le: string
        }
        Insert: {
          id?: string
          compte?: number
          numero: string
          type_piece: string
          ligne?: number
          procedure?: string
          nature?: string
          numero_ads?: string
          date_avis?: string
          siret?: string
          siren?: string
          societe?: string
          dossier?: string
          type_declaration?: string
          type_libelle?: string
          destinataire?: string
          periode_debut?: string
          periode_fin?: string
          resultat?: string
          bloquee?: boolean
          montant?: number | null
          rof?: string
          lien?: string
          analyse_le?: string
        }
        Update: {
          id?: string
          compte?: number
          numero?: string
          type_piece?: string
          ligne?: number
          procedure?: string
          nature?: string
          numero_ads?: string
          date_avis?: string
          siret?: string
          siren?: string
          societe?: string
          dossier?: string
          type_declaration?: string
          type_libelle?: string
          destinataire?: string
          periode_debut?: string
          periode_fin?: string
          resultat?: string
          bloquee?: boolean
          montant?: number | null
          rof?: string
          lien?: string
          analyse_le?: string
        }
        Relationships: []
      }
      legal_acts: {
        Row: {
          id: string
          client_id: string
          act_type: string
          act_category: string | null
          act_date: string
          deposit_date: string | null
          inpi_reference: string | null
          document_url: string | null
          storage_path: string | null
          download_status: string | null
          error_message: string | null
          metadata: Json | null
          created_at: string | null
          updated_at: string | null
          downloaded_at: string | null
          download_error: string | null
          file_size: number | null
          content_type: string | null
        }
        Insert: {
          id?: string
          client_id: string
          act_type: string
          act_category?: string | null
          act_date: string
          deposit_date?: string | null
          inpi_reference?: string | null
          document_url?: string | null
          storage_path?: string | null
          download_status?: string | null
          error_message?: string | null
          metadata?: Json | null
          created_at?: string | null
          updated_at?: string | null
          downloaded_at?: string | null
          download_error?: string | null
          file_size?: number | null
          content_type?: string | null
        }
        Update: {
          id?: string
          client_id?: string
          act_type?: string
          act_category?: string | null
          act_date?: string
          deposit_date?: string | null
          inpi_reference?: string | null
          document_url?: string | null
          storage_path?: string | null
          download_status?: string | null
          error_message?: string | null
          metadata?: Json | null
          created_at?: string | null
          updated_at?: string | null
          downloaded_at?: string | null
          download_error?: string | null
          file_size?: number | null
          content_type?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "legal_acts_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      legal_documents: {
        Row: {
          id: string
          client_id: string
          document_type: string
          title: string
          document_date: string
          storage_path: string | null
          file_url: string | null
          file_size: number | null
          mime_type: string | null
          related_act_id: string | null
          related_assembly_id: string | null
          metadata: Json | null
          created_at: string | null
          updated_at: string | null
        }
        Insert: {
          id?: string
          client_id: string
          document_type: string
          title: string
          document_date: string
          storage_path?: string | null
          file_url?: string | null
          file_size?: number | null
          mime_type?: string | null
          related_act_id?: string | null
          related_assembly_id?: string | null
          metadata?: Json | null
          created_at?: string | null
          updated_at?: string | null
        }
        Update: {
          id?: string
          client_id?: string
          document_type?: string
          title?: string
          document_date?: string
          storage_path?: string | null
          file_url?: string | null
          file_size?: number | null
          mime_type?: string | null
          related_act_id?: string | null
          related_assembly_id?: string | null
          metadata?: Json | null
          created_at?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "legal_documents_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "legal_documents_related_act_id_fkey"
            columns: ["related_act_id"]
            isOneToOne: false
            referencedRelation: "legal_acts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "legal_documents_related_assembly_id_fkey"
            columns: ["related_assembly_id"]
            isOneToOne: false
            referencedRelation: "general_assemblies"
            referencedColumns: ["id"]
          },
        ]
      }
      legal_forms: {
        Row: {
          code: string
          label: string
          level: number
          created_at: string | null
          updated_at: string | null
        }
        Insert: {
          code: string
          label: string
          level: number
          created_at?: string | null
          updated_at?: string | null
        }
        Update: {
          code?: string
          label?: string
          level?: number
          created_at?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      legal_sync_log: {
        Row: {
          id: string
          sync_type: string
          started_at: string
          completed_at: string | null
          status: string
          phases_completed: Json | null
          clients_processed: number | null
          clients_errored: number | null
          total_clients: number | null
          error_details: Json | null
          created_at: string | null
        }
        Insert: {
          id?: string
          sync_type?: string
          started_at?: string
          completed_at?: string | null
          status?: string
          phases_completed?: Json | null
          clients_processed?: number | null
          clients_errored?: number | null
          total_clients?: number | null
          error_details?: Json | null
          created_at?: string | null
        }
        Update: {
          id?: string
          sync_type?: string
          started_at?: string
          completed_at?: string | null
          status?: string
          phases_completed?: Json | null
          clients_processed?: number | null
          clients_errored?: number | null
          total_clients?: number | null
          error_details?: Json | null
          created_at?: string | null
        }
        Relationships: []
      }
      mailing_campagnes: {
        Row: {
          id: string
          sujet: string
          corps: string
          filtres: Json
          cree_par: string | null
          created_at: string
          envoye_le: string | null
          nb_destinataires: number
          nb_exclus: number
        }
        Insert: {
          id?: string
          sujet: string
          corps: string
          filtres?: Json
          cree_par?: string | null
          created_at?: string
          envoye_le?: string | null
          nb_destinataires?: number
          nb_exclus?: number
        }
        Update: {
          id?: string
          sujet?: string
          corps?: string
          filtres?: Json
          cree_par?: string | null
          created_at?: string
          envoye_le?: string | null
          nb_destinataires?: number
          nb_exclus?: number
        }
        Relationships: [
          {
            foreignKeyName: "mailing_campagnes_cree_par_fkey"
            columns: ["cree_par"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      mailing_destinataires: {
        Row: {
          id: string
          campagne_id: string
          client_id: string | null
          email: string
          email_queue_id: string | null
          created_at: string
        }
        Insert: {
          id?: string
          campagne_id: string
          client_id?: string | null
          email: string
          email_queue_id?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          campagne_id?: string
          client_id?: string | null
          email?: string
          email_queue_id?: string | null
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "mailing_destinataires_campagne_id_fkey"
            columns: ["campagne_id"]
            isOneToOne: false
            referencedRelation: "mailing_campagnes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mailing_destinataires_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      mcp_api_keys: {
        Row: {
          id: string
          name: string
          client_id: string
          client_secret_hash: string
          is_active: boolean
          last_used_at: string | null
          created_by: string | null
          created_at: string
          revoked_at: string | null
          peut_ecrire: boolean
        }
        Insert: {
          id?: string
          name?: string
          client_id: string
          client_secret_hash: string
          is_active?: boolean
          last_used_at?: string | null
          created_by?: string | null
          created_at?: string
          revoked_at?: string | null
          peut_ecrire?: boolean
        }
        Update: {
          id?: string
          name?: string
          client_id?: string
          client_secret_hash?: string
          is_active?: boolean
          last_used_at?: string | null
          created_by?: string | null
          created_at?: string
          revoked_at?: string | null
          peut_ecrire?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "mcp_api_keys_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      mcp_oauth_clients: {
        Row: {
          id: string
          client_id: string
          client_secret_hash: string | null
          client_name: string
          redirect_uris: string[]
          is_active: boolean
          created_at: string
          last_used_at: string | null
          revoked_at: string | null
        }
        Insert: {
          id?: string
          client_id: string
          client_secret_hash?: string | null
          client_name?: string
          redirect_uris?: string[]
          is_active?: boolean
          created_at?: string
          last_used_at?: string | null
          revoked_at?: string | null
        }
        Update: {
          id?: string
          client_id?: string
          client_secret_hash?: string | null
          client_name?: string
          redirect_uris?: string[]
          is_active?: boolean
          created_at?: string
          last_used_at?: string | null
          revoked_at?: string | null
        }
        Relationships: []
      }
      mcp_oauth_codes: {
        Row: {
          id: string
          code_hash: string
          client_id: string
          redirect_uri: string
          code_challenge: string
          code_challenge_method: string
          scope: string
          user_id: string
          expire_le: string
          utilise_le: string | null
          created_at: string
        }
        Insert: {
          id?: string
          code_hash: string
          client_id: string
          redirect_uri: string
          code_challenge: string
          code_challenge_method?: string
          scope?: string
          user_id: string
          expire_le: string
          utilise_le?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          code_hash?: string
          client_id?: string
          redirect_uri?: string
          code_challenge?: string
          code_challenge_method?: string
          scope?: string
          user_id?: string
          expire_le?: string
          utilise_le?: string | null
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "mcp_oauth_codes_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      mcp_oauth_tokens: {
        Row: {
          id: string
          chaine: string
          acces_hash: string
          rafraichir_hash: string | null
          client_id: string
          user_id: string
          scope: string
          resource: string
          acces_expire_le: string
          rafraichir_expire_le: string | null
          remplace_le: string | null
          revoque_le: string | null
          created_at: string
          last_used_at: string | null
        }
        Insert: {
          id?: string
          chaine: string
          acces_hash: string
          rafraichir_hash?: string | null
          client_id: string
          user_id: string
          scope?: string
          resource?: string
          acces_expire_le: string
          rafraichir_expire_le?: string | null
          remplace_le?: string | null
          revoque_le?: string | null
          created_at?: string
          last_used_at?: string | null
        }
        Update: {
          id?: string
          chaine?: string
          acces_hash?: string
          rafraichir_hash?: string | null
          client_id?: string
          user_id?: string
          scope?: string
          resource?: string
          acces_expire_le?: string
          rafraichir_expire_le?: string | null
          remplace_le?: string | null
          revoque_le?: string | null
          created_at?: string
          last_used_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "mcp_oauth_tokens_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_preferences: {
        Row: {
          id: string
          user_id: string
          notification_type: string
          email_enabled: boolean
          digest_enabled: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          notification_type: string
          email_enabled?: boolean
          digest_enabled?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          notification_type?: string
          email_enabled?: boolean
          digest_enabled?: boolean
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "notification_preferences_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          id: string
          user_id: string
          type: string
          title: string
          message: string
          link: string | null
          is_read: boolean | null
          created_at: string | null
        }
        Insert: {
          id?: string
          user_id: string
          type: string
          title: string
          message: string
          link?: string | null
          is_read?: boolean | null
          created_at?: string | null
        }
        Update: {
          id?: string
          user_id?: string
          type?: string
          title?: string
          message?: string
          link?: string | null
          is_read?: boolean | null
          created_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "notifications_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      officer_companies: {
        Row: {
          id: string
          officer_id: string
          client_id: string
          role: string
          role_type: string | null
          start_date: string
          end_date: string | null
          is_active: boolean | null
          power_type: string | null
          source: string | null
          legal_act_id: string | null
          notes: string | null
          created_at: string | null
          updated_at: string | null
        }
        Insert: {
          id?: string
          officer_id: string
          client_id: string
          role: string
          role_type?: string | null
          start_date: string
          end_date?: string | null
          is_active?: boolean | null
          power_type?: string | null
          source?: string | null
          legal_act_id?: string | null
          notes?: string | null
          created_at?: string | null
          updated_at?: string | null
        }
        Update: {
          id?: string
          officer_id?: string
          client_id?: string
          role?: string
          role_type?: string | null
          start_date?: string
          end_date?: string | null
          is_active?: boolean | null
          power_type?: string | null
          source?: string | null
          legal_act_id?: string | null
          notes?: string | null
          created_at?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "officer_companies_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "officer_companies_legal_act_id_fkey"
            columns: ["legal_act_id"]
            isOneToOne: false
            referencedRelation: "legal_acts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "officer_companies_officer_id_fkey"
            columns: ["officer_id"]
            isOneToOne: false
            referencedRelation: "company_officers"
            referencedColumns: ["id"]
          },
        ]
      }
      opportunity_attachments: {
        Row: {
          id: string
          card_id: string
          file_name: string
          file_size: number
          mime_type: string
          storage_path: string
          uploaded_by: string | null
          created_at: string
        }
        Insert: {
          id?: string
          card_id: string
          file_name: string
          file_size?: number
          mime_type: string
          storage_path: string
          uploaded_by?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          card_id?: string
          file_name?: string
          file_size?: number
          mime_type?: string
          storage_path?: string
          uploaded_by?: string | null
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "opportunity_attachments_card_id_fkey"
            columns: ["card_id"]
            isOneToOne: false
            referencedRelation: "opportunity_cards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "opportunity_attachments_uploaded_by_fkey"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      opportunity_cards: {
        Row: {
          id: string
          client_id: string | null
          column_id: string
          assignee_id: string | null
          montant_estime: number | null
          notes: string | null
          comment: string | null
          source: string | null
          date_relance: string | null
          position: number
          created_by: string | null
          created_at: string | null
          updated_at: string | null
          prospect_name: string | null
        }
        Insert: {
          id?: string
          client_id?: string | null
          column_id: string
          assignee_id?: string | null
          montant_estime?: number | null
          notes?: string | null
          comment?: string | null
          source?: string | null
          date_relance?: string | null
          position?: number
          created_by?: string | null
          created_at?: string | null
          updated_at?: string | null
          prospect_name?: string | null
        }
        Update: {
          id?: string
          client_id?: string | null
          column_id?: string
          assignee_id?: string | null
          montant_estime?: number | null
          notes?: string | null
          comment?: string | null
          source?: string | null
          date_relance?: string | null
          position?: number
          created_by?: string | null
          created_at?: string | null
          updated_at?: string | null
          prospect_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "opportunity_cards_assignee_id_fkey"
            columns: ["assignee_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "opportunity_cards_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "opportunity_cards_column_id_fkey"
            columns: ["column_id"]
            isOneToOne: false
            referencedRelation: "opportunity_columns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "opportunity_cards_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      opportunity_columns: {
        Row: {
          id: string
          name: string
          color: string
          position: number
          created_at: string | null
          updated_at: string | null
        }
        Insert: {
          id?: string
          name: string
          color?: string
          position?: number
          created_at?: string | null
          updated_at?: string | null
        }
        Update: {
          id?: string
          name?: string
          color?: string
          position?: number
          created_at?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      passkeys: {
        Row: {
          id: string
          user_id: string
          credential_id: string
          public_key: string
          compteur: number
          transports: string | null
          libelle: string | null
          created_at: string
          last_used_at: string | null
        }
        Insert: {
          id?: string
          user_id: string
          credential_id: string
          public_key: string
          compteur?: number
          transports?: string | null
          libelle?: string | null
          created_at?: string
          last_used_at?: string | null
        }
        Update: {
          id?: string
          user_id?: string
          credential_id?: string
          public_key?: string
          compteur?: number
          transports?: string | null
          libelle?: string | null
          created_at?: string
          last_used_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "passkeys_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          id: string
          role: string
          prenom: string | null
          nom: string | null
          email: string
          avatar_url: string | null
          created_at: string | null
          updated_at: string | null
          is_active: boolean
          job_role: string | null
          display_name: string | null
          telephone: string | null
          adresse: string | null
          deactivated_at: string | null
          deactivated_by: string | null
          show_my_dossiers: boolean
          default_collaborator_role_key: string | null
          avatar_color: string | null
        }
        Insert: {
          id?: string
          role?: string
          prenom?: string | null
          nom?: string | null
          email: string
          avatar_url?: string | null
          created_at?: string | null
          updated_at?: string | null
          is_active?: boolean
          job_role?: string | null
          display_name?: string | null
          telephone?: string | null
          adresse?: string | null
          deactivated_at?: string | null
          deactivated_by?: string | null
          show_my_dossiers?: boolean
          default_collaborator_role_key?: string | null
          avatar_color?: string | null
        }
        Update: {
          id?: string
          role?: string
          prenom?: string | null
          nom?: string | null
          email?: string
          avatar_url?: string | null
          created_at?: string | null
          updated_at?: string | null
          is_active?: boolean
          job_role?: string | null
          display_name?: string | null
          telephone?: string | null
          adresse?: string | null
          deactivated_at?: string | null
          deactivated_by?: string | null
          show_my_dossiers?: boolean
          default_collaborator_role_key?: string | null
          avatar_color?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "profiles_deactivated_by_fkey"
            columns: ["deactivated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      regimes_fiscaux: {
        Row: {
          id: string
          value: string
          label: string
          description: string
          position: number
          is_active: boolean
          created_at: string | null
          updated_at: string | null
        }
        Insert: {
          id?: string
          value: string
          label: string
          description?: string
          position?: number
          is_active?: boolean
          created_at?: string | null
          updated_at?: string | null
        }
        Update: {
          id?: string
          value?: string
          label?: string
          description?: string
          position?: number
          is_active?: boolean
          created_at?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      relance_history: {
        Row: {
          id: string
          relance_invoice_id: string
          date_relance: string
          type_relance: string
          commentaire: string | null
          effectuee_par: string | null
          created_at: string
        }
        Insert: {
          id?: string
          relance_invoice_id: string
          date_relance?: string
          type_relance?: string
          commentaire?: string | null
          effectuee_par?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          relance_invoice_id?: string
          date_relance?: string
          type_relance?: string
          commentaire?: string | null
          effectuee_par?: string | null
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "relance_history_effectuee_par_fkey"
            columns: ["effectuee_par"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "relance_history_relance_invoice_id_fkey"
            columns: ["relance_invoice_id"]
            isOneToOne: false
            referencedRelation: "relance_invoices"
            referencedColumns: ["id"]
          },
        ]
      }
      relance_invoices: {
        Row: {
          id: string
          client_id: string
          date_facture: string
          date_echeance: string | null
          numero_facture: string | null
          libelle: string | null
          montant: number
          statut: string
          nombre_relances: number
          derniere_relance: string | null
          notes: string | null
          created_at: string
          updated_at: string
          date_reglement: string | null
          montant_regle: number
          mode_reglement: string
        }
        Insert: {
          id?: string
          client_id: string
          date_facture?: string
          date_echeance?: string | null
          numero_facture?: string | null
          libelle?: string | null
          montant?: number
          statut?: string
          nombre_relances?: number
          derniere_relance?: string | null
          notes?: string | null
          created_at?: string
          updated_at?: string
          date_reglement?: string | null
          montant_regle?: number
          mode_reglement?: string
        }
        Update: {
          id?: string
          client_id?: string
          date_facture?: string
          date_echeance?: string | null
          numero_facture?: string | null
          libelle?: string | null
          montant?: number
          statut?: string
          nombre_relances?: number
          derniere_relance?: string | null
          notes?: string | null
          created_at?: string
          updated_at?: string
          date_reglement?: string | null
          montant_regle?: number
          mode_reglement?: string
        }
        Relationships: [
          {
            foreignKeyName: "relance_invoices_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      revenue_declaration_attachments: {
        Row: {
          id: string
          revenue_declaration_id: string
          file_name: string
          file_size: number
          mime_type: string
          storage_path: string
          uploaded_by: string | null
          created_at: string
        }
        Insert: {
          id?: string
          revenue_declaration_id: string
          file_name: string
          file_size?: number
          mime_type?: string
          storage_path: string
          uploaded_by?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          revenue_declaration_id?: string
          file_name?: string
          file_size?: number
          mime_type?: string
          storage_path?: string
          uploaded_by?: string | null
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "revenue_declaration_attachments_revenue_declaration_id_fkey"
            columns: ["revenue_declaration_id"]
            isOneToOne: false
            referencedRelation: "revenue_declarations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "revenue_declaration_attachments_uploaded_by_fkey"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      revenue_declaration_collaborators: {
        Row: {
          id: string
          declaration_id: string
          user_id: string
          created_at: string
        }
        Insert: {
          id?: string
          declaration_id: string
          user_id: string
          created_at?: string
        }
        Update: {
          id?: string
          declaration_id?: string
          user_id?: string
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "revenue_declaration_collaborators_declaration_id_fkey"
            columns: ["declaration_id"]
            isOneToOne: false
            referencedRelation: "revenue_declarations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "revenue_declaration_collaborators_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      revenue_declaration_deadlines: {
        Row: {
          id: string
          annee: number
          zone: string
          date_echeance: string
          created_at: string | null
          updated_at: string | null
        }
        Insert: {
          id?: string
          annee: number
          zone: string
          date_echeance: string
          created_at?: string | null
          updated_at?: string | null
        }
        Update: {
          id?: string
          annee?: number
          zone?: string
          date_echeance?: string
          created_at?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      revenue_declarations: {
        Row: {
          id: string
          client_id: string | null
          person_name: string
          annee: number
          statut: string
          commentaire: string
          position: number
          created_by: string | null
          created_at: string
          updated_at: string
          zone: string | null
          derniere_annee: boolean
        }
        Insert: {
          id?: string
          client_id?: string | null
          person_name: string
          annee: number
          statut?: string
          commentaire?: string
          position?: number
          created_by?: string | null
          created_at?: string
          updated_at?: string
          zone?: string | null
          derniere_annee?: boolean
        }
        Update: {
          id?: string
          client_id?: string | null
          person_name?: string
          annee?: number
          statut?: string
          commentaire?: string
          position?: number
          created_by?: string | null
          created_at?: string
          updated_at?: string
          zone?: string | null
          derniere_annee?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "revenue_declarations_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "revenue_declarations_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      siren_denominations: {
        Row: {
          siren: string
          denomination: string
          resolved_at: string
        }
        Insert: {
          siren: string
          denomination: string
          resolved_at?: string
        }
        Update: {
          siren?: string
          denomination?: string
          resolved_at?: string
        }
        Relationships: []
      }
      software: {
        Row: {
          id: string
          name: string
          category: string
          description: string | null
          is_active: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          name: string
          category: string
          description?: string | null
          is_active?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          name?: string
          category?: string
          description?: string | null
          is_active?: boolean
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      sync_jobs: {
        Row: {
          id: string
          user_id: string | null
          job_type: string
          status: string
          total: number
          processed: number
          success_count: number
          error_count: number
          payload: Json
          result: Json
          message: string | null
          started_at: string | null
          finished_at: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id?: string | null
          job_type: string
          status?: string
          total?: number
          processed?: number
          success_count?: number
          error_count?: number
          payload?: Json
          result?: Json
          message?: string | null
          started_at?: string | null
          finished_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string | null
          job_type?: string
          status?: string
          total?: number
          processed?: number
          success_count?: number
          error_count?: number
          payload?: Json
          result?: Json
          message?: string | null
          started_at?: string | null
          finished_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      sync_settings: {
        Row: {
          id: string
          sync_type: string
          frequency: string
          sync_hour: number
          is_enabled: boolean
          last_sync_at: string | null
          last_sync_status: string | null
          last_sync_message: string | null
          created_at: string | null
          updated_at: string | null
          sync_progress: Json | null
          error_details: Json | null
          batch_offset: number
          batch_size: number
          last_batch_completed_at: string | null
        }
        Insert: {
          id?: string
          sync_type?: string
          frequency?: string
          sync_hour?: number
          is_enabled?: boolean
          last_sync_at?: string | null
          last_sync_status?: string | null
          last_sync_message?: string | null
          created_at?: string | null
          updated_at?: string | null
          sync_progress?: Json | null
          error_details?: Json | null
          batch_offset?: number
          batch_size?: number
          last_batch_completed_at?: string | null
        }
        Update: {
          id?: string
          sync_type?: string
          frequency?: string
          sync_hour?: number
          is_enabled?: boolean
          last_sync_at?: string | null
          last_sync_status?: string | null
          last_sync_message?: string | null
          created_at?: string | null
          updated_at?: string | null
          sync_progress?: Json | null
          error_details?: Json | null
          batch_offset?: number
          batch_size?: number
          last_batch_completed_at?: string | null
        }
        Relationships: []
      }
      taches_planifiees: {
        Row: {
          nom: string
          derniere_execution: string
          dernier_succes: string | null
          duree_ms: number
          statut: string
          detail: string | null
        }
        Insert: {
          nom: string
          derniere_execution: string
          dernier_succes?: string | null
          duree_ms: number
          statut: string
          detail?: string | null
        }
        Update: {
          nom?: string
          derniere_execution?: string
          dernier_succes?: string | null
          duree_ms?: number
          statut?: string
          detail?: string | null
        }
        Relationships: []
      }
      task_attachments: {
        Row: {
          id: string
          task_id: string
          file_name: string
          file_size: number
          mime_type: string
          storage_path: string
          uploaded_by: string | null
          created_at: string
        }
        Insert: {
          id?: string
          task_id: string
          file_name: string
          file_size?: number
          mime_type: string
          storage_path: string
          uploaded_by?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          task_id?: string
          file_name?: string
          file_size?: number
          mime_type?: string
          storage_path?: string
          uploaded_by?: string | null
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "task_attachments_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_attachments_uploaded_by_fkey"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      task_categories: {
        Row: {
          id: string
          nom: string
          couleur: string | null
          icone: string | null
          position: number | null
          is_active: boolean | null
          created_at: string | null
          updated_at: string | null
        }
        Insert: {
          id?: string
          nom: string
          couleur?: string | null
          icone?: string | null
          position?: number | null
          is_active?: boolean | null
          created_at?: string | null
          updated_at?: string | null
        }
        Update: {
          id?: string
          nom?: string
          couleur?: string | null
          icone?: string | null
          position?: number | null
          is_active?: boolean | null
          created_at?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      task_comments: {
        Row: {
          id: string
          task_id: string
          user_id: string
          content: string
          created_at: string | null
          updated_at: string | null
        }
        Insert: {
          id?: string
          task_id: string
          user_id: string
          content: string
          created_at?: string | null
          updated_at?: string | null
        }
        Update: {
          id?: string
          task_id?: string
          user_id?: string
          content?: string
          created_at?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "task_comments_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_comments_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      task_templates: {
        Row: {
          id: string
          titre: string
          description: string | null
          priorite: string | null
          category_id: string | null
          estimated_hours: number | null
          is_active: boolean | null
          position: number | null
          created_at: string | null
          updated_at: string | null
        }
        Insert: {
          id?: string
          titre: string
          description?: string | null
          priorite?: string | null
          category_id?: string | null
          estimated_hours?: number | null
          is_active?: boolean | null
          position?: number | null
          created_at?: string | null
          updated_at?: string | null
        }
        Update: {
          id?: string
          titre?: string
          description?: string | null
          priorite?: string | null
          category_id?: string | null
          estimated_hours?: number | null
          is_active?: boolean | null
          position?: number | null
          created_at?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "task_templates_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "task_categories"
            referencedColumns: ["id"]
          },
        ]
      }
      tasks: {
        Row: {
          id: string
          client_id: string | null
          titre: string
          description: string | null
          assignee_id: string | null
          statut: string | null
          priorite: string | null
          date_echeance: string | null
          created_at: string | null
          updated_at: string | null
          template_id: string | null
          created_by: string | null
          category_id: string | null
          progress: number | null
          estimated_hours: number | null
          is_archived: boolean
          archived_at: string | null
          archived_by: string | null
        }
        Insert: {
          id?: string
          client_id?: string | null
          titre: string
          description?: string | null
          assignee_id?: string | null
          statut?: string | null
          priorite?: string | null
          date_echeance?: string | null
          created_at?: string | null
          updated_at?: string | null
          template_id?: string | null
          created_by?: string | null
          category_id?: string | null
          progress?: number | null
          estimated_hours?: number | null
          is_archived?: boolean
          archived_at?: string | null
          archived_by?: string | null
        }
        Update: {
          id?: string
          client_id?: string | null
          titre?: string
          description?: string | null
          assignee_id?: string | null
          statut?: string | null
          priorite?: string | null
          date_echeance?: string | null
          created_at?: string | null
          updated_at?: string | null
          template_id?: string | null
          created_by?: string | null
          category_id?: string | null
          progress?: number | null
          estimated_hours?: number | null
          is_archived?: boolean
          archived_at?: string | null
          archived_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tasks_archived_by_fkey"
            columns: ["archived_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_assignee_id_fkey"
            columns: ["assignee_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "task_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "task_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      tax_authorizations: {
        Row: {
          id: string
          client_id: string
          type_habilitation: string
          numero: string | null
          date_debut: string
          date_fin: string
          statut: string | null
          document_url: string | null
          notes: string | null
          created_at: string | null
          updated_at: string | null
        }
        Insert: {
          id?: string
          client_id: string
          type_habilitation: string
          numero?: string | null
          date_debut: string
          date_fin: string
          statut?: string | null
          document_url?: string | null
          notes?: string | null
          created_at?: string | null
          updated_at?: string | null
        }
        Update: {
          id?: string
          client_id?: string
          type_habilitation?: string
          numero?: string | null
          date_debut?: string
          date_fin?: string
          statut?: string | null
          document_url?: string | null
          notes?: string | null
          created_at?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tax_authorizations_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      tax_exemption_results: {
        Row: {
          id: string
          tax_exemption_id: string
          calendar_year: number
          resultat_exercice: number
          resultat_exonere: number
          resultat_impose: number
          detail_calcul: Json | null
          created_at: string | null
          updated_at: string | null
        }
        Insert: {
          id?: string
          tax_exemption_id: string
          calendar_year: number
          resultat_exercice?: number
          resultat_exonere?: number
          resultat_impose?: number
          detail_calcul?: Json | null
          created_at?: string | null
          updated_at?: string | null
        }
        Update: {
          id?: string
          tax_exemption_id?: string
          calendar_year?: number
          resultat_exercice?: number
          resultat_exonere?: number
          resultat_impose?: number
          detail_calcul?: Json | null
          created_at?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tax_exemption_results_tax_exemption_id_fkey"
            columns: ["tax_exemption_id"]
            isOneToOne: false
            referencedRelation: "tax_exemptions"
            referencedColumns: ["id"]
          },
        ]
      }
      tax_exemptions: {
        Row: {
          id: string
          client_id: string
          type_exoneration: string
          date_debut: string
          date_fin: string
          montant: number | null
          statut: string | null
          justificatif_url: string | null
          notes: string | null
          created_at: string | null
          updated_at: string | null
        }
        Insert: {
          id?: string
          client_id: string
          type_exoneration: string
          date_debut: string
          date_fin: string
          montant?: number | null
          statut?: string | null
          justificatif_url?: string | null
          notes?: string | null
          created_at?: string | null
          updated_at?: string | null
        }
        Update: {
          id?: string
          client_id?: string
          type_exoneration?: string
          date_debut?: string
          date_fin?: string
          montant?: number | null
          statut?: string | null
          justificatif_url?: string | null
          notes?: string | null
          created_at?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tax_exemptions_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      user_preferences: {
        Row: {
          user_id: string
          preferences: Json
          updated_at: string
        }
        Insert: {
          user_id: string
          preferences?: Json
          updated_at?: string
        }
        Update: {
          user_id?: string
          preferences?: Json
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_preferences_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      user_row_orders: {
        Row: {
          id: string
          user_id: string
          context: string
          row_id: string
          position: number
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          context: string
          row_id: string
          position?: number
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          context?: string
          row_id?: string
          position?: number
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_row_orders_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      web_directory_categories: {
        Row: {
          id: string
          name: string
          description: string | null
          icon: string | null
          color: string | null
          position: number
          created_at: string | null
          updated_at: string | null
        }
        Insert: {
          id?: string
          name: string
          description?: string | null
          icon?: string | null
          color?: string | null
          position?: number
          created_at?: string | null
          updated_at?: string | null
        }
        Update: {
          id?: string
          name?: string
          description?: string | null
          icon?: string | null
          color?: string | null
          position?: number
          created_at?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      web_directory_default_categories: {
        Row: {
          id: string
          name: string
          description: string | null
          icon: string | null
          color: string | null
          position: number
          created_at: string | null
          updated_at: string | null
        }
        Insert: {
          id?: string
          name: string
          description?: string | null
          icon?: string | null
          color?: string | null
          position?: number
          created_at?: string | null
          updated_at?: string | null
        }
        Update: {
          id?: string
          name?: string
          description?: string | null
          icon?: string | null
          color?: string | null
          position?: number
          created_at?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      web_directory_default_links: {
        Row: {
          id: string
          default_category_id: string
          title: string
          url: string
          description: string | null
          position: number
          created_at: string | null
          updated_at: string | null
        }
        Insert: {
          id?: string
          default_category_id: string
          title: string
          url: string
          description?: string | null
          position?: number
          created_at?: string | null
          updated_at?: string | null
        }
        Update: {
          id?: string
          default_category_id?: string
          title?: string
          url?: string
          description?: string | null
          position?: number
          created_at?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "web_directory_default_links_default_category_id_fkey"
            columns: ["default_category_id"]
            isOneToOne: false
            referencedRelation: "web_directory_default_categories"
            referencedColumns: ["id"]
          },
        ]
      }
      web_directory_links: {
        Row: {
          id: string
          category_id: string
          title: string
          url: string
          description: string | null
          position: number
          created_at: string | null
          updated_at: string | null
        }
        Insert: {
          id?: string
          category_id: string
          title: string
          url: string
          description?: string | null
          position?: number
          created_at?: string | null
          updated_at?: string | null
        }
        Update: {
          id?: string
          category_id?: string
          title?: string
          url?: string
          description?: string | null
          position?: number
          created_at?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "web_directory_links_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "web_directory_categories"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      auto_archive_done_tasks: {
        Args: Record<PropertyKey, never>
        Returns: undefined
      }
      build_notification_email_html: {
        Args: {
          p_type: string
          p_title: string
          p_message: string
          p_link?: string
        }
        Returns: string
      }
      create_notification: {
        Args: {
          p_user_id: string
          p_type: string
          p_title: string
          p_message: string
          p_link?: string
        }
        Returns: string
      }
      get_dashboard_stats: {
        Args: {
          p_user_id: string
        }
        Returns: Json
      }
      initialize_bilan_defaults: {
        Args: {
          p_regime: string
        }
        Returns: undefined
      }
      initialize_opportunity_defaults: {
        Args: Record<PropertyKey, never>
        Returns: undefined
      }
      process_email_digest: {
        Args: {
          p_base_url: string
        }
        Returns: undefined
      }
      replace_client_associes: {
        Args: {
          p_client_id: string
          p_lignes: Json
          p_source?: string
        }
        Returns: undefined
      }
      replace_client_collaborators: {
        Args: {
          p_client_id: string
          p_collaborators: Json
        }
        Returns: undefined
      }
    }
  }
}



export type BilanColumn = Database['public']['Tables']['bilan_columns']['Row']
export type BilanChecklistTemplate = Database['public']['Tables']['bilan_checklist_templates']['Row']
export type BilanCard = Database['public']['Tables']['bilan_cards']['Row']
export type BilanChecklistItem = Database['public']['Tables']['bilan_checklist_items']['Row']

export interface BilanCardWithDetails extends BilanCard {
  clients: {
    nom_entreprise: string
    numero_dossier: string | null
    siren: string | null
    forme_juridique: string | null
    // `clients.statut` porte un DEFAULT sans NOT NULL : il est nullable.
    statut: string | null
    date_cloture: string | null
  }
  assignee: {
    prenom: string | null
    nom: string | null
  } | null
  checklist_items: Array<BilanChecklistItem & {
    template: { name: string; position: number } | null
    /**
     * OPTIONNEL, et il faut que ça le reste : `fetchBilanCards()` a DEUX
     * requêtes, et la seconde — celle de repli quand la table des pièces
     * jointes est absente — ne les demande pas. Les déclarer obligatoires
     * mentirait sur la moitié des appels.
     *
     * Leur absence de ce type est ce qui poussait `BilanCard` et
     * `BilanCardDetailModal` à écrire `(item as any).attachments`.
     */
    attachments?: Array<{
      id: string
      file_name: string
      file_size: number | null
      mime_type: string | null
      storage_path: string
      uploaded_by: string | null
      created_at: string | null
    }>
  }>
}


export type NotificationType = 'task_assigned' | 'task_commented' | 'task_status_changed' | 'bilan_moved' | 'ticket_message' | 'user_deactivated'

export type NotificationPreference = Database['public']['Tables']['notification_preferences']['Row']
export type EmailDigest = Database['public']['Tables']['email_digests']['Row']




export type OpportunityColumn = Database['public']['Tables']['opportunity_columns']['Row']
export type OpportunityCard = Database['public']['Tables']['opportunity_cards']['Row']

export interface OpportunityCardWithDetails extends OpportunityCard {
  clients: {
    nom_entreprise: string
    numero_dossier: string | null
    siren: string | null
    forme_juridique: string | null
    // `clients.statut` porte un DEFAULT sans NOT NULL : il est nullable.
    statut: string | null
  } | null
  assignee: {
    prenom: string | null
    nom: string | null
  } | null
}

export type RelanceInvoice = Database['public']['Tables']['relance_invoices']['Row']
export type RelanceHistory = Database['public']['Tables']['relance_history']['Row']
export type RelanceStatut = 'en_attente' | 'relancee' | 'payee' | 'contentieux'
export type RelanceType = 'email' | 'telephone' | 'courrier' | 'autre'

export type MeetingNote = Database['public']['Tables']['client_meeting_notes']['Row']

export type RegimeFiscal = string
export type ClientStatus = 'actif' | 'inactif' | 'prospect' | 'archive'
export type CollaboratorRole = 'responsable' | 'assistant' | 'consultant'

/**
 * Les six types de checklist, alignes sur la base.
 * ---------------------------------------------------------------------------
 * Ils etaient ecrits a la main, et n'avaient pas suivi la refonte mono-cabinet :
 * `Checklist`, `ChecklistTemplate` et `ChecklistItemAttachment` declaraient
 * encore un `cabinet_id`, colonne retiree de 39 tables ; `Checklist` ignorait a
 * l'inverse `task_id`, ajoute depuis. Aucune ligne lue en base ne pouvait donc
 * correspondre a ces formes, et les neuf `as Checklist` de checklistService.ts
 * echouaient tous — TypeScript refusant une conversion entre deux types qui ne
 * se recouvrent pas assez.
 *
 * Les derivant de `Tables[...]['Row']`, comme le sont deja tous leurs voisins de
 * ce fichier, ils suivent desormais la base sans intervention : le generateur
 * (scripts/generer-types.mjs) fait foi.
 */
export type Checklist = Database['public']['Tables']['checklists']['Row']
export type ChecklistItem = Database['public']['Tables']['checklist_items']['Row']
export type ChecklistTemplate = Database['public']['Tables']['checklist_templates']['Row']
export type ChecklistTemplateItem = Database['public']['Tables']['checklist_template_items']['Row']
export type ChecklistItemAttachment = Database['public']['Tables']['checklist_item_attachments']['Row']

/** La ligne, plus l'auteur rapporte par la jointure de checklistService. */
export type ChecklistItemComment =
  Database['public']['Tables']['checklist_item_comments']['Row'] & {
    author?: { prenom: string | null; nom: string | null } | null
  }
