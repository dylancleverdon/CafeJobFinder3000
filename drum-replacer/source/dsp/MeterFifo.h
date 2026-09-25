// Lock-free single-producer / single-consumer queue that carries the detector's
// level (and any hits) from the audio thread to the screen.
#pragma once

#include <array>
#include <atomic>
#include <cstdint>

namespace dr
{

struct MeterPoint
{
    float level = 0.0f;        // linear peak of the filtered detector signal over ~4 ms
    float hitVelocity = -1.0f; // 0..1 when a hit was detected in this slice, otherwise < 0
};

class MeterFifo
{
public:
    static constexpr std::uint32_t capacity = 4096; // power of two

    bool push (const MeterPoint& p) noexcept
    {
        const auto w = writeIndex.load (std::memory_order_relaxed);
        const auto r = readIndex.load (std::memory_order_acquire);
        if (w - r >= capacity)
            return false;
        buffer[w & (capacity - 1)] = p;
        writeIndex.store (w + 1, std::memory_order_release);
        return true;
    }

    int pop (MeterPoint* dest, int maxPoints) noexcept
    {
        const auto r = readIndex.load (std::memory_order_relaxed);
        const auto w = writeIndex.load (std::memory_order_acquire);
        int n = 0;
        while (r + (std::uint32_t) n != w && n < maxPoints)
        {
            dest[n] = buffer[(r + (std::uint32_t) n) & (capacity - 1)];
            ++n;
        }
        readIndex.store (r + (std::uint32_t) n, std::memory_order_release);
        return n;
    }

private:
    std::array<MeterPoint, capacity> buffer {};
    std::atomic<std::uint32_t> writeIndex { 0 }, readIndex { 0 };
};

} // namespace dr
