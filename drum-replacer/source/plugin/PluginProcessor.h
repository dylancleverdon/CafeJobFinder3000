#pragma once

#include "dsp/Engine.h"

#include <juce_audio_processors/juce_audio_processors.h>
#include <juce_audio_formats/juce_audio_formats.h>

// Parameter IDs. These are saved in Ableton projects: never rename them.
namespace ParamID
{
inline constexpr auto threshold = "threshold";
inline constexpr auto sensitivity = "sensitivity";
inline constexpr auto retrigger = "retrigger";
inline constexpr auto lowCut = "lowCut";
inline constexpr auto highCut = "highCut";
inline constexpr auto listen = "listen";
inline constexpr auto pitch = "pitch";
inline constexpr auto decay = "decay";
inline constexpr auto dynamics = "dynamics";
inline constexpr auto choke = "choke";
inline constexpr auto sampleMode = "sampleMode";
inline constexpr auto original = "original";
inline constexpr auto replacement = "replacement";
inline constexpr auto timing = "timing";
inline constexpr auto midiNote = "midiNote";
} // namespace ParamID

class DrumReplacerProcessor final : public juce::AudioProcessor,
                                    public juce::ChangeBroadcaster,
                                    private juce::Timer
{
public:
    DrumReplacerProcessor();
    ~DrumReplacerProcessor() override;

    void prepareToPlay (double sampleRate, int samplesPerBlock) override;
    void releaseResources() override {}
    bool isBusesLayoutSupported (const BusesLayout& layouts) const override;
    void processBlock (juce::AudioBuffer<float>&, juce::MidiBuffer&) override;
    void processBlockBypassed (juce::AudioBuffer<float>&, juce::MidiBuffer&) override;
    using AudioProcessor::processBlock;
    using AudioProcessor::processBlockBypassed;

    juce::AudioProcessorEditor* createEditor() override;
    bool hasEditor() const override { return true; }

    const juce::String getName() const override { return JucePlugin_Name; }
    bool acceptsMidi() const override { return false; }
    bool producesMidi() const override { return true; }
    bool isMidiEffect() const override { return false; }
    double getTailLengthSeconds() const override { return 2.0; }

    int getNumPrograms() override { return 1; }
    int getCurrentProgram() override { return 0; }
    void setCurrentProgram (int) override {}
    const juce::String getProgramName (int) override { return {}; }
    void changeProgramName (int, const juce::String&) override {}

    void getStateInformation (juce::MemoryBlock& destData) override;
    void setStateInformation (const void* data, int sizeInBytes) override;

    // ---- For the editor (message thread) ----
    juce::AudioProcessorValueTreeState& parameters() { return state; }
    dr::MeterFifo& meter() { return meterFifo; }
    int hitCount() const { return engine.hitCount(); }
    float lastVelocity() const { return engine.lastVelocity(); }
    float loudestHitDb() const { return engine.referenceDb(); }
    void resetLoudestHit() { engine.resetReference(); }

    struct SoundInfo
    {
        bool userSamples = false;
        int builtIn = 0;
        juce::StringArray sampleNames; // the user's files, quiet -> loud
    };
    SoundInfo getSoundInfo() const;

    void chooseBuiltIn (int index);

    // Loads audio files as the new sound. Returns a message for the user if some failed.
    juce::String loadFiles (const juce::Array<juce::File>& files);

    static bool isAudioFile (const juce::String& path);

private:
    struct UserSample
    {
        juce::String name, path;
        juce::MemoryBlock data; // the trimmed audio, FLAC-compressed, saved with the project
        float dataGain = 1.0f;  // multiply `data` by this when decoding
        dr::Sample sample;
    };

    void timerCallback() override;
    void readParameters (dr::EngineParams& p) const;
    void useKit (dr::KitPtr kit);
    void rebuildUserKit();
    void writeMidi (juce::MidiBuffer& midi, int numSamples);

    juce::AudioProcessorValueTreeState state;
    dr::Engine engine;
    dr::MeterFifo meterFifo;

    // The audio thread picks up a new kit from here without waiting on a lock.
    juce::SpinLock kitLock;
    dr::KitPtr pendingKit;
    std::vector<dr::KitPtr> kitsInUse; // freed on the message thread once nothing plays them

    mutable juce::CriticalSection soundLock;
    int builtInIndex = 0;
    std::vector<UserSample> userSamples;

    std::atomic<float>* thresholdParam = nullptr;
    std::atomic<float>* sensitivityParam = nullptr;
    std::atomic<float>* retriggerParam = nullptr;
    std::atomic<float>* lowCutParam = nullptr;
    std::atomic<float>* highCutParam = nullptr;
    std::atomic<float>* listenParam = nullptr;
    std::atomic<float>* pitchParam = nullptr;
    std::atomic<float>* decayParam = nullptr;
    std::atomic<float>* dynamicsParam = nullptr;
    std::atomic<float>* chokeParam = nullptr;
    std::atomic<float>* sampleModeParam = nullptr;
    std::atomic<float>* originalParam = nullptr;
    std::atomic<float>* replacementParam = nullptr;
    std::atomic<float>* timingParam = nullptr;
    std::atomic<float>* midiNoteParam = nullptr;

    // MIDI out: each hit sends a short note.
    bool noteIsOn = false;
    int noteOnNumber = 36;
    int noteOffIn = 0;
    int noteLengthSamples = 2400;

    JUCE_DECLARE_NON_COPYABLE_WITH_LEAK_DETECTOR (DrumReplacerProcessor)
};
