create table if not exists public.tipos_profesionales (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid not null references public.usuarios(id) on delete cascade,
  nombre text not null,
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now())
);

create index if not exists idx_tipos_profesionales_usuario_id
  on public.tipos_profesionales (usuario_id);

create unique index if not exists idx_tipos_profesionales_usuario_nombre_unique
  on public.tipos_profesionales (usuario_id, lower(nombre));

alter table if exists public.tipos_profesionales enable row level security;

alter table public.empleadas
  add column if not exists tipo_profesional_id uuid;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'empleadas_tipo_profesional_id_fkey'
  ) then
    alter table public.empleadas
      add constraint empleadas_tipo_profesional_id_fkey
      foreign key (tipo_profesional_id)
      references public.tipos_profesionales(id)
      on delete set null;
  end if;
end
$$;

create index if not exists idx_empleadas_tipo_profesional_id
  on public.empleadas (tipo_profesional_id);
