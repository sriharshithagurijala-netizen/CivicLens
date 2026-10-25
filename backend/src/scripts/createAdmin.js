
import 'dotenv/config';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import User from '../models/User.js';

async function createAdmin() {
  const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD;

  if (!email || !password || password.length < 12) {
    throw new Error(
      'Set ADMIN_EMAIL and ADMIN_PASSWORD (at least 12 characters) in backend/.env'
    );
  }

  await mongoose.connect(process.env.MONGODB_URI);

  const existing = await User.findOne({ email });

  if (existing) {
    existing.role = 'admin';
    existing.password = await bcrypt.hash(password, 12);
    await existing.save();
    console.log('Existing account promoted to admin.');
  } else {
    await User.create({
      name: 'CivicLens Administrator',
      email,
      password: await bcrypt.hash(password, 12),
      role: 'admin',
    });
    console.log('Admin account created.');
  }

  await mongoose.disconnect();
}

createAdmin().catch(async (error) => {
  console.error('Admin setup failed:', error.message);
  await mongoose.disconnect().catch(() => {});
  process.exitCode = 1;
});
