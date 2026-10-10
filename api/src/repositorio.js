// Acceso a Postgres. Única parte del API que escribe SQL.
import { validarFerreteria, validarVisita, LIMITES } from './validar.js';

export const MAX_LOTE = 5000;

export class ErrorCliente extends Error {}

function idDe(reg) {
  return reg && typeof reg.id === 'string' ? reg.id.slice(0, LIMITES.id) : null;
}

// Recibe lo pendiente de un teléfono, lo aplica y devuelve el estado completo.
// - Ferreterías: se insertan o actualizan por id (gana la última que llega).
// - Visitas: solo se insertan; el id lo genera el teléfono, así que reenviar
//   una visita (por ejemplo tras perder la señal a mitad de envío) no la duplica.
// Lo inválido no tumba el lote: se devuelve en `rechazadas` con el motivo.
// usuario: el de la sesión. Firma las visitas y los descartes: el nombre que mande el
// celular se ignora, así nadie registra a nombre de otro.
export async function sincronizar(pool, lote, usuario) {
  const ferreterias = Array.isArray(lote && lote.ferreterias) ? lote.ferreterias : [];
  const visitas = Array.isArray(lote && lote.visitas) ? lote.visitas : [];
  if (ferreterias.length + visitas.length > MAX_LOTE) {
    throw new ErrorCliente('Lote demasiado grande (máximo ' + MAX_LOTE + ' registros)');
  }

  const rechazadas = [];
  const cliente = await pool.connect();
  try {
    await cliente.query('begin');

    for (const f of ferreterias) {
      const r = validarFerreteria(f);
      if (r.error) {
        rechazadas.push({ tipo: 'ferreteria', id: idDe(f), motivo: r.error });
        continue;
      }
      const x = r.valor;
      if (x.descartada) x.descartadaPor = usuario.nombre;
      // Una ubicación guardada nunca se pierde por un envío que no la trae
      // (por ejemplo, un celular con una versión vieja de la app): coalesce.
      // Igual con los campos de la migración 003, que llegan en null si no vienen.
      await cliente.query(
        `insert into ferreterias (id, nombre, direccion, barrio, municipio, telefono, zona, lat, lng,
           tipo, encargado, whatsapp, correo, categoria, cliente_socoda, vendedor_asignado,
           google_place_id, web, horario, calificacion, resenas,
           descartada, descartada_por, descartada_fecha)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9,
           coalesce($10, 'ferreteria'), coalesce($11, ''), coalesce($12, ''), coalesce($13, ''),
           coalesce($14, ''), coalesce($15, false), coalesce($16, ''),
           coalesce($17, ''), coalesce($18, ''), coalesce($19, ''), $20, $21,
           coalesce($22, ''), coalesce($23, ''), coalesce($24, ''))
         on conflict (id) do update set
           nombre = excluded.nombre, direccion = excluded.direccion, barrio = excluded.barrio,
           municipio = excluded.municipio, telefono = excluded.telefono, zona = excluded.zona,
           lat = coalesce(excluded.lat, ferreterias.lat), lng = coalesce(excluded.lng, ferreterias.lng),
           tipo = coalesce($10, ferreterias.tipo), encargado = coalesce($11, ferreterias.encargado),
           whatsapp = coalesce($12, ferreterias.whatsapp), correo = coalesce($13, ferreterias.correo),
           categoria = coalesce($14, ferreterias.categoria),
           cliente_socoda = coalesce($15, ferreterias.cliente_socoda),
           vendedor_asignado = coalesce($16, ferreterias.vendedor_asignado),
           google_place_id = coalesce($17, ferreterias.google_place_id),
           web = coalesce($18, ferreterias.web), horario = coalesce($19, ferreterias.horario),
           calificacion = coalesce($20, ferreterias.calificacion), resenas = coalesce($21, ferreterias.resenas),
           descartada = coalesce($22, ferreterias.descartada),
           descartada_por = coalesce($23, ferreterias.descartada_por),
           descartada_fecha = coalesce($24, ferreterias.descartada_fecha),
           actualizada = now()`,
        [x.id, x.nombre, x.direccion, x.barrio, x.municipio, x.telefono, x.zona, x.lat, x.lng,
          x.tipo, x.encargado, x.whatsapp, x.correo, x.categoria, x.clienteSocoda, x.vendedorAsignado,
          x.googlePlaceId, x.web, x.horario, x.calificacion, x.resenas,
          x.descartada, x.descartadaPor, x.descartadaFecha]
      );
    }

    const validas = [];
    for (const v of visitas) {
      const r = validarVisita(v);
      if (r.error) rechazadas.push({ tipo: 'visita', id: idDe(v), motivo: r.error });
      else validas.push(r.valor);
    }
    const ids = [...new Set(validas.map(v => v.ferreteriaId))];
    const { rows } = await cliente.query('select id from ferreterias where id = any($1)', [ids]);
    const existentes = new Set(rows.map(r => r.id));
    for (const v of validas) {
      if (!existentes.has(v.ferreteriaId)) {
        rechazadas.push({ tipo: 'visita', id: v.id, motivo: 'La ferretería no existe' });
        continue;
      }
      await cliente.query(
        `insert into visitas (id, ferreteria_id, fecha, vendedor, resultado, lineas, competencia, notas, creada, usuario_id)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
         on conflict (id) do nothing`,
        [v.id, v.ferreteriaId, v.fecha, usuario.nombre, v.resultado, v.lineas, v.competencia, v.notas, v.creada, usuario.id]
      );
    }

    await cliente.query('commit');
  } catch (e) {
    await cliente.query('rollback').catch(() => {});
    throw e;
  } finally {
    cliente.release();
  }

  return Object.assign(await estado(pool), { rechazadas });
}

// Estado completo, con los mismos nombres de campo que usa web/db.js.
export async function estado(pool) {
  const f = await pool.query(
    `select id, nombre, direccion, barrio, municipio, telefono, zona, lat, lng,
            tipo, encargado, whatsapp, correo, categoria, cliente_socoda as "clienteSocoda",
            vendedor_asignado as "vendedorAsignado", google_place_id as "googlePlaceId",
            web, horario, calificacion, resenas,
            descartada, descartada_por as "descartadaPor", descartada_fecha as "descartadaFecha"
       from ferreterias
      order by nombre, id`
  );
  const v = await pool.query(
    `select id, ferreteria_id as "ferreteriaId", to_char(fecha, 'YYYY-MM-DD') as fecha, vendedor,
            resultado, lineas, competencia, notas, creada
       from visitas
      order by fecha desc, creada desc`
  );
  return { ferreterias: f.rows, visitas: v.rows };
}
