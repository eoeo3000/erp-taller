# Multi-taller: cómo se separan los datos de cada cliente

Documento de decisión, escrito **antes** de tocar código. Describe cómo pasar de una
instalación para un taller a un sistema que arrienda el servicio a varios, sin que ninguno
vea los datos de otro.

> **Estado**: las decisiones están tomadas (arquitectura en §1, producto en §9).
> **Nada está implementado todavía** — el plan por etapas está en §5.

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

### Etapa 1 — El taller sale de la sesión (sin multi-taller todavía)

- `Usuario` gana `tallerId`.
- `middlewares/entorno.js` resuelve la conexión desde `req.usuario.tallerId` cuando hay
  sesión, y solo cae al header cuando no la hay (PWAs, portal del cliente).
- Se despliega con **un solo taller**, así que el comportamiento no cambia para nadie.

Es la etapa que cierra el agujero mientras todavía no hay nada que robar.

### Etapa 2 — La base de control y el registro de talleres

- Una base aparte (la "de control") con la colección `Taller`: nombre, identificador, estado,
  plan, fecha de alta, y la URI de su base de datos.
- `config/conexiones.js` pasa de dos conexiones fijas a un registro que las **abre bajo
  demanda** y las reutiliza, con el tamaño de pool acotado.
- Panel interno para ver los talleres, crear uno, suspenderlo.

### Etapa 3 — Alta de un taller nuevo

- `InstalacionScreen` se convierte en el registro de cada taller: crea la base, sus índices y
  la primera cuenta de administrador, y esa persona entra de inmediato.
- Ya está casi escrita: hoy hace exactamente eso para una instalación.

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
