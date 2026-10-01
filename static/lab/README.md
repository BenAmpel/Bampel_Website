# CARE Behavioral Lab

Browser-based behavioral studies at `bampel.com/lab/`. Everything here is static and needs no build step: Hugo copies `static/lab/` to the site as is.

```
static/lab/
  index.html                    lab landing page
  assets/study.css              plain, light styling for participant pages
  tracelab/tracelab.js          passive trace capture (no dependencies)
  studies/demo-phishing/        demo study; data never leaves the browser
```

## Adding a study

1. Copy `studies/demo-phishing/` to `studies/<study-id>/`.
2. Replace the consent text with the IRB-approved wording, and the items with your stimuli. Use fictional organizations for phishing stimuli.
3. Mark anything whose hover or click matters with `data-trace="name"` (links, email headers, answer options).
4. Choose a sink (below). Keep `{ type: 'local' }` until the protocol and storage are approved.
5. Add a card for the study on `index.html`.

## TraceLab API

```js
const lab = TraceLab.create({ study: 'my-study', version: '1.0.0', sink: { type: 'local' } });
lab.start();                          // after consent only
lab.beginItem('q1', rootEl);          // one item per screen or question
lab.recordAnswer('judgment', value);  // on every answer change
lab.endItem({ judgment: 'phishing' });
lab.finish({ responses }).then(p => { /* p.items[].features, p.events */ });
```

The participant ID comes from `?pid=`, `?PROLIFIC_PID=`, or `?participant=` in the URL, and falls back to a random ID.

### Sinks

| Sink | Behavior |
|---|---|
| `{ type: 'local' }` | Nothing is sent. Use `TraceLab.download(payload)` to save JSON. |
| `{ type: 'post', url }` | POSTs the JSON payload to an approved endpoint. |
| `{ type: 'jatos' }` | Calls `jatos.submitResultData` when the study runs inside JATOS. |

### Per-item features

`durationMs`, `firstInteractionMs`, `firstAnswerMs`, `lastAnswerMs`, `answerEvents`, `answerChanges`, `mousePathPx`, `mouseSamples`, `mouseMeanSpeed`, `mouseMaxSpeed` (px/ms), `mouseXFlips`, `idleGaps` and `idleMs` (pointer still for more than 500 ms), `clicks`, `clickTargets`, `hovers` (count and dwell per `data-trace` target), `scrollPx`, `wheelPx`, `keystrokes`, `charsTyped`, `deletions`, `pastes`, `pasteChars`, `copies`, `hiddenMs`, `windowBlurs`, `media` (plays, seeks, first play delay, share heard).

### Raw events

Each event has `t` (ms since start), `type`, and `item`. Types: `move`, `down`, `click`, `hover_in`, `hover_out`, `scroll`, `wheel`, `key_down`, `key_up`, `input`, `paste`, `copy`, `cut`, `hidden`, `visible`, `window_blur`, `window_focus`, `resize`, `media_*`, `answer`, `item_begin`, `item_end`, `start`, `finish`. Key events carry a category (`char`, `space`, `backspace`, `delete`, `enter`, `arrow`, `modifier`, `tab`, `other`), never the key.

## Before running a live study

- IRB approval, with the consent text describing passive trace capture.
- An approved storage location for the `post` or `jatos` sink. Do not point a live study at storage that GSU has not approved for human-subjects data.
- Test on desktop and mobile; pointer features mean little on touch devices.
