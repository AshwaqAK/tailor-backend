import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import * as bcrypt from 'bcrypt';

import { AppModule } from '../app.module';
import { Role } from '../common/constants/role.enum';
import { Counter, CounterDocument } from './schemas/counter.schema';
import { User, UserDocument } from './schemas/user.schema';
import { Model } from 'mongoose';
import { getModelToken } from '@nestjs/mongoose';

async function seed() {
  const app = await NestFactory.createApplicationContext(AppModule);

  try {
    const configService = app.get(ConfigService);

    const email = configService.getOrThrow<string>('SEED_ADMIN_EMAIL');
    const password = configService.getOrThrow<string>(
      'SEED_ADMIN_PASSWORD',
    );
    const name = configService.getOrThrow<string>('SEED_ADMIN_NAME');

    const userModel = app.get<Model<UserDocument>>(
      getModelToken(User.name),
    );

    const counterModel = app.get<Model<CounterDocument>>(
      getModelToken(Counter.name),
    );

    const normalizedEmail = email.toLowerCase();

    const existingUser = await userModel
      .findOne({ email: normalizedEmail })
      .exec();

    if (existingUser) {
      console.log(`Admin user already exists: ${existingUser.email}`);
      return;
    }

    const counter = await counterModel
      .findOneAndUpdate(
        { _id: 'user' },
        { $inc: { sequence: 1 } },
        {
          upsert: true,
          new: true,
          setDefaultsOnInsert: true,
        },
      )
      .exec();

    if (!counter) {
      throw new Error('Failed to generate user ID');
    }

    const userId = `USR-${String(counter.sequence).padStart(6, '0')}`;

    const passwordHash = await bcrypt.hash(password, 12);

    await userModel.create({
      userId,
      name,
      email: normalizedEmail,
      passwordHash,
      role: Role.SUPER_ADMIN,
      isActive: true,
      refreshTokenHash: null,
      lastLoginAt: null,
    });

    console.log(`Admin user created successfully: ${normalizedEmail}`);
    console.log(`User ID: ${userId}`);
  } finally {
    await app.close();
  }
}

seed().catch((error: unknown) => {
  console.error('Seed failed:', error);
  process.exit(1);
});