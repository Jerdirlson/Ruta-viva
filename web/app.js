/* SOCODA — interfaz (JavaScript sin dependencias). Usa la API de db.js. */
(function () {
  'use strict';

  const main = document.getElementById('vista');
  const ui = {
    vista: 'hoy',
    ferreteriaId: null,
    periodo: 30,
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
  function urlMaps(f) {
    const q = [f.direccion, f.barrio, f.municipio, 'Santander', 'Colombia'].filter(Boolean).join(', ');
    return 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(q);
  }
  function urlTel(f) {
    const n = String(f.telefono || '').replace(/[^\d+]/g, '');
    return n ? 'tel:' + n : '';
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

  // Ruta en Google Maps por las próximas paradas, en el orden de la lista.
  // Google Maps en el celular acepta hasta 3 paradas intermedias más el destino.
  const PARADAS_RUTA = 4;
  function urlRuta(lista) {
    const lugar = f => [f.direccion, f.barrio, f.municipio, 'Santander', 'Colombia'].filter(Boolean).join(', ');
    const paradas = lista.slice(0, PARADAS_RUTA).map(lugar);
    const destino = paradas.pop();
    return 'https://www.google.com/maps/dir/?api=1&travelmode=driving&destination=' + encodeURIComponent(destino) +
      (paradas.length ? '&waypoints=' + encodeURIComponent(paradas.join('|')) : '');
  }

  // ---------- componentes ----------
  // Toda la tarjeta abre la ficha; los tres botones de abajo hacen su propia acción.
  function tarjeta(f, aviso) {
    const tel = urlTel(f);
    const lugar = [f.barrio, f.municipio].filter(Boolean).join(', ');
    return '<article class="tarjeta" data-ficha="' + esc(f.id) + '">' +
      '<div class="tarjeta-cab"><h3><button class="nombre" data-ficha="' + esc(f.id) + '">' + esc(f.nombre) +
        '</button></h3>' + chip(f.estado) + '</div>' +
      '<p class="meta"><span class="meta-dir">' + esc(f.direccion || 'Sin dirección') + '</span>' +
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

    if (pendientes.length) {
      const n = Math.min(PARADAS_RUTA, pendientes.length);
      html += '<a class="btn btn-pri btn-ruta" href="' + urlRuta(pendientes) + '" target="_blank" rel="noopener">' +
        'Abrir ruta en Maps · próximas ' + n + '</a>';
    }

    html += '<div class="lista-tarjetas">';
    let zonaAnterior = null;
    pendientes.forEach(f => {
      const z = f.zona || 'Sin zona';
      if (!ui.filtros.zonaHoy && z !== zonaAnterior) {
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
      (!ui.filtros.estado || f.estado === ui.filtros.estado) &&
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
    const fila = (t, v) => '<div><dt>' + t + '</dt><dd>' + (v ? esc(v) : '—') + '</dd></div>';
    return '<button class="enlace" data-ir="censo">← Volver al censo</button>' +
      '<section class="ficha"><h2>' + esc(f.nombre) + '</h2><p>' + chip(f.estado) + '</p>' +
        '<dl>' + fila('Dirección', f.direccion) + fila('Barrio', f.barrio) +
          fila('Municipio', f.municipio) + fila('Zona', f.zona) + fila('Teléfono', f.telefono) + '</dl>' +
        '<div class="acciones">' +
          '<a class="btn btn-sec" href="' + urlMaps(f) + '" target="_blank" rel="noopener">Abrir en Maps</a>' +
          (tel ? '<a class="btn btn-sec" href="' + tel + '">Llamar</a>' : '') +
          '<button class="btn btn-pri" data-visita="' + esc(f.id) + '">Registrar visita</button>' +
        '</div></section>' +
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
    const vistas = { hoy: vistaHoy, censo: vistaCenso, ficha: vistaFicha, resumen: vistaResumen, datos: vistaDatos };
    main.innerHTML = (vistas[ui.vista] || vistaHoy)();
    document.querySelectorAll('[data-nav]').forEach(b => b.classList.toggle('activo', b.dataset.ir === ui.vista));
    if (ui.vista === 'censo') pintarLista();
    pintarEstado();
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

  function abrirNueva() {
    const form = document.getElementById('form-nueva');
    const todas = DB.censo();
    form.reset();
    document.getElementById('lista-municipios').innerHTML =
      unicos(todas.map(f => f.municipio)).map(m => '<option value="' + esc(m) + '">').join('');
    document.getElementById('lista-zonas').innerHTML =
      unicos(todas.map(f => f.zona)).map(z => '<option value="' + esc(z) + '">').join('');
    document.getElementById('dlg-nueva').showModal();
  }

  // ---------- acciones ----------
  function accion(nombre) {
    if (nombre === 'sync') return sincronizarAhora(true);
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
      '[data-ir],[data-ficha],[data-visita],[data-nueva],[data-periodo],[data-accion],[data-cerrar],[data-zona-hoy]'
    );
    if (!t) return;
    if (t.hasAttribute('data-cerrar')) return t.closest('dialog').close();
    if (t.hasAttribute('data-zona-hoy')) {
      ui.filtros.zonaHoy = t.dataset.zonaHoy;
      return render();
    }
    if (t.hasAttribute('data-visita')) return abrirVisita(t.dataset.visita);
    if (t.hasAttribute('data-nueva')) return abrirNueva();
    if (t.hasAttribute('data-accion')) return accion(t.dataset.accion);
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
        DB.guardarFerreteria({
          nombre: fd.get('nombre'),
          direccion: fd.get('direccion'),
          barrio: fd.get('barrio'),
          municipio: fd.get('municipio'),
          telefono: fd.get('telefono'),
          zona: fd.get('zona')
        });
        document.getElementById('dlg-nueva').close();
        toast('Ferretería agregada');
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
