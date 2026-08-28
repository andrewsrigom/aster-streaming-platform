# Supplemental upstream license sources

These unmodified texts fill omissions in npm package distributions. They do not
relicense Aster-authored code. Reviewed 2026-08-28.

- GPL-3.0.txt and LGPL-3.0.txt: Debian's /usr/share/common-licenses/GPL-3 and LGPL-3, matching the [GNU GPL](https://www.gnu.org/licenses/gpl-3.0.html) and [GNU LGPL](https://www.gnu.org/licenses/lgpl-3.0.html).
- WRY-MIT.txt: [wryware at the registry gitHead](https://github.com/benjamn/wryware/blob/16493ef8b4fb994a17e64f2bbeaf22ae9be16b4a/LICENSE), for @wry/trie 0.5.0 and @wry/context 0.7.4.
- SCROLL-BAR-MIT.txt: [react-remove-scroll-bar upstream license](https://github.com/theKashey/react-remove-scroll-bar/blob/8ca9ba5ea52de03308fe8ced94f7b159a44d28ff/LICENSE). Version 2.3.8's installed manifest and README declare MIT; its registry gitHead is no longer reachable. This is the upstream project's preserved license, not a claim that this commit reproduces the installed binary.
- REACT-MIT.txt: [React 18.2.0 license](https://github.com/facebook/react/blob/v18.2.0/LICENSE), accompanying the React client-only/server-only 0.0.1 marker packages, whose manifests declare MIT but omit the license file.

Next's env and SWC packages inherit the installed Next 16.3.3 project license;
its nested vendor notices are retained independently. The libvips package's
README and versions.json preserve the bundle's own license table and exact
component versions. Its source/build inputs are linked in the Web notice.
