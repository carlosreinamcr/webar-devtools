# JavaScript diagnostic console for WebAR experiences - WebAR DevTools

WebAR DevTools is a lightweight JavaScript diagnostic console for WebAR experiences. It helps developers inspect camera access, WebGL support, network requests, asset loading, performance, MindAR tracking events, marker stability, compatibility, and technical reports directly inside the browser.

Created by **IngCarlosReina** for the community of **Realidad Aumentada Empezando desde Cero**.

- Website: https://realidad-aumentada.com.co
- Blog: https://blog.realidad-aumentada.com.co
- Version: `1.0.0`

---

## English

### What Is WebAR DevTools?

WebAR DevTools is a browser-based diagnostic tool for WebAR applications. It works especially well with projects built with **MindAR**, **A-Frame**, and **Three.js**, but it can also help debug other WebAR experiences.

The goal of this tool is not only to show errors. It also explains possible causes and suggests practical solutions.

### Why It Matters

WebAR applications depend on several fragile browser features: camera permissions, HTTPS, WebGL, mobile GPU performance, network speed, 3D assets, marker tracking, and device compatibility. A project may work perfectly on desktop but fail on mobile because of permissions, heavy models, unstable tracking, CORS issues, or low FPS.

WebAR DevTools makes those problems visible.

### Main Diagnostic Features

- Environment diagnostics: detects `file://`, insecure contexts, missing HTTPS, and localhost conditions.
- Camera diagnostics: monitors `getUserMedia`, permission status, camera errors, resolution, and facing mode.
- WebGL and GPU diagnostics: checks WebGL/WebGL2 availability, context loss, max texture size, draw calls, triangles, and pixel ratio.
- Performance monitor: tracks FPS, JavaScript memory, long tasks, draw calls, triangle count, and rendering pressure.
- Network monitor: intercepts `fetch` and `XMLHttpRequest`, detects failed requests, slow assets, 404 errors, server errors, and CORS-like failures.
- Asset analyzer: reviews `.glb`, `.gltf`, `.mind`, images, textures, videos, scripts, CSS, and WASM resources.
- MindAR mode: detects MindAR usage and validates key checks such as `mindar-image`, `mindar-face`, `imageTargetSrc`, `.mind` loading, camera access, and target tracking.
- Marker diagnostics: counts marker found/lost events, flickering, stable tracking duration, and visible time.
- AR event monitor: captures events such as `targetFound`, `targetLost`, `arReady`, `arError`, `camera-init`, `camera-error`, and `renderstart`.
- AR session timeline: shows the order of important events such as script loaded, camera granted, `.mind` loaded, model loaded, marker found, and marker lost.
- Device compatibility test: classifies the current device as `Apto`, `Limitado`, or `No recomendado`.
- Suggested code fixes: provides snippets for common WebAR problems such as `playsinline`, A-Frame asset timeout, MindAR target setup, HTTPS usage, and renderer pixel ratio.
- Technical report: exports a JSON report with summary, metrics, hardware, logs, events, timeline, assets, MindAR checks, and network data.

### Installation

Add the script to your WebAR page:

```html
<script src="./webar-devtools.js"></script>
or
<script src="./webar-devtools.min.js"></script>
```




### Public API

The script exposes a global object:

```js
WebARDevTools.open();
WebARDevTools.close();
WebARDevTools.scan();
WebARDevTools.addLog(level, category, text, detail, solution, meta);
WebARDevTools.addEvent(name, source, detail, solution);
WebARDevTools.addTimeline(step, status, detail);
WebARDevTools.exportReport();
WebARDevTools.state;
```

### Recommended Use Cases

- Debugging MindAR image tracking projects.
- Testing WebAR apps on mobile browsers.
- Detecting camera permission problems.
- Finding heavy 3D models and textures.
- Diagnosing WebGL and GPU limitations.
- Creating technical reports for clients or support teams.
- Improving WebAR performance before publishing.

### Browser Requirements

WebAR DevTools works in modern browsers with JavaScript enabled. Some diagnostics depend on browser support for APIs such as:

- `getUserMedia`
- `WebGLRenderingContext`
- `PerformanceObserver`
- `navigator.connection`
- `navigator.getBattery`

Not all browsers expose the same information, especially on iOS.

### Support The Project

- Nequi: **315-969-9392**
- PayPal: https://www.paypal.com/paypalme/realidadaumentada
- Buy Me a Coffee: https://www.buymeacoffee.com/ingcarlosreina
- Patreon: https://www.patreon.com/c/realidadaumentadaempezandodesdecero

---

## Español

### ¿Qué Es WebAR DevTools?

WebAR DevTools es una herramienta de diagnóstico basada en JavaScript para aplicaciones de realidad aumentada web. Funciona especialmente bien con proyectos creados con **MindAR**, **A-Frame** y **Three.js**, aunque también puede ayudar a depurar otras experiencias WebAR.

El objetivo de esta herramienta no es solo mostrar errores. También explica posibles causas y propone soluciones prácticas.

### Por Qué Es Importante

Las aplicaciones WebAR dependen de varias partes delicadas del navegador: permisos de cámara, HTTPS, WebGL, rendimiento de GPU móvil, velocidad de red, assets 3D, tracking de marcadores y compatibilidad del dispositivo. Un proyecto puede funcionar bien en escritorio y fallar en móvil por permisos, modelos pesados, tracking inestable, errores CORS o bajo rendimiento.

WebAR DevTools hace visibles esos problemas.

### Herramientas De Diagnóstico Incluidas

- Diagnóstico del entorno: detecta `file://`, contextos inseguros, falta de HTTPS y uso de localhost.
- Diagnóstico de cámara: monitorea `getUserMedia`, permisos, errores de cámara, resolución y `facingMode`.
- Diagnóstico WebGL y GPU: revisa WebGL/WebGL2, pérdida de contexto, tamaño máximo de textura, draw calls, triángulos y pixel ratio.
- Monitor de rendimiento: mide FPS, memoria JavaScript, long tasks, draw calls, triángulos y carga de render.
- Monitor de red: intercepta `fetch` y `XMLHttpRequest`, detecta peticiones fallidas, assets lentos, errores 404, errores de servidor y posibles bloqueos CORS.
- Analizador de assets: revisa recursos `.glb`, `.gltf`, `.mind`, imágenes, texturas, videos, scripts, CSS y WASM.
- Modo MindAR: detecta MindAR y valida `mindar-image`, `mindar-face`, `imageTargetSrc`, carga de `.mind`, cámara y tracking.
- Diagnóstico de marcador: cuenta eventos de marcador encontrado/perdido, parpadeos, duración estable y tiempo visible.
- Monitor de eventos AR: captura `targetFound`, `targetLost`, `arReady`, `arError`, `camera-init`, `camera-error` y `renderstart`.
- Timeline de sesión AR: muestra el orden de eventos importantes como script cargado, cámara concedida, `.mind` cargado, modelo cargado, marcador encontrado y marcador perdido.
- Prueba de compatibilidad: clasifica el dispositivo como `Apto`, `Limitado` o `No recomendado`.
- Sugerencias de código: muestra snippets para problemas comunes como `playsinline`, timeout de A-Frame, configuración MindAR, uso de HTTPS y pixel ratio del renderer.
- Reporte técnico: exporta un JSON con resumen, métricas, hardware, logs, eventos, timeline, assets, checks MindAR y datos de red.

### Instalación

Agrega el script a tu página WebAR:

```html
<script src="./webar-devtools.js"></script>
o puedes utilizar
<script src="./webar-devtools.min.js"></script>
```

### API Pública

El script expone un objeto global:

```js
WebARDevTools.open();
WebARDevTools.close();
WebARDevTools.scan();
WebARDevTools.addLog(level, category, text, detail, solution, meta);
WebARDevTools.addEvent(name, source, detail, solution);
WebARDevTools.addTimeline(step, status, detail);
WebARDevTools.exportReport();
WebARDevTools.state;
```

### Ejemplo: Evento AR Personalizado

```js
WebARDevTools.addEvent(
  "Interacción personalizada con marcador",
  "Mi app WebAR",
  "El usuario tocó el modelo 3D",
  "Usa este evento para entender el comportamiento del usuario dentro de la experiencia AR."
);
```

### Casos De Uso Recomendados

- Depurar proyectos de tracking con MindAR.
- Probar aplicaciones WebAR en navegadores móviles.
- Detectar problemas de permisos de cámara.
- Encontrar modelos 3D y texturas demasiado pesadas.
- Diagnosticar limitaciones WebGL y GPU.
- Crear reportes técnicos para clientes o equipos de soporte.
- Optimizar experiencias WebAR antes de publicarlas.

### Requisitos Del Navegador

WebAR DevTools funciona en navegadores modernos con JavaScript habilitado. Algunos diagnósticos dependen del soporte de APIs como:

- `getUserMedia`
- `WebGLRenderingContext`
- `PerformanceObserver`
- `navigator.connection`
- `navigator.getBattery`

No todos los navegadores exponen la misma información, especialmente en iOS.

### Apoya El Proyecto

- Nequi: **315-969-9392**
- PayPal: https://www.paypal.com/paypalme/realidadaumentada
- Buy Me a Coffee: https://www.buymeacoffee.com/ingcarlosreina
- Patreon: https://www.patreon.com/c/realidadaumentadaempezandodesdecero

---

## License / Licencia

//WebAR Devetools.js Es una herramienta de diagnostico creada por IngCarlosReina de Realidad Aumentada Empezando Desde Cero.
//Creative Commons Atribución-NoComercial (CC BY-NC 4.0) y PolyForm Noncommercial License.  Solo permitida para el uso comercial de su creador IngCarlosReina.
//Sitio Web oficial: https://realidad-aumentada.com.co
//Blog de Realidad Aumentada: https://blog.realidad-aumentada.com.co
//Gracias por apoyar mi trabajo con tus donaciones.

