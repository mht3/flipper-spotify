#include "spotify_playback.h"
#include <bt/bt_service/bt.h>
#include <furi.h>
#include <furi_hal_random.h>
#include <gui/view_dispatcher.h>
#include "spotify_transport.h"
#ifdef SPOTIFY_STOCK_PROFILE
#include <dialogs/dialogs.h>
#endif
#include <storage/storage.h>

typedef struct {
    SpotifyScreen screen;
    SpotifyLibrary status;
    SpotifyLibrary presets;
    uint16_t suppressed_keys;
    uint8_t collection_row;
    uint8_t track_row;
    SpotifyScene player_origin;
    SpotifyScene preset_origin;
    uint8_t origin_row;
    bool chooser_for_player;
    bool chooser_has_parent;
    uint32_t status_started;
    SpotifyPlayback playback;
    uint32_t last_hello;
    uint16_t connection;
    uint8_t peer[GAP_MAC_ADDR_SIZE];
    uint8_t queued;
    uint32_t started;
    uint32_t seen;
    uint32_t scroll_start;
    uint32_t notice_started;
} SpotifyModel;

typedef struct {
    Bt* bt;
    View* view;
    uint16_t sequence;
} SpotifyApp;

static void reset_link(SpotifyModel* model, uint16_t handle) {
    bool manual = model->screen.manual_setup, dismissed = model->screen.dismissed_setup;
    const uint8_t* qr = model->screen.signin_qr;
    memset(model, 0, sizeof(*model));
    model->screen.signin_qr = qr;
    model->connection = handle;
    model->screen.manual_setup = manual;
    model->screen.dismissed_setup = dismissed;
}

static void bridge_reset(SpotifyModel* model, bool connected, bool renew) {
    SpotifyScreen* screen = &model->screen;
    bool keep_player = renew && screen->play_state == 2 && screen->now_playing[0];
    if(!keep_player || screen->scene != SpotifyPlayer) screen->scene = SpotifyHome;
    model->player_origin = SpotifyHome;
    screen->child_tracks = false;
    screen->library = (SpotifyLibrary){0};
    model->status = (SpotifyLibrary){0};
    if(!keep_player) {
        screen->now_playing[0] = 0;
        screen->play_state = screen->title_bytes = 0;
        screen->duration_s = screen->elapsed_s = 0;
        model->playback = (SpotifyPlayback){0};
    }
    model->playback.expected_state = 0;
    screen->notice = NULL;
    screen->presets_loaded = false;
    model->presets = (SpotifyLibrary){0};
    model->chooser_for_player = false;
    screen->bridge = connected;
    if(connected) screen->manual_setup = false;
    model->status_started = furi_get_tick();
    model->queued = connected ? SpotifyNowPlaying : 0;
}

static void open_player(SpotifyModel* model) {
    SpotifyScreen* screen = &model->screen;
    model->player_origin = screen->scene;
    model->origin_row = screen->library.selected;
    screen->scene = SpotifyPlayer;
    model->queued = SpotifyNowPlaying;
}

static void close_player_destinations(SpotifyModel* model) {
    if(model->chooser_has_parent) {
        model->queued = SpotifyParent;
    } else {
        model->chooser_for_player = false;
        model->screen.library = (SpotifyLibrary){0};
        model->screen.scene = SpotifyPlayer;
        model->queued = SpotifyClear;
    }
}

static void finish_edit(SpotifyModel* model) {
    SpotifyScreen* screen = &model->screen;
    SpotifyLibrary* lib = &screen->library;
    uint8_t action = lib->op & 0xfc;
    lib->accepted = false;
    screen->notice = action == SpotifyQueue         ? "Added to queue" :
                     action == SpotifyAddToPlaylist ? "Added to playlist" :
                     action == SpotifyClearPreset   ? "Preset cleared" :
                                                      "Preset saved";
    model->notice_started = furi_get_tick();
    if(screen->scene == SpotifyPresetPick || screen->scene == SpotifyPresetManage) {
        screen->scene = SpotifyPresets;
        *lib = (SpotifyLibrary){0};
        model->queued = SpotifyReadPresets;
    } else if(screen->scene == SpotifyDestinations) {
        if(model->chooser_for_player)
            close_player_destinations(model);
        else
            model->queued = SpotifyParent;
    } else if(screen->scene == SpotifyPresetDirection) {
        screen->scene = model->preset_origin;
    } else if(screen->scene == SpotifyActions) {
        screen->scene = SpotifyResults;
    }
}

static void presets_unavailable(SpotifyModel* model) {
    for(size_t i = 0; i < SpotifyRows; ++i)
        strlcpy(
            model->screen.preset_labels[i], "Unavailable", sizeof(model->screen.preset_labels[i]));
    model->screen.presets_loaded = true;
}

static void spotify_event(BleMediaEvent event, const void* data, size_t size, void* context) {
    SpotifyApp* app = context;
    uint8_t peer[GAP_MAC_ADDR_SIZE];
    if(event != BleMediaFrame && event != BleMediaLink) return;
    if(event == BleMediaFrame && !spotify_transport_peer(app->bt, peer)) return;
    SpotifyModel* model = view_get_model(app->view);
    bool redraw = false;
    if(event == BleMediaLink) {
        reset_link(model, *(const uint16_t*)data);
    } else if(model->screen.connected && !memcmp(model->peer, peer, sizeof(peer)) && size) {
        const uint8_t* packet = data;
        if(size == 1 && packet[0] == SpotifyHello) {
            bridge_reset(model, true, true);
            model->seen = furi_get_tick();
        } else if(size == 1 && packet[0] == SpotifyClear) {
            bridge_reset(model, false, false);
        } else if(size == 1 && packet[0] == 0x17) {
            if(!model->screen.bridge) bridge_reset(model, true, true);
            model->seen = furi_get_tick();
        } else if(size >= 3 && packet[0] >= 0x10 && packet[0] <= 0x14) {
            uint16_t token = packet[1] | ((uint16_t)packet[2] << 8);
            SpotifyLibrary* lib = &model->screen.library;
            if(token && token == model->presets.request) {
                spotify_library_receive(&model->presets, packet, size);
                if(!model->presets.request && !model->presets.error) {
                    memcpy(
                        model->screen.preset_labels,
                        model->presets.rows,
                        sizeof(model->screen.preset_labels));
                    model->screen.presets_loaded = true;
                } else if(!model->presets.request)
                    presets_unavailable(model);
            } else if(token && token == model->status.request) {
                SpotifyLibrary* status = &model->status;
                spotify_library_receive(status, packet, size);
                if(!status->request) {
                    spotify_playback_update(
                        &model->playback, &model->screen, status, furi_get_tick());
                }
            } else if(token && token == lib->request) {
                spotify_library_receive(lib, packet, size);
                if(!lib->request) {
                    model->scroll_start = furi_get_tick();
                    if(lib->op == SpotifyPlayerToggle) {
                        if(lib->error) spotify_playback_reject(&model->playback, &model->screen);
                        model->playback.toggle_time = model->scroll_start;
                        model->queued = SpotifyNowPlaying;
                    }
                    if(!lib->error &&
                       ((lib->op & 0xfc) == SpotifyPlayPreset || lib->preset_played)) {
                        lib->accepted = false;
                        if(model->screen.scene != SpotifyPlayer) open_player(model);
                        model->queued = SpotifyNowPlaying;
                    } else if(!lib->error && lib->accepted && (lib->op & 0xfc) == SpotifyPlay) {
                        lib->accepted = false;
                        model->screen.scene = SpotifyResults;
                        open_player(model);
                    } else if(
                        !lib->error && lib->op >= SpotifyPlayerPrevious &&
                        lib->op <= SpotifyPlayerNext) {
                        lib->accepted = false;
                        model->queued = SpotifyNowPlaying;
                    } else if(!lib->error && lib->accepted) {
                        finish_edit(model);
                    } else if(!lib->error && lib->op == SpotifyChooseCurrent) {
                        model->chooser_for_player = true;
                        model->screen.scene = SpotifyDestinations;
                    } else if(!lib->error && lib->op == SpotifyParent && model->chooser_for_player) {
                        model->chooser_for_player = false;
                        model->screen.scene = SpotifyPlayer;
                        if(model->origin_row < lib->count) lib->selected = model->origin_row;
                    } else if(!lib->error && lib->op == SpotifyParent) {
                        uint8_t row = model->screen.scene == SpotifyDestinations ?
                                          model->track_row :
                                          model->collection_row;
                        if(row < lib->count) lib->selected = row;
                        if(model->screen.scene != SpotifyDestinations)
                            model->screen.child_tracks = false;
                        model->screen.scene = SpotifyResults;
                    } else if(!lib->error && lib->op == SpotifyPrevious && lib->count) {
                        lib->selected = lib->count - 1;
                    } else if(!lib->error && (lib->op & 0xfc) == SpotifyChoosePlaylist) {
                        model->screen.scene = SpotifyDestinations;
                    } else if(!lib->error && ((lib->op & 0xfc) == SpotifyCollectionTracks)) {
                        model->screen.scene = SpotifyResults;
                        model->screen.child_tracks = true;
                    }
                }
            } else {
                view_commit_model(app->view, false);
                return;
            }
            redraw = token != model->presets.request && token != model->status.request &&
                     token != lib->request;
            model->seen = furi_get_tick();
        }
    }
    view_commit_model(app->view, redraw);
}

static void spotify_tick(void* context) {
    SpotifyApp* app = context;
    uint8_t peer[GAP_MAC_ADDR_SIZE];
    bool secure = spotify_transport_listen(spotify_event, app) &&
                  spotify_transport_peer(app->bt, peer);
    SpotifyModel* model = view_get_model(app->view);
    uint32_t now = furi_get_tick();
    SpotifyLibrary* lib = &model->screen.library;
    if(model->screen.connected && (!secure || memcmp(model->peer, peer, sizeof(peer))))
        reset_link(model, model->connection);
    if(secure && model->connection != UINT16_MAX && !model->screen.connected) {
        model->screen.connected = true;
        memcpy(model->peer, peer, sizeof(peer));
        model->queued = SpotifyHello;
    }
    if(model->presets.request && now - model->started > furi_ms_to_ticks(20000)) {
        spotify_library_fail(&model->presets, SpotifyOffline);
        presets_unavailable(model);
    }
    if(lib->request && now - model->started > furi_ms_to_ticks(20000)) {
        spotify_library_fail(lib, SpotifyOffline);
        if(lib->op == SpotifyPlayerToggle) {
            spotify_playback_reject(&model->playback, &model->screen);
            model->queued = SpotifyNowPlaying;
        }
    }
    if(model->status.request && now - model->status_started > furi_ms_to_ticks(20000))
        spotify_library_fail(&model->status, SpotifyOffline);
    if(model->screen.notice && now - model->notice_started >= furi_ms_to_ticks(1600))
        model->screen.notice = NULL;
    // A missed heartbeat alone is common during phone sleep. Status replies also prove liveness.
    if(model->screen.bridge && now - model->seen > furi_ms_to_ticks(65000))
        bridge_reset(model, false, true);
    if(model->screen.connected && !model->screen.bridge && !model->queued &&
       now - model->last_hello >= furi_ms_to_ticks(10000))
        model->queued = SpotifyHello;
    uint32_t refresh_ms = 30000;
    if(model->screen.scene == SpotifyPlayer) {
        bool at_end = model->screen.play_state == 1 && model->screen.duration_s &&
                      model->screen.elapsed_s >= model->screen.duration_s;
        refresh_ms = at_end ? 4000 : 15000;
    }
    if(model->playback.expected_state && !lib->request) {
        if(now - model->playback.toggle_time >= furi_ms_to_ticks(8000))
            model->playback.expected_state = 0;
        if(!model->status.error) refresh_ms = 1500;
    }
    if(model->screen.bridge && !model->queued && !model->status.request &&
       !model->presets.request && !lib->request &&
       now - model->status_started >= furi_ms_to_ticks(refresh_ms))
        model->queued = SpotifyNowPlaying;
    uint8_t op = model->queued;
    uint16_t request = 0, page = 0;
    uint16_t handle = model->connection;
    if(op && model->screen.connected) {
        do {
            ++app->sequence;
        } while(!app->sequence || app->sequence == model->status.request ||
                app->sequence == model->presets.request || app->sequence == lib->page);
        request = app->sequence;
        if(op == SpotifyHello) {
            model->last_hello = now;
        } else if(op == SpotifyNowPlaying) {
            spotify_library_begin(&model->status, op, request);
            model->status_started = now;
        } else if(op == SpotifyReadPresets) {
            spotify_library_begin(&model->presets, op, request);
            model->started = now;
        } else if(op != SpotifyHello && op != SpotifyClear) {
            if(op == SpotifyNext || op == SpotifyPrevious || op == SpotifyParent ||
               (op >= SpotifyPlay && op < SpotifyPlayerPrevious) ||
               (op >= SpotifyAssignPreset && op < SpotifyPlayPreset) ||
               (op >= SpotifyHoldPlaylist && op < SpotifyHoldPlaylist + 16))
                page = lib->page;
            if(op == SpotifyChooseCurrent) model->chooser_has_parent = lib->page != 0;
            if(op == SpotifyPlayerToggle) {
                model->status.request = 0;
                spotify_playback_tick(
                    &model->playback, &model->screen, now, furi_ms_to_ticks(1000));
                spotify_playback_toggle(&model->playback, &model->screen, now);
            }
            spotify_library_begin(lib, op, request);
            model->started = now;
        }
    }
    if(op) model->queued = 0;
    spotify_playback_tick(&model->playback, &model->screen, now, furi_ms_to_ticks(1000));
    model->screen.scroll = (now - model->scroll_start) / furi_ms_to_ticks(70);
    view_commit_model(app->view, true);
    if(request) {
        uint8_t current[GAP_MAC_ADDR_SIZE];
        bool sent = spotify_transport_peer(app->bt, current) &&
                    !memcmp(peer, current, sizeof(peer)) &&
                    spotify_transport_request(app, handle, op, request, page);
        if(!sent && op != SpotifyHello && op != SpotifyClear) {
            model = view_get_model(app->view);
            if(model->presets.request == request) {
                spotify_library_fail(&model->presets, SpotifyOffline);
                presets_unavailable(model);
            }
            if(model->status.request == request)
                spotify_library_fail(&model->status, SpotifyOffline);
            if(model->screen.library.request == request) {
                spotify_library_fail(&model->screen.library, SpotifyOffline);
                if(op == SpotifyPlayerToggle) {
                    spotify_playback_reject(&model->playback, &model->screen);
                    model->queued = SpotifyNowPlaying;
                }
            }
            view_commit_model(app->view, true);
        }
    }
}

static void return_home(SpotifyModel* model) {
    model->screen.scene = SpotifyHome;
    model->screen.child_tracks = model->chooser_for_player = false;
    model->screen.library = (SpotifyLibrary){0};
    model->queued = model->screen.bridge ? SpotifyClear : 0;
}

static int preset_index(InputKey key) {
    switch(key) {
    case InputKeyUp:
        return 0;
    case InputKeyDown:
        return 1;
    case InputKeyLeft:
        return 2;
    case InputKeyRight:
        return 3;
    default:
        return -1;
    }
}

static bool browsable(SpotifyScene scene) {
    return scene == SpotifyHome || scene == SpotifyResults || scene == SpotifyDestinations ||
           scene == SpotifyActions || scene == SpotifyPresets;
}

static uint8_t assign_preset(const SpotifyScreen* screen, int direction) {
    if(spotify_category_ops[screen->category] == SpotifyLiked)
        return SpotifyAssignLiked + direction;
    return SpotifyAssignPreset + direction * 4 + screen->library.selected;
}

static bool spotify_input(InputEvent* event, void* context) {
    SpotifyApp* app = context;
    SpotifyModel* model = view_get_model(app->view);
    SpotifyScreen* screen = &model->screen;
    SpotifyLibrary* lib = &screen->library;
    InputKey key = event->key;
    bool handled = true;
    bool vertical = key == InputKeyUp || key == InputKeyDown;
    int direction = preset_index(key);
    uint8_t op = spotify_category_ops[screen->category];
    uint16_t bit = 1U << key;
    // The input service emits Long/Repeat before Release. Swallow a synthetic Short
    // from that same press as well; a new key press always starts a fresh gesture.
    if(event->type == InputTypePress || event->type == InputTypeRelease) {
        if(event->type == InputTypePress) model->suppressed_keys &= ~bit;
        view_commit_model(app->view, false);
        return false;
    }
    if((model->suppressed_keys & bit) && event->type != InputTypeLong) {
        view_commit_model(app->view, false);
        return true;
    }
    bool busy = lib->request || (model->queued && model->queued != SpotifyNowPlaying &&
                                 model->queued != SpotifyReadPresets);
    bool liked_collection = op == SpotifyLiked &&
                            (screen->scene == SpotifyHome || screen->scene == SpotifyResults);
    bool highlighted_playlist = op == SpotifyPlaylists && screen->scene == SpotifyResults &&
                                !screen->child_tracks && lib->count;
    if(event->type == InputTypeLong) {
        model->suppressed_keys |= bit;
        if(screen->bridge && !busy && !lib->accepted && !lib->error && !screen->manual_setup) {
            if(direction >= 0 && screen->scene == SpotifyPresetDirection) {
                screen->preset_direction = direction;
                model->queued = assign_preset(screen, direction);
            } else if(direction >= 0 && liked_collection) {
                screen->preset_direction = direction;
                model->queued = SpotifyHoldLiked + direction;
            } else if(direction >= 0 && highlighted_playlist) {
                screen->preset_direction = direction;
                model->queued = SpotifyHoldPlaylist + direction * 4 + lib->selected;
            } else if(
                direction >= 0 && (browsable(screen->scene) || screen->scene == SpotifyPlayer) &&
                !model->chooser_for_player && screen->scene != SpotifyDestinations) {
                model->queued = SpotifyPlayPreset + direction;
            } else if(key == InputKeyOk && (liked_collection || highlighted_playlist)) {
                model->preset_origin = screen->scene;
                screen->scene = SpotifyPresetDirection;
                model->queued = SpotifyReadPresets;
            }
        }
        bool dispatch = model->queued != 0;
        view_commit_model(app->view, true);
        if(dispatch) spotify_tick(app);
        return true;
    }
    if(event->type != InputTypeShort) {
        view_commit_model(app->view, false);
        return false;
    }
    if(lib->error == SpotifyMissingPreset && (key == InputKeyOk || key == InputKeyBack)) {
        lib->error = SpotifyOk;
    } else if(spotify_screen_shows_setup(screen)) {
        if(key == InputKeyOk || (key == InputKeyBack && screen->manual_setup)) {
            screen->manual_setup = false;
            screen->dismissed_setup = true;
        } else
            handled = false;
    } else if(
        screen->bridge && key == InputKeyRight && browsable(screen->scene) && !busy &&
        !lib->accepted && !lib->error) {
        if(model->chooser_for_player && screen->scene == SpotifyDestinations)
            close_player_destinations(model);
        else
            open_player(model);
    } else if(spotify_library_action_unconfirmed(lib) && (key == InputKeyOk || key == InputKeyBack)) {
        lib->error = SpotifyOk;
        if(model->chooser_for_player && screen->scene == SpotifyDestinations)
            close_player_destinations(model);
        else if(screen->scene == SpotifyDestinations)
            model->queued = SpotifyParent;
        else if(screen->scene == SpotifyPlayer)
            model->queued = SpotifyNowPlaying;
        else if(screen->scene == SpotifyActions)
            screen->scene = SpotifyResults;
    } else if(key == InputKeyBack) {
        if((screen->scene == SpotifyPresetDirection || screen->scene == SpotifyPresetManage) &&
           busy) {
            // A slot mutation already dispatched must finish before the menu is restored.
        } else if(screen->scene == SpotifyPresetDirection) {
            lib->error = SpotifyOk;
            screen->scene = model->preset_origin;
        } else if(screen->scene == SpotifyPresetManage || screen->scene == SpotifyPresetPick) {
            *lib = (SpotifyLibrary){0};
            screen->scene = SpotifyPresets;
            model->queued = SpotifyReadPresets;
        } else if(screen->scene == SpotifyPlayer) {
            if(lib->request || (model->queued && model->queued != SpotifyNowPlaying)) {
                // Keep a pending mutation tied to its originating page.
            } else {
                screen->scene = model->player_origin;
                lib->error = SpotifyOk;
            }
        } else if(model->chooser_for_player && screen->scene == SpotifyDestinations && !lib->request) {
            close_player_destinations(model);
        } else if(screen->scene == SpotifyHome && lib->error)
            lib->error = SpotifyOk;
        else if(screen->scene == SpotifyHome)
            handled = false;
        else if(lib->request || (model->queued && model->queued != SpotifyNowPlaying) || lib->error)
            return_home(model);
        else if(screen->scene == SpotifyActions)
            screen->scene = SpotifyResults;
        else if(screen->scene == SpotifyDestinations || screen->child_tracks)
            model->queued = SpotifyParent;
        else
            return_home(model);
    } else if(!screen->bridge) {
        if(key == InputKeyOk)
            screen->manual_setup = true;
        else
            handled = false;
    } else if(lib->error && key == InputKeyOk) {
        model->queued = lib->op;
    } else if(screen->scene == SpotifyHome) {
        if(vertical) {
            screen->category =
                (screen->category + (key == InputKeyUp ? SpotifyCategories - 1 : 1)) %
                SpotifyCategories;
        } else if(key == InputKeyOk) {
            if(op == SpotifyNowPlaying) {
                open_player(model);
            } else if(op == SpotifyReadPresets) {
                screen->scene = SpotifyPresets;
                model->queued = SpotifyReadPresets;
            } else if(op == SpotifySignIn) {
                screen->manual_setup = true;
            } else {
                screen->scene = SpotifyResults;
                model->queued = op;
            }
        } else
            handled = false;
    } else if(screen->scene == SpotifyPlayer) {
        if(lib->request || (model->queued && model->queued != SpotifyNowPlaying)) {
            // A second tap must not duplicate a playback command.
        } else if(lib->error) {
            if(key == InputKeyOk) model->queued = lib->op;
        } else if(key == InputKeyOk) {
            if(!model->playback.expected_state) model->queued = SpotifyPlayerToggle;
        } else if(key == InputKeyLeft)
            model->queued = SpotifyPlayerPrevious;
        else if(key == InputKeyRight)
            model->queued = SpotifyPlayerNext;
        else if(key == InputKeyDown && screen->now_playing[0])
            model->queued = SpotifyChooseCurrent;
        else
            handled = false;
    } else if(screen->scene == SpotifyPresets) {
        if(vertical)
            screen->preset_direction =
                (screen->preset_direction + (key == InputKeyUp ? 3 : 1)) % 4;
        else if(key == InputKeyOk) {
            screen->scene = SpotifyPresetManage;
            screen->preset_option = 0;
        } else
            handled = false;
    } else if(screen->scene == SpotifyPresetManage && !lib->request && !lib->accepted && !lib->error) {
        if(vertical)
            screen->preset_option = (screen->preset_option + (key == InputKeyUp ? 2 : 1)) % 3;
        else if(key == InputKeyOk && !busy) {
            if(screen->preset_option == 2)
                model->queued = SpotifyClearPreset + screen->preset_direction;
            else if(screen->preset_option == 1)
                model->queued = SpotifyAssignLiked + screen->preset_direction;
            else {
                screen->scene = SpotifyPresetPick;
                model->queued = SpotifyPlaylists;
            }
        }
    } else if(
        screen->scene == SpotifyPresetDirection && !lib->request && !lib->accepted &&
        !lib->error) {
        if(direction >= 0 && !busy) {
            screen->preset_direction = direction;
            model->queued = assign_preset(screen, direction);
        }
    } else if(lib->request || (model->queued && model->queued != SpotifyNowPlaying) || lib->accepted) {
        // Only a committed page can supply the row token for the next operation.
    } else if(lib->error) {
        if(key == InputKeyOk)
            model->queued = lib->op;
        else
            handled = false;
    } else if(screen->scene == SpotifyActions) {
        uint8_t count = spotify_action_count(screen);
        if(vertical)
            screen->action = (screen->action + (key == InputKeyUp ? count - 1 : 1)) % count;
        else if(key == InputKeyOk) {
            bool collection = count == 2;
            static const uint8_t track_actions[] = {
                SpotifyPlay, SpotifyQueue, SpotifyChoosePlaylist};
            uint8_t action = collection ?
                                 (screen->action ? SpotifyPlay : SpotifyCollectionTracks) :
                                 track_actions[screen->action];
            if(action == SpotifyCollectionTracks) model->collection_row = lib->selected;
            if(action == SpotifyChoosePlaylist) model->track_row = lib->selected;
            model->queued = action + lib->selected;
        } else
            handled = false;
    } else if(key == InputKeyDown && lib->next && (!lib->count || lib->selected + 1 == lib->count))
        model->queued = SpotifyNext;
    else if(key == InputKeyUp && lib->previous && !lib->selected)
        model->queued = SpotifyPrevious;
    else if(key == InputKeyLeft && lib->previous)
        model->queued = SpotifyPrevious;
    else if(lib->count && vertical) {
        lib->selected = (lib->selected + (key == InputKeyUp ? lib->count - 1 : 1)) % lib->count;
        model->scroll_start = furi_get_tick();
    } else if(key == InputKeyOk && lib->count) {
        if(screen->scene == SpotifyPresetPick)
            model->queued = SpotifyAssignPreset + screen->preset_direction * 4 + lib->selected;
        else if(screen->scene == SpotifyDestinations)
            model->queued = SpotifyAddToPlaylist + lib->selected;
        else {
            screen->scene = SpotifyActions;
            screen->action = 0;
        }
    } else if(key == InputKeyOk && !screen->child_tracks && screen->scene != SpotifyDestinations)
        model->queued = screen->scene == SpotifyPresetPick ? SpotifyPlaylists : op;
    else
        handled = false;
    bool dispatch = handled && model->queued;
    view_commit_model(app->view, handled);
    if(dispatch) spotify_tick(app);
    return handled;
}

static uint32_t spotify_exit(void* context) {
    UNUSED(context);
    return VIEW_NONE;
}

// The release includes a 64x64 app download QR with a clear quiet zone. Size and
// simple raster checks keep truncated, blank or inverted SD data off the screen.
static bool qr_has_ink_and_margin(const uint8_t* bitmap) {
    const size_t stride = SpotifyQrSize / 8;
    size_t ink_rows = 0;
    for(size_t y = 0; y < SpotifyQrSize; ++y) {
        const uint8_t* row = bitmap + y * stride;
        if((row[0] & 1) || (row[stride - 1] & 0x80)) return false;
        uint8_t ink = 0;
        for(size_t x = 0; x < stride; ++x)
            ink |= row[x];
        if(ink) {
            if(y == 0 || y == SpotifyQrSize - 1) return false;
            ++ink_rows;
        }
    }
    return ink_rows >= 21;
}

static uint8_t* read_signin_qr(void) {
    Storage* storage = furi_record_open(RECORD_STORAGE);
    File* file = storage_file_alloc(storage);
    uint8_t* qr = NULL;
    if(storage_file_open(file, APP_ASSETS_PATH("iphone_app.xbm"), FSAM_READ, FSOM_OPEN_EXISTING) &&
       storage_file_size(file) == SpotifyQrBytes) {
        qr = malloc(SpotifyQrBytes);
        if(qr && (storage_file_read(file, qr, SpotifyQrBytes) != SpotifyQrBytes ||
                  !qr_has_ink_and_margin(qr))) {
            free(qr);
            qr = NULL;
        }
    }
    storage_file_free(file);
    furi_record_close(RECORD_STORAGE);
    return qr;
}

int32_t eddy_spotify_app(void* argument) {
    UNUSED(argument);
    Bt* bt = furi_record_open(RECORD_BT);
#ifdef SPOTIFY_STOCK_PROFILE
    if(!spotify_transport_open(bt)) {
        DialogsApp* dialogs = furi_record_open(RECORD_DIALOGS);
        DialogMessage* message = dialog_message_alloc();
        dialog_message_set_text(
            message,
            "Could not start Bluetooth.\nReopen Eddy to try again.",
            64,
            28,
            AlignCenter,
            AlignCenter);
        dialog_message_set_buttons(message, NULL, "Close", NULL);
        dialog_message_show(dialogs, message);
        dialog_message_free(message);
        furi_record_close(RECORD_DIALOGS);
        furi_record_close(RECORD_BT);
        return 1;
    }
#endif
    SpotifyApp app = {.bt = bt, .view = view_alloc(), .sequence = furi_hal_random_get()};
    Gui* gui = furi_record_open(RECORD_GUI);
    ViewDispatcher* dispatcher = view_dispatcher_alloc();
    view_allocate_model(app.view, ViewModelTypeLocking, sizeof(SpotifyModel));
    uint8_t* qr = read_signin_qr();
    with_view_model(
        app.view,
        SpotifyModel * model,
        {
            *model = (SpotifyModel){.connection = UINT16_MAX};
            model->screen.signin_qr = qr;
        },
        false);
    view_set_context(app.view, &app);
    view_set_draw_callback(app.view, spotify_screen_draw);
    view_set_input_callback(app.view, spotify_input);
    view_set_previous_callback(app.view, spotify_exit);
    view_dispatcher_set_event_callback_context(dispatcher, &app);
    view_dispatcher_set_tick_event_callback(dispatcher, spotify_tick, 200);
    view_dispatcher_add_view(dispatcher, 0, app.view);
    spotify_tick(&app);
    view_dispatcher_attach_to_gui(dispatcher, gui, ViewDispatcherTypeFullscreen);
    view_dispatcher_switch_to_view(dispatcher, 0);
    view_dispatcher_run(dispatcher);
    SpotifyModel* model = view_get_model(app.view);
    bool clear = model->screen.connected && model->screen.bridge;
    model->queued = clear ? SpotifyClear : 0;
    view_commit_model(app.view, false);
    if(clear) spotify_tick(&app);
    spotify_transport_unlisten(&app);
#ifdef SPOTIFY_STOCK_PROFILE
    spotify_transport_close(app.bt);
#endif
    view_dispatcher_remove_view(dispatcher, 0);
    view_dispatcher_free(dispatcher);
    view_free(app.view);
    free(qr);
    furi_record_close(RECORD_GUI);
    furi_record_close(RECORD_BT);
    return 0;
}
