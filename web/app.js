/* SOCODA — interfaz (JavaScript sin dependencias). Usa la API de db.js. */
(function () {
  'use strict';

  const main = document.getElementById('vista');
  const ui = {
    vista: 'hoy',
    ferreteriaId: null,
    periodo: 30,
    modoHoy: 'lista',     // 'lista' | 'mapa'
    // Posición del vendedor: solo en memoria, para ordenar por cercanía. Nunca se guarda ni se envía.
    posicion: null,       // { lat, lng, precision, hora }
    filtros: { q: '', zona: '', municipio: '', estado: '', zonaHoy: '' }
  };

  const ORDEN = (a, b) => String(a).localeCompare(b, 'es');
  const ordenZona = (a, b) =>
    ORDEN(a.zona || '~', b.zona || '~') ||
    ORDEN(a.municipio || '~', b.municipio || '~') ||
    ORDEN(a.barrio || '', b.barrio || '') ||
    ORDEN(a.nombre, b.nombre);
  const normaliza = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, c =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  }
  function unicos(lista) { return [...new Set(lista.filter(Boolean))].sort(ORDEN); }
  function fechaCorta(iso) {
    if (!iso) return '';
    const [y, m, d] = iso.split('-').map(Number);
    return new Date(y, m - 1, d).toLocaleDateString('es-CO', { day: 'numeric', month: 'short' });
  }
  function hace(iso) {
    const n = DB.diasDesde(iso);
    if (n === Infinity) return 'nunca visitada';
    if (n <= 0) return 'hoy';
    if (n === 1) return 'ayer';
    return 'hace ' + n + ' días';
  }
  // Con ubicación guardada, Maps va al punto exacto; si no, busca la dirección.
  function lugarMaps(f) {
    if (f.lat != null && f.lng != null) return f.lat + ',' + f.lng;
    return [f.direccion, f.barrio, f.municipio, 'Santander', 'Colombia'].filter(Boolean).join(', ');
  }
  function urlMaps(f) {
    return 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(lugarMaps(f));
  }

  // ---------- ubicación ----------
  function distanciaM(a, b) {
    const rad = x => x * Math.PI / 180;
    const dLat = rad(b.lat - a.lat);
    const dLng = rad(b.lng - a.lng);
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
    return 2 * 6371000 * Math.asin(Math.sqrt(h));
  }
  function textoDistancia(m) {
    if (m < 1000) return Math.max(10, Math.round(m / 10) * 10) + ' m';
    return (m / 1000).toLocaleString('es-CO', { maximumFractionDigits: 1 }) + ' km';
  }
  function distanciaA(f) {
    return ui.posicion && f.lat != null ? distanciaM(ui.posicion, f) : null;
  }

  const ERRORES_UBICACION = {
    1: 'Sin permiso de ubicación. Actívalo para esta app en los ajustes del navegador.',
    2: 'No se pudo obtener la ubicación. Revisa que el GPS esté encendido.',
    3: 'La ubicación tardó demasiado. Intenta de nuevo a cielo abierto.'
  };
  function obtenerPosicion(frescura) {
    return new Promise((resolver, rechazar) => {
      if (!('geolocation' in navigator) || !window.isSecureContext) {
        return rechazar(new Error('Este navegador no permite ubicar el celular (se necesita HTTPS).'));
      }
      navigator.geolocation.getCurrentPosition(
        p => resolver({ lat: p.coords.latitude, lng: p.coords.longitude, precision: p.coords.accuracy, hora: Date.now() }),
        e => rechazar(new Error(ERRORES_UBICACION[e.code] || 'No se pudo obtener la ubicación.')),
        { enableHighAccuracy: true, timeout: 15000, maximumAge: frescura }
      );
    });
  }

  async function ubicarme() {
    toast('Buscando tu ubicación…');
    try {
      ui.posicion = await obtenerPosicion(60000);
      toast('Ordenado por cercanía');
      render();
    } catch (e) {
      toast(e.message);
    }
  }

  // Precisión máxima aceptada al guardar la ubicación de una ferretería.
  const PRECISION_MAX_M = 100;
  async function guardarUbicacionAqui(id) {
    toast('Tomando la ubicación con el GPS…');
    try {
      const p = await obtenerPosicion(0);
      if (p.precision > PRECISION_MAX_M) {
        return toast('Precisión de ±' + Math.round(p.precision) + ' m, muy baja. Párate en la entrada, a cielo abierto, e intenta de nuevo.');
      }
      // Más de 300 m de la guardada: lo más probable es que no estés en la ferretería.
      const f = DB.censo().find(x => x.id === id);
      const lejos = f && f.lat != null ? distanciaM(p, f) : 0;
      if (lejos > 300 && !confirm('¿Estás en ' + f.nombre + '?\n\nTu GPS está a ' + textoDistancia(lejos) +
          ' de donde estaba guardada. Cámbiala solo si estás parado en la entrada de la ferretería.')) {
        return toast('No se cambió la ubicación');
      }
      DB.guardarUbicacion(id, p.lat, p.lng);
      ui.posicion = p;
      toast('Ubicación guardada (±' + Math.round(p.precision) + ' m)');
      render();
      programarSync();
    } catch (e) {
      toast(e.message);
    }
  }
  function urlTel(f) {
    const n = String(f.telefono || '').replace(/[^\d+]/g, '');
    return n ? 'tel:' + n : '';
  }
  // Mismo criterio que app/src/nucleo/geo.js: celular colombiano, con o sin 57.
  function urlWhatsapp(numero) {
    let d = String(numero || '').replace(/\D/g, '');
    if (d.length === 10 && d[0] === '3') d = '57' + d;
    return /^573\d{9}$/.test(d) ? 'https://wa.me/' + d : '';
  }
  function chip(estado) {
    return '<span class="chip chip-' + estado + '">' + DB.ESTADOS[estado] + '</span>';
  }
  // pares [valor, texto]
  function opciones(pares, actual, textoVacio) {
    return '<option value="">' + textoVacio + '</option>' + pares.map(([v, t]) =>
      '<option value="' + esc(v) + '"' + (v === actual ? ' selected' : '') + '>' + esc(t) + '</option>').join('');
  }
  function toast(msg) {
    const t = document.getElementById('toast');
    t.textContent = msg;
    t.classList.add('visible');
    clearTimeout(toast.timer);
    toast.timer = setTimeout(() => t.classList.remove('visible'), 2600);
  }
  function descargar(nombre, texto, tipo) {
    const url = URL.createObjectURL(new Blob([texto], { type: tipo }));
    const a = document.createElement('a');
    a.href = url;
    a.download = nombre;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  // Ruta en Google Maps por las próximas paradas. Google Maps en el celular acepta
  // hasta 3 paradas intermedias más el destino. Sin destino de partida, Maps sale
  // desde donde está el celular.
  const PARADAS_RUTA = 4;
  function urlRuta(lista) {
    const paradas = lista.slice(0, PARADAS_RUTA).map(lugarMaps);
    const destino = paradas.pop();
    return 'https://www.google.com/maps/dir/?api=1&travelmode=driving&destination=' + encodeURIComponent(destino) +
      (paradas.length ? '&waypoints=' + encodeURIComponent(paradas.join('|')) : '');
  }

  // Con la ubicación del vendedor: siempre a la más cercana desde la última parada.
  function paradasCercanas(lista, desde, n) {
    const quedan = lista.filter(f => f.lat != null);
    const ruta = [];
    let actual = desde;
    while (ruta.length < n && quedan.length) {
      let mejor = 0;
      quedan.forEach((f, i) => { if (distanciaM(actual, f) < distanciaM(actual, quedan[mejor])) mejor = i; });
      actual = quedan.splice(mejor, 1)[0];
      ruta.push(actual);
    }
    return ruta;
  }

  // Color del pin según lo que el vendedor tiene que hacer. Los colores viven en styles.css.
  function claseColor(f) {
    if (f.estado === 'seguimiento') return 'amarillo';
    if (f.diasSinVisita > DB.DIAS_SIN_VISITA) return 'rojo';
    if (f.estado === 'cliente') return 'verde';
    return 'gris';
  }

  // ---------- componentes ----------
  // Toda la tarjeta abre la ficha; los tres botones de abajo hacen su propia acción.
  function tarjeta(f, aviso) {
    const tel = urlTel(f);
    const lugar = [f.barrio, f.municipio].filter(Boolean).join(', ');
    return '<article class="tarjeta" data-ficha="' + esc(f.id) + '">' +
      '<div class="tarjeta-cab"><h3><button class="nombre" data-ficha="' + esc(f.id) + '">' + esc(f.nombre) +
        '</button></h3>' + chip(f.estado) + '</div>' +
      '<p class="meta">' + (distanciaA(f) != null ? '<strong class="distancia">' + textoDistancia(distanciaA(f)) + '</strong> · ' : '') +
        '<span class="meta-dir">' + esc(f.direccion || 'Sin dirección') + '</span>' +
        (lugar ? ' · ' + esc(lugar) : '') + '</p>' +
      '<p class="meta">' + (f.ultima
        ? 'Última visita ' + fechaCorta(f.ultima.fecha) + ' · ' + hace(f.ultima.fecha)
        : 'Nunca visitada') + '</p>' +
      (aviso || '') +
      '<div class="acciones-fila">' +
        '<a class="btn" href="' + urlMaps(f) + '" target="_blank" rel="noopener">Maps</a>' +
        (tel ? '<a class="btn" href="' + tel + '">Llamar</a>'
             : '<span class="btn btn-off" aria-disabled="true">Sin teléfono</span>') +
        '<button class="btn btn-pri" data-visita="' + esc(f.id) + '">Visitar</button>' +
      '</div>' +
    '</article>';
  }

  function historial(v) {
    return '<article class="tarjeta">' +
      '<div class="tarjeta-cab"><strong>' + fechaCorta(v.fecha) + '</strong>' +
        '<span class="chip">' + esc(DB.RESULTADOS[v.resultado] || v.resultado) + '</span></div>' +
      '<p class="meta">Vendedor: ' + esc(v.vendedor || '—') + '</p>' +
      (v.lineas && v.lineas.length
        ? '<p>Líneas: ' + v.lineas.map(l => esc(DB.LINEAS[l] || l)).join(', ') + '</p>' : '') +
      (v.competencia ? '<p>Competencia: ' + esc(v.competencia) + '</p>' : '') +
      (v.notas ? '<p>' + esc(v.notas) + '</p>' : '') +
    '</article>';
  }

  // ---------- vistas ----------
  function vistaHoy() {
    const todasPendientes = DB.pendientesHoy().sort(ordenZona);
    const zonaSigue = ui.filtros.zonaHoy && todasPendientes.some(f => f.zona === ui.filtros.zonaHoy);
    if (!zonaSigue) ui.filtros.zonaHoy = '';
    const pendientes = todasPendientes.filter(f => !ui.filtros.zonaHoy || f.zona === ui.filtros.zonaHoy);
    const porZona = new Map();
    todasPendientes.forEach(f => porZona.set(f.zona || '', (porZona.get(f.zona || '') || 0) + 1));
    const fecha = new Date().toLocaleDateString('es-CO', { weekday: 'long', day: 'numeric', month: 'short' });

    let html = '<section class="cabecera"><h2>Hoy</h2><p>' + esc(fecha) + '</p></section>';
    const sync = DB.estadoSync();
    if (sync.modo === 'servidor' && !sync.tieneClave) {
      html += '<div class="aviso-linea">Falta la clave del equipo <button class="enlace" data-ir="datos">Escribirla</button></div>';
    }
    if (!DB.obtenerVendedor()) {
      html += '<div class="aviso-linea">Falta tu nombre de vendedor <button class="enlace" data-ir="datos">Escribirlo</button></div>';
    }

    const chipZona = (valor, texto, n) => '<button class="chip-zona' + (valor === ui.filtros.zonaHoy ? ' activo' : '') +
      '" data-zona-hoy="' + esc(valor) + '">' + esc(texto) + '<span>' + n + '</span></button>';
    html += '<div class="chips-zona" role="group" aria-label="Zona">' +
      chipZona('', 'Todas', todasPendientes.length) +
      [...porZona.keys()].map(z => chipZona(z, z || 'Sin zona', porZona.get(z))).join('') + '</div>';

    html += '<div class="controles-hoy">' +
      '<div class="segmento" role="group" aria-label="Ver como">' +
        '<button data-modo-hoy="lista" class="' + (ui.modoHoy === 'lista' ? 'activo' : '') + '">Lista</button>' +
        '<button data-modo-hoy="mapa" class="' + (ui.modoHoy === 'mapa' ? 'activo' : '') + '">Mapa</button>' +
      '</div>' +
      '<button class="btn" data-accion="cerca">Cerca de mí</button>' +
    '</div>';
    if (ui.posicion) {
      const min = Math.round((Date.now() - ui.posicion.hora) / 60000);
      html += '<p class="ayuda">Por cercanía · ubicado ' + (min < 1 ? 'ahora' : 'hace ' + min + ' min') + '</p>';
    }

    // Con ubicación: las ubicadas por distancia y las sin ubicar al final.
    let ruta = pendientes;
    if (ui.posicion) {
      pendientes.sort((a, b) => (distanciaA(a) ?? Infinity) - (distanciaA(b) ?? Infinity));
      const cercanas = paradasCercanas(pendientes, ui.posicion, PARADAS_RUTA);
      if (cercanas.length) ruta = cercanas;
    }
    const botonRuta = pendientes.length
      ? '<a class="btn btn-pri btn-ruta" href="' + urlRuta(ruta) + '" target="_blank" rel="noopener">' +
        'Abrir ruta en Maps · ' + (ruta !== pendientes ? Math.min(PARADAS_RUTA, ruta.length) + ' más cercanas'
          : 'próximas ' + Math.min(PARADAS_RUTA, ruta.length)) + '</a>'
      : '';

    if (ui.modoHoy === 'mapa') {
      // El mapa muestra todo el censo de la zona: también clientes, para ubicarse.
      const delMapa = DB.censo().filter(f => f.estado !== 'descartada' && (!ui.filtros.zonaHoy || f.zona === ui.filtros.zonaHoy));
      const sinUbicar = delMapa.filter(f => f.lat == null).length;
      ultimoMapa = delMapa;
      html += '<div id="mapa" class="mapa" role="region" aria-label="Mapa de ferreterías"></div>' +
        '<ul class="leyenda">' +
          '<li><span class="punto punto-rojo"></span>Pendiente</li>' +
          '<li><span class="punto punto-amarillo"></span>Pidió visita</li>' +
          '<li><span class="punto punto-verde"></span>Cliente</li>' +
          '<li><span class="punto punto-gris"></span>Visitada</li>' +
          (ui.posicion ? '<li><span class="punto punto-yo"></span>Tú</li>' : '') +
        '</ul>' +
        (sinUbicar ? '<p class="ayuda">' + sinUbicar + ' sin ubicar. Ábrelas en la lista y toca "Guardar ubicación aquí" cuando estés en la ferretería.</p>' : '') +
        botonRuta;
      return html;
    }

    html += botonRuta;

    html += '<div class="lista-tarjetas">';
    let zonaAnterior = null;
    pendientes.forEach(f => {
      const z = f.zona || 'Sin zona';
      if (!ui.posicion && !ui.filtros.zonaHoy && z !== zonaAnterior) {
        html += '<h3 class="grupo">' + esc(z) + '</h3>';
        zonaAnterior = z;
      }
      html += tarjeta(f, f.estado === 'seguimiento' ? '<p class="aviso">Pidió visita después</p>' : '');
    });
    html += '</div>';
    if (!pendientes.length) html += '<p class="vacio">No hay visitas pendientes. ¡Buen trabajo!</p>';
    return html;
  }

  function vistaCenso() {
    const todas = DB.censo();
    const estados = Object.keys(DB.ESTADOS).map(k => [k, DB.ESTADOS[k]]);
    const zonas = unicos(todas.map(f => f.zona)).map(z => [z, z]);
    const municipios = unicos(todas.map(f => f.municipio)).map(m => [m, m]);
    return '<section class="cabecera"><h2>Censo</h2>' +
        '<button class="btn btn-chico" data-nueva>+ Nueva</button></section>' +
      '<div class="filtros">' +
        '<input id="buscar" type="search" data-filtro="q" placeholder="Buscar por nombre o barrio" value="' +
          esc(ui.filtros.q) + '" aria-label="Buscar">' +
        '<select id="filtro-zona" data-filtro="zona" aria-label="Zona">' + opciones(zonas, ui.filtros.zona, 'Zona') + '</select>' +
        '<select id="filtro-municipio" data-filtro="municipio" aria-label="Municipio">' +
          opciones(municipios, ui.filtros.municipio, 'Municipio') + '</select>' +
        '<select id="filtro-estado" data-filtro="estado" aria-label="Estado">' + opciones(estados, ui.filtros.estado, 'Estado') + '</select>' +
      '</div>' +
      '<p id="conteo" class="cuenta"></p>' +
      '<div id="lista" class="lista-tarjetas"></div>';
  }

  // Solo repinta la lista, para no perder el foco al escribir en el buscador.
  function pintarLista() {
    const lista = document.getElementById('lista');
    if (!lista) return;
    const q = normaliza(ui.filtros.q).trim();
    const filtradas = DB.censo().filter(f =>
      (!ui.filtros.zona || f.zona === ui.filtros.zona) &&
      (!ui.filtros.municipio || f.municipio === ui.filtros.municipio) &&
      (ui.filtros.estado ? f.estado === ui.filtros.estado : f.estado !== 'descartada') &&
      (!q || normaliza(f.nombre + ' ' + f.barrio).includes(q))
    ).sort(ordenZona);
    document.getElementById('conteo').textContent = filtradas.length + ' ferretería(s)';
    lista.innerHTML = filtradas.length
      ? filtradas.map(f => tarjeta(f)).join('')
      : '<p class="vacio">Sin resultados con estos filtros.</p>';
  }

  function vistaFicha() {
    const f = DB.censo().find(x => x.id === ui.ferreteriaId);
    if (!f) {
      return '<p class="vacio">No encontramos esta ferretería.</p>' +
        '<button class="btn btn-sec" data-ir="censo">Volver al censo</button>';
    }
    const tel = urlTel(f);
    const wa = urlWhatsapp(f.whatsapp) || urlWhatsapp(f.telefono);
    const fila = (t, v) => '<div><dt>' + t + '</dt><dd>' + (v ? esc(v) : '—') + '</dd></div>';
    const google = f.calificacion != null
      ? String(f.calificacion).replace('.', ',') + ' ★ (' + (f.resenas || 0) + ' reseñas)' : '';
    const web = /^https?:\/\//i.test(f.web || '') ? f.web : '';
    return '<button class="enlace" data-ir="censo">← Volver al censo</button>' +
      '<section class="ficha"><h2>' + esc(f.nombre) + '</h2><p>' + chip(f.estado) +
        (f.tipo === 'materiales' ? ' <span class="chip">' + DB.TIPOS.materiales + '</span>' : '') +
        (f.categoria ? ' <span class="chip">Categoría ' + esc(f.categoria) + '</span>' : '') + '</p>' +
        (f.descartada
          ? '<div class="aviso-descartada"><strong>Descartada: ' + esc(DB.DESCARTES[f.descartada] || f.descartada) + '</strong>' +
            '<span>' + esc([f.descartadaPor ? 'por ' + f.descartadaPor : '', f.descartadaFecha ? 'el ' + fechaCorta(f.descartadaFecha) : '']
              .filter(Boolean).join(' ') || 'No sale en Hoy, en el mapa ni en los pendientes.') + '</span>' +
            '<button class="btn btn-sec" data-accion="reactivar" data-id="' + esc(f.id) + '">Volver a activar</button></div>'
          : '') +
        '<dl>' + fila('Dirección', f.direccion) + fila('Barrio', f.barrio) +
          fila('Municipio', f.municipio) + fila('Zona', f.zona) + fila('Teléfono', f.telefono) +
          '<div><dt>Ubicación</dt><dd>' + (f.lat != null
            ? 'Guardada' + (distanciaA(f) != null ? ' · a ' + textoDistancia(distanciaA(f)) + ' de ti' : '')
            : 'Sin ubicar') + '</dd></div>' +
          fila('Encargado', f.encargado) + fila('WhatsApp', f.whatsapp) +
          (f.correo ? fila('Correo', f.correo) : '') +
          fila('Cliente de SOCODA', f.clienteSocoda ? 'Sí' : 'No') + fila('Vendedor asignado', f.vendedorAsignado) +
          (f.horario ? '<div><dt>Horario (Google)</dt><dd>' + f.horario.split(' | ').map(esc).join('<br>') + '</dd></div>' : '') +
          (google ? fila('Calificación en Google', google) : '') + '</dl>' +
        '<button class="btn btn-ancho" data-accion="ubicar" data-id="' + esc(f.id) + '">' +
          (f.lat != null ? 'Actualizar ubicación aquí' : 'Guardar ubicación aquí') + '</button>' +
        '<div class="acciones">' +
          '<a class="btn btn-sec" href="' + urlMaps(f) + '" target="_blank" rel="noopener">Abrir en Maps</a>' +
          (tel ? '<a class="btn btn-sec" href="' + tel + '">Llamar</a>' : '') +
          (wa ? '<a class="btn btn-sec" href="' + wa + '" target="_blank" rel="noopener">WhatsApp</a>' : '') +
          '<button class="btn btn-pri" data-visita="' + esc(f.id) + '">Registrar visita</button>' +
        '</div>' +
        '<div class="acciones">' +
          '<button class="btn btn-sec" data-editar="' + esc(f.id) + '">Editar datos</button>' +
          (web ? '<a class="btn btn-sec" href="' + esc(web) + '" target="_blank" rel="noopener">Página web</a>' : '') +
        '</div></section>' +
      (!f.descartada
        ? '<details class="descartar"><summary class="btn btn-sec btn-ancho">¿No existe o cerró?</summary>' +
          '<p class="ayuda">Sale de Hoy, del mapa y de los pendientes. No se borra: se puede volver a activar.</p>' +
          Object.keys(DB.DESCARTES).map(k => '<button class="btn btn-ancho" data-accion="descartar" data-id="' + esc(f.id) +
            '" data-motivo="' + k + '">' + esc(DB.DESCARTES[k]) + '</button>').join('') + '</details>'
        : '') +
      '<h3>Historial de visitas</h3>' +
      (f.visitas.length ? f.visitas.map(historial).join('') : '<p class="vacio">Sin visitas registradas.</p>');
  }

  function vistaResumen() {
    const r = DB.resumen(ui.periodo);
    const kpi = (n, t) => '<div class="kpi"><strong>' + n + '</strong><span>' + t + '</span></div>';
    const tabla = (filas, titulo) => filas.length
      ? '<div class="tabla-wrap"><table><thead><tr><th>' + titulo + '</th><th>Visitas</th><th>Compras</th>' +
        '<th>Efectividad</th></tr></thead><tbody>' +
        filas.map(f => '<tr><td>' + esc(f.clave) + '</td><td>' + f.visitas + '</td><td>' + f.compras +
          '</td><td>' + Math.round(100 * f.compras / f.visitas) + '%</td></tr>').join('') +
        '</tbody></table></div>'
      : '<p class="vacio">Sin visitas en este periodo.</p>';
    const items = (lista, fn) => lista.length
      ? '<ul class="lista">' + lista.map(fn).join('') + '</ul>'
      : '<p class="vacio">Ninguna.</p>';

    return '<section class="cabecera"><h2>Resumen</h2></section>' +
      '<div class="segmento">' +
        '<button data-periodo="30" class="' + (ui.periodo === 30 ? 'activo' : '') + '">Últimos 30 días</button>' +
        '<button data-periodo="0" class="' + (ui.periodo === 0 ? 'activo' : '') + '">Todo</button>' +
      '</div>' +
      '<div class="kpis">' + kpi(r.visitas, 'Visitas') + kpi(r.compras, 'Compras') +
        kpi(r.clientesNuevos.length, 'Clientes nuevos') + kpi(r.sinVisitar.length, 'Sin visitar +30 días') + '</div>' +
      '<h3>Por zona</h3>' + tabla(r.porZona, 'Zona') +
      '<h3>Por vendedor</h3>' + tabla(r.porVendedor, 'Vendedor') +
      '<h3>Clientes nuevos</h3>' + items(r.clientesNuevos, c =>
        '<li><strong>' + esc(c.nombre) + '</strong><span>' + esc(c.municipio) + ' · ' + esc(c.zona) +
        ' · compró ' + fechaCorta(c.fecha) + '</span></li>') +
      '<h3>Sin visitar hace más de 30 días</h3>' + items(r.sinVisitar, f =>
        '<li><strong>' + esc(f.nombre) + '</strong><span>' + esc(f.zona) + ' · ' +
        (f.ultima ? 'última visita ' + fechaCorta(f.ultima.fecha) : 'nunca visitada') + '</span></li>');
  }

  function bloqueSync() {
    const s = DB.estadoSync();
    if (s.modo !== 'servidor') {
      return '<div class="bloque"><h3>Sincronización</h3>' +
        '<p class="ayuda">Modo local: esta copia de la app no está conectada a un servidor, así que los datos ' +
        'solo viven en este celular. Descarga respaldos con frecuencia.</p></div>';
    }
    return '<div class="bloque"><h3>Sincronización</h3>' +
      '<label class="campo">Clave del equipo' +
        '<input id="clave-equipo" type="password" autocomplete="off" placeholder="' +
          (s.tieneClave ? 'Guardada. Escribe otra para cambiarla' : 'La entrega el administrador') + '"></label>' +
      '<p class="ayuda">' + esc(estadoActual().texto) + '</p>' +
      '<button class="btn btn-pri btn-ancho" data-accion="sync">Sincronizar ahora</button></div>';
  }

  function vistaDatos() {
    return '<section class="cabecera"><h2>Datos</h2><p>' + DB.censo().length + ' ferreterías en este celular</p></section>' +
      bloqueSync() +
      '<div class="bloque">' +
        '<label class="campo">Tu nombre (vendedor)' +
          '<input id="vendedor" value="' + esc(DB.obtenerVendedor()) + '" placeholder="Nombre y apellido" maxlength="60"></label>' +
        '<p class="ayuda">Se guarda en este celular y aparece en cada visita que registres.</p>' +
      '</div>' +
      '<div class="bloque"><h3>Importar censo (CSV)</h3>' +
        '<p class="ayuda">Columnas: nombre, direccion, barrio, municipio, telefono, zona. Opcional: id. ' +
        'Separador ; o ,. Si el id, o la combinación nombre + dirección + municipio, ya existe, se actualiza.</p>' +
        '<label class="btn btn-pri btn-ancho archivo">Elegir archivo CSV' +
          '<input type="file" id="archivo-csv" accept=".csv,text/csv"></label></div>' +
      '<div class="bloque"><h3>Exportar</h3>' +
        '<button class="btn btn-sec btn-ancho" data-accion="csv">Descargar censo (CSV)</button>' +
        '<button class="btn btn-sec btn-ancho" data-accion="backup">Descargar respaldo completo (JSON)</button></div>' +
      '<div class="bloque"><h3>Restaurar respaldo</h3>' +
        '<p class="ayuda">Reemplaza todos los datos de este celular.</p>' +
        '<label class="btn btn-ancho archivo">Elegir respaldo (JSON)' +
          '<input type="file" id="archivo-backup" accept=".json,application/json"></label></div>';
  }

  // ---------- render ----------
  function render() {
    destruirMapa();
    const vistas = { hoy: vistaHoy, censo: vistaCenso, ficha: vistaFicha, resumen: vistaResumen, datos: vistaDatos };
    main.innerHTML = (vistas[ui.vista] || vistaHoy)();
    document.querySelectorAll('[data-nav]').forEach(b => b.classList.toggle('activo', b.dataset.ir === ui.vista));
    if (ui.vista === 'censo') pintarLista();
    if (ui.vista === 'hoy' && ui.modoHoy === 'mapa') pintarMapa(ultimoMapa);
    pintarEstado();
  }

  // ---------- mapa (Leaflet + OpenStreetMap) ----------
  let mapa = null;
  let ultimoMapa = [];
  const CENTRO_AMB = [7.1, -73.12]; // área metropolitana de Bucaramanga

  function destruirMapa() {
    if (mapa) { mapa.remove(); mapa = null; }
  }

  function popupFerreteria(f) {
    const tel = urlTel(f);
    const d = distanciaA(f);
    return '<div class="popup">' +
      '<strong>' + esc(f.nombre) + '</strong>' +
      '<p class="meta">' + chip(f.estado) + (d != null ? ' · ' + textoDistancia(d) : '') + '</p>' +
      '<p class="meta">' + esc([f.direccion, f.barrio].filter(Boolean).join(' · ')) + '</p>' +
      '<div class="acciones-fila">' +
        '<a class="btn" href="' + urlMaps(f) + '" target="_blank" rel="noopener">Maps</a>' +
        (tel ? '<a class="btn" href="' + tel + '">Llamar</a>' : '<span class="btn btn-off" aria-disabled="true">Sin tel.</span>') +
        '<button class="btn btn-pri" data-visita="' + esc(f.id) + '">Visitar</button>' +
      '</div>' +
    '</div>';
  }

  function pintarMapa(lista) {
    const el = document.getElementById('mapa');
    if (!el) return;
    if (!window.L) {
      el.innerHTML = '<p class="vacio">No se pudo cargar el mapa.</p>';
      return;
    }
    const css = getComputedStyle(document.documentElement);
    const color = nombre => css.getPropertyValue('--' + nombre).trim();
    mapa = L.map(el, { zoomControl: false });
    L.control.zoom({ position: 'bottomright' }).addTo(mapa);
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>'
    }).addTo(mapa);

    const puntos = [];
    lista.filter(f => f.lat != null).forEach(f => {
      L.circleMarker([f.lat, f.lng], {
        radius: 11, weight: 3, color: color('fondo'), fillColor: color('pin-' + claseColor(f)), fillOpacity: 1
      }).bindPopup(popupFerreteria(f), { maxWidth: 280, minWidth: 240 }).addTo(mapa);
      puntos.push([f.lat, f.lng]);
    });
    if (ui.posicion) {
      L.circleMarker([ui.posicion.lat, ui.posicion.lng], {
        radius: 8, weight: 3, color: color('fondo'), fillColor: color('pin-yo'), fillOpacity: 1, interactive: false
      }).addTo(mapa);
      puntos.push([ui.posicion.lat, ui.posicion.lng]);
    }
    if (puntos.length) mapa.fitBounds(puntos, { padding: [32, 32], maxZoom: 16 });
    else mapa.setView(CENTRO_AMB, 12);
  }

  // ---------- sincronización ----------
  const MENSAJES_SYNC = {
    ok: 'Sincronizado',
    'sin-clave': 'Escribe la clave del equipo',
    'clave-incorrecta': 'Clave del equipo incorrecta',
    'sin-conexion': 'Sin conexión: los cambios quedan guardados en el celular',
    error: 'El servidor tuvo un problema; se reintenta después'
  };
  let ultimoSync = null;
  let sincronizandoAhora = false;
  let temporizadorSync = null;

  function horaCorta(iso) {
    return new Date(iso).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' });
  }

  function estadoActual() {
    const s = DB.estadoSync();
    if (s.modo !== 'servidor') return { texto: 'Modo local', clase: 'neutro' };
    if (sincronizandoAhora) return { texto: 'Sincronizando…', clase: 'neutro' };
    if (!s.tieneClave) return { texto: 'Falta la clave del equipo', clase: 'alerta' };
    const r = ultimoSync && ultimoSync.estado;
    const pend = s.pendientes ? ' · ' + s.pendientes + ' sin enviar' : '';
    if (r === 'clave-incorrecta') return { texto: 'Clave del equipo incorrecta' + pend, clase: 'alerta' };
    if (r === 'sin-conexion') return { texto: 'Sin conexión' + pend, clase: 'alerta' };
    if (r === 'error') return { texto: 'Error del servidor' + pend, clase: 'alerta' };
    if (s.pendientes) return { texto: s.pendientes + ' cambio(s) sin enviar', clase: 'alerta' };
    if (s.ultimaSync) return { texto: 'Sincronizado ' + horaCorta(s.ultimaSync), clase: 'ok' };
    return { texto: 'Sin sincronizar todavía', clase: 'neutro' };
  }

  function pintarEstado() {
    const el = document.getElementById('estado-sync');
    const e = estadoActual();
    el.textContent = e.texto;
    el.className = 'estado-sync estado-' + e.clase;
  }

  // Tras sincronizar se repinta, salvo que la persona esté escribiendo o tenga un diálogo abierto.
  function repintarSiSeguro() {
    const activo = document.activeElement;
    const ocupado = document.querySelector('dialog[open]') ||
      (activo && /^(INPUT|TEXTAREA|SELECT)$/.test(activo.tagName));
    if (ocupado) pintarEstado(); else render();
  }

  async function sincronizarAhora(manual) {
    if (DB.estadoSync().modo !== 'servidor') {
      if (manual) toast('Modo local: no hay servidor');
      return;
    }
    sincronizandoAhora = true;
    pintarEstado();
    try {
      ultimoSync = await DB.sincronizar();
    } catch (e) {
      console.error(e);
      ultimoSync = { estado: 'error' };
    } finally {
      sincronizandoAhora = false;
    }
    const rech = ultimoSync.rechazadas || [];
    if (rech.length) {
      toast(rech.length + ' registro(s) rechazado(s) por el servidor: ' + rech[0].motivo);
    } else if (manual) {
      toast(MENSAJES_SYNC[ultimoSync.estado] || 'Listo');
    }
    repintarSiSeguro();
  }

  // Después de cada cambio: espera un instante por si vienen más y envía todo junto.
  function programarSync() {
    clearTimeout(temporizadorSync);
    temporizadorSync = setTimeout(() => sincronizarAhora(false), 800);
  }

  // ---------- diálogos ----------
  function abrirVisita(id) {
    const f = DB.censo().find(x => x.id === id);
    if (!f) return toast('No encontramos esa ferretería');
    const dlg = document.getElementById('dlg-visita');
    const form = document.getElementById('form-visita');
    form.reset();
    dlg.dataset.ferreteriaId = id;
    document.getElementById('dlg-visita-nombre').textContent = f.nombre + (f.barrio ? ' · ' + f.barrio : '');
    form.fecha.value = DB.hoyISO();
    const marcas = unicos(DB.censo().flatMap(x => x.visitas.map(v => v.competencia)));
    document.getElementById('lista-marcas').innerHTML = marcas.map(m => '<option value="' + esc(m) + '">').join('');
    dlg.showModal();
  }

  // Sin id: nueva ferretería. Con id: editar la existente con el mismo formulario.
  function abrirNueva(id) {
    const form = document.getElementById('form-nueva');
    const todas = DB.censo();
    const f = id ? todas.find(x => x.id === id) : null;
    if (id && !f) return toast('No encontramos esa ferretería');
    form.reset();
    const lista = (idLista, valores) => {
      document.getElementById(idLista).innerHTML = unicos(valores).map(v => '<option value="' + esc(v) + '">').join('');
    };
    lista('lista-municipios', todas.map(x => x.municipio));
    lista('lista-zonas', todas.map(x => x.zona));
    lista('lista-vendedores', todas.map(x => x.vendedorAsignado)
      .concat(todas.flatMap(x => x.visitas.map(v => v.vendedor)), [DB.obtenerVendedor()]));
    form.id_ferreteria.value = f ? f.id : '';
    if (f) {
      ['nombre', 'direccion', 'barrio', 'municipio', 'telefono', 'zona', 'tipo', 'encargado', 'whatsapp',
        'correo', 'categoria'].forEach(k => { form[k].value = f[k] || ''; });
      form.vendedor_asignado.value = f.vendedorAsignado || '';
      form.cliente_socoda.value = f.clienteSocoda ? 'si' : 'no';
    }
    document.getElementById('dlg-nueva-titulo').textContent = f ? 'Editar ferretería' : 'Nueva ferretería';
    form.querySelector('.hoja-pie .btn').textContent = f ? 'Guardar cambios' : 'Guardar ferretería';
    document.getElementById('dlg-nueva').showModal();
  }

  // ---------- acciones ----------
  function accion(nombre, boton) {
    if (nombre === 'sync') return sincronizarAhora(true);
    if (nombre === 'cerca') return ubicarme();
    if (nombre === 'ubicar') return guardarUbicacionAqui(boton.dataset.id);
    if (nombre === 'descartar' || nombre === 'reactivar') {
      try {
        if (nombre === 'descartar') {
          DB.descartarFerreteria(boton.dataset.id, boton.dataset.motivo);
          toast('Ferretería descartada: ' + DB.DESCARTES[boton.dataset.motivo]);
        } else {
          DB.reactivarFerreteria(boton.dataset.id);
          toast('Ferretería activa de nuevo');
        }
        programarSync();
        return render();
      } catch (e) {
        return toast(e.message || 'No se pudo guardar');
      }
    }
    try {
      const hoy = DB.hoyISO();
      if (nombre === 'csv') descargar('censo_socoda_' + hoy + '.csv', DB.exportarCSV(), 'text/csv;charset=utf-8');
      if (nombre === 'backup') descargar('respaldo_socoda_' + hoy + '.json', DB.exportarBackup(), 'application/json');
    } catch (e) {
      toast(e.message || 'No se pudo exportar');
    }
  }

  // ---------- eventos ----------
  document.addEventListener('click', e => {
    // Maps, Llamar y la ruta son enlaces: que hagan lo suyo sin abrir además la ficha.
    if (e.target.closest('a[href]')) return;
    const t = e.target.closest(
      '[data-ir],[data-ficha],[data-visita],[data-nueva],[data-editar],[data-periodo],[data-accion],[data-cerrar],[data-zona-hoy],[data-modo-hoy]'
    );
    if (!t) return;
    if (t.hasAttribute('data-cerrar')) return t.closest('dialog').close();
    if (t.hasAttribute('data-zona-hoy')) {
      ui.filtros.zonaHoy = t.dataset.zonaHoy;
      return render();
    }
    if (t.hasAttribute('data-modo-hoy')) {
      ui.modoHoy = t.dataset.modoHoy;
      return render();
    }
    if (t.hasAttribute('data-visita')) return abrirVisita(t.dataset.visita);
    if (t.hasAttribute('data-nueva')) return abrirNueva();
    if (t.hasAttribute('data-editar')) return abrirNueva(t.dataset.editar);
    if (t.hasAttribute('data-accion')) return accion(t.dataset.accion, t);
    if (t.hasAttribute('data-ficha')) {
      ui.ferreteriaId = t.dataset.ficha;
      ui.vista = 'ficha';
    } else if (t.hasAttribute('data-ir')) {
      ui.vista = t.dataset.ir;
    } else if (t.hasAttribute('data-periodo')) {
      ui.periodo = Number(t.dataset.periodo);
    }
    window.scrollTo(0, 0);
    render();
  });

  // Búsqueda: solo repinta la lista.
  document.addEventListener('input', e => {
    if (e.target.dataset.filtro === 'q') {
      ui.filtros.q = e.target.value;
      pintarLista();
    }
  });

  document.addEventListener('change', async e => {
    const t = e.target;
    try {
      if (t.dataset.filtro && t.dataset.filtro !== 'q') {
        ui.filtros[t.dataset.filtro] = t.value;
        return render();
      }
      if (t.id === 'vendedor') {
        DB.fijarVendedor(t.value);
        toast('Nombre guardado');
        return render();
      }
      if (t.id === 'clave-equipo') {
        if (!t.value.trim()) return;
        DB.fijarClaveEquipo(t.value);
        t.value = '';
        t.blur();
        toast('Clave guardada');
        return sincronizarAhora(true);
      }
      if (t.id === 'archivo-csv' && t.files[0]) {
        const r = DB.importarCSV(await t.files[0].text());
        t.value = '';
        toast('Listo: ' + r.nuevas + ' nuevas, ' + r.actualizadas + ' actualizadas, ' + r.omitidas + ' omitidas');
        programarSync();
        return render();
      }
      if (t.id === 'archivo-backup' && t.files[0]) {
        if (!confirm('Esto reemplaza todos los datos de este celular. ¿Continuar?')) { t.value = ''; return; }
        DB.importarBackup(await t.files[0].text());
        t.value = '';
        toast('Respaldo restaurado');
        programarSync();
        return render();
      }
    } catch (err) {
      t.value = '';
      toast(err.message || 'No se pudo importar el archivo');
    }
  });

  document.addEventListener('submit', e => {
    e.preventDefault();
    const form = e.target;
    try {
      const fd = new FormData(form);
      if (form.id === 'form-visita') {
        const dlg = document.getElementById('dlg-visita');
        DB.registrarVisita({
          ferreteriaId: dlg.dataset.ferreteriaId,
          fecha: fd.get('fecha'),
          vendedor: DB.obtenerVendedor(),
          resultado: fd.get('resultado'),
          lineas: fd.getAll('lineas'),
          competencia: fd.get('competencia'),
          notas: fd.get('notas')
        });
        dlg.close();
        toast('Visita guardada');
      } else if (form.id === 'form-nueva') {
        const id = fd.get('id_ferreteria');
        const reg = DB.guardarFerreteria({
          id: id || undefined,
          nombre: fd.get('nombre'),
          direccion: fd.get('direccion'),
          barrio: fd.get('barrio'),
          municipio: fd.get('municipio'),
          telefono: fd.get('telefono'),
          zona: fd.get('zona'),
          tipo: fd.get('tipo'),
          encargado: fd.get('encargado'),
          whatsapp: fd.get('whatsapp'),
          correo: fd.get('correo'),
          clienteSocoda: fd.get('cliente_socoda') === 'si',
          categoria: fd.get('categoria'),
          vendedorAsignado: fd.get('vendedor_asignado')
        });
        document.getElementById('dlg-nueva').close();
        if (!id) { ui.ferreteriaId = reg.id; ui.vista = 'ficha'; }
        toast(id ? 'Cambios guardados' : 'Ferretería agregada');
      }
      render();
      programarSync();
    } catch (err) {
      toast(err.message || 'No se pudo guardar');
    }
  });

  // ---------- arranque ----------
  async function iniciar() {
    const modo = await DB.detectarServidor();
    try {
      await DB.cargarSemillaSiVacio(modo);
    } catch (e) {
      toast('No se pudieron cargar los datos de ejemplo');
      console.error(e);
    }
    render();
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('sw.js').catch(err => console.warn('Service worker no registrado', err));
    }
    if (DB.estadoSync().modo === 'servidor') {
      sincronizarAhora(false);
      // Reintenta al recuperar señal, al volver a la app y cada 2 minutos mientras está abierta.
      window.addEventListener('online', () => sincronizarAhora(false));
      document.addEventListener('visibilitychange', () => { if (!document.hidden) sincronizarAhora(false); });
      setInterval(() => { if (!document.hidden) sincronizarAhora(false); }, 120000);
    }
  }
  iniciar();
})();
