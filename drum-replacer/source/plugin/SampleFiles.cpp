#include "SampleFiles.h"

namespace SampleFiles
{
namespace
{
    constexpr double maxSeconds = 10.0;

    std::optional<dr::Sample> fromReader (juce::AudioFormatReader& reader)
    {
        if (reader.sampleRate <= 0.0 || reader.numChannels == 0 || reader.lengthInSamples <= 0)
            return std::nullopt;

        const auto numChannels = (int) juce::jmin (2u, reader.numChannels);
        const auto length = (int) juce::jmin (reader.lengthInSamples, (juce::int64) (maxSeconds * reader.sampleRate));

        juce::AudioBuffer<float> buffer (numChannels, length);
        if (! reader.read (&buffer, 0, length, 0, true, numChannels > 1))
            return std::nullopt;

        dr::Sample s;
        s.sampleRate = reader.sampleRate;
        for (int ch = 0; ch < numChannels; ++ch)
            s.channels.emplace_back (buffer.getReadPointer (ch), buffer.getReadPointer (ch) + length);
        return s;
    }
} // namespace

std::optional<dr::Sample> read (const juce::File& file, juce::AudioFormatManager& formats)
{
    std::unique_ptr<juce::AudioFormatReader> reader (formats.createReaderFor (file));
    if (reader == nullptr)
        return std::nullopt;

    auto s = fromReader (*reader);
    if (! s)
        return std::nullopt;

    s->name = file.getFileNameWithoutExtension().toStdString();
    dr::prepareOneShot (*s, maxSeconds);
    if (s->length() == 0 || s->peak <= 0.0f)
        return std::nullopt; // silent file
    return s;
}

juce::MemoryBlock encode (const dr::Sample& sample, float& gain)
{
    const auto numChannels = sample.numChannels();
    const auto length = (int) sample.length();
    gain = juce::jmax (1.0f, sample.peak);

    juce::AudioBuffer<float> buffer (numChannels, length);
    for (int ch = 0; ch < numChannels; ++ch)
        for (int i = 0; i < length; ++i)
            buffer.setSample (ch, i, sample.channels[(size_t) ch][(size_t) i] / gain);

    const auto options = juce::AudioFormatWriterOptions{}
                             .withSampleRate (sample.sampleRate)
                             .withNumChannels (numChannels)
                             .withBitsPerSample (24);

    juce::FlacAudioFormat flac;
    juce::WavAudioFormat wav;
    for (juce::AudioFormat* format : { static_cast<juce::AudioFormat*> (&flac), static_cast<juce::AudioFormat*> (&wav) })
    {
        juce::MemoryBlock block;
        {
            std::unique_ptr<juce::OutputStream> stream = std::make_unique<juce::MemoryOutputStream> (block, false);
            auto writer = format->createWriterFor (stream, options);
            if (writer == nullptr || ! writer->writeFromAudioSampleBuffer (buffer, 0, length))
                continue;
        } // the writer finishes the file when it goes away
        if (block.getSize() > 0)
            return block;
    }
    return {};
}

std::optional<dr::Sample> decode (const juce::MemoryBlock& data, float gain, juce::AudioFormatManager& formats)
{
    if (data.getSize() == 0)
        return std::nullopt;

    std::unique_ptr<juce::AudioFormatReader> reader (
        formats.createReaderFor (std::make_unique<juce::MemoryInputStream> (data, false)));
    if (reader == nullptr)
        return std::nullopt;

    auto s = fromReader (*reader);
    if (! s)
        return std::nullopt;

    if (gain > 1.0f)
        for (auto& ch : s->channels)
            for (auto& v : ch)
                v *= gain;

    dr::updatePeak (*s);
    return s;
}
} // namespace SampleFiles
