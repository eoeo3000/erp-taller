# Multi-taller: cómo se separan los datos de cada cliente

Documento de decisión, escrito **antes** de tocar código. Describe cómo pasar de una
instalación para un taller a un sistema que arrienda el servicio a varios, sin que ninguno
vea los datos de otro.

> **Estado**: las decisiones están tomadas (arquitectura en §1, producto en §9).
> **Etapa 1 hecha**; de la 2 en adelante, nada implementado — el plan está en §5.

---

## 1. La decisión

**Una base de datos por taller**, no un campo `tallerId` en cada documento ni un despliegue
por cliente.

El taller activo se resuelve **desde la sesión, en el servidor**, nunca desde un dato que
mande el navegador.

## 2. Por qué, con números de este repositorio

No es una preferencia de estilo. Son tres hechos medibles del código actual:

### 291 usos de `req.db` en 28 archivos

Cada controlador ya obtiene su conexión de `req.db`, que llena `middlewares/entorno.js` en
un solo lugar. Con base por taller, **esos 291 usos no cambian ni uno**: el punto donde se
decide de quién son los datos ya está centralizado, y es de una línea.

Con un campo `tallerId` habría que agregar el filtro en cada una de esas 291 consultas. Y
—esto es lo grave— **olvidar una sola no rompe nada visible**: el sistema sigue funcionando
hasta el día en que un cliente ve las OT de otro. No hay error, no hay log, no hay alerta.
Para un negocio de software chico, ese es un incidente del que no se vuelve.

### 11 índices únicos que hoy son globales

```
OT.numeroOT            Usuario.email          Suministro (nombre)
OrdenCompra.numeroOC   Puesto (nombre)        TipoTrabajo.codigoTipo
CuentaContable.codigo  CatalogoTransversal.clave
AsientoContable.numeroAsiento
Asignacion.solicitudId      DisposicionTabla{pantalla,nombre}
```

Con base por taller **siguen funcionando tal cual**: cada taller tiene su propia secuencia
`OT-2026-0001` y su propio catálogo de puestos.

En una base compartida, los once tendrían que convertirse en índices compuestos con
`tallerId`. Si se olvida uno, el segundo taller **no puede crear su primera OT** porque el
número ya existe. Ese falla ruidosamente (mejor que el anterior), pero son once
oportunidades de equivocarse, en migraciones que hay que correr sobre datos en producción.

### La arquitectura ya estaba preparada

`config/conexiones.js` mantiene un mapa de conexiones y las resuelve por request. Los
modelos ya son fábricas que reciben la conexión: `(conn) => conn.models.X || conn.model(...)`.
Hoy ese mapa tiene dos llaves, `produccion` y `demo`. Ponerle diez es el mismo mecanismo.

Quien escribió eso ya había tomado media decisión sin saberlo, y quedó anotada en el README
de rediseño (§9.2): *"El servidor mantiene dos conexiones y resuelve la activa por header,
no por una variable global mutable"*.

## 3. Las opciones que se descartan, y por qué

| Opción | Por qué no |
|---|---|
| **Campo `tallerId`** | 291 consultas que filtrar; un olvido = fuga silenciosa de datos entre clientes; 11 índices únicos que rehacer. Se justifica con miles de inquilinos chicos, no con diez talleres. |
| **Un despliegue por taller** | Aislamiento máximo, pero cada actualización son N deploys y N juegos de variables. Con 10 clientes ya es pesado; y no aporta nada que la base separada no dé. |

La base por taller tiene su propio techo: con cientos de clientes, mantener cientos de
conexiones y correr cada migración N veces deja de ser razonable. **A esa altura conviene
migrar a `tallerId`** — pero desde un sistema que ya factura, con tiempo y con pruebas, no
ahora y a ciegas.

## 4. El agujero que hay que cerrar primero

Hoy el entorno lo elige **quien llama**:

```js
// erp-web/src/utils/entorno.js
axios.defaults.headers.common['X-Entorno'] = valor;

// erp-pwa-operativa/src/api.js — en la URL, desde localStorage
entorno: localStorage.getItem(CLAVE_ENTORNO) || 'produccion',
```

y el backend le cree:

```js
// erp-backend/src/middlewares/entorno.js
const valor = req.headers['x-entorno'] || req.query.entorno;
```

**Hoy eso es inofensivo**: elige entre la producción y la demo del mismo dueño, las dos
suyas. El día que ese mismo mecanismo elija *de qué cliente* son los datos, cualquiera abre
las herramientas del navegador, escribe `X-Taller: competidor` y lee todo.

**Regla que no se negocia: el taller sale de la sesión.** El `Usuario` pertenece a un taller;
el backend abre esa conexión y ninguna otra. El header puede seguir existiendo para elegir
entre la producción y la demo **de ese mismo taller**, que es su uso legítimo.

Esta es la razón por la que la etapa 1 de abajo va antes que todo lo demás.

## 5. Qué cambia, por etapas

Cada etapa se puede desplegar sola y deja el sistema funcionando.

### Etapa 1 — El taller sale de la sesión (sin multi-taller todavía) ✅ HECHA

- `config/talleres.js` — el concepto de taller. Hoy conoce uno (`principal`); es donde la
  etapa 2 pondrá el registro real sin tocar nada más.
- `Usuario.tallerId` — el slug del taller de esa persona. Sin `required` ni `default`: las
  cuentas anteriores no lo tienen y se resuelven como del taller por defecto, así que
  desplegar no migra datos ni echa a nadie.
- **El token de sesión lleva prefijo**: `principal.a3f9…`. Resolvió la dependencia circular
  que tenía este paso — para saber el taller hay que leer la sesión, pero la sesión vive
  dentro de la base del taller, así que hay que saber el taller antes. El prefijo es **dato
  de ruteo, no de autenticación**: solo elige en qué base buscar el token, y el token igual
  tiene que existir ahí. Un token sin punto (sesión anterior) se entiende del taller por
  defecto.
- `middlewares/entorno.js` deja `req.taller`, `req.entorno` y `req.db`. El header sigue
  eligiendo producción/demo —su uso legítimo— y **no puede elegir el taller**.
- `middlewares/sesion.js` cierra la cadena: la persona encontrada tiene que pertenecer al
  taller cuya base se abrió. Es la comprobación que confronta el dato del cliente con lo que
  dice la base.

Con un solo taller nada de esto cambia el comportamiento, y la comprobación final nunca
falla. Se construyó igual, y desde ahora, para que cuando haya dos ya lleve meses
funcionando — y para no tener que acordarse de agregarla, que es el olvido que convierte un
sistema multi-cliente en una filtración.

### Etapa 2 — La base de control y el registro de talleres ✅ HECHA

- `models/Taller.js` en la **base de control** (`MONGO_URI_CONTROL`): identificador, nombre,
  estado, plan, fecha de alta, fecha de baja y la URI de su base de datos. Es el único modelo
  que no vive junto a los datos de trabajo, porque es el que dice dónde están.
- `config/conexiones.js` pasa de dos conexiones fijas a un **registro**: las de producción se
  abren bajo demanda, se reutilizan y llevan el pool acotado (`POOL_MAXIMO`). La demo sigue
  siendo **una sola**, compartida (§9.2).
- **`obtenerConexion` sigue siendo síncrona**, y el registro vive en memoria. La llama
  `middlewares/entorno.js` en cada request: buscar el taller en la base de control cada vez
  agregaría un viaje a Mongo por request, y acá un solo `findOne` ya tarda 600-800ms. Se
  carga al arrancar, se refresca cada minuto, y el controlador lo refresca al instante cuando
  él mismo cambia algo.
- **Sin `MONGO_URI_CONTROL` todo sigue igual que antes**: un taller, el de `MONGO_URI`. La
  base de control se configura cuando haga falta el segundo cliente, no antes. Y la primera
  vez que se enciende, el taller que ya existe **se anota solo** — si no, el despliegue
  siguiente respondería "Taller desconocido: principal" a todo el mundo.
- `controllers/tallerController.js` + `/api/talleres` (`PANEL_TOKEN`, 503 sin ella): listar,
  dar de alta, suspender, reactivar, dar de baja. **La URI nunca sale por la API** — es una
  credencial. La pantalla para operarlo es trabajo aparte; esto es la API.
- Tres protecciones que no son evidentes y tienen prueba:
  - **Dos talleres no pueden apuntar a la misma base.** Un copiar-y-pegar al dar de alta
    bastaría para que el cliente nuevo abriera la base del anterior.
  - **Un taller suspendido o dado de baja no obtiene conexión.** El corte está en el registro
    y no en los controladores, así que ninguna ruta nueva puede olvidarlo. Es la palanca del
    día 0 de §9.4 y la de un impago, y se deshace reactivando.
  - **Si a un taller le cambian la base, la conexión anterior se cierra.** Seguir usándola
    sería escribir en la base vieja después de la mudanza: datos perdidos sin un solo error.
- No se puede suspender el **único** taller activo — mismo principio que "nadie puede
  revocarse a sí mismo" en las cuentas de oficina.

Lo que **no** trae: crear la base del taller nuevo, sus índices y su primera cuenta. Eso es la
etapa 3. Hoy el alta anota un cliente cuya base ya existe.

### Etapa 3 — Alta de un taller nuevo ✅ HECHA (el backend)

**El problema que resuelve, y que no era obvio:** quien va a instalar un taller recién dado de
alta **todavía no tiene sesión**, y sin sesión `middlewares/entorno.js` resuelve al taller por
defecto. Sin esto, el dueño de un cliente nuevo caería sobre la base del taller principal y se
crearía su cuenta adentro de los datos de otro.

- **Un enlace de instalación de un solo uso.** Dar de alta un taller (`POST /api/talleres`)
  devuelve, **una sola vez**, `SPA_URL/instalar?taller=<slug>&clave=<token>`. En la base de
  control queda solo el hash, igual que un `resetHash` o un token de sesión.
- **El slug del enlace es ruteo, no autorización** — mismo criterio que el prefijo del token de
  sesión y que §9.3 ("el subdominio nunca puede ser la autoridad, solo una pista"). Lo que
  autoriza son tres condiciones juntas: el taller existe y está activo, la clave coincide con el
  hash guardado y no venció, y **ese taller no tiene todavía cuentas de escritorio**.
- **La tercera es la que de verdad importa**: sin ella, un enlace que quedó en un correo de hace
  meses serviría para crearse un administrador dentro de un taller con datos reales adentro.
- El enlace **se consume** al instalar y vence a los 7 días. Se reemite con
  `POST /api/talleres/:slug/instalacion`, lo que mata el anterior — mismo criterio que reemitir
  la invitación de una cuenta al corregirle el correo. Reemitirlo a un taller que ya opera
  responde 409: esa ventana se cierra sola.
- Clave equivocada y taller inexistente responden **lo mismo**, para que esto no sirva de
  buscador de qué clientes existen (mismo criterio que `CREDENCIAL_INVALIDA` en el login).
- `servicios/aprovisionamiento.js` construye los índices de los 22 modelos sobre la base nueva,
  **antes** de crear la cuenta. En Mongo la base aparece sola al escribir, pero los índices no:
  Mongoose los construye perezoso, la primera vez que se usa cada modelo, así que un modelo que
  nadie tocó todavía no tiene su índice único — y el día que dos documentos choquen no hay
  error, entran los dos. La lista de modelos se lee de la carpeta, no escrita a mano, para que
  un modelo nuevo quede cubierto sin que nadie se acuerde.
- **Sin `taller` en el cuerpo, `POST /api/instalacion` se comporta exactamente como antes**: la
  instalación única de siempre, sobre `req.db`, con `SETUP_TOKEN`.

**Lo que falta de esta etapa: la pantalla.** `erp-web` tiene que montar `InstalacionScreen` en
`/instalar` sin sesión (como las rutas de `RUTAS_PUBLICAS`), leer `?taller=` y `?clave=` de la
URL y mandarlos en el `POST /api/instalacion`. Hoy esa pantalla solo se alcanza cuando
`GET /auth/yo` responde `requiereInstalacion`, que es la instalación única. Mientras tanto el
alta se completa llamando a la API — que es como se va a hacer igual con los primeros clientes
(§8: el alta la hace quien vende, no un formulario de autoservicio).

### Etapa 3.5 — Entrar a un taller que no es el principal ✅ HECHA (el backend)

Salió al escribir la etapa 3 y es lo que la hacía inútil en la práctica: **todo lo que pasa
antes de tener sesión** —entrar, recuperar la clave, activar una invitación— no puede sacar el
taller del prefijo del token, porque todavía no hay token. Resolvían al taller por defecto, así
que el correo de alguien de otro taller se buscaba en la base del principal y esa persona no
podía entrar **nunca**: un cliente recién instalado quedaba afuera al vencérsele la sesión de
la instalación.

- `middlewares/entorno.js` → `conexionPedida(req)`: el slug viaja en `X-Taller` o `?taller=`,
  **como pista y no como credencial**. Esas rutas exigen algo que tiene que existir en esa base
  (la clave, el hash de recuperación), así que apuntar al taller de otro lleva a un lugar donde
  tus credenciales no están.
- Tres candados: **solo sin sesión** (con sesión manda el prefijo del token, o cualquiera con
  cuenta saltaría a otra base por cabecera), solo talleres registrados y activos, y **nunca
  lanza** — un slug desconocido cae en la base por defecto, donde la credencial tampoco valida.
- **No vive dentro de `resolverEntorno`** a propósito: si la cabecera eligiera la base para toda
  la API, las rutas que siguen abiertas servirían los catálogos de otro taller.
- Los links de recuperación e invitación ahora llevan `&taller=`, y `erp-web/src/utils/taller.js`
  lo lee una vez del link y lo recuerda en ese navegador.

**Y un bug que esto destapó:** `resolverTaller` tenía dos definiciones. La de `config/talleres.js`
quedó congelada en la etapa 1 conociendo solo `principal`, mientras el registro de la etapa 2
aprendía a cargar talleres de la base de control. Durante dos etapas, un token con el prefijo de
otro taller resolvía al principal. Ninguna prueba lo vio porque todas tenían un solo taller, y
ahí "cae en el por defecto" se ve idéntico a "resuelve bien". Ahora hay una sola definición, en
el módulo que tiene el registro, y una prueba con dos talleres.

### Etapa 4 — Las PWAs

- El token de una persona ya identifica a esa persona; pasa a identificar también su taller.
- Deja de hacer falta que la PWA mande el entorno, que es como se elige hoy.

### Etapa 5 — Operación

- El respaldo diario recorre los talleres en vez de respaldar uno.
- Los archivos en R2 se separan por taller: `talleres/<id>/<clave>` en vez de `<clave>` a
  secas. **Ojo**: hay URL ya escritas en la base con el formato viejo, así que la lectura
  tiene que seguir entendiendo las dos — el mismo criterio que se usó al pasar del disco al
  bucket.
- Baja de un cliente según lo definido en §9.4: suspender, 10 días de descarga (respaldo
  técnico + planillas), borrado de base, respaldos y archivos a los 30, reversible hasta ahí.
- La demo compartida se restaura sola cada noche (§9.2).

## 6. El orden importa

- **Etapa 1 antes que la 3.** Si se pueden crear talleres mientras el taller activo lo elige
  el navegador, el primer cliente y el segundo se ven entre ellos. No es un bug a corregir
  después: es una fuga de datos con clientes reales adentro.
- **Etapa 5 antes de tener dos clientes de verdad.** Con los archivos sin separar, el
  respaldo de un taller no es un respaldo completo, y darle de baja a uno no se puede hacer
  sin revisar a mano qué archivo es de quién.
- **El `tallerId` en `Usuario` (etapa 1) antes que la base de control (etapa 2)**, porque la
  segunda necesita poder responder "¿de quién es esta sesión?".

## 7. Lo que cuesta, dicho de frente

- **El plan gratis de Mongo Atlas no alcanza.** M0 son 512 MB para todo el clúster,
  compartidos entre las bases que tenga. Con varios talleres reales hay que pasar a un plan
  pago, y ese costo tiene que estar en el precio del arriendo desde el primer cliente.
  *Los precios cambian: confirmarlos en la página de Atlas antes de poner número.*
- **Las conexiones no son gratis.** Cada una abre un pool; diez pools por omisión se comen el
  límite de conexiones del clúster. Hay que abrirlas bajo demanda, acotar el pool y cerrar
  las que llevan rato sin uso.
- **Cada cambio de esquema o índice se corre N veces.** Con diez talleres es un script que
  recorre la lista; hay que escribirlo en la etapa 2, no cuando haga falta.

## 8. Lo que NO se construye todavía

- **Cobro automático.** Con diez clientes, facturas a mano. Un sistema de suscripciones son
  semanas de trabajo para ahorrar diez transferencias al mes.
- **Autoservicio de registro.** Vas a vender hablando con dueños de taller, no por un
  formulario. El alta la haces tú desde el panel.
- **Cerrar las conexiones ociosas.** Con diez talleres y el pool acotado el techo son ~50
  conexiones, muy por debajo del límite de cualquier clúster pagado. Cerrar una conexión en
  uso es una fuente de errores intermitentes difíciles de reproducir; se paga cuando el
  problema exista.
- **Personalización por cliente** más allá del logo. Cada cosa que se pueda configurar por
  taller es una combinación más que probar y mantener.

## 9. Las cuatro decisiones de producto

Resueltas el 23-09-2026. Se dejan escritas con su razón, porque las cuatro se van a volver a
preguntar cuando el sistema crezca.

### 9.1 Un clúster compartido, con una base por taller

Un clúster por cliente serían diez clústers pagados para diez talleres. El aislamiento que
importa —que nadie lea los datos de otro— lo da la base separada, no el clúster. Lo que
agrega un clúster propio es aislamiento de *rendimiento* y de *caída*, y a esta escala
ninguno de los dos es un riesgo real.

**No encierra**: como la base de control guarda la URI de cada taller (etapa 2), mover un
cliente que creció a su propio clúster es cambiar un campo, no rehacer nada.

### 9.2 Una sola demo compartida

No una demo por taller. Es para mostrar el producto, no para que cada cliente tenga la suya.

**Se restaura sola todas las noches.** Si cualquiera puede escribir en ella, un prospecto le
borra datos a otro mientras la mira. La restauración nocturna sale casi gratis de lo ya
hecho: es un respaldo fijo de la demo que se vuelve a cargar con `servicios/respaldo.js`.

### 9.3 Sin subdominio: el taller vive en la sesión

Nada de `taller1.miapp.cl`. Cuesta DNS por cliente, certificado comodín, configuración en
Render y CORS por origen — y el SPA es un sitio estático con una sola `VITE_API_URL`, así
que además complica el build.

Lo que el subdominio resolvería es que alguien que pertenece a varios talleres los distinga,
y **acá cada persona pertenece a uno solo**. La confusión real ("¿en qué cuenta estoy?") se
resuelve mostrando el nombre del taller en la barra de navegación.

Dos razones más:

- **Es lo reversible.** Agregar subdominios después es fácil; sacarlos, cuando los clientes
  ya tienen el link guardado, no.
- Si algún día se agregan, **el subdominio nunca puede ser la autoridad** de qué taller es —
  solo una pista. Si mandara él, vuelve el agujero de la sección 4: alguien entra a
  `taller2.miapp.cl` con la sesión de `taller1`.

### 9.4 Baja de un cliente: 10 días para descargar, borrado a los 30

| Día | Qué pasa |
|---|---|
| 0 | El cliente cancela. La cuenta queda suspendida: no se puede entrar a operar. |
| 0–10 | Puede descargar todos sus datos. |
| 30 | Se borra: su base, **sus respaldos** y sus archivos del bucket. |

**Por qué 10 para descargar pero 30 para borrar.** Diez días son razonables para que alguien
baje sus datos, pero un dueño de taller que cancela y se va de vacaciones vuelve sin nada.
Los veinte días extra no le cuestan nada a nadie y evitan la única versión de esto que
termina en un reclamo justificado. Hasta el día 30 la baja **se puede deshacer**, que es el
principio de vuelta atrás aplicado al último paso de todos.

**Los respaldos cuentan.** Se borran junto con la base, no se dejan envejecer. Si quedaran
30 días más, decirle al cliente "tus datos fueron eliminados" no sería cierto. Es más simple
de cumplir y de explicar.

**La descarga son dos cosas.** El respaldo técnico (EJSON comprimido) sirve para restaurar o
migrar, pero es ilegible para una persona. Así que también van planillas Excel de OT,
solicitudes, clientes y recursos — que `importExportRoutes` ya sabe generar. Un dueño de
taller tiene que poder abrir lo que se lleva.

> El plazo y la forma de la baja van en el contrato. Las obligaciones legales sobre datos
> personales en Chile están cambiando (ley 21.719): **confirmar los plazos con alguien que
> sepa antes de firmar el primero** — esto es una decisión de producto, no una asesoría.

## 10. Lo que queda por decidir más adelante

- **Cuándo migrar a `tallerId`.** La base por taller tiene techo (ver sección 3). El momento
  de revisarlo es cuando mantener las conexiones o correr las migraciones N veces empiece a
  doler, no antes.
- **Si la demo compartida necesita límites** (cuántas OT puede crear un visitante, cada
  cuánto se restaura) cuando la use más de un prospecto a la vez.

---

## Relacionado

- [`principio-vuelta-atras.md`](principio-vuelta-atras.md) — la baja de un cliente con
  devolución de datos es una vuelta atrás más.
- [`respaldos.md`](respaldos.md) — el respaldo por taller sale casi gratis de lo ya hecho.
- [`almacenamiento-archivos.md`](almacenamiento-archivos.md) — el precedente de cambiar dónde
  viven los datos sin romper las URL ya escritas.
