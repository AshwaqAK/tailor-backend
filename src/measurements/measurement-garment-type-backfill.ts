import 'dotenv/config';

import mongoose, { Model, Schema } from 'mongoose';

import { ClothingType } from './enums/clothing-type.enum';

interface GarmentTypeRecord {
  code: string;
  garmentTypeId: string;
}

interface MeasurementRecord {
  clothingType: ClothingType;
  garmentTypeId?: string;
}

const garmentTypeModelSchema = new Schema<GarmentTypeRecord>(
  {
    code: { type: String, required: true },
    garmentTypeId: { type: String, required: true },
  },
  { collection: 'garmenttypes' },
);

const measurementModelSchema = new Schema<MeasurementRecord>(
  {
    clothingType: { type: String, required: true },
    garmentTypeId: { type: String },
  },
  { collection: 'measurements' },
);

async function backfill() {
  const databaseUri = process.env.MONGODB_URI;

  if (!databaseUri) {
    throw new Error('MONGODB_URI is required');
  }

  await mongoose.connect(databaseUri);

  try {
    const garmentTypeModel = (mongoose.models.GarmentType as Model<GarmentTypeRecord> | undefined) ??
      mongoose.model<GarmentTypeRecord>('GarmentType', garmentTypeModelSchema);
    const measurementModel =
      (mongoose.models.Measurement as Model<MeasurementRecord> | undefined) ??
      mongoose.model<MeasurementRecord>('Measurement', measurementModelSchema);

    const garmentTypes = await garmentTypeModel
      .find({ code: { $in: Object.values(ClothingType) } })
      .select({ code: 1, garmentTypeId: 1 })
      .lean()
      .exec();
    const garmentTypesByCode = new Map(garmentTypes.map((garmentType) => [garmentType.code, garmentType]));
    const missingCodes = Object.values(ClothingType).filter(
      (code) => !garmentTypesByCode.has(code),
    );

    if (missingCodes.length > 0) {
      throw new Error(`Missing GarmentType records for codes: ${missingCodes.join(', ')}`);
    }

    let backfilled = 0;

    for (const clothingType of Object.values(ClothingType)) {
      const garmentType = garmentTypesByCode.get(clothingType)!;
      const result = await measurementModel
        .updateMany(
          {
            clothingType,
            garmentTypeId: { $exists: false },
          },
          { $set: { garmentTypeId: garmentType.garmentTypeId } },
        )
        .exec();

      backfilled += result.modifiedCount;
    }

    console.log(`Measurement garment type backfill complete: ${backfilled} backfilled`);
  } finally {
    await mongoose.disconnect();
  }
}

backfill().catch((error: unknown) => {
  console.error('Measurement garment type backfill failed:', error);
  process.exit(1);
});
