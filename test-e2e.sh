#!/usr/bin/env bash
# End-to-end smoke test. Usage: ./test-e2e.sh [base_url]
set -u
B=${1:-http://127.0.0.1:3100}
pw(){ grep -F "$1" DEMO_CREDENTIALS.md | awk -F'`' '{print $2}'; }
tok(){ grep -o 'name="_csrf" value="[^"]*"' "$1" | head -1 | sed 's/.*value="//;s/"//'; }
login(){ local jar=$1 email=$2; rm -f $jar; curl -s -c $jar -b $jar "$B/login" -o /tmp/l.html; local t=$(tok /tmp/l.html)
  curl -s -c $jar -b $jar -o /dev/null -w "%{http_code} %{redirect_url}" --data-urlencode "_csrf=$t" --data-urlencode "email=$email" --data-urlencode "password=$(pw $email)" "$B/login"; echo; }
code(){ curl -s -b $1 -o /tmp/o.html -w "%{http_code}" "$B$2"; }
echo "admin login: $(login /tmp/a.jar morgan.ellis@harborpine.example)"
echo "staff login: $(login /tmp/s.jar daniel.okafor@harborpine.example)"
for p in / /licences /ce /people /catalog /reminders /outbox /account /licences/new /ce/new /reports/compliance.csv "/licences?status=due" /people/3; do echo "admin $p -> $(code /tmp/a.jar "$p")"; done
for p in / /licences /ce /account /people /catalog /reminders /outbox /reports/compliance.csv; do echo "staff $p -> $(code /tmp/s.jar "$p")"; done
# staff trying to view someone else's licence / CE / file
OTHER_LIC=$(sqlite3 storage/app.db "select id from user_certs where user_id<>(select id from users where email='daniel.okafor@harborpine.example') limit 1" 2>/dev/null || true)
echo "staff other licence -> $(code /tmp/s.jar /licences/1)"
# upload a PDF as staff
curl -s -b /tmp/s.jar "$B/ce/new" -o /tmp/n.html; T=$(tok /tmp/n.html)
printf '%%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%%%EOF\n' > /tmp/test-cert.pdf
R=$(curl -s -b /tmp/s.jar -o /dev/null -w "%{http_code} %{redirect_url}" -F "_csrf=$T" -F "title=E2E Test Course" -F "provider=AICPA" -F "field=Taxation" -F "completed_date=$(date +%F)" -F "hours=2" -F "ethics_hours=0" -F "delivery=Self-study (QAS)" -F "certificate=@/tmp/test-cert.pdf;type=application/pdf" "$B/ce")
echo "staff upload -> $R"
CE=${R##*/}; curl -s -b /tmp/s.jar "$B/ce/$CE" -o /tmp/ce.html; F=$(grep -o '/files/[0-9a-f-]\{36\}' /tmp/ce.html | head -1)
echo "file url $F"
echo "staff view own file -> $(curl -s -b /tmp/s.jar -o /tmp/f.pdf -w '%{http_code} %{content_type}' "$B$F") bytes=$(wc -c </tmp/f.pdf)"
echo "admin view staff file -> $(curl -s -b /tmp/a.jar -o /dev/null -w '%{http_code}' "$B$F")"
echo "anon view file -> $(curl -s -o /dev/null -w '%{http_code} %{redirect_url}' "$B$F")"
login /tmp/s2.jar kevin.cho@harborpine.example >/dev/null
echo "other staff view file -> $(curl -s -b /tmp/s2.jar -o /dev/null -w '%{http_code}' "$B$F")"
echo "other staff view CE -> $(code /tmp/s2.jar /ce/$CE)"
# spoofed upload (HTML renamed .pdf)
echo '<script>alert(1)</script>' > /tmp/evil.pdf
curl -s -b /tmp/s.jar "$B/ce/$CE" -o /tmp/ce.html; T=$(tok /tmp/ce.html)
curl -s -b /tmp/s.jar -c /tmp/s.jar -o /dev/null -F "_csrf=$T" -F "certificate=@/tmp/evil.pdf;type=application/pdf" "$B/ce/$CE/files"
curl -s -b /tmp/s.jar "$B/ce/$CE" | grep -o 'Certificates must be[^<]*' | head -1
# CSRF missing
echo "POST without csrf -> $(curl -s -b /tmp/a.jar -o /dev/null -w '%{http_code}' -d 'x=1' "$B/reminders/run")"
echo "multipart without csrf -> $(curl -s -b /tmp/s.jar -o /dev/null -w '%{http_code}' -F 'title=x' -F 'hours=1' "$B/ce")"
# staff cannot run admin POST
curl -s -b /tmp/s.jar "$B/" -o /tmp/d.html; T=$(tok /tmp/d.html)
echo "staff POST /reminders/run -> $(curl -s -b /tmp/s.jar -o /dev/null -w '%{http_code}' --data-urlencode "_csrf=$T" "$B/reminders/run")"
# headers
curl -s -I "$B/login" | grep -iE 'content-security|x-frame|strict-transport|x-content-type|referrer|set-cookie' 
curl -s -c /tmp/x.jar "$B/login" -o /dev/null; grep -c HttpOnly /tmp/x.jar >/dev/null; curl -s -D - -o /dev/null "$B/login" | grep -i set-cookie
