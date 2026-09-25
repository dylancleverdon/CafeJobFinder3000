#include "Kit.h"

#include <algorithm>
#include <cmath>

namespace dr
{

void updatePeak (Sample& s)
{
    float peak = 0.0f;
    for (auto& ch : s.channels)
        for (float v : ch)
            peak = std::max (peak, std::abs (v));
    s.peak = peak;
}

void prepareOneShot (Sample& s, double maxSeconds)
{
    updatePeak (s);
    const auto len = s.length();
    if (len == 0 || s.peak <= 0.0f)
        return;

    // Start at the first sample that reaches 1% (-40 dB) of the peak.
    const float gate = s.peak * 0.01f;
    std::size_t start = len;
    for (auto& ch : s.channels)
        for (std::size_t i = 0; i < std::min (start, ch.size()); ++i)
            if (std::abs (ch[i]) >= gate)
            {
                start = i;
                break;
            }

    const auto maxLen = (std::size_t) std::max (1.0, maxSeconds * s.sampleRate);
    const auto end = std::min (len, start + maxLen);
    const bool truncated = end < len;

    for (auto& ch : s.channels)
    {
        ch.erase (ch.begin() + (std::ptrdiff_t) end, ch.end());
        ch.erase (ch.begin(), ch.begin() + (std::ptrdiff_t) start);
    }

    if (truncated)
    {
        const auto fade = std::min (s.length(), (std::size_t) (0.005 * s.sampleRate) + 1);
        for (auto& ch : s.channels)
            for (std::size_t i = 0; i < fade; ++i)
                ch[ch.size() - 1 - i] *= (float) i / (float) fade;
    }

    updatePeak (s);
}

KitPtr makeUserKit (std::vector<Sample> samples, std::string name)
{
    samples.erase (std::remove_if (samples.begin(), samples.end(),
                                   [] (const Sample& s) { return s.length() == 0 || s.peak <= 0.0f; }),
                   samples.end());

    std::stable_sort (samples.begin(), samples.end(),
                      [] (const Sample& a, const Sample& b) { return a.peak < b.peak; });

    float loudest = 0.0f;
    for (auto& s : samples)
        loudest = std::max (loudest, s.peak);

    auto kit = std::make_shared<Kit>();
    kit->name = std::move (name);
    kit->userSamples = true;

    for (auto& s : samples)
    {
        s.layerGain = std::min (loudest / s.peak, 16.0f); // at most +24 dB
        kit->layers.push_back ({ { std::make_shared<const Sample> (std::move (s)) } });
    }

    return kit;
}

} // namespace dr
