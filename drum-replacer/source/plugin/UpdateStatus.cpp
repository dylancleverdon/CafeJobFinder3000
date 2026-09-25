#include "UpdateStatus.h"

juce::File UpdateStatus::folder()
{
   #if JUCE_WINDOWS
    return juce::File::getSpecialLocation (juce::File::commonApplicationDataDirectory).getChildFile ("Drum Replacer");
   #elif JUCE_MAC
    return juce::File::getSpecialLocation (juce::File::userHomeDirectory).getChildFile ("Library/Application Support/Drum Replacer");
   #else
    return juce::File::getSpecialLocation (juce::File::userApplicationDataDirectory).getChildFile ("Drum Replacer");
   #endif
}

UpdateStatus UpdateStatus::read()
{
    UpdateStatus s;
    const auto dir = folder();
    s.installed = dir.getChildFile ("installed-version.txt").loadFileAsString().trim();
    s.pending = dir.getChildFile ("pending-version.txt").loadFileAsString().trim();
    return s;
}

bool UpdateStatus::isNewer (const juce::String& a, const juce::String& b)
{
    juce::StringArray pa, pb;
    pa.addTokens (a, ".", {});
    pb.addTokens (b, ".", {});
    if (a.isEmpty() || b.isEmpty())
        return a.isNotEmpty();
    for (int i = 0; i < juce::jmax (pa.size(), pb.size()); ++i)
    {
        const int x = pa[i].getIntValue(), y = pb[i].getIntValue();
        if (x != y)
            return x > y;
    }
    return false;
}

juce::String UpdateStatus::message() const
{
    if (isNewer (pending, running) && ! isNewer (installed, pending) && pending != installed)
        return "Update " + pending + " downloaded: it installs by itself once you close Ableton.";
    if (isNewer (installed, running))
        return "Update " + installed + " installed: close and reopen Ableton to use it.";
    return {};
}
