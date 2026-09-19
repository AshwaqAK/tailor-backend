import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import * as bcrypt from 'bcrypt';
import { Model } from 'mongoose';

import { Counter, CounterDocument } from './schemas/counter.schema';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { User, UserDocument } from './schemas/user.schema';
import { UserResponse } from './types/user-response.type';

@Injectable()
export class UsersService {
  private readonly passwordSaltRounds = 12;

  constructor(
    @InjectModel(User.name)
    private readonly userModel: Model<UserDocument>,
    @InjectModel(Counter.name)
    private readonly counterModel: Model<CounterDocument>,
  ) {}

  async create(createUserDto: CreateUserDto): Promise<UserResponse> {
    const email = createUserDto.email.toLowerCase();

    const existingUser = await this.userModel.findOne({ email }).lean().exec();

    if (existingUser) {
      throw new ConflictException('Email already exists');
    }

    const userId = await this.generateUserId();

    const passwordHash = await bcrypt.hash(createUserDto.password, this.passwordSaltRounds);

    const user = new this.userModel({
      userId,
      name: createUserDto.name,
      email,
      phone: createUserDto.phone,
      passwordHash,
      role: createUserDto.role,
      isActive: true,
    });

    const savedUser = await user.save();

    return this.toUserResponse(savedUser);
  }

  async findById(id: string): Promise<UserDocument> {
    const user = await this.userModel.findById(id).exec();

    if (!user) {
      throw new NotFoundException('User not found');
    }

    return user;
  }

  async findByEmail(email: string): Promise<UserDocument | null> {
    return this.userModel
      .findOne({
        email: email.toLowerCase(),
      })
      .exec();
  }

  async findAll(): Promise<UserResponse[]> {
    const users = await this.userModel.find().sort({ createdAt: -1 }).exec();

    return users.map((user) => this.toUserResponse(user));
  }

  async update(id: string, updateUserDto: UpdateUserDto): Promise<UserResponse> {
    const user = await this.findById(id);

    if (updateUserDto.email && updateUserDto.email.toLowerCase() !== user.email) {
      const email = updateUserDto.email.toLowerCase();

      const existingUser = await this.userModel
        .findOne({
          email,
          _id: { $ne: user._id },
        })
        .lean()
        .exec();

      if (existingUser) {
        throw new ConflictException('Email already exists');
      }

      user.email = email;
    }

    if (updateUserDto.name !== undefined) {
      user.name = updateUserDto.name;
    }

    if (updateUserDto.phone !== undefined) {
      user.phone = updateUserDto.phone;
    }

    if (updateUserDto.role !== undefined) {
      user.role = updateUserDto.role;
    }

    if (updateUserDto.isActive !== undefined) {
      user.isActive = updateUserDto.isActive;

      if (!updateUserDto.isActive) {
        user.refreshTokenHash = null;
      }
    }

    if (updateUserDto.password !== undefined) {
      user.passwordHash = await bcrypt.hash(updateUserDto.password, this.passwordSaltRounds);

      user.refreshTokenHash = null;
    }

    const updatedUser = await user.save();

    return this.toUserResponse(updatedUser);
  }

  async comparePassword(plainPassword: string, passwordHash: string): Promise<boolean> {
    return bcrypt.compare(plainPassword, passwordHash);
  }

  toUserResponse(user: UserDocument): UserResponse {
    return {
      id: user._id.toString(),
      userId: user.userId,
      name: user.name,
      email: user.email,
      phone: user.phone,
      role: user.role,
      isActive: user.isActive,
      lastLoginAt: user.lastLoginAt,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    };
  }

  private async generateUserId(): Promise<string> {
    const counter = await this.counterModel
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

    return `USR-${String(counter.sequence).padStart(6, '0')}`;
  }

  async findByEmailWithPassword(email: string): Promise<UserDocument | null> {
    return this.userModel
      .findOne({
        email: email.toLowerCase(),
      })
      .select('+passwordHash')
      .exec();
  }

  async findByIdWithRefreshToken(id: string): Promise<UserDocument | null> {
    return this.userModel.findById(id).select('+refreshTokenHash').exec();
  }

  async updateRefreshTokenHash(id: string, refreshTokenHash: string | null): Promise<void> {
    const result = await this.userModel
      .updateOne(
        { _id: id },
        {
          $set: {
            refreshTokenHash,
          },
        },
      )
      .exec();

    if (result.matchedCount === 0) {
      throw new NotFoundException('User not found');
    }
  }

  async clearRefreshTokenHash(id: string): Promise<void> {
    await this.updateRefreshTokenHash(id, null);
  }

  async updateLastLoginAt(id: string): Promise<void> {
    const result = await this.userModel
      .updateOne(
        { _id: id },
        {
          $set: {
            lastLoginAt: new Date(),
          },
        },
      )
      .exec();

    if (result.matchedCount === 0) {
      throw new NotFoundException('User not found');
    }
  }
}
