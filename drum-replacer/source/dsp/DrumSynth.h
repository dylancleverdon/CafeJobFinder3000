// Built-in sounds, synthesised on the fly so the plugin works before any
// samples are loaded. Each sound has 4 velocity layers (softer hits are darker
// and have less click) with 3 slightly different round-robin variations each.
#pragma once

#include "Kit.h"

#include <string>
#include <vector>

namespace dr
{

enum class BuiltIn
{
    kickPunchy = 0,
    kickDeep,
    snareTight,
    snareFat,
    clap,
    rimshot,
    tomHigh,
    tomLow,
    hatClosed,
    hatOpen,
    count
};

std::vector<std::string> builtInNames();

KitPtr makeBuiltInKit (int index, double sampleRate = 48000.0);

} // namespace dr
