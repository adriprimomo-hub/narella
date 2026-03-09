create table if not exists public.empleada_tipos_profesionales (
  usuario_id uuid not null references public.usuarios(id) on delete cascade,
  empleada_id uuid not null references public.empleadas(id) on delete cascade,
  tipo_profesional_id uuid not null references public.tipos_profesionales(id) on delete cascade,
  created_at timestamptz not null default timezone('utc'::text, now()),
  primary key (empleada_id, tipo_profesional_id)
);

create index if not exists idx_empleada_tipos_profesionales_usuario_id
  on public.empleada_tipos_profesionales (usuario_id);

create index if not exists idx_empleada_tipos_profesionales_tipo
  on public.empleada_tipos_profesionales (tipo_profesional_id);

alter table if exists public.empleada_tipos_profesionales enable row level security;

insert into public.empleada_tipos_profesionales (usuario_id, empleada_id, tipo_profesional_id)
select e.usuario_id, e.id, e.tipo_profesional_id
from public.empleadas e
where e.tipo_profesional_id is not null
on conflict (empleada_id, tipo_profesional_id) do nothing;
