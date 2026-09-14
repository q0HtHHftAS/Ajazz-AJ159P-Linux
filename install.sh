#!/usr/bin/env bash
# AJAZZ AJ159P — Ubuntu installer (builds from source).
set -euo pipefail

APP_NAME="ajazz-aj159p"
UDEV_RULES="/etc/udev/rules.d/70-${APP_NAME}.rules"

# --- helpers -----------------------------------------------------------

color() { printf '\033[%sm%s\033[0m\n' "$1" "$2"; }
green() { color 32 "$*"; }
yellow() { color 33 "$*"; }
red() { color 31 "$*"; }

usage() {
	echo "Usage: install.sh [--uninstall]"
	echo "  (no args)     install ${APP_NAME} (udev rules, deps, build, desktop entry)"
	echo "  --uninstall   remove ${APP_NAME} (binary, desktop entry, icon, udev rules)"
}

# --- uninstall ---------------------------------------------------------

uninstall() {
	green "Uninstalling ${APP_NAME} …"
	rm -f "${HOME}/.local/bin/${APP_NAME}"
	rm -f "${HOME}/.local/share/applications/${APP_NAME}.desktop"
	rm -f "${HOME}/.local/share/icons/hicolor/256x256/apps/${APP_NAME}.png"
	sudo rm -f "$UDEV_RULES"
	sudo udevadm control --reload-rules
	sudo udevadm trigger
	# .deb installs (if the user took that path)
	if dpkg -s "$APP_NAME" &>/dev/null 2>&1; then
		sudo dpkg -r "$APP_NAME"
	fi
	green "Done."
}

# --- udev rules --------------------------------------------------------

write_udev() {
	if [ -f "$UDEV_RULES" ]; then
		green "Udev rules already present, skipping."
		return
	fi
	yellow "Setting up udev rules (requires sudo) …"
	sudo tee "$UDEV_RULES" >/dev/null <<'UDEV'
SUBSYSTEM=="hidraw", KERNEL=="hidraw*", ATTRS{idVendor}=="249a", ATTRS{idProduct}=="5c2f", MODE="0660", TAG+="uaccess"
UDEV
	sudo udevadm control --reload-rules
	sudo udevadm trigger
	# The device must be re-plugged (or the new rule triggered) to take effect.
	sudo udevadm trigger --subsystem-match=hidraw
}

# --- deps --------------------------------------------------------------

install_bun() {
	if command -v bun &>/dev/null; then return; fi
	yellow "Installing Bun …"
	curl -fsSL https://bun.sh/install | bash
	# shellcheck disable=SC2016
	echo 'export BUN_INSTALL="$HOME/.bun"' >> "$HOME/.bashrc"
	echo 'export PATH="$BUN_INSTALL/bin:$PATH"' >> "$HOME/.bashrc"
	export BUN_INSTALL="$HOME/.bun"
	export PATH="$BUN_INSTALL/bin:$PATH"
}

ensure_deps() {
	# No native modules: the driver talks to /dev/hidraw via plain file I/O,
	# so only Bun is required (installed above).
	yellow "Checking system dependencies … (none required besides Bun)"
}

# --- build from source -------------------------------------------------

build_from_source() {
	# Build from the local checkout (this script lives in the repo root).
	local src_dir
	src_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
	cd "$src_dir"

	yellow "Installing JS dependencies …"
	bun install 2>&1 | tail -1

	yellow "Building (this will take a minute) …"
	bun run package 2>&1

	# install the .deb when the builder produced one, else the AppImage
	local deb
	deb=$(ls dist/*.deb 2>/dev/null | head -1)
	if [ -n "$deb" ]; then
		yellow "Installing .deb …"
		sudo dpkg -i "$deb" 2>/dev/null || sudo apt install -f -y
		return
	fi

	local appimage
	appimage=$(ls dist/*.AppImage 2>/dev/null | head -1)
	if [ -z "$appimage" ]; then
		red "Build output not found in dist/"
		exit 1
	fi

	local bin_dir="${HOME}/.local/bin"
	local desktop_dir="${HOME}/.local/share/applications"
	local icon_dir="${HOME}/.local/share/icons/hicolor/256x256/apps"
	mkdir -p "$bin_dir" "$desktop_dir" "$icon_dir"

	cp "$appimage" "${bin_dir}/${APP_NAME}"
	chmod +x "${bin_dir}/${APP_NAME}"

	# icon — matches Icon=ajazz-aj159p in the .desktop entry
	cp assets/ajazz-aj159p.png "${icon_dir}/${APP_NAME}.png" 2>/dev/null || true

	cat >"${desktop_dir}/${APP_NAME}.desktop" <<EOF
[Desktop Entry]
Name=AJAZZ AJ159P
Comment=Configuration tool for the AJAZZ AJ159P gaming mouse
Exec=${bin_dir}/${APP_NAME}
Icon=${APP_NAME}
Terminal=false
Type=Application
Categories=HardwareSettings;Settings;
Keywords=mouse;gaming;driver;
EOF

	if ! echo "$PATH" | tr ':' '\n' | grep -qxF "$bin_dir"; then
		yellow "Tip: add ~/.local/bin to your PATH:"
		echo "  export PATH=\"\$HOME/.local/bin:\$PATH\"  # >> ~/.bashrc"
	fi

	green "Installed to ${bin_dir}/${APP_NAME}"
}

# --- main --------------------------------------------------------------

main() {
	if [ "${1:-}" = "--uninstall" ]; then
		uninstall
		return
	fi
	if [ "${1:-}" = "--help" ] || [ "${1:-}" = "-h" ]; then
		usage
		return
	fi
	green "=== AJAZZ AJ159P Installer ==="
	echo "   building from source"
	echo

	write_udev
	install_bun
	ensure_deps
	build_from_source

	echo
	green "Done. Launch 'AJAZZ AJ159P' from your app menu or run: ${APP_NAME}"
	green "If the mouse is not detected, unplug it and plug it back in once (udev)."
}

main "$@"
