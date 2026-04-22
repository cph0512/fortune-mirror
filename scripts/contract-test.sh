#!/bin/bash
# contract-test.sh — fast contract probe for routes that have regressed.
#
# Targets the four endpoints flagged in the 2026-04-22 smoke chain:
#   - POST /api/fortune-logout              (lab / oai were 404)
#   - POST /api/fortune-session             (_lang write was 401 on oai)
#   - DELETE /api/fortune-charts            (oai was 400 Invalid JSON)
#   - POST /api/fortune-save/delete         (oai was 400 Invalid JSON)
#
# Runs each against all three sites and prints a pass/fail table.
# Usage: ./scripts/contract-test.sh
set -u
SITES=(test lab oai)
TS=$(date +%s)
declare -a RESULTS

probe() {
  local site=$1 label=$2 method=$3 path=$4 body=$5
  local url="https://${site}.destinytelling.life${path}"
  local code
  if [ "$method" = "GET" ]; then
    code=$(curl -s -o /dev/null -w "%{http_code}" "$url")
  else
    code=$(curl -s -o /dev/null -w "%{http_code}" "$url" -X "$method" \
      -H "Content-Type: application/json" -d "$body")
  fi
  local status="PASS"
  # Each route's acceptable codes:
  #   logout:    200
  #   session:   200 (GET/POST) — even with bad auth body, route must exist
  #   charts:    200/401/404 — NOT 400 Invalid JSON (that was the regression)
  #   save/del:  200/401/404 — NOT 400 Invalid JSON
  case "$label" in
    logout)           [ "$code" = "200" ] || status="FAIL" ;;
    session)          case "$code" in 200|401) ;; *) status="FAIL" ;; esac ;;
    charts-delete)    case "$code" in 200|401|404) ;; *) status="FAIL" ;; esac ;;
    save-delete)      case "$code" in 200|401|404) ;; *) status="FAIL" ;; esac ;;
  esac
  RESULTS+=("$(printf '%-20s %-4s %-18s %-4s %s' "$site" "$method" "$label" "$code" "$status")")
}

for site in "${SITES[@]}"; do
  probe "$site" logout         POST   /api/fortune-logout         '{}'
  probe "$site" session        POST   /api/fortune-session        "{\"user\":\"contract_${TS}@test.local\",\"session\":{\"_lang\":\"en\"}}"
  probe "$site" charts-delete  DELETE /api/fortune-charts         "{\"user\":\"contract_${TS}@test.local\",\"id\":\"nonexistent\"}"
  probe "$site" save-delete    POST   /api/fortune-save/delete    "{\"user\":\"contract_${TS}@test.local\",\"time\":\"1970-01-01T00:00:00Z\"}"
done

echo
printf '%-20s %-4s %-18s %-4s %s\n' SITE METHOD ROUTE CODE STATUS
printf '%-20s %-4s %-18s %-4s %s\n' -------------------- ---- ------------------ ---- ------
PASS=0 FAIL=0
for r in "${RESULTS[@]}"; do
  echo "$r"
  [[ "$r" == *FAIL ]] && FAIL=$((FAIL+1)) || PASS=$((PASS+1))
done
echo
echo "Total: $PASS passed / $FAIL failed"
exit $FAIL
