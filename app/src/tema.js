// Colores de SOCODA medidos en socoda.com.co (los mismos de web/styles.css).
// Acciones en rojo; selecciones en grafito, para que no todo sea rojo.
export const color = {
  marca: '#e90128',        // logo y acciones principales (blanco encima: contraste 4,7:1)
  marcaTexto: '#ffffff',
  marcaOscuro: '#940002',  // barra superior del sitio
  grafito: '#23292c',      // botón "Comprar ahora" del sitio: selecciones
  grafitoTexto: '#ffffff',
  fondo: '#ffffff',
  superficie: '#f8f8f8',
  texto: '#1f1f1f',
  suave: '#4d4d4d',
  linea: '#dcdcdc',
  lineaFuerte: '#8c8c8c',
  okFondo: '#dcfce7',
  okTexto: '#14532d',
  avisoFondo: '#fff4cc',
  avisoTexto: '#5c3d00',
  infoFondo: '#eceeef',
  sombra: '#000000',
  // Pines del mapa: qué tiene que hacer el vendedor en cada ferretería
  pin: {
    rojo: '#e90128',       // pendiente
    amarillo: '#f2b600',   // pidió visita después
    verde: '#1f9d55',      // cliente
    gris: '#8c8c8c'        // visitada hace poco
  },
  yo: '#1a73e8'            // el vendedor (azul, como en Google Maps)
};

export const radio = { chico: 10, normal: 14, pastilla: 999 };

// Altura mínima de todo lo que se toca con el dedo.
export const TOQUE = 48;

export const letra = {
  titulo: 24,
  subtitulo: 18,
  normal: 17,
  chica: 15,
  mini: 13
};
