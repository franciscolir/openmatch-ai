# OpenMatch AI

MVP local-first para análisis táctico de fútbol en el navegador. Incluye detección local de personas y balón, pose, tracking persistente con IDs estables y calibración manual de cancha para convertir píxeles en metros.

## Ejecutar localmente

La cámara y el Service Worker requieren un origen seguro: `https://` o `http://localhost`.

```bash
npm run dev
```

Para validar la compilación de producción:

```bash
npm test
npm run build
```

Luego permite el acceso a la cámara en el navegador. Selecciona una fuente y usa **Iniciar análisis** para ejecutar el modelo en el dispositivo. Los modelos y el runtime WASM se sirven localmente; tras descargarse, el Service Worker los conserva para uso offline posterior.

## Arquitectura inicial

- `src/core`: composición de la aplicación y eventos.
- `src/modules`: módulos aislados por responsabilidad.
- `src/workers`: inferencia de visión separada de la interfaz.
- `src/config`: perfiles de cadencia y resolución de análisis.
- `src/styles`: presentación global.
- `src/assets`: recursos visuales locales.

La inferencia usa MediaPipe Tasks Vision encapsulado en un worker y publica resultados normalizados mediante eventos. El tracking asocia detecciones por IoU y distancia entre centros, conserva IDs y tolera oclusiones cortas.

## Calibración de cancha

Pulsa **Calibrar cancha** y marca cuatro esquinas en este orden: superior izquierda, superior derecha, inferior derecha e inferior izquierda. Ajusta el largo y ancho reales antes de calibrar. La proyección de cada track usa el centro inferior de su caja como contacto estimado con el césped, y solo se reporta `fieldPosition` cuando cae dentro de los límites de la cancha.

## Métricas y visualización (Fase 4)

El módulo de métricas acumula distancia, velocidad y posición media por jugador a partir de `tracking.updated`, etiquetando cada estimación con `confidence` (score de detección en cancha) y `quality` (`high` ≥0.7, `medium` ≥0.5, `low`). La vista táctica dibuja el esqueleto de la cancha a escala y proyecta los tracks (Equipo A/B por mitad de cancha, balón en ámbar); el mapa de calor acumula posiciones en una rejilla y las colorea por densidad. El dashboard muestra distancia total, velocidad máxima y posesión aproximada (equipo más cercano al balón por frame).

## Persistencia (Fase 5)

Cada sesión de análisis se guarda en IndexedDB (`openmatch-ai`) con resumen de modo, dimensiones de cancha, duración, distancia, velocidad máxima y posesión. El panel de historial lista las sesiones y permite eliminarlas. El modo y las dimensiones de cancha se restauran al recargar.
