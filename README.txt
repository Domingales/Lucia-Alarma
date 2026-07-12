ALARMAS LUCÍA
Versión: ALARMAS-LUCIA-v2-AJUSTES-GPS-INMOVILIDAD-20260712

DESCRIPCIÓN
Alarmas Lucía permite emparejar dos móviles, enviar alarmas programadas y compartir, con autorización expresa del emisor, su ubicación durante una alarma.

CAMBIOS DE ESTA VERSIÓN
- El botón MOSTRAR TODAS / OCULTAR aparece inmediatamente debajo del título "Ubicación GPS del emisor".
- En AJUSTES puede elegirse el intervalo entre registros GPS: 1, 5, 10 o 30 segundos; 1, 2 o 5 minutos; o un intervalo personalizado entre 1 y 3.600 segundos.
- El intervalo se aplica tanto al respaldo JavaScript como al servicio nativo Android que funciona con la pantalla apagada.
- El valor predeterminado es 1 minuto para evitar un consumo excesivo de batería y datos.
- En AJUSTES puede activarse el aviso por falta de movimiento.
- El receptor define el tiempo mínimo sin movimiento y la distancia máxima que se considera permanecer en la misma zona.
- Cuando la app está abierta, el aviso se muestra con un pop propio de la estética de Alarmas Lucía.
- En Android, cuando la app está minimizada o la pantalla está apagada, un servicio nativo sigue comprobando los registros y emite una notificación si se cumple la condición configurada.
- Las comprobaciones se separan por alarmId, por lo que no se mezclan ubicaciones de alarmas distintas.

FUNCIONAMIENTO DEL INTERVALO GPS
1. El emisor entra en AJUSTES y selecciona el tiempo entre registros.
2. Al enviar una alarma con GPS autorizado, ese intervalo se guarda en la alarma y se transmite al servicio nativo.
3. Si el intervalo se cambia mientras una alarma está activa, la nueva configuración se aplica a los seguimientos activos.
4. Los intervalos muy cortos aumentan el consumo de batería, datos y escrituras en Firebase.

AVISO POR FALTA DE MOVIMIENTO
1. El receptor activa "Avisarme si el emisor permanece en la misma zona".
2. Define, por ejemplo, 10 minutos y 100 metros.
3. La app estudia las posiciones relacionadas con cada alarma.
4. Si durante el periodo configurado las posiciones permanecen dentro de la zona indicada, muestra un aviso.
5. No vuelve a avisar continuamente mientras la misma situación siga activa. Cuando se detecta un desplazamiento superior al límite, el sistema queda preparado para detectar un nuevo periodo de inmovilidad.

SEGUNDO PLANO EN ANDROID
- LocationForegroundService mantiene el envío GPS del emisor.
- ImmobilityMonitoringService mantiene la vigilancia de movimiento del receptor.
- Ambos servicios muestran una notificación permanente mientras están activos, requisito de Android.
- El servicio de vigilancia comienza cuando el receptor ya ha descargado la alarma. Una alarma completamente nueva no puede despertar por sí sola una app que nunca llegó a recibirla; para ese caso sigue siendo necesario Firebase Cloud Messaging y un backend o Cloud Function.

IPHONE
Los controles web y los avisos funcionan mientras Safari o la PWA permanecen activos. iOS puede suspender JavaScript al bloquear la pantalla o pasar la app a segundo plano. El seguimiento continuado real en iPhone requiere una app iOS nativa con Core Location y permisos de ubicación en segundo plano.

PRIVACIDAD
La ubicación solo se comparte después de que el emisor conceda el permiso. La vigilancia de movimiento se realiza exclusivamente sobre las ubicaciones asociadas a la alarma recibida. La aplicación no debe utilizarse para seguimiento oculto ni sin consentimiento.
