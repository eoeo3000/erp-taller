#!/usr/bin/env bash
# Revisa que cada taller activo tenga un respaldo reciente, sin crear ninguno.
#
# Cuando el respaldo lo dispara el reloj de Cloudflare (reloj-cloudflare/), GitHub ya no
# respalda: VIGILA. Un Worker que falla no le avisa a nadie; una acción de GitHub que
# termina en rojo le manda un correo al dueño del repositorio. Y a una revisión no le
# importa que GitHub la corra ocho horas tarde, que es justo lo que inutilizaba a GitHub
# como reloj (ver docs/horario-servidor.md).
#
# Variables: RESPALDO_URL, RESPALDO_TOKEN (los mismos secretos del respaldo).
#            HORAS_MAXIMAS (30 por omisión).
set -euo pipefail
shopt -s inherit_errexit

HORAS_MAXIMAS="${HORAS_MAXIMAS:-30}"

if [ -z "${RESPALDO_URL:-}" ] || [ -z "${RESPALDO_TOKEN:-}" ]; then
  echo "::error::Faltan los secretos RESPALDO_URL o RESPALDO_TOKEN en este repositorio."
  exit 1
fi

cuerpo=$(mktemp)
codigo=$(curl -sS -o "$cuerpo" -w '%{http_code}' --max-time 120 --retry 2 --retry-delay 20 \
  "$RESPALDO_URL" -H "X-Respaldo-Token: $RESPALDO_TOKEN" || true)

if [ "$codigo" != "200" ]; then
  echo "::error::No se pudo consultar la lista de respaldos (HTTP ${codigo:-sin respuesta}). Revisa el backend en Render."
  exit 1
fi

ahora="${AHORA_EPOCH:-$(date -u +%s)}"
# Las fechas llegan como "2026-11-04T08:00:03.123Z"; fromdateiso8601 no acepta los
# milisegundos, así que se sacan antes. Un taller sin ningún respaldo cuenta como atrasado:
# es exactamente lo que esto existe para notar.
informe=$(jq -r --argjson ahora "$ahora" --argjson max "$((HORAS_MAXIMAS * 3600))" '
  .talleres[]
  | (.masReciente // null) as $f
  | (if $f == null then null
     else ($ahora - ($f | sub("\\.[0-9]+Z$"; "Z") | fromdateiso8601)) end) as $edad
  | "\(if $edad == null or $edad > $max then "ATRASADO" else "ok" end)\t\(.taller)\t\(
      if $edad == null then "nunca" else "hace \(($edad / 3600) | floor) h" end)"
' "$cuerpo")
rm -f "$cuerpo"

if [ -z "$informe" ]; then
  echo "::error::La lista de respaldos no trae ningún taller. Algo cambió en la respuesta del backend."
  exit 1
fi

echo "$informe" | while IFS=$'\t' read -r estado taller cuando; do
  echo "$estado  $taller  (último respaldo: $cuando)"
done

atrasados=$(echo "$informe" | grep -c '^ATRASADO' || true)
if [ "$atrasados" -gt 0 ]; then
  nombres=$(echo "$informe" | awk -F'\t' '$1=="ATRASADO"{printf "%s%s (%s)", sep, $2, $3; sep=", "}')
  echo "::error::Sin respaldo en las últimas ${HORAS_MAXIMAS} horas: ${nombres}. Revisa Cron Events del Worker en Cloudflare."
  exit 1
fi
echo "::notice::Todos los talleres tienen un respaldo de menos de ${HORAS_MAXIMAS} horas."
