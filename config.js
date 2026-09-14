/*
 * MONITOR PWA - Configuración
 *
 * Deja estos valores tal cual durante el primer paso.
 * Más adelante sustituiremos ambos cuando configuremos
 * la sincronización segura con Google.
 */
window.MONITOR_CONFIG = {
  scriptId: 'PEGA_AQUI_EL_SCRIPT_ID',
  clientId: 'PEGA_AQUI_EL_CLIENT_ID.apps.googleusercontent.com',

  // Ajustaremos los scopes exactamente a los que use tu proyecto.
  scopes: 'https://www.googleapis.com/auth/spreadsheets',

  // false = usa una versión desplegada como API executable.
  devMode: false
};
