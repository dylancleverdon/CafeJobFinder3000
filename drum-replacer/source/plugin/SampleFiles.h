// Reading the user's audio files, and packing samples into the plugin's saved
// state (FLAC) so an Ableton project keeps working even if the files move.
#pragma once

#include "dsp/Kit.h"

#include <juce_audio_formats/juce_audio_formats.h>

#include <optional>

namespace SampleFiles
{
// Reads up to 10 s of a WAV/AIFF/FLAC/OGG/MP3 file, trims the silence before the attack.
std::optional<dr::Sample> read (const juce::File& file, juce::AudioFormatManager& formats);

// Compressed copy of the audio for saving. `gain` receives the factor to multiply by
// when decoding (set when the audio is louder than 0 dBFS and had to be scaled down).
juce::MemoryBlock encode (const dr::Sample& sample, float& gain);

std::optional<dr::Sample> decode (const juce::MemoryBlock& data, float gain, juce::AudioFormatManager& formats);
} // namespace SampleFiles
