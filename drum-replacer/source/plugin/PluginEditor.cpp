#include "PluginEditor.h"

#include "dsp/DrumSynth.h"

using namespace Look;

namespace
{
constexpr int editorWidth = 920;
constexpr int editorHeight = 560;
constexpr int userSamplesId = 100;

void styleSmallLabel (juce::Label& label, juce::Justification justification)
{
    label.setFont (font (13.0f));
    label.setColour (juce::Label::textColourId, Colours::muted);
    label.setJustificationType (justification);
    label.setInterceptsMouseClicks (false, false);
}
} // namespace

Knob::Knob (juce::AudioProcessorValueTreeState& state, const juce::String& paramId, const juce::String& name,
            juce::Colour colour, const juce::String& tooltip)
    : attachment (state, paramId, slider)
{
    title.setText (name.toUpperCase(), juce::dontSendNotification);
    title.setFont (font (11.5f, true));
    title.setColour (juce::Label::textColourId, Colours::muted);
    title.setJustificationType (juce::Justification::centred);
    title.setInterceptsMouseClicks (false, false);
    addAndMakeVisible (title);

    slider.setSliderStyle (juce::Slider::RotaryHorizontalVerticalDrag);
    slider.setTextBoxStyle (juce::Slider::TextBoxBelow, false, 90, 18);
    slider.setColour (juce::Slider::rotarySliderFillColourId, colour);
    slider.setRotaryParameters (juce::MathConstants<float>::pi * 1.2f, juce::MathConstants<float>::pi * 2.8f, true);
    slider.setDoubleClickReturnValue (true, (double) state.getParameter (paramId)->convertFrom0to1 (
                                                state.getParameter (paramId)->getDefaultValue()));
    slider.setTooltip (tooltip);
    addAndMakeVisible (slider);
}

void Knob::resized()
{
    auto area = getLocalBounds();
    title.setBounds (area.removeFromTop (16));
    slider.setBounds (area);
}

DrumReplacerEditor::DrumReplacerEditor (DrumReplacerProcessor& p)
    : AudioProcessorEditor (p),
      processor (p),
      state (p.parameters()),
      threshold (state, ParamID::threshold, "Threshold", Colours::detect,
                 "Only peaks louder than this count as hits. You can also drag the orange line in the display."),
      sensitivity (state, ParamID::sensitivity, "Sensitivity", Colours::detect,
                   "How easily a hit is noticed while the drum is still ringing from the last one. "
                   "Turn up if fast hits (rolls, flams) are missed; turn down if you get extra hits."),
      retrigger (state, ParamID::retrigger, "Retrigger", Colours::detect,
                 "The shortest time between two hits. Raise it if one hit sometimes triggers twice."),
      lowCut (state, ParamID::lowCut, "Low cut", Colours::detect,
              "The detector ignores everything below this. Raise it on a snare track to ignore kick bleed."),
      highCut (state, ParamID::highCut, "High cut", Colours::detect,
               "The detector ignores everything above this. Lower it (to about 100-150 Hz) on a kick track to ignore snare and cymbal bleed."),
      listenAttachment (state, ParamID::listen, listenButton),
      pitch (state, ParamID::pitch, "Pitch", Colours::sound, "Tunes the new sound up or down (in semitones)."),
      decay (state, ParamID::decay, "Decay", Colours::sound, "Shortens the new sound's tail. Full = the whole sample."),
      dynamics (state, ParamID::dynamics, "Dynamics", Colours::sound,
                "100% = soft hits stay soft and hard hits stay hard, like the original. 0% = every hit is equally loud."),
      chokeAttachment (state, ParamID::choke, chokeButton),
      original (state, ParamID::original, "Original", Colours::output,
                "Level of your original drum. Off = fully replaced. Turn it up to blend the two."),
      replacement (state, ParamID::replacement, "Replacement", Colours::output, "Level of the new sound."),
      timing (state, ParamID::timing, "Timing", Colours::output,
              "Nudges the new sound earlier (-) or later (+) to line it up with the original when blending."),
      midiNote (state, ParamID::midiNote, "MIDI note", Colours::output,
                "Every hit is also sent out as this MIDI note (with its velocity). "
                "To use it, set a MIDI track's \"MIDI From\" to this track and choose Drum Replacer.")
{
    tooltips.setLookAndFeel (&look);
    setSize (editorWidth, editorHeight);

    addAndMakeVisible (display);
    display.onDragStart = [this] {
        if (auto* param = state.getParameter (ParamID::threshold))
            param->beginChangeGesture();
    };
    display.onThresholdDragged = [this] (float db) {
        if (auto* param = state.getParameter (ParamID::threshold))
            param->setValueNotifyingHost (param->convertTo0to1 (db));
    };
    display.onDragEnd = [this] {
        if (auto* param = state.getParameter (ParamID::threshold))
            param->endChangeGesture();
    };

    styleSmallLabel (tagline, juce::Justification::centredLeft);
    tagline.setTooltip ("Drum Replacer updates itself in the background once it's installed with the one-line installer.");
    addAndMakeVisible (tagline);
    updateTagline();

    styleSmallLabel (hitsLabel, juce::Justification::centredLeft);
    styleSmallLabel (loudestLabel, juce::Justification::centredRight);
    loudestLabel.setTooltip ("How loud the hardest hit so far was. Softer hits are measured against it.");
    addAndMakeVisible (hitsLabel);
    addAndMakeVisible (loudestLabel);

    resetButton.setTooltip ("Forget the loudest hit and measure it again (useful after changing the track or the filters).");
    resetButton.onClick = [this] { processor.resetLoudestHit(); };
    addAndMakeVisible (resetButton);

    for (auto* knob : { &threshold, &sensitivity, &retrigger, &lowCut, &highCut, &pitch, &decay, &dynamics,
                        &original, &replacement, &timing, &midiNote })
        addAndMakeVisible (*knob);

    listenButton.setClickingTogglesState (true);
    listenButton.setColour (juce::TextButton::buttonOnColourId, Colours::detect);
    listenButton.setTooltip ("Hear exactly what the detector hears (after Low cut / High cut). Handy for setting the filters.");
    addAndMakeVisible (listenButton);

    soundBox.setTooltip ("The sound that replaces your drum. To use your own, drop audio files anywhere on this window or click Load.");
    soundBox.onChange = [this] {
        const int id = soundBox.getSelectedId();
        if (id >= 1 && id <= (int) dr::BuiltIn::count)
            processor.chooseBuiltIn (id - 1);
    };
    addAndMakeVisible (soundBox);

    loadButton.setTooltip ("Choose one or more audio files (WAV, AIFF, FLAC, OGG, MP3). "
                           "Several files of the same drum become velocity layers or round-robin variations.");
    loadButton.onClick = [this] {
        chooser = std::make_unique<juce::FileChooser> ("Choose drum samples", juce::File(), "*.wav;*.wave;*.aif;*.aiff;*.aifc;*.flac;*.ogg;*.mp3");
        chooser->launchAsync (juce::FileBrowserComponent::openMode | juce::FileBrowserComponent::canSelectFiles
                                  | juce::FileBrowserComponent::canSelectMultipleItems,
                              [this] (const juce::FileChooser& fc) { loadFiles (fc.getResults()); });
    };
    addAndMakeVisible (loadButton);

    soundInfo.setFont (font (12.5f));
    soundInfo.setColour (juce::Label::textColourId, Colours::muted);
    soundInfo.setJustificationType (juce::Justification::topLeft);
    soundInfo.setMinimumHorizontalScale (1.0f);
    soundInfo.setInterceptsMouseClicks (false, false);
    addAndMakeVisible (soundInfo);

    chokeButton.setClickingTogglesState (true);
    chokeButton.setTooltip ("Each new hit cuts off the previous one's tail (good for open hi-hats, or to keep things tight).");
    addAndMakeVisible (chokeButton);

    modeBox.addItemList ({ "Velocity layers", "Round robin" }, 1);
    modeAttachment = std::make_unique<juce::AudioProcessorValueTreeState::ComboBoxAttachment> (state, ParamID::sampleMode, modeBox);
    modeBox.setTooltip ("With several samples loaded: Velocity layers plays the softer files for softer hits; "
                        "Round robin takes turns through all of them.");
    addAndMakeVisible (modeBox);

    setLookAndFeel (&look); // last, so every child (and the knobs' value boxes) picks it up

    processor.addChangeListener (this);
    updateSoundInfo();
    lastHitCount = processor.hitCount();
    refresh();
    startTimerHz (30);
}

DrumReplacerEditor::~DrumReplacerEditor()
{
    processor.removeChangeListener (this);
    tooltips.setLookAndFeel (nullptr);
    setLookAndFeel (nullptr);
}

void DrumReplacerEditor::refresh()
{
    const int n = processor.meter().pop (points.data(), (int) points.size());
    display.addPoints (points.data(), n);
    display.setThresholdDb (state.getRawParameterValue (ParamID::threshold)->load());
    display.setListening (state.getRawParameterValue (ParamID::listen)->load() > 0.5f);

    const int hits = processor.hitCount();
    if (hits != lastHitCount)
    {
        flash = 1.0f;
        lastHitCount = hits;
    }
    else
    {
        flash = juce::jmax (0.0f, flash - 0.12f);
    }
    repaint (ledArea.expanded (2));

    hitsLabel.setText (juce::String (hits) + (hits == 1 ? " hit" : " hits"), juce::dontSendNotification);
    const float loudest = processor.loudestHitDb();
    loudestLabel.setText (loudest > -100.0f ? "Loudest hit " + juce::String (loudest, 1) + " dB" : juce::String ("No hits yet"),
                          juce::dontSendNotification);

    if (messageTicks > 0 && --messageTicks == 0)
        updateSoundInfo();

    if (++ticks % 90 == 0) // every 3 seconds
        updateTagline();
}

void DrumReplacerEditor::updateTagline()
{
    const auto status = UpdateStatus::read();
    const auto note = status.message();
    tagline.setText (note.isNotEmpty() ? note : "v" + status.running + "  -  finds every hit and plays your sound on it",
                     juce::dontSendNotification);
    tagline.setColour (juce::Label::textColourId, note.isNotEmpty() ? Colours::sound : Colours::muted);
}

void DrumReplacerEditor::updateSoundInfo()
{
    const auto info = processor.getSoundInfo();
    numUserSamples = info.sampleNames.size();

    // The menu lists the built-in sounds, plus "Your samples" while those are loaded.
    soundBox.clear (juce::dontSendNotification);
    soundBox.addSectionHeading ("Built-in sounds");
    const auto names = dr::builtInNames();
    for (int i = 0; i < (int) names.size(); ++i)
        soundBox.addItem (names[(size_t) i], i + 1);

    if (info.userSamples)
    {
        soundBox.addSeparator();
        soundBox.addItem ("Your samples", userSamplesId);
        soundBox.setSelectedId (userSamplesId, juce::dontSendNotification);
        const auto count = info.sampleNames.size();
        soundInfo.setText ((count == 1 ? juce::String ("Your sample: ") : "Your " + juce::String (count) + " samples (soft to hard): ")
                               + info.sampleNames.joinIntoString (", "),
                           juce::dontSendNotification);
    }
    else
    {
        soundBox.setSelectedId (info.builtIn + 1, juce::dontSendNotification);
        soundInfo.setText ("Built-in: 4 velocity layers x 3 variations. "
                           "Or drop your own samples anywhere on this window.",
                           juce::dontSendNotification);
    }

    modeBox.setEnabled (numUserSamples > 1);
    modeBox.setAlpha (numUserSamples > 1 ? 1.0f : 0.45f);

    if (messageTicks > 0)
    {
        soundInfo.setText (message, juce::dontSendNotification);
        soundInfo.setColour (juce::Label::textColourId, Colours::sound);
    }
    else
    {
        soundInfo.setColour (juce::Label::textColourId, Colours::muted);
    }
}

void DrumReplacerEditor::showMessage (const juce::String& text)
{
    message = text;
    messageTicks = text.isEmpty() ? 0 : 30 * 8; // 8 seconds
    updateSoundInfo();
}

void DrumReplacerEditor::loadFiles (const juce::Array<juce::File>& files)
{
    if (files.isEmpty())
        return;
    showMessage (processor.loadFiles (files));
}

bool DrumReplacerEditor::isInterestedInFileDrag (const juce::StringArray& files)
{
    for (const auto& f : files)
        if (DrumReplacerProcessor::isAudioFile (f))
            return true;
    return false;
}

void DrumReplacerEditor::fileDragEnter (const juce::StringArray&, int, int)
{
    dragHighlight = true;
    repaint();
}

void DrumReplacerEditor::fileDragExit (const juce::StringArray&)
{
    dragHighlight = false;
    repaint();
}

void DrumReplacerEditor::filesDropped (const juce::StringArray& files, int, int)
{
    dragHighlight = false;
    repaint();

    juce::Array<juce::File> audio;
    for (const auto& f : files)
        if (DrumReplacerProcessor::isAudioFile (f))
            audio.add (juce::File (f));
    loadFiles (audio);
}

void DrumReplacerEditor::paint (juce::Graphics& g)
{
    g.fillAll (Colours::background);

    // Title.
    g.setColour (Colours::text);
    g.setFont (font (22.0f, true));
    g.drawText ("DRUM REPLACER", 18, 22, 260, 28, juce::Justification::centredLeft);

    // Hit light.
    const auto led = ledArea.toFloat();
    g.setColour (Colours::sound.withAlpha (0.15f + 0.85f * flash));
    g.fillEllipse (led);
    if (flash > 0.0f)
    {
        g.setColour (Colours::sound.withAlpha (0.35f * flash));
        g.fillEllipse (led.expanded (3.0f * flash));
    }

    auto drawPanel = [&g] (juce::Rectangle<int> r, const juce::String& title, const juce::String& subtitle, juce::Colour colour) {
        const auto rf = r.toFloat();
        g.setColour (Colours::panel);
        g.fillRoundedRectangle (rf, 10.0f);
        g.setColour (Colours::panelEdge);
        g.drawRoundedRectangle (rf.reduced (0.5f), 10.0f, 1.0f);
        g.setColour (colour);
        g.fillRoundedRectangle (juce::Rectangle<float> (rf.getX() + 14.0f, rf.getY() + 13.0f, 4.0f, 14.0f), 2.0f);
        g.setColour (Colours::text);
        g.setFont (font (14.0f, true));
        g.drawText (title, r.getX() + 24, r.getY() + 10, 120, 20, juce::Justification::centredLeft);
        g.setColour (Colours::muted);
        g.setFont (font (12.0f));
        g.drawText (subtitle, r.getX() + 24 + 90, r.getY() + 10, r.getWidth() - 130, 20, juce::Justification::centredRight);
    };
    drawPanel (detectPanel, "DETECT", "what counts as a hit", Colours::detect);
    drawPanel (soundPanel, "SOUND", "what plays on each hit", Colours::sound);
    drawPanel (outputPanel, "OUTPUT", "what you hear", Colours::output);
}

void DrumReplacerEditor::paintOverChildren (juce::Graphics& g)
{
    if (! dragHighlight)
        return;
    const auto r = getLocalBounds().toFloat().reduced (6.0f);
    g.setColour (Colours::background.withAlpha (0.75f));
    g.fillRoundedRectangle (r, 12.0f);
    g.setColour (Colours::sound);
    g.drawRoundedRectangle (r, 12.0f, 2.0f);
    g.setFont (font (22.0f, true));
    g.drawText ("Drop to use these samples", r, juce::Justification::centred);
}

void DrumReplacerEditor::resized()
{
    auto area = getLocalBounds().reduced (16);

    auto header = area.removeFromTop (40);
    resetButton.setBounds (header.removeFromRight (64).withSizeKeepingCentre (64, 26));
    header.removeFromRight (6);
    loudestLabel.setBounds (header.removeFromRight (150));
    header.removeFromRight (10);
    hitsLabel.setBounds (header.removeFromRight (70));
    ledArea = header.removeFromRight (14).withSizeKeepingCentre (12, 12);
    header.removeFromRight (12);
    tagline.setBounds (header.withTrimmedLeft (190).withTrimmedTop (2));

    area.removeFromTop (8);
    display.setBounds (area.removeFromTop (200));
    area.removeFromTop (12);

    detectPanel = area.removeFromLeft (312);
    area.removeFromLeft (12);
    outputPanel = area.removeFromRight (248);
    area.removeFromRight (12);
    soundPanel = area;

    auto knobRow = [] (juce::Rectangle<int> row, std::initializer_list<juce::Component*> items) {
        const int w = row.getWidth() / (int) items.size();
        for (auto* c : items)
        {
            auto cell = row.removeFromLeft (w);
            if (c != nullptr)
                c->setBounds (cell);
        }
    };

    {
        auto r = detectPanel.reduced (8).withTrimmedTop (30);
        knobRow (r.removeFromTop (100), { &threshold, &sensitivity, &retrigger });
        r.removeFromTop (8);
        auto row = r.removeFromTop (100);
        const int w = row.getWidth() / 3;
        lowCut.setBounds (row.removeFromLeft (w));
        highCut.setBounds (row.removeFromLeft (w));
        listenButton.setBounds (row.withSizeKeepingCentre (juce::jmin (84, row.getWidth() - 8), 30).translated (0, 4));
    }

    {
        auto r = soundPanel.reduced (12).withTrimmedTop (26);
        auto selector = r.removeFromTop (30);
        loadButton.setBounds (selector.removeFromRight (80));
        selector.removeFromRight (8);
        soundBox.setBounds (selector);
        r.removeFromTop (6);
        soundInfo.setBounds (r.removeFromTop (34).expanded (3, 0));
        r.removeFromTop (2);
        knobRow (r.removeFromTop (100), { &pitch, &decay, &dynamics });
        r.removeFromTop (8);
        auto row = r.removeFromTop (28);
        chokeButton.setBounds (row.removeFromLeft (80));
        row.removeFromLeft (8);
        modeBox.setBounds (row);
    }

    {
        auto r = outputPanel.reduced (8).withTrimmedTop (30);
        knobRow (r.removeFromTop (100), { &original, &replacement });
        r.removeFromTop (8);
        knobRow (r.removeFromTop (100), { &timing, &midiNote });
    }
}
