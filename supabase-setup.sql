-- NEUROFIT PERFORMANCE LAB — BASE DE DATOS COMPARTIDA CON LISTA DE ACCESO
-- Ejecuta este script en Supabase > SQL Editor > New query.
-- Las cuentas se crean desde la web con email y contraseña (no se requieren invitaciones).
-- Solo los correos incluidos en neurofit_allowed_users pueden leer/editar los datos compartidos.

create table if not exists public.neurofit_allowed_users (
  email text primary key check (email = lower(email)),
  created_at timestamptz not null default now()
);

alter table public.neurofit_allowed_users enable row level security;
revoke all on public.neurofit_allowed_users from anon, authenticated;

-- Función de seguridad para comprobar la lista permitida sin exponer su contenido al frontend.
create or replace function public.is_neurofit_allowed_user()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.neurofit_allowed_users u
    where lower(u.email) = lower(coalesce((select auth.jwt() ->> 'email'), ''))
  );
$$;
revoke all on function public.is_neurofit_allowed_user() from public, anon;
grant execute on function public.is_neurofit_allowed_user() to authenticated;

create table if not exists public.neurofit_data (
  id text primary key check (id = 'shared'),
  payload jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id),
  source_id text
);

alter table public.neurofit_data enable row level security;
grant usage on schema public to authenticated;
grant select, insert, update on public.neurofit_data to authenticated;

drop policy if exists "Authenticated users can read NeuroFit shared data" on public.neurofit_data;
drop policy if exists "Authenticated users can create NeuroFit shared data" on public.neurofit_data;
drop policy if exists "Authenticated users can update NeuroFit shared data" on public.neurofit_data;

create policy "Authenticated users can read NeuroFit shared data"
  on public.neurofit_data for select to authenticated
  using (
    public.is_neurofit_allowed_user()
    and coalesce((select auth.jwt() ->> 'is_anonymous'), 'false') <> 'true'
  );

create policy "Authenticated users can create NeuroFit shared data"
  on public.neurofit_data for insert to authenticated
  with check (
    public.is_neurofit_allowed_user()
    and coalesce((select auth.jwt() ->> 'is_anonymous'), 'false') <> 'true'
  );

create policy "Authenticated users can update NeuroFit shared data"
  on public.neurofit_data for update to authenticated
  using (
    public.is_neurofit_allowed_user()
    and coalesce((select auth.jwt() ->> 'is_anonymous'), 'false') <> 'true'
  )
  with check (
    public.is_neurofit_allowed_user()
    and coalesce((select auth.jwt() ->> 'is_anonymous'), 'false') <> 'true'
  );

-- Activa Realtime para escuchar cambios desde otros navegadores/dispositivos.
-- Este bloque evita error si la tabla ya pertenece a la publicación.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (
       select 1 from pg_publication_tables
       where pubname = 'supabase_realtime'
         and schemaname = 'public'
         and tablename = 'neurofit_data'
     ) then
    alter publication supabase_realtime add table public.neurofit_data;
  end if;
end $$;

-- PASO IMPORTANTE: después de ejecutar este script, reemplaza los emails de ejemplo y ejecuta este bloque:
-- insert into public.neurofit_allowed_users (email) values
--   (lower('tu-correo@ejemplo.com')),
--   (lower('colaborador@ejemplo.com'))
-- on conflict (email) do nothing;
-- Autoriza los emails aquí antes o después de que creen su cuenta en NeuroFit. No necesitas enviar invitaciones, pero sí revisar quién accede a los datos deportivos.
