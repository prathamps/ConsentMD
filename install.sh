#!/usr/bin/env bash
#
# ConsentMD — one-shot environment bootstrap
# ==========================================
#
#  >>> MAINTENANCE NOTE — KEEP THIS SCRIPT UPDATED <<<
#  This script is the single source of truth for "what does a fresh machine need
#  to run ConsentMD". Every time a dependency, version, port, env var or service
#  is added/changed anywhere in this repo (api/, client/, blockchain/, caliper),
#  update this script in the same commit. It must stay good enough that a brand
#  new device or VM can go from `git clone` to a running stack by executing only
#  this file. If you had to run an extra command by hand to make things work,
#  that command belongs in here.
#
# What it installs / does (all steps are idempotent, safe to re-run):
#   1. Base OS packages (curl, git, jq, build tools, openssl, python3, ...)
#   2. Docker Engine + docker compose plugin (skipped if Docker already works)
#   3. Node.js 18.20.8 LTS (NodeSource) + npm 10.x
#      -> see the VERSION MATRIX below for every tool's exact minimum;
#         `./install.sh --versions` prints it without installing anything
#   4. Hyperledger Fabric binaries (peer, orderer, configtxgen, osnadmin,
#      fabric-ca-client) into ./bin, plus the Fabric docker images
#   5. Optional Go toolchain (--with-go)
#   6. Optional local MongoDB container on port 27011 (--with-mongo)
#   7. npm dependencies for api/, client/, chaincode and the Caliper workspace
#   8. Starter .env files for api/ and client/ (never overwrites existing ones)
#   9. Pre-pulls the docker images used by the Fabric network
#
# Usage:
#   ./install.sh                 # full install with sane defaults
#   ./install.sh --with-mongo    # also run a local MongoDB for the API
#   ./install.sh --skip-npm      # system deps only, no npm installs
#   ./install.sh --help          # all flags
#
# Supported: Ubuntu / Debian (incl. WSL2). Other distros: install the packages
# listed in `install_base_packages` by hand, then re-run with --skip-docker.
#
set -euo pipefail

# ===========================================================================
# VERSION MATRIX — the single place to bump anything. Keep in sync with:
#   blockchain/artifacts/docker-compose.yaml                  (peer/orderer/couchdb tags)
#   blockchain/caliper/caliper-benchmarks-local/package.json  ("engines")
#   blockchain/caliper/caliper-benchmarks-local/verify-setup.sh (its own min checks)
#   client/package.json (next)  |  api/package.json (fabric-network, mongoose)
#
#  Tool          Minimum required   Pinned/tested here   Why that floor
#  ------------  -----------------  -------------------  ----------------------------
#  Node.js       18.18.0            18.20.8 (LTS)        Next 15.3.4 needs ^18.18||>=20;
#                                                        Caliper 0.6 + verify-setup.sh
#                                                        need >=18; mongoose 5.13 in
#                                                        api/ is not safe above 18.
#  npm           8.0.0              10.8.2 (bundled)     caliper workspace "engines"
#  Docker Engine 20.10.0            latest stable        Fabric 2.5 external chaincode
#                                                        builders + compose v2 support
#  Docker Compose 2.0.0             latest plugin        all compose files here are v2-safe
#  Git           2.25.0             distro latest        sparse/partial clone flags
#  Fabric bins   2.5.0              2.5.0                MUST equal the image tags in
#                                                        artifacts/docker-compose.yaml
#  Fabric CA     1.5.7              1.5.7                fabric-ca-client for the API's
#                                                        enrollment flow
#  CouchDB img   3.1.1              3.1.1                pinned by artifacts compose
#  Go (optional) 1.21.0             1.21.13              only for Go chaincode; the
#                                                        chaincode in this repo is JS
#  Python 3      3.8                distro default       node-gyp / helper scripts
#  jq            1.6                distro default       used by the network scripts
#  OpenSSL       1.1.1              distro default       cert inspection in the scripts
#  MongoDB       5.0                6.0 (container)      mongoose 5.13 driver ceiling
# ===========================================================================
NODE_VERSION="${NODE_VERSION:-18}"            # major installed from NodeSource
NODE_TESTED="18.20.8"                         # exact version this repo is tested on
NODE_MIN="18.18.0"                            # hard floor (Next.js 15)
NPM_MIN="8.0.0"
DOCKER_MIN="20.10.0"
COMPOSE_MIN="2.0.0"
GIT_MIN="2.25.0"
FABRIC_VERSION="${FABRIC_VERSION:-2.5.0}"     # must match the compose image tags
FABRIC_CA_VERSION="${FABRIC_CA_VERSION:-1.5.7}"
COUCHDB_IMAGE="${COUCHDB_IMAGE:-couchdb:3.1.1}"
GO_VERSION="${GO_VERSION:-1.21.13}"
GO_MIN="1.21.0"
MONGO_IMAGE="${MONGO_IMAGE:-mongo:6.0}"
MONGO_PORT="27011"                            # api/src/config/config.js treats
                                              # localhost:27011 as a non-SRV host

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BIN_DIR="$REPO_ROOT/bin"

# --- flags -----------------------------------------------------------------
PRINT_VERSIONS=0
SKIP_BASE=0
SKIP_DOCKER=0
SKIP_NODE=0
SKIP_FABRIC=0
SKIP_NPM=0
SKIP_IMAGES=0
WITH_GO=0
WITH_MONGO=0

usage() {
  cat <<'EOF'
ConsentMD environment bootstrap.

Installs everything a fresh device/VM needs: base packages, Docker, Node.js,
the Hyperledger Fabric binaries, npm dependencies for api/client/chaincode/
caliper, and starter .env files. Idempotent — safe to re-run.

Usage: ./install.sh [flags]

Flags:
  --skip-base        Do not apt-install the base OS packages
  --skip-docker      Do not install Docker Engine
  --skip-node        Do not install Node.js
  --skip-fabric      Do not download the Fabric binaries
  --skip-npm         Do not run npm install in the sub-projects
  --skip-images      Do not pre-pull docker images
  --with-go          Also install the Go toolchain (only needed for Go chaincode)
  --with-mongo       Run a local MongoDB container on port 27011 for the API
  --node-version N   Node major version to install (default: 18)
  --fabric-version V Fabric version for binaries/images (default: 2.5.0)
  --versions         Print the full version matrix and exit (installs nothing)
  -h, --help         This message
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --skip-base)      SKIP_BASE=1 ;;
    --skip-docker)    SKIP_DOCKER=1 ;;
    --skip-node)      SKIP_NODE=1 ;;
    --skip-fabric)    SKIP_FABRIC=1 ;;
    --skip-npm)       SKIP_NPM=1 ;;
    --skip-images)    SKIP_IMAGES=1 ;;
    --with-go)        WITH_GO=1 ;;
    --with-mongo)     WITH_MONGO=1 ;;
    --versions)       PRINT_VERSIONS=1 ;;
    --node-version)   NODE_VERSION="$2"; shift ;;
    --fabric-version) FABRIC_VERSION="$2"; shift ;;
    -h|--help)        usage; exit 0 ;;
    *) echo "Unknown flag: $1"; usage; exit 1 ;;
  esac
  shift
done

# --- output helpers --------------------------------------------------------
C_RESET='\033[0m'; C_RED='\033[0;31m'; C_GREEN='\033[0;32m'
C_BLUE='\033[0;34m'; C_YELLOW='\033[1;33m'

step() { echo -e "\n${C_BLUE}==>${C_RESET} ${C_BLUE}$*${C_RESET}"; }
ok()   { echo -e "  ${C_GREEN}✔${C_RESET} $*"; }
warn() { echo -e "  ${C_YELLOW}!${C_RESET} $*"; }
die()  { echo -e "  ${C_RED}x${C_RESET} $*" >&2; exit 1; }

SUDO=""
[[ $EUID -ne 0 ]] && SUDO="sudo"

have() { command -v "$1" >/dev/null 2>&1; }

APT_UPDATED=0
apt_update_once() {
  [[ $APT_UPDATED -eq 1 ]] && return 0
  $SUDO apt-get update -qq
  APT_UPDATED=1
}

apt_install() {
  apt_update_once
  DEBIAN_FRONTEND=noninteractive $SUDO apt-get install -y -qq --no-install-recommends "$@"
}

# ---------------------------------------------------------------------------
# 0. Preflight
# ---------------------------------------------------------------------------
preflight() {
  step "Preflight"
  [[ -f /etc/os-release ]] || die "Cannot detect OS (no /etc/os-release)."
  # shellcheck disable=SC1091
  . /etc/os-release
  ok "OS: ${PRETTY_NAME:-$NAME $VERSION_ID}"
  case "${ID_LIKE:-$ID}" in
    *debian*|*ubuntu*) ;;
    *) die "This script targets Debian/Ubuntu. On $ID, install deps manually and re-run with --skip-docker --skip-node." ;;
  esac
  if grep -qi microsoft /proc/version 2>/dev/null; then
    IS_WSL=1; ok "WSL detected"
  else
    IS_WSL=0
  fi
  if [[ -n "$SUDO" ]] && ! sudo -n true 2>/dev/null; then
    warn "sudo password may be requested during the install."
  fi
  ok "Repo root: $REPO_ROOT"
}

# ---------------------------------------------------------------------------
# 1. Base packages
# ---------------------------------------------------------------------------
install_base_packages() {
  step "Base packages"
  if [[ $SKIP_BASE -eq 1 ]]; then warn "skipped (--skip-base)"; return 0; fi
  apt_install \
    ca-certificates curl wget gnupg lsb-release \
    git jq unzip tar zip \
    build-essential g++ make python3 python3-pip \
    openssl netcat-openbsd dnsutils procps
  ok "Base packages present"
}

# ---------------------------------------------------------------------------
# 2. Docker
# ---------------------------------------------------------------------------
install_docker_from_repo() {
  local id codename arch
  # shellcheck disable=SC1091
  id="$(. /etc/os-release && echo "$ID")"
  codename="$(. /etc/os-release && echo "${UBUNTU_CODENAME:-$VERSION_CODENAME}")"
  arch="$(dpkg --print-architecture)"
  [[ -n "$codename" ]] || return 1

  # Bail out early if Docker has no packages for this release yet.
  curl -fsSL -o /dev/null "https://download.docker.com/linux/${id}/dists/${codename}/Release" || return 1

  $SUDO install -m 0755 -d /etc/apt/keyrings
  curl -fsSL "https://download.docker.com/linux/${id}/gpg" \
    | $SUDO gpg --batch --yes --dearmor -o /etc/apt/keyrings/docker.gpg || return 1
  $SUDO chmod a+r /etc/apt/keyrings/docker.gpg
  echo "deb [arch=${arch} signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/${id} ${codename} stable" \
    | $SUDO tee /etc/apt/sources.list.d/docker.list >/dev/null
  APT_UPDATED=0
  apt_install docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin || return 1
}

install_docker() {
  step "Docker Engine + compose plugin"
  if [[ $SKIP_DOCKER -eq 1 ]]; then warn "skipped (--skip-docker)"; return 0; fi

  if have docker && docker info >/dev/null 2>&1; then
    local dver; dver="$(extract_version docker --version)"
    if version_ge "${dver:-0}" "$DOCKER_MIN"; then
      ok "Docker $dver already working (>= $DOCKER_MIN)"
    else
      warn "Docker $dver is below the required $DOCKER_MIN — upgrade it (Fabric 2.5 external builders need 20.10+)"
    fi
  else
    if have docker && [[ ${IS_WSL:-0} -eq 1 ]]; then
      warn "docker CLI found but the daemon is unreachable — if you use Docker Desktop, enable WSL integration for this distro."
    fi
    if ! have docker; then
      # Preferred: Docker's official apt repo. Falls back to get.docker.com when
      # the distro release has no repo yet (common on brand-new Ubuntu VMs).
      if install_docker_from_repo; then
        ok "Docker installed from the official apt repository"
      else
        warn "official apt repo unavailable for this release — using get.docker.com"
        curl -fsSL https://get.docker.com | $SUDO sh || die "Docker installation failed"
        ok "Docker installed via the convenience script"
      fi
    fi
    # Start the daemon (systemd on VMs, service fallback on WSL without systemd)
    if have systemctl && systemctl list-units --type=service >/dev/null 2>&1; then
      $SUDO systemctl enable --now docker || warn "could not enable docker via systemd"
    else
      $SUDO service docker start >/dev/null 2>&1 || warn "could not start docker via service"
    fi
  fi

  # Run docker without sudo
  if ! docker info >/dev/null 2>&1; then
    warn "docker daemon still unreachable — check it before running the network scripts"
  fi
  if ! id -nG "$USER" | tr ' ' '\n' | grep -qx docker; then
    $SUDO groupadd -f docker
    $SUDO usermod -aG docker "$USER"
    warn "Added $USER to the 'docker' group — log out/in (or run: newgrp docker) for it to take effect."
  else
    ok "$USER is in the docker group"
  fi

  # The repo's scripts call both `docker compose` and `docker-compose`.
  if ! have docker-compose; then
    if docker compose version >/dev/null 2>&1; then
      $SUDO tee /usr/local/bin/docker-compose >/dev/null <<'EOF'
#!/usr/bin/env bash
# Shim so the repo scripts that still call `docker-compose` keep working.
exec docker compose "$@"
EOF
      $SUDO chmod +x /usr/local/bin/docker-compose
      ok "Installed docker-compose shim -> docker compose"
    else
      warn "docker compose plugin not found; the blockchain scripts need it"
    fi
  else
    ok "docker-compose available ($(docker-compose --version 2>/dev/null | head -1))"
  fi
}

# ---------------------------------------------------------------------------
# 3. Node.js
# ---------------------------------------------------------------------------
install_node() {
  step "Node.js ${NODE_VERSION}.x (tested: $NODE_TESTED, minimum: $NODE_MIN)"
  if [[ $SKIP_NODE -eq 1 ]]; then warn "skipped (--skip-node)"; return 0; fi

  local current=""
  if have node; then current="$(node -v 2>/dev/null | sed 's/^v//;s/\..*//')"; fi

  if [[ "$current" == "$NODE_VERSION" ]]; then
    local full; full="$(node -v | sed 's/^v//')"
    if version_ge "$full" "$NODE_MIN"; then
      ok "Node v$full already installed (>= $NODE_MIN)"
    else
      warn "Node v$full is below $NODE_MIN — reinstalling ${NODE_VERSION}.x"
      curl -fsSL "https://deb.nodesource.com/setup_${NODE_VERSION}.x" | $SUDO -E bash - >/dev/null
      APT_UPDATED=1
      apt_install nodejs
      ok "Installed $(node -v)"
    fi
  else
    if [[ -n "$current" ]]; then warn "found Node v$current, installing ${NODE_VERSION}.x"; fi
    curl -fsSL "https://deb.nodesource.com/setup_${NODE_VERSION}.x" | $SUDO -E bash - >/dev/null
    APT_UPDATED=1
    apt_install nodejs
    ok "Installed $(node -v)"
  fi

  # In WSL the Windows npm often shadows the Linux one — that breaks native builds.
  if [[ "$(command -v npm)" == /mnt/* ]]; then
    warn "npm resolves to the Windows install ($(command -v npm)). Open a new shell so /usr/bin comes first, or remove the Windows PATH entries."
  fi
  ok "npm $(npm -v 2>/dev/null || echo '?')"
}

# ---------------------------------------------------------------------------
# 4. Hyperledger Fabric binaries + images
# ---------------------------------------------------------------------------
install_fabric() {
  step "Fabric $FABRIC_VERSION binaries (peer, configtxgen, osnadmin, fabric-ca-client)"
  if [[ $SKIP_FABRIC -eq 1 ]]; then warn "skipped (--skip-fabric)"; return 0; fi

  if [[ -x "$BIN_DIR/peer" ]] && "$BIN_DIR/peer" version 2>/dev/null | grep -q "$FABRIC_VERSION"; then
    ok "Fabric binaries already at $FABRIC_VERSION in $BIN_DIR"
  else
    local arch os tmp
    os="linux"
    case "$(uname -m)" in
      x86_64)  arch="amd64" ;;
      aarch64|arm64) arch="arm64" ;;
      *) die "Unsupported architecture: $(uname -m)" ;;
    esac
    tmp="$(mktemp -d)"

    local fab_url="https://github.com/hyperledger/fabric/releases/download/v${FABRIC_VERSION}/hyperledger-fabric-${os}-${arch}-${FABRIC_VERSION}.tar.gz"
    local ca_url="https://github.com/hyperledger/fabric-ca/releases/download/v${FABRIC_CA_VERSION}/hyperledger-fabric-ca-${os}-${arch}-${FABRIC_CA_VERSION}.tar.gz"

    echo "  downloading $fab_url"
    curl -fsSL "$fab_url" -o "$tmp/fabric.tgz" || die "failed to download Fabric binaries"
    echo "  downloading $ca_url"
    curl -fsSL "$ca_url" -o "$tmp/fabric-ca.tgz" || warn "failed to download fabric-ca binaries (optional)"

    mkdir -p "$REPO_ROOT"
    tar -xzf "$tmp/fabric.tgz" -C "$REPO_ROOT"           # creates ./bin and ./config
    [[ -f "$tmp/fabric-ca.tgz" ]] && tar -xzf "$tmp/fabric-ca.tgz" -C "$REPO_ROOT" || true
    chmod +x "$BIN_DIR"/* 2>/dev/null || true
    rm -rf "$tmp"
    ok "Fabric binaries installed to $BIN_DIR"
  fi

  # Make them available on PATH for the current user's shells.
  local marker="# >>> ConsentMD fabric bin >>>"
  local rc="$HOME/.bashrc"
  if [[ -f "$rc" ]] && ! grep -qF "$marker" "$rc"; then
    {
      echo ""
      echo "$marker"
      echo "export PATH=\"$BIN_DIR:\$PATH\""
      echo "# <<< ConsentMD fabric bin <<<"
    } >> "$rc"
    ok "Added $BIN_DIR to PATH in ~/.bashrc (new shells)"
  fi
  export PATH="$BIN_DIR:$PATH"
}

pull_images() {
  step "Pre-pulling docker images"
  if [[ $SKIP_IMAGES -eq 1 ]]; then warn "skipped (--skip-images)"; return 0; fi
  if ! docker info >/dev/null 2>&1; then warn "docker not reachable — skipping image pull"; return 0; fi

  local images=(
    "hyperledger/fabric-peer:${FABRIC_VERSION}"
    "hyperledger/fabric-orderer:${FABRIC_VERSION}"
    "hyperledger/fabric-tools:${FABRIC_VERSION}"
    "hyperledger/fabric-ca:latest"
    "hyperledger/fabric-nodeenv:2.5"
    "$COUCHDB_IMAGE"
  )
  if [[ $WITH_MONGO -eq 1 ]]; then images+=("$MONGO_IMAGE"); fi

  for img in "${images[@]}"; do
    if docker image inspect "$img" >/dev/null 2>&1; then
      ok "$img (cached)"
    else
      echo "  pulling $img"
      docker pull -q "$img" >/dev/null && ok "$img" || warn "could not pull $img"
    fi
  done
}

# ---------------------------------------------------------------------------
# 5. Go (optional)
# ---------------------------------------------------------------------------
install_go() {
  [[ $WITH_GO -eq 1 ]] || return 0
  step "Go $GO_VERSION"
  if have go && go version | grep -q "go${GO_VERSION%.*}"; then
    ok "$(go version)"; return 0
  fi
  local arch tmp
  case "$(uname -m)" in
    x86_64) arch="amd64" ;;
    aarch64|arm64) arch="arm64" ;;
    *) die "Unsupported architecture for Go: $(uname -m)" ;;
  esac
  tmp="$(mktemp -d)"
  curl -fsSL "https://go.dev/dl/go${GO_VERSION}.linux-${arch}.tar.gz" -o "$tmp/go.tgz" || die "Go download failed"
  $SUDO rm -rf /usr/local/go
  $SUDO tar -C /usr/local -xzf "$tmp/go.tgz"
  rm -rf "$tmp"
  local rc="$HOME/.bashrc"
  grep -qF '/usr/local/go/bin' "$rc" 2>/dev/null || echo 'export PATH="/usr/local/go/bin:$PATH"' >> "$rc"
  export PATH="/usr/local/go/bin:$PATH"
  ok "$(go version)"
}

# ---------------------------------------------------------------------------
# 6. MongoDB (optional, for the API)
# ---------------------------------------------------------------------------
start_mongo() {
  [[ $WITH_MONGO -eq 1 ]] || return 0
  step "Local MongoDB on port $MONGO_PORT"
  if ! docker info >/dev/null 2>&1; then warn "docker not reachable — skipping"; return 0; fi

  if docker ps -a --format '{{.Names}}' | grep -qx consentmd-mongo; then
    docker start consentmd-mongo >/dev/null 2>&1 || true
    ok "container consentmd-mongo running"
  else
    docker run -d --name consentmd-mongo \
      -p "${MONGO_PORT}:27017" \
      -e MONGO_INITDB_ROOT_USERNAME=consentmd \
      -e MONGO_INITDB_ROOT_PASSWORD=consentmd \
      -v consentmd-mongo-data:/data/db \
      --restart unless-stopped \
      "$MONGO_IMAGE" >/dev/null
    ok "Started consentmd-mongo (user/pass: consentmd/consentmd)"
  fi
}

# ---------------------------------------------------------------------------
# 7. .env scaffolding — never overwrites an existing file
# ---------------------------------------------------------------------------
write_env_files() {
  step "Environment files"

  local api_env="$REPO_ROOT/api/.env"
  if [[ -f "$api_env" ]]; then
    ok "api/.env exists (left untouched)"
  else
    local jwt
    jwt="$(openssl rand -hex 32)"
    cat > "$api_env" <<EOF
# Generated by install.sh — fill in the TODO values before starting the API.
# Every key here is validated by api/src/config/config.js (Joi schema);
# a missing key makes the API refuse to boot.
ENV=development
PORT=3000

# Mongo — with ./install.sh --with-mongo this matches the local container.
# NOTE: config.js only skips mongodb+srv when MONGODB_HOST is exactly localhost:${MONGO_PORT}.
MONGODB_URL=mongodb://consentmd:consentmd@localhost:${MONGO_PORT}/consentmd?authSource=admin
MONGODB_USERNAME=consentmd
MONGODB_PASSWORD=consentmd
MONGODB_HOST=localhost:${MONGO_PORT}
MONGODB_NAME=consentmd

# Auth
JWT_SECRET=${jwt}
JWT_ACCESS_EXPIRATION_MINUTES=30
JWT_REFRESH_EXPIRATION_DAYS=30
JWT_RESET_PASSWORD_EXPIRATION_MINUTES=10
JWT_VERIFY_EMAIL_EXPIRATION_MINUTES=10
COMMON_PASSWORD=ChangeMe123!

# Fabric CA bootstrap identity (matches
# blockchain/artifacts/channel/create-certificate-with-ca/docker-compose.yaml)
CA_ADMIN_ID=admin
CA_ADMIN_SECRET=adminpw

# Chaincode / channel (see blockchain/scripts/deployChaincode.sh)
BLOCKCHAIN_CHANNEL_NAME=mychannel
BLOCKCHAIN_CHAINCODE_NAME=medicalconsent

# Set to true only when the API itself runs inside docker (api/docker-compose.yml)
DOCKER_MODE=false

# Off-chain document storage (S3) — TODO: replace with real credentials
AWS_ACCESS_KEY=TODO
AWS_SECRET_ACCESS=TODO
AWS_PRIVATE_BUCKET_NAME=TODO
EOF
    ok "Wrote api/.env (JWT secret generated; AWS_* still TODO)"
  fi

  local client_env="$REPO_ROOT/client/.env.local"
  if [[ -f "$client_env" ]]; then
    ok "client/.env.local exists (left untouched)"
  else
    cat > "$client_env" <<'EOF'
# Generated by install.sh
# Consumed by client/src/services/api.ts (falls back to the hosted API).
REACT_APP_BASE_URLDNS=http://localhost:3000/v1
EOF
    ok "Wrote client/.env.local"
  fi
}

# ---------------------------------------------------------------------------
# 8. npm dependencies
# ---------------------------------------------------------------------------
npm_install_dir() {
  local dir="$1" label="$2"
  [[ -f "$dir/package.json" ]] || { warn "$label: no package.json at $dir — skipping"; return 0; }
  echo "  installing $label deps ($dir)"
  if [[ -f "$dir/package-lock.json" ]]; then
    (cd "$dir" && npm ci --no-audit --no-fund) || \
      (warn "$label: npm ci failed, falling back to npm install" && cd "$dir" && npm install --no-audit --no-fund)
  else
    (cd "$dir" && npm install --no-audit --no-fund)
  fi
  ok "$label deps installed"
}

install_npm_deps() {
  step "npm dependencies"
  if [[ $SKIP_NPM -eq 1 ]]; then warn "skipped (--skip-npm)"; return 0; fi
  have npm || { warn "npm not available — skipping"; return 0; }

  npm_install_dir "$REPO_ROOT/api"                                        "API"
  npm_install_dir "$REPO_ROOT/client"                                     "Client (Next.js)"
  npm_install_dir "$REPO_ROOT/blockchain/artifacts/chaincode/javascript"  "Chaincode"
  npm_install_dir "$REPO_ROOT/blockchain/caliper/caliper-benchmarks-local" "Caliper workspace"
}

# ---------------------------------------------------------------------------
# 9. Make repo scripts executable + verify
# ---------------------------------------------------------------------------
# Make shell scripts executable — WITHOUT touching tracked files.
#
# This used to `chmod +x` every *.sh under blockchain/, including git-tracked
# ones whose index mode is 100644. That produced permanent phantom
# "modified: ...run-benchmarks.sh" entries in `git status` that contained zero
# content changes (mode 100644 => 100755) and reappeared on every install.
#
# The correct fix for a tracked file is to change the mode *in the index*, once,
# and commit it. We detect that case and print the command rather than silently
# dirtying the working tree.
fix_permissions() {
  step "Script permissions"

  local tracked_needing_chmod=()
  if command -v git >/dev/null 2>&1 && git -C "$REPO_ROOT" rev-parse --git-dir >/dev/null 2>&1; then
    # `git ls-files -s` prints: <mode> <object> <stage>\t<path>
    while IFS= read -r line; do
      [[ "$line" =~ ^100644[[:space:]] ]] || continue
      local path="${line#*$'\t'}"
      [[ -f "$REPO_ROOT/$path" ]] && tracked_needing_chmod+=("$path")
    done < <(git -C "$REPO_ROOT" ls-files -s -- '*.sh' 2>/dev/null || true)
  fi

  # Only ever chmod files git does not track.
  local untracked_count=0
  while IFS= read -r f; do
    [[ -n "$f" ]] || continue
    chmod +x "$REPO_ROOT/$f" 2>/dev/null && untracked_count=$((untracked_count + 1))
  done < <(
    if git -C "$REPO_ROOT" rev-parse --git-dir >/dev/null 2>&1; then
      git -C "$REPO_ROOT" ls-files --others --exclude-standard -- '*.sh' 2>/dev/null || true
    fi
  )

  # install.sh itself is tracked once committed; guard the same way.
  [[ -x "$REPO_ROOT/install.sh" ]] || chmod +x "$REPO_ROOT/install.sh" 2>/dev/null || true

  ok "marked $untracked_count untracked shell script(s) executable"

  if ((${#tracked_needing_chmod[@]})); then
    warn "${#tracked_needing_chmod[@]} tracked shell script(s) have index mode 100644."
    warn "Fix the index once (this is a real commit, not a working-tree change):"
    printf '    git update-index --chmod=+x %s\n' "${tracked_needing_chmod[@]}" >&2
  fi
}

# Extract the first dotted version number from a command's output.
extract_version() { "$@" 2>&1 | grep -oE '[0-9]+\.[0-9]+(\.[0-9]+)?' | head -1; }

# True when $1 >= $2 (semver-ish, via sort -V).
version_ge() { [[ "$(printf '%s\n%s\n' "$2" "$1" | sort -V | head -1)" == "$2" ]]; }

VERIFY_FAILED=0
check_version() {
  local name="$1" min="$2"; shift 2
  local found
  if ! command -v "$1" >/dev/null 2>&1 && [[ ! -x "$1" ]]; then
    warn "$name — NOT INSTALLED (need >= $min)"; VERIFY_FAILED=$((VERIFY_FAILED+1)); return
  fi
  found="$(extract_version "$@")"
  if [[ -z "$found" ]]; then
    warn "$name — installed, version not detected (need >= $min)"; return
  fi
  if version_ge "$found" "$min"; then
    ok "$name $found (>= $min)"
  else
    warn "$name $found is BELOW the required $min"; VERIFY_FAILED=$((VERIFY_FAILED+1))
  fi
}

check_present() {
  local name="$1"; shift
  if "$@" >/dev/null 2>&1; then ok "$name"; else warn "$name — MISSING"; VERIFY_FAILED=$((VERIFY_FAILED+1)); fi
}

verify() {
  step "Verification (tool versions vs. required floors)"
  VERIFY_FAILED=0

  check_version "docker"          "$DOCKER_MIN"  docker --version
  check_present "docker daemon"   docker info
  check_version "docker compose"  "$COMPOSE_MIN" docker compose version
  check_version "node"            "$NODE_MIN"    node --version
  check_version "npm"             "$NPM_MIN"     npm --version
  check_version "git"             "$GIT_MIN"     git --version
  check_present "jq"              jq --version
  check_present "curl"            curl --version
  check_present "openssl"         openssl version
  check_version "peer"            "$FABRIC_VERSION"    "$BIN_DIR/peer" version
  check_version "configtxgen"     "$FABRIC_VERSION"    "$BIN_DIR/configtxgen" --version
  check_version "cryptogen"       "$FABRIC_VERSION"    "$BIN_DIR/cryptogen" version
  check_present "osnadmin"        "$BIN_DIR/osnadmin" --help  # no `version` subcommand
  check_version "fabric-ca-client" "$FABRIC_CA_VERSION" "$BIN_DIR/fabric-ca-client" version
  if [[ $WITH_GO -eq 1 ]]; then check_version "go" "$GO_MIN" go version; fi

  # Node major must be exactly what the app stack was tested against.
  if have node; then
    local nmaj; nmaj="$(node -v | sed 's/^v//;s/\..*//')"
    if [[ "$nmaj" != "$NODE_VERSION" ]]; then
      warn "Node major is $nmaj, but this repo is tested on ${NODE_TESTED} (Node ${NODE_VERSION}). Mongoose 5.13 in api/ and Caliper 0.6 are only validated there."
    fi
  fi

  if [[ -f "$REPO_ROOT/api/.env" ]]; then ok "api/.env"; else warn "api/.env — MISSING"; fi

  if [[ $VERIFY_FAILED -gt 0 ]]; then
    warn "$VERIFY_FAILED check(s) failed — see the messages above."
  else
    ok "all checks passed"
  fi
}

print_versions() {
  local fmt="%-17s %-10s %s\n"
  echo "ConsentMD required tool versions"
  echo "================================"
  printf "$fmt" "Tool" "Minimum" "Installed / pinned by this script"
  printf "$fmt" "-----------------" "----------" "---------------------------------"
  printf "$fmt" "Node.js"        "$NODE_MIN"        "$NODE_TESTED (NodeSource ${NODE_VERSION}.x)"
  printf "$fmt" "npm"            "$NPM_MIN"         "10.8.2 (bundled with Node ${NODE_VERSION})"
  printf "$fmt" "Docker Engine"  "$DOCKER_MIN"      "latest stable from docker.com"
  printf "$fmt" "Docker Compose" "$COMPOSE_MIN"     "v2 plugin (+ docker-compose shim)"
  printf "$fmt" "Git"            "$GIT_MIN"         "distro package"
  printf "$fmt" "Fabric binaries" "$FABRIC_VERSION" "$FABRIC_VERSION (peer, orderer, configtxgen, osnadmin, cryptogen)"
  printf "$fmt" "Fabric CA"      "$FABRIC_CA_VERSION" "$FABRIC_CA_VERSION (fabric-ca-client)"
  printf "$fmt" "CouchDB"        "3.1.1"            "$COUCHDB_IMAGE (container)"
  printf "$fmt" "Go (optional)"  "$GO_MIN"          "$GO_VERSION  — only with --with-go"
  printf "$fmt" "MongoDB"        "5.0"              "$MONGO_IMAGE on port $MONGO_PORT — only with --with-mongo"
  printf "$fmt" "Python 3"       "3.8"              "distro package (node-gyp)"
  printf "$fmt" "jq"             "1.6"              "distro package"
  printf "$fmt" "OpenSSL"        "1.1.1"            "distro package"
  cat <<EOF

Docker images pulled:
  hyperledger/fabric-peer:$FABRIC_VERSION
  hyperledger/fabric-orderer:$FABRIC_VERSION
  hyperledger/fabric-tools:$FABRIC_VERSION
  hyperledger/fabric-ca:latest      (artifacts compose uses the untagged image)
  hyperledger/fabric-nodeenv:2.5    (JS chaincode runtime)
  $COUCHDB_IMAGE
EOF
}

summary() {
  local headline
  if [[ ${VERIFY_FAILED:-0} -gt 0 ]]; then
    headline="$(echo -e "${C_YELLOW}ConsentMD environment set up with ${VERIFY_FAILED} unmet requirement(s) — see above.${C_RESET}")"
  else
    headline="$(echo -e "${C_GREEN}ConsentMD environment ready.${C_RESET}")"
  fi
  cat <<EOF

$headline

Next steps:
  1. Open a NEW shell (picks up the docker group and the Fabric bin PATH),
     or run:  newgrp docker && export PATH="$BIN_DIR:\$PATH"
  2. Fill in the TODO values in api/.env (AWS S3 credentials, Mongo URL if remote).
  3. Bring up the Fabric network:
       cd blockchain/scripts && ./start.sh
     (start.sh runs createChannel.sh and deployChaincode.sh for you)
  4. Run the services:
       cd api    && npm run dev     # http://localhost:3000
       cd client && npm run dev     # http://localhost:3000 (Next dev server)
  5. Benchmarks:
       cd blockchain/caliper/caliper-benchmarks-local
       ./verify-setup.sh && ./run-single-benchmark.sh consent-granting

Tear down:  cd blockchain/scripts && ./stop.sh
EOF
}

# ---------------------------------------------------------------------------
main() {
  if [[ $PRINT_VERSIONS -eq 1 ]]; then print_versions; exit 0; fi
  echo -e "${C_BLUE}ConsentMD installer${C_RESET} — Node $NODE_TESTED, Fabric $FABRIC_VERSION"
  preflight
  install_base_packages
  install_docker
  install_node
  install_fabric
  install_go
  pull_images
  start_mongo
  write_env_files
  install_npm_deps
  fix_permissions
  verify
  summary
}

main "$@"
