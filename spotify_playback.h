#pragma once

#include "spotify_screen.h"

typedef struct {
    uint32_t anchor_time;
    uint32_t anchor_s;
    uint32_t toggle_time;
    uint32_t previous_time;
    uint32_t previous_s;
    uint8_t expected_state;
} SpotifyPlayback;

// All timestamps use the same monotonic tick counter.
void spotify_playback_tick(
    SpotifyPlayback* playback,
    SpotifyScreen* screen,
    uint32_t now,
    uint32_t ticks_per_second);
void spotify_playback_toggle(SpotifyPlayback* playback, SpotifyScreen* screen, uint32_t now);
void spotify_playback_reject(SpotifyPlayback* playback, SpotifyScreen* screen);
void spotify_playback_update(
    SpotifyPlayback* playback,
    SpotifyScreen* screen,
    const SpotifyLibrary* status,
    uint32_t now);
