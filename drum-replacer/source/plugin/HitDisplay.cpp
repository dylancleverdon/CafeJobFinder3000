#include "HitDisplay.h"

#include "Look.h"

#include <cmath>

HitDisplay::HitDisplay() : history (historySize)
{
    setTooltip ("What the detector hears. Every orange mark is a detected hit (taller = harder). "
                "Drag up or down to move the threshold line: only peaks above it count as hits.");
}

void HitDisplay::addPoints (const dr::MeterPoint* points, int count)
{
    for (int i = 0; i < count; ++i)
    {
        history[(size_t) writeIndex] = points[i];
        writeIndex = (writeIndex + 1) % historySize;
        anySignal = anySignal || points[i].level > 1.0e-4f;
    }
    if (count > 0)
        repaint();
}

void HitDisplay::setThresholdDb (float db)
{
    if (std::abs (db - thresholdDb) > 0.001f)
    {
        thresholdDb = db;
        repaint();
    }
}

void HitDisplay::setListening (bool isListening)
{
    if (listening != isListening)
    {
        listening = isListening;
        repaint();
    }
}

juce::Rectangle<float> HitDisplay::plotArea() const
{
    return getLocalBounds().toFloat().reduced (1.0f).withTrimmedLeft (34.0f).withTrimmedRight (6.0f).withTrimmedTop (8.0f).withTrimmedBottom (8.0f);
}

float HitDisplay::dbToY (float db) const
{
    const auto area = plotArea();
    const float t = (juce::jlimit (minDb, maxDb, db) - minDb) / (maxDb - minDb);
    return area.getBottom() - t * area.getHeight();
}

float HitDisplay::yToDb (float y) const
{
    const auto area = plotArea();
    const float t = (area.getBottom() - y) / area.getHeight();
    return juce::jlimit (minDb, maxDb, minDb + t * (maxDb - minDb));
}

void HitDisplay::paint (juce::Graphics& g)
{
    using namespace Look;
    const auto bounds = getLocalBounds().toFloat();
    g.setColour (Colours::well);
    g.fillRoundedRectangle (bounds, 8.0f);
    g.setColour (Colours::panelEdge);
    g.drawRoundedRectangle (bounds.reduced (0.5f), 8.0f, 1.0f);

    const auto area = plotArea();

    // dB grid.
    g.setFont (font (11.0f));
    for (float db = 0.0f; db >= minDb; db -= 12.0f)
    {
        const float y = dbToY (db);
        g.setColour (Colours::panelEdge.withAlpha (0.6f));
        g.drawHorizontalLine ((int) y, area.getX(), area.getRight());
        g.setColour (Colours::muted.withAlpha (0.8f));
        g.drawText (juce::String ((int) db), juce::Rectangle<float> (4.0f, y - 7.0f, 26.0f, 14.0f), juce::Justification::centredRight);
    }

    // Level, oldest on the left.
    const int width = juce::jmax (1, (int) area.getWidth());
    juce::Path level;
    level.startNewSubPath (area.getX(), area.getBottom());
    std::vector<std::pair<float, float>> hits; // x, velocity
    for (int px = 0; px < width; ++px)
    {
        const int first = (int) ((double) px / width * historySize);
        const int last = juce::jmax (first + 1, (int) ((double) (px + 1) / width * historySize));
        float peak = 0.0f, hit = -1.0f;
        for (int i = first; i < last; ++i)
        {
            const auto& p = history[(size_t) ((writeIndex + i) % historySize)];
            peak = juce::jmax (peak, p.level);
            hit = juce::jmax (hit, p.hitVelocity);
        }
        const float db = peak > 1.0e-6f ? 20.0f * std::log10 (peak) : minDb;
        level.lineTo (area.getX() + (float) px, dbToY (db));
        if (hit >= 0.0f)
            hits.emplace_back (area.getX() + (float) px, hit);
    }
    level.lineTo (area.getRight(), area.getBottom());
    level.closeSubPath();

    g.setGradientFill (juce::ColourGradient (Colours::detect.withAlpha (0.55f), 0.0f, area.getY(),
                                             Colours::detect.withAlpha (0.08f), 0.0f, area.getBottom(), false));
    g.fillPath (level);
    g.setColour (Colours::detect.withAlpha (0.9f));
    g.strokePath (level, juce::PathStrokeType (1.2f));

    // Hits: a line with a dot, higher for harder hits.
    for (auto [x, velocity] : hits)
    {
        const float top = area.getBottom() - (0.15f + 0.85f * velocity) * area.getHeight();
        g.setColour (Colours::sound.withAlpha (0.45f));
        g.drawLine (x, area.getBottom(), x, top, 1.5f);
        g.setColour (Colours::sound);
        g.fillEllipse (juce::Rectangle<float> (7.0f, 7.0f).withCentre ({ x, top }));
    }

    // Threshold.
    const float ty = dbToY (thresholdDb);
    g.setColour (Colours::sound.withAlpha (dragging ? 1.0f : 0.85f));
    g.drawLine (area.getX(), ty, area.getRight(), ty, dragging ? 2.0f : 1.5f);
    const juce::String label = "Threshold " + juce::String (thresholdDb, 1) + " dB";
    g.setFont (font (12.0f, true));
    const auto labelArea = juce::Rectangle<float> (area.getRight() - 150.0f, ty < area.getY() + 20.0f ? ty + 3.0f : ty - 19.0f, 146.0f, 16.0f);
    g.drawText (label, labelArea, juce::Justification::centredRight);

    if (listening)
    {
        g.setColour (Colours::detect);
        g.setFont (font (12.0f, true));
        g.drawText ("LISTENING TO THE DETECTOR", area.reduced (8.0f, 6.0f), juce::Justification::topLeft);
    }

    if (! anySignal)
    {
        g.setColour (Colours::muted);
        g.setFont (font (14.0f));
        g.drawFittedText ("Play your drum track: its level shows here and every detected hit gets an orange mark.\n"
                          "Drag the orange line so it sits above the quiet parts and below the hits.",
                          area.reduced (40.0f, 10.0f).toNearestInt(), juce::Justification::centred, 3);
    }
}

void HitDisplay::mouseDown (const juce::MouseEvent& e)
{
    dragging = true;
    if (onDragStart)
        onDragStart();
    if (onThresholdDragged)
        onThresholdDragged (yToDb ((float) e.y));
    repaint();
}

void HitDisplay::mouseDrag (const juce::MouseEvent& e)
{
    if (onThresholdDragged)
        onThresholdDragged (yToDb ((float) e.y));
}

void HitDisplay::mouseUp (const juce::MouseEvent&)
{
    dragging = false;
    if (onDragEnd)
        onDragEnd();
    repaint();
}

void HitDisplay::mouseMove (const juce::MouseEvent&)
{
    setMouseCursor (juce::MouseCursor::UpDownResizeCursor);
}
