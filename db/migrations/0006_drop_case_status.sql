alter table if exists public.cases
  drop constraint if exists cases_status_check,
  drop column if exists status;
