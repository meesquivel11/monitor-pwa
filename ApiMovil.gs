/**
 * MONITOR - API MÓVIL V1
 *
 * Añade este archivo al MISMO proyecto de Apps Script que usa Monitor.
 * Estas funciones son una capa estable para la PWA.
 */


/**
 * Devuelve la información que ya usa la versión móvil.
 */
function apiMovilObtenerDatosV1() {
  return obtenerDatosMovil();
}


/**
 * Devuelve los mismos catálogos que usa Monitor Web.
 */
function apiMovilObtenerCatalogosV1() {
  return obtenerCatalogosMovimiento();
}


/**
 * Registra un movimiento enviado desde la PWA.
 *
 * syncId hace que la operación sea idempotente:
 * si el teléfono reintenta después de perder conexión,
 * el movimiento no debe duplicarse.
 */
function apiMovilRegistrarMovimientoV1(datos) {

  if (!datos) {
    throw new Error('No se recibieron datos.');
  }


  const syncId =
    normalizarTexto(
      datos.syncId
    );


  if (!syncId) {
    throw new Error(
      'El movimiento móvil no contiene Sync ID.'
    );
  }


  const movimientos =
    obtenerMovimientos();


  const existente =
    movimientos.find(
      mov =>
        normalizarTexto(
          mov['Sync ID']
        ) === syncId
    );


  if (existente) {

    return {
      exito: true,
      duplicado: true,
      id: existente['ID'],
      syncId: syncId,
      mensaje:
        `${existente['ID']} ya estaba sincronizado.`
    };

  }


  datos.syncId =
    syncId;


  const resultado =
    registrarMovimiento(
      datos
    );


  return {
    ...resultado,
    syncId: syncId,
    duplicado: false
  };

}


/*
 * CAMBIO NECESARIO EN registrarMovimiento(datos)
 * -----------------------------------------------
 *
 * En el objeto "registro" de registrarMovimiento(),
 * agrega esta propiedad:
 *
 *   'Sync ID':
 *     datos.syncId || '',
 *
 * También agrega una nueva columna al final de MOVIMIENTOS:
 *
 *   V1 = Sync ID
 *
 * Los movimientos existentes pueden dejar esa columna vacía.
 */
