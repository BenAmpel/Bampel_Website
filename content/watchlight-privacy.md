---
title: Watchlight privacy
url: /watchlight/privacy/
date: '2026-11-10'
draft: false
share: false
commentable: false
editable: false
noindex: true
build:
  list: never
sitemap:
  disable: true
summary: What the Watchlight iPhone app looks at, what stays on your iPhone, and what leaves it only when you send it.
---

*Last updated November 10, 2026.*

[Watchlight](/watchlight/) is an iPhone app by Benjamin M. Ampel at Georgia State University. It checks messages, links
and calls for signs of scams and tells you what it found.

## Summary

- **Everything is checked on your iPhone.** Watchlight has no server, no account, no analytics, no ads and no tracking.
  It contains no code from other companies.
- **Nothing is sent to us.** Your messages, the numbers they come from, your contacts and your checks never reach us.
- **Some things leave your phone only when you send them**: a report to 7726, a message to someone you trust, or a
  purchase through Apple. Each is listed below.

## What Watchlight looks at

- **Texts from unknown senders**, once you turn on the filter in Messages (filter button at the top left, then Manage
  Filtering, then Text Message Filter, then Watchlight). iOS hands Watchlight only texts from numbers not in your
  contacts, never your iMessage conversations with contacts. For each one Watchlight tells iOS one thing: Junk,
  Transactions, Promotions, allow, or nothing. Apple's filter can forward texts to a server. Watchlight does not use
  that option.
- **Anything you choose to check**: a pasted message, a text, link or email you share to Watchlight, a QR code, or a
  screenshot you pick.
- **Calls**: Watchlight gives iOS a list of numbers that many people reported to the FTC, so your iPhone can show a
  label when one calls. Watchlight never sees your calls.
- **Web pages in Safari**, if you turn on the Safari extension: it reads the page's address and title and whether it
  asks for a password, to warn you about fake sign-in pages. It reads nothing you type and sends nothing.

## What stays on your iPhone

1. **Counts** of the messages you checked, by kind, for the stats screen. Numbers only.
2. **Your settings**: the campaign-text setting and, if you bought the unlock and chose one, your trusted person's first
   name and one phone number or email.
3. **A small diagnostic log** in the app's own storage, capped in size: which rules matched, the scores, the verdict and
   the message length in characters. Never the message or the sender.

Screenshots, QR codes, emails and messages you check are not saved. Deleting Watchlight deletes all of the above.

## When something leaves your iPhone

Only when you choose to send it:

- **Report** (swipe left on a text or call in Messages or Phone, then Report): iOS sends the text or call details and
  its sender to your carrier's 7726 spam-reporting service.
- **Report it to 7726** opens a draft in Messages with the text. You decide whether to send it.
- **Ask someone I trust** and **Text [your trusted person]** open the share sheet or a draft in Messages or Mail with the
  message and Watchlight's verdict. You pick who gets it and you send it.
- **Buying the unlock** goes through Apple's App Store. Apple handles payment, and Watchlight learns only that the unlock
  is owned. Apple's privacy policy applies.
- **Links** in the app (sources, the refund page, the support email, data-broker and breach sites) open in Safari or
  Mail.

Apple may share crash reports with us if you turned on "Share with App Developers" in Settings, and TestFlight testers
can send us feedback. These come through Apple and never include your messages unless you attach them.

## Camera, photos and contacts

- **Camera**: used only to read the link inside a QR code. Nothing is recorded.
- **Photos**: you pick a screenshot through Apple's photo picker. Watchlight gets only that image, reads its text on the
  iPhone, and does not keep it.
- **Contacts**: if you choose a trusted person, Apple's contact picker hands Watchlight only the one phone number or
  email you tap. Watchlight never reads your contacts.

## The on-device AI check

For screenshots, Watchlight can ask Apple's on-device language model (Apple Intelligence) for a second opinion. It runs
on your iPhone and nothing is sent.

## Children

Watchlight collects no data from anyone, so it collects none from children.

## Changes

If this page changes, the date at the top changes. If a future version ever collected data, we would say so here and in
the App Store listing before it shipped.

## Contact

Benjamin M. Ampel, Georgia State University, [bampel@gsu.edu](mailto:bampel@gsu.edu)

## App Store privacy label

**Data Not Collected.** Watchlight does its checks on your iPhone and sends nothing to us. Reports, messages and
purchases you start go to 7726, the people you choose, or Apple.
