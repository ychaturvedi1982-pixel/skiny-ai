# Skiny AI

A mobile-first AI chat interface inspired by the screenshot: clean white canvas, a quiet central mark, hamburger chat history, and a rounded bottom composer.

## Run locally

No build tools or dependencies required. Open `index.html` in a browser, or serve this folder over HTTP (recommended for voice input):

```bash
npx serve .
```

## Enable live AI

1. Open **Settings** in the app.
2. Enter an OpenAI API key and choose a model available to your account (the default is `gpt-4o-mini`).
3. Save settings and send a message. Replies stream as they arrive.

Without a key, the app runs in demo mode. Conversations are kept in this browser's local storage.

> **API key safety:** The key is stored in this browser and sent directly to the OpenAI API. This is suitable only for a personal local demo. Do not deploy this version publicly with your own key. For a public production app, move AI requests to a server-side endpoint, keep the key in server environment variables, and add authentication and rate limits.

## Features

- Responsive, mobile-first chat UI with accessible controls
- Streaming OpenAI-compatible chat completions
- Local chat history, new chat, and delete controls
- Demo mode without an API key
- Optional browser speech recognition where supported
- No framework, dependencies, or build step

## Current limitations

Image/file attachments are not implemented yet; the plus button indicates this. Voice support depends on browser speech recognition availability.
