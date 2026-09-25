// Scrolling picture of what the detector hears: the level, the threshold line
// (drag it up/down) and a marker on every hit, taller for harder hits.
#pragma once

#include "dsp/MeterFifo.h"

#include <juce_gui_basics/juce_gui_basics.h>

class HitDisplay final : public juce::Component, public juce::SettableTooltipClient
{
public:
    HitDisplay();

    void addPoints (const dr::MeterPoint* points, int count);
    void setThresholdDb (float db);
    void setListening (bool isListening);

    std::function<void()> onDragStart, onDragEnd;
    std::function<void (float)> onThresholdDragged;

    void paint (juce::Graphics&) override;
    void mouseDown (const juce::MouseEvent&) override;
    void mouseDrag (const juce::MouseEvent&) override;
    void mouseUp (const juce::MouseEvent&) override;
    void mouseMove (const juce::MouseEvent&) override;

    static constexpr float minDb = -60.0f;
    static constexpr float maxDb = 0.0f;

private:
    juce::Rectangle<float> plotArea() const;
    float dbToY (float db) const;
    float yToDb (float y) const;

    static constexpr int historySize = 900; // ~3.6 s at one point per 4 ms
    std::vector<dr::MeterPoint> history;
    int writeIndex = 0;
    bool anySignal = false;

    float thresholdDb = -30.0f;
    bool listening = false;
    bool dragging = false;
};
