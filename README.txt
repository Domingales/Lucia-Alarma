SINC ALARMAS
Versión: SINC-ALARMAS-NUEVA-v2-HISTORIAL-GPS-20260712

DESCRIPCIÓN
Sinc Alarmas es una app de alarmas sincronizadas entre dos móviles. Permite emparejar dos dispositivos, enviar alarmas programadas de un móvil a otro, mostrar avisos en el receptor y, cuando el emisor lo autoriza, compartir su ubicación GPS minuto a minuto.

Está pensada para situaciones familiares, de cuidado, acompañamiento o seguridad, donde una persona necesita avisar a otra y permitirle conocer su ubicación durante el proceso.

TECNOLOGÍA
- HTML
- CSS
- JavaScript puro
- Firebase Realtime Database
- Modo alternativo REST si el SDK de Firebase no carga
- PWA instalable

ARCHIVOS
sinc_alarmas_nueva/
├── index.html
├── manifest.json
├── README.txt
└── assets/
    ├── css/
    │   └── styles.css
    ├── js/
    │   ├── firebase-config.js
    │   └── app.js
    └── img/
        └── logo.png

FUNCIONAMIENTO GENERAL
1. Cada móvil crea y conserva un identificador propio:
   MOVIL-XXXX-XXXX

2. Para emparejar dos móviles, se introduce en cada uno el identificador del otro.

3. El canal Firebase se calcula ordenando los dos identificadores, por lo que ambos móviles generan el mismo canal aunque el orden sea distinto.

4. Cualquiera de los dos móviles puede actuar como emisor o receptor.

5. El emisor crea una alarma con fecha, hora y mensaje.

6. Si el emisor pulsa "Autorizar GPS de este móvil", la app solicita permiso de ubicación y, al enviar la alarma, sube su ubicación a Firebase.

7. El receptor recibe la alarma, confirma automáticamente la recepción y muestra un pop inicial con:
   - mensaje,
   - día programado,
   - hora programada,
   - estado,
   - última ubicación GPS del emisor,
   - botón MOSTRAR TODAS para desplegar el historial completo de esa alarma.

8. El receptor no usa su propio GPS. Solo lee de Firebase la ubicación del emisor.

ESTRUCTURA FIREBASE
La app usa esta estructura:

pairs/{pairKey}/alarms/{alarmId}
pairs/{pairKey}/gpsLogs/{alarmId}/{timestamp_deviceId}

Cada alarma incluye campos como:
- id
- from
- to
- pairKey
- scheduledAt
- dateText
- timeText
- message
- status
- createdAt
- receivedByReceiver
- receiverConfirmedAt
- cancelled
- gpsEnabledBySender
- lastGpsAt

Cada registro GPS incluye:
- alarmId
- from
- to
- timestamp
- latitude
- longitude
- accuracy
- source: sender

ESTADOS DE ALARMA
- pending: pendiente
- received_by_receiver: recibida/programada por el receptor
- ringing: sonando
- completed: completada
- cancelled: anulada
- error: error

GPS
El GPS solo lo usa el móvil emisor.

El botón "Autorizar GPS de este móvil" debe pulsarse desde el móvil que va a enviar la alarma. En iPhone es importante que la app esté abierta desde Safari o instalada como PWA y que la web esté servida por HTTPS.

La app intenta obtener la primera ubicación al autorizar el GPS. Al enviar la alarma, sube una primera posición y después intenta subir una nueva posición cada 60 segundos mientras la alarma siga activa.

El envío GPS se detiene cuando:
- la alarma se anula,
- la alarma se completa,
- la alarma deja de estar activa,
- se cierra la página.

IMPORTANTE SOBRE IPHONE Y ANDROID
En iPhone y Android, el envío GPS minuto a minuto es más fiable mientras la app permanece abierta o instalada como PWA activa. Los sistemas móviles pueden limitar la ejecución en segundo plano.

SINCRONIZACIÓN
Arriba en la app debe aparecer uno de estos estados:

- Sincronización online activa (Firebase SDK)
- Sincronización online activa (REST)
- Modo local · sin Firebase activo

Si aparece "Modo local", la app no debe considerarse sincronizada y no debe usarse para enviar alarmas al otro móvil.

PRUEBAS RECOMENDADAS
1. Abrir la app en dos móviles.
2. Copiar el ID del móvil A en el móvil B.
3. Copiar el ID del móvil B en el móvil A.
4. Verificar que ambos muestran el mismo canal Firebase.
5. Enviar una alarma desde A a B.
6. B debe mostrar pop inicial.
7. A debe mostrar confirmación verde cuando B confirme la recepción.
8. Autorizar GPS en A y enviar otra alarma.
9. B debe mostrar registros GPS del móvil A.
10. B no debe pedir permiso de ubicación para recibir la alarma.
11. Si llega la hora programada, B debe mostrar el pop de alarma y sonar.
12. Si A anula la alarma antes de la hora, B debe verla como anulada.

PRIVACIDAD Y USO CORRECTO
La ubicación GPS solo se comparte cuando el usuario emisor concede permiso desde su propio dispositivo.

Esta app está pensada para avisos familiares, cuidado, acompañamiento y seguridad.

No debe utilizarse para vigilancia oculta ni seguimiento sin consentimiento.

DESPLIEGUE EN GITHUB PAGES
1. Sustituir o subir todos los archivos del ZIP en el repositorio.
2. Asegurarse de que GitHub Pages está activo.
3. Abrir la URL HTTPS en ambos móviles.
4. Si se sube una nueva versión, cerrar la pestaña en los móviles y volver a abrirla para evitar caché antigua.

CONFIGURACIÓN FIREBASE
El archivo assets/js/firebase-config.js contiene la configuración Firebase actual. Si se usa otro proyecto Firebase, sustituir esos datos.

Antes de usar la app en producción, revisar las reglas de Firebase Realtime Database para que solo puedan escribir/leer los canales previstos.


NOTA V2 FIREBASE FIJO:
La configuración Firebase se incluye también dentro de index.html/app.js como respaldo. Así, aunque no se suba assets/js/firebase-config.js, la app debe intentar entrar en modo online REST/SDK y no quedarse en modo local por ausencia de configuración.


NOTA V2 DIÁLOGOS PERSONALIZADOS:
- Se han eliminado los avisos nativos alert/confirm/prompt del navegador.
- Las confirmaciones para borrar emparejamiento, anular alarmas y limpiar historial usan ahora pops integrados en la estética de Sinc Alarmas.
- La identificación de cada dispositivo se denomina ID del móvil.
- Si la copia automática del ID falla, se muestra un pop propio con el ID seleccionable y un botón para copiarlo.
- Los pops respetan el tema, el color, el modo 2D/3D y la opacidad configurados en la app.


NOTA V2 HISTORIAL GPS POR ALARMA:
- Los pops muestran por defecto únicamente la ubicación más reciente recibida.
- Dentro del pop aparece el botón MOSTRAR TODAS.
- Al pulsarlo, se muestran todas las ubicaciones asociadas exclusivamente a esa alarma/mensaje.
- El historial completo se ordena cronológicamente, desde la ubicación más antigua hasta la más reciente.
- El botón cambia a OCULTAR para volver a la vista resumida.
- Al cerrar y volver a abrir el pop, se muestra de nuevo solo la última ubicación.
- El comportamiento está disponible tanto en el aviso inicial como en el pop de alarma que aparece a la hora programada.
