#!/bin/bash
# ==============================================================================
# 01-install-asterisk.sh
# Installs Asterisk 21 LTS from source on Ubuntu 22.04
# Run as: sudo bash 01-install-asterisk.sh
# Duration: ~45-60 min on t3.small
# ==============================================================================
set -euo pipefail
log() { echo "[$(date '+%H:%M:%S')] $*"; }

log "=== Step 1: System update ==="
apt update && apt upgrade -y

log "=== Step 2: Build dependencies ==="
apt install -y \
  build-essential wget curl git subversion \
  libssl-dev libncurses5-dev libsqlite3-dev \
  libjansson-dev libxml2-dev uuid-dev libedit-dev \
  libnewt-dev libcurl4-openssl-dev xmlstarlet \
  jq unzip awscli

log "=== Step 3: Download Asterisk 21 LTS ==="
cd /usr/src
wget -q http://downloads.asterisk.org/pub/telephony/asterisk/asterisk-21-current.tar.gz
tar -zxf asterisk-21-current.tar.gz
cd asterisk-21.*/

log "=== Step 4: Install prerequisites ==="
contrib/scripts/install_prereq install

log "=== Step 5: Configure (with bundled PJSIP) ==="
./configure --with-pjproject-bundled --with-jansson-bundled

log "=== Step 6: Select modules (enable PJSIP, disable chan_sip) ==="
# Use pre-defined module selection
make menuselect.makeopts
menuselect/menuselect \
  --enable res_pjsip \
  --enable res_pjsip_session \
  --enable res_pjsip_registrar \
  --enable res_pjsip_outbound_registration \
  --enable res_pjsip_identify_by_ip \
  --enable res_pjsip_authenticator_digest \
  --enable chan_pjsip \
  --enable app_dial \
  --enable app_playback \
  --disable chan_sip \
  menuselect.makeopts

log "=== Step 7: Compile (using all CPU cores) ==="
make -j"$(nproc)"

log "=== Step 8: Install ==="
make install
make samples
make config
ldconfig

log "=== Step 9: Create asterisk system user ==="
groupadd -f asterisk
id -u asterisk &>/dev/null || useradd -r -d /var/lib/asterisk -g asterisk asterisk
chown -R asterisk:asterisk \
  /etc/asterisk /var/lib/asterisk \
  /var/log/asterisk /var/spool/asterisk \
  /usr/lib/asterisk

log "=== Step 10: Enable service (do NOT start yet — configs not deployed) ==="
systemctl enable asterisk

log "=== Asterisk installation complete ==="
log "Next: run 02-deploy-configs.sh"
