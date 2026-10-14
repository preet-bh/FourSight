alter table public.reports
  add column reporter_latitude double precision,
  add column reporter_longitude double precision,
  add column reporter_accuracy_meters double precision,
  add constraint reports_reporter_location_check check (
    (reporter_latitude is null and reporter_longitude is null and reporter_accuracy_meters is null)
    or (
      reporter_latitude between -90 and 90
      and reporter_longitude between -180 and 180
      and reporter_accuracy_meters > 0
      and reporter_accuracy_meters <= 100
    )
  );

-- Keep these campus/radius values synchronized with src/ui/campus-config.ts.
create or replace function public.validate_reporter_campus_location()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  distance_meters double precision;
begin
  if new.reporter_latitude is null
    or new.reporter_longitude is null
    or new.reporter_accuracy_meters is null
    or new.reporter_latitude not between -90 and 90
    or new.reporter_longitude not between -180 and 180
    or new.reporter_accuracy_meters <= 0
    or new.reporter_accuracy_meters > 100 then
    raise exception using
      errcode = '42501',
      message = 'A valid location with accuracy of 100 meters or better is required to report an issue.';
  end if;

  distance_meters := 2 * 6371000 * asin(sqrt(least(1,
    sin(radians(new.reporter_latitude - 42.3172294) / 2) ^ 2
    + cos(radians(42.3172294)) * cos(radians(new.reporter_latitude))
      * sin(radians(new.reporter_longitude - (-83.2319394)) / 2) ^ 2
  )));

  if distance_meters > 1000.000001 then
    raise exception using
      errcode = '42501',
      message = 'You must be on or near the UM-Dearborn campus to report an issue.';
  end if;

  return new;
end;
$$;

create trigger validate_reporter_campus_location_before_insert
  before insert on public.reports
  for each row execute function public.validate_reporter_campus_location();
