import {
  BadRequestException,
  ConflictException,
  HttpException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';

import { Customer, CustomerDocument } from '../customers/schemas/customer.schema';
import { GarmentType, GarmentTypeDocument } from '../garment-types/schemas/garment-type.schema';
import { CreateMeasurementDto } from './dto/create-measurement.dto';
import { UpdateMeasurementDto } from './dto/update-measurement.dto';
import { ClothingType } from './enums/clothing-type.enum';
import { Measurement, MeasurementDocument } from './schemas/measurement.schema';

@Injectable()
export class MeasurementsService {
  constructor(
    @InjectModel(Measurement.name)
    private readonly measurementModel: Model<MeasurementDocument>,

    @InjectModel(Customer.name)
    private readonly customerModel: Model<CustomerDocument>,

    @InjectModel(GarmentType.name)
    private readonly garmentTypeModel: Model<GarmentTypeDocument>,
  ) {}

  async createMeasurement(
    createMeasurementDto: Omit<CreateMeasurementDto, 'version'>,
    userId: string,
  ): Promise<MeasurementDocument> {
    try {
      await this.ensureCustomerExists(createMeasurementDto.customerId);
      const garmentType = await this.findGarmentType(createMeasurementDto.garmentTypeId);
      const clothingType = this.legacyClothingType(garmentType.code);
      this.validateMeasurementValues(garmentType, createMeasurementDto.measurements);

      const latestMeasurement = await this.measurementModel
        .findOne({
          customerId: createMeasurementDto.customerId,
          garmentTypeId: createMeasurementDto.garmentTypeId,
        })
        .sort({ version: -1 })
        .select({ version: 1 })
        .lean<{ version: number }>()
        .exec();

      const measurement = new this.measurementModel({
        customerId: createMeasurementDto.customerId,
        garmentTypeId: createMeasurementDto.garmentTypeId,
        ...(clothingType ? { clothingType } : {}),
        version: (latestMeasurement?.version ?? 0) + 1,
        measurements: createMeasurementDto.measurements,
        fitPreference: createMeasurementDto.fitPreference,
        notes: createMeasurementDto.notes,
        measuredAt: createMeasurementDto.measuredAt,
        createdBy: userId,
        updatedBy: userId,
      });

      return await measurement.save();
    } catch (error) {
      this.rethrowServiceError(error);
    }
  }

  async updateMeasurement(
    id: string,
    updateMeasurementDto: UpdateMeasurementDto,
    userId: string,
  ): Promise<MeasurementDocument> {
    try {
      const measurement = await this.measurementModel.findById(id).exec();

      if (!measurement) {
        throw new NotFoundException('Measurement not found');
      }

      let garmentType = await this.findGarmentType(measurement.garmentTypeId);

      if (
        updateMeasurementDto.customerId !== undefined &&
        updateMeasurementDto.customerId !== measurement.customerId
      ) {
        await this.ensureCustomerExists(updateMeasurementDto.customerId);
        measurement.customerId = updateMeasurementDto.customerId;
      }

      if (updateMeasurementDto.clothingType !== undefined) {
        measurement.clothingType = updateMeasurementDto.clothingType;
      }

      if (updateMeasurementDto.garmentTypeId !== undefined) {
        garmentType = await this.findGarmentType(updateMeasurementDto.garmentTypeId);
        const clothingType = this.legacyClothingType(garmentType.code);
        measurement.garmentTypeId = updateMeasurementDto.garmentTypeId;

        if (clothingType) {
          measurement.clothingType = clothingType;
        } else {
          measurement.clothingType = undefined;
        }
      }

      if (updateMeasurementDto.version !== undefined) {
        measurement.version = updateMeasurementDto.version;
      }

      if (updateMeasurementDto.measurements !== undefined) {
        this.validateMeasurementValues(garmentType, updateMeasurementDto.measurements);
        measurement.set('measurements', updateMeasurementDto.measurements);
      }

      if (updateMeasurementDto.fitPreference !== undefined) {
        measurement.fitPreference = updateMeasurementDto.fitPreference;
      }

      if (updateMeasurementDto.notes !== undefined) {
        measurement.notes = updateMeasurementDto.notes;
      }

      if (updateMeasurementDto.measuredAt !== undefined) {
        measurement.measuredAt = updateMeasurementDto.measuredAt;
      }

      measurement.updatedBy = userId;

      return await measurement.save();
    } catch (error) {
      this.rethrowServiceError(error);
    }
  }

  async getLatestMeasurement(
    customerId: string,
    clothingType: ClothingType,
  ): Promise<MeasurementDocument> {
    try {
      await this.ensureCustomerExists(customerId);

      const measurement = await this.measurementModel
        .findOne({ customerId, clothingType })
        .sort({ version: -1 })
        .exec();

      if (!measurement) {
        throw new NotFoundException('Measurement not found');
      }

      return measurement;
    } catch (error) {
      this.rethrowServiceError(error);
    }
  }

  async getMeasurementHistory(
    customerId: string,
    clothingType: ClothingType,
  ): Promise<MeasurementDocument[]> {
    try {
      await this.ensureCustomerExists(customerId);

      const measurements = await this.measurementModel
        .find({ customerId, clothingType })
        .sort({ version: -1 })
        .exec();

      if (measurements.length === 0) {
        throw new NotFoundException('No measurement history found');
      }

      return measurements;
    } catch (error) {
      this.rethrowServiceError(error);
    }
  }

  async getMeasurementsByCustomer(customerId: string): Promise<MeasurementDocument[]> {
    try {
      await this.ensureCustomerExists(customerId);

      const measurements = await this.measurementModel
        .find({ customerId })
        .sort({ clothingType: 1, version: -1 })
        .exec();

      if (measurements.length === 0) {
        throw new NotFoundException('No measurements found for this customer');
      }

      return measurements;
    } catch (error) {
      this.rethrowServiceError(error);
    }
  }

  private async ensureCustomerExists(customerId: string): Promise<void> {
    const customerExists = await this.customerModel.exists({ customerId });

    if (!customerExists) {
      throw new NotFoundException('Customer not found');
    }
  }

  private async findGarmentType(garmentTypeId: string): Promise<GarmentTypeDocument> {
    const garmentType = await this.garmentTypeModel.findOne({ garmentTypeId }).exec();

    if (!garmentType) {
      throw new NotFoundException('Garment type not found');
    }

    return garmentType;
  }

  private legacyClothingType(code: string): ClothingType | undefined {
    return Object.values(ClothingType).includes(code as ClothingType)
      ? (code as ClothingType)
      : undefined;
  }

  private validateMeasurementValues(
    garmentType: GarmentTypeDocument,
    measurements: Record<string, number>,
  ): void {
    const fields = new Map(garmentType.measurementFields.map((field) => [field.key, field]));

    for (const [key, value] of Object.entries(measurements)) {
      if (!fields.has(key)) {
        throw new BadRequestException(`Unknown measurement field: ${key}`);
      }

      if (typeof value !== 'number' || !Number.isFinite(value)) {
        throw new BadRequestException(`Invalid measurement value for field: ${key}`);
      }
    }

    for (const field of garmentType.measurementFields) {
      if (field.required && !Object.prototype.hasOwnProperty.call(measurements, field.key)) {
        throw new BadRequestException(`Missing required measurement field: ${field.key}`);
      }
    }
  }

  private rethrowServiceError(error: unknown): never {
    if (error instanceof HttpException) {
      throw error;
    }

    if (this.isDuplicateKeyError(error)) {
      throw new ConflictException('A measurement with this version already exists');
    }

    throw new InternalServerErrorException('Unable to complete the measurement operation');
  }

  private isDuplicateKeyError(error: unknown): error is { code: number } {
    return typeof error === 'object' && error !== null && 'code' in error && error.code === 11000;
  }
}
