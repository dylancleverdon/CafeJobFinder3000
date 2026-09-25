#include "PluginProcessor.h"

#include "PluginEditor.h"
#include "SampleFiles.h"
#include "dsp/DrumSynth.h"

namespace
{
using juce::String;

float parseNumber (const String& text, float valueForOff)
{
    if (text.containsIgnoreCase ("off"))
        return valueForOff;
    return text.retainCharacters ("+-0123456789.").getFloatValue();
}

String decibels (float v)
{
    return v <= dr::Engine::offDb + 0.01f ? String ("Off") : String (v, 1) + " dB";
}

String hertz (float v)
{
    return v >= 1000.0f ? String (v / 1000.0f, 1) + " kHz" : String (juce::roundToInt (v)) + " Hz";
}

String percent (float v) { return String (juce::roundToInt (v)) + "%"; }

juce::AudioProcessorValueTreeState::ParameterLayout createLayout()
{
    using namespace juce;
    using Attributes = AudioParameterFloatAttributes;
    AudioProcessorValueTreeState::ParameterLayout layout;

    auto add = [&layout] (const char* id, const char* name, NormalisableRange<float> range, float def, Attributes attributes) {
        layout.add (std::make_unique<AudioParameterFloat> (ParameterID { id, 1 }, name, range, def, attributes));
    };

    add (ParamID::threshold, "Threshold", { -60.0f, 0.0f, 0.1f }, -30.0f,
         Attributes().withLabel ("dB")
             .withStringFromValueFunction ([] (float v, int) { return String (v, 1) + " dB"; })
             .withValueFromStringFunction ([] (const String& t) { return parseNumber (t, -60.0f); }));

    add (ParamID::sensitivity, "Sensitivity", { 0.0f, 100.0f, 1.0f }, 60.0f,
         Attributes().withLabel ("%")
             .withStringFromValueFunction ([] (float v, int) { return percent (v); })
             .withValueFromStringFunction ([] (const String& t) { return parseNumber (t, 0.0f); }));

    NormalisableRange<float> retrigger { 10.0f, 500.0f, 1.0f };
    retrigger.setSkewForCentre (80.0f);
    add (ParamID::retrigger, "Retrigger", retrigger, 50.0f,
         Attributes().withLabel ("ms")
             .withStringFromValueFunction ([] (float v, int) { return String (roundToInt (v)) + " ms"; })
             .withValueFromStringFunction ([] (const String& t) { return parseNumber (t, 10.0f); }));

    NormalisableRange<float> lowCut { 20.0f, 2000.0f, 1.0f };
    lowCut.setSkewForCentre (200.0f);
    add (ParamID::lowCut, "Low cut", lowCut, 20.0f,
         Attributes().withLabel ("Hz")
             .withStringFromValueFunction ([] (float v, int) { return v <= dr::Detector::lowCutOffHz ? String ("Off") : hertz (v); })
             .withValueFromStringFunction ([] (const String& t) {
                 const auto v = parseNumber (t, 20.0f);
                 return t.containsIgnoreCase ("k") ? v * 1000.0f : v;
             }));

    NormalisableRange<float> highCut { 50.0f, 20000.0f, 1.0f };
    highCut.setSkewForCentre (1000.0f);
    add (ParamID::highCut, "High cut", highCut, 20000.0f,
         Attributes().withLabel ("Hz")
             .withStringFromValueFunction ([] (float v, int) { return v >= dr::Detector::highCutOffHz ? String ("Off") : hertz (v); })
             .withValueFromStringFunction ([] (const String& t) {
                 const auto v = parseNumber (t, 20000.0f);
                 return t.containsIgnoreCase ("k") ? v * 1000.0f : v;
             }));

    layout.add (std::make_unique<AudioParameterBool> (ParameterID { ParamID::listen, 1 }, "Listen to detector", false));

    add (ParamID::pitch, "Pitch", { -12.0f, 12.0f, 0.1f }, 0.0f,
         Attributes().withLabel ("st")
             .withStringFromValueFunction ([] (float v, int) {
                 return std::abs (v) < 0.05f ? String ("0 st") : (v > 0 ? "+" : "") + String (v, 1) + " st";
             })
             .withValueFromStringFunction ([] (const String& t) { return parseNumber (t, 0.0f); }));

    add (ParamID::decay, "Decay", { 0.0f, 100.0f, 1.0f }, 100.0f,
         Attributes().withLabel ("%")
             .withStringFromValueFunction ([] (float v, int) { return v >= 99.9f ? String ("Full") : percent (v); })
             .withValueFromStringFunction ([] (const String& t) { return t.containsIgnoreCase ("full") ? 100.0f : parseNumber (t, 0.0f); }));

    add (ParamID::dynamics, "Dynamics", { 0.0f, 100.0f, 1.0f }, 100.0f,
         Attributes().withLabel ("%")
             .withStringFromValueFunction ([] (float v, int) { return percent (v); })
             .withValueFromStringFunction ([] (const String& t) { return parseNumber (t, 0.0f); }));

    layout.add (std::make_unique<AudioParameterBool> (ParameterID { ParamID::choke, 1 }, "Choke", false));

    layout.add (std::make_unique<AudioParameterChoice> (ParameterID { ParamID::sampleMode, 1 }, "Sample order",
                                                        StringArray { "Velocity layers", "Round robin" }, 0));

    add (ParamID::original, "Original", { dr::Engine::offDb, 6.0f, 0.1f }, dr::Engine::offDb,
         Attributes().withLabel ("dB")
             .withStringFromValueFunction ([] (float v, int) { return decibels (v); })
             .withValueFromStringFunction ([] (const String& t) { return parseNumber (t, dr::Engine::offDb); }));

    add (ParamID::replacement, "Replacement", { dr::Engine::offDb, 6.0f, 0.1f }, 0.0f,
         Attributes().withLabel ("dB")
             .withStringFromValueFunction ([] (float v, int) { return decibels (v); })
             .withValueFromStringFunction ([] (const String& t) { return parseNumber (t, dr::Engine::offDb); }));

    add (ParamID::timing, "Timing", { (float) -dr::Engine::maxEarlyMs, (float) dr::Engine::maxEarlyMs, 0.05f }, 0.0f,
         Attributes().withLabel ("ms")
             .withStringFromValueFunction ([] (float v, int) {
                 return std::abs (v) < 0.025f ? String ("0 ms") : (v > 0 ? "+" : "") + String (v, 2) + " ms";
             })
             .withValueFromStringFunction ([] (const String& t) { return parseNumber (t, 0.0f); }));

    layout.add (std::make_unique<AudioParameterInt> (
        ParameterID { ParamID::midiNote, 1 }, "MIDI note", 0, 127, 36,
        AudioParameterIntAttributes().withStringFromValueFunction ([] (int v, int) {
            // Ableton names middle C (60) "C3".
            return MidiMessage::getMidiNoteName (v, true, true, 3) + " (" + String (v) + ")";
        })));

    return layout;
}
} // namespace

DrumReplacerProcessor::DrumReplacerProcessor()
    : AudioProcessor (BusesProperties()
                          .withInput ("Input", juce::AudioChannelSet::stereo(), true)
                          .withOutput ("Output", juce::AudioChannelSet::stereo(), true)),
      state (*this, nullptr, "DrumReplacer", createLayout())
{
    thresholdParam = state.getRawParameterValue (ParamID::threshold);
    sensitivityParam = state.getRawParameterValue (ParamID::sensitivity);
    retriggerParam = state.getRawParameterValue (ParamID::retrigger);
    lowCutParam = state.getRawParameterValue (ParamID::lowCut);
    highCutParam = state.getRawParameterValue (ParamID::highCut);
    listenParam = state.getRawParameterValue (ParamID::listen);
    pitchParam = state.getRawParameterValue (ParamID::pitch);
    decayParam = state.getRawParameterValue (ParamID::decay);
    dynamicsParam = state.getRawParameterValue (ParamID::dynamics);
    chokeParam = state.getRawParameterValue (ParamID::choke);
    sampleModeParam = state.getRawParameterValue (ParamID::sampleMode);
    originalParam = state.getRawParameterValue (ParamID::original);
    replacementParam = state.getRawParameterValue (ParamID::replacement);
    timingParam = state.getRawParameterValue (ParamID::timing);
    midiNoteParam = state.getRawParameterValue (ParamID::midiNote);

    engine.setMeter (&meterFifo);
    dr::EngineParams p;
    readParameters (p);
    engine.setParams (p);
    engine.prepare (48000.0, 512); // so the latency is known before the host starts playback
    setLatencySamples (engine.latencySamples());

    useKit (dr::makeBuiltInKit (0));
    startTimer (2000);
}

DrumReplacerProcessor::~DrumReplacerProcessor()
{
    stopTimer();
}

void DrumReplacerProcessor::prepareToPlay (double sampleRate, int samplesPerBlock)
{
    dr::EngineParams p;
    readParameters (p);
    engine.setParams (p);
    engine.prepare (sampleRate, samplesPerBlock);
    setLatencySamples (engine.latencySamples());

    noteLengthSamples = juce::jmax (1, (int) (0.05 * sampleRate));
    noteIsOn = false;
}

bool DrumReplacerProcessor::isBusesLayoutSupported (const BusesLayout& layouts) const
{
    const auto out = layouts.getMainOutputChannelSet();
    if (out != juce::AudioChannelSet::mono() && out != juce::AudioChannelSet::stereo())
        return false;
    return layouts.getMainInputChannelSet() == out;
}

void DrumReplacerProcessor::readParameters (dr::EngineParams& p) const
{
    p.detector.thresholdDb = thresholdParam->load();
    p.detector.sensitivity = sensitivityParam->load() * 0.01f;
    p.detector.retriggerMs = retriggerParam->load();
    p.detector.lowCutHz = lowCutParam->load();
    p.detector.highCutHz = highCutParam->load();
    p.listen = listenParam->load() > 0.5f;
    p.pitchSemitones = pitchParam->load();
    p.decay = decayParam->load() * 0.01f;
    p.dynamics = dynamicsParam->load() * 0.01f;
    p.choke = chokeParam->load() > 0.5f;
    p.sampleMode = sampleModeParam->load() > 0.5f ? dr::SampleMode::roundRobin : dr::SampleMode::velocityLayers;
    p.originalDb = originalParam->load();
    p.replacementDb = replacementParam->load();
    p.timingMs = timingParam->load();
}

void DrumReplacerProcessor::processBlock (juce::AudioBuffer<float>& buffer, juce::MidiBuffer& midi)
{
    juce::ScopedNoDenormals noDenormals;

    {
        const juce::SpinLock::ScopedTryLockType lock (kitLock);
        if (lock.isLocked() && pendingKit != engine.getKit())
            engine.setKit (pendingKit);
    }

    dr::EngineParams p;
    readParameters (p);
    engine.setParams (p);

    const int numSamples = buffer.getNumSamples();
    const int numChannels = juce::jmin (2, getTotalNumInputChannels(), buffer.getNumChannels());
    for (int ch = numChannels; ch < buffer.getNumChannels(); ++ch)
        buffer.clear (ch, 0, numSamples);

    engine.process (buffer.getArrayOfWritePointers(), numChannels, numSamples);

    midi.clear();
    writeMidi (midi, numSamples);
}

void DrumReplacerProcessor::processBlockBypassed (juce::AudioBuffer<float>& buffer, juce::MidiBuffer& midi)
{
    // Pass the original through with the same delay, so bypassing doesn't shift the track.
    dr::EngineParams p;
    readParameters (p);
    p.originalDb = 0.0f;
    p.replacementDb = dr::Engine::offDb;
    p.listen = false;
    engine.setParams (p);

    const int numSamples = buffer.getNumSamples();
    const int numChannels = juce::jmin (2, getTotalNumInputChannels(), buffer.getNumChannels());
    for (int ch = numChannels; ch < buffer.getNumChannels(); ++ch)
        buffer.clear (ch, 0, numSamples);

    engine.process (buffer.getArrayOfWritePointers(), numChannels, numSamples);

    midi.clear();
    if (noteIsOn)
    {
        midi.addEvent (juce::MidiMessage::noteOff (1, noteOnNumber), 0);
        noteIsOn = false;
    }
}

void DrumReplacerProcessor::writeMidi (juce::MidiBuffer& midi, int numSamples)
{
    const int note = juce::jlimit (0, 127, (int) midiNoteParam->load());

    for (const auto& hit : engine.triggers())
    {
        if (noteIsOn)
        {
            midi.addEvent (juce::MidiMessage::noteOff (1, noteOnNumber), juce::jlimit (0, hit.offset, noteOffIn));
            noteIsOn = false;
        }

        const auto velocity = (juce::uint8) juce::jlimit (1, 127, juce::roundToInt (1.0f + hit.velocity * 126.0f));
        midi.addEvent (juce::MidiMessage::noteOn (1, note, velocity), hit.offset);
        noteIsOn = true;
        noteOnNumber = note;
        noteOffIn = hit.offset + noteLengthSamples;
    }

    if (noteIsOn)
    {
        if (noteOffIn < numSamples)
        {
            midi.addEvent (juce::MidiMessage::noteOff (1, noteOnNumber), juce::jmax (0, noteOffIn));
            noteIsOn = false;
        }
        else
        {
            noteOffIn -= numSamples;
        }
    }
}

juce::AudioProcessorEditor* DrumReplacerProcessor::createEditor()
{
    return new DrumReplacerEditor (*this);
}

// ---- Sounds ----

void DrumReplacerProcessor::useKit (dr::KitPtr kit)
{
    const juce::ScopedLock sl (soundLock);
    kitsInUse.push_back (kit);
    const juce::SpinLock::ScopedLockType lock (kitLock);
    pendingKit = std::move (kit);
}

void DrumReplacerProcessor::timerCallback()
{
    // Free old kits once neither the engine nor a still-ringing voice uses them.
    const juce::ScopedLock sl (soundLock);
    kitsInUse.erase (std::remove_if (kitsInUse.begin(), kitsInUse.end(),
                                     [] (const dr::KitPtr& kit) {
                                         if (kit.use_count() > 1)
                                             return false;
                                         for (auto& layer : kit->layers)
                                             for (auto& s : layer.variations)
                                                 if (s.use_count() > 1)
                                                     return false;
                                         return true;
                                     }),
                     kitsInUse.end());
}

void DrumReplacerProcessor::chooseBuiltIn (int index)
{
    {
        const juce::ScopedLock sl (soundLock);
        builtInIndex = juce::jlimit (0, (int) dr::BuiltIn::count - 1, index);
        userSamples.clear();
    }
    useKit (dr::makeBuiltInKit (index));
    sendChangeMessage();
}

bool DrumReplacerProcessor::isAudioFile (const juce::String& path)
{
    return juce::File (path).hasFileExtension ("wav;wave;aif;aiff;aifc;flac;ogg;mp3");
}

juce::String DrumReplacerProcessor::loadFiles (const juce::Array<juce::File>& files)
{
    juce::AudioFormatManager formats;
    formats.registerBasicFormats();

    std::vector<UserSample> loaded;
    juce::StringArray failed;
    for (const auto& file : files)
    {
        if (loaded.size() >= 32)
        {
            failed.add (file.getFileName() + " (only 32 files at once)");
            continue;
        }

        auto sample = SampleFiles::read (file, formats);
        if (! sample)
        {
            failed.add (file.getFileName());
            continue;
        }

        UserSample u;
        u.name = file.getFileNameWithoutExtension();
        u.path = file.getFullPathName();
        u.sample = std::move (*sample);
        u.data = SampleFiles::encode (u.sample, u.dataGain);
        loaded.push_back (std::move (u));
    }

    if (loaded.empty())
        return failed.isEmpty() ? juce::String ("No audio files found.")
                                : "Couldn't read " + failed.joinIntoString (", ") + ".";

    {
        const juce::ScopedLock sl (soundLock);
        userSamples = std::move (loaded);
    }
    rebuildUserKit();
    sendChangeMessage();

    return failed.isEmpty() ? juce::String() : "Skipped: " + failed.joinIntoString (", ") + ".";
}

void DrumReplacerProcessor::rebuildUserKit()
{
    std::vector<dr::Sample> samples;
    juce::String name;
    {
        const juce::ScopedLock sl (soundLock);
        for (const auto& u : userSamples)
            samples.push_back (u.sample);
        if (! userSamples.empty())
            name = userSamples.front().name;
    }

    if (! samples.empty())
        useKit (dr::makeUserKit (std::move (samples), name.toStdString()));
}

DrumReplacerProcessor::SoundInfo DrumReplacerProcessor::getSoundInfo() const
{
    const juce::ScopedLock sl (soundLock);
    SoundInfo info;
    info.builtIn = builtInIndex;
    info.userSamples = ! userSamples.empty();

    std::vector<const UserSample*> sorted;
    for (const auto& u : userSamples)
        sorted.push_back (&u);
    std::stable_sort (sorted.begin(), sorted.end(), [] (auto* a, auto* b) { return a->sample.peak < b->sample.peak; });
    for (auto* u : sorted)
        info.sampleNames.add (u->name);
    return info;
}

// ---- Saving and loading with the project ----

void DrumReplacerProcessor::getStateInformation (juce::MemoryBlock& destData)
{
    auto tree = state.copyState();
    tree.removeChild (tree.getChildWithName ("Sound"), nullptr);

    juce::ValueTree sound ("Sound");
    {
        const juce::ScopedLock sl (soundLock);
        sound.setProperty ("builtIn", builtInIndex, nullptr);
        for (const auto& u : userSamples)
        {
            juce::ValueTree s ("Sample");
            s.setProperty ("name", u.name, nullptr);
            s.setProperty ("path", u.path, nullptr);
            s.setProperty ("gain", u.dataGain, nullptr);
            s.setProperty ("data", juce::var (u.data), nullptr);
            sound.appendChild (s, nullptr);
        }
    }
    sound.setProperty ("loudestHit", engine.referenceDb(), nullptr);
    tree.appendChild (sound, nullptr);

    juce::MemoryOutputStream out (destData, false);
    tree.writeToStream (out);
}

void DrumReplacerProcessor::setStateInformation (const void* data, int sizeInBytes)
{
    auto tree = juce::ValueTree::readFromData (data, (size_t) sizeInBytes);
    if (! tree.isValid() || ! tree.hasType (state.state.getType()))
        return;

    const auto sound = tree.getChildWithName ("Sound").createCopy();
    tree.removeChild (tree.getChildWithName ("Sound"), nullptr);
    state.replaceState (tree);

    if (! sound.isValid())
        return;

    juce::AudioFormatManager formats;
    formats.registerBasicFormats();

    std::vector<UserSample> restored;
    for (const auto& s : sound)
    {
        UserSample u;
        u.name = s.getProperty ("name").toString();
        u.path = s.getProperty ("path").toString();
        u.dataGain = (float) s.getProperty ("gain", 1.0f);
        if (auto* block = s.getProperty ("data").getBinaryData())
            u.data = *block;

        auto sample = SampleFiles::decode (u.data, u.dataGain, formats);
        if (! sample && u.path.isNotEmpty()) // saved data unreadable: try the original file
        {
            sample = SampleFiles::read (juce::File (u.path), formats);
            if (sample)
                u.data = SampleFiles::encode (*sample, u.dataGain);
        }
        if (! sample)
            continue;

        u.sample = std::move (*sample);
        restored.push_back (std::move (u));
    }

    const int index = juce::jlimit (0, (int) dr::BuiltIn::count - 1, (int) sound.getProperty ("builtIn", 0));
    const bool haveUserSamples = ! restored.empty();
    {
        const juce::ScopedLock sl (soundLock);
        builtInIndex = index;
        userSamples = std::move (restored);
    }

    if (haveUserSamples)
        rebuildUserKit();
    else
        useKit (dr::makeBuiltInKit (index));

    const float loudest = (float) sound.getProperty ("loudestHit", -120.0f);
    engine.setReferenceDb (loudest);

    sendChangeMessage();
}

juce::AudioProcessor* JUCE_CALLTYPE createPluginFilter()
{
    return new DrumReplacerProcessor();
}
