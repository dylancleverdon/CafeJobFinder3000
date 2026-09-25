// Colours and the custom look of knobs, buttons and menus.
#pragma once

#include <juce_gui_basics/juce_gui_basics.h>

namespace Look
{
namespace Colours
{
    inline const juce::Colour background { 0xff121419 };
    inline const juce::Colour panel { 0xff1b1f27 };
    inline const juce::Colour panelEdge { 0xff2a303c };
    inline const juce::Colour well { 0xff0d0f13 };
    inline const juce::Colour text { 0xffe9ebef };
    inline const juce::Colour muted { 0xff8a93a3 };
    inline const juce::Colour track { 0xff303642 };
    inline const juce::Colour detect { 0xff38d6c9 }; // what the detector hears
    inline const juce::Colour sound { 0xffff8a3d };  // the new sound / hits
    inline const juce::Colour output { 0xffb99cff };
} // namespace Colours

juce::Font font (float height, bool bold = false);

class LookAndFeel final : public juce::LookAndFeel_V4
{
public:
    LookAndFeel();

    void drawRotarySlider (juce::Graphics&, int x, int y, int width, int height, float sliderPos,
                           float startAngle, float endAngle, juce::Slider&) override;
    juce::Label* createSliderTextBox (juce::Slider&) override;

    void drawButtonBackground (juce::Graphics&, juce::Button&, const juce::Colour& background,
                               bool highlighted, bool down) override;
    juce::Font getTextButtonFont (juce::TextButton&, int buttonHeight) override;

    void drawComboBox (juce::Graphics&, int width, int height, bool isButtonDown, int buttonX, int buttonY,
                       int buttonW, int buttonH, juce::ComboBox&) override;
    juce::Font getComboBoxFont (juce::ComboBox&) override;
    juce::Font getPopupMenuFont() override;
    void positionComboBoxText (juce::ComboBox&, juce::Label&) override;

    juce::Font getLabelFont (juce::Label&) override;
};
} // namespace Look
