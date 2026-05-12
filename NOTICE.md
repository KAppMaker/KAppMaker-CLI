# Third-Party Notices

This project includes work from third-party open-source projects. The originals
remain under their respective licenses; we reproduce attribution and licence
notices here to comply.

## ppp-pricing

- **Project**: [iosdevmax/ppp-pricing](https://github.com/iosdevmax/ppp-pricing)
- **Author**: [@iosdevmax](https://github.com/iosdevmax)
- **License**: MIT
- **Used in**: `src/data/ppp-tiers.ts`, `src/data/ppp-tiers.upstream.json`
- **Purpose**: Source of the regional purchasing-power-parity multiplier tiers
  (Steam/Spotify/RevenueCat-inspired) that drive KAppMaker's per-region price
  fan-out for Google Play and App Store Connect.

The upstream `ppp_tiers.json` is bundled verbatim at
`src/data/ppp-tiers.upstream.json`. The runtime canonical form is the typed
TypeScript at `src/data/ppp-tiers.ts`, which preserves the upstream tier
values and adds `FALLBACK_NEIGHBOUR` entries for regions outside the upstream
~100-country set.

```
MIT License

Copyright (c) iosdevmax

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```
