# Prism

**One question. More perspectives.**

Bring clinical answers together. Keep the insights that matter.

Prism is a local desktop workspace for clinicians. Ask OpenEvidence, GPT for Clinicians, and Doximity Ask the same question, read the originals, and combine selected responses using Gemini. Get a direct answer, useful additional perspectives, and clinical pearls when they add value.

> **Early prototype.** Formerly Clinical Council. The current build targets Apple Silicon Macs. There is no signed installer or downloadable GitHub release yet. Internal identifiers and local storage retain the old name to preserve existing logins and settings.

## Before you start

| You need | Why |
| --- | --- |
| An Apple Silicon Mac (M-series) | This is the current packaged build target. The bundle declares macOS 13 or later; other configurations have not been validated. |
| Internet access | The provider websites and Gemini run online. A local app does not mean offline AI. |
| Your own accounts for the services you choose | Sign in inside the app. Start with one, two, or all three services. |
| Your own Gemini API key | Needed to combine two or three answers; not needed to read one service's answer. |
| Node.js and npm, only for running from source | Install dependencies, launch the development app, or create a packaged app. |

### Do I need to install Electron?

**No separate Electron installation is needed.** For source setup, `npm ci` installs the pinned Electron version. A packaged `.app` already includes Electron, Chromium, and its Node.js runtime. Its users do not need Node.js, npm, Python, Docker, or a separate browser installation. [About Electron](https://www.electronjs.org/docs/latest/)

Prism owns its browser tabs. It does not take over Chrome or Safari or import their logins. Keep Prism open while services generate answers and synthesis runs; you do not need the services' separate desktop apps open.

## 1. Install and launch

### Run from source — available now

1. Install a current **LTS version of Node.js** from the [official download page](https://nodejs.org/en/download). It includes npm. This project's tooling requires **Node.js 22.12.0 or newer**.
2. Download this repository with **Code → Download ZIP** on GitHub and unzip it. Alternatively, if Git is installed:

   ```sh
   git clone https://github.com/dochobbs/prism.git
   ```

3. Open Terminal and enter the project folder. For a clone in your current directory:

   ```sh
   cd prism
   ```

   ZIP downloads usually create `prism-main`. Existing checkouts can keep their old folder name. You can type `cd ` in Terminal, drag the unzipped folder from Finder into the window, then press Return.

4. Check your installation, install dependencies, and launch:

   ```sh
   node --version
   npm --version
   npm ci
   npm start
   ```

The first installation downloads Electron and can take a few minutes. Leave that Terminal session open while using `npm start`. On an organization-managed computer, ask IT before installing software or approving blocked downloads.

### Make a double-clickable Mac app

After `npm ci`, run from the project folder:

```sh
npm run package
open dist
```

The app is created at:

```text
dist/Prism-darwin-arm64/Prism.app
```

Quit any running development copy, then open this app. You can move the `.app` to Applications. That packaged copy launches without Terminal or a separate Node.js installation. Builds are not committed to this repository.

### If macOS blocks the app

This prototype is **unsigned and not notarized**. Only proceed if you trust its source and understand the risk. For an unidentified-developer warning, Apple's supported process may offer **System Settings → Privacy & Security → Open Anyway** after an attempted launch. [Apple's instructions](https://support.apple.com/102445)

Do not disable Gatekeeper or remove system security protections. An explicit malware or damage warning is a reason to stop, not use an override. Ask your IT administrator if device policy blocks installation.

## 2. Sign in to each service

Open the tabs you plan to use and sign in directly on their websites:

- [OpenEvidence](https://www.openevidence.com/)
- [GPT for Clinicians](https://chatgpt.com/) — select your intended Clinicians workspace in ChatGPT before asking.
- [Doximity Ask](https://www.doximity.com/ask)

Each provider controls eligibility, account approval, subscriptions, rate limits, and feature access. Prism does not supply accounts, grant clinician access, or bypass sign-in, verification, or CAPTCHA requirements. Complete those steps yourself in the service tab.

Logins are kept in separate local profiles and normally persist between launches. Services can still expire them. **Check session** means Prism has not confirmed the login—not necessarily that you are signed out. Inspect the service page, then use **Check sign-in** or **I'm signed in** as appropriate. The latter records your confirmation; it does not authenticate you.

**No OpenEvidence, OpenAI, or Doximity API keys are needed for these tabs.** They use the websites through your accounts. The separate Gemini key powers synthesis.

## 3. Add your Gemini API key

This key allows Prism to send the shared question and captured responses to Google's Gemini API. It is separate from the service logins. **Prism includes no API credit.**

1. Open [Google AI Studio → API Keys](https://aistudio.google.com/app/apikey) and sign in with your Google account.
2. Create or select a project and create a Gemini API key. Follow Google's current setup flow; older key types may require migration. If your organization restricts key creation, ask its administrator. [Google's key-setup guide](https://ai.google.dev/gemini-api/docs/api-key)
3. Check project quotas, model access, and billing. Free usage is not guaranteed and depends on Google's current account/model terms. [Gemini API billing](https://ai.google.dev/gemini-api/docs/billing)
4. In Prism, open **Synthesis settings**, scroll to the API settings, paste into **Gemini API key**, and click **Save API settings**.
5. The default model is `gemini-3.8-flash`, with thinking set to **high**. The model ID is editable; other models are not automatically guaranteed compatible. **API key configured** confirms storage, not model access. A successful synthesis is the actual connection test.

Treat the key like a password. Never put it in questions, screenshots, issues, or Git commits. It is stored locally using macOS-backed encryption and is not exposed to the service tabs. Monitor usage and billing on your Google project. Saving the key alone does not make a synthesis request.

For developers: `GEMINI_API_KEY` or `GOOGLE_API_KEY` can also be supplied in the launch environment; this app checks `GEMINI_API_KEY` first. It does **not** automatically load `.env` files. Finder-launched apps may not inherit shell variables, so the in-app field is the simplest setup path.

## 4. Ask your first question

Start with a general, non-patient question such as **“What is influenza?”**

1. Use **checkboxes** to select one, two, or three services.
2. Enter the question and click **Ask**.
3. Click a **named service tab** to read just that service. **Live services** shows the checked services together. Tab focus and service selection are separate.
4. Watch the activity labels; completed answers are captured automatically. One service stays a direct answer without a synthesis call. For two or three, Prism synthesizes when all requested answers are captured and a Gemini key is configured.
5. Read **Combined answer**, opening originals and references as needed. **OE**, **GPT**, and **DOX** labels identify contributors—not independently verified evidence.

Add another service later to the **same question** without resending to providers already asked. For a different question, use **New session**. It clears current in-memory results and resets conversations while preserving logins.

**Export report before starting over or quitting** if you want to retain the question, original answers, synthesis, and merge record. There is no saved-session library yet.

If one provider is slow, **Choose sources / synthesize again** lets you use ready answers: one opens the original, two or more trigger synthesis. Answers can take several minutes. Keeping **Live services** visible can help websites that defer background work; a quiet page is not proof of completion.

## Choose your detail level

In **Synthesis settings → Shape the answer**, select **Brief**, **Standard**, or **Deep**, plus format and audience. Click **Save synthesis instructions**. Settings apply to the next synthesis; regenerating makes another Gemini request.

The default prompt puts the answer first, adapts the outline to the question, and adds **0–3 Clinical pearls only when useful**. Detail controls explanation—not whether safety caveats, uncertainty, or meaningful conflicts are retained. Generated supporting evidence is expandable without another API call. Both prompt layers are fully editable; customized prompts can change this behavior.

## Troubleshooting

| Problem | What to check |
| --- | --- |
| `node` or `npm` not found | Install Node.js, reopen Terminal, and check the version commands above. |
| `npm ci` fails | Check Node.js is at least 22.12.0, internet access, and IT restrictions on package/Electron downloads. Do not use `sudo npm` as a workaround. |
| Packaged app won't open | Check Apple Silicon hardware, macOS compatibility, and the unsigned-app guidance above. Intel, Windows, and Linux builds are not provided or validated. |
| Question wasn't sent | Open that service tab, finish login/verification, and check for an unsent draft. Use **Retry this service**; verify the question wasn't already received before retrying manually. |
| Answer visible but not captured | This may be an adapter failure. Try **Troubleshooting → Capture manually**, optionally selecting answer text first, or paste the complete answer and reference URLs in **Source record**. |
| No combined answer | Check at least two answers are captured, the key is configured, and the synthesis status. A requested provider may still be working. |
| Gemini API error | Check key validity, model access, quota, and billing. Never share the key when asking for help. |
| Website integration breaks | Provider pages change. Report the service, app version, and redacted error—not patient content, credentials, or private conversation URLs. |

## Privacy and clinical limitations

- Your question goes to each selected provider. Synthesis sends the question and included captured answers to Google Gemini. **Do not enter identifiable patient information into this prototype**; this project does not establish approval for handling it.
- Local profiles and encrypted API settings live under `~/Library/Application Support/Clinical Council/`. Providers may retain their own chat history. Exported reports contain the question and answers; store them carefully.
- Agreement among three services is not three independent sources of evidence. Shared-citation badges show repeated sourcing, not verified claim support.
- Outputs can omit details, misattribute claims, or be wrong. Prism does not independently verify papers, doses, calculations, or guideline currency. It is not clinically validated and does not replace professional judgment.
- Providers are independent of Prism. Names and marks identify integrations; no affiliation or endorsement is implied.

## Project status and development

An authenticated three-provider capture and synthesis run has been observed. Automated tests use synthetic pages; they do not establish universal website compatibility, complete capture, or clinical quality. Provider changes and background rendering behavior remain reliability risks.

Phone-sized layouts exist, but **there is no iOS/Android app or mobile companion connection yet**. There is no public server or tunnel to your sessions.

```sh
npm test                 # Unit tests
npm run smoke            # Isolated Electron workflow with synthetic pages
npm run test:persistence # Local browser-profile persistence check
npm run package          # Unsigned Apple Silicon macOS app
```

Further reading: [architecture](docs/architecture.md), [answer design and pearls](docs/answer-presentation.md), and [recorded live verification](docs/live-verification-2026-09-05.md).

Next investigations: [mobile, additional CDS providers, and automated evaluations](docs/investigations.md).

In progress: [mobile architecture decision](docs/mobile-direction.md) and
[synthesis evaluation harness](docs/synthesis-evals.md) (`npm run eval:synthesis`).
