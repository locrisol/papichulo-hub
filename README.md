# Papi Chulo Hub

A web application for managing operations of a restaurant. It handles the product catalogue, menu costs, allergens, stock take, sales, invoices, labour and waste, and displays all this information together into a weekly cost dashboard.

It is built for Papi Chulo, a Mexicam Street Food business with currently two location in Dublin (Point Campus and Dún Laoghaire), and it is currently in use.

**Live at [papichulo-hub.vercel.app](https://papichulo-hub.vercel.app/)**

## What it does

**Product catalogue.** Products, suppliers and prices. One same product can be purchased from different suppliers at different prices, by cases or loose, and one price per restaurant is marked as preferred to track the current cost of the products and keep it updated. The products we prepare in store rather than being directly purchased are recipes, and their cost is calculated from the ingredients cost, using recipes including every single ingredient or product used for the recipe.

**Menu.** Dishes built from products, with the cost and the margin calculated from the each restaurants prices, as each restaurant might prefer different suppliers for a same product.

**Allergens.** All fourteen EU allergens per product. The dish allergens are retrieved based on the own allergen for each ingredients, taking the worst case at every stap, so there is no need to label each dish of the menu by hand. There is also a public page for customers than can by open scanning a QR code or using a link, with no login required.

**Stock takes.** Built for a phone, as the idea is to use this functionality while you are counting in the store the different sections (cold room, freezer, dry, packaging, cleaning). The products are grouped by sections, multiple counts for a product are allowed, counting in whole packs as well as loose units, and the possibility to generate a PDF file at the end.

**Sales.** Allows to record one day at a time if the app is accessed from a phone, or a whole week at once on a laptop. The figures from the till receipt are what is used for the reconciliation. The sales from delivery plataforms are saved separately for tracking, becaue the report delivery charges, comission, VAT, discounts, and might be slightly different; forcing the calculation with these values would produce errors that are not real.

**Invoices, labour and waste.** Invoices are handled by supplier and category. Labour hours are entered manually from Timesheet information until the stores upgrade their POS System, with information about the average cost of each day versus that day sales. Waste is logged during work and cost calculated in real time as the employees type the quantities.

**Cost dashboard.** Food, labour, packaging and waste as a percentage of net sales against their targets, with gross profit and the week day by day. Targets can be changed permanently or just for some specific weeks, so temporary changes won't affect past weeks or the rest of the year if it's not a permanent change.

**Events.** A calendar that displays events on the 3Arena, which is in front of Papi Chhulo Point Campus. If the event is popular it will be a busy evening/night for us, so knowing there is a concert on Thursday changes everything from orders, product preparation and staff available. Everyone can see it, because the people working that night are the ones who need to know.

## Built with

- **React 19** with **Vite 8** and **React Router 7**
- **Tailwind CSS 4**, configured in `src/index.css` with `@theme` rather than a config file
- **Supabase** for the database, authentication and row level security
- **jsPDF** for the stock take export and **qrcode** for the allergen QR codes
- **Vitest** for the tests
- Hosted on **Vercel**
- **Ticketmaster Discovery API** for the 3Arena events

## Running it locally

You need **Node.js 20 or later**, npm, and a Supabase account.

### 1. Clone it and install

```bash
git clone https://github.com/locrisol/papichulo-hub.git
cd papichulo-hub
npm install
```

### 2. Make a Supabase project

Sign up at [supabase.com](https://supabase.com) and create a project.

### 3. Set up the database

In the Supabase dashboard, open the SQL editor and run `supabase/schema.sql`. That creates every table, function and security policy in one go.

Then run `supabase/seed.sql`, which adds the restaurants and the supplier list. Without at least one restaurant, nothing in the app will load.

`schema.sql` starts by deleting every table in the database, so it is only designed for a fresh new empty database. If you run this in one database that already has data, it will destroy it. If you want to change something on a database that already exists, add a new numbered file to `supabase/migrations/` instead. There you will find a history of how the schema was built, one change at a time, as `schema.sql` is only all of them together in one file to make it easier for you.

### 4. Set up your environment

```bash
cp .env.example .env
```

Then fill in `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`, both from Project Settings then API in Supabase. Leave `VITE_PUBLIC_URL` empty locally. `VITE_TICKETMASTER_KEY` is only needed for the events calendar. Get a Consumer Key at developer.ticketmaster.com. Without it the rest of the app works fine and the calendar stays empty.

The anon key is safe in the browser, because row level security is what actually protects the data. The service role key is not, and it must never appear anywhere in this project: it goes past every policy.

### 5. Start it

```bash
npm run dev
```

It runs at `http://localhost:5173`.

Or if you want the local version to be accesible from mobile devices in your network:

```bash
npm run dev -- --host
```

## The scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Runs the app locally with hot reload |
| `npm run build` | Builds for production into `dist` |
| `npm run preview` | Serves the built version, to check it before deploying |
| `npm run test` | Runs the tests and watches for changes |
| `npm run test:run` | Runs the tests once and exits |
| `npm run lint` | Runs ESLint |
| `npm run schema` | Rebuilds `supabase/schema.sql` and `seed.sql` from the migrations |
| `npm run test:rls` | Runs the database access tests, which need a network and the test accounts |

## Tests

```bash
npm run test:run
```

114 tests across seven files, all in `src/lib`. These tests cover all the parts where any mistake or error would just show up as a wrong number on the screen that nobody might notice: recipes costs including recipes that references themselves, allergen derivation, currency and quantities formatting, date formatting, working out which targets for costs are applied to a given week, waste value, and the event mapping functionality to the calendar.

The date tests are there because of a real bug that appeared during production. Turning a date into a string using `toISOString` converts it to UTC, so as the project is being used in Ireland, an evening date was being trated as the next day and the weeks selectors where moving into blocks of six days instea of seven. Everything related to dates now is in `src/lib/dates.js` with tests in place to verify everything works as intended.

The 35 database access tests are separate, in `tests/rls`. They sign in as a real account for each role and check what the database actually allows, because row level security lives in the database and nothing you can test in JavaScript proves it works. They need the eight TEST_ variables in `.env` and skip themselves with a message if those are missing.

They need the `ws` package, which `npm install` fetches with everything else. It is only there because `supabase-js` builds a realtime client the moment you create a client, and realtime needs WebSocket. Browsers have it, Node only got it in version 22, and this project runs on 20. Nothing here uses realtime.

They never create anything. Reads are harmless, and a write that is meant to be refused changes nothing. That does leave one gap: they do not prove an allowed write succeeds, because doing so would put rows into live data.

## How it is laid out

    src/
      components/        shared components and modals
        layout/          the sidebar and page shell
      context/           the signed-in user and the active restaurant
      lib/               logic with no interface: costing, allergens, dates, formatting
      pages/
        auth/            login
        inventory/       catalogue, menu, stock takes, allergens
        forecast/        the 3Arena event calendar
        sales/           daily entry and the weekly grid
        invoices/        entry and history
        costs/           labour and the cost dashboard
        waste/           logging and the weekly summary
    tests/
      rls/               the database access tests
    supabase/
      schema.sql         everything at once, for a new database
      seed.sql           the restaurants and suppliers
      migrations/        every schema change, in order
    scripts/
      build-schema.mjs   rebuilds schema.sql from the migrations

Anything in `lib` is a plain function with no React in it, which is why those are the parts with tests.

## Who can do what

There are four roles. The rules are stored directly in the database as row level security policies rather than in the app, that way even if something goes wrong the database content still will be only accessible by the right type of user. Managers and Owners only see their own restaurants; Super Admin can see all the restaurants.

| | Employee | Store Manager | Owner | Super Admin |
| --- | --- | --- | --- | --- |
| Catalogue, menu, allergens | Read the lists | Everything | Everything | Everything |
| Prices, recipes, allergen tagging | No | Everything | Everything | Everything |
| Stock takes | Count, and edit their own counts | Everything, including review, close and the summary | Everything | Everything |
| Waste | Log it, and see today's | Everything, including the weekly summary | Everything | Everything |
| Events at 3Arena | See the calendar | Everything, including refreshing it | Everything | Everything |
| Sales, invoices, labour, costs | No access | Everything | Everything | Everything |
| Restaurant settings | No | Yes | No | Yes |
| Users | No | Employees at their restaurant | Managers and employees at their restaurants | Everyone, and restaurants |

An employee can start counting but cannot open or close a stock take session, and can modify their own count lines but not the ones other employees have created.

The public allergen page is public and needs no login. Products, menu items, categories and recipes are readable without logging in, because the page has to follow a recipe down to work out what a dish contains. Prices and costs are not.

## Deploying

Vercel builds the `main` branch and publishes it. Work happens on `development`, and a release is a pull request from `development` into `main`.

Set these in the Vercel project settings under Environment Variables:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`
- `VITE_PUBLIC_URL`, production only, set to the live address
- `VITE_TICKETMASTER_KEY`


Add the Vercel address to the allowed URLs in Supabase under Authentication, or when you try to log in it will looks like it works, but you will be redirected back to the same page.

`vercel.json` sends every path to `index.html`. Without it, opening a link directly returns a 404, because Vercel looks for a file at that path and this is a single page app. It matters most for the allergen page, which is only ever reached by scanning a QR code.

## How the work is organised

Every change starts as a GitHub issue, gets a branch named `feature/[issue]-[name]`, and is send to `development` through a pull request. Issues that were described but we decided not built at this tage are closed as not planned and labelled `future implementation`, with a comment explaining why, so the reasoning is not lost as we definetely want to implement soon some of them.

When you add a migration, run `npm run schema` and commit the rebuilt `supabase/schema.sql` alongside it. That file is what a fresh install runs, so a migration missing from it would be missing from any new database.

## What is not built

**AI invoice extraction** using Google Gemini, as well as the product alises and the price change review, that would depend on a feature for an AI extracting information from the invoices. Currently, invoices are entered by hand, which covers what we need.

**Importing the weekly report from the till.** The old POS System and tills will be replaced soon, so a parser created for the old Pixel Point export format would be obsolete before it was used.

**Cash reconciliation.** The floats, cash banked and petty cash are in the database but disabled in the interface while the business changes how it handles cash. It can be turned back on without a migration, once we establish what will be the new procedure for this.

**Realtime stock take sync** and **exporting a stock take to Google Sheets.** The PDF already covers sharing one. Will be implemented in future.

**Predicting how busy an event night will be.** The calendar of what events are upcoming in the 3Arena is built, but not the prediction. Before building the model I checked if Ticketmaster free API allow to retrieve past events, because without them there is nothing to train on. It cannot: a query for the first six months of this year at 3Arena returns nothing, but the same venue shows 92 events coming up. The API does not show information about an event after it has happened.

Every event we retrieve is saved and never deleted, so we will be able to build a history from now on. The idea is to have enough information to train a possible model before the concert season starts in September. Ticket numbers and expected attendance are not in the free API at all, so the model will have to work without them.

## Screenshots

_I have to add: the cost dashboard, the weekly sales grid, the stock take counting screen on a phone, and the public allergen page._

## Licence

See [LICENSE](LICENSE).
