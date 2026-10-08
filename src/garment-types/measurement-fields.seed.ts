import 'dotenv/config';

import mongoose, { Model, Schema } from 'mongoose';

interface GarmentTypeRecord {
  code: string;
  measurementFields?: Array<Record<string, unknown>>;
}

const garmentTypeModelSchema = new Schema<GarmentTypeRecord>(
  {
    code: { type: String, required: true },
    measurementFields: { type: [Schema.Types.Mixed] },
  },
  { collection: 'garmenttypes' },
);

const measurementFields = [
  {
    key: 'chest',
    name: 'Chest',
    unit: 'INCH',
    required: true,
    sortOrder: 0,
  },
  {
    key: 'waist',
    name: 'Waist',
    unit: 'INCH',
    required: false,
    sortOrder: 1,
  },
];

async function seedMeasurementFields() {
  const databaseUri = process.env.MONGODB_URI;

  if (!databaseUri) {
    throw new Error('MONGODB_URI is required');
  }

  await mongoose.connect(databaseUri);

  try {
    const garmentTypeModel =
      (mongoose.models.GarmentType as Model<GarmentTypeRecord> | undefined) ??
      mongoose.model<GarmentTypeRecord>('GarmentType', garmentTypeModelSchema);
    const garmentTypes = await garmentTypeModel.find({}).select({ code: 1, measurementFields: 1 }).exec();

    let updated = 0;

    for (const garmentType of garmentTypes) {
      if (garmentType.measurementFields && garmentType.measurementFields.length > 0) {
        continue;
      }

      const result = await garmentTypeModel.updateOne(
        {
          _id: garmentType._id,
          $or: [{ measurementFields: { $exists: false } }, { measurementFields: { $size: 0 } }],
        },
        { $set: { measurementFields } },
      );

      if (result.modifiedCount > 0) {
        updated += 1;
        console.log(`Measurement fields configured for garment type: ${garmentType.code}`);
      }
    }

    console.log(`Garment type measurement field seed complete: ${updated} updated`);
  } finally {
    await mongoose.disconnect();
  }
}

seedMeasurementFields().catch((error: unknown) => {
  console.error('Garment type measurement field seed failed:', error);
  process.exit(1);
});
