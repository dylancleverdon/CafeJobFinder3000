// A "kit" is the set of samples that replaces one drum.
//
// Samples are grouped into velocity layers (soft -> loud). Each layer can hold
// several variations that are cycled round-robin so repeated hits don't sound
// like a machine gun. This file has no JUCE dependency so the engine can be
// tested on its own.
#pragma once

#include <memory>
#include <string>
#include <vector>

namespace dr
{

struct Sample
{
    std::string name;
    double sampleRate = 48000.0;
    std::vector<std::vector<float>> channels; // 1 (mono) or 2 (stereo), equal lengths
    float peak = 0.0f;                        // linear peak over all channels
    float layerGain = 1.0f;                   // evens out loudness between velocity layers

    std::size_t length() const { return channels.empty() ? 0 : channels.front().size(); }
    int numChannels() const { return (int) channels.size(); }
};

using SamplePtr = std::shared_ptr<const Sample>;

struct Layer
{
    std::vector<SamplePtr> variations;
};

struct Kit
{
    std::string name;
    std::vector<Layer> layers; // softest first
    bool userSamples = false;  // true when the samples came from the user's own files

    bool empty() const
    {
        for (auto& l : layers)
            if (! l.variations.empty())
                return false;
        return true;
    }

    std::size_t numSamples() const
    {
        std::size_t n = 0;
        for (auto& l : layers)
            n += l.variations.size();
        return n;
    }
};

using KitPtr = std::shared_ptr<const Kit>;

// Recomputes `peak` from the audio.
void updatePeak (Sample& s);

// Drops the silence before the attack so the new sound starts exactly on the hit,
// limits the length to maxSeconds (with a short fade) and updates the peak.
void prepareOneShot (Sample& s, double maxSeconds = 10.0);

// Builds a kit from the user's files: each file becomes one velocity layer,
// sorted quiet -> loud, with layerGain set so every layer plays at the same
// loudness (the Dynamics control then decides how loud each hit is).
KitPtr makeUserKit (std::vector<Sample> samples, std::string name);

} // namespace dr
