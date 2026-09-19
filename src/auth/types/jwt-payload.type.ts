import { Role } from '../../common/constants/role.enum';

export interface JwtPayload {
  sub: string;
  userId: string;
  role: Role;
}
