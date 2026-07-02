create table if not exists daily_scorecards (
  score_date date primary key,
  payload jsonb not null default '{"sets":[]}'::jsonb,
  settled_at timestamptz,
  updated_at timestamptz not null default now()
);

create index if not exists daily_scorecards_updated_at_idx
  on daily_scorecards (updated_at desc);
