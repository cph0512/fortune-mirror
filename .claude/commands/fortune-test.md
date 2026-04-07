# Fortune Test

Test fortune analysis end-to-end on both production and test sites.

## Quick API Test (Production — CLI)
```bash
# Submit a test analysis job
JOB=$(curl -s -X POST https://bot.velopulse.io/api/fortune \
  -H "Content-Type: application/json" \
  -d '{"system":"你是命理分析師","prompt":"測試：簡短回覆OK即可","user":"test"}' | python3 -c "import json,sys; print(json.load(sys.stdin)['job_id'])")
echo "Job: $JOB"

# Poll for result (wait up to 30s)
for i in $(seq 1 10); do
  sleep 3
  R=$(curl -s "https://bot.velopulse.io/api/fortune/$JOB")
  STATUS=$(echo $R | python3 -c "import json,sys; print(json.load(sys.stdin).get('status','?'))")
  echo "  Poll $i: $STATUS"
  [ "$STATUS" = "done" ] && break
done
```

## Quick API Test (Test Site — SDK)
```bash
curl -s -X POST https://fortune-sandbox-352618635098.asia-east1.run.app/api/fortune \
  -H "Content-Type: application/json" \
  -d '{"system":"你是命理分析師","prompt":"測試：簡短回覆OK即可","user":"test","model":"haiku"}' | python3 -c "import json,sys; d=json.load(sys.stdin); print(f'Job: {d.get(\"job_id\",\"ERROR\")}')"
```

## Test Session API
```bash
# Save
curl -s -X POST https://bot.velopulse.io/api/fortune-session \
  -H "Content-Type: application/json" \
  -d '{"user":"test@test.com","session":{"step":1,"gender":"男"}}' | python3 -m json.tool

# Load
curl -s "https://bot.velopulse.io/api/fortune-session?user=test@test.com" | python3 -m json.tool

# Delete
curl -s -X DELETE "https://bot.velopulse.io/api/fortune-session?user=test@test.com"
```

## Test Horoscope API
```bash
curl -s "https://api.destinytelling.life:3083/api/horoscope/today" | python3 -c "
import json,sys
d=json.load(sys.stdin)
if d.get('horoscope'): print(f'OK: {d[\"zodiac\"]} {d[\"horoscope\"][\"overall_stars\"]}★')
elif d.get('horoscopes'): print(f'OK: {len(d[\"horoscopes\"])} zodiac signs')
else: print(f'No data: {d.get(\"message\",\"?\")}')"
```
