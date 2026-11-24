# Spotify for Flipper Zero

I built this so I could queue the next song without taking my iPhone out of my pocket. Eddy connects my Flipper to my phone over Bluetooth so I can browse Liked Songs, add tracks to a playlist, or hold an arrow to start a favorite playlist.

[![Spotify playlists on a Flipper Zero, with Dolphin Days playing](demo/preview-playlists.webp)](https://mht3.github.io/eddy-firmware/spotify-demo/)

[Try the interactive Spotify demo](https://mht3.github.io/eddy-firmware/spotify-demo/)

On **official firmware 1.5.1**, copy the test build of `flipper_spotify.fap` to `SD Card/apps/Media/` with qFlipper. Open **Apps → Media → Eddy Music Remote**, then choose **Connect Device** in the Eddy iPhone app and select **Eddy** followed by your Flipper’s name. Confirm the pairing code. Keep the remote open while using it. Closing it restores the regular Flipper Bluetooth connection.

On **Eddy Firmware**

1. Copy your Spotify developer Client ID. [Spotify setup guide](https://mht3.github.io/eddy-firmware/spotify/)
2. Select **Spotify** under **Extras** and install Eddy Firmware. [Open the installer](https://mht3.github.io/eddy-firmware/update/)
3. On your Flipper, open **Apps → Spotify** and scan the QR code. On your iPhone, open Eddy, connect your Flipper, and enter your Client ID when you log in. [Get the Eddy iPhone app](https://mht3.github.io/eddy-firmware/app/)

#### Acknowledgements

Original Eddy code © 2026 mht3 and contributors. Keep the copyright and license notices when redistributing it. [GNU GPLv3](LICENSE)

Thank you to the Momentum and Flipper Zero contributors whose work made Eddy Firmware possible, and to Nocturne for inspiring the iPhone companion. [Eddy Firmware](https://github.com/mht3/eddy-firmware) · [Momentum Firmware](https://github.com/Next-Flip/Momentum-Firmware) · [Flipper Zero firmware](https://github.com/flipperdevices/flipperzero-firmware) · [Nocturne](https://usenocturne.com/app)

#### Donations

If Eddy has found a home on your Flipper, you can support me with a donation on Ko-fi. Donations help me stay a float as a PhD student :)

[Donate](https://ko-fi.com/mhtaylor)
