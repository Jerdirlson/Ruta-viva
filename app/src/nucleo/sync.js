// Sincronización con el servidor (mismo protocolo que web/db.js y api/src/app.js).
// Lógica pura: armar el lote y mezclar la respuesta. El envío lo hace src/datos/.

// Sincronización por cambios: se manda `desde` (el `hasta` de la anterior, en hora del
// servidor) y el servidor responde solo lo que cambió. Una vez al día se pide todo, por si
// algo quedó desfasado.
export const COMPLETA_CADA_MS = 24 * 60 * 60 * 1000;

export function armarLote(datos, ahora = new Date()) {
  const lote = {
    ferreterias: Object.values(datos.pendientes.ferreterias),
    visitas: Object.values(datos.pendientes.visitas)
  };
  const reciente = datos.ultimaCompleta && ahora - new Date(datos.ultimaCompleta) < COMPLETA_CADA_MS;
  if (datos.syncDesde && reciente && datos.ferreterias.length) lote.desde = datos.syncDesde;
  return lote;
}

function superponer(lista, pendientes) {
  const mapa = new Map(lista.map(x => [x.id, x]));
  Object.values(pendientes).forEach(p => mapa.set(p.id, p));
  return [...mapa.values()];
}

// Lo enviado ya está en la respuesta (o fue rechazado): sale de la cola, salvo que
// haya cambiado mientras viajaba. Lo nuevo sigue pendiente y se superpone.
export function aplicarRespuesta(actual, lote, resp, ahora = new Date()) {
  ['ferreterias', 'visitas'].forEach(tipo => {
    const enviados = new Map(lote[tipo].map(r => [r.id, JSON.stringify(r)]));
    Object.keys(actual.pendientes[tipo]).forEach(id => {
      if (enviados.get(id) === JSON.stringify(actual.pendientes[tipo][id])) delete actual.pendientes[tipo][id];
    });
  });
  // Respuesta parcial (solo cambios): se mezcla con lo que ya había. Completa: la reemplaza.
  // Nada se borra en el servidor, así que mezclar nunca deja registros que ya no existen.
  const parcial = resp.completo === false;
  const base = (tipo, lista) => (parcial ? superponer(actual[tipo], Object.fromEntries((lista || []).map(x => [x.id, x]))) : (lista || []));
  actual.ferreterias = superponer(base('ferreterias', resp.ferreterias), actual.pendientes.ferreterias);
  actual.visitas = superponer(base('visitas', resp.visitas), actual.pendientes.visitas);
  actual.ultimaSync = ahora.toISOString();
  actual.syncDesde = resp.hasta || '';
  if (!parcial) actual.ultimaCompleta = ahora.toISOString();
  const cambios = (resp.ferreterias || []).length + (resp.visitas || []).length;
  return { estado: 'ok', rechazadas: resp.rechazadas || [], cambios };
}

export function contarPendientes(datos) {
  return Object.keys(datos.pendientes.ferreterias).length + Object.keys(datos.pendientes.visitas).length;
}
