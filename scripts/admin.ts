import { listUsers, resetPassword, revokeSessions } from '@forward-pass/api/admin';
import { loadConfig } from '@forward-pass/api/config';
import { createDb } from '@forward-pass/api/db';

const usage = `Usage: pnpm admin <command>

  list-users                 Show both seats and their active sessions
  reset-password <email>     Set a new random password and sign the user out everywhere
  revoke-sessions <email>    Sign the user out everywhere`;

async function main(): Promise<number> {
  const [command, email] = process.argv.slice(2);
  const db = createDb(loadConfig().databaseUrl);
  try {
    switch (command) {
      case 'list-users': {
        const users = await listUsers(db);
        if (users.length === 0) console.info('No users yet.');
        console.table(
          users.map((user) => ({
            email: user.email,
            name: user.displayName,
            colour: user.colour,
            joined: user.createdAt.toISOString().slice(0, 10),
            sessions: user.activeSessions,
          })),
        );
        return 0;
      }
      case 'reset-password': {
        if (!email) break;
        const password = await resetPassword(db, email);
        console.info(`New password for ${email}: ${password}`);
        console.info('Every session for this user was signed out. Pass the password on privately.');
        return 0;
      }
      case 'revoke-sessions': {
        if (!email) break;
        const count = await revokeSessions(db, email);
        console.info(`Signed ${email} out of ${count} session(s).`);
        return 0;
      }
    }
    console.error(usage);
    return 1;
  } finally {
    await db.$disconnect();
  }
}

main().then(
  (code) => process.exit(code),
  (error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  },
);
