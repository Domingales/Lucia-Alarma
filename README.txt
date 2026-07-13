ALARMAS LUCÍA
Versión: ALARMAS-LUCIA-v2.6-PANTALLA-ACTIVA-IPHONE-20260713

DESCRIPCIÓN
Alarmas Lucía permite emparejar móviles, enviar alarmas programadas y compartir,
con autorización expresa del emisor, su ubicación durante una alarma.

CAMBIOS DE ESTA VERSIÓN
- Se conserva íntegramente el funcionamiento de la versión anterior.
- Cuando un iPhone es el emisor y mantiene una alarma activa con GPS autorizado,
  la web solicita a Safari que mantenga la pantalla encendida.
- El bloqueo de pantalla se solicita desde la pulsación de ENVIAR ALARMA, para
  mejorar la compatibilidad con las restricciones de interacción de iOS.
- Si Safari libera el bloqueo al cambiar de aplicación o al ocultar la página,
  la web intenta recuperarlo al volver a estar visible.
- Al regresar a la página se reanuda el temporizador GPS y se intenta enviar una
  ubicación inmediatamente, además de continuar con el intervalo configurado.
- Al anular o completar la última alarma activa del emisor se libera el bloqueo
  de pantalla para evitar consumo innecesario de batería.
- Se mantiene el mensaje de anulación incorporado en la versión 2.5.

FUNCIONAMIENTO EN IPHONE
Para que iPhone siga enviando coordenadas, Safari debe permanecer abierto y la
página debe continuar visible. La app evita el bloqueo automático de la pantalla
mientras exista una alarma enviada activa con GPS autorizado. Si el usuario
bloquea manualmente el iPhone o abre otra aplicación, iOS puede suspender la web;
al volver a Alarmas Lucía se intentará reanudar automáticamente.

SEGUNDO PLANO EN ANDROID
La versión Android nativa sigue utilizando sus servicios en primer plano y no
depende del bloqueo de pantalla web.

PRIVACIDAD
La ubicación solo se comparte después de que el emisor conceda permiso. La app
no debe utilizarse para seguimiento oculto ni sin consentimiento.
