-- Presencia de marcas y datos comerciales de cada ferretería, como el censo que llevaba
-- SOCODA en Excel (V3-CONSOLIDADO FERRETERIAS): marcas presentes, exhibidor, cocinas,
-- proveedor y observaciones. Los valores son los mismos de api/src/validar.js,
-- web/db.js y app/src/nucleo/reglas.js.
--
-- Opcionales como los de 003 y 004: un envío que no los trae (null) no borra lo guardado;
-- una lista vacía o un texto vacío sí lo vacían a propósito.

alter table ferreterias
  add column marcas text[] not null default '{}'
    check (marcas <@ array['socoda', 'north', 'atlantis', 'guinovart', 'aquaviva', 'mundial', 'gricol', 'fermetal', 'tramontina']::text[]),
  add column otras_marcas text not null default '' check (length(otras_marcas) <= 120),
  -- '' = sin dato; 'no'; 'nuevo'; 'antiguo' (el Excel anota mucho "exhibidor antiguo").
  add column exhibidor text not null default '' check (exhibidor in ('', 'no', 'nuevo', 'antiguo')),
  -- ¿Vende cocinas integrales? '' = sin dato.
  add column cocinas text not null default '' check (cocinas in ('', 'si', 'no')),
  add column ref_cocinas integer check (ref_cocinas between 0 and 1000),
  -- Por dónde le llega SOCODA (distribuidor). Varias compran a más de uno.
  add column proveedores text[] not null default '{}'
    check (proveedores <@ array['chp', 'corbeta', 'ferredistarco', 'meico', 'ardisa', 'copricol', 'construcciones', 'socoda']::text[]),
  add column otros_proveedores text not null default '' check (length(otros_proveedores) <= 120),
  -- Observación fija de la ferretería (las de cada visita van en visitas.notas).
  add column observaciones text not null default '' check (length(observaciones) <= 500);

-- Lo que el vendedor vio en esa visita (null = no lo registró). Así queda la historia de
-- cuándo una ferretería ganó o perdió SOCODA o un exhibidor.
alter table visitas
  add column marcas text[]
    check (marcas <@ array['socoda', 'north', 'atlantis', 'guinovart', 'aquaviva', 'mundial', 'gricol', 'fermetal', 'tramontina']::text[]),
  add column exhibidor text check (exhibidor in ('no', 'nuevo', 'antiguo'));
