import 'dotenv/config';

import mongoose, { Model, Schema } from 'mongoose';

interface GarmentTypeRecord {
  code: string;
  garmentTypeId: string;
}

interface OrderItemRecord {
  clothingType: string;
  garmentTypeId?: string;
}

const garmentTypeCodes = [
  'SHIRT',
  'KURTA',
  'PAJAMA',
  'DHOTI',
  'TROUSER',
  'WAISTCOAT',
  'BLAZER',
] as const;

const garmentTypeModelSchema = new Schema<GarmentTypeRecord>(
  {
    code: { type: String, required: true },
    garmentTypeId: { type: String, required: true },
  },
  { collection: 'garmenttypes' },
);

const orderItemModelSchema = new Schema<OrderItemRecord>(
  {
    clothingType: { type: String, required: true },
    garmentTypeId: { type: String },
  },
  { collection: 'orderitems' },
);

async function backfill() {
  const databaseUri = process.env.MONGODB_URI;

  if (!databaseUri) {
    throw new Error('MONGODB_URI is required');
  }

  await mongoose.connect(databaseUri);

  try {
    const garmentTypeModel =
      (mongoose.models.GarmentType as Model<GarmentTypeRecord> | undefined) ??
      mongoose.model<GarmentTypeRecord>('GarmentType', garmentTypeModelSchema);
    const orderItemModel =
      (mongoose.models.OrderItem as Model<OrderItemRecord> | undefined) ??
      mongoose.model<OrderItemRecord>('OrderItem', orderItemModelSchema);

    const garmentTypes = await garmentTypeModel
      .find({ code: { $in: garmentTypeCodes } })
      .select({ code: 1, garmentTypeId: 1 })
      .lean()
      .exec();
    const garmentTypesByCode = new Map(
      garmentTypes.map((garmentType) => [garmentType.code, garmentType]),
    );
    const missingCodes = garmentTypeCodes.filter((code) => !garmentTypesByCode.has(code));

    if (missingCodes.length > 0) {
      throw new Error(`Missing GarmentType records for codes: ${missingCodes.join(', ')}`);
    }

    let backfilled = 0;

    for (const clothingType of garmentTypeCodes) {
      const garmentType = garmentTypesByCode.get(clothingType)!;
      const result = await orderItemModel
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

    console.log(`Order item garment type backfill complete: ${backfilled} backfilled`);
  } finally {
    await mongoose.disconnect();
  }
}

backfill().catch((error: unknown) => {
  console.error('Order item garment type backfill failed:', error);
  process.exit(1);
});
