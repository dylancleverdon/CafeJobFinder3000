# 🥁 Drum Replacer (Ableton plugin)

A drum replacer in the style of XLN Audio's Addictive Trigger. Put it on a drum track: it finds every hit and plays a new sound exactly on it, as soft or as hard as the original hit. Keep the original, replace it, or blend the two.

Works in Ableton Live on **Windows (VST3)** and **Mac (VST3 and Audio Unit, Intel and Apple Silicon)**.

## Install (once)

**Mac:** open **Terminal**, paste this line and press Return:

```
curl -fsSL https://github.com/dylancleverdon/CafeJobFinder3000/releases/download/drum-replacer/drum-replacer-mac.sh | bash
```

**Windows:** right-click the **Start** button, choose **Terminal (Admin)**, paste this line and press Enter:

```
irm https://github.com/dylancleverdon/CafeJobFinder3000/releases/download/drum-replacer/drum-replacer-windows.ps1 | iex
```

Then in Ableton, open **Settings** (called *Preferences* in older versions) > **Plug-Ins**, turn on **Use VST3 Plug-in System Folders** (on Mac you can also use **Audio Units**) and click **Rescan**. Then type "Drum Replacer" in Ableton's browser search box and drag it onto a drum track.

## Updates happen by themselves

The installer also sets up a small background updater. Every 10 minutes it checks GitHub for a newer build, and when there is one it installs it for you. There's nothing to re-download.

- **Mac:** the update installs right away. Close and reopen Ableton to start using it.
- **Windows:** the update downloads right away and installs once Ableton is closed (Windows won't swap a plugin that's in use).

The plugin shows its version at the top of its window, and an orange note when a newer version is waiting ("installed: reopen Ableton" or "installs once you close Ableton"). Your settings and samples are saved inside your Ableton projects, so updates never touch them.

Every time Claude changes the plugin, GitHub builds and tests it (about 15 minutes) and publishes it for the updater.

## How to use it

1. **Put it on the drum track** you want to replace, e.g. the kick mic. (One Drum Replacer per drum.)
2. **Play the track.** The big display shows the level and puts an orange dot on every hit it detects. Taller dots mean harder hits.
3. **Drag the orange threshold line** so it sits above the quiet bits and bleed, but below every real hit.
4. **Focus it on your drum** if other drums leak in:
   - Kick track: turn **High cut** down to about **100 Hz**.
   - Snare track: turn **Low cut** up to about **150–250 Hz**.
   - Press **Listen** to hear what the detector hears while you adjust. Turn it off again afterwards.
5. **Pick the new sound:** choose a built-in sound, or **drag audio files** (WAV, AIFF, FLAC, OGG, MP3) onto the plugin window, or click **Load...**. Drop several files of one drum at once: with **Velocity layers** the softer files play for softer hits; with **Round robin** they take turns so repeats sound natural.
6. **Blend:** **Replacement** is the new sound's level. **Original** is your drum's level. Turn Original up to layer the two. If they sound "phasey" together, nudge **Timing** a little.

### The controls

| Control | What it does |
|---|---|
| **Threshold** | Only peaks louder than this count as hits (same as dragging the orange line). |
| **Sensitivity** | How easily a hit is noticed while the drum is still ringing from the last one. Turn it up if fast hits (rolls, flams) are missed, down if you get extra hits. |
| **Retrigger** | The shortest time between two hits. Raise it if one hit sometimes triggers twice. |
| **Low cut / High cut** | The detector ignores sound below / above these. Doesn't change what you hear. |
| **Listen** | Hear what the detector hears. |
| **Pitch** | Tune the new sound up or down (semitones). |
| **Decay** | Shorten the new sound's tail. |
| **Dynamics** | 100% = soft hits stay soft and hard hits hard, like the original. 0% = every hit equally loud. |
| **Choke** | Each hit cuts off the previous one's tail. |
| **Original / Replacement** | The two levels you hear. Original "Off" = fully replaced. |
| **Timing** | Moves the new sound up to 5 ms earlier or later. |
| **MIDI note** | Every hit is also sent out as a MIDI note, with its velocity. To use it, create a MIDI track (e.g. with a Drum Rack), set its **MIDI From** to your drum track, and choose **Drum Replacer**. |
| **Loudest hit / Reset** | Hits are measured against the loudest one so far. Click Reset after changing tracks or filters. |

The plugin adds about 12 ms of delay so it can line the new sound up exactly. Ableton makes up for this automatically, so everything stays in time.

## Uninstall

- **Mac** (Terminal): `bash "$HOME/Library/Application Support/Drum Replacer/update.sh" uninstall`
- **Windows** (Terminal (Admin)): `& "C:\Program Files\Drum Replacer\update.ps1" uninstall`

---

## For developers

The code is plain C++ with [JUCE](https://juce.com) 8 (downloaded automatically by CMake).

```bash
cmake -S drum-replacer -B build -DCMAKE_BUILD_TYPE=Release -DDR_BUILD_CHECK=ON
cmake --build build
./build/drum_replacer_tests                                        # engine tests (no JUCE needed: -DDR_BUILD_PLUGIN=OFF)
xvfb-run -a ./build/DrumReplacerCheck_artefacts/Release/DrumReplacerCheck shot.png   # plugin check + screenshot
```

- `source/dsp/`: the engine, with no plugin framework. `Detector.h` finds hits (band-limited level, a jump over the last few ms, then an energy check). `Engine.cpp` delays the original by the latency, measures each hit and starts a sample voice exactly on its onset. `DrumSynth.cpp` synthesises the built-in sounds.
- `source/plugin/`: the JUCE plugin (parameters, saving samples as FLAC inside the project, the window).
- `packaging/`: the installer/updater scripts and the READ ME files that go in the zips.
- `.github/workflows/drum-replacer.yml`: builds Windows and Mac, runs the tests, [pluginval](https://github.com/Tracktion/pluginval) and auval, then updates the `drum-replacer` release, which the updaters watch. The version is `1.0.<build number>`.

**Never rename parameter IDs** (`source/plugin/PluginProcessor.h`) or change the plugin codes / bundle ID in `CMakeLists.txt`. Ableton projects refer to them.

JUCE is used under its AGPLv3 open-source licence.
