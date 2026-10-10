// Preferencias de pantalla que se recuerdan en el celular (filtros, Lista o Mapa).
// Son de este celular y de esta persona: no se sincronizan ni van en los respaldos.
import { useCallback, useEffect, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

const PREFIJO = 'rutaviva.pref.';

// Como useState, pero el valor sobrevive a cerrar la app.
export function usePersistente(clave, inicial) {
  const [valor, setValor] = useState(inicial);
  const cargado = useRef(false);
  useEffect(() => {
    AsyncStorage.getItem(PREFIJO + clave)
      .then(t => { if (t != null && !cargado.current) setValor(JSON.parse(t)); })
      .catch(() => {})
      .finally(() => { cargado.current = true; });
  }, [clave]);
  const fijar = useCallback(v => {
    cargado.current = true;
    setValor(anterior => {
      const nuevo = typeof v === 'function' ? v(anterior) : v;
      AsyncStorage.setItem(PREFIJO + clave, JSON.stringify(nuevo)).catch(() => {});
      return nuevo;
    });
  }, [clave]);
  return [valor, fijar];
}
