#include "spotify_playback.h"
#include <string.h>

void spotify_playback_tick(
    SpotifyPlayback* playback,
    SpotifyScreen* screen,
    uint32_t now,
    uint32_t ticks_per_second) {
    uint32_t elapsed = playback->anchor_s;
    if(screen->play_state == 1) elapsed += (now - playback->anchor_time) / ticks_per_second;
    screen->elapsed_s = elapsed < screen->duration_s ? elapsed : screen->duration_s;
}

void spotify_playback_toggle(SpotifyPlayback* playback, SpotifyScreen* screen, uint32_t now) {
    if(!screen->now_playing[0] || !screen->play_state) return;
    playback->previous_s = playback->anchor_s;
    playback->previous_time = playback->anchor_time;
    playback->expected_state = screen->play_state == 1 ? 2 : 1;
    playback->toggle_time = now;
    playback->anchor_s = screen->elapsed_s;
    playback->anchor_time = now;
    screen->play_state = playback->expected_state;
}

void spotify_playback_reject(SpotifyPlayback* playback, SpotifyScreen* screen) {
    if(!playback->expected_state) return;
    screen->play_state = playback->expected_state == 1 ? 2 : 1;
    playback->anchor_s = playback->previous_s;
    playback->anchor_time = playback->previous_time;
    playback->expected_state = 0;
}

void spotify_playback_update(
    SpotifyPlayback* playback,
    SpotifyScreen* screen,
    const SpotifyLibrary* status,
    uint32_t now) {
    if(status->error && status->error != SpotifyNoPlayer && status->error != SpotifyLogin) return;
    if(status->error || !status->count) {
        // A paused player can disappear from Spotify Connect while the phone is still linked.
        if(status->error != SpotifyLogin && screen->now_playing[0] && screen->play_state == 2) {
            playback->expected_state = 0;
            return;
        }
        if(!status->error && playback->expected_state) return;
        screen->now_playing[0] = 0;
        screen->play_state = screen->title_bytes = 0;
        screen->elapsed_s = screen->duration_s = 0;
        *playback = (SpotifyPlayback){0};
        return;
    }
    // Ignore the old state of the same song while confirming a transport command.
    if(playback->expected_state && status->play_state != playback->expected_state &&
       screen->duration_s == status->duration_ms / 1000 &&
       strcmp(status->rows[0], screen->now_playing) == 0)
        return;
    playback->expected_state = 0;
    playback->anchor_s = status->progress_ms / 1000;
    playback->anchor_time = now;
    screen->play_state = status->play_state;
    screen->title_bytes = status->title_bytes;
    screen->duration_s = status->duration_ms / 1000;
    screen->elapsed_s = playback->anchor_s;
    memcpy(screen->now_playing, status->rows[0], sizeof(screen->now_playing));
}
