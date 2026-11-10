---
title: Watchlight
url: /watchlight/
date: '2026-11-10'
draft: false
share: false
commentable: false
editable: false
summary: An iPhone app that checks texts for scams on the phone itself and explains what it found, built for older adults and the relatives who help them.
---

Watchlight is an iPhone app that checks texts for signs of scams and explains, in plain words, which warning signs it
found. Every check runs on the phone. Watchlight has no server, no account and no analytics, so no message leaves the
device.

I build Watchlight at Georgia State University as part of my research on how people fall for phishing, smishing (scam
text messages) and voice scams. It is designed for older adults and for the relatives who help them with their phones.

## What it does

- **Sorts texts from unknown senders** into Junk, Transactions or Promotions as they arrive, using Apple's Message
  Filter. Sign-in codes are never sent to Junk.
- **Checks anything you share with it**: a text, link, QR code or screenshot. Each verdict lists the warning signs it
  found, how much each one counted, and what to do next.
- **Brings in someone you trust**: one tap sends the message and the verdict to a relative.
- **Fits the person**: read-aloud, large-text layouts, and English and Spanish.
- **Leaves political speech alone**: campaign texts are never labeled scams. You decide whether they are shown, sorted
  or sent to Junk.

## How it is tested

Watchlight is small by design. Apple gives a message filter about 24 MB of memory and no network access, and
Watchlight uses 8.9 MB. Every week, the frozen filter scores each new text from unknown senders, and only the counts
are kept. So far it has not sent a legitimate text to Junk. However, it still catches too few new scams, so it sends a
text to Junk only when its hand-checked rules are sure.

## Status

Watchlight is in TestFlight beta. To join the beta or ask a question, email [bampel@gsu.edu](mailto:bampel@gsu.edu).

[Watchlight privacy policy](/watchlight/privacy/)
