-- Contacto, datos comerciales y datos de la carga inicial desde Google Maps.
-- Los límites son los mismos de api/src/validar.js, web/db.js y app/src/nucleo/reglas.js (LIMITES).
--
-- Todos opcionales: un envío que no los trae (un celular con una versión vieja de
-- la app) no borra lo guardado; ver api/src/repositorio.js.

alter table ferreterias
  -- 'materiales' = depósito o tienda de materiales de construcción, que también se visita.
  add column tipo text not null default 'ferreteria' check (tipo in ('ferreteria', 'materiales')),

  -- Contacto. Son datos personales (Ley 1581 de 2012): se piden con permiso del encargado.
  add column encargado text not null default '' check (length(encargado) <= 80),
  add column whatsapp  text not null default '' check (length(whatsapp) <= 30),
  add column correo    text not null default '' check (length(correo) <= 120),

  -- Comercial.
  add column categoria         text    not null default '' check (categoria in ('', 'A', 'B', 'C')),
  add column cliente_socoda    boolean not null default false,
  add column vendedor_asignado text    not null default '' check (length(vendedor_asignado) <= 60),

  -- Google Maps (carga inicial, api/scripts/buscar-google.mjs).
  add column google_place_id text not null default '' check (length(google_place_id) <= 255),
  add column web             text not null default '' check (length(web) <= 300),
  add column horario         text not null default '' check (length(horario) <= 600),
  add column calificacion    double precision check (calificacion between 0 and 5),
  add column resenas         integer check (resenas between 0 and 100000000);
