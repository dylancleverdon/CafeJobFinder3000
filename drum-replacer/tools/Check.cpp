// Integration check for the plugin code (not the engine alone):
//  - loads audio files as samples, saves the plugin state and restores it in a new instance
//  - plays a drum track through it and checks the hits and MIDI notes
//  - optionally renders the plugin window to a PNG:  DrumReplacerCheck [screenshot.png]
#include "../source/dsp/DrumSynth.h"
#include "../source/plugin/PluginEditor.h"
#include "../source/plugin/PluginProcessor.h"

#include <cstdio>

namespace
{
int failures = 0;

void check (bool ok, const char* what)
{
    std::printf ("%s %s\n", ok ? "ok  " : "FAIL", what);
    if (! ok)
        ++failures;
}

// Kick on 1 and 3, snare on 2 and 4, at 120 bpm, with a little noise.
juce::AudioBuffer<float> drumTrack (double sr, double seconds, int& numKicks)
{
    const auto kick = dr::makeBuiltInKit ((int) dr::BuiltIn::kickPunchy, sr);
    const auto snare = dr::makeBuiltInKit ((int) dr::BuiltIn::snareTight, sr);
    juce::AudioBuffer<float> track (2, (int) (seconds * sr));
    juce::Random random (1);
    for (int ch = 0; ch < 2; ++ch)
        for (int i = 0; i < track.getNumSamples(); ++i)
            track.setSample (ch, i, (random.nextFloat() - 0.5f) * 0.002f);

    numKicks = 0;
    int beat = 0;
    for (double t = 0.1; t < seconds - 0.8; t += 0.5, ++beat)
    {
        const bool isKick = beat % 2 == 0;
        const float velocity = isKick ? (beat % 4 == 0 ? 1.0f : 0.6f) : 0.9f;
        const auto& kit = isKick ? kick : snare;
        const auto& s = kit->layers[(size_t) juce::jmin (3, (int) (velocity * 4))].variations[(size_t) beat % 3]->channels[0];
        const float level = isKick ? velocity : velocity * 0.2f; // the snare is bleed in the kick mic
        const int start = (int) (t * sr);
        for (size_t n = 0; n < s.size() && start + (int) n < track.getNumSamples(); ++n)
            for (int ch = 0; ch < 2; ++ch)
                track.addSample (ch, start + (int) n, s[n] * level);
        numKicks += isKick ? 1 : 0;
    }
    return track;
}

juce::File writeWav (const juce::File& file, float frequency, float amplitude)
{
    const double sr = 44100.0;
    juce::AudioBuffer<float> buffer (1, 22050);
    buffer.clear();
    for (int i = 441; i < buffer.getNumSamples(); ++i) // 10 ms of silence first
    {
        const double t = (i - 441) / sr;
        buffer.setSample (0, i, amplitude * (float) (std::sin (6.283185307 * frequency * t) * std::exp (-t / 0.1)));
    }

    file.deleteFile();
    std::unique_ptr<juce::OutputStream> stream = std::make_unique<juce::FileOutputStream> (file);
    juce::WavAudioFormat wav;
    auto writer = wav.createWriterFor (stream, juce::AudioFormatWriterOptions {}.withSampleRate (sr).withNumChannels (1).withBitsPerSample (24));
    writer->writeFromAudioSampleBuffer (buffer, 0, buffer.getNumSamples());
    return file;
}
} // namespace

int main (int argc, char** argv)
{
    juce::ScopedJuceInitialiser_GUI gui;
    const double sr = 48000.0;
    const int block = 480;

    // --- Samples: load, save with the project, restore ---
    auto dir = juce::File::getSpecialLocation (juce::File::tempDirectory).getChildFile ("drum-replacer-check");
    dir.createDirectory();
    juce::Array<juce::File> files { writeWav (dir.getChildFile ("Kick soft.wav"), 60.0f, 0.3f),
                                    writeWav (dir.getChildFile ("Kick hard.wav"), 60.0f, 0.9f),
                                    dir.getChildFile ("not audio.txt") };
    files.getReference (2).replaceWithText ("hello");

    juce::MemoryBlock saved;
    {
        DrumReplacerProcessor proc;
        proc.setPlayConfigDetails (2, 2, sr, block);
        proc.prepareToPlay (sr, block);
        const auto message = proc.loadFiles (files);
        check (message.contains ("not audio.txt"), "unreadable files are reported");
        const auto info = proc.getSoundInfo();
        check (info.userSamples && info.sampleNames == juce::StringArray { "Kick soft", "Kick hard" }, "user samples loaded, soft to hard");
        proc.parameters().getParameter (ParamID::threshold)->setValueNotifyingHost (
            proc.parameters().getParameter (ParamID::threshold)->convertTo0to1 (-18.0f));
        proc.getStateInformation (saved);
    }

    for (auto& f : files)
        f.deleteFile(); // the project must not need the original files any more

    {
        DrumReplacerProcessor proc;
        proc.setStateInformation (saved.getData(), (int) saved.getSize());
        const auto info = proc.getSoundInfo();
        check (info.userSamples && info.sampleNames == juce::StringArray { "Kick soft", "Kick hard" }, "samples restored from the saved project");
        check (std::abs (proc.parameters().getRawParameterValue (ParamID::threshold)->load() + 18.0f) < 0.01f, "parameters restored");

        juce::MemoryBlock garbage ("not a plugin state", 18);
        proc.setStateInformation (garbage.getData(), (int) garbage.getSize());
        check (proc.getSoundInfo().userSamples, "garbage state is ignored");
    }

    // --- Play a drum track through the plugin ---
    DrumReplacerProcessor proc;
    proc.setPlayConfigDetails (2, 2, sr, block);
    proc.prepareToPlay (sr, block);
    check (proc.getLatencySamples() == 576, "reports 12 ms latency at 48 kHz");

    auto& params = proc.parameters();
    auto set = [&params] (const char* id, float value) {
        auto* p = params.getParameter (id);
        p->setValueNotifyingHost (p->convertTo0to1 (value));
    };
    set (ParamID::threshold, -20.0f);
    set (ParamID::highCut, 100.0f);

    int numKicks = 0;
    auto track = drumTrack (sr, 6.0, numKicks);

    std::unique_ptr<juce::AudioProcessorEditor> editor (proc.createEditor());
    auto* ed = dynamic_cast<DrumReplacerEditor*> (editor.get());

    int noteOns = 0, noteOffs = 0;
    juce::AudioBuffer<float> buffer (2, block);
    juce::MidiBuffer midi;
    bool finite = true;
    for (int pos = 0; pos + block <= track.getNumSamples(); pos += block)
    {
        for (int ch = 0; ch < 2; ++ch)
            buffer.copyFrom (ch, 0, track, ch, pos, block);
        proc.processBlock (buffer, midi);
        for (const auto meta : midi)
        {
            noteOns += meta.getMessage().isNoteOn() ? 1 : 0;
            noteOffs += meta.getMessage().isNoteOff() ? 1 : 0;
        }
        for (int ch = 0; ch < 2; ++ch)
            for (int i = 0; i < block; ++i)
                finite = finite && std::isfinite (buffer.getSample (ch, i));
        if (ed != nullptr && (pos / block) % 3 == 0)
            ed->refresh();
    }

    std::printf ("     %d kicks in the track, %d hits found, %d note-ons, %d note-offs\n", numKicks, proc.hitCount(), noteOns, noteOffs);
    check (proc.hitCount() == numKicks, "every kick is found and the snare bleed is ignored");
    check (noteOns == numKicks && noteOffs == numKicks, "one MIDI note per hit");
    check (finite, "output is clean");

    if (argc > 1 && ed != nullptr)
    {
        ed->refresh();
        const auto image = editor->createComponentSnapshot (editor->getLocalBounds(), true, 2.0f);
        juce::File out = juce::File::getCurrentWorkingDirectory().getChildFile (argv[1]);
        out.deleteFile();
        juce::FileOutputStream stream (out);
        juce::PNGImageFormat().writeImageToStream (image, stream);
        std::printf ("wrote %s\n", out.getFullPathName().toRawUTF8());
    }

    editor.reset();
    std::printf ("\n%s\n", failures == 0 ? "all good" : "SOME CHECKS FAILED");
    return failures == 0 ? 0 : 1;
}
