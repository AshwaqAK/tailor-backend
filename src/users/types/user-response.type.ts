import { Role } from '../../common/constants/role.enum';

export interface UserResponse {
  id: string;
  userId: string;
  name: string;
  email: string;
  phone?: string;
  role: Role;
  isActive: boolean;
  lastLoginAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}
