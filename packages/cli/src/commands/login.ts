import { Command } from 'commander';
import { saveConfig, configPath } from '../utils/config.js';

export const loginCommand = new Command('login')
  .description('Save a stAIpler API token so the CLI can talk to staipler.com')
  .requiredOption('--token <token>', 'CLI token generated from your project dashboard')
  .option('--api-url <url>', 'Override the stAIpler API base URL', undefined)
  .action((opts: { token: string; apiUrl?: string }) => {
    if (!opts.token.startsWith('stp_')) {
      console.error('Error: token does not look right. Expected format: stp_...');
      process.exit(1);
    }

    saveConfig({ token: opts.token, apiUrl: opts.apiUrl });

    console.log('\n  Logged in successfully.');
    console.log(`  Credentials saved to ${configPath()}`);
    console.log('\n  Next: run `staipler pull <project-id>` from the root of your repo.\n');
  });
