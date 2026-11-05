#!/usr/bin/env bash
# Enciende o apaga el backend en Render a través de su API.
#
#   servidor-render.sh encender   reanuda el servicio y espera a que el backend responda
#   servidor-render.sh apagar     suspende el servicio
#   servidor-render.sh estado     imprime suspended | not_suspended
#
# Lo usan dos acciones: horario-servidor.yml (el apagado nocturno) y respaldo.yml, que
# antes de pedir el respaldo se asegura de que el servidor esté encendido. Una sola
# definición de «encender» para las dos: si cada acción tuviera la suya, la primera
# corrección se haría en una y no en la otra.
#
# Variables:
#   RENDER_API_KEY     (secreto) clave de la API de Render
#   RENDER_SERVICE_ID  (secreto) id del servicio, empieza con srv-
#   BACKEND_URL        opcional: base de la API (https://…/api). Con ella, «encender» no
#                      termina hasta que el backend contesta de verdad.
#   RENDER_API_BASE    solo para probar contra un servidor falso.
set -euo pipefail
# Sin esto, un error dentro de $( ) no corta el script: con la clave mala, «estado» fallaba,
# el script seguía, decía «el servicio ya estaba apagado» y la acción terminaba en verde
# sin haber hecho nada. Por lo mismo el estado se guarda siempre en una variable antes de
# compararlo: un `[ "$(estado)" = … ]` se traga el error aunque esto esté puesto.
shopt -s inherit_errexit

API="${RENDER_API_BASE:-https://api.render.com/v1}"
INTENTOS="${INTENTOS:-30}"
PAUSA="${PAUSA:-10}"

if [ -z "${RENDER_API_KEY:-}" ] || [ -z "${RENDER_SERVICE_ID:-}" ]; then
  echo "::error::Faltan los secretos RENDER_API_KEY o RENDER_SERVICE_ID en este repositorio."
  exit 1
fi

render() { # render <método> <sufijo de ruta>
  local cuerpo codigo
  cuerpo=$(mktemp)
  codigo=$(curl -sS -o "$cuerpo" -w '%{http_code}' --max-time 30 -X "$1" \
    "$API/services/$RENDER_SERVICE_ID$2" \
    -H "Authorization: Bearer $RENDER_API_KEY" \
    -H "Accept: application/json" || true)
  case "$codigo" in
    2??) cat "$cuerpo"; rm -f "$cuerpo"; return 0 ;;
  esac
  rm -f "$cuerpo"
  # El cuerpo de la respuesta no se imprime: no trae nada que ayude más que el código, y
  # así no hay forma de que algo de la cuenta de Render termine en el log de la acción.
  case "$codigo" in
    401|403) echo "::error::Render rechazó la clave (HTTP $codigo). Revisa el secreto RENDER_API_KEY." >&2 ;;
    404)     echo "::error::Render no encuentra ese servicio (HTTP 404). Revisa el secreto RENDER_SERVICE_ID." >&2 ;;
    000|"")  echo "::error::No hubo respuesta de la API de Render." >&2 ;;
    *)       echo "::error::La API de Render respondió HTTP $codigo." >&2 ;;
  esac
  return 1
}

estado() {
  local valor
  valor=$(render GET "" | jq -r '.suspended // empty')
  # Un valor que no sea uno de los dos conocidos es una respuesta que no entendemos.
  # Seguir adelante sería apagar o encender a ciegas.
  case "$valor" in
    suspended|not_suspended) echo "$valor" ;;
    *) echo "::error::Render respondió un estado que no se reconoce: '${valor}'." >&2; exit 1 ;;
  esac
}

esperar_backend() {
  [ -n "${BACKEND_URL:-}" ] || return 0
  local url="${BACKEND_URL%/}/auth/yo" codigo i
  # /auth/yo responde 200 o 401 según haya sesión: cualquiera de los dos significa que el
  # proceso arrancó y conectó. Lo demás (sin respuesta, 502, 503) es que todavía no.
  for i in $(seq 1 "$INTENTOS"); do
    codigo=$(curl -s -o /dev/null -w '%{http_code}' --max-time 20 "$url" || true)
    case "$codigo" in
      200|401) echo "El backend responde (HTTP $codigo)."; return 0 ;;
    esac
    echo "Esperando al backend… (intento $i, HTTP ${codigo:-sin respuesta})"
    sleep "$PAUSA"
  done
  echo "::error::Render dice que el servicio está encendido, pero el backend no responde. Revisa los logs en Render."
  exit 1
}

case "${1:-}" in
  estado)
    estado
    ;;
  encender)
    actual=$(estado)
    if [ "$actual" = "suspended" ]; then
      render POST /resume > /dev/null
      echo "Pedido de encendido enviado a Render."
      for i in $(seq 1 "$INTENTOS"); do
        actual=$(estado)
        [ "$actual" = "not_suspended" ] && break
        if [ "$i" = "$INTENTOS" ]; then
          echo "::error::Render no terminó de reanudar el servicio a tiempo."
          exit 1
        fi
        sleep "$PAUSA"
      done
    else
      echo "El servicio ya estaba encendido."
    fi
    esperar_backend
    echo "::notice::Servidor encendido."
    ;;
  apagar)
    actual=$(estado)
    if [ "$actual" = "not_suspended" ]; then
      render POST /suspend > /dev/null
      echo "::notice::Servidor apagado. Para encenderlo antes de hora: Actions → Horario del servidor → Run workflow → encender."
    else
      echo "El servicio ya estaba apagado."
    fi
    ;;
  *)
    echo "Uso: $0 encender|apagar|estado" >&2
    exit 2
    ;;
esac
