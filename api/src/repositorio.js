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
export async function sincronizar(pool, lote) {
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
      await cliente.query(
        `insert into ferreterias (id, nombre, direccion, barrio, municipio, telefono, zona)
         values ($1, $2, $3, $4, $5, $6, $7)
         on conflict (id) do update set
           nombre = excluded.nombre, direccion = excluded.direccion, barrio = excluded.barrio,
           municipio = excluded.municipio, telefono = excluded.telefono, zona = excluded.zona,
           actualizada = now()`,
        [x.id, x.nombre, x.direccion, x.barrio, x.municipio, x.telefono, x.zona]
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
        `insert into visitas (id, ferreteria_id, fecha, vendedor, resultado, lineas, competencia, notas, creada)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         on conflict (id) do nothing`,
        [v.id, v.ferreteriaId, v.fecha, v.vendedor, v.resultado, v.lineas, v.competencia, v.notas, v.creada]
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
    'select id, nombre, direccion, barrio, municipio, telefono, zona from ferreterias order by nombre, id'
  );
  const v = await pool.query(
    `select id, ferreteria_id as "ferreteriaId", to_char(fecha, 'YYYY-MM-DD') as fecha, vendedor,
            resultado, lineas, competencia, notas, creada
       from visitas
      order by fecha desc, creada desc`
  );
  return { ferreterias: f.rows, visitas: v.rows };
}
