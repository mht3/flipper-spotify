#include "spotify_screen.h"
#include <momentum/settings.h>
#include <stdio.h>
#include <string.h>

static void
    draw_text_width(Canvas* canvas, int x, int width, const char* text, int y, uint32_t scroll) {
    int extra = (int)canvas_string_width(canvas, text) - width;
    unsigned offset = 0;
    if(extra > 0) {
        unsigned phase = scroll % ((unsigned)extra + 34);
        if(phase > 16) offset = MIN(phase - 16, (unsigned)extra);
    }
    canvas_draw_str(canvas, x - (int)offset, y, text);
}

static void draw_text(Canvas* canvas, int x, const char* text, int y, uint32_t scroll) {
    draw_text_width(canvas, x, 126 - x, text, y, scroll);
}

static void draw_label(Canvas* canvas, const char* text, int y, uint32_t scroll) {
    draw_text(canvas, 4, text, y, scroll);
}

// List icons are redrawn after labels so long names may scroll without covering them.
static void row_icon(Canvas* c, uint8_t op, int y) {
    if(op == SpotifyPlaylists || op == SpotifyChoosePlaylist) {
        for(int i = 0; i < 3; ++i)
            canvas_draw_line(c, 3, y + 2 * i, 10 - i, y + 2 * i);
        canvas_draw_box(c, 10, y + 4, 2, 2);
    } else if(op == SpotifyAlbums) {
        canvas_draw_frame(c, 3, y - 1, 8, 8);
        canvas_draw_frame(c, 5, y + 1, 4, 4);
    } else if(op == SpotifyReadPresets) {
        canvas_draw_line(c, 3, y + 3, 11, y + 3);
        canvas_draw_line(c, 7, y - 1, 7, y + 7);
        canvas_draw_frame(c, 5, y + 1, 5, 5);
    } else if(op == SpotifySignIn) {
        canvas_draw_str(c, 5, y + 7, "?");
    } else if(op == SpotifyViewQueue) {
        for(int i = 0; i < 3; ++i) {
            canvas_draw_dot(c, 3, y + 2 * i);
            canvas_draw_line(c, 5, y + 2 * i, 11, y + 2 * i);
        }
    } else if(op == SpotifyNowPlaying) {
        for(int i = 0; i < 4; ++i)
            canvas_draw_line(c, 4 + i, y + i, 4 + i, y + 6 - i);
    } else {
        canvas_draw_line(c, 4, y, 7, y + 3);
        canvas_draw_line(c, 7, y + 3, 10, y);
        canvas_draw_line(c, 3, y + 2, 7, y + 6);
        canvas_draw_line(c, 7, y + 6, 11, y + 2);
    }
}

static void playlist_cover(Canvas* c, const char* name, int y) {
    uint16_t hash = 5381;
    for(const unsigned char* p = (const unsigned char*)name; *p; ++p)
        hash = hash * 33 + *p;
    canvas_draw_frame(c, 3, y, 9, 9);
    static const uint8_t tiles[8][5] = {
        {4, 14, 31, 14, 4},
        {17, 10, 4, 10, 17},
        {0, 27, 31, 14, 4},
        {4, 12, 31, 12, 4},
        {4, 10, 17, 31, 0},
        {8, 15, 9, 27, 18},
        {1, 3, 7, 15, 31},
        {0, 21, 10, 21, 0},
    };
    const uint8_t* tile = tiles[hash % 8];
    for(int row = 0; row < 5; ++row)
        for(int col = 0; col < 5; ++col)
            if(tile[row] & (1 << col)) canvas_draw_dot(c, 5 + col, y + 2 + row);
}

static void highlight(Canvas* c, int y, int height, bool selected) {
    if(selected) {
        canvas_draw_rbox(c, 0, y, 128, height, 2);
        canvas_set_color(c, ColorWhite);
    }
}

static void now_bar(Canvas* canvas, const SpotifyScreen* screen) {
    canvas_draw_box(canvas, 0, 51, 128, 13);
    canvas_set_color(canvas, ColorWhite);
    // Scroll the title, reserving the first 13 pixels for playback state.
    draw_text_width(
        canvas,
        15,
        97,
        screen->now_playing[0] ? screen->now_playing : "Nothing playing",
        61,
        screen->scroll);
    canvas_set_color(canvas, ColorBlack);
    canvas_draw_box(canvas, 0, 52, 13, 12);
    canvas_set_color(canvas, ColorWhite);
    if(screen->play_state == 1) {
        for(int i = 0; i < 4; ++i)
            canvas_draw_line(canvas, 4 + i, 54 + i, 4 + i, 61 - i);
    } else if(screen->play_state == 2) {
        canvas_draw_box(canvas, 4, 55, 2, 6);
        canvas_draw_box(canvas, 8, 55, 2, 6);
    } else {
        canvas_draw_frame(canvas, 4, 55, 6, 6);
    }
    canvas_set_color(canvas, ColorBlack);
    canvas_draw_box(canvas, 114, 52, 14, 12);
    canvas_set_color(canvas, ColorWhite);
    canvas_draw_line(canvas, 118, 57, 123, 57);
    canvas_draw_line(canvas, 121, 54, 124, 57);
    canvas_draw_line(canvas, 121, 60, 124, 57);
    canvas_set_color(canvas, ColorBlack);
}

static void draw_player(Canvas* canvas, const SpotifyScreen* screen) {
    char title[sizeof(screen->now_playing)];
    strlcpy(title, screen->now_playing, sizeof(title));
    const char* artist = NULL;
    size_t split = screen->title_bytes;
    if(split > 0 && split + 3 < strlen(title) && !strncmp(title + split, " - ", 3)) {
        title[split] = 0;
        artist = screen->now_playing + split + 3;
    }
    canvas_set_font(canvas, FontPrimary);
    draw_label(canvas, title[0] ? title : "Nothing playing", 23, screen->scroll);
    canvas_set_font(canvas, FontSecondary);
    if(artist) draw_label(canvas, artist, 33, screen->scroll);
    if(screen->duration_s) {
        uint32_t total = screen->duration_s, elapsed = screen->elapsed_s;
        canvas_draw_line(canvas, 4, 39, 123, 39);
        unsigned width = (uint64_t)elapsed * 120 / total;
        if(width) canvas_draw_box(canvas, 4, 38, width, 3);
        char elapsed_text[12], duration_text[12];
        snprintf(
            elapsed_text,
            sizeof(elapsed_text),
            "%lu:%02lu",
            (unsigned long)(elapsed / 60),
            (unsigned long)(elapsed % 60));
        snprintf(
            duration_text,
            sizeof(duration_text),
            "%lu:%02lu",
            (unsigned long)(total / 60),
            (unsigned long)(total % 60));
        canvas_draw_str(canvas, 4, 49, elapsed_text);
        canvas_draw_str_aligned(canvas, 124, 49, AlignRight, AlignBottom, duration_text);
    }

    // The glyphs mirror Left, OK and Right on the physical D-pad.
    canvas_draw_line(canvas, 32, 54, 32, 60);
    for(int i = 0; i < 4; ++i)
        canvas_draw_line(canvas, 37 - i, 54 + i, 37 - i, 60 - i);
    if(screen->play_state == 1) {
        canvas_draw_box(canvas, 60, 53, 3, 9);
        canvas_draw_box(canvas, 65, 53, 3, 9);
    } else {
        for(int i = 0; i < 5; ++i)
            canvas_draw_line(canvas, 62 + i, 53 + i, 62 + i, 61 - i);
    }
    for(int i = 0; i < 4; ++i)
        canvas_draw_line(canvas, 90 + i, 54 + i, 90 + i, 60 - i);
    canvas_draw_line(canvas, 95, 54, 95, 60);
    if(screen->now_playing[0]) {
        canvas_draw_line(canvas, 109, 54, 109, 60);
        canvas_draw_line(canvas, 106, 57, 109, 60);
        canvas_draw_line(canvas, 109, 60, 112, 57);
        canvas_draw_circle(canvas, 120, 57, 5);
        canvas_draw_line(canvas, 118, 57, 122, 57);
        canvas_draw_line(canvas, 120, 55, 120, 59);
    }
}

static void draw_loading(Canvas* c, uint32_t scroll) {
    // Eddy swims above a ripple while the first page of a collection arrives.
    static const uint8_t dolphin[] = {
        0x00, 0x03, 0x00, 0x00, 0x0e, 0x00, 0x80, 0x3f, 0x00, 0xe0, 0xff, 0x00, 0xf0, 0xff, 0x07,
        0xf8, 0xc3, 0x0f, 0xfc, 0xc0, 0x3e, 0x3c, 0xc0, 0xff, 0x0e, 0x03, 0x7f, 0x86, 0x87, 0x07,
        0x66, 0x0c, 0x00, 0x36, 0x00, 0x00, 0x0c, 0x00, 0x00, 0x1e, 0x00, 0x00, 0x73, 0x00, 0x00,
    };
    int bob = (scroll / 5) % 2;
    canvas_draw_xbm(c, 12, 18 + bob, 24, 15, dolphin);
    canvas_draw_line(c, 13 + bob, 36, 22 + bob, 36);
    canvas_draw_line(c, 26 - bob, 35, 34 - bob, 35);
    canvas_draw_str(c, 45, 32, "Loading...");
}

static const char* const directions[] = {"Up", "Down", "Left", "Right"};

static void draw_presets(Canvas* c, const SpotifyScreen* screen) {
    for(size_t i = 0; i < SpotifyRows; ++i) {
        int y = 10 + i * 10;
        bool selected = screen->scene == SpotifyPresets && screen->preset_direction == i;
        highlight(c, y, 10, selected);
        const char* name = screen->presets_loaded ? screen->preset_labels[i] : "...";
        draw_text(c, 31, name, y + 8, selected ? screen->scroll : 0);
        canvas_set_color(c, selected ? ColorBlack : ColorWhite);
        canvas_draw_box(c, 0, y, 30, 10);
        canvas_set_color(c, selected ? ColorWhite : ColorBlack);
        canvas_draw_str(c, 3, y + 8, directions[i]);
        canvas_set_color(c, ColorBlack);
    }
}

uint8_t spotify_action_count(const SpotifyScreen* screen) {
    uint8_t op = spotify_category_ops[screen->category];
    if(!screen->child_tracks && (op == SpotifyPlaylists || op == SpotifyAlbums)) return 2;
    return 3;
}

static void draw_content(Canvas* canvas, const SpotifyScreen* screen) {
    const SpotifyLibrary* lib = &screen->library;
    canvas_set_font(canvas, FontSecondary);
    if(spotify_screen_shows_setup(screen)) {
        if(screen->signin_qr) {
            // QR scanning requires dark modules on a light square in either theme.
            canvas_set_color(canvas, momentum_settings.dark_mode ? ColorWhite : ColorBlack);
            canvas_set_bitmap_mode(canvas, false);
            canvas_draw_xbm(canvas, 0, 0, SpotifyQrSize, SpotifyQrSize, screen->signin_qr);
            canvas_set_color(canvas, ColorBlack);
            canvas_set_font(canvas, FontPrimary);
            canvas_draw_str(canvas, 66, 20, "Eddy");
            canvas_set_font(canvas, FontSecondary);
            canvas_draw_str(canvas, 66, 33, "Scan for the");
            canvas_draw_str(canvas, 66, 44, "iPhone app");
            canvas_draw_str(canvas, 66, 60, "OK: Close");
        } else {
            canvas_set_font(canvas, FontPrimary);
            canvas_draw_str(canvas, 2, 10, "Set up Spotify");
            canvas_set_font(canvas, FontSecondary);
            canvas_draw_str(canvas, 2, 25, "Open Eddy on your iPhone.");
            canvas_draw_str(canvas, 2, 36, "Connect your Flipper, then");
            canvas_draw_str(canvas, 2, 47, "log in to Spotify.");
            canvas_draw_str(canvas, 2, 62, "OK: Close");
        }
        return;
    }
    uint8_t category = spotify_category_ops[screen->category];
    const char* title = spotify_category_names[screen->category];
    if(screen->child_tracks)
        title = category == SpotifyPlaylists ? "Playlist tracks" : "Album tracks";
    if(screen->scene == SpotifyDestinations) title = "Add to playlist";
    if(screen->scene == SpotifyPlayer) title = "Now playing";
    if(screen->scene == SpotifyPresets) title = "Presets";
    if(screen->scene == SpotifyPresetPick) title = "Choose playlist";
    if(screen->scene == SpotifyPresetDirection) title = "Assign preset";
    if(screen->scene == SpotifyPresetManage) title = directions[screen->preset_direction];
    if(screen->scene == SpotifyActions && lib->count) {
        draw_text_width(canvas, 2, 89, lib->rows[lib->selected], 8, screen->scroll);
        canvas_set_color(canvas, ColorWhite);
        canvas_draw_box(canvas, 92, 0, 36, 10);
        canvas_set_color(canvas, ColorBlack);
    } else
        canvas_draw_str(canvas, 2, 8, screen->scene == SpotifyHome ? "Spotify" : title);
    if(lib->request) {
        int dot = (screen->scroll / 3) % 3;
        for(int i = 0; i < 3; ++i)
            canvas_draw_box(canvas, 86 + 3 * i, i == dot ? 4 : 5, 2, i == dot ? 3 : 2);
    }
    if(screen->scene == SpotifyPresets) canvas_draw_str(canvas, 39, 8, "Hold to play");
    if(!screen->connected || !screen->bridge) {
        canvas_draw_str(canvas, 2, 24, "Open Eddy on your iPhone");
        canvas_draw_str(canvas, 2, 36, "to connect your library.");
        canvas_draw_str(canvas, 2, 62, "OK: Get Eddy");
        return;
    }
    if(lib->error != SpotifyOk) {
        static const char* const errors[] = {
            [SpotifyNoPlayer] = "Open Spotify on a device.",
            [SpotifyLogin] = "Sign in on your phone.",
            [SpotifyOffline] = "Check your phone link.",
            [SpotifyRestricted] = "Spotify declined access.",
            [SpotifyRateLimited] = "Spotify is busy. Try later.",
            [SpotifyVolumeUnavailable] = "Use the device volume.",
            [SpotifyMissingPreset] = "No playlist on this button.",
            [SpotifyInvalid] = "Could not read this page.",
        };
        if(lib->error == SpotifyMissingPreset) {
            canvas_draw_str(canvas, 2, 24, errors[lib->error]);
            canvas_draw_str(canvas, 2, 36, "Assign one in Presets.");
            canvas_draw_str(canvas, 2, 47, "OK: Return");
        } else if(spotify_library_action_unconfirmed(lib)) {
            canvas_draw_str(canvas, 2, 24, "Result not confirmed.");
            canvas_draw_str(canvas, 2, 36, "Check your Spotify app.");
            canvas_draw_str(canvas, 2, 47, "OK: Return");
        } else {
            canvas_draw_str(canvas, 2, 24, errors[lib->error]);
            canvas_draw_str(canvas, 2, 36, "Check Spotify in Eddy.");
            canvas_draw_str(canvas, 2, 47, "OK: Retry    Back: Return");
        }
    } else if(screen->scene == SpotifyHome) {
        size_t first = screen->category > 2 ? screen->category - 2 : 0;
        for(size_t i = first; i < first + 3; ++i) {
            int y = 11 + (i - first) * 13;
            highlight(canvas, y, 12, i == screen->category);
            row_icon(canvas, spotify_category_ops[i], y + 3);
            canvas_draw_str(canvas, 16, y + 9, spotify_category_names[i]);
            canvas_set_color(canvas, ColorBlack);
        }
        if(category == SpotifyLiked) canvas_draw_str(canvas, 46, 8, "Hold arrow");
    } else if(screen->scene == SpotifyPresets || screen->scene == SpotifyPresetDirection) {
        draw_presets(canvas, screen);
        if(screen->scene == SpotifyPresetDirection) {
            canvas_draw_str(canvas, 2, 62, "Press direction to assign");
            return;
        }
    } else if(screen->scene == SpotifyPresetManage) {
        const char* labels[] = {"Choose playlist", "Liked Songs", "Clear preset"};
        for(size_t i = 0; i < COUNT_OF(labels); ++i) {
            highlight(canvas, 11 + i * 13, 12, i == screen->preset_option);
            canvas_draw_str(canvas, 5, 20 + i * 13, labels[i]);
            canvas_set_color(canvas, ColorBlack);
        }
        canvas_draw_str(canvas, 2, 62, "OK: Select");
        return;
    } else if(screen->scene == SpotifyPlayer) {
        draw_player(canvas, screen);
        return;
    } else if(!lib->page) {
        draw_loading(canvas, screen->scroll);
    } else if(screen->scene == SpotifyActions) {
        bool collection = spotify_action_count(screen) == 2;
        const char* const actions[] = {
            collection ? "Browse tracks" : "Play now",
            collection ? (category == SpotifyPlaylists ? "Play playlist" : "Play album") :
                         "Add to queue",
            "Add to playlist"};
        for(size_t i = 0; i < spotify_action_count(screen); ++i) {
            int y = 11 + i * 13;
            highlight(canvas, y, 12, i == screen->action);
            canvas_draw_str(canvas, 6, y + 9, actions[i]);
            canvas_set_color(canvas, ColorBlack);
        }
    } else {
        if(!lib->count) {
            canvas_draw_str(
                canvas,
                2,
                30,
                screen->scene == SpotifyDestinations ? "No owned playlists found." :
                                                       "No results here.");
        }
        bool icons = screen->scene == SpotifyDestinations ||
                     (category == SpotifyPlaylists && !screen->child_tracks) ||
                     screen->scene == SpotifyPresetPick;
        for(size_t i = 0; i < lib->count; ++i) {
            int y = 10 + (int)i * 10;
            bool selected = i == lib->selected;
            highlight(canvas, y, 10, selected);
            if(icons) {
                draw_text(canvas, 16, lib->rows[i], y + 8, selected ? screen->scroll : 0);
                canvas_set_color(canvas, selected ? ColorBlack : ColorWhite);
                canvas_draw_box(canvas, 0, y, 15, 10);
                canvas_set_color(canvas, selected ? ColorWhite : ColorBlack);
                playlist_cover(canvas, lib->rows[i], y);
            } else
                draw_label(canvas, lib->rows[i], y + 8, selected ? screen->scroll : 0);
            canvas_set_color(canvas, ColorBlack);
        }
        if((category == SpotifyPlaylists || category == SpotifyLiked) && !screen->child_tracks &&
           screen->scene == SpotifyResults) {
            canvas_draw_str(canvas, category == SpotifyLiked ? 49 : 39, 8, "Hold arrow");
        } else if(lib->previous || lib->next) {
            const char* arrows = lib->previous ? (lib->next ? "^ v" : "^") : "v";
            canvas_draw_str(canvas, 78, 8, arrows);
        }
    }
    now_bar(canvas, screen);
}

void spotify_screen_draw(Canvas* canvas, void* context) {
    const SpotifyScreen* screen = context;
    draw_content(canvas, screen);
    if(screen->notice && screen->bridge && !spotify_screen_shows_setup(screen) &&
       !screen->library.error) {
        canvas_set_color(canvas, ColorBlack);
        canvas_draw_box(canvas, 0, 51, 128, 13);
        canvas_set_color(canvas, ColorWhite);
        canvas_draw_line(canvas, 4, 57, 6, 59);
        canvas_draw_line(canvas, 6, 59, 10, 55);
        canvas_set_font(canvas, FontSecondary);
        canvas_draw_str(canvas, 15, 61, screen->notice);
        canvas_set_color(canvas, ColorBlack);
    }
}
