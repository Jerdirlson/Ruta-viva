// Sincronización con el servidor (mismo protocolo que web/db.js y api/src/app.js).
// Lógica pura: armar el lote y mezclar la respuesta. El envío lo hace src/datos/.

export function armarLote(datos) {
  return {
    ferreterias: Object.values(datos.pendientes.ferreterias),
    visitas: Object.values(datos.pendientes.visitas)
  };
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
  actual.ferreterias = superponer(resp.ferreterias || [], actual.pendientes.ferreterias);
  actual.visitas = superponer(resp.visitas || [], actual.pendientes.visitas);
  actual.ultimaSync = ahora.toISOString();
  return { estado: 'ok', rechazadas: resp.rechazadas || [] };
}

export function contarPendientes(datos) {
  return Object.keys(datos.pendientes.ferreterias).length + Object.keys(datos.pendientes.visitas).length;
}
