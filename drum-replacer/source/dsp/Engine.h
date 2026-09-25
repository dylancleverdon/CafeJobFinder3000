// The drum replacer: detects hits in the incoming audio and plays a sample on
// each one, lined up with the original hit.
//
// To line the new sound up exactly (and to measure how hard each hit was before
// choosing its loudness), the original audio is delayed by about 12 ms. The
// plugin reports that delay to the host (Ableton compensates for it
// automatically), so everything stays in time.
#pragma once

#include "Detector.h"
#include "Kit.h"
#include "MeterFifo.h"

#include <array>
#include <atomic>
#include <cstdint>
#include <vector>

namespace dr
{

enum class SampleMode
{
    velocityLayers = 0, // soft hits play the soft sample, hard hits the hard one
    roundRobin = 1      // cycle through all loaded samples
};

struct EngineParams
{
    DetectorSettings detector;
    float dynamics = 1.0f;       // 0 = every hit equally loud, 1 = follows the original
    float pitchSemitones = 0.0f; // -12..+12
    float decay = 1.0f;          // 0..1, 1 = the sample's natural length
    float originalDb = -60.0f;   // level of the original drum, -60 = off
    float replacementDb = 0.0f;  // level of the new sample, -60 = off
    float timingMs = 0.0f;       // -5..+5, negative plays the new sample earlier
    bool choke = false;          // a new hit cuts off the previous one
    bool listen = false;         // hear what the detector hears
    SampleMode sampleMode = SampleMode::velocityLayers;
};

struct TriggerEvent
{
    int offset = 0;         // sample position inside the processed block
    float velocity = 1.0f;  // 0..1
};

class Engine
{
public:
    static constexpr double maxEarlyMs = 5.0; // Timing can move the sample this much earlier
    static constexpr float offDb = -60.0f;
    static constexpr int maxVoices = 32;

    void prepare (double sampleRate, int maxBlockSize);
    void reset();
    int latencySamples() const { return latency; }

    void setParams (const EngineParams& p);
    const EngineParams& getParams() const { return params; }

    void setKit (KitPtr newKit);
    const KitPtr& getKit() const { return kit; }

    void setMeter (MeterFifo* fifo) { meter = fifo; }

    // In-place processing of 1 or 2 channels.
    void process (float* const* channels, int numChannels, int numSamples) noexcept;

    // Hits whose sample started during the last process() call (for MIDI out).
    const std::vector<TriggerEvent>& triggers() const { return triggerEvents; }

    // Loudest hit heard so far. Velocities are measured relative to it.
    float referenceDb() const { return sharedReferenceDb.load (std::memory_order_relaxed); }
    void setReferenceDb (float db);
    void resetReference() { setReferenceDb (-120.0f); }

    int hitCount() const { return sharedHitCount.load (std::memory_order_relaxed); }
    float lastVelocity() const { return sharedLastVelocity.load (std::memory_order_relaxed); }

private:
    struct Pending
    {
        bool active = false;
        std::int64_t start = 0;
        float velocity = 1.0f;
        float gain = 1.0f;
    };

    struct Voice
    {
        bool active = false;
        SamplePtr sample;
        double pos = 0.0, inc = 1.0;
        float gain = 1.0f;
        float env = 1.0f, envMul = 1.0f;
        int fadeLeft = 0, fadeLen = 0;
        std::uint64_t order = 0;
    };

    void scheduleHit (const Hit& hit) noexcept;
    void startVoice (const Pending& p, std::int64_t lateBy, int blockOffset) noexcept;
    const SamplePtr* chooseSample (float velocity, float& gainOut) noexcept;
    void renderVoices (float& left, float& right) noexcept;

    double sr = 48000.0;
    int latency = 576, maxEarly = 240;
    EngineParams params;
    bool haveParams = false;

    Detector detector;
    KitPtr kit;

    std::array<std::vector<float>, 2> dryDelay;
    std::vector<float> listenDelay;
    std::int64_t delayMask = 0;

    std::array<Pending, 64> pending {};
    int numPending = 0;
    std::array<Voice, maxVoices> voices {};
    std::uint64_t voiceCounter = 0;
    std::array<std::uint32_t, 128> roundRobin {};
    std::uint32_t roundRobinAll = 0;

    std::int64_t now = 0;
    float referenceLevelDb = -120.0f;

    float originalGain = 0.0f, replacementGain = 1.0f, listenMix = 0.0f;
    float smoothing = 0.002f;

    MeterFifo* meter = nullptr;
    int meterChunk = 192, meterCount = 0;
    float meterMax = 0.0f, meterHit = -1.0f;

    std::vector<TriggerEvent> triggerEvents;

    std::atomic<float> sharedReferenceDb { -120.0f };
    std::atomic<float> sharedLastVelocity { 0.0f };
    std::atomic<int> sharedHitCount { 0 };
    std::atomic<float> pendingReferenceDb { 1.0f }; // > 0 means nothing pending
};

} // namespace dr
