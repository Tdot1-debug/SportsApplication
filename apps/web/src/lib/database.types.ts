
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  
  "graphql_public": {
          Tables: {
            [_ in never]: never
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "graphql":
{ Args: { "extensions"?: Json,"operationName"?: string,"query"?: string,"variables"?: Json }; Returns: Json
                           }
          }
          Enums: {
            [_ in never]: never
          }
          CompositeTypes: {
            [_ in never]: never
          }
        },"public": {
          Tables: {
            "analysis_raw_outputs": {
                  Row: {
                    "attempt": number,"created_at": string,"frame_timestamps": NonNullable<Json>,"id": string,"job_id": string,"org_id": string,"request_meta": NonNullable<Json>,"response_text": string | null,"stop_reason": string | null,"usage": NonNullable<Json>,"validation_errors": NonNullable<Json>,"validation_status": string,"video_id": string,"window_end_s": number,"window_index": number,"window_start_s": number
                  }
                  ComputedFields: never
                  Insert: {
                    "attempt"?: number,"created_at"?: string,"frame_timestamps": NonNullable<Json>,"id"?: string,"job_id": string,"org_id": string,"request_meta"?: NonNullable<Json>,"response_text"?: string | null,"stop_reason"?: string | null,"usage"?: NonNullable<Json>,"validation_errors"?: NonNullable<Json>,"validation_status": string,"video_id": string,"window_end_s": number,"window_index": number,"window_start_s": number
                  }
                  Update: {
                    "attempt"?: number,"created_at"?: string,"frame_timestamps"?: NonNullable<Json>,"id"?: string,"job_id"?: string,"org_id"?: string,"request_meta"?: NonNullable<Json>,"response_text"?: string | null,"stop_reason"?: string | null,"usage"?: NonNullable<Json>,"validation_errors"?: NonNullable<Json>,"validation_status"?: string,"video_id"?: string,"window_end_s"?: number,"window_index"?: number,"window_start_s"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "analysis_raw_outputs_job_id_fkey"
      columns: ["job_id"]
isOneToOne: false
      referencedRelation: "processing_jobs"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "analysis_raw_outputs_org_id_fkey"
      columns: ["org_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "analysis_raw_outputs_video_id_fkey"
      columns: ["video_id"]
isOneToOne: false
      referencedRelation: "videos"
      referencedColumns: ["id"]
    }
                  ]
                },"analysis_runs": {
                  Row: {
                    "abstentions": NonNullable<Json>,"activity_id": string | null,"analysis_version": string,"created_at": string,"drill_template": string,"error": string | null,"estimated_cost_usd": number | null,"extraction_settings": NonNullable<Json>,"generation": number,"id": string,"input_tokens": number,"job_id": string,"limitations": NonNullable<Json>,"model": string,"org_id": string,"output_tokens": number,"processing_ms": number | null,"prompt_version": string,"provider": string,"provider_requests": number,"range_end_s": number,"range_start_s": number,"registry_version": string | null,"status": string,"validated_output": Json | null,"video_id": string,"video_sha256": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "abstentions"?: NonNullable<Json>,"activity_id"?: never,"analysis_version": string,"created_at"?: string,"drill_template": string,"error"?: string | null,"estimated_cost_usd"?: number | null,"extraction_settings": NonNullable<Json>,"generation": number,"id"?: string,"input_tokens"?: number,"job_id": string,"limitations"?: NonNullable<Json>,"model": string,"org_id": string,"output_tokens"?: number,"processing_ms"?: number | null,"prompt_version": string,"provider": string,"provider_requests"?: number,"range_end_s": number,"range_start_s": number,"registry_version"?: never,"status": string,"validated_output"?: Json | null,"video_id": string,"video_sha256"?: string | null
                  }
                  Update: {
                    "abstentions"?: NonNullable<Json>,"activity_id"?: never,"analysis_version"?: string,"created_at"?: string,"drill_template"?: string,"error"?: string | null,"estimated_cost_usd"?: number | null,"extraction_settings"?: NonNullable<Json>,"generation"?: number,"id"?: string,"input_tokens"?: number,"job_id"?: string,"limitations"?: NonNullable<Json>,"model"?: string,"org_id"?: string,"output_tokens"?: number,"processing_ms"?: number | null,"prompt_version"?: string,"provider"?: string,"provider_requests"?: number,"range_end_s"?: number,"range_start_s"?: number,"registry_version"?: never,"status"?: string,"validated_output"?: Json | null,"video_id"?: string,"video_sha256"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "analysis_runs_job_id_fkey"
      columns: ["job_id"]
isOneToOne: true
      referencedRelation: "processing_jobs"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "analysis_runs_org_id_fkey"
      columns: ["org_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "analysis_runs_video_id_fkey"
      columns: ["video_id"]
isOneToOne: false
      referencedRelation: "videos"
      referencedColumns: ["id"]
    }
                  ]
                },"app_config": {
                  Row: {
                    "description": string | null,"key": string,"updated_at": string,"value": NonNullable<Json>
                  }
                  ComputedFields: never
                  Insert: {
                    "description"?: string | null,"key": string,"updated_at"?: string,"value": NonNullable<Json>
                  }
                  Update: {
                    "description"?: string | null,"key"?: string,"updated_at"?: string,"value"?: NonNullable<Json>
                  }
                  Relationships: [
                    
                  ]
                },"athlete_links": {
                  Row: {
                    "created_at": string,"id": string,"org_id": string,"player_id": string,"revoked_at": string | null,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"id"?: string,"org_id": string,"player_id": string,"revoked_at"?: string | null,"user_id": string
                  }
                  Update: {
                    "created_at"?: string,"id"?: string,"org_id"?: string,"player_id"?: string,"revoked_at"?: string | null,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "athlete_links_org_id_fkey"
      columns: ["org_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "athlete_links_player_id_fkey"
      columns: ["player_id"]
isOneToOne: false
      referencedRelation: "players"
      referencedColumns: ["id"]
    }
                  ]
                },"audit_events": {
                  Row: {
                    "action": string,"actor": string | null,"created_at": string,"details": NonNullable<Json>,"id": number,"org_id": string | null,"target_id": string | null,"target_type": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "action": string,"actor"?: string | null,"created_at"?: string,"details"?: NonNullable<Json>,"id"?: number,"org_id"?: string | null,"target_id"?: string | null,"target_type"?: string | null
                  }
                  Update: {
                    "action"?: string,"actor"?: string | null,"created_at"?: string,"details"?: NonNullable<Json>,"id"?: number,"org_id"?: string | null,"target_id"?: string | null,"target_type"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "audit_events_org_id_fkey"
      columns: ["org_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    }
                  ]
                },"coach_revisions": {
                  Row: {
                    "action": string,"actor": string | null,"after": Json | null,"before": Json | null,"created_at": string,"id": number,"item_id": string | null,"org_id": string,"video_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "action": string,"actor"?: string | null,"after"?: Json | null,"before"?: Json | null,"created_at"?: string,"id"?: number,"item_id"?: string | null,"org_id": string,"video_id": string
                  }
                  Update: {
                    "action"?: string,"actor"?: string | null,"after"?: Json | null,"before"?: Json | null,"created_at"?: string,"id"?: number,"item_id"?: string | null,"org_id"?: string,"video_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "coach_revisions_org_id_fkey"
      columns: ["org_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "coach_revisions_video_id_fkey"
      columns: ["video_id"]
isOneToOne: false
      referencedRelation: "videos"
      referencedColumns: ["id"]
    }
                  ]
                },"comparisons": {
                  Row: {
                    "created_at": string,"created_by": string | null,"id": string,"notes": string | null,"org_id": string,"player_id": string,"team_id": string,"updated_at": string,"video_a": string,"video_b": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"created_by"?: string | null,"id"?: string,"notes"?: string | null,"org_id": string,"player_id": string,"team_id": string,"updated_at"?: string,"video_a": string,"video_b": string
                  }
                  Update: {
                    "created_at"?: string,"created_by"?: string | null,"id"?: string,"notes"?: string | null,"org_id"?: string,"player_id"?: string,"team_id"?: string,"updated_at"?: string,"video_a"?: string,"video_b"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "comparisons_org_id_fkey"
      columns: ["org_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "comparisons_player_id_fkey"
      columns: ["player_id"]
isOneToOne: false
      referencedRelation: "players"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "comparisons_team_id_fkey"
      columns: ["team_id"]
isOneToOne: false
      referencedRelation: "teams"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "comparisons_video_a_fkey"
      columns: ["video_a"]
isOneToOne: false
      referencedRelation: "videos"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "comparisons_video_b_fkey"
      columns: ["video_b"]
isOneToOne: false
      referencedRelation: "videos"
      referencedColumns: ["id"]
    }
                  ]
                },"deletion_log": {
                  Row: {
                    "completed_at": string,"details": NonNullable<Json>,"id": number,"org_kind": string | null,"requested_at": string,"subject_id": string,"subject_kind": string
                  }
                  ComputedFields: never
                  Insert: {
                    "completed_at"?: string,"details"?: NonNullable<Json>,"id"?: never,"org_kind"?: string | null,"requested_at": string,"subject_id": string,"subject_kind": string
                  }
                  Update: {
                    "completed_at"?: string,"details"?: NonNullable<Json>,"id"?: never,"org_kind"?: string | null,"requested_at"?: string,"subject_id"?: string,"subject_kind"?: string
                  }
                  Relationships: [
                    
                  ]
                },"detected_events": {
                  Row: {
                    "abstention_reason": string | null,"activity_label": string,"created_at": string,"end_s": number,"event_type": string,"evidence": string,"id": string,"org_id": string,"run_id": string,"seq": number,"source_windows": (number)[],"start_s": number,"suggested_outcome": string | null,"video_id": string,"visibility": string
                  }
                  ComputedFields: never
                  Insert: {
                    "abstention_reason"?: string | null,"activity_label": string,"created_at"?: string,"end_s": number,"event_type": string,"evidence": string,"id"?: string,"org_id": string,"run_id": string,"seq": number,"source_windows"?: (number)[],"start_s": number,"suggested_outcome"?: string | null,"video_id": string,"visibility": string
                  }
                  Update: {
                    "abstention_reason"?: string | null,"activity_label"?: string,"created_at"?: string,"end_s"?: number,"event_type"?: string,"evidence"?: string,"id"?: string,"org_id"?: string,"run_id"?: string,"seq"?: number,"source_windows"?: (number)[],"start_s"?: number,"suggested_outcome"?: string | null,"video_id"?: string,"visibility"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "detected_events_org_id_fkey"
      columns: ["org_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "detected_events_run_id_fkey"
      columns: ["run_id"]
isOneToOne: false
      referencedRelation: "analysis_runs"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "detected_events_video_id_fkey"
      columns: ["video_id"]
isOneToOne: false
      referencedRelation: "videos"
      referencedColumns: ["id"]
    }
                  ]
                },"draft_observations": {
                  Row: {
                    "category": string,"created_at": string,"evidence": string,"id": string,"limitations": string,"observation": string,"org_id": string,"review_questions": NonNullable<Json>,"run_id": string,"t_end_s": number,"t_start_s": number,"video_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "category": string,"created_at"?: string,"evidence": string,"id"?: string,"limitations"?: string,"observation": string,"org_id": string,"review_questions"?: NonNullable<Json>,"run_id": string,"t_end_s": number,"t_start_s": number,"video_id": string
                  }
                  Update: {
                    "category"?: string,"created_at"?: string,"evidence"?: string,"id"?: string,"limitations"?: string,"observation"?: string,"org_id"?: string,"review_questions"?: NonNullable<Json>,"run_id"?: string,"t_end_s"?: number,"t_start_s"?: number,"video_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "draft_observations_org_id_fkey"
      columns: ["org_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "draft_observations_run_id_fkey"
      columns: ["run_id"]
isOneToOne: false
      referencedRelation: "analysis_runs"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "draft_observations_video_id_fkey"
      columns: ["video_id"]
isOneToOne: false
      referencedRelation: "videos"
      referencedColumns: ["id"]
    }
                  ]
                },"entitlements": {
                  Row: {
                    "analysis_minutes_per_month": number | null,"created_at": string,"ends_at": string | null,"granted_by": string | null,"id": string,"max_coaches": number | null,"max_players": number | null,"max_teams": number | null,"note": string | null,"org_id": string,"plan_code": string,"retained_video_minutes": number | null,"source": string,"starts_at": string,"status": string
                  }
                  ComputedFields: never
                  Insert: {
                    "analysis_minutes_per_month"?: number | null,"created_at"?: string,"ends_at"?: string | null,"granted_by"?: string | null,"id"?: string,"max_coaches"?: number | null,"max_players"?: number | null,"max_teams"?: number | null,"note"?: string | null,"org_id": string,"plan_code": string,"retained_video_minutes"?: number | null,"source": string,"starts_at"?: string,"status"?: string
                  }
                  Update: {
                    "analysis_minutes_per_month"?: number | null,"created_at"?: string,"ends_at"?: string | null,"granted_by"?: string | null,"id"?: string,"max_coaches"?: number | null,"max_players"?: number | null,"max_teams"?: number | null,"note"?: string | null,"org_id"?: string,"plan_code"?: string,"retained_video_minutes"?: number | null,"source"?: string,"starts_at"?: string,"status"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "entitlements_org_id_fkey"
      columns: ["org_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "entitlements_plan_code_fkey"
      columns: ["plan_code"]
isOneToOne: false
      referencedRelation: "plans"
      referencedColumns: ["code"]
    }
                  ]
                },"goals": {
                  Row: {
                    "created_at": string,"created_by": string | null,"id": string,"org_id": string,"player_id": string,"sport": string,"status": string,"target_date": string | null,"text": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"created_by"?: string | null,"id"?: string,"org_id": string,"player_id": string,"sport": string,"status"?: string,"target_date"?: string | null,"text": string,"updated_at"?: string
                  }
                  Update: {
                    "created_at"?: string,"created_by"?: string | null,"id"?: string,"org_id"?: string,"player_id"?: string,"sport"?: string,"status"?: string,"target_date"?: string | null,"text"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "goals_org_id_fkey"
      columns: ["org_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "goals_player_id_fkey"
      columns: ["player_id"]
isOneToOne: false
      referencedRelation: "players"
      referencedColumns: ["id"]
    }
                  ]
                },"invitations": {
                  Row: {
                    "accepted_at": string | null,"accepted_by": string | null,"all_teams": boolean,"created_at": string,"email": string,"expires_at": string,"id": string,"invited_by": string | null,"org_id": string,"player_id": string | null,"revoked_at": string | null,"role": string,"team_ids": (string)[],"token_hash": string
                  }
                  ComputedFields: never
                  Insert: {
                    "accepted_at"?: string | null,"accepted_by"?: string | null,"all_teams"?: boolean,"created_at"?: string,"email": string,"expires_at": string,"id"?: string,"invited_by"?: string | null,"org_id": string,"player_id"?: string | null,"revoked_at"?: string | null,"role": string,"team_ids"?: (string)[],"token_hash": string
                  }
                  Update: {
                    "accepted_at"?: string | null,"accepted_by"?: string | null,"all_teams"?: boolean,"created_at"?: string,"email"?: string,"expires_at"?: string,"id"?: string,"invited_by"?: string | null,"org_id"?: string,"player_id"?: string | null,"revoked_at"?: string | null,"role"?: string,"team_ids"?: (string)[],"token_hash"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "invitations_org_id_fkey"
      columns: ["org_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "invitations_player_id_fkey"
      columns: ["player_id"]
isOneToOne: false
      referencedRelation: "players"
      referencedColumns: ["id"]
    }
                  ]
                },"memberships": {
                  Row: {
                    "all_teams": boolean,"created_at": string,"display_name": string | null,"id": string,"org_id": string,"revoked_at": string | null,"role": string,"status": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "all_teams"?: boolean,"created_at"?: string,"display_name"?: string | null,"id"?: string,"org_id": string,"revoked_at"?: string | null,"role": string,"status"?: string,"user_id": string
                  }
                  Update: {
                    "all_teams"?: boolean,"created_at"?: string,"display_name"?: string | null,"id"?: string,"org_id"?: string,"revoked_at"?: string | null,"role"?: string,"status"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "memberships_org_id_fkey"
      columns: ["org_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    }
                  ]
                },"org_attestations": {
                  Row: {
                    "accepted_at": string,"accepted_by": string | null,"id": string,"kind": string,"org_id": string,"text_version": string
                  }
                  ComputedFields: never
                  Insert: {
                    "accepted_at"?: string,"accepted_by"?: string | null,"id"?: string,"kind": string,"org_id": string,"text_version": string
                  }
                  Update: {
                    "accepted_at"?: string,"accepted_by"?: string | null,"id"?: string,"kind"?: string,"org_id"?: string,"text_version"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "org_attestations_org_id_fkey"
      columns: ["org_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    }
                  ]
                },"organizations": {
                  Row: {
                    "accent_color": string | null,"created_at": string,"created_by": string | null,"deleted_at": string | null,"display_name": string | null,"id": string,"kind": string,"name": string,"retention_days": number,"sport": string
                  }
                  ComputedFields: never
                  Insert: {
                    "accent_color"?: string | null,"created_at"?: string,"created_by"?: string | null,"deleted_at"?: string | null,"display_name"?: string | null,"id"?: string,"kind"?: string,"name": string,"retention_days"?: number,"sport"?: string
                  }
                  Update: {
                    "accent_color"?: string | null,"created_at"?: string,"created_by"?: string | null,"deleted_at"?: string | null,"display_name"?: string | null,"id"?: string,"kind"?: string,"name"?: string,"retention_days"?: number,"sport"?: string
                  }
                  Relationships: [
                    
                  ]
                },"pilot_codes": {
                  Row: {
                    "code_hash": string,"created_at": string,"expires_at": string | null,"max_redemptions": number,"note": string | null,"plan_code": string,"redemptions": number
                  }
                  ComputedFields: never
                  Insert: {
                    "code_hash": string,"created_at"?: string,"expires_at"?: string | null,"max_redemptions"?: number,"note"?: string | null,"plan_code": string,"redemptions"?: number
                  }
                  Update: {
                    "code_hash"?: string,"created_at"?: string,"expires_at"?: string | null,"max_redemptions"?: number,"note"?: string | null,"plan_code"?: string,"redemptions"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "pilot_codes_plan_code_fkey"
      columns: ["plan_code"]
isOneToOne: false
      referencedRelation: "plans"
      referencedColumns: ["code"]
    }
                  ]
                },"plans": {
                  Row: {
                    "analysis_minutes_per_month": number,"code": string,"created_at": string,"description": string,"duration_days": number | null,"max_coaches": number,"max_players": number,"max_teams": number,"name": string,"price_usd_month": number | null,"provisional": boolean,"retained_video_minutes": number,"self_serve": boolean,"stripe_lookup_key": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "analysis_minutes_per_month": number,"code": string,"created_at"?: string,"description"?: string,"duration_days"?: number | null,"max_coaches": number,"max_players": number,"max_teams": number,"name": string,"price_usd_month"?: number | null,"provisional"?: boolean,"retained_video_minutes": number,"self_serve"?: boolean,"stripe_lookup_key"?: string | null
                  }
                  Update: {
                    "analysis_minutes_per_month"?: number,"code"?: string,"created_at"?: string,"description"?: string,"duration_days"?: number | null,"max_coaches"?: number,"max_players"?: number,"max_teams"?: number,"name"?: string,"price_usd_month"?: number | null,"provisional"?: boolean,"retained_video_minutes"?: number,"self_serve"?: boolean,"stripe_lookup_key"?: string | null
                  }
                  Relationships: [
                    
                  ]
                },"platform_operators": {
                  Row: {
                    "created_at": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"user_id": string
                  }
                  Update: {
                    "created_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    
                  ]
                },"players": {
                  Row: {
                    "archived_at": string | null,"bats_throws": string | null,"consent_status": string,"created_at": string,"created_by": string | null,"display_name": string,"id": string,"jersey_number": string | null,"notes": string | null,"org_id": string,"position": string | null,"self_user_id": string | null,"sports": (string)[],"team_id": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "archived_at"?: string | null,"bats_throws"?: string | null,"consent_status"?: string,"created_at"?: string,"created_by"?: string | null,"display_name": string,"id"?: string,"jersey_number"?: string | null,"notes"?: string | null,"org_id": string,"position"?: string | null,"self_user_id"?: string | null,"sports"?: (string)[],"team_id": string,"updated_at"?: string
                  }
                  Update: {
                    "archived_at"?: string | null,"bats_throws"?: string | null,"consent_status"?: string,"created_at"?: string,"created_by"?: string | null,"display_name"?: string,"id"?: string,"jersey_number"?: string | null,"notes"?: string | null,"org_id"?: string,"position"?: string | null,"self_user_id"?: string | null,"sports"?: (string)[],"team_id"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "players_org_id_fkey"
      columns: ["org_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "players_org_id_team_id_fkey"
      columns: ["org_id","team_id"]
isOneToOne: false
      referencedRelation: "teams"
      referencedColumns: ["org_id","id"]
    },{
      foreignKeyName: "players_team_id_fkey"
      columns: ["team_id"]
isOneToOne: false
      referencedRelation: "teams"
      referencedColumns: ["id"]
    }
                  ]
                },"practice_sessions": {
                  Row: {
                    "coach_user_id": string | null,"created_at": string,"created_by": string | null,"drill_type": string,"id": string,"intended_target": string | null,"notes": string | null,"org_id": string,"session_date": string,"team_id": string,"title": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "coach_user_id"?: string | null,"created_at"?: string,"created_by"?: string | null,"drill_type": string,"id"?: string,"intended_target"?: string | null,"notes"?: string | null,"org_id": string,"session_date": string,"team_id": string,"title": string,"updated_at"?: string
                  }
                  Update: {
                    "coach_user_id"?: string | null,"created_at"?: string,"created_by"?: string | null,"drill_type"?: string,"id"?: string,"intended_target"?: string | null,"notes"?: string | null,"org_id"?: string,"session_date"?: string,"team_id"?: string,"title"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "practice_sessions_org_id_fkey"
      columns: ["org_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "practice_sessions_org_id_team_id_fkey"
      columns: ["org_id","team_id"]
isOneToOne: false
      referencedRelation: "teams"
      referencedColumns: ["org_id","id"]
    },{
      foreignKeyName: "practice_sessions_team_id_fkey"
      columns: ["team_id"]
isOneToOne: false
      referencedRelation: "teams"
      referencedColumns: ["id"]
    }
                  ]
                },"processing_jobs": {
                  Row: {
                    "attempts": number,"created_at": string,"error_history": NonNullable<Json>,"fence": number,"finished_at": string | null,"heartbeat_at": string | null,"id": string,"kind": string,"last_error": string | null,"lease_expires_at": string | null,"lease_owner": string | null,"max_attempts": number,"org_id": string,"payload": NonNullable<Json>,"request_kind": string,"requested_by": string | null,"run_after": string,"started_at": string | null,"status": string,"video_id": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "attempts"?: number,"created_at"?: string,"error_history"?: NonNullable<Json>,"fence"?: number,"finished_at"?: string | null,"heartbeat_at"?: string | null,"id"?: string,"kind": string,"last_error"?: string | null,"lease_expires_at"?: string | null,"lease_owner"?: string | null,"max_attempts"?: number,"org_id": string,"payload"?: NonNullable<Json>,"request_kind"?: string,"requested_by"?: string | null,"run_after"?: string,"started_at"?: string | null,"status"?: string,"video_id"?: string | null
                  }
                  Update: {
                    "attempts"?: number,"created_at"?: string,"error_history"?: NonNullable<Json>,"fence"?: number,"finished_at"?: string | null,"heartbeat_at"?: string | null,"id"?: string,"kind"?: string,"last_error"?: string | null,"lease_expires_at"?: string | null,"lease_owner"?: string | null,"max_attempts"?: number,"org_id"?: string,"payload"?: NonNullable<Json>,"request_kind"?: string,"requested_by"?: string | null,"run_after"?: string,"started_at"?: string | null,"status"?: string,"video_id"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "processing_jobs_org_id_fkey"
      columns: ["org_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "processing_jobs_video_id_fkey"
      columns: ["video_id"]
isOneToOne: false
      referencedRelation: "videos"
      referencedColumns: ["id"]
    }
                  ]
                },"rate_limits": {
                  Row: {
                    "hits": number,"key": string,"window_start": string
                  }
                  ComputedFields: never
                  Insert: {
                    "hits"?: number,"key": string,"window_start": string
                  }
                  Update: {
                    "hits"?: number,"key"?: string,"window_start"?: string
                  }
                  Relationships: [
                    
                  ]
                },"reports": {
                  Row: {
                    "approved_at": string,"approved_by": string | null,"coach_feedback": string | null,"created_at": string,"generation": number,"id": string,"org_id": string,"player_id": string,"published_at": string | null,"published_by": string | null,"review_kind": string,"run_id": string | null,"snapshot": NonNullable<Json>,"status": string,"team_id": string,"version": number,"video_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "approved_at"?: string,"approved_by"?: string | null,"coach_feedback"?: string | null,"created_at"?: string,"generation": number,"id"?: string,"org_id": string,"player_id": string,"published_at"?: string | null,"published_by"?: string | null,"review_kind"?: string,"run_id"?: string | null,"snapshot": NonNullable<Json>,"status": string,"team_id": string,"version": number,"video_id": string
                  }
                  Update: {
                    "approved_at"?: string,"approved_by"?: string | null,"coach_feedback"?: string | null,"created_at"?: string,"generation"?: number,"id"?: string,"org_id"?: string,"player_id"?: string,"published_at"?: string | null,"published_by"?: string | null,"review_kind"?: string,"run_id"?: string | null,"snapshot"?: NonNullable<Json>,"status"?: string,"team_id"?: string,"version"?: number,"video_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "reports_org_id_fkey"
      columns: ["org_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "reports_player_id_fkey"
      columns: ["player_id"]
isOneToOne: false
      referencedRelation: "players"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "reports_run_id_fkey"
      columns: ["run_id"]
isOneToOne: false
      referencedRelation: "analysis_runs"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "reports_team_id_fkey"
      columns: ["team_id"]
isOneToOne: false
      referencedRelation: "teams"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "reports_video_id_fkey"
      columns: ["video_id"]
isOneToOne: false
      referencedRelation: "videos"
      referencedColumns: ["id"]
    }
                  ]
                },"review_items": {
                  Row: {
                    "activity_label": string,"coach_note": string | null,"created_at": string,"end_s": number,"event_type": string,"generation": number,"id": string,"included": boolean,"org_id": string,"origin": string,"origin_event_id": string | null,"outcome": string | null,"outcome_source": string | null,"start_s": number,"updated_at": string,"updated_by": string | null,"video_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "activity_label"?: string,"coach_note"?: string | null,"created_at"?: string,"end_s": number,"event_type": string,"generation": number,"id"?: string,"included"?: boolean,"org_id": string,"origin": string,"origin_event_id"?: string | null,"outcome"?: string | null,"outcome_source"?: string | null,"start_s": number,"updated_at"?: string,"updated_by"?: string | null,"video_id": string
                  }
                  Update: {
                    "activity_label"?: string,"coach_note"?: string | null,"created_at"?: string,"end_s"?: number,"event_type"?: string,"generation"?: number,"id"?: string,"included"?: boolean,"org_id"?: string,"origin"?: string,"origin_event_id"?: string | null,"outcome"?: string | null,"outcome_source"?: string | null,"start_s"?: number,"updated_at"?: string,"updated_by"?: string | null,"video_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "review_items_org_id_fkey"
      columns: ["org_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "review_items_origin_event_id_fkey"
      columns: ["origin_event_id"]
isOneToOne: false
      referencedRelation: "detected_events"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "review_items_video_id_fkey"
      columns: ["video_id"]
isOneToOne: false
      referencedRelation: "videos"
      referencedColumns: ["id"]
    }
                  ]
                },"review_observations": {
                  Row: {
                    "created_at": string,"evidence": string | null,"generation": number,"id": string,"included": boolean,"org_id": string,"origin": string,"origin_observation_id": string | null,"t_end_s": number,"t_start_s": number,"text": string,"updated_at": string,"updated_by": string | null,"video_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"evidence"?: string | null,"generation": number,"id"?: string,"included"?: boolean,"org_id": string,"origin": string,"origin_observation_id"?: string | null,"t_end_s": number,"t_start_s": number,"text": string,"updated_at"?: string,"updated_by"?: string | null,"video_id": string
                  }
                  Update: {
                    "created_at"?: string,"evidence"?: string | null,"generation"?: number,"id"?: string,"included"?: boolean,"org_id"?: string,"origin"?: string,"origin_observation_id"?: string | null,"t_end_s"?: number,"t_start_s"?: number,"text"?: string,"updated_at"?: string,"updated_by"?: string | null,"video_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "review_observations_org_id_fkey"
      columns: ["org_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "review_observations_origin_observation_id_fkey"
      columns: ["origin_observation_id"]
isOneToOne: false
      referencedRelation: "draft_observations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "review_observations_video_id_fkey"
      columns: ["video_id"]
isOneToOne: false
      referencedRelation: "videos"
      referencedColumns: ["id"]
    }
                  ]
                },"roster_entries": {
                  Row: {
                    "created_by": string | null,"ended_at": string | null,"id": string,"org_id": string,"player_id": string,"season_id": string | null,"started_at": string,"team_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_by"?: string | null,"ended_at"?: string | null,"id"?: string,"org_id": string,"player_id": string,"season_id"?: string | null,"started_at"?: string,"team_id": string
                  }
                  Update: {
                    "created_by"?: string | null,"ended_at"?: string | null,"id"?: string,"org_id"?: string,"player_id"?: string,"season_id"?: string | null,"started_at"?: string,"team_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "roster_entries_org_id_fkey"
      columns: ["org_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "roster_entries_player_id_fkey"
      columns: ["player_id"]
isOneToOne: false
      referencedRelation: "players"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "roster_entries_season_id_fkey"
      columns: ["season_id"]
isOneToOne: false
      referencedRelation: "seasons"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "roster_entries_team_id_fkey"
      columns: ["team_id"]
isOneToOne: false
      referencedRelation: "teams"
      referencedColumns: ["id"]
    }
                  ]
                },"seasons": {
                  Row: {
                    "created_at": string,"ends_on": string | null,"id": string,"name": string,"org_id": string,"starts_on": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"ends_on"?: string | null,"id"?: string,"name": string,"org_id": string,"starts_on"?: string | null
                  }
                  Update: {
                    "created_at"?: string,"ends_on"?: string | null,"id"?: string,"name"?: string,"org_id"?: string,"starts_on"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "seasons_org_id_fkey"
      columns: ["org_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    }
                  ]
                },"stripe_events": {
                  Row: {
                    "id": string,"outcome": string | null,"processed_at": string | null,"received_at": string,"type": string
                  }
                  ComputedFields: never
                  Insert: {
                    "id": string,"outcome"?: string | null,"processed_at"?: string | null,"received_at"?: string,"type": string
                  }
                  Update: {
                    "id"?: string,"outcome"?: string | null,"processed_at"?: string | null,"received_at"?: string,"type"?: string
                  }
                  Relationships: [
                    
                  ]
                },"subscriptions": {
                  Row: {
                    "cancel_at_period_end": boolean,"current_period_end": string | null,"org_id": string,"plan_code": string | null,"price_id": string | null,"status": string | null,"stripe_customer_id": string | null,"stripe_subscription_id": string | null,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "cancel_at_period_end"?: boolean,"current_period_end"?: string | null,"org_id": string,"plan_code"?: string | null,"price_id"?: string | null,"status"?: string | null,"stripe_customer_id"?: string | null,"stripe_subscription_id"?: string | null,"updated_at"?: string
                  }
                  Update: {
                    "cancel_at_period_end"?: boolean,"current_period_end"?: string | null,"org_id"?: string,"plan_code"?: string | null,"price_id"?: string | null,"status"?: string | null,"stripe_customer_id"?: string | null,"stripe_subscription_id"?: string | null,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "subscriptions_org_id_fkey"
      columns: ["org_id"]
isOneToOne: true
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "subscriptions_plan_code_fkey"
      columns: ["plan_code"]
isOneToOne: false
      referencedRelation: "plans"
      referencedColumns: ["code"]
    }
                  ]
                },"team_assignments": {
                  Row: {
                    "created_at": string,"membership_id": string,"org_id": string,"team_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"membership_id": string,"org_id": string,"team_id": string
                  }
                  Update: {
                    "created_at"?: string,"membership_id"?: string,"org_id"?: string,"team_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "team_assignments_membership_id_fkey"
      columns: ["membership_id"]
isOneToOne: false
      referencedRelation: "memberships"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "team_assignments_org_id_fkey"
      columns: ["org_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "team_assignments_team_id_fkey"
      columns: ["team_id"]
isOneToOne: false
      referencedRelation: "teams"
      referencedColumns: ["id"]
    }
                  ]
                },"teams": {
                  Row: {
                    "archived_at": string | null,"created_at": string,"id": string,"name": string,"org_id": string,"sport": string
                  }
                  ComputedFields: never
                  Insert: {
                    "archived_at"?: string | null,"created_at"?: string,"id"?: string,"name": string,"org_id": string,"sport"?: string
                  }
                  Update: {
                    "archived_at"?: string | null,"created_at"?: string,"id"?: string,"name"?: string,"org_id"?: string,"sport"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "teams_org_id_fkey"
      columns: ["org_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    }
                  ]
                },"usage_events": {
                  Row: {
                    "cache_read_tokens": number | null,"created_at": string,"customer_billable": boolean,"details": NonNullable<Json>,"estimated_cost_usd": number | null,"id": string,"idempotency_key": string,"input_tokens": number | null,"job_id": string | null,"kind": string,"model": string | null,"org_id": string,"output_tokens": number | null,"quantity": number,"run_id": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "cache_read_tokens"?: number | null,"created_at"?: string,"customer_billable"?: boolean,"details"?: NonNullable<Json>,"estimated_cost_usd"?: number | null,"id"?: string,"idempotency_key": string,"input_tokens"?: number | null,"job_id"?: string | null,"kind": string,"model"?: string | null,"org_id": string,"output_tokens"?: number | null,"quantity"?: number,"run_id"?: string | null
                  }
                  Update: {
                    "cache_read_tokens"?: number | null,"created_at"?: string,"customer_billable"?: boolean,"details"?: NonNullable<Json>,"estimated_cost_usd"?: number | null,"id"?: string,"idempotency_key"?: string,"input_tokens"?: number | null,"job_id"?: string | null,"kind"?: string,"model"?: string | null,"org_id"?: string,"output_tokens"?: number | null,"quantity"?: number,"run_id"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "usage_events_job_id_fkey"
      columns: ["job_id"]
isOneToOne: false
      referencedRelation: "processing_jobs"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "usage_events_org_id_fkey"
      columns: ["org_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    }
                  ]
                },"usage_reservations": {
                  Row: {
                    "created_at": string,"id": string,"job_id": string,"org_id": string,"period_start": string,"resolved_at": string | null,"seconds_reserved": number,"seconds_settled": number | null,"status": string,"video_id": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"id"?: string,"job_id": string,"org_id": string,"period_start": string,"resolved_at"?: string | null,"seconds_reserved": number,"seconds_settled"?: number | null,"status"?: string,"video_id"?: string | null
                  }
                  Update: {
                    "created_at"?: string,"id"?: string,"job_id"?: string,"org_id"?: string,"period_start"?: string,"resolved_at"?: string | null,"seconds_reserved"?: number,"seconds_settled"?: number | null,"status"?: string,"video_id"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "usage_reservations_job_id_fkey"
      columns: ["job_id"]
isOneToOne: true
      referencedRelation: "processing_jobs"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "usage_reservations_org_id_fkey"
      columns: ["org_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "usage_reservations_video_id_fkey"
      columns: ["video_id"]
isOneToOne: false
      referencedRelation: "videos"
      referencedColumns: ["id"]
    }
                  ]
                },"videos": {
                  Row: {
                    "attribution_confirmed_at": string | null,"attribution_confirmed_by": string | null,"container_ext": string,"created_at": string,"current_generation": number,"declared_size_bytes": number,"deleted_at": string | null,"deleted_by": string | null,"display_height": number | null,"display_width": number | null,"drill_type": string,"duration_s": number | null,"fps": number | null,"has_audio": boolean | null,"height": number | null,"id": string,"intended_target": string | null,"org_id": string,"original_filename": string | null,"pitch_type": string | null,"player_id": string | null,"preview_path": string | null,"probe": Json | null,"purged_at": string | null,"rejection_reason": string | null,"rotation": number | null,"session_id": string | null,"sha256": string | null,"shared_with_athlete": boolean,"size_bytes": number | null,"source_device_label": string | null,"status": string,"status_detail": string | null,"storage_path": string,"team_id": string,"updated_at": string,"upload_status": string,"uploaded_by": string | null,"video_codec": string | null,"width": number | null
                  }
                  ComputedFields: never
                  Insert: {
                    "attribution_confirmed_at"?: string | null,"attribution_confirmed_by"?: string | null,"container_ext": string,"created_at"?: string,"current_generation"?: number,"declared_size_bytes": number,"deleted_at"?: string | null,"deleted_by"?: string | null,"display_height"?: number | null,"display_width"?: number | null,"drill_type": string,"duration_s"?: number | null,"fps"?: number | null,"has_audio"?: boolean | null,"height"?: number | null,"id"?: string,"intended_target"?: string | null,"org_id": string,"original_filename"?: string | null,"pitch_type"?: string | null,"player_id"?: string | null,"preview_path"?: string | null,"probe"?: Json | null,"purged_at"?: string | null,"rejection_reason"?: string | null,"rotation"?: number | null,"session_id"?: string | null,"sha256"?: string | null,"shared_with_athlete"?: boolean,"size_bytes"?: number | null,"source_device_label"?: string | null,"status"?: string,"status_detail"?: string | null,"storage_path": string,"team_id": string,"updated_at"?: string,"upload_status"?: string,"uploaded_by"?: string | null,"video_codec"?: string | null,"width"?: number | null
                  }
                  Update: {
                    "attribution_confirmed_at"?: string | null,"attribution_confirmed_by"?: string | null,"container_ext"?: string,"created_at"?: string,"current_generation"?: number,"declared_size_bytes"?: number,"deleted_at"?: string | null,"deleted_by"?: string | null,"display_height"?: number | null,"display_width"?: number | null,"drill_type"?: string,"duration_s"?: number | null,"fps"?: number | null,"has_audio"?: boolean | null,"height"?: number | null,"id"?: string,"intended_target"?: string | null,"org_id"?: string,"original_filename"?: string | null,"pitch_type"?: string | null,"player_id"?: string | null,"preview_path"?: string | null,"probe"?: Json | null,"purged_at"?: string | null,"rejection_reason"?: string | null,"rotation"?: number | null,"session_id"?: string | null,"sha256"?: string | null,"shared_with_athlete"?: boolean,"size_bytes"?: number | null,"source_device_label"?: string | null,"status"?: string,"status_detail"?: string | null,"storage_path"?: string,"team_id"?: string,"updated_at"?: string,"upload_status"?: string,"uploaded_by"?: string | null,"video_codec"?: string | null,"width"?: number | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "videos_org_id_fkey"
      columns: ["org_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "videos_org_id_team_id_fkey"
      columns: ["org_id","team_id"]
isOneToOne: false
      referencedRelation: "teams"
      referencedColumns: ["org_id","id"]
    },{
      foreignKeyName: "videos_player_id_fkey"
      columns: ["player_id"]
isOneToOne: false
      referencedRelation: "players"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "videos_session_id_fkey"
      columns: ["session_id"]
isOneToOne: false
      referencedRelation: "practice_sessions"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "videos_team_id_fkey"
      columns: ["team_id"]
isOneToOne: false
      referencedRelation: "teams"
      referencedColumns: ["id"]
    }
                  ]
                },"worker_heartbeats": {
                  Row: {
                    "capabilities": NonNullable<Json>,"last_seen_at": string,"version": string | null,"worker_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "capabilities"?: NonNullable<Json>,"last_seen_at"?: string,"version"?: string | null,"worker_id": string
                  }
                  Update: {
                    "capabilities"?: NonNullable<Json>,"last_seen_at"?: string,"version"?: string | null,"worker_id"?: string
                  }
                  Relationships: [
                    
                  ]
                }
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "accept_invitation":
{ Args: { "p_token": string }; Returns: string
                           },
"activate_evaluation":
{ Args: { "p_org": string }; Returns: undefined
                           },
"add_to_roster":
{ Args: { "p_player": string,"p_season"?: string,"p_team": string }; Returns: string
                           },
"analysis_available":
{ Args: Record<PropertyKey, never>; Returns: boolean
                           },
"approve_review":
{ Args: { "p_feedback": string,"p_video": string }; Returns: string
                           },
"cancel_analysis":
{ Args: { "p_video": string }; Returns: undefined
                           },
"claim_job":
{ Args: { "p_kinds": (string)[],"p_lease_seconds"?: number,"p_worker": string }; Returns: Json
                           },
"complete_analysis":
{ Args: { "p_fence": number,"p_job": string,"p_result": Json }; Returns: string
                           },
"complete_probe":
{ Args: { "p_fence": number,"p_job": string,"p_meta": Json,"p_ok": boolean,"p_preview_path"?: string,"p_reason": string }; Returns: string
                           },
"complete_purge":
{ Args: { "p_fence": number,"p_job": string,"p_objects_removed": number }; Returns: string
                           },
"confirm_attribution":
{ Args: { "p_video": string }; Returns: undefined
                           },
"create_invitation":
{ Args: { "p_all_teams"?: boolean,"p_email": string,"p_org": string,"p_player"?: string,"p_role": string,"p_team_ids"?: (string)[] }; Returns: {
              "expires_at": string,"invitation_id": string,"token": string
            }[]
                           },
"create_organization":
{ Args: { "p_display_name"?: string,"p_name": string,"p_notice_accepted": boolean,"p_recording_attested": boolean,"p_sport": string,"p_team_name": string }; Returns: string
                           },
"create_personal_workspace":
{ Args: { "p_adult_confirmed": boolean,"p_display_name": string,"p_goal"?: string,"p_notice_accepted": boolean,"p_recording_attested": boolean,"p_sports": (string)[] }; Returns: string
                           },
"create_season":
{ Args: { "p_ends_on"?: string,"p_name": string,"p_org": string,"p_starts_on"?: string }; Returns: string
                           },
"create_team":
{ Args: { "p_name": string,"p_org": string,"p_sport"?: string }; Returns: string
                           },
"create_video_upload":
{ Args: { "p_container_ext": string,"p_device_label"?: string,"p_drill_type": string,"p_filename": string,"p_intended_target"?: string,"p_pitch_type"?: string,"p_player"?: string,"p_session"?: string,"p_size_bytes": number,"p_team": string,"p_unassigned"?: boolean }; Returns: {
              "storage_path": string,"video_id": string
            }[]
                           },
"delete_my_account":
{ Args: { "p_confirm_email": string }; Returns: Json
                           },
"delete_organization":
{ Args: { "p_confirm_name": string,"p_org": string }; Returns: undefined
                           },
"delete_video":
{ Args: { "p_video": string }; Returns: undefined
                           },
"end_roster_entry":
{ Args: { "p_entry": string }; Returns: undefined
                           },
"enqueue_retention_purges":
{ Args: Record<PropertyKey, never>; Returns: number
                           },
"export_organization":
{ Args: { "p_org": string }; Returns: Json
                           },
"fail_job":
{ Args: { "p_error": string,"p_fence": number,"p_job": string,"p_retryable": boolean,"p_user_message"?: string }; Returns: string
                           },
"finalize_deleted_organizations":
{ Args: Record<PropertyKey, never>; Returns: number
                           },
"finalize_video_upload":
{ Args: { "p_video": string }; Returns: Json
                           },
"get_invitation_preview":
{ Args: { "p_token": string }; Returns: {
              "email_matches": boolean,"organization_name": string,"role": string,"state": string
            }[]
                           },
"get_usage_summary":
{ Args: { "p_org": string }; Returns: Json
                           },
"heartbeat_job":
{ Args: { "p_fence": number,"p_job": string,"p_lease_seconds"?: number }; Returns: boolean
                           },
"list_org_members":
{ Args: { "p_org": string }; Returns: {
              "all_teams": boolean,"created_at": string,"display_name": string,"email": string,"membership_id": string,"role": string,"status": string,"team_ids": (string)[],"user_id": string
            }[]
                           },
"ops_overview":
{ Args: Record<PropertyKey, never>; Returns: Json
                           },
"publish_report":
{ Args: { "p_video": string }; Returns: string
                           },
"record_provider_call":
{ Args: { "p_call": Json,"p_fence": number,"p_job": string }; Returns: undefined
                           },
"redeem_pilot_code":
{ Args: { "p_code": string,"p_org": string }; Returns: string
                           },
"remove_member":
{ Args: { "p_membership": string }; Returns: undefined
                           },
"request_analysis":
{ Args: { "p_end_s": number,"p_start_s": number,"p_video": string }; Returns: string
                           },
"retract_report":
{ Args: { "p_video": string }; Returns: undefined
                           },
"review_delete_item":
{ Args: { "p_item": string }; Returns: undefined
                           },
"review_delete_observation":
{ Args: { "p_observation": string }; Returns: undefined
                           },
"review_merge_items":
{ Args: { "p_a": string,"p_b": string }; Returns: string
                           },
"review_split_item":
{ Args: { "p_at_s": number,"p_item": string }; Returns: string
                           },
"review_upsert_item":
{ Args: { "p_activity_label": string,"p_coach_note": string,"p_end_s": number,"p_event_type": string,"p_included": boolean,"p_item": string,"p_outcome": string,"p_start_s": number,"p_video": string }; Returns: string
                           },
"review_upsert_observation":
{ Args: { "p_included": boolean,"p_observation": string,"p_t_end_s": number,"p_t_start_s": number,"p_text": string,"p_video": string }; Returns: string
                           },
"revoke_athlete_link":
{ Args: { "p_link": string }; Returns: undefined
                           },
"revoke_coach_access":
{ Args: { "p_membership": string }; Returns: undefined
                           },
"revoke_invitation":
{ Args: { "p_invitation": string }; Returns: undefined
                           },
"set_member_teams":
{ Args: { "p_all_teams": boolean,"p_membership": string,"p_team_ids": (string)[] }; Returns: undefined
                           },
"update_video_details":
{ Args: { "p_device_label": string,"p_drill_type": string,"p_intended_target": string,"p_pitch_type": string,"p_player": string,"p_session": string,"p_shared_with_athlete": boolean,"p_video": string }; Returns: undefined
                           },
"upsert_goal":
{ Args: { "p_goal": string,"p_player": string,"p_sport": string,"p_status"?: string,"p_target_date"?: string,"p_text": string }; Returns: string
                           },
"worker_heartbeat":
{ Args: { "p_capabilities": Json,"p_version": string,"p_worker": string }; Returns: undefined
                           }
          }
          Enums: {
            [_ in never]: never
          }
          CompositeTypes: {
            [_ in never]: never
          }
        }
}

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
  ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
      Row: infer R
    }
    ? R
    : never
  : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
  ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
      Insert: infer I
    }
    ? I
    : never
  : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
  ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
      Update: infer U
    }
    ? U
    : never
  : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
  ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
  : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
  ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
  : never

export const Constants = {
  "graphql_public": {
          Enums: {
            
          }
        },"public": {
          Enums: {
            
          }
        }
} as const
