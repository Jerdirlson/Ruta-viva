/*
 * Capa de datos de SOCODA.
 * Fase 1: localStorage. Para migrar a una base real, reemplazar leer() y guardar()
 * y mantener la misma API pública para app.js.
 */
(function (global) {
  'use strict';

  const CLAVE = 'socoda.v1';
  const DIAS_SIN_VISITA = 30;
  const CAMPOS = ['nombre', 'direccion', 'barrio', 'municipio', 'telefono', 'zona'];

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
    cliente: 'Cliente'
  };

  // ---------- utilidades ----------
  const tiene = (obj, k) => Object.prototype.hasOwnProperty.call(obj, k);
  function limpiar(s) { return String(s == null ? '' : s).trim(); }
  function normaliza(s) {
    return limpiar(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ');
  }
  function nuevoId(prefijo) {
    return prefijo + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
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
    return { ferreterias: [], visitas: [], vendedorActual: '', semilla: false };
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

  // ---------- ferreterías ----------
  function claveDup(f) {
    return [normaliza(f.nombre), normaliza(f.direccion), normaliza(f.municipio)].join('|');
  }
  function construirFerreteria(f, id) {
    return {
      id: id,
      nombre: limpiar(f.nombre),
      direccion: limpiar(f.direccion),
      barrio: limpiar(f.barrio),
      municipio: limpiar(f.municipio),
      telefono: limpiar(f.telefono),
      zona: limpiar(f.zona)
    };
  }
  function guardarFerreteria(f) {
    const datos = leer();
    const id = f.id || nuevoId('f_');
    const reg = construirFerreteria(f, id);
    if (!reg.nombre) throw new Error('El nombre es obligatorio');
    const i = datos.ferreterias.findIndex(x => x.id === id);
    if (i >= 0) datos.ferreterias[i] = reg; else datos.ferreterias.push(reg);
    guardar(datos);
    return reg;
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
      vendedor: limpiar(v.vendedor),
      resultado: v.resultado,
      lineas: (Array.isArray(v.lineas) ? v.lineas : []).filter(l => tiene(LINEAS, l)),
      competencia: limpiar(v.competencia),
      notas: limpiar(v.notas),
      creada: new Date().toISOString()
    };
    datos.visitas.push(visita);
    guardar(datos);
    return visita;
  }

  function ordenVisitas(a, b) {
    return b.fecha.localeCompare(a.fecha) || (b.creada || '').localeCompare(a.creada || '');
  }
  function estadoDe(ultima) {
    if (!ultima) return 'nueva';
    if (ultima.resultado === 'compro') return 'cliente';
    if (ultima.resultado === 'pidio_visita') return 'seguimiento';
    return 'visitada';
  }
  // Ferreterías enriquecidas con visitas, última visita, estado y días sin visita.
  function censoDe(datos) {
    return datos.ferreterias.map(f => {
      const visitas = datos.visitas.filter(v => v.ferreteriaId === f.id).sort(ordenVisitas);
      const ultima = visitas[0] || null;
      return Object.assign({}, f, {
        visitas: visitas,
        ultima: ultima,
        estado: estadoDe(ultima),
        diasSinVisita: diasDesde(ultima ? ultima.fecha : null)
      });
    });
  }
  function censo() { return censoDe(leer()); }

  // Pendientes de hoy: pidió visita después, o sin visita hace más de 30 días (incluye nunca visitadas).
  function pendientesHoy() {
    return censo().filter(f => f.estado === 'seguimiento' || f.diasSinVisita > DIAS_SIN_VISITA);
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
      sinVisitar: censoDe(datos).filter(f => f.diasSinVisita > DIAS_SIN_VISITA)
    };
  }

  // ---------- vendedor ----------
  function obtenerVendedor() { return leer().vendedorActual; }
  function fijarVendedor(nombre) {
    const datos = leer();
    datos.vendedorActual = limpiar(nombre).slice(0, 60);
    guardar(datos);
  }

  // ---------- CSV ----------
  // Columnas reconocidas: id (opcional), nombre, direccion, barrio, municipio, telefono, zona.
  // Separador ; o , (se detecta solo). Exporta con ; para que Excel en español lo abra bien.
  function celdaCSV(v) {
    const s = String(v == null ? '' : v);
    return /[";\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }
  function exportarCSV() {
    const cabecera = ['id'].concat(CAMPOS);
    const filas = [cabecera.join(';')].concat(
      leer().ferreterias.map(f => cabecera.map(c => celdaCSV(f[c] || (c === 'id' ? f.id : ''))).join(';'))
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
    const campos = CAMPOS.filter(c => enc.includes(c));
    const datos = leer();
    const cont = { nuevas: 0, actualizadas: 0, omitidas: 0 };

    filas.slice(1).forEach(fila => {
      const r = {};
      enc.forEach((h, i) => { r[h] = limpiar(fila[i]); });
      if (!r.nombre) { cont.omitidas++; return; }
      const existente = (r.id && datos.ferreterias.find(x => x.id === r.id)) ||
                        datos.ferreterias.find(x => claveDup(x) === claveDup(r));
      if (existente) {
        campos.forEach(c => { existente[c] = r[c]; });
        cont.actualizadas++;
      } else {
        datos.ferreterias.push(construirFerreteria(r, r.id || nuevoId('f_')));
        cont.nuevas++;
      }
    });
    guardar(datos);
    return cont;
  }

  // ---------- respaldo JSON ----------
  function exportarBackup() { return JSON.stringify(leer(), null, 2); }
  function importarBackup(texto) {
    const d = JSON.parse(texto);
    if (!d || !Array.isArray(d.ferreterias) || !Array.isArray(d.visitas)) {
      throw new Error('El archivo no es un respaldo de SOCODA');
    }
    guardar(Object.assign(vacio(), d, { semilla: true }));
  }

  // ---------- datos de ejemplo ----------
  async function cargarSemillaSiVacio() {
    const datos = leer();
    if (datos.semilla || datos.ferreterias.length) return false;
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
    DIAS_SIN_VISITA: DIAS_SIN_VISITA,
    hoyISO: hoyISO,
    diasDesde: diasDesde,
    censo: censo,
    pendientesHoy: pendientesHoy,
    guardarFerreteria: guardarFerreteria,
    registrarVisita: registrarVisita,
    resumen: resumen,
    obtenerVendedor: obtenerVendedor,
    fijarVendedor: fijarVendedor,
    exportarCSV: exportarCSV,
    importarCSV: importarCSV,
    exportarBackup: exportarBackup,
    importarBackup: importarBackup,
    cargarSemillaSiVacio: cargarSemillaSiVacio
  };
})(window);
