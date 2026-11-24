// The bundled Eddy app uses the existing system service. Stock firmware hosts
// the companion protocol for the lifetime of this external app.
#ifdef SPOTIFY_STOCK_PROFILE
#include "spotify_transport.h"
#include <ble/core/ble_defs.h>
#include <ble/core/ble_std.h>
#include <furi_ble/event_dispatcher.h>
#include <furi_ble/gatt.h>
#include <furi_ble/profile_interface.h>
#include <furi_hal_bt.h>
#include <services/serial_service.h>
#include <storage/storage.h>

#define EDDY_UUID(id) \
    {0xed, 0x00, 0x0d, 0xe6, 0x72, 0x1f, 0xab, 0x9f, 0x32, 0x4a, 0x34, 0x5a, id, 0x00, 0xdd, 0xef}

static const Service_UUID_t media_uuid = {.Service_UUID_128 = EDDY_UUID(1)};
static const BleGattCharacteristicParams state_params = {
    .name = "Playback",
    .data.fixed.length = 20,
    .uuid.Char_UUID_128 = EDDY_UUID(2),
    .uuid_type = UUID_TYPE_128,
    .char_properties = CHAR_PROP_WRITE,
    .security_permissions = ATTR_PERMISSION_AUTHEN_WRITE,
    .gatt_evt_mask = GATT_NOTIFY_ATTRIBUTE_WRITE,
    .is_variable = CHAR_VALUE_LEN_VARIABLE,
};
// All currently reachable player and library commands carry a five-byte header.
static const BleGattCharacteristicParams command_params = {
    .name = "Transport",
    .data.fixed.length = 5,
    .uuid.Char_UUID_128 = EDDY_UUID(3),
    .uuid_type = UUID_TYPE_128,
    .char_properties = CHAR_PROP_NOTIFY,
    .security_permissions = ATTR_PERMISSION_AUTHEN_READ,
};
#define EDDY_GATT_ATTRIBUTE_MODIFIED 0x0c01

static const FuriHalBleProfileTemplate profile;
static struct {
    FuriHalBleProfileBase base;
    FuriMutex* lock;
    BleServiceSerial* serial;
    uint16_t service;
    BleGattCharacteristicInstance state, commands;
    GapSvcEventHandler* handler;
    uint16_t connection;
    uint8_t peer[GAP_MAC_ADDR_SIZE];
    bool authenticated;
    BleMediaEventCallback callback;
    void* context;
} transport;

static uint16_t read16(const uint8_t* data) {
    return (uint16_t)data[0] | ((uint16_t)data[1] << 8);
}

static void link_changed(uint16_t handle) {
    transport.connection = handle;
    transport.authenticated = false;
    if(transport.callback)
        transport.callback(BleMediaLink, &transport.connection, sizeof(handle), transport.context);
}

static BleEventAckStatus media_event(void* packet, void* context) {
    UNUSED(context);
    // The public dispatcher supplies an HCI UART event (type, event, length, payload).
    const uint8_t* hci = packet;
    const uint8_t* p = hci + 3;
    size_t len = hci[2];
    BleEventAckStatus result = BleEventNotAck;
    furi_mutex_acquire(transport.lock, FuriWaitForever);
    if(hci[1] == HCI_LE_META_EVT_CODE && len >= 12 && p[1] == 0 &&
       (p[0] == HCI_LE_CONNECTION_COMPLETE_SUBEVT_CODE ||
        p[0] == HCI_LE_ENHANCED_CONNECTION_COMPLETE_SUBEVT_CODE)) {
        memcpy(transport.peer, p + 6, sizeof(transport.peer));
        link_changed(read16(p + 2));
    } else if(
        hci[1] == HCI_DISCONNECTION_COMPLETE_EVT_CODE && len >= 4 &&
        read16(p + 1) == transport.connection) {
        link_changed(UINT16_MAX);
    } else if(
        hci[1] == HCI_VENDOR_SPECIFIC_DEBUG_EVT_CODE && len >= 10 &&
        read16(p) == EDDY_GATT_ATTRIBUTE_MODIFIED && read16(p + 2) == transport.connection &&
        read16(p + 4) == transport.state.handle + 1) {
        uint16_t n = read16(p + 8);
        if(read16(p + 6) == 0 && n && n <= 20 && n == len - 10) {
            // The controller enforces authenticated writes on this characteristic.
            transport.authenticated = true;
            if(transport.callback) transport.callback(BleMediaFrame, p + 10, n, transport.context);
        }
        result = BleEventAckFlowEnable;
    }
    furi_mutex_release(transport.lock);
    return result;
}

static void stop(FuriHalBleProfileBase* base) {
    UNUSED(base);
    furi_mutex_acquire(transport.lock, FuriWaitForever);
    link_changed(UINT16_MAX);
    furi_mutex_release(transport.lock);
    if(transport.handler) ble_event_dispatcher_unregister_svc_handler(transport.handler);
    if(transport.commands.characteristic)
        ble_gatt_characteristic_delete(transport.service, &transport.commands);
    if(transport.state.characteristic)
        ble_gatt_characteristic_delete(transport.service, &transport.state);
    if(transport.service) ble_gatt_service_delete(transport.service);
    if(transport.serial) ble_svc_serial_stop(transport.serial);
    transport.handler = NULL;
    transport.commands = (BleGattCharacteristicInstance){0};
    transport.state = (BleGattCharacteristicInstance){0};
    transport.service = 0;
    transport.serial = NULL;
}

static FuriHalBleProfileBase* start(FuriHalBleProfileParams params) {
    UNUSED(params);
    transport.base.config = &profile;
    transport.serial = ble_svc_serial_start();
    if(transport.serial) {
        // The companion verifies pairing by reading the stock four-byte flow counter.
        ble_svc_serial_set_callbacks(transport.serial, 0, NULL, NULL);
        if(ble_gatt_service_add(
               UUID_TYPE_128, &media_uuid, PRIMARY_SERVICE, 6, &transport.service)) {
            ble_gatt_characteristic_init(transport.service, &state_params, &transport.state);
            ble_gatt_characteristic_init(transport.service, &command_params, &transport.commands);
            if(transport.state.handle && transport.commands.handle) {
                transport.handler =
                    ble_event_dispatcher_register_svc_handler(media_event, &transport);
                return &transport.base;
            }
        }
    }
    stop(&transport.base);
    return NULL;
}

static void configure(GapConfig* config, FuriHalBleProfileParams params) {
    UNUSED(params);
    *config = (GapConfig){
        .adv_service = {.UUID_Type = UUID_TYPE_16, .Service_UUID_16 = 0x3080},
        .bonding_mode = true,
        .pairing_method = GapPairingPinCodeShow,
        .conn_param = {.conn_int_min = 6, .conn_int_max = 36}};
    memcpy(config->mac_address, furi_hal_version_get_ble_mac(), sizeof(config->mac_address));
    config->mac_address[2] ^= 0x45;
    snprintf(
        config->adv_name,
        sizeof(config->adv_name),
        "%cEddy %s",
        furi_hal_version_get_ble_local_device_name_ptr()[0],
        furi_hal_version_get_name_ptr());
}
static const FuriHalBleProfileTemplate profile = {
    .start = start,
    .stop = stop,
    .get_gap_config = configure};

bool spotify_transport_open(Bt* bt) {
    transport.connection = UINT16_MAX;
    transport.lock = furi_mutex_alloc(FuriMutexTypeRecursive);
    bt_disconnect(bt);
    furi_delay_ms(200);
    bt_keys_storage_set_storage_path(bt, APP_DATA_PATH("bt.keys"));
    if(!bt_profile_start(bt, &profile, NULL)) {
        spotify_transport_close(bt);
        return false;
    }
    furi_hal_bt_start_advertising();
    return true;
}
void spotify_transport_close(Bt* bt) {
    bt_disconnect(bt);
    furi_delay_ms(200);
    bt_keys_storage_set_default_path(bt);
    bt_profile_restore_default(bt);
    furi_mutex_free(transport.lock);
    transport.lock = NULL;
}
bool spotify_transport_listen(BleMediaEventCallback callback, void* context) {
    furi_mutex_acquire(transport.lock, FuriWaitForever);
    if(!transport.callback) {
        transport.context = context;
        transport.callback = callback;
        callback(BleMediaLink, &transport.connection, sizeof(transport.connection), context);
    }
    furi_mutex_release(transport.lock);
    return true;
}
void spotify_transport_unlisten(void* context) {
    UNUSED(context);
    furi_mutex_acquire(transport.lock, FuriWaitForever);
    transport.callback = NULL;
    transport.context = NULL;
    furi_mutex_release(transport.lock);
}
bool spotify_transport_peer(Bt* bt, uint8_t* peer) {
    UNUSED(bt);
    furi_mutex_acquire(transport.lock, FuriWaitForever);
    bool ready = transport.authenticated && transport.connection != UINT16_MAX;
    if(ready) memcpy(peer, transport.peer, sizeof(transport.peer));
    furi_mutex_release(transport.lock);
    return ready;
}
bool spotify_transport_request(
    void* context,
    uint16_t handle,
    uint8_t op,
    uint16_t token,
    uint16_t page) {
    uint8_t bytes[] = {op, token, token >> 8, page, page >> 8};
    furi_mutex_acquire(transport.lock, FuriWaitForever);
    bool sent = transport.authenticated && transport.context == context &&
                handle == transport.connection && handle != UINT16_MAX && op != 0x43 &&
                !ble_gatt_characteristic_update(transport.service, &transport.commands, bytes);
    furi_mutex_release(transport.lock);
    return sent;
}
#endif
