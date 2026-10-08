import 'dotenv/config';

import { Role } from '../common/constants/role.enum';
import mongoose, { Model, Schema } from 'mongoose';

const initialGarmentTypes = [
  ['SHIRT', 'Shirt'],
  ['KURTA', 'Kurta'],
  ['PAJAMA', 'Pajama'],
  ['DHOTI', 'Dhoti'],
  ['TROUSER', 'Trouser'],
  ['WAISTCOAT', 'Waistcoat'],
  ['BLAZER', 'Blazer'],
] as const;

interface SeedUser {
  userId: string;
  email: string;
  role: Role;
  isActive: boolean;
}

interface SeedCounter {
  _id: string;
  sequence: number;
}

interface SeedGarmentType {
  garmentTypeId: string;
  name: string;
  code: string;
}

async function seed() {
  const databaseUri = process.env.MONGODB_URI;

  if (!databaseUri) {
    throw new Error('MONGODB_URI is required');
  }

  await mongoose.connect(databaseUri);

  try {
    const userModel =
      (mongoose.models.User as Model<SeedUser> | undefined) ??
      mongoose.model<SeedUser>(
        'User',
        new Schema(
          {
            userId: { type: String, required: true },
            email: { type: String, required: true },
            role: { type: String, required: true },
            isActive: { type: Boolean, required: true },
          },
          { collection: 'users' },
        ),
      );
    const counterModel =
      (mongoose.models.Counter as Model<SeedCounter> | undefined) ??
      mongoose.model<SeedCounter>(
        'Counter',
        new Schema(
          {
            _id: { type: String, required: true },
            sequence: { type: Number, required: true, default: 0 },
          },
          { collection: 'counters' },
        ),
      );
    const garmentTypeModel =
      (mongoose.models.GarmentType as Model<SeedGarmentType> | undefined) ??
      (mongoose.model(
        'GarmentType',
        new Schema(
          {
            garmentTypeId: { type: String, required: true, unique: true },
            name: { type: String, required: true, unique: true },
            code: { type: String, required: true, unique: true },
            tailoringService: {
              serviceId: { type: String, required: true },
              basePrice: { type: Number, required: true, min: 0 },
            },
            customizationGroups: { type: [Schema.Types.Mixed], required: true },
            measurementFields: { type: [Schema.Types.Mixed], required: true },
            isActive: { type: Boolean, required: true, default: true },
            createdBy: { type: String, required: true },
            updatedBy: { type: String, required: true },
          },
          { collection: 'garmenttypes', timestamps: true, versionKey: false },
        ),
      ) as unknown as Model<SeedGarmentType>);

    const adminEmail = process.env.SEED_ADMIN_EMAIL?.toLowerCase();

    if (!adminEmail) {
      throw new Error('SEED_ADMIN_EMAIL is required');
    }

    const systemUser = await userModel
      .findOne({ email: adminEmail, role: Role.SUPER_ADMIN, isActive: true })
      .exec();

    if (!systemUser) {
      throw new Error(`Active seed admin user not found: ${adminEmail}`);
    }

    let created = 0;
    let skipped = 0;

    for (const [code, name] of initialGarmentTypes) {
      const existing = await garmentTypeModel.findOne({ $or: [{ code }, { name }] }).exec();

      if (existing) {
        skipped += 1;
        continue;
      }

      const counter = await counterModel
        .findOneAndUpdate(
          { _id: 'garmentType' },
          { $inc: { sequence: 1 } },
          { new: true, upsert: true, setDefaultsOnInsert: true },
        )
        .exec();

      if (!counter) {
        throw new Error('Failed to generate garment type ID');
      }

      await garmentTypeModel.create({
        garmentTypeId: `GRT-${String(counter.sequence).padStart(6, '0')}`,
        name,
        code,
        tailoringService: { serviceId: 'SRV-000001', basePrice: 0 },
        customizationGroups: [],
        measurementFields: [],
        isActive: true,
        createdBy: systemUser.userId,
        updatedBy: systemUser.userId,
      });
      created += 1;
    }

    console.log(`Garment type seed complete: ${created} created, ${skipped} skipped`);
  } finally {
    await mongoose.disconnect();
  }
}

seed().catch((error: unknown) => {
  console.error('Garment type seed failed:', error);
  process.exit(1);
});
