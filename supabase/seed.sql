-- LOCAL DEVELOPMENT ONLY. Applied by `supabase db reset`; never run this against production.
-- A founding-pilot access code for trying the pilot flow locally: LOCAL-PILOT-2026
insert into public.pilot_codes (code_hash, plan_code, max_redemptions, note)
values (encode(extensions.digest('LOCAL-PILOT-2026', 'sha256'), 'hex'), 'founding_pilot', 100, 'Local development code')
on conflict do nothing;
