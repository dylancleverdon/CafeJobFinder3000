#include "Look.h"

namespace Look
{
juce::Font font (float height, bool bold)
{
    return juce::Font (juce::FontOptions (height, bold ? juce::Font::bold : juce::Font::plain));
}

LookAndFeel::LookAndFeel()
{
    using namespace juce;
    setColour (ResizableWindow::backgroundColourId, Colours::background);
    setColour (Label::textColourId, Colours::text);
    setColour (Slider::textBoxTextColourId, Colours::text);
    setColour (Slider::textBoxOutlineColourId, juce::Colours::transparentBlack);
    setColour (Slider::textBoxBackgroundColourId, juce::Colours::transparentBlack);
    setColour (Slider::textBoxHighlightColourId, Colours::sound.withAlpha (0.4f));
    setColour (Slider::rotarySliderOutlineColourId, Colours::track);
    setColour (TextButton::buttonColourId, Colours::well);
    setColour (TextButton::buttonOnColourId, Colours::sound);
    setColour (TextButton::textColourOffId, Colours::text);
    setColour (TextButton::textColourOnId, Colours::background);
    setColour (ComboBox::backgroundColourId, Colours::well);
    setColour (ComboBox::textColourId, Colours::text);
    setColour (ComboBox::outlineColourId, Colours::panelEdge);
    setColour (ComboBox::arrowColourId, Colours::muted);
    setColour (PopupMenu::backgroundColourId, Colours::panel);
    setColour (PopupMenu::textColourId, Colours::text);
    setColour (PopupMenu::highlightedBackgroundColourId, Colours::sound.withAlpha (0.25f));
    setColour (PopupMenu::highlightedTextColourId, Colours::text);
    setColour (PopupMenu::headerTextColourId, Colours::muted);
    setColour (TooltipWindow::backgroundColourId, Colours::panel.brighter (0.15f));
    setColour (TooltipWindow::textColourId, Colours::text);
    setColour (TooltipWindow::outlineColourId, Colours::panelEdge);
    setColour (TextEditor::backgroundColourId, Colours::well);
    setColour (TextEditor::textColourId, Colours::text);
    setColour (TextEditor::highlightColourId, Colours::sound.withAlpha (0.4f));
    setColour (TextEditor::outlineColourId, juce::Colours::transparentBlack);
    setColour (TextEditor::focusedOutlineColourId, Colours::sound);
    setColour (CaretComponent::caretColourId, Colours::text);
}

void LookAndFeel::drawRotarySlider (juce::Graphics& g, int x, int y, int width, int height, float sliderPos,
                                    float startAngle, float endAngle, juce::Slider& slider)
{
    using namespace juce;
    const auto accent = slider.findColour (Slider::rotarySliderFillColourId);
    const auto bounds = Rectangle<int> (x, y, width, height).toFloat().reduced (4.0f);
    const float radius = jmin (bounds.getWidth(), bounds.getHeight()) * 0.5f;
    const auto centre = bounds.getCentre();
    const float lineWidth = jmax (3.0f, radius * 0.14f);
    const float arcRadius = radius - lineWidth * 0.5f;
    const float angle = startAngle + sliderPos * (endAngle - startAngle);

    Path track;
    track.addCentredArc (centre.x, centre.y, arcRadius, arcRadius, 0.0f, startAngle, endAngle, true);
    g.setColour (Colours::track);
    g.strokePath (track, PathStrokeType (lineWidth, PathStrokeType::curved, PathStrokeType::rounded));

    // Bipolar knobs (pitch, timing) fill from the middle.
    const bool bipolar = slider.getMinimum() < 0.0 && slider.getMaximum() > 0.0
                         && std::abs (slider.getMinimum() + slider.getMaximum()) < 1.0e-6;
    const float from = bipolar ? (startAngle + endAngle) * 0.5f : startAngle;
    if (std::abs (angle - from) > 0.001f)
    {
        Path value;
        value.addCentredArc (centre.x, centre.y, arcRadius, arcRadius, 0.0f, jmin (from, angle), jmax (from, angle), true);
        g.setColour (slider.isEnabled() ? accent : accent.withSaturation (0.0f));
        g.strokePath (value, PathStrokeType (lineWidth, PathStrokeType::curved, PathStrokeType::rounded));
    }

    const float knobRadius = arcRadius - lineWidth * 1.4f;
    g.setGradientFill (ColourGradient (Colours::panel.brighter (0.25f), centre.x, centre.y - knobRadius,
                                       Colours::well, centre.x, centre.y + knobRadius, false));
    g.fillEllipse (Rectangle<float> (knobRadius * 2.0f, knobRadius * 2.0f).withCentre (centre));
    g.setColour (Colours::panelEdge);
    g.drawEllipse (Rectangle<float> (knobRadius * 2.0f, knobRadius * 2.0f).withCentre (centre), 1.0f);

    const auto tip = centre.getPointOnCircumference (knobRadius * 0.78f, angle);
    const auto inner = centre.getPointOnCircumference (knobRadius * 0.25f, angle);
    g.setColour (Colours::text);
    g.drawLine ({ inner, tip }, jmax (2.0f, lineWidth * 0.6f));
}

juce::Label* LookAndFeel::createSliderTextBox (juce::Slider& slider)
{
    auto* label = LookAndFeel_V4::createSliderTextBox (slider);
    label->setFont (font (13.0f));
    label->setJustificationType (juce::Justification::centred);
    label->setColour (juce::Label::outlineColourId, juce::Colours::transparentBlack);
    label->setColour (juce::Label::backgroundColourId, juce::Colours::transparentBlack);
    label->setColour (juce::Label::textColourId, Colours::text);
    return label;
}

void LookAndFeel::drawButtonBackground (juce::Graphics& g, juce::Button& button, const juce::Colour&,
                                        bool highlighted, bool down)
{
    auto bounds = button.getLocalBounds().toFloat().reduced (0.5f);
    const bool on = button.getToggleState();
    auto fill = on ? button.findColour (juce::TextButton::buttonOnColourId) : Colours::well;
    if (highlighted)
        fill = fill.brighter (0.12f);
    if (down)
        fill = fill.darker (0.15f);
    g.setColour (fill);
    g.fillRoundedRectangle (bounds, 6.0f);
    g.setColour (on ? fill : Colours::panelEdge);
    g.drawRoundedRectangle (bounds, 6.0f, 1.0f);
}

juce::Font LookAndFeel::getTextButtonFont (juce::TextButton&, int buttonHeight)
{
    return font (juce::jmin (14.0f, (float) buttonHeight * 0.55f), true);
}

void LookAndFeel::drawComboBox (juce::Graphics& g, int width, int height, bool, int, int, int, int, juce::ComboBox& box)
{
    const auto bounds = juce::Rectangle<int> (width, height).toFloat().reduced (0.5f);
    g.setColour (Colours::well);
    g.fillRoundedRectangle (bounds, 6.0f);
    g.setColour (box.hasKeyboardFocus (true) ? Colours::sound : Colours::panelEdge);
    g.drawRoundedRectangle (bounds, 6.0f, 1.0f);

    juce::Path arrow;
    const float cx = (float) width - 14.0f, cy = (float) height * 0.5f;
    arrow.addTriangle (cx - 4.5f, cy - 2.0f, cx + 4.5f, cy - 2.0f, cx, cy + 3.0f);
    g.setColour (box.isEnabled() ? Colours::muted : Colours::track);
    g.fillPath (arrow);
}

juce::Font LookAndFeel::getComboBoxFont (juce::ComboBox&) { return font (14.0f); }
juce::Font LookAndFeel::getPopupMenuFont() { return font (14.0f); }

void LookAndFeel::positionComboBoxText (juce::ComboBox& box, juce::Label& label)
{
    label.setBounds (4, 1, box.getWidth() - 26, box.getHeight() - 2);
    label.setFont (getComboBoxFont (box));
}

juce::Font LookAndFeel::getLabelFont (juce::Label& label)
{
    return label.getFont();
}
} // namespace Look
