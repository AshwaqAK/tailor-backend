import {
  ConflictException,
  HttpException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';

import { Customer, CustomerDocument } from '../customers/schemas/customer.schema';
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
  ) {}

  async createMeasurement(
    createMeasurementDto: Omit<CreateMeasurementDto, 'version'>,
    userId: string,
  ): Promise<MeasurementDocument> {
    try {
      await this.ensureCustomerExists(createMeasurementDto.customerId);

      const latestMeasurement = await this.measurementModel
        .findOne({
          customerId: createMeasurementDto.customerId,
          clothingType: createMeasurementDto.clothingType,
        })
        .sort({ version: -1 })
        .select({ version: 1 })
        .lean<{ version: number }>()
        .exec();

      const measurement = new this.measurementModel({
        customerId: createMeasurementDto.customerId,
        clothingType: createMeasurementDto.clothingType,
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

      if (updateMeasurementDto.version !== undefined) {
        measurement.version = updateMeasurementDto.version;
      }

      if (updateMeasurementDto.measurements !== undefined) {
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
