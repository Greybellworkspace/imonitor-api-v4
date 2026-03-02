import { Injectable, BadRequestException, UnauthorizedException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';
import { CoreApplicationUsers } from '../../database/entities/core-application-users.entity';
import { CoreApplicationRoles } from '../../database/entities/core-application-roles.entity';
import { CoreApplicationRefreshToken } from '../../database/entities/core-application-refresh-token.entity';
import { CorePrivileges } from '../../database/entities/core-privileges.entity';
import { CoreModules } from '../../database/entities/core-modules.entity';
import { JwtPayload } from '../../auth/interfaces/jwt-payload.interface';
import { PasswordService } from '../../shared/services/password.service';
import { DateHelperService } from '../../shared/services/date-helper.service';
import { SystemConfigService } from '../../shared/services/system-config.service';
import { ErrorMessages } from '../../shared/constants';
import { SystemKeys } from '../../shared/constants/system-keys';
import { hasPrivilege } from '../../auth/helpers/privilege.helper';
import { LoginDto, RefreshTokenDto, CanAccessModuleDto } from './dto';

export interface AuthenticationResult {
  token: string;
  refreshToken: string;
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    @InjectRepository(CoreApplicationUsers)
    private readonly usersRepo: Repository<CoreApplicationUsers>,
    @InjectRepository(CoreApplicationRoles)
    private readonly rolesRepo: Repository<CoreApplicationRoles>,
    @InjectRepository(CoreApplicationRefreshToken)
    private readonly refreshTokenRepo: Repository<CoreApplicationRefreshToken>,
    @InjectRepository(CorePrivileges)
    private readonly privilegesRepo: Repository<CorePrivileges>,
    @InjectRepository(CoreModules)
    private readonly modulesRepo: Repository<CoreModules>,
    private readonly passwordService: PasswordService,
    private readonly dateHelper: DateHelperService,
    private readonly systemConfigService: SystemConfigService,
    private readonly configService: ConfigService,
  ) {}

  // ─── Login ───────────────────────────────────────────────────────────

  async login(body: LoginDto): Promise<AuthenticationResult> {
    const { credential, password } = body;

    // Find user by userName or email
    const user = await this.usersRepo
      .createQueryBuilder('u')
      .select(['u.id', 'u.isLocked', 'u.email', 'u.userName', 'u.passwordHash', 'u.allowMultipleSessions', 'u.theme'])
      .where('(u.userName = :credential OR u.email = :credential) AND u.isDeleted = :deleted', {
        credential,
        deleted: false,
      })
      .getOne();

    if (!user) {
      throw new BadRequestException(ErrorMessages.INVALID_CREDENTIALS);
    }

    if (user.isLocked) {
      throw new BadRequestException(ErrorMessages.ACCOUNT_LOCKED);
    }

    if (!user.passwordHash) {
      throw new BadRequestException(ErrorMessages.INVALID_CREDENTIALS);
    }

    const passwordValid = await this.passwordService.isPasswordValid(password, user.passwordHash);
    if (!passwordValid) {
      throw new BadRequestException(ErrorMessages.INVALID_CREDENTIALS);
    }

    // Check multiple sessions
    if (!user.allowMultipleSessions) {
      const activeTokenExists = await this.refreshTokenRepo
        .createQueryBuilder('rt')
        .where('rt.userId = :userId AND rt.invalidated = :inv AND rt.used = :used', {
          userId: user.id,
          inv: false,
          used: false,
        })
        .getExists();

      if (activeTokenExists) {
        throw new BadRequestException(ErrorMessages.ONLY_ONE_SESSION_ALLOWED);
      }
    }

    if (!user.email || !user.userName) {
      throw new BadRequestException(ErrorMessages.INVALID_CREDENTIALS);
    }

    // Update lastLogin
    await this.usersRepo.update(user.id, { lastLogin: this.dateHelper.currentDate() });

    // Generate tokens
    return this.generateTokenAndRefreshToken(user.id, user.email, user.userName, user.theme ?? 'light');
  }

  // ─── Logout ──────────────────────────────────────────────────────────

  async logout(token: string, userId: string): Promise<void> {
    // Validate token (ignore expiration for logout)
    const jwtKey = this.getJwtKey();
    let decoded: JwtPayload;
    try {
      decoded = jwt.verify(token, jwtKey, { ignoreExpiration: true }) as JwtPayload;
    } catch {
      throw new UnauthorizedException(ErrorMessages.JWT_IS_NOT_VALID);
    }

    if (!decoded.jti) {
      throw new BadRequestException(ErrorMessages.REFRESH_TOKEN_INVALID);
    }

    // Find refresh token by jwtId
    const refreshToken = await this.refreshTokenRepo.findOne({ where: { jwtId: decoded.jti } });
    if (!refreshToken) {
      throw new BadRequestException(ErrorMessages.REFRESH_TOKEN_INVALID);
    }

    // Only invalidate if not already used/invalidated
    if (!refreshToken.used && !refreshToken.invalidated) {
      await this.refreshTokenRepo.update(refreshToken.id, { invalidated: true });
    }

    // Update lastLogout
    await this.usersRepo.update(userId, { lastLogout: this.dateHelper.currentDate() });
  }

  // ─── Refresh Token ───────────────────────────────────────────────────

  async refreshToken(body: RefreshTokenDto): Promise<AuthenticationResult> {
    const { token, refreshToken: refreshTokenId } = body;
    const jwtKey = this.getJwtKey();

    // Decode token (ignore expiration)
    let decoded: JwtPayload;
    try {
      decoded = jwt.verify(token, jwtKey, { ignoreExpiration: true }) as JwtPayload;
    } catch {
      throw new BadRequestException(ErrorMessages.REFRESH_TOKEN_INVALID);
    }

    if (!decoded.email) {
      throw new BadRequestException(ErrorMessages.REFRESH_TOKEN_INVALID);
    }

    // Fetch user
    const user = await this.usersRepo.findOne({
      where: { email: decoded.email },
      select: ['id', 'email', 'userName', 'allowMultipleSessions', 'theme', 'keepLogin'],
    });

    if (!user) {
      throw new BadRequestException(ErrorMessages.INVALID_CREDENTIALS);
    }

    if (!user.email || !user.userName) {
      throw new BadRequestException(ErrorMessages.INVALID_CREDENTIALS);
    }

    // If keepLogin, generate new pair immediately
    if (user.keepLogin) {
      return this.generateTokenAndRefreshToken(user.id, user.email, user.userName, user.theme ?? 'light');
    }

    // Check token has expired or is about to expire (within 1 minute)
    if (decoded.exp) {
      const now = Math.floor(Date.now() / 1000);
      const gracePeriod = decoded.exp - 60; // 1 minute before expiry
      if (now < gracePeriod) {
        throw new BadRequestException(ErrorMessages.TOKEN_HAS_NOT_EXPIRED_YET);
      }
    }

    // Fetch refresh token
    const storedRefreshToken = await this.refreshTokenRepo.findOne({ where: { id: refreshTokenId } });
    if (!storedRefreshToken) {
      throw new BadRequestException(ErrorMessages.REFRESH_TOKEN_INVALID);
    }

    // Validate jwtId link
    if (!decoded.jti || storedRefreshToken.jwtId !== decoded.jti) {
      throw new BadRequestException(ErrorMessages.REFRESH_TOKEN_INVALID);
    }

    // Check not expired
    if (new Date() > storedRefreshToken.expiryDate) {
      throw new BadRequestException(ErrorMessages.REFRESH_TOKEN_INVALID);
    }

    // Check not used or invalidated
    if (storedRefreshToken.used || storedRefreshToken.invalidated) {
      throw new BadRequestException(ErrorMessages.REFRESH_TOKEN_INVALID);
    }

    // Mark old refresh token as used
    await this.refreshTokenRepo.update(storedRefreshToken.id, { used: true });

    // Generate new pair
    return this.generateTokenAndRefreshToken(user.id, user.email, user.userName, user.theme ?? 'light');
  }

  // ─── Can Access Module ───────────────────────────────────────────────

  async canAccessModule(userId: string, body: CanAccessModuleDto): Promise<void> {
    const { role, module } = body;

    // Validate role exists
    const roleExists = await this.rolesRepo.findOne({ where: { name: role } });
    if (!roleExists) {
      throw new BadRequestException(ErrorMessages.ROLE_NOT_FOUND);
    }

    // Validate module exists
    const moduleExists = await this.modulesRepo.findOne({ where: { name: module } });
    if (!moduleExists) {
      throw new BadRequestException(ErrorMessages.MODULE_NOT_FOUND);
    }

    // Get user's role on this module
    const privilege = await this.privilegesRepo.findOne({
      where: { UserId: userId, ModuleId: parseInt(moduleExists.id, 10) },
      relations: ['role'],
    });

    const userRole = privilege?.role?.name;
    if (!userRole || !hasPrivilege(userRole, role)) {
      throw new BadRequestException(ErrorMessages.UNAUTHORIZED_ROLE);
    }
  }

  // ─── Token Generation ────────────────────────────────────────────────

  async generateTokenAndRefreshToken(
    userId: string,
    email: string,
    userName: string,
    theme: string,
  ): Promise<AuthenticationResult> {
    const jwtKey = this.getJwtKey();
    const jwtId = uuidv4();

    // Get expiry from system config (in minutes → convert to seconds for jwt.sign)
    const expiryMinutesStr = await this.systemConfigService.getConfigValue(SystemKeys.tokenExpiryInMinutes);
    const expiresInSeconds = expiryMinutesStr ? parseInt(expiryMinutesStr, 10) * 60 : 1800; // 30 min default

    const payload: JwtPayload = {
      id: userId,
      email,
      credential: userName,
      theme,
    };

    const token = jwt.sign(payload, jwtKey, {
      expiresIn: expiresInSeconds,
      subject: userId,
      jwtid: jwtId,
    });

    // Create refresh token
    const refreshTokenExpiryMinutes = await this.systemConfigService.getConfigValue(SystemKeys.rtokenExpiryInMinutes);
    const rtExpiryMins = refreshTokenExpiryMinutes ? parseInt(refreshTokenExpiryMinutes, 10) : 10080; // 7 days default

    const refreshTokenId = uuidv4();
    const now = this.dateHelper.currentDate();
    const expiryDate = this.dateHelper.addDurationToDate({ minutes: rtExpiryMins }, now);

    const refreshTokenEntity = this.refreshTokenRepo.create({
      id: refreshTokenId,
      jwtId,
      userId,
      used: false,
      invalidated: false,
      expiryDate,
      createdOn: now,
    });
    await this.refreshTokenRepo.save(refreshTokenEntity);

    return { token, refreshToken: refreshTokenId };
  }

  // ─── Helpers ─────────────────────────────────────────────────────────

  private getJwtKey(): string {
    const key = this.configService.get<string>('JWT_KEY');
    if (!key) {
      this.logger.error('JWT_KEY not configured');
      throw new UnauthorizedException(ErrorMessages.JWT_IS_NOT_VALID);
    }
    return key;
  }
}
