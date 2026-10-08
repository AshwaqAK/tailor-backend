import {
  ConflictException,
  HttpException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import { ClientSession, Connection, HydratedDocument, Model } from 'mongoose';

import { Counter, CounterDocument } from '../users/schemas/counter.schema';
import { CreateGarmentTypeDto } from './dto/create-garment-type.dto';
import { UpdateGarmentTypeDto } from './dto/update-garment-type.dto';

export interface GarmentTypeRecord {
  garmentTypeId: string;
  name: string;
  code: string;
  description?: string;
  tailoringService: CreateGarmentTypeDto['tailoringService'];
  customizationGroups: CreateGarmentTypeDto['customizationGroups'];
  measurementFields: CreateGarmentTypeDto['measurementFields'];
  isActive?: boolean;
  createdBy: string;
  updatedBy: string;
}

export type GarmentTypeDocument = HydratedDocument<GarmentTypeRecord> & {
  createdAt: Date;
  updatedAt: Date;
};

@Injectable()
export class GarmentTypesService {
  constructor(
    @InjectConnection()
    private readonly connection: Connection,

    @InjectModel('GarmentType')
    private readonly garmentTypeModel: Model<GarmentTypeDocument>,

    @InjectModel(Counter.name)
    private readonly counterModel: Model<CounterDocument>,
  ) {}

  async create(
    createGarmentTypeDto: CreateGarmentTypeDto,
    userId: string,
  ): Promise<GarmentTypeDocument> {
    const session = await this.connection.startSession();

    try {
      session.startTransaction();

      const garmentTypeId = await this.generateGarmentTypeId(session);
      const garmentType = new this.garmentTypeModel({
        ...createGarmentTypeDto,
        garmentTypeId,
        createdBy: userId,
        updatedBy: userId,
      });

      await garmentType.save({ session });
      await session.commitTransaction();

      return garmentType;
    } catch (error) {
      if (session.inTransaction()) {
        await session.abortTransaction();
      }

      this.rethrowGarmentTypeError(error, 'create');
    } finally {
      await session.endSession();
    }
  }

  async findAll(): Promise<GarmentTypeDocument[]> {
    try {
      return await this.garmentTypeModel.find().sort({ createdAt: -1 }).exec();
    } catch (error) {
      this.rethrowGarmentTypeError(error, 'list');
    }
  }

  async findOne(garmentTypeId: string): Promise<GarmentTypeDocument> {
    try {
      const garmentType = await this.garmentTypeModel.findOne({ garmentTypeId }).exec();

      if (!garmentType) {
        throw new NotFoundException('Garment type not found');
      }

      return garmentType;
    } catch (error) {
      this.rethrowGarmentTypeError(error, 'retrieve');
    }
  }

  async update(
    garmentTypeId: string,
    updateGarmentTypeDto: UpdateGarmentTypeDto,
    userId: string,
  ): Promise<GarmentTypeDocument> {
    try {
      const garmentType = await this.findOne(garmentTypeId);

      Object.assign(garmentType, updateGarmentTypeDto);
      garmentType.updatedBy = userId;

      return await garmentType.save();
    } catch (error) {
      this.rethrowGarmentTypeError(error, 'update');
    }
  }

  private async generateGarmentTypeId(session: ClientSession): Promise<string> {
    const counter = await this.counterModel
      .findOneAndUpdate(
        { _id: 'garmentType' },
        { $inc: { sequence: 1 } },
        {
          new: true,
          upsert: true,
          setDefaultsOnInsert: true,
          session,
        },
      )
      .exec();

    if (!counter) {
      throw new InternalServerErrorException('Failed to generate garment type ID');
    }

    return `GRT-${String(counter.sequence).padStart(6, '0')}`;
  }

  private rethrowGarmentTypeError(error: unknown, action: string): never {
    if (error instanceof HttpException) {
      throw error;
    }

    if (this.isDuplicateKeyError(error)) {
      const keyPattern = error.keyPattern ?? {};

      if (keyPattern.name && keyPattern.code) {
        throw new ConflictException('Garment type name and code already exist');
      }

      if (keyPattern.name) {
        throw new ConflictException('Garment type name already exists');
      }

      if (keyPattern.code) {
        throw new ConflictException('Garment type code already exists');
      }

      throw new ConflictException('Garment type ID already exists');
    }

    throw new InternalServerErrorException(`Unable to ${action} garment type`);
  }

  private isDuplicateKeyError(error: unknown): error is {
    code: number;
    keyPattern?: Record<string, number>;
  } {
    return typeof error === 'object' && error !== null && 'code' in error && error.code === 11000;
  }
}
