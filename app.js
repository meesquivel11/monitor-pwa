const moneda = new Intl.NumberFormat('es-MX', {
  style: 'currency',
  currency: 'MXN'
});

const DB_NOMBRE = 'monitor-pwa';
const DB_VERSION = 1;
const STORE_PENDIENTES = 'pendientes';
const STORE_CACHE = 'cache';

let db = null;
let catalogos = null;
let accessToken = null;
let tokenClient = null;
let sincronizando = false;

const CATALOGOS_BASE = {
  tiposMovimiento: [
    { Tipo: 'INGRESO' },
    { Tipo: 'GASTO' },
    { Tipo: 'TRANSFERENCIA' },
    { Tipo: 'INVERSIÓN' },
    { Tipo: 'RETIRO_INVERSION' },
    { Tipo: 'PAGO_DEUDA' },
    { Tipo: 'RENDIMIENTO' },
    { Tipo: 'AJUSTE' }
  ],
  cuentas: [
    { ID: 'CTA001', Institución: 'BBVA', Tipo: 'Débito', Nombre: 'Débito BBVA', Crédito: 'No', Activa: 'Sí' },
    { ID: 'CTA002', Institución: 'BBVA', Tipo: 'Crédito', Nombre: 'TDC BBVA', Crédito: 'Sí', Activa: 'Sí' },
    { ID: 'CTA003', Institución: 'Nu', Tipo: 'Débito', Nombre: 'Débito NU', Crédito: 'No', Activa: 'Sí' },
    { ID: 'CTA004', Institución: 'Nu', Tipo: 'Crédito', Nombre: 'TDC NU', Crédito: 'Sí', Activa: 'Sí' },
    { ID: 'CTA005', Institución: 'CETES', Tipo: 'Inversión', Nombre: 'CETES', Crédito: 'No', Activa: 'Sí' },
    { ID: 'CTA006', Institución: 'Profuturo', Tipo: 'AFORE', Nombre: 'Profuturo', Crédito: 'No', Activa: 'Sí' },
    { ID: 'CTA007', Institución: 'Efectivo', Tipo: 'Efectivo', Nombre: 'Efectivo', Crédito: 'No', Activa: 'Sí' }
  ],
  categorias: [
    { Categoría: 'Alimentación' },
    { Categoría: 'Ropa y calzado' },
    { Categoría: 'Vivienda y servicios' },
    { Categoría: 'Limpieza y cuidados de la casa' },
    { Categoría: 'Cuidados de la salud' },
    { Categoría: 'Transporte' },
    { Categoría: 'Educación y diversión' },
    { Categoría: 'Cuidados personales' },
    { Categoría: 'Pago de deudas' },
    { Categoría: 'Gastos menores' },
    { Categoría: 'Servicios profesionales' },
    { Categoría: 'Combustible profesional' },
    { Categoría: 'Equipo e insumos' },
    { Categoría: 'Contador' },
    { Categoría: 'Inversión' },
    { Categoría: 'Otros' },
    { Categoría: 'Intereses y comisiones financieras' }
  ],
  tiposIngreso: [
    { Tipo: 'Nómina' },
    { Tipo: 'Servicios profesionales' },
    { Tipo: 'Venta de animales' },
    { Tipo: 'Rendimientos financieros' },
    { Tipo: 'Otros ingresos' }
  ],
  tratamientos: [
    { Tratamiento: 'No fiscal / personal' },
    { Tratamiento: 'Deducción personal - por revisar' },
    { Tratamiento: 'Gasto relacionado con actividad 612 - por revisar' },
    { Tratamiento: 'No deducible' },
    { Tratamiento: 'Por revisar con contador' }
  ],
  regimenes: [
    { 'Clave SAT': '605', 'Régimen': 'Sueldos y Salarios e Ingresos Asimilados a Salarios' },
    { 'Clave SAT': '612', 'Régimen': 'Personas Físicas con Actividades Empresariales y Profesionales' }
  ]
};

function esc(v) {
  return String(v ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function fechaHoy() {
  const d = new Date();
  const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return local.toISOString().split('T')[0];
}

function nombreTipo(tipo) {
  const m = {
    INGRESO: 'Ingreso',
    GASTO: 'Gasto',
    TRANSFERENCIA: 'Transferencia',
    'INVERSIÓN': 'Inversión',
    RETIRO_INVERSION: 'Retiro de inversión',
    PAGO_DEUDA: 'Pago de deuda',
    RENDIMIENTO: 'Rendimiento',
    AJUSTE: 'Ajuste'
  };
  return m[tipo] || tipo;
}

function mostrar(id, visible) {
  document.getElementById(id).classList.toggle('oculto', !visible);
}

function llenarSelect(id, items, valor, texto = valor, placeholder = '') {
  const s = document.getElementById(id);
  s.innerHTML = '';

  const inicial = document.createElement('option');
  inicial.value = '';
  inicial.textContent = placeholder;
  s.appendChild(inicial);

  (items || []).forEach(item => {
    if (item[valor] === undefined || item[valor] === null || item[valor] === '') return;

    const o = document.createElement('option');
    o.value = item[valor];
    o.textContent = item[texto] ?? item[valor];
    s.appendChild(o);
  });
}

// ============================================================
// IndexedDB
// ============================================================

function abrirDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NOMBRE, DB_VERSION);

    req.onupgradeneeded = event => {
      const database = event.target.result;

      if (!database.objectStoreNames.contains(STORE_PENDIENTES)) {
        database.createObjectStore(STORE_PENDIENTES, { keyPath: 'syncId' });
      }

      if (!database.objectStoreNames.contains(STORE_CACHE)) {
        database.createObjectStore(STORE_CACHE, { keyPath: 'clave' });
      }
    };

    req.onsuccess = event => resolve(event.target.result);
    req.onerror = () => reject(req.error);
  });
}

function operacionStore(storeNombre, modo, ejecutor) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeNombre, modo);
    const store = tx.objectStore(storeNombre);
    const req = ejecutor(store);

    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function guardarPendiente(registro) {
  return operacionStore(STORE_PENDIENTES, 'readwrite', store => store.put(registro));
}

function obtenerPendientes() {
  return operacionStore(STORE_PENDIENTES, 'readonly', store => store.getAll());
}

function borrarPendiente(syncId) {
  return operacionStore(STORE_PENDIENTES, 'readwrite', store => store.delete(syncId));
}

function guardarCache(clave, valor) {
  return operacionStore(STORE_CACHE, 'readwrite', store =>
    store.put({ clave, valor, actualizado: new Date().toISOString() })
  );
}

async function leerCache(clave) {
  const r = await operacionStore(STORE_CACHE, 'readonly', store => store.get(clave));
  return r ? r.valor : null;
}

// ============================================================
// PWA / conexión
// ============================================================

function configLista() {
  const cfg = window.MONITOR_CONFIG || {};
  return (
    cfg.scriptId &&
    !cfg.scriptId.startsWith('PEGA_AQUI') &&
    cfg.clientId &&
    !cfg.clientId.startsWith('PEGA_AQUI')
  );
}

function actualizarEstadoConexion() {
  const estado = document.getElementById('syncEstado');
  const detalle = document.getElementById('syncDetalle');
  const boton = document.getElementById('btnConectar');

  if (!navigator.onLine) {
    estado.textContent = 'Sin conexión';
    detalle.textContent = 'Puedes registrar movimientos; quedarán pendientes en este teléfono.';
    boton.style.display = 'none';
    return;
  }

  boton.style.display = 'inline-block';

  if (!configLista()) {
    estado.textContent = 'Modo offline listo';
    detalle.textContent = 'Falta configurar Google para sincronizar con Sheets.';
    boton.disabled = true;
    boton.textContent = 'Sin configurar';
    return;
  }

  boton.disabled = false;

  if (!accessToken) {
    estado.textContent = 'En línea · sin conexión a Google';
    detalle.textContent = 'Tus pendientes están seguros localmente. Conecta Google para sincronizar.';
    boton.textContent = 'Conectar Google';
  } else {
    estado.textContent = sincronizando ? 'Sincronizando…' : 'En línea · Google conectado';
    detalle.textContent = sincronizando
      ? 'Enviando movimientos pendientes y actualizando saldos.'
      : 'Monitor puede sincronizar con Google Sheets.';
    boton.textContent = 'Sincronizar';
  }
}

async function actualizarPendientesUI() {
  const pendientes = await obtenerPendientes();
  const detalle = document.getElementById('syncDetalle');

  if (pendientes.length) {
    const actual = detalle.textContent.replace(/\s*·\s*\d+ pendientes?$/, '');
    detalle.textContent = `${actual} · ${pendientes.length} ${pendientes.length === 1 ? 'pendiente' : 'pendientes'}`;
  }
}

function inicializarGoogleAuth() {
  if (!navigator.onLine || !configLista()) return false;
  if (!window.google || !google.accounts || !google.accounts.oauth2) return false;

  if (!tokenClient) {
    tokenClient = google.accounts.oauth2.initTokenClient({
      client_id: window.MONITOR_CONFIG.clientId,
      scope: window.MONITOR_CONFIG.scopes,
      callback: async response => {
        if (response.error) {
          console.error(response);
          mostrarMensaje('No fue posible conectar con Google.', false);
          return;
        }

        accessToken = response.access_token;
        actualizarEstadoConexion();
        await sincronizarTodo();
      }
    });
  }

  return true;
}

function conectarGoogle() {
  if (!navigator.onLine) return;

  if (accessToken) {
    sincronizarTodo();
    return;
  }

  if (!inicializarGoogleAuth()) {
    alert('La autenticación de Google todavía no está disponible. Revisa config.js o espera unos segundos.');
    return;
  }

  tokenClient.requestAccessToken({ prompt: '' });
}

async function ejecutarAppsScript(funcion, parametros = []) {
  if (!accessToken) throw new Error('Google no está conectado.');

  const cfg = window.MONITOR_CONFIG;

  const respuesta = await fetch(
    `https://script.googleapis.com/v1/scripts/${encodeURIComponent(cfg.scriptId)}:run`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        function: funcion,
        parameters: parametros,
        devMode: Boolean(cfg.devMode)
      })
    }
  );

  const json = await respuesta.json();

  if (!respuesta.ok) {
    throw new Error(json?.error?.message || `Error HTTP ${respuesta.status}`);
  }

  if (json.error) {
    const detalle = json.error.details?.[0]?.errorMessage;
    throw new Error(detalle || json.error.message || 'Error de Apps Script.');
  }

  return json.response?.result;
}

async function sincronizarTodo() {
  if (!navigator.onLine || !accessToken || sincronizando) return;

  sincronizando = true;
  actualizarEstadoConexion();

  try {
    const pendientes = await obtenerPendientes();

    for (const registro of pendientes) {
      await ejecutarAppsScript('apiMovilRegistrarMovimientoV1', [registro.datos]);
      await borrarPendiente(registro.syncId);
    }

    const [datos, catalogosServidor] = await Promise.all([
      ejecutarAppsScript('apiMovilObtenerDatosV1'),
      ejecutarAppsScript('apiMovilObtenerCatalogosV1')
    ]);

    if (datos) {
      await guardarCache('datosMovil', datos);
      mostrarDatos(datos);
    }

    if (catalogosServidor) {
      catalogos = catalogosServidor;
      await guardarCache('catalogos', catalogosServidor);
      prepararCatalogos();
    }

  } catch (error) {
    console.error(error);

    // Un token puede caducar. Conservamos siempre la cola local.
    if (/auth|token|401|403|permission/i.test(String(error.message || error))) {
      accessToken = null;
    }

    document.getElementById('syncEstado').textContent = 'Sincronización pendiente';
    document.getElementById('syncDetalle').textContent =
      `No se perdió ningún movimiento. ${error.message || error}`;

  } finally {
    sincronizando = false;
    actualizarEstadoConexion();
    await actualizarPendientesUI();
  }
}

// ============================================================
// Datos / UI
// ============================================================

async function iniciar() {
  db = await abrirDB();

  if ('serviceWorker' in navigator) {
    try {
      await navigator.serviceWorker.register('./sw.js');
    } catch (error) {
      console.error('Service Worker:', error);
    }
  }

  const catalogosCache = await leerCache('catalogos');
  catalogos = catalogosCache || CATALOGOS_BASE;
  prepararCatalogos();

  const datosCache = await leerCache('datosMovil');

  if (datosCache) {
    mostrarDatos(datosCache);
  } else {
    mostrarDatos({
      resumen: { dineroDisponible: 0, deudaTDCNU: 0 },
      cuentas: [],
      movimientos: []
    }, true);
  }

  actualizarEstadoConexion();
  await actualizarPendientesUI();

  // GIS se carga de forma asíncrona.
  setTimeout(inicializarGoogleAuth, 800);

  if (navigator.onLine && accessToken) {
    sincronizarTodo();
  }
}

function mostrarDatos(datos, sinSaldos = false) {
  document.getElementById('cargando').style.display = 'none';
  document.getElementById('contenido').style.display = 'block';

  document.getElementById('resumenDisponible').textContent =
    sinSaldos ? '—' : moneda.format(Number(datos.resumen?.dineroDisponible) || 0);

  document.getElementById('resumenDeuda').textContent =
    sinSaldos ? '—' : moneda.format(Number(datos.resumen?.deudaTDCNU) || 0);

  mostrarCuentas(datos.cuentas || [], sinSaldos);
  mostrarMovimientos(datos.movimientos || []);
}

function mostrarCuentas(cuentas, sinSaldos = false) {
  const contenedor = document.getElementById('cuentasMovil');
  contenedor.innerHTML = '';

  if (!cuentas.length) {
    const visibles = ['Débito BBVA', 'Débito NU', 'TDC NU', 'Efectivo'];

    visibles.forEach(nombre => {
      const cuenta = (catalogos?.cuentas || CATALOGOS_BASE.cuentas)
        .find(x => x.Nombre === nombre);

      if (!cuenta) return;

      const credito = esCredito(cuenta);

      contenedor.innerHTML += `
        <div class="cuenta">
          <div class="cuenta-nombre">${esc(cuenta.Nombre)}</div>
          <div class="cuenta-inst">${esc(cuenta.Institución || cuenta.Tipo)}</div>
          <div class="cuenta-saldo">—</div>
          <div class="cuenta-leyenda">${credito ? 'Deuda · sin sincronizar' : 'Disponible · sin sincronizar'}</div>
        </div>`;
    });

    return;
  }

  cuentas.forEach(cuenta => {
    const credito = esCredito(cuenta);

    contenedor.innerHTML += `
      <div class="cuenta">
        <div class="cuenta-nombre">${esc(cuenta['Nombre'])}</div>
        <div class="cuenta-inst">${esc(cuenta['Institución'] || cuenta['Tipo'])}</div>
        <div class="cuenta-saldo">${
          sinSaldos ? '—' : moneda.format(Number(cuenta.saldoActual) || 0)
        }</div>
        <div class="cuenta-leyenda">${credito ? 'Deuda actual' : 'Disponible'}</div>
      </div>`;
  });
}

async function mostrarMovimientos(movs) {
  const contenedor = document.getElementById('movimientosRecientes');
  contenedor.innerHTML = '';

  const pendientes = db ? await obtenerPendientes() : [];
  const locales = pendientes
    .slice()
    .sort((a, b) => String(b.creadoEn).localeCompare(String(a.creadoEn)))
    .map(p => ({
      ...p.datos,
      'Fecha': p.datos.fecha,
      'Tipo movimiento': p.datos.tipoMovimiento,
      'Cuenta origen': p.datos.cuentaOrigen,
      'Cuenta destino': p.datos.cuentaDestino,
      'Importe': p.datos.importe,
      'Descripción': `${p.datos.descripcion || nombreTipo(p.datos.tipoMovimiento)} · pendiente`
    }));

  const lista = [...locales, ...(movs || [])].slice(0, 10);

  if (!lista.length) {
    contenedor.innerHTML = '<div class="vacio">No hay movimientos registrados.</div>';
    return;
  }

  lista.forEach(m => {
    const tipo = String(m['Tipo movimiento'] || '').trim().toUpperCase();
    const importe = Number(m['Importe']) || 0;
    const prefijo = tipo === 'GASTO' ? '-' : (
      tipo === 'INGRESO' || tipo === 'RENDIMIENTO' ? '+' : ''
    );
    const cuenta = m['Cuenta origen'] || m['Cuenta destino'] || '';
    const desc = m['Descripción'] || nombreTipo(tipo);

    contenedor.innerHTML += `
      <div class="movimiento">
        <div>
          <div class="mov-desc">${esc(desc)}</div>
          <div class="mov-meta">${esc(m['Fecha'])} · ${esc(nombreTipo(tipo))}${cuenta ? ' · ' + esc(cuenta) : ''}</div>
        </div>
        <div class="mov-importe">${prefijo}${moneda.format(importe)}</div>
      </div>`;
  });
}

function prepararCatalogos() {
  const tipos = (catalogos.tiposMovimiento || [])
    .map(x => ({ valor: x['Tipo'], texto: nombreTipo(x['Tipo']) }));

  llenarSelect('tipoMovimiento', tipos, 'valor', 'texto', 'Selecciona...');
  llenarSelect('categoria', catalogos.categorias, 'Categoría');
  llenarSelect('tipoIngreso', catalogos.tiposIngreso, 'Tipo');
  llenarSelect('tratamientoFiscal', catalogos.tratamientos, 'Tratamiento');
  llenarSelect('cuentaAjuste', catalogos.cuentas, 'Nombre');

  const regimen = document.getElementById('regimen');
  regimen.innerHTML = '<option value=""></option>';

  (catalogos.regimenes || []).forEach(item => {
    const o = document.createElement('option');
    o.value = item['Clave SAT'] || '';
    o.textContent = `${item['Clave SAT'] || ''} - ${item['Régimen'] || ''}`;
    regimen.appendChild(o);
  });

  actualizarCuentas();
}

function llenarCuentas(id, filtro = () => true) {
  llenarSelect(id, (catalogos.cuentas || []).filter(filtro), 'Nombre');
}

function esCredito(cuenta) {
  return String(cuenta['Crédito'] || '').trim().toUpperCase() === 'SÍ';
}

function restaurar(id, valor) {
  if (!valor) return;
  const s = document.getElementById(id);
  if (Array.from(s.options).some(o => o.value === valor)) s.value = valor;
}

function actualizarCuentas() {
  if (!catalogos) return;

  const tipo = document.getElementById('tipoMovimiento').value;
  const origen = document.getElementById('cuentaOrigen').value;
  const destino = document.getElementById('cuentaDestino').value;

  if (tipo === 'PAGO_DEUDA') {
    llenarCuentas('cuentaOrigen', c => !esCredito(c));
    llenarCuentas('cuentaDestino', c => esCredito(c));
  } else if (tipo === 'INGRESO') {
    llenarCuentas('cuentaOrigen');
    llenarCuentas('cuentaDestino', c => !esCredito(c));
  } else {
    llenarCuentas('cuentaOrigen');
    llenarCuentas('cuentaDestino');
  }

  restaurar('cuentaOrigen', origen);
  restaurar('cuentaDestino', destino);
}

function abrirFormulario() {
  if (!catalogos) return;

  limpiarMensaje();
  document.getElementById('modalMovimiento').classList.add('abierto');
  document.body.style.overflow = 'hidden';
  document.getElementById('fecha').value = fechaHoy();
  actualizarFormulario();
}

function cerrarFormulario() {
  document.getElementById('modalMovimiento').classList.remove('abierto');
  document.body.style.overflow = '';
  limpiarMensaje();
}

function actualizarFormulario() {
  const t = document.getElementById('tipoMovimiento').value;
  const ingreso = t === 'INGRESO';
  const gasto = t === 'GASTO';
  const transferencia = t === 'TRANSFERENCIA';
  const inversion = t === 'INVERSIÓN';
  const retiro = t === 'RETIRO_INVERSION';
  const pago = t === 'PAGO_DEUDA';
  const rendimiento = t === 'RENDIMIENTO';
  const ajuste = t === 'AJUSTE';

  mostrar('campoCuentaOrigen', gasto || transferencia || inversion || retiro || pago);
  mostrar('campoCuentaDestino', ingreso || transferencia || inversion || retiro || pago || rendimiento);
  mostrar('campoDireccionAjuste', ajuste);
  mostrar('campoCuentaAjuste', ajuste);
  mostrar('campoCategoria', gasto);
  mostrar('campoSubcategoria', gasto);
  mostrar('campoMetodoPago', gasto || ingreso || rendimiento);
  mostrar('campoTipoIngreso', ingreso || rendimiento);
  mostrar('campoRegimen', gasto || ingreso);
  mostrar('campoTratamientoFiscal', gasto || ingreso || rendimiento);

  actualizarCuentas();

  if (transferencia || inversion || retiro || pago) {
    document.getElementById('metodoPago').value = 'Transferencia';
  }

  if (rendimiento) {
    const s = document.getElementById('tipoIngreso');
    if (Array.from(s.options).some(o => o.value === 'Rendimientos financieros')) {
      s.value = 'Rendimientos financieros';
    }
  }

  detectarTDC();
}

function alCambiarCuentaOrigen() {
  sugerirMetodo();
  detectarTDC();
}

function sugerirMetodo() {
  if (!catalogos || document.getElementById('tipoMovimiento').value !== 'GASTO') return;

  const nombre = document.getElementById('cuentaOrigen').value;
  const cuenta = catalogos.cuentas.find(x => x['Nombre'] === nombre);
  if (!cuenta) return;

  const tipo = String(cuenta['Tipo'] || '').trim().toUpperCase();
  const s = document.getElementById('metodoPago');

  if (esCredito(cuenta)) s.value = 'Tarjeta de crédito';
  else if (tipo === 'EFECTIVO') s.value = 'Efectivo';
  else if (tipo === 'DÉBITO' || tipo === 'DEBITO') s.value = 'Tarjeta de débito';
}

function detectarTDC() {
  if (!catalogos) return;

  const tipo = document.getElementById('tipoMovimiento').value;
  const nombre = document.getElementById('cuentaOrigen').value;
  const cuenta = catalogos.cuentas.find(x => x['Nombre'] === nombre);

  const mostrarGrupo = tipo === 'GASTO' && cuenta && esCredito(cuenta);
  document.getElementById('grupoTDC').classList.toggle('visible', Boolean(mostrarGrupo));

  if (!mostrarGrupo) reiniciarTDC();
}

function actualizarCamposTDC() {
  const msi = document.getElementById('modalidadTDC').value === 'MSI';

  mostrar('campoMesesMSI', msi);
  mostrar('campoFechaPrimeraMSI', msi);

  if (!msi) {
    document.getElementById('mesesMSI').value = '';
    document.getElementById('fechaPrimeraMensualidad').value = '';
  }
}

function reiniciarTDC() {
  document.getElementById('modalidadTDC').value = 'NORMAL';
  document.getElementById('mesesMSI').value = '';
  document.getElementById('fechaPrimeraMensualidad').value = '';
  mostrar('campoMesesMSI', false);
  mostrar('campoFechaPrimeraMSI', false);
}

function mostrarMensaje(texto, ok) {
  const e = document.getElementById('mensaje');
  e.className = ok ? 'mensaje ok' : 'mensaje error';
  e.textContent = texto;
}

function limpiarMensaje() {
  const e = document.getElementById('mensaje');
  e.className = 'mensaje';
  e.textContent = '';
}

// ============================================================
// Guardar siempre primero en el teléfono.
// ============================================================

document.getElementById('formMovimiento').addEventListener('submit', async function(event) {
  event.preventDefault();

  const tipo = document.getElementById('tipoMovimiento').value;
  let origen = document.getElementById('cuentaOrigen').value;
  let destino = document.getElementById('cuentaDestino').value;

  if (tipo === 'AJUSTE') {
    origen = '';
    destino = '';

    const cuenta = document.getElementById('cuentaAjuste').value;
    const direccion = document.getElementById('direccionAjuste').value;

    if (direccion === 'AUMENTAR') destino = cuenta;
    else origen = cuenta;
  }

  const syncId = crypto.randomUUID();

  const datos = {
    syncId,
    fecha: document.getElementById('fecha').value,
    tipoMovimiento: tipo,
    cuentaOrigen: origen,
    cuentaDestino: destino,
    importe: document.getElementById('importe').value,
    categoria: document.getElementById('categoria').value,
    subcategoria: document.getElementById('subcategoria').value,
    descripcion: document.getElementById('descripcion').value,
    regimen: document.getElementById('regimen').value,
    tipoIngreso: document.getElementById('tipoIngreso').value,
    tratamientoFiscal: document.getElementById('tratamientoFiscal').value,
    metodoPago: document.getElementById('metodoPago').value,
    modalidadTDC: document.getElementById('modalidadTDC').value,
    mesesMSI: document.getElementById('mesesMSI').value,
    fechaPrimeraMensualidad: document.getElementById('fechaPrimeraMensualidad').value,
    notas: document.getElementById('notas').value
  };

  const boton = document.getElementById('btnGuardar');
  boton.disabled = true;
  boton.textContent = 'Guardando...';

  try {
    await guardarPendiente({
      syncId,
      creadoEn: new Date().toISOString(),
      datos
    });

    mostrarMensaje(
      navigator.onLine && accessToken
        ? 'Movimiento guardado en el teléfono. Sincronizando…'
        : 'Movimiento guardado en el teléfono. Queda pendiente de sincronización.',
      true
    );

    await actualizarPendientesUI();

    setTimeout(async () => {
      document.getElementById('formMovimiento').reset();
      reiniciarTDC();
      boton.disabled = false;
      boton.textContent = 'Guardar movimiento';
      cerrarFormulario();

      const cache = await leerCache('datosMovil');
      await mostrarMovimientos(cache?.movimientos || []);

      if (navigator.onLine && accessToken) {
        sincronizarTodo();
      }
    }, 500);

  } catch (error) {
    mostrarMensaje(`No se pudo guardar localmente: ${error.message || error}`, false);
    boton.disabled = false;
    boton.textContent = 'Guardar movimiento';
  }
});

window.addEventListener('online', async () => {
  actualizarEstadoConexion();
  await actualizarPendientesUI();

  if (accessToken) {
    sincronizarTodo();
  }
});

window.addEventListener('offline', async () => {
  actualizarEstadoConexion();
  await actualizarPendientesUI();
});

window.addEventListener('load', iniciar);
