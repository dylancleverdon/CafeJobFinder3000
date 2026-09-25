#!/bin/bash
# Drum Replacer for Mac: installs the plugin (VST3 + AU) and keeps it up to date.
#
#   Install (paste into Terminal):
#     curl -fsSL https://github.com/dylancleverdon/CafeJobFinder3000/releases/download/drum-replacer/drum-replacer-mac.sh | bash
#
#   The installer sets up a small background job that runs this script with "update"
#   every 10 minutes: when there's a newer build on GitHub it's installed automatically.
#   Uninstall:  bash "$HOME/Library/Application Support/Drum Replacer/update.sh" uninstall

BASE="https://github.com/dylancleverdon/CafeJobFinder3000/releases/download/drum-replacer"
SUPPORT="$HOME/Library/Application Support/Drum Replacer"
PLUGINS="$HOME/Library/Audio/Plug-Ins"
AGENT_ID="io.github.dylancleverdon.drumreplacer.updater"
AGENT="$HOME/Library/LaunchAgents/$AGENT_ID.plist"

# Everything is inside main so that "curl ... | bash" reads the whole script before running it.
main() {
    local mode="${1:-install}"
    mkdir -p "$SUPPORT"

    case "$mode" in
        install) install_or_update install ;;
        update) install_or_update update ;;
        uninstall) uninstall ;;
        *) echo "Usage: $0 [install|update|uninstall]"; exit 1 ;;
    esac
}

log() {
    echo "$(date '+%Y-%m-%d %H:%M:%S') $*" >> "$SUPPORT/update.log"
    [ "$MODE" = install ] && echo "$*"
    return 0
}

# True if version $1 is newer than version $2.
newer() {
    [ "$1" != "$2" ] && [ "$(printf '%s\n%s\n' "$1" "$2" | sort -t. -k1,1n -k2,2n -k3,3n | tail -n1)" = "$1" ]
}

install_or_update() {
    MODE="$1"
    local installed latest
    installed="$(cat "$SUPPORT/installed-version.txt" 2> /dev/null || echo 0.0.0)"

    if ! latest="$(curl -fsSL --retry 2 "$BASE/version.txt" | tr -d '[:space:]')" || [ -z "$latest" ]; then
        log "Couldn't reach GitHub to check for updates."
        [ "$MODE" = install ] && exit 1
        exit 0
    fi

    if [ "$MODE" = install ] || newer "$latest" "$installed"; then
        tmp="$(mktemp -d)" # global, so the cleanup below still sees it
        trap 'rm -rf "$tmp"' EXIT
        log "Downloading Drum Replacer $latest..."
        if ! curl -fsSL --retry 2 "$BASE/DrumReplacer-Mac.zip" -o "$tmp/plugin.zip" \
            || ! ditto -x -k "$tmp/plugin.zip" "$tmp/files"; then
            log "Download failed, will try again later."
            exit 1
        fi

        mkdir -p "$PLUGINS/VST3" "$PLUGINS/Components"
        replace "$tmp/files/Drum Replacer.vst3" "$PLUGINS/VST3/Drum Replacer.vst3"
        replace "$tmp/files/Drum Replacer.component" "$PLUGINS/Components/Drum Replacer.component"

        # Update the updater too (write a new file, then swap it in, so this running copy isn't disturbed).
        cp "$tmp/files/drum-replacer-mac.sh" "$SUPPORT/update.sh.new" && mv -f "$SUPPORT/update.sh.new" "$SUPPORT/update.sh"
        chmod +x "$SUPPORT/update.sh"

        echo "$latest" > "$SUPPORT/installed-version.txt"
        log "Installed Drum Replacer $latest."
    fi

    if [ "$MODE" = install ]; then
        cat > "$AGENT" << PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>$AGENT_ID</string>
    <key>ProgramArguments</key>
    <array>
        <string>/bin/bash</string>
        <string>$SUPPORT/update.sh</string>
        <string>update</string>
    </array>
    <key>RunAtLoad</key>
    <true/>
    <key>StartInterval</key>
    <integer>600</integer>
    <key>ProcessType</key>
    <string>Background</string>
</dict>
</plist>
PLIST
        launchctl bootout "gui/$(id -u)" "$AGENT" 2> /dev/null || true
        launchctl bootstrap "gui/$(id -u)" "$AGENT" 2> /dev/null || launchctl load -w "$AGENT" 2> /dev/null || true

        echo ""
        echo "Done! Drum Replacer is installed and will keep itself up to date."
        echo "In Ableton: Settings (or Preferences) > Plug-Ins > turn on 'Use VST3 Plug-in System Folders' (or Audio Units),"
        echo "click Rescan, then search the browser for Drum Replacer."
        echo "(macOS may say a background item was added: that's the updater.)"
    fi
}

# Swaps in a new plugin bundle. Safe while Ableton is open: it keeps using the old copy until it's reopened.
replace() {
    local from="$1" to="$2"
    [ -d "$from" ] || return 0
    rm -rf "$to.new" "$to.old"
    ditto "$from" "$to.new"
    xattr -dr com.apple.quarantine "$to.new" 2> /dev/null || true
    [ -d "$to" ] && mv "$to" "$to.old"
    mv "$to.new" "$to"
    rm -rf "$to.old"
}

uninstall() {
    MODE=install
    launchctl bootout "gui/$(id -u)" "$AGENT" 2> /dev/null || launchctl unload "$AGENT" 2> /dev/null || true
    rm -f "$AGENT"
    rm -rf "$PLUGINS/VST3/Drum Replacer.vst3" "$PLUGINS/Components/Drum Replacer.component" "$SUPPORT"
    echo "Drum Replacer and its updater are removed."
}

main "$@"
