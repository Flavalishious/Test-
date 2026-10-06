# Site Timesheets

A phone-friendly page where site crew enter their hours and job numbers. Every
submission goes straight into the office **Employee Timesheet Tracker.xlsx**:
no retyping, no lost paper.

- **Crew page** (`/`): pick your name, the day, start/finish and break, then
  the job number(s) and hours on each. Takes about 20 seconds. The page remembers the
  name, usual times and recent job numbers, and can be added to the home screen
  like an app. With no signal, the timesheet is saved on the phone and sent
  automatically when signal comes back.
- **Office page** (`/admin`): see who has and hasn't sent times this week, tick
  off "entered", download the up-to-date spreadsheet, and look back at past weeks.

## What it does to the spreadsheet

On the **Timesheet Tracker** sheet, for the person and day:

| Column | Filled with |
| --- | --- |
| C Times Sent? | `Yes` |
| D Date Received | when the crew member pressed Send |
| G Status | recalculates (`Received - Not Entered`) |
| H Total Hours | start to finish, minus break |
| I Notes | crew member's notes |
| J Job Number(s) | **new column**, e.g. `J2041 (6), J2055 (3)` |

`Times Entered?` and `Date Entered` stay with the office. Set them in Excel or
with the "Mark entered" button on the office page. Once a day is marked
entered, the crew can't change it from their phones.

The app also adds two sheets:

- **Job Log**: one line per job per person per day (date, employee, job
  number, hours, start, finish, break, notes). Filter it by job number to see the
  labour on a job. It keeps every week, including Saturdays and
  Sundays, which have no rows on the weekly tracker.
- **Jobs** (optional): list your job numbers and site names here and they pop
  up as suggestions on the crew page. Set *Active* to `No` to hide finished jobs.

It also tidies a few things in the original file: the Status formula, the
Yes/No
dropdowns, the status colours and the Summary counts only reached row 32
(Monday to midway through Wednesday). They now cover every row down to Friday.

### Weeks

The title cell (`SITE TIMES Week End 16/09/2026`) says which week the tracker
holds. When the first timesheet for a **later** week comes in, the app
automatically:

1. saves the finished week to the archive (downloadable from the office page)
2. clears columns C–F and H–J and sets the new week-ending date (a Friday by
   default) in the title
3. fills in that timesheet

Times for an **earlier** week still go into the Job Log but don't change the
current week's tracker. You can also start a week by hand from the office page.

## Running it

It's a small Node.js app (Node 18 or newer) that keeps the spreadsheet in its
`data/` folder. It needs to run somewhere the crew's phones can reach over
the internet, with a disk that persists. For example:

- **A small cloud server** (DigitalOcean, Hetzner, Lightsail and the like) or **Railway /
  Render / Fly.io** with a persistent volume mounted at `/data`, using the
  included `Dockerfile`.
- **A PC in the office**, made reachable with a free
  [Cloudflare Tunnel](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/),
  which also gives you HTTPS on your own domain, e.g. `times.yourcompany.ie`.

Use HTTPS (all the options above give you that). Phones need it for the
offline mode and home-screen app.

```bash
cd timesheet-app
npm install
ADMIN_PASSWORD='pick-something-long' CREW_PIN=2580 TZ=Europe/Dublin npm start
```

or with Docker:

```bash
docker build -t site-timesheets timesheet-app
docker run -d -p 3000:3000 -v timesheets-data:/data \
  -e ADMIN_PASSWORD='pick-something-long' -e CREW_PIN=2580 -e TZ=Europe/Dublin \
  site-timesheets
```

Then open `/admin`, sign in, upload your tracker spreadsheet, and send the crew
the link shown at the bottom of that page.

On a hosting dashboard such as Railway's **Variables** screen, type the value
on its own, without quotes (`pick-something-long`, not `'pick-something-long'`).
The app ignores stray quotes and spaces anyway. When it starts, the app's log
says `Office password set from ADMIN_PASSWORD (N characters)`, which lets you
check it was picked up. If the log instead says *"ADMIN_PASSWORD is not set"*,
the variable didn't reach the app, and the temporary password it prints changes
on every restart.

### Settings

| Variable | Default | |
| --- | --- | --- |
| `ADMIN_PASSWORD` | random, printed at start-up | Office page password. **Set this.** |
| `CREW_PIN` | none | If set, the crew must enter this PIN (remembered on their phone). Stops anyone with the link from sending times. |
| `TZ` | server's | Your time zone, e.g. `Europe/Dublin`, so "today" and Date Received are local. |
| `WEEK_END_DAY` | `5` (Friday) | Day used for the week-ending date when a new week starts automatically. 1 = Monday … 7 = Sunday. |
| `AUTO_NEW_WEEK` | `true` | Set to `false` to only ever start new weeks from the office page. |
| `PORT` | `3000` | |
| `DATA_DIR` | `./data` | Where the live spreadsheet, `backups/` and `archive/` are kept. |
| `KEEP_BACKUPS` | `50` | A copy is saved before every change. This is how many to keep. |
| `TEMPLATE_PATH` | none | Optional: path to a tracker `.xlsx` to import on first start instead of uploading it. |

## Editing the spreadsheet in Excel

The app's copy is the live one. To change the crew list (column A on the
tracker) or add job numbers (the **Jobs** sheet): **Download** it from the office
page, edit it in Excel, and **Upload** it again straight away. Anything the crew
send between your download and upload is in the backups folder but not in
your upload, so keep that gap short. Names are matched ignoring extra spaces
and capitals, so `Dean Dugggan ` and `dean dugggan` are the same person.

## Development

```bash
npm test   # spreadsheet logic + end-to-end API tests, using a made-up crew
```

The real tracker isn't kept in this repository (it lists staff names), and
`data/` is git-ignored for the same reason.

| File | What it is |
| --- | --- |
| `lib/workbook.js` | Everything that reads or writes the spreadsheet |
| `server.js` | API, file saving (one write at a time, backups, archive) |
| `public/index.html`, `app.js` | Crew page |
| `public/admin.html`, `admin.js` | Office page |
| `public/sw.js` | Lets the crew page open with no signal |
