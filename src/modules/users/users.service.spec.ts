import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BadRequestException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { UsersService } from './users.service';
import { CoreApplicationUsers, UserTheme } from '../../database/entities/core-application-users.entity';
import { CoreApplicationRoles } from '../../database/entities/core-application-roles.entity';
import { CorePrivileges } from '../../database/entities/core-privileges.entity';
import { CoreModules } from '../../database/entities/core-modules.entity';
import { PasswordService } from '../../shared/services/password.service';
import { DateHelperService } from '../../shared/services/date-helper.service';
import { SystemConfigService } from '../../shared/services/system-config.service';
import { ErrorMessages } from '../../shared/constants';

function createMockQueryBuilder(result: any) {
  const qb: any = {
    select: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    getOne: jest.fn().mockResolvedValue(result),
    getMany: jest.fn().mockResolvedValue(result),
    getExists: jest.fn().mockResolvedValue(false),
  };
  return qb;
}

describe('UsersService', () => {
  let service: UsersService;
  let usersRepo: any;
  let rolesRepo: any;
  let privilegesRepo: any;
  let modulesRepo: any;
  let passwordService: any;
  let dateHelper: any;
  let systemConfigService: any;
  let eventEmitter: any;

  beforeEach(async () => {
    usersRepo = {
      createQueryBuilder: jest.fn(),
      findOne: jest.fn(),
      find: jest.fn(),
      create: jest.fn().mockImplementation((data) => data),
      save: jest.fn().mockResolvedValue({}),
      update: jest.fn().mockResolvedValue({}),
    };
    rolesRepo = {
      findOne: jest.fn(),
    };
    privilegesRepo = {
      findOne: jest.fn(),
      create: jest.fn().mockImplementation((data) => data),
      save: jest.fn().mockResolvedValue({}),
      update: jest.fn().mockResolvedValue({}),
    };
    modulesRepo = {
      find: jest.fn(),
      findOne: jest.fn(),
    };
    passwordService = {
      hashPassword: jest.fn().mockResolvedValue('$2b$10$hashed'),
      isPasswordValid: jest.fn(),
    };
    dateHelper = {
      currentDate: jest.fn().mockReturnValue(new Date('2026-03-02T12:00:00Z')),
    };
    systemConfigService = {
      getConfigValue: jest.fn(),
      getConfigValues: jest.fn(),
      getSettingsByColumn: jest.fn(),
    };
    eventEmitter = {
      emit: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsersService,
        { provide: getRepositoryToken(CoreApplicationUsers), useValue: usersRepo },
        { provide: getRepositoryToken(CoreApplicationRoles), useValue: rolesRepo },
        { provide: getRepositoryToken(CorePrivileges), useValue: privilegesRepo },
        { provide: getRepositoryToken(CoreModules), useValue: modulesRepo },
        { provide: PasswordService, useValue: passwordService },
        { provide: DateHelperService, useValue: dateHelper },
        { provide: SystemConfigService, useValue: systemConfigService },
        { provide: EventEmitter2, useValue: eventEmitter },
      ],
    }).compile();

    service = module.get<UsersService>(UsersService);
  });

  describe('register', () => {
    const createUserDto = {
      firstName: 'John',
      lastName: 'Doe',
      userName: 'johndoe',
      email: 'john@example.com',
      password: 'password123',
      phoneNumber: '1234567890',
      allowMultipleSessions: true,
      keepLogin: false,
    };

    it('should register a new user successfully', async () => {
      const qb = createMockQueryBuilder(null);
      usersRepo.createQueryBuilder.mockReturnValue(qb);
      rolesRepo.findOne.mockResolvedValue({ id: 'role-na', name: 'N/A' });
      modulesRepo.find.mockResolvedValue([
        { id: '1', name: 'module1' },
        { id: '2', name: 'module2' },
      ]);

      const result = await service.register(createUserDto, 'admin-1');

      expect(result).toHaveProperty('id');
      expect(result.firstName).toBe('John');
      expect(result.email).toBe('john@example.com');
      expect(usersRepo.save).toHaveBeenCalled();
      expect(privilegesRepo.save).toHaveBeenCalled();
    });

    it('should throw if user already exists', async () => {
      const qb = createMockQueryBuilder({ id: 'existing-user' });
      usersRepo.createQueryBuilder.mockReturnValue(qb);

      await expect(service.register(createUserDto, 'admin-1')).rejects.toThrow(
        new BadRequestException(ErrorMessages.USER_ALREADY_EXISTS),
      );
    });
  });

  describe('getUserById', () => {
    it('should return user when found', async () => {
      usersRepo.findOne.mockResolvedValue({
        id: 'user-1',
        firstName: 'John',
        lastName: 'Doe',
        userName: 'johndoe',
        email: 'john@example.com',
        phoneNumber: '123',
        theme: 'light',
      });

      const result = await service.getUserById('user-1');

      expect(result.id).toBe('user-1');
      expect(result.firstName).toBe('John');
    });

    it('should throw if user not found', async () => {
      usersRepo.findOne.mockResolvedValue(null);

      await expect(service.getUserById('nonexistent')).rejects.toThrow(
        new BadRequestException(ErrorMessages.USER_NOT_FOUND),
      );
    });
  });

  describe('getAll', () => {
    it('should return all users', async () => {
      const users = [
        {
          id: 'u1',
          firstName: 'A',
          lastName: 'B',
          userName: 'ab',
          email: 'a@b.com',
          phoneNumber: '1',
          isLocked: false,
          keepLogin: false,
          allowMultipleSessions: true,
        },
        {
          id: 'u2',
          firstName: 'C',
          lastName: 'D',
          userName: 'cd',
          email: 'c@d.com',
          phoneNumber: '2',
          isLocked: true,
          keepLogin: true,
          allowMultipleSessions: false,
        },
      ];
      const qb = createMockQueryBuilder(users);
      usersRepo.createQueryBuilder.mockReturnValue(qb);

      const result = await service.getAll();

      expect(result).toHaveLength(2);
      expect(result[0].options?.isLocked).toBe(false);
      expect(result[1].options?.isLocked).toBe(true);
    });

    it('should exclude current user when requested', async () => {
      const qb = createMockQueryBuilder([]);
      usersRepo.createQueryBuilder.mockReturnValue(qb);

      await service.getAll(true, 'current-user-id');

      expect(qb.andWhere).toHaveBeenCalledWith('u.id <> :currentUserId', { currentUserId: 'current-user-id' });
    });
  });

  describe('changePassword', () => {
    it('should change password with valid inputs', async () => {
      usersRepo.findOne.mockResolvedValue({
        id: 'user-1',
        passwordHash: '$2b$10$oldhash',
      });
      passwordService.isPasswordValid.mockResolvedValue(true);

      await service.changePassword('user-1', {
        password: 'newpass123',
        confirmPassword: 'newpass123',
        oldPassword: 'oldpass123',
      });

      expect(usersRepo.update).toHaveBeenCalledWith('user-1', { passwordHash: '$2b$10$hashed' });
    });

    it('should throw if passwords do not match', async () => {
      await expect(
        service.changePassword('user-1', {
          password: 'newpass123',
          confirmPassword: 'differentpass',
          oldPassword: 'oldpass123',
        }),
      ).rejects.toThrow(new BadRequestException(ErrorMessages.PASSWORD_MISMATCH));
    });

    it('should throw if old password is wrong', async () => {
      usersRepo.findOne.mockResolvedValue({
        id: 'user-1',
        passwordHash: '$2b$10$oldhash',
      });
      passwordService.isPasswordValid.mockResolvedValue(false);

      await expect(
        service.changePassword('user-1', {
          password: 'newpass123',
          confirmPassword: 'newpass123',
          oldPassword: 'wrongold',
        }),
      ).rejects.toThrow(new BadRequestException(ErrorMessages.WRONG_PASSWORD));
    });
  });

  describe('delete', () => {
    it('should soft delete user with audit trail', async () => {
      await service.delete('admin-1', 'user-1');

      expect(usersRepo.update).toHaveBeenCalledWith('user-1', {
        isDeleted: true,
        deletedBy: 'admin-1',
        deletedOn: expect.any(Date),
        modifiedBy: 'admin-1',
        modifiedOn: expect.any(Date),
      });
    });
  });

  describe('lock/unlock', () => {
    it('should lock a user', async () => {
      await service.lock('admin-1', 'user-1');

      expect(usersRepo.update).toHaveBeenCalledWith('user-1', {
        isLocked: true,
        modifiedBy: 'admin-1',
        modifiedOn: expect.any(Date),
      });
    });

    it('should unlock a user', async () => {
      await service.unlock('admin-1', 'user-1');

      expect(usersRepo.update).toHaveBeenCalledWith('user-1', {
        isLocked: false,
        modifiedBy: 'admin-1',
        modifiedOn: expect.any(Date),
      });
    });
  });

  describe('themeUpdate', () => {
    it('should update user theme', async () => {
      await service.themeUpdate('user-1', UserTheme.DARK);

      expect(usersRepo.update).toHaveBeenCalledWith('user-1', { theme: UserTheme.DARK });
    });
  });

  describe('resetPassword', () => {
    it('should reset password and emit event', async () => {
      usersRepo.findOne.mockResolvedValue({
        id: 'user-1',
        firstName: 'John',
        lastName: 'Doe',
        email: 'john@example.com',
      });

      await service.resetPassword('admin-1', 'user-1');

      expect(usersRepo.update).toHaveBeenCalledWith('user-1', { passwordHash: '$2b$10$hashed' });
      expect(eventEmitter.emit).toHaveBeenCalledWith(
        'user.password.reset',
        expect.objectContaining({
          userId: 'user-1',
          email: 'john@example.com',
        }),
      );
    });

    it('should throw if target user not found', async () => {
      usersRepo.findOne.mockResolvedValue(null);

      await expect(service.resetPassword('admin-1', 'nonexistent')).rejects.toThrow(
        new BadRequestException(ErrorMessages.USER_NOT_FOUND),
      );
    });
  });
});
