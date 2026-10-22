# Cumplimiento legal, privacidad y consentimiento

Análisis técnico preparado durante la implementación. **No es asesoría jurídica ni certifica el cumplimiento.** Debe revisarlo un profesional del derecho colombiano antes de publicar los documentos como definitivos.

## 1. Modelo de negocio verificado en el código

- Biblioteca de préstamo de ejemplares físicos. Sin pagos, sin carrito, sin suscripciones, sin datos de tarjetas.
- Datos personales: solo cuentas de lectores y personal (nombre, correo, contraseña cifrada, carné) y su actividad de préstamo.
- Proveedores externos: Open Library (solo búsquedas bibliográficas del personal, sin datos de lectores) y, si se activa, Resend para el correo (encargado del tratamiento; trata el correo fuera de Colombia).
- Cookies: solo técnicas (`gg_session`, `gg_flash`, `gg_consent`). Sin analítica, píxeles ni scripts de terceros.

## 2. Inventario de datos (minimización)

| Dato | Dónde | Para qué | Obligatorio | Sin él… |
|---|---|---|---|---|
| Nombre | `users.name` | Identificarte en el mostrador y en los avisos | Sí | no se puede entregar un ejemplar a la persona correcta |
| Correo | `users.email` | Inicio de sesión, avisos, recuperar contraseña | Sí | no hay cuenta ni avisos |
| Contraseña | `users.password_hash` (scrypt) | Autenticación | Sí | — |
| Carné | `users.card_number` (generado) | Identificar préstamos | Generado | — |
| Préstamos y reservas | `loans`, `reservations` | Prestar el servicio | Generado | — |
| Sesión | `sessions` (hash del token) | Mantener la sesión | Técnico | — |
| Evidencia de aceptación | `consent_records` | Probar la autorización (art. 9 Ley 1581) | Generado | — |
| Registro de operaciones | `audit_log` | Resolver incidencias | Generado | — |

No se piden documento de identidad, fecha de nacimiento, teléfono, dirección ni ningún otro dato. El único formulario que recoge datos nuevos es el registro; el de contacto es un enlace `mailto:` y no guarda nada. El personal bibliotecario ve los correos enmascarados y solo la administración los ve completos.

## 3. Normas analizadas

| Norma | ¿Aplica? | Motivo |
|---|---|---|
| Ley 1581 de 2012 (protección de datos) y Decreto 1074 de 2015 (incorpora el Decreto 1377 de 2013) | **Sí** | Se tratan datos personales de lectores |
| Ley 1266 de 2008 (habeas data financiero) | No | No hay información financiera ni crediticia |
| Ley 1480 de 2011 (Estatuto del Consumidor) | **A confirmar** | Solo si existe relación de consumo (cobros, cuotas de socio). Hoy no hay cobros en la plataforma |
| Ley 527 de 1999 (mensajes de datos) | Sí, como respaldo probatorio | Las aceptaciones electrónicas y su registro son mensajes de datos |
| Retracto y reversión del pago (arts. 47 y 51, Ley 1480) | No hoy | No hay ventas a distancia ni pagos electrónicos |
| Registro Nacional de Bases de Datos (SIC) | **A confirmar** | Obligatorio para sociedades y entidades sin ánimo de lucro con activos superiores a 100.000 UVT, y para entidades públicas. Depende del titular |
| Menores de edad (art. 7, Ley 1581) | **A confirmar** | Si una biblioteca pública admite menores, hace falta autorización del representante legal |

## 4. Obligaciones, medidas y pendientes

### Obligaciones legales identificadas (Ley 1581)
1. Autorización previa, expresa e informada para tratar los datos y conservar prueba de ella.
2. Política de tratamiento con responsable, finalidades, derechos, procedimiento y vigencia.
3. Atender consultas (10 días hábiles, prorrogables 5) y reclamos (15 días hábiles, prorrogables 8).
4. Medidas de seguridad, confidencialidad y acceso restringido.
5. Informar las transferencias o transmisiones internacionales (por ejemplo, el proveedor de correo).

### Medidas técnicas implementadas
- Dos casillas independientes y desmarcadas en el registro, validadas también en el servidor; la cuenta y sus dos evidencias se guardan en una sola transacción.
- Tabla `consent_records` de solo inserción: los triggers de la base de datos impiden modificar o borrar, y una cadena de hashes SHA-256 detecta cualquier manipulación hecha por fuera de la aplicación.
- Cada evidencia guarda el identificador de la cuenta, el documento, su versión, la fecha de vigencia y el hash del texto aceptado, el resultado, el proceso, el identificador del evento y de la solicitud, la hora UTC del servidor y la fila a la que sustituye. No guarda IP, correo ni contraseña.
- Documentos versionados con historial público (`/legal/historial`). Si cambia el texto de una versión ya publicada sin subir su número, la aplicación se niega a arrancar el registro.
- Las cuentas que no tienen la versión vigente deben aceptarla antes de pedir libros; el catálogo y el historial siguen disponibles.
- Revocación desde «Mi perfil», con efecto real: sin autorización no se pueden pedir ni reservar libros.
- Consulta de evidencias en `/admin/consentimientos` solo para administración, sin correos, con verificación de la cadena.
- Mecanismo de cookies por categorías (aceptar, rechazar, configurar y retirar) y componente `ConsentGate` que impide cargar cualquier recurso opcional antes del consentimiento. El aviso no se muestra porque hoy no hay cookies opcionales: mostrarlo daría a entender que las hay.

### Buenas prácticas recomendadas
- Activar un proveedor de correo con acuerdo de encargo del tratamiento por escrito.
- Copias de seguridad cifradas de `data/` y `storage/`.
- Revisar cada año la política y el inventario de datos.
- Plazo de conservación concreto (por ejemplo, anonimizar cuentas sin actividad durante X años); hay que definirlo.

### Requiere confirmación del propietario o revisión jurídica
1. **Identidad del responsable:** razón social o nombre, NIT, domicilio, correo y teléfono del canal de datos personales (variables `LEGAL_*`). Mientras falten, los documentos muestran «pendiente» y un aviso de borrador.
2. ¿Es una entidad pública, privada o una ESAL? Afecta al registro ante la SIC y al régimen aplicable.
3. ¿Se cobra alguna cuota, multa o depósito, aunque sea en el mostrador? Si es así, aplica la Ley 1480 y hay que redactar la política de reembolsos con condiciones reales.
4. ¿Se admiten menores de edad? Habría que añadir un flujo de autorización del representante legal.
5. Plazo exacto de conservación de cuentas inactivas y de evidencias.
6. ¿Se activará Resend u otro proveedor de correo? Debe constar como transmisión internacional.
7. Revisión profesional del texto de los cuatro documentos antes de retirar la marca de borrador.

## 5. Procedimiento para actualizar un documento
1. En `src/lib/legal.ts`, mover la versión vigente a `LEGAL_HISTORY`.
2. Editar el texto, subir `version` y `effectiveAt` y describir el cambio en `changes`.
3. Desplegar: la nueva versión se registra sola y las cuentas tendrán que aceptarla al entrar.

## 6. Anonimización
Los registros de consentimiento no pueden borrarse desde la aplicación. Si procede suprimir los datos de una cuenta cuando ya no exista deber de conservarlos, debe hacerse con un procedimiento administrativo documentado: anonimizar `users` (nombre y correo) conservando el identificador numérico, que es lo único que referencian las evidencias.
