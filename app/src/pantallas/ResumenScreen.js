// Resumen del equipo: cifras del periodo, actividad por día, resultados, vendedores,
// cobertura por zona o municipio, líneas, competencia y lo que hay que hacer.
// Las cuentas están en nucleo/estadisticas.js (probadas en Node).
import React, { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { color, letra, radio } from '../tema';
import { estadisticas, vendedoresDe, PERIODOS } from '../nucleo/estadisticas';
import { useApp } from '../estado/AppContext';
import { Opcion } from '../componentes/ui';
import { fechaCorta } from '../componentes/TarjetaFerreteria';

const ALTO_GRAFICA = 120;

function Cifra({ valor, texto, detalle }) {
  return (
    <View style={s.cifra}>
      <Text style={s.cifraNumero}>{valor}</Text>
      <Text style={s.cifraTexto}>{texto}</Text>
      {detalle ? <Text style={s.cifraDetalle}>{detalle}</Text> : null}
    </View>
  );
}

// Barra horizontal: el largo es la proporción; el número va en texto, no en color.
function Barra({ etiqueta, valor, max, detalle, onPress }) {
  const ancho = max ? Math.max(valor ? 2 : 0, Math.round(100 * valor / max)) : 0;
  const contenido = (
    <View style={s.barraFila}>
      <View style={s.barraCab}>
        <Text style={s.barraEtiqueta} numberOfLines={1}>{etiqueta}</Text>
        <Text style={s.barraValor}>{detalle || String(valor)}</Text>
      </View>
      <View style={s.barraFondo}><View style={[s.barra, { width: ancho + '%' }]} /></View>
    </View>
  );
  return onPress
    ? <Pressable onPress={onPress} accessibilityRole="button" style={({ pressed }) => pressed && { opacity: 0.7 }}>{contenido}</Pressable>
    : contenido;
}

// Visitas por día. Una sola serie; tocar una barra muestra el día y sus números.
function Actividad({ porDia }) {
  const [elegido, setElegido] = useState(null);
  const max = Math.max(1, ...porDia.map(d => d.visitas));
  const total = porDia.reduce((n, d) => n + d.visitas, 0);
  const dia = elegido != null ? porDia[elegido] : null;
  return (
    <View style={s.tarjeta}>
      <Text style={s.graficaInfo}>
        {dia
          ? fechaCorta(dia.fecha) + ': ' + dia.visitas + (dia.visitas === 1 ? ' visita' : ' visitas') + ' · ' + dia.compras + (dia.compras === 1 ? ' compra' : ' compras')
          : total ? 'Toca una barra para ver el día' : 'Sin visitas en estos días'}
      </Text>
      <View style={s.grafica}>
        <Text style={s.graficaMax}>{max}</Text>
        {porDia.map((d, i) => (
          <Pressable key={d.fecha} style={s.columna} onPress={() => setElegido(i === elegido ? null : i)}
            accessibilityLabel={fechaCorta(d.fecha) + ': ' + d.visitas + ' visitas'} hitSlop={{ top: 8, bottom: 8 }}>
            <View style={[s.columnaBarra, { height: d.visitas ? Math.max(4, Math.round(ALTO_GRAFICA * d.visitas / max)) : 0 },
              i === elegido && { backgroundColor: color.marca }]} />
          </Pressable>
        ))}
      </View>
      <View style={s.graficaEje}>
        <Text style={s.ejeTexto}>{fechaCorta(porDia[0].fecha)}</Text>
        <Text style={s.ejeTexto}>{fechaCorta(porDia[porDia.length - 1].fecha)}</Text>
      </View>
    </View>
  );
}

function Seccion({ titulo, children }) {
  return (
    <View style={{ gap: 8 }}>
      <Text style={s.subtitulo}>{titulo}</Text>
      {children}
    </View>
  );
}

export default function ResumenScreen({ navigation }) {
  const { datos } = useApp();
  const [dias, setDias] = useState(30);
  const [vendedor, setVendedor] = useState('');
  const e = useMemo(() => estadisticas(datos, { dias, vendedor }), [datos, dias, vendedor]);
  const nombres = useMemo(() => vendedoresDe(datos), [datos]);
  const abrir = id => navigation.navigate('Ficha', { id });
  const maxResultado = Math.max(...e.resultados.map(r => r.visitas));
  const maxVendedor = Math.max(0, ...e.porVendedor.map(v => v.visitas));
  const maxLinea = Math.max(0, ...e.lineas.map(l => l.visitas));
  const maxMarca = Math.max(0, ...e.competencia.map(c => c.visitas));
  const vacio = <Text style={s.vacio}>Sin visitas en este periodo.</Text>;

  return (
    <ScrollView style={s.pantalla} contentContainerStyle={s.contenido}>
      <Text style={s.titulo}>Resumen</Text>

      <View style={s.fila}>
        {PERIODOS.map(([d, t]) => (
          <Opcion key={d} chica titulo={t} activa={dias === d} onPress={() => setDias(d)} estilo={{ flex: 1 }} testID={'periodo-' + d} />
        ))}
      </View>
      {nombres.length > 1 ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.fila}>
          <Opcion chica titulo="Todo el equipo" activa={!vendedor} onPress={() => setVendedor('')} />
          {nombres.map(n => <Opcion key={n} chica titulo={n} activa={vendedor === n} onPress={() => setVendedor(n)} />)}
        </ScrollView>
      ) : null}
      <Text style={s.rango}>
        {(e.desde ? (dias === 1 ? 'Hoy, ' + fechaCorta(e.hasta) : 'Del ' + fechaCorta(e.desde) + ' al ' + fechaCorta(e.hasta)) : 'Todo el historial') +
          (vendedor ? ' · ' + vendedor : '')}
      </Text>

      <View style={s.cifras}>
        <Cifra valor={e.visitas} texto="Visitas" detalle={e.ferreteriasVisitadas + ' ferreterías distintas'} />
        <Cifra valor={e.compras} texto="Compras" detalle={'Efectividad ' + e.efectividad + '%'} />
        <Cifra valor={e.cobertura + '%'} texto="Cobertura del censo" detalle={e.visitadasActivas + ' de ' + e.activas + ' activas visitadas'} />
        <Cifra valor={e.clientesNuevos.length} texto="Clientes nuevos" detalle={e.clientes + ' clientes en total'} />
      </View>

      {e.porDia.length ? <Seccion titulo="Visitas por día"><Actividad porDia={e.porDia} /></Seccion> : null}

      <Seccion titulo="Resultados">
        {e.visitas ? e.resultados.map(r => (
          <Barra key={r.clave} etiqueta={r.texto} valor={r.visitas} max={maxResultado}
            detalle={r.visitas + ' · ' + Math.round(100 * r.visitas / e.visitas) + '%'} />
        )) : vacio}
      </Seccion>

      {!vendedor ? (
        <Seccion titulo="Por vendedor">
          {e.porVendedor.length ? e.porVendedor.map(v => (
            <Barra key={v.clave} etiqueta={v.clave} valor={v.visitas} max={maxVendedor}
              detalle={v.visitas + ' visitas · ' + v.compras + ' compras · ' + v.efectividad + '%'}
              onPress={() => setVendedor(v.clave)} />
          )) : vacio}
        </Seccion>
      ) : null}

      <Seccion titulo="Cobertura por zona o municipio">
        <Text style={s.ayuda}>Ferreterías visitadas en el periodo, de las activas. Entre paréntesis, las pendientes de hoy.</Text>
        {e.porGrupo.map(g => (
          <Barra key={g.clave} etiqueta={g.clave} valor={g.visitadas} max={g.activas}
            detalle={g.visitadas + ' de ' + g.activas + ' · ' + g.cobertura + '% (' + g.pendientes + ')'} />
        ))}
      </Seccion>

      <Seccion titulo="Líneas que manejan">
        {maxLinea ? e.lineas.map(l => (
          <Barra key={l.clave} etiqueta={l.texto} valor={l.visitas} max={maxLinea} detalle={l.visitas + ' visitas'} />
        )) : <Text style={s.vacio}>Ninguna línea marcada en las visitas del periodo.</Text>}
      </Seccion>

      <Seccion titulo="Competencia vista">
        {e.competencia.length ? e.competencia.map(c => (
          <Barra key={c.clave} etiqueta={c.clave} valor={c.visitas} max={maxMarca} detalle={c.visitas + ' visitas'} />
        )) : <Text style={s.vacio}>Ninguna marca anotada en el periodo.</Text>}
      </Seccion>

      <Seccion titulo={'Pidieron visita (' + e.seguimiento.length + ')'}>
        {e.seguimiento.length ? e.seguimiento.map(f => (
          <Pressable key={f.id} onPress={() => abrir(f.id)} accessibilityRole="button" style={({ pressed }) => [s.item, pressed && { opacity: 0.7 }]}>
            <Text style={s.itemNombre}>{f.nombre}</Text>
            <Text style={s.itemMeta}>{[f.grupo, 'desde el ' + fechaCorta(f.fecha), f.vendedor].filter(Boolean).join(' · ')}</Text>
          </Pressable>
        )) : <Text style={s.vacio}>Ninguna.</Text>}
      </Seccion>

      <Seccion titulo={'Clientes nuevos (' + e.clientesNuevos.length + ')'}>
        {e.clientesNuevos.length ? e.clientesNuevos.map(c => (
          <Pressable key={c.id} onPress={() => abrir(c.id)} accessibilityRole="button" style={({ pressed }) => [s.item, pressed && { opacity: 0.7 }]}>
            <Text style={s.itemNombre}>{c.nombre}</Text>
            <Text style={s.itemMeta}>{[c.grupo, 'compró el ' + fechaCorta(c.fecha), c.vendedor].filter(Boolean).join(' · ')}</Text>
          </Pressable>
        )) : <Text style={s.vacio}>Ninguno en este periodo.</Text>}
      </Seccion>

      <Seccion titulo="Presencia de marcas">
        <Text style={s.ayuda}>
          {'Estado actual, sobre ' + e.marcas.censadas + ' ferreterías censadas (con marcas o exhibidor anotados) de ' + e.marcas.activas + ' activas.'}
        </Text>
        {e.marcas.censadas ? e.marcas.porMarca.filter(m => m.ferreterias || m.clave === 'socoda').map(m => (
          <Barra key={m.clave} etiqueta={m.texto} valor={m.ferreterias} max={e.marcas.censadas}
            detalle={m.ferreterias + ' · ' + m.porcentaje + '%'} />
        )) : <Text style={s.vacio}>Todavía no hay ferreterías censadas.</Text>}
      </Seccion>

      {e.marcas.porGrupo.length ? (
        <Seccion titulo="Presencia por municipio o zona">
          {e.marcas.porGrupo.map(g => (
            <View key={g.clave} style={s.item}>
              <Text style={s.itemNombre}>{g.clave + ' · ' + g.censadas + ' censadas'}</Text>
              <Text style={s.itemMeta}>
                {Object.entries(g.porMarca).filter(([, n]) => n).map(([k, n]) => (e.marcas.porMarca.find(m => m.clave === k) || {}).texto + ' ' + n).join(' · ') || 'Sin marcas anotadas'}
              </Text>
            </View>
          ))}
        </Seccion>
      ) : null}

      {e.marcas.censadas ? (
        <Seccion titulo="Exhibidores SOCODA">
          {e.marcas.exhibidores.map(x => (
            <Barra key={x.clave} etiqueta={x.texto} valor={x.ferreterias} max={e.marcas.censadas} detalle={String(x.ferreterias)} />
          ))}
        </Seccion>
      ) : null}

      {e.marcas.proveedores.length ? (
        <Seccion titulo="Proveedores">
          {e.marcas.proveedores.map(p => (
            <Barra key={p.clave} etiqueta={p.texto} valor={p.ferreterias} max={e.marcas.proveedores[0].ferreterias} detalle={p.ferreterias + ' ferreterías'} />
          ))}
        </Seccion>
      ) : null}

      <Seccion titulo="El censo hoy">
        <View style={s.cifras}>
          <Cifra valor={e.activas} texto="Activas" />
          <Cifra valor={e.pendientes} texto="Pendientes" detalle="Pidieron visita o +30 días" />
          <Cifra valor={e.nuncaVisitadas} texto="Nunca visitadas" />
          <Cifra valor={e.descartadas} texto="Descartadas" detalle="No existen, cerraron o no aplican" />
        </View>
      </Seccion>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  pantalla: { flex: 1, backgroundColor: color.fondo },
  contenido: { padding: 16, gap: 14, paddingBottom: 40 },
  titulo: { fontSize: letra.titulo, fontWeight: '800', color: color.texto },
  subtitulo: { fontSize: letra.subtitulo, fontWeight: '800', color: color.texto, marginTop: 6 },
  fila: { flexDirection: 'row', gap: 8 },
  rango: { fontSize: letra.chica, color: color.suave },
  ayuda: { fontSize: letra.mini, color: color.suave },
  cifras: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  cifra: { flexBasis: '47%', flexGrow: 1, padding: 12, borderRadius: radio.normal, backgroundColor: color.superficie, gap: 2 },
  cifraNumero: { fontSize: 30, fontWeight: '800', color: color.texto, fontVariant: ['tabular-nums'] },
  cifraTexto: { fontSize: letra.chica, fontWeight: '700', color: color.texto },
  cifraDetalle: { fontSize: letra.mini, color: color.suave },
  tarjeta: { padding: 12, borderRadius: radio.normal, borderWidth: 1, borderColor: color.linea, gap: 8 },
  graficaInfo: { fontSize: letra.chica, color: color.texto, fontWeight: '600' },
  grafica: { height: ALTO_GRAFICA, flexDirection: 'row', alignItems: 'flex-end', gap: 2, borderBottomWidth: 1, borderBottomColor: color.lineaFuerte },
  graficaMax: { position: 'absolute', top: 0, left: 0, fontSize: letra.mini, color: color.suave },
  columna: { flex: 1, height: '100%', justifyContent: 'flex-end' },
  columnaBarra: { backgroundColor: color.grafito, borderTopLeftRadius: 4, borderTopRightRadius: 4 },
  graficaEje: { flexDirection: 'row', justifyContent: 'space-between' },
  ejeTexto: { fontSize: letra.mini, color: color.suave },
  barraFila: { gap: 4, paddingVertical: 4 },
  barraCab: { flexDirection: 'row', justifyContent: 'space-between', gap: 8 },
  barraEtiqueta: { flex: 1, fontSize: letra.chica, fontWeight: '700', color: color.texto },
  barraValor: { fontSize: letra.chica, color: color.suave, fontVariant: ['tabular-nums'] },
  barraFondo: { height: 10, borderRadius: 5, backgroundColor: color.superficie, overflow: 'hidden' },
  barra: { height: 10, borderRadius: 5, backgroundColor: color.grafito },
  item: { paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: color.linea },
  itemNombre: { fontSize: letra.normal, fontWeight: '700', color: color.texto },
  itemMeta: { fontSize: letra.chica, color: color.suave },
  vacio: { color: color.suave, fontSize: letra.chica }
});
