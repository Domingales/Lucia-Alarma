ALARMAS LUCÍA
Versión: ALARMAS-LUCIA-v2.2-GPS-SEGUNDO-PLANO-DISPOSITIVOS-20260712

DESCRIPCIÓN
Alarmas Lucía permite emparejar móviles, enviar alarmas programadas y compartir,
con autorización expresa del emisor, su ubicación durante una alarma.

CAMBIOS DE ESTA VERSIÓN
- El servicio GPS nativo usa el intervalo definido en Ajustes aunque la app esté
  minimizada o la pantalla apagada.
- Se mantiene un wakelock parcial mientras el seguimiento está activo para que
  el temporizador no dependa de la WebView.
- El servicio guarda un latido interno y la WebView comprueba que realmente siga
  ejecutándose, no solo que exista una sesión guardada.
- Si Android retira el proceso, se programa un intento de recuperación; al abrir
  la app también se reanudan las sesiones pendientes.
- Cada dispositivo emparejado se guarda con número de registro, ID y alias.
- Desde Emparejar móvil pueden seleccionarse, editarse o eliminarse los
  dispositivos guardados.
- El dispositivo activo aparece marcado como VINCULADO.

INTERVALO GPS
El valor predeterminado es un minuto. Los intervalos muy cortos consumen más
batería y generan más escrituras en Firebase. La hora real de una lectura puede
variar algunos segundos por señal GPS o conexión de datos, pero el envío no debe
depender de que la pantalla permanezca encendida.

SEGUNDO PLANO EN ANDROID
LocationForegroundService mantiene el envío GPS y muestra una notificación
permanente mientras el usuario comparte su ubicación. En móviles con políticas
de batería agresivas se recomienda configurar Alarmas Lucía como aplicación
"Sin restricciones".

DISPOSITIVOS GUARDADOS
La lista se conserva en el almacenamiento local de la aplicación. El alias es
solo descriptivo; Firebase continúa utilizando los IDs técnicos y el canal
calculado para cada pareja.

IPHONE
Los controles web funcionan mientras Safari o la PWA permanecen activos. iOS
puede suspender JavaScript con la pantalla apagada. El seguimiento continuado
real en iPhone requiere una aplicación iOS nativa con Core Location.

PRIVACIDAD
La ubicación solo se comparte después de que el emisor conceda permiso. La app
no debe utilizarse para seguimiento oculto ni sin consentimiento.
