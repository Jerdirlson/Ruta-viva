-- Ferreterías descartadas: el vendedor fue y no existe, cerró, o no es ferretería.
-- No se borran (el historial de visitas se conserva y el rol de la app no tiene DELETE):
-- quedan marcadas, salen de Hoy, del mapa y de los pendientes, y se pueden reactivar.
-- Los valores son los mismos de api/src/validar.js, web/db.js y app/src/nucleo/reglas.js.
--
-- Opcionales como los de la migración 003: un envío que no los trae no los borra.
-- Por eso la fecha es texto ('' = activa): con coalesce, null significa "no vino".

alter table ferreterias
  add column descartada text not null default ''
    check (descartada in ('', 'no_existe', 'cerro', 'no_aplica')),
  add column descartada_por text not null default '' check (length(descartada_por) <= 60),
  add column descartada_fecha text not null default ''
    check (descartada_fecha = '' or descartada_fecha ~ '^\d{4}-\d{2}-\d{2}$');
