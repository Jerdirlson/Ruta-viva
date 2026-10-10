-- Ubicación de cada ferretería, para "Cerca de mí", el mapa y la ruta.
-- Opcional: se completa en la calle con "Guardar ubicación aquí" o al importar.
-- Los rangos son los mismos de api/src/validar.js y web/db.js (validarCoordenadas).

alter table ferreterias
  add column lat double precision check (lat between -90 and 90),
  add column lng double precision check (lng between -180 and 180),
  add constraint ferreterias_lat_lng_juntas check ((lat is null) = (lng is null));
