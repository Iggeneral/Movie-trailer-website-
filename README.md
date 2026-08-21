# 9jaWhot

Nigerian Whot, built as a real table: versus by username (next door or another country), tournaments up to 10, voice callouts, soft jazz, and a **server-authoritative** naira wallet. The client never decides a balance, a card, or a payout.

## Run

```bash
npm install
cp .env.example .env   # optional
node server.js
```

Open `http://localhost:5000`  
Admin desk: `http://localhost:5000/admin`

Default admin (change immediately):

- username: `admin`
- password: `ChangeMe_9jaWhot!`

Set `ADMIN_PASSWORD` and `JWT_SECRET` (32+ chars) in `.env` before production.

## How money actually moves

Players transfer naira to the **deposit account** you publish in Admin → Bank accounts. That cash sits in your bank. The app ledger is an IOU.

| Event | Ledger |
| --- | --- |
| You approve a deposit | Credit player |
| Versus / tournament starts | Debit each player’s stake immediately |
| Winner | Credit **own stake + 95% of every losing stake** |
| House | Credit 5% of each losing stake to the house book |

Example (your spec): both lock ₦1,000 → winner receives **₦1,950**, house **₦50**.  
Ten players at ₦1,000 → winner **₦9,550**, house **₦450**.

The 5% does **not** auto-hop to a second bank. It is already in the deposit float. The profit-account fields are for your bookkeeping / manual sweep. True auto-payout needs a licensed processor (Paystack or Flutterwave Transfers) plus a gambling licence.

**Withdrawals:** the player’s balance is held at request. You pay the listed NUBAN, then **Mark paid**. If 50 requests are open, new ones wait **1 hour**. Returning a request refunds the hold.

This is the same pattern real operators use before they plug in payout APIs — do not invent client-side balances.

## Security (anti fake-funds)

- Integer kobo, never floats
- Append-only ledger + `WHERE balance >= debit` in the same SQLite transaction
- Bets, cards, and winners exist only on the server
- JWT with token version (password change kills sessions)
- bcrypt passwords, rate limits, helmet, payload cap, parameterized SQL
- Admin reconcile: user balance must equal sum(ledger)
- Deposits credit **only** after admin approval — there is no client “add money” endpoint

## Android APK

The playable table is this app (green/white, 3D cards). To install on phones, open **`android-app/`** in Android Studio, set `SERVER_URL` to your hosted Node server, and **Build → Generate Signed APK**. Full steps: `android-app/README.md`.

## Play Store / law

Google Play treats real-money gaming strictly (IARC 18+, gambling declaration, often a licence). An unlicensed real-money app can be rejected or flagged. Ship as a **web app / PWA** first, or wrap later with Capacitor **after** you have:

1. A Nigerian gaming / lottery permission that covers this product  
2. 18+ gate (already in register)  
3. HTTPS, privacy policy, terms (included)  
4. No extra device permissions (this build requests none)

“Harmful app” Play Protect warnings come from malware, overlays, SMS, accessibility abuse — this stack does none of that.

## Voice & jazz

Table callouts are recorded clips (Hold on, Pick two, Pick three, Suspension, General market, Last card, WHOT, win/lose). Settings can mute voice and the lounge jazz independently.

## Stack

Node 18+, Express, Socket.io, Node built-in SQLite (`data/9jawhot.db`), vanilla ES modules on the client.
