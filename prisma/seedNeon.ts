import { postgresPrisma } from '../src/configs/prismaClient';
import * as bcrypt from 'bcrypt';

async function seed() {
  const hashedPassword = await bcrypt.hash('Test123!@#', 10);
  await postgresPrisma.users.createMany({
    data: [
      { username: 'player1', hashedPassword, email: 'player1@gmail.com' },
      { username: 'player2', hashedPassword, email: 'player2@gmail.com' },
    ],
    skipDuplicates: true,
  });
  console.log('Seeded database with test users');
}

seed()
  .catch(e => console.error(e))
  .finally(async () => await postgresPrisma.$disconnect());