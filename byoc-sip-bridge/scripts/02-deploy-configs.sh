#!/bin/bash
# ==============================================================================
# 02-deploy-configs.sh
# Deploys Asterisk config files and sets up Secrets Manager secret fetch
# Run AFTER 01-install-asterisk.sh and AFTER creating the AWS secret
# Usage: sudo bash 02-deploy-configs.sh <INSTANCE_EIP> <INSTANCE_PRIVATE_IP> <CHIME_VC_HOSTNAME>
# Example: sudo bash 02-deploy-configs.sh 54.123.45.67 172.31.10.5 abcdef.voiceconnector.chime.aws
# ==============================================================================
set -euo pipefail
log() { echo "[$(date '+%H:%M:%S')] $*"; }

EIP="${1:?Usage: $0 <EIP> <PRIVATE_IP> <CHIME_VC_HOSTNAME>}"
PRIVATE_IP="${2:?}"
CHIME_HOST="${3:?}"
REGION="us-east-1"
SECRET_NAME="byoc/etisalcom-sip"

log "=== Fetching SIP password from Secrets Manager ==="
SIP_PASSWORD=$(aws secretsmanager get-secret-value \
  --secret-id "$SECRET_NAME" \
  --region "$REGION" \
  --query 'SecretString' \
  --output text | jq -r '.password')

if [ -z "$SIP_PASSWORD" ]; then
  echo "ERROR: Could not fetch password from Secrets Manager. Check IAM instance profile."
  exit 1
fi
log "Password fetched successfully"

log "=== Deploying pjsip.conf ==="
cp /tmp/byoc-configs/pjsip.conf /etc/asterisk/pjsip.conf
# Substitute all placeholders
sed -i "s/INSTANCE_EIP/$EIP/g"           /etc/asterisk/pjsip.conf
sed -i "s/INSTANCE_PRIVATE_IP/$PRIVATE_IP/g" /etc/asterisk/pjsip.conf
sed -i "s/REPLACE_WITH_CHIME_VC_HOSTNAME/$CHIME_HOST/g" /etc/asterisk/pjsip.conf
sed -i "s/ETISALCOM_PASSWORD_PLACEHOLDER/$SIP_PASSWORD/g" /etc/asterisk/pjsip.conf
# Lock down permissions — password is now in this file
chmod 640 /etc/asterisk/pjsip.conf
chown asterisk:asterisk /etc/asterisk/pjsip.conf
log "pjsip.conf deployed"

log "=== Deploying extensions.conf ==="
cp /tmp/byoc-configs/extensions.conf /etc/asterisk/extensions.conf
sed -i "s/REPLACE_WITH_CHIME_VC_HOSTNAME/$CHIME_HOST/g" /etc/asterisk/extensions.conf
chown asterisk:asterisk /etc/asterisk/extensions.conf
log "extensions.conf deployed"

log "=== Starting Asterisk ==="
systemctl start asterisk
sleep 3
systemctl is-active asterisk && log "Asterisk running OK" || { echo "ERROR: Asterisk failed to start. Check: journalctl -u asterisk"; exit 1; }

log "=== All done. Verify registration with: sudo asterisk -rx 'pjsip show registrations' ==="
