import { createUser, listUsers, resetPassword, revokeSessions } from '@forward-pass/api/admin';
import { loadConfig } from '@forward-pass/api/config';
import { createDb } from '@forward-pass/api/db';

const usage = `Usage: pnpm admin <command>

  list-users                 Show both seats and their active sessions
  create-user <email> --name <name> [--password <temporary>]
                             Create an account in the next free seat, no invite needed.
                             The password is temporary: the user must change it at sign-in.
                             Omit --password to generate one.
  reset-password <email> [--password <temporary>]
                             Set a temporary password (generated if omitted), sign the
                             user out everywhere, and require a new one at sign-in
  revoke-sessions <email>    Sign the user out everywhere`;

function option(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

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
      case 'create-user': {
        const name = option('name');
        if (!email || !name) break;
        const given = option('password');
        const password = await createUser(db, { email, displayName: name, password: given });
        console.info(`Created ${email}. They must choose a new password after signing in.`);
        if (!given) console.info(`Temporary password: ${password}`);
        return 0;
      }
      case 'reset-password': {
        if (!email) break;
        const given = option('password');
        const password = await resetPassword(db, email, given);
        if (!given) console.info(`Temporary password for ${email}: ${password}`);
        console.info(
          `Reset ${email}: every session was signed out, and they must choose a new password after signing in.`,
        );
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
