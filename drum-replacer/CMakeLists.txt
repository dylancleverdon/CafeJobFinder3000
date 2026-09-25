# Drum Replacer: a VST3 / AU plugin that finds drum hits and plays a sample on each one.
#
#   cmake -B build -DCMAKE_BUILD_TYPE=Release
#   cmake --build build --config Release
#   ctest --test-dir build -C Release
#
# JUCE is downloaded automatically. To build only the engine tests (no JUCE, no
# GUI libraries): -DDR_BUILD_PLUGIN=OFF
cmake_minimum_required(VERSION 3.22)

set(CMAKE_OSX_DEPLOYMENT_TARGET "10.13" CACHE STRING "Oldest macOS the plugin runs on")
set(CMAKE_MSVC_RUNTIME_LIBRARY "MultiThreaded$<$<CONFIG:Debug>:Debug>") # no Visual C++ runtime install needed

# Each GitHub build passes its build number, so every build has a higher version (the updater relies on it).
set(DR_BUILD_NUMBER 0 CACHE STRING "Build number (last part of the version)")
project(DrumReplacer VERSION 1.0.${DR_BUILD_NUMBER} LANGUAGES C CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

option(DR_BUILD_PLUGIN "Build the plugin (downloads JUCE)" ON)
option(DR_BUILD_TESTS "Build the engine tests" ON)
option(DR_BUILD_CHECK "Build the plugin integration check / screenshot tool" OFF)

# The audio engine: plain C++, no plugin framework.
add_library(drum_engine STATIC
    source/dsp/DrumSynth.cpp
    source/dsp/Engine.cpp
    source/dsp/Kit.cpp)
target_include_directories(drum_engine PUBLIC source)
set_target_properties(drum_engine PROPERTIES POSITION_INDEPENDENT_CODE ON)
if(MSVC)
    target_compile_options(drum_engine PRIVATE /W4)
else()
    target_compile_options(drum_engine PRIVATE -Wall -Wextra -Wshadow)
endif()

if(DR_BUILD_TESTS)
    enable_testing()
    add_executable(drum_replacer_tests tests/EngineTests.cpp)
    target_link_libraries(drum_replacer_tests PRIVATE drum_engine)
    add_test(NAME engine COMMAND drum_replacer_tests)
endif()

if(DR_BUILD_PLUGIN)
    include(FetchContent)
    FetchContent_Declare(JUCE
        GIT_REPOSITORY https://github.com/juce-framework/JUCE.git
        GIT_TAG 8.0.15
        GIT_SHALLOW TRUE)
    FetchContent_MakeAvailable(JUCE)

    juce_add_plugin(DrumReplacer
        PRODUCT_NAME "Drum Replacer"
        COMPANY_NAME "dylancleverdon"
        BUNDLE_ID io.github.dylancleverdon.drumreplacer
        DESCRIPTION "Finds drum hits and replaces them with samples"
        PLUGIN_MANUFACTURER_CODE Dcln
        PLUGIN_CODE Drep
        FORMATS VST3 AU Standalone
        IS_SYNTH FALSE
        NEEDS_MIDI_INPUT FALSE
        NEEDS_MIDI_OUTPUT TRUE
        IS_MIDI_EFFECT FALSE
        EDITOR_WANTS_KEYBOARD_FOCUS FALSE
        COPY_PLUGIN_AFTER_BUILD FALSE
        VST3_CATEGORIES Fx)

    set(DR_PLUGIN_SOURCES
        source/plugin/HitDisplay.cpp
        source/plugin/Look.cpp
        source/plugin/PluginEditor.cpp
        source/plugin/PluginProcessor.cpp
        source/plugin/SampleFiles.cpp
        source/plugin/UpdateStatus.cpp)
    set(DR_JUCE_OPTIONS
        DR_VERSION="${PROJECT_VERSION}"
        JUCE_WEB_BROWSER=0
        JUCE_USE_CURL=0
        JUCE_VST3_CAN_REPLACE_VST2=0
        JUCE_USE_MP3AUDIOFORMAT=1
        JUCE_DISPLAY_SPLASH_SCREEN=0)

    target_sources(DrumReplacer PRIVATE ${DR_PLUGIN_SOURCES})
    target_compile_definitions(DrumReplacer PUBLIC ${DR_JUCE_OPTIONS})
    target_link_libraries(DrumReplacer
        PRIVATE
            drum_engine
            juce::juce_audio_utils
            juce::juce_audio_formats
        PUBLIC
            juce::juce_recommended_config_flags
            juce::juce_recommended_lto_flags
            juce::juce_recommended_warning_flags)

    if(DR_BUILD_CHECK)
        # Runs the plugin code outside a DAW: loading/saving samples, a drum track, MIDI out,
        # and can render the window to a PNG. Needs a display (on Linux use xvfb-run).
        juce_add_console_app(DrumReplacerCheck PRODUCT_NAME "DrumReplacerCheck")
        target_sources(DrumReplacerCheck PRIVATE tools/Check.cpp ${DR_PLUGIN_SOURCES})
        target_compile_definitions(DrumReplacerCheck PRIVATE ${DR_JUCE_OPTIONS} JucePlugin_Name="Drum Replacer")
        target_link_libraries(DrumReplacerCheck PRIVATE
            drum_engine
            juce::juce_audio_utils
            juce::juce_audio_formats
            juce::juce_recommended_config_flags)
        if(DR_BUILD_TESTS)
            add_test(NAME plugin COMMAND DrumReplacerCheck)
        endif()
    endif()
endif()
