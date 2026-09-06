# Mobile direction — decision pending

Investigated September 6, 2026. No mobile server, tunnel, or access to signed-in
sessions has been enabled.

## What a PWA does and does not solve

A home-screen web app can provide a phone-friendly Prism interface. It cannot
directly read arbitrary signed-in provider pages: cross-origin DOM access is
restricted by the [browser same-origin policy](https://developer.mozilla.org/en-US/docs/Web/Security/Defenses/Same-origin_policy).
[Electron targets Windows, macOS and Linux](https://www.electronjs.org/docs/latest),
not an alternative iPhone/Android build target. Home-screen web apps are supported
on iOS; see [WebKit's platform notes](https://webkit.org/blog/17333/webkit-features-in-safari-26-0/).

## Recommended first candidate: Mac-backed companion

This is an architectural inference from the current working desktop integration,
not a device-proven mobile implementation. If the user accepts an awake, connected
Mac running Prism, preserve provider login/capture and the Gemini key there. The
phone sends a question/provider selection and reads activity, captured originals,
and synthesis. It does not receive provider cookies or the Gemini key.

Before implementation, decide whether initial use is on the same network or away
from home. Explicit pairing, revocation, encrypted transport, authenticated
requests, replay-safe commands, reconnectable session state, and local approval
of access are required. Do not expose the desktop's full IPC/action API. Starting
a new session must not silently discard a desktop user's work.

Phone source viewing initially means reading captured originals with OE/GPT/DOX
labels and links. It does not imply streaming/control of the live logged-in web
pages. Login expiry may still require attention on the Mac. No source-answer or
credential caching by a service worker by default. Show disconnected/stale state
explicitly rather than presenting old output as a current run.

## If the phone must work independently

Investigate native mobile webviews or supported provider APIs before selecting a
framework. Authentication, permitted extraction and background execution need
real-device/provider proof. A PWA shell alone cannot replace the desktop capture
engine. Cloud-hosted authenticated browser sessions introduce different privacy,
security, provider-permission and operating-cost decisions and are not assumed.

## First acceptance slice after the decision

On a real phone: submit one non-patient question, see independent provider activity,
read each captured original, read the synthesis, and reconnect without duplicate
dispatch. Show the single-provider path without synthesis and preserve two/three
provider selection. Verify expired pairing, Mac disconnection and cancellation.
No claim of mobile readiness before that end-to-end check.
