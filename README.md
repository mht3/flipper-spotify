# Spotify for Flipper Zero

Browse your playlists, queue a song, or hold a Flipper button to play a favorite playlist. The Eddy iPhone app connects your Spotify account to your Flipper over Bluetooth.

1. Copy your Spotify developer Client ID. [Spotify setup guide](https://mht3.github.io/eddy-firmware/spotify/)
2. Select **Spotify** under **Extras** and install Eddy Firmware. [Open the installer](https://mht3.github.io/eddy-firmware/update/)
3. On your Flipper, open **Apps → Spotify** and scan the QR code. On your iPhone, open Eddy, connect your Flipper, and enter your Client ID when you log in. [Get the Eddy iPhone app](https://mht3.github.io/eddy-firmware/app/)

This app currently needs Eddy Firmware’s Bluetooth service. For a local build, clone this repo into `applications_user/flipper_spotify` inside an Eddy Firmware checkout. Run `./fbt --extra-ext-apps=flipper_spotify STRICT_FAP_IMPORT_CHECK=1 fap_flipper_spotify` from the firmware root.

Eddy Firmware grew out of Momentum and the original Flipper Zero firmware. [Eddy Firmware](https://github.com/mht3/eddy-firmware) · [Momentum](https://github.com/Next-Flip/Momentum-Firmware) · [Flipper Zero](https://github.com/flipperdevices/flipperzero-firmware)

[Buy me a Coffee](https://ko-fi.com/mhtaylor)
