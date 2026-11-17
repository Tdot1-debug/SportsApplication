-- "Any movement" template: the coach names the movement and what counts as one rep (stored in intended_target),
-- and the analysis counts repetitions of that movement. Outcomes do not apply, exactly like the gym test.
alter table public.videos drop constraint if exists videos_drill_type_check;
alter table public.videos add constraint videos_drill_type_check
  check (drill_type in ('gym_test','general_movement','softball_hitting','softball_pitching','other'));
alter table public.practice_sessions drop constraint if exists practice_sessions_drill_type_check;
alter table public.practice_sessions add constraint practice_sessions_drill_type_check
  check (drill_type in ('gym_test','general_movement','softball_hitting','softball_pitching','other'));
