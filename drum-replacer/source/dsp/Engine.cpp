#include "Engine.h"

#include <algorithm>
#include <cmath>

namespace dr
{

namespace
{
    // 4-point Hermite interpolation; exact when frac == 0.
    inline float readInterpolated (const std::vector<float>& d, double pos) noexcept
    {
        const auto i = (std::int64_t) pos;
        const auto f = (float) (pos - (double) i);
        const auto n = (std::int64_t) d.size();
        auto at = [&] (std::int64_t k) { return (k >= 0 && k < n) ? d[(std::size_t) k] : 0.0f; };

        const float x0 = at (i);
        if (f == 0.0f)
            return x0;

        const float xm1 = at (i - 1), x1 = at (i + 1), x2 = at (i + 2);
        const float c1 = 0.5f * (x1 - xm1);
        const float c2 = xm1 - 2.5f * x0 + 2.0f * x1 - 0.5f * x2;
        const float c3 = 0.5f * (x2 - xm1) + 1.5f * (x0 - x1);
        return ((c3 * f + c2) * f + c1) * f + x0;
    }

    inline float levelToGain (float db) { return db <= Engine::offDb ? 0.0f : dbToGain (db); }
}

void Engine::prepare (double sampleRate, int maxBlockSize)
{
    sr = sampleRate;

    detector.prepare (sr);
    if (haveParams)
        detector.setSettings (params.detector);

    // The delay must cover: measuring the hit's peak, walking back to its true start,
    // and the earliest Timing setting. Then every sample can start exactly on time.
    maxEarly = (int) std::ceil (maxEarlyMs * 0.001 * sr);
    latency = detector.peakWindowSamples() + detector.maxBacktrackSamples() + maxEarly;

    std::size_t size = 1;
    while (size < (std::size_t) latency + 1)
        size <<= 1;
    for (auto& d : dryDelay)
        d.assign (size, 0.0f);
    listenDelay.assign (size, 0.0f);
    delayMask = (std::int64_t) size - 1;

    smoothing = (float) (1.0 - std::exp (-1.0 / (0.010 * sr)));
    meterChunk = std::max (1, (int) std::lround (0.004 * sr));

    triggerEvents.clear();
    triggerEvents.reserve ((std::size_t) std::max (256, maxBlockSize / 8));

    reset();
}

void Engine::reset()
{
    detector.reset();
    for (auto& d : dryDelay)
        std::fill (d.begin(), d.end(), 0.0f);
    std::fill (listenDelay.begin(), listenDelay.end(), 0.0f);

    for (auto& p : pending)
        p.active = false;
    for (auto& v : voices)
    {
        v.active = false;
        v.sample.reset();
    }

    now = 0;
    meterCount = 0;
    meterMax = 0.0f;
    meterHit = -1.0f;

    originalGain = levelToGain (params.originalDb);
    replacementGain = levelToGain (params.replacementDb);
    listenMix = params.listen ? 1.0f : 0.0f;
}

void Engine::setParams (const EngineParams& p)
{
    const bool filtersChanged = haveParams
                             && (std::abs (p.detector.lowCutHz - params.detector.lowCutHz) > 0.01f
                                 || std::abs (p.detector.highCutHz - params.detector.highCutHz) > 0.01f);

    const bool detectorChanged = ! haveParams
                              || p.detector.thresholdDb != params.detector.thresholdDb
                              || p.detector.sensitivity != params.detector.sensitivity
                              || p.detector.retriggerMs != params.detector.retriggerMs
                              || filtersChanged;

    params = p;
    params.timingMs = std::clamp (params.timingMs, (float) -maxEarlyMs, (float) maxEarlyMs);

    if (detectorChanged)
        detector.setSettings (params.detector);

    // Different filters give different levels, so relearn the loudest hit.
    if (filtersChanged)
        referenceLevelDb = -120.0f;

    if (! haveParams)
    {
        originalGain = levelToGain (params.originalDb);
        replacementGain = levelToGain (params.replacementDb);
        listenMix = params.listen ? 1.0f : 0.0f;
    }

    haveParams = true;
}

void Engine::setKit (KitPtr newKit)
{
    if (newKit == kit)
        return;
    kit = std::move (newKit); // voices keep their own reference to the sample they're playing
    roundRobin.fill (0);
    roundRobinAll = 0;
}

void Engine::setReferenceDb (float db)
{
    pendingReferenceDb.store (std::min (db, 0.0f), std::memory_order_relaxed);
}

void Engine::process (float* const* channels, int numChannels, int numSamples) noexcept
{
    triggerEvents.clear();

    const float pendingRef = pendingReferenceDb.exchange (1.0f, std::memory_order_relaxed);
    if (pendingRef <= 0.0f)
        referenceLevelDb = pendingRef;

    if (numChannels <= 0 || channels == nullptr)
        return;

    float* left = channels[0];
    float* right = numChannels > 1 ? channels[1] : nullptr;

    const float targetOriginal = levelToGain (params.originalDb);
    const float targetReplacement = levelToGain (params.replacementDb);
    const float targetListen = params.listen ? 1.0f : 0.0f;

    for (int i = 0; i < numSamples; ++i)
    {
        const float inL = left[i];
        const float inR = right != nullptr ? right[i] : inL;
        const float mono = right != nullptr ? 0.5f * (inL + inR) : inL;

        Hit hit;
        bool hasHit = false;
        const float detected = detector.process (mono, hit, hasHit);

        if (hasHit)
            scheduleHit (hit);

        for (auto& p : pending)
        {
            if (p.active && p.start <= now)
            {
                p.active = false;
                startVoice (p, now - p.start, i);
            }
        }

        // Screen meter.
        meterMax = std::max (meterMax, std::abs (detected));
        if (++meterCount >= meterChunk)
        {
            if (meter != nullptr)
                meter->push ({ meterMax, meterHit });
            meterCount = 0;
            meterMax = 0.0f;
            meterHit = -1.0f;
        }

        // Delay the original by the latency so the samples can start right on the hit.
        const auto w = (std::size_t) (now & delayMask);
        const auto r = (std::size_t) ((now - latency) & delayMask);
        dryDelay[0][w] = inL;
        dryDelay[1][w] = inR;
        listenDelay[w] = detected;
        const float dryL = dryDelay[0][r];
        const float dryR = dryDelay[1][r];
        const float heard = listenDelay[r];

        float wetL = 0.0f, wetR = 0.0f;
        renderVoices (wetL, wetR);

        originalGain += smoothing * (targetOriginal - originalGain);
        replacementGain += smoothing * (targetReplacement - replacementGain);
        listenMix += smoothing * (targetListen - listenMix);

        float outL = dryL * originalGain + wetL * replacementGain;
        float outR = dryR * originalGain + wetR * replacementGain;
        outL += listenMix * (heard - outL);
        outR += listenMix * (heard - outR);

        if (right != nullptr)
        {
            left[i] = outL;
            right[i] = outR;
        }
        else
        {
            left[i] = 0.5f * (outL + outR);
        }

        ++now;
    }

    sharedReferenceDb.store (referenceLevelDb, std::memory_order_relaxed);
}

void Engine::scheduleHit (const Hit& hit) noexcept
{
    const float peakDb = gainToDb (hit.peak);
    if (peakDb > referenceLevelDb)
        referenceLevelDb = peakDb;

    const float relative = peakDb - referenceLevelDb; // <= 0
    const float span = std::max (referenceLevelDb - params.detector.thresholdDb, 6.0f);
    const float position = std::clamp (1.0f + relative / span, 0.0f, 1.0f);

    const float dynamics = std::clamp (params.dynamics, 0.0f, 1.0f);
    const float velocity = 1.0f - dynamics * (1.0f - position);
    const float gainDb = std::max (dynamics * relative, -48.0f);

    const auto timing = std::max<std::int64_t> (std::lround (params.timingMs * 0.001 * sr), -maxEarly);
    const auto start = hit.onset + latency + timing;

    Pending* slot = nullptr;
    for (auto& p : pending)
        if (! p.active)
        {
            slot = &p;
            break;
        }

    if (slot == nullptr) // 64 hits waiting inside 12 ms can't happen with retrigger >= 10 ms
        return;

    *slot = { true, start, velocity, dbToGain (gainDb) };

    meterHit = std::max (meterHit, velocity);
    sharedHitCount.fetch_add (1, std::memory_order_relaxed);
    sharedLastVelocity.store (velocity, std::memory_order_relaxed);
}

const SamplePtr* Engine::chooseSample (float velocity, float& gainOut) noexcept
{
    gainOut = 1.0f;
    if (kit == nullptr || kit->empty())
        return nullptr;

    const auto& layers = kit->layers;

    if (params.sampleMode == SampleMode::roundRobin && kit->userSamples)
    {
        const auto total = (std::uint32_t) kit->numSamples();
        auto index = roundRobinAll++ % total;
        for (auto& layer : layers)
        {
            if (index < layer.variations.size())
                return &layer.variations[index];
            index -= (std::uint32_t) layer.variations.size();
        }
        return nullptr;
    }

    const auto numLayers = (int) layers.size();
    int layerIndex = std::clamp ((int) (velocity * (float) numLayers), 0, numLayers - 1);
    while (layerIndex > 0 && layers[(std::size_t) layerIndex].variations.empty())
        --layerIndex;
    while (layerIndex < numLayers - 1 && layers[(std::size_t) layerIndex].variations.empty())
        ++layerIndex;

    const auto& variations = layers[(std::size_t) layerIndex].variations;
    if (variations.empty())
        return nullptr;

    auto& counter = roundRobin[(std::size_t) layerIndex % roundRobin.size()];
    const auto& chosen = variations[counter++ % variations.size()];
    gainOut = chosen->layerGain;
    return &chosen;
}

void Engine::startVoice (const Pending& p, std::int64_t lateBy, int blockOffset) noexcept
{
    if (triggerEvents.size() < triggerEvents.capacity())
        triggerEvents.push_back ({ blockOffset, p.velocity });

    float layerGain = 1.0f;
    const SamplePtr* chosenPtr = chooseSample (p.velocity, layerGain);
    if (chosenPtr == nullptr || (*chosenPtr)->length() == 0)
        return;
    const Sample& chosen = **chosenPtr;

    const int fadeLen = std::max (1, (int) std::lround (0.003 * sr));
    if (params.choke)
    {
        for (auto& v : voices)
            if (v.active && v.fadeLeft == 0)
                v.fadeLeft = v.fadeLen = fadeLen;
    }

    Voice* slot = nullptr;
    for (auto& v : voices)
        if (! v.active)
        {
            slot = &v;
            break;
        }

    if (slot == nullptr) // all busy: take over the oldest
    {
        slot = &voices[0];
        for (auto& v : voices)
            if (v.order < slot->order)
                slot = &v;
    }

    const double pitch = std::pow (2.0, std::clamp (params.pitchSemitones, -24.0f, 24.0f) / 12.0);

    slot->active = true;
    slot->sample = *chosenPtr; // the voice keeps the sample alive even if the kit changes
    slot->inc = chosen.sampleRate / sr * pitch;
    slot->pos = (double) lateBy * slot->inc;
    slot->gain = p.gain * layerGain;
    slot->env = 1.0f;
    slot->fadeLeft = slot->fadeLen = 0;
    slot->order = ++voiceCounter;

    const float decay = std::clamp (params.decay, 0.0f, 1.0f);
    if (decay >= 0.999f)
    {
        slot->envMul = 1.0f;
    }
    else
    {
        const double tau = 0.015 * std::pow (100.0, (double) decay); // 15 ms .. 1.5 s
        slot->envMul = (float) std::exp (-1.0 / (tau * sr));
    }
}

void Engine::renderVoices (float& left, float& right) noexcept
{
    for (auto& v : voices)
    {
        if (! v.active)
            continue;

        const Sample& s = *v.sample;
        if (v.pos >= (double) s.length() || v.env < 1.0e-4f)
        {
            v.active = false;
            v.sample.reset(); // never the last reference: the plugin keeps every kit alive
            continue;
        }

        float g = v.gain * v.env;
        if (v.fadeLen > 0)
        {
            g *= (float) v.fadeLeft / (float) v.fadeLen;
            if (--v.fadeLeft <= 0)
            {
                v.active = false;
                v.sample.reset();
                continue;
            }
        }

        const float l = readInterpolated (s.channels[0], v.pos);
        const float r = s.numChannels() > 1 ? readInterpolated (s.channels[1], v.pos) : l;
        left += l * g;
        right += r * g;

        v.pos += v.inc;
        v.env *= v.envMul;
    }
}

} // namespace dr
