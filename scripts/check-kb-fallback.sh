#!/bin/bash
# check-kb-fallback.sh — poll production logs for [KB_FALLBACK] warnings.
#
# Why: the KB fallback fires silently when goal-filtering reduces the KB
# below threshold, which could mean the goal→topic map drifted or the KB
# lost core entries. Auditing this by hand is annoying; this script shows
# recent fallbacks across all three sites.
#
# Usage:
#   ./scripts/check-kb-fallback.sh            # last 24h
#   ./scripts/check-kb-fallback.sh 72         # last 72h
#
# Requires gcloud auth. For oai we read local launchctl logs.
set -eu

HOURS=${1:-24}
PROJECT=${PROJECT:-velopulse-infra}

echo "================ KB_FALLBACK audit (last ${HOURS}h) ================"
echo ""

for service in fortune-sandbox fortune-lab; do
  echo "--- ${service} (Cloud Run) ---"
  gcloud logging read \
    "resource.type=cloud_run_revision AND resource.labels.service_name=${service} AND textPayload:\"KB_FALLBACK\"" \
    --format="value(timestamp,textPayload)" \
    --freshness="${HOURS}h" \
    --limit=50 \
    --project="${PROJECT}" 2>/dev/null || echo "(gcloud read failed — check auth)"
  echo ""
done

echo "--- fortune-oai (m4pro launchctl) ---"
# Try common log locations for the launchd service
for f in \
  "$HOME/Library/Logs/codex-fortune-api.log" \
  "$HOME/Library/Logs/com.cph.oai-fortune.log" \
  "/tmp/oai-fortune.log" \
  "$HOME/Documents/New project/codex-fortune-api/server.log"
do
  if [ -f "$f" ]; then
    echo "(log: $f)"
    grep -E "\[KB_FALLBACK\]" "$f" 2>/dev/null | tail -20
    echo ""
    exit 0
  fi
done
echo "oai log not found at known paths. Try:"
echo "  launchctl print gui/501/com.cph.oai-fortune 2>/dev/null | grep -E 'log|path'"
