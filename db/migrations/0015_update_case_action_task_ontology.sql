alter table public.case_action_tasks
  add column if not exists actor text not null default 'case_team';

alter table public.case_action_tasks
  drop constraint if exists case_action_tasks_kind_check;

update public.case_action_tasks
set kind = case
  when kind = 'collect_information' then 'request_information'
  when kind = 'draft_artifact' then 'prepare_draft'
  when kind = 'update_artifact' then 'prepare_draft'
  when kind = 'file_document' then 'file_or_submit'
  when kind = 'contact_party' then 'request_information'
  when kind = 'review_legal_call' then 'mark_for_case_team_review'
  else kind
end;

update public.case_action_tasks
set
  title = case
    when connector_hint = 'run_source_support_sweep' then 'Verify source evidence'
    when connector_hint = 'work_current_review_item' then 'Mark for case team review'
    when connector_hint = 'review_high_roi_batch' then 'Mark related issues for case team review'
    else title
  end,
  connector_hint = case
    when connector_hint = 'run_source_support_sweep' then 'verify_source_evidence_batch'
    when connector_hint = 'work_current_review_item' then 'mark_for_case_team_review'
    when connector_hint = 'review_high_roi_batch' then 'mark_related_items_for_case_team_review'
    else connector_hint
  end,
  updated_at = now()
where connector_hint in (
  'run_source_support_sweep',
  'work_current_review_item',
  'review_high_roi_batch'
);

alter table public.case_action_tasks
  add constraint case_action_tasks_kind_check check (
    kind in (
      'request_information',
      'request_document',
      'notify_client',
      'verify_source',
      'mark_for_case_team_review',
      'prepare_draft',
      'prepare_redline',
      'update_checklist',
      'calendar_deadline',
      'calculate_amount',
      'record_time',
      'file_or_submit',
      'dismiss_review_item'
    )
  );

alter table public.case_action_tasks
  drop constraint if exists case_action_tasks_actor_check;

alter table public.case_action_tasks
  add constraint case_action_tasks_actor_check check (
    actor in (
      'client',
      'case_team',
      'court_or_agency',
      'counterparty',
      'third_party',
      'system'
    )
  );
