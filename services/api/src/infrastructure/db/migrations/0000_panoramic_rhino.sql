CREATE EXTENSION IF NOT EXISTS vector;
--> statement-breakpoint
CREATE TYPE "public"."availability" AS ENUM('AVAILABLE', 'BUSY', 'OFF_SHIFT', 'ON_LEAVE');--> statement-breakpoint
CREATE TYPE "public"."closure_reason" AS ENUM('RESOLVED', 'DUPLICATE');--> statement-breakpoint
CREATE TYPE "public"."escalation_level" AS ENUM('TECHNICIAN', 'TEAM_LEAD', 'SYS_ADMIN', 'IT_MANAGER');--> statement-breakpoint
CREATE TYPE "public"."incident_status" AS ENUM('NEW', 'CLASSIFIED', 'ASSIGNED', 'ACKNOWLEDGED', 'IN_PROGRESS', 'PENDING_INFO', 'RESOLVED', 'VERIFIED', 'CLOSED', 'REOPENED');--> statement-breakpoint
CREATE TYPE "public"."priority" AS ENUM('P1', 'P2', 'P3', 'P4');--> statement-breakpoint
CREATE TYPE "public"."role" AS ENUM('EMPLOYEE', 'TECHNICIAN', 'TEAM_LEAD', 'ADMIN', 'IT_MANAGER');--> statement-breakpoint
CREATE TYPE "public"."sla_kind" AS ENUM('RESPONSE', 'RESOLUTION');--> statement-breakpoint
CREATE SEQUENCE "public"."incident_number_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1;--> statement-breakpoint
CREATE TABLE "categories" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"required_skill" text NOT NULL,
	"active" boolean NOT NULL,
	CONSTRAINT "categories_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "it_services" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"name" text NOT NULL,
	"description" text NOT NULL,
	"criticality" smallint NOT NULL,
	"active" boolean NOT NULL,
	CONSTRAINT "it_services_name_unique" UNIQUE("name"),
	CONSTRAINT "it_services_criticality_check" CHECK ("it_services"."criticality" between 1 and 4)
);
--> statement-breakpoint
CREATE TABLE "team_members" (
	"team_lead_id" uuid NOT NULL,
	"member_id" uuid NOT NULL,
	CONSTRAINT "team_members_team_lead_id_member_id_pk" PRIMARY KEY("team_lead_id","member_id"),
	CONSTRAINT "team_members_distinct_check" CHECK ("team_members"."team_lead_id" <> "team_members"."member_id")
);
--> statement-breakpoint
CREATE TABLE "technician_service_history" (
	"user_id" uuid NOT NULL,
	"service_id" uuid NOT NULL,
	"resolved_count" integer NOT NULL,
	CONSTRAINT "technician_service_history_user_id_service_id_pk" PRIMARY KEY("user_id","service_id")
);
--> statement-breakpoint
CREATE TABLE "technician_skills" (
	"user_id" uuid NOT NULL,
	"skill" text NOT NULL,
	CONSTRAINT "technician_skills_user_id_skill_pk" PRIMARY KEY("user_id","skill")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"password_hash" text NOT NULL,
	"role" "role" NOT NULL,
	"active" boolean NOT NULL,
	"department" text,
	"max_active_incidents" integer,
	"availability" "availability",
	"experience_years" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email"),
	CONSTRAINT "users_email_lowercase_check" CHECK ("users"."email" = lower("users"."email"))
);
--> statement-breakpoint
CREATE TABLE "sla_policies" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"name" text NOT NULL,
	"service_id" uuid,
	"warning_ratio" numeric NOT NULL,
	CONSTRAINT "sla_policies_service_id_unique" UNIQUE("service_id"),
	CONSTRAINT "sla_policies_warning_ratio_check" CHECK ("sla_policies"."warning_ratio" > 0 and "sla_policies"."warning_ratio" < 1)
);
--> statement-breakpoint
CREATE TABLE "sla_targets" (
	"policy_id" uuid NOT NULL,
	"priority" "priority" NOT NULL,
	"response_ms" bigint NOT NULL,
	"resolution_ms" bigint NOT NULL,
	CONSTRAINT "sla_targets_policy_id_priority_pk" PRIMARY KEY("policy_id","priority"),
	CONSTRAINT "sla_targets_order_check" CHECK ("sla_targets"."response_ms" <= "sla_targets"."resolution_ms")
);
--> statement-breakpoint
CREATE TABLE "incidents" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"number" text NOT NULL,
	"title" text NOT NULL,
	"description" text NOT NULL,
	"reporter_id" uuid NOT NULL,
	"service_id" uuid NOT NULL,
	"category_id" uuid,
	"impact" smallint NOT NULL,
	"urgency" smallint NOT NULL,
	"affected_users" integer NOT NULL,
	"priority" "priority",
	"status" "incident_status" NOT NULL,
	"assignee_id" uuid,
	"duplicate_of_id" uuid,
	"reopen_count" integer DEFAULT 0 NOT NULL,
	"escalation_level" "escalation_level" NOT NULL,
	"assigned_at" timestamp with time zone,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"version" integer DEFAULT 0 NOT NULL,
	"resolution_summary" text,
	"resolution_root_cause" text,
	"resolution_resolved_by" uuid,
	"resolution_resolved_at" timestamp with time zone,
	"feedback_rating" integer,
	"feedback_comment" text,
	"feedback_at" timestamp with time zone,
	"closure_reason" "closure_reason",
	"closure_closed_by" uuid,
	"closure_at" timestamp with time zone,
	"sla_started_at" timestamp with time zone,
	"sla_response_ms" bigint,
	"sla_resolution_ms" bigint,
	"sla_warning_ratio" numeric,
	"sla_responded_at" timestamp with time zone,
	"sla_resolved_at" timestamp with time zone,
	"sla_paused_since" timestamp with time zone,
	"sla_paused_total_ms" bigint,
	"sla_warned" "sla_kind"[],
	"sla_breached" "sla_kind"[],
	"embedding" vector(384),
	"search" "tsvector" GENERATED ALWAYS AS (to_tsvector('english', title || ' ' || description)) STORED,
	CONSTRAINT "incidents_number_unique" UNIQUE("number"),
	CONSTRAINT "incidents_impact_check" CHECK ("incidents"."impact" between 1 and 4),
	CONSTRAINT "incidents_urgency_check" CHECK ("incidents"."urgency" between 1 and 4)
);
--> statement-breakpoint
CREATE TABLE "info_requests" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"incident_id" uuid NOT NULL,
	"question" text NOT NULL,
	"asked_by" uuid,
	"asked_at" timestamp with time zone NOT NULL,
	"answer" text,
	"answered_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "investigation_notes" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"incident_id" uuid NOT NULL,
	"author_id" uuid,
	"text" text NOT NULL,
	"at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_records" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"at" timestamp with time zone NOT NULL,
	"actor_id" uuid,
	"action" text NOT NULL,
	"incident_id" uuid NOT NULL,
	"from_status" text,
	"to_status" text,
	"description" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "team_members" ADD CONSTRAINT "team_members_team_lead_id_users_id_fk" FOREIGN KEY ("team_lead_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_members" ADD CONSTRAINT "team_members_member_id_users_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "technician_service_history" ADD CONSTRAINT "technician_service_history_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "technician_service_history" ADD CONSTRAINT "technician_service_history_service_id_it_services_id_fk" FOREIGN KEY ("service_id") REFERENCES "public"."it_services"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "technician_skills" ADD CONSTRAINT "technician_skills_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sla_policies" ADD CONSTRAINT "sla_policies_service_id_it_services_id_fk" FOREIGN KEY ("service_id") REFERENCES "public"."it_services"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sla_targets" ADD CONSTRAINT "sla_targets_policy_id_sla_policies_id_fk" FOREIGN KEY ("policy_id") REFERENCES "public"."sla_policies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "incidents" ADD CONSTRAINT "incidents_reporter_id_users_id_fk" FOREIGN KEY ("reporter_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "incidents" ADD CONSTRAINT "incidents_service_id_it_services_id_fk" FOREIGN KEY ("service_id") REFERENCES "public"."it_services"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "incidents" ADD CONSTRAINT "incidents_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "incidents" ADD CONSTRAINT "incidents_assignee_id_users_id_fk" FOREIGN KEY ("assignee_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "incidents" ADD CONSTRAINT "incidents_duplicate_of_id_incidents_id_fk" FOREIGN KEY ("duplicate_of_id") REFERENCES "public"."incidents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "incidents" ADD CONSTRAINT "incidents_resolution_resolved_by_users_id_fk" FOREIGN KEY ("resolution_resolved_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "incidents" ADD CONSTRAINT "incidents_closure_closed_by_users_id_fk" FOREIGN KEY ("closure_closed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "info_requests" ADD CONSTRAINT "info_requests_incident_id_incidents_id_fk" FOREIGN KEY ("incident_id") REFERENCES "public"."incidents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "info_requests" ADD CONSTRAINT "info_requests_asked_by_users_id_fk" FOREIGN KEY ("asked_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "investigation_notes" ADD CONSTRAINT "investigation_notes_incident_id_incidents_id_fk" FOREIGN KEY ("incident_id") REFERENCES "public"."incidents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "investigation_notes" ADD CONSTRAINT "investigation_notes_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_records" ADD CONSTRAINT "audit_records_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_records" ADD CONSTRAINT "audit_records_incident_id_incidents_id_fk" FOREIGN KEY ("incident_id") REFERENCES "public"."incidents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "sla_policies_default_unique" ON "sla_policies" USING btree ((1)) WHERE "sla_policies"."service_id" is null;--> statement-breakpoint
CREATE INDEX "incidents_status_idx" ON "incidents" USING btree ("status");--> statement-breakpoint
CREATE INDEX "incidents_priority_idx" ON "incidents" USING btree ("priority");--> statement-breakpoint
CREATE INDEX "incidents_service_id_idx" ON "incidents" USING btree ("service_id");--> statement-breakpoint
CREATE INDEX "incidents_assignee_id_idx" ON "incidents" USING btree ("assignee_id");--> statement-breakpoint
CREATE INDEX "incidents_created_at_idx" ON "incidents" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "incidents_search_idx" ON "incidents" USING gin ("search");--> statement-breakpoint
CREATE INDEX "incidents_embedding_idx" ON "incidents" USING hnsw ("embedding" vector_cosine_ops);--> statement-breakpoint
CREATE INDEX "investigation_notes_incident_at_idx" ON "investigation_notes" USING btree ("incident_id","at");--> statement-breakpoint
CREATE INDEX "audit_records_incident_at_idx" ON "audit_records" USING btree ("incident_id","at");