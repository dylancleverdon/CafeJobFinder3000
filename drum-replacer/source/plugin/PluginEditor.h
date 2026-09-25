#pragma once

#include "HitDisplay.h"
#include "Look.h"
#include "PluginProcessor.h"
#include "UpdateStatus.h"

// A knob with its name above and its value below.
class Knob final : public juce::Component
{
public:
    Knob (juce::AudioProcessorValueTreeState& state, const juce::String& paramId, const juce::String& name,
          juce::Colour colour, const juce::String& tooltip);

    void resized() override;

private:
    juce::Label title;
    juce::Slider slider;
    juce::AudioProcessorValueTreeState::SliderAttachment attachment;
};

class DrumReplacerEditor final : public juce::AudioProcessorEditor,
                                 public juce::FileDragAndDropTarget,
                                 private juce::ChangeListener,
                                 private juce::Timer
{
public:
    explicit DrumReplacerEditor (DrumReplacerProcessor&);
    ~DrumReplacerEditor() override;

    void paint (juce::Graphics&) override;
    void paintOverChildren (juce::Graphics&) override;
    void resized() override;

    bool isInterestedInFileDrag (const juce::StringArray& files) override;
    void fileDragEnter (const juce::StringArray&, int, int) override;
    void fileDragExit (const juce::StringArray&) override;
    void filesDropped (const juce::StringArray& files, int, int) override;

    // Pulls the latest levels and hits from the processor (normally called by the timer).
    void refresh();

private:
    void timerCallback() override { refresh(); }
    void changeListenerCallback (juce::ChangeBroadcaster*) override { updateSoundInfo(); }
    void updateSoundInfo();
    void updateTagline();
    void loadFiles (const juce::Array<juce::File>& files);
    void showMessage (const juce::String& text);

    DrumReplacerProcessor& processor;
    juce::AudioProcessorValueTreeState& state;
    Look::LookAndFeel look;
    juce::TooltipWindow tooltips { this, 700 };

    HitDisplay display;
    juce::Label tagline, hitsLabel, loudestLabel;
    juce::TextButton resetButton { "Reset" };

    Knob threshold, sensitivity, retrigger, lowCut, highCut;
    juce::TextButton listenButton { "Listen" };
    juce::AudioProcessorValueTreeState::ButtonAttachment listenAttachment;

    juce::ComboBox soundBox;
    juce::TextButton loadButton { "Load..." };
    juce::Label soundInfo;
    Knob pitch, decay, dynamics;
    juce::TextButton chokeButton { "Choke" };
    juce::AudioProcessorValueTreeState::ButtonAttachment chokeAttachment;
    juce::ComboBox modeBox;
    std::unique_ptr<juce::AudioProcessorValueTreeState::ComboBoxAttachment> modeAttachment; // made after the items

    Knob original, replacement, timing, midiNote;

    juce::Rectangle<int> detectPanel, soundPanel, outputPanel, ledArea;
    std::unique_ptr<juce::FileChooser> chooser;
    juce::String message;
    int messageTicks = 0;
    int lastHitCount = 0;
    int ticks = 0;
    float flash = 0.0f;
    bool dragHighlight = false;
    int numUserSamples = 0;

    std::vector<dr::MeterPoint> points = std::vector<dr::MeterPoint> (dr::MeterFifo::capacity);

    JUCE_DECLARE_NON_COPYABLE_WITH_LEAK_DETECTOR (DrumReplacerEditor)
};
