#pragma once
#ifdef SPOTIFY_STOCK_PROFILE
#include <bt/bt_service/bt.h>
#include <gap.h>

typedef enum {
    BleMediaLink,
    BleMediaFrame
} BleMediaEvent;
typedef void (*BleMediaEventCallback)(BleMediaEvent, const void*, size_t, void*);
bool spotify_transport_open(Bt* bt);
void spotify_transport_close(Bt* bt);
bool spotify_transport_listen(BleMediaEventCallback callback, void* context);
void spotify_transport_unlisten(void* context);
bool spotify_transport_peer(Bt* bt, uint8_t* peer);
bool spotify_transport_request(
    void* context,
    uint16_t handle,
    uint8_t op,
    uint16_t token,
    uint16_t page);
#else
#include <profiles/serial_profile.h>
#define spotify_transport_listen   ble_svc_media_listen
#define spotify_transport_unlisten ble_svc_media_unlisten
#define spotify_transport_peer     bt_get_connected_peer_address
#define spotify_transport_request  ble_svc_media_library_request
#endif
