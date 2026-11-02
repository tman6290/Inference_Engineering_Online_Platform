import bcrypt from 'bcryptjs';

const COST = 12;

// Compared against when the email is unknown, so a miss takes as long as a wrong password.
const DUMMY_HASH = bcrypt.hashSync('not-a-real-password', COST);

export function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, COST);
}

export async function verifyPassword(password: string, hash: string | null): Promise<boolean> {
  const matches = await bcrypt.compare(password, hash ?? DUMMY_HASH);
  return hash !== null && matches;
}
