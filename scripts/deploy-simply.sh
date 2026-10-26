#!/usr/bin/env bash
# Uploads dist/ to the web host (Simply) over SSH and swaps it in as a whole.
# The new site is unpacked next to the live folder and then renamed into place, so visitors
# never see a half-uploaded site. The previous version stays as <folder>.gammel until the next run;
# to roll back, rename it back by hand.
#
# Environment: SIMPLY_USER, SIMPLY_PATH (the subdomain's folder, relative to the SSH home),
# SIMPLY_SSH_KEY (private key), SIMPLY_KNOWN_HOSTS (output of ssh-keyscan), optional SIMPLY_HOST.
set -euo pipefail
: "${SIMPLY_USER:?mangler}" "${SIMPLY_PATH:?mangler}" "${SIMPLY_SSH_KEY:?mangler}" "${SIMPLY_KNOWN_HOSTS:?mangler}"
host="${SIMPLY_HOST:-ssh.simply.com}"
# Only plain relative paths: the value is used inside quotes in remote shell commands.
if [[ ! "$SIMPLY_PATH" =~ ^[A-Za-z0-9._-]+(/[A-Za-z0-9._-]+)*$ || "$SIMPLY_PATH" =~ (^|/)\.\.?(/|$) ]]; then
  echo "SIMPLY_PATH skal være en relativ sti uden '..', fx public_html/newweb" >&2; exit 1
fi
[[ "$SIMPLY_USER" =~ ^[A-Za-z0-9._-]+$ ]] || { echo "SIMPLY_USER er ugyldig" >&2; exit 1; }
[ -f dist/index.html ] && [ -f dist/.htaccess ] || { echo "dist/ mangler; kør buildet først" >&2; exit 1; }

work="$(mktemp -d)"; trap 'rm -rf "$work"' EXIT
printf '%s\n' "$SIMPLY_SSH_KEY" > "$work/key"; chmod 600 "$work/key"
printf '%s\n' "$SIMPLY_KNOWN_HOSTS" > "$work/known_hosts"
remote() { ssh -i "$work/key" -o IdentitiesOnly=yes -o BatchMode=yes -o StrictHostKeyChecking=yes -o UserKnownHostsFile="$work/known_hosts" "$SIMPLY_USER@$host" "$@"; }

live="$SIMPLY_PATH"; next="$SIMPLY_PATH.ny"; old="$SIMPLY_PATH.gammel"
tar -C dist -czf "$work/site.tgz" .
remote "rm -rf '$next' && mkdir -p '$next' && tar -xzf - -C '$next' && test -f '$next/index.html'" < "$work/site.tgz"
remote "rm -rf '$old' && if [ -e '$live' ]; then mv '$live' '$old'; fi && mv '$next' '$live'"
echo "Uploadet til $host:$live. Den forrige version ligger i $old."
