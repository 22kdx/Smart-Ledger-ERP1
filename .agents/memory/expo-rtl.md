---
name: Expo RTL behavior
description: Keep Arabic direction consistent between native Expo and React Native Web.
---

For native Expo, enable RTL through `I18nManager`. For Expo Web, apply RTL to the HTML document root; React Native Web rejects `direction` as a component style and renders an error instead. Use logical row layouts rather than manually reversing every row.

**Why:** The mobile runtime and React Native Web implement direction at different layers; a style that seems natural for web can make the shared app preview blank.

**How to apply:** Keep Arabic text direction and alignment in the shared text component, set the document root direction on web, and verify a web preview after changes to RTL behavior.
