#include "DrumSynth.h"

#include <algorithm>
#include <cmath>
#include <cstdint>

namespace dr
{

namespace
{
    constexpr double twoPi = 6.28318530717958647692;

    struct Rng
    {
        explicit Rng (std::uint32_t seed) : state (seed ? seed : 0x9e3779b9u) {}

        float bipolar() // -1 .. 1
        {
            state ^= state << 13;
            state ^= state >> 17;
            state ^= state << 5;
            return (float) ((double) state / 2147483648.0 - 1.0);
        }

        std::uint32_t state;
    };

    // RBJ cookbook biquads.
    struct Biquad
    {
        static Biquad make (int type, double freq, double q, double sr)
        {
            const double w = twoPi * std::min (freq, sr * 0.45) / sr;
            const double cw = std::cos (w), alpha = std::sin (w) / (2.0 * q);
            double b0, b1, b2;
            if (type == 0) // low-pass
            {
                b0 = (1.0 - cw) * 0.5;
                b1 = 1.0 - cw;
                b2 = b0;
            }
            else if (type == 1) // high-pass
            {
                b0 = (1.0 + cw) * 0.5;
                b1 = -(1.0 + cw);
                b2 = b0;
            }
            else // band-pass, 0 dB peak
            {
                b0 = alpha;
                b1 = 0.0;
                b2 = -alpha;
            }
            const double a0 = 1.0 + alpha;
            Biquad f;
            f.b0 = (float) (b0 / a0);
            f.b1 = (float) (b1 / a0);
            f.b2 = (float) (b2 / a0);
            f.a1 = (float) (-2.0 * cw / a0);
            f.a2 = (float) ((1.0 - alpha) / a0);
            return f;
        }

        static Biquad lowpass (double f, double sr, double q = 0.7071) { return make (0, f, q, sr); }
        static Biquad highpass (double f, double sr, double q = 0.7071) { return make (1, f, q, sr); }
        static Biquad bandpass (double f, double sr, double q) { return make (2, f, q, sr); }

        float operator() (float x)
        {
            const float y = b0 * x + z1;
            z1 = b1 * x - a1 * y + z2;
            z2 = b2 * x - a2 * y;
            return y;
        }

        float b0 = 1, b1 = 0, b2 = 0, a1 = 0, a2 = 0, z1 = 0, z2 = 0;
    };

    // Saturation on the start of the sound only (adds punch), fading to clean over
    // ~40 ms so the tail keeps its natural decay.
    float saturate (float x, float drive, double t)
    {
        const float mix = (float) std::exp (-t / 0.04);
        const float shaped = (float) (std::tanh (drive * x) / std::tanh (drive));
        return mix * shaped + (1.0f - mix) * x;
    }

    // Everything a sound needs: sample rate, intensity (0.25 soft .. 1 hard) and a random source.
    struct Voice
    {
        double sr;
        float k;
        Rng rng;

        float vary (float amount) { return 1.0f + amount * rng.bipolar(); }
        std::size_t samples (double seconds) const { return (std::size_t) (seconds * sr); }
    };

    std::vector<float> kick (Voice v, bool deep)
    {
        const float k = v.k;
        const double fEnd = (deep ? 44.0 : 52.0) * v.vary (0.012f);
        const double fStart = deep ? 110.0 + 70.0 * k : 150.0 + 190.0 * k;
        const double pitchTau = (deep ? 0.065 : 0.028) * v.vary (0.05f);
        const double ampTau = (deep ? 0.50 : 0.16) * v.vary (0.05f);
        const float clickLevel = deep ? 0.05f + 0.20f * k : 0.12f + 0.55f * k;
        const float drive = deep ? 1.0f + 1.4f * k : 1.2f + 2.6f * k;

        std::vector<float> out (v.samples (deep ? 1.6 : 0.75));
        auto clickHp = Biquad::highpass (2600.0, v.sr);
        auto clickLp = Biquad::lowpass (6000.0 + 8000.0 * k, v.sr);
        double phase = 0.0;
        for (std::size_t n = 0; n < out.size(); ++n)
        {
            const double t = (double) n / v.sr;
            const double f = fEnd + (fStart - fEnd) * std::exp (-t / pitchTau);
            const float body = (float) (std::sin (phase) * std::exp (-t / ampTau));
            phase += twoPi * f / v.sr;
            const float click = clickLp (clickHp (v.rng.bipolar())) * (float) std::exp (-t / 0.0028) * clickLevel;
            out[n] = saturate (body + click, drive, t);
        }
        return out;
    }

    std::vector<float> snare (Voice v, bool fat)
    {
        const float k = v.k;
        const double f1 = (fat ? 160.0 : 188.0) * v.vary (0.01f);
        const double f2 = (fat ? 272.0 : 332.0) * v.vary (0.01f);
        const double tau1 = (fat ? 0.085 : 0.050) * v.vary (0.05f);
        const double tau2 = (fat ? 0.050 : 0.030) * v.vary (0.05f);
        const double noiseTau = (fat ? 0.17 : 0.085) * (0.85 + 0.3 * k) * v.vary (0.06f);
        const float noiseLevel = 0.45f + 0.35f * k;
        const float drive = fat ? 1.6f + 1.4f * k : 1.1f + 1.0f * k;

        std::vector<float> out (v.samples (fat ? 0.8 : 0.5));
        auto noiseHp = Biquad::highpass (fat ? 950.0 : 1600.0, v.sr);
        auto noiseLp = Biquad::lowpass ((fat ? 4500.0 : 6000.0) + 5500.0 * k, v.sr);
        auto clickHp = Biquad::highpass (3000.0, v.sr);
        double p1 = 0.0, p2 = 0.0;
        for (std::size_t n = 0; n < out.size(); ++n)
        {
            const double t = (double) n / v.sr;
            const double bend = 1.0 + 0.22 * std::exp (-t / 0.012);
            const float tone = (float) (0.85 * std::sin (p1) * std::exp (-t / tau1) + 0.45 * std::sin (p2) * std::exp (-t / tau2));
            p1 += twoPi * f1 * bend / v.sr;
            p2 += twoPi * f2 * bend / v.sr;
            const float noise = noiseLp (noiseHp (v.rng.bipolar())) * (float) std::exp (-t / noiseTau) * noiseLevel * 2.2f;
            const float click = clickHp (v.rng.bipolar()) * (float) std::exp (-t / 0.0018) * (0.15f + 0.45f * k);
            out[n] = saturate (tone + noise + click, drive, t);
        }
        return out;
    }

    std::vector<float> clap (Voice v)
    {
        const float k = v.k;
        std::vector<float> out (v.samples (0.6));
        auto bp = Biquad::bandpass (1150.0 * v.vary (0.04f), v.sr, 1.1);
        auto lp = Biquad::lowpass (4000.0 + 5000.0 * k, v.sr);
        const double bursts[] = { 0.0, 0.0095 * v.vary (0.1f), 0.0190 * v.vary (0.08f), 0.0300 * v.vary (0.05f) };
        const double tailTau = (0.10 + 0.05 * k) * v.vary (0.06f);
        for (std::size_t n = 0; n < out.size(); ++n)
        {
            const double t = (double) n / v.sr;
            double env = 0.0;
            for (double b : bursts)
                if (t >= b)
                    env = std::max (env, std::exp (-(t - b) / 0.0042));
            if (t >= bursts[3])
                env = std::max (env, 0.55 * std::exp (-(t - bursts[3]) / tailTau));
            out[n] = lp (bp (v.rng.bipolar())) * (float) env * 3.0f;
        }
        return out;
    }

    std::vector<float> rimshot (Voice v)
    {
        const float k = v.k;
        std::vector<float> out (v.samples (0.2));
        auto bp = Biquad::bandpass (2600.0, v.sr, 1.4);
        const double f1 = 1720.0 * v.vary (0.01f), f2 = 505.0 * v.vary (0.01f);
        for (std::size_t n = 0; n < out.size(); ++n)
        {
            const double t = (double) n / v.sr;
            const float tone = (float) (std::sin (twoPi * f1 * t) * std::exp (-t / (0.010 + 0.004 * k))
                                        + 0.6 * std::sin (twoPi * f2 * t) * std::exp (-t / 0.028));
            const float click = bp (v.rng.bipolar()) * (float) std::exp (-t / 0.005) * (0.5f + 0.8f * k);
            out[n] = saturate (tone + click, 1.3f + k, t);
        }
        return out;
    }

    std::vector<float> tom (Voice v, bool high)
    {
        const float k = v.k;
        const double fEnd = (high ? 188.0 : 96.0) * v.vary (0.012f);
        const double fStart = fEnd * (1.06 + 0.10 * k); // harder hits bend the pitch more
        const double ampTau = (high ? 0.30 : 0.45) * v.vary (0.05f);
        std::vector<float> out (v.samples (high ? 0.95 : 1.35));
        auto noiseLp = Biquad::lowpass (2500.0 + 3500.0 * k, v.sr);
        double p1 = 0.0, p2 = 0.0;
        for (std::size_t n = 0; n < out.size(); ++n)
        {
            const double t = (double) n / v.sr;
            const double f = fEnd + (fStart - fEnd) * std::exp (-t / 0.08);
            const float body = (float) (std::sin (p1) * std::exp (-t / ampTau) + 0.3 * std::sin (p2) * std::exp (-t / (ampTau * 0.4)));
            p1 += twoPi * f / v.sr;
            p2 += twoPi * f * 1.58 / v.sr;
            const float attack = noiseLp (v.rng.bipolar()) * (float) std::exp (-t / 0.012) * (0.12f + 0.35f * k);
            out[n] = saturate (body + attack, 1.1f + 0.9f * k, t);
        }
        return out;
    }

    std::vector<float> hat (Voice v, bool open)
    {
        const float k = v.k;
        static const double metal[] = { 205.3, 304.4, 369.6, 522.7, 540.0, 800.0 };
        std::vector<float> out (v.samples (open ? 1.0 : 0.25));
        auto bp = Biquad::bandpass (10000.0 * v.vary (0.03f), v.sr, 0.9);
        auto hp1 = Biquad::highpass (6500.0 - 1500.0 * k, v.sr);
        auto hp2 = Biquad::highpass (6500.0 - 1500.0 * k, v.sr);
        const double tau = (open ? 0.30 + 0.12 * k : 0.032 + 0.016 * k) * v.vary (0.06f);
        const double detune = v.vary (0.01f);
        for (std::size_t n = 0; n < out.size(); ++n)
        {
            const double t = (double) n / v.sr;
            float m = 0.0f;
            for (double f : metal)
                m += std::sin (twoPi * f * detune * 1.7 * t) >= 0.0 ? 1.0f : -1.0f;
            const float src = 0.55f * m / 6.0f + 0.45f * v.rng.bipolar();
            const float env = (float) (std::exp (-t / tau) * (1.0 - std::exp (-t / 0.0004)));
            out[n] = hp2 (hp1 (bp (src))) * env * 4.0f;
        }
        return out;
    }

    std::vector<float> render (BuiltIn which, Voice v)
    {
        switch (which)
        {
            case BuiltIn::kickPunchy: return kick (v, false);
            case BuiltIn::kickDeep:   return kick (v, true);
            case BuiltIn::snareTight: return snare (v, false);
            case BuiltIn::snareFat:   return snare (v, true);
            case BuiltIn::clap:       return clap (v);
            case BuiltIn::rimshot:    return rimshot (v);
            case BuiltIn::tomHigh:    return tom (v, true);
            case BuiltIn::tomLow:     return tom (v, false);
            case BuiltIn::hatClosed:  return hat (v, false);
            case BuiltIn::hatOpen:    return hat (v, true);
            case BuiltIn::count:      break;
        }
        return {};
    }

    void finish (std::vector<float>& x, double sr)
    {
        // Short fade at the end, then normalise to -1 dBFS.
        const auto fade = std::min (x.size(), (std::size_t) (0.01 * sr));
        for (std::size_t i = 0; i < fade; ++i)
            x[x.size() - 1 - i] *= (float) i / (float) fade;

        float peak = 0.0f;
        for (float s : x)
            peak = std::max (peak, std::abs (s));
        if (peak > 0.0f)
            for (float& s : x)
                s *= 0.89f / peak;
    }
}

std::vector<std::string> builtInNames()
{
    return { "Kick - Punchy", "Kick - Deep 808", "Snare - Tight", "Snare - Fat", "Clap",
             "Rimshot", "Tom - High", "Tom - Low", "Hi-hat - Closed", "Hi-hat - Open" };
}

KitPtr makeBuiltInKit (int index, double sampleRate)
{
    const int count = (int) BuiltIn::count;
    index = std::clamp (index, 0, count - 1);
    const auto which = (BuiltIn) index;

    auto kit = std::make_shared<Kit>();
    kit->name = builtInNames()[(std::size_t) index];

    constexpr int numLayers = 4, numVariations = 3;
    for (int layer = 0; layer < numLayers; ++layer)
    {
        Layer l;
        for (int variation = 0; variation < numVariations; ++variation)
        {
            const auto seed = (std::uint32_t) (1 + index * 7919 + layer * 104729 + variation * 15485863);
            Voice v { sampleRate, 0.25f * (float) (layer + 1), Rng (seed) };
            for (int i = 0; i < 8; ++i) // decorrelate nearby seeds
                v.rng.bipolar();

            auto s = std::make_shared<Sample>();
            s->name = kit->name;
            s->sampleRate = sampleRate;
            s->channels.push_back (render (which, v));
            finish (s->channels.front(), sampleRate);
            updatePeak (*s);
            l.variations.push_back (std::move (s));
        }
        kit->layers.push_back (std::move (l));
    }
    return kit;
}

} // namespace dr
