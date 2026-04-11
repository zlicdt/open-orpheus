# Open Orpheus

An open-source implementation of Netease Cloud Music's Orpheus browser host.

Track the project's current dev plans at https://github.com/users/YUCLing/projects/3

## Features

- Cross-platform support
- Open-source

What else do you expect! It just provides a environment for the original client!

## Installation

### Fedora Linux

[![Copr build status](https://copr.fedorainfracloud.org/coprs/luorain/open-orpheus/package/open-orpheus/status_image/last_build.png)](https://copr.fedorainfracloud.org/coprs/luorain/open-orpheus/package/open-orpheus/)

You can install via the Copr repository:

```sh
dnf copr enable luorain/open-orpheus # Enable Copr repository
dnf install open-orpheus # Install
```

### Arch Linux (third-party AUR)

Published by @zlicdt, thanks!

https://aur.archlinux.org/packages/open-orpheus

### Debian Linux, Flatpak, AppImage, Windows, macOS

Download from [Releases](https://github.com/YUCLing/open-orpheus/releases/latest)

### Resources

This project does not bundle some required resources because they are owned by NetEase.

Open Orpheus will **automatically download** the package from NetEase's CDN on first launch if it is missing, so manual setup is usually not required.

Resources are stored in the `package` subfolder of the data directory:

- Development: `data/package/` (relative to working directory)
- Packaged: `{userData}/package/`

#### `package` folder

The entire `package` folder is required.

If the automatic download fails, you can manually copy the entire `package` folder from your official NetEase Cloud Music installation (e.g. `C:\path\to\your\installation\CloudMusic\package`) into the data directory above.

#### `web.pack` file (optional)

An updated web resource pack produced by the official NetEase Cloud Music client, found at `C:\Users\<YOUR_USERNAME>\AppData\Local\NetEase\CloudMusic\web.pack`. Copy it into the `package` folder alongside `orpheus.ntpk`. If present, Open Orpheus will prefer it over `orpheus.ntpk`.

It is generally not recommended to use a too-recent web resource pack, as it may cause compatibility issues.

## Disclaimer

Open Orpheus is an independent open-source project aimed at **interoperability**. It is not affiliated with, authorized by, or endorsed by NetEase in any way.

- **This project does not include or distribute any assets or code owned by NetEase.** Required resources such as `orpheus.ntpk` are the property of NetEase. Users must obtain them from a legally acquired official client installation, or allow the application to download them automatically from NetEase's official CDN on first launch.
- **This project does not provide, encourage, or support any functionality or modification intended to bypass advertisements, paid content, membership benefits, or digital rights management (DRM) mechanisms.** Any such use is explicitly outside the scope of this project and will be actively rejected.
- By using this project, you remain bound by the [NetEase Cloud Music Terms of Service](https://st.music.163.com/official-terms/service) and all applicable laws and regulations.
- This project is provided "as is". The maintainers accept no responsibility for any consequences arising from its use, including but not limited to account suspension, service disruption, or legal liability.

> "NetEase Cloud Music", "Orpheus", and related trademarks are the property of NetEase, Inc.
