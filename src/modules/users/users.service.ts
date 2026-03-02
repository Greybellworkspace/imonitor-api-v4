import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { randomBytes } from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { CoreApplicationUsers, UserTheme } from '../../database/entities/core-application-users.entity';
import { CoreApplicationRoles } from '../../database/entities/core-application-roles.entity';
import { CorePrivileges } from '../../database/entities/core-privileges.entity';
import { CoreModules } from '../../database/entities/core-modules.entity';
import { PasswordService } from '../../shared/services/password.service';
import { DateHelperService } from '../../shared/services/date-helper.service';
import { SystemConfigService } from '../../shared/services/system-config.service';
import { ErrorMessages } from '../../shared/constants';
import { AvailableRoles } from '../../shared/enums/roles.enum';
import {
  CreateUserDto,
  UpdateUserDto,
  EditSelfDto,
  ChangePasswordDto,
  UserResponseDto,
  UserPrivilegesDto,
} from './dto';

@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);

  constructor(
    @InjectRepository(CoreApplicationUsers)
    private readonly usersRepo: Repository<CoreApplicationUsers>,
    @InjectRepository(CoreApplicationRoles)
    private readonly rolesRepo: Repository<CoreApplicationRoles>,
    @InjectRepository(CorePrivileges)
    private readonly privilegesRepo: Repository<CorePrivileges>,
    @InjectRepository(CoreModules)
    private readonly modulesRepo: Repository<CoreModules>,
    private readonly passwordService: PasswordService,
    private readonly dateHelper: DateHelperService,
    private readonly systemConfigService: SystemConfigService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  // ─── Register ─────────────────────────────────────────────────────────

  async register(body: CreateUserDto, currentUserId: string): Promise<UserResponseDto> {
    const { firstName, lastName, userName, email, password, phoneNumber, allowMultipleSessions, keepLogin } = body;

    // Check user doesn't already exist (by userName, email, or phoneNumber)
    const existingUser = await this.usersRepo
      .createQueryBuilder('u')
      .where(
        '(u.userName = :userName OR u.email = :email OR u.phoneNumber = :phoneNumber) AND u.isDeleted = :deleted',
        {
          userName,
          email,
          phoneNumber,
          deleted: false,
        },
      )
      .getOne();

    if (existingUser) {
      throw new BadRequestException(ErrorMessages.USER_ALREADY_EXISTS);
    }

    // Hash password
    const passwordHash = await this.passwordService.hashPassword(password);

    // Create user
    const userId = uuidv4();
    const now = this.dateHelper.currentDate();

    const user = this.usersRepo.create({
      id: userId,
      firstName,
      lastName,
      userName,
      email,
      passwordHash,
      phoneNumber,
      isLocked: false,
      keepLogin,
      allowMultipleSessions,
      isDeleted: false,
      createdBy: currentUserId,
      createdOn: now,
    });

    await this.usersRepo.save(user);

    // Grant default N/A privileges for all modules
    const defaultRole = await this.rolesRepo.findOne({ where: { name: AvailableRoles.DEFAULT } });
    if (defaultRole) {
      const allModules = await this.modulesRepo.find();

      const privileges = allModules.map((mod) =>
        this.privilegesRepo.create({
          Id: uuidv4(),
          UserId: userId,
          RoleId: defaultRole.id,
          ModuleId: parseInt(mod.id, 10),
        }),
      );

      if (privileges.length > 0) {
        await this.privilegesRepo.save(privileges);
      }
    }

    return {
      id: userId,
      firstName,
      lastName,
      userName,
      email,
      phoneNumber,
    };
  }

  // ─── Get User By ID ──────────────────────────────────────────────────

  async getUserById(id: string): Promise<UserResponseDto> {
    const user = await this.usersRepo.findOne({
      where: { id, isDeleted: false },
      select: ['id', 'firstName', 'lastName', 'email', 'phoneNumber', 'userName', 'theme'],
    });

    if (!user) {
      throw new BadRequestException(ErrorMessages.USER_NOT_FOUND);
    }

    return {
      id: user.id,
      firstName: user.firstName ?? '',
      lastName: user.lastName ?? '',
      userName: user.userName ?? '',
      email: user.email ?? '',
      phoneNumber: user.phoneNumber ?? '',
    };
  }

  // ─── Get All Users ────────────────────────────────────────────────────

  async getAll(excludeCurrentUser?: boolean, currentUserId?: string): Promise<UserResponseDto[]> {
    const qb = this.usersRepo
      .createQueryBuilder('u')
      .select([
        'u.id',
        'u.firstName',
        'u.lastName',
        'u.email',
        'u.phoneNumber',
        'u.userName',
        'u.isLocked',
        'u.keepLogin',
        'u.allowMultipleSessions',
      ])
      .where('u.isDeleted = :deleted', { deleted: false });

    if (excludeCurrentUser && currentUserId) {
      qb.andWhere('u.id <> :currentUserId', { currentUserId });
    }

    qb.orderBy('u.firstName', 'ASC');

    const users = await qb.getMany();

    return users.map((u) => ({
      id: u.id,
      firstName: u.firstName ?? '',
      lastName: u.lastName ?? '',
      userName: u.userName ?? '',
      email: u.email ?? '',
      phoneNumber: u.phoneNumber ?? '',
      options: {
        isLocked: u.isLocked,
        keepLogin: u.keepLogin,
        allowMultipleSessions: u.allowMultipleSessions,
      },
    }));
  }

  // ─── Get Emails ───────────────────────────────────────────────────────

  async getEmails(): Promise<string[]> {
    const users = await this.usersRepo.find({
      where: { isDeleted: false },
      select: ['email'],
      order: { firstName: 'ASC' },
    });

    return users.map((u) => u.email).filter((e): e is string => !!e);
  }

  // ─── Self Update ──────────────────────────────────────────────────────

  async selfUpdate(userId: string, body: EditSelfDto): Promise<void> {
    const { firstName, lastName, email, phoneNumber, keepLogin, allowMultipleSessions } = body;

    // Check email uniqueness excluding self
    const emailExists = await this.usersRepo
      .createQueryBuilder('u')
      .where('u.email = :email AND u.id <> :userId AND u.isDeleted = :deleted', {
        email,
        userId,
        deleted: false,
      })
      .getExists();

    if (emailExists) {
      throw new BadRequestException(ErrorMessages.EMAIL_ALREADY_EXISTS);
    }

    const updateData: Partial<CoreApplicationUsers> = {
      firstName,
      lastName,
      phoneNumber,
      email,
      modifiedOn: this.dateHelper.currentDate(),
    };

    if (keepLogin !== undefined) {
      updateData.keepLogin = keepLogin;
    }
    if (allowMultipleSessions !== undefined) {
      updateData.allowMultipleSessions = allowMultipleSessions;
    }

    await this.usersRepo.update(userId, updateData);
  }

  // ─── Update (admin updates another user) ──────────────────────────────

  async update(userId: string, currentUserId: string, body: UpdateUserDto): Promise<void> {
    const { firstName, lastName, email, phoneNumber, allowMultipleSessions, keepLogin } = body;

    // Check email uniqueness excluding target user
    const emailExists = await this.usersRepo
      .createQueryBuilder('u')
      .where('u.email = :email AND u.id <> :userId AND u.isDeleted = :deleted', {
        email,
        userId,
        deleted: false,
      })
      .getExists();

    if (emailExists) {
      throw new BadRequestException(ErrorMessages.EMAIL_ALREADY_EXISTS);
    }

    await this.usersRepo.update(userId, {
      firstName,
      lastName,
      phoneNumber,
      email,
      allowMultipleSessions,
      keepLogin,
      modifiedBy: currentUserId,
      modifiedOn: this.dateHelper.currentDate(),
    });
  }

  // ─── Change Password (own) ────────────────────────────────────────────

  async changePassword(currentUserId: string, body: ChangePasswordDto): Promise<void> {
    const { password, confirmPassword, oldPassword } = body;

    // Validate passwords match
    if (password !== confirmPassword) {
      throw new BadRequestException(ErrorMessages.PASSWORD_MISMATCH);
    }

    // Fetch current password hash
    const user = await this.usersRepo.findOne({
      where: { id: currentUserId },
      select: ['id', 'passwordHash'],
    });

    if (!user || !user.passwordHash) {
      throw new BadRequestException(ErrorMessages.USER_NOT_FOUND);
    }

    // Verify old password
    const oldValid = await this.passwordService.isPasswordValid(oldPassword, user.passwordHash);
    if (!oldValid) {
      throw new BadRequestException(ErrorMessages.WRONG_PASSWORD);
    }

    // Hash new password and update
    const newHash = await this.passwordService.hashPassword(password);
    await this.usersRepo.update(currentUserId, { passwordHash: newHash });
  }

  // ─── Reset Password (admin resets another user) ───────────────────────

  async resetPassword(currentUserId: string, targetUserId: string): Promise<void> {
    // Fetch target user info for email
    const user = await this.usersRepo.findOne({
      where: { id: targetUserId },
      select: ['id', 'firstName', 'lastName', 'email'],
    });

    if (!user) {
      throw new BadRequestException(ErrorMessages.USER_NOT_FOUND);
    }

    // Generate cryptographically strong random password
    const randomPassword = randomBytes(9).toString('base64url');
    const hashedPassword = await this.passwordService.hashPassword(randomPassword);

    await this.usersRepo.update(targetUserId, { passwordHash: hashedPassword });

    // Emit event for email notification (stub — email service can listen)
    this.eventEmitter.emit('user.password.reset', {
      userId: targetUserId,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      newPassword: randomPassword,
    });
  }

  // ─── Delete (soft) ────────────────────────────────────────────────────

  async delete(currentUserId: string, targetUserId: string): Promise<void> {
    const now = this.dateHelper.currentDate();
    await this.usersRepo.update(targetUserId, {
      isDeleted: true,
      deletedBy: currentUserId,
      deletedOn: now,
      modifiedBy: currentUserId,
      modifiedOn: now,
    });
  }

  // ─── Lock / Unlock ────────────────────────────────────────────────────

  async lock(currentUserId: string, targetUserId: string): Promise<void> {
    await this.usersRepo.update(targetUserId, {
      isLocked: true,
      modifiedBy: currentUserId,
      modifiedOn: this.dateHelper.currentDate(),
    });
  }

  async unlock(currentUserId: string, targetUserId: string): Promise<void> {
    await this.usersRepo.update(targetUserId, {
      isLocked: false,
      modifiedBy: currentUserId,
      modifiedOn: this.dateHelper.currentDate(),
    });
  }

  // ─── Theme Update ─────────────────────────────────────────────────────

  async themeUpdate(userId: string, theme: UserTheme): Promise<void> {
    await this.usersRepo.update(userId, { theme });
  }

  // ─── Get User Privileges (recursive tree) ─────────────────────────────

  async getUserPrivileges(userId: string): Promise<UserPrivilegesDto[]> {
    // Bulk load all modules + all user privileges (2 queries total)
    const [allModules, allPrivileges] = await Promise.all([
      this.modulesRepo.find({ order: { priority: 'ASC' } }),
      this.privilegesRepo.find({ where: { UserId: userId }, relations: ['role'] }),
    ]);

    const privMap = new Map(allPrivileges.map((p) => [p.ModuleId, p.role?.name ?? AvailableRoles.DEFAULT]));
    const modulesByParent = this.groupModulesByParent(allModules);

    return this.buildTreeFromMaps(modulesByParent, privMap, 0);
  }

  // ─── Update User Privileges (recursive) ───────────────────────────────

  async updateUserPrivileges(userId: string, body: UserPrivilegesDto[]): Promise<void> {
    // Pre-load all roles to avoid N+1 lookups
    const allRoles = await this.rolesRepo.find();
    const roleMap = new Map(allRoles.map((r) => [r.name, r.id]));

    const updates = this.collectPrivilegeUpdates(body, roleMap);
    for (const { moduleId, roleId } of updates) {
      await this.privilegesRepo.update({ UserId: userId, ModuleId: moduleId }, { RoleId: roleId });
    }
  }

  // ─── Get Side Menu ────────────────────────────────────────────────────

  async getSideMenu(userId: string, theme: string): Promise<UserPrivilegesDto[]> {
    // Bulk load all modules + all user privileges (2 queries total)
    const [allModules, allPrivileges] = await Promise.all([
      this.modulesRepo.find({ order: { priority: 'ASC' } }),
      this.privilegesRepo.find({ where: { UserId: userId }, relations: ['role'] }),
    ]);

    const privMap = new Map(allPrivileges.map((p) => [p.ModuleId, p.role?.name ?? AvailableRoles.DEFAULT]));
    const modulesByParent = this.groupModulesByParent(allModules);

    return this.buildMenuTreeFromMaps(modulesByParent, privMap, 0, theme);
  }

  // ─── Module Settings ──────────────────────────────────────────────────

  async moduleSettings(moduleName: string): Promise<Record<string, string>> {
    const settings = await this.systemConfigService.getSettingsByColumn(moduleName);
    const result: Record<string, string> = {};
    for (const setting of settings) {
      result[setting.confKey] = setting.confVal ?? '';
    }
    return result;
  }

  // ─── Get User Role On Module ──────────────────────────────────────────

  async getUserRoleOnModule(userId: string, moduleName: string): Promise<string | null> {
    const mod = await this.modulesRepo.findOne({ where: { name: moduleName } });
    if (!mod) {
      return null;
    }

    const privilege = await this.privilegesRepo.findOne({
      where: { UserId: userId, ModuleId: parseInt(mod.id, 10) },
      relations: ['role'],
    });

    return privilege?.role?.name ?? null;
  }

  // ─── List System Configurations ───────────────────────────────────────

  async listSystemConfigurations(): Promise<Record<string, string>> {
    const keys = ['maxDaysCompare', 'maxHoursCompare', 'maxMonthCompare', 'maxWeekCompare', 'maxYearCompare'];
    return this.systemConfigService.getConfigValues(keys);
  }

  // ─── Private Helpers ──────────────────────────────────────────────────

  private groupModulesByParent(modules: CoreModules[]): Map<number, CoreModules[]> {
    const map = new Map<number, CoreModules[]>();
    for (const mod of modules) {
      const pId = mod.pId ?? 0;
      if (!map.has(pId)) map.set(pId, []);
      map.get(pId)!.push(mod);
    }
    return map;
  }

  private buildTreeFromMaps(
    modulesByParent: Map<number, CoreModules[]>,
    privMap: Map<number, string>,
    parentId: number,
  ): UserPrivilegesDto[] {
    const modules = modulesByParent.get(parentId) ?? [];
    return modules.map((mod) => {
      const moduleId = parseInt(mod.id, 10);
      const roleName = privMap.get(moduleId) ?? AvailableRoles.DEFAULT;
      const { isUser, isSuperUser, isAdmin } = this.mapRoleFlags(roleName);

      const childModules = modulesByParent.get(moduleId);
      const children = childModules ? this.buildTreeFromMaps(modulesByParent, privMap, moduleId) : undefined;

      return {
        id: moduleId,
        pId: mod.pId ?? 0,
        name: mod.name,
        isMenuItem: mod.isMenuItem,
        priority: mod.priority,
        nestedLevel: mod.nestedLevel ?? 0,
        icon: mod.icon ?? undefined,
        color: mod.lightColor ?? undefined,
        font: mod.font ?? undefined,
        path: mod.path ?? undefined,
        roleName,
        isUser,
        isSuperUser,
        isAdmin,
        toggle: roleName,
        children,
      };
    });
  }

  private buildMenuTreeFromMaps(
    modulesByParent: Map<number, CoreModules[]>,
    privMap: Map<number, string>,
    parentId: number,
    theme: string,
  ): UserPrivilegesDto[] {
    const modules = modulesByParent.get(parentId) ?? [];
    const result: UserPrivilegesDto[] = [];

    for (const mod of modules) {
      const moduleId = parseInt(mod.id, 10);
      const roleName = privMap.get(moduleId) ?? AvailableRoles.DEFAULT;

      if (!mod.isMenuItem) continue;
      if (roleName === AvailableRoles.DEFAULT && !mod.isDefault) continue;

      const { isUser, isSuperUser, isAdmin } = this.mapRoleFlags(roleName);
      const childModules = modulesByParent.get(moduleId);
      const children = childModules ? this.buildMenuTreeFromMaps(modulesByParent, privMap, moduleId, theme) : undefined;
      const color = theme === 'dark' ? (mod.darkColor ?? undefined) : (mod.lightColor ?? undefined);

      result.push({
        id: moduleId,
        pId: mod.pId ?? 0,
        name: mod.name,
        isMenuItem: mod.isMenuItem,
        priority: mod.priority,
        nestedLevel: mod.nestedLevel ?? 0,
        icon: mod.icon ?? undefined,
        color,
        font: mod.font ?? undefined,
        path: mod.path ?? undefined,
        roleName,
        isUser,
        isSuperUser,
        isAdmin,
        toggle: roleName,
        children: children?.length ? children : undefined,
      });
    }

    return result;
  }

  private collectPrivilegeUpdates(
    nodes: UserPrivilegesDto[],
    roleMap: Map<string, string>,
  ): { moduleId: number; roleId: string }[] {
    const updates: { moduleId: number; roleId: string }[] = [];
    for (const node of nodes) {
      const roleId = roleMap.get(node.roleName);
      if (roleId) {
        updates.push({ moduleId: node.id, roleId });
      }
      if (node.children?.length) {
        updates.push(...this.collectPrivilegeUpdates(node.children, roleMap));
      }
    }
    return updates;
  }

  private mapRoleFlags(roleName: string): { isUser: boolean; isSuperUser: boolean; isAdmin: boolean } {
    return {
      isUser:
        roleName === AvailableRoles.USER ||
        roleName === AvailableRoles.SUPER_USER ||
        roleName === AvailableRoles.ADMIN ||
        roleName === AvailableRoles.SUPER_ADMIN,
      isSuperUser:
        roleName === AvailableRoles.SUPER_USER ||
        roleName === AvailableRoles.ADMIN ||
        roleName === AvailableRoles.SUPER_ADMIN,
      isAdmin: roleName === AvailableRoles.ADMIN || roleName === AvailableRoles.SUPER_ADMIN,
    };
  }
}
