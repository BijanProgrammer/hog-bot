# HogBot

HogBot is a minimal Bale bot that replies `Hello!` when a user sends `hello`.

## Setup

1. Create a bot with Bale's bot management account and copy its API token.
2. Put its token in the root `.env` file. Keep it private and do not commit it:

   ```sh
   BALE_BOT_TOKEN=your-bot-token
   ```

3. Install dependencies and start the bot:

   ```sh
   npm start
   ```

The app loads `.env` with `dotenv` at startup. `.env` is ignored by Git. Send `/hog` to the bot in a personal chat and it sends the hog sequence to these configured group chats: `4865424919`, `5333489797`, `4580430571`, `4934503252`, and `4862147712`. The bot must be a member of each group and allowed to send messages there.

The bot uses long polling, so it can run on a machine that does not have a public webhook URL. Keep the process running to receive messages. It responds to `hello` (case-insensitive, with optional trailing punctuation) and ignores other text.

## API endpoint

The implementation currently targets `https://tapi.bale.ai/bot<TOKEN>/<method>` with the Bot API methods `getMe`, `getUpdates`, and `sendMessage`. Confirm the current endpoint and method requirements in [Bale's Bot API documentation](https://docs.bale.ai/) before running it; that documentation could not be reached from the development environment during setup.
