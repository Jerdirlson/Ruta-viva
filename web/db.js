/*
 * Capa de datos de Ruta-viva (SOCODA).
 *
 * Local-first: todo se guarda primero en el teléfono (localStorage), así la app
 * funciona sin señal. Si la app la sirve el API de Ruta-viva (modo "servidor"),
 * cada cambio queda además en una cola de pendientes que sincronizar() envía
 * cuando hay conexión; la respuesta trae el censo y las visitas de todo el equipo.
 *
 * Abierta desde un servidor estático cualquiera (modo "local") funciona sola en
 * el teléfono, con datos de ejemplo, como el prototipo de la fase 1.
 */
(function (global) {
  'use strict';

  const CLAVE = 'socoda.v1';
  const DIAS_SIN_VISITA = 30;
  const CAMPOS = ['nombre', 'direccion', 'barrio', 'municipio', 'telefono', 'zona'];
  // Migración 003: contacto, comercial y Google Maps. Los de texto se recortan con LIMITES.
  const TEXTOS_EXTRA = ['encargado', 'whatsapp', 'correo', 'vendedorAsignado', 'googlePlaceId', 'web', 'horario'];

  // Mismos límites que api/src/validar.js, api/migrations/*.sql y app/src/nucleo/reglas.js.
  // Si se cambia uno, se cambian todos.
  const LIMITES = {
    id: 64,
    nombre: 120,
    direccion: 160,
    barrio: 80,
    municipio: 60,
    telefono: 30,
    zona: 40,
    vendedor: 60,
    competencia: 80,
    notas: 500,
    encargado: 80,
    whatsapp: 30,
    correo: 120,
    vendedorAsignado: 60,
    googlePlaceId: 255,
    web: 300,
    horario: 600
  };

  const TIPOS = {
    ferreteria: 'Ferretería',
    materiales: 'Materiales de construcción'
  };
  const CATEGORIAS = ['A', 'B', 'C'];

  // Migración 004: por qué se descartó una ferretería ('' = activa). No se borra nunca.
  const DESCARTES = {
    no_existe: 'No existe en esa dirección',
    cerro: 'Cerró',
    no_aplica: 'No es ferretería / no aplica'
  };

  const RESULTADOS = {
    compro: 'Compró',
    no_compro: 'No compró',
    no_estaba: 'No estaba',
    pidio_visita: 'Pidió visita después'
  };

  const LINEAS = {
    lavaplatos: 'Lavaplatos',
    cocina_integral: 'Cocina integral',
    estufa: 'Estufa',
    campana: 'Campana',
    meson: 'Mesón'
  };

  const ESTADOS = {
    nueva: 'Sin visitar',
    visitada: 'Visitada',
    seguimiento: 'Pidió visita',
    cliente: 'Cliente',
    descartada: 'Descartada'
  };

  // ---------- utilidades ----------
  const tiene = (obj, k) => Object.prototype.hasOwnProperty.call(obj, k);
  function limpiar(s) { return String(s == null ? '' : s).trim(); }
  function recortar(k, s) { return limpiar(s).slice(0, LIMITES[k]); }
  function normaliza(s) {
    return limpiar(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ');
  }
  function nuevoId(prefijo) {
    if (global.crypto && typeof global.crypto.randomUUID === 'function') return prefijo + global.crypto.randomUUID();
    return prefijo + Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
  }
  function isoDe(d) {
    return [d.getFullYear(), String(d.getMonth() + 1).padStart(2, '0'), String(d.getDate()).padStart(2, '0')].join('-');
  }
  function hoyISO() { return isoDe(new Date()); }
  function fechaHaceDias(n) { const d = new Date(); d.setDate(d.getDate() - n); return isoDe(d); }
  function diasDesde(iso) {
    if (!iso) return Infinity;
    const [y, m, d] = iso.split('-').map(Number);
    const hoy = new Date();
    hoy.setHours(0, 0, 0, 0);
    return Math.round((hoy - new Date(y, m - 1, d)) / 86400000);
  }

  // ---------- almacenamiento ----------
  function vacio() {
    return {
      ferreterias: [],
      visitas: [],
      vendedorActual: '',
      semilla: false,
      modo: '',            // 'servidor' una vez que el API respondió; nunca vuelve atrás
      claveEquipo: '',
      ultimaSync: '',
      pendientes: { ferreterias: {}, visitas: {} }
    };
  }
  function leer() {
    try {
      const raw = localStorage.getItem(CLAVE);
      return raw ? Object.assign(vacio(), JSON.parse(raw)) : vacio();
    } catch (e) {
      console.error('Datos locales ilegibles', e);
      return vacio();
    }
  }
  function guardar(datos) {
    localStorage.setItem(CLAVE, JSON.stringify(datos)); // lanza si el almacenamiento está lleno
  }
  // En modo servidor, todo cambio local queda pendiente de enviar (el último gana).
  function encolar(datos, tipo, reg) {
    if (datos.modo === 'servidor') datos.pendientes[tipo][reg.id] = reg;
  }

  // ---------- ferreterías ----------
  function claveDup(f) {
    return [normaliza(f.nombre), normaliza(f.direccion), normaliza(f.municipio)].join('|');
  }
  // Mismos rangos que api/src/validar.js (validarCoordenadas) y la migración 002.
  // Latitud y longitud van juntas o no van; null = sin ubicar.
  function validarCoordenadas(lat, lng) {
    const vacio = v => v == null || v === '';
    if (vacio(lat) && vacio(lng)) return { lat: null, lng: null };
    const a = Number(String(lat).replace(',', '.'));
    const o = Number(String(lng).replace(',', '.'));
    if (vacio(lat) || vacio(lng) || !Number.isFinite(a) || !Number.isFinite(o) ||
        a < -90 || a > 90 || o < -180 || o > 180) return null;
    return { lat: a, lng: o };
  }
  // Sí/no tal como llega de un formulario, un CSV o el servidor.
  function siNo(v) {
    return v === true || /^(si|sí|s|1|true|x)$/i.test(limpiar(v));
  }
  function numeroEntre(v, min, max, entero) {
    if (v == null || limpiar(v) === '') return null;
    const n = Number(String(v).replace(',', '.'));
    if (!Number.isFinite(n) || n < min || n > max || (entero && !Number.isInteger(n))) return null;
    return n;
  }
  function construirFerreteria(f, id) {
    const reg = { id: recortar('id', id) };
    CAMPOS.forEach(c => { reg[c] = recortar(c, f[c]); });
    const c = validarCoordenadas(f.lat, f.lng) || { lat: null, lng: null };
    reg.lat = c.lat;
    reg.lng = c.lng;
    reg.tipo = tiene(TIPOS, f.tipo) ? f.tipo : 'ferreteria';
    TEXTOS_EXTRA.forEach(k => { reg[k] = recortar(k, f[k]); });
    const cat = limpiar(f.categoria).toUpperCase();
    reg.categoria = CATEGORIAS.includes(cat) ? cat : '';
    reg.clienteSocoda = siNo(f.clienteSocoda);
    reg.calificacion = numeroEntre(f.calificacion, 0, 5, false);
    reg.resenas = numeroEntre(f.resenas, 0, 1e8, true);
    reg.descartada = tiene(DESCARTES, f.descartada) ? f.descartada : '';
    reg.descartadaPor = recortar('vendedor', f.descartadaPor);
    reg.descartadaFecha = /^\d{4}-\d{2}-\d{2}$/.test(limpiar(f.descartadaFecha)) ? limpiar(f.descartadaFecha) : '';
    return reg;
  }
  // Nueva (sin id) o editar: lo que no viene en f se conserva de la guardada.
  function guardarFerreteria(f) {
    const datos = leer();
    const id = f.id || nuevoId('f_');
    const i = datos.ferreterias.findIndex(x => x.id === id);
    const reg = construirFerreteria(i >= 0 ? Object.assign({}, datos.ferreterias[i], f) : f, id);
    if (!reg.nombre) throw new Error('El nombre es obligatorio');
    if (i >= 0) datos.ferreterias[i] = reg; else datos.ferreterias.push(reg);
    encolar(datos, 'ferreterias', reg);
    guardar(datos);
    return reg;
  }

  // "Guardar ubicación aquí": fija la ubicación de la ferretería con el GPS del celular.
  function guardarUbicacion(id, lat, lng) {
    const c = validarCoordenadas(lat, lng);
    if (!c || c.lat == null) throw new Error('Ubicación no válida');
    const datos = leer();
    const f = datos.ferreterias.find(x => x.id === id);
    if (!f) throw new Error('La ferretería no existe');
    f.lat = c.lat;
    f.lng = c.lng;
    encolar(datos, 'ferreterias', f);
    guardar(datos);
    return f;
  }

  // El vendedor fue y no existe, cerró o no aplica. Queda marcada (con quién y cuándo),
  // sale de Hoy, del mapa y de los pendientes, y conserva su historial de visitas.
  function descartarFerreteria(id, motivo) {
    if (!tiene(DESCARTES, motivo)) throw new Error('Elige por qué la descartas');
    const datos = leer();
    const f = datos.ferreterias.find(x => x.id === id);
    if (!f) throw new Error('La ferretería no existe');
    f.descartada = motivo;
    f.descartadaPor = recortar('vendedor', datos.vendedorActual);
    f.descartadaFecha = hoyISO();
    encolar(datos, 'ferreterias', f);
    guardar(datos);
    return f;
  }
  function reactivarFerreteria(id) {
    const datos = leer();
    const f = datos.ferreterias.find(x => x.id === id);
    if (!f) throw new Error('La ferretería no existe');
    f.descartada = '';
    f.descartadaPor = '';
    f.descartadaFecha = '';
    encolar(datos, 'ferreterias', f);
    guardar(datos);
    return f;
  }

  // ---------- visitas ----------
  function registrarVisita(v) {
    const datos = leer();
    if (!tiene(RESULTADOS, v.resultado)) throw new Error('Elige un resultado');
    if (!datos.ferreterias.some(f => f.id === v.ferreteriaId)) throw new Error('La ferretería no existe');
    const visita = {
      id: nuevoId('v_'),
      ferreteriaId: v.ferreteriaId,
      fecha: v.fecha || hoyISO(),
      vendedor: recortar('vendedor', v.vendedor),
      resultado: v.resultado,
      lineas: [...new Set((Array.isArray(v.lineas) ? v.lineas : []).filter(l => tiene(LINEAS, l)))],
      competencia: recortar('competencia', v.competencia),
      notas: recortar('notas', v.notas),
      creada: new Date().toISOString()
    };
    datos.visitas.push(visita);
    encolar(datos, 'visitas', visita);
    guardar(datos);
    return visita;
  }

  function ordenVisitas(a, b) {
    return b.fecha.localeCompare(a.fecha) || (b.creada || '').localeCompare(a.creada || '');
  }
  // Descartada manda. Ya cliente de SOCODA antes de la app = cliente, salvo que haya pedido visita.
  function estadoDe(ultima, f) {
    if (f && f.descartada) return 'descartada';
    if (ultima && ultima.resultado === 'pidio_visita') return 'seguimiento';
    if ((ultima && ultima.resultado === 'compro') || (f && f.clienteSocoda === true)) return 'cliente';
    return ultima ? 'visitada' : 'nueva';
  }
  // Ferreterías enriquecidas con visitas, última visita, estado y días sin visita.
  function censoDe(datos) {
    return datos.ferreterias.map(f => {
      const visitas = datos.visitas.filter(v => v.ferreteriaId === f.id).sort(ordenVisitas);
      const ultima = visitas[0] || null;
      return Object.assign({}, f, {
        visitas: visitas,
        ultima: ultima,
        estado: estadoDe(ultima, f),
        diasSinVisita: diasDesde(ultima ? ultima.fecha : null)
      });
    });
  }
  function censo() { return censoDe(leer()); }

  // Pendientes de hoy: pidió visita después, o sin visita hace más de 30 días (incluye nunca visitadas).
  function pendientesHoy() {
    // Las descartadas nunca son pendientes. Visitada hoy tampoco, ni aunque haya pedido
    // visita: si no, sería la primera parada de la ruta estando parado ahí. Vuelve mañana.
    return censo().filter(f => f.estado !== 'descartada' && f.diasSinVisita > 0 &&
      (f.estado === 'seguimiento' || f.diasSinVisita > DIAS_SIN_VISITA));
  }

  function resumenPor(visitas, claveDe) {
    const mapa = new Map();
    visitas.forEach(v => {
      const k = claveDe(v);
      if (!mapa.has(k)) mapa.set(k, { clave: k, visitas: 0, compras: 0 });
      const fila = mapa.get(k);
      fila.visitas++;
      if (v.resultado === 'compro') fila.compras++;
    });
    return [...mapa.values()].sort((a, b) => b.visitas - a.visitas || a.clave.localeCompare(b.clave, 'es'));
  }

  // dias: 30 para últimos 30 días, 0 para todo el histórico.
  function resumen(dias) {
    const datos = leer();
    const desde = dias ? fechaHaceDias(dias) : '0000-00-00';
    const visitas = datos.visitas.filter(v => v.fecha >= desde);
    const zonaDe = new Map(datos.ferreterias.map(f => [f.id, f.zona || 'Sin zona']));

    // Cliente nuevo = su primera compra registrada cae dentro del periodo.
    const clientesNuevos = [];
    datos.ferreterias.forEach(f => {
      const compras = datos.visitas
        .filter(v => v.ferreteriaId === f.id && v.resultado === 'compro')
        .sort((a, b) => a.fecha.localeCompare(b.fecha));
      if (compras.length && compras[0].fecha >= desde) {
        clientesNuevos.push({ id: f.id, nombre: f.nombre, municipio: f.municipio, zona: f.zona, fecha: compras[0].fecha });
      }
    });
    clientesNuevos.sort((a, b) => b.fecha.localeCompare(a.fecha));

    return {
      visitas: visitas.length,
      compras: visitas.filter(v => v.resultado === 'compro').length,
      porZona: resumenPor(visitas, v => zonaDe.get(v.ferreteriaId) || 'Sin zona'),
      porVendedor: resumenPor(visitas, v => v.vendedor || 'Sin nombre'),
      clientesNuevos: clientesNuevos,
      sinVisitar: censoDe(datos).filter(f => f.estado !== 'descartada' && f.diasSinVisita > DIAS_SIN_VISITA)
    };
  }

  // ---------- vendedor ----------
  function obtenerVendedor() { return leer().vendedorActual; }
  function fijarVendedor(nombre) {
    const datos = leer();
    datos.vendedorActual = recortar('vendedor', nombre);
    guardar(datos);
  }

  // ---------- CSV ----------
  // Columnas reconocidas: id (opcional), nombre, direccion, barrio, municipio, telefono, zona,
  // y opcionalmente lat y lng (punto o coma decimal) y las de COLUMNAS_EXTRA (las mismas
  // que genera api/scripts/buscar-google.mjs y lee app/src/nucleo/csv.js).
  // Separador ; o , (se detecta solo). Exporta con ; para que Excel en español lo abra bien.

  // [columna del CSV, campo de la ferretería]
  const COLUMNAS_EXTRA = [
    ['tipo', 'tipo'], ['encargado', 'encargado'], ['whatsapp', 'whatsapp'], ['correo', 'correo'],
    ['categoria', 'categoria'], ['cliente_socoda', 'clienteSocoda'], ['vendedor_asignado', 'vendedorAsignado'],
    ['google_place_id', 'googlePlaceId'], ['web', 'web'], ['horario', 'horario'],
    ['calificacion', 'calificacion'], ['resenas', 'resenas'],
    ['descartada', 'descartada'], ['descartada_por', 'descartadaPor'], ['descartada_fecha', 'descartadaFecha']
  ];
  const COLUMNAS = CAMPOS.map(c => [c, c]).concat(COLUMNAS_EXTRA);
  // Coordenadas y calificación con coma decimal, como las escribe y lee Excel en español.
  function textoCelda(k, v) {
    if (v == null) return '';
    if (k === 'clienteSocoda') return v ? 'si' : 'no';
    if (k === 'lat' || k === 'lng' || k === 'calificacion') return String(v).replace('.', ',');
    return v;
  }
  function celdaCSV(v) {
    const s = String(v == null ? '' : v);
    return /[";\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }
  function exportarCSV() {
    const cols = [['id', 'id']].concat(CAMPOS.map(c => [c, c]), [['lat', 'lat'], ['lng', 'lng']], COLUMNAS_EXTRA);
    const filas = [cols.map(c => c[0]).join(';')].concat(
      leer().ferreterias.map(f => cols.map(([, k]) => celdaCSV(textoCelda(k, f[k]))).join(';'))
    );
    return '﻿' + filas.join('\r\n');
  }

  function parsearCSV(texto) {
    texto = texto.replace(/^﻿/, '');
    const primera = texto.split(/\r?\n/)[0] || '';
    const sep = (primera.match(/;/g) || []).length > (primera.match(/,/g) || []).length ? ';' : ',';
    const filas = [];
    let fila = [], campo = '', comillas = false;
    for (let i = 0; i < texto.length; i++) {
      const c = texto[i];
      if (comillas) {
        if (c === '"' && texto[i + 1] === '"') { campo += '"'; i++; }
        else if (c === '"') comillas = false;
        else campo += c;
      } else if (c === '"') {
        comillas = true;
      } else if (c === sep) {
        fila.push(campo); campo = '';
      } else if (c === '\n' || c === '\r') {
        if (c === '\r' && texto[i + 1] === '\n') i++;
        fila.push(campo); filas.push(fila);
        fila = []; campo = '';
      } else {
        campo += c;
      }
    }
    if (campo || fila.length) { fila.push(campo); filas.push(fila); }
    return filas.filter(f => f.some(c => c.trim() !== ''));
  }

  // Actualiza por id, o por nombre + dirección + municipio. Solo toca las columnas presentes en el archivo.
  function importarCSV(texto) {
    const filas = parsearCSV(texto);
    if (filas.length < 2) throw new Error('El archivo no tiene filas de datos');
    const enc = filas[0].map(h => normaliza(h).replace(/ /g, '_'));
    if (!enc.includes('nombre')) throw new Error('Falta la columna "nombre"');
    const presentes = COLUMNAS.filter(([col]) => enc.includes(col));
    const conUbicacion = enc.includes('lat') && enc.includes('lng');
    const datos = leer();
    const cont = { nuevas: 0, actualizadas: 0, omitidas: 0 };

    filas.slice(1).forEach(fila => {
      const r = {};
      enc.forEach((h, i) => { r[h] = limpiar(fila[i]); });
      if (!r.nombre) { cont.omitidas++; return; }
      const existente = (r.id && datos.ferreterias.find(x => x.id === r.id)) ||
                        datos.ferreterias.find(x => claveDup(x) === claveDup(r));
      if (existente) {
        const cambios = {};
        presentes.forEach(([col, k]) => { cambios[k] = r[col]; });
        // Una celda de ubicación vacía no borra la que ya estaba guardada.
        const c = conUbicacion ? validarCoordenadas(r.lat, r.lng) : null;
        const ubic = c && c.lat != null ? c : { lat: existente.lat, lng: existente.lng };
        Object.assign(existente, construirFerreteria(Object.assign({}, existente, cambios, ubic), existente.id));
        encolar(datos, 'ferreterias', existente);
        cont.actualizadas++;
      } else {
        const campos = {};
        presentes.forEach(([col, k]) => { campos[k] = r[col]; });
        const nueva = construirFerreteria(Object.assign(campos, { lat: r.lat, lng: r.lng }), r.id || nuevoId('f_'));
        datos.ferreterias.push(nueva);
        encolar(datos, 'ferreterias', nueva);
        cont.nuevas++;
      }
    });
    guardar(datos);
    return cont;
  }

  // ---------- respaldo JSON ----------
  // La clave del equipo nunca sale en el respaldo.
  function exportarBackup() {
    const d = leer();
    delete d.claveEquipo;
    return JSON.stringify(d, null, 2);
  }
  function importarBackup(texto) {
    const d = JSON.parse(texto);
    if (!d || !Array.isArray(d.ferreterias) || !Array.isArray(d.visitas)) {
      throw new Error('El archivo no es un respaldo de SOCODA');
    }
    const actual = leer();
    const nuevo = Object.assign(vacio(), d, {
      semilla: true,
      modo: actual.modo,
      claveEquipo: actual.claveEquipo,
      ultimaSync: actual.ultimaSync,
      pendientes: vacio().pendientes
    });
    // En modo servidor, restaurar = volver a enviar todo (las visitas no se duplican).
    nuevo.ferreterias.forEach(f => encolar(nuevo, 'ferreterias', f));
    nuevo.visitas.forEach(v => encolar(nuevo, 'visitas', v));
    guardar(nuevo);
  }

  // ---------- servidor y sincronización ----------
  const CABECERAS = { 'ngrok-skip-browser-warning': '1' };

  // 'servidor': la sirve el API de Ruta-viva. 'local': servidor estático sin API.
  // 'desconocido': sin conexión; se queda con lo que ya sabía.
  async function detectarServidor() {
    let modo = 'desconocido';
    try {
      const r = await fetch('api/salud', { cache: 'no-store', headers: CABECERAS });
      const j = await r.json().catch(() => null);
      modo = j && j.app === 'ruta-viva' ? 'servidor' : 'local';
    } catch (e) {
      modo = 'desconocido';
    }
    if (modo === 'servidor') {
      const datos = leer();
      if (datos.modo !== 'servidor') { datos.modo = 'servidor'; guardar(datos); }
    }
    return leer().modo === 'servidor' ? 'servidor' : modo;
  }

  function fijarClaveEquipo(clave) {
    const datos = leer();
    datos.claveEquipo = limpiar(clave);
    guardar(datos);
  }

  function estadoSync() {
    const d = leer();
    return {
      modo: d.modo === 'servidor' ? 'servidor' : 'local',
      tieneClave: !!d.claveEquipo,
      pendientes: Object.keys(d.pendientes.ferreterias).length + Object.keys(d.pendientes.visitas).length,
      ultimaSync: d.ultimaSync
    };
  }

  function superponer(lista, pendientes) {
    const mapa = new Map(lista.map(x => [x.id, x]));
    Object.values(pendientes).forEach(p => mapa.set(p.id, p));
    return [...mapa.values()];
  }

  let enCurso = null;
  // Una sola sincronización a la vez; las llamadas simultáneas comparten el resultado.
  function sincronizar() {
    if (!enCurso) enCurso = hacerSync().finally(() => { enCurso = null; });
    return enCurso;
  }

  async function hacerSync() {
    const datos = leer();
    if (datos.modo !== 'servidor') return { estado: 'local' };
    if (!datos.claveEquipo) return { estado: 'sin-clave' };

    const lote = {
      ferreterias: Object.values(datos.pendientes.ferreterias),
      visitas: Object.values(datos.pendientes.visitas)
    };
    let res;
    try {
      res = await fetch('api/sync', {
        method: 'POST',
        cache: 'no-store',
        headers: Object.assign({ 'Content-Type': 'application/json', 'X-Clave-Equipo': datos.claveEquipo }, CABECERAS),
        body: JSON.stringify(lote)
      });
    } catch (e) {
      return { estado: 'sin-conexion' };
    }
    if (res.status === 401) return { estado: 'clave-incorrecta' };
    if (!res.ok) return { estado: 'error', mensaje: 'El servidor respondió ' + res.status };
    const resp = await res.json();

    // Lo enviado ya está en la respuesta (o fue rechazado): sale de la cola, salvo
    // que haya cambiado mientras viajaba. Lo nuevo sigue pendiente y se superpone.
    const actual = leer();
    ['ferreterias', 'visitas'].forEach(tipo => {
      const enviados = new Map(lote[tipo].map(r => [r.id, JSON.stringify(r)]));
      Object.keys(actual.pendientes[tipo]).forEach(id => {
        if (enviados.get(id) === JSON.stringify(actual.pendientes[tipo][id])) delete actual.pendientes[tipo][id];
      });
    });
    actual.ferreterias = superponer(resp.ferreterias || [], actual.pendientes.ferreterias);
    actual.visitas = superponer(resp.visitas || [], actual.pendientes.visitas);
    actual.ultimaSync = new Date().toISOString();
    guardar(actual);
    return { estado: 'ok', rechazadas: resp.rechazadas || [] };
  }

  // ---------- datos de ejemplo ----------
  // Solo en modo local: nunca se mezclan datos ficticios con el censo real del servidor.
  async function cargarSemillaSiVacio(modo) {
    const datos = leer();
    if (modo !== 'local' || datos.modo === 'servidor' || datos.semilla || datos.ferreterias.length) return false;
    const res = await fetch('data/ferreterias.json');
    if (!res.ok) throw new Error('No se pudo leer data/ferreterias.json');
    datos.ferreterias = await res.json();
    datos.semilla = true;
    guardar(datos);
    return true;
  }

  global.DB = {
    RESULTADOS: RESULTADOS,
    LINEAS: LINEAS,
    ESTADOS: ESTADOS,
    TIPOS: TIPOS,
    CATEGORIAS: CATEGORIAS,
    DESCARTES: DESCARTES,
    descartarFerreteria: descartarFerreteria,
    reactivarFerreteria: reactivarFerreteria,
    LIMITES: LIMITES,
    DIAS_SIN_VISITA: DIAS_SIN_VISITA,
    hoyISO: hoyISO,
    diasDesde: diasDesde,
    censo: censo,
    pendientesHoy: pendientesHoy,
    guardarFerreteria: guardarFerreteria,
    guardarUbicacion: guardarUbicacion,
    registrarVisita: registrarVisita,
    resumen: resumen,
    obtenerVendedor: obtenerVendedor,
    fijarVendedor: fijarVendedor,
    exportarCSV: exportarCSV,
    importarCSV: importarCSV,
    exportarBackup: exportarBackup,
    importarBackup: importarBackup,
    detectarServidor: detectarServidor,
    fijarClaveEquipo: fijarClaveEquipo,
    estadoSync: estadoSync,
    sincronizar: sincronizar,
    cargarSemillaSiVacio: cargarSemillaSiVacio
  };
})(window);
