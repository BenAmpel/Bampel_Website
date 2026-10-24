# CCAIR photos

Photos for the CCAIR center site (`/ccair/`), the Pathway Finder hub and the Student Guide hub. Every photo is listed in
`static/ccair/data/photos.json`, which is the only place that says which picture goes where. The React site
(`Picture`, `PhotoBand`, `PhotoCredits` in `static/ccair/ccair-components.jsx`) and the static pages (`photoHtml` in
`scripts/ccair-static.mjs`) both read it. All files are self-hosted here, because the site's Content Security Policy only
allows images from the site itself.

## Slots

| slot | where it shows | current photo |
| --- | --- | --- |
| `home-hero` | CCAIR home, behind the headline (Georgia State Blue scrim, white text) | `skyline-dusk` (+ `skyline-dusk-portrait` on phones) |
| `research-band` | Research page, under the page title | `dahlberg-hall` |
| `people-band` | People page, under the page title | `park-place` |
| `resources-band` | Resources page, under the page title | `aderhold` |
| `pathways-hero` | Pathway Finder hub, under the hero stats | `skyline-day` |
| `students-hero` | Student Guide hub, under the page intro | `library-plaza` |

A slot with no photo in `photos.json` simply renders nothing.

## File naming

`<base>-<width>.<ext>`, for example `dahlberg-hall-1280.avif`.

- `widths` (AVIF and WebP): 640, 1280, 1920.
- `fallbackWidths` (JPEG, for browsers without AVIF or WebP): 640, 1280.
- `width` and `height` in `photos.json` are the pixel size of the largest file. They reserve space so the page does not
  jump while the photo loads, so they must match the aspect ratio of the files.
- Strip all metadata (EXIF, GPS) from every file.
- The home hero has an extra portrait crop (`mobile`, 4:5) used below 700 px wide.

The 2026-10-24 files were made from the Wikimedia Commons originals with ffmpeg (crop), `sips` (resize), `cwebp -q 72`,
SVT-AV1 (`-crf 34`) and `sips` JPEG quality 58, then `exiftool -all=`. Any tool is fine as long as the sizes and names
match.

## Swapping in a GSU Digital Asset Library (DAL) photo

1. Download the photo from the DAL (dal.gsu.edu) and check its usage terms allow web use by a GSU center.
2. Make the derivatives (crop to the slot's shape, 3:2 works for every slot; the home hero also needs a 4:5 portrait crop),
   name them `<base>-<width>.<ext>` with a new `base` (for example `dal-library-south`), and put them in this folder.
3. In `static/ccair/data/photos.json`, edit the entry that holds the slot (or add a new entry and remove the slot from
   the old one):

   ```json
   {
     "id": "dal-library-south",
     "slot": "students-hero",
     "base": "dal-library-south",
     "widths": [640, 1280, 1920],
     "fallbackWidths": [640, 1280],
     "width": 1920,
     "height": 1280,
     "focal": "50% 50%",
     "alt": "Describe the place in the photo in one sentence.",
     "credit": {
       "source": "GSU DAL",
       "title": "Title from the DAL record",
       "author": "Georgia State University",
       "license": "",
       "licenseUrl": "",
       "sourceUrl": "",
       "changes": ""
     }
   }
   ```

   With an empty `license` the short credit reads "Photo: Georgia State University". Add the photographer to `author`
   if the DAL record names one (for example "Georgia State University / <photographer>").
4. `focal` is the CSS `object-position` that keeps the subject in view when a frame crops the photo (wide on desktop,
   4:3 on phones). Keep the subject near it.
5. Delete the old files once nothing refers to them, and remove an old entry's credit if the photo is no longer shown.
6. Run `npm run build:ccair`. The build stops if a file named in `photos.json` is missing, or a photo has no alt text or
   author.

## Rules kept by the current set

- No identifiable people. Every candidate was checked at full size; crops removed passers-by where needed.
- Licenses are CC0 or CC BY-SA 4.0 only (no NC/ND, no fair use). CC BY-SA photos stay CC BY-SA after cropping and
  resizing, and each is credited with title, author, license, source and changes (TASL): a short credit under each
  photo, the full list on the About page (`#/about`, "Photo credits") and in the Student Guide and Pathway Finder footer.
- GSU signage appears only where it is part of a building and small; no logo was cropped, recolored or altered.
- No text is set into the images; all text on photos is live HTML.
