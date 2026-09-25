// Finds drum hits in an audio signal.
//
// The signal is band-limited (Low cut / High cut) so the detector can focus on
// one drum, e.g. only the lows of a kick mic. A hit is found in two steps:
//
//  1. The level is over the threshold AND has jumped, within 3 ms, above the
//     loudest level of the moments before by the amount set with Sensitivity.
//     That catches fast repeated hits (each one jumps above the previous hit's
//     ring), while a ringing drum, which only gets quieter, never retriggers.
//     Real attacks rise within a few ms; slow swells (two overlapping tails
//     "beating" together) don't.
//  2. Confirmation: over the next 4 ms the signal must carry more energy (by the
//     same amount) than the ~20 ms before it. A real hit easily does; a random
//     peak in a noisy tail (snare wires, claps, reverb) doesn't.
//
// After a hit, the detector waits `retrigger` ms before it can fire again.
//
// Each hit is reported a few ms after it starts, once its peak level (used for
// velocity) has been measured. The reported onset is walked back to where the
// level started to rise, so the new sample lines up with the real start.
#pragma once

#include <algorithm>
#include <cmath>
#include <cstdint>
#include <vector>

namespace dr
{

// Topology-preserving state variable filter (Zavalishin), 12 dB/oct.
struct Svf
{
    void setCutoff (double cutoffHz, double sampleRate, double q = 0.7071)
    {
        const double fc = std::clamp (cutoffHz, 1.0, sampleRate * 0.45);
        const double g = std::tan (3.14159265358979323846 * fc / sampleRate);
        k = (float) (1.0 / q);
        a1 = (float) (1.0 / (1.0 + g * (g + k)));
        a2 = (float) g * a1;
        a3 = (float) g * a2;
    }

    void reset() { ic1 = ic2 = 0.0f; }

    float lowpass (float v0) noexcept
    {
        float lp, hp;
        tick (v0, lp, hp);
        return lp;
    }

    float highpass (float v0) noexcept
    {
        float lp, hp;
        tick (v0, lp, hp);
        return hp;
    }

private:
    void tick (float v0, float& lp, float& hp) noexcept
    {
        const float v3 = v0 - ic2;
        const float v1 = a1 * ic1 + a2 * v3;
        const float v2 = ic2 + a2 * ic1 + a3 * v3;
        ic1 = 2.0f * v1 - ic1;
        ic2 = 2.0f * v2 - ic2;
        lp = v2;
        hp = v0 - k * v1 - v2;
    }

    float k = 1.4142f, a1 = 0, a2 = 0, a3 = 0;
    float ic1 = 0, ic2 = 0;
};

struct DetectorSettings
{
    float thresholdDb = -30.0f; // dBFS of the filtered signal
    float sensitivity = 0.6f;   // 0..1, higher catches hits that ride on a ringing drum
    float retriggerMs = 50.0f;  // shortest time between two hits
    float lowCutHz = 20.0f;     // 20 = off
    float highCutHz = 20000.0f; // 20000 = off
};

struct Hit
{
    std::int64_t onset = 0;    // input sample where the hit starts
    std::int64_t crossing = 0; // input sample where it was detected
    float peak = 0.0f;         // linear peak of the hit itself (the earlier ring is taken out)
};

inline float dbToGain (float db) { return std::pow (10.0f, db * 0.05f); }
inline float gainToDb (float g) { return g > 1.0e-6f ? 20.0f * std::log10 (g) : -120.0f; }

class Detector
{
public:
    static constexpr double peakWindowMs = 4.0;   // time used to measure a hit's peak
    static constexpr double maxBacktrackMs = 3.0; // how far the onset may move earlier
    static constexpr double lookBackMs = 3.0;     // a hit must jump above the level this long ago
    static constexpr double rmsMs = 0.5;          // averaging time of `level`

    // Low cut / High cut at their end stops mean "off".
    static constexpr float lowCutOffHz = 20.5f;
    static constexpr float highCutOffHz = 19500.0f;

    static float sensitivityToRatioDb (float sensitivity)
    {
        const float s = std::clamp (sensitivity, 0.0f, 1.0f);
        return 1.0f + 11.0f * (1.0f - s) * (1.0f - s); // 12 dB .. 1 dB
    }

    void prepare (double sampleRate)
    {
        sr = sampleRate;
        window = std::max (1, (int) std::lround (peakWindowMs * 0.001 * sr));
        backtrack = std::max (1, (int) std::lround (maxBacktrackMs * 0.001 * sr));
        lookBack = std::max (1, (int) std::lround (lookBackMs * 0.001 * sr));

        std::size_t size = 1;
        holdSamples = (int) std::lround (0.013 * sr);
        while (size < (std::size_t) (std::max (lookBack, window + backtrack + holdSamples) + 4))
            size <<= 1;
        history.assign (size, 0.0f);
        levelHistory.assign (size, 0.0f);
        energyHistory.assign (size, 0.0f);
        mask = (std::int64_t) size - 1;

        // The hold (13 ms) bridges the gaps between the peaks of a 40 Hz wave, so the level is smooth.
        release = (float) std::exp (-1.0 / (0.030 * sr));
        energySmoothing = (float) (1.0 - std::exp (-1.0 / (0.020 * sr)));
        powerSmoothing = (float) (1.0 - std::exp (-1.0 / (rmsMs * 0.001 * sr)));

        applySettings();
        reset();
    }

    void reset()
    {
        hpf.reset();
        lpf.reset();
        std::fill (history.begin(), history.end(), 0.0f);
        std::fill (levelHistory.begin(), levelHistory.end(), 0.0f);
        std::fill (energyHistory.begin(), energyHistory.end(), 0.0f);
        pos = 0;
        level = peakLevel = energy = power = 0.0f;
        holdLeft = peakHoldLeft = 0;
        holdoff = 0;
        armed = true;
        measuring = false;
    }

    void setSettings (const DetectorSettings& s)
    {
        settings = s;
        applySettings();
    }

    const DetectorSettings& getSettings() const { return settings; }
    int peakWindowSamples() const { return window; }
    int maxBacktrackSamples() const { return backtrack; }
    std::int64_t position() const { return pos; }

    // Feeds one input sample and returns the filtered signal the detector listens to.
    // `hasHit` becomes true on the sample where a hit has been fully measured.
    float process (float x, Hit& hitOut, bool& hasHit) noexcept
    {
        hasHit = false;

        float d = x;
        if (useHpf)
            d = hpf.highpass (d);
        if (useLpf)
            d = lpf.lowpass (d);

        const float r = std::abs (d);

        // Level: a short RMS (so noisy tails like snare wires read lower than a drum's
        // attack), held for a moment, then released.
        power += powerSmoothing * (r * r - power);
        const float rms = std::sqrt (power);
        follow (level, holdLeft, rms);

        // The instant peak (same hold/release) only serves to find the exact start of a hit.
        follow (peakLevel, peakHoldLeft, r);

        energy += energySmoothing * (r * r - energy);

        const auto now = (std::size_t) (pos & mask);
        const auto then = (std::size_t) ((pos - lookBack) & mask);
        history[now] = peakLevel;
        levelHistory[now] = level;
        energyHistory[now] = energy;
        const bool started = pos >= lookBack;
        const float before = started ? levelHistory[then] : 0.0f;

        if (measuring)
        {
            peak = std::max (peak, r);
            windowEnergy += r * r;
            ++windowCount;

            if (pos >= measureEnd)
            {
                measuring = false;

                if (windowEnergy / (float) windowCount >= backgroundEnergy * ratio * ratio)
                {
                    hitOut.crossing = crossing;
                    // Take out the ring of the previous hit (powers add for unrelated waves).
                    const float own = std::sqrt (std::max (peak * peak - backgroundPeak * backgroundPeak, 0.0f));
                    hitOut.peak = std::max (own, 0.1f * peak);
                    hitOut.onset = findOnset();
                    hasHit = true;
                }
                else
                {
                    // Not a hit: don't let it block a real one that follows straight after.
                    holdoff = 0;
                    armed = true;
                }
            }
        }

        if (holdoff > 0)
            --holdoff;

        const bool rising = level >= threshold && level >= before * ratio;

        if (! armed && holdoff == 0 && ! rising)
            armed = true;

        if (armed && ! measuring && rising)
        {
            armed = false;
            measuring = true;
            crossing = pos;
            measureEnd = pos + window;
            peak = r;
            backgroundPeak = started ? history[then] : 0.0f;
            backgroundEnergy = started ? energyHistory[then] : 0.0f;
            windowEnergy = 0.0f;
            windowCount = 0;
            holdoff = retriggerSamples;
        }

        ++pos;
        return d;
    }

private:
    void applySettings()
    {
        threshold = dbToGain (settings.thresholdDb);
        ratio = dbToGain (sensitivityToRatioDb (settings.sensitivity));
        retriggerSamples = std::max (window + 1, (int) std::lround (settings.retriggerMs * 0.001 * sr));

        useHpf = settings.lowCutHz > lowCutOffHz;
        useLpf = settings.highCutHz < highCutOffHz;
        if (useHpf)
            hpf.setCutoff (settings.lowCutHz, sr);
        if (useLpf)
            lpf.setCutoff (settings.highCutHz, sr);
    }

    // Instant attack, hold, then release.
    void follow (float& env, int& holdCounter, float input) const noexcept
    {
        if (input >= env)
        {
            env = input;
            holdCounter = holdSamples;
        }
        else if (holdCounter > 0)
        {
            --holdCounter;
        }
        else
        {
            env = std::max (input, env * release);
        }
    }

    // Walks back from the detection point to where the peak level first rose above what
    // it was before the hit (the previous hit's ring, or -20 dB below this hit's peak).
    std::int64_t findOnset() const
    {
        const auto earliest = std::max<std::int64_t> (1, crossing - backtrack);
        auto at = [this] (std::int64_t k) { return history[(std::size_t) (k & mask)]; };

        float floor = 0.1f * peak;
        for (auto k = std::max<std::int64_t> (0, earliest - holdSamples); k < earliest; ++k)
            floor = std::max (floor, at (k));

        auto k = crossing;
        while (k > earliest && at (k - 1) > floor && at (k - 1) <= at (k))
            --k;
        return k;
    }

    DetectorSettings settings;
    double sr = 48000.0;
    int window = 240, backtrack = 96;

    Svf hpf, lpf;
    bool useHpf = false, useLpf = false;

    std::vector<float> history;       // recent `peakLevel` values
    std::vector<float> levelHistory;  // recent `level` values
    std::vector<float> energyHistory; // recent `energy` values
    std::int64_t mask = 0;
    std::int64_t pos = 0;
    int lookBack = 480;

    float threshold = 0.03f, ratio = 2.0f;
    int retriggerSamples = 2400;

    float level = 0.0f, peakLevel = 0.0f, release = 0.999f;
    int holdSamples = 624, holdLeft = 0, peakHoldLeft = 0;
    float energy = 0.0f, energySmoothing = 0.001f; // mean square over ~20 ms
    float power = 0.0f, powerSmoothing = 0.04f;    // mean square over ~0.5 ms

    bool armed = true, measuring = false;
    int holdoff = 0;
    std::int64_t crossing = 0, measureEnd = 0;
    float peak = 0.0f, backgroundPeak = 0.0f;
    float backgroundEnergy = 0.0f, windowEnergy = 0.0f;
    int windowCount = 0;
};

} // namespace dr
