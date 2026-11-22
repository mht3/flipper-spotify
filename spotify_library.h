#pragma once

#include <stdbool.h>
#include <stddef.h>
#include <stdint.h>

enum {
    SpotifyRows = 4,
    SpotifyLabelBytes = 80,
    SpotifyLiked = 0x10,
    SpotifyPlaylists = 0x18,
    SpotifyAlbums = 0x19,
    SpotifyNowPlaying = 0x1c,
    SpotifyParent = 0x1d,
    SpotifyViewQueue = 0x1e,
    SpotifyCategories = 7,
    SpotifyNext = 0x11,
    SpotifyPrevious = 0x12,
    SpotifyPlay = 0x20,
    SpotifyQueue = 0x28,
    SpotifyChoosePlaylist = 0x30,
    SpotifyAddToPlaylist = 0x34,
    SpotifyCollectionTracks = 0x38,
    SpotifyPlayerPrevious = 0x40,
    SpotifyPlayerToggle = 0x41,
    SpotifyPlayerNext = 0x42,
    SpotifySetVolume = 0x43,
    SpotifyChooseCurrent = 0x46,
    SpotifyVolumeUnknown = 255,
    SpotifyAssignPreset = 0x50,
    SpotifyPlayPreset = 0x60,
    SpotifyReadPresets = 0x64,
    SpotifyClearPreset = 0x68,
    SpotifyHoldPlaylist = 0x70,
    SpotifyAssignLiked = 0x80,
    SpotifyHoldLiked = 0x84,
    SpotifySignIn = 0xf0,
    SpotifyHello = 0x15,
    SpotifyClear = 0x16,
};

typedef enum {
    SpotifyOk,
    SpotifyNoPlayer,
    SpotifyLogin,
    SpotifyOffline,
    SpotifyRestricted,
    SpotifyRateLimited,
    SpotifyVolumeUnavailable,
    SpotifyMissingPreset,
    SpotifyInvalid,
} SpotifyError;

typedef struct {
    char rows[SpotifyRows][SpotifyLabelBytes + 1];
    char staged[SpotifyRows][SpotifyLabelBytes + 1];
    uint8_t lengths[SpotifyRows];
    uint32_t offset;
    uint16_t page;
    uint16_t request;
    uint8_t op;
    uint8_t count;
    uint8_t selected;
    uint8_t play_state;
    uint8_t title_bytes;
    uint8_t volume;
    uint32_t duration_ms;
    uint32_t progress_ms;
    bool previous;
    bool next;
    bool collecting;
    bool accepted;
    bool preset_played;
    SpotifyError error;
} SpotifyLibrary;

extern const char* const spotify_category_names[SpotifyCategories];
extern const uint8_t spotify_category_ops[SpotifyCategories];

bool spotify_library_action_unconfirmed(const SpotifyLibrary* lib);
void spotify_library_begin(SpotifyLibrary* lib, uint8_t op, uint16_t request);
void spotify_library_fail(SpotifyLibrary* lib, SpotifyError error);
void spotify_library_receive(SpotifyLibrary* lib, const uint8_t* data, size_t size);
