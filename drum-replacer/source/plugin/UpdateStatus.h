// What the background updater has done, so the plugin can say "update ready".
// The updater (packaging/drum-replacer-*.{sh,ps1}) writes these files:
//   installed-version.txt  the newest version installed on disk
//   pending-version.txt    downloaded, waiting for Ableton to close (Windows only)
#pragma once

#include <juce_core/juce_core.h>

struct UpdateStatus
{
    juce::String running = DR_VERSION; // this copy of the plugin
    juce::String installed, pending;

    static juce::File folder();
    static UpdateStatus read();
    static bool isNewer (const juce::String& a, const juce::String& b); // a > b

    // A short note for the plugin window, or empty when there's nothing to say.
    juce::String message() const;
};
