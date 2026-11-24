#pragma once

#include <stdbool.h>
#include <stddef.h>
#include <stdint.h>

static inline bool eddy_media_label_valid(const char* field, size_t length) {
    const uint8_t* s = (const uint8_t*)field;
    size_t i = 0;
    while(i < length) {
        uint8_t c = s[i++];
        if(c < 0x20 || c == 0x7f) return false;
        if(c < 0x80) continue;
        size_t n = c <= 0xdf ? 1 : c <= 0xef ? 2 : 3;
        if(c < 0xc2 || c > 0xf4 || length - i < n) return false;
        if((c == 0xe0 && s[i] < 0xa0) || (c == 0xed && s[i] >= 0xa0) ||
           (c == 0xf0 && s[i] < 0x90) || (c == 0xf4 && s[i] >= 0x90))
            return false;
        while(n--) {
            if((s[i++] & 0xc0) != 0x80) return false;
        }
    }
    return true;
}
