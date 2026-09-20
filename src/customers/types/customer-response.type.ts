import { Gender } from '../enums/gender.enum';

export type CustomerResponse = {
  _id: string;
  customerId: string;
  name: string;
  phone: string;
  alternatePhone?: string;
  email?: string;
  gender: Gender;
  photo?: string;
  notes?: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
};
