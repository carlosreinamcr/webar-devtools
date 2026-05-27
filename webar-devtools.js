//WebAR Devetools.js Es una herramienta de diagnostico creada por IngCarlosReina de Realidad Aumentada Empezando Desde Cero.
//Creative Commons Atribución-NoComercial (CC BY-NC 4.0) y PolyForm Noncommercial License.  Solo permitida para el uso comercial de su creador IngCarlosReina.
//Sitio Web oficial: https://realidad-aumentada.com.co
//Blog de Realidad Aumentada: https://blog.realidad-aumentada.com.co
//Gracias por apoyar mi trabajo con tus donaciones.
(function () {
  'use strict';

  var VERSION = '1.0.0';
  var MAX_LOGS = 150;
  var MAX_NET = 120;
  var MAX_EVENTS = 150;
  var MAX_TIMELINE = 220;
  var USER_CONFIG = window.WebARDevToolsConfig || {};
  var DEFAULT_LINKS = {
    site: 'https://realidad-aumentada.com.co',
    blog: 'https://blog.realidad-aumentada.com.co',
    donations: {
      nequi: 'tel:3159699392',
      paypal: 'https://www.paypal.com/paypalme/realidadaumentada',
      buyMeACoffee: 'https://www.buymeacoffee.com/ingcarlosreina',
      patreon: 'https://www.patreon.com/c/realidadaumentadaempezandodesdecero'
    }
  };
  var PERF_WARN = {
    fps: 24,
    drawCalls: 120,
    triangles: 250000,
    assetBytes: 8 * 1024 * 1024,
    slowMs: 3000,
    longTaskMs: 80
  };

  var state = {
    open: false,
    introSeen: false,
    activeTab: 'summary',
    logs: [],
    network: [],
    events: [],
    timeline: [],
    assets: [],
    assetIndex: Object.create(null),
    seen: Object.create(null),
    metrics: {
      fps: 0,
      rafDrawCalls: 0,
      drawCalls: 0,
      triangles: 0,
      memoryMb: null,
      longTasks: 0,
      lastLongTaskMs: 0
    },
    hardware: {
      secureContext: window.isSecureContext,
      protocol: window.location.protocol,
      cameraRes: 'No detectada',
      cameraFacing: 'Desconocida',
      cameraPermission: 'Sin consultar',
      webgl: 'Buscando...',
      webgl2: false,
      webglLost: false,
      maxTextureSize: null,
      devicePixelRatio: window.devicePixelRatio || 1,
      connection: 'Desconocida',
      battery: 'Desconocida'
    },
    framework: {
      aframe: false,
      mindar: false,
      three: false,
      scripts: []
    },
    marker: {
      foundCount: 0,
      lostCount: 0,
      flickerCount: 0,
      totalVisibleMs: 0,
      maxStableMs: 0,
      currentFoundAt: 0,
      lastFoundAt: 0,
      lastLostAt: 0,
      stableDurations: []
    },
    scanDone: false
  };

  var root = null;
  var panel = null;
  var launcher = null;
  var frames = 0;
  var rafDrawCalls = 0;
  var lastTick = performance.now();
  var scheduledRender = false;
  var domObserver = null;

  function time() {
    return new Date().toLocaleTimeString();
  }

  function escapeHtml(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function clampText(value, max) {
    var text = String(value == null ? '' : value);
    return text.length > max ? text.slice(0, max - 1) + '...' : text;
  }

  function prettyBytes(bytes) {
    if (!bytes || bytes < 0) return '0 KB';
    if (bytes < 1024 * 1024) return Math.round(bytes / 1024) + ' KB';
    return (bytes / 1048576).toFixed(2) + ' MB';
  }

  function getFileName(url) {
    try {
      var clean = String(url).split('#')[0].split('?')[0];
      return decodeURIComponent(clean.substring(clean.lastIndexOf('/') + 1)) || clean;
    } catch (err) {
      return String(url);
    }
  }

  function guessType(url, initiatorType) {
    var clean = String(url || '').split('?')[0].toLowerCase();
    if (/\.(mind)$/.test(clean)) return 'mind target';
    if (/\.(glb|gltf|obj|fbx|usdz)$/.test(clean)) return 'modelo 3D';
    if (/\.(png|jpg|jpeg|webp|gif|ktx2)$/.test(clean)) return 'imagen/textura';
    if (/\.(mp4|webm|mov|m3u8)$/.test(clean)) return 'video';
    if (/\.(wasm)$/.test(clean)) return 'wasm';
    if (/\.(js|mjs)$/.test(clean)) return 'script';
    if (/\.(css)$/.test(clean)) return 'css';
    return initiatorType || 'recurso';
  }

  function fingerprint(category, text, detail) {
    return [category, text, String(detail || '').slice(0, 180)].join('|');
  }

  function confidenceFor(level, category, detail, meta) {
    if (meta && meta.confidence) return meta.confidence;
    if (meta && meta.evidence === 'measured') return 'Alta';
    if (level === 'CRITICO' || level === 'ERROR') return detail ? 'Alta' : 'Media';
    if (/RED|CAMARA|WEBGL|GPU|MINDAR|PESO|FPS|ASSET/.test(category || '')) return 'Alta';
    if (level === 'ATENCION') return 'Media';
    return 'Baja';
  }

  function codeFor(category, text) {
    var cat = String(category || '').toUpperCase();
    var msg = String(text || '').toLowerCase();
    if (cat.indexOf('CAMARA') >= 0) {
      return 'navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" } }, audio: false });';
    }
    if (cat.indexOf('HTTPS') >= 0 || cat.indexOf('CORS') >= 0 || cat.indexOf('ENTORNO') >= 0) {
      return '<!-- Ejecuta con servidor local/HTTPS, no con file:// -->\n<script src="./webar-devtools.js"></script>';
    }
    if (cat.indexOf('A-FRAME') >= 0 || msg.indexOf('timeout') >= 0) {
      return '<a-assets timeout="10000">\n  <a-asset-item id="model" src="./modelo.glb"></a-asset-item>\n</a-assets>';
    }
    if (cat.indexOf('MINDAR') >= 0) {
      return '<a-scene mindar-image="imageTargetSrc: ./targets.mind;" embedded color-space="sRGB">\n  <a-entity mindar-target="targetIndex: 0"></a-entity>\n</a-scene>';
    }
    if (cat.indexOf('VIDEO') >= 0) {
      return '<video src="./video.mp4" autoplay muted loop playsinline webkit-playsinline></video>';
    }
    if (cat.indexOf('GPU') >= 0 || cat.indexOf('FPS') >= 0 || cat.indexOf('RENDIMIENTO') >= 0) {
      return 'renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));';
    }
    return '';
  }

  function addLog(level, category, text, detail, solution, meta) {
    meta = meta || {};
    var key = fingerprint(category, text, detail);
    var existing = state.seen[key];
    if (existing) {
      existing.count += 1;
      existing.time = time();
      existing.level = level;
      existing.confidence = confidenceFor(level, category, detail, meta);
    } else {
      existing = {
        level: level || 'INFO',
        category: category || 'GENERAL',
        text: text || 'Evento detectado',
        detail: detail || '',
        solution: solution || '',
        confidence: confidenceFor(level, category, detail, meta),
        evidence: meta.evidence || '',
        code: meta.code || codeFor(category, text),
        meta: meta,
        count: 1,
        time: time()
      };
      state.seen[key] = existing;
      state.logs.unshift(existing);
      if (state.logs.length > MAX_LOGS) state.logs.pop();
    }
    requestRender();
  }

  function addTimeline(step, status, detail) {
    state.timeline.unshift({
      step: step || 'Evento',
      status: status || 'INFO',
      detail: detail || '',
      time: time(),
      ts: performance.now()
    });
    if (state.timeline.length > MAX_TIMELINE) state.timeline.pop();
    requestRender();
  }

  function addNetwork(entry) {
    var url = entry.url || '';
    var now = Date.now();
    var existing = state.network.find(function (item) {
      return item.url === url && item.status === (entry.status || 0) && now - (item._ts || 0) < 2500;
    });

    if (existing) {
      existing.ok = existing.ok || !!entry.ok;
      existing.size = Math.max(existing.size || 0, entry.size || 0);
      existing.duration = Math.max(existing.duration || 0, Math.round(entry.duration || 0));
      existing.type = existing.type || entry.type || guessType(url);
      existing.time = time();
      existing._ts = now;
      trackAsset(existing);
      requestRender();
      return;
    }

    var item = {
      status: entry.status || 0,
      ok: !!entry.ok,
      method: entry.method || 'GET',
      url: url,
      file: getFileName(url),
      size: entry.size || 0,
      type: entry.type || guessType(url),
      duration: Math.round(entry.duration || 0),
      time: time(),
      _ts: now
    };
    state.network.unshift(item);
    if (state.network.length > MAX_NET) state.network.pop();
    trackAsset(item);
    requestRender();
  }

  function addEvent(name, source, detail, solution) {
    var eventName = name || 'Evento AR';
    var now = performance.now();
    state.events.unshift({
      name: eventName,
      source: source || 'WebAR',
      detail: detail || '',
      solution: solution || '',
      time: time()
    });
    if (state.events.length > MAX_EVENTS) state.events.pop();
    addTimeline(eventName, 'AR', source || '');
    updateMarkerStats(eventName, now);
    requestRender();
  }

  function cleanUrl(url) {
    return String(url || '').split('#')[0].split('?')[0];
  }

  function isExternalUrl(url) {
    try {
      var parsed = new URL(url, window.location.href);
      return parsed.origin !== window.location.origin && parsed.protocol.indexOf('http') === 0;
    } catch (err) {
      return false;
    }
  }

  function trackAsset(entry) {
    var url = cleanUrl(entry.url || '');
    if (!url || url.indexOf('blob:') === 0) return;
    var key = url;
    var existing = state.assetIndex[key];
    if (!existing) {
      existing = {
        url: url,
        file: getFileName(url),
        type: entry.type || guessType(url),
        size: 0,
        duration: 0,
        status: entry.status || 0,
        ok: !!entry.ok,
        external: isExternalUrl(url),
        hits: 0,
        issues: [],
        timelineSteps: {},
        loadedAt: time()
      };
      state.assetIndex[key] = existing;
      state.assets.unshift(existing);
    }

    existing.hits += 1;
    existing.status = entry.status || existing.status;
    existing.ok = existing.ok || !!entry.ok;
    existing.size = Math.max(existing.size || 0, entry.size || 0);
    existing.duration = Math.max(existing.duration || 0, entry.duration || 0);
    existing.type = existing.type || entry.type || guessType(url);
    existing.issues = analyzeAsset(existing);

    if (existing.ok) {
      if (existing.type === 'mind target' && !existing.timelineSteps.mind) {
        existing.timelineSteps.mind = true;
        addTimeline('.mind cargado', 'OK', existing.file + ' - ' + prettyBytes(existing.size));
      }
      if (existing.type === 'modelo 3D' && !existing.timelineSteps.model) {
        existing.timelineSteps.model = true;
        addTimeline('modelo cargado', 'OK', existing.file + ' - ' + prettyBytes(existing.size));
      }
      if (existing.type === 'script' && !existing.timelineSteps.script) {
        existing.timelineSteps.script = true;
        addTimeline('script cargado', 'OK', existing.file);
      }
    }
  }

  function analyzeAsset(asset) {
    var issues = [];
    var clean = asset.url.toLowerCase();
    if (asset.type === 'modelo 3D' && asset.size > 8 * 1048576) {
      issues.push('Modelo pesado: conviene comprimir con Draco/Meshopt y reducir texturas.');
    }
    if (asset.type === 'imagen/textura' && asset.size > 2 * 1048576) {
      issues.push('Textura pesada: usa WebP/KTX2 y revisa dimensiones 1024/2048.');
    }
    if (asset.type === 'video' && asset.size > 6 * 1048576) {
      issues.push('Video pesado: usa MP4 H.264 corto, muted/playsinline y carga diferida.');
    }
    if (asset.type === 'mind target' && asset.size > 0 && asset.size < 1024) {
      issues.push('.mind sospechosamente pequeno: puede estar vacio, corrupto o mal servido.');
    }
    if (asset.type === 'mind target' && asset.size === 0 && asset.ok) {
      issues.push('No se pudo medir el tamano del .mind; confirma en servidor que no sea una respuesta vacia.');
    }
    if (asset.external && asset.duration > PERF_WARN.slowMs) {
      issues.push('Asset externo lento: usa CDN/cache o copia critica en tu hosting.');
    }
    if (/\.png$|\.jpg$|\.jpeg$/.test(clean) && asset.size > 1048576) {
      issues.push('Imagen grande sin formato moderno: prueba WebP o KTX2 para texturas.');
    }
    if (asset.status >= 400 || asset.status === 0) {
      issues.push('Fallo de carga detectado: revisa URL, CORS, permisos o mixed content.');
    }
    return issues;
  }

  function updateMarkerStats(eventName, now) {
    var name = String(eventName || '').toLowerCase();
    if (name.indexOf('marcador encontrado') >= 0 || name.indexOf('targetfound') >= 0) {
      state.marker.foundCount += 1;
      state.marker.lastFoundAt = now;
      if (state.marker.lastLostAt && now - state.marker.lastLostAt < 1200) {
        state.marker.flickerCount += 1;
      }
      if (!state.marker.currentFoundAt) state.marker.currentFoundAt = now;
    }
    if (name.indexOf('marcador perdido') >= 0 || name.indexOf('targetlost') >= 0) {
      state.marker.lostCount += 1;
      state.marker.lastLostAt = now;
      if (state.marker.currentFoundAt) {
        var duration = now - state.marker.currentFoundAt;
        state.marker.totalVisibleMs += duration;
        state.marker.maxStableMs = Math.max(state.marker.maxStableMs, duration);
        state.marker.stableDurations.push(duration);
        if (duration < 1200) state.marker.flickerCount += 1;
      }
      state.marker.currentFoundAt = 0;
    }
  }

  function markerAnalysis() {
    var activeMs = state.marker.currentFoundAt ? performance.now() - state.marker.currentFoundAt : 0;
    var totalVisible = state.marker.totalVisibleMs + activeMs;
    var avg = state.marker.stableDurations.length
      ? state.marker.stableDurations.reduce(function (sum, item) { return sum + item; }, 0) / state.marker.stableDurations.length
      : activeMs;
    var status = 'Sin datos';
    var recommendation = 'Apunta la camara al marcador para medir estabilidad real.';

    if (state.marker.foundCount > 0 && state.marker.flickerCount === 0 && avg >= 2500) {
      status = 'Estable';
      recommendation = 'El marcador se sostiene bien. Si quieres mejorar aun mas, usa buena luz y evita reflejos.';
    } else if (state.marker.foundCount > 0 && state.marker.flickerCount <= 2) {
      status = 'Aceptable';
      recommendation = 'El marcador se detecta, pero conviene mejorar contraste, enfoque y tamano fisico.';
    } else if (state.marker.foundCount > 0) {
      status = 'Inestable';
      recommendation = 'Hay parpadeo de tracking. Revisa iluminacion, textura del marcador, reflejos y movimiento de camara.';
    }

    return {
      status: status,
      recommendation: recommendation,
      avgVisibleMs: Math.round(avg || 0),
      totalVisibleMs: Math.round(totalVisible || 0),
      maxStableMs: Math.round(Math.max(state.marker.maxStableMs, activeMs) || 0)
    };
  }

  function mergeLinks() {
    var cfg = USER_CONFIG.links || {};
    var donations = (cfg && cfg.donations) || USER_CONFIG.donations || {};
    return {
      site: cfg.site || USER_CONFIG.site || DEFAULT_LINKS.site,
      blog: cfg.blog || USER_CONFIG.blog || DEFAULT_LINKS.blog,
      donations: {
        nequi: donations.nequi || DEFAULT_LINKS.donations.nequi,
        paypal: donations.paypal || DEFAULT_LINKS.donations.paypal,
        buyMeACoffee: donations.buyMeACoffee || donations.buymeacoffee || DEFAULT_LINKS.donations.buyMeACoffee,
        patreon: donations.patreon || DEFAULT_LINKS.donations.patreon
      }
    };
  }

  function solutionForNetworkStatus(status, url) {
    var file = getFileName(url);
    if (status === 404) {
      return 'Verifica la ruta de "' + file + '". En servidores Linux importan mayusculas, minusculas y espacios.';
    }
    if (status === 403 || status === 401) {
      return 'El recurso existe, pero el servidor no autoriza la descarga. Revisa permisos, tokens, reglas CORS o hosting.';
    }
    if (status === 0) {
      return 'Normalmente indica CORS, bloqueo mixto HTTP/HTTPS o perdida de red. Prueba con HTTPS y revisa cabeceras del servidor.';
    }
    if (status >= 500) {
      return 'El fallo viene del servidor. Revisa logs del backend/CDN o vuelve a publicar el asset.';
    }
    return 'Abre la pestana Red y confirma estado, tamano y tiempo de carga.';
  }

  function classifyError(message, detail) {
    var msg = String(message || '').toLowerCase();
    var det = String(detail || '').toLowerCase();
    if (msg.indexOf('uselegacylights') >= 0) {
      return {
        category: 'THREE.JS',
        solution: 'Es un aviso de migracion de luces de Three.js/A-Frame. Puedes ignorarlo si la escena se ve bien, o ajustar intensidades y luces segun la version nueva.'
      };
    }
    if (msg.indexOf('permission') >= 0 || msg.indexOf('notallowederror') >= 0) {
      return {
        category: 'CAMARA',
        solution: 'El usuario o el navegador bloqueo la camara. Sirve la app por HTTPS, evita iframes sin allow="camera" y vuelve a solicitar permisos.'
      };
    }
    if (msg.indexOf('notfounderror') >= 0 || msg.indexOf('devicesnotfound') >= 0) {
      return {
        category: 'CAMARA',
        solution: 'No se encontro camara disponible. En escritorio revisa que otra app no la este usando; en movil prueba el navegador nativo.'
      };
    }
    if (msg.indexOf('notreadableerror') >= 0 || msg.indexOf('could not start video') >= 0) {
      return {
        category: 'CAMARA',
        solution: 'La camara existe, pero no pudo arrancar. Cierra otras apps que usen la camara y reinicia el navegador.'
      };
    }
    if (msg.indexOf('overconstrained') >= 0) {
      return {
        category: 'CAMARA',
        solution: 'Las constraints de getUserMedia son demasiado estrictas. Usa ideal en vez de exact para width, height o facingMode.'
      };
    }
    if (msg.indexOf('cors') >= 0 || msg.indexOf('cross-origin') >= 0 || msg.indexOf('failed to fetch') >= 0) {
      return {
        category: 'CORS/RED',
        solution: 'Publica los archivos en el mismo dominio o configura Access-Control-Allow-Origin. Evita abrir el HTML con file://.'
      };
    }
    if (msg.indexOf('webgl') >= 0 || msg.indexOf('context lost') >= 0) {
      return {
        category: 'WEBGL',
        solution: 'Reduce texturas, luces, postprocesado y poligonos. Si se pierde el contexto, libera recursos y permite recrear la escena.'
      };
    }
    if (msg.indexOf('byte') >= 0 || msg.indexOf('buffer') >= 0 || det.indexOf('.mind') >= 0) {
      return {
        category: 'MINDAR',
        solution: 'El archivo .mind puede estar corrupto, vacio o mal servido. Recompila los targets y confirma que el servidor entregue el archivo completo.'
      };
    }
    if (msg.indexOf('asset loading timed out') >= 0) {
      return {
        category: 'A-FRAME',
        solution: 'Aumenta el timeout en <a-assets timeout="10000"> y optimiza modelos/texturas para bajar el tiempo de carga.'
      };
    }
    return {
      category: 'LOGICA JS',
      solution: 'Revisa el stack indicado. Si ocurre al iniciar AR, valida permisos, assets y orden de carga de scripts.'
    };
  }

  function safeArgs(args) {
    return Array.prototype.slice.call(args).map(function (item) {
      if (item instanceof Error) return item.message + '\n' + (item.stack || '');
      if (typeof item === 'string') return item;
      try {
        return JSON.stringify(item);
      } catch (err) {
        return String(item);
      }
    }).join(' ');
  }

  function installConsoleHooks() {
    var originalWarn = console.warn;
    var originalError = console.error;

    console.warn = function () {
      var msg = safeArgs(arguments);
      var lower = msg.toLowerCase();
      if (lower.indexOf('webar-devtools') < 0) {
        var rule = classifyError(msg);
        var level = lower.indexOf('deprecated') >= 0 ? 'INFO' : 'ATENCION';
        if (lower.indexOf('asset loading timed out') >= 0) level = 'ERROR';
        addLog(level, rule.category, clampText(msg.replace(/%c/g, ''), 220), '', rule.solution);
      }
      return originalWarn.apply(console, arguments);
    };

    console.error = function () {
      var msg = safeArgs(arguments);
      var rule = classifyError(msg);
      addLog('ERROR', rule.category, clampText(msg.replace(/%c/g, ''), 260), '', rule.solution);
      return originalError.apply(console, arguments);
    };
  }

  function installFetchHook() {
    if (!window.fetch || window.fetch.__webarDevTools) return;
    var originalFetch = window.fetch;

    function wrappedFetch(input, init) {
      var method = (init && init.method) || (input && input.method) || 'GET';
      var url = input instanceof Request ? input.url : String(input);
      var started = performance.now();

      return originalFetch.apply(this, arguments).then(function (response) {
        var size = Number(response.headers && response.headers.get('content-length')) || 0;
        var duration = performance.now() - started;
        addNetwork({
          status: response.status,
          ok: response.ok,
          method: method,
          url: response.url || url,
          size: size,
          type: guessType(response.url || url),
          duration: duration
        });

        if (!response.ok) {
          addLog(
            response.status >= 500 ? 'CRITICO' : 'ERROR',
            'RED ' + response.status,
            'Recurso no cargado: ' + getFileName(url),
            response.url || url,
            solutionForNetworkStatus(response.status, url)
          );
        }
        if (duration > PERF_WARN.slowMs) {
          addLog('ATENCION', 'RED LENTA', 'Carga lenta: ' + getFileName(url), Math.round(duration) + ' ms', 'Comprime el asset, usa CDN/cache y evita modelos o videos pesados al inicio.');
        }
        return response;
      }).catch(function (err) {
        var rule = classifyError(err && err.message, url);
        addNetwork({ status: 0, ok: false, method: method, url: url, duration: performance.now() - started });
        addLog('CRITICO', rule.category, 'Fetch fallo: ' + getFileName(url), (err && err.message) || url, rule.solution);
        throw err;
      });
    }

    wrappedFetch.__webarDevTools = true;
    window.fetch = wrappedFetch;
  }

  function installXhrHook() {
    if (!window.XMLHttpRequest || XMLHttpRequest.prototype.__webarDevTools) return;
    var originalOpen = XMLHttpRequest.prototype.open;
    var originalSend = XMLHttpRequest.prototype.send;

    XMLHttpRequest.prototype.open = function (method, url) {
      this.__webarDevTools = { method: method || 'GET', url: String(url || ''), started: 0 };
      return originalOpen.apply(this, arguments);
    };

    XMLHttpRequest.prototype.send = function () {
      var xhr = this;
      var meta = xhr.__webarDevTools || { method: 'GET', url: 'XHR desconocido' };
      meta.started = performance.now();

      function done(kind) {
        var duration = performance.now() - meta.started;
        var status = xhr.status || 0;
        var size = Number(xhr.getResponseHeader && xhr.getResponseHeader('content-length')) || 0;
        addNetwork({
          status: status,
          ok: status >= 200 && status < 400,
          method: meta.method,
          url: xhr.responseURL || meta.url,
          size: size,
          type: guessType(xhr.responseURL || meta.url),
          duration: duration
        });
        if (kind !== 'loadend' || status >= 400 || status === 0) {
          addLog(
            status >= 500 || status === 0 ? 'CRITICO' : 'ERROR',
            'XHR ' + (status || kind).toString().toUpperCase(),
            'XHR fallo: ' + getFileName(meta.url),
            xhr.responseURL || meta.url,
            solutionForNetworkStatus(status, meta.url)
          );
        }
      }

      xhr.addEventListener('loadend', function () { done('loadend'); });
      xhr.addEventListener('error', function () { done('error'); });
      xhr.addEventListener('timeout', function () { done('timeout'); });
      xhr.addEventListener('abort', function () { done('abort'); });
      return originalSend.apply(this, arguments);
    };

    XMLHttpRequest.prototype.__webarDevTools = true;
  }

  function installCameraHook() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia || navigator.mediaDevices.getUserMedia.__webarDevTools) return;
    var originalGetUserMedia = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);

    navigator.mediaDevices.getUserMedia = function (constraints) {
      state.hardware.cameraPermission = 'Solicitando';
      requestRender();

      return originalGetUserMedia(constraints).then(function (stream) {
        state.hardware.cameraPermission = 'Concedido';
        var videoTrack = stream.getVideoTracks && stream.getVideoTracks()[0];
        if (videoTrack && videoTrack.getSettings) {
          var settings = videoTrack.getSettings();
          if (settings.width && settings.height) state.hardware.cameraRes = settings.width + 'x' + settings.height;
          if (settings.facingMode) state.hardware.cameraFacing = settings.facingMode;
        }
        addLog('INFO', 'CAMARA', 'Camara inicializada correctamente', state.hardware.cameraRes, 'Si el tracking es inestable, mejora iluminacion, evita reflejos y usa imagenes target con buen contraste.');
        addTimeline('camara concedida', 'OK', state.hardware.cameraRes);
        requestRender();
        return stream;
      }).catch(function (err) {
        state.hardware.cameraPermission = 'Bloqueado';
        var rule = classifyError(err && err.name ? err.name + ': ' + err.message : err);
        addLog('CRITICO', rule.category, 'No se pudo iniciar la camara', (err && (err.name + ': ' + err.message)) || '', rule.solution);
        addTimeline('camara bloqueada', 'ERROR', (err && (err.name + ': ' + err.message)) || '');
        requestRender();
        throw err;
      });
    };

    navigator.mediaDevices.getUserMedia.__webarDevTools = true;
  }

  function installWebGlHooks() {
    if (!window.WebGLRenderingContext || WebGLRenderingContext.prototype.__webarDevTools) return;

    function wrapDraw(proto, method) {
      if (!proto || !proto[method] || proto[method].__webarDevTools) return;
      var original = proto[method];
      proto[method] = function () {
        rafDrawCalls += 1;
        return original.apply(this, arguments);
      };
      proto[method].__webarDevTools = true;
    }

    wrapDraw(WebGLRenderingContext.prototype, 'drawArrays');
    wrapDraw(WebGLRenderingContext.prototype, 'drawElements');
    if (window.WebGL2RenderingContext) {
      wrapDraw(WebGL2RenderingContext.prototype, 'drawArrays');
      wrapDraw(WebGL2RenderingContext.prototype, 'drawElements');
      wrapDraw(WebGL2RenderingContext.prototype, 'drawArraysInstanced');
      wrapDraw(WebGL2RenderingContext.prototype, 'drawElementsInstanced');
    }

    WebGLRenderingContext.prototype.__webarDevTools = true;
  }

  function inspectWebGl() {
    var canvas = document.createElement('canvas');
    var gl = null;
    try {
      gl = canvas.getContext('webgl2', { failIfMajorPerformanceCaveat: false });
      state.hardware.webgl2 = !!gl;
      if (!gl) gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
      if (!gl) {
        state.hardware.webgl = 'No disponible';
        addLog('CRITICO', 'WEBGL', 'WebGL no esta disponible', navigator.userAgent, 'Activa aceleracion por hardware o prueba otro navegador/dispositivo.');
        return;
      }
      state.hardware.webgl = gl.getParameter(gl.VERSION);
      state.hardware.maxTextureSize = gl.getParameter(gl.MAX_TEXTURE_SIZE);
      if (state.hardware.maxTextureSize && state.hardware.maxTextureSize < 4096) {
        addLog('ATENCION', 'GPU', 'GPU con limite bajo de textura', 'MAX_TEXTURE_SIZE=' + state.hardware.maxTextureSize, 'Usa texturas de 1024 o 2048 px y comprime a WebP/KTX2 cuando sea posible.');
      }
    } catch (err) {
      state.hardware.webgl = 'Error al consultar';
    }
  }

  function installGlobalErrorHooks() {
    window.addEventListener('error', function (event) {
      var target = event.target;
      if (target && target !== window && (target.src || target.href)) {
        var url = target.src || target.href;
        var type = guessType(url, target.tagName);
        addNetwork({ status: 0, ok: false, url: url, type: type });
        addLog('ERROR', 'ASSET', 'No se pudo cargar ' + type + ': ' + getFileName(url), url, solutionForNetworkStatus(0, url));
        return;
      }

      var msg = event.message || 'Error de ejecucion';
      var stack = event.error && event.error.stack ? event.error.stack.split('\n').slice(0, 3).join('\n') : ((event.filename || '').split('/').pop() + ' L:' + event.lineno + ' C:' + event.colno);
      var rule = classifyError(msg, stack);
      addLog('ERROR', rule.category, msg, stack, rule.solution);
    }, true);

    window.addEventListener('unhandledrejection', function (event) {
      var reason = event.reason;
      var msg = reason && reason.message ? reason.message : String(reason);
      var stack = reason && reason.stack ? reason.stack.split('\n').slice(0, 3).join('\n') : '';
      var rule = classifyError(msg, stack);
      addLog(rule.category === 'MINDAR' ? 'CRITICO' : 'ERROR', rule.category, msg, stack, rule.solution);
    });

    window.addEventListener('webglcontextlost', function (event) {
      state.hardware.webglLost = true;
      addLog('CRITICO', 'WEBGL', 'Se perdio el contexto WebGL', event && event.type, 'Reduce carga grafica y maneja webglcontextrestored para reconstruir la escena.');
    }, true);

    window.addEventListener('webglcontextrestored', function () {
      state.hardware.webglLost = false;
      addLog('INFO', 'WEBGL', 'Contexto WebGL restaurado', '', 'Vuelve a crear texturas, buffers y materiales si tu motor no lo hace automaticamente.');
    }, true);
  }

  function installPerformanceObservers() {
    if (!window.PerformanceObserver) return;

    try {
      new PerformanceObserver(function (list) {
        list.getEntries().forEach(function (entry) {
          if (entry.duration >= PERF_WARN.longTaskMs) {
            state.metrics.longTasks += 1;
            state.metrics.lastLongTaskMs = Math.round(entry.duration);
            addLog('ATENCION', 'CPU', 'Tarea larga bloqueando el hilo principal', Math.round(entry.duration) + ' ms', 'Divide trabajo pesado, usa requestIdleCallback/Web Workers y evita parsear assets grandes durante el tracking.');
          }
        });
      }).observe({ type: 'longtask', buffered: true });
    } catch (err) {}

    try {
      new PerformanceObserver(function (list) {
        list.getEntries().forEach(function (entry) {
          var type = guessType(entry.name, entry.initiatorType);
          var interesting = /modelo 3D|mind target|imagen\/textura|video|wasm|script/.test(type);
          if (!interesting) return;

          var size = entry.transferSize || entry.encodedBodySize || 0;
          addNetwork({
            status: 200,
            ok: true,
            method: 'GET',
            url: entry.name,
            size: size,
            type: type,
            duration: entry.duration
          });

          if (size > PERF_WARN.assetBytes) {
            addLog('ATENCION', 'PESO DE ASSET', 'Asset pesado: ' + getFileName(entry.name), prettyBytes(size), 'Comprime texturas, simplifica geometria y usa carga diferida despues de detectar el target.');
          }
          if (entry.duration > PERF_WARN.slowMs) {
            addLog('ATENCION', 'RED LENTA', 'Asset lento: ' + getFileName(entry.name), Math.round(entry.duration) + ' ms', 'Activa cache, compresion Brotli/Gzip y revisa latencia del hosting.');
          }
        });
      }).observe({ type: 'resource', buffered: true });
    } catch (err) {}
  }

  function inspectConnection() {
    var conn = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
    if (conn) {
      state.hardware.connection = [
        conn.effectiveType || conn.type || 'red',
        conn.downlink ? conn.downlink + ' Mbps' : '',
        conn.saveData ? 'Save-Data activo' : ''
      ].filter(Boolean).join(' / ');

      if (conn.saveData || /2g/.test(conn.effectiveType || '')) {
        addLog('ATENCION', 'RED MOVIL', 'Conexion limitada detectada', state.hardware.connection, 'Carga una experiencia ligera: menos texturas, menos video y fallback si el tracking tarda.');
      }
    }

    if (navigator.getBattery) {
      navigator.getBattery().then(function (battery) {
        var pct = Math.round(battery.level * 100);
        state.hardware.battery = pct + '%';
        if (!battery.charging && pct <= 20) {
          addLog('ATENCION', 'BATERIA', 'Bateria baja', state.hardware.battery, 'Evita postprocesado, baja calidad de render y pausa animaciones fuera de camara.');
        }
        requestRender();
      }).catch(function () {});
    }
  }

  function describeElement(el) {
    if (!el || el === window) return 'window';
    if (el === document) return 'document';
    var name = (el.tagName || 'elemento').toLowerCase();
    if (el.id) name += '#' + el.id;
    if (el.className && typeof el.className === 'string') {
      name += '.' + el.className.trim().split(/\s+/).slice(0, 2).join('.');
    }
    var target = el.getAttribute && el.getAttribute('mindar-target');
    if (target) name += ' [' + target + ']';
    return name;
  }

  function safeDetail(value) {
    if (!value) return '';
    try {
      return typeof value === 'string' ? value : JSON.stringify(value);
    } catch (err) {
      return String(value);
    }
  }

  function watchARElement(el) {
    if (!el || el.__webarDevToolsEvents) return;
    el.__webarDevToolsEvents = true;

    var handlers = {
      targetFound: {
        text: 'Marcador encontrado',
        solution: 'El tracking encontro el target. Si aparece y desaparece rapido, mejora iluminacion, contraste del marcador y estabilidad de la camara.'
      },
      targetLost: {
        text: 'Marcador perdido',
        solution: 'El tracking perdio el target. Evita movimiento brusco, reflejos, poca luz o targets con bajo contraste.'
      },
      arReady: {
        text: 'Sesion AR lista',
        solution: 'La experiencia AR termino de inicializar. Si los assets aun no aparecen, revisa carga de modelos y eventos targetFound.'
      },
      arError: {
        text: 'Error de sesion AR',
        solution: 'Revisa permisos de camara, HTTPS, compatibilidad WebGL y que MindAR/A-Frame carguen en el orden correcto.'
      },
      cameraInit: {
        text: 'Camara inicializada',
        solution: 'Si la imagen se ve lenta o borrosa, baja resolucion de camara o optimiza la escena.'
      },
      'camera-init': {
        text: 'Camara inicializada',
        solution: 'Si la imagen se ve lenta o borrosa, baja resolucion de camara o optimiza la escena.'
      },
      cameraError: {
        text: 'Error de camara',
        solution: 'Sirve por HTTPS, verifica permisos y evita iframes sin allow="camera".'
      },
      'camera-error': {
        text: 'Error de camara',
        solution: 'Sirve por HTTPS, verifica permisos y evita iframes sin allow="camera".'
      },
      renderstart: {
        text: 'Render iniciado',
        solution: 'El motor empezo a renderizar. Revisa FPS y draw calls para validar rendimiento.'
      }
    };

    Object.keys(handlers).forEach(function (eventName) {
      el.addEventListener(eventName, function (event) {
        var info = handlers[eventName];
        addEvent(info.text, describeElement(event.currentTarget || el), safeDetail(event.detail), info.solution);
      });
    });
  }

  function scanAREvents() {
    watchARElement(window);
    watchARElement(document);
    Array.prototype.slice.call(document.querySelectorAll('a-scene, [mindar-image], [mindar-face], [mindar-target]')).forEach(watchARElement);
  }

  function installDomObserver() {
    if (domObserver || !window.MutationObserver) return;
    domObserver = new MutationObserver(function (mutations) {
      mutations.forEach(function (mutation) {
        Array.prototype.slice.call(mutation.addedNodes || []).forEach(function (node) {
          if (!node || node.nodeType !== 1) return;
          if (node.matches && node.matches('a-scene, [mindar-image], [mindar-face], [mindar-target]')) watchARElement(node);
          if (node.querySelectorAll) {
            Array.prototype.slice.call(node.querySelectorAll('a-scene, [mindar-image], [mindar-face], [mindar-target]')).forEach(watchARElement);
          }
        });
      });
    });
    domObserver.observe(document.documentElement || document.body, { childList: true, subtree: true });
  }

  function scanDom() {
    if (state.scanDone) return;
    state.scanDone = true;

    if (window.location.protocol === 'file:') {
      addLog('CRITICO', 'ENTORNO', 'La app esta abierta con file://', window.location.href, 'Usa un servidor local como VSCode Live Server, http-server, Vite o cualquier hosting HTTPS.');
    }

    if (!window.isSecureContext && window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1') {
      addLog('CRITICO', 'HTTPS', 'Contexto no seguro', window.location.href, 'La camara y muchos sensores WebAR requieren HTTPS o localhost.');
    }

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      addLog('CRITICO', 'CAMARA', 'getUserMedia no esta disponible', navigator.userAgent, 'Usa Safari/Chrome moderno y sirve por HTTPS. En iOS evita navegadores embebidos dentro de apps.');
    }

    if (!document.querySelector('meta[name="viewport"]')) {
      addLog('ATENCION', 'HTML', 'Falta meta viewport', '', 'Agrega <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover"> para moviles.');
    }

    var scripts = Array.prototype.slice.call(document.scripts || []);
    state.framework.scripts = scripts.map(function (s) { return s.src; }).filter(Boolean);
    state.framework.aframe = !!(window.AFRAME || document.querySelector('a-scene'));
    state.framework.three = !!window.THREE;
    state.framework.mindar = scripts.some(function (src) { return /mind-?ar/i.test(src); }) || !!document.querySelector('[mindar-image], [mindar-face], mindar-image, mindar-face');
    scanAREvents();

    var scriptCounts = {};
    state.framework.scripts.forEach(function (src) {
      scriptCounts[src] = (scriptCounts[src] || 0) + 1;
    });
    Object.keys(scriptCounts).forEach(function (src) {
      if (scriptCounts[src] > 1) {
        addLog('ATENCION', 'SCRIPT DUPLICADO', 'Script cargado varias veces: ' + getFileName(src), src, 'Elimina cargas duplicadas para evitar doble inicializacion, eventos repetidos y consumo extra.', { evidence: 'measured' });
      }
    });

    if (state.framework.mindar && !state.framework.aframe && !window.MINDAR) {
      addLog('ATENCION', 'MINDAR', 'MindAR parece estar incluido, pero no se detecto escena/API activa', '', 'Confirma el orden de scripts y que la escena se inicialice despues de cargar MindAR.');
    }

    var mixedAssets = Array.prototype.slice.call(document.querySelectorAll('[src^="http://"], [href^="http://"]'));
    if (window.location.protocol === 'https:' && mixedAssets.length) {
      addLog('CRITICO', 'MIXED CONTENT', 'Assets HTTP dentro de pagina HTTPS', mixedAssets.map(function (el) { return el.src || el.href; }).slice(0, 5).join('\n'), 'Cambia esas rutas a HTTPS. Los navegadores pueden bloquear camara, scripts o modelos.');
    }

    var videos = Array.prototype.slice.call(document.querySelectorAll('video'));
    videos.forEach(function (video) {
      if (!video.hasAttribute('playsinline')) {
        addLog('ATENCION', 'VIDEO', 'Video sin playsinline', video.currentSrc || video.src || '<video>', 'En iOS agrega playsinline y webkit-playsinline para evitar pantalla completa forzada.');
      }
      if (video.videoWidth && video.videoHeight) {
        state.hardware.cameraRes = video.videoWidth + 'x' + video.videoHeight;
      }
    });

    Array.prototype.slice.call(document.images || []).forEach(function (img) {
      if ((img.naturalWidth && img.naturalWidth > 2048) || (img.naturalHeight && img.naturalHeight > 2048)) {
        addLog('ATENCION', 'TEXTURA/IMAGEN', 'Imagen con dimensiones grandes: ' + getFileName(img.currentSrc || img.src), img.naturalWidth + 'x' + img.naturalHeight, 'Reduce a 1024 o 2048 px, usa WebP/KTX2 y carga versiones responsivas para movil.', { evidence: 'measured' });
      }
    });

    var mindSources = Array.prototype.slice.call(document.querySelectorAll('[mindar-image], [mindar-face]')).map(function (el) {
      var rawImageAttr = el.getAttribute('mindar-image');
      var rawFaceAttr = el.getAttribute('mindar-face');
      var rawAttr = rawImageAttr || rawFaceAttr || '';
      var targetSrc = '';

      if (rawAttr && typeof rawAttr === 'object') {
        targetSrc = rawAttr.imageTargetSrc || rawAttr.targetSrc || rawAttr.src || '';
      } else {
        targetSrc = String(rawAttr || '');
        var match = targetSrc.match(/imageTargetSrc\s*:\s*([^;]+)/i);
        if (match) targetSrc = match[1].trim();
      }

      return {
        raw: typeof rawAttr === 'object' ? JSON.stringify(rawAttr) : String(rawAttr || ''),
        targetSrc: targetSrc
      };
    }).filter(function (item) {
      return item.raw || item.targetSrc;
    });

    mindSources.forEach(function (attrs) {
      if (attrs.targetSrc && attrs.targetSrc.indexOf('.mind') < 0) {
        addLog('ATENCION', 'MINDAR', 'imageTargetSrc no parece apuntar a un .mind', attrs.raw, 'Confirma que imageTargetSrc apunte al archivo .mind correcto y que el servidor lo entregue como binario.');
      }
    });

    inspectWebGl();
    inspectConnection();
    requestRender();
  }

  function updateEngineMetrics() {
    var scene = document.querySelector('a-scene');
    if (scene && scene.renderer && scene.renderer.info) {
      state.metrics.drawCalls = scene.renderer.info.render.calls || 0;
      state.metrics.triangles = scene.renderer.info.render.triangles || 0;
      if (scene.renderer.getPixelRatio && scene.renderer.getPixelRatio() > 1.75) {
        addLog('ATENCION', 'RENDIMIENTO', 'Pixel ratio alto: ' + scene.renderer.getPixelRatio().toFixed(2), '', 'Limita el pixel ratio para WebAR movil: renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));', { evidence: 'measured' });
      }
    } else {
      state.metrics.drawCalls = state.metrics.rafDrawCalls;
    }

    var video = document.querySelector('video');
    if (video && video.videoWidth) {
      state.hardware.cameraRes = video.videoWidth + 'x' + video.videoHeight;
    }

    if (performance.memory) {
      state.metrics.memoryMb = (performance.memory.usedJSHeapSize / 1048576).toFixed(1);
    }

    if (state.metrics.fps > 0 && state.metrics.fps < PERF_WARN.fps) {
      addLog('ATENCION', 'FPS', 'FPS bajo detectado: ' + state.metrics.fps, '', 'Reduce draw calls, texturas, sombras, animaciones y resolucion de render. Apunta a 30 FPS minimo en moviles.');
    }
    if (state.metrics.drawCalls > PERF_WARN.drawCalls) {
      addLog('ATENCION', 'GPU', 'Demasiadas draw calls: ' + state.metrics.drawCalls, '', 'Combina meshes/materiales, usa instancing y evita muchos objetos separados en escena.');
    }
    if (state.metrics.triangles > PERF_WARN.triangles) {
      addLog('ATENCION', 'GPU', 'Muchos triangulos: ' + state.metrics.triangles.toLocaleString(), '', 'Simplifica el modelo, usa LOD o carga versiones low-poly para moviles.');
    }
  }

  function monitorLoop() {
    frames += 1;
    var now = performance.now();
    if (now >= lastTick + 1000) {
      state.metrics.fps = Math.round((frames * 1000) / (now - lastTick));
      state.metrics.rafDrawCalls = rafDrawCalls;
      frames = 0;
      rafDrawCalls = 0;
      lastTick = now;
      updateEngineMetrics();
      requestRender();
    }
    requestAnimationFrame(monitorLoop);
  }

  function severityScore(level) {
    return level === 'CRITICO' ? 3 : level === 'ERROR' ? 2 : level === 'ATENCION' ? 1 : 0;
  }

  function summary() {
    var critical = state.logs.filter(function (l) { return l.level === 'CRITICO'; }).length;
    var errors = state.logs.filter(function (l) { return l.level === 'ERROR'; }).length;
    var warnings = state.logs.filter(function (l) { return l.level === 'ATENCION'; }).length;
    var score = Math.max(0, 100 - critical * 20 - errors * 10 - warnings * 3);
    var status = score >= 85 ? 'Estable' : score >= 60 ? 'Revisar' : 'Critico';
    return { score: score, status: status, critical: critical, errors: errors, warnings: warnings };
  }

  function topSolutions() {
    return state.logs
      .filter(function (l) { return l.solution; })
      .sort(function (a, b) { return severityScore(b.level) - severityScore(a.level); })
      .slice(0, 5);
  }

  function compatibilityAnalysis() {
    var score = 100;
    var reasons = [];

    function penalize(points, reason) {
      score -= points;
      reasons.push(reason);
    }

    if (!state.hardware.secureContext) penalize(30, 'No hay contexto seguro HTTPS/local.');
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) penalize(35, 'getUserMedia no esta disponible.');
    if (state.hardware.cameraPermission === 'Bloqueado') penalize(25, 'Permiso de camara bloqueado.');
    if (state.hardware.webgl === 'No disponible') penalize(35, 'WebGL no esta disponible.');
    if (!state.hardware.webgl2) penalize(8, 'WebGL2 no disponible; algunas experiencias modernas pueden ir limitadas.');
    if (state.metrics.memoryMb && Number(state.metrics.memoryMb) > 180) penalize(8, 'Uso alto de memoria JS.');
    if (state.metrics.fps > 0 && state.metrics.fps < 24) penalize(18, 'FPS por debajo de 24.');
    if (state.metrics.drawCalls > PERF_WARN.drawCalls) penalize(10, 'Draw calls por encima de lo recomendado.');
    if (state.hardware.maxTextureSize && state.hardware.maxTextureSize < 4096) penalize(10, 'GPU con limite bajo de texturas.');
    if (/2g|slow/i.test(state.hardware.connection)) penalize(10, 'Conexion movil limitada.');

    score = Math.max(0, Math.round(score));
    return {
      score: score,
      status: score >= 80 ? 'Apto' : score >= 55 ? 'Limitado' : 'No recomendado',
      reasons: reasons.length ? reasons : ['El dispositivo cumple los checks principales detectables desde navegador.']
    };
  }

  function assetSummary() {
    var issues = [];
    state.assets.forEach(function (asset) {
      asset.issues.forEach(function (issue) {
        issues.push({ asset: asset.file, issue: issue, type: asset.type, size: asset.size });
      });
    });
    return issues;
  }

  function mindarChecks() {
    var checks = [];
    var scene = document.querySelector('[mindar-image], [mindar-face]');
    var targets = Array.prototype.slice.call(document.querySelectorAll('[mindar-target]'));
    var mindAssets = state.assets.filter(function (asset) { return asset.type === 'mind target'; });
    var marker = markerAnalysis();

    checks.push({
      label: 'MindAR detectado',
      ok: state.framework.mindar,
      detail: state.framework.mindar ? 'Script o atributo MindAR encontrado.' : 'No se detecto MindAR en esta pagina.'
    });
    checks.push({
      label: 'Escena con mindar-image/mindar-face',
      ok: !!scene,
      detail: scene ? describeElement(scene) : 'No hay elemento con configuracion MindAR.'
    });
    checks.push({
      label: 'Targets declarados',
      ok: targets.length > 0,
      detail: targets.length + ' elemento(s) con mindar-target.'
    });
    checks.push({
      label: 'Archivo .mind cargado',
      ok: mindAssets.some(function (asset) { return asset.ok && asset.size > 1024; }),
      detail: mindAssets.length ? mindAssets.map(function (asset) { return asset.file + ' ' + prettyBytes(asset.size); }).join(', ') : 'No se ha observado descarga .mind.'
    });
    checks.push({
      label: 'Camara concedida',
      ok: state.hardware.cameraPermission === 'Concedido',
      detail: state.hardware.cameraPermission
    });
    checks.push({
      label: 'Tracking',
      ok: state.marker.foundCount > 0,
      detail: marker.status + ' - encontrados ' + state.marker.foundCount + ', perdidos ' + state.marker.lostCount
    });
    return checks;
  }

  function buildTechnicalSummary() {
    var s = summary();
    var compat = compatibilityAnalysis();
    var marker = markerAnalysis();
    var issues = assetSummary();
    var top = [];

    if (issues.length) top.push(issues.slice(0, 3).map(function (item) { return item.asset + ': ' + item.issue; }).join(' | '));
    if (marker.status === 'Inestable') top.push('tracking inestable con ' + state.marker.flickerCount + ' parpadeos');
    if (state.metrics.drawCalls > PERF_WARN.drawCalls) top.push('draw calls altos (' + state.metrics.drawCalls + ')');
    if (state.metrics.fps > 0 && state.metrics.fps < PERF_WARN.fps) top.push('FPS bajos (' + state.metrics.fps + ')');
    if (s.critical || s.errors) top.push((s.critical + s.errors) + ' error(es) detectados');

    return {
      headline: top.length ? 'Problema principal probable: ' + top.join(' + ') + '.' : 'No hay fallos criticos visibles; continua probando tracking, red y assets en dispositivo real.',
      score: s.score,
      compatibility: compat,
      marker: marker,
      topAssetIssues: issues.slice(0, 8),
      recommendedNextStep: top.length ? 'Ataca primero el punto con mayor evidencia y vuelve a generar el reporte despues de probar en movil.' : 'Haz una prueba completa en movil con target real y buena iluminacion.'
    };
  }

  function createStyles() {
    if (document.getElementById('webar-devtools-style')) return;
    var style = document.createElement('style');
    style.id = 'webar-devtools-style';
    style.textContent = [
      '#webar-devtools{position:fixed;right:16px;bottom:16px;z-index:2147483647;font-family:Inter,Segoe UI,Roboto,Arial,sans-serif;font-size:13px;color:#c9d1d9;}',
      '#webar-devtools *{box-sizing:border-box;}',
      '#webar-devtools button{font:inherit;}',
      '.wdt-launcher{border:1px solid #30363d;background:#0d1117;color:#58a6ff;border-radius:8px;padding:10px 14px;font-weight:700;box-shadow:0 8px 28px rgba(0,0,0,.45);cursor:pointer;}',
      '.wdt-panel{display:none;width:min(540px,calc(100vw - 24px));height:min(660px,82vh);margin-bottom:10px;background:#0d1117;border:1px solid #30363d;border-radius:10px;box-shadow:0 20px 70px rgba(0,0,0,.6);overflow:hidden;flex-direction:column;}',
      '.wdt-panel.open{display:flex;}',
      '.wdt-head{display:flex;align-items:center;justify-content:space-between;padding:10px 12px;background:#010409;border-bottom:1px solid #30363d;}',
      '.wdt-title{font-weight:800;color:#f0f6fc;letter-spacing:.2px;}',
      '.wdt-actions{display:flex;gap:6px;}',
      '.wdt-icon{border:1px solid #30363d;background:#161b22;color:#c9d1d9;border-radius:6px;padding:5px 8px;cursor:pointer;}',
      '.wdt-tabs{display:grid;grid-template-columns:repeat(auto-fit,minmax(72px,1fr));background:#010409;border-bottom:1px solid #30363d;overflow:hidden;}',
      '.wdt-tab{min-width:0;padding:10px 4px;border:0;border-bottom:2px solid transparent;background:transparent;color:#8b949e;cursor:pointer;font-size:11px;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}',
      '.wdt-tab.active{color:#58a6ff;border-bottom-color:#58a6ff;background:#0d1117;}',
      '.wdt-body{flex:1;overflow:auto;padding:12px;background:#0d1117;}',
      '.wdt-grid{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:12px;}',
      '.wdt-card{background:#161b22;border:1px solid #30363d;border-radius:8px;padding:10px;}',
      '.wdt-welcome{padding:18px;display:flex;flex-direction:column;gap:12px;}',
      '.wdt-welcome-title{font-size:18px;line-height:1.25;font-weight:850;color:#f0f6fc;}',
      '.wdt-welcome-copy{color:#c9d1d9;line-height:1.5;font-size:13px;}',
      '.wdt-link-grid{display:grid;grid-template-columns:1fr 1fr;gap:8px;}',
      '.wdt-link-btn{display:block;text-align:center;text-decoration:none;border:1px solid #30363d;background:#161b22;color:#58a6ff;border-radius:8px;padding:10px;font-weight:800;}',
      '.wdt-nequi-number{display:block;margin-top:4px;color:#3fb950;font-size:16px;font-weight:900;letter-spacing:.3px;}',
      '.wdt-donate{display:grid;grid-template-columns:1fr 1fr;gap:8px;}',
      '.wdt-primary{border:0;background:#238636;color:#fff;border-radius:8px;padding:12px;font-weight:850;cursor:pointer;width:100%;}',
      '.wdt-label{font-size:11px;color:#8b949e;font-weight:700;text-transform:uppercase;margin-bottom:4px;}',
      '.wdt-value{font-size:20px;font-weight:800;color:#f0f6fc;}',
      '.wdt-small{font-size:12px;color:#8b949e;line-height:1.4;}',
      '.wdt-row{background:#161b22;border:1px solid #30363d;border-left-width:4px;border-radius:8px;padding:10px;margin-bottom:10px;}',
      '.wdt-row-top{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:7px;}',
      '.wdt-badge{font-size:10px;font-weight:800;border-radius:999px;padding:2px 7px;border:1px solid currentColor;}',
      '.wdt-detail{font-family:Consolas,Menlo,monospace;white-space:pre-wrap;word-break:break-word;background:#0d1117;border:1px solid #21262d;border-radius:6px;padding:7px;color:#8b949e;font-size:11px;margin-top:7px;}',
      '.wdt-solution{margin-top:7px;border:1px solid rgba(63,185,80,.35);background:rgba(63,185,80,.08);border-radius:6px;padding:8px;color:#c9d1d9;font-size:12px;line-height:1.4;}',
      '.wdt-code{margin-top:7px;font-family:Consolas,Menlo,monospace;white-space:pre-wrap;background:#010409;border:1px solid #30363d;border-radius:6px;padding:8px;color:#a5d6ff;font-size:11px;line-height:1.45;}',
      '.wdt-timeline{position:relative;margin-left:8px;padding-left:14px;border-left:1px solid #30363d;}',
      '.wdt-timeline-item{position:relative;background:#161b22;border:1px solid #30363d;border-radius:8px;padding:9px;margin-bottom:9px;}',
      '.wdt-timeline-item:before{content:"";position:absolute;left:-20px;top:13px;width:9px;height:9px;border-radius:50%;background:#58a6ff;}',
      '.wdt-empty{text-align:center;color:#3fb950;font-weight:800;margin-top:32px;}',
      '.wdt-kv{display:flex;justify-content:space-between;gap:12px;border-bottom:1px solid #21262d;padding:7px 0;}',
      '.wdt-kv:last-child{border-bottom:0;}',
      '@media (max-width:520px){#webar-devtools{right:8px;bottom:8px}.wdt-panel{width:calc(100vw - 16px);height:78vh}.wdt-grid{grid-template-columns:1fr}.wdt-tabs{grid-template-columns:repeat(3,minmax(0,1fr))}.wdt-tab{font-size:11px;padding:9px 4px}}'
    ].join('');
    document.head.appendChild(style);
  }

  function levelColor(level) {
    if (level === 'CRITICO') return '#f85149';
    if (level === 'ERROR') return '#ff7b72';
    if (level === 'ATENCION') return '#d29922';
    return '#58a6ff';
  }

  function renderLogRow(log) {
    var color = levelColor(log.level);
    return [
      '<div class="wdt-row" style="border-left-color:', color, '">',
      '<div class="wdt-row-top">',
      '<span class="wdt-badge" style="color:', color, '">', escapeHtml(log.level), ' / ', escapeHtml(log.category), '</span>',
      '<span class="wdt-small">Confianza: ', escapeHtml(log.confidence || 'Media'), ' - ', escapeHtml(log.time), log.count > 1 ? ' x' + log.count : '', '</span>',
      '</div>',
      '<div style="font-weight:700;line-height:1.35;color:#f0f6fc">', escapeHtml(log.text), '</div>',
      log.detail ? '<div class="wdt-detail">' + escapeHtml(log.detail) + '</div>' : '',
      log.solution ? '<div class="wdt-solution"><b>Solucion sugerida:</b><br>' + escapeHtml(log.solution) + '</div>' : '',
      log.code ? '<div class="wdt-code">' + escapeHtml(log.code) + '</div>' : '',
      '</div>'
    ].join('');
  }

  function renderWelcome() {
    var links = mergeLinks();
    return [
      '<div class="wdt-welcome">',
      '<div class="wdt-welcome-title">Gracias por utilizar esta Herramienta de Realidad Aumentada Empezando desde cero</div>',
      '<div class="wdt-welcome-copy">Esta consola ayuda a diagnosticar WebAR, MindAR, A-Frame, camara, red, rendimiento y eventos de tracking directamente desde el navegador.</div>',
      '<div class="wdt-link-grid">',
      '<a class="wdt-link-btn" target="_blank" rel="noopener noreferrer" href="', escapeHtml(links.site), '">Sitio oficial</a>',
      '<a class="wdt-link-btn" target="_blank" rel="noopener noreferrer" href="', escapeHtml(links.blog), '">Blog</a>',
      '</div>',
      '<div class="wdt-card">',
      '<div class="wdt-label">Donaciones</div>',
      '<div class="wdt-donate">',
     '<a class="wdt-link-btn" href="', escapeHtml(links.donations.nequi), '">Nequi:<span class="wdt-nequi-number">315-969-9392</span></a>',
      '<a class="wdt-link-btn" target="_blank" rel="noopener noreferrer" href="', escapeHtml(links.donations.paypal), '">PayPal</a>',
      '<a class="wdt-link-btn" target="_blank" rel="noopener noreferrer" href="', escapeHtml(links.donations.buyMeACoffee), '">Buy Me a Coffee</a>',
      '<a class="wdt-link-btn" target="_blank" rel="noopener noreferrer" href="', escapeHtml(links.donations.patreon), '">Patreon</a>',
      '</div>',
      '<div class="wdt-small" style="margin-top:8px">Gracias por apoyar mi trabajo.</div>',
      '</div>',
      '<button class="wdt-primary" data-action="enter">Entrar a la herramienta</button>',
      '</div>'
    ].join('');
  }

  function renderEventRow(event) {
    return [
      '<div class="wdt-row" style="border-left-color:#58a6ff">',
      '<div class="wdt-row-top">',
      '<span class="wdt-badge" style="color:#58a6ff">EVENTO AR</span>',
      '<span class="wdt-small">', escapeHtml(event.time), '</span>',
      '</div>',
      '<div style="font-weight:800;color:#f0f6fc">', escapeHtml(event.name), '</div>',
      '<div class="wdt-small">Origen: ', escapeHtml(event.source), '</div>',
      event.detail ? '<div class="wdt-detail">' + escapeHtml(event.detail) + '</div>' : '',
      event.solution ? '<div class="wdt-solution"><b>Lectura sugerida:</b><br>' + escapeHtml(event.solution) + '</div>' : '',
      '</div>'
    ].join('');
  }

  function renderEvents() {
    if (!state.events.length) {
      return '<div class="wdt-empty">Esperando eventos AR como targetFound o targetLost...</div>';
    }
    return state.events.map(renderEventRow).join('');
  }

  function renderTimeline() {
    if (!state.timeline.length) return '<div class="wdt-empty">Esperando timeline de sesion AR...</div>';
    return [
      '<div class="wdt-timeline">',
      state.timeline.map(function (item) {
        return [
          '<div class="wdt-timeline-item">',
          '<div class="wdt-row-top"><b>', escapeHtml(item.step), '</b><span class="wdt-small">', escapeHtml(item.time), '</span></div>',
          '<div class="wdt-small">Estado: ', escapeHtml(item.status), '</div>',
          item.detail ? '<div class="wdt-detail">' + escapeHtml(item.detail) + '</div>' : '',
          '</div>'
        ].join('');
      }).join(''),
      '</div>'
    ].join('');
  }

  function renderAssets() {
    if (!state.assets.length) return '<div class="wdt-empty">Esperando carga de assets...</div>';
    return state.assets.map(function (asset) {
      var color = asset.issues.length ? '#d29922' : '#3fb950';
      return [
        '<div class="wdt-row" style="border-left-color:', color, '">',
        '<div class="wdt-row-top"><b style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">', escapeHtml(asset.file), '</b><span class="wdt-small">', escapeHtml(prettyBytes(asset.size)), '</span></div>',
        '<div class="wdt-small">', escapeHtml(asset.type), ' - ', asset.external ? 'externo' : 'local', ' - ', escapeHtml(asset.duration), ' ms - hits ', escapeHtml(asset.hits), '</div>',
        asset.issues.length ? '<div class="wdt-solution"><b>Hallazgos:</b><br>' + escapeHtml(asset.issues.join('\n')) + '</div>' : '<div class="wdt-small" style="color:#3fb950">Sin problemas fuertes detectados.</div>',
        '<div class="wdt-detail">', escapeHtml(asset.url), '</div>',
        '</div>'
      ].join('');
    }).join('');
  }

  function renderCompatibility() {
    var compat = compatibilityAnalysis();
    var color = compat.status === 'Apto' ? '#3fb950' : compat.status === 'Limitado' ? '#d29922' : '#f85149';
    return [
      '<div class="wdt-card" style="margin-bottom:12px">',
      '<div class="wdt-label">Resultado de compatibilidad</div>',
      '<div class="wdt-value" style="color:', color, '">', escapeHtml(compat.status), '</div>',
      '<div class="wdt-small">Score ', escapeHtml(compat.score), '/100</div>',
      '</div>',
      compat.reasons.map(function (reason) {
        return '<div class="wdt-row" style="border-left-color:' + color + '"><div style="font-weight:700">' + escapeHtml(reason) + '</div></div>';
      }).join(''),
      '<div class="wdt-code">', escapeHtml('renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));\n// Usa HTTPS, modelos comprimidos y prueba en navegador movil nativo.'), '</div>'
    ].join('');
  }

  function renderMindAR() {
    if (!state.framework.mindar) {
      return '<div class="wdt-empty">Modo MindAR inactivo: no se detecto MindAR en esta pagina.</div>';
    }
    var marker = markerAnalysis();
    var checks = mindarChecks();
    return [
      '<div class="wdt-grid">',
      '<div class="wdt-card"><div class="wdt-label">Tracking</div><div class="wdt-value" style="font-size:18px">', escapeHtml(marker.status), '</div><div class="wdt-small">', escapeHtml(marker.recommendation), '</div></div>',
      '<div class="wdt-card"><div class="wdt-label">Marcador</div><div class="wdt-value">', escapeHtml(state.marker.foundCount), '/', escapeHtml(state.marker.lostCount), '</div><div class="wdt-small">found / lost</div></div>',
      '<div class="wdt-card"><div class="wdt-label">Parpadeos</div><div class="wdt-value">', escapeHtml(state.marker.flickerCount), '</div><div class="wdt-small">Cambios rapidos de tracking</div></div>',
      '<div class="wdt-card"><div class="wdt-label">Max estable</div><div class="wdt-value" style="font-size:18px">', escapeHtml((marker.maxStableMs / 1000).toFixed(1)), 's</div></div>',
      '</div>',
      checks.map(function (check) {
        return [
          '<div class="wdt-row" style="border-left-color:', check.ok ? '#3fb950' : '#d29922', '">',
          '<div class="wdt-row-top"><b>', escapeHtml(check.label), '</b><span class="wdt-badge" style="color:', check.ok ? '#3fb950' : '#d29922', '">', check.ok ? 'OK' : 'REVISAR', '</span></div>',
          '<div class="wdt-small">', escapeHtml(check.detail), '</div>',
          '</div>'
        ].join('');
      }).join(''),
      '<div class="wdt-code">', escapeHtml('<a-scene mindar-image="imageTargetSrc: ./targets.mind;" embedded>\n  <a-entity mindar-target="targetIndex: 0"></a-entity>\n</a-scene>'), '</div>'
    ].join('');
  }

  function renderReport() {
    var report = buildTechnicalSummary();
    return [
      '<div class="wdt-card" style="margin-bottom:12px">',
      '<div class="wdt-label">Reporte tecnico</div>',
      '<div style="font-weight:800;line-height:1.4;color:#f0f6fc">', escapeHtml(report.headline), '</div>',
      '<div class="wdt-small" style="margin-top:8px">Compatibilidad: ', escapeHtml(report.compatibility.status), ' / Marcador: ', escapeHtml(report.marker.status), ' / Score: ', escapeHtml(report.score), '</div>',
      '</div>',
      '<div class="wdt-solution"><b>Siguiente paso recomendado:</b><br>', escapeHtml(report.recommendedNextStep), '</div>',
      '<div class="wdt-label" style="margin-top:12px">JSON resumido</div>',
      '<div class="wdt-code">', escapeHtml(JSON.stringify(report, null, 2)), '</div>'
    ].join('');
  }

  function renderSummary() {
    var s = summary();
    var solutions = topSolutions();
    var compat = compatibilityAnalysis();
    var marker = markerAnalysis();
    return [
      '<div class="wdt-grid">',
      '<div class="wdt-card"><div class="wdt-label">Estado WebAR</div><div class="wdt-value" style="color:', s.score >= 85 ? '#3fb950' : s.score >= 60 ? '#d29922' : '#f85149', '">', s.status, '</div><div class="wdt-small">Score ', s.score, '/100</div></div>',
      '<div class="wdt-card"><div class="wdt-label">FPS</div><div class="wdt-value" style="color:', state.metrics.fps >= 30 ? '#3fb950' : '#f85149', '">', state.metrics.fps, '</div><div class="wdt-small">Objetivo movil: 30+</div></div>',
      '<div class="wdt-card"><div class="wdt-label">Errores</div><div class="wdt-value">', s.critical + s.errors, '</div><div class="wdt-small">Criticos ', s.critical, ' / errores ', s.errors, '</div></div>',
      '<div class="wdt-card"><div class="wdt-label">Camara</div><div class="wdt-value" style="font-size:16px">', escapeHtml(state.hardware.cameraRes), '</div><div class="wdt-small">Permiso: ', escapeHtml(state.hardware.cameraPermission), '</div></div>',
      '<div class="wdt-card"><div class="wdt-label">Compatibilidad</div><div class="wdt-value" style="font-size:18px">', escapeHtml(compat.status), '</div><div class="wdt-small">Score ', escapeHtml(compat.score), '/100</div></div>',
      '<div class="wdt-card"><div class="wdt-label">Marcador</div><div class="wdt-value" style="font-size:18px">', escapeHtml(marker.status), '</div><div class="wdt-small">Found ', escapeHtml(state.marker.foundCount), ' / Lost ', escapeHtml(state.marker.lostCount), '</div></div>',
      '</div>',
      '<div class="wdt-card" style="margin-bottom:12px"><div class="wdt-label">Diagnostico rapido</div>',
      '<div class="wdt-kv"><span>HTTPS / contexto seguro</span><b style="color:', state.hardware.secureContext ? '#3fb950' : '#f85149', '">', state.hardware.secureContext ? 'OK' : 'Falla', '</b></div>',
      '<div class="wdt-kv"><span>WebGL</span><b>', escapeHtml(state.hardware.webgl), '</b></div>',
      '<div class="wdt-kv"><span>Framework</span><b>', escapeHtml([state.framework.aframe ? 'A-Frame' : '', state.framework.mindar ? 'MindAR' : '', state.framework.three ? 'Three.js' : ''].filter(Boolean).join(' / ') || 'Generico'), '</b></div>',
      '</div>',
      '<div class="wdt-label">Acciones recomendadas</div>',
      solutions.length ? solutions.map(renderLogRow).join('') : '<div class="wdt-empty">Sin problemas detectados por ahora</div>'
    ].join('');
  }

  function renderPerf() {
    return [
      '<div class="wdt-grid">',
      '<div class="wdt-card"><div class="wdt-label">FPS</div><div class="wdt-value" style="color:', state.metrics.fps >= 30 ? '#3fb950' : '#f85149', '">', state.metrics.fps, '</div></div>',
      '<div class="wdt-card"><div class="wdt-label">Draw calls</div><div class="wdt-value" style="color:', state.metrics.drawCalls <= PERF_WARN.drawCalls ? '#3fb950' : '#d29922', '">', state.metrics.drawCalls, '</div></div>',
      '<div class="wdt-card"><div class="wdt-label">Triangulos</div><div class="wdt-value" style="font-size:17px">', Number(state.metrics.triangles || 0).toLocaleString(), '</div></div>',
      '<div class="wdt-card"><div class="wdt-label">Memoria JS</div><div class="wdt-value" style="font-size:17px">', state.metrics.memoryMb == null ? 'N/D' : escapeHtml(state.metrics.memoryMb + ' MB'), '</div></div>',
      '<div class="wdt-card"><div class="wdt-label">Long tasks</div><div class="wdt-value">', state.metrics.longTasks, '</div><div class="wdt-small">Ultima: ', state.metrics.lastLongTaskMs, ' ms</div></div>',
      '<div class="wdt-card"><div class="wdt-label">DPR</div><div class="wdt-value">', escapeHtml(state.hardware.devicePixelRatio), '</div></div>',
      '</div>',
      '<div class="wdt-card"><div class="wdt-label">Consejos de rendimiento</div><div class="wdt-small">Para WebAR movil prioriza 30 FPS estables, modelos low-poly, texturas 1024/2048, pocos materiales, carga diferida y pausa de animaciones cuando el target no este visible.</div></div>'
    ].join('');
  }

  function renderNetwork() {
    if (!state.network.length) return '<div class="wdt-empty">Escaneando peticiones de red...</div>';
    return state.network.map(function (n) {
      var color = n.ok ? '#3fb950' : '#f85149';
      return [
        '<div class="wdt-row" style="border-left-color:', color, '">',
        '<div class="wdt-row-top"><span style="font-family:Consolas,monospace;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:', color, '">', escapeHtml(n.file), '</span><span class="wdt-small">', escapeHtml(n.status), ' / ', escapeHtml(prettyBytes(n.size)), '</span></div>',
        '<div class="wdt-small">', escapeHtml(n.method), ' - ', escapeHtml(n.type), ' - ', escapeHtml(n.duration), ' ms</div>',
        '<div class="wdt-detail">', escapeHtml(n.url), '</div>',
        '</div>'
      ].join('');
    }).join('');
  }

  function renderSystem() {
    var compat = compatibilityAnalysis();
    return [
      '<div class="wdt-card">',
      '<div class="wdt-label">Sistema</div>',
      '<div class="wdt-kv"><span>Compatibilidad</span><b>', escapeHtml(compat.status), ' (', escapeHtml(compat.score), '/100)</b></div>',
      '<div class="wdt-kv"><span>Protocolo</span><b>', escapeHtml(state.hardware.protocol), '</b></div>',
      '<div class="wdt-kv"><span>Contexto seguro</span><b>', state.hardware.secureContext ? 'Si' : 'No', '</b></div>',
      '<div class="wdt-kv"><span>Camara</span><b>', escapeHtml(state.hardware.cameraRes), '</b></div>',
      '<div class="wdt-kv"><span>Facing mode</span><b>', escapeHtml(state.hardware.cameraFacing), '</b></div>',
      '<div class="wdt-kv"><span>Permiso camara</span><b>', escapeHtml(state.hardware.cameraPermission), '</b></div>',
      '<div class="wdt-kv"><span>WebGL</span><b>', escapeHtml(state.hardware.webgl), '</b></div>',
      '<div class="wdt-kv"><span>WebGL2</span><b>', state.hardware.webgl2 ? 'Si' : 'No', '</b></div>',
      '<div class="wdt-kv"><span>Max texture</span><b>', escapeHtml(state.hardware.maxTextureSize || 'N/D'), '</b></div>',
      '<div class="wdt-kv"><span>Conexion</span><b>', escapeHtml(state.hardware.connection), '</b></div>',
      '<div class="wdt-kv"><span>Bateria</span><b>', escapeHtml(state.hardware.battery), '</b></div>',
      '</div>',
      '<div class="wdt-detail" style="margin-top:10px">', escapeHtml(navigator.userAgent), '</div>'
    ].join('');
  }

  function renderLogs() {
    if (!state.logs.length) return '<div class="wdt-empty">OK: entorno WebAR limpio y estable</div>';
    return state.logs.map(renderLogRow).join('');
  }

  function render() {
    scheduledRender = false;
    if (!panel) return;
    var previousBody = panel.querySelector('.wdt-body');
    var previousScrollTop = previousBody ? previousBody.scrollTop : 0;
    var previousTab = panel.getAttribute('data-active-tab');

    if (!state.introSeen) {
      panel.innerHTML = [
        '<div class="wdt-head">',
        '<div class="wdt-title">WebAR DevTools - By IngCarlosReina <span class="wdt-small">v', VERSION, '</span></div>',
        '<div class="wdt-actions">',
        '<button class="wdt-icon" data-action="close" title="Cerrar">Cerrar</button>',
        '</div>',
        '</div>',
        '<div class="wdt-body">', renderWelcome(), '</div>'
      ].join('');

      Array.prototype.slice.call(panel.querySelectorAll('[data-action]')).forEach(function (btn) {
        btn.addEventListener('click', function () {
          var action = btn.getAttribute('data-action');
          if (action === 'close') closePanel();
          if (action === 'enter') {
            state.introSeen = true;
            render();
          }
        });
      });
      return;
    }

    var s = summary();
    var tabs = [
      ['summary', 'Resumen'],
      ['perf', 'Perf'],
      ['network', 'Red'],
      ['timeline', 'Tiempo'],
      ['assets', 'Assets'],
      ['events', 'Eventos'],
      ['compat', 'Compat'],
      state.framework.mindar ? ['mindar', 'MindAR'] : null,
      ['report', 'Reporte'],
      ['logs', 'Logs (' + (s.critical + s.errors) + ')'],
      ['system', 'Sistema']
    ].filter(Boolean);

    if (state.activeTab === 'mindar' && !state.framework.mindar) state.activeTab = 'summary';

    var body = state.activeTab === 'summary' ? renderSummary()
      : state.activeTab === 'perf' ? renderPerf()
      : state.activeTab === 'network' ? renderNetwork()
      : state.activeTab === 'timeline' ? renderTimeline()
      : state.activeTab === 'assets' ? renderAssets()
      : state.activeTab === 'events' ? renderEvents()
      : state.activeTab === 'compat' ? renderCompatibility()
      : state.activeTab === 'mindar' ? renderMindAR()
      : state.activeTab === 'report' ? renderReport()
      : state.activeTab === 'system' ? renderSystem()
      : renderLogs();

    panel.innerHTML = [
      '<div class="wdt-head">',
      '<div class="wdt-title">WebAR DevTools <span class="wdt-small">v', VERSION, '</span></div>',
      '<div class="wdt-actions">',
      '<button class="wdt-icon" data-action="scan" title="Reescanear">Scan</button>',
      '<button class="wdt-icon" data-action="report" title="Generar reporte tecnico">Reporte</button>',
      '<button class="wdt-icon" data-action="copy" title="Copiar reporte">Copiar</button>',
      '<button class="wdt-icon" data-action="close" title="Cerrar">Cerrar</button>',
      '</div>',
      '</div>',
      '<div class="wdt-tabs">',
      tabs.map(function (tab) {
        return '<button class="wdt-tab ' + (state.activeTab === tab[0] ? 'active' : '') + '" data-tab="' + tab[0] + '">' + escapeHtml(tab[1]) + '</button>';
      }).join(''),
      '</div>',
      '<div class="wdt-body">', body, '</div>'
    ].join('');
    panel.setAttribute('data-active-tab', state.activeTab);

    var nextBody = panel.querySelector('.wdt-body');
    if (nextBody && previousTab === state.activeTab) {
      nextBody.scrollTop = previousScrollTop;
    }

    Array.prototype.slice.call(panel.querySelectorAll('[data-tab]')).forEach(function (btn) {
      btn.addEventListener('click', function () {
        state.activeTab = btn.getAttribute('data-tab');
        render();
      });
    });

    Array.prototype.slice.call(panel.querySelectorAll('[data-action]')).forEach(function (btn) {
      btn.addEventListener('click', function () {
        var action = btn.getAttribute('data-action');
        if (action === 'close') closePanel();
        if (action === 'scan') {
          state.scanDone = false;
          scanDom();
        }
        if (action === 'report') {
          state.activeTab = 'report';
          render();
        }
        if (action === 'enter') {
          state.introSeen = true;
          render();
        }
        if (action === 'copy') copyReport();
      });
    });
  }

  function requestRender() {
    if (!state.open || scheduledRender) return;
    scheduledRender = true;
    requestAnimationFrame(render);
  }

  function openPanel() {
    state.open = true;
    panel.classList.add('open');
    render();
  }

  function closePanel() {
    state.open = false;
    panel.classList.remove('open');
  }

  function exportReport() {
    return {
      generatedAt: new Date().toISOString(),
      url: window.location.href,
      version: VERSION,
      summary: summary(),
      technicalSummary: buildTechnicalSummary(),
      compatibility: compatibilityAnalysis(),
      marker: markerAnalysis(),
      metrics: state.metrics,
      hardware: state.hardware,
      framework: state.framework,
      logs: state.logs,
      events: state.events,
      timeline: state.timeline,
      assets: state.assets.map(function (asset) {
        return {
          url: asset.url,
          file: asset.file,
          type: asset.type,
          size: asset.size,
          duration: asset.duration,
          status: asset.status,
          ok: asset.ok,
          external: asset.external,
          hits: asset.hits,
          issues: asset.issues,
          loadedAt: asset.loadedAt
        };
      }),
      mindarChecks: mindarChecks(),
      network: state.network.map(function (item) {
        return {
          status: item.status,
          ok: item.ok,
          method: item.method,
          url: item.url,
          file: item.file,
          size: item.size,
          type: item.type,
          duration: item.duration,
          time: item.time
        };
      })
    };
  }

  function copyReport() {
    var report = JSON.stringify(exportReport(), null, 2);
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(report).then(function () {
        addLog('INFO', 'REPORTE', 'Reporte copiado al portapapeles', '', 'Puedes pegarlo en un issue, correo o chat para soporte tecnico.');
      }).catch(function () {
        addLog('ATENCION', 'REPORTE', 'No se pudo copiar automaticamente', '', 'Ejecuta WebARDevTools.exportReport() en consola para obtener el JSON.');
      });
    } else {
      addLog('INFO', 'REPORTE', 'Reporte disponible por consola', '', 'Ejecuta WebARDevTools.exportReport() para obtener el JSON.');
    }
  }

  function initUi() {
    if (document.getElementById('webar-devtools')) return;
    createStyles();
    root = document.createElement('div');
    root.id = 'webar-devtools';

    panel = document.createElement('div');
    panel.className = 'wdt-panel';

    launcher = document.createElement('button');
    launcher.className = 'wdt-launcher';
    launcher.type = 'button';
    launcher.textContent = 'AR DevTools';
    launcher.addEventListener('click', function () {
      state.open ? closePanel() : openPanel();
    });

    root.appendChild(panel);
    root.appendChild(launcher);
    document.body.appendChild(root);
    render();
  }

  function boot() {
    installConsoleHooks();
    installFetchHook();
    installXhrHook();
    installCameraHook();
    installWebGlHooks();
    installGlobalErrorHooks();
    installPerformanceObservers();

    window.WebARDevTools = {
      version: VERSION,
      open: openPanel,
      close: closePanel,
      scan: function () {
        state.scanDone = false;
        scanDom();
      },
      addLog: addLog,
      addEvent: addEvent,
      addTimeline: addTimeline,
      exportReport: exportReport,
      state: state
    };

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', function () {
        initUi();
        scanDom();
      });
    } else {
      initUi();
      scanDom();
    }

    requestAnimationFrame(monitorLoop);
    installDomObserver();
    addTimeline('script de diagnostico cargado', 'OK', 'WebAR DevTools v' + VERSION);
  }

  boot();
})();
