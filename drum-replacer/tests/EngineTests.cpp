// Tests for the drum replacer's audio engine (no plugin framework needed).
// Run with: ctest --test-dir build   (or ./build/drum_replacer_tests)

#include "../source/dsp/DrumSynth.h"
#include "../source/dsp/Engine.h"

#include <cmath>
#include <cstdio>
#include <functional>
#include <random>
#include <string>
#include <vector>

using namespace dr;

namespace
{
int failures = 0;
int checks = 0;
std::string currentTest;

#define CHECK(cond)                                                                           \
    do                                                                                        \
    {                                                                                         \
        ++checks;                                                                             \
        if (! (cond))                                                                         \
        {                                                                                     \
            ++failures;                                                                       \
            std::printf ("  FAILED in %s (line %d): %s\n", currentTest.c_str(), __LINE__, #cond); \
        }                                                                                     \
    } while (0)

#define CHECK_MSG(cond, ...)                                  \
    do                                                        \
    {                                                         \
        ++checks;                                             \
        if (! (cond))                                         \
        {                                                     \
            ++failures;                                       \
            std::printf ("  FAILED in %s (line %d): %s  -> ", \
                         currentTest.c_str(), __LINE__, #cond); \
            std::printf (__VA_ARGS__);                        \
            std::printf ("\n");                               \
        }                                                     \
    } while (0)

constexpr double pi = 3.14159265358979323846;

// A kick-like hit: decaying sine that starts at zero exactly at `onset`.
void addHit (std::vector<float>& x, double sr, double onsetSec, float amp, double freq = 60.0, double tau = 0.08)
{
    const auto start = (std::size_t) std::lround (onsetSec * sr);
    for (std::size_t n = start; n < x.size(); ++n)
    {
        const double t = (double) (n - start) / sr;
        if (t > tau * 12)
            break;
        x[n] += (float) (amp * std::sin (2.0 * pi * freq * t) * std::exp (-t / tau));
    }
}

KitPtr impulseKit (double sr, int layers = 1)
{
    auto kit = std::make_shared<Kit>();
    for (int l = 0; l < layers; ++l)
    {
        auto s = std::make_shared<Sample>();
        s->sampleRate = sr;
        s->channels = { { 1.0f } };
        s->peak = 1.0f;
        kit->layers.push_back ({ { s } });
    }
    return kit;
}

EngineParams replaceOnly()
{
    EngineParams p;
    p.detector.thresholdDb = -30.0f;
    p.originalDb = Engine::offDb;
    p.replacementDb = 0.0f;
    p.dynamics = 1.0f;
    return p;
}

// Runs a mono buffer through a freshly prepared engine in blocks.
std::vector<float> run (Engine& e, std::vector<float> x, int block, std::vector<TriggerEvent>* events = nullptr)
{
    for (std::size_t pos = 0; pos < x.size(); pos += (std::size_t) block)
    {
        const int n = (int) std::min<std::size_t> ((std::size_t) block, x.size() - pos);
        float* chans[] = { x.data() + pos };
        e.process (chans, 1, n);
        if (events != nullptr)
            for (auto ev : e.triggers())
                events->push_back ({ ev.offset + (int) pos, ev.velocity });
    }
    return x;
}

std::vector<std::size_t> impulses (const std::vector<float>& y, float minLevel = 1.0e-4f)
{
    std::vector<std::size_t> at;
    for (std::size_t i = 0; i < y.size(); ++i)
        if (std::abs (y[i]) > minLevel)
            at.push_back (i);
    return at;
}

void test (const std::string& name, const std::function<void()>& body)
{
    currentTest = name;
    const int before = failures;
    body();
    std::printf ("%s %s\n", failures == before ? "ok  " : "FAIL", name.c_str());
}
} // namespace

int main()
{
    test ("each hit is replaced once, lined up with the original", [] {
        for (double sr : { 44100.0, 48000.0, 96000.0 })
        {
            Engine e;
            e.setParams (replaceOnly());
            e.prepare (sr, 512);
            e.setKit (impulseKit (sr));

            std::vector<float> x ((std::size_t) (sr * 3.0), 0.0f);
            const double onsets[] = { 0.10, 0.4031, 0.7517, 1.0023, 1.3309, 1.7042, 2.0555, 2.5071 };
            const float amps[] = { 1.0f, 0.5f, 0.8f, 0.25f, 1.0f, 0.1f, 0.7f, 0.9f };
            for (int i = 0; i < 8; ++i)
                addHit (x, sr, onsets[i], amps[i]);

            const auto y = run (e, x, 512);
            const auto at = impulses (y);
            CHECK_MSG (at.size() == 8, "sr %.0f: %zu hits", sr, at.size());
            if (at.size() != 8)
                continue;

            const auto tolerance = (long) (0.0005 * sr); // 0.5 ms
            for (int i = 0; i < 8; ++i)
            {
                const long expected = std::lround (onsets[i] * sr) + e.latencySamples();
                CHECK_MSG (std::labs ((long) at[(std::size_t) i] - expected) <= tolerance,
                           "sr %.0f hit %d at %zu, expected %ld", sr, i, at[(std::size_t) i], expected);

                // With Dynamics at 100% the new hit is as much quieter as the original was
                // (give or take the previous hit still ringing underneath).
                const float gotDb = gainToDb (y[at[(std::size_t) i]]);
                const float wantDb = gainToDb (amps[i]);
                CHECK_MSG (std::abs (gotDb - wantDb) < 1.5f, "sr %.0f hit %d: %.2f dB vs %.2f dB", sr, i, gotDb, wantDb);

                // ...and louder originals always give louder replacements.
                for (int j = 0; j < 8; ++j)
                    if (amps[j] > amps[i] * 1.2f)
                        CHECK (y[at[(std::size_t) j]] > y[at[(std::size_t) i]]);
            }
        }
    });

    test ("the result doesn't depend on the host's block size", [] {
        const double sr = 48000.0;
        std::vector<float> x ((std::size_t) sr * 2, 0.0f);
        std::mt19937 rng (7);
        std::uniform_real_distribution<float> noise (-0.01f, 0.01f);
        for (auto& v : x)
            v = noise (rng);
        for (int i = 0; i < 12; ++i)
            addHit (x, sr, 0.05 + 0.15 * i, 0.3f + 0.05f * (float) i);

        std::vector<float> reference;
        for (int block : { 1, 7, 64, 480, 4096 })
        {
            Engine e;
            auto p = replaceOnly();
            p.originalDb = -6.0f;
            p.pitchSemitones = 3.0f;
            e.setParams (p);
            e.prepare (sr, block);
            e.setKit (makeBuiltInKit (0));
            const auto y = run (e, x, block);
            if (reference.empty())
                reference = y;
            else
                CHECK_MSG (y == reference, "block size %d", block);
        }
    });

    test ("the original passes through unchanged, delayed by the reported latency", [] {
        const double sr = 48000.0;
        Engine e;
        auto p = replaceOnly();
        p.originalDb = 0.0f;
        p.replacementDb = Engine::offDb;
        e.setParams (p);
        e.prepare (sr, 256);
        e.setKit (impulseKit (sr));

        std::vector<float> x (20000);
        std::mt19937 rng (1);
        std::uniform_real_distribution<float> noise (-0.5f, 0.5f);
        for (auto& v : x)
            v = noise (rng);

        const auto y = run (e, x, 256);
        const auto L = (std::size_t) e.latencySamples();
        CHECK (L > 0);
        CHECK (std::abs (e.latencySamples() - 576) <= 2); // ~12 ms at 48 kHz
        bool same = true;
        for (std::size_t i = L; i < x.size(); ++i)
            same = same && y[i] == x[i - L];
        CHECK (same);
    });

    test ("a long ringing drum only triggers once", [] {
        const double sr = 48000.0;
        Engine e;
        e.setParams (replaceOnly());
        e.prepare (sr, 512);
        e.setKit (impulseKit (sr));
        std::vector<float> x ((std::size_t) sr * 3, 0.0f);
        addHit (x, sr, 0.2, 0.9f, 95.0, 0.6);  // floor tom
        addHit (x, sr, 1.5, 0.9f, 45.0, 0.25); // very low kick
        CHECK_MSG (impulses (run (e, x, 512)).size() == 2, "%zu", impulses (run (e, x, 512)).size());
    });

    test ("fast repeated hits (16ths at 150 bpm) are all caught", [] {
        const double sr = 48000.0;
        Engine e;
        e.setParams (replaceOnly());
        e.prepare (sr, 512);
        e.setKit (impulseKit (sr));
        std::vector<float> x ((std::size_t) sr * 2, 0.0f);
        for (int i = 0; i < 16; ++i)
            addHit (x, sr, 0.05 + 0.1 * i, 0.8f, 60.0, 0.15); // long ring, in phase: the hardest case
        const auto n = impulses (run (e, x, 512)).size();
        CHECK_MSG (n == 16, "%zu hits", n);
    });

    test ("quiet bleed under the threshold is ignored", [] {
        const double sr = 48000.0;
        Engine e;
        auto p = replaceOnly();
        p.detector.thresholdDb = -24.0f;
        e.setParams (p);
        e.prepare (sr, 512);
        e.setKit (impulseKit (sr));
        std::vector<float> x ((std::size_t) sr * 2, 0.0f);
        for (int i = 0; i < 8; ++i)
            addHit (x, sr, 0.1 + 0.2 * i, 0.9f);
        for (int i = 0; i < 16; ++i)
            addHit (x, sr, 0.05 + 0.11 * i, 0.03f, 3000.0, 0.03); // hi-hat bleed at -30 dB
        const auto n = impulses (run (e, x, 512)).size();
        CHECK_MSG (n == 8, "%zu hits", n);
    });

    test ("low/high cut isolate the kick from a louder snare", [] {
        const double sr = 48000.0;
        Engine e;
        auto p = replaceOnly();
        p.detector.thresholdDb = -20.0f;
        p.detector.highCutHz = 110.0f;
        e.setParams (p);
        e.prepare (sr, 512);
        e.setKit (impulseKit (sr));

        std::vector<float> x ((std::size_t) sr * 2, 0.0f);
        std::mt19937 rng (3);
        std::uniform_real_distribution<float> noise (-1.0f, 1.0f);
        for (int i = 0; i < 4; ++i)
        {
            addHit (x, sr, 0.1 + 0.4 * i, 0.5f); // kick at -6 dB
            const auto s = (std::size_t) ((0.3 + 0.4 * i) * sr);
            float prev = 0.0f;
            for (std::size_t n = 0; n < (std::size_t) (0.2 * sr); ++n) // snare: bright noise at 0 dB
            {
                const float white = noise (rng);
                x[s + n] += 0.9f * (white - prev) * 0.5f * (float) std::exp (-(double) n / (0.06 * sr));
                prev = white;
            }
        }
        const auto n = impulses (run (e, x, 512)).size();
        CHECK_MSG (n == 4, "%zu hits", n);
    });

    test ("Timing moves the new sound earlier or later", [] {
        const double sr = 48000.0;
        for (float ms : { -5.0f, -2.0f, 3.0f, 5.0f })
        {
            Engine e;
            auto p = replaceOnly();
            p.timingMs = ms;
            e.setParams (p);
            e.prepare (sr, 512);
            e.setKit (impulseKit (sr));
            std::vector<float> x ((std::size_t) sr, 0.0f);
            addHit (x, sr, 0.3, 0.8f);
            const auto at = impulses (run (e, x, 512));
            CHECK (at.size() == 1);
            if (at.size() == 1)
            {
                const long expected = std::lround ((0.3 + ms * 0.001) * sr) + e.latencySamples();
                CHECK_MSG (std::labs ((long) at[0] - expected) <= 24, "%.1f ms: %zu vs %ld", ms, at[0], expected);
            }
        }
    });

    test ("velocity picks the matching layer; Dynamics 0 makes every hit equal", [] {
        const double sr = 48000.0;
        auto kit = std::make_shared<Kit>();
        for (int l = 0; l < 4; ++l)
        {
            auto s = std::make_shared<Sample>();
            s->sampleRate = sr;
            s->channels = { { 0.1f * (float) (l + 1) } };
            kit->layers.push_back ({ { s } });
        }

        std::vector<float> x ((std::size_t) sr * 2, 0.0f);
        addHit (x, sr, 0.1, 1.0f);   // loudest -> top layer
        addHit (x, sr, 0.6, 0.04f);  // just over -30 dB -> bottom layer
        addHit (x, sr, 1.1, 1.0f);

        {
            Engine e;
            auto p = replaceOnly();
            p.dynamics = 0.0f;
            e.setParams (p);
            e.prepare (sr, 512);
            e.setKit (kit);
            const auto y = run (e, x, 512);
            const auto at = impulses (y);
            CHECK (at.size() == 3);
            for (auto i : at)
                CHECK_MSG (std::abs (y[i] - 0.4f) < 1e-5f, "%f", y[i]); // always the top layer at full level
        }
        {
            Engine e;
            e.setParams (replaceOnly());
            e.prepare (sr, 512);
            e.setKit (kit);
            std::vector<TriggerEvent> events;
            const auto y = run (e, x, 512, &events);
            const auto at = impulses (y);
            CHECK (at.size() == 3);
            CHECK (events.size() == 3);
            if (at.size() == 3 && events.size() == 3)
            {
                CHECK_MSG (std::abs (y[at[0]] - 0.4f) < 1e-3f, "%f", y[at[0]]);
                CHECK_MSG (events[1].velocity < 0.25f, "%f", events[1].velocity);
                // Soft hit: bottom layer (0.1) played ~28 dB quieter.
                CHECK_MSG (std::abs (gainToDb (y[at[1]] / 0.1f) - gainToDb (0.04f)) < 1.0f, "%f", y[at[1]]);
                CHECK (std::abs (events[0].velocity - 1.0f) < 1e-3f);
            }
        }
    });

    test ("choke cuts the previous sound; without it they overlap", [] {
        const double sr = 48000.0;
        auto kit = std::make_shared<Kit>();
        auto s = std::make_shared<Sample>();
        s->sampleRate = sr;
        s->channels = { std::vector<float> ((std::size_t) sr, 0.25f) }; // 1 s of DC
        kit->layers.push_back ({ { s } });

        std::vector<float> x ((std::size_t) sr * 2, 0.0f);
        addHit (x, sr, 0.1, 0.8f);
        addHit (x, sr, 0.4, 0.8f);

        for (bool choke : { false, true })
        {
            Engine e;
            auto p = replaceOnly();
            p.choke = choke;
            p.dynamics = 0.0f;
            e.setParams (p);
            e.prepare (sr, 512);
            e.setKit (kit);
            const auto y = run (e, x, 512);
            const auto probe = (std::size_t) (0.5 * sr) + (std::size_t) e.latencySamples();
            CHECK_MSG (std::abs (y[probe] - (choke ? 0.25f : 0.5f)) < 1e-4f, "choke=%d: %f", (int) choke, y[probe]);
        }
    });

    test ("Pitch +12 plays the sample an octave up (half as long)", [] {
        const double sr = 48000.0;
        auto kit = std::make_shared<Kit>();
        auto s = std::make_shared<Sample>();
        s->sampleRate = sr;
        s->channels = { std::vector<float> (4800, 0.5f) };
        kit->layers.push_back ({ { s } });

        Engine e;
        auto p = replaceOnly();
        p.pitchSemitones = 12.0f;
        e.setParams (p);
        e.prepare (sr, 512);
        e.setKit (kit);
        std::vector<float> x ((std::size_t) sr, 0.0f);
        addHit (x, sr, 0.1, 0.8f);
        const auto at = impulses (run (e, x, 512), 1.0e-3f);
        CHECK (! at.empty());
        if (! at.empty())
            CHECK_MSG (std::labs ((long) (at.back() - at.front()) - 2400) <= 2, "%zu", at.back() - at.front());
    });

    test ("Decay shortens the sample", [] {
        const double sr = 48000.0;
        auto kit = std::make_shared<Kit>();
        auto s = std::make_shared<Sample>();
        s->sampleRate = sr;
        s->channels = { std::vector<float> ((std::size_t) sr, 0.5f) };
        kit->layers.push_back ({ { s } });

        Engine e;
        auto p = replaceOnly();
        p.decay = 0.0f; // 15 ms time constant
        e.setParams (p);
        e.prepare (sr, 512);
        e.setKit (kit);
        std::vector<float> x ((std::size_t) sr * 2, 0.0f);
        addHit (x, sr, 0.1, 0.8f);
        const auto at = impulses (run (e, x, 512), 1.0e-3f);
        CHECK (! at.empty());
        if (! at.empty())
            CHECK_MSG (at.back() - at.front() < (std::size_t) (0.12 * sr), "%zu", at.back() - at.front());
    });

    test ("round robin cycles through every loaded file", [] {
        const double sr = 48000.0;
        std::vector<Sample> files;
        for (int i = 0; i < 3; ++i)
        {
            Sample s;
            s.sampleRate = sr;
            s.channels = { { 0.2f + 0.2f * (float) i } };
            updatePeak (s);
            files.push_back (s);
        }
        auto kit = makeUserKit (files, "mine");
        CHECK (kit->layers.size() == 3);

        Engine e;
        auto p = replaceOnly();
        p.sampleMode = SampleMode::roundRobin;
        p.dynamics = 0.0f;
        e.setParams (p);
        e.prepare (sr, 512);
        e.setKit (kit);
        std::vector<float> x ((std::size_t) sr * 2, 0.0f);
        for (int i = 0; i < 6; ++i)
            addHit (x, sr, 0.1 + 0.25 * i, 0.8f);
        const auto y = run (e, x, 512);
        const auto at = impulses (y);
        CHECK (at.size() == 6);
        if (at.size() == 6)
            for (int i = 0; i < 6; ++i)
                CHECK_MSG (std::abs (y[at[(std::size_t) i]] - (0.2f + 0.2f * (float) (i % 3))) < 1e-4f, "%d: %f", i, y[at[(std::size_t) i]]);
    });

    test ("user files: silence trimmed, layers sorted and evened out", [] {
        Sample a;
        a.sampleRate = 44100.0;
        a.channels = { std::vector<float> (1000, 0.0f), std::vector<float> (1000, 0.0f) };
        a.channels[1][300] = 0.5f;
        a.channels[0][301] = -0.2f;
        prepareOneShot (a);
        CHECK (a.length() == 700);
        CHECK (a.channels[1][0] == 0.5f);
        CHECK (std::abs (a.peak - 0.5f) < 1e-6f);

        Sample b = a;
        for (auto& ch : b.channels)
            for (auto& v : ch)
                v *= 0.25f;
        updatePeak (b);

        const auto kit = makeUserKit ({ a, b }, "two");
        CHECK (kit->userSamples);
        CHECK (kit->layers.size() == 2);
        CHECK (std::abs (kit->layers[0].variations[0]->peak - 0.125f) < 1e-6f);
        CHECK (std::abs (kit->layers[0].variations[0]->layerGain - 4.0f) < 1e-4f);
        CHECK (std::abs (kit->layers[1].variations[0]->layerGain - 1.0f) < 1e-6f);
    });

    test ("the loudest-hit reference can be reset and restored", [] {
        const double sr = 48000.0;
        Engine e;
        e.setParams (replaceOnly());
        e.prepare (sr, 512);
        e.setKit (impulseKit (sr));
        std::vector<float> x ((std::size_t) sr, 0.0f);
        addHit (x, sr, 0.1, 0.5f);
        run (e, x, 512);
        CHECK_MSG (std::abs (e.referenceDb() - gainToDb (0.5f)) < 1.0f, "%f", e.referenceDb());
        CHECK (e.hitCount() == 1);

        e.setReferenceDb (-3.0f);
        std::vector<float> silence (512, 0.0f);
        run (e, silence, 512);
        CHECK (std::abs (e.referenceDb() + 3.0f) < 1e-6f);
        e.resetReference();
        run (e, silence, 512);
        CHECK (e.referenceDb() < -100.0f);
    });

    test ("silence in, silence out; no NaNs with loud noise", [] {
        const double sr = 48000.0;
        Engine e;
        auto p = replaceOnly();
        p.originalDb = 6.0f;
        p.replacementDb = 6.0f;
        p.detector.lowCutHz = 200.0f;
        p.detector.highCutHz = 2000.0f;
        e.setParams (p);
        e.prepare (sr, 512);
        e.setKit (makeBuiltInKit (2));

        std::vector<float> silence ((std::size_t) sr, 0.0f);
        const auto y = run (e, silence, 512);
        CHECK (impulses (y, 0.0f).empty());
        CHECK (e.hitCount() == 0);

        std::vector<float> noise ((std::size_t) sr * 3);
        std::mt19937 rng (11);
        std::uniform_real_distribution<float> dist (-1.0f, 1.0f);
        for (auto& v : noise)
            v = dist (rng);
        bool finite = true;
        for (float v : run (e, noise, 333))
            finite = finite && std::isfinite (v) && std::abs (v) < 100.0f;
        CHECK (finite);
    });

    test ("stereo in, stereo out", [] {
        const double sr = 48000.0;
        Engine e;
        auto p = replaceOnly();
        p.originalDb = 0.0f;
        e.setParams (p);
        e.prepare (sr, 512);
        e.setKit (impulseKit (sr));
        std::vector<float> l ((std::size_t) sr, 0.0f), r ((std::size_t) sr, 0.0f);
        addHit (l, sr, 0.2, 0.8f);
        addHit (r, sr, 0.2, 0.4f);
        for (std::size_t pos = 0; pos < l.size(); pos += 512)
        {
            float* chans[] = { l.data() + pos, r.data() + pos };
            e.process (chans, 2, (int) std::min<std::size_t> (512, l.size() - pos));
        }
        // The original keeps its left/right difference and the new (mono) sample lands on both sides.
        const auto hitAt = (std::size_t) std::lround (0.2 * sr) + (std::size_t) e.latencySamples();
        const auto probe = hitAt + 100;
        CHECK (std::abs (l[probe] - r[probe]) > 0.01f);
        CHECK (e.hitCount() == 1);
        float impulseL = 0.0f, impulseR = 0.0f;
        for (std::size_t i = hitAt - 24; i < hitAt + 24; ++i)
        {
            impulseL = std::max (impulseL, std::abs (l[i]));
            impulseR = std::max (impulseR, std::abs (r[i]));
        }
        CHECK (impulseL > 0.5f);
        CHECK (impulseR > 0.5f);
    });

    test ("built-in sounds are clean and start right away", [] {
        const auto names = builtInNames();
        CHECK (names.size() == (std::size_t) BuiltIn::count);
        for (int i = 0; i < (int) BuiltIn::count; ++i)
        {
            const auto kit = makeBuiltInKit (i);
            CHECK (kit->layers.size() == 4);
            for (auto& layer : kit->layers)
            {
                CHECK (layer.variations.size() == 3);
                for (auto& s : layer.variations)
                {
                    CHECK (s->length() > 4800);
                    CHECK_MSG (s->peak > 0.85f && s->peak <= 0.9f, "%s peak %f", names[(std::size_t) i].c_str(), s->peak);
                    float early = 0.0f;
                    bool finite = true;
                    for (std::size_t n = 0; n < s->length(); ++n)
                    {
                        finite = finite && std::isfinite (s->channels[0][n]);
                        if (n < 144) // first 3 ms
                            early = std::max (early, std::abs (s->channels[0][n]));
                    }
                    CHECK (finite);
                    CHECK_MSG (early > 0.1f * s->peak, "%s starts late (%f)", names[(std::size_t) i].c_str(), early);
                }
            }
            // Variations really differ.
            CHECK (kit->layers[3].variations[0]->channels[0] != kit->layers[3].variations[1]->channels[0]);
        }
    });

    // Plays a built-in sound at the given times/strengths over a little noise, like a drum track.
    auto drumTrack = [] (int which, double sr, const std::vector<double>& times, const std::vector<float>& amps) {
        const auto source = makeBuiltInKit (which, sr);
        std::vector<float> x ((std::size_t) ((times.back() + 1.0) * sr), 0.0f);
        std::mt19937 rng ((unsigned) which + 5);
        std::uniform_real_distribution<float> noise (-0.002f, 0.002f);
        for (auto& v : x)
            v = noise (rng);

        for (std::size_t i = 0; i < times.size(); ++i)
        {
            const auto& layer = source->layers[(std::size_t) std::min (3, (int) (amps[i] * 4.0f))];
            const auto& s = layer.variations[i % 3]->channels[0];
            const auto start = (std::size_t) (times[i] * sr);
            for (std::size_t n = 0; n < s.size() && start + n < x.size(); ++n)
                x[start + n] += amps[i] * s[n];
        }
        return x;
    };

    auto checkHits = [] (const std::string& what, const std::vector<float>& x, double sr, const std::vector<double>& times, double toleranceMs) {
        Engine e;
        auto p = replaceOnly();
        p.detector.thresholdDb = -24.0f;
        e.setParams (p);
        e.prepare (sr, 512);
        e.setKit (impulseKit (sr));
        const auto at = impulses (run (e, x, 512));
        CHECK_MSG (at.size() == times.size(), "%s: %zu hits, expected %zu", what.c_str(), at.size(), times.size());
        if (at.size() == times.size())
            for (std::size_t i = 0; i < times.size(); ++i)
            {
                const long expected = std::lround (times[i] * sr) + e.latencySamples();
                CHECK_MSG (std::labs ((long) at[i] - expected) <= (long) (toleranceMs * 0.001 * sr),
                           "%s hit %zu is %.2f ms off", what.c_str(), i, ((double) at[i] - (double) expected) * 1000.0 / sr);
            }
    };

    test ("drum tracks made of every built-in sound: soft and hard hits all found", [&] {
        const double sr = 44100.0;
        const auto names = builtInNames();
        const std::vector<float> amps = { 1.0f, 0.4f, 0.8f, 0.2f, 0.9f, 0.6f, 1.0f, 0.3f, 0.7f, 0.5f };
        for (int which = 0; which < (int) BuiltIn::count; ++which)
        {
            // Leave room for the previous hit to die down by ~20 dB, like a real drummer's groove.
            const auto source = makeBuiltInKit (which, sr);
            const auto& loud = source->layers[3].variations[0]->channels[0];
            std::size_t tail = 0;
            for (std::size_t n = 0; n < loud.size(); ++n)
                if (std::abs (loud[n]) > 0.1f * 0.89f)
                    tail = n;
            const double gap = std::max (0.3, (double) tail / sr + 0.05);

            std::vector<double> times;
            for (int i = 0; i < 10; ++i)
                times.push_back (0.1 + gap * i);
            checkHits (names[(std::size_t) which], drumTrack (which, sr, times, amps), sr, times, 1.0);
        }
    });

    test ("fast fills (16ths at 120 bpm; 8ths for long sounds) are all found", [&] {
        // Each hit lands on the previous one's ring, so allow 2 ms. Left out: claps (a clap is
        // several quick bursts; a 16th-note clap fill smears into one noise) and 808s (their
        // long gliding tails overlap and "beat"; real 808 lines cut the previous note).
        const double sr = 48000.0;
        const auto names = builtInNames();
        const std::vector<float> amps = { 0.9f, 0.75f, 0.8f, 0.7f, 0.95f, 0.8f, 0.85f, 1.0f };
        for (int which = 0; which < (int) BuiltIn::count; ++which)
        {
            const auto b = (BuiltIn) which;
            if (b == BuiltIn::clap || b == BuiltIn::kickDeep)
                continue;
            const bool longSound = b == BuiltIn::kickDeep || b == BuiltIn::tomHigh || b == BuiltIn::tomLow || b == BuiltIn::hatOpen;
            std::vector<double> times;
            for (int i = 0; i < 8; ++i)
                times.push_back (0.1 + (longSound ? 0.25 : 0.125) * i);
            checkHits (names[(std::size_t) which] + " fill", drumTrack (which, sr, times, amps), sr, times, 2.0);
        }
    });

    std::printf ("\n%d checks, %d failed\n", checks, failures);
    return failures == 0 ? 0 : 1;
}
