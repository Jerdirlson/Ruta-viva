-- Esquema inicial de Ruta-viva.
-- Los límites de texto son los mismos de api/src/validar.js y web/db.js (LIMITES).

create table ferreterias (
  id          text primary key check (length(id) between 1 and 64),
  nombre      text not null check (length(nombre) between 1 and 120),
  direccion   text not null default '' check (length(direccion) <= 160),
  barrio      text not null default '' check (length(barrio) <= 80),
  municipio   text not null default '' check (length(municipio) <= 60),
  telefono    text not null default '' check (length(telefono) <= 30),
  zona        text not null default '' check (length(zona) <= 40),
  creada      timestamptz not null default now(),
  actualizada timestamptz not null default now()
);

create table visitas (
  id            text primary key check (length(id) between 1 and 64),
  ferreteria_id text not null references ferreterias (id),
  fecha         date not null check (fecha between '2000-01-01' and '2100-12-31'),
  vendedor      text not null default '' check (length(vendedor) <= 60),
  resultado     text not null check (resultado in ('compro', 'no_compro', 'no_estaba', 'pidio_visita')),
  lineas        text[] not null default '{}'
                check (lineas <@ array['lavaplatos', 'cocina_integral', 'estufa', 'campana', 'meson']::text[]),
  competencia   text not null default '' check (length(competencia) <= 80),
  notas         text not null default '' check (length(notas) <= 500),
  creada        timestamptz not null,               -- hora del teléfono al registrar
  recibida      timestamptz not null default now()  -- hora en que llegó al servidor
);

create index visitas_ferreteria_idx on visitas (ferreteria_id);
create index visitas_fecha_idx on visitas (fecha);
