# HogBot

HogBot is a minimal Bale bot that replies `Hello!` when a user sends `hello`.

## Setup

1. Create a bot with Bale's bot management account and copy its API token.
2. Put the token in the root `.env` file. Keep it private and do not commit it:

   ```sh
   BALE_BOT_TOKEN=your-bot-token
   ```

3. Install dependencies and start the bot:

   ```sh
   npm start
   ```

The app loads `.env` with `dotenv` at startup. `.env` is ignored by Git.

The bot uses long polling, so it can run on a machine that does not have a public webhook URL. Keep the process running to receive messages. It responds to `hello` (case-insensitive, with optional trailing punctuation) and ignores other text.

## API endpoint

The implementation currently targets `https://tapi.bale.ai/bot<TOKEN>/<method>` with the Bot API methods `getMe`, `getUpdates`, and `sendMessage`. Confirm the current endpoint and method requirements in [Bale's Bot API documentation](https://docs.bale.ai/) before running it; that documentation could not be reached from the development environment during setup.
