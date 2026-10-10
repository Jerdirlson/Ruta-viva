-- Usuarios y sesiones: cada vendedor entra con su usuario y contraseña (reemplaza la
-- clave compartida del equipo). Los límites son los mismos de api/src/validar.js.
--
-- Nada se borra (el rol de la app sigue sin DELETE): desactivar un usuario o cerrar una
-- sesión es marcarlos. La contraseña se guarda solo como hash scrypt y la sesión solo
-- como hash SHA-256 del token: con una copia de la base no se puede entrar.

create table usuarios (
  id          text primary key check (length(id) between 1 and 64),
  usuario     text not null unique check (usuario ~ '^[a-z0-9._-]{3,40}$'),
  nombre      text not null check (length(nombre) between 1 and 60),
  rol         text not null check (rol in ('admin', 'vendedor')),
  clave_hash  text not null,
  -- Contraseña puesta por un administrador: hay que cambiarla al entrar.
  debe_cambiar_clave boolean not null default true,
  activo      boolean not null default true,
  creado      timestamptz not null default now(),
  actualizado timestamptz not null default now()
);

create table sesiones (
  token_hash  text primary key,
  usuario_id  text not null references usuarios (id),
  creada      timestamptz not null default now(),
  expira      timestamptz not null,
  revocada    timestamptz
);
create index sesiones_usuario_idx on sesiones (usuario_id);

-- Quién registró cada visita (lo pone el servidor con la sesión, no el celular).
alter table visitas add column usuario_id text references usuarios (id);
